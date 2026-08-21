// Diagnostic probe: isolate which post-processing stage changes the image, by
// rebuilding the chain one stage at a time and measuring the same pixels.
import { chromium } from 'playwright';

const shots = '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.addInitScript(() => { try { localStorage.setItem('tiger101.quality', 'high'); } catch {} });
await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', { timeout: 180000 });
await p.evaluate(() => window.__tiger.newCampaign('normal'));
await p.waitForTimeout(2200);
await p.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
await p.waitForTimeout(1800);
await p.evaluate(() => window.__tiger.beginMission());
await p.waitForTimeout(3500);

await p.evaluate(() => {
  const g = window.__tiger;
  g.hud.setVisible(false);
  g._updateCamera = function () {
    const t = this.tiger, cam = this.renderer.camera;
    if (this.interiorModel) this.interiorModel.visible = false;
    cam.fov = 40; cam.updateProjectionMatrix();
    cam.position.set(t.pos.x + 7.5, t.pos.y + 3.0, t.pos.z + 10);
    cam.lookAt(t.pos.x, t.pos.y + 1.5, t.pos.z);
  };
});

async function variant(label, setup) {
  await p.evaluate(setup);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${shots}/probe-${label}.png` });
  console.log(`captured ${label}`);
}

// Baseline: no composer at all, straight to the canvas.
await variant('1-direct', () => { window.__tiger.renderer.post.enabled = false; });

// RenderPass -> OutputPass only. If this differs from direct, the composer
// pipeline itself is changing the image.
await variant('2-output-only', () => {
  const g = window.__tiger.renderer;
  g.post.enabled = true;
  g.post.build({ ao: false, bloom: false, smaa: false });
  g.post.setCamera(g.camera);
});

// Add SMAA.
await variant('3-output-smaa', () => {
  const g = window.__tiger.renderer;
  g.post.build({ ao: false, bloom: false, smaa: true });
  g.post.setCamera(g.camera);
});

// Add AO.
await variant('4-ao-output', () => {
  const g = window.__tiger.renderer;
  g.post.build({ ao: true, bloom: false, smaa: false });
  g.post.setCamera(g.camera);
});

// Everything.
await variant('5-full', () => {
  const g = window.__tiger.renderer;
  g.post.build({ ao: true, bloom: true, smaa: true });
  g.post.setCamera(g.camera);
});

await b.close();
console.log('done');
