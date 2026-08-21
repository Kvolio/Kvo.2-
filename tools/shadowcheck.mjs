import { chromium } from 'playwright';
const shots = '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE-ERR', m.text()); });
await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1800);
await p.evaluate(() => window.__tiger.newCampaign('normal'));
await p.waitForTimeout(2200);
await p.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
await p.waitForTimeout(1800);
await p.evaluate(() => window.__tiger.beginMission());
await p.waitForTimeout(3200);
await p.evaluate(() => { const g=window.__tiger; g.toggleHatch(); g.setView('head_out'); g.hud.setVisible(false); g.tigerGroup.visible=false; });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${shots}/dbg-1-normal.png` });

const r1 = await p.evaluate(() => {
  const g = window.__tiger;
  const t = g.sceneRoot.getObjectByName('terrain');
  const c = t.geometry.attributes.color;
  return {
    matBefore: t.material.type,
    firstColor: [c.getX(0), c.getY(0), c.getZ(0)],
    colorManagement: window.__THREE_CM__ === undefined ? 'unknown' : window.__THREE_CM__,
  };
});
console.log('before:', JSON.stringify(r1));

const r2 = await p.evaluate(async () => {
  const THREE = await import('/vendor/three/three.module.js');
  window.__THREE = THREE;
  const g = window.__tiger;
  const t = g.sceneRoot.getObjectByName('terrain');
  t.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
  return {
    matAfter: t.material.type,
    colorManagementEnabled: THREE.ColorManagement.enabled,
    outputColorSpace: g.renderer.renderer.outputColorSpace,
    toneMapping: g.renderer.renderer.toneMapping,
    threeRevision: THREE.REVISION,
  };
});
console.log('after:', JSON.stringify(r2));
await p.waitForTimeout(1200);
await p.screenshot({ path: `${shots}/dbg-2-unlit-terrain.png` });

// Now: unlit, tone mapped, to separate the tone mapping contribution.
await p.evaluate(() => {
  const g = window.__tiger;
  const t = g.sceneRoot.getObjectByName('terrain');
  t.material = new window.__THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: true });
});
await p.waitForTimeout(1000);
await p.screenshot({ path: `${shots}/dbg-3-unlit-tonemapped.png` });
await b.close();
