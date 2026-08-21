// ===========================================================================
//  PANZERKAMPFWAGEN VI TIGER Ausf. H (Sd.Kfz. 181)
//  Henschel, Kassel — May/June 1943 production, Fgst.Nr. band 250200-250380
//  Representative vehicle: "S13", 3./schwere Panzer-Abteilung 503, Belgorod, July 1943
//
//  Every value here traces to docs/HISTORICAL-RESEARCH.md. Read that first.
//
//  COORDINATE SYSTEM (vehicle local, metres):
//     +X = right,  +Y = up,  +Z = forward (direction of travel)
//     Origin = centre of the hull, at ground level.
//
//  ARMOUR IS GEOMETRY, NOT A NUMBER.
//  Each plate is an oriented rectangle with a real position, a real normal and a
//  real thickness. Obliquity is computed from the incoming shell's direction
//  against the plate normal at the moment of impact. There is no "armour rating"
//  anywhere in this file and no code may add one.
// ===========================================================================

import { DEG } from '../core/MathUtil.js';

// --- Layout constants that the renderer and the armour array must agree on ----
export const L = {
  hullLength: 6.316,
  hullHalfL: 3.158,
  hullWidthUpper: 3.547,   // over superstructure sides (80 mm plate)
  hullHalfWU: 1.7735,
  hullWidthLower: 2.26,    // tub between the tracks (60 mm plate)
  hullHalfWL: 1.13,
  widthOverTracks: 3.705,
  trackWidth: 0.725,
  groundClearance: 0.47,
  hullFloorY: 0.47,
  sponsonFloorY: 1.00,     // underside of the sponson overhang, above the track
  hullRoofY: 1.75,
  turretRingY: 1.75,
  turretRingDia: 1.83,
  turretRoofY: 2.52,
  cupolaTopY: 3.00,
  turretCentreZ: 0.35,     // turret ring centre, forward of hull centre
  trunnionZ: 0.62,
  trunnionY: 2.12,
  barrelLength: 4.930,
  muzzleZ: 5.292,          // gives 8.45 m overall with gun forward
  roadWheelDia: 0.80,
  sprocketDia: 0.84,
  trackContact: 3.61,
};

/**
 * Build an oriented armour plate.
 * @param {string} id
 * @param {string} label       human name used by the damage log
 * @param {number} thickness   mm
 * @param {[number,number,number]} centre
 * @param {[number,number,number]} normal   outward-facing, will be normalised
 * @param {number} halfU  half-extent along the plate's first tangent (m)
 * @param {number} halfV  half-extent along the plate's second tangent (m)
 * @param {object} [opt]
 */
function plate(id, label, thickness, centre, normal, halfU, halfV, opt = {}) {
  const n = normal.slice();
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= len; n[1] /= len; n[2] /= len;
  // Build an orthonormal tangent basis for the plate face.
  const up = Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return {
    id, label, thickness,
    centre, normal: n, u, v, halfU, halfV,
    // angleFromVertical is informational only — the sim uses `normal`.
    angleFromVertical: Math.acos(Math.min(1, Math.abs(n[1] === 1 ? 1 : Math.hypot(n[0], n[2])))) / DEG,
    material: opt.material || 'RHA',
    // Quality coefficient: German mid-war RHA was good but slightly brittle in
    // thick sections. 1.0 = reference plate the penetration tables were shot against.
    quality: opt.quality ?? 1.0,
    curved: opt.curved || false,
    // Which internal volume lies behind this plate — drives post-penetration effects.
    behind: opt.behind || 'hull',
    onTurret: opt.onTurret || false,
    weakPoint: opt.weakPoint || null,
    ...opt,
  };
}

// ---------------------------------------------------------------------------
//  ARMOUR ARRAY
// ---------------------------------------------------------------------------
const s = (deg) => Math.sin(deg * DEG);
const c = (deg) => Math.cos(deg * DEG);

export const ARMOUR = [
  // ---- HULL FRONT -----------------------------------------------------------
  // Nose plate, 100 mm at 24 deg from vertical (leans forward-under).
  plate('hull_nose', 'hull nose', 100,
    [0, 0.80, 3.10], [0, -s(24), c(24)], 1.10, 0.36, { behind: 'driver_compartment' }),

  // Driver's plate, 100 mm at 9 deg. Carries the visor and the MG ball mount.
  plate('hull_front_upper', 'driver’s front plate', 100,
    [0, 1.42, 3.05], [0, s(9), c(9)], 1.7735, 0.42, { behind: 'driver_compartment' }),

  // Glacis, 60 mm at 80 deg from vertical — thin, but almost flat to the shell.
  plate('hull_glacis', 'glacis', 60,
    [0, 1.70, 2.55], [0, c(10), s(10)], 1.7735, 0.42, { behind: 'driver_compartment' }),

  // The driver's visor and the hull MG ball mount are genuine local weak points.
  plate('driver_visor', 'driver’s visor', 100,
    [-0.60, 1.45, 3.09], [0, s(9), c(9)], 0.22, 0.10,
    { behind: 'driver_compartment', weakPoint: 'driver_visor', quality: 0.85 }),
  plate('hull_mg_mount', 'hull MG ball mount', 100,
    [0.63, 1.38, 3.09], [0, s(9), c(9)], 0.20, 0.20,
    { behind: 'radio_compartment', weakPoint: 'hull_mg', quality: 0.80, curved: true }),

  // ---- HULL SIDES -----------------------------------------------------------
  // Upper (superstructure/sponson) sides, 80 mm vertical. The Tiger's real flank.
  plate('hull_side_upper_l', 'left superstructure side', 80,
    [-1.7735, 1.36, 0.20], [-1, 0, 0], 2.55, 0.39, { behind: 'fighting_compartment' }),
  plate('hull_side_upper_r', 'right superstructure side', 80,
    [1.7735, 1.36, 0.20], [1, 0, 0], 2.55, 0.39, { behind: 'fighting_compartment' }),

  // Lower tub sides, 60 mm vertical, screened by the running gear.
  plate('hull_side_lower_l', 'left lower hull', 60,
    [-1.13, 0.75, 0.10], [-1, 0, 0], 2.90, 0.28, { behind: 'hull_floor_space', screenedByRunningGear: true }),
  plate('hull_side_lower_r', 'right lower hull', 60,
    [1.13, 0.75, 0.10], [1, 0, 0], 2.90, 0.28, { behind: 'hull_floor_space', screenedByRunningGear: true }),

  // ---- HULL REAR ------------------------------------------------------------
  plate('hull_rear', 'hull rear plate', 80,
    [0, 1.20, -3.14], [0, s(8), -c(8)], 1.7735, 0.62, { behind: 'engine_compartment' }),
  plate('hull_rear_lower', 'lower rear plate', 80,
    [0, 0.66, -3.05], [0, -s(20), -c(20)], 1.13, 0.24, { behind: 'engine_compartment' }),

  // ---- HULL HORIZONTAL ------------------------------------------------------
  plate('hull_roof_front', 'hull roof, forward', 25,
    [0, 1.75, 2.30], [0, 1, 0], 1.7735, 0.55, { behind: 'driver_compartment' }),
  plate('hull_roof_engine', 'engine deck', 25,
    [0, 1.75, -2.05], [0, 1, 0], 1.7735, 1.10, { behind: 'engine_compartment' }),
  plate('hull_roof_side_l', 'left sponson roof', 25,
    [-1.35, 1.75, 0.20], [0, 1, 0], 0.42, 1.85, { behind: 'fighting_compartment' }),
  plate('hull_roof_side_r', 'right sponson roof', 25,
    [1.35, 1.75, 0.20], [0, 1, 0], 0.42, 1.85, { behind: 'fighting_compartment' }),
  plate('hull_floor_front', 'hull floor, forward', 25,
    [0, 0.47, 1.60], [0, -1, 0], 1.13, 1.55, { behind: 'driver_compartment', mineProne: true }),
  plate('hull_floor_rear', 'hull floor, rear', 25,
    [0, 0.47, -1.40], [0, -1, 0], 1.13, 1.75, { behind: 'engine_compartment', mineProne: true }),

  // ---- TURRET ---------------------------------------------------------------
  plate('turret_front', 'turret front plate', 100,
    [0, 2.14, 1.28], [0, 0, 1], 0.92, 0.38, { onTurret: true, behind: 'turret' }),

  // Mantlet (Walzenblende): a curved shell, 100-120 mm, ~200 mm at the trunnion
  // bosses. Modelled as three bands so a hit near the centre meets more steel.
  plate('mantlet_centre', 'gun mantlet, centre', 120,
    [0, 2.12, 1.40], [0, 0, 1], 0.36, 0.30, { onTurret: true, behind: 'turret', curved: true }),
  plate('mantlet_trunnion_l', 'mantlet trunnion boss', 190,
    [-0.44, 2.12, 1.36], [-0.30, 0, 0.95], 0.20, 0.28, { onTurret: true, behind: 'turret', curved: true }),
  plate('mantlet_trunnion_r', 'mantlet trunnion boss', 190,
    [0.44, 2.12, 1.36], [0.30, 0, 0.95], 0.20, 0.28, { onTurret: true, behind: 'turret', curved: true }),
  plate('mantlet_outer_l', 'mantlet, left edge', 100,
    [-0.74, 2.12, 1.30], [-0.45, 0, 0.89], 0.18, 0.30, { onTurret: true, behind: 'turret', curved: true }),
  plate('mantlet_outer_r', 'mantlet, right edge', 100,
    [0.74, 2.12, 1.30], [0.45, 0, 0.89], 0.18, 0.30, { onTurret: true, behind: 'turret', curved: true }),

  plate('turret_side_l', 'left turret side', 80,
    [-0.93, 2.14, 0.28], [-1, 0, 0], 1.02, 0.38, { onTurret: true, behind: 'turret' }),
  plate('turret_side_r', 'right turret side', 80,
    [0.93, 2.14, 0.28], [1, 0, 0], 1.02, 0.38, { onTurret: true, behind: 'turret' }),
  plate('turret_rear', 'turret rear', 80,
    [0, 2.14, -0.76], [0, 0, -1], 0.90, 0.38, { onTurret: true, behind: 'turret' }),

  // Turret rear fittings — the escape hatch and pistol port are thinner in effect.
  plate('turret_escape_hatch', 'turret escape hatch', 80,
    [0.36, 2.10, -0.78], [0, 0, -1], 0.24, 0.24,
    { onTurret: true, behind: 'turret', weakPoint: 'escape_hatch', quality: 0.88 }),
  plate('turret_pistol_port', 'pistol port', 80,
    [-0.52, 2.16, -0.77], [0, 0, -1], 0.09, 0.09,
    { onTurret: true, behind: 'turret', weakPoint: 'pistol_port', quality: 0.80 }),

  plate('turret_roof', 'turret roof', 25,
    [0, 2.52, 0.20], [0, 1, 0], 0.92, 0.98, { onTurret: true, behind: 'turret' }),

  // ---- CUPOLA (early drum type — the commander's own armour) -----------------
  plate('cupola_wall_f', 'cupola, front', 80,
    [-0.46, 2.76, 0.34], [0, s(10), c(10)], 0.22, 0.24,
    { onTurret: true, behind: 'cupola', exposesCommander: true }),
  plate('cupola_wall_l', 'cupola, left', 80,
    [-0.68, 2.76, 0.12], [-c(10), s(10), 0], 0.22, 0.24,
    { onTurret: true, behind: 'cupola', exposesCommander: true }),
  plate('cupola_wall_r', 'cupola, right', 80,
    [-0.24, 2.76, 0.12], [c(10), s(10), 0], 0.22, 0.24,
    { onTurret: true, behind: 'cupola', exposesCommander: true }),
  plate('cupola_wall_b', 'cupola, rear', 80,
    [-0.46, 2.76, -0.10], [0, s(10), -c(10)], 0.22, 0.24,
    { onTurret: true, behind: 'cupola', exposesCommander: true }),
  plate('cupola_hatch', 'cupola hatch', 25,
    [-0.46, 3.00, 0.12], [0, 1, 0], 0.24, 0.24,
    { onTurret: true, behind: 'cupola', exposesCommander: true }),
  // Vision slits: laminated glass behind an armoured cover. Not real protection.
  plate('cupola_slit', 'cupola vision slit', 40,
    [-0.46, 2.84, 0.35], [0, s(10), c(10)], 0.08, 0.03,
    { onTurret: true, behind: 'cupola', weakPoint: 'vision_block', quality: 0.55, exposesCommander: true }),
];

// ---------------------------------------------------------------------------
//  INTERNAL VOLUMES — what a shell finds after it comes through
// ---------------------------------------------------------------------------
export const COMPARTMENTS = {
  driver_compartment:   { label: 'driver’s compartment',  min: [-1.75, 0.47, 1.40],  max: [1.75, 1.75, 3.10] },
  radio_compartment:    { label: 'radio operator’s station', min: [0.10, 0.47, 1.40], max: [1.75, 1.75, 3.10] },
  fighting_compartment: { label: 'fighting compartment',  min: [-1.75, 0.47, -1.10], max: [1.75, 1.75, 1.55] },
  hull_floor_space:     { label: 'hull floor',            min: [-1.13, 0.47, -1.10], max: [1.13, 1.00, 3.00] },
  engine_compartment:   { label: 'engine compartment',    min: [-1.75, 0.47, -3.14], max: [1.75, 1.75, -1.10] },
  turret:               { label: 'turret',                min: [-0.95, 1.75, -0.80], max: [0.95, 2.52, 1.35] },
  cupola:               { label: 'cupola',                min: [-0.70, 2.52, -0.14], max: [-0.22, 3.00, 0.38] },
};

// ---------------------------------------------------------------------------
//  COMPONENTS — individually modelled, individually damageable.
//  `hp` is NOT a health bar for the tank. It is the local energy a component can
//  absorb before it stops working. The tank itself has no hit points at all.
// ---------------------------------------------------------------------------
export const COMPONENTS = {
  engine: {
    label: 'Maybach HL 230 P45', compartment: 'engine_compartment',
    pos: [0, 0.95, -2.20], size: [1.10, 0.90, 1.60], hp: 260,
    critical: 'mobility', fireRisk: 0.55, fuelAdjacent: true,
    fieldRepairable: false, repairNote: 'A wrecked HL 230 is a depot job. The crew cannot fix it in a field.',
  },
  transmission: {
    label: 'Olvar OG 40 12 16 B gearbox', compartment: 'driver_compartment',
    pos: [0, 0.85, 2.05], size: [0.95, 0.70, 0.95], hp: 210,
    critical: 'mobility', fireRisk: 0.15,
    fieldRepairable: false, repairNote: 'The gearbox sits between the driver and the radio operator. Nothing to be done in the field.',
  },
  final_drive_l: {
    label: 'left final drive', compartment: 'driver_compartment',
    pos: [-1.35, 0.80, 2.55], size: [0.45, 0.55, 0.45], hp: 150,
    critical: 'mobility_half', fireRisk: 0.05, fieldRepairable: false,
  },
  final_drive_r: {
    label: 'right final drive', compartment: 'driver_compartment',
    pos: [1.35, 0.80, 2.55], size: [0.45, 0.55, 0.45], hp: 150,
    critical: 'mobility_half', fireRisk: 0.05, fieldRepairable: false,
  },
  track_l: {
    label: 'left track', compartment: null, external: true,
    pos: [-1.49, 0.55, 0], size: [0.36, 1.10, 3.61], hp: 90,
    critical: 'mobility_half', fireRisk: 0,
    fieldRepairable: true, repairMinutes: 11, repairCrew: ['driver', 'loader', 'radio'],
    partsNeeded: { trackLinks: 3 },
    repairNote: 'Break the track, drag the damaged links out, fit new ones, reconnect with a track pin.',
  },
  track_r: {
    label: 'right track', compartment: null, external: true,
    pos: [1.49, 0.55, 0], size: [0.36, 1.10, 3.61], hp: 90,
    critical: 'mobility_half', fireRisk: 0,
    fieldRepairable: true, repairMinutes: 11, repairCrew: ['driver', 'loader', 'radio'],
    partsNeeded: { trackLinks: 3 },
  },
  roadwheels_l: {
    label: 'left running gear', compartment: null, external: true,
    pos: [-1.40, 0.55, 0], size: [0.30, 0.85, 3.40], hp: 120,
    critical: 'mobility_degrade', fieldRepairable: true, repairMinutes: 24,
    partsNeeded: { roadWheels: 1 }, repairCrew: ['driver'],
    repairNote: 'Interleaved wheels. To reach an inner wheel you must pull the outer ones first — this is why Tiger crews hated mud.',
  },
  roadwheels_r: {
    label: 'right running gear', compartment: null, external: true,
    pos: [1.40, 0.55, 0], size: [0.30, 0.85, 3.40], hp: 120,
    critical: 'mobility_degrade', fieldRepairable: true, repairMinutes: 24,
    partsNeeded: { roadWheels: 1 }, repairCrew: ['driver'],
  },
  main_gun: {
    label: '8,8 cm KwK 36 L/56', compartment: 'turret',
    pos: [0, 2.12, 1.60], size: [0.30, 0.30, 2.20], hp: 200,
    critical: 'firepower', fieldRepairable: false,
    repairNote: 'A struck barrel is finished. Firing it would burst the tube.',
  },
  breech: {
    label: 'breech and recoil gear', compartment: 'turret',
    pos: [0, 2.08, 0.55], size: [0.40, 0.45, 0.70], hp: 130,
    critical: 'firepower', fireRisk: 0.05, fieldRepairable: true, repairMinutes: 18,
    repairCrew: ['gunner', 'loader'], partsNeeded: { tools: 1 },
    repairNote: 'A jammed semi-automatic breech can sometimes be freed by hand. A cracked one cannot.',
  },
  turret_traverse: {
    label: 'turret traverse drive', compartment: 'turret',
    pos: [0.55, 1.85, 0.10], size: [0.35, 0.30, 0.35], hp: 100,
    critical: 'traverse', fieldRepairable: true, repairMinutes: 15,
    repairCrew: ['gunner', 'driver'], partsNeeded: { tools: 1 },
    repairNote: 'If the hydraulic drive is dead the gunner can still crank by hand — 720 turns for a full circle.',
  },
  gun_elevation: {
    label: 'elevation gear', compartment: 'turret',
    pos: [-0.30, 2.05, 0.75], size: [0.25, 0.30, 0.30], hp: 90,
    critical: 'elevation', fieldRepairable: true, repairMinutes: 12,
    repairCrew: ['gunner'], partsNeeded: { tools: 1 },
  },
  gunner_sight: {
    label: 'TZF 9b sight', compartment: 'turret',
    pos: [-0.34, 2.16, 1.05], size: [0.16, 0.16, 0.60], hp: 40,
    critical: 'optics', fieldRepairable: true, repairMinutes: 9,
    repairCrew: ['gunner'], partsNeeded: { optics: 1 },
    repairNote: 'The sight is a replaceable unit. If a spare optic is in stores it can be swapped in the field.',
  },
  cupola_optics: {
    label: 'cupola vision blocks', compartment: 'cupola',
    pos: [-0.46, 2.82, 0.12], size: [0.50, 0.20, 0.50], hp: 25,
    critical: 'commander_optics', fieldRepairable: true, repairMinutes: 7,
    repairCrew: ['loader', 'radio'], partsNeeded: { optics: 1 },
  },
  radio: {
    label: 'Fu 5 transceiver', compartment: 'radio_compartment',
    pos: [1.10, 1.30, 2.35], size: [0.45, 0.30, 0.30], hp: 35,
    critical: 'comms', fieldRepairable: true, repairMinutes: 13,
    repairCrew: ['radio'], partsNeeded: { tools: 1 },
  },
  hull_mg: {
    label: 'hull MG 34', compartment: 'radio_compartment',
    pos: [0.63, 1.36, 2.95], size: [0.20, 0.20, 0.60], hp: 45,
    critical: 'none', fieldRepairable: true, repairMinutes: 6, repairCrew: ['radio'],
  },
  coax_mg: {
    label: 'coaxial MG 34', compartment: 'turret',
    pos: [0.22, 2.12, 1.35], size: [0.15, 0.15, 0.60], hp: 45,
    critical: 'none', fieldRepairable: true, repairMinutes: 8, repairCrew: ['loader'],
  },
  fuel_l: {
    label: 'left fuel group', compartment: 'engine_compartment',
    pos: [-1.30, 0.85, -1.60], size: [0.42, 0.60, 1.10], hp: 60,
    critical: 'fuel', fireRisk: 0.80, capacityL: 135, fieldRepairable: false,
  },
  fuel_r: {
    label: 'right fuel group', compartment: 'engine_compartment',
    pos: [1.30, 0.85, -1.60], size: [0.42, 0.60, 1.10], hp: 60,
    critical: 'fuel', fireRisk: 0.80, capacityL: 135, fieldRepairable: false,
  },
  fuel_rear_l: {
    label: 'left rear fuel tank', compartment: 'engine_compartment',
    pos: [-1.20, 0.80, -2.80], size: [0.42, 0.55, 0.55], hp: 55,
    critical: 'fuel', fireRisk: 0.80, capacityL: 135, fieldRepairable: false,
  },
  fuel_rear_r: {
    label: 'right rear fuel tank', compartment: 'engine_compartment',
    pos: [1.20, 0.80, -2.80], size: [0.42, 0.55, 0.55], hp: 55,
    critical: 'fuel', fireRisk: 0.80, capacityL: 135, fieldRepairable: false,
  },
  fire_system: {
    label: 'Feuerlöschanlage', compartment: 'engine_compartment',
    pos: [0.75, 1.35, -1.30], size: [0.20, 0.35, 0.20], hp: 20,
    critical: 'fire_suppression', fieldRepairable: false,
  },
  electrics: {
    label: 'electrical system', compartment: 'driver_compartment',
    pos: [-0.95, 1.25, 2.15], size: [0.30, 0.30, 0.30], hp: 30,
    critical: 'electrics', fieldRepairable: true, repairMinutes: 10,
    repairCrew: ['radio', 'driver'], partsNeeded: { tools: 1 },
    repairNote: 'Without electrics there is no powered traverse, no electric firing and no radio.',
  },
  tow_gear: {
    label: 'towing shackles and cables', compartment: null, external: true,
    pos: [0, 1.05, -3.20], size: [1.60, 0.20, 0.20], hp: 35,
    critical: 'recovery', fieldRepairable: true, repairMinutes: 8,
    repairCrew: ['loader', 'radio'], partsNeeded: { towCables: 1 },
  },
};

// ---------------------------------------------------------------------------
//  AMMUNITION STOWAGE — 92 rounds, physically located.
//  A shell that stops inside one of these bins is how a Tiger dies.
// ---------------------------------------------------------------------------
export const AMMO_RACKS = [
  { id: 'sponson_l_fwd',  label: 'left sponson bin, forward',  pos: [-1.45, 1.20, 1.05], size: [0.34, 0.55, 1.30], capacity: 16 },
  { id: 'sponson_l_aft',  label: 'left sponson bin, rear',     pos: [-1.45, 1.20, -0.45], size: [0.34, 0.55, 1.30], capacity: 16 },
  { id: 'sponson_r_fwd',  label: 'right sponson bin, forward', pos: [1.45, 1.20, 1.05],  size: [0.34, 0.55, 1.30], capacity: 16 },
  { id: 'sponson_r_aft',  label: 'right sponson bin, rear',    pos: [1.45, 1.20, -0.45], size: [0.34, 0.55, 1.30], capacity: 16 },
  { id: 'floor_l',        label: 'floor stowage, left',        pos: [-0.70, 0.62, 0.30], size: [0.50, 0.28, 1.40], capacity: 12 },
  { id: 'floor_r',        label: 'floor stowage, right',       pos: [0.70, 0.62, 0.30],  size: [0.50, 0.28, 1.40], capacity: 12 },
  { id: 'ready_r',        label: 'loader’s ready rack',        pos: [1.00, 1.32, 0.95],  size: [0.30, 0.40, 0.70], capacity: 4, ready: true },
];
export const AMMO_CAPACITY = AMMO_RACKS.reduce((a, r) => a + r.capacity, 0); // = 92
export const MG_AMMO_CAPACITY = 4800; // 32 belt bags of 150

// ---------------------------------------------------------------------------
//  CREW STATIONS — eye positions, hatches, and what each man can see.
// ---------------------------------------------------------------------------
export const STATIONS = {
  commander: {
    label: 'Commander', role: 'commander',
    seat: [-0.46, 1.98, 0.05],
    eyeButtonedUp: [-0.46, 2.74, 0.10],     // eyes at the cupola vision slits
    eyeHeadOut:    [-0.46, 3.14, 0.10],     // head above the hatch rim
    eyeExposedRisk: 1.0,
    onTurret: true,
    hatch: 'cupola_hatch',
    exitTimeS: 4.2,
    vision: { fovDeg: 62, magnification: 1, blockedArcs: [[150, 210]] }, // gun blocks nothing; turret rear does
  },
  gunner: {
    label: 'Gunner', role: 'gunner',
    seat: [-0.36, 1.92, 0.55],
    eye: [-0.34, 2.14, 0.85],
    onTurret: true,
    hatch: 'cupola_hatch',                   // gunner has no hatch of his own — he goes out through the cupola or the escape hatch
    exitTimeS: 7.5,
    vision: { fovDeg: 25, magnification: 2.5, device: 'TZF 9b' },
  },
  loader: {
    label: 'Loader', role: 'loader',
    seat: [0.55, 1.90, 0.35],
    eye: [0.55, 2.28, 0.35],
    onTurret: true,
    hatch: 'loader_hatch',
    exitTimeS: 3.6,
    vision: { fovDeg: 40, magnification: 1, device: 'roof periscope' },
  },
  driver: {
    label: 'Driver', role: 'driver',
    seat: [-0.60, 1.06, 2.35],
    eye: [-0.60, 1.44, 2.60],
    onTurret: false,
    hatch: 'driver_hatch',
    exitTimeS: 5.0,
    vision: { fovDeg: 30, magnification: 1, device: 'Fahrersehklappe / KFF 2' },
  },
  radio: {
    label: 'Radio operator', role: 'radio',
    seat: [0.63, 1.06, 2.35],
    eye: [0.63, 1.42, 2.62],
    onTurret: false,
    hatch: 'radio_hatch',
    exitTimeS: 5.0,
    vision: { fovDeg: 20, magnification: 1.8, device: 'KZF 2' },
  },
};

export const HATCHES = {
  cupola_hatch: { label: 'commander’s cupola hatch', pos: [-0.46, 3.00, 0.12], onTurret: true, openTimeS: 1.1, type: 'flip' },
  loader_hatch: { label: 'loader’s hatch',           pos: [0.48, 2.52, 0.30],  onTurret: true, openTimeS: 1.3, type: 'pivot' },
  driver_hatch: { label: 'driver’s hatch',           pos: [-0.86, 1.75, 2.42], onTurret: false, openTimeS: 1.6, type: 'pivot-slide' },
  radio_hatch:  { label: 'radio operator’s hatch',   pos: [0.86, 1.75, 2.42],  onTurret: false, openTimeS: 1.6, type: 'pivot-slide' },
  escape_hatch: { label: 'turret escape hatch',      pos: [0.36, 2.10, -0.80], onTurret: true, openTimeS: 2.4, type: 'hinged' },
  floor_hatch:  { label: 'hull floor escape hatch',  pos: [0.63, 0.47, 2.10],  onTurret: false, openTimeS: 3.0, type: 'hinged' },
};

// ---------------------------------------------------------------------------
//  FIRE SUPPRESSION — the actual Feuerlöschanlage, not a modern system.
// ---------------------------------------------------------------------------
export const FIRE_SYSTEM = {
  label: 'Feuerlöschanlage (CB / "Tetra")',
  agent: 'Chlorbrommethan',
  bottleLitres: 3,
  dischargeSeconds: 7,
  discharges: 5,                 // total, then the bottle is dry for the mission
  thermostatTripC: 120,
  protects: ['engine_compartment'],   // NOTHING else is automatically protected
  thermostatLocations: ['fuel pumps', 'carburettors'],
  driverWarningLamp: true,
  // Effectiveness against a fire already established, per discharge.
  suppressionPower: 0.55,
  // The agent is toxic. Every discharge poisons the crew a little.
  crewToxicityPerDischarge: 0.06,
  handExtinguisher: {
    label: 'hand-held extinguisher, fighting compartment',
    uses: 2,
    suppressionPower: 0.40,
    // A crewman must physically reach it and use it — this takes him off his job.
    useSeconds: 9,
    reachableFrom: ['loader', 'radio', 'driver'],
  },
  note: 'Protects the engine compartment only. A fighting-compartment or ammunition fire must be fought by hand, or not at all.',
};

// ---------------------------------------------------------------------------
//  MASTER SPEC
// ---------------------------------------------------------------------------
export const TIGER_1H = {
  id: 'tiger1h',
  designation: 'Panzerkampfwagen VI Tiger Ausf. H',
  officialLater: 'Panzerkampfwagen Tiger Ausf. E (Sd.Kfz. 181)',
  sdkfz: 'Sd.Kfz. 181',
  production: 'Henschel, Kassel — May/June 1943',
  fgstBand: '250200–250380',
  faction: 'german',
  klass: 'heavy',
  crew: 5,

  dims: {
    lengthWithGun: 8.45, hullLength: 6.316,
    width: 3.705, widthOverHull: 3.547,
    height: 3.00, groundClearance: 0.47,
    trackWidth: 0.725, trackContact: 3.61, groundPressure: 1.04,
    turretRing: 1.83, turretHeadroom: 1.57,
  },

  mass: { combat: 57000, empty: 54000 },

  engine: {
    model: 'Maybach HL 230 P45', layout: 'V-12 petrol, 60°',
    displacementL: 23.095,
    powerPS: 700, powerRpm: 3000,
    governedRpm: 2600, governedPS: 650,
    idleRpm: 600, maxRpm: 3000,
    torqueCurve: [[600, 1200], [1200, 1850], [1800, 2100], [2400, 2050], [3000, 1670]], // rpm -> Nm
  },

  transmission: {
    model: 'Maybach Olvar OG 40 12 16 B', type: 'pre-selector, hydraulic shift',
    forwardGears: 8, reverseGears: 4,
    ratios: [11.7, 7.6, 5.2, 3.8, 2.8, 2.1, 1.55, 1.0],
    reverseRatios: [9.0, 5.2, 3.1, 1.9],
    finalDrive: 10.7,
    shiftTimeS: 0.9,
  },

  steering: {
    model: 'Henschel L 801 controlled differential',
    radii: 16, neutralSteer: true,
    // Turning radii in metres per gear, tight and wide.
    tightRadius: [3.44, 4.6, 6.2, 8.5, 11.6, 15.6, 21.0, 34.0],
  },

  suspension: {
    type: 'torsion bar, interleaved', stations: 8,
    wheelsPerSide: 24, ranks: 3,
    travel: 0.26, wheelDia: 0.80, rubberTyred: true,
  },

  mobility: {
    maxSpeedRoad: 45.4 / 3.6, practicalRoad: 38 / 3.6,
    maxSpeedCross: 22 / 3.6, maxReverse: 11 / 3.6,
    fuelCapacityL: 540,
    consumptionRoadL100: 270, consumptionCrossL100: 480,
    rangeRoadKm: 195, rangeCrossKm: 110,
    gradientMax: 35, trenchCross: 2.3, fordDepth: 1.2, verticalStep: 0.79,
  },

  turret: {
    traverseMechanism: 'Boehringer-Sturm L4S hydraulic, engine-driven, plus manual',
    manualTurnsFor360: 720,
    // These are pulled from GUNS.kwk36 at runtime; duplicated here for clarity.
    fullCircleAtIdleS: 60,
  },

  armament: {
    main: 'kwk36',
    coax: 'mg34',
    hull: 'mg34',
    ammoCapacity: AMMO_CAPACITY,
    mgAmmoCapacity: MG_AMMO_CAPACITY,
    // Historically representative Zitadelle load: mostly AP, a healthy HE
    // allocation for guns and infantry, a few smoke. No PzGr 40 — there wasn't any.
    defaultLoadout: { pzgr39: 50, sprgr39: 36, nbgr: 6, pzgr40: 0, gr39hl: 0 },
  },

  optics: {
    gunner: 'TZF 9b binocular, 2.5×, 25°',
    commander: 'early drum cupola, 5 vision slits + 6×30 binoculars',
    driver: 'Fahrersehklappe visor + KFF 2 episcope',
    radio: 'KZF 2, 1.8×',
    loader: 'fixed roof periscope',
  },

  radio: { set: 'Fu 5', power: 10, bandMHz: [27.2, 33.3], rangeVoiceKm: 6, intercom: 'Bordsprechanlage' },

  externalStowage: [
    'two 30 mm tow cables, hull sides',
    'Bosch headlight, glacis',
    '20-t jack and jack block, rear plate',
    'spare track links, turret sides and glacis',
    'track cable, cleaning rods in tube on left fender',
    'shovel, crowbar, axe, wire cutters, fire extinguisher on the engine deck',
    'S-mine dischargers ×5 on the hull roof',
    'turret smoke candle dischargers ×3 per side',
    'Feifel air cleaners, rear plate',
  ],

  ARMOUR, COMPONENTS, AMMO_RACKS, STATIONS, HATCHES, COMPARTMENTS, FIRE_SYSTEM, L,
};

export default TIGER_1H;
