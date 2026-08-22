// ===========================================================================
//  UNIT MARKINGS
//
//  A Tiger with no markings is a museum piece, not a vehicle belonging to a
//  unit. Two markings are wanted, and only two, because that is what
//  s.Pz.Abt. 503 actually carried into Zitadelle:
//
//    * the BALKENKREUZ on the hull sides and rear — the 1943 form, a black
//      cross with white flanks;
//    * the TURMNUMMER on the turret sides and rear. The 503 did not use the
//      three-digit company/platoon/vehicle system at Kursk. It used a letter
//      "S" (schwere) followed by two digits, painted large in white outline.
//      Our tank is S13; "Tiger 101" is its radio callsign, not its paint.
//
//  Both are drawn as 2D paths onto a canvas with an alpha channel, then worn
//  down by noise — because a marking that is crisp reads as a modern decal,
//  and these were brush-painted in the field over dust and then driven through
//  more of it. The result is applied as a thin decal mesh sitting a few
//  millimetres proud of the armour, which avoids having to UV-unwrap a hull
//  built out of sixty separate boxes.
// ===========================================================================

import * as THREE from 'three';

// --- the same small noise kernel used by the texture authoring ------------
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

function canAuthor() {
  return typeof OffscreenCanvas !== 'undefined'
    || (typeof document !== 'undefined' && typeof document.createElement === 'function');
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Erode the alpha channel with noise, and knock the paint about a bit.
 * `wear` 0 is fresh paint, 1 is barely there.
 */
function weather(ctx, w, h, seed, wear = 0.45) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const u = x / w, v = y / h;
      // Broad patchiness: whole areas of the brush stroke thin out.
      const patch = fbm(u * 6, v * 6, seed, 4);
      // Fine speckle: grit and chipping.
      const grit = fbm(u * 48, v * 48, seed + 7, 3);
      let a = d[i + 3] / 255;
      a *= 1 - wear * (0.55 * (1 - patch) + 0.45 * (1 - grit));
      // Hard chips: where both agree the paint has gone, take it away entirely.
      if (patch * 0.6 + grit * 0.4 < 0.30 * wear + 0.10) a *= 0.15;
      d[i + 3] = Math.max(0, Math.min(255, a * 255));
      // Dust settles on the paint and dulls the white.
      const dust = fbm(u * 9, v * 9, seed + 31, 3) * 0.22;
      d[i] = Math.min(255, d[i] * (1 - dust) + 150 * dust);
      d[i + 1] = Math.min(255, d[i + 1] * (1 - dust) + 138 * dust);
      d[i + 2] = Math.min(255, d[i + 2] * (1 - dust) + 106 * dust);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const _cache = new Map();

/**
 * The cross itself, as a single closed path. `ext` is the half-extent of the
 * arms from the centre, `halfW` the half-width of an arm.
 */
function crossPath(ctx, cx, cy, ext, halfW) {
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy - ext);
  ctx.lineTo(cx + halfW, cy - ext);
  ctx.lineTo(cx + halfW, cy - halfW);
  ctx.lineTo(cx + ext,   cy - halfW);
  ctx.lineTo(cx + ext,   cy + halfW);
  ctx.lineTo(cx + halfW, cy + halfW);
  ctx.lineTo(cx + halfW, cy + ext);
  ctx.lineTo(cx - halfW, cy + ext);
  ctx.lineTo(cx - halfW, cy + halfW);
  ctx.lineTo(cx - ext,   cy + halfW);
  ctx.lineTo(cx - ext,   cy - halfW);
  ctx.lineTo(cx - halfW, cy - halfW);
  ctx.closePath();
}

/**
 * The 1943 Balkenkreuz: a black cross with white flanks, the flanks about half
 * the width of the black bar. Square texture, cross centred.
 */
export function balkenkreuz() {
  if (!canAuthor()) return null;
  if (_cache.has('kreuz')) return _cache.get('kreuz');
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;

  // White flanks first, then the black bar inset inside them by a constant
  // 0.075 of the width on every edge — which is what makes it read as an
  // outlined cross rather than two crosses stacked.
  ctx.fillStyle = '#e6e2d6';
  crossPath(ctx, cx, cy, 0.460 * S, 0.200 * S);
  ctx.fill();
  ctx.fillStyle = '#16161a';
  crossPath(ctx, cx, cy, 0.385 * S, 0.125 * S);
  ctx.fill();

  weather(ctx, S, S, 4001, 0.42);
  const t = toTexture(c);
  _cache.set('kreuz', t);
  return t;
}

/**
 * The turret number, in white outline. Painted, so the stroke is uneven and
 * the corners are not sharp; a filled numeral would read as a printed sticker.
 * @param {string} text e.g. "S13"
 */
export function turmNummer(text = 'S13') {
  if (!canAuthor()) return null;
  const key = `nr:${text}`;
  if (_cache.has(key)) return _cache.get(key);
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(H * 0.80)}px "Arial Narrow", Arial, Helvetica, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#eae6da';
  ctx.lineWidth = Math.round(H * 0.055);
  // Two passes offset by a hair: a brush does not lay a perfectly even line.
  ctx.strokeText(text, W / 2, H / 2 + H * 0.02);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.round(H * 0.040);
  ctx.strokeText(text, W / 2 + 2, H / 2 + H * 0.02 - 2);
  ctx.globalAlpha = 1;

  weather(ctx, W, H, 5099, 0.50);
  const t = toTexture(c);
  _cache.set(key, t);
  return t;
}

/**
 * A material for a decal. Lit like the armour around it — paint on steel is
 * still paint on steel — but it neither casts nor writes depth, so it can sit
 * a few millimetres off the surface without fighting it.
 */
export function decalMaterial(map) {
  if (!map) return null;
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 0.88,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.FrontSide,
  });
}

/** A decal on a flat surface. `normal` is which way it faces: '+x','-x','+z','-z'. */
export function flatDecal(map, w, h, x, y, z, facing) {
  const mtl = decalMaterial(map);
  if (!mtl) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mtl);
  m.position.set(x, y, z);
  if (facing === '+x') m.rotation.y = Math.PI / 2;
  else if (facing === '-x') m.rotation.y = -Math.PI / 2;
  else if (facing === '-z') m.rotation.y = Math.PI;
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = 2;
  return m;
}

/**
 * A decal wrapped onto a cylinder — the turret sides are curved, and a flat
 * plane laid on them sinks 4 cm into the armour at its corners.
 * @param {number} r        radius to sit at (slightly outside the turret)
 * @param {number} arcLen   width of the marking measured around the surface
 * @param {number} h        height
 * @param {number} theta    centre angle; 0 is +Z, PI/2 is +X
 */
export function curvedDecal(map, r, arcLen, h, theta, y, z = 0) {
  const mtl = decalMaterial(map);
  if (!mtl) return null;
  const span = arcLen / r;
  const geo = new THREE.CylinderGeometry(r, r, h, 20, 1, true, theta - span / 2, span);
  const m = new THREE.Mesh(geo, mtl);
  m.position.set(0, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = 2;
  return m;
}

export function disposeMarkings() {
  for (const t of _cache.values()) t.dispose?.();
  _cache.clear();
}
