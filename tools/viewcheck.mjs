import { chromium } from 'playwright';
const shots = '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1100, height: 660 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1800);
await p.evaluate(() => window.__tiger.newCampaign('normal'));
await p.waitForTimeout(2200);
await p.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
await p.waitForTimeout(1800);
await p.evaluate(() => window.__tiger.beginMission());
await p.waitForTimeout(3200);

// Freeze the camera update and place the camera manually, three-quarter front.
await p.evaluate(() => {
  const g = window.__tiger;
  g.hud.setVisible(false);
  g._updateCamera = () => { g.interiorModel.visible = false; };
  const t = g.tiger;
  const cam = g.renderer.camera;
  cam.fov = 45; cam.updateProjectionMatrix();
  cam.position.set(t.pos.x + 9, t.pos.y + 4.2, t.pos.z + 11);
  cam.lookAt(t.pos.x, t.pos.y + 1.4, t.pos.z);
});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${shots}/view-tiger-front.png` });

await p.evaluate(() => {
  const g = window.__tiger, t = g.tiger, cam = g.renderer.camera;
  cam.position.set(t.pos.x - 10, t.pos.y + 4.5, t.pos.z - 10);
  cam.lookAt(t.pos.x, t.pos.y + 1.4, t.pos.z);
});
await p.waitForTimeout(1200);
await p.screenshot({ path: `${shots}/view-tiger-rear.png` });

// The interior, from the commander's seat looking at the breech.
await p.evaluate(() => {
  const g = window.__tiger, t = g.tiger, cam = g.renderer.camera;
  g._updateCamera = () => { g.interiorModel.visible = true; };
  g.interiorModel.visible = true;
  const s = t.spec.STATIONS.commander;
  cam.fov = 70; cam.updateProjectionMatrix();
  cam.position.set(t.pos.x + s.eyeButtonedUp[0], t.pos.y + s.eyeButtonedUp[1] - 0.35, t.pos.z + s.eyeButtonedUp[2]);
  cam.lookAt(t.pos.x, t.pos.y + 2.05, t.pos.z + 1.2);
  const drum = g.interiorModel.userData.cupolaDrum; if (drum) drum.visible = false;
});
await p.waitForTimeout(1400);
await p.screenshot({ path: `${shots}/view-interior.png` });
await b.close();
