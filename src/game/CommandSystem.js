// ===========================================================================
//  COMMAND
//
//  The player does not drive the tank, lay the gun, or load it. He tells four
//  men to do those things, and they do them at the speed and quality that their
//  training, their wounds and their nerves allow.
//
//  Every command here goes through a crewman. If that man is dead, outside the
//  tank, or has his hands full, the order does not happen and somebody says so.
// ===========================================================================

import { clamp, clamp01, DEG, normalizeAngle, clockToBearing, bearingToClock } from '../core/MathUtil.js';
import { AMMO_ORDER_NAMES, getProjectile } from '../data/ammunition.js';
import { timeOfFlight } from '../sim/Ballistics.js';

export const CMD = {
  // Driver
  FORWARD: 'driver.forward', REVERSE: 'driver.reverse', STOP: 'driver.stop',
  LEFT: 'driver.left', RIGHT: 'driver.right',
  HARD_LEFT: 'driver.hard_left', HARD_RIGHT: 'driver.hard_right',
  SLOW: 'driver.slow', FAST: 'driver.fast',
  REPOSITION: 'driver.reposition', HULL_DOWN: 'driver.hull_down',
  RETREAT: 'driver.retreat', GET_COVER: 'driver.get_cover',
  HOLD_FOR_REPAIRS: 'driver.hold_repairs', PREPARE_TOW: 'driver.prepare_tow',
  PREPARE_ABANDON: 'driver.prepare_abandon',

  // Gunner
  TRAVERSE_LEFT: 'gunner.traverse_left', TRAVERSE_RIGHT: 'gunner.traverse_right',
  TARGET_CLOCK: 'gunner.target_clock', TARGET_MY_LAY: 'gunner.target_my_lay',
  ENGAGE: 'gunner.engage', FIRE: 'gunner.fire',
  HOLD_FIRE: 'gunner.hold_fire', CEASE_FIRE: 'gunner.cease_fire',

  // Loader
  LOAD_AP: 'loader.load_ap', LOAD_HE: 'loader.load_he', LOAD_SMOKE: 'loader.load_smoke',
  LOAD_APCR: 'loader.load_apcr', LOAD_HEAT: 'loader.load_heat',
  ASSIST_REPAIR: 'loader.assist_repair',

  // Radio
  REPORT_CONTACT: 'radio.report_contact', REPORT_POSITION: 'radio.report_position',
  CONTACT_HQ: 'radio.contact_hq', REQUEST_ARTILLERY: 'radio.request_artillery',
  REQUEST_SUPPORT: 'radio.request_support', REPORT_DAMAGE: 'radio.report_damage',
  REQUEST_RETREAT: 'radio.request_retreat', REQUEST_RECOVERY: 'radio.request_recovery',
  REQUEST_FUEL: 'radio.request_fuel', REPORT_ABANDONED: 'radio.report_abandoned',

  // Emergency
  FIRE_EXTINGUISHERS: 'emergency.extinguishers',
  ABANDON_TANK: 'emergency.abandon',
  ABORT_REPAIR: 'emergency.abort_repair',
  RECALL_CREW: 'emergency.recall_crew',
};

/**
 * The command tree the radial menu and the mobile menu are both built from.
 * One definition, two interfaces — which is how the PC and mobile versions
 * stay the same game.
 */
export const COMMAND_TREE = [
  {
    id: 'driver', label: 'DRIVER', key: '1', role: 'driver',
    items: [
      { id: CMD.FORWARD, label: 'Forward', key: 'w' },
      { id: CMD.REVERSE, label: 'Reverse', key: 's' },
      { id: CMD.STOP, label: 'Stop', key: 'x' },
      { id: CMD.LEFT, label: 'Left', key: 'a' },
      { id: CMD.RIGHT, label: 'Right', key: 'd' },
      { id: CMD.HARD_LEFT, label: 'Hard left', key: 'q' },
      { id: CMD.HARD_RIGHT, label: 'Hard right', key: 'e' },
      { id: CMD.SLOW, label: 'Slow', key: 'z' },
      { id: CMD.FAST, label: 'Full speed', key: 'c' },
      { id: CMD.GET_COVER, label: 'Get behind cover', key: 'v', highlight: true },
      { id: CMD.HULL_DOWN, label: 'Find hull-down', key: 'h' },
      { id: CMD.RETREAT, label: 'Retreat', key: 'r' },
      { id: CMD.HOLD_FOR_REPAIRS, label: 'Hold for repairs', key: 'f' },
      { id: CMD.PREPARE_TOW, label: 'Prepare for towing', key: 't' },
      { id: CMD.PREPARE_ABANDON, label: 'Prepare to abandon', key: 'b', danger: true },
    ],
  },
  {
    id: 'gunner', label: 'GUNNER', key: '2', role: 'gunner',
    items: [
      { id: CMD.TARGET_MY_LAY, label: 'Target — my position', key: 't', highlight: true },
      { id: CMD.TARGET_CLOCK, label: 'Target — clock bearing', key: 'c', needsArg: 'clock' },
      { id: CMD.ENGAGE, label: 'Engage', key: 'e' },
      { id: CMD.FIRE, label: 'FIRE', key: 'f', highlight: true },
      { id: CMD.HOLD_FIRE, label: 'Hold fire', key: 'h' },
      { id: CMD.CEASE_FIRE, label: 'Cease fire', key: 'x' },
      { id: CMD.TRAVERSE_LEFT, label: 'Traverse left', key: 'a' },
      { id: CMD.TRAVERSE_RIGHT, label: 'Traverse right', key: 'd' },
    ],
  },
  {
    id: 'loader', label: 'LOADER', key: '3', role: 'loader',
    items: [
      { id: CMD.LOAD_AP, label: 'Load Panzergranate (AP)', key: 'a', ammo: 'pzgr39' },
      { id: CMD.LOAD_HE, label: 'Load Sprenggranate (HE)', key: 'h', ammo: 'sprgr39' },
      { id: CMD.LOAD_SMOKE, label: 'Load Nebelgranate (smoke)', key: 's', ammo: 'nbgr' },
      { id: CMD.LOAD_APCR, label: 'Load Panzergranate 40', key: '4', ammo: 'pzgr40', scarce: true },
      { id: CMD.LOAD_HEAT, label: 'Load Hohlladung', key: 'l', ammo: 'gr39hl', scarce: true },
      { id: CMD.ASSIST_REPAIR, label: 'Assist repair', key: 'r' },
    ],
  },
  {
    id: 'radio', label: 'RADIO', key: '4', role: 'radio',
    items: [
      { id: CMD.REPORT_CONTACT, label: 'Report contact', key: 'c' },
      { id: CMD.REPORT_POSITION, label: 'Report position', key: 'p' },
      { id: CMD.CONTACT_HQ, label: 'Contact HQ', key: 'h' },
      { id: CMD.REQUEST_ARTILLERY, label: 'Request artillery', key: 'a', needsArg: 'grid' },
      { id: CMD.REQUEST_SUPPORT, label: 'Request support', key: 's' },
      { id: CMD.REPORT_DAMAGE, label: 'Report damage', key: 'd' },
      { id: CMD.REQUEST_RECOVERY, label: 'Request recovery', key: 'r', highlight: true },
      { id: CMD.REQUEST_FUEL, label: 'Request fuel', key: 'f' },
      { id: CMD.REQUEST_RETREAT, label: 'Request permission to withdraw', key: 'w' },
      { id: CMD.REPORT_ABANDONED, label: 'Report tank abandoned', key: 'x' },
    ],
  },
  {
    id: 'emergency', label: 'EMERGENCY', key: '5', danger: true,
    items: [
      { id: CMD.FIRE_EXTINGUISHERS, label: 'FIRE EXTINGUISHERS', key: 'f', danger: true },
      { id: CMD.ABANDON_TANK, label: 'ABANDON TANK', key: 'a', danger: true, confirm: true },
      { id: CMD.ABORT_REPAIR, label: 'Abort repair', key: 'r' },
      { id: CMD.RECALL_CREW, label: 'Recall crew', key: 'c' },
    ],
  },
];

export class CommandSystem {
  constructor({ world, bus, rng, tiger, repair, recovery, abandonment, radio, difficulty }) {
    this.world = world;
    this.bus = bus;
    this.rng = rng;
    this.tiger = tiger;
    this.repair = repair;
    this.recovery = recovery;
    this.abandonment = abandonment;
    this.radio = radio;
    this.difficulty = difficulty || {};

    this.pending = [];               // orders in flight — the crew takes time to obey
    this.holdFire = false;
    this.engageAuthorised = false;
    this.designatedTarget = null;
    this.driverIntent = { speed: 0, steer: 0, mode: 'stop' };
    this.lastOrder = null;
  }

  /**
   * Issue an order. It is queued with a delay representing the man hearing it,
   * understanding it and acting — which is longer when he is frightened, hurt
   * or already busy, and longer still when the commander himself is wounded.
   */
  issue(cmdId, arg = null, commanderMan = null) {
    const role = cmdId.split('.')[0];
    const isEmergency = role === 'emergency';
    const targetRole = isEmergency ? null : role;

    // Does the man exist and can he act?
    if (targetRole) {
      const man = this.tiger.crewManager?.get(targetRole);
      if (!man) {
        this.bus?.emit('command:refused', {
          cmdId, reason: `There is nobody at the ${targetRole}'s station.`,
        });
        return { ok: false, reason: `Nobody at the ${targetRole}'s station.` };
      }
      if (man.outsideTank) {
        this.bus?.emit('command:refused', { cmdId, reason: `${man.name} is outside the tank.` });
        return { ok: false, reason: `${man.name} is outside the tank.` };
      }
    }

    // How long before he acts?
    let delay = this._reactionDelay(targetRole, commanderMan, isEmergency);

    this.pending.push({ cmdId, arg, at: this.world.time + delay, role: targetRole });
    this.lastOrder = cmdId;
    this.bus?.emit('command:issued', { cmdId, arg, delay, role: targetRole });
    return { ok: true, delay };
  }

  _reactionDelay(role, commanderMan, isEmergency) {
    let base = isEmergency ? 0.25 : 0.55;
    const man = role ? this.tiger.crewManager?.get(role) : null;
    if (man) {
      const reaction = clamp01(man.skill.reaction ?? man.experience);
      base *= 1.6 - reaction * 0.7;
      base *= 1 + man.stress * 0.7 + man.fatigue * 0.3;
      if (man.busyWith) base += 0.6;
    }
    // A wounded commander gives orders slowly and sometimes indistinctly.
    if (commanderMan) {
      const impair = (1 - commanderMan.health) * 1.8 + commanderMan.shock * 1.2;
      base *= 1 + impair;
      if (commanderMan.state === 'incapacitated') base *= 4;
    }
    return clamp(base, 0.15, 8);
  }

  update(dt) {
    // Orders must be carried out in the sequence they were given. Walking the
    // queue backwards executed "engage" before "target", which cleared the
    // authorisation the instant it was granted and the gun never fired.
    if (this.pending.length) {
      const due = [];
      const waiting = [];
      for (const o of this.pending) {
        (this.world.time >= o.at ? due : waiting).push(o);
      }
      this.pending = waiting;
      for (const o of due) this._execute(o.cmdId, o.arg);
    }

    this._applyDriverIntent(dt);
    this._runGunnerEngagement(dt);
  }

  // ---- Execution -----------------------------------------------------------

  _execute(cmdId, arg) {
    const t = this.tiger;
    const cm = t.crewManager;

    switch (cmdId) {
      // ---------------- DRIVER ----------------
      case CMD.FORWARD:
        this.driverIntent = { ...this.driverIntent, mode: 'forward', speed: this.driverIntent.speed || 0.6 };
        cm?.say('driver', 'driver.forward', {}, true); break;
      case CMD.REVERSE:
        this.driverIntent = { ...this.driverIntent, mode: 'reverse', speed: this.driverIntent.speed || 0.6 };
        cm?.say('driver', 'driver.reverse', {}, true); break;
      case CMD.STOP:
        this.driverIntent = { mode: 'stop', speed: 0, steer: 0 };
        cm?.say('driver', 'driver.stop', {}, true); break;
      case CMD.LEFT: this.driverIntent.steer = -0.5; cm?.say('driver', 'driver.ack'); break;
      case CMD.RIGHT: this.driverIntent.steer = 0.5; cm?.say('driver', 'driver.ack'); break;
      case CMD.HARD_LEFT: this.driverIntent.steer = -1; cm?.say('driver', 'driver.ack'); break;
      case CMD.HARD_RIGHT: this.driverIntent.steer = 1; cm?.say('driver', 'driver.ack'); break;
      case CMD.SLOW: this.driverIntent.speed = 0.32; cm?.say('driver', 'driver.ack'); break;
      case CMD.FAST: this.driverIntent.speed = 1.0; cm?.say('driver', 'driver.ack'); break;

      case CMD.GET_COVER:
      case CMD.HULL_DOWN: {
        const res = this.repair?.orderCover(t, arg);
        if (res && !res.ok) this.bus?.emit('command:refused', { cmdId, reason: res.reason });
        else this.driverIntent = { mode: 'to_cover', speed: 0.8, steer: 0 };
        break;
      }
      case CMD.RETREAT: {
        this.driverIntent = { mode: 'retreat', speed: 1.0, steer: 0 };
        cm?.say('driver', 'driver.reverse', {}, true);
        break;
      }
      case CMD.HOLD_FOR_REPAIRS:
        this.driverIntent = { mode: 'stop', speed: 0, steer: 0 };
        cm?.say('driver', 'driver.ack', {}, true);
        this.bus?.emit('command:hold_for_repairs', {});
        break;
      case CMD.PREPARE_TOW:
        this.driverIntent = { mode: 'stop', speed: 0, steer: 0 };
        this.bus?.emit('command:prepare_tow', {});
        cm?.say('driver', 'driver.ack', {}, true);
        break;
      case CMD.PREPARE_ABANDON:
        this.driverIntent = { mode: 'stop', speed: 0, steer: 0 };
        this.bus?.emit('command:prepare_abandon', {});
        break;

      // ---------------- GUNNER ----------------
      case CMD.TARGET_MY_LAY: {
        // "Gunner — target, my position." The commander hands over what he is
        // looking at, and the gunner has to find it in a 25-degree sight.
        this.designatedTarget = arg;
        this.engageAuthorised = false;
        this.holdFire = false;
        cm?.say('gunner', 'order.identify', {}, true);
        this._gunnerSearch(arg);
        break;
      }
      case CMD.TARGET_CLOCK: {
        const hour = arg?.clock ?? 12;
        const bearing = clockToBearing(hour);
        const dist = arg?.range ?? 800;
        const world = {
          x: t.pos.x + Math.sin(t.heading + bearing) * dist,
          y: t.pos.y + 1.2,
          z: t.pos.z + Math.cos(t.heading + bearing) * dist,
        };
        this.designatedTarget = { pos: world, fromClock: hour };
        cm?.say('gunner', 'order.identify', {}, true);
        this._gunnerSearch(this.designatedTarget);
        break;
      }
      case CMD.ENGAGE:
        this.engageAuthorised = true; this.holdFire = false;
        cm?.say('gunner', 'gunner.traversing', {}, true); break;
      case CMD.FIRE: {
        this.holdFire = false;
        const r = t.fireMainGun(this.world);
        if (!r.ok) {
          this.bus?.emit('command:refused', { cmdId, reason: r.reason });
          cm?.say('gunner', 'ack.negative', {}, true);
        }
        break;
      }
      case CMD.HOLD_FIRE:
        this.holdFire = true; this.engageAuthorised = false;
        cm?.say('gunner', 'ack.generic', {}, true); break;
      case CMD.CEASE_FIRE:
        this.holdFire = true; this.engageAuthorised = false; this.designatedTarget = null;
        cm?.say('gunner', 'ack.generic', {}, true); break;
      case CMD.TRAVERSE_LEFT:
        t.turretTargetAz = normalizeAngle(t.turretAz - 25 * DEG);
        cm?.say('gunner', 'gunner.traversing', {}, true); break;
      case CMD.TRAVERSE_RIGHT:
        t.turretTargetAz = normalizeAngle(t.turretAz + 25 * DEG);
        cm?.say('gunner', 'gunner.traversing', {}, true); break;

      // ---------------- LOADER ----------------
      case CMD.LOAD_AP: this._load('pzgr39'); break;
      case CMD.LOAD_HE: this._load('sprgr39'); break;
      case CMD.LOAD_SMOKE: this._load('nbgr'); break;
      case CMD.LOAD_APCR: this._load('pzgr40'); break;
      case CMD.LOAD_HEAT: this._load('gr39hl'); break;
      case CMD.ASSIST_REPAIR:
        this.bus?.emit('command:assist_repair', { role: 'loader' });
        break;

      // ---------------- RADIO ----------------
      case CMD.REPORT_CONTACT: this.radio?.reportContact(); break;
      case CMD.REPORT_POSITION: this.radio?.reportPosition(); break;
      case CMD.CONTACT_HQ: this.radio?.contactHQ(); break;
      case CMD.REQUEST_ARTILLERY: this.radio?.requestArtillery(arg); break;
      case CMD.REQUEST_SUPPORT: this.radio?.requestSupport(); break;
      case CMD.REPORT_DAMAGE: this.radio?.reportDamage(); break;
      case CMD.REQUEST_RETREAT: this.radio?.requestWithdrawal(); break;
      case CMD.REQUEST_FUEL: this.radio?.requestFuel(); break;
      case CMD.REPORT_ABANDONED: this.radio?.reportAbandoned(); break;
      case CMD.REQUEST_RECOVERY: {
        const op = t.crewManager?.get('radio');
        const res = this.recovery?.request(t, op);
        if (res && !res.ok) this.bus?.emit('command:refused', { cmdId, reason: res.reason });
        break;
      }

      // ---------------- EMERGENCY ----------------
      case CMD.FIRE_EXTINGUISHERS: {
        if (!t.fire?.active) {
          this.bus?.emit('command:refused', { cmdId, reason: 'There is no fire.' });
          break;
        }
        const results = t.fire.commandSuppression(t);
        for (const r of results) {
          this.bus?.emit(r.ok ? 'command:ack' : 'command:refused', { cmdId, reason: r.reason });
        }
        if (results.some((r) => r.ok && !r.manual)) cm?.say('driver', 'fire.suppression_on', {}, true);
        else if (results.some((r) => !r.ok && /empty/i.test(r.reason))) cm?.say('driver', 'fire.suppression_empty', {}, true);
        break;
      }
      case CMD.ABANDON_TANK: {
        const res = this.abandonment?.order(t, arg);
        if (res && !res.ok) this.bus?.emit('command:refused', { cmdId, reason: res.reason });
        break;
      }
      case CMD.ABORT_REPAIR: {
        const res = this.repair?.abort(t);
        if (res && !res.ok) this.bus?.emit('command:refused', { cmdId, reason: res.reason });
        break;
      }
      case CMD.RECALL_CREW: {
        this.repair?.abort(t);
        this.recovery?.abort(t);
        break;
      }
      default:
        this.bus?.emit('command:refused', { cmdId, reason: 'Unknown order.' });
    }
  }

  _load(projId) {
    const t = this.tiger;
    if ((t.ammo[projId] || 0) <= 0) {
      t.crewManager?.say('loader', 'loader.ammo_out', {}, true);
      this.bus?.emit('command:refused', {
        cmdId: `load:${projId}`,
        reason: `No ${AMMO_ORDER_NAMES[projId] || projId} left.`,
      });
      return;
    }
    t.selectedAmmo = projId;
    // If the breech already holds this nature, nothing to do.
    if (t.loadedRound === projId) {
      t.crewManager?.say('loader', 'loader.ready', {}, true);
      return;
    }
    const r = t.beginReload(projId, true);
    if (!r.ok) this.bus?.emit('command:refused', { cmdId: `load:${projId}`, reason: r.reason });
  }

  /** The gunner hunts for what the commander pointed at. He may not find it. */
  _gunnerSearch(target) {
    const t = this.tiger;
    const gunner = t.crewManager?.get('gunner');
    if (!gunner || !target) return;

    this.gunnerSearch = {
      target,
      startedAt: this.world.time,
      found: false,
      // Finding a target in a 25-degree sight, handed over by clock code, takes
      // a trained man a couple of seconds and a green one much longer.
      searchTime: clamp(4.2 - (gunner.skill.acquisition ?? gunner.experience) * 3.0, 0.9, 6.5)
        * gunner.speedFactor,
    };
  }

  _runGunnerEngagement(dt) {
    const t = this.tiger;
    const gs = this.gunnerSearch;
    if (!gs || !this.designatedTarget) return;

    const gunner = t.crewManager?.get('gunner');
    if (!gunner) return;

    if (!gs.found) {
      if (this.world.time - gs.startedAt > gs.searchTime) {
        // Is there actually anything where the commander pointed?
        const near = this._targetNear(this.designatedTarget.pos, 120);
        if (near) {
          gs.found = true;
          gs.vehicle = near;
          t.crewManager.speak(gunner, 'gunner.acquired', {}, true);
        } else {
          gs.startedAt = this.world.time;
          gs.misses = (gs.misses || 0) + 1;
          if (gs.misses >= 2) {
            t.crewManager.speak(gunner, 'gunner.no_target', {}, true);
            this.gunnerSearch = null;
            this.designatedTarget = null;
            this.engageAuthorised = false;
            return;                       // there is nothing left to lay on
          }
        }
      }
      // He traverses toward the bearing while he searches.
      t.layOn(this.designatedTarget.pos, dt);
      return;
    }

    // He has it. Lay on and report.
    const target = gs.vehicle;
    if (!target || target.destroyed) {
      this.designatedTarget = null; this.gunnerSearch = null;
      this.engageAuthorised = false;
      return;
    }
    const laid = t.layOn({ x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z }, dt);

    if (laid && !gs.reportedOn) {
      gs.reportedOn = true;
      t.crewManager.speak(gunner, 'gunner.on_target', {}, true);
      this.bus?.emit('gunner:on_target', { target: target.callsign });
    }
    if (!laid) gs.reportedOn = false;

    // "Engage" means he shoots when he is on and loaded, without being told again.
    if (this.engageAuthorised && !this.holdFire && laid && t.loadedRound) {
      // A gunner does not put a round into the crest in front of him. If the
      // ground masks the target he says so and holds, and the commander has to
      // do something about the position rather than waste ammunition.
      if (!this._hasClearShot(t, target)) {
        if (!gs.maskedReported) {
          gs.maskedReported = true;
          this.tiger.crewManager?.speak(gunner, 'gunner.no_target', {}, true);
          this.bus?.emit('command:refused', {
            cmdId: 'gunner.engage',
            reason: 'The gunner cannot see the target — the ground is in the way.',
          });
        }
        return;
      }
      gs.maskedReported = false;
      const r = t.fireMainGun(this.world);
      if (r.ok) gs.reportedOn = false;
    }
  }

  /**
   * Is there sky between the muzzle and the target, or is there a hill?
   * Checked along the shell's actual arc, so a target behind a crest that the
   * round would clear at the top of its trajectory is still a legal shot.
   */
  _hasClearShot(t, target) {
    const terrain = this.world.terrain;
    if (!terrain) return true;
    const m = t.muzzle();
    const dx = target.pos.x - m.pos.x;
    const dz = target.pos.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 30) return true;
    const proj = getProjectile(t.loadedRound || t.selectedAmmo || 'pzgr39');

    // Use the barrel's ACTUAL world direction. The gun's elevation figure is
    // relative to the hull and already carries the hull's tilt compensation, so
    // reading it directly would mis-state the trajectory on any slope.
    const horiz = Math.hypot(m.dir.x, m.dir.z) || 1;
    const slope = m.dir.y / horiz;

    const steps = Math.min(40, Math.max(6, Math.floor(dist / 40)));
    // Start clear of the tank's own hull, and stop short of the target so the
    // ground the target is standing on does not mask it.
    for (let i = 1; i < steps - 1; i++) {
      const f = i / steps;
      const s = dist * f;
      if (s < 25) continue;
      const x = m.pos.x + dx * f;
      const z = m.pos.z + dz * f;
      const t_ = timeOfFlight(proj, s);
      const y = m.pos.y + slope * s - 0.5 * 9.80665 * t_ * t_;
      // A metre of clearance: a shell that shaves the crest still gets there.
      if (terrain.heightAt(x, z) > y + 1.0) return false;
    }
    return true;
  }

  _targetNear(pos, radius) {
    let best = null, bd = radius;
    for (const v of this.world.vehicles) {
      if (v === this.tiger || v.destroyed || v.faction === this.tiger.faction) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Translate the standing driver order into throttle, brake and steering. */
  _applyDriverIntent(dt) {
    const t = this.tiger;
    const dl = t.driveline;
    if (!dl) return;

    const driver = t.crewManager?.get('driver');
    if (!driver) { dl.throttle = 0; dl.brake = 1; dl.targetGear = 0; return; }

    // The driver's own quality shows in how smoothly the orders are carried out.
    const skill = clamp01((driver.skill.driving ?? driver.experience) * driver.effectiveness);
    const smoothing = 0.6 + skill * 3.4;

    const intent = this.driverIntent;

    if (intent.mode === 'to_cover' && this.repair?.coverOrder && !this.repair.coverOrder.arrived) {
      const c = this.repair.coverOrder.pos;
      const dx = c.x - t.pos.x, dz = c.z - t.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let err = want - t.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      // A good driver reverses into cover rather than turning his flank.
      const reverseIn = Math.abs(err) > 2.1 && dist < 90;
      dl.steer = clamp(err * (reverseIn ? -1.6 : 1.8), -1, 1);
      dl.throttle = dist < 20 ? 0.25 : 0.8;
      dl.brake = dist < 14 ? 1 : 0;
      dl.autoGear(reverseIn ? -1 : 1, dl.speed);
      if (!dl.running && !t.components.engine?.destroyed) dl.start();
      return;
    }

    switch (intent.mode) {
      case 'stop':
        dl.throttle = 0; dl.brake = 1; dl.targetGear = 0; dl.steer = 0;
        break;
      case 'forward':
        dl.throttle = clamp01(intent.speed);
        dl.brake = 0;
        dl.steer = clamp(intent.steer * (0.6 + skill * 0.5), -1, 1);
        dl.autoGear(t.spec.mobility.practicalRoad * intent.speed, dl.speed);
        if (!dl.running && !t.components.engine?.destroyed) dl.start();
        break;
      case 'reverse':
      case 'retreat':
        dl.throttle = clamp01(intent.speed);
        dl.brake = 0;
        dl.steer = clamp(intent.steer * 0.7, -1, 1);
        dl.autoGear(-t.spec.mobility.maxReverse * intent.speed, dl.speed);
        if (!dl.running && !t.components.engine?.destroyed) dl.start();
        break;
      default:
        dl.throttle = 0; dl.brake = 0.6;
    }
  }

  /** For the HUD: what is the tank currently being told to do? */
  standingOrders() {
    return {
      driver: this.driverIntent.mode,
      gunner: this.holdFire ? 'hold fire'
        : this.engageAuthorised ? 'engaging'
          : this.designatedTarget ? 'searching' : 'observing',
      loaded: this.tiger.loadedRound,
      selected: this.tiger.selectedAmmo,
      pending: this.pending.length,
    };
  }
}
