// ===========================================================================
//  THE COMPANY ROSTER
//
//  Your four men, and the reserves waiting behind them. Every one of them has a
//  name, a home town and a record. When one of them is killed on Simulation, he
//  is gone from this list for good and you have to pick who takes his seat.
// ===========================================================================

import { Crewman, generateCrewman, HEALTH_STATE, ROLES } from '../sim/CrewSim.js';

export class Roster {
  constructor(rng, difficulty = {}) {
    this.rng = rng;
    this.difficulty = difficulty;

    /** The five men currently assigned to Tiger 101. */
    this.assigned = {};
    /** Everyone else in the company who could fill a seat. */
    this.reserve = [];
    /** The dead. Kept forever, because the campaign remembers. */
    this.fallen = [];
  }

  static create(rng, difficulty = {}) {
    const r = new Roster(rng, difficulty);
    r._populate();
    return r;
  }

  _populate() {
    const rng = this.rng;
    // The starting crew: an experienced commander's crew, not raw recruits.
    this.assigned = {
      commander: generateCrewman('commander', rng, 'veteran'),
      gunner: generateCrewman('gunner', rng, 'seasoned'),
      loader: generateCrewman('loader', rng, 'trained'),
      driver: generateCrewman('driver', rng, 'seasoned'),
      radio: generateCrewman('radio', rng, 'trained'),
    };

    // The reserve pool. Deliberately uneven — some are very good, most are not.
    const n = this.difficulty.reserveCrew ?? 10;
    const bands = ['green', 'green', 'green', 'trained', 'trained', 'trained',
      'seasoned', 'seasoned', 'veteran', 'green', 'trained', 'seasoned',
      'green', 'veteran', 'trained', 'green', 'trained', 'seasoned', 'green', 'trained'];
    this.reserve = [];
    for (let i = 0; i < n; i++) {
      // A reserve man is trained for a role but can be pushed into another.
      const role = ROLES[(i + 1) % ROLES.length] === 'commander'
        ? 'loader' : ROLES[(i + 1) % ROLES.length];
      this.reserve.push(generateCrewman(role, this.rng, bands[i % bands.length]));
    }
  }

  // ---- Queries -------------------------------------------------------------

  /** Men who are alive but cannot deploy yet. */
  infirmary() {
    return [...this.crewList(), ...this.reserve]
      .filter((m) => m && m.state !== HEALTH_STATE.DEAD && m.recoveryMissions > 0);
  }

  crewList() { return ROLES.map((r) => this.assigned[r]).filter(Boolean); }
  fightingCrew() { return ['gunner', 'loader', 'driver', 'radio'].map((r) => this.assigned[r]).filter(Boolean); }

  /** Men who could take a given seat, ranked by suitability. */
  candidatesFor(role) {
    return this.reserve
      .filter((m) => m.state !== HEALTH_STATE.DEAD && m.recoveryMissions <= 0)
      .map((m) => ({
        man: m,
        trained: m.role === role,
        // A man trained for another job can do this one, worse.
        suitability: (m.role === role ? 1 : 0.55) * (0.3 + m.experience * 0.7)
          * (m.health) * (1 - m.stress * 0.3),
      }))
      .sort((a, b) => b.suitability - a.suitability);
  }

  /** Who cannot deploy next mission, and why. */
  unavailable() {
    const out = [];
    for (const role of ROLES) {
      const m = this.assigned[role];
      if (!m) { out.push({ role, reason: 'seat empty' }); continue; }
      if (m.state === HEALTH_STATE.DEAD) out.push({ man: m, role, reason: 'killed' });
      else if (m.recoveryMissions > 0) {
        out.push({ man: m, role, reason: `in the aid post — ${m.recoveryMissions} more mission(s)` });
      }
    }
    return out;
  }

  // ---- Changes -------------------------------------------------------------

  /** Put a reserve man into a seat. Returns whoever he displaced. */
  assign(role, crewmanId) {
    const idx = this.reserve.findIndex((m) => m.id === crewmanId);
    if (idx < 0) return { ok: false, reason: 'That man is not on the reserve list.' };
    const man = this.reserve[idx];
    if (man.state === HEALTH_STATE.DEAD) return { ok: false, reason: `${man.name} is dead.` };
    if (man.recoveryMissions > 0) {
      return { ok: false, reason: `${man.name} is still in the aid post.` };
    }

    const displaced = this.assigned[role];
    this.reserve.splice(idx, 1);
    // He is retrained into the seat, and the game is honest that he is not
    // trained for it.
    const wasTrainedFor = man.role;
    man.role = role;
    man.retrainedFrom = wasTrainedFor === role ? null : wasTrainedFor;
    this.assigned[role] = man;

    if (displaced && displaced.state !== HEALTH_STATE.DEAD) {
      this.reserve.push(displaced);
    }
    return { ok: true, assigned: man, displaced, untrained: !!man.retrainedFrom };
  }

  /** Somebody died. */
  recordDeath(man, circumstances) {
    man.state = HEALTH_STATE.DEAD;
    const record = {
      name: man.name, rank: man.rank, role: man.role,
      hometown: man.hometown, missions: man.missions,
      kills: man.kills, experience: man.experience,
      circumstances, date: circumstances?.date || null,
    };
    this.fallen.push(record);

    for (const r of ROLES) if (this.assigned[r] === man) this.assigned[r] = null;
    const i = this.reserve.indexOf(man);
    if (i >= 0) this.reserve.splice(i, 1);

    return record;
  }

  /** Between missions: wounds heal, exhaustion lifts, replacements arrive. */
  betweenMissions(rng) {
    const notes = [];
    for (const m of [...this.crewList(), ...this.reserve]) {
      notes.push(...m.restBetweenMissions());
    }

    // Replacements trickle in from the field replacement battalion.
    if (this.reserve.length < (this.difficulty.reserveCrew ?? 10) && rng.bool(0.45)) {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const role = rng.pick(['gunner', 'loader', 'driver', 'radio']);
        const man = generateCrewman(role, rng, rng.bool(0.7) ? 'green' : 'trained');
        this.reserve.push(man);
        notes.push(`${man.rank} ${man.name} has joined the company from the replacement battalion.`);
      }
    } else if (this.reserve.length === 0) {
      notes.push('The company reserve is exhausted. No replacements are available.');
    }
    return notes;
  }

  /** Fill empty seats automatically, and say who was moved and what it costs. */
  autoFill() {
    const notes = [];
    for (const role of ROLES) {
      if (this.assigned[role] && this.assigned[role].state !== HEALTH_STATE.DEAD
        && this.assigned[role].recoveryMissions <= 0) continue;

      const cands = this.candidatesFor(role);
      if (!cands.length) {
        notes.push({
          role, severity: 'bad',
          text: `No replacement available for the ${role}. The seat will be empty.`,
        });
        this.assigned[role] = this.assigned[role]?.state === HEALTH_STATE.DEAD ? null : this.assigned[role];
        continue;
      }
      const pick = cands[0];
      const res = this.assign(role, pick.man.id);
      if (res.ok) {
        notes.push({
          role, severity: res.untrained ? 'warn' : 'neutral',
          text: res.untrained
            ? `${pick.man.rank} ${pick.man.name} takes the ${role}'s seat. He is a trained ${res.assigned.retrainedFrom} — expect him to be slow.`
            : `${pick.man.rank} ${pick.man.name} takes the ${role}'s seat.`,
        });
      }
    }
    return notes;
  }

  summary() {
    return {
      assigned: Object.fromEntries(ROLES.map((r) => [r, this.assigned[r] ? {
        id: this.assigned[r].id, name: this.assigned[r].name, rank: this.assigned[r].rank,
        state: this.assigned[r].state, health: this.assigned[r].health,
        stress: this.assigned[r].stress, fatigue: this.assigned[r].fatigue,
        experience: this.assigned[r].experience, missions: this.assigned[r].missions,
        kills: this.assigned[r].kills, trait: this.assigned[r].trait.label,
        hometown: this.assigned[r].hometown,
        recoveryMissions: this.assigned[r].recoveryMissions,
        retrainedFrom: this.assigned[r].retrainedFrom || null,
      } : null])),
      reserveCount: this.reserve.length,
      fallenCount: this.fallen.length,
    };
  }

  serialize() {
    return {
      assigned: Object.fromEntries(Object.entries(this.assigned)
        .map(([k, v]) => [k, v ? v.serialize() : null])),
      reserve: this.reserve.map((m) => m.serialize()),
      fallen: this.fallen,
    };
  }

  static deserialize(d, rng, difficulty) {
    const r = new Roster(rng, difficulty);
    r.assigned = Object.fromEntries(Object.entries(d.assigned || {})
      .map(([k, v]) => [k, v ? Crewman.deserialize(v) : null]));
    r.reserve = (d.reserve || []).map((m) => Crewman.deserialize(m));
    r.fallen = d.fallen || [];
    return r;
  }
}
