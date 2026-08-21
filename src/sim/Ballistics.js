// Exterior ballistics.
//
// Velocity decay uses  dv/ds = -k*v  =>  v(s) = v0 * exp(-k*s).
// The per-projectile k in src/data/ammunition.js was solved so that the resulting
// remaining velocities match the published wartime figures. For the 8.8 cm PzGr. 39
// this reproduces ~667 m/s at 1000 m and ~576 m/s at 2000 m against published
// values of ~669 and ~578 m/s.
//
// Trajectory is integrated, not approximated with a parabola, because the
// gunner's TZF 9b ranging reticle and the flight time of the shell both matter:
// a T-34 crossing at 15 km/h moves 4 m during a 1000 m shot.

import { getProjectile } from '../data/ammunition.js';

const G = 9.80665;

/** Remaining velocity after travelling `dist` metres. */
export function velocityAt(proj, dist) {
  return proj.muzzleVel * Math.exp(-proj.dragK * dist);
}

/** Time of flight to `dist` metres (closed form of the exponential decay model). */
export function timeOfFlight(proj, dist) {
  const k = proj.dragK;
  if (k < 1e-9) return dist / proj.muzzleVel;
  // s(t) = (1/k) * ln(1 + k*v0*t)  =>  t = (exp(k*s) - 1) / (k*v0)
  return (Math.exp(k * dist) - 1) / (k * proj.muzzleVel);
}

/** Drop in metres at `dist` for a gun laid horizontally. */
export function dropAt(proj, dist) {
  const t = timeOfFlight(proj, dist);
  return 0.5 * G * t * t;
}

/**
 * Superelevation (radians) the gunner must apply to hit a target at `dist`
 * on the same level. Solved by two Newton iterations, which is plenty.
 */
export function superelevation(proj, dist, heightDelta = 0) {
  if (dist < 1) return 0;
  let angle = Math.atan2(dropAt(proj, dist) + heightDelta, dist);
  for (let i = 0; i < 3; i++) {
    const t = timeOfFlight(proj, dist / Math.max(0.2, Math.cos(angle)));
    const y = Math.tan(angle) * dist - 0.5 * G * t * t;
    const err = heightDelta - y;
    angle += err / dist;
  }
  return angle;
}

/**
 * A live projectile in flight. Stepped by the fixed simulation tick, so the
 * shell exists in the world and can be seen, heard and missed.
 */
export class Projectile {
  constructor() { this.reset(); }

  reset() {
    this.active = false;
    this.projId = null;
    this.data = null;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.speed = 0;
    this.distance = 0;
    this.age = 0;
    this.shooter = null;
    this.intendedTarget = null;
    this.tracerSeed = 0;
  }

  /**
   * @param {string} projId
   * @param {{x,y,z}} origin      muzzle position, world
   * @param {{x,y,z}} dir         unit vector, already including superelevation and dispersion
   * @param {object} shooter
   */
  fire(projId, origin, dir, shooter) {
    this.reset();
    this.active = true;
    this.projId = projId;
    this.data = getProjectile(projId);
    this.pos.x = origin.x; this.pos.y = origin.y; this.pos.z = origin.z;
    this.prev.x = origin.x; this.prev.y = origin.y; this.prev.z = origin.z;
    const v = this.data.muzzleVel;
    this.vel.x = dir.x * v; this.vel.y = dir.y * v; this.vel.z = dir.z * v;
    this.speed = v;
    this.shooter = shooter;
    return this;
  }

  /** Advance one fixed step. Returns the swept segment for collision testing. */
  step(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;

    const k = this.data.dragK;
    const sp = this.speed;
    // Drag acts along the velocity vector; gravity acts down.
    const decel = k * sp * sp;
    const inv = sp > 1e-6 ? 1 / sp : 0;
    const ax = -this.vel.x * inv * decel;
    const ay = -this.vel.y * inv * decel - G;
    const az = -this.vel.z * inv * decel;

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    this.speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    const seg = Math.hypot(this.pos.x - this.prev.x, this.pos.y - this.prev.y, this.pos.z - this.prev.z);
    this.distance += seg;
    this.age += dt;
    return seg;
  }

  get direction() {
    const s = this.speed || 1;
    return { x: this.vel.x / s, y: this.vel.y / s, z: this.vel.z / s };
  }
}

/**
 * Apply gunnery dispersion to an aim direction.
 * Dispersion is a real cone with a standard deviation in milliradians —
 * it is NOT a hit/miss dice roll. The shell goes exactly where it is pointed.
 */
export function applyDispersion(dir, sigmaMrad, rng) {
  const sigma = sigmaMrad / 1000;
  // Build a basis perpendicular to dir.
  const up = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = up.y * dir.z - up.z * dir.y;
  const ry = up.z * dir.x - up.x * dir.z;
  const rz = up.x * dir.y - up.y * dir.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const ux = rx / rl, uy = ry / rl, uz = rz / rl;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;

  const a = rng.gauss(0, sigma);
  const b = rng.gauss(0, sigma);
  const nx = dir.x + ux * a + vx * b;
  const ny = dir.y + uy * a + vy * b;
  const nz = dir.z + uz * a + vz * b;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / nl, y: ny / nl, z: nz / nl };
}

/** Lead a moving target: where to aim so the shell and the target arrive together. */
export function computeLead(proj, shooterPos, targetPos, targetVel) {
  let dist = Math.hypot(targetPos.x - shooterPos.x, targetPos.y - shooterPos.y, targetPos.z - shooterPos.z);
  let t = 0;
  for (let i = 0; i < 3; i++) {
    t = timeOfFlight(proj, dist);
    const px = targetPos.x + targetVel.x * t;
    const py = targetPos.y + targetVel.y * t;
    const pz = targetPos.z + targetVel.z * t;
    dist = Math.hypot(px - shooterPos.x, py - shooterPos.y, pz - shooterPos.z);
  }
  return {
    point: {
      x: targetPos.x + targetVel.x * t,
      y: targetPos.y + targetVel.y * t,
      z: targetPos.z + targetVel.z * t,
    },
    flightTime: t,
    range: dist,
  };
}
