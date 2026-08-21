// Ray casting against a vehicle's armour plates.
//
// The shell is traced against the ACTUAL PLATE GEOMETRY defined in the vehicle
// data file. Which plate you hit, and at what obliquity, comes out of that
// geometry — so a hull-down Tiger genuinely presents only its turret, and a
// shot arriving from the flank genuinely meets the 80 mm side rather than a
// notional "side armour value".

import { DEG, RAD } from '../core/MathUtil.js';

/** Rotate a local-space vector by yaw (about +Y). */
function yaw(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function unyaw(v, a) { return yaw(v, -a); }

/**
 * Transform a world point/direction into a vehicle's local frame.
 * Turret plates get an extra rotation by the turret's azimuth relative to the hull.
 */
export function worldToLocal(vehicle, worldPt, isDirection = false) {
  let p = [
    worldPt.x - (isDirection ? 0 : vehicle.pos.x),
    worldPt.y - (isDirection ? 0 : vehicle.pos.y),
    worldPt.z - (isDirection ? 0 : vehicle.pos.z),
  ];
  p = unyaw(p, vehicle.heading);
  // Undo hull pitch/roll so plates stay correct on a slope.
  if (vehicle.pitch) {
    const c = Math.cos(-vehicle.pitch), s = Math.sin(-vehicle.pitch);
    p = [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  }
  if (vehicle.roll) {
    const c = Math.cos(-vehicle.roll), s = Math.sin(-vehicle.roll);
    p = [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, p[2]];
  }
  return p;
}

export function localToWorld(vehicle, local, isDirection = false) {
  let p = local.slice();
  if (vehicle.roll) {
    const c = Math.cos(vehicle.roll), s = Math.sin(vehicle.roll);
    p = [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, p[2]];
  }
  if (vehicle.pitch) {
    const c = Math.cos(vehicle.pitch), s = Math.sin(vehicle.pitch);
    p = [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  }
  p = yaw(p, vehicle.heading);
  if (isDirection) return { x: p[0], y: p[1], z: p[2] };
  return { x: p[0] + vehicle.pos.x, y: p[1] + vehicle.pos.y, z: p[2] + vehicle.pos.z };
}

/** A plate's centre and normal, accounting for turret rotation if it is a turret plate. */
export function plateFrame(plate, turretAz) {
  if (!plate.onTurret || !turretAz) {
    return { centre: plate.centre, normal: plate.normal, u: plate.u, v: plate.v };
  }
  // Turret plates rotate about the turret ring centre, which is not the hull origin.
  const ringZ = plate.ringZ ?? 0.35;
  const rel = [plate.centre[0], plate.centre[1], plate.centre[2] - ringZ];
  const r = yaw(rel, turretAz);
  return {
    centre: [r[0], r[1], r[2] + ringZ],
    normal: yaw(plate.normal, turretAz),
    u: yaw(plate.u, turretAz),
    v: yaw(plate.v, turretAz),
  };
}

/**
 * Intersect a ray (local space) with one oriented rectangular plate.
 * @returns {{t:number, point:number[], obliquity:number}|null}
 */
export function rayPlate(origin, dir, frame, halfU, halfV) {
  const n = frame.normal;
  const denom = dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2];
  if (Math.abs(denom) < 1e-7) return null;   // parallel to the plate

  const c = frame.centre;
  const t = ((c[0] - origin[0]) * n[0] + (c[1] - origin[1]) * n[1] + (c[2] - origin[2]) * n[2]) / denom;
  if (t < 0) return null;                    // behind the muzzle

  const px = origin[0] + dir[0] * t;
  const py = origin[1] + dir[1] * t;
  const pz = origin[2] + dir[2] * t;

  const dx = px - c[0], dy = py - c[1], dz = pz - c[2];
  const du = dx * frame.u[0] + dy * frame.u[1] + dz * frame.u[2];
  const dv = dx * frame.v[0] + dy * frame.v[1] + dz * frame.v[2];
  if (Math.abs(du) > halfU || Math.abs(dv) > halfV) return null;

  // Obliquity: angle between the shell path and the plate normal.
  // denom is cos of the angle between dir and n; a head-on hit has denom = -1.
  const cosA = Math.min(1, Math.max(-1, -denom));
  const obliquity = Math.acos(Math.abs(cosA));

  return { t, point: [px, py, pz], obliquity, localU: du, localV: dv };
}

/**
 * Trace a shot against a vehicle's full armour array.
 *
 * @param {object} vehicle    needs pos, heading, pitch, roll, turretAz, spec
 * @param {{x,y,z}} worldOrigin
 * @param {{x,y,z}} worldDir  unit
 * @param {number} maxDist
 * @returns {{plate, obliquity, localPoint, worldPoint, distance}|null} nearest plate struck
 */
export function traceArmour(vehicle, worldOrigin, worldDir, maxDist = 6000) {
  const spec = vehicle.spec;
  if (!spec || !spec.ARMOUR) return null;

  const o = worldToLocal(vehicle, worldOrigin, false);
  const d = worldToLocal(vehicle, worldDir, true);
  const dl = Math.hypot(d[0], d[1], d[2]) || 1;
  d[0] /= dl; d[1] /= dl; d[2] /= dl;

  let best = null;
  const az = vehicle.turretAz || 0;

  for (const p of spec.ARMOUR) {
    const frame = plateFrame(p, az);
    const hit = rayPlate(o, d, frame, p.halfU, p.halfV);
    if (!hit || hit.t > maxDist) continue;
    // A plate can only be struck from its outward face.
    const facing = -(d[0] * frame.normal[0] + d[1] * frame.normal[1] + d[2] * frame.normal[2]);
    if (facing <= 0) continue;
    if (!best || hit.t < best.distance) {
      best = {
        plate: p,
        frame,
        obliquity: hit.obliquity,
        localPoint: hit.point,
        localDir: d.slice(),
        distance: hit.t,
        worldPoint: localToWorld(vehicle, hit.point, false),
      };
    }
  }

  // Running gear screening: a shot at the lower hull side has to get through
  // the road wheels and the track first. That is real protection and the Tiger's
  // interleaved suspension gave a lot of it.
  if (best && best.plate.screenedByRunningGear) {
    best.screened = true;
    // Track + two or three overlapping 800 mm wheels ahead of the plate.
    best.screenThicknessMm = 30 + 55;
  }
  return best;
}

/** Which face of the vehicle was struck — used for crew reports and after-action logs. */
export function hitAspect(vehicle, worldDir) {
  const d = worldToLocal(vehicle, worldDir, true);
  // Direction the shell travels; invert to get the direction it came FROM.
  const fromX = -d[0], fromZ = -d[2];
  const ang = Math.atan2(fromX, fromZ) * RAD;   // 0 = dead ahead
  const a = Math.abs(ang);
  if (a <= 30) return 'front';
  if (a >= 150) return 'rear';
  return ang > 0 ? 'right side' : 'left side';
}

/**
 * Is this vehicle hull-down from an observer's position?
 * Used by the driver AI when told to find cover, and by enemy AI when choosing
 * whether an engagement is worth taking.
 */
export function exposureFraction(vehicle, fromPos, terrain) {
  if (!terrain) return 1;
  const dx = vehicle.pos.x - fromPos.x, dz = vehicle.pos.z - fromPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return 1;
  const ux = dx / dist, uz = dz / dist;

  // March along the line of sight and find the highest terrain that blocks it.
  const eye = fromPos.y;
  let maxBlockY = -Infinity;
  const steps = Math.min(64, Math.max(8, Math.floor(dist / 12)));
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const sx = fromPos.x + ux * dist * f;
    const sz = fromPos.z + uz * dist * f;
    const th = terrain.heightAt(sx, sz);
    // Height the terrain projects onto the target at full distance.
    const projected = eye + (th - eye) / f;
    if (projected > maxBlockY) maxBlockY = projected;
  }

  const base = vehicle.pos.y;
  const top = base + (vehicle.spec?.dims?.height || 3.0);
  if (maxBlockY <= base) return 1;
  if (maxBlockY >= top) return 0;
  return (top - maxBlockY) / (top - base);
}
