// ===========================================================================
//  PROCEDURAL PBR TEXTURE AUTHORING
//
//  There are no image files in this project. Every material is authored here at
//  load time onto a canvas and uploaded as a texture, which is what lets the
//  game stay a build-free static site that loads instantly on a phone and works
//  offline — and still have painted steel that reads as painted steel, cast
//  armour that reads as a casting, and rubber that does not look like metal.
//
//  Each material returns a set: albedo, normal, roughness and (where it helps)
//  ambient occlusion. Normals are derived from a height field with a Sobel
//  operator, so a weld bead or a cast pebble has real relief under the light
//  rather than a painted-on line.
//
//  Everything is cached and shared. Generating a 512² set costs a few
//  milliseconds; generating it twice costs twice that for no gain.
// ===========================================================================

import * as THREE from 'three';

// --------------------------------------------------------------------------
//  Noise
// --------------------------------------------------------------------------

/** Deterministic hash noise — the same texture every run, on every device. */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// NOTE ON TILING. valueNoise is lattice-based, so unless a call is given a
// period it does not wrap: the value at u=0 and the value at u=1 are unrelated
// and every texture shows a hard seam at each repeat. A hull side tiling twice
// therefore had a visible join straight down the middle of it. Pass `tile` — the
// same multiplier applied to u and v — and the pattern wraps exactly.

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Fractal noise. `tile` makes the result seamless at that period. */
function fbm(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5, tile = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let sx = x * freq, sy = y * freq;
    if (tile) { sx = ((sx % (tile * freq)) + tile * freq) % (tile * freq); sy = ((sy % (tile * freq)) + tile * freq) % (tile * freq); }
    sum += valueNoise(sx, sy, seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged noise — good for scratches, grain and worn edges.
 * `tile` is the period in input units: pass the same multiplier used on u and v
 * and the pattern wraps at the texture edge instead of showing a seam.
 */
function ridged(x, y, seed, octaves = 4, tile = 0) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let sx = x * freq, sy = y * freq;
    if (tile) {
      const period = tile * freq;
      sx = ((sx % period) + period) % period;
      sy = ((sy % period) + period) % period;
    }
    const n = Math.abs(valueNoise(sx, sy, seed + i * 57) * 2 - 1);
    sum += (1 - n) * amp;
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

function voronoi(x, y, seed, cells = 8) {
  const gx = Math.floor(x * cells), gy = Math.floor(y * cells);
  let best = 1e9, second = 1e9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy;
      const px = (cx + hash2(cx, cy, seed)) / cells;
      const py = (cy + hash2(cx, cy, seed + 7919)) / cells;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) { second = best; best = d; } else if (d < second) second = d;
    }
  }
  return { d1: Math.sqrt(best), d2: Math.sqrt(second), edge: Math.sqrt(second) - Math.sqrt(best) };
}

// --------------------------------------------------------------------------
//  Canvas plumbing
// --------------------------------------------------------------------------

const _cache = new Map();
let RES = 512;

export function setTextureResolution(px) {
  if (px === RES) return;
  RES = px;
  disposeTextures();
}

/**
 * Is there anywhere to draw? There is not, under `node --test`, and there might
 * not be in a hardened browser either. Everything below degrades to flat
 * colours rather than throwing, so the geometry stays testable headlessly and a
 * browser without canvas still gets a playable — if untextured — game.
 */
export function canAuthorTextures() {
  return typeof OffscreenCanvas !== 'undefined'
    || (typeof document !== 'undefined' && typeof document.createElement === 'function');
}

function makeCanvas(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Fill a canvas from a per-pixel function.
 * @param {number} size
 * @param {(x:number,y:number,u:number,v:number)=>[number,number,number]} fn
 *        returns 0..1 RGB
 */
function generate(size, fn) {
  if (!canAuthorTextures()) return null;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = fn(x, y, x / size, y / size);
      d[i] = Math.max(0, Math.min(255, r * 255));
      d[i + 1] = Math.max(0, Math.min(255, g * 255));
      d[i + 2] = Math.max(0, Math.min(255, b * 255));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Height field -> tangent-space normal map, via a Sobel operator. */
function normalFromHeight(size, heightFn, strength = 2.2) {
  if (!canAuthorTextures()) return null;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x, y, x / size, y / size);
  }
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  return generate(size, (x, y) => {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
             - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
             - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    return [nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5];
  });
}

function toTexture(canvas, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function cached(key, build) {
  const k = `${key}@${RES}`;
  if (!_cache.has(k)) _cache.set(k, build(RES));
  return _cache.get(k);
}

export function disposeTextures() {
  for (const set of _cache.values()) {
    for (const v of Object.values(set)) v?.dispose?.();
  }
  _cache.clear();
}

// --------------------------------------------------------------------------
//  Material sets
// --------------------------------------------------------------------------

/**
 * Dunkelgelb RAL 7028 over rolled armour plate.
 * Rolled steel has a faint directional grain; the paint was sprayed thin in the
 * field over a red-oxide primer, so it chips to a rust-brown rather than to
 * bare metal, and it wears first on edges and around hatches.
 */
export function paintedSteel(opts = {}) {
  const tint = opts.tint || [0.66, 0.58, 0.39];   // Dunkelgelb, as a display value
  const wear = opts.wear ?? 0.5;
  const key = `painted:${tint.join(',')}:${wear}`;
  return cached(key, (size) => {
    // A real painted vehicle varies at FOUR scales, and the old texture only had
    // two of them at tiny amplitude — plus or minus 0.06 on a 0.66 base. That is
    // why the tank read as one flat beige mass however well it was lit: nothing
    // on it varied enough to see. Amplitudes below are roughly tripled and a
    // large-scale fade layer and vertical streaking are added.
    const patch = (u, v) => fbm(u * 2, v * 2, 7, 3, 2, 0.5, 2);          // whole-panel fade
    const blotch = (u, v) => fbm(u * 6, v * 6, 23, 4, 2, 0.5, 6);            // dirt patches
    const streak = (u, v) => {
      // Rain and dust run DOWNWARD, so this one is deliberately anisotropic —
      // the one place on a tank where a directional pattern is correct.
      const s1 = ridged(u * 44, v * 4, 131, 2, 44);
      return Math.max(0, s1 - 0.55) * 2.2;
    };

    const albedo = generate(size, (x, y, u, v) => {
      const grain = fbm(u * 26, v * 26, 11, 3, 2, 0.5, 26) * 0.045;
      const p = patch(u, v);
      const bl = blotch(u, v);
      const st = streak(u, v);

      // Sun-faded paint where it is exposed, deeper colour where it is not.
      const fade = (p - 0.5) * 0.20;
      // Dirt: a warm grey-brown laid over the paint in patches and streaks.
      const dirt = Math.min(1, (bl > 0.56 ? (bl - 0.56) * 2.4 : 0) * 0.9 + st * 0.55) * (0.35 + wear * 0.65);

      // Chipping to red-oxide primer, on the same field as the normal map.
      const chipField = ridged(u * 26, v * 26, 41, 3, 26);
      const chip = chipField > (1 - 0.14 * wear) ? 1 : 0;
      const scratch = ridged(u * 60, v * 36, 67, 2, 60) > 0.965 ? 0.10 : 0;

      let r = tint[0] + grain + fade - scratch;
      let g = tint[1] + grain + fade * 0.92 - scratch;
      let b = tint[2] + grain + fade * 0.70 - scratch;
      if (chip) { r = 0.34; g = 0.19; b = 0.13; }
      r = r * (1 - dirt) + 0.44 * dirt;
      g = g * (1 - dirt) + 0.39 * dirt;
      b = b * (1 - dirt) + 0.30 * dirt;
      return [r, g, b];
    });

    const normal = normalFromHeight(size, (x, y, u, v) => {
      const grain = fbm(u * 26, v * 26, 11, 3, 2, 0.5, 26) * 0.30;
      const chip = ridged(u * 26, v * 26, 41, 3, 26) > (1 - 0.14 * wear) ? 0.6 : 0;
      const tooth = fbm(u * 120, v * 120, 5, 2, 2, 0.5, 120) * 0.16;
      return grain + chip + tooth;
    }, 2.1);

    const rough = generate(size, (x, y, u, v) => {
      // ROUGHNESS VARIATION is what makes a surface read as a real object, and
      // this map used to run 0.74 to 0.86 — a twelfth of the available range, so
      // every square metre of the tank caught the light identically. Dust is
      // matte, paint that has been rubbed by crew and branches is glossier,
      // chipped primer is rougher still. Now 0.34 to 0.97.
      const p = patch(u, v);
      const bl = blotch(u, v);
      const st = streak(u, v);
      const chip = ridged(u * 26, v * 26, 41, 3, 26) > (1 - 0.14 * wear) ? 0.16 : 0;
      const dusty = Math.min(1, (bl > 0.56 ? (bl - 0.56) * 2.4 : 0) + st * 0.6);
      const polish = Math.max(0, p - 0.62) * 1.6;       // rubbed and handled
      const r = Math.max(0.34, Math.min(0.97,
        0.62 + dusty * 0.30 + chip - polish * 0.42 + fbm(u * 14, v * 14, 31, 3, 2, 0.5, 14) * 0.10));
      return [r, r, r];
    });

    return {
      map: toTexture(albedo, { srgb: true }),
      normalMap: toTexture(normal),
      roughnessMap: toTexture(rough),
    };
  });
}

/**
 * Cast steel — the gun mantlet and the commander's cupola. A casting has a
 * pebbled surface from the sand mould that no rolled plate has, and it is the
 * clearest way to tell the two apart on a real Tiger.
 */
export function castSteel(opts = {}) {
  const tint = opts.tint || [0.62, 0.55, 0.37];
  return cached(`cast:${tint.join(',')}`, (size) => {
    const pebble = (u, v) => {
      const a = voronoi(u, v, 13, 22).d1;
      const b = voronoi(u, v, 71, 46).d1;
      return a * 0.6 + b * 0.4;
    };
    const albedo = generate(size, (x, y, u, v) => {
      const p = pebble(u, v);
      const mottle = fbm(u * 6, v * 6, 3, 4) * 0.10 - 0.05;
      const shade = 0.92 + p * 0.28;
      return [tint[0] * shade + mottle, tint[1] * shade + mottle, tint[2] * shade + mottle * 0.8];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => pebble(u, v) * 0.9 + fbm(u * 60, v * 60, 9, 2) * 0.1, 2.6);
    const rough = generate(size, (x, y, u, v) => {
      const r = 0.80 + pebble(u, v) * 0.14;
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/**
 * A gun tube. Painted like the hull, but the paint burns off around the breech
 * end and the whole thing is scoured and darker than a hull plate — which is
 * what stops the 88 reading as an extruded piece of the same beige slab.
 */
export function gunTube() {
  return cached('guntube', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      // Wear runs along the tube: heaviest at the muzzle and the breech end.
      const ends = Math.max(Math.exp(-(v ** 2) / 0.02), Math.exp(-((1 - v) ** 2) / 0.03));
      const scour = fbm(u * 40, v * 8, 311, 3);
      const soot = fbm(u * 6, v * 12, 313, 4) * ends;
      const base = 0.44 + scour * 0.07 - soot * 0.24;
      return [base * 1.06, base * 0.96, base * 0.72];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      fbm(u * 50, v * 12, 311, 3) * 0.6 + fbm(u * 120, v * 120, 317, 2) * 0.4, 1.0);
    const rough = generate(size, (x, y, u, v) => {
      const ends = Math.max(Math.exp(-(v ** 2) / 0.02), Math.exp(-((1 - v) ** 2) / 0.03));
      const r = 0.58 + fbm(u * 10, v * 10, 319, 3) * 0.20 + ends * 0.16;
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Bare machined metal — breech, gun tube interior, tools, track pins. */
export function machinedMetal(opts = {}) {
  const tint = opts.tint || [0.42, 0.42, 0.44];
  return cached(`machined:${tint.join(',')}`, (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      // Machining grain. The old 180:3 frequency ratio produced hard corduroy
      // stripes rather than a turned finish; 90:14 reads as metal.
      const grain = ridged(u * 90, v * 14, 17, 2) * 0.055;
      const dirt = fbm(u * 7, v * 7, 53, 4) * 0.14;
      return [tint[0] + grain - dirt * 0.5, tint[1] + grain - dirt * 0.5, tint[2] + grain - dirt * 0.45];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      ridged(u * 90, v * 14, 17, 2) * 0.35 + fbm(u * 90, v * 90, 29, 2) * 0.25, 0.9);
    const rough = generate(size, (x, y, u, v) => {
      const r = 0.42 + fbm(u * 12, v * 12, 61, 3) * 0.24 + ridged(u * 90, v * 14, 17, 2) * 0.08;
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Track steel — polished bright where it runs on the wheels, muddy elsewhere. */
export function trackSteel() {
  return cached('track', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const wearBand = Math.exp(-((v - 0.5) ** 2) / 0.02);     // bright centre band
      const rust = fbm(u * 10, v * 10, 77, 4);
      const mud = fbm(u * 5, v * 5, 91, 3) * 0.6;
      let r = 0.30 + wearBand * 0.30 + rust * 0.12;
      let g = 0.29 + wearBand * 0.30 + rust * 0.07;
      let b = 0.28 + wearBand * 0.31 + rust * 0.03;
      r = r * (1 - mud * 0.55) + 0.26 * mud * 0.55;
      g = g * (1 - mud * 0.55) + 0.19 * mud * 0.55;
      b = b * (1 - mud * 0.55) + 0.12 * mud * 0.55;
      return [r, g, b];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      fbm(u * 40, v * 40, 43, 3) * 0.6 + voronoi(u, v, 19, 14).d1 * 0.4, 2.0);
    const rough = generate(size, (x, y, u, v) => {
      const wearBand = Math.exp(-((v - 0.5) ** 2) / 0.02);
      const r = 0.78 - wearBand * 0.42 + fbm(u * 8, v * 8, 13, 3) * 0.14;
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Road-wheel rubber — matt, fine-grained, dusty. */
export function rubber() {
  return cached('rubber', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      // Clean rubber sits near 5% reflectance, and at 0.055 the tyres rendered
      // as black voids: at arm's length the road wheels read as pale discs
      // inside heavy black rings, which is not what a Tiger's running gear
      // looks like in any photograph. These tyres live in Russian dust, and
      // dust is most of what the light comes back off. Base raised and the
      // dust term given real weight.
      // These numbers are written into an sRGB-tagged texture, so they are
      // DISPLAY values, not linear reflectances. Authored at 0.085 on the
      // reasoning that clean rubber sits near 5% reflectance, they came out at
      // 22/255 — near black — and the tyres rendered as holes punched in the
      // running gear. A dusty tyre in a photograph sits around 70/255.
      const g = fbm(u * 70, v * 70, 101, 3) * 0.06;
      const dust = fbm(u * 6, v * 6, 103, 3) * 0.22;
      const base = 0.235 + g;
      return [base + dust * 0.55, base + dust * 0.48, base + dust * 0.36];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => fbm(u * 110, v * 110, 101, 3), 0.9);
    const rough = generate(size, () => [0.94, 0.94, 0.94]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Canvas — tarpaulins, belt bags, seat pads. Woven, so it needs a weave. */
export function canvasCloth(opts = {}) {
  const tint = opts.tint || [0.47, 0.44, 0.32];
  return cached(`canvas:${tint.join(',')}`, (size) => {
    const weave = (u, v) => {
      const w = Math.sin(u * Math.PI * 2 * 70) * Math.cos(v * Math.PI * 2 * 70);
      return w * 0.5 + 0.5;
    };
    const albedo = generate(size, (x, y, u, v) => {
      const w = weave(u, v) * 0.10 - 0.05;
      const stain = fbm(u * 4, v * 4, 131, 4) * 0.16;
      return [tint[0] + w - stain * 0.5, tint[1] + w - stain * 0.5, tint[2] + w - stain * 0.4];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => weave(u, v) * 0.7 + fbm(u * 20, v * 20, 133, 2) * 0.3, 1.5);
    const rough = generate(size, () => [0.93, 0.93, 0.93]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Panzer black wool — the crew's Sonderbekleidung. */
export function woolCloth(opts = {}) {
  const tint = opts.tint || [0.045, 0.045, 0.052];
  return cached(`wool:${tint.join(',')}`, (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const fibre = fbm(u * 90, v * 90, 151, 3) * 0.05;
      const fade = fbm(u * 3, v * 3, 157, 3) * 0.04;
      return [tint[0] + fibre + fade, tint[1] + fibre + fade, tint[2] + fibre + fade];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      fbm(u * 80, v * 80, 151, 3) * 0.6 + fbm(u * 14, v * 14, 159, 2) * 0.4, 1.2);
    const rough = generate(size, () => [0.96, 0.96, 0.96]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Timber — izba log walls, tool handles, jack blocks. */
export function wood(opts = {}) {
  const tint = opts.tint || [0.26, 0.18, 0.10];
  return cached(`wood:${tint.join(',')}`, (size) => {
    const rings = (u, v) => {
      const warp = fbm(u * 4, v * 4, 173, 3) * 0.3;
      return (Math.sin((v * 26 + warp * 6) * Math.PI) * 0.5 + 0.5);
    };
    const albedo = generate(size, (x, y, u, v) => {
      const r = rings(u, v) * 0.22 - 0.08;
      const grain = ridged(u * 8, v * 120, 179, 2) * 0.10;
      return [tint[0] + r + grain, tint[1] + r * 0.8 + grain * 0.8, tint[2] + r * 0.6 + grain * 0.6];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => rings(u, v) * 0.5 + ridged(u * 8, v * 120, 179, 2) * 0.5, 1.4);
    const rough = generate(size, (x, y, u, v) => {
      const r = 0.86 + rings(u, v) * 0.08;
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Dry Kursk black earth, the ground the whole battle was fought on. */
export function dryEarth() {
  return cached('earth', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const clod = voronoi(u, v, 29, 12);
      const fine = fbm(u * 30, v * 30, 191, 4);
      const dark = fbm(u * 4, v * 4, 193, 3);
      // Kursk black earth is dark soil, but a sunlit field of it is not black.
      // This is the albedo the sun multiplies, so it has to sit where a real
      // dry ploughed field sits — around a third, not a fifth.
      const base = 0.34 + fine * 0.12 + clod.d1 * 0.16 - dark * 0.08;
      return [base * 1.12, base * 0.96, base * 0.72];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      voronoi(u, v, 29, 12).d1 * 0.55 + fbm(u * 40, v * 40, 191, 4) * 0.45, 2.4);
    const rough = generate(size, () => [0.97, 0.97, 0.97]);
    return { map: toTexture(albedo, { srgb: true, repeat: 1 }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Standing rye — the crop the salient was covered in that July. */
export function ryeField() {
  return cached('rye', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const stalks = ridged(u * 150, v * 18, 211, 2);
      const patch = fbm(u * 5, v * 5, 213, 4);
      const base = 0.40 + stalks * 0.16 + patch * 0.12;
      return [base * 1.20, base * 1.05, base * 0.55];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => ridged(u * 150, v * 18, 211, 2), 1.3);
    const rough = generate(size, () => [0.95, 0.95, 0.95]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

export function grassField() {
  return cached('grass', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const blades = ridged(u * 130, v * 130, 223, 2);
      const patch = fbm(u * 6, v * 6, 227, 4);
      const base = 0.16 + blades * 0.10 + patch * 0.10;
      return [base * 0.85, base * 1.35, base * 0.55];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => ridged(u * 130, v * 130, 223, 2), 1.2);
    const rough = generate(size, () => [0.95, 0.95, 0.95]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

export function mudGround() {
  return cached('mud', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const ruts = ridged(u * 4, v * 40, 233, 3);
      const wet = fbm(u * 7, v * 7, 239, 4);
      const base = 0.10 + ruts * 0.07 + wet * 0.05;
      return [base * 1.10, base * 0.92, base * 0.70];
    });
    const normal = normalFromHeight(size, (x, y, u, v) =>
      ridged(u * 4, v * 40, 233, 3) * 0.7 + fbm(u * 30, v * 30, 239, 3) * 0.3, 2.8);
    const rough = generate(size, (x, y, u, v) => {
      const r = 0.55 + fbm(u * 7, v * 7, 239, 4) * 0.30;   // wet patches shine
      return [r, r, r];
    });
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** A dirt road, rutted by tracks. */
export function dirtTrack() {
  return cached('dirtroad', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const rut = Math.exp(-((u - 0.30) ** 2) / 0.004) + Math.exp(-((u - 0.70) ** 2) / 0.004);
      const dust = fbm(u * 20, v * 20, 251, 4);
      const base = 0.26 + dust * 0.10 - rut * 0.07;
      return [base * 1.18, base * 1.02, base * 0.76];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => {
      const rut = Math.exp(-((u - 0.30) ** 2) / 0.004) + Math.exp(-((u - 0.70) ** 2) / 0.004);
      return fbm(u * 40, v * 40, 251, 3) * 0.6 - rut * 0.4;
    }, 2.0);
    const rough = generate(size, () => [0.96, 0.96, 0.96]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Thatched or plank roofing for the izbas. */
export function thatch() {
  return cached('thatch', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const straw = ridged(u * 20, v * 160, 263, 2);
      const rot = fbm(u * 5, v * 5, 269, 4);
      const base = 0.20 + straw * 0.14 - rot * 0.07;
      return [base * 1.25, base * 1.05, base * 0.62];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => ridged(u * 20, v * 160, 263, 2), 2.0);
    const rough = generate(size, () => [0.97, 0.97, 0.97]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/** Soviet green — 4BO, the colour every Soviet vehicle at Kursk was painted. */
export function sovietGreen(opts = {}) {
  return paintedSteel({ tint: opts.tint || [0.16, 0.20, 0.11], wear: opts.wear ?? 0.6 });
}

/** German field grey, for the infantry and the workshop people. */
export function fieldGrey() {
  return woolCloth({ tint: [0.16, 0.18, 0.15] });
}

/** Human skin. Kept simple — this is not a character-art project. */
export function skin() {
  return cached('skin', (size) => {
    const albedo = generate(size, (x, y, u, v) => {
      const pore = fbm(u * 100, v * 100, 271, 3) * 0.04;
      const flush = fbm(u * 6, v * 6, 277, 3) * 0.06;
      return [0.48 + pore + flush, 0.30 + pore + flush * 0.6, 0.22 + pore + flush * 0.4];
    });
    const normal = normalFromHeight(size, (x, y, u, v) => fbm(u * 120, v * 120, 271, 3), 0.6);
    const rough = generate(size, () => [0.72, 0.72, 0.72]);
    return { map: toTexture(albedo, { srgb: true }), normalMap: toTexture(normal), roughnessMap: toTexture(rough) };
  });
}

/**
 * A 1024-wide strip of sky used to build the environment map. A gradient from
 * horizon haze to zenith blue with a sun disc, so PBR materials have something
 * real to reflect. Without an environment map, metal in three.js looks like
 * painted plastic.
 */
export function skyGradient(topColor, horizonColor, groundColor, sunElevation, sunColor) {
  if (!canAuthorTextures()) return null;
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, topColor);
  g.addColorStop(0.46, horizonColor);
  g.addColorStop(0.52, horizonColor);
  g.addColorStop(1, groundColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // A soft sun disc at the right elevation, so reflections have a highlight.
  const sy = size * (0.5 - Math.sin(sunElevation) * 0.5);
  const sun = ctx.createRadialGradient(size * 0.5, sy, 0, size * 0.5, sy, size * 0.16);
  sun.addColorStop(0, sunColor);
  sun.addColorStop(0.25, sunColor);
  sun.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Cache statistics, for the performance overlay. */
export function textureStats() {
  return { sets: _cache.size, resolution: RES };
}

// --------------------------------------------------------------------------
//  Warm-up
// --------------------------------------------------------------------------

/** Every material set, by name, so the warm-up knows what there is to build. */
export const MATERIAL_SETS = {
  paintedSteel, castSteel, machinedMetal, trackSteel, rubber, gunTube,
  canvasCloth, woolCloth, wood, dryEarth, ryeField, grassField,
  mudGround, dirtTrack, thatch, sovietGreen, fieldGrey, skin,
};

/** Texture resolution per quality preset. */
export const TEXTURE_RESOLUTION = {
  // Raised across the board. A hull side 5.9 m long tiling twice was getting
  // 512 px over 3 m of steel — about 170 pixels per metre, which is why the
  // armour had no surface at any distance under ten metres.
  low: 192, medium: 384, high: 768, ultra: 1024, cinematic: 1536,
};

/**
 * Build the material sets ahead of time, yielding to the browser between each
 * so the page stays responsive and the loading bar actually moves. A 512px set
 * costs a few hundred milliseconds to author; doing seventeen of them in one
 * synchronous block would freeze the tab for five seconds.
 *
 * @param {(done:number,total:number,name:string)=>void} onProgress
 */
export async function warmup(onProgress) {
  if (!canAuthorTextures()) return 0;
  const names = Object.keys(MATERIAL_SETS);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    MATERIAL_SETS[name]();
    onProgress?.(i + 1, names.length, name);
    // Yield so the browser can paint. requestAnimationFrame keeps it to one
    // set per frame, which is the smoothest way to do this on a phone.
    await new Promise((r) => (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => r())
      : setTimeout(r, 0)));
  }
  return _cache.size;
}
