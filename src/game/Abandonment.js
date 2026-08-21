// ===========================================================================
//  ABANDON TANK
//
//  The most consequential order in the game, and deliberately not a
//  mission-failure button. It is a decision to trade the Tiger for the men.
//
//  The crew does not vanish. Each man stops what he is doing, gets to a hatch,
//  opens it, hauls himself out, drops off the hull and runs. That takes time.
//  If the tank is burning, the ammunition is cooking, or somebody is shooting
//  at the hull, that time is when people die.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';
import { HEALTH_STATE } from '../sim/CrewSim.js';

export const EVAC_STAGE = {
  NONE: 'none',
  ORDERED: 'ordered',
  EVACUATING: 'evacuating',
  CLEAR_OF_TANK: 'clear of the tank',
  SEEKING_COVER: 'making for cover',
  COMPLETE: 'complete',
};

/** Each man's own escape. */
class Escape {
  constructor(man, station, hatches) {
    this.man = man;
    this.station = station;
    // Preferred hatch, then the alternatives a real crew would use.
    this.hatchOrder = [station.hatch, 'escape_hatch', 'floor_hatch', 'loader_hatch', 'cupola_hatch']
      .filter((h, i, a) => h && a.indexOf(h) === i && hatches[h]);
    this.hatchIndex = 0;
    this.stage = 'starting';
    this.timer = 0;
    this.attempts = 0;
    this.out = false;
  }
  get hatch() { return this.hatchOrder[this.hatchIndex]; }
}

export class Abandonment {
  constructor({ world, bus, rng, difficulty }) {
    this.world = world;
    this.bus = bus;
    this.rng = rng;
    this.difficulty = difficulty || {};
    this.stage = EVAC_STAGE.NONE;
    this.escapes = [];
    this.orderedAt = -1;
    this.coverPoint = null;
    this.commanderEscape = null;
  }

  get active() { return this.stage !== EVAC_STAGE.NONE && this.stage !== EVAC_STAGE.COMPLETE; }

  /** "ABANDON TANK!" */
  order(tiger, commanderMan) {
    if (this.active) return { ok: false, reason: 'Already evacuating.' };

    this.stage = EVAC_STAGE.ORDERED;
    this.orderedAt = this.world.time;
    tiger.abandoned = true;
    tiger.abandonedAt = { x: tiger.pos.x, y: tiger.pos.y, z: tiger.pos.z };

    // Everyone hears it and everyone reacts. Panic is contagious.
    tiger.crewManager?.registerIncoming('abandon', 1);
    const shouter = tiger.crewManager?.get('gunner') || tiger.crewManager?.crew.find((m) => m.canWork);
    if (shouter) tiger.crewManager.speak(shouter, 'abandon.order', {}, true);

    // Somewhere to run to. A ditch, a balka, a fold in the ground.
    this.coverPoint = this._findRunningCover(tiger);

    // Build an escape for every man still capable of moving.
    this.escapes = [];
    const all = [...(tiger.crew || [])];
    for (const man of all) {
      if (man.state === HEALTH_STATE.DEAD) continue;
      const station = tiger.spec.STATIONS[man.role];
      if (!station) continue;
      const e = new Escape(man, station, tiger.spec.HATCHES);
      // An incapacitated man cannot get himself out. Somebody has to pull him,
      // and that costs time the others may not have.
      e.needsHelp = man.state === HEALTH_STATE.INCAPACITATED;
      this.escapes.push(e);
      if (man.role === 'commander') this.commanderEscape = e;
    }

    // Order of exit: doctrine is turret crew first through the top, hull crew
    // through their own hatches, commander last if he can manage it.
    const priority = { loader: 0, gunner: 1, driver: 1, radio: 1, commander: 2 };
    this.escapes.sort((a, b) => (priority[a.man.role] ?? 1) - (priority[b.man.role] ?? 1));

    this.stage = EVAC_STAGE.EVACUATING;
    this.bus?.emit('abandon:ordered', {
      crew: this.escapes.length,
      burning: !!tiger.fire?.active,
      cookingOff: tiger.fire?.stage === 'cooking_off',
    });
    return { ok: true, evacuating: this.escapes.length };
  }

  _findRunningCover(tiger) {
    const threat = this.world.spotting.hostile()[0]?.lastKnownPos
      || { x: tiger.pos.x, z: tiger.pos.z + 500 };
    const c = this.world.terrain.findCover(tiger.pos.x, tiger.pos.z, threat.x, threat.z, 160, 1.8);
    if (c) return c;
    // Nothing but open ground: run directly away from the threat and hope.
    const dx = tiger.pos.x - threat.x, dz = tiger.pos.z - threat.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: tiger.pos.x + (dx / d) * 120, z: tiger.pos.z + (dz / d) * 120 };
  }

  update(dt, tiger) {
    if (!this.active) return;

    const fire = tiger.fire;
    const burning = fire?.active;
    const cooking = fire?.stage === 'cooking_off';

    for (const e of this.escapes) {
      if (e.out || e.man.state === HEALTH_STATE.DEAD) continue;
      e.timer -= dt;

      switch (e.stage) {
        case 'starting': {
          // He stops doing his job and turns to the hatch.
          e.man.busyWith = 'abandoning';
          // A frightened man moves faster; a wounded one much slower.
          const panic = 1 - clamp01(e.man.stress) * 0.25;
          const wound = clamp(e.man.effectiveness, 0.2, 1.2);
          e.timer = 1.2 * panic / wound;
          e.stage = 'reaching_hatch';
          break;
        }

        case 'reaching_hatch': {
          if (e.timer > 0) break;
          const hatch = tiger.spec.HATCHES[e.hatch];
          if (!hatch) { e.stage = 'stuck'; break; }
          // Is it jammed? A hit near a hatch, or a burning tank warping the
          // plate, will do that. This is the classic way tank crews died.
          const jamChance = clamp01(
            (tiger.components[`hatch_${e.hatch}`]?.destroyed ? 1 : 0)
            + (burning ? 0.10 * fire.severity : 0)
            + (tiger.hitLog.length > 3 ? 0.04 : 0));
          e.attempts++;
          if (this.rng.next() < jamChance && e.attempts < 3) {
            tiger.crewManager?.speak(e.man, 'abandon.hatch_stuck', {}, true);
            // Try the next hatch on his list.
            e.hatchIndex = Math.min(e.hatchIndex + 1, e.hatchOrder.length - 1);
            e.timer = 2.4;
            break;
          }
          e.timer = hatch.openTimeS * (e.needsHelp ? 2.6 : 1);
          e.stage = 'opening';
          tiger.hatchOpen[e.hatch] = true;
          break;
        }

        case 'opening': {
          if (e.timer > 0) break;
          // Climbing out of a Tiger is genuinely awkward, especially the gunner,
          // who has no hatch of his own.
          e.timer = (e.station.exitTimeS ?? 4) * (e.needsHelp ? 2.2 : 1)
            / clamp(e.man.effectiveness, 0.25, 1.2);
          e.stage = 'climbing';
          break;
        }

        case 'climbing': {
          // While he is half out of the hatch he is exposed to everything.
          if (burning) {
            e.man.health = clamp01(e.man.health - fire.severity * 0.045 * dt);
            e.man._recomputeState?.();
          }
          if (e.timer > 0) break;

          // He is out and on the hull.
          e.out = true;
          e.man.busyWith = null;
          const d = this.world.addDismount(e.man, { ...tiger.pos }, 'abandon');
          d.target = { x: this.coverPoint.x, z: this.coverPoint.z, y: tiger.pos.y };
          d.running = true;
          d.speed = 2.1;
          tiger.crewManager?.speak(e.man, 'abandon.out', {}, true);
          this.bus?.emit('abandon:man_out', {
            name: e.man.name, role: e.man.role,
            seconds: this.world.time - this.orderedAt,
          });
          break;
        }

        case 'stuck': {
          // He cannot get out. If it is burning, this is how it ends.
          if (burning) {
            e.man.health = clamp01(e.man.health - fire.severity * 0.10 * dt);
            e.man._recomputeState?.();
          }
          if (e.timer <= 0) { e.stage = 'reaching_hatch'; e.timer = 1; }
          break;
        }
        default: break;
      }

      // Anyone still inside a cooking-off tank is in mortal danger.
      if (!e.out && cooking && fire.cookOffTimer <= 0) {
        e.man.wound(1.0, 'ammunition detonation');
        this.bus?.emit('abandon:killed_inside', { name: e.man.name, role: e.man.role });
      }
    }

    // Are they all out (or beyond help)?
    const remaining = this.escapes.filter((e) => !e.out && e.man.state !== HEALTH_STATE.DEAD);
    if (!remaining.length && this.stage === EVAC_STAGE.EVACUATING) {
      this.stage = EVAC_STAGE.SEEKING_COVER;
      this.bus?.emit('abandon:all_out', {
        seconds: this.world.time - this.orderedAt,
        survivors: this.escapes.filter((e) => e.man.state !== HEALTH_STATE.DEAD).length,
      });
      const speaker = this.escapes.find((e) => e.man.canWork);
      if (speaker) tiger.crewManager?.speak(speaker.man, 'abandon.moving_to_cover', {}, true);
    }

    if (this.stage === EVAC_STAGE.SEEKING_COVER) {
      const inCover = this.escapes.every((e) => {
        if (e.man.state === HEALTH_STATE.DEAD) return true;
        const d = this.world.dismounts.find((x) => x.man === e.man);
        return !d || d.state === 'arrived';
      });
      if (inCover) {
        this.stage = EVAC_STAGE.COMPLETE;
        this.bus?.emit('abandon:complete', this.summary(tiger));
      }
    }
  }

  /** The after-action record. This is what the campaign remembers. */
  summary(tiger) {
    const crew = this.escapes.map((e) => ({
      name: e.man.name, rank: e.man.rank, role: e.man.role,
      outcome: e.man.state === HEALTH_STATE.DEAD ? 'killed'
        : e.man.state === HEALTH_STATE.INCAPACITATED ? 'gravely wounded'
          : e.man.state === HEALTH_STATE.SERIOUS ? 'seriously wounded'
            : e.man.state === HEALTH_STATE.WOUNDED ? 'wounded'
              : 'survived',
      gotOut: e.out,
    }));
    return {
      evacuationSeconds: this.world.time - this.orderedAt,
      crew,
      survived: crew.filter((c) => c.outcome !== 'killed').length,
      killed: crew.filter((c) => c.outcome === 'killed').length,
      wounded: crew.filter((c) => /wounded/.test(c.outcome)).length,
      tankBurning: !!tiger.fire?.active,
      tankDestroyed: !!tiger.destroyed || !!tiger.ammoDetonated,
      position: { ...tiger.pos },
    };
  }

  statusLine() {
    if (!this.active) return null;
    const out = this.escapes.filter((e) => e.out).length;
    return `Abandoning — ${out} of ${this.escapes.length} out`;
  }
}
