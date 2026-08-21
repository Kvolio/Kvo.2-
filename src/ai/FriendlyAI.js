// Friendly German vehicles. Same tactical brain as the enemy, plus the ability
// to take orders from the player's Tiger over the Fu 5 net — and to refuse them
// when they make no sense, which a real Panzer commander would.

import { EnemyAI, AI_STATE } from './EnemyAI.js';
import { clamp, clamp01 } from '../core/MathUtil.js';

export const PLATOON_ORDER = {
  FOLLOW: 'follow',
  HOLD: 'hold',
  ATTACK: 'attack',
  RETREAT: 'retreat',
  SPREAD: 'spread',
  FOCUS: 'focus',
  ADVANCE: 'advance',
  DEFEND: 'defend',
  REPORT: 'report',
  COVER: 'cover',
};

export class FriendlyAI extends EnemyAI {
  constructor(vehicle, world, opts = {}) {
    super(vehicle, world, { ...opts, aggression: opts.aggression ?? 0.55 });
    this.leader = opts.leader || null;      // the player's Tiger
    this.order = PLATOON_ORDER.FOLLOW;
    this.orderTarget = null;
    this.formationOffset = opts.formationOffset || { x: 60, z: -50 };
    this.isRecovery = !!vehicle.spec.isRecovery;
    this.isSupply = !!vehicle.spec.isSupply;
  }

  /** The player's radio operator passes an order. */
  receiveOrder(order, target = null) {
    this.order = order;
    this.orderTarget = target;
    this.stateTimer = 0;

    switch (order) {
      case PLATOON_ORDER.HOLD:
      case PLATOON_ORDER.DEFEND:
        this._setState(AI_STATE.AMBUSH);
        break;
      case PLATOON_ORDER.RETREAT:
        this._setState(AI_STATE.RETREAT);
        break;
      case PLATOON_ORDER.ATTACK:
      case PLATOON_ORDER.FOCUS:
        if (target) { this.currentTarget = target; this._setState(AI_STATE.ENGAGE); }
        break;
      case PLATOON_ORDER.ADVANCE:
        this.objective = target;
        this._setState(AI_STATE.ADVANCE);
        break;
      case PLATOON_ORDER.SPREAD:
        this.formationOffset = {
          x: this.formationOffset.x * 1.9,
          z: this.formationOffset.z * 1.4,
        };
        break;
      case PLATOON_ORDER.COVER:
        this.coveringFire = { until: this.world.time + 40, at: target };
        this._setState(AI_STATE.ENGAGE);
        break;
      default:
        this._setState(AI_STATE.PATROL);
    }

    // He acknowledges — or tells you he cannot.
    const refusal = this._checkRefusal(order);
    this.world.bus?.emit('radio:friendly', {
      callsign: this.v.callsign,
      line: refusal || this._ackLine(order),
      refused: !!refusal,
    });
    return !refusal;
  }

  _checkRefusal(order) {
    if (this.v.destroyed) return null;
    if (this.v.immobile && [PLATOON_ORDER.FOLLOW, PLATOON_ORDER.ADVANCE, PLATOON_ORDER.RETREAT].includes(order)) {
      return `${this.v.callsign}: negative, I am immobilised.`;
    }
    if (this.v.ammoRemaining <= 0 && [PLATOON_ORDER.ATTACK, PLATOON_ORDER.FOCUS].includes(order)) {
      return `${this.v.callsign}: negative, I am out of ammunition.`;
    }
    if (this.morale < 0.2 && order === PLATOON_ORDER.ATTACK) {
      return `${this.v.callsign}: … we cannot, not into that.`;
    }
    if (this.v.components.radio?.destroyed) return null; // he never heard it
    return null;
  }

  _ackLine(order) {
    const lines = {
      [PLATOON_ORDER.FOLLOW]: 'understood, following.',
      [PLATOON_ORDER.HOLD]: 'holding position.',
      [PLATOON_ORDER.ATTACK]: 'engaging.',
      [PLATOON_ORDER.RETREAT]: 'pulling back.',
      [PLATOON_ORDER.SPREAD]: 'opening out.',
      [PLATOON_ORDER.FOCUS]: 'concentrating fire.',
      [PLATOON_ORDER.ADVANCE]: 'advancing.',
      [PLATOON_ORDER.DEFEND]: 'in position.',
      [PLATOON_ORDER.REPORT]: this._situationReport(),
      [PLATOON_ORDER.COVER]: 'covering you.',
    };
    return `${this.v.callsign}: ${lines[order] || 'understood.'}`;
  }

  _situationReport() {
    const c = this.v.condition();
    const bits = [];
    bits.push(`${c.ammoTotal} rounds`);
    if (c.damaged.length) bits.push(`${c.damaged.map((d) => d.label).join(', ')} ${c.damaged.length === 1 ? 'is' : 'are'} out`);
    else bits.push('no damage');
    if (this.knownEnemies.size) bits.push(`${this.knownEnemies.size} contact(s)`);
    if (c.fire) bits.push('BURNING');
    return bits.join(', ') + '.';
  }

  update(dt, env) {
    // A recovery vehicle or a truck does not fight. It has a job to do.
    if (this.isRecovery || this.isSupply) {
      this._updateSupportVehicle(dt, env);
      return;
    }
    if (this.order === PLATOON_ORDER.FOLLOW && this.leader
      && ![AI_STATE.ENGAGE, AI_STATE.FLANK, AI_STATE.RETREAT].includes(this.state)) {
      this._followLeader(dt);
      this.observe(dt, env);
      this.decisionTimer -= dt;
      if (this.decisionTimer <= 0) { this.decisionTimer = 1.0; this._decide(); }
      return;
    }
    super.update(dt, env);
  }

  _followLeader(dt) {
    const l = this.leader;
    const c = Math.cos(l.heading), s = Math.sin(l.heading);
    const ox = this.formationOffset.x, oz = this.formationOffset.z;
    const tx = l.pos.x + ox * c + oz * s;
    const tz = l.pos.z - ox * s + oz * c;
    const dist = Math.hypot(tx - this.v.pos.x, tz - this.v.pos.z);
    // Catch up if we have fallen behind, dawdle if we are ahead.
    this._driveTo(tx, tz, clamp(dist / 60, 0.2, 0.95));
    this._scanTurret(dt, 0.5);
  }

  _updateSupportVehicle(dt, env) {
    this.observe(dt, env);
    // These vehicles run from trouble. They have no business in a tank battle.
    const threat = Array.from(this.knownEnemies.values())
      .find((k) => k.ref && !k.ref.destroyed
        && Math.hypot(k.pos.x - this.v.pos.x, k.pos.z - this.v.pos.z) < 700);
    if (threat && !this.taskLocked) {
      this._setState(AI_STATE.RETREAT);
      this._doRetreat(dt);
      return;
    }
    if (this.taskGoal) {
      const arrived = this._driveTo(this.taskGoal.x, this.taskGoal.z, 0.6);
      if (arrived) {
        this.taskGoal = null;
        this.world.bus?.emit('support:arrived', { vehicle: this.v, role: this.isRecovery ? 'recovery' : 'supply' });
      }
    } else {
      this._halt();
    }
  }

  /** Send a Famo or a supply truck somewhere. */
  dispatchTo(x, z, lock = true) {
    this.taskGoal = { x, z };
    this.taskLocked = lock;
  }
}
