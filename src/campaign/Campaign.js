// ===========================================================================
//  THE CAMPAIGN
//
//  It remembers. The Tiger's physical condition carries between missions. So do
//  your men, their wounds, their nerve, their experience and their graves. So
//  does every round you fired and every litre of fuel you burned.
//
//  Abandoning the Tiger is not a mission-failure button. It is a decision that
//  the campaign writes down.
// ===========================================================================

import { Roster } from './Roster.js';
import { Logistics } from './Logistics.js';
import { Rng } from '../core/Rng.js';
import { makeDifficulty } from '../game/Difficulty.js';
import { clamp, clamp01 } from '../core/MathUtil.js';
import { TIGER_1H } from '../data/tiger1h.js';
import { HEALTH_STATE } from '../sim/CrewSim.js';

export const TANK_STATUS = {
  OPERATIONAL: 'operational',
  FIELD_DAMAGE: 'damaged — field repairable',
  WORKSHOP: 'in workshop',
  DEPOT: 'in depot repair',
  ABANDONED_RECOVERABLE: 'abandoned — recovery possible',
  ABANDONED_LOST: 'abandoned — unrecovered',
  DESTROYED: 'destroyed',
  CAPTURED: 'captured by the enemy',
};

/** The company's Tiger, tracked across the whole campaign. */
export class TankRecord {
  constructor(callsign = 'Tiger 101', turmNummer = 'S13') {
    this.callsign = callsign;
    this.turmNummer = turmNummer;
    this.status = TANK_STATUS.OPERATIONAL;
    this.components = {};              // persistent damage
    this.ammoRemaining = {};
    this.fuelL = TIGER_1H.mobility.fuelCapacityL;
    this.repairMissionsRemaining = 0;
    this.repairDescription = null;
    this.location = null;
    this.recoveryStatus = null;
    this.totalMissions = 0;
    this.totalKills = 0;
    this.totalDistanceKm = 0;
    this.history = [];
    this.replacementNumber = 0;
  }

  get available() {
    return this.status === TANK_STATUS.OPERATIONAL || this.status === TANK_STATUS.FIELD_DAMAGE;
  }

  /** Carry the physical state out of a mission. */
  recordMissionEnd(tiger, outcome) {
    this.totalMissions++;
    this.totalKills += tiger.kills;
    this.totalDistanceKm += tiger.distanceTravelled / 1000;
    this.ammoRemaining = { ...tiger.ammo };
    this.fuelL = tiger.fuelL;
    this.components = JSON.parse(JSON.stringify(tiger.components));
    this.location = { ...tiger.pos };
  }
}

export class Campaign {
  constructor(opts = {}) {
    this.seed = opts.seed ?? Date.now() % 1e9;
    this.rng = new Rng(this.seed);
    this.difficulty = opts.difficulty || makeDifficulty('normal');
    this.name = opts.name || 'Operation Zitadelle';
    this.unit = opts.unit || '3. Kompanie, schwere Panzer-Abteilung 503';

    this.roster = Roster.create(this.rng, this.difficulty);
    this.logistics = new Logistics(this.rng, this.difficulty);
    this.tank = new TankRecord('Tiger 101', 'S13');

    this.missionIndex = 0;
    this.day = 1;                       // 5 July 1943 is day 1
    this.completed = [];
    this.record = [];                   // the campaign log the player reads
    this.stats = {
      missionsFlown: 0, sovietVehiclesDestroyed: 0, gunsDestroyed: 0,
      roundsFired: 0, hitsTaken: 0, penetrationsTaken: 0,
      tigersLost: 0, crewKilled: 0, crewWounded: 0,
      repairsCompleted: 0, recoveriesCompleted: 0, timesAbandoned: 0,
      friendlyLosses: 0,
    };
    this.pendingEvents = [];
  }

  get date() {
    // 5 July 1943 + day offset.
    const d = new Date(Date.UTC(1943, 6, 4 + this.day));
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // ==================== Mission end ========================================

  /**
   * Everything that happened is written down here, and the consequences are
   * applied to the men, the Tiger and the company's stores.
   */
  concludeMission(result) {
    const {
      tiger, objectiveMet, abandonment, recovery, kills, gunsKilled,
      roundsFired, hitsTaken, penetrationsTaken, repairsCompleted, friendlyLosses,
    } = result;

    const report = {
      missionIndex: this.missionIndex,
      day: this.day, date: this.date,
      title: result.missionTitle || `Mission ${this.missionIndex + 1}`,
      objectiveMet,
      crew: [], tank: {}, notes: [], supply: [],
    };

    // ---- Statistics ---------------------------------------------------------
    this.stats.missionsFlown++;
    this.stats.sovietVehiclesDestroyed += kills || 0;
    this.stats.gunsDestroyed += gunsKilled || 0;
    this.stats.roundsFired += roundsFired || 0;
    this.stats.hitsTaken += hitsTaken || 0;
    this.stats.penetrationsTaken += penetrationsTaken || 0;
    this.stats.repairsCompleted += repairsCompleted || 0;
    this.stats.friendlyLosses += friendlyLosses || 0;

    // ---- The men ------------------------------------------------------------
    for (const man of this.roster.crewList()) {
      if (!man) continue;
      const before = man.state;
      if (man.state === HEALTH_STATE.DEAD) {
        if (this.difficulty.permanentDeath) {
          const rec = this.roster.recordDeath(man, {
            date: this.date, mission: report.title,
            cause: result.crewCauses?.[man.role] || 'killed in action',
          });
          this.stats.crewKilled++;
          report.crew.push({ name: man.name, role: man.role, outcome: 'KILLED', permanent: true });
          report.notes.push(`${rec.rank} ${rec.name} of ${rec.hometown} was killed. He had flown ${rec.missions} missions.`);
        } else {
          // On the easier settings he is gravely wounded rather than dead.
          man.state = HEALTH_STATE.INCAPACITATED;
          man.health = 0.15;
          man.assignRecoveryTime(this.rng);
          this.stats.crewWounded++;
          report.crew.push({ name: man.name, role: man.role, outcome: 'gravely wounded', permanent: false });
        }
        continue;
      }
      if (man.state !== HEALTH_STATE.FIT) {
        man.assignRecoveryTime(this.rng);
        this.stats.crewWounded++;
      }
      report.crew.push({
        name: man.name, rank: man.rank, role: man.role,
        outcome: man.state === HEALTH_STATE.FIT ? 'survived' : man.state,
        recoveryMissions: man.recoveryMissions,
        stress: man.stress, experience: man.experience,
      });
    }

    // Experience for everyone who came back.
    if (tiger?.crewManager) {
      const xp = tiger.crewManager.awardMissionExperience({
        kills, survivedHeavyFire: (penetrationsTaken || 0) > 0,
        repairsCompleted, abandoned: !!abandonment,
      });
      report.experience = xp;
    }

    // ---- The Tiger ----------------------------------------------------------
    this._resolveTankFate(tiger, abandonment, recovery, report);

    // ---- Stores -------------------------------------------------------------
    if (tiger && this.tank.available) {
      // Unused ammunition goes back into the company's bins.
      this.logistics.returnUnused(tiger.ammo, 0);
    }
    report.supply = this.logistics.resupply(this);

    // ---- The next day -------------------------------------------------------
    this.day += this.rng.int(1, 2);
    this.missionIndex++;
    this.completed.push(report);
    this.record.push(report);

    // Between-mission recovery for everyone.
    report.rosterNotes = this.roster.betweenMissions(this.rng);
    report.autoFill = this.roster.autoFill();

    return report;
  }

  /**
   * What happened to the Tiger, and what it will cost.
   * This is the part the player feels three missions later.
   */
  _resolveTankFate(tiger, abandonment, recovery, report) {
    const t = this.tank;
    if (tiger) t.recordMissionEnd(tiger, report);

    // --- Destroyed outright ---
    if (tiger?.ammoDetonated || tiger?.destroyed) {
      t.status = TANK_STATUS.DESTROYED;
      this.stats.tigersLost++;
      this.logistics.registerLoss('tank');
      report.tank = {
        status: t.status,
        cause: tiger.ammoDetonated ? 'ammunition detonation' : 'destroyed by enemy fire',
        recovery: 'none — the vehicle burned out',
      };
      report.notes.push(`${t.callsign} was destroyed. The company has lost a Tiger.`);
      this._issueReplacementTiger(report);
      return;
    }

    // --- Abandoned ---
    if (abandonment) {
      this.stats.timesAbandoned++;
      this.logistics.registerLoss('tank');

      // Can it be got back? That depends on where it is and what state it is in.
      const burning = abandonment.tankBurning;
      const nearEnemy = report.enemyHeld ?? this.rng.bool(0.35);
      let status, note, recoveryText;

      if (burning) {
        status = TANK_STATUS.DESTROYED;
        recoveryText = 'none — it burned where it stood';
        note = `${t.callsign} was abandoned burning and is a total loss.`;
      } else if (nearEnemy) {
        // Left in ground the Soviets took. Sometimes they got a Tiger.
        if (this.rng.bool(0.18)) {
          status = TANK_STATUS.CAPTURED;
          recoveryText = 'the vehicle is in Soviet hands';
          note = `${t.callsign} was abandoned in ground the enemy now holds. It has been captured.`;
        } else {
          status = TANK_STATUS.ABANDONED_LOST;
          recoveryText = 'unrecovered — the position was overrun';
          note = `${t.callsign} was abandoned and could not be recovered.`;
        }
      } else {
        status = TANK_STATUS.ABANDONED_RECOVERABLE;
        recoveryText = 'recovery attempt authorised';
        note = `${t.callsign} was abandoned intact within our lines. A recovery party will try for it.`;
      }

      t.status = status;
      t.recoveryStatus = recoveryText;
      report.tank = {
        status, cause: report.abandonCause || 'abandoned by order of the commander',
        recovery: recoveryText,
        crew: abandonment.crew,
        evacuationSeconds: abandonment.evacuationSeconds,
      };
      report.notes.push(note);

      if (status === TANK_STATUS.ABANDONED_RECOVERABLE) {
        this.pendingEvents.push({ kind: 'recovery_attempt', missionsRemaining: this.rng.int(1, 3) });
        report.notes.push('The recovery attempt will take time. You will fight the next action in another vehicle.');
        this._issueReplacementTiger(report, true);
      } else {
        this.stats.tigersLost++;
        this._issueReplacementTiger(report);
      }
      return;
    }

    // --- Recovered after being immobilised ---
    if (recovery?.completed) {
      this.stats.recoveriesCompleted++;
      report.notes.push(`${t.callsign} was towed out by ${recovery.by || 'a recovery half-track'}.`);
    }

    // --- Damage assessment ---
    const dead = Object.entries(t.components).filter(([, s]) => s.destroyed).map(([k]) => k);
    const major = dead.filter((k) => ['engine', 'transmission', 'final_drive_l', 'final_drive_r', 'main_gun'].includes(k));
    const minor = dead.filter((k) => !major.includes(k));

    if (major.length) {
      t.status = TANK_STATUS.DEPOT;
      // A wrecked HL 230 or a shot-out gun is weeks of work.
      t.repairMissionsRemaining = clamp(
        major.length * this.rng.int(2, 4) + (major.includes('engine') ? 1 : 0), 2, 8);
      t.repairDescription = major
        .map((k) => TIGER_1H.COMPONENTS[k]?.label || k).join(', ') + ' — depot repair';
      report.tank = {
        status: t.status,
        cause: t.repairDescription,
        availability: `${t.repairMissionsRemaining} mission(s)`,
      };
      report.notes.push(`${t.callsign} goes to the depot: ${t.repairDescription}. Estimated ${t.repairMissionsRemaining} missions.`);
      this._issueReplacementTiger(report, true);
    } else if (minor.length) {
      t.status = TANK_STATUS.WORKSHOP;
      t.repairMissionsRemaining = 1;
      t.repairDescription = minor.map((k) => TIGER_1H.COMPONENTS[k]?.label || k).join(', ');
      report.tank = { status: t.status, cause: t.repairDescription, availability: 'overnight' };
      report.notes.push(`Workshop will see to: ${t.repairDescription}.`);
    } else {
      t.status = TANK_STATUS.OPERATIONAL;
      report.tank = { status: t.status, cause: null, availability: 'ready' };
    }
  }

  /** The company finds you another Tiger, eventually, and it is not the same tank. */
  _issueReplacementTiger(report, temporary = false) {
    const wait = temporary ? 0 : this.rng.int(0, 2);
    if (wait > 0) {
      report.notes.push(`No replacement Tiger is available for ${wait} mission(s). You will fight in a Panzer IV.`);
      this.pendingEvents.push({ kind: 'no_tiger', missionsRemaining: wait });
      return;
    }
    this.tank = new TankRecord(
      this.tank.callsign,
      `S${this.rng.int(11, 34)}`);
    this.tank.replacementNumber = (this.stats.tigersLost || 0);
    this.tank.status = TANK_STATUS.OPERATIONAL;
    report.notes.push(`A replacement Tiger, turret number ${this.tank.turmNummer}, has been issued to the crew.`);
  }

  // ==================== Between missions ===================================

  /** Advance depot repairs and pending recovery attempts. */
  advanceRepairs() {
    const notes = [];
    const t = this.tank;

    if (t.repairMissionsRemaining > 0) {
      t.repairMissionsRemaining--;
      if (t.repairMissionsRemaining <= 0) {
        // Everything is put right, and the parts come out of the company's stores.
        for (const k of Object.keys(t.components)) {
          t.components[k] = { damage: 0, destroyed: false, disabled: false, hp: TIGER_1H.COMPONENTS[k]?.hp };
        }
        t.status = TANK_STATUS.OPERATIONAL;
        t.repairDescription = null;
        notes.push(`${t.callsign} is out of the workshop and ready.`);
      } else {
        notes.push(`${t.callsign} is still in repair — ${t.repairMissionsRemaining} mission(s) to go. (${t.repairDescription})`);
      }
    }

    for (let i = this.pendingEvents.length - 1; i >= 0; i--) {
      const e = this.pendingEvents[i];
      e.missionsRemaining--;
      if (e.missionsRemaining > 0) continue;
      this.pendingEvents.splice(i, 1);

      if (e.kind === 'recovery_attempt') {
        if (this.rng.bool(0.58)) {
          notes.push(`${t.callsign} has been recovered by the workshop company and goes into depot repair.`);
          t.status = TANK_STATUS.DEPOT;
          t.repairMissionsRemaining = this.rng.int(2, 4);
          t.repairDescription = 'battle damage and abandonment — full depot overhaul';
        } else {
          notes.push(`The recovery party could not reach ${t.callsign}. The vehicle is written off.`);
          t.status = TANK_STATUS.ABANDONED_LOST;
          this.stats.tigersLost++;
        }
      } else if (e.kind === 'no_tiger') {
        this._issueReplacementTiger({ notes });
      }
    }

    return notes;
  }

  /** The company record the player can read at any time. */
  campaignRecord() {
    return {
      name: this.name, unit: this.unit, date: this.date, day: this.day,
      difficulty: this.difficulty.label,
      tank: {
        callsign: this.tank.callsign, turmNummer: this.tank.turmNummer,
        status: this.tank.status,
        repairDescription: this.tank.repairDescription,
        repairMissionsRemaining: this.tank.repairMissionsRemaining,
        recoveryStatus: this.tank.recoveryStatus,
        missions: this.tank.totalMissions, kills: this.tank.totalKills,
        distanceKm: Math.round(this.tank.totalDistanceKm),
      },
      crew: this.roster.summary(),
      fallen: this.roster.fallen,
      logistics: this.logistics.summary(),
      stats: { ...this.stats },
      missions: this.completed.map((c) => ({
        title: c.title, date: c.date, objectiveMet: c.objectiveMet,
        tank: c.tank.status, notes: c.notes,
      })),
    };
  }

  // ==================== Save / load ========================================

  serialize() {
    return {
      version: 1,
      seed: this.seed,
      rngState: this.rng._s,
      difficulty: this.difficulty,
      name: this.name, unit: this.unit,
      missionIndex: this.missionIndex, day: this.day,
      roster: this.roster.serialize(),
      logistics: this.logistics.serialize(),
      tank: { ...this.tank },
      stats: { ...this.stats },
      completed: this.completed,
      pendingEvents: this.pendingEvents,
    };
  }

  static deserialize(d) {
    const c = new Campaign({ seed: d.seed, difficulty: d.difficulty, name: d.name, unit: d.unit });
    c.rng._s = d.rngState ?? c.rng._s;
    c.roster = Roster.deserialize(d.roster, c.rng, d.difficulty);
    c.logistics = new Logistics(c.rng, d.difficulty);
    c.logistics.deserialize(d.logistics);
    c.tank = Object.assign(new TankRecord(), d.tank);
    c.missionIndex = d.missionIndex;
    c.day = d.day;
    c.stats = d.stats;
    c.completed = d.completed || [];
    c.record = c.completed;
    c.pendingEvents = d.pendingEvents || [];
    return c;
  }
}
