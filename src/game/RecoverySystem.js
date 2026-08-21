// ===========================================================================
//  BATTLEFIELD RECOVERY AND TOWING
//
//  A Tiger with a dead engine is 57 tonnes of stationary steel. Getting it home
//  means asking battalion for a recovery vehicle, waiting for it to arrive,
//  sending men out with a 30 mm steel cable, shackling up while somebody may be
//  shooting at them, and then crawling away at walking pace.
//
//  Nothing here teleports. Nothing here is instant.
//
//  Historical note: regulations required THREE Sd.Kfz. 9 half-tracks to move a
//  Tiger. Towing one Tiger with another was forbidden because it destroyed the
//  towing vehicle's final drives. The game lets you do it and applies that.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';
import { FAMO, VEHICLES } from '../data/vehicles.js';

export const RECOVERY_STATE = {
  NONE: 'none',
  REQUESTED: 'requested',
  DISPATCHED: 'dispatched',
  INBOUND: 'inbound',
  ARRIVED: 'arrived',
  CREW_OUT: 'crew dismounting',
  FETCHING_CABLE: 'fetching the cable',
  ATTACHING: 'attaching the cable',
  ATTACHED: 'cable attached',
  CREW_BACK: 'crew remounting',
  TOWING: 'under tow',
  COMPLETE: 'recovered',
  ABORTED: 'aborted',
  DENIED: 'denied',
};

export const CABLE_STATE = {
  STOWED: 'stowed',
  CARRIED: 'being carried',
  LOOSE: 'loose',
  ATTACHED: 'attached',
  DAMAGED: 'damaged',
  BROKEN: 'broken',
  DETACHED: 'detached',
};

export class RecoverySystem {
  constructor({ world, bus, rng, campaign, difficulty }) {
    this.world = world;
    this.bus = bus;
    this.rng = rng;
    this.campaign = campaign;
    this.difficulty = difficulty || {};

    this.state = RECOVERY_STATE.NONE;
    this.cable = CABLE_STATE.STOWED;
    this.cableCondition = 1.0;
    this.recoveryVehicle = null;
    this.recoveryAI = null;
    this.requestedAt = -1;
    this.arrivalAt = -1;
    this.attachProgress = 0;
    this.crewOut = [];
    this.towedDistance = 0;
    this.attempts = 0;
  }

  get active() {
    return this.state !== RECOVERY_STATE.NONE
      && this.state !== RECOVERY_STATE.COMPLETE
      && this.state !== RECOVERY_STATE.ABORTED
      && this.state !== RECOVERY_STATE.DENIED;
  }

  // ---- Can this even be towed? --------------------------------------------

  /**
   * Honest assessment. A tank with both tracks off cannot be towed anywhere,
   * and one that is burning should not be approached at all.
   */
  canBeTowed(tiger) {
    const problems = [];
    if (tiger.destroyed) problems.push('The tank is destroyed.');
    if (tiger.components.track_l?.destroyed && tiger.components.track_r?.destroyed) {
      problems.push('Both tracks are broken — it cannot roll.');
    }
    if (tiger.fire?.active && tiger.fire.severity > 0.35) {
      problems.push('It is burning. Nobody is going near it.');
    }
    if (tiger.ammoDetonated) problems.push('The ammunition has gone up.');
    return { ok: problems.length === 0, problems };
  }

  // ---- Requesting ---------------------------------------------------------

  /** "Radio, request recovery." */
  request(tiger, radioOperator) {
    if (this.active) return { ok: false, reason: 'A recovery is already under way.' };

    if (tiger.components.radio?.destroyed) {
      tiger.crewManager?.say('radio', 'radio.dead', {}, true);
      return { ok: false, reason: 'The radio is dead. Nobody can hear the request.' };
    }
    if (!radioOperator || !radioOperator.canWork) {
      return { ok: false, reason: 'There is nobody on the radio.' };
    }

    const check = this.canBeTowed(tiger);
    if (!check.ok) {
      return { ok: false, reason: check.problems.join(' ') };
    }

    this.attempts++;
    tiger.crewManager?.speak(radioOperator, 'radio.recovery_requested', {}, true);

    // Does battalion have anything to send? This depends on the campaign.
    const available = this.campaign?.logistics?.recoveryVehicles ?? 1;
    if (available <= 0) {
      this.state = RECOVERY_STATE.DENIED;
      setTimeout(() => {}, 0);
      this.bus?.emit('recovery:denied', { reason: 'No recovery vehicles available.' });
      tiger.crewManager?.speak(radioOperator, 'radio.recovery_denied', {}, true);
      return { ok: false, reason: 'Battalion has no recovery vehicle to send.' };
    }

    this.state = RECOVERY_STATE.REQUESTED;
    this.requestedAt = this.world.time;
    // It has to come from somewhere, and there is a battle on.
    const commsQuality = clamp01((radioOperator.skill.comms ?? radioOperator.experience) * radioOperator.effectiveness);
    const delay = this.rng.range(90, 260) * (1.5 - commsQuality * 0.5) * (this.difficulty.recoveryDelay ?? 1);
    this.arrivalAt = this.world.time + delay;

    this.bus?.emit('recovery:requested', { etaSeconds: delay });
    return { ok: true, etaSeconds: delay };
  }

  // ---- Update -------------------------------------------------------------

  update(dt, tiger) {
    if (!this.active) return;

    switch (this.state) {
      case RECOVERY_STATE.REQUESTED:
        if (this.world.time > this.requestedAt + 12) {
          this.state = RECOVERY_STATE.DISPATCHED;
          tiger.crewManager?.say('radio', 'radio.recovery_dispatched', {}, true);
          this.bus?.emit('recovery:dispatched', { etaSeconds: this.arrivalAt - this.world.time });
        }
        break;

      case RECOVERY_STATE.DISPATCHED:
        if (this.world.time > this.arrivalAt - 60) {
          this._spawnRecoveryVehicle(tiger);
          this.state = RECOVERY_STATE.INBOUND;
        }
        break;

      case RECOVERY_STATE.INBOUND: {
        const rv = this.recoveryVehicle;
        if (!rv || rv.destroyed) { this._fail('The recovery vehicle has been knocked out.'); break; }
        const d = Math.hypot(rv.pos.x - tiger.pos.x, rv.pos.z - tiger.pos.z);
        if (d < 22) {
          this.state = RECOVERY_STATE.ARRIVED;
          this.bus?.emit('recovery:arrived', { vehicle: rv.callsign });
        }
        break;
      }

      case RECOVERY_STATE.CREW_OUT: {
        const ready = this.crewOut.every((m) => {
          const dm = this.world.dismounts.find((x) => x.man === m);
          return !dm || dm.state === 'arrived';
        });
        if (ready) {
          this.state = RECOVERY_STATE.ATTACHING;
          this.cable = CABLE_STATE.CARRIED;
          const m = this.crewOut.find((x) => x.canWork);
          if (m) tiger.crewManager.speak(m, 'tow.attaching', {}, true);
        }
        break;
      }

      case RECOVERY_STATE.ATTACHING: {
        const working = this.crewOut.filter((m) => m.canWork && m.outsideTank);
        if (!working.length) {
          this._fail('The cable party is down.');
          break;
        }
        // Shackling a 30 mm cable to a 57-tonne tank is heavy, awkward work.
        let rate = 0;
        for (const m of working) {
          rate += (0.4 + clamp01(m.skill.repair ?? m.experience) * 0.8) * clamp(m.effectiveness, 0.1, 1.3);
          m.addFatigue(dt * 0.014);
        }
        const baseSeconds = 95 * (this.difficulty.repairTime ?? 1);
        this.attachProgress = clamp01(this.attachProgress + (dt * rate) / baseSeconds);

        if (this.attachProgress >= 1) {
          this.cable = CABLE_STATE.ATTACHED;
          this.state = RECOVERY_STATE.ATTACHED;
          const m = working[0];
          tiger.crewManager.speak(m, 'tow.attached', {}, true);
          this.bus?.emit('recovery:cable_attached', {});
          // Send them back in.
          this._recallCrew(tiger);
        }
        break;
      }

      case RECOVERY_STATE.CREW_BACK: {
        this.mountTimer = (this.mountTimer ?? 5) - dt;
        if (this.mountTimer <= 0) {
          for (const m of this.crewOut) { this.world.removeDismount(m); m.busyWith = null; }
          this.crewOut = [];
          this.state = RECOVERY_STATE.TOWING;
          tiger.beingTowed = this.recoveryVehicle;
          this.bus?.emit('recovery:towing_started', {});
          tiger.crewManager?.say('driver', 'tow.underway', {}, true);
        }
        break;
      }

      case RECOVERY_STATE.TOWING:
        this._updateTow(dt, tiger);
        break;

      default: break;
    }

    // The cable is a physical object that can be shot, and it can part under load.
    if (this.cable === CABLE_STATE.ATTACHED || this.cable === CABLE_STATE.DAMAGED) {
      this._updateCable(dt, tiger);
    }
  }

  _spawnRecoveryVehicle(tiger) {
    // Import lazily so this module has no hard dependency on the Vehicle class
    // at construction time.
    const rv = this.world.spawnSupportVehicle
      ? this.world.spawnSupportVehicle('famo', this._approachPoint(tiger))
      : null;
    if (!rv) { this._fail('No recovery vehicle could reach you.'); return; }
    this.recoveryVehicle = rv.vehicle;
    this.recoveryAI = rv.ai;
    // Approach from the friendly side, not across the enemy's front.
    this.recoveryAI?.dispatchTo(tiger.pos.x, tiger.pos.z - 18, true);
    this.bus?.emit('recovery:inbound', { callsign: this.recoveryVehicle.callsign });
  }

  _approachPoint(tiger) {
    // Come in from behind, away from where the shooting is.
    const threat = this.world.spotting.hostile()[0]?.lastKnownPos;
    let dx = 0, dz = -1;
    if (threat) {
      const d = Math.hypot(tiger.pos.x - threat.x, tiger.pos.z - threat.z) || 1;
      dx = (tiger.pos.x - threat.x) / d;
      dz = (tiger.pos.z - threat.z) / d;
    }
    return {
      x: clamp(tiger.pos.x + dx * 750, -this.world.terrain.half + 60, this.world.terrain.half - 60),
      z: clamp(tiger.pos.z + dz * 750, -this.world.terrain.half + 60, this.world.terrain.half - 60),
    };
  }

  /** The commander sends men out with the cable. This is the dangerous part. */
  beginAttachment(tiger, roles = ['loader', 'radio']) {
    if (this.state !== RECOVERY_STATE.ARRIVED) {
      return { ok: false, reason: 'The recovery vehicle is not in position yet.' };
    }
    if (tiger.components.tow_gear?.destroyed) {
      return { ok: false, reason: 'The towing shackles and cables are shot away.' };
    }

    const men = roles.map((r) => tiger.crewManager?.byRole(r)).filter((m) => m && m.canWork && !m.outsideTank);
    if (!men.length) return { ok: false, reason: 'Nobody can go out.' };

    this.crewOut = men;
    this.attachProgress = 0;
    this.state = RECOVERY_STATE.CREW_OUT;

    // Halfway between the Tiger's rear and the Famo's nose.
    const rv = this.recoveryVehicle;
    const target = {
      x: (tiger.pos.x + rv.pos.x) / 2,
      y: tiger.pos.y,
      z: (tiger.pos.z + rv.pos.z) / 2,
    };
    for (const m of men) {
      const d = this.world.addDismount(m, { ...tiger.pos }, 'tow');
      d.target = target;
      d.speed = 1.4;
      m.busyWith = 'towing';
      tiger.crewManager.speak(m, 'repair.acknowledge', {}, true);
    }
    this.bus?.emit('recovery:crew_out', { crew: men.map((m) => m.name) });
    return { ok: true, crew: men.map((m) => ({ name: m.name, role: m.role })) };
  }

  _recallCrew(tiger) {
    this.state = RECOVERY_STATE.CREW_BACK;
    this.mountTimer = 6;
    for (const m of this.crewOut) {
      const d = this.world.dismounts.find((x) => x.man === m);
      if (d) { d.target = { ...tiger.pos }; d.running = true; }
    }
  }

  _updateTow(dt, tiger) {
    const rv = this.recoveryVehicle;
    if (!rv || rv.destroyed) { this._fail('The recovery vehicle has been knocked out.'); return; }
    if (this.cable === CABLE_STATE.BROKEN) return;

    // The Famo drags the Tiger. Slowly.
    const dx = rv.pos.x - tiger.pos.x, dz = rv.pos.z - tiger.pos.z;
    const dist = Math.hypot(dx, dz);
    const cableLength = 16;

    if (dist > cableLength) {
      // The cable is taut and pulling.
      const pull = clamp((dist - cableLength) / 6, 0, 1);
      const towSpeed = 2.2 * pull * (this.cableCondition);     // ~8 km/h, and that is optimistic
      tiger.pos.x += (dx / dist) * towSpeed * dt;
      tiger.pos.z += (dz / dist) * towSpeed * dt;
      tiger.heading = Math.atan2(dx, dz);
      this.towedDistance += towSpeed * dt;

      // Load on the cable. Soft ground and a snatch will part a cable.
      const resistance = this.world.terrain.resistanceAt(tiger.pos.x, tiger.pos.z);
      const strain = pull * (0.4 + resistance) * dt;
      this.cableCondition = clamp01(this.cableCondition - strain * 0.010);
    }

    // Have we got clear?
    const nearestEnemy = this.world.vehicles
      .filter((v) => v.faction === 'soviet' && !v.destroyed)
      .reduce((min, v) => Math.min(min, Math.hypot(v.pos.x - tiger.pos.x, v.pos.z - tiger.pos.z)), Infinity);
    if (this.towedDistance > 400 && nearestEnemy > 900) {
      this.state = RECOVERY_STATE.COMPLETE;
      tiger.beingTowed = null;
      this.bus?.emit('recovery:complete', { distance: this.towedDistance });
    }
  }

  _updateCable(dt, tiger) {
    if (this.cableCondition < 0.55 && this.cable !== CABLE_STATE.DAMAGED) {
      this.cable = CABLE_STATE.DAMAGED;
      this.bus?.emit('recovery:cable_damaged', {});
    }
    if (this.cableCondition <= 0.02) {
      this.cable = CABLE_STATE.BROKEN;
      tiger.beingTowed = null;
      this.state = RECOVERY_STATE.ARRIVED;   // back to needing men outside again
      this.attachProgress = 0;
      this.cableCondition = 0.7;             // what is left of it
      tiger.crewManager?.say('loader', 'tow.broken', {}, true);
      this.bus?.emit('recovery:cable_broken', {});
    }
  }

  /** A shell or a burst that catches the cable or the recovery vehicle. */
  damageCable(amount) {
    this.cableCondition = clamp01(this.cableCondition - amount);
    if (this.cableCondition < 0.55) this.cable = CABLE_STATE.DAMAGED;
  }

  abort(tiger) {
    if (!this.active) return { ok: false };
    // Get the men back in first, whatever else happens.
    if (this.crewOut.length) this._recallCrew(tiger);
    else {
      this.state = RECOVERY_STATE.ABORTED;
      tiger.beingTowed = null;
    }
    this.bus?.emit('recovery:aborted', {});
    return { ok: true };
  }

  _fail(reason) {
    this.state = RECOVERY_STATE.ABORTED;
    this.bus?.emit('recovery:failed', { reason });
  }

  statusLine() {
    switch (this.state) {
      case RECOVERY_STATE.REQUESTED: return 'Recovery requested';
      case RECOVERY_STATE.DISPATCHED: {
        const eta = Math.max(0, this.arrivalAt - this.world.time);
        return `Recovery vehicle dispatched — ${Math.ceil(eta / 60)} min`;
      }
      case RECOVERY_STATE.INBOUND: return 'Recovery vehicle inbound';
      case RECOVERY_STATE.ARRIVED: return 'Recovery vehicle in position — send men out with the cable';
      case RECOVERY_STATE.CREW_OUT: return 'Cable party dismounting';
      case RECOVERY_STATE.ATTACHING: return this.attachProgress > 0.7 ? 'Cable nearly on' : 'Shackling the cable';
      case RECOVERY_STATE.ATTACHED: return 'Cable attached';
      case RECOVERY_STATE.CREW_BACK: return 'Cable party remounting';
      case RECOVERY_STATE.TOWING:
        return this.cable === CABLE_STATE.DAMAGED ? 'Under tow — the cable is fraying' : 'Under tow';
      case RECOVERY_STATE.COMPLETE: return 'Recovered';
      default: return null;
    }
  }
}
