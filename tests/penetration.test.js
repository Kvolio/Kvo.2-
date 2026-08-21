import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTILES } from '../src/data/ammunition.js';
import { ARMOUR } from '../src/data/tiger1h.js';
import { resolveImpact, OUTCOME, penetrationAtRange, explainImpact } from '../src/sim/Penetration.js';
import { velocityAt } from '../src/sim/Ballistics.js';
import { DEG } from '../src/core/MathUtil.js';

const plateById = (id) => ARMOUR.find((p) => p.id === id);

function shoot(projId, plateId, rangeM, obliquityDeg) {
  const proj = PROJECTILES[projId];
  const plate = plateById(plateId);
  return resolveImpact(proj, plate, velocityAt(proj, rangeM), obliquityDeg * DEG, rangeM);
}

test('published tables are reproduced within 3 percent', () => {
  for (const id of ['pzgr39', 'pzgr40', 'br350a', 'br365', 'br540']) {
    const p = PROJECTILES[id];
    for (const [range, pen30] of p.penTable) {
      // Reconstruct the table entry: a plate of `pen30` mm at 30 deg must be
      // right on the threshold.
      const fake = { thickness: pen30, quality: 1.0, label: 'table plate' };
      const r = resolveImpact(p, fake, velocityAt(p, range), 30 * DEG, range);
      const ratio = r.penetration / r.effective;
      assert.ok(Math.abs(ratio - 1) < 0.03,
        `${id} @${range}m: ratio ${ratio.toFixed(3)} should be ~1.0`);
    }
  }
});

test('KUBINKA 1943: T-34 BR-350A cannot defeat the Tiger 80 mm side at 200 m', () => {
  const r = shoot('br350a', 'hull_side_upper_l', 200, 0);
  assert.equal(r.outcome, OUTCOME.NON_PENETRATION, explainImpact(r));
});

test('T-34 BR-350A cannot defeat the Tiger front plate at ANY range', () => {
  for (const range of [50, 100, 200, 400, 800, 1500]) {
    const r = shoot('br350a', 'hull_front_upper', range, 9);
    assert.notEqual(r.outcome, OUTCOME.PENETRATION,
      `BR-350A penetrated the driver's plate at ${range} m — ${explainImpact(r)}`);
  }
});

test('T-34 BR-350A cannot defeat the Tiger turret front at any range', () => {
  for (const range of [50, 200, 600, 1200]) {
    const r = shoot('br350a', 'turret_front', range, 0);
    assert.notEqual(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
  }
});

test('KUBINKA 1943: 85 mm BR-365 DOES defeat the Tiger front plate at 1000 m', () => {
  const r = shoot('br365', 'hull_front_upper', 1000, 9);
  assert.equal(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
});

test('152 mm BR-540 defeats the Tiger front — the player is not protected by fiat', () => {
  const r = shoot('br540', 'hull_front_upper', 800, 9);
  assert.ok([OUTCOME.PENETRATION, OUTCOME.OVERMATCH].includes(r.outcome), explainImpact(r));
});

test('76 mm APCR BR-350P defeats the 80 mm Tiger side at close range', () => {
  const r = shoot('br350p', 'hull_side_upper_l', 200, 0);
  assert.equal(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
});

test('45 mm BR-240 is useless against every part of the Tiger except optics', () => {
  for (const id of ['hull_front_upper', 'hull_side_upper_l', 'turret_front', 'turret_side_l', 'hull_rear']) {
    const r = shoot('br240', id, 100, 0);
    assert.notEqual(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
  }
});

test('Tiger PzGr 39 defeats the T-34 glacis (45 mm at 60 deg) out to 2000 m', () => {
  const t34glacis = { thickness: 45, quality: 1.0, label: 'T-34 glacis' };
  for (const range of [100, 1000, 2000]) {
    const r = resolveImpact(PROJECTILES.pzgr39, t34glacis, velocityAt(PROJECTILES.pzgr39, range), 60 * DEG, range);
    assert.equal(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
  }
});

test('extreme obliquity produces a ricochet, not a penetration', () => {
  const r = shoot('pzgr39', 'hull_side_upper_l', 300, 80);
  assert.equal(r.outcome, OUTCOME.RICOCHET, explainImpact(r));
});

test('the glacis is thin but its 80 degree slope protects it', () => {
  // 60 mm glacis struck by a flat-trajectory 76 mm shell at ~78 deg obliquity
  const r = shoot('br350b', 'hull_glacis', 300, 78);
  assert.notEqual(r.outcome, OUTCOME.PENETRATION, explainImpact(r));
});

test('the solver is deterministic — same conditions, same answer, every time', () => {
  const a = shoot('br365', 'hull_front_upper', 1000, 9);
  for (let i = 0; i < 200; i++) {
    const b = shoot('br365', 'hull_front_upper', 1000, 9);
    assert.equal(b.outcome, a.outcome);
    assert.equal(b.penetration, a.penetration);
    assert.equal(b.effective, a.effective);
  }
});

test('HE cannot penetrate armour no matter how big it is', () => {
  const r = shoot('of540', 'turret_roof', 300, 0);
  assert.equal(r.outcome, OUTCOME.NO_EFFECT, explainImpact(r));
});

test('penetration falls off with range for every kinetic round', () => {
  for (const id of ['pzgr39', 'pzgr40', 'br350a', 'br365']) {
    const near = penetrationAtRange(PROJECTILES[id], 100);
    const far = penetrationAtRange(PROJECTILES[id], 2000);
    assert.ok(far < near * 0.95, `${id} did not lose penetration with range`);
  }
});

test('HEAT penetration does NOT fall off with range', () => {
  assert.equal(penetrationAtRange(PROJECTILES.gr39hl, 100), penetrationAtRange(PROJECTILES.gr39hl, 2000));
});
