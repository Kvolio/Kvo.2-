// Small math helpers shared across the simulation.
// Angles: the simulation works in radians internally; the historical data
// files are written in degrees because that is how the wartime tables read.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/** Shortest signed difference between two angles, result in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `cur` toward `target` by at most `maxStep`, wrapping correctly. */
export function approachAngle(cur, target, maxStep) {
  const d = angleDelta(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function approach(cur, target, maxStep) {
  const d = target - cur;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/** Exponential smoothing that is stable at any framerate. */
export function damp(cur, target, lambda, dt) {
  return lerp(target, cur, Math.exp(-lambda * dt));
}

/** Linear interpolation through a sorted [[x,y], ...] table, clamped at the ends. */
export function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  const n = table.length;
  if (x >= table[n - 1][0]) return table[n - 1][1];
  for (let i = 1; i < n; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[n - 1][1];
}

/** Bearing in radians from +Z-forward convention, wrapped to [0, 2PI). */
export function normalizeAngle(a) {
  a %= Math.PI * 2;
  return a < 0 ? a + Math.PI * 2 : a;
}

/** Convert a world direction to a clock-face hour (1..12) relative to a heading. */
export function bearingToClock(relativeBearingRad) {
  // 0 rad = dead ahead = 12 o'clock. Clock increases clockwise.
  const a = normalizeAngle(relativeBearingRad);
  let hour = Math.round(a / (Math.PI / 6));
  if (hour === 0 || hour === 12) return 12;
  return hour;
}

export function clockToBearing(hour) {
  return normalizeAngle((hour % 12) * (Math.PI / 6));
}

/** Metres -> German gunnery "hundred metres" ranging steps, rounded as a crew would call it. */
export function callRange(metres) {
  if (metres < 400) return Math.round(metres / 50) * 50;
  if (metres < 1200) return Math.round(metres / 100) * 100;
  return Math.round(metres / 200) * 200;
}

export function formatGrid(x, z, originX = 0, originZ = 0) {
  // Simple 3-digit easting/northing grid, 100 m squares, Kursk local sheet.
  const e = Math.floor((x - originX) / 100) + 280;
  const n = Math.floor((z - originZ) / 100) + 725;
  const pad = (v) => String(((v % 1000) + 1000) % 1000).padStart(3, '0');
  return `${pad(e)}-${pad(n)}`;
}
