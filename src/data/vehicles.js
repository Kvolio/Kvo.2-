// ===========================================================================
//  VEHICLES PRESENT IN THE KURSK SALIENT, JULY 1943
//
//  Nothing is in this file because it is famous. Every entry was in the
//  salient during Operation Zitadelle. No Tiger II, no IS-2, no T-34-85,
//  no Jagdpanther, no Panzer IV Ausf. J, no Firefly, no Sherman.
//
//  Armour is geometry here too — fewer plates than the Tiger (which is the star
//  of the show and gets 35), but real thicknesses at real angles, so the Tiger's
//  8.8 cm has to be aimed rather than pointed.
// ===========================================================================

import { DEG } from '../core/MathUtil.js';

const s = (d) => Math.sin(d * DEG);
const c = (d) => Math.cos(d * DEG);

/** Compact plate builder for the secondary vehicles. */
function P(id, label, thickness, centre, normal, halfU, halfV, opt = {}) {
  const n = normal.slice();
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= len; n[1] /= len; n[2] /= len;
  const up = Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { id, label, thickness, centre, normal: n, u, v, halfU, halfV,
    material: 'RHA', quality: opt.quality ?? 1.0, behind: opt.behind || 'hull',
    onTurret: opt.onTurret || false, ringZ: opt.ringZ, weakPoint: opt.weakPoint || null, ...opt };
}

/** Standard component set for a medium tank, positioned by hull proportions. */
function stdComponents(len, wid, ht, opts = {}) {
  const engZ = opts.engineFront ? len * 0.30 : -len * 0.30;
  return {
    engine: { label: opts.engineName || 'engine', compartment: 'engine_compartment',
      pos: [0, ht * 0.35, engZ], size: [wid * 0.55, ht * 0.4, len * 0.22], hp: opts.engineHp ?? 180,
      critical: 'mobility', fireRisk: opts.diesel ? 0.28 : 0.55, fuelAdjacent: true },
    transmission: { label: 'transmission', compartment: 'driver_compartment',
      pos: [0, ht * 0.28, opts.engineFront ? -len * 0.28 : len * 0.30], size: [wid * 0.45, ht * 0.3, len * 0.14],
      hp: opts.transHp ?? 150, critical: 'mobility', fireRisk: 0.10 },
    track_l: { label: 'left track', external: true, pos: [-wid * 0.42, ht * 0.18, 0],
      size: [wid * 0.12, ht * 0.32, len * 0.85], hp: 70, critical: 'mobility_half' },
    track_r: { label: 'right track', external: true, pos: [wid * 0.42, ht * 0.18, 0],
      size: [wid * 0.12, ht * 0.32, len * 0.85], hp: 70, critical: 'mobility_half' },
    main_gun: { label: 'main gun', compartment: 'turret', pos: [0, ht * 0.72, len * 0.28],
      size: [0.22, 0.22, len * 0.35], hp: 140, critical: 'firepower' },
    breech: { label: 'breech', compartment: 'turret', pos: [0, ht * 0.70, len * 0.10],
      size: [0.3, 0.3, 0.4], hp: 100, critical: 'firepower' },
    turret_traverse: { label: 'turret traverse', compartment: 'turret', pos: [wid * 0.16, ht * 0.60, 0],
      size: [0.25, 0.2, 0.25], hp: 70, critical: 'traverse' },
    gunner_sight: { label: 'gun sight', compartment: 'turret', pos: [-0.24, ht * 0.75, len * 0.20],
      size: [0.12, 0.12, 0.4], hp: 30, critical: 'optics' },
    fuel_l: { label: 'left fuel tank', compartment: 'engine_compartment', pos: [-wid * 0.32, ht * 0.28, engZ * 0.7],
      size: [wid * 0.16, ht * 0.28, len * 0.2], hp: 50, critical: 'fuel',
      fireRisk: opts.diesel ? 0.35 : 0.78, capacityL: opts.fuelPerTank ?? 200 },
    fuel_r: { label: 'right fuel tank', compartment: 'engine_compartment', pos: [wid * 0.32, ht * 0.28, engZ * 0.7],
      size: [wid * 0.16, ht * 0.28, len * 0.2], hp: 50, critical: 'fuel',
      fireRisk: opts.diesel ? 0.35 : 0.78, capacityL: opts.fuelPerTank ?? 200 },
    radio: { label: 'radio', compartment: 'hull', pos: [wid * 0.25, ht * 0.42, len * 0.30],
      size: [0.3, 0.2, 0.2], hp: 30, critical: 'comms' },
  };
}

function stdRacks(len, wid, ht, capacity) {
  const per = Math.ceil(capacity / 3);
  return [
    { id: 'floor', label: 'floor stowage', pos: [0, ht * 0.14, 0], size: [wid * 0.5, ht * 0.16, len * 0.4], capacity: capacity - per * 2 },
    { id: 'sponson_l', label: 'left stowage', pos: [-wid * 0.34, ht * 0.30, 0], size: [wid * 0.14, ht * 0.3, len * 0.4], capacity: per },
    { id: 'sponson_r', label: 'right stowage', pos: [wid * 0.34, ht * 0.30, 0], size: [wid * 0.14, ht * 0.3, len * 0.4], capacity: per },
  ];
}

const stdCompartments = {
  driver_compartment: { label: 'driver’s compartment', min: [-1.4, 0.3, 0.6], max: [1.4, 1.6, 3.2] },
  fighting_compartment: { label: 'fighting compartment', min: [-1.4, 0.3, -1.0], max: [1.4, 1.6, 1.0] },
  engine_compartment: { label: 'engine compartment', min: [-1.4, 0.3, -3.2], max: [1.4, 1.6, -0.9] },
  turret: { label: 'turret', min: [-0.9, 1.5, -0.8], max: [0.9, 2.4, 1.2] },
  hull: { label: 'hull', min: [-1.4, 0.3, -3.2], max: [1.4, 1.7, 3.2] },
};

// ===========================================================================
//  SOVIET
// ===========================================================================

export const T34_1943 = {
  id: 't34_43', designation: 'T-34 obr. 1943', short: 'T-34',
  faction: 'soviet', klass: 'medium', crew: 4,
  silhouette: 'medium tank, sloped glacis, hexagonal turret, two hatches',
  identifyDifficulty: 0.35,
  dims: { lengthWithGun: 6.75, hullLength: 6.10, width: 3.00, height: 2.60, groundClearance: 0.40, trackWidth: 0.50 },
  mass: { combat: 30900 },
  engine: { model: 'V-2-34 diesel V-12', powerPS: 500, powerRpm: 1800, governedRpm: 1700, idleRpm: 500, maxRpm: 1900,
    torqueCurve: [[500, 1400], [1200, 2100], [1800, 1950]] },
  transmission: { model: '4-speed', forwardGears: 4, reverseGears: 1, ratios: [7.4, 4.2, 2.8, 1.7], reverseRatios: [6.5], finalDrive: 5.7, shiftTimeS: 1.6 },
  suspension: { type: 'Christie', wheelDia: 0.83 },
  mobility: { maxSpeedRoad: 53 / 3.6, practicalRoad: 45 / 3.6, maxSpeedCross: 25 / 3.6, maxReverse: 7 / 3.6,
    fuelCapacityL: 610, consumptionRoadL100: 180, consumptionCrossL100: 320, rangeRoadKm: 300, rangeCrossKm: 220 },
  armament: { main: 'f34', coax: 'mg34', ammoCapacity: 100, mgAmmoCapacity: 2898,
    defaultLoadout: { br350b: 45, of350: 50, br350p: 5 } },
  optics: { gunner: 'TMFD-7 / PT4-7' },
  // The T-34's real flaw at Kursk: a two-man turret, so the commander also lays
  // the gun and cannot look for the next threat while he does it.
  crewFlaws: ['commander doubles as gunner', 'no cupola on many vehicles', 'poor vision'],
  ARMOUR: [
    P('t34_glacis', 'glacis', 45, [0, 1.15, 3.00], [0, c(30), s(30)], 1.45, 0.62, { behind: 'driver_compartment' }),
    P('t34_nose', 'nose', 45, [0, 0.55, 2.90], [0, -s(53), c(53)], 1.45, 0.35, { behind: 'driver_compartment' }),
    P('t34_driver_hatch', 'driver’s hatch', 45, [-0.50, 1.18, 3.02], [0, c(30), s(30)], 0.30, 0.24,
      { behind: 'driver_compartment', weakPoint: 'driver_hatch', quality: 0.82 }),
    P('t34_side_upper', 'left hull side', 45, [-1.42, 1.05, 0], [-c(40), s(40), 0], 2.60, 0.42, { behind: 'fighting_compartment' }),
    P('t34_side_upper_r', 'right hull side', 45, [1.42, 1.05, 0], [c(40), s(40), 0], 2.60, 0.42, { behind: 'fighting_compartment' }),
    P('t34_side_lower', 'left lower hull', 45, [-1.30, 0.60, 0], [-1, 0, 0], 2.80, 0.32, { behind: 'hull', screenedByRunningGear: true }),
    P('t34_side_lower_r', 'right lower hull', 45, [1.30, 0.60, 0], [1, 0, 0], 2.80, 0.32, { behind: 'hull', screenedByRunningGear: true }),
    P('t34_rear', 'hull rear', 45, [0, 1.00, -3.02], [0, s(47), -c(47)], 1.35, 0.55, { behind: 'engine_compartment' }),
    P('t34_roof', 'hull roof', 20, [0, 1.52, 1.20], [0, 1, 0], 1.45, 1.60, { behind: 'driver_compartment' }),
    P('t34_deck', 'engine deck', 20, [0, 1.50, -1.90], [0, 1, 0], 1.45, 1.10, { behind: 'engine_compartment' }),
    P('t34_floor', 'hull floor', 20, [0, 0.40, 0], [0, -1, 0], 1.20, 2.80, { behind: 'hull' }),
    P('t34_turret_front', 'turret front', 70, [0, 1.95, 0.90], [0, s(15), c(15)], 0.62, 0.30, { onTurret: true, ringZ: 0.20, behind: 'turret' }),
    P('t34_mantlet', 'mantlet', 90, [0, 1.93, 1.00], [0, 0, 1], 0.26, 0.24, { onTurret: true, ringZ: 0.20, behind: 'turret', curved: true }),
    P('t34_turret_side', 'turret side', 52, [-0.78, 1.95, 0.18], [-c(20), s(20), 0], 0.62, 0.30, { onTurret: true, ringZ: 0.20, behind: 'turret' }),
    P('t34_turret_side_r', 'turret side', 52, [0.78, 1.95, 0.18], [c(20), s(20), 0], 0.62, 0.30, { onTurret: true, ringZ: 0.20, behind: 'turret' }),
    P('t34_turret_rear', 'turret rear', 52, [0, 1.95, -0.52], [0, s(20), -c(20)], 0.58, 0.30, { onTurret: true, ringZ: 0.20, behind: 'turret' }),
    P('t34_turret_roof', 'turret roof', 20, [0, 2.28, 0.18], [0, 1, 0], 0.62, 0.62, { onTurret: true, ringZ: 0.20, behind: 'turret' }),
    P('t34_turret_ring', 'turret ring', 45, [0, 1.62, 0.20], [0, s(60), c(60)], 0.55, 0.10,
      { onTurret: false, behind: 'turret', weakPoint: 'turret_ring', quality: 0.75 }),
  ],
  COMPONENTS: stdComponents(6.10, 3.00, 2.60, { engineName: 'V-2-34 diesel', diesel: true, engineHp: 190, fuelPerTank: 200 }),
  AMMO_RACKS: stdRacks(6.10, 3.00, 2.60, 100),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.93, trunnionZ: 0.30, barrelLength: 3.162, turretCentreZ: 0.20 },
};

export const T70M = {
  id: 't70m', designation: 'T-70M', short: 'T-70',
  faction: 'soviet', klass: 'light', crew: 2, identifyDifficulty: 0.42,
  silhouette: 'small light tank, one-man turret, very low',
  dims: { lengthWithGun: 4.29, hullLength: 4.29, width: 2.42, height: 2.04, groundClearance: 0.30, trackWidth: 0.30 },
  mass: { combat: 9800 },
  engine: { model: 'GAZ-203 twin', powerPS: 140, powerRpm: 3400, governedRpm: 3200, idleRpm: 600, maxRpm: 3600,
    torqueCurve: [[600, 260], [2000, 380], [3400, 300]] },
  transmission: { model: '4-speed', forwardGears: 4, reverseGears: 1, ratios: [6.4, 3.1, 1.8, 1.0], reverseRatios: [7.8], finalDrive: 4.6, shiftTimeS: 1.2 },
  suspension: { type: 'torsion bar', wheelDia: 0.55 },
  mobility: { maxSpeedRoad: 45 / 3.6, practicalRoad: 40 / 3.6, maxSpeedCross: 20 / 3.6, maxReverse: 8 / 3.6,
    fuelCapacityL: 440, consumptionRoadL100: 120, consumptionCrossL100: 200, rangeRoadKm: 360, rangeCrossKm: 180 },
  armament: { main: 'k20', coax: 'mg34', ammoCapacity: 90, mgAmmoCapacity: 945,
    defaultLoadout: { br240: 45, of350: 45 } },
  crewFlaws: ['one-man turret — the commander loads, lays and fires alone'],
  ARMOUR: [
    P('t70_glacis', 'glacis', 45, [0, 0.85, 2.10], [0, c(30), s(30)], 1.15, 0.42, { behind: 'driver_compartment' }),
    P('t70_side', 'hull side', 35, [-1.18, 0.75, 0], [-1, 0, 0], 2.00, 0.35, { behind: 'fighting_compartment' }),
    P('t70_side_r', 'hull side', 35, [1.18, 0.75, 0], [1, 0, 0], 2.00, 0.35, { behind: 'fighting_compartment' }),
    P('t70_rear', 'hull rear', 25, [0, 0.75, -2.10], [0, 0, -1], 1.15, 0.35, { behind: 'engine_compartment' }),
    P('t70_roof', 'hull roof', 10, [0, 1.15, 0.5], [0, 1, 0], 1.15, 1.60, { behind: 'hull' }),
    P('t70_turret_front', 'turret front', 50, [0, 1.55, 0.42], [0, s(10), c(10)], 0.42, 0.26, { onTurret: true, ringZ: 0, behind: 'turret' }),
    P('t70_turret_side', 'turret side', 35, [-0.48, 1.55, 0], [-c(15), s(15), 0], 0.42, 0.26, { onTurret: true, ringZ: 0, behind: 'turret' }),
    P('t70_turret_side_r', 'turret side', 35, [0.48, 1.55, 0], [c(15), s(15), 0], 0.42, 0.26, { onTurret: true, ringZ: 0, behind: 'turret' }),
    P('t70_turret_rear', 'turret rear', 35, [0, 1.55, -0.42], [0, 0, -1], 0.40, 0.26, { onTurret: true, ringZ: 0, behind: 'turret' }),
    P('t70_turret_roof', 'turret roof', 10, [0, 1.82, 0], [0, 1, 0], 0.42, 0.42, { onTurret: true, ringZ: 0, behind: 'turret' }),
  ],
  COMPONENTS: stdComponents(4.29, 2.42, 2.04, { engineName: 'GAZ-203', engineHp: 110, fuelPerTank: 150 }),
  AMMO_RACKS: stdRacks(4.29, 2.42, 2.04, 90),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.55, trunnionZ: 0.2, barrelLength: 2.07, turretCentreZ: 0 },
};

export const KV1S = {
  id: 'kv1s', designation: 'KV-1s', short: 'KV-1s',
  faction: 'soviet', klass: 'heavy', crew: 5, identifyDifficulty: 0.30,
  silhouette: 'large slab-sided heavy tank, long hull, cast turret',
  dims: { lengthWithGun: 6.90, hullLength: 6.80, width: 3.25, height: 2.64, groundClearance: 0.45, trackWidth: 0.61 },
  mass: { combat: 42500 },
  engine: { model: 'V-2K diesel', powerPS: 600, powerRpm: 2000, governedRpm: 1900, idleRpm: 500, maxRpm: 2100,
    torqueCurve: [[500, 1700], [1400, 2500], [2000, 2200]] },
  transmission: { model: '8-speed', forwardGears: 8, reverseGears: 2, ratios: [9.2, 6.1, 4.2, 3.0, 2.2, 1.7, 1.3, 1.0], reverseRatios: [8.0, 3.5], finalDrive: 6.2, shiftTimeS: 1.4 },
  suspension: { type: 'torsion bar', wheelDia: 0.60 },
  mobility: { maxSpeedRoad: 43 / 3.6, practicalRoad: 38 / 3.6, maxSpeedCross: 20 / 3.6, maxReverse: 8 / 3.6,
    fuelCapacityL: 600, consumptionRoadL100: 220, consumptionCrossL100: 400, rangeRoadKm: 250, rangeCrossKm: 150 },
  armament: { main: 'zis5', coax: 'mg34', ammoCapacity: 114, mgAmmoCapacity: 3000,
    defaultLoadout: { br350b: 50, of350: 64 } },
  ARMOUR: [
    P('kv_glacis', 'glacis', 75, [0, 1.20, 3.30], [0, c(30), s(30)], 1.55, 0.55, { behind: 'driver_compartment' }),
    P('kv_nose', 'nose', 75, [0, 0.65, 3.20], [0, -s(35), c(35)], 1.55, 0.40, { behind: 'driver_compartment' }),
    P('kv_side', 'hull side', 60, [-1.55, 1.05, 0], [-1, 0, 0], 3.10, 0.45, { behind: 'fighting_compartment' }),
    P('kv_side_r', 'hull side', 60, [1.55, 1.05, 0], [1, 0, 0], 3.10, 0.45, { behind: 'fighting_compartment' }),
    P('kv_rear', 'hull rear', 60, [0, 1.05, -3.35], [0, 0, -1], 1.50, 0.45, { behind: 'engine_compartment' }),
    P('kv_roof', 'hull roof', 30, [0, 1.55, 1.0], [0, 1, 0], 1.55, 1.80, { behind: 'hull' }),
    P('kv_turret_front', 'turret front', 82, [0, 2.05, 0.85], [0, 0, 1], 0.72, 0.34, { onTurret: true, ringZ: 0.10, behind: 'turret', curved: true }),
    P('kv_mantlet', 'mantlet', 100, [0, 2.03, 0.95], [0, 0, 1], 0.28, 0.26, { onTurret: true, ringZ: 0.10, behind: 'turret', curved: true }),
    P('kv_turret_side', 'turret side', 75, [-0.88, 2.05, 0.10], [-c(15), s(15), 0], 0.72, 0.34, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('kv_turret_side_r', 'turret side', 75, [0.88, 2.05, 0.10], [c(15), s(15), 0], 0.72, 0.34, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('kv_turret_rear', 'turret rear', 75, [0, 2.05, -0.68], [0, 0, -1], 0.68, 0.34, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('kv_turret_roof', 'turret roof', 30, [0, 2.42, 0.10], [0, 1, 0], 0.72, 0.72, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
  ],
  COMPONENTS: stdComponents(6.80, 3.25, 2.64, { engineName: 'V-2K diesel', diesel: true, engineHp: 210, fuelPerTank: 200 }),
  AMMO_RACKS: stdRacks(6.80, 3.25, 2.64, 114),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 2.03, trunnionZ: 0.25, barrelLength: 3.162, turretCentreZ: 0.10 },
};

export const SU122 = {
  id: 'su122', designation: 'SU-122', short: 'SU-122',
  faction: 'soviet', klass: 'assault gun', crew: 5, identifyDifficulty: 0.48,
  silhouette: 'turretless assault gun on a T-34 hull, short fat howitzer',
  dims: { lengthWithGun: 6.95, hullLength: 6.10, width: 3.00, height: 2.32, groundClearance: 0.40, trackWidth: 0.50 },
  mass: { combat: 30900 },
  engine: { model: 'V-2-34 diesel', powerPS: 500, powerRpm: 1800, governedRpm: 1700, idleRpm: 500, maxRpm: 1900,
    torqueCurve: [[500, 1400], [1200, 2100], [1800, 1950]] },
  transmission: { model: '4-speed', forwardGears: 4, reverseGears: 1, ratios: [7.4, 4.2, 2.8, 1.7], reverseRatios: [6.5], finalDrive: 5.7, shiftTimeS: 1.6 },
  suspension: { type: 'Christie', wheelDia: 0.83 },
  mobility: { maxSpeedRoad: 45 / 3.6, practicalRoad: 38 / 3.6, maxSpeedCross: 20 / 3.6, maxReverse: 7 / 3.6,
    fuelCapacityL: 610, consumptionRoadL100: 190, consumptionCrossL100: 340, rangeRoadKm: 300, rangeCrossKm: 180 },
  armament: { main: 'm30s', ammoCapacity: 40, mgAmmoCapacity: 0,
    defaultLoadout: { of462: 30, bp460a: 10 } },
  fixedGun: { traverseLimit: 10 * DEG },
  ARMOUR: [
    P('su122_front', 'casemate front', 45, [0, 1.35, 2.60], [0, c(40), s(40)], 1.40, 0.70, { behind: 'fighting_compartment' }),
    P('su122_glacis', 'glacis', 45, [0, 0.70, 2.95], [0, -s(50), c(50)], 1.40, 0.40, { behind: 'driver_compartment' }),
    P('su122_side', 'casemate side', 45, [-1.40, 1.20, 0.4], [-c(70), s(20), 0], 1.90, 0.55, { behind: 'fighting_compartment' }),
    P('su122_side_r', 'casemate side', 45, [1.40, 1.20, 0.4], [c(70), s(20), 0], 1.90, 0.55, { behind: 'fighting_compartment' }),
    P('su122_lower_side', 'hull side', 45, [-1.42, 0.60, 0], [-1, 0, 0], 2.80, 0.35, { behind: 'hull', screenedByRunningGear: true }),
    P('su122_lower_side_r', 'hull side', 45, [1.42, 0.60, 0], [1, 0, 0], 2.80, 0.35, { behind: 'hull', screenedByRunningGear: true }),
    P('su122_rear', 'rear', 40, [0, 1.05, -3.02], [0, s(45), -c(45)], 1.35, 0.55, { behind: 'engine_compartment' }),
    P('su122_roof', 'casemate roof', 20, [0, 1.95, 0.9], [0, 1, 0], 1.30, 1.10, { behind: 'fighting_compartment' }),
  ],
  COMPONENTS: stdComponents(6.10, 3.00, 2.32, { engineName: 'V-2-34 diesel', diesel: true, engineHp: 190, fuelPerTank: 200 }),
  AMMO_RACKS: stdRacks(6.10, 3.00, 2.32, 40),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.30, trunnionZ: 1.9, barrelLength: 2.8, turretCentreZ: 1.9 },
};

export const SU152 = {
  id: 'su152', designation: 'SU-152', short: 'SU-152',
  faction: 'soviet', klass: 'assault gun', crew: 5, identifyDifficulty: 0.38,
  silhouette: 'enormous boxy casemate on a KV hull, huge gun with a muzzle brake',
  nickname: 'Zveroboy',
  dims: { lengthWithGun: 8.95, hullLength: 6.75, width: 3.25, height: 2.45, groundClearance: 0.44, trackWidth: 0.61 },
  mass: { combat: 45500 },
  engine: { model: 'V-2K diesel', powerPS: 600, powerRpm: 2000, governedRpm: 1900, idleRpm: 500, maxRpm: 2100,
    torqueCurve: [[500, 1700], [1400, 2500], [2000, 2200]] },
  transmission: { model: '8-speed', forwardGears: 8, reverseGears: 2, ratios: [9.2, 6.1, 4.2, 3.0, 2.2, 1.7, 1.3, 1.0], reverseRatios: [8.0, 3.5], finalDrive: 6.2, shiftTimeS: 1.5 },
  suspension: { type: 'torsion bar', wheelDia: 0.60 },
  mobility: { maxSpeedRoad: 43 / 3.6, practicalRoad: 35 / 3.6, maxSpeedCross: 18 / 3.6, maxReverse: 7 / 3.6,
    fuelCapacityL: 600, consumptionRoadL100: 240, consumptionCrossL100: 430, rangeRoadKm: 250, rangeCrossKm: 140 },
  armament: { main: 'ml20s', ammoCapacity: 20, mgAmmoCapacity: 0,
    defaultLoadout: { br540: 8, of540: 12 } },
  fixedGun: { traverseLimit: 6 * DEG },
  ARMOUR: [
    P('su152_front', 'casemate front', 75, [0, 1.45, 2.90], [0, c(60), s(60)], 1.50, 0.65, { behind: 'fighting_compartment' }),
    P('su152_mantlet', 'gun mantlet', 90, [0, 1.35, 3.05], [0, 0, 1], 0.45, 0.40, { behind: 'fighting_compartment', curved: true }),
    P('su152_side', 'casemate side', 60, [-1.55, 1.55, 0.5], [-1, 0, 0], 2.00, 0.55, { behind: 'fighting_compartment' }),
    P('su152_side_r', 'casemate side', 60, [1.55, 1.55, 0.5], [1, 0, 0], 2.00, 0.55, { behind: 'fighting_compartment' }),
    P('su152_lower', 'hull side', 60, [-1.55, 0.70, 0], [-1, 0, 0], 3.05, 0.35, { behind: 'hull', screenedByRunningGear: true }),
    P('su152_lower_r', 'hull side', 60, [1.55, 0.70, 0], [1, 0, 0], 3.05, 0.35, { behind: 'hull', screenedByRunningGear: true }),
    P('su152_rear', 'rear', 60, [0, 1.20, -3.32], [0, 0, -1], 1.50, 0.60, { behind: 'engine_compartment' }),
    P('su152_roof', 'casemate roof', 30, [0, 2.20, 1.0], [0, 1, 0], 1.45, 1.20, { behind: 'fighting_compartment' }),
  ],
  COMPONENTS: stdComponents(6.75, 3.25, 2.45, { engineName: 'V-2K diesel', diesel: true, engineHp: 210, fuelPerTank: 200 }),
  AMMO_RACKS: stdRacks(6.75, 3.25, 2.45, 20),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.35, trunnionZ: 2.4, barrelLength: 4.24, turretCentreZ: 2.4 },
};

export const SU76M = {
  id: 'su76m', designation: 'SU-76M', short: 'SU-76',
  faction: 'soviet', klass: 'assault gun', crew: 4, identifyDifficulty: 0.50,
  silhouette: 'small open-topped self-propelled gun, thin armour',
  dims: { lengthWithGun: 4.88, hullLength: 4.88, width: 2.73, height: 2.17, groundClearance: 0.30, trackWidth: 0.30 },
  mass: { combat: 10600 },
  engine: { model: 'GAZ-203 twin', powerPS: 140, powerRpm: 3400, governedRpm: 3200, idleRpm: 600, maxRpm: 3600,
    torqueCurve: [[600, 260], [2000, 380], [3400, 300]] },
  transmission: { model: '4-speed', forwardGears: 4, reverseGears: 1, ratios: [6.4, 3.1, 1.8, 1.0], reverseRatios: [7.8], finalDrive: 4.6, shiftTimeS: 1.3 },
  suspension: { type: 'torsion bar', wheelDia: 0.55 },
  mobility: { maxSpeedRoad: 45 / 3.6, practicalRoad: 38 / 3.6, maxSpeedCross: 18 / 3.6, maxReverse: 7 / 3.6,
    fuelCapacityL: 412, consumptionRoadL100: 120, consumptionCrossL100: 220, rangeRoadKm: 320, rangeCrossKm: 190 },
  armament: { main: 'zis3', ammoCapacity: 60, mgAmmoCapacity: 0, defaultLoadout: { br350b: 25, of350: 33, br350p: 2 } },
  fixedGun: { traverseLimit: 15 * DEG },
  openTopped: true,
  ARMOUR: [
    P('su76_front', 'front', 35, [0, 0.95, 2.35], [0, c(30), s(30)], 1.25, 0.45, { behind: 'fighting_compartment' }),
    P('su76_side', 'side', 16, [-1.30, 1.10, 0.2], [-1, 0, 0], 1.60, 0.50, { behind: 'fighting_compartment' }),
    P('su76_side_r', 'side', 16, [1.30, 1.10, 0.2], [1, 0, 0], 1.60, 0.50, { behind: 'fighting_compartment' }),
    P('su76_lower', 'hull side', 15, [-1.25, 0.60, 0], [-1, 0, 0], 2.30, 0.30, { behind: 'hull' }),
    P('su76_lower_r', 'hull side', 15, [1.25, 0.60, 0], [1, 0, 0], 2.30, 0.30, { behind: 'hull' }),
    P('su76_rear', 'rear', 15, [0, 0.90, -2.40], [0, 0, -1], 1.25, 0.45, { behind: 'hull' }),
  ],
  COMPONENTS: stdComponents(4.88, 2.73, 2.17, { engineName: 'GAZ-203', engineFront: true, engineHp: 100, fuelPerTank: 130 }),
  AMMO_RACKS: stdRacks(4.88, 2.73, 2.17, 60),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.20, trunnionZ: 1.4, barrelLength: 3.4, turretCentreZ: 1.4 },
};

/** Towed guns. Dug in, hard to see, and their crews do not run. */
export const ZIS3_ATG = {
  id: 'zis3_atg', designation: '76,2 mm ZiS-3 divisional gun', short: 'ZiS-3',
  faction: 'soviet', klass: 'anti-tank gun', crew: 6, identifyDifficulty: 0.72,
  silhouette: 'low towed gun behind a shield, usually dug in',
  static: true, concealment: 0.72,
  dims: { lengthWithGun: 6.10, hullLength: 2.20, width: 1.65, height: 1.37, groundClearance: 0.35 },
  mass: { combat: 1200 },
  armament: { main: 'zis3', ammoCapacity: 60, defaultLoadout: { br350b: 22, of350: 34, br350p: 4 } },
  fixedGun: { traverseLimit: 27 * DEG },
  ARMOUR: [
    P('zis3_shield', 'gun shield', 5, [0, 0.75, 0.55], [0, s(20), c(20)], 0.85, 0.45, { behind: 'hull', quality: 0.9 }),
    P('zis3_carriage', 'carriage', 4, [0, 0.35, 0], [0, 1, 0], 0.80, 1.00, { behind: 'hull' }),
  ],
  COMPONENTS: {
    main_gun: { label: 'gun', compartment: 'hull', pos: [0, 0.8, 1.2], size: [0.2, 0.2, 2.0], hp: 60, critical: 'firepower' },
    breech: { label: 'breech', compartment: 'hull', pos: [0, 0.8, 0.2], size: [0.3, 0.3, 0.3], hp: 45, critical: 'firepower' },
    gunner_sight: { label: 'sight', compartment: 'hull', pos: [-0.3, 0.9, 0.4], size: [0.1, 0.1, 0.2], hp: 15, critical: 'optics' },
  },
  AMMO_RACKS: [{ id: 'ready', label: 'ready rounds', pos: [0.8, 0.3, -0.5], size: [0.6, 0.4, 0.8], capacity: 60 }],
  COMPARTMENTS: { hull: { label: 'gun position', min: [-1, 0, -1.5], max: [1, 1.5, 1.5] } },
  L: { trunnionY: 0.85, trunnionZ: 0.3, barrelLength: 3.4, turretCentreZ: 0 },
};

export const K53_ATG = {
  ...ZIS3_ATG,
  id: 'k53_atg', designation: '45 mm 53-K anti-tank gun', short: '45 mm Pak',
  identifyDifficulty: 0.78, concealment: 0.80,
  dims: { lengthWithGun: 4.26, hullLength: 1.80, width: 1.37, height: 1.20, groundClearance: 0.30 },
  armament: { main: 'k53', ammoCapacity: 60, defaultLoadout: { br240: 60 } },
  L: { trunnionY: 0.72, trunnionZ: 0.25, barrelLength: 2.07, turretCentreZ: 0 },
};

export const K52_AA = {
  ...ZIS3_ATG,
  id: 'k52_aa', designation: '85 mm 52-K, direct fire', short: '85 mm AA gun',
  identifyDifficulty: 0.62, concealment: 0.58,
  silhouette: 'tall anti-aircraft gun on a cruciform mount, laid flat',
  dims: { lengthWithGun: 7.05, hullLength: 2.60, width: 2.15, height: 2.25, groundClearance: 0.40 },
  armament: { main: 'k52', ammoCapacity: 48, defaultLoadout: { br365: 28, of350: 20 } },
  fixedGun: { traverseLimit: Math.PI },
  L: { trunnionY: 1.35, trunnionZ: 0.3, barrelLength: 4.693, turretCentreZ: 0 },
  threatNote: 'This gun will go through a Tiger’s front plate at a kilometre. Kill it first.',
};

// ===========================================================================
//  GERMAN — friendly units
// ===========================================================================

export const PZ4_H = {
  id: 'pz4h', designation: 'Panzerkampfwagen IV Ausf. H', short: 'Panzer IV',
  faction: 'german', klass: 'medium', crew: 5, identifyDifficulty: 0.25,
  silhouette: 'boxy medium tank with schürzen skirts and a long 7.5 cm',
  dims: { lengthWithGun: 7.02, hullLength: 5.92, width: 2.88, height: 2.68, groundClearance: 0.40, trackWidth: 0.40 },
  mass: { combat: 25000 },
  engine: { model: 'Maybach HL 120 TRM', powerPS: 265, powerRpm: 2600, governedRpm: 2500, idleRpm: 550, maxRpm: 2800,
    torqueCurve: [[550, 620], [1800, 830], [2600, 720]] },
  transmission: { model: 'ZF SSG 77', forwardGears: 6, reverseGears: 1, ratios: [7.5, 4.4, 2.9, 2.0, 1.4, 1.0], reverseRatios: [7.0], finalDrive: 7.2, shiftTimeS: 1.0 },
  suspension: { type: 'leaf spring bogie', wheelDia: 0.47 },
  mobility: { maxSpeedRoad: 38 / 3.6, practicalRoad: 34 / 3.6, maxSpeedCross: 16 / 3.6, maxReverse: 9 / 3.6,
    fuelCapacityL: 470, consumptionRoadL100: 180, consumptionCrossL100: 320, rangeRoadKm: 210, rangeCrossKm: 130 },
  armament: { main: 'kwk40l48', coax: 'mg34', ammoCapacity: 87, mgAmmoCapacity: 3150,
    defaultLoadout: { pzgr39: 45, sprgr39: 42 } },
  ARMOUR: [
    P('pz4_front', 'hull front', 80, [0, 1.15, 2.95], [0, s(10), c(10)], 1.40, 0.50, { behind: 'driver_compartment' }),
    P('pz4_side', 'hull side', 30, [-1.44, 1.10, 0], [-1, 0, 0], 2.60, 0.42, { behind: 'fighting_compartment' }),
    P('pz4_side_r', 'hull side', 30, [1.44, 1.10, 0], [1, 0, 0], 2.60, 0.42, { behind: 'fighting_compartment' }),
    P('pz4_rear', 'hull rear', 20, [0, 1.05, -2.95], [0, 0, -1], 1.40, 0.45, { behind: 'engine_compartment' }),
    P('pz4_roof', 'hull roof', 12, [0, 1.55, 1.0], [0, 1, 0], 1.40, 1.60, { behind: 'hull' }),
    P('pz4_turret_front', 'turret front', 50, [0, 2.05, 0.95], [0, 0, 1], 0.70, 0.32, { onTurret: true, ringZ: 0.15, behind: 'turret' }),
    P('pz4_turret_side', 'turret side', 30, [-0.82, 2.05, 0.15], [-c(15), s(15), 0], 0.70, 0.32, { onTurret: true, ringZ: 0.15, behind: 'turret' }),
    P('pz4_turret_side_r', 'turret side', 30, [0.82, 2.05, 0.15], [c(15), s(15), 0], 0.70, 0.32, { onTurret: true, ringZ: 0.15, behind: 'turret' }),
    P('pz4_turret_rear', 'turret rear', 30, [0, 2.05, -0.65], [0, 0, -1], 0.68, 0.32, { onTurret: true, ringZ: 0.15, behind: 'turret' }),
    P('pz4_turret_roof', 'turret roof', 16, [0, 2.40, 0.15], [0, 1, 0], 0.70, 0.70, { onTurret: true, ringZ: 0.15, behind: 'turret' }),
  ],
  COMPONENTS: stdComponents(5.92, 2.88, 2.68, { engineName: 'HL 120 TRM', engineHp: 160, fuelPerTank: 160 }),
  AMMO_RACKS: stdRacks(5.92, 2.88, 2.68, 87),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 2.05, trunnionZ: 0.35, barrelLength: 3.6, turretCentreZ: 0.15 },
  schurzen: true,
};

export const PZ3_M = {
  id: 'pz3m', designation: 'Panzerkampfwagen III Ausf. M', short: 'Panzer III',
  faction: 'german', klass: 'medium', crew: 5, identifyDifficulty: 0.28,
  silhouette: 'medium tank, six road wheels, 5 cm gun',
  dims: { lengthWithGun: 6.41, hullLength: 5.56, width: 2.95, height: 2.50, groundClearance: 0.38, trackWidth: 0.40 },
  mass: { combat: 22700 },
  engine: { model: 'Maybach HL 120 TRM', powerPS: 265, powerRpm: 2600, governedRpm: 2500, idleRpm: 550, maxRpm: 2800,
    torqueCurve: [[550, 620], [1800, 830], [2600, 720]] },
  transmission: { model: 'SSG 77', forwardGears: 6, reverseGears: 1, ratios: [7.5, 4.4, 2.9, 2.0, 1.4, 1.0], reverseRatios: [7.0], finalDrive: 7.0, shiftTimeS: 1.0 },
  suspension: { type: 'torsion bar', wheelDia: 0.52 },
  mobility: { maxSpeedRoad: 40 / 3.6, practicalRoad: 36 / 3.6, maxSpeedCross: 18 / 3.6, maxReverse: 9 / 3.6,
    fuelCapacityL: 320, consumptionRoadL100: 170, consumptionCrossL100: 300, rangeRoadKm: 155, rangeCrossKm: 95 },
  armament: { main: 'kwk39l60', coax: 'mg34', ammoCapacity: 84, mgAmmoCapacity: 3750,
    defaultLoadout: { pzgr39: 40, sprgr39: 44 } },
  ARMOUR: [
    P('pz3_front', 'hull front', 50, [0, 1.10, 2.78], [0, s(10), c(10)], 1.45, 0.48, { behind: 'driver_compartment' }),
    P('pz3_side', 'hull side', 30, [-1.47, 1.05, 0], [-1, 0, 0], 2.50, 0.40, { behind: 'fighting_compartment' }),
    P('pz3_side_r', 'hull side', 30, [1.47, 1.05, 0], [1, 0, 0], 2.50, 0.40, { behind: 'fighting_compartment' }),
    P('pz3_rear', 'hull rear', 50, [0, 1.00, -2.78], [0, 0, -1], 1.45, 0.42, { behind: 'engine_compartment' }),
    P('pz3_turret_front', 'turret front', 57, [0, 1.95, 0.90], [0, 0, 1], 0.66, 0.30, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('pz3_turret_side', 'turret side', 30, [-0.78, 1.95, 0.10], [-1, 0, 0], 0.66, 0.30, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('pz3_turret_side_r', 'turret side', 30, [0.78, 1.95, 0.10], [1, 0, 0], 0.66, 0.30, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('pz3_turret_rear', 'turret rear', 30, [0, 1.95, -0.62], [0, 0, -1], 0.64, 0.30, { onTurret: true, ringZ: 0.10, behind: 'turret' }),
    P('pz3_roof', 'roof', 12, [0, 1.50, 0.8], [0, 1, 0], 1.40, 1.50, { behind: 'hull' }),
  ],
  COMPONENTS: stdComponents(5.56, 2.95, 2.50, { engineName: 'HL 120 TRM', engineHp: 150, fuelPerTank: 110 }),
  AMMO_RACKS: stdRacks(5.56, 2.95, 2.50, 84),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.95, trunnionZ: 0.30, barrelLength: 3.0, turretCentreZ: 0.10 },
};

export const STUG3_G = {
  id: 'stug3g', designation: 'Sturmgeschütz III Ausf. G', short: 'StuG III',
  faction: 'german', klass: 'assault gun', crew: 4, identifyDifficulty: 0.40,
  silhouette: 'very low turretless assault gun, long 7.5 cm',
  dims: { lengthWithGun: 6.85, hullLength: 5.56, width: 2.95, height: 2.16, groundClearance: 0.38, trackWidth: 0.40 },
  mass: { combat: 23900 },
  engine: { model: 'Maybach HL 120 TRM', powerPS: 265, powerRpm: 2600, governedRpm: 2500, idleRpm: 550, maxRpm: 2800,
    torqueCurve: [[550, 620], [1800, 830], [2600, 720]] },
  transmission: { model: 'SSG 77', forwardGears: 6, reverseGears: 1, ratios: [7.5, 4.4, 2.9, 2.0, 1.4, 1.0], reverseRatios: [7.0], finalDrive: 7.0, shiftTimeS: 1.0 },
  suspension: { type: 'torsion bar', wheelDia: 0.52 },
  mobility: { maxSpeedRoad: 40 / 3.6, practicalRoad: 34 / 3.6, maxSpeedCross: 17 / 3.6, maxReverse: 9 / 3.6,
    fuelCapacityL: 310, consumptionRoadL100: 175, consumptionCrossL100: 310, rangeRoadKm: 155, rangeCrossKm: 95 },
  armament: { main: 'kwk40l48', ammoCapacity: 54, mgAmmoCapacity: 600, defaultLoadout: { pzgr39: 26, sprgr39: 28 } },
  fixedGun: { traverseLimit: 12 * DEG },
  ARMOUR: [
    P('stug_front', 'superstructure front', 80, [0, 1.20, 2.72], [0, s(21), c(21)], 1.45, 0.45, { behind: 'fighting_compartment' }),
    P('stug_mantlet', 'Saukopf mantlet', 80, [0, 1.25, 2.85], [0, 0, 1], 0.30, 0.28, { behind: 'fighting_compartment', curved: true }),
    P('stug_side', 'side', 30, [-1.45, 1.25, 0.3], [-1, 0, 0], 1.90, 0.42, { behind: 'fighting_compartment' }),
    P('stug_side_r', 'side', 30, [1.45, 1.25, 0.3], [1, 0, 0], 1.90, 0.42, { behind: 'fighting_compartment' }),
    P('stug_lower', 'hull side', 30, [-1.45, 0.65, 0], [-1, 0, 0], 2.50, 0.32, { behind: 'hull', screenedByRunningGear: true }),
    P('stug_lower_r', 'hull side', 30, [1.45, 0.65, 0], [1, 0, 0], 2.50, 0.32, { behind: 'hull', screenedByRunningGear: true }),
    P('stug_rear', 'rear', 50, [0, 1.00, -2.78], [0, 0, -1], 1.45, 0.42, { behind: 'engine_compartment' }),
    P('stug_roof', 'roof', 16, [0, 1.75, 0.9], [0, 1, 0], 1.40, 1.20, { behind: 'fighting_compartment' }),
  ],
  COMPONENTS: stdComponents(5.56, 2.95, 2.16, { engineName: 'HL 120 TRM', engineHp: 150, fuelPerTank: 110 }),
  AMMO_RACKS: stdRacks(5.56, 2.95, 2.16, 54),
  COMPARTMENTS: stdCompartments,
  L: { trunnionY: 1.25, trunnionZ: 1.9, barrelLength: 3.6, turretCentreZ: 1.9 },
};

/** Sd.Kfz. 9 FAMO — the 18-tonne half-track. It took three of these to move a Tiger. */
export const FAMO = {
  id: 'famo', designation: 'Sd.Kfz. 9 (FAMO) 18-t Zugkraftwagen', short: 'Famo',
  faction: 'german', klass: 'recovery', crew: 2, identifyDifficulty: 0.30,
  silhouette: 'large half-track prime mover with a long open cargo body',
  isRecovery: true, towCapacityTonnes: 22,
  dims: { lengthWithGun: 8.32, hullLength: 8.32, width: 2.60, height: 2.76, groundClearance: 0.44, trackWidth: 0.44 },
  mass: { combat: 18000 },
  engine: { model: 'Maybach HL 108 TUKRM', powerPS: 250, powerRpm: 2600, governedRpm: 2400, idleRpm: 500, maxRpm: 2800,
    torqueCurve: [[500, 580], [1600, 780], [2600, 660]] },
  transmission: { model: 'ZF Aphon', forwardGears: 4, reverseGears: 1, ratios: [6.5, 3.5, 2.0, 1.0], reverseRatios: [6.0], finalDrive: 6.0, shiftTimeS: 1.2 },
  suspension: { type: 'half-track', wheelDia: 0.70 },
  mobility: { maxSpeedRoad: 50 / 3.6, practicalRoad: 30 / 3.6, maxSpeedCross: 12 / 3.6, maxReverse: 6 / 3.6,
    fuelCapacityL: 290, consumptionRoadL100: 200, consumptionCrossL100: 380, rangeRoadKm: 145, rangeCrossKm: 75 },
  armament: null,
  ARMOUR: [
    P('famo_front', 'engine cover', 6, [0, 1.30, 3.60], [0, s(20), c(20)], 1.20, 0.60, { behind: 'hull', quality: 0.85 }),
    P('famo_side', 'body side', 4, [-1.28, 1.30, 0], [-1, 0, 0], 3.80, 0.60, { behind: 'hull', quality: 0.85 }),
    P('famo_side_r', 'body side', 4, [1.28, 1.30, 0], [1, 0, 0], 3.80, 0.60, { behind: 'hull', quality: 0.85 }),
    P('famo_rear', 'rear', 4, [0, 1.20, -4.10], [0, 0, -1], 1.25, 0.55, { behind: 'hull', quality: 0.85 }),
  ],
  COMPONENTS: {
    engine: { label: 'HL 108 engine', compartment: 'hull', pos: [0, 1.0, 3.0], size: [1.0, 0.8, 1.4], hp: 90, critical: 'mobility', fireRisk: 0.55, fuelAdjacent: true },
    track_l: { label: 'left track', external: true, pos: [-1.1, 0.5, -1.5], size: [0.4, 0.9, 3.0], hp: 45, critical: 'mobility_half' },
    track_r: { label: 'right track', external: true, pos: [1.1, 0.5, -1.5], size: [0.4, 0.9, 3.0], hp: 45, critical: 'mobility_half' },
    winch: { label: 'recovery winch', compartment: 'hull', pos: [0, 1.0, -2.0], size: [1.0, 0.6, 1.0], hp: 60, critical: 'recovery' },
    fuel_l: { label: 'fuel tank', compartment: 'hull', pos: [-0.9, 0.9, -3.0], size: [0.5, 0.5, 0.8], hp: 30, critical: 'fuel', fireRisk: 0.8, capacityL: 290 },
  },
  AMMO_RACKS: [],
  COMPARTMENTS: { hull: { label: 'hull', min: [-1.3, 0.4, -4.2], max: [1.3, 2.0, 4.2] } },
  L: { trunnionY: 1.0, trunnionZ: 0, barrelLength: 0, turretCentreZ: 0 },
};

export const SDKFZ251 = {
  id: 'sdkfz251', designation: 'Sd.Kfz. 251 Ausf. C', short: 'Schützenpanzerwagen',
  faction: 'german', klass: 'halftrack', crew: 2, passengers: 10, identifyDifficulty: 0.32,
  silhouette: 'angular armoured half-track, open top',
  dims: { lengthWithGun: 5.80, hullLength: 5.80, width: 2.10, height: 1.75, groundClearance: 0.32, trackWidth: 0.28 },
  mass: { combat: 8000 },
  engine: { model: 'Maybach HL 42 TUKRM', powerPS: 100, powerRpm: 2800, governedRpm: 2600, idleRpm: 550, maxRpm: 3000,
    torqueCurve: [[550, 230], [1800, 320], [2800, 260]] },
  transmission: { model: 'ZF SSG 46', forwardGears: 4, reverseGears: 1, ratios: [6.0, 3.2, 1.8, 1.0], reverseRatios: [5.5], finalDrive: 5.0, shiftTimeS: 1.0 },
  suspension: { type: 'half-track', wheelDia: 0.55 },
  mobility: { maxSpeedRoad: 52 / 3.6, practicalRoad: 40 / 3.6, maxSpeedCross: 20 / 3.6, maxReverse: 8 / 3.6,
    fuelCapacityL: 160, consumptionRoadL100: 90, consumptionCrossL100: 170, rangeRoadKm: 300, rangeCrossKm: 150 },
  armament: null, openTopped: true,
  ARMOUR: [
    P('251_front', 'front', 14.5, [0, 1.05, 2.85], [0, s(25), c(25)], 1.05, 0.45, { behind: 'hull' }),
    P('251_side', 'side', 8, [-1.03, 1.05, 0], [-c(65), s(25), 0], 2.50, 0.45, { behind: 'hull' }),
    P('251_side_r', 'side', 8, [1.03, 1.05, 0], [c(65), s(25), 0], 2.50, 0.45, { behind: 'hull' }),
    P('251_rear', 'rear', 8, [0, 1.00, -2.85], [0, 0, -1], 1.00, 0.45, { behind: 'hull' }),
  ],
  COMPONENTS: {
    engine: { label: 'HL 42 engine', compartment: 'hull', pos: [0, 0.8, 2.2], size: [0.8, 0.6, 1.0], hp: 60, critical: 'mobility', fireRisk: 0.5, fuelAdjacent: true },
    track_l: { label: 'left track', external: true, pos: [-0.9, 0.4, -1.2], size: [0.3, 0.7, 2.4], hp: 35, critical: 'mobility_half' },
    track_r: { label: 'right track', external: true, pos: [0.9, 0.4, -1.2], size: [0.3, 0.7, 2.4], hp: 35, critical: 'mobility_half' },
  },
  AMMO_RACKS: [],
  COMPARTMENTS: { hull: { label: 'hull', min: [-1.05, 0.3, -2.9], max: [1.05, 1.6, 2.9] } },
  L: { trunnionY: 1.0, trunnionZ: 0, barrelLength: 0, turretCentreZ: 0 },
};

export const OPEL_BLITZ = {
  id: 'opel_blitz', designation: 'Opel Blitz 3-t', short: 'supply truck',
  faction: 'german', klass: 'truck', crew: 2, identifyDifficulty: 0.20,
  silhouette: 'three-tonne cargo truck with a canvas tilt',
  isSupply: true,
  dims: { lengthWithGun: 6.02, hullLength: 6.02, width: 2.27, height: 2.18, groundClearance: 0.24 },
  mass: { combat: 3300 },
  engine: { model: 'Opel 3.6 L petrol', powerPS: 75, powerRpm: 3000, governedRpm: 2800, idleRpm: 500, maxRpm: 3200,
    torqueCurve: [[500, 150], [1800, 210], [3000, 180]] },
  transmission: { model: '5-speed', forwardGears: 5, reverseGears: 1, ratios: [6.4, 3.1, 1.8, 1.2, 1.0], reverseRatios: [6.0], finalDrive: 6.6, shiftTimeS: 0.8 },
  suspension: { type: 'wheeled', wheelDia: 0.9 },
  mobility: { maxSpeedRoad: 80 / 3.6, practicalRoad: 55 / 3.6, maxSpeedCross: 12 / 3.6, maxReverse: 10 / 3.6,
    fuelCapacityL: 82, consumptionRoadL100: 25, consumptionCrossL100: 45, rangeRoadKm: 320, rangeCrossKm: 180 },
  armament: null,
  ARMOUR: [
    P('truck_body', 'truck body', 1, [0, 1.1, 0], [0, 1, 0], 1.1, 3.0, { behind: 'hull', quality: 0.5 }),
  ],
  COMPONENTS: {
    engine: { label: 'engine', compartment: 'hull', pos: [0, 0.8, 2.2], size: [0.7, 0.6, 1.0], hp: 30, critical: 'mobility', fireRisk: 0.6, fuelAdjacent: true },
  },
  AMMO_RACKS: [],
  COMPARTMENTS: { hull: { label: 'hull', min: [-1.1, 0.2, -3.0], max: [1.1, 2.2, 3.0] } },
  L: { trunnionY: 1.0, trunnionZ: 0, barrelLength: 0, turretCentreZ: 0 },
};

export const VEHICLES = {
  t34_43: T34_1943, t70m: T70M, kv1s: KV1S, su122: SU122, su152: SU152, su76m: SU76M,
  zis3_atg: ZIS3_ATG, k53_atg: K53_ATG, k52_aa: K52_AA,
  pz4h: PZ4_H, pz3m: PZ3_M, stug3g: STUG3_G,
  famo: FAMO, sdkfz251: SDKFZ251, opel_blitz: OPEL_BLITZ,
};

export const SOVIET_COMBAT = ['t34_43', 't70m', 'kv1s', 'su122', 'su152', 'su76m'];
export const SOVIET_GUNS = ['zis3_atg', 'k53_atg', 'k52_aa'];
export const GERMAN_COMBAT = ['pz4h', 'pz3m', 'stug3g'];

/**
 * What a crewman calls a vehicle at each stage of identification.
 * Misidentification is possible and the confusion pairs are historically real:
 * a StuG and a Panzer IV were confused constantly, and so were an SU-122 and
 * an SU-152 at long range.
 */
export const IDENTIFICATION_STAGES = {
  t34_43: ['movement', 'vehicle', 'tank', 'Soviet medium tank', 'T-34'],
  t70m: ['movement', 'vehicle', 'light tank', 'Soviet light tank', 'T-70'],
  kv1s: ['movement', 'vehicle', 'tank', 'Soviet heavy tank', 'KV-1'],
  su122: ['movement', 'vehicle', 'vehicle, no turret', 'Soviet assault gun', 'SU-122'],
  su152: ['movement', 'vehicle', 'large vehicle, no turret', 'Soviet heavy assault gun', 'SU-152'],
  su76m: ['movement', 'vehicle', 'light vehicle, no turret', 'Soviet light assault gun', 'SU-76'],
  zis3_atg: ['something in the tree line', 'possible gun position', 'anti-tank gun', 'seventy-six millimetre gun', 'ZiS-3'],
  k53_atg: ['something in the tree line', 'possible gun position', 'anti-tank gun', 'small anti-tank gun', '45 mm gun'],
  k52_aa: ['something dug in', 'possible gun position', 'large gun', 'heavy anti-tank gun', '85 mm gun'],
};

export const CONFUSION = {
  t34_43: ['kv1s', 't70m'],
  t70m: ['t34_43', 'su76m'],
  kv1s: ['t34_43', 'su152'],
  su122: ['su152', 'su76m'],
  su152: ['su122', 'kv1s'],
  su76m: ['su122', 't70m'],
  zis3_atg: ['k53_atg', 'k52_aa'],
  k53_atg: ['zis3_atg'],
  k52_aa: ['zis3_atg'],
};

export function getVehicleSpec(id) {
  const v = VEHICLES[id];
  if (!v) throw new Error(`Unknown vehicle: ${id}`);
  return v;
}
