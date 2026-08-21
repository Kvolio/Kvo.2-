// ===========================================================================
//  THE CREW
//
//  Four men who are not stat blocks. Each has a name, a rank, a home town, a
//  personality, a body that can be hurt, nerves that can go, and arms that get
//  tired. Everything the tank does, one of them does. If he is dead, it does
//  not happen. If he is frightened, it happens slowly and sometimes wrongly.
//
//  Their statistics are not decoration: every number here is read by the
//  gunnery, loading, driving, spotting and repair code every tick.
// ===========================================================================

import { clamp, clamp01, lerp } from '../core/MathUtil.js';
import { makeName, RANKS, HOMETOWNS, TRAITS } from '../data/names.js';
import { pickLine } from '../data/dialogue.js';

export const ROLES = ['commander', 'gunner', 'loader', 'driver', 'radio'];

export const HEALTH_STATE = {
  FIT: 'fit',
  WOUNDED: 'wounded',
  SERIOUS: 'seriously wounded',
  INCAPACITATED: 'incapacitated',
  DEAD: 'dead',
};

/** Per-role skill sets. These are the numbers the simulation actually reads. */
const ROLE_SKILLS = {
  commander: ['leadership', 'spotting', 'identification', 'repair'],
  gunner:    ['accuracy', 'acquisition', 'reaction', 'tracking', 'repair'],
  loader:    ['reloadSpeed', 'handling', 'recovery', 'repair'],
  driver:    ['driving', 'terrain', 'reaction', 'repair'],
  radio:     ['comms', 'reporting', 'listening', 'repair'],
};

export class Crewman {
  constructor(data = {}) {
    this.id = data.id ?? `c${Math.random().toString(36).slice(2, 9)}`;
    this.name = data.name ?? 'Unnamed';
    this.rank = data.rank ?? 'Panzerschütze';
    this.role = data.role ?? 'loader';
    this.hometown = data.hometown ?? '—';
    this.trait = data.trait ?? TRAITS[0];

    // --- Persistent career values --------------------------------------------
    this.experience = data.experience ?? 0.15;      // 0..1
    this.missions = data.missions ?? 0;
    this.kills = data.kills ?? 0;
    this.repairsCompleted = data.repairsCompleted ?? 0;

    // --- Condition ------------------------------------------------------------
    this.health = data.health ?? 1;                 // 0..1
    this.state = data.state ?? HEALTH_STATE.FIT;
    this.bleeding = data.bleeding ?? 0;             // health lost per second
    this.stress = data.stress ?? 0.05;              // 0..1
    this.fatigue = data.fatigue ?? 0;               // 0..1
    this.shock = data.shock ?? 0;                   // short-term, decays fast
    this.recoveryMissions = data.recoveryMissions ?? 0;  // unavailable for this many

    // --- Runtime --------------------------------------------------------------
    this.outsideTank = false;
    this.busyWith = null;
    this.currentTask = null;
    this.taskProgress = 0;
    this.actingAs = null;         // covering another role after a casualty
    this.lastSpoke = -999;
    this.pos = null;              // world position when outside the tank

    this.skill = data.skill ? { ...data.skill } : this._rollSkills(data.baseSkill ?? this.experience);
  }

  _rollSkills(base) {
    const s = {};
    for (const k of ROLE_SKILLS[this.role] || []) {
      s[k] = clamp01(base + (Math.random() - 0.5) * 0.18);
    }
    s.repair = clamp01((s.repair ?? base) + (this.trait.repair ?? 0));
    return s;
  }

  // ---- Derived values the rest of the simulation reads ---------------------

  /**
   * Effectiveness multiplier: how well this man is doing his job right now.
   * Experience helps. Being frightened, exhausted, wounded or concussed does not.
   */
  get effectiveness() {
    if (this.state === HEALTH_STATE.DEAD || this.state === HEALTH_STATE.INCAPACITATED) return 0;
    const stressResist = clamp01(0.35 + this.experience * 0.45 + (this.trait.stressResist ?? 0));
    const stressPenalty = this.stress * (1 - stressResist) * 1.25;
    const fatiguePenalty = this.fatigue * 0.42 * (1 - (this.trait.fatigueResist ?? 0));
    const woundPenalty = (1 - this.health) * 0.75;
    const shockPenalty = this.shock * 0.55;
    // A man covering two stations does neither well.
    const doublingPenalty = this.actingAs ? 0.30 : 0;
    return clamp(
      (0.42 + this.experience * 0.58)
      * (1 - stressPenalty) * (1 - fatiguePenalty) * (1 - woundPenalty)
      * (1 - shockPenalty) * (1 - doublingPenalty),
      0.05, 1.35);
  }

  /** Time multiplier for any timed action. Below 1 is faster than the book figure. */
  get speedFactor() {
    const base = 1 / clamp(this.effectiveness, 0.12, 1.4);
    return clamp(base * (1 - (this.trait.speed ?? 0)), 0.62, 6.0);
  }

  /** How likely this man is to make a mistake right now. */
  get errorChance() {
    const base = 0.05 + (1 - this.experience) * 0.14;
    const stressed = base * (1 + this.stress * 2.6) * (1 + this.fatigue * 0.9);
    return clamp(stressed * (1 + (this.trait.errorRate ?? 0)), 0.005, 0.55);
  }

  get available() {
    return this.state !== HEALTH_STATE.DEAD
      && this.state !== HEALTH_STATE.INCAPACITATED
      && this.recoveryMissions <= 0;
  }

  get canWork() {
    return this.state !== HEALTH_STATE.DEAD && this.state !== HEALTH_STATE.INCAPACITATED;
  }

  get tone() { return this.stress > 0.72 ? 'breaking' : this.stress > 0.40 ? 'strained' : 'calm'; }

  // ---- Condition changes ---------------------------------------------------

  /** @param {number} severity 0..1 */
  wound(severity, cause = 'fragment') {
    if (this.state === HEALTH_STATE.DEAD) return null;
    const before = this.state;
    this.health = clamp01(this.health - severity * 0.85);
    this.shock = clamp01(this.shock + severity * 0.9);
    this.stress = clamp01(this.stress + severity * 0.55 + 0.10);

    if (severity > 0.28) this.bleeding = Math.max(this.bleeding, severity * 0.010);

    this._recomputeState();
    return {
      role: this.role, name: this.name, severity, cause,
      before, after: this.state,
      newlyWounded: before === HEALTH_STATE.FIT && this.state !== HEALTH_STATE.FIT,
      died: this.state === HEALTH_STATE.DEAD && before !== HEALTH_STATE.DEAD,
    };
  }

  _recomputeState() {
    if (this.health <= 0.001) { this.state = HEALTH_STATE.DEAD; this.bleeding = 0; return; }
    if (this.health < 0.20) this.state = HEALTH_STATE.INCAPACITATED;
    else if (this.health < 0.48) this.state = HEALTH_STATE.SERIOUS;
    else if (this.health < 0.85) this.state = HEALTH_STATE.WOUNDED;
    else this.state = HEALTH_STATE.FIT;
  }

  addStress(amount) {
    const resist = clamp01(0.30 + this.experience * 0.42 + (this.trait.stressResist ?? 0));
    this.stress = clamp01(this.stress + amount * (1 - resist));
  }

  addFatigue(amount) {
    this.fatigue = clamp01(this.fatigue + amount * (1 - (this.trait.fatigueResist ?? 0)));
  }

  update(dt, ctx = {}) {
    if (this.state === HEALTH_STATE.DEAD) return;

    if (this.bleeding > 0) {
      this.health = clamp01(this.health - this.bleeding * dt);
      this._recomputeState();
      // Bleeding slows on its own eventually; it does not stop without help.
      this.bleeding = Math.max(this.bleeding * (1 - dt * 0.006), this.bleeding * 0.5);
    }

    this.shock = Math.max(0, this.shock - dt * 0.10);

    // Stress bleeds off when nothing is happening, faster for veterans.
    if (!ctx.underFire) {
      const decay = 0.016 * (0.5 + this.experience);
      this.stress = clamp01(this.stress - decay * dt);
    }

    // Work is tiring. Being outside the tank humping track links is very tiring.
    if (this.busyWith) {
      this.addFatigue(dt * (this.outsideTank ? 0.010 : 0.0035));
    } else {
      this.fatigue = clamp01(this.fatigue - dt * 0.0012);
    }
  }

  /** Award experience for surviving a mission and for what happened in it. */
  awardExperience(amount) {
    const gain = amount * (1 + (this.trait.xpGain ?? 0)) * (1 - this.experience * 0.55);
    this.experience = clamp01(this.experience + gain);
    // Experience raises the underlying skills, but not evenly.
    for (const k of Object.keys(this.skill)) {
      this.skill[k] = clamp01(this.skill[k] + gain * (0.55 + Math.random() * 0.6));
    }
  }

  /** Between-mission recovery. Returns a note if his status changed. */
  restBetweenMissions() {
    const notes = [];
    if (this.state === HEALTH_STATE.DEAD) return notes;

    if (this.recoveryMissions > 0) {
      this.recoveryMissions--;
      this.health = clamp01(this.health + 0.22);
      this._recomputeState();
      if (this.recoveryMissions === 0) notes.push(`${this.name} is fit for duty again.`);
      else notes.push(`${this.name} is still in the aid post — ${this.recoveryMissions} more mission(s).`);
    } else {
      this.health = clamp01(this.health + 0.12);
      this._recomputeState();
    }
    this.bleeding = 0;
    this.shock = 0;
    this.fatigue = clamp01(this.fatigue - 0.65);
    this.stress = clamp01(this.stress - 0.45);
    return notes;
  }

  /** Called when a mission ends with this man wounded. */
  assignRecoveryTime(rng) {
    switch (this.state) {
      case HEALTH_STATE.WOUNDED: this.recoveryMissions = rng.int(0, 1); break;
      case HEALTH_STATE.SERIOUS: this.recoveryMissions = rng.int(2, 4); break;
      case HEALTH_STATE.INCAPACITATED: this.recoveryMissions = rng.int(3, 6); break;
      default: this.recoveryMissions = 0;
    }
  }

  serialize() {
    return {
      id: this.id, name: this.name, rank: this.rank, role: this.role,
      hometown: this.hometown, trait: this.trait,
      experience: this.experience, missions: this.missions, kills: this.kills,
      repairsCompleted: this.repairsCompleted,
      health: this.health, state: this.state, bleeding: this.bleeding,
      stress: this.stress, fatigue: this.fatigue, shock: this.shock,
      recoveryMissions: this.recoveryMissions, skill: { ...this.skill },
    };
  }

  static deserialize(d) { return new Crewman(d); }
}

/** Generate a crewman with a plausible name, rank, background and ability. */
export function generateCrewman(role, rng, experienceBand = null) {
  const bands = {
    green:    [0.02, 0.18],
    trained:  [0.18, 0.40],
    seasoned: [0.40, 0.65],
    veteran:  [0.65, 0.90],
  };
  const band = experienceBand && bands[experienceBand]
    ? bands[experienceBand]
    : rng.pick([bands.green, bands.green, bands.trained, bands.trained, bands.seasoned, bands.veteran]);
  const exp = rng.range(band[0], band[1]);

  const trait = rng.pick(TRAITS);
  const rankPool = RANKS[role] || RANKS.loader;
  // More experienced men hold higher rank.
  const rank = exp > 0.6 ? rankPool[0] : exp > 0.3 ? rankPool[Math.min(1, rankPool.length - 1)] : rankPool[rankPool.length - 1];

  const skill = {};
  for (const k of ROLE_SKILLS[role] || []) skill[k] = clamp01(exp + rng.range(-0.10, 0.10));
  skill.repair = clamp01((skill.repair ?? exp) + (trait.repair ?? 0));
  if (trait.spotting) skill.spotting = clamp01((skill.spotting ?? exp) + trait.spotting);

  return new Crewman({
    id: `c${rng.int(100000, 999999)}`,
    name: makeName(rng),
    rank, role, trait,
    hometown: rng.pick(HOMETOWNS),
    experience: exp,
    missions: Math.floor(exp * rng.range(4, 22)),
    kills: role === 'gunner' ? Math.floor(exp * rng.range(0, 9)) : 0,
    skill,
    health: 1, stress: rng.range(0.02, 0.12), fatigue: rng.range(0, 0.15),
  });
}

// ===========================================================================
//  CREW MANAGER — the four men as a working team inside one tank
// ===========================================================================

export class CrewManager {
  constructor(crewList, bus, rng, spec) {
    this.crew = crewList;              // [Crewman] excluding the player-commander body
    this.bus = bus;
    this.rng = rng;
    this.spec = spec;
    this.time = 0;
    this.chatterCooldown = 4;
    this.underFire = false;
    this.underFireTimer = 0;
    this.lastEvent = null;
  }

  get(role) {
    // A man covering another station answers for it.
    return this.crew.find((m) => m.role === role && m.canWork && !m.outsideTank)
      || this.crew.find((m) => m.actingAs === role && m.canWork && !m.outsideTank)
      || null;
  }

  /** Everyone, including the incapable, for roster displays. */
  all() { return this.crew; }

  byRole(role) { return this.crew.find((m) => m.role === role) || null; }

  /**
   * Make someone cover a dead or wounded man's job.
   * A radio operator loading the gun means no radio and slower loading, and the
   * game says so rather than quietly halving a number.
   */
  reassign(fromRole, toRole) {
    const man = this.crew.find((m) => m.role === fromRole && m.canWork);
    if (!man) return { ok: false, reason: `No ${fromRole} available.` };
    if (man.actingAs) return { ok: false, reason: `${man.name} is already covering the ${man.actingAs}'s station.` };
    man.actingAs = toRole;
    man.addStress(0.10);
    this.bus?.emit('crew:reassigned', { name: man.name, from: fromRole, to: toRole });
    this.speak(man, 'crew.taking_over');
    return {
      ok: true,
      man,
      consequences: this._reassignmentConsequences(fromRole, toRole),
    };
  }

  clearReassignment(role) {
    const man = this.crew.find((m) => m.actingAs === role);
    if (man) man.actingAs = null;
  }

  _reassignmentConsequences(fromRole, toRole) {
    const out = [];
    if (fromRole === 'radio') out.push('Radio traffic will be slow or missed entirely.');
    if (fromRole === 'driver') out.push('The tank cannot be driven normally.');
    if (fromRole === 'gunner') out.push('No one is laying the gun.');
    if (fromRole === 'loader') out.push('Loading will be much slower.');
    if (toRole === 'loader') out.push('He is not a trained loader. Expect long reloads and fumbles.');
    if (toRole === 'gunner') out.push('He is not a trained gunner. Expect poor shooting.');
    return out;
  }

  /** Someone said something. Returns the line, or null if he stayed quiet. */
  speak(man, event, vars = {}, force = false) {
    if (!man || !man.canWork) return null;
    const chatterMod = 1 + (man.trait.chatter ?? 0);
    if (!force) {
      if (this.time - man.lastSpoke < 1.2 / clamp(chatterMod, 0.4, 2)) return null;
      if (this.time < this.chatterCooldown && event.startsWith('idle.')) return null;
    }
    const line = pickLine(event, man.role, man.stress, this.rng, {
      name: man.name.split(' ')[1] || man.name,
      role: man.role,
      ...vars,
    });
    if (!line) return null;
    man.lastSpoke = this.time;
    this.lastEvent = event;
    this.bus?.emit('crew:speak', {
      role: man.role, name: man.name, rank: man.rank,
      line, event, tone: man.tone,
      intercom: !man.outsideTank,
    });
    return line;
  }

  /** Convenience: the man at a station says something. */
  say(role, event, vars = {}, force = false) {
    return this.speak(this.get(role) || this.byRole(role), event, vars, force);
  }

  /** Apply an incoming-fire stress pulse to everyone still aboard. */
  registerIncoming(kind, magnitude = 1) {
    this.underFire = true;
    this.underFireTimer = 8;
    const table = {
      near_miss: 0.05, non_penetration: 0.12, ricochet: 0.09,
      penetration: 0.30, artillery: 0.16, crew_wounded: 0.22,
      crew_dead: 0.38, friendly_lost: 0.10, fire: 0.34,
      surrounded: 0.20, abandon: 0.45,
    };
    const base = (table[kind] ?? 0.08) * magnitude;
    for (const m of this.crew) {
      if (!m.canWork) continue;
      m.addStress(base * (m.outsideTank ? 1.5 : 1.0));
    }
  }

  update(dt, ctx = {}) {
    this.time += dt;
    if (this.underFireTimer > 0) {
      this.underFireTimer -= dt;
      if (this.underFireTimer <= 0) this.underFire = false;
    }
    for (const m of this.crew) m.update(dt, { underFire: this.underFire, ...ctx });
    this._maybeChatter(dt, ctx);
  }

  _maybeChatter(dt, ctx) {
    this.chatterCooldown -= dt;
    if (this.chatterCooldown > 0) return;
    this.chatterCooldown = this.rng.range(14, 40);

    const candidates = this.crew.filter((m) => m.canWork && !m.busyWith);
    if (!candidates.length) return;
    const man = this.rng.pick(candidates);

    // What he says depends on how the battle is going.
    if (man.fatigue > 0.72) this.speak(man, 'crew.exhausted');
    else if (man.stress > 0.68) this.speak(man, 'crew.stress_high');
    else if (ctx.enemyNearby && !ctx.engaged) this.speak(man, 'idle.tense');
    else if (ctx.justFinishedFight) this.speak(man, 'idle.after_action');
    else if (!this.underFire) this.speak(man, 'idle.calm');
  }

  /** After-action: everyone who survived learns something. */
  awardMissionExperience(performance = {}) {
    const results = [];
    for (const m of this.crew) {
      if (m.state === HEALTH_STATE.DEAD) continue;
      m.missions++;
      let xp = 0.030;
      if (performance.kills) xp += Math.min(0.05, performance.kills * 0.012);
      if (performance.survivedHeavyFire) xp += 0.018;
      if (performance.repairsCompleted) xp += performance.repairsCompleted * 0.012;
      if (performance.abandoned) xp += 0.010;   // you learn a great deal abandoning a tank
      const before = m.experience;
      m.awardExperience(xp);
      results.push({ name: m.name, role: m.role, gained: m.experience - before, now: m.experience });
    }
    return results;
  }

  casualtyCount() {
    return this.crew.filter((m) => m.state === HEALTH_STATE.DEAD || m.state === HEALTH_STATE.INCAPACITATED).length;
  }

  summary() {
    return this.crew.map((m) => ({
      name: m.name, rank: m.rank, role: m.role, state: m.state,
      health: m.health, stress: m.stress, fatigue: m.fatigue,
      experience: m.experience, outside: m.outsideTank,
      actingAs: m.actingAs, trait: m.trait.label,
    }));
  }
}
