// Mobile smoke test: the SAME game on an iPad viewport with touch input.
import { chromium, devices } from 'playwright';
const shots = '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const errors = [];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });

for (const [name, device] of [['ipad', devices['iPad Pro 11']], ['iphone', devices['iPhone 13']]]) {
  const ctx = await b.newContext({ ...device, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name} PAGEERROR: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });

  await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);

  const mode = await p.evaluate(() => ({
    inputMode: window.__tiger.input.mode,
    quality: window.__tiger.renderer.qualityName,
    touchMenu: window.__tiger.commandMenu.touch,
  }));
  console.log(`${name}: input=${mode.inputMode} quality=${mode.quality} touchMenu=${mode.touchMenu}`);

  await p.screenshot({ path: `${shots}/m-${name}-1-menu.png` });

  await p.tap('[data-act="new-campaign"]');
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${shots}/m-${name}-2-briefing.png` });

  await p.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${shots}/m-${name}-3-staging.png` });

  await p.evaluate(() => window.__tiger.beginMission());
  await p.waitForTimeout(3600);
  await p.screenshot({ path: `${shots}/m-${name}-4-mission.png` });

  // Exercise the touch controls: thumbstick drag on the left, look on the right.
  const vp = p.viewportSize();
  await p.touchscreen.tap(vp.width * 0.2, vp.height * 0.7);
  await p.waitForTimeout(400);
  await p.touchscreen.tap(vp.width * 0.8, vp.height * 0.4);   // designates a target
  await p.waitForTimeout(900);

  const ctxButtons = await p.evaluate(() => {
    const bar = document.querySelector('.touch-context');
    const core = document.querySelector('.touch-core');
    return {
      context: Array.from(bar?.children || []).map((b) => b.textContent.trim()),
      core: Array.from(core?.children || []).map((b) => b.textContent.trim()),
      layerVisible: getComputedStyle(document.querySelector('.touch-layer')).display,
    };
  });
  console.log(`  core buttons: ${ctxButtons.core.join(' ')}`);
  console.log(`  contextual:   ${ctxButtons.context.join(' | ')}`);
  console.log(`  touch layer:  ${ctxButtons.layerVisible}`);
  await p.screenshot({ path: `${shots}/m-${name}-5-touchhud.png` });

  // The command menu must be fully reachable on a phone.
  await p.evaluate(() => window.__tiger.commandMenu.openGroup('emergency'));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${shots}/m-${name}-6-cmdmenu.png` });

  const stats = await p.evaluate(() => ({
    fps: Math.round(window.__tiger.loop.fps),
    resScale: window.__tiger.renderer.resolutionScale,
    ammo: window.__tiger.tiger?.ammoRemaining,
    vehicles: window.__tiger.world?.vehicles.length,
  }));
  console.log(`  ${JSON.stringify(stats)}`);
  await ctx.close();
}
await b.close();
console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ✗', e);
process.exit(errors.length ? 1 : 0);
