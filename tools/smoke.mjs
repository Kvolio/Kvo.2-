// Browser smoke test: boot the game, walk it through briefing -> staging ->
// mission, fire the gun, and report every console error along the way.
import { chromium } from 'playwright';

const shots = process.env.SHOTS || '/tmp/claude-0/-home-user-Kvo-2-/eb96fd6e-806a-5701-8f68-72cdf7f81a0e/scratchpad';
const errors = [];
const logs = [];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',

  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

page.on('console', (m) => {
  const t = m.text();
  logs.push(`[${m.type()}] ${t}`);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack || ''}`));

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const step = async (name, fn, wait = 1400) => {
  try { await fn(); } catch (e) { errors.push(`STEP ${name}: ${e.message}`); }
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${shots}/${name}.png` });
  const st = await page.evaluate(() => window.__tiger ? {
    state: window.__tiger.state,
    view: window.__tiger.view,
    fps: Math.round(window.__tiger.loop.fps),
    vehicles: window.__tiger.world?.vehicles.length ?? 0,
    ammo: window.__tiger.tiger?.ammoRemaining ?? null,
    loaded: window.__tiger.tiger?.loadedRound ?? null,
    shots: window.__tiger.tiger?.shotsFired ?? 0,
    contacts: window.__tiger.world?.spotting.active().length ?? 0,
  } : { state: 'not booted' });
  console.log(`  ${name.padEnd(22)}`, JSON.stringify(st));
  return st;
};

console.log('BOOT');
await step('01-menu', async () => {});

console.log('CAMPAIGN');
await step('02-briefing', async () => {
  await page.click('[data-act="new-campaign"]');
}, 3000);

await step('03-briefing-scroll', async () => {
  await page.evaluate(() => document.querySelector('.screen-layer').scrollTop = 700);
});

await step('04-tent', async () => {
  await page.click('[data-act="brief-walk"]');
}, 1600);

await step('05-loadout', async () => {
  await page.evaluate(() => window.__tiger.openLoadout());
});

await step('06-roster', async () => {
  await page.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.openRoster(); });
});

await step('07-staging', async () => {
  await page.evaluate(() => { window.__tiger.screens.hide(); window.__tiger.beginStaging(); });
}, 2600);

await step('08-staging-walk', async () => {
  await page.evaluate(() => {
    const g = window.__tiger;
    g.player.pos.set(-8, 0, 3); g.player.yaw = -1.2;
  });
});

console.log('MISSION');
const missionState = await step('09-mission-buttoned', async () => {
  await page.evaluate(() => window.__tiger.beginMission());
}, 4000);

await step('10-hatch-open', async () => {
  await page.evaluate(() => { window.__tiger.toggleHatch(); window.__tiger.setView('hatch_open'); });
});

await step('11-head-out', async () => {
  await page.evaluate(() => window.__tiger.setView('head_out'));
});

await step('12-binoculars', async () => {
  await page.evaluate(() => window.__tiger.setView('binoculars'));
});

await step('13-command-menu', async () => {
  await page.evaluate(() => { window.__tiger.setView('vision_blocks'); window.__tiger.commandMenu.openGroup('driver'); });
});

await step('14-gunner-menu', async () => {
  await page.evaluate(() => window.__tiger.commandMenu.openGroup('gunner'));
});

await step('15-drive-and-fire', async () => {
  await page.evaluate(() => {
    const g = window.__tiger;
    g.commandMenu.close();
    // Put a T-34 in front of us and shoot it, the whole chain end to end.
    const enemy = g.world.vehicles.find((v) => v.faction === 'soviet');
    if (enemy) {
      enemy.pos.x = g.tiger.pos.x + 40;
      enemy.pos.z = g.tiger.pos.z + 700;
      enemy.pos.y = g.terrain.heightAt(enemy.pos.x, enemy.pos.z);
      g.tiger.turretTargetAz = Math.atan2(enemy.pos.x - g.tiger.pos.x, enemy.pos.z - g.tiger.pos.z) - g.tiger.heading;
      g.commands.issue('gunner.target_my_lay', { pos: { x: enemy.pos.x, y: enemy.pos.y + 1.2, z: enemy.pos.z } });
      g.commands.issue('gunner.engage');
    }
  });
}, 9000);

await step('16-map', async () => {
  await page.evaluate(() => window.__tiger.openMap());
}, 1800);

await step('17-damage-panel', async () => {
  await page.evaluate(() => {
    const g = window.__tiger;
    g.screens.hide();
    g.tiger.components.track_l.destroyed = true;
    g.tiger.components.gunner_sight.destroyed = true;
    g.hud.toggleDamage(g.tiger);
  });
});

await step('18-repair-screen', async () => {
  await page.evaluate(() => { window.__tiger.hud.toggleDamage(window.__tiger.tiger); window.__tiger.openRepairScreen(); });
});

await step('19-fire-emergency', async () => {
  await page.evaluate(() => {
    const g = window.__tiger;
    g.screens.hide();
    g.tiger.fire.ignite({ compartment: 'engine_compartment', intensity: 0.5, fuelFed: true, source: 'fuel_l' });
  });
}, 2500);

await step('20-settings', async () => {
  await page.evaluate(() => window.__tiger.openSettings());
});

const final = await page.evaluate(() => {
  const g = window.__tiger;
  return {
    fps: Math.round(g.loop.fps),
    renderer: g.renderer.stats(),
    hitLog: g.tiger?.hitLog.length ?? 0,
    kills: g.missionState?.kills ?? 0,
    fireStage: g.tiger?.fire?.stage,
  };
});

await browser.close();

console.log('\n--- RESULT ---');
console.log('final:', JSON.stringify(final, null, 2));
console.log(`console errors: ${errors.length}`);
for (const e of errors.slice(0, 25)) console.log('  ✗', e.slice(0, 400));
process.exit(errors.length ? 1 : 0);
