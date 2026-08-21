// ===========================================================================
//  FIELD REPAIR
//
//  You cannot repair a Tiger from inside the turret. Somebody has to open a
//  hatch, climb down onto ground that people are shooting at, walk to the
//  damaged thing, and work on it with tools, while the tank sits there unable
//  to do its job because half its crew is outside.
//
//  Everything about this system is designed so that ordering a repair is a
//  decision with a cost, not a button that fixes the tank.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';

export const REPAIR_STATE = {
  IDLE: 'idle',
  MOVING_TO_COVER: 'moving to cover',
  DISMOUNTING: 'dismounting',
  WALKING: 'walking to the damage',
  WORKING: 'working',
  RETURNING: 'returning to the tank',
  MOUNTING: 'climbing back in',
  COMPLETE: 'complete',
  ABORTED: 'aborted',
  IMPOSSIBLE: 'impossible',
};

/** Which crewman is good at what. A driver knows the running gear. */
const ROLE_APTITUDE = {
  driver: { track_l: 1.35, track_r: 1.35, roadwheels_l: 1.4, roadwheels_r: 1.4, electrics: 0.9, default: 0.85 },
  gunner: { breech: 1.35, turret_traverse: 1.3, gun_elevation: 1.35, gunner_sight: 1.45, cupola_optics: 1.2, default: 0.8 },
  loader: { track_l: 1.1, track_r: 1.1, coax_mg: 1.3, tow_gear: 1.25, cupola_optics: 1.1, default: 0.95 },
  radio: { radio: 1.5, electrics: 1.4, hull_mg: 1.3, tow_gear: 1.15, default: 0.8 },
  commander: { default: 0.7 },
};

export class RepairJob {
  constructor(componentId, spec, crewmen, opts = {}) {
    this.componentId = componentId;
    this.componentSpec = spec;
    this.crewmen = crewmen;
    this.state = REPAIR_STATE.IDLE;
    this.progress = 0;               // 0..1
    this.totalSeconds = 0;
    this.elapsed = 0;
    this.startedAt = 0;
    this.lastReportAt = 0;
    this.partsConsumed = null;
    this.interrupted = false;
    this.difficulty = opts.difficulty || {};
  }
}

export class RepairSystem {
  constructor({ world, bus, rng, logistics, difficulty }) {
    this.world = world;
    this.bus = bus;
    this.rng = rng;
    this.logistics = logistics;
    this.difficulty = difficulty || {};
    this.job = null;
    this.coverOrder = null;
  }

  get active() { return !!this.job && ![REPAIR_STATE.COMPLETE, REPAIR_STATE.ABORTED, REPAIR_STATE.IMPOSSIBLE].includes(this.job.state); }

  // ---- What can be fixed out here at all? ---------------------------------

  /**
   * List everything currently broken, and say honestly whether the crew can do
   * anything about it in a field.
   */
  assessDamage(tiger) {
    const out = [];
    for (const [id, st] of Object.entries(tiger.components)) {
      if (!st.destroyed && !st.disabled) continue;
      const spec = tiger.spec.COMPONENTS[id];
      const parts = spec.partsNeeded || {};
      const missing = [];
      for (const [part, n] of Object.entries(parts)) {
        if ((this.logistics?.spares?.[part] ?? 0) < n) missing.push(part);
      }
      out.push({
        id,
        label: spec.label,
        state: st.destroyed ? 'destroyed' : 'damaged',
        fieldRepairable: !!spec.fieldRepairable,
        // A destroyed component is a much bigger job than a damaged one, and
        // some are simply not field jobs at all.
        repairable: !!spec.fieldRepairable && missing.length === 0,
        reason: !spec.fieldRepairable
          ? (spec.repairNote || 'This cannot be repaired in the field.')
          : missing.length ? `No ${missing.join(', ')} in stores.` : null,
        estimateMinutes: spec.repairMinutes,
        partsNeeded: parts,
        missingParts: missing,
        bestCrew: spec.repairCrew || [],
        note: spec.repairNote,
      });
    }
    return out;
  }

  // ---- Ordering the driver into cover -------------------------------------

  /**
   * "Driver, get behind that ridge." The driver looks at the ground, the known
   * threats and the damage, and finds somewhere — or tells you there is nowhere.
   */
  orderCover(tiger, threatPos, searchRadius = 220) {
    const driver = tiger.crewManager?.get('driver');
    if (!driver) {
      return { ok: false, reason: 'There is nobody at the driver’s controls.' };
    }
    if (!tiger.assess().mobile) {
      tiger.crewManager.speak(driver, 'driver.no_cover', {}, true);
      return { ok: false, reason: 'The tank cannot move.' };
    }

    const threat = threatPos || this._guessThreat(tiger);
    const cover = this.world.terrain.findCover(
      tiger.pos.x, tiger.pos.z, threat.x, threat.z,
      searchRadius, tiger.spec.dims.height);

    if (!cover) {
      tiger.crewManager.speak(driver, 'driver.no_cover', {}, true);
      this.bus?.emit('repair:no_cover', {});
      return { ok: false, reason: 'The driver reports no cover within reach.' };
    }

    // A poor or frightened driver picks worse ground and takes longer over it.
    const quality = clamp01((driver.skill.terrain ?? driver.experience) * driver.effectiveness);
    this.coverOrder = {
      pos: cover, arrived: false,
      startedAt: this.world.time,
      quality,
      hullDown: cover.hullDown,
      fullDefilade: cover.fullDefilade,
    };
    tiger.coverTarget = cover;
    tiger.crewManager.speak(driver, 'driver.cover', {}, true);
    this.bus?.emit('repair:moving_to_cover', { cover });
    return { ok: true, cover, distance: cover.distance };
  }

  _guessThreat(tiger) {
    // Nearest thing we believe is out there. If we know nothing, assume the
    // direction of the last hit.
    const contacts = this.world.spotting.hostile();
    if (contacts.length) {
      let best = contacts[0], bd = Infinity;
      for (const c of contacts) {
        const d = Math.hypot(c.lastKnownPos.x - tiger.pos.x, c.lastKnownPos.z - tiger.pos.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best.lastKnownPos;
    }
    const last = tiger.hitLog[tiger.hitLog.length - 1];
    if (last?.report) {
      return { x: tiger.pos.x, z: tiger.pos.z + 500 };
    }
    return { x: tiger.pos.x, z: tiger.pos.z + 400 };
  }

  // ---- Starting a repair ---------------------------------------------------

  /**
   * @param {Vehicle} tiger
   * @param {string} componentId
   * @param {string[]} roles   which crewmen the commander is sending out
   */
  begin(tiger, componentId, roles) {
    if (this.active) return { ok: false, reason: 'A repair is already under way.' };

    const spec = tiger.spec.COMPONENTS[componentId];
    if (!spec) return { ok: false, reason: 'No such component.' };
    if (!spec.fieldRepairable) {
      const crew = tiger.crewManager?.get('driver') || tiger.crewManager?.get('loader');
      if (crew) tiger.crewManager.speak(crew, 'repair.cannot', {}, true);
      return { ok: false, reason: spec.repairNote || 'That cannot be repaired in the field.' };
    }
    if (Math.abs(tiger.driveline?.speed ?? 0) > 0.4) {
      return { ok: false, reason: 'The tank must be stopped first.' };
    }

    // Parts.
    const parts = spec.partsNeeded || {};
    for (const [part, n] of Object.entries(parts)) {
      if ((this.logistics?.spares?.[part] ?? 0) < n) {
        return { ok: false, reason: `No ${part.replace(/([A-Z])/g, ' $1').toLowerCase()} left in stores.` };
      }
    }

    // The men.
    const crewmen = [];
    for (const role of roles) {
      const m = tiger.crewManager?.byRole(role);
      if (!m) continue;
      if (!m.canWork) continue;
      if (m.outsideTank) continue;
      crewmen.push(m);
    }
    if (!crewmen.length) return { ok: false, reason: 'None of those men can go out.' };

    const job = new RepairJob(componentId, spec, crewmen, { difficulty: this.difficulty });
    job.totalSeconds = this._estimateSeconds(spec, crewmen, tiger);
    job.startedAt = this.world.time;
    job.state = REPAIR_STATE.DISMOUNTING;
    job.tiger = tiger;
    this.job = job;

    // Physically put them outside. They climb out of hatches and walk.
    const target = this._componentWorldPos(tiger, componentId);
    for (const m of crewmen) {
      const station = tiger.spec.STATIONS[m.role];
      const exit = this._hatchWorldPos(tiger, station?.hatch);
      const d = this.world.addDismount(m, exit, `repair:${componentId}`);
      d.target = target;
      d.exitDelay = station?.exitTimeS ?? 4;
      d.speed = 1.5;
      m.busyWith = 'repair';
      tiger.crewManager.speak(m, 'repair.acknowledge', {}, true);
    }

    this.bus?.emit('repair:started', {
      component: spec.label, componentId,
      crew: crewmen.map((m) => ({ name: m.name, role: m.role })),
      estimateSeconds: job.totalSeconds,
      consequences: this._consequences(tiger, crewmen),
    });

    return { ok: true, job, estimateSeconds: job.totalSeconds, consequences: this._consequences(tiger, crewmen) };
  }

  /**
   * The book time, modified by who is doing it and what state they are in.
   * More hands is faster, but with diminishing returns — four men cannot all
   * get at one track link at once.
   */
  _estimateSeconds(spec, crewmen, tiger) {
    let base = (spec.repairMinutes ?? 12) * 60;

    // Destroyed is a much bigger job than merely damaged.
    const st = tiger.components[Object.keys(tiger.spec.COMPONENTS).find((k) => tiger.spec.COMPONENTS[k] === spec)];
    if (st?.destroyed) base *= 1.6;

    let effort = 0;
    for (const m of crewmen) {
      const apt = ROLE_APTITUDE[m.role] || {};
      const aptitude = apt[this.job?.componentId] ?? apt.default ?? 1;
      const skill = clamp01(m.skill.repair ?? m.experience);
      // Experience, training for this job, and current condition all count.
      effort += (0.45 + skill * 0.85) * aptitude * clamp(m.effectiveness, 0.15, 1.3);
    }
    // Diminishing returns on extra hands.
    const hands = Math.pow(crewmen.length, 0.72) / Math.max(1, crewmen.length);
    effort *= hands;

    let t = base / Math.max(0.25, effort);
    t *= this.difficulty.repairTime ?? 1.0;
    return clamp(t, 45, 60 * 90);
  }

  _consequences(tiger, crewmen) {
    const out = [];
    for (const m of crewmen) {
      switch (m.role) {
        case 'loader': out.push('No one is loading the gun.'); break;
        case 'gunner': out.push('No one is laying the gun.'); break;
        case 'driver': out.push('The tank cannot be driven.'); break;
        case 'radio': out.push('No radio traffic in or out.'); break;
        default: break;
      }
    }
    out.push(`${crewmen.length} ${crewmen.length === 1 ? 'man' : 'men'} outside the armour.`);
    return out;
  }

  _componentWorldPos(tiger, componentId) {
    const spec = tiger.spec.COMPONENTS[componentId];
    const l = spec.pos;
    const c = Math.cos(tiger.heading), s = Math.sin(tiger.heading);
    // Stand alongside the component, not inside the tank.
    const outward = l[0] > 0 ? 1.2 : -1.2;
    const lx = l[0] + outward, lz = l[2];
    return {
      x: tiger.pos.x + lx * c + lz * s,
      y: tiger.pos.y,
      z: tiger.pos.z - lx * s + lz * c,
    };
  }

  _hatchWorldPos(tiger, hatchId) {
    const h = tiger.spec.HATCHES?.[hatchId];
    const l = h ? h.pos : [0, 1.75, 0];
    const c = Math.cos(tiger.heading), s = Math.sin(tiger.heading);
    return {
      x: tiger.pos.x + l[0] * c + l[2] * s,
      y: tiger.pos.y,
      z: tiger.pos.z - l[0] * s + l[2] * c,
    };
  }

  // ---- Aborting ------------------------------------------------------------

  /** "Abort repair — get back in." */
  abort(tiger) {
    if (!this.active) return { ok: false, reason: 'No repair under way.' };
    const job = this.job;
    job.interrupted = true;
    job.state = REPAIR_STATE.RETURNING;
    for (const m of job.crewmen) {
      const d = this.world.dismounts.find((x) => x.man === m);
      if (d) {
        d.target = this._hatchWorldPos(tiger, tiger.spec.STATIONS[m.role]?.hatch);
        d.running = true;
        d.state = 'returning';
      }
      tiger.crewManager.speak(m, 'repair.abort', {}, true);
    }
    this.bus?.emit('repair:aborted', { progress: job.progress, component: job.componentSpec.label });
    return { ok: true, progressKept: this._progressRetained(job) };
  }

  /**
   * How much of an interrupted repair survives?
   * A half-fitted track is worse than an unbroken one — you have pulled the pins
   * out. Optics work is a swap, so it keeps its progress fine.
   */
  _progressRetained(job) {
    const id = job.componentId;
    if (id.startsWith('track')) return job.progress * 0.35;
    if (id.includes('sight') || id.includes('optics') || id === 'radio') return job.progress * 0.9;
    return job.progress * 0.6;
  }

  // ---- Update --------------------------------------------------------------

  update(dt, tiger) {
    // Driving to cover.
    if (this.coverOrder && !this.coverOrder.arrived) {
      const c = this.coverOrder.pos;
      const d = Math.hypot(tiger.pos.x - c.x, tiger.pos.z - c.z);
      if (d < 14) {
        this.coverOrder.arrived = true;
        tiger.hullDown = !!this.coverOrder.hullDown;
        tiger.crewManager?.say('driver', 'driver.in_cover', {}, true);
        this.bus?.emit('repair:in_cover', { hullDown: tiger.hullDown, fullDefilade: this.coverOrder.fullDefilade });
      } else if (this.world.time - this.coverOrder.startedAt > 90) {
        this.coverOrder.arrived = true;   // he did his best
        this.bus?.emit('repair:cover_timeout', {});
      }
    }

    if (!this.active) return;
    const job = this.job;

    switch (job.state) {
      case REPAIR_STATE.DISMOUNTING: {
        // Wait for everyone to physically get out of their hatches.
        let allOut = true;
        for (const m of job.crewmen) {
          const d = this.world.dismounts.find((x) => x.man === m);
          if (!d) continue;
          if (d.exitDelay > 0) { d.exitDelay -= dt; allOut = false; }
        }
        if (allOut) job.state = REPAIR_STATE.WALKING;
        break;
      }

      case REPAIR_STATE.WALKING: {
        const arrived = job.crewmen.every((m) => {
          const d = this.world.dismounts.find((x) => x.man === m);
          return !d || d.state === 'arrived';
        });
        if (arrived) {
          job.state = REPAIR_STATE.WORKING;
          const first = job.crewmen[0];
          tiger.crewManager.speak(first, 'repair.starting', {}, true);
        }
        break;
      }

      case REPAIR_STATE.WORKING: {
        // Anyone hit, dead or run off stops contributing.
        const working = job.crewmen.filter((m) => m.canWork && m.outsideTank);
        if (!working.length) {
          job.state = REPAIR_STATE.ABORTED;
          this.bus?.emit('repair:failed', { reason: 'The repair party is down.' });
          break;
        }

        // Rate scales with who is still standing and how frightened they are.
        let rate = 0;
        for (const m of working) {
          const apt = ROLE_APTITUDE[m.role] || {};
          const aptitude = apt[job.componentId] ?? apt.default ?? 1;
          rate += (0.45 + clamp01(m.skill.repair ?? m.experience) * 0.85)
            * aptitude * clamp(m.effectiveness, 0.1, 1.3);
          m.addFatigue(dt * 0.011);
          // Being shot at while kneeling beside a track is not conducive to work.
          if (m.stress > 0.6 && this.rng.next() < dt * 0.15) {
            tiger.crewManager.speak(m, 'repair.under_fire');
          }
        }
        const hands = Math.pow(working.length, 0.72) / Math.max(1, working.length);
        rate *= hands;

        job.elapsed += dt * rate;
        job.progress = clamp01(job.elapsed / job.totalSeconds);

        // Subtle progress reports over the intercom. No giant progress bar.
        if (this.world.time - job.lastReportAt > 22) {
          job.lastReportAt = this.world.time;
          const m = this.rng.pick(working);
          tiger.crewManager.speak(m, job.progress > 0.78 ? 'repair.nearly' : 'repair.progress');
        }

        if (job.progress >= 1) this._finish(tiger, job);
        break;
      }

      case REPAIR_STATE.RETURNING: {
        const back = job.crewmen.every((m) => {
          const d = this.world.dismounts.find((x) => x.man === m);
          return !d || d.state === 'arrived' || d.state === 'returning' && this._atHatch(tiger, d);
        });
        if (back) {
          job.state = REPAIR_STATE.MOUNTING;
          job.mountTimer = Math.max(...job.crewmen.map((m) => tiger.spec.STATIONS[m.role]?.exitTimeS ?? 4));
        }
        break;
      }

      case REPAIR_STATE.MOUNTING: {
        job.mountTimer -= dt;
        if (job.mountTimer <= 0) {
          for (const m of job.crewmen) {
            this.world.removeDismount(m);
            m.busyWith = null;
          }
          job.state = job.interrupted ? REPAIR_STATE.ABORTED : REPAIR_STATE.COMPLETE;
          this.bus?.emit('repair:crew_aboard', { aborted: job.interrupted });
          this.job = job.interrupted ? null : this.job;
        }
        break;
      }
      default: break;
    }
  }

  _atHatch(tiger, d) {
    const h = this._hatchWorldPos(tiger, tiger.spec.STATIONS[d.man.role]?.hatch);
    return Math.hypot(d.pos.x - h.x, d.pos.z - h.z) < 2.0;
  }

  _finish(tiger, job) {
    const st = tiger.components[job.componentId];
    if (st) { st.destroyed = false; st.disabled = false; st.damage = 0; }

    // Consume the parts. They are gone from the company's stores for good.
    for (const [part, n] of Object.entries(job.componentSpec.partsNeeded || {})) {
      if (this.logistics?.spares) {
        this.logistics.spares[part] = Math.max(0, (this.logistics.spares[part] ?? 0) - n);
      }
    }
    for (const m of job.crewmen) m.repairsCompleted++;

    const speaker = job.crewmen.find((m) => m.canWork) || job.crewmen[0];
    tiger.crewManager.speak(speaker, 'repair.done', {}, true);
    this.bus?.emit('repair:complete', {
      component: job.componentSpec.label,
      componentId: job.componentId,
      seconds: this.world.time - job.startedAt,
    });

    job.state = REPAIR_STATE.RETURNING;
    for (const m of job.crewmen) {
      const d = this.world.dismounts.find((x) => x.man === m);
      if (d) {
        d.target = this._hatchWorldPos(tiger, tiger.spec.STATIONS[m.role]?.hatch);
        d.state = 'returning';
      }
    }
  }

  /** Short status line for the HUD. No percentages, no bar. */
  statusLine() {
    if (!this.job) return null;
    const j = this.job;
    switch (j.state) {
      case REPAIR_STATE.DISMOUNTING: return `${j.componentSpec.label}: crew dismounting`;
      case REPAIR_STATE.WALKING: return `${j.componentSpec.label}: crew moving to the damage`;
      case REPAIR_STATE.WORKING:
        return j.progress > 0.8 ? `${j.componentSpec.label}: repair nearly complete`
          : j.progress > 0.4 ? `${j.componentSpec.label}: repair under way`
            : `${j.componentSpec.label}: repair begun`;
      case REPAIR_STATE.RETURNING: return `${j.componentSpec.label}: crew returning`;
      case REPAIR_STATE.MOUNTING: return 'crew climbing back in';
      default: return null;
    }
  }
}
