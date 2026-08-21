// ===========================================================================
//  SPOTTING AND IDENTIFICATION
//
//  There is no omniscient enemy marker anywhere in this game. A contact exists
//  in the player's world only when somebody — the player, a crewman, another
//  tank, or battalion — actually saw or heard something and reported it.
//
//  Identification is a PROGRESSION, not a fact:
//     movement -> vehicle -> tank -> Soviet medium tank -> T-34
//  and it can be WRONG. An SU-122 at 1600 m in heat haze is reported as an
//  SU-152 by a tired gunner often enough that you learn to check.
// ===========================================================================

import { clamp, clamp01, DEG, RAD, normalizeAngle, angleDelta, bearingToClock, callRange } from '../core/MathUtil.js';
import { IDENTIFICATION_STAGES, CONFUSION } from '../data/vehicles.js';

export const CONTACT_SOURCE = {
  COMMANDER: 'commander',
  CREW: 'crew',
  RADIO: 'radio',
  SOUND: 'sound',
  MUZZLE_FLASH: 'muzzle flash',
  DUST: 'dust',
};

/** One thing somebody thinks is out there. It may be stale, wrong, or gone. */
export class Contact {
  constructor(id, worldPos, source) {
    this.id = id;
    this.targetId = null;         // the real vehicle, if we are actually tracking it
    this.lastKnownPos = { ...worldPos };
    this.lastSeen = 0;
    this.firstSeen = 0;
    this.source = source;
    this.idLevel = 0;             // index into IDENTIFICATION_STAGES
    this.believedType = null;     // what we THINK it is — may be wrong
    this.actualType = null;
    this.misidentified = false;
    this.confidence = 0.1;
    this.hostile = true;
    this.engaged = false;
    this.destroyedBelief = false;
    this.reportedBy = source;
    this.stale = false;
    this.bearingHistory = [];
  }

  get label() {
    const stages = IDENTIFICATION_STAGES[this.believedType || this.actualType];
    if (!stages) return 'unknown contact';
    return stages[clamp(this.idLevel, 0, stages.length - 1)];
  }

  get identified() { return this.idLevel >= 4; }
}

export class SpottingSystem {
  constructor(bus, rng, terrain) {
    this.bus = bus;
    this.rng = rng;
    this.terrain = terrain;
    this.contacts = new Map();
    this.time = 0;
    this.nextId = 1;
  }

  clear() { this.contacts.clear(); }

  /**
   * How visible is `target` from `observer`, right now?
   * Returns 0..1. Range, light, weather, movement, dust, exposure and the
   * target's own concealment all bear on it.
   */
  visibility(observer, target, env = {}) {
    const dx = target.pos.x - observer.pos.x;
    const dy = (target.pos.y + 1.2) - (observer.pos.y + observer.eyeHeight);
    const dz = target.pos.z - observer.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1) return 1;

    // Line of sight through terrain.
    if (this.terrain && !this.terrain.lineOfSight(
      observer.pos.x, observer.pos.y + observer.eyeHeight, observer.pos.z,
      target.pos.x, target.pos.y + 1.2, target.pos.z)) return 0;

    // Field of view.
    const bearing = Math.atan2(dx, dz);
    const rel = Math.abs(angleDelta(observer.viewAzimuth ?? 0, bearing));
    const halfFov = (observer.fovDeg ?? 60) * DEG / 2;
    if (rel > halfFov * 1.05) return 0;
    // Things at the edge of the vision block are much harder to notice.
    const edgeFalloff = clamp01(1 - Math.max(0, rel - halfFov * 0.55) / (halfFov * 0.5));

    // Angular size. A Tiger at 2000 m subtends about 1.5 milliradians of height.
    const height = target.spec?.dims?.height ?? 2.5;
    const width = target.spec?.dims?.width ?? 3.0;
    const angular = (height * width) / (dist * dist);
    let v = clamp01(Math.log10(1 + angular * 4.2e5) / 2.6);

    // Magnification: binoculars and the TZF make distant things findable.
    const mag = observer.magnification ?? 1;
    if (mag > 1) v = clamp01(v * (1 + Math.log2(mag) * 0.55));

    // Light and weather.
    v *= env.lightFactor ?? 1;
    v *= env.visibilityFactor ?? 1;

    // Movement gives you away — and a Kursk dust plume gives you away from miles off.
    const speed = Math.hypot(target.vel?.x || 0, target.vel?.z || 0);
    if (speed > 0.6) v *= 1 + clamp(speed / 8, 0, 0.9);
    if (target.dustLevel > 0.2) v *= 1 + target.dustLevel * 1.5;
    if (target.fire?.active) v *= 2.4;
    if (target.smokeScreen > 0) v *= 0.22;

    // Concealment: a dug-in ZiS-3 in a tree line is very nearly invisible.
    v *= 1 - (target.spec?.concealment ?? 0);
    if (target.hullDown) v *= 0.42;
    if (target.spec?.static && speed < 0.1) v *= 0.55;

    // Firing is the single loudest thing you can do.
    if (target.justFired > 0) v *= 3.5;

    // The observer's own state.
    v *= observer.acuity ?? 1;

    return clamp01(v * edgeFalloff);
  }

  /**
   * Run one detection tick for an observer against a set of targets.
   * @returns {Contact[]} contacts that were newly created or upgraded
   */
  observe(observer, targets, dt, env = {}) {
    const changed = [];
    for (const t of targets) {
      if (t.destroyed && !t.burning) continue;
      const v = this.visibility(observer, t, env);
      if (v <= 0.002) continue;

      const key = t.id;
      let contact = this.contacts.get(key);

      // Detection is a Poisson process: the longer you look at something, the
      // more likely you are to notice it. This is why sitting still and
      // *searching* an arc works and sweeping wildly does not.
      const rate = v * 1.6 * (observer.searchFocus ?? 1);
      const pDetect = 1 - Math.exp(-rate * dt);

      if (!contact) {
        if (this.rng.next() < pDetect) {
          contact = new Contact(`k${this.nextId++}`, t.pos, observer.sourceKind || CONTACT_SOURCE.COMMANDER);
          contact.targetId = t.id;
          contact.actualType = t.spec.id;
          contact.believedType = t.spec.id;
          contact.firstSeen = this.time;
          contact.hostile = t.faction !== observer.faction;
          this.contacts.set(key, contact);
          changed.push(contact);
          this.bus?.emit('contact:new', { contact, observer: observer.name, visibility: v });
        }
        continue;
      }

      // Already have it: refresh position and try to identify it better.
      contact.lastKnownPos = { ...t.pos };
      contact.lastSeen = this.time;
      contact.stale = false;
      contact.confidence = clamp01(contact.confidence + v * dt * 0.9);

      const maxLevel = IDENTIFICATION_STAGES[contact.actualType]?.length ?? 5;
      if (contact.idLevel < maxLevel - 1) {
        // Identifying takes far longer than merely noticing, and depends on the
        // observer's training and optics.
        const idSkill = observer.identification ?? 0.4;
        const idRate = v * (0.28 + idSkill * 0.9) * (observer.magnification ?? 1) * 0.4;
        if (this.rng.next() < 1 - Math.exp(-idRate * dt)) {
          contact.idLevel++;
          // At the moment of calling the type, a poor observer at long range
          // can get it wrong — and will then believe the wrong thing.
          if (contact.idLevel >= 3 && !contact.misidentified) {
            const dist = Math.hypot(t.pos.x - observer.pos.x, t.pos.z - observer.pos.z);
            const difficulty = (t.spec.identifyDifficulty ?? 0.3)
              + clamp(dist / 3000, 0, 0.4)
              + (1 - (env.visibilityFactor ?? 1)) * 0.3;
            const pWrong = clamp01(difficulty * (1 - idSkill) * 0.85);
            if (this.rng.next() < pWrong) {
              const pool = CONFUSION[contact.actualType];
              if (pool?.length) {
                contact.believedType = this.rng.pick(pool);
                contact.misidentified = true;
              }
            }
          }
          changed.push(contact);
          this.bus?.emit('contact:identified', { contact, level: contact.idLevel, label: contact.label });
        }
      }
    }
    return changed;
  }

  /** A contact reported by someone else — the radio, another tank, or HQ. */
  reportContact(worldPos, source, believedType = null, idLevel = 2, accuracy = 1) {
    const jitter = (1 - accuracy) * 220;
    const pos = {
      x: worldPos.x + this.rng.range(-jitter, jitter),
      y: worldPos.y,
      z: worldPos.z + this.rng.range(-jitter, jitter),
    };
    const c = new Contact(`r${this.nextId++}`, pos, source);
    c.believedType = believedType;
    c.actualType = believedType;
    c.idLevel = idLevel;
    c.lastSeen = this.time;
    c.firstSeen = this.time;
    c.confidence = accuracy * 0.6;
    c.reportedBy = source;
    this.contacts.set(c.id, c);
    this.bus?.emit('contact:reported', { contact: c, source });
    return c;
  }

  /** Sound gives a bearing, not a position — and only roughly. */
  reportSound(fromPos, listenerPos, kind, accuracy) {
    const dx = fromPos.x - listenerPos.x;
    const dz = fromPos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);
    const trueBearing = Math.atan2(dx, dz);
    // Inside a buttoned-up Tiger you are lucky to get the right quadrant.
    const err = (1 - accuracy) * 55 * DEG;
    const bearing = trueBearing + this.rng.range(-err, err);
    // Distance from sound is a guess at best.
    const distGuess = dist * this.rng.range(0.55, 1.9);
    return {
      bearing,
      clock: bearingToClock(bearing),
      distance: distGuess,
      kind,
      accuracy,
      pos: {
        x: listenerPos.x + Math.sin(bearing) * distGuess,
        y: listenerPos.y,
        z: listenerPos.z + Math.cos(bearing) * distGuess,
      },
    };
  }

  update(dt) {
    this.time += dt;
    for (const c of this.contacts.values()) {
      const age = this.time - c.lastSeen;
      if (age > 6 && !c.stale) {
        c.stale = true;
        this.bus?.emit('contact:lost', { contact: c });
      }
      // A contact you have not seen for a long time becomes worthless.
      if (age > 20) c.confidence = clamp01(c.confidence - dt * 0.05);
    }
    // Drop contacts nobody believes in any more.
    for (const [k, c] of this.contacts) {
      if (c.stale && this.time - c.lastSeen > 150) this.contacts.delete(k);
    }
  }

  active() { return Array.from(this.contacts.values()).filter((c) => !c.destroyedBelief); }
  hostile() { return this.active().filter((c) => c.hostile); }
  fresh(maxAge = 8) { return this.active().filter((c) => this.time - c.lastSeen < maxAge); }

  /** Format a contact the way a crewman would call it over the intercom. */
  callOut(contact, observerPos, observerHeading) {
    const dx = contact.lastKnownPos.x - observerPos.x;
    const dz = contact.lastKnownPos.z - observerPos.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    const rel = normalizeAngle(bearing - observerHeading);
    return {
      clock: bearingToClock(rel),
      range: callRange(dist),
      type: contact.label,
      bearing: rel,
      distance: dist,
    };
  }
}

/**
 * Build an observer record for the commander given his current physical
 * position. This is the whole hatch trade-off expressed as numbers.
 */
export function commanderObserver(tiger, mode, crewman, env = {}) {
  const base = {
    name: 'commander',
    faction: 'german',
    pos: tiger.pos,
    sourceKind: CONTACT_SOURCE.COMMANDER,
    identification: clamp01((crewman?.skill?.identification ?? 0.5) * (crewman?.effectiveness ?? 1)),
    acuity: clamp01(0.55 + (crewman?.skill?.spotting ?? 0.5) * 0.5) * clamp01(crewman?.effectiveness ?? 1),
    viewAzimuth: tiger.heading + tiger.turretAz + (tiger.commanderLook ?? 0),
    searchFocus: 1,
  };

  switch (mode) {
    case 'head_out':
      // Head out of the hatch: the whole sky, both ears, and no protection.
      return { ...base, eyeHeight: 3.14, fovDeg: 200, magnification: 1, exposure: 1.0, hearing: 1.0 };
    case 'binoculars':
      // 6x30 service binoculars, head out. Superb reach, tunnel vision.
      return { ...base, eyeHeight: 3.14, fovDeg: 8.5, magnification: 6, exposure: 1.0, hearing: 1.0, searchFocus: 1.5 };
    case 'hatch_open':
      // Sitting up in an open hatch — head at the rim, not above it.
      return { ...base, eyeHeight: 2.95, fovDeg: 120, magnification: 1, exposure: 0.45, hearing: 0.75 };
    case 'vision_blocks':
    default:
      // Buttoned up. Five slits of laminated glass in a drum cupola.
      return {
        ...base,
        eyeHeight: 2.74,
        fovDeg: 60,
        magnification: 1,
        exposure: 0.0,
        hearing: 0.28,
        acuity: base.acuity * (tiger.components?.cupola_optics?.destroyed ? 0.25 : 0.62),
        searchFocus: 0.7,
      };
  }
}
