// ===========================================================================
//  THE Fu 5 NET
//
//  Battalion talks to you. Other Tigers talk to each other. You hear some of
//  it, and some of what you hear is wrong, late, or about a fight three
//  kilometres away that has nothing to do with you.
//
//  If the radio operator is dead or the set is smashed, all of this stops and
//  you are alone in a steel box.
// ===========================================================================

import { RADIO_TRAFFIC } from '../data/dialogue.js';
import { clamp, clamp01, formatGrid } from '../core/MathUtil.js';

export class RadioSystem {
  constructor({ world, bus, rng, tiger, campaign, difficulty }) {
    this.world = world;
    this.bus = bus;
    this.rng = rng;
    this.tiger = tiger;
    this.campaign = campaign;
    this.difficulty = difficulty || {};

    this.log = [];
    this.ambientTimer = this.rng.range(20, 60);
    this.pendingReplies = [];
    this.withdrawalAuthorised = false;
    this.artilleryAvailable = 3;
  }

  get operational() {
    if (this.tiger.components.radio?.destroyed) return false;
    const op = this.tiger.crewManager?.get('radio');
    return !!op && !op.outsideTank;
  }

  _speak(from, line, kind = 'traffic') {
    const entry = { from, line, kind, t: this.world.time };
    this.log.push(entry);
    if (this.log.length > 60) this.log.shift();
    this.bus?.emit('radio:message', entry);
    return entry;
  }

  _operatorDelay() {
    const op = this.tiger.crewManager?.get('radio');
    if (!op) return 3;
    const comms = clamp01(op.skill.comms ?? op.experience);
    return clamp(2.4 - comms * 1.5, 0.5, 4) * op.speedFactor;
  }

  _requireRadio(what) {
    if (this.tiger.components.radio?.destroyed) {
      this.tiger.crewManager?.say('radio', 'radio.dead', {}, true);
      return false;
    }
    const op = this.tiger.crewManager?.get('radio');
    if (!op) {
      this.bus?.emit('command:refused', { reason: `There is nobody on the radio to ${what}.` });
      return false;
    }
    if (op.outsideTank) {
      this.bus?.emit('command:refused', { reason: `${op.name} is outside the tank.` });
      return false;
    }
    return true;
  }

  _defer(seconds, fn) {
    this.pendingReplies.push({ at: this.world.time + seconds, fn });
  }

  // ---- Things the commander can ask for -----------------------------------

  reportContact() {
    if (!this._requireRadio('send a contact report')) return false;
    const contacts = this.world.spotting.fresh(20).filter((c) => c.hostile);
    this.tiger.crewManager?.say('radio', 'radio.ack', {}, true);

    if (!contacts.length) {
      this._defer(this._operatorDelay(), () => {
        this._speak('Tiger 101', 'No contacts to report.', 'own');
      });
      return true;
    }
    const c = contacts[0];
    const grid = formatGrid(c.lastKnownPos.x, c.lastKnownPos.z);
    this._defer(this._operatorDelay(), () => {
      this._speak('Tiger 101', `Contact — ${c.label}, grid ${grid}. ${contacts.length > 1 ? `${contacts.length} contacts total.` : ''}`, 'own');
      this.tiger.crewManager?.say('radio', 'radio.contact_report', {}, true);
      this._defer(this.rng.range(3, 9), () => {
        this._speak('HQ', 'Acknowledged, 101. Continue to observe.', 'hq');
      });
    });
    return true;
  }

  reportPosition() {
    if (!this._requireRadio('report position')) return false;
    const grid = formatGrid(this.tiger.pos.x, this.tiger.pos.z);
    this._defer(this._operatorDelay(), () => {
      this._speak('Tiger 101', `Position grid ${grid}.`, 'own');
      this._defer(this.rng.range(2, 6), () => this._speak('HQ', 'Understood, 101.', 'hq'));
    });
    return true;
  }

  contactHQ() {
    if (!this._requireRadio('contact HQ')) return false;
    this.tiger.crewManager?.say('radio', 'radio.ack', {}, true);
    this._defer(this._operatorDelay() + this.rng.range(2, 7), () => {
      const line = this.rng.pick(RADIO_TRAFFIC.hq_orders)
        .replace('{grid}', formatGrid(this.tiger.pos.x, this.tiger.pos.z));
      this._speak('HQ', line, 'hq');
    });
    return true;
  }

  reportDamage() {
    if (!this._requireRadio('report damage')) return false;
    const c = this.tiger.condition();
    const bits = [];
    if (c.damaged.length) bits.push(c.damaged.map((d) => `${d.label} ${d.state}`).join(', '));
    else bits.push('no significant damage');
    bits.push(`${c.ammoTotal} rounds remaining`);
    if (c.fire) bits.push('FIRE ABOARD');
    const casualties = this.tiger.crew.filter((m) => m.state !== 'fit').length;
    if (casualties) bits.push(`${casualties} casualties`);

    this._defer(this._operatorDelay(), () => {
      this._speak('Tiger 101', `Damage report: ${bits.join('. ')}.`, 'own');
      this._defer(this.rng.range(3, 10), () => {
        const bad = c.damaged.length > 2 || c.fire;
        this._speak('HQ', bad
          ? 'Understood, 101. Withdraw if you must. Report when clear.'
          : 'Understood, 101. Remain in position.', 'hq');
        if (bad) this.withdrawalAuthorised = true;
      });
    });
    return true;
  }

  requestArtillery(target) {
    if (!this._requireRadio('request artillery')) return false;
    if (this.artilleryAvailable <= 0) {
      this._defer(this._operatorDelay() + 4, () => {
        this._speak('HQ', 'Negative, 101. No fire missions available.', 'hq');
      });
      return false;
    }
    const pos = target || this.world.spotting.hostile()[0]?.lastKnownPos;
    if (!pos) {
      this.bus?.emit('command:refused', { reason: 'No target to give the guns.' });
      return false;
    }
    const grid = formatGrid(pos.x, pos.z);
    const op = this.tiger.crewManager?.get('radio');
    const accuracy = clamp01(0.4 + (op ? (op.skill.reporting ?? op.experience) * 0.5 : 0));

    this.tiger.crewManager?.say('radio', 'radio.ack', {}, true);
    this._defer(this._operatorDelay(), () => {
      this._speak('Tiger 101', `Fire mission. Enemy armour, grid ${grid}.`, 'own');
      this._defer(this.rng.range(4, 12), () => {
        this._speak('HQ', `Fire mission received. Grid ${grid}. Stand by.`, 'hq');
        this.artilleryAvailable--;
        this.world.requestArtillery(pos, 'Tiger 101', accuracy);
        this.tiger.crewManager?.say('radio', 'radio.artillery_requested', {}, true);
      });
    });
    return true;
  }

  requestSupport() {
    if (!this._requireRadio('request support')) return false;
    this._defer(this._operatorDelay() + this.rng.range(4, 12), () => {
      const available = this.rng.bool(0.55);
      this._speak('HQ', available
        ? 'Tiger 102 is moving to support you. Five minutes.'
        : 'Negative, 101. Everything is committed. You are on your own.', 'hq');
      if (available) this.bus?.emit('radio:support_dispatched', {});
    });
    return true;
  }

  requestWithdrawal() {
    if (!this._requireRadio('request permission to withdraw')) return false;
    const c = this.tiger.condition();
    const justified = c.damaged.length >= 2 || c.fire || c.ammoTotal < 12
      || this.tiger.crew.filter((m) => m.state !== 'fit').length >= 2;
    this._defer(this._operatorDelay() + this.rng.range(5, 15), () => {
      if (justified) {
        this.withdrawalAuthorised = true;
        this._speak('HQ', 'Permission granted, 101. Withdraw and report when clear.', 'hq');
      } else {
        this._speak('HQ', 'Negative, 101. Hold your position.', 'hq');
      }
    });
    return true;
  }

  requestFuel() {
    if (!this._requireRadio('request fuel')) return false;
    const stock = this.campaign?.logistics?.fuelL ?? 0;
    this._defer(this._operatorDelay() + this.rng.range(6, 18), () => {
      if (stock < 200) {
        this._speak('HQ', 'Negative, 101. The fuel column has not come up.', 'hq');
      } else {
        this._speak('HQ', 'Fuel is on the way. Find somewhere safe and wait.', 'hq');
        this.bus?.emit('radio:fuel_dispatched', {});
      }
    });
    return true;
  }

  reportAbandoned() {
    // This one works even without the tank's radio — a man on foot can be found.
    this._speak('Tiger 101', 'Tiger 101 abandoned. Crew is clear of the vehicle.', 'own');
    this._defer(this.rng.range(8, 25), () => {
      this._speak('HQ', 'Understood. Make your way to the rally point. We will try to recover the vehicle.', 'hq');
    });
    this.bus?.emit('radio:abandonment_reported', {});
    return true;
  }

  // ---- Ambient traffic -----------------------------------------------------

  update(dt) {
    for (let i = this.pendingReplies.length - 1; i >= 0; i--) {
      if (this.world.time >= this.pendingReplies[i].at) {
        const r = this.pendingReplies.splice(i, 1)[0];
        r.fn();
      }
    }

    if (!this.operational) return;

    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = this.rng.range(28, 95);

    // On Simulation the net is sparser and less useful.
    if (this.difficulty.limitedRadioInformation && this.rng.bool(0.45)) return;

    const grid = formatGrid(
      this.tiger.pos.x + this.rng.range(-900, 900),
      this.tiger.pos.z + this.rng.range(-900, 900));
    const dir = this.rng.pick(['north', 'south', 'east', 'west', 'north-east', 'south-west']);

    const roll = this.rng.next();
    let pool, from;
    if (roll < 0.30) { pool = RADIO_TRAFFIC.friendly_contact; from = this.rng.pick(['Tiger 102', 'Tiger 104', 'Tiger 113']); }
    else if (roll < 0.50) { pool = RADIO_TRAFFIC.hq_contact; from = 'HQ'; }
    else if (roll < 0.66) { pool = RADIO_TRAFFIC.warnings; from = 'HQ'; }
    else if (roll < 0.78) { pool = RADIO_TRAFFIC.friendly_loss; from = this.rng.pick(['Tiger 102', 'Tiger 104']); }
    else if (roll < 0.88) { pool = RADIO_TRAFFIC.hq_orders; from = 'HQ'; }
    else { pool = RADIO_TRAFFIC.imperfect; from = 'HQ'; }

    const line = this.rng.pick(pool).replace('{grid}', grid).replace('{dir}', dir);
    this._speak(from, line, 'ambient');

    // Some of that traffic puts a contact on the commander's map — imperfectly.
    if (pool === RADIO_TRAFFIC.hq_contact || pool === RADIO_TRAFFIC.warnings) {
      if (this.rng.bool(0.5)) {
        const real = this.world.vehicles.find((v) => v.faction === 'soviet' && !v.destroyed);
        if (real) {
          // Reported positions are stale and imprecise, because they came from
          // someone else, some time ago.
          this.world.spotting.reportContact(
            real.pos, 'radio', real.spec.id, 2,
            clamp01(0.35 + this.rng.next() * 0.35));
        }
      }
    }
  }

  recentLog(n = 6) { return this.log.slice(-n); }
}
