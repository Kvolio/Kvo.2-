// ===========================================================================
//  MATERIALS
//
//  Built on the procedural PBR texture sets in Textures.js. The point of this
//  file is material DIFFERENTIATION: painted steel, cast steel, bare machined
//  metal, rubber, glass, canvas, wool and wood must all behave differently
//  under the same light, or the Tiger reads as one lump of plastic.
//
//  Every material is cached and shared, so a hundred bolts cost one material.
//  Texture repeat is set per material at roughly one texture tile per metre so
//  that a 3.7 m wide hull does not show the same 512 px patch four times.
// ===========================================================================

import * as THREE from 'three';
import * as TEX from './Textures.js';

// --- Historical colours, as linear values --------------------------------
export const DUNKELGELB = 0xa89464;      // RAL 7028, Feb 1943 onward
export const OLIVGRUEN = 0x6b6b45;
export const ROTBRAUN = 0x7a4a35;
export const SOVIET_4BO = 0x4a5738;
export const INTERIOR_IVORY = 0xd8d2c0;  // Tiger interiors were painted ivory
export const INTERIOR_RED = 0x8a4030;    // red oxide primer below the sponsons
export const PANZER_BLACK = 0x232326;

/**
 * A NOTE ON METALNESS, because everything here was authored two to three times
 * too metallic and it cost the whole vehicle its material separation.
 *
 * In a metallic PBR workflow, metalness 1 means the albedo becomes the specular
 * F0 and there is NO DIFFUSE TERM AT ALL — every photon that comes back is a
 * reflection. Pair that with roughness 1 and the reflection is maximally
 * blurred, so the surface returns the average radiance of whatever it faces.
 * Under a hull, facing dark ground, that is black. A critic reported the tracks
 * and tyres as "pure flat black with no lighting response, reading as a hole
 * rather than as rubber", and that is exactly what the numbers were asking for.
 *
 * Physically: paint is a dielectric, metalness 0. Rusted, dusty, sooted or
 * greasy metal is mostly covered in dielectric too and belongs low. Only clean
 * machined metal, brass and the bare steel exposed by a fresh penetration are
 * genuinely metallic.
 */
const cache = new Map();

/**
 * Materials that live inside the tank. They must NOT be lit by the outdoor
 * environment map: a sealed steel box does not reflect a July sky, and letting
 * it do so made the fighting compartment brighter than the sky outside — which
 * destroys the entire point of the hatch being a decision.
 */
const interiorKeys = new Set();

function build(key, fn, opts = {}) {
  if (!cache.has(key)) {
    cache.set(key, fn());
    if (opts.interior) interiorKeys.add(key);
  }
  return cache.get(key);
}

/** Mark a material as belonging inside the tank. */
function insideTank(key, m) { interiorKeys.add(key); return m; }

/** Clone a texture set with a different tiling, without regenerating it. */
function tiled(set, repeat) {
  if (!set || repeat === 1) return set;
  const out = {};
  for (const [k, v] of Object.entries(set)) {
    if (!v) continue;
    const t = v.clone();
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
    out[k] = t;
  }
  return out;
}

/**
 * Drop null entries so a material built without textures is a plain coloured
 * MeshStandardMaterial rather than one with `map: null` overriding its colour.
 */
function compact(set) {
  const out = {};
  for (const [k, v] of Object.entries(set || {})) if (v) out[k] = v;
  return out;
}

/**
 * @param {string} key
 * @param {Function} setFn      returns a texture set
 * @param {object} params       material parameters
 * @param {number} repeat       texture tiling
 * @param {number} [flatColor]  used when textures could not be authored, so the
 *                              game still shows the right colours without them
 */
function standard(key, setFn, params = {}, repeat = 1, flatColor = 0x9a9080) {
  return build(`${key}:${repeat}`, () => {
    const set = compact(tiled(setFn(), repeat));
    const textured = !!set.map;
    const m = new THREE.MeshStandardMaterial({
      ...set,
      ...params,
      // Without an albedo map the material's own colour has to carry it.
      color: textured ? (params.color ?? 0xffffff) : flatColor,
      roughness: textured ? params.roughness : 0.85,
    });
    // Normal-map strength is worth tuning per material: a weld bead wants
    // strong relief, a wool tunic wants almost none.
    if (params.normalScale !== undefined) {
      m.normalScale = new THREE.Vector2(params.normalScale, params.normalScale);
    }
    return m;
  });
}

export const M = {
  // ---- The Tiger's own steel -------------------------------------------
  /** Rolled armour plate in Dunkelgelb. The bulk of the vehicle. */
  hull: (repeat = 2) => standard('hull', () => TEX.paintedSteel({ wear: 0.5 }),
    { color: 0xffffff, roughness: 1, metalness: 0.03, normalScale: 1.0 }, repeat, DUNKELGELB),

  /** The same paint on smaller fittings, tiled tighter so the grain scales. */
  /**
   * The lower hull, the running gear surrounds and everything below the fender
   * line. A Tiger's dirt is not evenly distributed: the upper surfaces stay
   * more or less the colour they were painted and everything from the sponson
   * down is caked, and that hard-ish line at the fender is doing a great deal
   * of the work of making the vehicle look real in every photograph.
   *
   * It is a separate material rather than a gradient because a gradient baked
   * into a tiling texture repeats as a band at every tile edge, and a gradient
   * in world height drifts as the tank climbs a hill.
   */
  hullLower: (repeat = 2) => standard('hullLower',
    () => TEX.paintedSteel({ wear: 0.95, tint: [0.50, 0.44, 0.31] }),
    { roughness: 0.95, metalness: 0.05 }, repeat, 0x7d7053),

  hullDetail: () => standard('hullDetail', () => TEX.paintedSteel({ wear: 0.75 }),
    { color: 0xffffff, roughness: 1, metalness: 0.35, normalScale: 1.2 }, 6, 0x9c8a5c),

  /** Cast components: the mantlet and the drum cupola. Pebbled, not rolled. */
  cast: (repeat = 3) => standard('cast', () => TEX.castSteel(),
    { color: 0xffffff, roughness: 1, metalness: 0.32, normalScale: 1.3 }, repeat, 0x9d8b5e),

  /**
   * The 8.8 cm tube. Painted the same Dunkelgelb as the hull in reality, but it
   * must not RENDER the same: it is scoured, sooted at both ends and far more
   * metallic than a hull plate, and without that difference the gun reads as an
   * extrusion of the same beige slab.
   */
  barrel: () => standard('barrel', () => TEX.gunTube(),
    { color: 0xffffff, roughness: 1, metalness: 0.15, normalScale: 0.9 }, 3, 0x776a4c),

  /** The muzzle brake and breech end: bare, blued, heat-stained steel. */
  gunSteel: () => standard('gunSteel', () => TEX.machinedMetal({ tint: [0.17, 0.16, 0.15] }),
    { color: 0xffffff, roughness: 1, metalness: 0.60, normalScale: 1.0 }, 5, 0x24211e),

  /** Bare machined steel: breech, tools, pins, hinges. */
  steel: (repeat = 4) => standard('steel', () => TEX.machinedMetal(),
    { color: 0xffffff, roughness: 1, metalness: 0.45, normalScale: 0.9 }, repeat, 0x6c6c70),

  /** Dark oiled or blued steel: MG barrels, exhaust guards, muzzle brake. */
  darkSteel: (repeat = 4) => standard('darkSteel', () => TEX.machinedMetal({ tint: [0.13, 0.13, 0.14] }),
    { color: 0xffffff, roughness: 1, metalness: 0.25, normalScale: 0.9 }, repeat, 0x2a2a2c),

  /** Track links. Bright where they run, muddy and rusted where they do not. */
  track: (repeat = 1) => standard('track', () => TEX.trackSteel(),
    { color: 0xffffff, roughness: 1, metalness: 0.22, normalScale: 1.4 }, repeat, 0x55534e),

  /** Road wheel discs — painted like the hull but far dirtier. */
  wheel: () => standard('wheel', () => TEX.paintedSteel({ wear: 0.9, tint: [0.55, 0.49, 0.33] }),
    { color: 0xffffff, roughness: 1, metalness: 0.05, normalScale: 1.1 }, 3, 0x8d7d55),

  /** Road wheel tyres. Rubber-tyred wheels are a mid-1943 feature. */
  rubber: () => standard('rubber', () => TEX.rubber(),
    { color: 0xffffff, roughness: 0.95, metalness: 0.0, normalScale: 0.7 }, 4, 0x2e2b28),

  // ---- Interior ---------------------------------------------------------
  /** Elfenbein — the ivory the fighting compartment was painted, for light. */
  interior: (repeat = 3) => build(`interior:${repeat}`, () => new THREE.MeshStandardMaterial({
    color: INTERIOR_IVORY, roughness: 0.92, metalness: 0.02, envMapIntensity: 0.06,
  }), { interior: true }),
  interiorLower: () => build('interiorLower', () => new THREE.MeshStandardMaterial({
    color: INTERIOR_RED, roughness: 0.95, metalness: 0.04, envMapIntensity: 0.06,
  }), { interior: true }),
  /**
   * Painted and oiled steel inside the turret. Metalness was 0.80, which turned
   * every interior plate into a mirror for the sky. Real interior steel is
   * painted, greasy and dull.
   */
  interiorSteel: () => insideTank('interiorSteel:3',
    standard('interiorSteel', () => TEX.machinedMetal({ tint: [0.26, 0.26, 0.28] }),
      { color: 0xffffff, roughness: 1, metalness: 0.35, normalScale: 0.7, envMapIntensity: 0.08 },
      3, 0x53535a)),

  /** Brass instrument bezels, shell cases, fittings. Tarnished, not polished. */
  brass: () => build('brass', () => new THREE.MeshStandardMaterial({
    color: 0xa8853a, roughness: 0.46, metalness: 0.9, envMapIntensity: 0.18,
  }), { interior: true }),

  /**
   * Laminated optic glass. Physical material so it gets a clearcoat and a
   * proper specular response — a vision block must not read as a painted panel.
   */
  glass: () => build('glass', () => new THREE.MeshPhysicalMaterial({
    color: 0x1e2b33, roughness: 0.06, metalness: 0,
    transmission: 0.55, thickness: 0.04, ior: 1.52,
    clearcoat: 1, clearcoatRoughness: 0.03,
    transparent: true, opacity: 0.72,
  })),

  /** Sight optics — darker, and they catch a hard highlight. */
  optic: () => build('optic', () => new THREE.MeshPhysicalMaterial({
    color: 0x0a1418, roughness: 0.04, metalness: 0.1,
    clearcoat: 1, clearcoatRoughness: 0.02,
  })),

  // ---- Soft goods -------------------------------------------------------
  canvas: (repeat = 3) => standard('canvas', () => TEX.canvasCloth(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.0 }, repeat, 0x8a8060),
  wood: (repeat = 3) => standard('wood', () => TEX.wood(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.0 }, repeat, 0x6b5236),
  leather: () => standard('leather', () => TEX.woolCloth({ tint: [0.10, 0.07, 0.05] }),
    { color: 0xffffff, roughness: 1, metalness: 0.02, normalScale: 0.8 }, 4, 0x2a1e14),

  // ---- People -----------------------------------------------------------
  /** Panzer black Sonderbekleidung. */
  panzerBlack: () => standard('panzerBlack', () => TEX.woolCloth(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.8 }, 4, PANZER_BLACK),
  /** Field grey, for infantry and the workshop people. */
  uniform: () => standard('uniform', () => TEX.fieldGrey(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.8 }, 4, 0x3a3f38),
  skin: () => standard('skin', () => TEX.skin(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.5 }, 2, 0xb08868),

  // ---- Soviet -----------------------------------------------------------
  soviet: (repeat = 2) => standard('soviet', () => TEX.sovietGreen(),
    { color: 0xffffff, roughness: 1, metalness: 0.35, normalScale: 1.0 }, repeat, SOVIET_4BO),
  sovietDark: () => standard('sovietDark', () => TEX.sovietGreen({ tint: [0.11, 0.14, 0.08], wear: 0.75 }),
    { color: 0xffffff, roughness: 1, metalness: 0.4, normalScale: 1.0 }, 4, 0x3e4a2e),

  // ---- Ground and world -------------------------------------------------
  dirt: (repeat = 8) => standard('dirt', () => TEX.dryEarth(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.4 }, repeat, 0x6b5a3e),
  mud: (repeat = 6) => standard('mud', () => TEX.mudGround(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.8 }, repeat, 0x3d3226),
  road: (repeat = 4) => standard('road', () => TEX.dirtTrack(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.4 }, repeat, 0x7a6a4e),
  rye: (repeat = 6) => standard('rye', () => TEX.ryeField(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.0 }, repeat, 0xa89a5a),
  grass: (repeat = 6) => standard('grass', () => TEX.grassField(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.0 }, repeat, 0x4f6034),
  thatch: () => standard('thatch', () => TEX.thatch(),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.6 }, 3, 0x6a5a34),
  timber: () => standard('timber', () => TEX.wood({ tint: [0.22, 0.16, 0.10] }),
    { color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.2 }, 2, 0x5a4630),

  // ---- Names the existing model code uses ------------------------------
  // The Tiger was one colour all over, but a turret casting, a rolled hull
  // plate and a small fitting want different tiling and different relief, so
  // these are distinct materials rather than aliases of one another.
  /** Rolled plate at a coarser tile — hull sides, decks, big surfaces. */
  hullDark: () => M.hullDetail(),
  /** The turret's rolled plate. Same steel as the hull, tighter tile. */
  turret: () => standard('turret', () => TEX.paintedSteel({ wear: 0.55 }),
    { color: 0xffffff, roughness: 1, metalness: 0.35, normalScale: 1.0 }, 3, DUNKELGELB),
  /** The Walzenblende. A casting, and it must read as one. */
  mantlet: () => M.cast(4),
  /** Generic soft cloth — tarpaulins, packs, seat pads. */
  cloth: () => M.canvas(4),

  /** A knocked-out, burnt-out vehicle. */
  burnt: () => build('burnt', () => new THREE.MeshStandardMaterial({
    color: 0x14110f, roughness: 0.98, metalness: 0.55,
  })),

  /** Bare metal exposed by a penetration or a deep gouge. */
  exposedMetal: () => build('exposedMetal', () => new THREE.MeshStandardMaterial({
    color: 0x6a6a68, roughness: 0.30, metalness: 0.95,
  })),
};

/** Set anisotropy on every generated texture once the renderer is known. */
export function applyAnisotropy(max) {
  for (const m of cache.values()) {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
      if (m[k]) { m[k].anisotropy = max; m[k].needsUpdate = true; }
    }
  }
}

/**
 * Give every material the scene environment so PBR has something to reflect —
 * except the ones inside the tank, which see almost none of it. A crewman in a
 * buttoned-up Tiger is not standing under an open sky, and rendering him as if
 * he were is what made the fighting compartment glow.
 */
export function applyEnvironment(envMap, intensity = 1) {
  for (const [key, m] of cache.entries()) {
    if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) continue;
    // Deliberately NOT setting m.envMap. A material-level envMap overrides
    // scene.environment entirely, which takes the scene's own intensity control
    // out of the loop — the environment then dominated every surface, flattened
    // the directional lighting and washed out every shadow on the vehicle.
    // Leaving it null lets scene.environment apply, and envMapIntensity here
    // scales it per material.
    m.envMapIntensity = interiorKeys.has(key) ? 0.07 : 1;
    m.needsUpdate = true;
  }
}

/** Is this material one of the fighting compartment's? */
export function isInteriorMaterial(key) { return interiorKeys.has(key); }

export function disposeAll() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
  TEX.disposeTextures();
}

export function materialStats() {
  return { materials: cache.size, ...TEX.textureStats() };
}
