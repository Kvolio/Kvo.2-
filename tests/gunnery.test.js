// The full command chain, end to end, with no renderer in the way:
// commander designates -> gunner searches -> gunner lays -> loader loads ->
// gun fires -> shell flies -> armour is resolved -> something breaks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/world/Terrain.js';
import { World } from '../src/sim/World.js';
import { Vehicle } from '../src/sim/Vehicle.js';
import { EnemyAI, AI_STATE } from '../src/ai/EnemyAI.js';
import { CrewManager, generateCrewman } from '../src/sim/CrewSim.js';
import { CommandSystem, CMD } from '../src/game/CommandSystem.js';
import { RepairSystem } from '../src/game/RepairSystem.js';
import { RecoverySystem } from '../src/game/RecoverySystem.js';
import { Abandonment } from '../src/game/Abandonment.js';
import { RadioSystem } from '../src/game/RadioSystem.js';
import { Logistics } from '../src/campaign/Logistics.js';
import { TIGER_1H } from '../src/data/tiger1h.js';
import { T34_1943 } from '../src/data/vehicles.js';
import { EventBus } from '../src/core/EventBus.js';
import { Rng } from '../src/core/Rng.js';
import { makeDifficulty } from '../src/game/Difficulty.js';

function scenario(seed = 4242, enemyRange = 700, opts = {}) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  // Deliberately featureless ground: these tests are about the gun and the
  // armour, not about whether a ridge happens to be in the way.
  const terrain = new Terrain({
    seed, size: 3000, amplitude: 0,
    ridges: 0, balkas: 0, woods: 0, villages: 0, trenches: 0, minefields: 0,
  });
  const difficulty = makeDifficulty('normal');
  const world = new World({ terrain, bus, rng, difficulty, env: { lightFactor: 1, visibilityFactor: 1 } });

  const tiger = new Vehicle(TIGER_1H, { bus, rng, terrain, isPlayer: true, faction: 'german', callsign: 'Tiger 101' });
  tiger.pos = { x: 0, y: terrain.heightAt(0, 0), z: 0 };
  tiger.heading = 0;
  tiger.crew = ['gunner', 'loader', 'driver', 'radio'].map((r) => generateCrewman(r, rng, 'seasoned'));
  const commander = generateCrewman('commander', rng, 'veteran');
  tiger.crew.push(commander);
  tiger.crewManager = new CrewManager(tiger.crew.filter((m) => m.role !== 'commander'), bus, rng, TIGER_1H);
  tiger.driveline.start();
  world.addVehicle(tiger);

  const t34 = new Vehicle(T34_1943, { bus, rng, terrain, faction: 'soviet', callsign: 'T-34' });
  // Some tests want the battlefield empty so they measure one mechanism at a time.
  const ez = opts.enemy === false ? enemyRange + 4000 : enemyRange;
  t34.pos = { x: 0, y: terrain.heightAt(0, ez), z: ez };
  t34.heading = Math.PI;
  t34.crew = ['gunner', 'loader', 'driver', 'radio'].map((r) => generateCrewman(r, rng, 'trained'));
  t34.crewManager = new CrewManager(t34.crew, bus, rng, T34_1943);
  // By default the target holds its position: most of these tests are about the
  // gunnery chain, not about whether a T-34 can drive out of the beaten zone.
  const ai = opts.enemyAI === false
    ? null
    : new EnemyAI(t34, world, { skill: 0.5, initialState: AI_STATE.AMBUSH });
  world.addVehicle(t34, ai);

  const logistics = new Logistics(rng, difficulty);
  const repair = new RepairSystem({ world, bus, rng, logistics, difficulty });
  const recovery = new RecoverySystem({ world, bus, rng, campaign: { logistics }, difficulty });
  const abandonment = new Abandonment({ world, bus, rng, difficulty });
  const radio = new RadioSystem({ world, bus, rng, tiger, campaign: { logistics }, difficulty });
  const commands = new CommandSystem({
    world, bus, rng, tiger, repair, recovery, abandonment, radio, difficulty,
  });

  const step = (seconds) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      world.update(1 / 60);
      commands.update(1 / 60);
      radio.update(1 / 60);
      repair.update(1 / 60, tiger);
      recovery.update(1 / 60, tiger);
      abandonment.update(1 / 60, tiger);
    }
  };

  return { bus, rng, world, tiger, t34, ai, commands, repair, recovery, abandonment, radio, commander, logistics, step };
}

test('the commander designates, the gunner lays, the gun fires', () => {
  const s = scenario(4242, 700, { enemyAI: false });
  s.tiger.beginReload('pzgr39');
  s.step(12);
  assert.equal(s.tiger.loadedRound, 'pzgr39', 'the loader should have a round in the breech');

  s.commands.issue(CMD.TARGET_MY_LAY, { pos: { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z } }, s.commander);
  s.commands.issue(CMD.ENGAGE, null, s.commander);
  s.step(25);

  assert.ok(s.tiger.shotsFired > 0,
    `the gun should have fired. turret at ${(s.tiger.turretAz * 180 / Math.PI).toFixed(1)} deg, loaded=${s.tiger.loadedRound}`);
});

test('the shell actually reaches the target and the armour is resolved', () => {
  const s = scenario(7777, 700, { enemyAI: false });
  const hits = [];
  s.bus.on('vehicle:hit', (e) => { if (e.vehicle === s.t34) hits.push(e); });

  s.tiger.beginReload('pzgr39');
  s.step(12);
  s.commands.issue(CMD.TARGET_MY_LAY, { pos: { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z } }, s.commander);
  s.commands.issue(CMD.ENGAGE, null, s.commander);
  s.step(60);

  assert.ok(s.tiger.shotsFired >= 2, `should have fired several rounds, fired ${s.tiger.shotsFired}`);
  assert.ok(hits.length > 0, `at least one round should have struck the T-34 at 700 m (fired ${s.tiger.shotsFired})`);
  const h = hits[0];
  assert.ok(h.report, 'every hit carries the full ballistic calculation');
  assert.ok(h.report.impactVelocity > 500 && h.report.impactVelocity < 780,
    `impact velocity ${h.report.impactVelocity} m/s should be plausible at 700 m`);
});

test('an 8.8 cm PzGr 39 destroys a T-34 — the outcome follows from the physics', () => {
  const s = scenario(31337, 600, { enemyAI: false });
  s.tiger.beginReload('pzgr39');
  s.step(12);
  s.commands.issue(CMD.TARGET_MY_LAY, { pos: { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z } }, s.commander);
  s.commands.issue(CMD.ENGAGE, null, s.commander);
  s.step(120);

  const assess = s.t34.assess();
  assert.ok(assess.combatIneffective || s.t34.destroyed,
    `a T-34 taking 8.8 cm at 600 m should be knocked out. Shots ${s.tiger.shotsFired}, hits ${s.t34.hitLog.length}, reasons: ${assess.reasons.join(', ')}`);
});

test('ammunition is consumed one round at a time and never regenerates', () => {
  const s = scenario(99, 700, { enemyAI: false });
  const start = s.tiger.ammoRemaining;
  s.tiger.beginReload('pzgr39');
  s.step(12);
  s.commands.issue(CMD.TARGET_MY_LAY, { pos: { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z } }, s.commander);
  s.commands.issue(CMD.ENGAGE, null, s.commander);
  s.step(90);
  const fired = s.tiger.shotsFired;
  // Rounds in the racks + the one in the breech + those fired must equal the start.
  const inBreech = s.tiger.loadedRound ? 1 : 0;
  assert.equal(s.tiger.ammoRemaining + inBreech + fired, start,
    `ammunition must balance: ${s.tiger.ammoRemaining} left + ${inBreech} in breech + ${fired} fired should equal ${start}`);
});

test('an order to a dead crewman is refused with a reason, not silently dropped', () => {
  const s = scenario(1234);
  const refusals = [];
  s.bus.on('command:refused', (e) => refusals.push(e));

  const gunner = s.tiger.crewManager.byRole('gunner');
  gunner.wound(1.0, 'test');
  assert.equal(gunner.state, 'dead');

  const r = s.commands.issue(CMD.FIRE, null, s.commander);
  assert.equal(r.ok, false);
  assert.match(r.reason, /gunner/i);
});

test('a wounded commander gives orders more slowly', () => {
  const s = scenario(55);
  const fit = s.commands.issue(CMD.STOP, null, s.commander).delay;
  s.commander.wound(0.6, 'spall');
  const hurt = s.commands.issue(CMD.STOP, null, s.commander).delay;
  assert.ok(hurt > fit * 1.4,
    `a wounded commander should be slower: ${hurt.toFixed(2)}s vs ${fit.toFixed(2)}s`);
});

test('field repair sends real men outside and takes real time', () => {
  const s = scenario(2468, 700, { enemy: false, enemyAI: false });
  s.tiger.components.track_l.destroyed = true;
  assert.equal(s.tiger.assess().mobile, true, 'one track gone still leaves the tank mobile-ish');

  const assessment = s.repair.assessDamage(s.tiger);
  const track = assessment.find((a) => a.id === 'track_l');
  assert.ok(track, 'the broken track should be listed');
  assert.equal(track.repairable, true, 'a track is a field repair');

  const r = s.repair.begin(s.tiger, 'track_l', ['driver', 'loader']);
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.estimateSeconds > 120, `an 11-minute track job should not take ${r.estimateSeconds}s`);
  assert.ok(r.consequences.some((c) => /loading/i.test(c)), 'the game must say the loader is now outside');

  // The men are physically outside.
  s.step(3);
  assert.equal(s.world.dismounts.length, 2);
  assert.equal(s.tiger.crewManager.byRole('driver').outsideTank, true);

  // And the tank cannot load while the loader is out.
  const load = s.tiger.beginReload('pzgr39', true);
  assert.equal(load.ok, false);

  // Let it run to completion. It takes a little longer than the estimate
  // because the men tire while they work, which is the point.
  s.step(r.estimateSeconds * 1.6 + 120);
  assert.equal(s.tiger.components.track_l.destroyed, false, 'the track should be back on');
  assert.equal(s.world.dismounts.length, 0, 'the men should be back inside');
  assert.ok(s.tiger.crewManager.byRole('driver').fatigue > 0.05,
    'the men should be tired after a track repair');
});

test('a repair consumes the company spare parts for good', () => {
  const s = scenario(1357, 700, { enemy: false, enemyAI: false });
  const before = s.logistics.spares.trackLinks;
  s.tiger.components.track_r.destroyed = true;
  const r = s.repair.begin(s.tiger, 'track_r', ['driver', 'loader', 'radio']);
  assert.equal(r.ok, true);
  s.step(r.estimateSeconds * 1.6 + 120);
  assert.equal(s.logistics.spares.trackLinks, before - 3, 'three track links should be gone from stores');
});

test('a repair cannot start without the parts', () => {
  const s = scenario(1358);
  s.logistics.spares.trackLinks = 0;
  s.tiger.components.track_l.destroyed = true;
  const assessment = s.repair.assessDamage(s.tiger);
  const track = assessment.find((a) => a.id === 'track_l');
  assert.equal(track.repairable, false);
  assert.match(track.reason, /no track/i);
  const r = s.repair.begin(s.tiger, 'track_l', ['driver']);
  assert.equal(r.ok, false);
});

test('a destroyed engine is honestly reported as beyond field repair', () => {
  const s = scenario(864);
  s.tiger.components.engine.destroyed = true;
  const a = s.repair.assessDamage(s.tiger).find((x) => x.id === 'engine');
  assert.equal(a.fieldRepairable, false);
  assert.match(a.reason, /depot|cannot/i);
  const r = s.repair.begin(s.tiger, 'engine', ['driver']);
  assert.equal(r.ok, false);
});

test('abandoning the tank physically evacuates every man over real time', () => {
  const s = scenario(5150);
  const out = [];
  s.bus.on('abandon:man_out', (e) => out.push(e));

  s.tiger.fire.ignite({ compartment: 'engine_compartment', intensity: 0.6, fuelFed: true, source: 'fuel_l' });
  const r = s.abandonment.order(s.tiger, s.commander);
  assert.equal(r.ok, true);
  assert.equal(s.tiger.abandoned, true);

  // Nobody is out instantly.
  s.step(0.5);
  assert.equal(out.length, 0, 'nobody gets out of a Tiger in half a second');

  s.step(45);
  assert.ok(out.length >= 3, `most of the crew should be out, got ${out.length}`);
  const summary = s.abandonment.summary(s.tiger);
  assert.equal(summary.crew.length, 5, 'all five men are accounted for');
  assert.ok(summary.evacuationSeconds > 3, 'evacuation takes meaningful time');
});

test('recovery is a request, a wait, and men outside with a cable', () => {
  const s = scenario(9090);
  s.tiger.components.engine.destroyed = true;
  s.tiger.driveline.stop();

  const check = s.recovery.canBeTowed(s.tiger);
  assert.equal(check.ok, true, check.problems.join(' '));

  const op = s.tiger.crewManager.get('radio');
  const req = s.recovery.request(s.tiger, op);
  assert.equal(req.ok, true);
  assert.ok(req.etaSeconds > 60, `a recovery vehicle does not arrive in ${req.etaSeconds}s`);

  // It is not there yet.
  s.step(20);
  assert.notEqual(s.recovery.state, 'arrived');
});

test('a burning tank will not be approached by a recovery party', () => {
  const s = scenario(9091);
  s.tiger.components.engine.destroyed = true;
  s.tiger.fire.ignite({ compartment: 'engine_compartment', intensity: 0.8, fuelFed: true, source: 'fuel_l' });
  const check = s.recovery.canBeTowed(s.tiger);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => /burning/i.test(p)));
});

test('with both tracks gone the tank cannot be towed at all', () => {
  const s = scenario(9092);
  s.tiger.components.track_l.destroyed = true;
  s.tiger.components.track_r.destroyed = true;
  const check = s.recovery.canBeTowed(s.tiger);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => /track/i.test(p)));
});

test('the gun compensates for the hull’s own tilt', () => {
  // The gun elevates relative to the hull. On a slope, laying on a target means
  // cranking in the hull's lean as well as the superelevation — otherwise the
  // tank fires into the ground in front of it.
  const s = scenario(600600);
  const aim = { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z };

  for (const pitch of [-0.05, 0, 0.05]) {
    s.tiger.pitch = pitch;
    s.tiger.roll = 0;
    s.tiger.turretAz = 0;
    s.tiger.turretTargetAz = 0;
    s.tiger.gunElev = 0;
    for (let i = 0; i < 900; i++) s.tiger.layOn(aim, 1 / 60);
    const m = s.tiger.muzzle();
    // Whatever the hull is doing, the barrel must end up pointing at the target
    // in WORLD space, with a little superelevation on top.
    const dist = Math.hypot(aim.x - m.pos.x, aim.z - m.pos.z);
    const losY = (aim.y - m.pos.y) / dist;
    assert.ok(m.dir.y > losY - 0.001 && m.dir.y < losY + 0.012,
      `at hull pitch ${(pitch * 180 / Math.PI).toFixed(1)}° the barrel points ${m.dir.y.toFixed(5)}, `
      + `line of sight is ${losY.toFixed(5)} — it must be just above it`);
  }
});

test('a target that drives out of the beaten zone is a target the gunner loses', () => {
  // The commander points at where the tank IS. If it has gone by the time the
  // gunner gets his sight onto that patch of ground, there is nothing there and
  // he says so — which is exactly what should happen.
  const s = scenario(818181, 900);
  const said = [];
  s.bus.on('crew:speak', (e) => said.push(e.event));

  s.tiger.beginReload('pzgr39');
  s.step(12);
  const stalePoint = { x: s.t34.pos.x, y: s.t34.pos.y + 1.2, z: s.t34.pos.z };
  // Move the target a long way before the gunner can find it.
  s.t34.pos.x += 600;
  s.commands.issue(CMD.TARGET_MY_LAY, { pos: stalePoint }, s.commander);
  s.commands.issue(CMD.ENGAGE, null, s.commander);
  s.step(30);

  assert.ok(said.includes('gunner.no_target'),
    `the gunner should report nothing there; he said: ${[...new Set(said)].join(', ')}`);
});

test('a repair party under enemy observation gets shot at', () => {
  // This is the whole reason field repair is a decision. Men kneeling beside a
  // track in the open, in sight of a tank 400 m away, are in real danger.
  const s = scenario(31415, 400);
  s.tiger.components.track_l.destroyed = true;
  const r = s.repair.begin(s.tiger, 'track_l', ['driver', 'loader', 'radio']);
  assert.equal(r.ok, true, r.reason);

  const before = s.repair.job.crewmen.map((m) => ({ m, health: m.health, stress: m.stress }));
  s.step(240);

  const hurtOrFrightened = before.some(({ m, health, stress }) =>
    m.health < health - 0.001 || m.stress > stress + 0.05);
  assert.ok(hurtOrFrightened,
    'men working in the open in front of an enemy tank should be hurt or badly frightened');
});
