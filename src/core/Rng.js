// Deterministic seeded RNG (mulberry32). The simulation must be reproducible:
// the same seed + the same commands produce the same battle.
//
// IMPORTANT DESIGN RULE:
//   This RNG is NEVER used to decide whether a shell penetrates armour.
//   Penetration is computed from projectile and plate. See src/sim/Penetration.js.
//   The RNG is used for: dispersion, crew reaction timing, AI decisions,
//   fragment scatter, terrain generation, and campaign event rolls.

export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  reset(seed = this.seed) { this._s = seed >>> 0; }

  /** Uniform [0,1). */
  next() {
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** Pick without repeating the previous choice — used for crew dialogue variety. */
  pickFresh(arr, last) {
    if (arr.length <= 1) return arr[0];
    let v = this.pick(arr);
    let guard = 0;
    while (v === last && guard++ < 8) v = this.pick(arr);
    return v;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Standard normal via Box-Muller. Used for shot dispersion. */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== undefined) {
      const v = this._spare; this._spare = undefined;
      return mean + sd * v;
    }
    let u, v, s;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * mul;
    return mean + sd * u * mul;
  }
}

export const globalRng = new Rng(20430705); // 5 July 1943
