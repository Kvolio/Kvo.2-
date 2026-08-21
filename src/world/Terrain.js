// ===========================================================================
//  THE KURSK STEPPE
//
//  Rolling black-earth farmland: long open fields of unharvested rye, shallow
//  ridges you can put a Tiger behind, balkas (dry gullies), tree lines along
//  the field boundaries, dirt roads, and villages of wooden izbas.
//
//  The terrain is generated from a seed and is therefore identical every time
//  the same mission is played, which matters because the whole game is about
//  reading ground you can learn.
// ===========================================================================

import { Rng } from '../core/Rng.js';
import { clamp, clamp01, lerp, smoothstep } from '../core/MathUtil.js';

/** Value noise with smooth interpolation — cheap enough for mobile. */
class Noise2D {
  constructor(seed) {
    this.perm = new Uint8Array(512);
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _grad(hash, x, y) {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }

  sample(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = smoothstep(xf), v = smoothstep(yf);
    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];
    const x1 = lerp(this._grad(aa, xf, yf), this._grad(ba, xf - 1, yf), u);
    const x2 = lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

export const GROUND = {
  FIELD: 'field',        // rye, wheat, sunflowers — fast going, big dust plume
  TRACK: 'track',        // dirt road
  GRASS: 'grass',
  MUD: 'mud',            // balka floors, stream crossings — bogging risk
  WOOD: 'wood',          // impassable to a Tiger, and full of anti-tank guns
  VILLAGE: 'village',
};

export class Terrain {
  /**
   * @param {object} cfg  { seed, size, ridges, villages, woods, roads }
   */
  constructor(cfg = {}) {
    this.seed = cfg.seed ?? 19430705;
    this.size = cfg.size ?? 3000;           // metres, square, centred on origin
    this.half = this.size / 2;
    this.rng = new Rng(this.seed);
    this.noise = new Noise2D(this.seed);
    this.detail = new Noise2D(this.seed ^ 0x5bf03635);

    this.baseHeight = cfg.baseHeight ?? 0;
    this.amplitude = cfg.amplitude ?? 22;   // the salient is gently rolling, not mountainous
    this.featureScale = cfg.featureScale ?? 1 / 620;

    this.features = [];      // ridges, hills, depressions
    this.woods = [];
    this.villages = [];
    this.roads = [];
    this.balkas = [];        // dry gullies — the classic Kursk terrain feature
    this.minefields = [];

    this._generate(cfg);
    this._buildHeightCache();
  }

  _generate(cfg) {
    const rng = this.rng;
    const H = this.half;

    // ---- Ridges: the reason hull-down positions exist -----------------------
    const ridgeCount = cfg.ridges ?? rng.int(3, 6);
    for (let i = 0; i < ridgeCount; i++) {
      const ang = rng.range(0, Math.PI);
      const cx = rng.range(-H * 0.75, H * 0.75);
      const cz = rng.range(-H * 0.75, H * 0.75);
      this.features.push({
        type: 'ridge',
        x: cx, z: cz,
        dir: ang,
        length: rng.range(280, 900),
        width: rng.range(70, 190),
        height: rng.range(6, 16),
        name: `Height ${(rng.int(180, 260))}.${rng.int(0, 9)}`,
      });
    }

    // ---- Balkas: dry gullies that swallow a tank and hide infantry ----------
    for (let i = 0; i < (cfg.balkas ?? rng.int(2, 5)); i++) {
      this.balkas.push({
        x: rng.range(-H * 0.8, H * 0.8), z: rng.range(-H * 0.8, H * 0.8),
        dir: rng.range(0, Math.PI * 2),
        length: rng.range(220, 700), width: rng.range(24, 70), depth: rng.range(3, 8),
      });
    }

    // ---- Tree lines and woods ----------------------------------------------
    for (let i = 0; i < (cfg.woods ?? rng.int(4, 8)); i++) {
      const kind = rng.bool(0.55) ? 'treeline' : 'copse';
      if (kind === 'treeline') {
        this.woods.push({
          type: 'treeline',
          x: rng.range(-H * 0.85, H * 0.85), z: rng.range(-H * 0.85, H * 0.85),
          dir: rng.range(0, Math.PI * 2),
          length: rng.range(180, 620), width: rng.range(14, 32),
          density: rng.range(0.6, 1.0),
        });
      } else {
        this.woods.push({
          type: 'copse',
          x: rng.range(-H * 0.8, H * 0.8), z: rng.range(-H * 0.8, H * 0.8),
          radius: rng.range(45, 170),
          density: rng.range(0.7, 1.0),
        });
      }
    }

    // ---- Villages -----------------------------------------------------------
    const villageNames = ['Ponyri', 'Olkhovatka', 'Teploye', 'Soborovka', 'Samodurovka',
      'Berezovka', 'Yakovlevo', 'Syrtsevo', 'Cherkasskoye', 'Luchki', 'Prokhorovka',
      'Belenikhino', 'Gostishchevo', 'Melekhovo'];
    rng.shuffle(villageNames);
    for (let i = 0; i < (cfg.villages ?? rng.int(1, 3)); i++) {
      this.villages.push({
        name: villageNames[i % villageNames.length],
        x: rng.range(-H * 0.7, H * 0.7), z: rng.range(-H * 0.7, H * 0.7),
        radius: rng.range(70, 150),
        houses: rng.int(9, 26),
      });
    }

    // ---- Roads: villages joined by dirt tracks -------------------------------
    for (let i = 0; i < this.villages.length; i++) {
      const a = this.villages[i];
      const b = this.villages[(i + 1) % this.villages.length];
      if (a === b) continue;
      this.roads.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, width: 7 });
    }
    // One long road across the map — the axis of advance.
    this.roads.push({
      ax: rng.range(-H, -H * 0.6), az: rng.range(-H * 0.5, H * 0.5),
      bx: rng.range(H * 0.6, H), bz: rng.range(-H * 0.5, H * 0.5), width: 9,
    });

    // ---- Soviet defensive works ---------------------------------------------
    this.trenchLines = [];
    for (let i = 0; i < (cfg.trenches ?? rng.int(1, 3)); i++) {
      this.trenchLines.push({
        x: rng.range(-H * 0.6, H * 0.6), z: rng.range(-H * 0.6, H * 0.6),
        dir: rng.range(0, Math.PI * 2), length: rng.range(200, 520),
      });
    }
    for (let i = 0; i < (cfg.minefields ?? rng.int(0, 2)); i++) {
      this.minefields.push({
        x: rng.range(-H * 0.6, H * 0.6), z: rng.range(-H * 0.6, H * 0.6),
        radius: rng.range(80, 200), density: rng.range(0.3, 0.9), known: rng.bool(0.4),
      });
    }
  }

  // ---- Height -------------------------------------------------------------

  _rawHeight(x, z) {
    let h = this.baseHeight;

    // Broad rolling farmland.
    h += this.noise.fbm(x * this.featureScale, z * this.featureScale, 4) * this.amplitude;
    h += this.detail.fbm(x * this.featureScale * 5.5, z * this.featureScale * 5.5, 3) * 2.2;

    // Ridges.
    for (const f of this.features) {
      const dx = x - f.x, dz = z - f.z;
      const c = Math.cos(-f.dir), s = Math.sin(-f.dir);
      const lx = dx * c - dz * s;      // along the ridge
      const lz = dx * s + dz * c;      // across it
      const along = clamp01(1 - Math.abs(lx) / f.length);
      const across = clamp01(1 - Math.abs(lz) / f.width);
      if (along > 0 && across > 0) {
        h += f.height * smoothstep(along) * smoothstep(across);
      }
    }

    // Balkas cut down into it.
    for (const b of this.balkas) {
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(-b.dir), s = Math.sin(-b.dir);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const along = clamp01(1 - Math.abs(lx) / b.length);
      const across = clamp01(1 - Math.abs(lz) / b.width);
      if (along > 0 && across > 0) {
        h -= b.depth * smoothstep(along) * smoothstep(across) ** 0.6;
      }
    }

    // Villages sit on flattened ground.
    for (const v of this.villages) {
      const d = Math.hypot(x - v.x, z - v.z);
      if (d < v.radius * 1.3) {
        const f = smoothstep(clamp01(1 - d / (v.radius * 1.3)));
        const flat = this.noise.fbm(v.x * this.featureScale, v.z * this.featureScale, 3) * this.amplitude;
        h = lerp(h, flat, f * 0.7);
      }
    }

    // Roads are graded flat-ish.
    for (const r of this.roads) {
      const d = this._distToSegment(x, z, r.ax, r.az, r.bx, r.bz);
      if (d < r.width * 2.2) {
        const f = smoothstep(clamp01(1 - d / (r.width * 2.2))) * 0.45;
        h = lerp(h, h - 0.25, f);
      }
    }

    return h;
  }

  _buildHeightCache() {
    // A coarse grid, bilinearly sampled. Keeps heightAt() cheap on a phone.
    this.cacheRes = 192;
    this.cacheStep = this.size / (this.cacheRes - 1);
    this.cache = new Float32Array(this.cacheRes * this.cacheRes);
    for (let j = 0; j < this.cacheRes; j++) {
      for (let i = 0; i < this.cacheRes; i++) {
        const x = -this.half + i * this.cacheStep;
        const z = -this.half + j * this.cacheStep;
        this.cache[j * this.cacheRes + i] = this._rawHeight(x, z);
      }
    }
  }

  heightAt(x, z) {
    const fx = clamp((x + this.half) / this.cacheStep, 0, this.cacheRes - 1.001);
    const fz = clamp((z + this.half) / this.cacheStep, 0, this.cacheRes - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const r = this.cacheRes;
    const h00 = this.cache[j * r + i];
    const h10 = this.cache[j * r + i + 1];
    const h01 = this.cache[(j + 1) * r + i];
    const h11 = this.cache[(j + 1) * r + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x, z, eps = 2) {
    const hL = this.heightAt(x - eps, z), hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps), hU = this.heightAt(x, z + eps);
    const nx = hL - hR, nz = hD - hU, ny = 2 * eps;
    const l = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return Math.acos(clamp(n.y, -1, 1));
  }

  // ---- Ground type and going ----------------------------------------------

  groundAt(x, z) {
    for (const v of this.villages) {
      if (Math.hypot(x - v.x, z - v.z) < v.radius) return GROUND.VILLAGE;
    }
    for (const w of this.woods) {
      if (w.type === 'copse') {
        if (Math.hypot(x - w.x, z - w.z) < w.radius) return GROUND.WOOD;
      } else {
        const dx = x - w.x, dz = z - w.z;
        const c = Math.cos(-w.dir), s = Math.sin(-w.dir);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < w.length && Math.abs(lz) < w.width) return GROUND.WOOD;
      }
    }
    for (const r of this.roads) {
      if (this._distToSegment(x, z, r.ax, r.az, r.bx, r.bz) < r.width) return GROUND.TRACK;
    }
    for (const b of this.balkas) {
      const dx = x - b.x, dz = z - b.z;
      const c = Math.cos(-b.dir), s = Math.sin(-b.dir);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < b.length * 0.85 && Math.abs(lz) < b.width * 0.5) return GROUND.MUD;
    }
    // Most of the salient in July 1943 was standing rye and wheat.
    const n = this.noise.sample(x * 0.0021, z * 0.0021);
    return n > -0.15 ? GROUND.FIELD : GROUND.GRASS;
  }

  /** 0 = metalled road, 1 = a Tiger is about to get stuck. */
  resistanceAt(x, z) {
    const g = this.groundAt(x, z);
    const base = { [GROUND.TRACK]: 0.08, [GROUND.FIELD]: 0.35, [GROUND.GRASS]: 0.30,
      [GROUND.MUD]: 0.85, [GROUND.WOOD]: 1.0, [GROUND.VILLAGE]: 0.25 }[g] ?? 0.35;
    const slope = this.slopeAt(x, z);
    return clamp01(base + slope * 0.55 + (this.wet ?? 0) * 0.35);
  }

  /** How much dust a moving vehicle raises here. Kursk in July was very dry. */
  dustAt(x, z) {
    const g = this.groundAt(x, z);
    const wet = this.wet ?? 0;
    const base = { [GROUND.TRACK]: 1.0, [GROUND.FIELD]: 0.65, [GROUND.GRASS]: 0.45,
      [GROUND.MUD]: 0.05, [GROUND.WOOD]: 0.1, [GROUND.VILLAGE]: 0.7 }[g] ?? 0.5;
    return base * (1 - wet * 0.9);
  }

  passable(x, z) {
    if (Math.abs(x) > this.half - 20 || Math.abs(z) > this.half - 20) return false;
    if (this.groundAt(x, z) === GROUND.WOOD) return false;
    return this.slopeAt(x, z) < 35 * Math.PI / 180;
  }

  /** Is a straight line between two points clear of terrain? */
  lineOfSight(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) return true;
    const steps = Math.min(80, Math.max(6, Math.floor(dist / 14)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t, pz = z0 + dz * t, py = y0 + dy * t;
      if (this.heightAt(px, pz) > py + 0.25) return false;
      // Woods block line of sight as thoroughly as a hill.
      if (this.groundAt(px, pz) === GROUND.WOOD && t > 0.02 && t < 0.98) return false;
    }
    return true;
  }

  /**
   * Find a hull-down or covered position near `from`, relative to a threat.
   * This is what the driver actually uses when told to get behind cover.
   */
  findCover(fromX, fromZ, threatX, threatZ, searchRadius = 220, vehicleHeight = 3.0) {
    let best = null;
    const samples = 90;
    for (let i = 0; i < samples; i++) {
      const ang = (i / samples) * Math.PI * 2 + this.rng.next() * 0.3;
      for (const r of [40, 80, 130, 190, searchRadius]) {
        if (r > searchRadius) break;
        const x = fromX + Math.cos(ang) * r;
        const z = fromZ + Math.sin(ang) * r;
        if (!this.passable(x, z)) continue;

        const groundY = this.heightAt(x, z);
        // Hull-down: the hull is masked but the turret can still see and shoot.
        const hullMasked = !this.lineOfSight(threatX, this.heightAt(threatX, threatZ) + 2.2, threatZ,
          x, groundY + 1.2, z);
        const turretClear = this.lineOfSight(threatX, this.heightAt(threatX, threatZ) + 2.2, threatZ,
          x, groundY + 2.6, z);

        let score = 0;
        if (hullMasked && turretClear) score = 100;              // ideal
        else if (hullMasked && !turretClear) score = 70;         // full defilade
        else continue;

        // Prefer close cover — every metre in the open is a metre being shot at.
        const dist = Math.hypot(x - fromX, z - fromZ);
        score -= dist * 0.12;
        // Moving away from the threat is better than towards it.
        const towardThreat = ((x - fromX) * (threatX - fromX) + (z - fromZ) * (threatZ - fromZ));
        if (towardThreat > 0) score -= 25;
        // Soft ground is a trap.
        score -= this.resistanceAt(x, z) * 30;

        if (!best || score > best.score) {
          best = { x, z, y: groundY, score, hullDown: hullMasked && turretClear, fullDefilade: !turretClear, distance: dist };
        }
      }
    }
    return best;
  }

  /** Named terrain features, so the briefing and the map can talk about them. */
  landmarks() {
    return [
      ...this.features.filter((f) => f.type === 'ridge').map((f) => ({ name: f.name, kind: 'ridge', x: f.x, z: f.z })),
      ...this.villages.map((v) => ({ name: v.name, kind: 'village', x: v.x, z: v.z })),
      ...this.woods.filter((w) => w.type === 'copse').map((w, i) => ({ name: `Copse ${i + 1}`, kind: 'wood', x: w.x, z: w.z })),
    ];
  }

  _distToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = clamp01(t);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
}
