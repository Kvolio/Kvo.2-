// Decisive test: is the directional light doing anything at all?
import { chromium } from 'playwright';
const shots = '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.addInitScript(() => { try { localStorage.setItem('tiger101.quality','high'); } catch {} });
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
    cam.fov = 42; cam.updateProjectionMatrix();
    cam.position.set(t.pos.x - 11, t.pos.y + 6.0, t.pos.z + 12);   // opposite the sun
    cam.lookAt(t.pos.x, t.pos.y + 1.0, t.pos.z);
  };
});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${shots}/probe-s1-normal.png` });

// Everything off except the sun, and the sun put high overhead so the shadow
// falls beside the tank where it cannot hide behind it.
console.log(JSON.stringify(await p.evaluate(() => {
  const r = window.__tiger.renderer;
  r.hemi.intensity = 0; r.ambient.intensity = 0;
  r.scene.environment = null; r.scene.environmentIntensity = 0;
  r.sun.intensity = 4;
  r.sunDirection.set(0.45, 0.80, 0.40).normalize();
  return { sunPos: r.sun.position.toArray().map(v=>+v.toFixed(1)),
    shadowEnabled: r.renderer.shadowMap.enabled, castShadow: r.sun.castShadow,
    autoUpdate: r.renderer.shadowMap.autoUpdate };
})));
await p.waitForTimeout(1600);
await p.screenshot({ path: `${shots}/probe-s2-sun-only-high.png` });

// And with the shadow map explicitly off, for comparison.
await p.evaluate(() => { window.__tiger.renderer.renderer.shadowMap.enabled = false;
  window.__tiger.renderer.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); });
await p.waitForTimeout(1600);
await p.screenshot({ path: `${shots}/probe-s3-no-shadowmap.png` });
await b.close();
console.log('done');
