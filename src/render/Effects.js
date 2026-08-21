// Combat effects. All pooled, all scaled by the quality setting, and all
// specific rather than generic: a non-penetrating hit throws a bright shower of
// sparks and a puff of paint and scale off the plate; a penetration throws a
// short jet of debris INTO the tank; an engine fire is dark and oily; a
// propellant fire in an ammunition bin is white and violent.

import * as THREE from 'three';
import { Pool } from '../core/Pool.js';
import { clamp, clamp01 } from '../core/MathUtil.js';

const MAX_PARTICLES = { low: 300, medium: 900, high: 2400 };

export class Effects {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.quality = opts.quality || 'high';
    this.maxParticles = MAX_PARTICLES[this.quality] ?? 900;
    this.time = 0;

    // One buffer geometry for all particles keeps this to a single draw call,
    // which is what makes it viable on a phone.
    this.count = this.maxParticles;
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.alive = new Float32Array(this.count);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.maxLife = new Float32Array(this.count);
    this.kind = new Uint8Array(this.count);
    this.drag = new Float32Array(this.count);
    this.gravity = new Float32Array(this.count);
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geo = geo;

    const mat = new THREE.PointsMaterial({
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.9,
      sizeAttenuation: true, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Persistent fires attached to vehicles.
    this.fires = [];
    // Tracer streaks.
    this.tracers = [];
    const tracerGeo = new THREE.BufferGeometry();
    this.tracerPositions = new Float32Array(64 * 6);
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3));
    this.tracerLines = new THREE.LineSegments(tracerGeo,
      new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.85 }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
  }

  setQuality(q) {
    this.quality = q;
    this.maxParticles = MAX_PARTICLES[q] ?? 900;
  }

  _spawn(x, y, z, vx, vy, vz, r, g, b, size, life, drag = 1.2, grav = -9.8) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const i3 = i * 3;
    this.positions[i3] = x; this.positions[i3 + 1] = y; this.positions[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.colors[i3] = r; this.colors[i3 + 1] = g; this.colors[i3 + 2] = b;
    this.sizes[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.drag[i] = drag; this.gravity[i] = grav;
    return i;
  }

  _budget(n) {
    const scale = this.quality === 'low' ? 0.35 : this.quality === 'medium' ? 0.65 : 1;
    return Math.max(1, Math.round(n * scale));
  }

  // ---- Specific events -----------------------------------------------------

  /** A shell that failed to get through. Sparks, scale, and a lot of noise. */
  nonPenetration(pos, normal, caliber) {
    const n = this._budget(18 + caliber * 0.25);
    for (let i = 0; i < n; i++) {
      const sp = 6 + Math.random() * 22;
      const dx = normal.x + (Math.random() - 0.5) * 1.4;
      const dy = normal.y + (Math.random() - 0.5) * 1.4 + 0.4;
      const dz = normal.z + (Math.random() - 0.5) * 1.4;
      const l = Math.hypot(dx, dy, dz) || 1;
      this._spawn(pos.x, pos.y, pos.z, (dx / l) * sp, (dy / l) * sp, (dz / l) * sp,
        1.0, 0.85 + Math.random() * 0.15, 0.35, 0.10 + Math.random() * 0.10,
        0.35 + Math.random() * 0.45, 2.4);
    }
    // Paint and scale knocked off the plate.
    for (let i = 0; i < this._budget(8); i++) {
      this._spawn(pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5,
        0.55, 0.50, 0.38, 0.16, 1.2, 1.6);
    }
  }

  /** A deflection. A long bright streak going somewhere else. */
  ricochet(pos, incoming, normal, caliber) {
    // Reflect the incoming direction about the plate normal.
    const d = incoming;
    const dot = d.x * normal.x + d.y * normal.y + d.z * normal.z;
    const rx = d.x - 2 * dot * normal.x;
    const ry = d.y - 2 * dot * normal.y;
    const rz = d.z - 2 * dot * normal.z;
    for (let i = 0; i < this._budget(14); i++) {
      const sp = 25 + Math.random() * 45;
      this._spawn(pos.x, pos.y, pos.z,
        (rx + (Math.random() - 0.5) * 0.35) * sp,
        (ry + (Math.random() - 0.5) * 0.35) * sp + 3,
        (rz + (Math.random() - 0.5) * 0.35) * sp,
        1.0, 0.9, 0.5, 0.13, 0.9, 0.6);
    }
  }

  /** A penetration. Very little comes out; almost all of it goes in. */
  penetration(pos, dir, caliber) {
    for (let i = 0; i < this._budget(10); i++) {
      this._spawn(pos.x, pos.y, pos.z,
        -dir.x * (2 + Math.random() * 8) + (Math.random() - 0.5) * 4,
        Math.random() * 5,
        -dir.z * (2 + Math.random() * 8) + (Math.random() - 0.5) * 4,
        1.0, 0.75, 0.30, 0.12, 0.5, 2.0);
    }
    // The dark puff of a hole punched through steel.
    for (let i = 0; i < this._budget(8); i++) {
      this._spawn(pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
        0.16, 0.15, 0.14, 0.7 + Math.random() * 0.5, 2.4, 0.4, 0.6);
    }
  }

  /** A high-explosive burst on the ground. */
  explosion(pos, fillerKg) {
    const power = clamp(fillerKg, 0.05, 8);
    const n = this._budget(24 + power * 14);
    for (let i = 0; i < n; i++) {
      const sp = 4 + Math.random() * (12 + power * 8);
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.3;
      this._spawn(pos.x, pos.y + 0.2, pos.z,
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp * 1.4, Math.sin(a) * Math.cos(e) * sp,
        0.35 + Math.random() * 0.25, 0.28 + Math.random() * 0.18, 0.20,
        0.8 + Math.random() * power * 0.5, 1.6 + Math.random() * 1.5, 0.9, -5);
    }
    // The flash.
    for (let i = 0; i < this._budget(10); i++) {
      this._spawn(pos.x, pos.y + 0.3, pos.z,
        (Math.random() - 0.5) * 10, Math.random() * 12, (Math.random() - 0.5) * 10,
        1.0, 0.85, 0.45, 1.2, 0.25, 3.0, -2);
    }
  }

  /** Muzzle blast. On a Tiger this raises a cloud of dust in front of the tank. */
  muzzleFlash(pos, dir, caliber) {
    const scale = caliber / 88;
    for (let i = 0; i < this._budget(18 * scale); i++) {
      const sp = 12 + Math.random() * 35;
      this._spawn(pos.x, pos.y, pos.z,
        dir.x * sp + (Math.random() - 0.5) * 8,
        dir.y * sp + (Math.random() - 0.5) * 6 + 1,
        dir.z * sp + (Math.random() - 0.5) * 8,
        1.0, 0.88 - Math.random() * 0.2, 0.45, 0.55 * scale, 0.22, 4.5, -1);
    }
    // Smoke, hanging.
    for (let i = 0; i < this._budget(14 * scale); i++) {
      this._spawn(pos.x + dir.x * 1.5, pos.y + dir.y * 1.5, pos.z + dir.z * 1.5,
        dir.x * 6 + (Math.random() - 0.5) * 4, 1 + Math.random() * 2, dir.z * 6 + (Math.random() - 0.5) * 4,
        0.55, 0.52, 0.48, 1.1 * scale, 2.4 + Math.random(), 1.1, 0.3);
    }
  }

  /** Dust thrown up by a moving tracked vehicle on dry ground. */
  trackDust(pos, heading, speed, amount) {
    if (amount < 0.05 || speed < 0.5) return;
    if (Math.random() > amount * 0.6) return;
    const n = this._budget(2);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this._spawn(
        pos.x - Math.sin(heading) * 2.5 + Math.cos(heading) * side * 1.5,
        pos.y + 0.2,
        pos.z - Math.cos(heading) * 2.5 - Math.sin(heading) * side * 1.5,
        (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 2,
        0.62, 0.55, 0.42, 1.4 + Math.random() * 1.2, 2.6 + Math.random() * 2, 0.7, 0.15);
    }
  }

  /** Attach a burning effect to a vehicle. */
  addFire(vehicle, kind = 'engine') {
    const existing = this.fires.find((f) => f.vehicle === vehicle);
    if (existing) { existing.kind = kind; return existing; }
    const f = { vehicle, kind, t: 0 };
    this.fires.push(f);
    return f;
  }

  removeFire(vehicle) {
    const i = this.fires.findIndex((f) => f.vehicle === vehicle);
    if (i >= 0) this.fires.splice(i, 1);
  }

  /** A tracer streak for a shell in flight. */
  addTracer(projectile) {
    if (this.tracers.length >= 32) return;
    this.tracers.push(projectile);
  }

  // ---- Update --------------------------------------------------------------

  update(dt, camera) {
    this.time += dt;

    // Fires emit continuously while they burn.
    for (const f of this.fires) {
      const v = f.vehicle;
      if (!v || !v.fire?.active) continue;
      const sev = clamp01(v.fire.severity);
      f.t += dt;
      const rate = 3 + sev * 26;
      const n = this._budget(rate * dt);
      const enginePos = v.fire.compartment === 'engine_compartment';
      const ox = enginePos ? 0 : (Math.random() - 0.5) * 1.2;
      const oz = enginePos ? -2.2 : 0.4;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const wx = v.pos.x + ox * c + oz * s;
      const wz = v.pos.z - ox * s + oz * c;

      for (let i = 0; i < n; i++) {
        const ammo = v.fire.ammunitionInvolved;
        // Flame.
        this._spawn(wx + (Math.random() - 0.5) * 1.2, v.pos.y + 1.8, wz + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 2, 3 + Math.random() * 5 * (1 + sev), (Math.random() - 0.5) * 2,
          1.0, ammo ? 0.95 : 0.55 + Math.random() * 0.25, ammo ? 0.8 : 0.15,
          0.7 + Math.random() * 0.7, 0.7 + Math.random() * 0.6, 1.0, 1.2);
      }
      // Oily black smoke column.
      for (let i = 0; i < this._budget(rate * dt * 0.7); i++) {
        this._spawn(wx + (Math.random() - 0.5) * 1.6, v.pos.y + 2.6, wz + (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 2.5, 3 + Math.random() * 4, (Math.random() - 0.5) * 2.5,
          0.12, 0.11, 0.10, 2.0 + Math.random() * 2.5, 4 + Math.random() * 4, 0.5, 1.6);
      }
    }

    // Step every live particle.
    const pos = this.positions, vel = this.vel, life = this.life, sizes = this.sizes;
    for (let i = 0; i < this.count; i++) {
      if (life[i] <= 0) { sizes[i] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      vel[i3] *= d; vel[i3 + 2] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + this.gravity[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      // Fade by shrinking, which reads better than alpha on a Points cloud.
      const f = clamp01(life[i] / this.maxLife[i]);
      sizes[i] = sizes[i] * 0.999 * (0.4 + f * 0.6) + 0.0001;
      if (life[i] <= 0) sizes[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    // Tracers.
    let ti = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const p = this.tracers[i];
      if (!p.active || ti >= 32) { this.tracers.splice(i, 1); continue; }
      const o = ti * 6;
      this.tracerPositions[o] = p.prev.x;
      this.tracerPositions[o + 1] = p.prev.y;
      this.tracerPositions[o + 2] = p.prev.z;
      this.tracerPositions[o + 3] = p.pos.x;
      this.tracerPositions[o + 4] = p.pos.y;
      this.tracerPositions[o + 5] = p.pos.z;
      ti++;
    }
    for (let i = ti; i < 32; i++) {
      const o = i * 6;
      for (let k = 0; k < 6; k++) this.tracerPositions[o + k] = 0;
    }
    this.tracerLines.geometry.attributes.position.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.sizes.fill(0);
    this.fires.length = 0;
    this.tracers.length = 0;
  }
}
