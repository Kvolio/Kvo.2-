import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { buildTiger, measureTiger, updateTiger } from '../src/render/TigerModel.js';
import { TIGER_1H, L, STATIONS } from '../src/data/tiger1h.js';

test('the Tiger model matches the researched dimensions', () => {
  const t = buildTiger({ lod: 0 });
  const m = measureTiger(THREE, t);

  assert.ok(Math.abs(m.widthOverTracks - 3.705) < 0.02,
    `width over tracks ${m.widthOverTracks.toFixed(3)} m should be 3.705 m`);
  assert.ok(Math.abs(m.lengthGunForward - 8.45) < 0.12,
    `length gun forward ${m.lengthGunForward.toFixed(3)} m should be 8.45 m`);
  assert.ok(Math.abs(m.heightToCupola - 3.00) < 0.06,
    `height to cupola ${m.heightToCupola.toFixed(3)} m should be 3.00 m`);
  assert.ok(Math.abs(m.lowestPoint) < 0.02,
    `the tracks should rest on the ground, lowest point is ${m.lowestPoint.toFixed(3)} m`);
});

test('the muzzle is exactly where the data file says it is', () => {
  const t = buildTiger({ lod: 0 });
  const m = measureTiger(THREE, t);
  assert.ok(Math.abs(m.muzzleZ - L.muzzleZ) < 0.02,
    `muzzle at ${m.muzzleZ.toFixed(3)} should be at L.muzzleZ = ${L.muzzleZ}`);
});

test('lower levels of detail keep the tank the right shape', () => {
  const base = measureTiger(THREE, buildTiger({ lod: 0 }));
  for (const lod of [1, 2]) {
    const m = measureTiger(THREE, buildTiger({ lod }));
    assert.ok(Math.abs(m.widthOverTracks - base.widthOverTracks) < 0.05,
      `LOD${lod} width drifted`);
    assert.ok(Math.abs(m.lengthGunForward - base.lengthGunForward) < 0.1,
      `LOD${lod} length drifted`);
    assert.ok(Math.abs(m.heightToCupola - base.heightToCupola) < 0.05,
      `LOD${lod} height drifted`);
  }
});

test('level of detail actually reduces geometry', () => {
  const count = (lod) => {
    let tris = 0;
    buildTiger({ lod }).traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      const c = o.isInstancedMesh ? o.count : 1;
      tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * c;
    });
    return tris;
  };
  const l0 = count(0), l1 = count(1), l2 = count(2);
  assert.ok(l1 < l0 * 0.75, `LOD1 (${l1}) should be well under LOD0 (${l0})`);
  assert.ok(l2 < l1 * 0.6, `LOD2 (${l2}) should be well under LOD1 (${l1})`);
});

test('the model carries the Ausf. H configuration lock, not a late-war Tiger', () => {
  const t = buildTiger({ lod: 0 });
  // The early drum cupola is a named group with a flip-up hatch pivot.
  assert.ok(t.userData.cupola, 'the cupola must be a addressable group');
  assert.ok(t.userData.cupolaHatch, 'the early cupola hatch flips up on a rear hinge');
  // Feifel air cleaners are fitted by default and removable, as in the field.
  const hasFeifel = !!t.getObjectByName('feifel');
  assert.equal(hasFeifel, true, 'a mid-1943 Tiger carries the Feifel system');
  const stripped = buildTiger({ lod: 0, feifel: false });
  assert.equal(!!stripped.getObjectByName('feifel'), false, 'crews stripped them off, so it must be removable');
});

test('turret, gun and hatches are animated from vehicle state', () => {
  const t = buildTiger({ lod: 0 });
  const fake = {
    turretAz: 0.8, gunElev: 0.12, recoil: 0,
    hatchOpen: { cupola_hatch: true, loader_hatch: false, driver_hatch: false, radio_hatch: false },
    driveline: { trackSpeedL: 2, trackSpeedR: 2, speed: 2 },
    components: {},
  };
  for (let i = 0; i < 60; i++) updateTiger(t, fake, 1 / 60);
  // Checked in WORLD space, not as a local rotation value. The model root is
  // mirrored to make the vehicle frame right-handed, and a mirror reverses
  // rotations about Y — so the local number is -0.8 while the turret is
  // correctly pointing at +0.8. Asserting the local value would have been an
  // assertion about the implementation rather than about where the gun points.
  t.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(t.userData.turret.matrixWorld);
  assert.ok(Math.abs(Math.atan2(fwd.x, fwd.z) - 0.8) < 1e-6, 'turret points along the azimuth');
  assert.ok(Math.abs(t.userData.gun.rotation.x + 0.12) < 1e-6, 'gun follows elevation');
  assert.ok(t.userData.cupolaHatch.rotation.x < -1.0, 'the cupola hatch opened');
});

test('a broken track visibly stops and sags instead of scrolling', () => {
  const t = buildTiger({ lod: 0 });
  const fake = {
    turretAz: 0, gunElev: 0, recoil: 0, hatchOpen: {},
    driveline: { trackSpeedL: 3, trackSpeedR: 3, speed: 3 },
    components: { track_l: { destroyed: true } },
  };
  updateTiger(t, fake, 1 / 60);
  assert.equal(t.userData.tracks.left.userData.brokenApplied, true);
  assert.notEqual(t.userData.tracks.right.userData.brokenApplied, true);
});

test('the vehicle frame is right-handed, so the crew are not sitting in each other\'s seats', () => {
  // With forward along +Z and up along +Y, a right-handed frame puts the crew's
  // RIGHT at -X. Authored the other way the whole tank renders mirrored: the
  // bow machine gun ends up on the driver's side and the cupola on the loader's.
  // This test exists because that is exactly what happened, and it survived
  // every other check in this suite.
  assert.ok(STATIONS.radio.seat[0] < 0, 'the radio operator sits on the crew RIGHT, which is -X');
  assert.ok(STATIONS.loader.seat[0] < 0, 'the loader works on the crew RIGHT');
  assert.ok(STATIONS.driver.seat[0] > 0, 'the driver sits on the crew LEFT, which is +X');
  assert.ok(STATIONS.gunner.seat[0] > 0, 'the gunner sits on the crew LEFT');

  // And the model must agree with the data, or a penetration that kills the
  // loader will be drawn going through the gunner.
  const t = buildTiger({ lod: 0 });
  t.updateMatrixWorld(true);
  const cupola = new THREE.Vector3().setFromMatrixPosition(t.userData.cupola.matrixWorld);
  assert.ok(cupola.x > 0, 'the cupola is on the commander\'s side, +X');
  assert.equal(Math.sign(cupola.x), Math.sign(STATIONS.commander.seat[0]),
    'model and data must put the commander on the same side of the tank');
});

test('each side carries the twenty-four road wheels a rubber-tyred Tiger has', () => {
  const t = buildTiger({ lod: 0 });
  for (const side of ['left', 'right']) {
    const n = t.userData.gear[side].userData.wheels.length;
    assert.equal(n, 24, `${side} side has ${n} road wheels, and a Tiger I has 24 per side`);
  }
});
