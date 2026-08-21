// Historical ammunition data. Every figure traces to docs/HISTORICAL-RESEARCH.md.
//
// Penetration tables are the wartime published values at 30 DEGREES FROM VERTICAL
// against rolled homogeneous armour. They are used to CALIBRATE the physical
// penetration model in src/sim/Penetration.js, not as the model itself — the model
// computes from impact velocity and obliquity so that intermediate ranges and
// unusual angles fall out physically rather than from a lookup.
//
// `dragK` is the retardation coefficient used by src/sim/Ballistics.js. It was
// solved for each projectile so that the simulated remaining velocity reproduces
// the published penetration curve across the whole table.

/**
 * @typedef {Object} Projectile
 * @property {string} id
 * @property {string} name          Full German/Soviet designation
 * @property {string} short         Crew shorthand ("AP", "HE", "Smoke")
 * @property {'APCBC'|'APCR'|'HEAT'|'HE'|'SMOKE'|'AP'} kind
 * @property {number} caliber       mm
 * @property {number} mass          kg, projectile only
 * @property {number} muzzleVel     m/s
 * @property {number} dragK         velocity retardation coefficient (1/m)
 * @property {number} [filler]      kg of explosive filler
 * @property {number[][]} [penTable] [[metres, mm @30deg], ...]
 * @property {number} [fixedPen]    mm, for HEAT (range independent)
 * @property {number} [ricochetDeg] obliquity beyond which ricochet becomes likely
 * @property {number} [normalisation] degrees of angle "bite" from the ballistic cap
 */

export const PROJECTILES = {
  // ---------------------------------------------------------------- German 8.8 cm KwK 36 L/56
  pzgr39: {
    id: 'pzgr39',
    name: '8,8 cm Pzgr. Patr. 39 KwK 36',
    short: 'AP',
    kind: 'APCBC',
    caliber: 88,
    mass: 10.2,
    muzzleVel: 773,
    dragK: 0.000147,
    filler: 0.059,          // 59 g phlegmatised RDX/wax, base fuzed
    fuzeDelayM: 0.9,        // travels ~0.9 m past the plate before detonating
    normalisation: 3.5,     // APCBC ballistic cap bites into sloped plate
    ricochetDeg: 68,
    penTable: [[100, 120], [500, 110], [1000, 100], [1500, 91], [2000, 84]],
    tracer: true,
    desc: 'Armour-piercing capped, ballistic cap, high-explosive filler. The standard Tiger anti-tank round.',
  },
  pzgr40: {
    id: 'pzgr40',
    name: '8,8 cm Pzgr. Patr. 40 KwK 36',
    short: 'APCR',
    kind: 'APCR',
    caliber: 88,
    coreCaliber: 42,
    mass: 7.3,
    muzzleVel: 930,
    dragK: 0.000268,        // light carrier sheds velocity fast
    filler: 0,
    normalisation: 0,       // rigid tungsten core, no normalisation
    ricochetDeg: 55,        // shatters/deflects earlier at obliquity
    penTable: [[100, 170], [500, 155], [1000, 138], [1500, 123], [2000, 110]],
    tracer: true,
    scarce: true,
    desc: 'Tungsten-cored composite rigid shot. Devastating up close, poor at range, and almost unobtainable at Kursk.',
  },
  gr39hl: {
    id: 'gr39hl',
    name: '8,8 cm Gr. 39 HL',
    short: 'HEAT',
    kind: 'HEAT',
    caliber: 88,
    mass: 7.65,
    muzzleVel: 600,
    dragK: 0.000210,
    filler: 0.64,
    fixedPen: 90,
    ricochetDeg: 60,
    desc: 'Shaped charge. Penetration does not fall off with range, but the low velocity makes hitting hard.',
  },
  sprgr39: {
    id: 'sprgr39',
    name: '8,8 cm Sprgr. Patr. L/4,5 KwK',
    short: 'HE',
    kind: 'HE',
    caliber: 88,
    mass: 9.0,
    muzzleVel: 820,
    dragK: 0.000131,
    filler: 0.698,
    blastRadius: 12,
    fragRadius: 26,
    desc: 'High explosive. For guns, infantry and soft vehicles. Will not defeat tank armour.',
  },
  nbgr: {
    id: 'nbgr',
    name: '8,8 cm Nebelgranate',
    short: 'Smoke',
    kind: 'SMOKE',
    caliber: 88,
    mass: 9.0,
    muzzleVel: 700,
    dragK: 0.000140,
    smokeRadius: 18,
    smokeDuration: 45,
    desc: 'Smoke. Breaks line of sight so the Tiger can reposition, recover or repair.',
  },

  // ---------------------------------------------------------------- Soviet 76.2 mm (F-34 / ZiS-5 / ZiS-3)
  br350a: {
    id: 'br350a',
    name: 'BR-350A',
    short: 'AP',
    kind: 'APCBC',
    caliber: 76.2,
    mass: 6.3,
    muzzleVel: 662,
    dragK: 0.000163,
    filler: 0.155,
    fuzeDelayM: 0.7,
    normalisation: 4.5,     // blunt nose normalises well but is a poor penetrator
    ricochetDeg: 65,
    penTable: [[100, 67], [500, 60], [1000, 52], [1500, 45], [2000, 39]],
    desc: 'Blunt-nosed APHE with ballistic cap. The T-34 round that could not kill a Tiger from the front.',
  },
  br350b: {
    id: 'br350b',
    name: 'BR-350B',
    short: 'AP',
    kind: 'APCBC',
    caliber: 76.2,
    mass: 6.5,
    muzzleVel: 655,
    dragK: 0.000160,
    filler: 0.150,
    fuzeDelayM: 0.7,
    normalisation: 3.0,
    ricochetDeg: 66,
    penTable: [[100, 69], [500, 61], [1000, 53], [1500, 46], [2000, 40]],
    desc: 'Sharp-nosed APHEBC. Marginally better than the BR-350A, still not enough.',
  },
  br350p: {
    id: 'br350p',
    name: 'BR-350P',
    short: 'APCR',
    kind: 'APCR',
    caliber: 76.2,
    coreCaliber: 28,
    mass: 3.02,
    muzzleVel: 950,
    dragK: 0.000330,
    filler: 0,
    normalisation: 0,
    ricochetDeg: 55,
    penTable: [[100, 102], [500, 87], [1000, 65], [1500, 48]],
    scarce: true,
    desc: 'Soviet tungsten sub-calibre. Issued in tiny numbers. Will hole a Tiger side at close range.',
  },
  of350: {
    id: 'of350',
    name: 'OF-350',
    short: 'HE',
    kind: 'HE',
    caliber: 76.2,
    mass: 6.2,
    muzzleVel: 680,
    dragK: 0.000150,
    filler: 0.621,
    blastRadius: 9,
    fragRadius: 20,
    desc: 'Soviet 76 mm high explosive.',
  },

  // ---------------------------------------------------------------- Soviet 45 mm 20-K / 53-K
  br240: {
    id: 'br240',
    name: 'BR-240',
    short: 'AP',
    kind: 'AP',
    caliber: 45,
    mass: 1.43,
    muzzleVel: 760,
    dragK: 0.000205,
    filler: 0.020,
    normalisation: 2.0,
    ricochetDeg: 60,
    penTable: [[100, 43], [500, 35], [1000, 28], [1500, 22]],
    desc: 'Forty-five millimetre. Against a Tiger this is a track-breaker and an optics-breaker, nothing more.',
  },

  // ---------------------------------------------------------------- Soviet 85 mm 52-K AA in AT role
  br365: {
    id: 'br365',
    name: 'BR-365',
    short: 'AP',
    kind: 'APCBC',
    caliber: 85,
    mass: 9.2,
    muzzleVel: 792,
    dragK: 0.000145,
    filler: 0.164,
    fuzeDelayM: 0.8,
    normalisation: 4.0,
    ricochetDeg: 67,
    penTable: [[100, 111], [500, 102], [1000, 93], [1500, 85], [2000, 78]],
    desc: 'Eighty-five millimetre APHEBC from the 52-K. This one will go through the front of a Tiger.',
  },

  // ---------------------------------------------------------------- Soviet 122 mm M-30S (SU-122)
  bp460a: {
    id: 'bp460a',
    name: 'BP-460A',
    short: 'HEAT',
    kind: 'HEAT',
    caliber: 121.9,
    mass: 13.4,
    muzzleVel: 515,
    dragK: 0.000175,
    filler: 2.0,
    fixedPen: 120,
    ricochetDeg: 62,
    desc: 'Soviet shaped charge for the 122 mm howitzer. Slow, inaccurate, and lethal if it connects.',
  },
  of462: {
    id: 'of462',
    name: 'OF-462',
    short: 'HE',
    kind: 'HE',
    caliber: 121.9,
    mass: 21.76,
    muzzleVel: 515,
    dragK: 0.000120,
    filler: 3.67,
    blastRadius: 20,
    fragRadius: 40,
    desc: '122 mm high explosive. Will not penetrate a Tiger but can shock the crew and wreck externals.',
  },

  // ---------------------------------------------------------------- Soviet 152 mm ML-20S (SU-152)
  br540: {
    id: 'br540',
    name: 'BR-540',
    short: 'AP',
    kind: 'APCBC',
    caliber: 152.4,
    mass: 48.78,
    muzzleVel: 600,
    dragK: 0.000098,
    filler: 0.48,
    fuzeDelayM: 1.1,
    normalisation: 5.0,
    ricochetDeg: 70,
    penTable: [[100, 125], [500, 120], [1000, 114], [1500, 108], [2000, 101]],
    desc: 'Forty-nine kilogrammes of armour-piercing shell. It does not need to penetrate cleanly to end the tank.',
  },
  of540: {
    id: 'of540',
    name: 'OF-540',
    short: 'HE',
    kind: 'HE',
    caliber: 152.4,
    mass: 43.56,
    muzzleVel: 600,
    dragK: 0.000105,
    filler: 5.83,
    blastRadius: 28,
    fragRadius: 55,
    desc: '152 mm high explosive. A direct hit can tear the turret off a Tiger without ever piercing it.',
  },

  // ---------------------------------------------------------------- Machine gun
  smk792: {
    id: 'smk792',
    name: '7,92 mm S.m.K.',
    short: 'MG',
    kind: 'AP',
    caliber: 7.92,
    mass: 0.0116,
    muzzleVel: 785,
    dragK: 0.00095,
    penTable: [[100, 10], [300, 7], [500, 5]],
    ricochetDeg: 50,
    desc: 'Machine gun armour-piercing core. Against infantry, guns and optics.',
  },
  dt762: {
    id: 'dt762',
    name: '7,62 mm DT',
    short: 'MG',
    kind: 'AP',
    caliber: 7.62,
    mass: 0.0096,
    muzzleVel: 840,
    dragK: 0.00098,
    penTable: [[100, 9], [300, 6], [500, 4]],
    ricochetDeg: 50,
    desc: 'Soviet rifle-calibre machine gun.',
  },
};

/** Ammunition types the Tiger's loader can actually chamber. */
export const TIGER_AMMO_TYPES = ['pzgr39', 'sprgr39', 'nbgr', 'pzgr40', 'gr39hl'];

/** Crew shorthand used by the command menu and dialogue. */
export const AMMO_ORDER_NAMES = {
  pzgr39: 'Panzergranate',
  pzgr40: 'Panzergranate 40',
  gr39hl: 'Hohlladung',
  sprgr39: 'Sprenggranate',
  nbgr: 'Nebelgranate',
};

export function getProjectile(id) {
  const p = PROJECTILES[id];
  if (!p) throw new Error(`Unknown projectile: ${id}`);
  return p;
}
