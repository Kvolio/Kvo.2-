// ===========================================================================
//  VEHICLE
//
//  One armoured fighting vehicle in the world. The Tiger the player commands is
//  one of these; so is every T-34 and every dug-in ZiS-3.
//
//  It has no health bar. It has components, ammunition, fuel, men and a fire.
// ===========================================================================

import { Driveline } from './Driveline.js';
import { Fire } from './FireSystem.js';
import { traceArmour, hitAspect, localToWorld } from './ArmorArray.js';
import { resolveImpact, OUTCOME } from './Penetration.js';
import { applyImpact, assessCombatEffectiveness } from './DamageModel.js';
import { velocityAt, Projectile, applyDispersion, superelevation, computeLead } from './Ballistics.js';
import { getGun } from '../data/guns.js';
import { getProjectile } from '../data/ammunition.js';
import { clamp, clamp01, approach, approachAngle, angleDelta, normalizeAngle, DEG, RAD } from '../core/MathUtil.js';

export class Vehicle {
  /**
   * @param {object} spec     vehicle spec (TIGER_1H or an entry from vehicles.js)
   * @param {object} opts     { bus, rng, isPlayer, faction, callsign, terrain }
   */
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.bus = opts.bus;
    this.rng = opts.rng;
    this.terrain = opts.terrain;
    this.isPlayer = !!opts.isPlayer;
    this.faction = opts.faction || spec.faction || 'german';
    this.callsign = opts.callsign || spec.designation;
    this.id = opts.id || `v${Math.random().toString(36).slice(2, 8)}`;

    // ---- Kinematics ---------------------------------------------------------
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;

    // ---- Turret and gun -----------------------------------------------------
    this.gun = spec.armament ? getGun(spec.armament.main) : null;
    this.turretAz = 0;              // relative to hull
    this.turretTargetAz = 0;
    this.gunElev = 0;
    this.gunTargetElev = 0;
    this.turretManualOnly = false;
    this.recoil = 0;

    // ---- Components ---------------------------------------------------------
    this.components = {};
    for (const [id, c] of Object.entries(spec.COMPONENTS || {})) {
      this.components[id] = { damage: 0, destroyed: false, hp: c.hp, disabled: false };
    }

    // ---- Ammunition ---------------------------------------------------------
    this.rackStock = {};
    this.ammo = {};                 // by projectile id
    this.loadedRound = null;
    this.selectedAmmo = spec.armament?.defaultLoadout
      ? Object.keys(spec.armament.defaultLoadout)[0] : null;
    this.reloadTimer = 0;
    this.reloading = false;
    this.breechEmpty = true;
    this.mgAmmo = spec.armament?.mgAmmoCapacity ?? 0;

    // ---- Consumables --------------------------------------------------------
    this.fuelL = spec.mobility?.fuelCapacityL ?? 300;

    // ---- Systems ------------------------------------------------------------
    this.driveline = spec.transmission ? new Driveline(spec) : null;
    this.fire = spec.FIRE_SYSTEM ? new Fire(spec, this.bus, this.rng) : null;

    // ---- Crew ---------------------------------------------------------------
    this.crew = [];
    this.crewManager = null;

    // ---- State --------------------------------------------------------------
    this.hatchOpen = { cupola_hatch: false, loader_hatch: false, driver_hatch: false, radio_hatch: false };
    this.commanderHeadOut = false;
    this.ammoDetonated = false;
    this.abandoned = false;
    this.destroyed = false;
    this.immobile = false;
    this.beingTowed = null;
    this.towing = null;
    this.smokeScreen = 0;
    this.dustLevel = 0;
    this.hitLog = [];
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.distanceTravelled = 0;

    this.loadAmmunition(spec.armament?.defaultLoadout || {});
  }

  // ==================== Ammunition ==========================================

  /** Distribute a loadout across the physical racks. */
  loadAmmunition(loadout) {
    this.ammo = {};
    this.rackStock = {};
    const racks = this.spec.AMMO_RACKS || [];
    for (const r of racks) this.rackStock[r.id] = 0;

    // Ready rack first — that is what the loader reaches for under pressure.
    const order = [...racks].sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0));
    const rackContents = {};
    for (const r of racks) rackContents[r.id] = [];

    for (const [projId, count] of Object.entries(loadout)) {
      this.ammo[projId] = (this.ammo[projId] || 0) + count;
      let left = count;
      for (const r of order) {
        if (left <= 0) break;
        const space = r.capacity - this.rackStock[r.id];
        if (space <= 0) continue;
        const put = Math.min(space, left);
        this.rackStock[r.id] += put;
        rackContents[r.id].push({ projId, count: put });
        left -= put;
      }
    }
    this.rackContents = rackContents;
    return this.ammoRemaining;
  }

  get ammoRemaining() {
    return Object.values(this.ammo).reduce((a, b) => a + b, 0);
  }

  ammoCount(projId) { return this.ammo[projId] || 0; }

  /** Take one round out of the racks, preferring the ready rack. */
  _drawRound(projId) {
    if ((this.ammo[projId] || 0) <= 0) return false;
    const racks = [...(this.spec.AMMO_RACKS || [])].sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0));
    for (const r of racks) {
      const contents = this.rackContents[r.id];
      const entry = contents?.find((e) => e.projId === projId && e.count > 0);
      if (entry) {
        entry.count--;
        this.rackStock[r.id]--;
        this.ammo[projId]--;
        return { rackId: r.id, fromReady: !!r.ready };
      }
    }
    return false;
  }

  // ==================== Loading =============================================

  /**
   * Begin loading a round. Reload time is the book figure modified by the man
   * doing it: his training, his wounds, his nerves, his tiredness, and whether
   * the tank is bouncing across a field while he does it.
   */
  beginReload(projId, force = false) {
    if (this.reloading && !force) return { ok: false, reason: 'already loading' };
    const comps = this.components;
    if (comps.breech?.destroyed) return { ok: false, reason: 'breech disabled' };
    if (comps.main_gun?.destroyed) return { ok: false, reason: 'gun disabled' };
    if ((this.ammo[projId] || 0) <= 0) return { ok: false, reason: 'none of that nature left' };

    const loader = this.crewManager?.get('loader');
    if (!loader) return { ok: false, reason: 'no one to load' };

    let t = this.gun.baseReloadS;

    // Skill: a trained loader on a Tiger's 8.8 cm managed the gun in 6-8 seconds.
    const skill = clamp01(loader.skill.reloadSpeed ?? loader.experience);
    t *= 1.45 - skill * 0.55;
    t *= loader.speedFactor * 0.62 + 0.38;

    // Reaching past the ready rack into a sponson bin costs real time.
    const readyAvailable = this.rackContents?.ready_r?.some((e) => e.projId === projId && e.count > 0);
    if (!readyAvailable) t *= 1.28;

    // Changing nature means clearing the breech first.
    if (this.loadedRound && this.loadedRound !== projId) {
      t += 3.2 * loader.speedFactor;
      this.crewManager?.speak(loader, 'loader.changing_ammo');
    } else {
      this.crewManager?.speak(loader, 'loader.loading');
    }

    // A moving tank makes a 15 kg round very hard to handle.
    const speed = Math.abs(this.driveline?.speed ?? 0);
    t *= 1 + clamp(speed / 6, 0, 0.55);

    // A man covering the loader's job as well as his own is slow.
    if (loader.actingAs || loader.role !== 'loader') t *= 1.5;

    // Fumbles. A frightened, tired man drops rounds.
    if (this.rng.next() < loader.errorChance * 0.55) {
      t += this.rng.range(1.8, 4.0);
      this.crewManager?.speak(loader, 'loader.dropped', {}, true);
      loader.addStress(0.04);
    }

    this.reloading = true;
    this.reloadTimer = t;
    this.pendingRound = projId;
    loader.busyWith = 'loading';
    loader.addFatigue(0.010);
    return { ok: true, seconds: t };
  }

  _finishReload() {
    const drawn = this._drawRound(this.pendingRound);
    this.reloading = false;
    const loader = this.crewManager?.get('loader');
    if (loader) loader.busyWith = null;

    if (!drawn) {
      this.loadedRound = null;
      this.breechEmpty = true;
      this.crewManager?.speak(loader, 'loader.ammo_out', {}, true);
      return;
    }
    this.loadedRound = this.pendingRound;
    this.breechEmpty = false;
    this.pendingRound = null;

    const p = getProjectile(this.loadedRound);
    const evName = p.kind === 'HE' ? 'loader.ready_he'
      : p.kind === 'SMOKE' ? 'loader.ready_smoke'
      : 'loader.ready_ap';
    this.crewManager?.speak(loader, evName, {}, true);
    this.bus?.emit('gun:loaded', { projId: this.loadedRound, vehicle: this });

    // Warn the commander when a nature is running out.
    const left = this.ammo[this.loadedRound] || 0;
    if (left === 5 || left === 10) this.crewManager?.speak(loader, 'loader.ammo_low', {}, true);
  }

  // ==================== Turret ==============================================

  /** Rate the turret can traverse right now, in rad/s. */
  traverseRate() {
    const g = this.gun;
    if (!g) return 0;
    const traverseOk = !this.components.turret_traverse?.destroyed;
    const electricsOk = !this.components.electrics?.destroyed;
    const engineRunning = this.driveline?.running;

    if (!traverseOk || !electricsOk || !engineRunning) {
      // Hand cranking. 720 turns for a full circle is not a figure of speech.
      this.turretManualOnly = true;
      const gunner = this.crewManager?.get('gunner');
      const strength = gunner ? clamp(gunner.effectiveness, 0.15, 1.2) : 0.4;
      return (g.traverseManual || 0.5 * DEG) * strength;
    }
    this.turretManualOnly = false;
    // The hydraulic drive is taken off the engine, so revs matter.
    const rpmFrac = clamp01((this.driveline.rpm - 600) / (this.spec.engine.governedRpm - 600));
    const rate = g.traverseHydraulicLow + (g.traverseHydraulicMax - g.traverseHydraulicLow) * rpmFrac;
    const gunner = this.crewManager?.get('gunner');
    return rate * (gunner ? clamp(0.55 + gunner.effectiveness * 0.5, 0.4, 1.1) : 0.6);
  }

  elevationRate() {
    if (this.components.gun_elevation?.destroyed) return 0;
    const gunner = this.crewManager?.get('gunner');
    return (this.gun?.elevRate ?? 4 * DEG) * (gunner ? clamp(0.5 + gunner.effectiveness * 0.6, 0.3, 1.2) : 0.5);
  }

  /** Point the gun at a world position. Returns true when it is laid on. */
  layOn(worldPoint, dt) {
    if (!this.gun) return false;
    const dx = worldPoint.x - this.pos.x;
    const dz = worldPoint.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const worldAz = Math.atan2(dx, dz);
    this.turretTargetAz = normalizeAngle(worldAz - this.heading);

    const muzzleY = this.pos.y + (this.spec.L?.trunnionY ?? 2.1);
    const dy = worldPoint.y - muzzleY;
    const proj = getProjectile(this.loadedRound || this.selectedAmmo || 'pzgr39');
    const se = superelevation(proj, Math.max(1, dist), dy);
    this.gunTargetElev = clamp(se, this.gun.elevMin, this.gun.elevMax);

    this.stepTurret(dt);
    const azErr = Math.abs(angleDelta(this.turretAz, this.turretTargetAz));
    const elErr = Math.abs(this.gunElev - this.gunTargetElev);
    return azErr < 2 * DEG / 1000 * Math.max(200, dist) / 200 && elErr < 0.004;
  }

  stepTurret(dt) {
    const tr = this.traverseRate();
    this.turretAz = approachAngle(this.turretAz, this.turretTargetAz, tr * dt);
    const er = this.elevationRate();
    this.gunElev = clamp(approach(this.gunElev, this.gunTargetElev, er * dt),
      this.gun?.elevMin ?? -0.1, this.gun?.elevMax ?? 0.3);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 1.8);
  }

  /** Muzzle position and direction in world space. */
  muzzle() {
    const Lx = this.spec.L || {};
    const local = [0, Lx.trunnionY ?? 2.1, (Lx.trunnionZ ?? 0.6)];
    const barrel = (Lx.barrelLength ?? 4.0);
    // Rotate the barrel by turret azimuth and gun elevation.
    const az = this.turretAz;
    const el = this.gunElev;
    const dirLocal = [
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    ];
    // Trunnion, rotated about the ring centre.
    const ringZ = Lx.turretCentreZ ?? 0.35;
    const rel = [local[0], local[1], local[2] - ringZ];
    const c = Math.cos(az), s = Math.sin(az);
    const trunnion = [rel[0] * c + rel[2] * s, rel[1], -rel[0] * s + rel[2] * c + ringZ];
    const muzzleLocal = [
      trunnion[0] + dirLocal[0] * barrel,
      trunnion[1] + dirLocal[1] * barrel,
      trunnion[2] + dirLocal[2] * barrel,
    ];
    return {
      pos: localToWorld(this, muzzleLocal, false),
      dir: localToWorld(this, dirLocal, true),
    };
  }

  // ==================== Firing ==============================================

  /**
   * Fire the main gun. Returns the projectile or a refusal reason.
   * The shell goes exactly where the barrel points, plus a real dispersion cone.
   */
  fireMainGun(world) {
    if (this.breechEmpty || !this.loadedRound) return { ok: false, reason: 'nothing in the breech' };
    if (this.components.main_gun?.destroyed) return { ok: false, reason: 'gun destroyed' };
    if (this.components.breech?.destroyed) return { ok: false, reason: 'breech destroyed' };
    if (this.components.electrics?.destroyed && this.rng.next() < 0.5) {
      return { ok: false, reason: 'electric firing circuit is dead' };
    }

    const gunner = this.crewManager?.get('gunner');
    const m = this.muzzle();

    // Dispersion: gun/ammunition scatter, plus the gunner's own error.
    let sigma = this.gun.dispersionMrad;
    if (gunner) {
      const acc = clamp01(gunner.skill.accuracy ?? gunner.experience);
      sigma += (1 - acc) * 0.55;
      sigma *= 1 + gunner.stress * 0.85 + gunner.fatigue * 0.35;
      if (gunner.actingAs || gunner.role !== 'gunner') sigma *= 2.1;
    } else {
      sigma *= 3.5;
    }
    // Laying the gun over open sights because the TZF is smashed.
    if (this.components.gunner_sight?.destroyed) sigma *= 4.5;
    // Firing on the move with no stabilisation at all.
    const speed = Math.abs(this.driveline?.speed ?? 0);
    sigma *= 1 + clamp(speed / 3.5, 0, 3.2);

    const dir = applyDispersion(m.dir, sigma, this.rng);
    const proj = world.spawnProjectile(this.loadedRound, m.pos, dir, this);

    this.shotsFired++;
    this.recoil = 1;
    this.breechEmpty = true;
    const spent = this.loadedRound;
    this.loadedRound = null;

    if (gunner) {
      this.crewManager?.speak(gunner, 'gunner.firing', {}, true);
      gunner.addFatigue(0.004);
    }
    this.bus?.emit('gun:fired', {
      vehicle: this, projId: spent, pos: m.pos, dir,
      caliber: getProjectile(spent).caliber, isPlayer: this.isPlayer,
    });

    // The loader starts on the next round without being told.
    const next = this.selectedAmmo || spent;
    if ((this.ammo[next] || 0) > 0) this.beginReload(next);

    return { ok: true, projectile: proj, projId: spent, dispersionMrad: sigma };
  }

  // ==================== Taking hits =========================================

  /**
   * A shell arrives. Everything that follows is computed from the shell and the
   * plate — see src/sim/Penetration.js.
   */
  receiveHit(projectile, worldPoint, worldDir, difficulty = {}) {
    const proj = projectile.data || getProjectile(projectile.projId);
    const origin = {
      x: worldPoint.x - worldDir.x * 0.5,
      y: worldPoint.y - worldDir.y * 0.5,
      z: worldPoint.z - worldDir.z * 0.5,
    };
    const hit = traceArmour(this, origin, worldDir, 40);
    if (!hit) return null;

    let impactVel = projectile.speed ?? velocityAt(proj, projectile.distance || 0);
    const range = projectile.distance || 0;

    // The interleaved running gear is real protection for the lower hull side.
    if (hit.screened) {
      const screen = { thickness: hit.screenThicknessMm, quality: 0.6, label: 'running gear' };
      const pre = resolveImpact(proj, screen, impactVel, hit.obliquity * 0.5, range);
      if (pre.outcome === OUTCOME.NON_PENETRATION || pre.outcome === OUTCOME.RICOCHET) {
        this.bus?.emit('vehicle:hit', {
          vehicle: this, outcome: 'stopped_by_running_gear',
          worldPoint: hit.worldPoint, aspect: hitAspect(this, worldDir),
        });
        return { outcome: 'stopped_by_running_gear', hit };
      }
      impactVel = pre.residualVel || impactVel * 0.75;
    }

    const impact = resolveImpact(proj, hit.plate, impactVel, hit.obliquity, range);
    const ev = applyImpact({
      vehicle: this, hit, impact, proj, rng: this.rng, difficulty,
    });
    ev.aspect = hitAspect(this, worldDir);
    ev.worldPoint = hit.worldPoint;
    ev.range = range;
    ev.shooter = projectile.shooter;

    this._applyDamageEvent(ev, difficulty);
    this.hitLog.push({
      t: Date.now(), outcome: ev.outcome, plate: ev.plate, aspect: ev.aspect,
      range: Math.round(range), projectile: proj.name, report: ev.report,
    });
    this.bus?.emit('vehicle:hit', { vehicle: this, ...ev });
    return ev;
  }

  _applyDamageEvent(ev, difficulty) {
    // ---- Components ----------------------------------------------------------
    for (const c of ev.componentsHit) {
      const st = this.components[c.id];
      const spec = this.spec.COMPONENTS[c.id];
      if (!st || !spec || st.destroyed) continue;
      const mul = difficulty.componentDamage ?? 1.0;
      st.damage += c.damage * mul;
      if (st.damage >= spec.hp) {
        st.destroyed = true;
        this.bus?.emit('component:destroyed', { vehicle: this, id: c.id, label: spec.label });
      } else if (st.damage >= spec.hp * 0.55 && !st.disabled) {
        st.disabled = true;
        this.bus?.emit('component:damaged', { vehicle: this, id: c.id, label: spec.label });
      }
    }

    // ---- Crew ----------------------------------------------------------------
    for (const ch of ev.crewHit) {
      const man = this.crew.find((m) => m && m.role === ch.role);
      if (!man) continue;
      if (ch.concussionOnly) { man.addStress(ch.severity); man.shock = clamp01(man.shock + ch.severity); continue; }
      const mul = difficulty.crewVulnerability ?? 1.0;
      const res = man.wound(ch.severity * mul, ch.cause);
      if (!res) continue;
      if (res.died) {
        this.bus?.emit('crew:died', { vehicle: this, man, cause: ch.cause });
        this.crewManager?.registerIncoming('crew_dead');
        const witness = this.crew.find((m) => m.canWork && m !== man);
        if (witness) this.crewManager?.speak(witness, 'crew.other_dead', { name: man.name.split(' ')[1], role: man.role }, true);
      } else if (res.newlyWounded) {
        this.bus?.emit('crew:wounded', { vehicle: this, man, severity: ch.severity, cause: ch.cause });
        this.crewManager?.registerIncoming('crew_wounded');
        this.crewManager?.speak(man, ch.severity > 0.45 ? 'crew.wounded_bad' : 'crew.wounded', {}, true);
      }
    }

    // ---- The commander is a man too -----------------------------------------
    if (this.isPlayer) {
      const cmdHits = ev.crewHit.filter((c) => c.role === 'commander' && !c.concussionOnly);
      if (cmdHits.length) {
        const worst = cmdHits.reduce((a, b) => (b.severity > a.severity ? b : a));
        this.bus?.emit('commander:hit', { severity: worst.severity, cause: worst.cause });
        const witness = this.crew.find((m) => m.canWork && m.role !== 'commander');
        if (witness) this.crewManager?.speak(witness, 'crew.commander_hit', {}, true);
      }
    }

    // ---- Fire ----------------------------------------------------------------
    for (const f of ev.fires) {
      this.fire?.ignite(f);
      this.crewManager?.registerIncoming('fire');
    }
    if (ev.ammoDetonation) {
      this.ammoDetonated = true;
      this.destroyed = true;
      this.bus?.emit('vehicle:destroyed', { vehicle: this, cause: 'ammunition detonation' });
    }

    // ---- Everyone felt that --------------------------------------------------
    const kind = ev.penetrated ? 'penetration'
      : ev.outcome === OUTCOME.RICOCHET ? 'ricochet' : 'non_penetration';
    this.crewManager?.registerIncoming(kind, ev.shockG);

    // ---- The crew calls out what happened ------------------------------------
    if (this.crewManager) {
      const speakerRole = ev.penetrated
        ? (this.rng.pick(['gunner', 'loader', 'driver', 'radio']))
        : (this.rng.pick(['driver', 'loader', 'gunner']));
      const speaker = this.crewManager.get(speakerRole);
      if (speaker) {
        const evName = ev.penetrated ? 'hit.penetration'
          : ev.outcome === OUTCOME.RICOCHET ? 'hit.ricochet' : 'hit.nonpen';
        this.crewManager.speak(speaker, evName, {}, true);
      }
    }

    // ---- Consequences of specific components ---------------------------------
    if (this.components.track_l?.destroyed || this.components.track_r?.destroyed) {
      this.crewManager?.say('driver', 'driver.track_gone', {}, true);
    }
    if (this.components.engine?.destroyed) {
      this.crewManager?.say('driver', 'driver.engine_dead', {}, true);
      this.driveline?.stop();
    }
    if (this.components.radio?.destroyed) {
      this.crewManager?.say('radio', 'radio.dead', {}, true);
    }
    if (this.components.gunner_sight?.destroyed) {
      this.crewManager?.say('gunner', 'gunner.sight_gone', {}, true);
    }
    if (this.components.turret_traverse?.destroyed) {
      this.crewManager?.say('gunner', 'gunner.cannot_traverse', {}, true);
    }

    // Fuel loss from a holed tank.
    for (const c of ev.componentsHit) {
      const spec = this.spec.COMPONENTS[c.id];
      if (spec?.capacityL && this.components[c.id]?.destroyed) {
        this.fuelL = Math.max(0, this.fuelL - spec.capacityL * 0.85);
      }
    }
  }

  // ==================== Update ==============================================

  update(dt, ctx = {}) {
    if (this.destroyed) return;

    // ---- Loading -----------------------------------------------------------
    if (this.reloading) {
      const loader = this.crewManager?.get('loader');
      // If the loader has gone outside or been hit, loading stops dead.
      if (!loader) {
        this.reloading = false;
        this.reloadTimer = 0;
      } else {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) this._finishReload();
      }
    }

    // ---- Turret ------------------------------------------------------------
    this.stepTurret(dt);

    // ---- Driveline ---------------------------------------------------------
    if (this.driveline) {
      const driver = this.crewManager?.get('driver');
      const terrainRes = this.terrain
        ? this.terrain.resistanceAt(this.pos.x, this.pos.z) : 0.2;
      const grad = ctx.gradient ?? 0;
      this.driveline.update(dt, {
        engineOk: !this.components.engine?.destroyed,
        transmissionOk: !this.components.transmission?.destroyed,
        trackLOk: !this.components.track_l?.destroyed,
        trackROk: !this.components.track_r?.destroyed,
        finalDriveLOk: !this.components.final_drive_l?.destroyed,
        finalDriveROk: !this.components.final_drive_r?.destroyed,
        roadwheelsDegraded: this.components.roadwheels_l?.disabled || this.components.roadwheels_r?.disabled,
        driverSkill: driver ? clamp01(driver.skill.driving ?? driver.experience) * driver.effectiveness : 0,
        terrainResistance: terrainRes,
        gradient: grad,
        fuelAvailable: this.fuelL > 0.5,
      });

      // Move.
      const spd = this.driveline.speed;
      this.heading = normalizeAngle(this.heading + (this.driveline.yawRate || 0) * dt);
      const dx = Math.sin(this.heading) * spd * dt;
      const dz = Math.cos(this.heading) * spd * dt;
      this.pos.x += dx; this.pos.z += dz;
      this.distanceTravelled += Math.hypot(dx, dz);
      this.vel.x = Math.sin(this.heading) * spd;
      this.vel.z = Math.cos(this.heading) * spd;

      // Fuel.
      this.fuelL = Math.max(0, this.fuelL - this.driveline.fuelBurnRate * dt);
      if (this.fuelL <= 0 && this.driveline.running) {
        this.driveline.stop();
        this.crewManager?.say('driver', 'driver.fuel_out', {}, true);
      }

      // Dust: a Tiger on dry Kursk steppe throws a plume you can see for miles.
      const dustTarget = clamp01(Math.abs(spd) / 6) * (this.terrain?.dustAt(this.pos.x, this.pos.z) ?? 0.7);
      this.dustLevel = this.dustLevel + (dustTarget - this.dustLevel) * dt * 0.8;
    }

    // ---- Terrain following -------------------------------------------------
    if (this.terrain) {
      const h = this.terrain.heightAt(this.pos.x, this.pos.z);
      this.pos.y = h;
      const s = 2.0;
      const hf = this.terrain.heightAt(this.pos.x + Math.sin(this.heading) * s, this.pos.z + Math.cos(this.heading) * s);
      const hb = this.terrain.heightAt(this.pos.x - Math.sin(this.heading) * s, this.pos.z - Math.cos(this.heading) * s);
      const hr = this.terrain.heightAt(this.pos.x + Math.cos(this.heading) * 1.5, this.pos.z - Math.sin(this.heading) * 1.5);
      const hl = this.terrain.heightAt(this.pos.x - Math.cos(this.heading) * 1.5, this.pos.z + Math.sin(this.heading) * 1.5);
      this.pitch = Math.atan2(hf - hb, s * 2);
      this.roll = Math.atan2(hr - hl, 3.0);
    }

    // ---- Fire ---------------------------------------------------------------
    if (this.fire?.active) {
      this.fire.update(dt, this, ctx.difficulty || {});
      if (this.ammoDetonated) {
        this.destroyed = true;
        this.bus?.emit('vehicle:destroyed', { vehicle: this, cause: 'ammunition fire' });
      }
    }

    // ---- Crew ---------------------------------------------------------------
    this.crewManager?.update(dt, ctx);

    // ---- Smoke --------------------------------------------------------------
    if (this.smokeScreen > 0) this.smokeScreen = Math.max(0, this.smokeScreen - dt);

    this.immobile = !this.assess().mobile;
  }

  assess() { return assessCombatEffectiveness(this); }

  /** A compact state readout for the HUD and the after-action report. */
  condition() {
    const damaged = [];
    for (const [id, st] of Object.entries(this.components)) {
      if (st.destroyed) damaged.push({ id, label: this.spec.COMPONENTS[id].label, state: 'destroyed' });
      else if (st.disabled) damaged.push({ id, label: this.spec.COMPONENTS[id].label, state: 'damaged' });
    }
    return {
      damaged,
      fuelL: Math.round(this.fuelL),
      fuelPct: this.fuelL / (this.spec.mobility?.fuelCapacityL || 540),
      ammo: { ...this.ammo },
      ammoTotal: this.ammoRemaining,
      loaded: this.loadedRound,
      fire: this.fire?.active ? { stage: this.fire.stage, severity: this.fire.severity } : null,
      ...this.assess(),
    };
  }

  serialize() {
    return {
      id: this.id, callsign: this.callsign,
      components: JSON.parse(JSON.stringify(this.components)),
      ammo: { ...this.ammo }, rackStock: { ...this.rackStock },
      rackContents: JSON.parse(JSON.stringify(this.rackContents || {})),
      fuelL: this.fuelL, mgAmmo: this.mgAmmo,
      kills: this.kills, shotsFired: this.shotsFired, shotsHit: this.shotsHit,
      distanceTravelled: this.distanceTravelled,
      abandoned: this.abandoned, destroyed: this.destroyed,
      ammoDetonated: this.ammoDetonated,
      fire: this.fire?.serialize(),
    };
  }

  deserialize(d) {
    Object.assign(this, {
      components: d.components, ammo: d.ammo, rackStock: d.rackStock,
      rackContents: d.rackContents, fuelL: d.fuelL, mgAmmo: d.mgAmmo,
      kills: d.kills, shotsFired: d.shotsFired, shotsHit: d.shotsHit,
      distanceTravelled: d.distanceTravelled, abandoned: d.abandoned,
      destroyed: d.destroyed, ammoDetonated: d.ammoDetonated,
    });
    if (d.fire && this.fire) this.fire.deserialize(d.fire);
  }
}
