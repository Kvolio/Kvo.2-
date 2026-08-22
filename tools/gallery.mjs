// ===========================================================================
//  GALLERY — the capture step of the gauntlet loop
//
//  Renders a fixed set of inspection shots at full quality so a critic with no
//  knowledge of the code can judge the result. The set is deliberately
//  unflattering: close walk-around angles that expose primitive geometry, the
//  running gear from below, the interior from the seat the player actually
//  uses, and a battlefield wide shot that shows whether the world has depth.
//
//    node tools/gallery.mjs [--quality ultra] [--only tiger] [--out DIR]
//
//  SwiftShader is a software rasteriser, so this is slow — a minute or two for
//  the full set. That is fine: it runs once per gauntlet round, not per frame.
// ===========================================================================

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const QUALITY = argOf('quality', 'high');
const ONLY = argOf('only', null);
const OUT = argOf('out', '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad/gallery');
const W = Number(argOf('width', 1400));
const H = Number(argOf('height', 900));

await mkdir(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript((q) => {
  try { localStorage.setItem('tiger101.quality', q); } catch { /* private mode */ }
}, QUALITY);

console.log(`gallery: ${QUALITY} preset, ${W}x${H} -> ${OUT}`);
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });

// Wait for the texture warm-up to finish rather than guessing at a delay.
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none',
  { timeout: 180000 });
await page.waitForTimeout(1200);

await page.evaluate(() => window.__tiger.newCampaign('normal'));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__tiger.beginMission());
await page.waitForTimeout(4000);

// Take the camera under manual control so the shots are reproducible.
await page.evaluate(() => {
  const g = window.__tiger;
  g.hud.setVisible(false);
  g.touch.setVisible(false);
  g._galleryHold = null;
  g._updateCamera = function () {
    const hold = this._galleryHold;
    if (!hold) return;
    if (this.interiorModel) this.interiorModel.visible = !!hold.interior;
    const drum = this.interiorModel?.userData.cupolaDrum;
    if (drum) drum.visible = hold.interior && !hold.hideDrum;
    if (this.commanderBody) this.commanderBody.visible = !!hold.commanderBody;
    const cam = this.renderer.camera;
    cam.fov = hold.fov ?? 45;
    cam.updateProjectionMatrix();
    cam.position.set(hold.pos[0], hold.pos[1], hold.pos[2]);
    cam.lookAt(hold.at[0], hold.at[1], hold.at[2]);
    this.renderer.setInteriorLighting(!!hold.interior, cam.position, true);
  };
});

/**
 * @param {string} name   file name, and the label the critic sees
 * @param {object} shot   { pos, at, fov, interior, relative, setup }
 */
async function capture(name, shot) {
  // --only takes a comma-separated list of substrings, so a round can re-shoot
  // just the views a critic complained about.
  if (ONLY && !ONLY.split(',').some((f) => name.includes(f.trim()))) return;
  await page.evaluate((s) => {
    const g = window.__tiger;
    if (s.setup) new Function('g', s.setup)(g);
    const t = g.tiger;
    const rel = s.relative !== false;
    const base = rel ? [t.pos.x, t.pos.y, t.pos.z] : [0, 0, 0];
    g._galleryHold = {
      pos: [base[0] + s.pos[0], base[1] + s.pos[1], base[2] + s.pos[2]],
      at: [base[0] + s.at[0], base[1] + s.at[1], base[2] + s.at[2]],
      fov: s.fov, interior: s.interior, hideDrum: s.hideDrum,
      commanderBody: s.commanderBody,
    };
  }, shot);
  await page.waitForTimeout(shot.settle ?? 1400);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
  console.log(`  ${name}`);
}

// ---------------------------------------------------------------- the Tiger
const TIGER = [
  ['tiger-01-three-quarter-front', { pos: [7.5, 3.0, 10], at: [0, 1.5, 0], fov: 40 }],
  ['tiger-02-three-quarter-rear', { pos: [-8, 3.2, -9.5], at: [0, 1.5, 0], fov: 40 }],
  ['tiger-03-side-on', { pos: [12, 2.2, 0], at: [0, 1.5, 0], fov: 38 }],
  ['tiger-04-head-on', { pos: [0, 2.0, 12], at: [0, 1.6, 0], fov: 36 }],
  ['tiger-05-running-gear', { pos: [4.2, 0.9, 1.5], at: [1.6, 0.6, 0], fov: 42 }],
  ['tiger-06-sprocket', { pos: [4.0, 1.1, 3.4], at: [1.5, 0.85, 2.7], fov: 34 }],
  ['tiger-07-mantlet-and-gun', { pos: [2.4, 2.6, 4.6], at: [0.2, 2.1, 1.6], fov: 40 }],
  ['tiger-08-cupola', { pos: [-1.9, 3.8, 1.6], at: [-0.46, 2.9, 0.45], fov: 38 }],
  ['tiger-09-engine-deck', { pos: [2.6, 4.2, -3.6], at: [0, 1.8, -2.2], fov: 45 }],
  ['tiger-10-glacis-detail', { pos: [1.6, 2.6, 5.2], at: [0, 1.6, 2.9], fov: 38 }],
  ['tiger-11-rear-plate', { pos: [0.6, 2.0, -7.0], at: [0, 1.4, -3.2], fov: 40 }],
  ['tiger-12-walkaround-3m', { pos: [3.0, 1.7, 4.0], at: [0, 1.4, 0], fov: 55 }],
];

// ---------------------------------------------------------------- interior
const INTERIOR = [
  ['interior-01-commander-forward', {
    pos: [-0.46, 2.35, 0.1], at: [0, 2.1, 3.0], fov: 70, interior: true, hideDrum: true }],
  ['interior-02-breech', {
    pos: [-0.30, 2.25, -0.35], at: [0.1, 2.05, 1.0], fov: 65, interior: true, hideDrum: true }],
  ['interior-03-gunner-station', {
    pos: [0.35, 2.25, 0.2], at: [-0.36, 2.10, 0.95], fov: 60, interior: true, hideDrum: true }],
  ['interior-04-loader-side', {
    pos: [-0.5, 2.2, 0.3], at: [1.0, 1.95, 0.8], fov: 65, interior: true, hideDrum: true }],
  ['interior-05-hull-stations', {
    pos: [0, 1.9, 0.6], at: [0, 1.35, 2.9], fov: 72, interior: true, hideDrum: true }],
  ['interior-06-cupola-from-below', {
    pos: [-0.46, 2.05, 0.12], at: [-0.46, 3.0, 0.12], fov: 70, interior: true, hideDrum: true }],
];

// ---------------------------------------------------------------- world
const WORLD = [
  ['world-01-battlefield-wide', { pos: [0, 14, -40], at: [0, 2, 400], fov: 55 }],
  ['world-02-ground-close', { pos: [0, 1.2, 14], at: [0, 0.2, 26], fov: 60 }],
  ['world-03-mid-distance', { pos: [0, 5, -25], at: [0, 1, 250], fov: 45 }],
  ['world-04-horizon', { pos: [0, 3.2, 0], at: [0, 3.0, 900], fov: 50 }],
];

for (const [name, shot] of TIGER) await capture(name, shot);
for (const [name, shot] of INTERIOR) await capture(name, shot);
for (const [name, shot] of WORLD) await capture(name, shot);

// ---------------------------------------------------------------- in-game views
// These go through the real camera code, so they show what the player sees.
if (!ONLY || ONLY === 'views') {
  await page.evaluate(() => {
    const g = window.__tiger;
    g._galleryHold = null;
    delete g._updateCamera;               // fall back to the prototype method
    g.hud.setVisible(true);
  });
  const views = [
    ['view-01-buttoned-up', 'vision_blocks'],
    ['view-02-hatch-open', 'hatch_open'],
    ['view-03-head-out', 'head_out'],
    ['view-04-binoculars', 'binoculars'],
    ['view-05-gunner-sight', 'gunner_sight'],
  ];
  for (const [name, view] of views) {
    await page.evaluate((v) => {
      const g = window.__tiger;
      if (v !== 'vision_blocks') { g.tiger.hatchOpen.cupola_hatch = true; }
      g.setView(v);
    }, view);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`  ${name}`);
  }
}

const stats = await page.evaluate(() => ({
  ...window.__tiger.renderer.stats(),
  fps: Math.round(window.__tiger.loop.fps),
}));

await browser.close();
console.log('\nstats:', JSON.stringify(stats));
console.log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  x', e);
