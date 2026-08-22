// ===========================================================================
//  ORTHO — dimensional and silhouette verification
//
//  Renders the Tiger in true orthographic projection from front, rear, left,
//  right and top at one declared scale, shaded and as a silhouette, and writes
//  the measurements taken from the geometry alongside them.
//
//    node tools/ortho.mjs [--out DIR] [--only left,top] [--no-silhouette]
//
//  The renders are for the proportion and silhouette critics and for overlaying
//  on the technical drawing. `measurements.json` is the objective half: it is
//  compared against the dimensional dossier in docs/TIGER-CONFIGURATION.md, and
//  a discrepancy there is a number, not an opinion.
// ===========================================================================

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = argOf('out', 'docs/reference/ortho');
const ONLY = argOf('only', null);
const SILHOUETTE = !args.includes('--no-silhouette');

await mkdir(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 2000, height: 2000 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:8080/tools/ortho.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ortho?.ready === true, { timeout: 180000 });

const views = await page.evaluate(() => window.__ortho.views);
const wanted = ONLY ? ONLY.split(',').map((s) => s.trim()) : views;

const meta = { metresPerPixel: await page.evaluate(() => window.__ortho.metresPerPixel), views: {} };

for (const v of wanted) {
  if (!views.includes(v)) { console.log(`  ? unknown view ${v}`); continue; }
  const info = await page.evaluate((n) => window.__ortho.renderView(n), v);
  await page.locator('#gl').screenshot({ path: `${OUT}/ortho-${v}.png`, timeout: 180000 });
  meta.views[v] = info;
  console.log(`  ortho-${v}  ${info.width}x${info.height}px  ${info.worldWidth}x${info.worldHeight} m` +
    `  screenRight=${info.screenRight}  screenUp=${info.screenUp}`);

  if (SILHOUETTE) {
    await page.evaluate(() => window.__ortho.setSilhouette(true));
    await page.evaluate((n) => window.__ortho.renderView(n), v);
    await page.locator('#gl').screenshot({ path: `${OUT}/silhouette-${v}.png`, timeout: 180000 });
    await page.evaluate(() => window.__ortho.setSilhouette(false));
    console.log(`  silhouette-${v}`);
  }
}

const m = await page.evaluate(() => window.__ortho.measure());
await writeFile(`${OUT}/measurements.json`, JSON.stringify({ ...meta, measurements: m }, null, 2));

await browser.close();

// ---- the dimensional check, printed so it cannot be skipped ---------------
// Targets come from docs/TIGER-CONFIGURATION.md section 4.
const TARGETS = [
  // The published 8.45 m is muzzle to REAR ARMOUR PLATE. The Feifel cylinders
  // hang off the back of that plate and are not in the figure, so they are not
  // in this measurement either — but they are reported, because a critic
  // looking at a side view will measure the whole silhouette.
  ['length, muzzle to rear plate', m.lengthGunForward, 8.45, 0.01],
  ['width over tracks', m.widthOverTracks, 3.705, 0.01],
  ['height to cupola top', m.heightToCupola, 3.00, 0.01],
];
console.log('\ndimensional check (tolerance ±1%):');
let fails = 0;
for (const [label, got, want, tol] of TARGETS) {
  const off = got == null ? Infinity : Math.abs(got - want) / want;
  const ok = off <= tol;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ${String(got).padEnd(8)} target ${want}` +
    (ok ? '' : `   off by ${(off * 100).toFixed(2)}%`));
}
console.log(`\noverall length including Feifel gear: ${m.lengthWithGun} m`);
console.log(`triangles: ${m.triangles}   meshes: ${m.meshes}`);
console.log(`road wheels found on the right side: ${m.roadWheels.length}`);
console.log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  x', e);
if (fails) process.exitCode = 1;
