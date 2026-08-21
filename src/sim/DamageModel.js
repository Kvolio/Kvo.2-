// ===========================================================================
//  POST-PENETRATION DAMAGE
//
//  There is no tank health bar in this game. A Tiger stops fighting because
//  something specific and identifiable broke: the gun, the traverse drive, the
//  engine, a track, the ammunition, or the men.
//
//  When a shell comes through, this module traces where it actually went and
//  works out what it met on the way. A round through the engine deck and a
//  round through the turret front produce entirely different afternoons.
// ===========================================================================

import { OUTCOME, computeSpall } from './Penetration.js';
import { worldToLocal, localToWorld, plateFrame } from './ArmorArray.js';
import { clamp, DEG } from '../core/MathUtil.js';

/** Segment/AABB overlap test in vehicle-local space. */
function segBox(o, d, tMax, centre, size) {
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  let tmin = 0, tmax = tMax;
  for (let i = 0; i < 3; i++) {
    const c = centre[i], h = [hx, hy, hz][i];
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < c - h || o[i] > c + h) return null;
    } else {
      let t1 = (c - h - o[i]) / d[i];
      let t2 = (c + h - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { tEnter: tmin, tExit: tmax };
}

/**
 * Resolve everything that happens after a shell defeats (or fails to defeat)
 * a plate on a vehicle.
 *
 * @param {object} ctx
 * @param {object} ctx.vehicle    the struck vehicle (has .components, .crew, .ammoRacks)
 * @param {object} ctx.hit        result of traceArmour()
 * @param {object} ctx.impact     result of resolveImpact()
 * @param {object} ctx.proj       projectile data
 * @param {object} ctx.rng
 * @param {object} ctx.difficulty
 * @returns {object} an event describing what broke, who was hurt, and what caught fire
 */
export function applyImpact(ctx) {
  const { vehicle, hit, impact, proj, rng } = ctx;
  const ev = {
    outcome: impact.outcome,
    plate: hit.plate.label,
    plateId: hit.plate.id,
    aspect: null,
    penetrated: impact.outcome === OUTCOME.PENETRATION || impact.outcome === OUTCOME.OVERMATCH,
    componentsHit: [],
    crewHit: [],
    ammoHit: null,
    fires: [],
    spallCount: 0,
    shockG: 0,
    report: impact.report,
    explain: null,
  };

  // ---- Shock. Every hit rings the tank like a bell, penetration or not. -----
  const ke = 0.5 * proj.mass * impact.report.impactVelocity ** 2;  // joules
  ev.shockG = clamp(ke / 1.6e6, 0.05, 3.0);
  if (proj.kind === 'HE') {
    ev.shockG = clamp((proj.filler || 0) * 1.6, 0.1, 4.0);
  }

  // ---- Non-penetrating natures ---------------------------------------------
  if (proj.kind === 'HE' || proj.kind === 'SMOKE') {
    return resolveHighExplosive(ctx, ev);
  }

  const spall = computeSpall(impact, proj, hit.plate);
  if (!spall) {
    ev.explain = 'Clean deflection. Nothing came inside.';
    return ev;
  }
  ev.spallCount = spall.fragments;

  // Even a stopped round can flake the inner face and hurt the men behind it.
  if (!ev.penetrated) {
    ev.explain = impact.outcome === OUTCOME.PARTIAL
      ? 'The plate held, but the back face broke up into the compartment.'
      : 'No penetration. Fragments spalled off the inside of the plate.';
    distributeSpall(ctx, ev, spall, hit, 0.45);
    return ev;
  }

  // ---- Full penetration: trace the shell's path through the interior --------
  ev.explain = 'Penetration. The round came into the fighting space.';
  traceInterior(ctx, ev, spall, hit);
  distributeSpall(ctx, ev, spall, hit, 1.0);
  resolveSecondaryEffects(ctx, ev);
  return ev;
}

/**
 * Walk the shell through the vehicle interior along its actual path, hitting
 * whatever geometry is in the way, until it runs out of energy or exits.
 */
function traceInterior(ctx, ev, spall, hit) {
  const { vehicle, proj, impact, rng } = ctx;
  const spec = vehicle.spec;
  const o = hit.localPoint.slice();
  const d = hit.localDir.slice();

  // Energy budget behind the plate, expressed as a penetrating "reach".
  let energy = clamp((impact.penetration - impact.effective) / Math.max(20, impact.effective), 0.05, 3.0);
  let reach = clamp(1.0 + energy * 3.5, 0.6, 6.5);   // metres of interior travel

  // A base-fuzed APHE shell detonates a short distance past the plate.
  const burstAt = spall.hePayload > 0 ? Math.min(reach, spall.fuzeDelayM) : null;

  const az = vehicle.turretAz || 0;
  const candidates = [];

  // --- Components ---
  for (const [id, comp] of Object.entries(spec.COMPONENTS)) {
    if (comp.external) continue;
    const state = vehicle.components?.[id];
    if (state && state.destroyed) continue;
    let cpos = comp.pos;
    if (comp.compartment === 'turret' || comp.compartment === 'cupola') {
      const f = plateFrame({ centre: comp.pos, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], onTurret: true }, az);
      cpos = f.centre;
    }
    const s = segBox(o, d, reach, cpos, comp.size);
    if (s) candidates.push({ type: 'component', id, comp, t: s.tEnter });
  }

  // --- Ammunition racks ---
  for (const rack of spec.AMMO_RACKS) {
    const stock = vehicle.rackStock?.[rack.id] ?? 0;
    if (stock <= 0) continue;
    const s = segBox(o, d, reach, rack.pos, rack.size);
    if (s) candidates.push({ type: 'ammo', rack, t: s.tEnter, stock });
  }

  // --- Crew ---
  for (const man of vehicle.crew || []) {
    if (!man || man.state === 'dead' || man.outsideTank) continue;
    const st = spec.STATIONS[man.role];
    if (!st) continue;
    let p = st.seat;
    if (st.onTurret) {
      const f = plateFrame({ centre: st.seat, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], onTurret: true }, az);
      p = f.centre;
    }
    // A seated crewman occupies roughly 0.55 x 1.05 x 0.45 m.
    const body = [p[0], p[1] + 0.28, p[2]];
    const s = segBox(o, d, reach, body, [0.55, 1.05, 0.45]);
    if (s) candidates.push({ type: 'crew', man, t: s.tEnter });
  }

  candidates.sort((a, b) => a.t - b.t);

  let travelled = 0;
  for (const c of candidates) {
    if (c.t > reach) break;
    travelled = c.t;

    // If the APHE filler goes off before reaching this object, everything from
    // here on is fragment damage rather than a solid shot passing through.
    const afterBurst = burstAt !== null && c.t > burstAt;
    const power = afterBurst ? 0.7 : 1.0;

    if (c.type === 'component') {
      const dmg = 120 * energy * power * (proj.caliber / 88);
      ev.componentsHit.push({ id: c.id, label: c.comp.label, damage: dmg, at: c.t });
      // Passing through a heavy assembly costs the shell reach.
      reach -= 0.5 + (c.comp.hp / 200);
      energy *= 0.72;
    } else if (c.type === 'ammo') {
      ev.ammoHit = { rackId: c.rack.id, label: c.rack.label, rounds: c.stock, at: c.t };
      reach -= 0.4;
      energy *= 0.8;
    } else if (c.type === 'crew') {
      // A shell or its fragments passing through a man's station.
      const severity = afterBurst ? 0.55 : 0.95;
      ev.crewHit.push({ role: c.man.role, severity: severity * clamp(energy, 0.3, 1.4), cause: 'direct', at: c.t });
      reach -= 0.15;
      energy *= 0.95;
    }
    if (reach <= travelled) break;
  }

  ev.penetrationDepth = Math.min(reach, travelled + 0.4);
  ev.burstInside = burstAt !== null && burstAt <= reach;
  if (ev.burstInside) {
    ev.explain += ` The ${(spall.hePayload * 1000).toFixed(0)} g filler burst inside.`;
  }
}

/**
 * Spread the spall cone over crew and equipment near the entry point.
 * This is the mechanism that kills tank crews in vehicles whose armour "held".
 */
function distributeSpall(ctx, ev, spall, hit, scale) {
  const { vehicle, rng } = ctx;
  const spec = vehicle.spec;
  const entry = hit.localPoint;
  const az = vehicle.turretAz || 0;
  const behind = hit.plate.behind;

  const intensity = spall.fragments * spall.energyFrac * scale;
  if (intensity < 0.5) return;

  for (const man of vehicle.crew || []) {
    if (!man || man.state === 'dead' || man.outsideTank) continue;
    const st = spec.STATIONS[man.role];
    if (!st) continue;

    // The commander's exposure depends on where his head physically is.
    let p = st.seat;
    if (man.role === 'commander') {
      p = vehicle.commanderHeadOut ? st.eyeHeadOut : st.eyeButtonedUp;
    }
    if (st.onTurret) {
      const f = plateFrame({ centre: p, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], onTurret: true }, az);
      p = f.centre;
    }

    const dx = p[0] - entry[0], dy = p[1] - entry[1], dz = p[2] - entry[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 3.2) continue;

    // Is he inside the spall cone?
    const dl = dist || 1;
    const cosA = (dx * hit.localDir[0] + dy * hit.localDir[1] + dz * hit.localDir[2]) / dl;
    const angle = Math.acos(clamp(cosA, -1, 1));
    const inCone = angle < spall.coneHalfAngle * 1.9;
    if (!inCone && dist > 1.6) continue;

    // Being in the same compartment as the entry matters more than raw distance.
    const sameSpace = compartmentOf(spec, man.role) === behind;
    let chanceWeight = intensity / (1 + dist * dist * 0.8);
    if (sameSpace) chanceWeight *= 2.2;
    if (inCone) chanceWeight *= 1.8;

    // The commander with his head out is hit by things that would miss a
    // buttoned-up commander entirely — and vice versa for interior spall.
    if (man.role === 'commander') {
      chanceWeight *= vehicle.commanderHeadOut ? 0.45 : 1.0;
    }

    // Fragment strikes are a genuinely stochastic physical process (where the
    // individual splinters go), unlike penetration, which is not. The RNG is
    // used here and only here in the damage chain.
    const p_hit = 1 - Math.exp(-chanceWeight * 0.12);
    if (rng.next() < p_hit) {
      const severity = clamp(rng.range(0.15, 0.9) * (intensity / 25 + 0.5), 0.08, 1.0);
      ev.crewHit.push({ role: man.role, severity, cause: 'spall', distance: dist });
    }
  }

  // Spall also wrecks equipment: optics, radios and the electrics are fragile.
  for (const [id, comp] of Object.entries(spec.COMPONENTS)) {
    if (comp.external) continue;
    if (comp.compartment !== behind && !(behind === 'turret' && comp.compartment === 'cupola')) continue;
    if (comp.hp > 100) continue;   // heavy assemblies shrug off splinters
    let cpos = comp.pos;
    if (comp.compartment === 'turret' || comp.compartment === 'cupola') {
      const f = plateFrame({ centre: comp.pos, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], onTurret: true }, az);
      cpos = f.centre;
    }
    const dist = Math.hypot(cpos[0] - entry[0], cpos[1] - entry[1], cpos[2] - entry[2]);
    if (dist > 2.4) continue;
    const w = intensity / (1 + dist * dist);
    if (ctx.rng.next() < 1 - Math.exp(-w * 0.09)) {
      ev.componentsHit.push({ id, label: comp.label, damage: 25 + w * 8, at: dist, cause: 'spall' });
    }
  }
}

function compartmentOf(spec, role) {
  switch (role) {
    case 'driver': return 'driver_compartment';
    case 'radio': return 'radio_compartment';
    case 'gunner':
    case 'loader': return 'turret';
    case 'commander': return 'cupola';
    default: return 'fighting_compartment';
  }
}

/** Fires, ammunition and fuel — the things that turn a hit into a lost tank. */
function resolveSecondaryEffects(ctx, ev) {
  const { vehicle, proj, rng } = ctx;
  const spec = vehicle.spec;

  // Fuel and engine hits ignite readily. This is physical, but WHETHER a given
  // hit starts a fire is genuinely probabilistic, so the RNG is used here.
  for (const c of ev.componentsHit) {
    const comp = spec.COMPONENTS[c.id];
    if (!comp || !comp.fireRisk) continue;
    const severity = clamp(c.damage / Math.max(1, comp.hp), 0, 2);
    const p = clamp(comp.fireRisk * severity * 0.85, 0, 0.95);
    if (rng.next() < p) {
      ev.fires.push({
        source: c.id,
        compartment: comp.compartment,
        // A ruptured fuel group burns very differently from a hot engine block.
        intensity: comp.critical === 'fuel' ? rng.range(0.45, 0.8) : rng.range(0.2, 0.5),
        fuelFed: !!comp.capacityL || comp.fuelAdjacent,
      });
    }
  }

  // Ammunition. A round into a full sponson bin is how most Tigers were lost.
  if (ev.ammoHit) {
    const rounds = ev.ammoHit.rounds;
    const burstInside = ev.burstInside ? 1.6 : 1.0;
    // Propellant fire is far more likely than a true high-order detonation.
    const pFire = clamp(0.13 + rounds * 0.016 * burstInside, 0, 0.9);
    const pDetonate = clamp(0.015 + rounds * 0.0035 * burstInside, 0, 0.35);
    const roll = rng.next();
    if (roll < pDetonate) {
      ev.ammoDetonation = true;
      ev.fires.push({ source: ev.ammoHit.rackId, compartment: 'fighting_compartment', intensity: 1.0, ammunition: true });
      ev.explain += ' The ammunition went up.';
    } else if (roll < pDetonate + pFire) {
      ev.fires.push({
        source: ev.ammoHit.rackId, compartment: 'fighting_compartment',
        intensity: rng.range(0.5, 0.85), ammunition: true,
      });
      ev.explain += ' Propellant caught in the ammunition bin.';
    }
  }
}

/** HE and smoke: no penetration, but plenty of consequence. */
function resolveHighExplosive(ctx, ev) {
  const { vehicle, proj, hit, rng } = ctx;
  const spec = vehicle.spec;
  const filler = proj.filler || 0;

  if (proj.kind === 'SMOKE') {
    ev.explain = 'Smoke round. It will not hurt the tank.';
    ev.smoke = { pos: hit.worldPoint, radius: proj.smokeRadius || 15, duration: proj.smokeDuration || 40 };
    return ev;
  }

  ev.explain = `High explosive burst on the ${hit.plate.label}. The armour is intact.`;

  // A big HE shell can tear off externals and shake the crew badly even when it
  // cannot pierce. A 152 mm OF-540 on a Tiger's turret roof is a bad day.
  const power = filler * 1.0;

  const externals = ['track_l', 'track_r', 'roadwheels_l', 'roadwheels_r', 'tow_gear',
    'gunner_sight', 'cupola_optics', 'radio', 'hull_mg', 'coax_mg', 'turret_traverse'];
  for (const id of externals) {
    const comp = spec.COMPONENTS[id];
    if (!comp) continue;
    const dist = Math.hypot(
      comp.pos[0] - hit.localPoint[0], comp.pos[1] - hit.localPoint[1], comp.pos[2] - hit.localPoint[2]);
    if (dist > 3.5) continue;
    const w = power / (0.4 + dist * dist * 0.5);
    if (rng.next() < clamp(w * 0.22, 0, 0.85)) {
      ev.componentsHit.push({ id, label: comp.label, damage: 30 + w * 45, at: dist, cause: 'blast' });
    }
  }

  // Thin roof plate under a very large HE shell can fail structurally.
  if (filler > 3.0 && hit.plate.thickness <= 30) {
    ev.penetrated = true;
    ev.explain += ' The roof plate failed under the blast.';
    for (const man of vehicle.crew || []) {
      if (!man || man.outsideTank || man.state === 'dead') continue;
      if (rng.next() < 0.5) ev.crewHit.push({ role: man.role, severity: rng.range(0.4, 1.0), cause: 'blast' });
    }
  }

  // Concussion: everyone inside gets rattled.
  for (const man of vehicle.crew || []) {
    if (!man || man.outsideTank || man.state === 'dead') continue;
    const conc = clamp(power * 0.09, 0, 0.5);
    if (conc > 0.05) ev.crewHit.push({ role: man.role, severity: conc * 0.3, cause: 'concussion', concussionOnly: true });
  }

  // A commander with his head out in an HE burst is in serious trouble.
  if (vehicle.commanderHeadOut && filler > 0.4) {
    const cmd = (vehicle.crew || []).find((m) => m && m.role === 'commander');
    if (cmd && !cmd.outsideTank) {
      ev.crewHit.push({ role: 'commander', severity: clamp(rng.range(0.3, 1.0) * power, 0.2, 1.0), cause: 'blast, head out' });
    }
  }

  ev.blast = { pos: hit.worldPoint, radius: proj.blastRadius || 8, frag: proj.fragRadius || 15 };
  return ev;
}

/** What condition renders the vehicle combat-ineffective? No HP involved. */
export function assessCombatEffectiveness(vehicle) {
  const c = vehicle.components || {};
  const dead = (id) => c[id]?.destroyed;
  const crew = vehicle.crew || [];
  const alive = (role) => crew.some((m) => m && m.role === role && m.state !== 'dead' && m.state !== 'incapacitated' && !m.outsideTank);

  const reasons = [];
  const mobilityDead = dead('engine') || dead('transmission')
    || (dead('track_l') && dead('track_r'))
    || (dead('final_drive_l') && dead('final_drive_r'))
    || !alive('driver');
  const firepowerDead = dead('main_gun') || dead('breech') || !alive('gunner')
    || (vehicle.ammoRemaining !== undefined && vehicle.ammoRemaining <= 0);

  if (dead('engine')) reasons.push('engine destroyed');
  if (dead('transmission')) reasons.push('transmission destroyed');
  if (dead('track_l') && dead('track_r')) reasons.push('both tracks broken');
  if (dead('main_gun')) reasons.push('main gun disabled');
  if (dead('breech')) reasons.push('breech disabled');
  if (dead('turret_traverse') && vehicle.manualTraverseAlso === false) reasons.push('turret traverse destroyed');
  if (!alive('gunner')) reasons.push('no gunner');
  if (!alive('driver')) reasons.push('no driver');
  if (!alive('loader')) reasons.push('no loader');
  if (vehicle.fire && vehicle.fire.severity > 0.6) reasons.push('major fire');
  if (vehicle.ammoDetonated) reasons.push('ammunition destroyed');

  const casualties = crew.filter((m) => m && (m.state === 'dead' || m.state === 'incapacitated')).length;
  if (casualties >= 3) reasons.push('crew casualties');

  return {
    mobile: !mobilityDead,
    canFight: !firepowerDead,
    // "Combat ineffective" is a judgement about the tank's ability to do its job,
    // not a hit-point threshold.
    combatIneffective: (mobilityDead && firepowerDead) || casualties >= 3
      || (vehicle.fire && vehicle.fire.severity > 0.75) || !!vehicle.ammoDetonated,
    destroyed: !!vehicle.ammoDetonated || (vehicle.fire && vehicle.fire.severity >= 1.0 && vehicle.fire.duration > 25),
    reasons,
  };
}
