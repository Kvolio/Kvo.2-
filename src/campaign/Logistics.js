// ===========================================================================
//  COMPANY LOGISTICS
//
//  The Tiger does not arrive at each mission full. It arrives with whatever the
//  company actually has, which depends on what you spent last time, whether the
//  supply column got through, and how the campaign is going.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';

export const SPARE_PARTS = {
  trackLinks: { label: 'track links', unit: 'links' },
  roadWheels: { label: 'road wheels', unit: 'wheels' },
  towCables: { label: 'tow cables', unit: 'cables' },
  optics: { label: 'optical assemblies', unit: 'units' },
  tools: { label: 'tool sets', unit: 'sets' },
  finalDrives: { label: 'final drives', unit: 'units' },
};

export class Logistics {
  constructor(rng, difficulty = {}) {
    this.rng = rng;
    this.difficulty = difficulty;
    const s = difficulty.supplyMultiplier ?? 1;
    const sp = difficulty.sparesMultiplier ?? 1;

    // Opening stocks for a heavy tank company in the salient, July 1943.
    this.ammunition = {
      pzgr39: Math.round(280 * s),
      sprgr39: Math.round(240 * s),
      nbgr: Math.round(40 * s),
      // PzGr 40 was effectively unobtainable at Kursk. This is deliberate.
      pzgr40: this.rng.bool(0.25 * s) ? this.rng.int(2, 6) : 0,
      gr39hl: Math.round(12 * s),
    };
    this.mgAmmo = Math.round(28000 * s);
    this.fuelL = Math.round(4200 * s);

    this.spares = {
      trackLinks: Math.round(46 * sp),
      roadWheels: Math.round(9 * sp),
      towCables: Math.round(5 * sp),
      optics: Math.round(4 * sp),
      tools: Math.round(6 * sp),
      finalDrives: Math.round(2 * sp),
    };

    this.recoveryVehicles = Math.max(1, Math.round(3 * (difficulty.supplyMultiplier ?? 1)));
    this.supplyLineHealth = 1.0;      // 0..1 — degrades with losses
    this.pendingConvoys = [];
    this.history = [];
  }

  /**
   * What the Tiger can actually be given for the next mission.
   * If the company only has forty rounds of AP, that is what you get.
   */
  availableFor(capacity = 92) {
    const out = {};
    for (const [k, v] of Object.entries(this.ammunition)) out[k] = v;
    return { ammunition: out, capacity, fuelL: this.fuelL, spares: { ...this.spares } };
  }

  /** Apply a chosen loadout, deducting it from the company's stock. */
  issueLoadout(loadout) {
    const issued = {};
    const shortfalls = [];
    for (const [k, want] of Object.entries(loadout)) {
      const have = this.ammunition[k] ?? 0;
      const give = Math.min(want, have);
      issued[k] = give;
      this.ammunition[k] = have - give;
      if (give < want) shortfalls.push({ nature: k, wanted: want, got: give });
    }
    return { issued, shortfalls };
  }

  /** Fuel a Tiger. This takes time in the world, not here. */
  issueFuel(litres) {
    const give = Math.min(litres, this.fuelL);
    this.fuelL -= give;
    return give;
  }

  returnUnused(ammo, fuelL) {
    for (const [k, v] of Object.entries(ammo || {})) {
      this.ammunition[k] = (this.ammunition[k] ?? 0) + v;
    }
    this.fuelL += Math.max(0, fuelL || 0);
  }

  consumeSpares(parts) {
    for (const [k, n] of Object.entries(parts || {})) {
      this.spares[k] = Math.max(0, (this.spares[k] ?? 0) - n);
    }
  }

  /**
   * Between missions: convoys arrive, or they do not. The supply situation
   * responds to how the campaign is going — but never so far that it becomes
   * unrecoverable.
   */
  resupply(campaignState) {
    const events = [];
    const health = this.supplyLineHealth;
    const s = this.difficulty.supplyMultiplier ?? 1;

    // Did the ammunition column get through?
    const ammoRoll = this.rng.next();
    if (ammoRoll < 0.14 * (2 - health)) {
      events.push({
        kind: 'convoy_lost', severity: 'bad',
        text: 'An ammunition column was caught on the road by Sturmovik. Nothing arrived.',
      });
      this.supplyLineHealth = clamp01(health - 0.08);
    } else if (ammoRoll > 0.80) {
      const bonus = Math.round(this.rng.range(60, 130) * s * health);
      this.ammunition.pzgr39 += bonus;
      this.ammunition.sprgr39 += Math.round(bonus * 0.75);
      events.push({
        kind: 'convoy_good', severity: 'good',
        text: `Fresh ammunition arrived overnight — ${bonus} rounds of Panzergranate.`,
      });
    } else {
      const normal = Math.round(this.rng.range(30, 75) * s * health);
      this.ammunition.pzgr39 += normal;
      this.ammunition.sprgr39 += Math.round(normal * 0.8);
      this.ammunition.nbgr += this.rng.int(0, 6);
      events.push({ kind: 'convoy_normal', severity: 'neutral', text: 'The routine ammunition allocation came up.' });
    }

    // Fuel. This was the German army's chronic problem in 1943.
    const fuelRoll = this.rng.next();
    if (fuelRoll < 0.20 * (2 - health)) {
      events.push({ kind: 'fuel_delayed', severity: 'bad', text: 'The fuel column is delayed. No resupply tonight.' });
    } else {
      const litres = Math.round(this.rng.range(700, 1800) * s * health);
      this.fuelL += litres;
      events.push({ kind: 'fuel_arrived', severity: 'neutral', text: `${litres} litres of fuel received.` });
    }

    // Spare parts. These were always short for the Tiger.
    if (this.rng.bool(0.5 * health)) {
      const added = {};
      for (const k of ['trackLinks', 'roadWheels', 'optics', 'tools']) {
        const n = this.rng.int(0, k === 'trackLinks' ? 14 : 2);
        if (n) { this.spares[k] += n; added[k] = n; }
      }
      if (Object.keys(added).length) {
        events.push({
          kind: 'spares_arrived', severity: 'good',
          text: `Spare parts received: ${Object.entries(added).map(([k, n]) => `${n} ${SPARE_PARTS[k].label}`).join(', ')}.`,
        });
      }
    } else {
      events.push({ kind: 'spares_short', severity: 'bad', text: 'No spare parts came forward. The workshop is scavenging.' });
    }

    // PzGr 40 is a rumour, not a supply item.
    if (this.rng.bool(0.06)) {
      const n = this.rng.int(2, 5);
      this.ammunition.pzgr40 += n;
      events.push({
        kind: 'apcr', severity: 'good',
        text: `${n} rounds of Panzergranate 40 have been released to the company. Use them well — there will not be more.`,
      });
    }

    // Recovery vehicles come and go.
    if (this.recoveryVehicles < 1 && this.rng.bool(0.4)) {
      this.recoveryVehicles++;
      events.push({ kind: 'recovery_available', severity: 'good', text: 'A Famo has been returned to the company from workshop.' });
    } else if (this.recoveryVehicles > 0 && this.rng.bool(0.12)) {
      this.recoveryVehicles--;
      events.push({ kind: 'recovery_unavailable', severity: 'bad', text: 'A recovery half-track has been taken by another company.' });
    }

    this.supplyLineHealth = clamp01(this.supplyLineHealth + 0.03);
    this.history.push({ events });
    return events;
  }

  /** Losses hurt the whole company's supply position. */
  registerLoss(kind) {
    const hit = { tank: 0.10, recovery: 0.12, supplyTruck: 0.07, crew: 0.02 }[kind] ?? 0.03;
    this.supplyLineHealth = clamp01(this.supplyLineHealth - hit);
    if (kind === 'recovery') this.recoveryVehicles = Math.max(0, this.recoveryVehicles - 1);
  }

  /** The line the briefing officer says about supply. */
  briefingLine() {
    const ap = this.ammunition.pzgr39;
    if (ap < 60) return 'Current unit ammunition stocks are critically low. Choose your engagements.';
    if (ap < 140) return 'Ammunition stocks are limited. Do not waste armour-piercing.';
    if (this.fuelL < 900) return 'Fuel supplies are low. Keep your movement to what the mission needs.';
    return 'Ammunition and fuel are adequate for this operation.';
  }

  summary() {
    return {
      ammunition: { ...this.ammunition },
      mgAmmo: this.mgAmmo,
      fuelL: this.fuelL,
      spares: { ...this.spares },
      recoveryVehicles: this.recoveryVehicles,
      supplyLineHealth: this.supplyLineHealth,
    };
  }

  serialize() { return this.summary(); }
  deserialize(d) { Object.assign(this, d); }
}
