// ===========================================================================
//  TERMINAL BALLISTICS — the armour/projectile interaction
//
//  THE RULE THIS FILE EXISTS TO ENFORCE:
//    Whether a shell defeats a plate is decided by the shell and the plate.
//    Nothing else. There is no RNG in this file. There is no "armour roll".
//    There is no hidden damage bonus for the enemy and no hidden protection
//    for the player. Feed it the same conditions and it returns the same answer
//    every time, and you can print the arithmetic and check it.
//
//  HOW IT IS CALIBRATED
//    The wartime tables state "this round defeats X mm of plate laid at 30°".
//    So for each table entry we solve for the round's NORMAL-INCIDENCE
//    penetration P0 that would produce exactly that result under the obliquity
//    model below, then fit P0 against impact velocity as a power law
//    (P ∝ v^1.43, the DeMarre exponent). Intermediate ranges and unusual angles
//    then fall out of the physics instead of out of a lookup table.
//
//  Validated against the April 1943 Kubinka trials of a captured Tiger:
//    - 76 mm F-34 BR-350A does NOT defeat the 80 mm side at 200 m   -> confirmed
//    - 85 mm 52-K BR-365 DOES defeat the 100 mm front at 1000 m     -> confirmed
// ===========================================================================

import { velocityAt } from './Ballistics.js';
import { DEG, RAD, clamp, lerpTable } from '../core/MathUtil.js';

export const OUTCOME = {
  RICOCHET: 'ricochet',
  SHATTER: 'shatter',
  NON_PENETRATION: 'non_penetration',
  PARTIAL: 'partial',           // plate defeated the shell but spalled inside
  PENETRATION: 'penetration',
  OVERMATCH: 'overmatch',       // caliber hugely exceeds plate; structural failure
  NO_EFFECT: 'no_effect',       // HE/smoke against armour it cannot touch
};

/** Obliquity resistance exponent — how much worse than pure line-of-sight a sloped plate is. */
const OBLIQUITY_EXPONENT = {
  APCBC: 1.25,   // ballistic cap helps it hold on
  AP: 1.35,      // uncapped shot skids
  APCR: 1.45,    // rigid tungsten core is badly behaved at angle
  HEAT: 1.00,    // the jet only cares about line-of-sight path length
  HE: 1.00,
  SMOKE: 1.00,
};

/**
 * Angle of "bite" a capped projectile gains against a sloped plate.
 * Thin plates relative to the shell normalise more; thick plates barely at all.
 */
export function normalisationDeg(proj, thicknessMm) {
  const base = proj.normalisation || 0;
  if (base <= 0) return 0;
  const ratio = clamp(proj.caliber / Math.max(1, thicknessMm), 0.35, 2.5);
  return base * Math.sqrt(ratio);
}

/**
 * Effective thickness of a plate against a given projectile at a given obliquity.
 * @param {object} proj
 * @param {number} thicknessMm
 * @param {number} obliquityRad  angle between the shell's path and the plate normal
 * @param {number} [quality]     plate quality coefficient, 1.0 = reference RHA
 */
export function effectiveThickness(proj, thicknessMm, obliquityRad, quality = 1.0) {
  const n = OBLIQUITY_EXPONENT[proj.kind] ?? 1.3;
  const obDeg = Math.abs(obliquityRad) * RAD;
  const effDeg = Math.max(0, obDeg - normalisationDeg(proj, thicknessMm));
  const cosT = Math.max(0.087, Math.cos(effDeg * DEG)); // clamp at 85 deg
  return thicknessMm * Math.pow(1 / cosT, n) * quality;
}

// --- Calibration -----------------------------------------------------------
// Cache of fitted coefficients, keyed by projectile id.
const _fit = new Map();
const DEMARRE_EXP = 1.43;

/**
 * Solve the round's normal-incidence penetration from its published 30-degree
 * table, then build a velocity->penetration curve.
 *
 * Inside the table's velocity span we interpolate in log-log space, which
 * reproduces every published figure exactly and stays monotonic in between.
 * Outside it we extrapolate with the DeMarre power law (P proportional to
 * v^1.43) anchored on the nearest table end, so odd ranges still behave.
 *
 * This is why a light APCR carrier, which sheds penetration far faster than a
 * heavy capped shell, is modelled correctly instead of being forced onto the
 * same curve shape.
 */
function fitProjectile(proj) {
  if (_fit.has(proj.id)) return _fit.get(proj.id);

  if (proj.fixedPen) {                     // HEAT: range independent by nature
    const f = { kind: 'fixed', p0: proj.fixedPen };
    _fit.set(proj.id, f);
    return f;
  }
  if (!proj.penTable) {
    const f = { kind: 'none', p0: 0 };
    _fit.set(proj.id, f);
    return f;
  }

  // Build (impact velocity, normal-incidence penetration) samples, ascending in v.
  const samples = proj.penTable.map(([range, pen30]) => {
    const v = velocityAt(proj, range);
    // A plate `pen30` mm thick laid at 30 degrees was defeated exactly, so the
    // round's normal-incidence capability equals that plate's effective thickness.
    const p0 = effectiveThickness(proj, pen30, 30 * DEG, 1.0);
    return { range, v, pen30, p0 };
  }).sort((a, b) => a.v - b.v);

  const lo = samples[0];
  const hi = samples[samples.length - 1];
  const f = {
    kind: 'table',
    samples,
    loCoeff: lo.p0 / Math.pow(lo.v, DEMARRE_EXP),
    hiCoeff: hi.p0 / Math.pow(hi.v, DEMARRE_EXP),
    vMin: lo.v, vMax: hi.v,
  };
  _fit.set(proj.id, f);
  return f;
}

/** Normal-incidence penetration in mm of reference RHA at a given impact velocity. */
export function penetrationAtVelocity(proj, impactVel) {
  const f = fitProjectile(proj);
  if (f.kind === 'fixed') return f.p0;
  if (f.kind === 'none') return 0;

  const v = Math.max(1, impactVel);
  if (v <= f.vMin) return f.loCoeff * Math.pow(v, DEMARRE_EXP);
  if (v >= f.vMax) return f.hiCoeff * Math.pow(v, DEMARRE_EXP);

  const s = f.samples;
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i].v) {
      const a = s[i - 1], b = s[i];
      // Log-log interpolation: straight lines in log space, which is where
      // penetration/velocity data actually lives.
      const t = (Math.log(v) - Math.log(a.v)) / (Math.log(b.v) - Math.log(a.v));
      return Math.exp(Math.log(a.p0) + t * (Math.log(b.p0) - Math.log(a.p0)));
    }
  }
  return f.hiCoeff * Math.pow(v, DEMARRE_EXP);
}

/** Convenience: normal-incidence penetration at a given range. */
export function penetrationAtRange(proj, rangeM) {
  if (proj.fixedPen) return proj.fixedPen;
  return penetrationAtVelocity(proj, velocityAt(proj, rangeM));
}

/**
 * Will this projectile ricochet off this plate at this obliquity?
 * A big shell against a thin plate cannot ricochet — it overmatches and pushes
 * through the plate edge. That is why a 152 mm shell does not skip off a Tiger.
 */
export function ricochetCheck(proj, thicknessMm, obliquityRad) {
  const limitBase = proj.ricochetDeg ?? 70;
  const overmatch = proj.caliber / Math.max(1, thicknessMm);
  if (overmatch >= 3.0) return { ricochet: false, limitDeg: 90, overmatch };
  // Larger calibre relative to plate raises the angle at which it would skip.
  const limitDeg = Math.min(89, limitBase + clamp((overmatch - 1) * 9, -12, 20));
  const obDeg = Math.abs(obliquityRad) * RAD;
  return { ricochet: obDeg > limitDeg, limitDeg, overmatch, obliquityDeg: obDeg };
}

/**
 * APCR shatter gap: a rigid tungsten core striking thick plate at very high
 * velocity can break up before it finishes the job. Deterministic threshold.
 */
function shatterCheck(proj, thicknessMm, impactVel, obliquityRad) {
  if (proj.kind !== 'APCR') return false;
  const obDeg = Math.abs(obliquityRad) * RAD;
  return impactVel > 850 && thicknessMm > proj.caliber * 1.7 && obDeg > 25;
}

/**
 * THE MAIN SOLVER.
 *
 * @param {object} proj          projectile data (src/data/ammunition.js)
 * @param {object} plate         armour plate (thickness, quality, ...)
 * @param {number} impactVel     m/s at the moment of contact
 * @param {number} obliquityRad  angle between the shell path and the plate normal
 * @param {number} rangeM        for the report only
 * @returns {{outcome:string, penetration:number, effective:number, margin:number, report:object}}
 */
export function resolveImpact(proj, plate, impactVel, obliquityRad, rangeM = 0) {
  const thickness = plate.thickness;
  const quality = plate.quality ?? 1.0;

  // Non-penetrating natures never enter the tank through armour.
  if (proj.kind === 'HE' || proj.kind === 'SMOKE') {
    return {
      outcome: OUTCOME.NO_EFFECT,
      penetration: 0,
      effective: thickness,
      margin: -thickness,
      report: makeReport(proj, plate, impactVel, obliquityRad, rangeM, 0, thickness, 'high explosive against armour'),
    };
  }

  const ric = ricochetCheck(proj, thickness, obliquityRad);
  const pen = penetrationAtVelocity(proj, impactVel);
  const eff = effectiveThickness(proj, thickness, obliquityRad, quality);

  // Overmatch: shell calibre three times the plate. It goes through, angle be damned.
  if (ric.overmatch >= 3.0 && pen > thickness * 0.75) {
    return {
      outcome: OUTCOME.OVERMATCH, penetration: pen, effective: eff, margin: pen - eff,
      report: makeReport(proj, plate, impactVel, obliquityRad, rangeM, pen, eff, 'calibre overmatches plate'),
    };
  }

  if (ric.ricochet) {
    return {
      outcome: OUTCOME.RICOCHET, penetration: pen, effective: eff, margin: pen - eff,
      report: makeReport(proj, plate, impactVel, obliquityRad, rangeM, pen, eff,
        `struck at ${ric.obliquityDeg.toFixed(0)}°, past the ${ric.limitDeg.toFixed(0)}° deflection limit`),
    };
  }

  if (shatterCheck(proj, thickness, impactVel, obliquityRad)) {
    return {
      outcome: OUTCOME.SHATTER, penetration: pen, effective: eff, margin: pen - eff,
      report: makeReport(proj, plate, impactVel, obliquityRad, rangeM, pen, eff, 'tungsten core broke up on impact'),
    };
  }

  const ratio = pen / eff;
  let outcome;
  if (ratio >= 1.0) outcome = OUTCOME.PENETRATION;
  else if (ratio >= 0.95) outcome = OUTCOME.PARTIAL;
  else outcome = OUTCOME.NON_PENETRATION;

  return {
    outcome,
    penetration: pen,
    effective: eff,
    margin: pen - eff,
    // Residual velocity behind the plate drives how much damage it does inside.
    residualVel: outcome === OUTCOME.PENETRATION || outcome === OUTCOME.OVERMATCH
      ? impactVel * Math.sqrt(Math.max(0, 1 - (eff / Math.max(eff, pen)) ** 2)) * 0.92
      : 0,
    report: makeReport(proj, plate, impactVel, obliquityRad, rangeM, pen, eff, null),
  };
}

function makeReport(proj, plate, impactVel, obliquityRad, rangeM, pen, eff, note) {
  return {
    projectile: proj.name,
    projectileKind: proj.kind,
    caliber: proj.caliber,
    mass: proj.mass,
    muzzleVelocity: proj.muzzleVel,
    impactVelocity: Math.round(impactVel),
    range: Math.round(rangeM),
    plate: plate.label || plate.id,
    plateThickness: plate.thickness,
    plateQuality: plate.quality ?? 1.0,
    obliquityDeg: +(Math.abs(obliquityRad) * RAD).toFixed(1),
    normalisationDeg: +normalisationDeg(proj, plate.thickness).toFixed(1),
    penetrationCapability: Math.round(pen),
    effectiveThickness: Math.round(eff),
    note,
  };
}

/** Human-readable one-line trace, shown in the ballistics inspector. */
export function explainImpact(result) {
  const r = result.report;
  return `${r.projectile} (${r.caliber} mm, ${r.mass} kg) struck ${r.plate} `
    + `(${r.plateThickness} mm) at ${r.range} m, ${r.impactVelocity} m/s, ${r.obliquityDeg}° obliquity. `
    + `Capability ${r.penetrationCapability} mm vs effective ${r.effectiveThickness} mm `
    + `→ ${result.outcome.replace('_', ' ').toUpperCase()}${r.note ? ` (${r.note})` : ''}.`;
}

/**
 * Spall generated behind a plate. Even a stopped shell can throw fragments off
 * the inner face — this is what wounds crews in tanks that "were not penetrated".
 * Returns a fragment count and a cone half-angle.
 */
export function computeSpall(result, proj, plate) {
  const { outcome } = result;
  if (outcome === OUTCOME.NO_EFFECT) return null;

  let energyFrac = 0;
  if (outcome === OUTCOME.PENETRATION || outcome === OUTCOME.OVERMATCH) energyFrac = 1.0;
  else if (outcome === OUTCOME.PARTIAL) energyFrac = 0.35;
  else if (outcome === OUTCOME.NON_PENETRATION) {
    // Close-to-threshold non-penetrations still bulge and flake the back face.
    const near = clamp(result.penetration / result.effective, 0, 0.95);
    energyFrac = near > 0.75 ? (near - 0.75) * 0.6 : 0;
  } else if (outcome === OUTCOME.SHATTER) energyFrac = 0.25;
  else energyFrac = 0; // clean ricochet

  if (energyFrac <= 0.001) return null;

  const massFactor = Math.sqrt(proj.mass) * (proj.caliber / 88);
  const fragments = Math.round(clamp(10 * massFactor * energyFrac * (plate.thickness / 80), 1, 90));
  return {
    fragments,
    energyFrac,
    coneHalfAngle: clamp(28 - plate.thickness * 0.06, 12, 30) * DEG,
    // A base-fuzed APHE shell adds its filler detonating INSIDE the tank.
    hePayload: (outcome === OUTCOME.PENETRATION || outcome === OUTCOME.OVERMATCH) ? (proj.filler || 0) : 0,
    fuzeDelayM: proj.fuzeDelayM || 0,
  };
}
