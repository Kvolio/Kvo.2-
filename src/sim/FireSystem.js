// ===========================================================================
//  FIRE
//
//  Built from the real Tiger installation, not a generic suppression system:
//
//    * The automatic Feuerlöschanlage protects the ENGINE COMPARTMENT ONLY.
//      Thermostats at the fuel pumps and carburettors trip at 120 °C and fire a
//      3-litre bottle of CB ("Tetra") for 7 seconds. A lamp lights on the
//      driver's panel. There is enough agent for about five discharges, then it
//      is empty for the rest of the mission.
//
//    * The fighting compartment has NO automatic protection. There is a
//      hand-held extinguisher, and a man has to stop what he is doing, get to
//      it, and use it.
//
//    * The agent is toxic. Every discharge degrades the crew a little.
//
//    * None of it guarantees anything. A fuel-fed or ammunition fire can and
//      will beat the system, and then the commander has a decision to make and
//      not very long to make it.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';

export const FIRE_STAGE = {
  NONE: 'none',
  SMOULDERING: 'smouldering',   // not yet noticed
  DETECTED: 'detected',
  ESTABLISHED: 'established',
  SPREADING: 'spreading',
  UNCONTROLLABLE: 'uncontrollable',
  COOKING_OFF: 'cooking_off',   // the ammunition is heating. Seconds remain.
  BURNT_OUT: 'burnt_out',
};

export class Fire {
  constructor(spec, bus, rng) {
    this.spec = spec;
    this.bus = bus;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.stage = FIRE_STAGE.NONE;
    this.severity = 0;            // 0..1+
    this.compartment = null;
    this.sources = [];
    this.duration = 0;
    this.detectedAt = -1;
    this.fuelFed = false;
    this.ammunitionInvolved = false;
    this.autoDischargesUsed = 0;
    this.autoDischargeTimer = 0;
    this.handExtinguisherUses = this.spec.FIRE_SYSTEM.handExtinguisher.uses;
    this.crewToxicity = 0;
    this.suppressionActive = false;
    this.suppressionTimer = 0;
    this.warningLamp = false;
    this.cookOffTimer = 0;
    this.autoSystemDead = false;
    this.manualCrew = null;       // which crewman is fighting the fire by hand
    this.manualTimer = 0;
  }

  get active() {
    return this.stage !== FIRE_STAGE.NONE && this.stage !== FIRE_STAGE.BURNT_OUT;
  }

  /** Start or feed a fire from a damage event. */
  ignite({ compartment, intensity, fuelFed, ammunition, source }) {
    const fresh = !this.active;
    if (fresh) {
      this.stage = FIRE_STAGE.SMOULDERING;
      this.compartment = compartment;
      this.duration = 0;
      this.severity = 0;
    }
    this.severity = clamp(this.severity + intensity, 0, 1.4);
    this.fuelFed = this.fuelFed || !!fuelFed;
    this.ammunitionInvolved = this.ammunitionInvolved || !!ammunition;
    if (source && !this.sources.includes(source)) this.sources.push(source);
    if (fresh) this.bus?.emit('fire:started', { compartment, severity: this.severity, fuelFed, ammunition });
    return fresh;
  }

  /**
   * Advance the fire. `vehicle` supplies the crew and the ammunition state.
   */
  update(dt, vehicle, difficulty = {}) {
    if (!this.active) return;
    this.duration += dt;

    const fs = this.spec.FIRE_SYSTEM;
    const sevMul = difficulty.fireSeverity ?? 1.0;

    // ---- Growth --------------------------------------------------------------
    let growth = 0.020 * sevMul;
    if (this.fuelFed) growth += 0.030 * sevMul;
    if (this.ammunitionInvolved) growth += 0.045 * sevMul;
    // Fuel in the tanks feeds the fire; an almost-dry Tiger burns less fiercely.
    const fuelFrac = vehicle.fuelL !== undefined ? clamp01(vehicle.fuelL / 540) : 0.6;
    growth *= 0.55 + fuelFrac * 0.9;
    // Open hatches ventilate: more oxygen, faster burn, but the crew can get out.
    if (vehicle.hatchOpen?.cupola_hatch) growth *= 1.12;

    // ---- Automatic system ----------------------------------------------------
    // Thermostats only see the engine compartment.
    const autoCovers = fs.protects.includes(this.compartment);
    const autoAvailable = autoCovers
      && !this.autoSystemDead
      && this.autoDischargesUsed < fs.discharges
      && !vehicle.components?.fire_system?.destroyed;

    if (autoAvailable && this.stage !== FIRE_STAGE.NONE && this.autoDischargeTimer <= 0
        && this.severity > 0.08 && !this.suppressionActive) {
      // The thermostat has tripped. It does this by itself — the crew is informed,
      // not consulted.
      this.triggerAutomatic(vehicle);
    }

    if (this.autoDischargeTimer > 0) {
      this.autoDischargeTimer -= dt;
      if (this.autoDischargeTimer <= 0) {
        this.suppressionActive = false;
        this.warningLamp = false;
      }
    }

    // ---- Suppression effect --------------------------------------------------
    if (this.suppressionActive) {
      let power = fs.suppressionPower;
      // The agent is aimed at the carburettors and fuel pumps. It does very
      // little for a fire that has taken hold in the ammunition.
      if (this.ammunitionInvolved) power *= 0.25;
      if (this.fuelFed) power *= 0.7;
      growth -= power * 0.12;
    }

    // ---- Manual firefighting -------------------------------------------------
    if (this.manualCrew) {
      this.manualTimer -= dt;
      const man = vehicle.crew?.find((m) => m && m.role === this.manualCrew);
      if (!man || man.state === 'dead' || man.state === 'incapacitated') {
        this.manualCrew = null;
      } else {
        let power = fs.handExtinguisher.suppressionPower;
        power *= 0.6 + (man.skill?.repair ?? 0.5) * 0.5;
        power *= 1 - (man.stress ?? 0) * 0.35;
        growth -= power * 0.10;
        if (this.manualTimer <= 0) {
          this.manualCrew = null;
          this.bus?.emit('fire:manual_done', {});
        }
      }
    }

    this.severity = clamp(this.severity + growth * dt * 3.2, 0, 1.5);

    // ---- Detection -----------------------------------------------------------
    if (this.stage === FIRE_STAGE.SMOULDERING) {
      const noticeThreshold = this.compartment === 'engine_compartment' ? 0.10 : 0.05;
      if (this.severity > noticeThreshold || this.warningLamp) {
        this.stage = FIRE_STAGE.DETECTED;
        this.detectedAt = this.duration;
        this.bus?.emit('fire:detected', { compartment: this.compartment, warningLamp: this.warningLamp });
      }
    } else if (this.stage === FIRE_STAGE.DETECTED && this.severity > 0.32) {
      this.stage = FIRE_STAGE.ESTABLISHED;
      this.bus?.emit('fire:established', { compartment: this.compartment });
    } else if (this.stage === FIRE_STAGE.ESTABLISHED && this.severity > 0.58) {
      this.stage = FIRE_STAGE.SPREADING;
      this.bus?.emit('fire:spreading', { compartment: this.compartment });
    } else if (this.stage === FIRE_STAGE.SPREADING && this.severity > 0.85) {
      this.stage = FIRE_STAGE.UNCONTROLLABLE;
      this.bus?.emit('fire:uncontrollable', { compartment: this.compartment });
    }

    // ---- Spread to the ammunition -------------------------------------------
    const ammoAtRisk = (vehicle.ammoRemaining ?? 0) > 0;
    if (this.severity > 0.68 && ammoAtRisk && !this.ammunitionInvolved) {
      if (this.rng.next() < dt * 0.16 * sevMul) {
        this.ammunitionInvolved = true;
        this.bus?.emit('fire:reached_ammunition', {});
      }
    }

    if (this.ammunitionInvolved && this.severity > 0.80) {
      if (this.stage !== FIRE_STAGE.COOKING_OFF) {
        this.stage = FIRE_STAGE.COOKING_OFF;
        // This is the window the commander has. It is not generous.
        this.cookOffTimer = this.rng.range(14, 26) / clamp(sevMul, 0.5, 2);
        this.bus?.emit('fire:cooking_off', { seconds: this.cookOffTimer });
      }
      this.cookOffTimer -= dt;
      if (this.cookOffTimer <= 0) {
        this.bus?.emit('fire:ammunition_detonation', {});
        vehicle.ammoDetonated = true;
        this.severity = 1.5;
      }
    }

    // ---- Damage the tank and the men ----------------------------------------
    this.applyBurnDamage(dt, vehicle);

    // ---- Burn out ------------------------------------------------------------
    if (this.severity <= 0.015) {
      this.stage = FIRE_STAGE.BURNT_OUT;
      this.bus?.emit('fire:extinguished', { duration: this.duration });
    }
  }

  triggerAutomatic(vehicle) {
    const fs = this.spec.FIRE_SYSTEM;
    if (this.autoDischargesUsed >= fs.discharges) {
      this.bus?.emit('fire:system_empty', {});
      return false;
    }
    this.autoDischargesUsed++;
    this.autoDischargeTimer = fs.dischargeSeconds;
    this.suppressionActive = true;
    this.warningLamp = true;
    this.crewToxicity += fs.crewToxicityPerDischarge;
    this.bus?.emit('fire:suppression_discharge', {
      remaining: fs.discharges - this.autoDischargesUsed,
      automatic: true,
    });
    // Toxic agent in a sealed tank.
    for (const m of vehicle.crew || []) {
      if (m && !m.outsideTank && m.state !== 'dead') {
        m.health = clamp01((m.health ?? 1) - fs.crewToxicityPerDischarge * 0.5);
        m.stress = clamp01((m.stress ?? 0) + 0.05);
      }
    }
    return true;
  }

  /**
   * The commander's order. The driver can trip the system by hand — but only
   * if there is agent left, and only for the engine compartment.
   * For a fighting-compartment fire this hands someone the hand extinguisher.
   */
  commandSuppression(vehicle) {
    const fs = this.spec.FIRE_SYSTEM;
    const results = [];

    if (fs.protects.includes(this.compartment)) {
      if (vehicle.components?.fire_system?.destroyed) {
        results.push({ ok: false, reason: 'The extinguisher system is shot away.' });
      } else if (this.autoDischargesUsed >= fs.discharges) {
        results.push({ ok: false, reason: 'The bottle is empty.' });
      } else {
        this.triggerAutomatic(vehicle);
        results.push({ ok: true, reason: 'Extinguishers discharged into the engine compartment.' });
      }
    } else {
      results.push({ ok: false, reason: 'The automatic system does not reach the fighting compartment.' });
    }

    // Whatever the compartment, someone can also grab the hand extinguisher.
    if (this.handExtinguisherUses > 0 && !this.manualCrew) {
      const candidates = fs.handExtinguisher.reachableFrom;
      const man = (vehicle.crew || []).find((m) =>
        m && candidates.includes(m.role) && !m.outsideTank
        && m.state !== 'dead' && m.state !== 'incapacitated');
      if (man) {
        this.handExtinguisherUses--;
        this.manualCrew = man.role;
        this.manualTimer = fs.handExtinguisher.useSeconds;
        man.busyWith = 'firefighting';
        results.push({ ok: true, reason: `${man.name || man.role} is on the hand extinguisher.`, manual: true, role: man.role });
      }
    } else if (this.handExtinguisherUses <= 0) {
      results.push({ ok: false, reason: 'The hand extinguisher is spent.' });
    }

    return results;
  }

  applyBurnDamage(dt, vehicle) {
    const s = this.severity;
    if (s < 0.05) return;

    // Components in the burning compartment cook.
    for (const [id, comp] of Object.entries(this.spec.COMPONENTS)) {
      if (comp.compartment !== this.compartment) continue;
      const st = vehicle.components?.[id];
      if (!st || st.destroyed) continue;
      st.damage = (st.damage || 0) + s * 9 * dt;
      if (st.damage >= comp.hp) {
        st.destroyed = true;
        this.bus?.emit('component:destroyed', { id, label: comp.label, cause: 'fire' });
      }
    }

    // Heat, smoke and toxic products on the men.
    for (const m of vehicle.crew || []) {
      if (!m || m.outsideTank || m.state === 'dead') continue;
      const sameSpace = this.compartment !== 'engine_compartment';
      const exposure = sameSpace ? s : s * 0.28;
      if (exposure > 0.05) {
        m.health = clamp01((m.health ?? 1) - exposure * 0.030 * dt);
        m.stress = clamp01((m.stress ?? 0) + exposure * 0.10 * dt);
        // A commander with his head out is at least breathing clean air.
        if (m.role === 'commander' && vehicle.commanderHeadOut) {
          m.health = clamp01(m.health + exposure * 0.018 * dt);
        }
      }
    }
  }

  /** What the commander should be told, in crew language. */
  statusLine() {
    switch (this.stage) {
      case FIRE_STAGE.NONE:
      case FIRE_STAGE.BURNT_OUT: return null;
      case FIRE_STAGE.SMOULDERING: return null;
      case FIRE_STAGE.DETECTED:
        return this.compartment === 'engine_compartment' ? 'Fire — engine compartment!' : 'Fire in the fighting compartment!';
      case FIRE_STAGE.ESTABLISHED: return 'The fire is taking hold!';
      case FIRE_STAGE.SPREADING: return 'Fire spreading!';
      case FIRE_STAGE.UNCONTROLLABLE: return 'We cannot hold it!';
      case FIRE_STAGE.COOKING_OFF: return 'THE AMMUNITION IS COOKING OFF!';
      default: return null;
    }
  }

  /** Seconds the commander has left before it is out of his hands, or null. */
  get timeToDisaster() {
    if (this.stage === FIRE_STAGE.COOKING_OFF) return Math.max(0, this.cookOffTimer);
    if (this.severity <= 0) return null;
    if (this.stage === FIRE_STAGE.NONE || this.stage === FIRE_STAGE.BURNT_OUT) return null;
    const toCook = 0.80 - this.severity;
    if (toCook <= 0) return 0;
    return null;   // deliberately not shown as a countdown until it is real
  }

  serialize() {
    return {
      stage: this.stage, severity: this.severity, compartment: this.compartment,
      duration: this.duration, fuelFed: this.fuelFed, ammunitionInvolved: this.ammunitionInvolved,
      autoDischargesUsed: this.autoDischargesUsed, handExtinguisherUses: this.handExtinguisherUses,
      sources: this.sources.slice(),
    };
  }

  deserialize(d) { Object.assign(this, d); }
}
