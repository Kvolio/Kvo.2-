// Gun data. Dispersion is expressed as the standard deviation of the shot
// dispersion cone in milliradians, which is how gunnery trials recorded it —
// NOT as a "accuracy percentage".

import { DEG } from '../core/MathUtil.js';

export const GUNS = {
  kwk36: {
    id: 'kwk36',
    name: '8,8 cm KwK 36 L/56',
    caliber: 88,
    barrelLength: 4.930,           // m
    ammo: ['pzgr39', 'sprgr39', 'nbgr', 'pzgr40', 'gr39hl'],
    // Elevation limits, from the research document.
    elevMax: 16 * DEG,
    elevMin: -8 * DEG,
    // Traverse: hydraulic drive is engine-driven, so rate depends on engine rpm.
    traverseHydraulicMax: 36 * DEG,   // rad/s at full engine revs
    traverseHydraulicLow: 6 * DEG,    // rad/s near idle
    traverseManual: 0.5 * DEG * 1.6,  // rad/s, gunner cranking hard (720 turns / 360 deg)
    elevRate: 4.2 * DEG,              // rad/s, hand elevation
    dispersionMrad: 0.28,             // 1 sigma, gun+ammo, veteran-independent
    recoilLength: 0.58,
    baseReloadS: 7.0,                 // trained loader, tank stationary, ready rack
    desc: 'The gun the Tiger was built around. Flat trajectory, superb optics, and it will kill any Soviet tank at Kursk.',
  },
  mg34: {
    id: 'mg34',
    name: '7,92 mm MG 34',
    caliber: 7.92,
    ammo: ['smk792'],
    rpm: 850,
    beltSize: 150,
    dispersionMrad: 1.6,
    elevMax: 16 * DEG,
    elevMin: -8 * DEG,
  },
  f34: {
    id: 'f34',
    name: '76,2 mm F-34',
    caliber: 76.2,
    barrelLength: 3.162,
    ammo: ['br350a', 'br350b', 'of350', 'br350p'],
    elevMax: 26.5 * DEG,
    elevMin: -5.5 * DEG,
    traverseManual: 2.1 * DEG,
    traverseHydraulicMax: 0,      // T-34 mod.1943 turret traverse is electric; modelled as powered
    traverseElectric: 25 * DEG,
    elevRate: 3.5 * DEG,
    dispersionMrad: 0.42,
    baseReloadS: 9.0,             // two-man turret: the commander loads and commands
    desc: 'The T-34’s gun. Excellent against everything the Germans fielded in 1941 — and obsolete against a Tiger.',
  },
  zis5: {
    id: 'zis5', name: '76,2 mm ZiS-5', caliber: 76.2, barrelLength: 3.162,
    ammo: ['br350a', 'br350b', 'of350'],
    elevMax: 25 * DEG, elevMin: -5 * DEG, traverseElectric: 20 * DEG, elevRate: 3.2 * DEG,
    dispersionMrad: 0.42, baseReloadS: 8.0,
  },
  zis3: {
    id: 'zis3', name: '76,2 mm ZiS-3', caliber: 76.2, barrelLength: 3.4,
    ammo: ['br350b', 'br350a', 'of350', 'br350p'],
    elevMax: 37 * DEG, elevMin: -5 * DEG, traverseManual: 4 * DEG, elevRate: 5 * DEG,
    dispersionMrad: 0.38, baseReloadS: 6.0,
    desc: 'Divisional gun in the anti-tank role. Low, easily hidden, and there are a great many of them.',
  },
  k20: {
    id: 'k20', name: '45 mm 20-K', caliber: 45, barrelLength: 2.07,
    ammo: ['br240', 'of350'],
    elevMax: 25 * DEG, elevMin: -6 * DEG, traverseManual: 5 * DEG, elevRate: 6 * DEG,
    dispersionMrad: 0.5, baseReloadS: 4.0,
  },
  k53: {
    id: 'k53', name: '45 mm 53-K', caliber: 45, barrelLength: 2.07,
    ammo: ['br240'],
    elevMax: 25 * DEG, elevMin: -8 * DEG, traverseManual: 6 * DEG, elevRate: 7 * DEG,
    dispersionMrad: 0.45, baseReloadS: 3.5,
  },
  k52: {
    id: 'k52', name: '85 mm 52-K', caliber: 85, barrelLength: 4.693,
    ammo: ['br365', 'of350'],
    elevMax: 82 * DEG, elevMin: -3 * DEG, traverseManual: 3 * DEG, elevRate: 4 * DEG,
    dispersionMrad: 0.33, baseReloadS: 6.5,
    desc: 'Anti-aircraft gun pressed into the anti-tank role. The one Soviet weapon at Kursk that frightens a Tiger crew frontally.',
  },
  m30s: {
    id: 'm30s', name: '122 mm M-30S', caliber: 121.9, barrelLength: 2.8,
    ammo: ['bp460a', 'of462'],
    elevMax: 25 * DEG, elevMin: -3 * DEG, traverseManual: 1.6 * DEG, elevRate: 2.5 * DEG,
    dispersionMrad: 0.85, baseReloadS: 20.0,
  },
  ml20s: {
    id: 'ml20s', name: '152 mm ML-20S', caliber: 152.4, barrelLength: 4.24,
    ammo: ['br540', 'of540'],
    elevMax: 18 * DEG, elevMin: -3 * DEG, traverseManual: 1.4 * DEG, elevRate: 2.2 * DEG,
    dispersionMrad: 0.75, baseReloadS: 40.0,
    desc: 'The Zveroboy — "beast killer". One hit ends the engagement one way or the other.',
  },
  kwk40l48: {
    id: 'kwk40l48', name: '7,5 cm KwK 40 L/48', caliber: 75, barrelLength: 3.6,
    ammo: ['pzgr39', 'sprgr39'],
    elevMax: 20 * DEG, elevMin: -8 * DEG, traverseHydraulicMax: 14 * DEG, elevRate: 4 * DEG,
    dispersionMrad: 0.3, baseReloadS: 6.0,
  },
  kwk39l60: {
    id: 'kwk39l60', name: '5 cm KwK 39 L/60', caliber: 50, barrelLength: 3.0,
    ammo: ['pzgr39', 'sprgr39'],
    elevMax: 20 * DEG, elevMin: -10 * DEG, traverseHydraulicMax: 20 * DEG, elevRate: 5 * DEG,
    dispersionMrad: 0.32, baseReloadS: 4.5,
  },
  kwk42l70: {
    id: 'kwk42l70', name: '7,5 cm KwK 42 L/70', caliber: 75, barrelLength: 5.25,
    ammo: ['pzgr39', 'sprgr39'],
    elevMax: 18 * DEG, elevMin: -8 * DEG, traverseHydraulicMax: 18 * DEG, elevRate: 4 * DEG,
    dispersionMrad: 0.22, baseReloadS: 6.5,
  },
  pak43l71: {
    id: 'pak43l71', name: '8,8 cm Pak 43/2 L/71', caliber: 88, barrelLength: 6.25,
    ammo: ['pzgr39', 'sprgr39'],
    elevMax: 14 * DEG, elevMin: -8 * DEG, traverseManual: 2 * DEG, elevRate: 3 * DEG,
    dispersionMrad: 0.2, baseReloadS: 9.0,
  },
};

export function getGun(id) {
  const g = GUNS[id];
  if (!g) throw new Error(`Unknown gun: ${id}`);
  return g;
}
