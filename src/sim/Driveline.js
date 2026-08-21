// Tiger driveline: Maybach HL 230 P45 -> Olvar OG 40 12 16 B pre-selector ->
// Henschel L 801 controlled differential -> 10.7:1 final drives -> 725 mm tracks.
//
// The point is that it should NOT feel like a modern tank. Fifty-seven tonnes
// takes time to start moving, the pre-selector takes most of a second to change
// gear, and the driver's skill shows in how smoothly it is done.

import { clamp, clamp01, lerpTable, approach } from '../core/MathUtil.js';

export class Driveline {
  constructor(spec) {
    this.spec = spec;
    this.reset();
  }

  reset() {
    this.rpm = 0;
    this.running = false;
    this.gear = 0;              // 0 = neutral, 1..8 forward, -1..-4 reverse
    this.targetGear = 0;
    this.shiftTimer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;             // -1 .. +1
    this.speed = 0;             // m/s along the hull
    this.trackSpeedL = 0;
    this.trackSpeedR = 0;
    this.engineLoad = 0;
    this.overheating = 0;
    this.fuelBurnRate = 0;
    this.stalled = false;
    this.starting = 0;
  }

  start() {
    if (this.running) return true;
    this.starting = 2.4;         // the HL 230 does not fire instantly
    return true;
  }

  stop() { this.running = false; this.rpm = 0; }

  get maxSpeedForward() {
    return this.spec.mobility.practicalRoad;
  }

  /**
   * @param {number} dt
   * @param {object} state  { engineOk, transmissionOk, trackLOk, trackROk, finalDriveLOk, finalDriveROk,
   *                          driverSkill 0..1, terrainResistance 0..1, gradient, fuelAvailable }
   */
  update(dt, state) {
    const spec = this.spec;

    if (this.starting > 0) {
      this.starting -= dt;
      this.rpm = 300 + Math.sin(this.starting * 22) * 180;
      if (this.starting <= 0) {
        if (state.engineOk && state.fuelAvailable) {
          this.running = true;
          this.rpm = spec.engine.idleRpm;
        }
      }
      return;
    }

    if (!state.engineOk || !state.fuelAvailable) {
      this.running = false;
      this.rpm = approach(this.rpm, 0, 900 * dt);
      this.speed = approach(this.speed, 0, 2.2 * dt);
      this.trackSpeedL = this.trackSpeedR = this.speed;
      this.fuelBurnRate = 0;
      return;
    }
    if (!this.running) { this.speed = approach(this.speed, 0, 1.6 * dt); return; }

    // ---- Gear changes: the Olvar is pre-selected, then engaged ---------------
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) this.gear = this.targetGear;
    } else if (this.targetGear !== this.gear) {
      // A skilled driver pre-selects early and the change is almost seamless.
      const skill = clamp01(state.driverSkill ?? 0.5);
      this.shiftTimer = spec.transmission.shiftTimeS * (1.5 - skill * 0.75);
    }
    const shifting = this.shiftTimer > 0;

    // ---- Engine -------------------------------------------------------------
    const ratio = this.gearRatio();
    const wheelCirc = Math.PI * spec.suspension.wheelDia;
    let targetRpm;
    if (this.gear === 0 || shifting) {
      targetRpm = spec.engine.idleRpm + this.throttle * (spec.engine.governedRpm - spec.engine.idleRpm) * 0.8;
    } else {
      // rpm follows road speed through the gearing.
      const wheelRps = Math.abs(this.speed) / wheelCirc;
      targetRpm = clamp(wheelRps * Math.abs(ratio) * spec.transmission.finalDrive * 60,
        spec.engine.idleRpm, spec.engine.maxRpm);
      // Throttle above what the speed demands revs it up against the load.
      targetRpm = lerpTable([[0, targetRpm], [1, Math.max(targetRpm, spec.engine.governedRpm)]], this.throttle);
    }
    this.rpm = approach(this.rpm, targetRpm, 2400 * dt);

    if (this.rpm < spec.engine.idleRpm * 0.55 && this.gear !== 0 && !shifting) {
      // Lugging the engine at 57 tonnes will stall it.
      this.stalled = true;
      this.running = false;
      this.rpm = 0;
      return;
    }

    // ---- Tractive effort ----------------------------------------------------
    const torque = lerpTable(spec.engine.torqueCurve, this.rpm);
    const driveTorque = shifting ? 0
      : torque * Math.abs(ratio) * spec.transmission.finalDrive * this.throttle * 0.86;
    const wheelRadius = spec.suspension.wheelDia / 2;
    let force = driveTorque / wheelRadius;
    if (this.gear < 0) force = -force;

    // Losses: rolling resistance, terrain, gradient, and the running gear itself.
    const mass = spec.mass.combat;
    const g = 9.80665;
    const terrainRes = 0.030 + (state.terrainResistance ?? 0) * 0.075;
    let resist = mass * g * terrainRes * Math.sign(this.speed || (this.gear >= 0 ? 1 : -1));
    const grade = state.gradient ?? 0;
    resist += mass * g * Math.sin(grade);

    // Damaged running gear is a real drag.
    if (!state.trackLOk || !state.trackROk) force *= 0.35;
    if (!state.trackLOk && !state.trackROk) force = 0;
    if (!state.finalDriveLOk && !state.finalDriveROk) force = 0;
    else if (!state.finalDriveLOk || !state.finalDriveROk) force *= 0.45;
    if (state.roadwheelsDegraded) force *= 0.82;

    // Braking.
    if (this.brake > 0) {
      resist += Math.sign(this.speed) * this.brake * mass * g * 0.42;
      force *= (1 - this.brake * 0.9);
    }

    const accel = (force - resist) / mass;
    this.speed += accel * dt;

    // Hard limits from the gearing.
    const maxForGear = this.maxSpeedInGear();
    if (this.gear > 0) this.speed = clamp(this.speed, -0.4, maxForGear);
    else if (this.gear < 0) this.speed = clamp(this.speed, -maxForGear, 0.4);
    else this.speed = approach(this.speed, 0, 1.1 * dt);
    if (Math.abs(this.speed) < 0.03 && this.throttle < 0.05) this.speed = 0;

    // ---- Steering: controlled differential slows the inside track ------------
    // Neutral steer (pivot) is available when stationary and both tracks are good.
    const canNeutral = Math.abs(this.speed) < 0.4 && state.trackLOk && state.trackROk;
    const steerAmount = this.steer;
    if (canNeutral && Math.abs(steerAmount) > 0.55 && this.throttle > 0.15) {
      this.trackSpeedL = steerAmount * 0.9;
      this.trackSpeedR = -steerAmount * 0.9;
      this.yawRate = -steerAmount * 0.30;
    } else {
      const inner = 1 - Math.abs(steerAmount) * 0.62;
      if (steerAmount < 0) { this.trackSpeedL = this.speed * inner; this.trackSpeedR = this.speed; }
      else if (steerAmount > 0) { this.trackSpeedL = this.speed; this.trackSpeedR = this.speed * inner; }
      else { this.trackSpeedL = this.trackSpeedR = this.speed; }
      const trackGauge = 2.82;
      this.yawRate = (this.trackSpeedR - this.trackSpeedL) / trackGauge;
    }

    // A thrown track drags the tank round whether the driver likes it or not.
    if (!state.trackLOk && state.trackROk) this.yawRate -= 0.22;
    if (!state.trackROk && state.trackLOk) this.yawRate += 0.22;

    // ---- Engine load, heat, fuel --------------------------------------------
    this.engineLoad = clamp01(Math.abs(force) / 260000 + this.throttle * 0.35);
    const heatIn = this.engineLoad * 0.030 + (this.rpm / spec.engine.maxRpm) * 0.012;
    this.overheating = clamp01(this.overheating + (heatIn - 0.018) * dt);

    // Consumption: the published road/cross-country figures, scaled by load.
    const per100 = lerpTable(
      [[0, spec.mobility.consumptionRoadL100 * 0.35], [0.4, spec.mobility.consumptionRoadL100],
       [1, spec.mobility.consumptionCrossL100]], this.engineLoad);
    const kmThisStep = (Math.abs(this.speed) * dt) / 1000;
    // Idling still drinks fuel — about 9 litres an hour.
    this.fuelBurnRate = (per100 * kmThisStep) / dt + (this.running ? 9 / 3600 : 0);
  }

  gearRatio() {
    const t = this.spec.transmission;
    if (this.gear > 0) return t.ratios[Math.min(this.gear, t.ratios.length) - 1];
    if (this.gear < 0) return -t.reverseRatios[Math.min(-this.gear, t.reverseRatios.length) - 1];
    return 0;
  }

  maxSpeedInGear() {
    const t = this.spec.transmission;
    const ratio = Math.abs(this.gearRatio());
    if (!ratio) return 0;
    const wheelCirc = Math.PI * this.spec.suspension.wheelDia;
    const v = (this.spec.engine.governedRpm / 60) * wheelCirc / (ratio * t.finalDrive);
    return Math.min(v, this.gear > 0 ? this.spec.mobility.practicalRoad : this.spec.mobility.maxReverse);
  }

  /** Pick the gear a competent driver would be in for this speed and demand. */
  autoGear(desiredSpeed, currentSpeed) {
    const t = this.spec.transmission;
    if (Math.abs(desiredSpeed) < 0.15) { this.targetGear = 0; return; }
    const reverse = desiredSpeed < 0;
    const speed = Math.abs(currentSpeed);
    const wheelCirc = Math.PI * this.spec.suspension.wheelDia;
    const ratios = reverse ? t.reverseRatios : t.ratios;
    let best = 1;
    for (let i = 0; i < ratios.length; i++) {
      const vMax = (this.spec.engine.governedRpm / 60) * wheelCirc / (ratios[i] * t.finalDrive);
      if (speed < vMax * 0.92) { best = i + 1; break; }
      best = i + 1;
    }
    this.targetGear = reverse ? -Math.min(best, t.reverseRatios.length) : best;
  }
}
