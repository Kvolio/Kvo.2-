// ===========================================================================
//  THE WORLD
//
//  Owns everything that exists during a mission: the vehicles, the shells in
//  flight, the contacts, the fires, the men on foot outside their tanks.
//  Stepped at a fixed 60 Hz so the ballistics are identical on every device.
// ===========================================================================

import { Projectile } from './Ballistics.js';
import { SpottingSystem, CONTACT_SOURCE } from './Spotting.js';
import { Pool } from '../core/Pool.js';
import { clamp, clamp01, DEG } from '../core/MathUtil.js';
import { getProjectile } from '../data/ammunition.js';
import { OUTCOME } from './Penetration.js';

export class World {
  constructor({ terrain, bus, rng, difficulty, env }) {
    this.terrain = terrain;
    this.bus = bus;
    this.rng = rng;
    this.difficulty = difficulty || {};
    this.env = env || { lightFactor: 1, visibilityFactor: 1, timeOfDay: 'morning', weather: 'clear' };

    this.time = 0;
    this.vehicles = [];
    this.ai = new Map();               // vehicle -> ai
    this.dismounts = [];               // men on foot outside a tank
    this.spotting = new SpottingSystem(bus, rng, terrain);

    // Projectiles are pooled — a Kursk engagement can have a lot of them.
    this.projectilePool = new Pool(() => new Projectile(), (p) => p.reset(), 48);
    this.projectiles = [];
    this.impacts = [];                 // for the renderer
    this.smokeScreens = [];
    this.artilleryMissions = [];
    this.playerVehicle = null;
  }

  addVehicle(v, ai = null) {
    this.vehicles.push(v);
    if (ai) this.ai.set(v, ai);
    if (v.isPlayer) this.playerVehicle = v;
    return v;
  }

  removeVehicle(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    this.ai.delete(v);
  }

  // ==================== Projectiles ========================================

  spawnProjectile(projId, pos, dir, shooter) {
    const p = this.projectilePool.acquire();
    p.fire(projId, pos, dir, shooter);
    this.projectiles.push(p);
    return p;
  }

  _stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.step(dt);

      let consumed = false;

      // --- Vehicles ---
      for (const v of this.vehicles) {
        if (v === p.shooter || v.destroyed) continue;
        // Cheap reject: is the swept segment anywhere near this vehicle?
        const r = (v.spec.dims?.lengthWithGun ?? 7) * 0.6;
        if (!this._segNearPoint(p.prev, p.pos, v.pos, r + 2.5)) continue;

        const dir = p.direction;
        const ev = v.receiveHit(p, p.pos, dir, this.difficulty);
        if (ev) {
          consumed = true;
          this._registerImpact(p, v, ev);
          break;
        }
      }

      // --- Men on foot: a shell passing through a repair party is lethal ---
      if (!consumed) {
        for (const d of this.dismounts) {
          if (d.man.state === 'dead') continue;
          if (!this._segNearPoint(p.prev, p.pos, d.pos, 0.9)) continue;
          const proj = p.data;
          d.man.wound(proj.kind === 'HE' ? 1.0 : 0.95, 'direct hit');
          this.bus?.emit('dismount:hit', { man: d.man, cause: 'direct hit' });
          consumed = true;
          break;
        }
      }

      // --- Ground ---
      if (!consumed) {
        const groundY = this.terrain.heightAt(p.pos.x, p.pos.z);
        if (p.pos.y <= groundY) {
          this._groundImpact(p, groundY);
          consumed = true;
        }
      }

      // --- Out of the world ---
      if (!consumed && (p.distance > 5000 || Math.abs(p.pos.x) > this.terrain.half + 200
        || Math.abs(p.pos.z) > this.terrain.half + 200)) consumed = true;

      if (consumed) {
        this.projectiles.splice(i, 1);
        this.projectilePool.release(p);
      }
    }
  }

  _registerImpact(p, target, ev) {
    const shooter = p.shooter;
    if (shooter) {
      shooter.shotsHit++;
      // Tell the shooter's crew what they achieved.
      if (shooter.crewManager) {
        const g = shooter.crewManager.get('gunner');
        if (g) {
          if (ev.penetrated) shooter.crewManager.speak(g, 'gunner.hit', {}, true);
          else shooter.crewManager.speak(g, 'gunner.no_penetration_on_target', {}, true);
        }
      }
    }

    // Tell an AI it is being shot at, so it can react to fire it cannot see.
    const targetAI = this.ai.get(target);
    if (targetAI) targetAI.onIncomingFire(shooter?.pos, true, ev.shockG || 1);

    // Everyone nearby hears it and looks.
    this._alertNearby(target.pos, 400, shooter?.pos);

    this.impacts.push({
      pos: ev.worldPoint || p.pos, t: this.time, outcome: ev.outcome,
      caliber: p.data.caliber, penetrated: ev.penetrated, onVehicle: true,
      blast: ev.blast, smoke: ev.smoke,
    });

    if (ev.smoke) this.smokeScreens.push({ ...ev.smoke, born: this.time });

    // Did that finish it?
    const assess = target.assess();
    if ((assess.destroyed || assess.combatIneffective) && !target._creditedKill) {
      target._creditedKill = true;
      if (shooter) {
        shooter.kills++;
        const g = shooter.crewManager?.get('gunner');
        if (g) { g.kills++; shooter.crewManager.speak(g, 'gunner.kill', {}, true); }
      }
      this.bus?.emit('vehicle:knocked_out', {
        vehicle: target, by: shooter, reasons: assess.reasons,
        destroyed: assess.destroyed,
      });
    }
  }

  _groundImpact(p, groundY) {
    const proj = p.data;
    const pos = { x: p.pos.x, y: groundY, z: p.pos.z };
    this.impacts.push({ pos, t: this.time, outcome: 'ground', caliber: proj.caliber, onVehicle: false });

    if (proj.kind === 'SMOKE') {
      this.smokeScreens.push({ pos, radius: proj.smokeRadius || 15, duration: proj.smokeDuration || 40, born: this.time });
      return;
    }
    if (proj.kind === 'HE' || (proj.filler || 0) > 0.05) {
      this._explode(pos, proj.filler || 0.1, proj.blastRadius || 6, proj.fragRadius || 12, p.shooter);
    }

    // Near miss: the crew of anything close hears the crack and the earth.
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < 45) {
        v.crewManager?.registerIncoming('near_miss', clamp(1 - d / 45, 0.1, 1));
        if (d < 25 && v.crewManager) {
          const man = v.crewManager.get(this.rng.pick(['driver', 'loader', 'radio']));
          if (man) v.crewManager.speak(man, 'hit.near_miss');
        }
        const ai = this.ai.get(v);
        if (ai) ai.onIncomingFire(p.shooter?.pos, false, clamp(1 - d / 45, 0.1, 1));
      }
    }
  }

  /** A high-explosive burst in the open. Hurts men on foot badly. */
  _explode(pos, fillerKg, blastR, fragR, source) {
    this.bus?.emit('world:explosion', { pos, fillerKg, radius: blastR });

    for (const d of this.dismounts) {
      if (d.man.state === 'dead') continue;
      const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
      if (dist > fragR) continue;
      // Men in the open near a shell burst. This is why repairing under fire is
      // the decision it is.
      const sev = clamp01((1 - dist / fragR) ** 1.5 * (0.5 + fillerKg * 0.6));
      if (this.rng.next() < clamp01(0.85 - dist / fragR)) {
        d.man.wound(sev, 'shell burst');
        this.bus?.emit('dismount:hit', { man: d.man, cause: 'shell burst', severity: sev });
      } else {
        d.man.addStress(0.25);
      }
    }

    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const dist = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (dist > fragR * 1.5) continue;
      v.crewManager?.registerIncoming('artillery', clamp01(1 - dist / (fragR * 1.5)));
      // A commander with his head out in an artillery beaten zone is in danger.
      if (v.commanderHeadOut && dist < fragR) {
        const cmd = v.crew.find((m) => m.role === 'commander');
        if (cmd && this.rng.next() < clamp01((1 - dist / fragR) * 0.55)) {
          cmd.wound(this.rng.range(0.2, 0.8), 'shell splinter, head out');
          this.bus?.emit('commander:hit', { severity: 0.5, cause: 'shell splinter while head out' });
        }
      }
    }
  }

  _alertNearby(pos, radius, sourcePos) {
    for (const [v, ai] of this.ai) {
      if (v.destroyed) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < radius) ai.onIncomingFire(sourcePos, false, clamp01(1 - d / radius) * 0.4);
    }
  }

  _segNearPoint(a, b, p, r) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < r;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2;
    t = clamp01(t);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t), p.z - (a.z + dz * t)) < r;
  }

  // ==================== Artillery ==========================================

  /**
   * A fire mission. It takes real time to arrive because it went through a
   * forward observer, a battalion, a battery and a gun line.
   */
  requestArtillery(target, callerName, accuracy = 0.7) {
    const delay = this.rng.range(45, 110);
    const mission = {
      target: { ...target }, callerName,
      arrivesAt: this.time + delay,
      rounds: this.rng.int(4, 9),
      dispersion: 55 * (1.5 - accuracy),
      warned: false,
      fired: 0,
      nextRoundAt: 0,
    };
    this.artilleryMissions.push(mission);
    this.bus?.emit('artillery:requested', { delay, target });
    return mission;
  }

  _stepArtillery(dt) {
    for (let i = this.artilleryMissions.length - 1; i >= 0; i--) {
      const m = this.artilleryMissions[i];
      if (!m.warned && this.time > m.arrivesAt - 20) {
        m.warned = true;
        this.bus?.emit('artillery:inbound', { seconds: 20, target: m.target });
      }
      if (this.time < m.arrivesAt) continue;
      if (this.time < m.nextRoundAt) continue;

      const x = m.target.x + this.rng.gauss(0, m.dispersion);
      const z = m.target.z + this.rng.gauss(0, m.dispersion);
      const y = this.terrain.heightAt(x, z);
      this._explode({ x, y, z }, 4.5, 22, 45, null);
      this.impacts.push({ pos: { x, y, z }, t: this.time, outcome: 'artillery', caliber: 150, onVehicle: false });
      m.fired++;
      m.nextRoundAt = this.time + this.rng.range(1.2, 3.5);
      if (m.fired >= m.rounds) this.artilleryMissions.splice(i, 1);
    }
  }

  // ==================== Contact sharing ====================================

  /** One Soviet crew tells the rest of its unit. Imperfectly. */
  shareContact(reporter, target, skill) {
    const err = (1 - skill) * 140;
    for (const [v, ai] of this.ai) {
      if (v === reporter || v.faction !== reporter.faction || v.destroyed) continue;
      const d = Math.hypot(v.pos.x - reporter.pos.x, v.pos.z - reporter.pos.z);
      if (d > 1200) continue;                       // out of radio/shouting range
      if (this.rng.next() > 0.55 + skill * 0.3) continue;  // the message does not always get through
      if (ai.knownEnemies.has(target.id)) continue;
      ai.knownEnemies.set(target.id, {
        ref: target,
        pos: { x: target.pos.x + this.rng.range(-err, err), y: target.pos.y, z: target.pos.z + this.rng.range(-err, err) },
        lastSeen: this.time - 2,
        confidence: 0.35,
        type: target.spec.id,
        secondHand: true,
      });
    }
  }

  // ==================== Dismounts ==========================================

  /** Put a man outside his tank. He is now a fragile object in a battle. */
  addDismount(man, pos, task) {
    const d = { man, pos: { ...pos }, target: null, task, speed: 1.6, state: 'moving' };
    this.dismounts.push(d);
    man.outsideTank = true;
    return d;
  }

  removeDismount(man) {
    const i = this.dismounts.findIndex((d) => d.man === man);
    if (i >= 0) this.dismounts.splice(i, 1);
    man.outsideTank = false;
  }

  _stepDismounts(dt) {
    for (const d of this.dismounts) {
      if (d.man.state === 'dead') continue;
      d.man.update(dt, { underFire: true });

      if (d.target) {
        const dx = d.target.x - d.pos.x, dz = d.target.z - d.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.6) {
          // A frightened, wounded man moves slowly, and stumbles.
          const sp = d.speed * clamp(d.man.effectiveness, 0.25, 1.3) * (d.running ? 2.4 : 1);
          d.pos.x += (dx / dist) * sp * dt;
          d.pos.z += (dz / dist) * sp * dt;
          d.pos.y = this.terrain.heightAt(d.pos.x, d.pos.z);
        } else if (d.state !== 'arrived') {
          d.state = 'arrived';
          this.bus?.emit('dismount:arrived', { man: d.man, task: d.task });
        }
      }

      // Small-arms and shell fragments seek out men in the open.
      const danger = this._dangerAt(d.pos);
      if (danger > 0 && this.rng.next() < danger * dt) {
        d.man.wound(this.rng.range(0.15, 0.7), 'small arms');
        this.bus?.emit('dismount:hit', { man: d.man, cause: 'small arms' });
      }
      if (danger > 0) d.man.addStress(danger * dt * 2.0);
    }
  }

  /** How dangerous is it to be standing here right now? */
  _dangerAt(pos) {
    let danger = 0;
    for (const v of this.vehicles) {
      if (v.destroyed || v.faction === 'german') continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d > 900) continue;
      if (!this.terrain.lineOfSight(v.pos.x, v.pos.y + 2, v.pos.z, pos.x, pos.y + 1.6, pos.z)) continue;
      // Closer is far worse. A machine gun at 200 m will kill a repair party.
      danger += clamp01(1 - d / 900) ** 2 * 0.22;
    }
    return danger;
  }

  // ==================== Main step ==========================================

  update(dt) {
    this.time += dt;

    for (const v of this.vehicles) {
      if (v.justFired > 0) v.justFired -= dt;
      v.update(dt, { difficulty: this.difficulty, env: this.env });
    }

    for (const [v, ai] of this.ai) {
      if (v.destroyed) continue;
      ai.update(dt, this.env);
    }

    this._stepProjectiles(dt);
    this._stepArtillery(dt);
    this._stepDismounts(dt);
    this.spotting.update(dt);

    // Smoke drifts and thins.
    for (let i = this.smokeScreens.length - 1; i >= 0; i--) {
      const s = this.smokeScreens[i];
      if (this.time - s.born > s.duration) this.smokeScreens.splice(i, 1);
    }
    // Trim the impact list the renderer reads.
    if (this.impacts.length > 220) this.impacts.splice(0, this.impacts.length - 220);
  }

  /** Is this point inside a smoke screen? Used for line-of-sight checks. */
  smokeBlocks(x0, z0, x1, z1) {
    for (const s of this.smokeScreens) {
      const d = this._distPointSeg(s.pos.x, s.pos.z, x0, z0, x1, z1);
      if (d < s.radius) return true;
    }
    return false;
  }

  _distPointSeg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) return Math.hypot(px - ax, pz - az);
    let t = clamp01(((px - ax) * dx + (pz - az) * dz) / l2);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  aliveEnemiesOf(faction) {
    return this.vehicles.filter((v) => v.faction !== faction && !v.destroyed && !v.assess().combatIneffective);
  }
}
