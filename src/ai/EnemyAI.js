// ===========================================================================
//  ENEMY AI
//
//  Soviet crews at Kursk did not know where the Tiger was. They knew where they
//  last saw it, where they heard an engine, and where the shot came from — and
//  they acted on that, which is often wrong.
//
//  A T-34 commander who understands that his gun cannot hurt a Tiger frontally
//  will try very hard to get round its flank, and that is exactly what this AI
//  does. It is not cheating; it is reading the same penetration model the
//  player's gunner reads.
// ===========================================================================

import { clamp, clamp01, DEG, RAD, normalizeAngle, angleDelta } from '../core/MathUtil.js';
import { penetrationAtRange, effectiveThickness, resolveImpact, OUTCOME } from '../sim/Penetration.js';
import { velocityAt, computeLead } from '../sim/Ballistics.js';
import { getProjectile } from '../data/ammunition.js';
import { traceArmour } from '../sim/ArmorArray.js';

/** Where a gunner actually aims: the centre of mass of the target's hull. */
function aimPoint(target) {
  return {
    x: target.pos.x,
    y: target.pos.y + (target.spec.dims?.height ?? 2.5) * 0.5,
    z: target.pos.z,
  };
}

function normalise(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

export const AI_STATE = {
  IDLE: 'idle',
  PATROL: 'patrol',
  ADVANCE: 'advance',
  INVESTIGATE: 'investigate',
  ENGAGE: 'engage',
  FLANK: 'flank',
  REPOSITION: 'reposition',
  RETREAT: 'retreat',
  AMBUSH: 'ambush',
  HIDE: 'hide',
  DESTROYED: 'destroyed',
};

export class EnemyAI {
  constructor(vehicle, world, opts = {}) {
    this.v = vehicle;
    this.world = world;
    this.rng = world.rng;
    this.terrain = world.terrain;

    this.state = opts.initialState || AI_STATE.PATROL;
    this.aggression = opts.aggression ?? 0.5;      // set by difficulty and unit quality
    this.skill = opts.skill ?? 0.5;
    this.discipline = opts.discipline ?? 0.5;

    // What this crew believes. NOT the truth.
    this.knownEnemies = new Map();     // vehicleId -> { pos, lastSeen, confidence, type }
    this.suspicion = null;             // a place worth looking at
    this.currentTarget = null;
    this.waypoints = opts.waypoints || [];
    this.waypointIndex = 0;
    this.homePos = { ...vehicle.pos };
    this.ambushFacing = opts.ambushFacing ?? vehicle.heading;

    this.reactionTimer = 0;
    this.decisionTimer = 0;
    this.fireTimer = 0;
    this.stateTimer = 0;
    this.lastShotAt = -99;
    this.suppression = 0;              // being shot at makes crews stop shooting back
    this.morale = opts.morale ?? 0.7;
    this.hasReported = false;
  }

  // ---- Perception ---------------------------------------------------------

  observe(dt, env) {
    const v = this.v;
    if (v.destroyed) return;

    const eye = {
      pos: v.pos,
      eyeHeight: (v.spec.dims?.height ?? 2.5) * 0.85,
      // A T-34's commander is also the gunner, which is precisely why he sees so
      // little. Vehicles with that flaw get a narrower search.
      fovDeg: v.spec.crewFlaws?.length ? 90 : 130,
      viewAzimuth: v.heading + (v.turretAz || 0),
      magnification: 1,
      acuity: 0.4 + this.skill * 0.5,
      identification: this.skill,
      faction: v.faction,
      searchFocus: this.state === AI_STATE.AMBUSH ? 1.6 : 1.0,
      name: v.callsign,
    };

    for (const other of this.world.vehicles) {
      if (other === v || other.destroyed || other.faction === v.faction) continue;
      const vis = this.world.spotting.visibility(eye, other, env);
      if (vis <= 0.003) continue;
      const rate = vis * 1.4 * (0.5 + this.skill);
      if (this.rng.next() < 1 - Math.exp(-rate * dt)) {
        const prev = this.knownEnemies.get(other.id);
        this.knownEnemies.set(other.id, {
          ref: other,
          pos: { ...other.pos },
          lastSeen: this.world.time,
          confidence: clamp01((prev?.confidence ?? 0) + vis * 0.6 + 0.25),
          type: other.spec.id,
          heading: other.heading,
        });
        if (!prev) this._onFirstSighting(other);
      }
    }

    // Forget. A contact you have not seen for half a minute is a memory.
    for (const [id, k] of this.knownEnemies) {
      const age = this.world.time - k.lastSeen;
      if (age > 45) this.knownEnemies.delete(id);
      else if (age > 6) k.confidence = clamp01(k.confidence - dt * 0.06);
    }
  }

  _onFirstSighting(other) {
    this.reactionTimer = this._reactionTime();
    if (this.state === AI_STATE.PATROL || this.state === AI_STATE.ADVANCE || this.state === AI_STATE.IDLE) {
      this._setState(AI_STATE.ENGAGE);
    }
    // Tell the rest of the unit. This is how a whole battery turns on one Tiger.
    if (!this.hasReported) {
      this.hasReported = true;
      this.world.shareContact(this.v, other, this.skill);
    }
  }

  /** Somebody shot at us, or near us. */
  onIncomingFire(fromPos, hitUs, magnitude = 1) {
    this.suppression = clamp01(this.suppression + (hitUs ? 0.35 : 0.18) * magnitude);
    this.morale = clamp01(this.morale - (hitUs ? 0.14 : 0.04) * magnitude);

    // We now know roughly where that came from, even if we cannot see it.
    if (fromPos) {
      const err = (1 - this.skill) * 90;
      this.suspicion = {
        x: fromPos.x + this.rng.range(-err, err),
        z: fromPos.z + this.rng.range(-err, err),
        at: this.world.time,
      };
    }

    if (this.state === AI_STATE.PATROL || this.state === AI_STATE.IDLE || this.state === AI_STATE.ADVANCE) {
      this._setState(this.morale < 0.35 ? AI_STATE.RETREAT : AI_STATE.INVESTIGATE);
    }
    // A crew that has been hit hard and cannot hurt back will break.
    if (this.morale < 0.22 && this.rng.bool(0.5)) this._setState(AI_STATE.RETREAT);
  }

  _reactionTime() {
    // Trained crews react in a couple of seconds; conscripts take much longer.
    return clamp(3.4 - this.skill * 2.4, 0.7, 4.5) * (1 + this.suppression * 0.8);
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
    this.plannedPos = null;
  }

  // ---- Tactical evaluation ------------------------------------------------

  /**
   * Can we actually hurt this target from here? The AI asks the SAME penetration
   * model the player uses, which is why a T-34 crew tries to get round the side.
   */
  evaluateShot(target) {
    const gun = this.v.gun;
    if (!gun) return { possible: false };
    const dist = Math.hypot(target.pos.x - this.v.pos.x, target.pos.z - this.v.pos.z);

    let best = null;
    for (const ammoId of gun.ammo) {
      if ((this.v.ammo[ammoId] || 0) <= 0) continue;
      const proj = getProjectile(ammoId);
      if (proj.kind === 'HE' || proj.kind === 'SMOKE') continue;

      // Trace from our own trunnion at the target's centre of mass. Firing a
      // flat horizontal ray misses entirely on rolling ground, which is most
      // of the Kursk salient.
      const origin = {
        x: this.v.pos.x,
        y: this.v.pos.y + (this.v.spec.L?.trunnionY ?? 2.0),
        z: this.v.pos.z,
      };
      const aim = aimPoint(target);
      const dir = normalise(aim.x - origin.x, aim.y - origin.y, aim.z - origin.z);
      const hit = traceArmour(target, origin, dir, dist + 30);
      if (!hit) continue;

      const impactVel = velocityAt(proj, dist);
      const res = resolveImpact(proj, hit.plate, impactVel, hit.obliquity, dist);
      const willPen = res.outcome === OUTCOME.PENETRATION || res.outcome === OUTCOME.OVERMATCH;
      const score = willPen ? 100 + res.margin : res.penetration / Math.max(1, res.effective) * 40;
      if (!best || score > best.score) {
        best = { possible: true, ammoId, willPenetrate: willPen, plate: hit.plate.label, score, result: res, range: dist };
      }
    }
    return best || { possible: false, range: dist };
  }

  /**
   * Where would we have to be for our gun to matter?
   *
   * This asks the penetration model with every nature actually in the racks.
   * A T-34 carrying only BR-350B genuinely cannot hole a Tiger's side even at
   * a hundred metres — that is what Kubinka found in April 1943 — so when no
   * killing position exists the AI falls back on the real Soviet answer: close
   * right in and shoot at the running gear. A Tiger that cannot move can be
   * dealt with later.
   */
  findFlankingPosition(target) {
    const dx = this.v.pos.x - target.pos.x;
    const dz = this.v.pos.z - target.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const currentAng = Math.atan2(dx, dz);

    // Every armour-defeating nature we actually have, best first.
    const natures = this.v.gun.ammo
      .filter((a) => (this.v.ammo[a] || 0) > 0)
      .map((a) => getProjectile(a))
      .filter((p) => p.kind !== 'HE' && p.kind !== 'SMOKE');
    if (!natures.length) return null;

    let bestKill = null;
    let bestMobility = null;

    const ranges = [dist * 0.75, dist * 0.55, dist * 0.4, 250, 150];
    for (const swing of [50, -50, 75, -75, 100, -100, 130, -130, 160, -160]) {
      const ang = currentAng + swing * DEG;
      for (const r of ranges) {
        if (r < 60 || r > dist * 1.2) continue;
        const x = target.pos.x + Math.sin(ang) * r;
        const z = target.pos.z + Math.cos(ang) * r;
        if (!this.terrain.passable(x, z)) continue;

        const origin = { x, y: this.terrain.heightAt(x, z) + (this.v.spec.L?.trunnionY ?? 2.0), z };
        const travel = Math.hypot(x - this.v.pos.x, z - this.v.pos.z);
        const aim = aimPoint(target);
        const dir = normalise(aim.x - origin.x, aim.y - origin.y, aim.z - origin.z);
        const hit = traceArmour(target, origin, dir, r + 30);
        if (!hit) continue;

        // Would any nature we carry defeat what we would be looking at?
        for (const proj of natures) {
          const res = resolveImpact(proj, hit.plate, velocityAt(proj, r), hit.obliquity, r);
          if (res.outcome === OUTCOME.PENETRATION || res.outcome === OUTCOME.OVERMATCH) {
            const score = res.margin * 2 - travel * 0.06;
            if (!bestKill || score > bestKill.score) {
              bestKill = { x, z, score, plate: hit.plate.label, travel, ammoId: proj.id, intent: 'kill' };
            }
          }
        }

        // Fallback: get close and abeam, and go for the running gear.
        // Soviet doctrine against Tigers was exactly this.
        const trackShot = this.evaluateTrackShot(target, origin, r);
        if (trackShot) {
          const score = 40 - r * 0.08 - travel * 0.05 + Math.abs(Math.sin(swing * DEG)) * 25;
          if (!bestMobility || score > bestMobility.score) {
            bestMobility = { x, z, score, plate: 'running gear', travel, ammoId: trackShot.ammoId, intent: 'immobilise' };
          }
        }
      }
    }
    return bestKill || bestMobility;
  }

  /**
   * A Tiger's tracks are not armour. Anything can break them, and a Tiger that
   * cannot move is a Tiger that can be worked around.
   */
  evaluateTrackShot(target, origin, range) {
    const trackComp = target.spec.COMPONENTS?.track_l;
    if (!trackComp) return null;
    if (target.components?.track_l?.destroyed && target.components?.track_r?.destroyed) return null;
    // Any AP nature will do this; it needs no penetration calculation at all.
    const ammoId = this.v.gun.ammo.find((a) => (this.v.ammo[a] || 0) > 0
      && getProjectile(a).kind !== 'SMOKE');
    if (!ammoId) return null;
    // Only worth trying at ranges a 1943 gunner could reliably hit a track at.
    if (range > 700) return null;
    return { ammoId, range };
  }

  // ---- Main tick ----------------------------------------------------------

  update(dt, env) {
    const v = this.v;
    if (v.destroyed) { this.state = AI_STATE.DESTROYED; return; }

    this.stateTimer += dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.10);
    this.morale = clamp01(this.morale + dt * 0.012);
    if (this.reactionTimer > 0) this.reactionTimer -= dt;
    if (this.fireTimer > 0) this.fireTimer -= dt;

    this.observe(dt, env);

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.rng.range(0.5, 1.4);
      this._decide();
    }

    this._act(dt);
  }

  _decide() {
    const enemies = Array.from(this.knownEnemies.values())
      .filter((k) => k.ref && !k.ref.destroyed);

    if (!enemies.length) {
      if (this.state === AI_STATE.ENGAGE || this.state === AI_STATE.FLANK) {
        this._setState(this.suspicion ? AI_STATE.INVESTIGATE : AI_STATE.PATROL);
      }
      this.currentTarget = null;
      return;
    }

    // Pick a target: the closest thing we could actually hurt, else the closest.
    let bestTarget = null, bestScore = -Infinity;
    for (const k of enemies) {
      const dist = Math.hypot(k.pos.x - this.v.pos.x, k.pos.z - this.v.pos.z);
      const shot = this.evaluateShot(k.ref);
      let score = -dist * 0.02 + k.confidence * 20;
      if (shot.willPenetrate) score += 90;
      // The thing that just shot at us is a priority.
      if (this.suspicion && Math.hypot(k.pos.x - this.suspicion.x, k.pos.z - this.suspicion.z) < 120) score += 30;
      if (score > bestScore) { bestScore = score; bestTarget = { k, shot, dist }; }
    }
    if (!bestTarget) return;
    this.currentTarget = bestTarget.k.ref;
    this.currentShot = bestTarget.shot;

    // Morale check: a crew that knows it cannot win will not stay.
    if (this.morale < 0.28 && !bestTarget.shot.willPenetrate) {
      this._setState(AI_STATE.RETREAT);
      return;
    }

    if (bestTarget.shot.willPenetrate) {
      this._setState(AI_STATE.ENGAGE);
    } else if (bestTarget.shot.possible) {
      // We can hit it but not hurt it. Go round.
      if (this.aggression > 0.3 && this.morale > 0.4) {
        if (!this.flankTarget || this.stateTimer > 12) {
          this.flankTarget = this.findFlankingPosition(bestTarget.k.ref);
        }
        this._setState(this.flankTarget ? AI_STATE.FLANK : AI_STATE.REPOSITION);
      } else {
        this._setState(AI_STATE.RETREAT);
      }
    } else {
      this._setState(AI_STATE.INVESTIGATE);
    }
  }

  _act(dt) {
    const v = this.v;
    switch (this.state) {
      case AI_STATE.PATROL:      this._doPatrol(dt); break;
      case AI_STATE.ADVANCE:     this._doAdvance(dt); break;
      case AI_STATE.INVESTIGATE: this._doInvestigate(dt); break;
      case AI_STATE.ENGAGE:      this._doEngage(dt); break;
      case AI_STATE.FLANK:       this._doFlank(dt); break;
      case AI_STATE.REPOSITION:  this._doReposition(dt); break;
      case AI_STATE.RETREAT:     this._doRetreat(dt); break;
      case AI_STATE.AMBUSH:      this._doAmbush(dt); break;
      case AI_STATE.HIDE:        this._doHide(dt); break;
      default: this._halt();
    }
  }

  _halt() {
    if (!this.v.driveline) return;
    this.v.driveline.throttle = 0;
    this.v.driveline.brake = 1;
    this.v.driveline.targetGear = 0;
    this.v.driveline.steer = 0;
  }

  _driveTo(x, z, speedFrac = 0.7) {
    const v = this.v;
    if (!v.driveline || v.spec.static) return true;
    const dx = x - v.pos.x, dz = z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) { this._halt(); return true; }

    const want = Math.atan2(dx, dz);
    const err = angleDelta(v.heading, want);
    v.driveline.steer = clamp(err * 1.9, -1, 1);
    // Slow down to turn — a tracked vehicle steers by braking one track.
    const turnPenalty = 1 - clamp01(Math.abs(err) / (Math.PI * 0.5)) * 0.6;
    v.driveline.throttle = clamp01(speedFrac * turnPenalty);
    v.driveline.brake = Math.abs(err) > 1.4 ? 0.5 : 0;
    const desired = v.spec.mobility.practicalRoad * speedFrac;
    v.driveline.autoGear(desired, v.driveline.speed);
    if (!v.driveline.running && !v.components.engine?.destroyed) v.driveline.start();
    return false;
  }

  _doPatrol(dt) {
    if (!this.waypoints.length) { this._doHold(dt); return; }
    const wp = this.waypoints[this.waypointIndex % this.waypoints.length];
    if (this._driveTo(wp.x, wp.z, 0.45)) this.waypointIndex++;
    this._scanTurret(dt, 0.45);
  }

  _doAdvance(dt) {
    const goal = this.objective || this.waypoints[0];
    if (!goal) { this._doHold(dt); return; }
    this._driveTo(goal.x, goal.z, 0.7);
    this._scanTurret(dt, 0.6);
  }

  _doHold(dt) { this._halt(); this._scanTurret(dt, 0.3); }

  _doInvestigate(dt) {
    if (!this.suspicion) { this._setState(AI_STATE.PATROL); return; }
    // Move cautiously toward where the shot came from, but not straight at it.
    const dx = this.suspicion.x - this.v.pos.x, dz = this.suspicion.z - this.v.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 150 || this.stateTimer > 30) { this._setState(AI_STATE.PATROL); this.suspicion = null; return; }
    this._driveTo(this.suspicion.x, this.suspicion.z, 0.35);
    // Point the gun where we think the danger is.
    this._layAt(this.suspicion, dt);
  }

  _doEngage(dt) {
    const t = this.currentTarget;
    if (!t || t.destroyed) { this._setState(AI_STATE.PATROL); return; }

    const dist = Math.hypot(t.pos.x - this.v.pos.x, t.pos.z - this.v.pos.z);

    // Stop to shoot. Firing on the move in 1943 was a way of wasting ammunition.
    if (this.v.driveline && dist < 1400) this._halt();

    const laid = this._layAt(t.pos, dt, t);
    if (this.reactionTimer > 0) return;

    if (laid && this.fireTimer <= 0 && this.v.loadedRound && this.suppression < 0.7) {
      const shot = this.currentShot || this.evaluateShot(t);
      // Do not throw away scarce APCR at a target it cannot hurt.
      if (shot.possible && (shot.willPenetrate || this.rng.bool(0.35 + this.aggression * 0.3))) {
        if (this.v.selectedAmmo !== shot.ammoId && shot.ammoId) this.v.selectedAmmo = shot.ammoId;
        const r = this.v.fireMainGun(this.world);
        if (r.ok) {
          this.lastShotAt = this.world.time;
          this.fireTimer = this.v.gun.baseReloadS * (1.6 - this.skill * 0.5) * (1 + this.suppression);
        }
      } else if (!shot.possible) {
        this._setState(AI_STATE.FLANK);
      }
    }
    if (!this.v.loadedRound && !this.v.reloading) {
      const pick = (this.currentShot?.ammoId) || this.v.gun.ammo.find((a) => (this.v.ammo[a] || 0) > 0);
      if (pick) this.v.beginReload(pick);
    }
  }

  _doFlank(dt) {
    if (!this.flankTarget) { this.flankTarget = this.currentTarget ? this.findFlankingPosition(this.currentTarget) : null; }
    if (!this.flankTarget) { this._setState(AI_STATE.ENGAGE); return; }
    const arrived = this._driveTo(this.flankTarget.x, this.flankTarget.z, 0.85);
    // Keep the gun on the enemy while manoeuvring.
    if (this.currentTarget) this._layAt(this.currentTarget.pos, dt, this.currentTarget);
    if (arrived || this.stateTimer > 45) { this.flankTarget = null; this._setState(AI_STATE.ENGAGE); }
  }

  _doReposition(dt) {
    if (!this.plannedPos) {
      const threat = this.currentTarget?.pos || this.suspicion || { x: 0, z: 0 };
      this.plannedPos = this.terrain.findCover(this.v.pos.x, this.v.pos.z, threat.x, threat.z, 180);
    }
    if (!this.plannedPos) { this._setState(AI_STATE.ENGAGE); return; }
    if (this._driveTo(this.plannedPos.x, this.plannedPos.z, 0.8) || this.stateTimer > 25) {
      this.plannedPos = null;
      this._setState(AI_STATE.ENGAGE);
    }
    if (this.currentTarget) this._layAt(this.currentTarget.pos, dt, this.currentTarget);
  }

  _doRetreat(dt) {
    const threat = this.currentTarget?.pos || this.suspicion || this.homePos;
    const dx = this.v.pos.x - threat.x, dz = this.v.pos.z - threat.z;
    const d = Math.hypot(dx, dz) || 1;
    const goal = { x: this.v.pos.x + (dx / d) * 400, z: this.v.pos.z + (dz / d) * 400 };
    this._driveTo(goal.x, goal.z, 1.0);
    if (this.stateTimer > 40 || d > 1600) {
      this.morale = clamp01(this.morale + 0.3);
      this._setState(AI_STATE.PATROL);
    }
  }

  _doAmbush(dt) {
    this._halt();
    // Sit absolutely still, gun on the killing ground, and do not fire early.
    this.v.turretTargetAz = normalizeAngle(this.ambushFacing - this.v.heading);
    this.v.stepTurret(dt);
    const t = this.currentTarget;
    if (t && !t.destroyed) {
      const dist = Math.hypot(t.pos.x - this.v.pos.x, t.pos.z - this.v.pos.z);
      const shot = this.evaluateShot(t);
      // Hold fire until it will actually do something. That is what an ambush is.
      const holdUntil = shot.willPenetrate ? 900 : 350;
      if (dist < holdUntil) this._setState(AI_STATE.ENGAGE);
    }
  }

  _doHide(dt) {
    this._halt();
    if (this.stateTimer > this.rng.range(8, 20)) this._setState(AI_STATE.PATROL);
  }

  /** Idle turret sweep so a stationary vehicle does not look asleep. */
  _scanTurret(dt, rate) {
    if (this.v.spec.static || this.v.spec.fixedGun) return;
    this._scanPhase = (this._scanPhase ?? this.rng.range(0, 10)) + dt * rate * 0.25;
    this.v.turretTargetAz = Math.sin(this._scanPhase) * 70 * DEG;
    this.v.stepTurret(dt);
  }

  /** Lay the gun on a point, leading it if it is moving. Returns true when on. */
  _layAt(point, dt, targetRef = null) {
    const v = this.v;
    if (!v.gun) return false;

    let aim = point;
    if (targetRef?.vel) {
      const proj = getProjectile(v.loadedRound || v.gun.ammo[0]);
      const lead = computeLead(proj, v.pos, targetRef.pos, targetRef.vel);
      // Poor crews under-lead. This is a skill expression, not a random miss.
      const leadQuality = 0.35 + this.skill * 0.75;
      aim = {
        x: point.x + (lead.point.x - point.x) * leadQuality,
        y: point.y + 1.2,
        z: point.z + (lead.point.z - point.z) * leadQuality,
      };
    } else {
      aim = { x: point.x, y: (point.y ?? 0) + 1.2, z: point.z };
    }

    // A fixed-gun assault gun has to point the whole vehicle.
    if (v.spec.fixedGun && v.driveline) {
      const want = Math.atan2(aim.x - v.pos.x, aim.z - v.pos.z);
      const err = angleDelta(v.heading, want);
      const limit = v.spec.fixedGun.traverseLimit;
      if (Math.abs(err) > limit) {
        v.driveline.steer = clamp(err * 2.0, -1, 1);
        v.driveline.throttle = 0.25;
        v.driveline.targetGear = 1;
        v.driveline.brake = 0;
        return false;
      }
      this._halt();
    }

    return v.layOn(aim, dt);
  }

  status() {
    return {
      callsign: this.v.callsign, state: this.state,
      morale: this.morale, suppression: this.suppression,
      target: this.currentTarget?.callsign || null,
      knows: this.knownEnemies.size,
    };
  }
}
