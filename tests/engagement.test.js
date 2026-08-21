import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/world/Terrain.js';
import { World } from '../src/sim/World.js';
import { Vehicle } from '../src/sim/Vehicle.js';
import { EnemyAI, AI_STATE } from '../src/ai/EnemyAI.js';
import { CrewManager, generateCrewman } from '../src/sim/CrewSim.js';
import { TIGER_1H } from '../src/data/tiger1h.js';
import { T34_1943, K52_AA } from '../src/data/vehicles.js';
import { EventBus } from '../src/core/EventBus.js';
import { Rng } from '../src/core/Rng.js';

function buildTiger(world, bus, rng, pos) {
  const t = new Vehicle(TIGER_1H, { bus, rng, terrain: world.terrain, isPlayer: true, faction: 'german', callsign: 'Tiger 101' });
  t.pos = { ...pos, y: world.terrain.heightAt(pos.x, pos.z) };
  t.crew = ['gunner', 'loader', 'driver', 'radio'].map((r) => generateCrewman(r, rng, 'seasoned'));
  t.crew.push(generateCrewman('commander', rng, 'veteran'));
  t.crewManager = new CrewManager(t.crew, bus, rng, TIGER_1H);
  t.driveline.start();
  for (let i = 0; i < 200; i++) t.driveline.update(1 / 60, { engineOk: true, fuelAvailable: true, trackLOk: true, trackROk: true, finalDriveLOk: true, finalDriveROk: true, driverSkill: 0.6, terrainResistance: 0.3 });
  return world.addVehicle(t);
}

function buildT34(world, bus, rng, pos, heading = Math.PI) {
  const v = new Vehicle(T34_1943, { bus, rng, terrain: world.terrain, faction: 'soviet', callsign: 'T-34' });
  v.pos = { ...pos, y: world.terrain.heightAt(pos.x, pos.z) };
  v.heading = heading;
  v.crew = ['gunner', 'loader', 'driver', 'radio'].map((r) => generateCrewman(r, rng, 'trained'));
  v.crewManager = new CrewManager(v.crew, bus, rng, T34_1943);
  const ai = new EnemyAI(v, world, { skill: 0.5, aggression: 0.6, initialState: AI_STATE.ENGAGE });
  world.addVehicle(v, ai);
  return { v, ai };
}

function makeWorld(seed = 1234) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  const terrain = new Terrain({ seed, size: 3000, amplitude: 8 });
  const world = new World({ terrain, bus, rng, difficulty: {}, env: { lightFactor: 1, visibilityFactor: 1 } });
  return { world, bus, rng, terrain };
}

test('a Tiger and a T-34 can be created and stepped without error', () => {
  const { world, bus, rng } = makeWorld();
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  buildT34(world, bus, rng, { x: 0, z: 800 });
  for (let i = 0; i < 600; i++) world.update(1 / 60);
  assert.ok(world.time > 9);
  assert.equal(tiger.ammoRemaining, 92);
});

test('the Tiger carries exactly 92 rounds and consumes them one at a time', () => {
  const { world, bus, rng } = makeWorld();
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  assert.equal(tiger.ammoRemaining, 92);
  tiger.beginReload('pzgr39');
  let guard = 0;
  while (!tiger.loadedRound && guard++ < 3000) world.update(1 / 60);
  assert.equal(tiger.loadedRound, 'pzgr39');
  assert.equal(tiger.ammoRemaining, 91);
  tiger.fireMainGun(world);
  assert.equal(tiger.breechEmpty, true);
  assert.equal(tiger.shotsFired, 1);
});

test('a veteran loader is measurably faster than a green one', () => {
  const { world, bus, rng } = makeWorld();
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });

  const green = generateCrewman('loader', new Rng(1), 'green');
  green.skill.reloadSpeed = 0.05; green.experience = 0.05;
  tiger.crew[1] = green;
  tiger.crewManager = new CrewManager(tiger.crew, bus, rng, TIGER_1H);
  const greenTime = tiger.beginReload('pzgr39').seconds;
  tiger.reloading = false;

  const vet = generateCrewman('loader', new Rng(2), 'veteran');
  vet.skill.reloadSpeed = 0.95; vet.experience = 0.95; vet.stress = 0; vet.fatigue = 0;
  tiger.crew[1] = vet;
  tiger.crewManager = new CrewManager(tiger.crew, bus, rng, TIGER_1H);
  const vetTime = tiger.beginReload('pzgr39').seconds;

  assert.ok(vetTime < greenTime * 0.75,
    `veteran ${vetTime.toFixed(1)}s should be much faster than green ${greenTime.toFixed(1)}s`);
  assert.ok(vetTime > 4 && vetTime < 12, `veteran reload ${vetTime.toFixed(1)}s should be historically plausible`);
});

test('the T-34 AI recognises it cannot hurt the Tiger frontally and tries to flank', () => {
  const { world, bus, rng } = makeWorld(777);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.heading = 0;
  const { v: t34, ai } = buildT34(world, bus, rng, { x: 0, z: 700 }, Math.PI);

  // Give the AI perfect knowledge so we test the DECISION, not the spotting.
  ai.knownEnemies.set(tiger.id, { ref: tiger, pos: { ...tiger.pos }, lastSeen: 0, confidence: 1, type: 'tiger1h' });
  const shot = ai.evaluateShot(tiger);
  assert.equal(shot.willPenetrate, false, 'a T-34 must NOT be able to hole a Tiger frontally');

  const flank = ai.findFlankingPosition(tiger);
  assert.ok(flank, 'the AI should be able to find a position from which its gun works');
  // The flanking position must be off the Tiger's frontal arc.
  const ang = Math.abs(Math.atan2(flank.x - tiger.pos.x, flank.z - tiger.pos.z)) * 180 / Math.PI;
  assert.ok(ang > 45, `flank position should be off the front arc, got ${ang.toFixed(0)} degrees`);
});

test('the same T-34 CAN hurt the Tiger from the flank — the AI is not cheating either way', () => {
  const { world, bus, rng } = makeWorld(778);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.heading = 0;
  // Put the T-34 directly abeam at close range, where BR-350P will work.
  const { v: t34, ai } = buildT34(world, bus, rng, { x: 150, z: 0 }, -Math.PI / 2);
  const shot = ai.evaluateShot(tiger);
  assert.ok(shot.possible, 'the shot should at least be geometrically possible');
  assert.ok(shot.plate.includes('side') || shot.plate.includes('superstructure'),
    `expected a side plate, got ${shot.plate}`);
});

test('an 85 mm gun CAN kill the Tiger frontally — the player has no plot armour', () => {
  const { world, bus, rng } = makeWorld(779);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.heading = 0;
  const gun = new Vehicle(K52_AA, { bus, rng, terrain: world.terrain, faction: 'soviet', callsign: '85 mm' });
  gun.pos = { x: 0, z: 900, y: world.terrain.heightAt(0, 900) };
  gun.heading = Math.PI;
  gun.crew = ['gunner', 'loader'].map((r) => generateCrewman(r, rng, 'trained'));
  gun.crewManager = new CrewManager(gun.crew, bus, rng, K52_AA);
  const ai = new EnemyAI(gun, world, { skill: 0.7 });
  world.addVehicle(gun, ai);
  ai.knownEnemies.set(tiger.id, { ref: tiger, pos: { ...tiger.pos }, lastSeen: 0, confidence: 1, type: 'tiger1h' });

  const shot = ai.evaluateShot(tiger);
  assert.equal(shot.willPenetrate, true,
    `an 85 mm BR-365 must be able to defeat the Tiger front at 900 m. Got: ${shot.plate}`);
});

test('a penetrating hit breaks specific components rather than reducing a health bar', () => {
  const { world, bus, rng } = makeWorld(4242);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.heading = 0;
  assert.equal(tiger.assess().mobile, true);

  // Break the left track directly, the way a 45 mm round would.
  tiger.components.track_l.destroyed = true;
  tiger.components.track_r.destroyed = true;
  const a = tiger.assess();
  assert.equal(a.mobile, false);
  assert.ok(a.reasons.includes('both tracks broken'));
  // Crucially, it can still FIGHT. It is not "dead", it is immobilised.
  assert.equal(a.canFight, true);
  assert.equal(a.destroyed, false);
});

test('the Tiger becomes combat ineffective from real causes, never from zero HP', () => {
  const { world, bus, rng } = makeWorld(555);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.components.engine.destroyed = true;
  tiger.components.main_gun.destroyed = true;
  const a = tiger.assess();
  assert.equal(a.combatIneffective, true);
  assert.ok(a.reasons.includes('engine destroyed'));
  assert.ok(a.reasons.includes('main gun disabled'));
  assert.equal(tiger.hp, undefined, 'a Vehicle must not have an hp field');
  assert.equal(tiger.health, undefined, 'a Vehicle must not have a health field');
});

test('losing the gunner stops the Tiger fighting, and a replacement can cover him', () => {
  const { world, bus, rng } = makeWorld(556);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  const gunner = tiger.crew.find((m) => m.role === 'gunner');
  gunner.wound(1.0, 'spall');
  assert.equal(gunner.state, 'dead');
  assert.equal(tiger.assess().canFight, false);

  const res = tiger.crewManager.reassign('loader', 'gunner');
  assert.equal(res.ok, true);
  assert.ok(res.consequences.some((c) => /loading/i.test(c)),
    `expected a warning about loading, got: ${res.consequences.join(' ')}`);
  assert.equal(tiger.crewManager.get('gunner').role, 'loader');
});

test('fire is not a press-to-win button — the bottle runs out', () => {
  const { world, bus, rng } = makeWorld(999);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.fire.ignite({ compartment: 'engine_compartment', intensity: 0.5, fuelFed: true, source: 'fuel_l' });

  let discharges = 0;
  bus.on('fire:suppression_discharge', () => discharges++);
  for (let i = 0; i < 10; i++) {
    tiger.fire.autoDischargeTimer = 0;
    tiger.fire.suppressionActive = false;
    tiger.fire.commandSuppression(tiger);
  }
  assert.equal(discharges, 5, 'the Feuerlöschanlage holds agent for exactly five discharges');

  const res = tiger.fire.commandSuppression(tiger);
  assert.ok(res.some((r) => !r.ok && /empty/i.test(r.reason)));
});

test('the automatic system does nothing for a fighting-compartment fire', () => {
  const { world, bus, rng } = makeWorld(1001);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  tiger.fire.ignite({ compartment: 'fighting_compartment', intensity: 0.4, ammunition: true, source: 'sponson_l_fwd' });
  const res = tiger.fire.commandSuppression(tiger);
  assert.ok(res.some((r) => !r.ok && /does not reach/i.test(r.reason)),
    'the Feuerlöschanlage protects the engine compartment only');
});

test('a fed fire eventually reaches the ammunition and gives the commander a window', () => {
  const { world, bus, rng } = makeWorld(2024);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  let cookOffWindow = null;
  bus.on('fire:cooking_off', (e) => { cookOffWindow = e.seconds; });

  tiger.fire.ignite({ compartment: 'fighting_compartment', intensity: 0.7, ammunition: true, fuelFed: true, source: 'test' });
  for (let i = 0; i < 60 * 120 && cookOffWindow === null; i++) world.update(1 / 60);

  assert.ok(cookOffWindow !== null, 'an ammunition fire must reach cook-off');
  assert.ok(cookOffWindow > 8 && cookOffWindow < 40,
    `the window should be tight but survivable, got ${cookOffWindow?.toFixed(1)}s`);
});

test('the whole simulation is deterministic for a given seed', () => {
  function run(seed) {
    const { world, bus, rng } = makeWorld(seed);
    const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
    buildT34(world, bus, rng, { x: 120, z: 600 });
    buildT34(world, bus, rng, { x: -200, z: 750 });
    for (let i = 0; i < 60 * 40; i++) world.update(1 / 60);
    return world.vehicles.map((v) =>
      `${v.callsign}:${v.pos.x.toFixed(4)},${v.pos.z.toFixed(4)}:${v.shotsFired}:${v.ammoRemaining}`).join('|');
  }
  assert.equal(run(31337), run(31337));
});

test('men sent outside the tank are genuinely vulnerable', () => {
  const { world, bus, rng } = makeWorld(660);
  const tiger = buildTiger(world, bus, rng, { x: 0, z: 0 });
  buildT34(world, bus, rng, { x: 0, z: 250 });   // very close, line of sight open

  const loader = tiger.crew.find((m) => m.role === 'loader');
  world.addDismount(loader, { x: 2, y: tiger.pos.y, z: 0 }, 'repair');
  assert.equal(loader.outsideTank, true);

  const startHealth = loader.health;
  const startStress = loader.stress;
  for (let i = 0; i < 60 * 60; i++) world.update(1 / 60);
  assert.ok(loader.stress > startStress, 'a man standing in the open under observation should be frightened');
});
