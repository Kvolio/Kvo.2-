// ===========================================================================
//  OVERLAY — reference comparison and round-to-round regression
//
//    node tools/overlay.mjs --a ref.png --b ortho-left.png --out cmp.png \
//                           [--mode edges|blend|diff] [--opacity 0.5]
//
//  Two uses:
//
//    * REFERENCE. Lay an orthographic render over the technical drawing and
//      see where the model and the drawing disagree. `edges` is usually the
//      one you want: the drawing stays readable and the render's outline is
//      drawn over it in red.
//    * REGRESSION. Diff this round's render against the last one. A model
//      change that was supposed to touch the mantlet and turns out to have
//      moved the idler shows up immediately, which is what §55 asks for.
//
//  `diff` reports the changed-pixel fraction, so a regression check can be a
//  number rather than a look.
// ===========================================================================

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const A = argOf('a'), B = argOf('b'), OUT = argOf('out');
const MODE = argOf('mode', 'edges');
const OPACITY = Number(argOf('opacity', 0.5));
const ALIGN_A = argOf('align-a', 'bottom-centre');
const ALIGN_B = argOf('align-b', 'bottom-centre');

if (!A || !B || !OUT) {
  console.error('usage: node tools/overlay.mjs --a IMAGE --b IMAGE --out IMAGE [--mode edges|blend|diff]');
  process.exit(2);
}

const dataURL = async (p) => {
  const ext = extname(p).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${(await readFile(p)).toString('base64')}`;
};

await mkdir(dirname(OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.setDefaultTimeout(120000);
await page.goto('http://localhost:8080/tools/overlay.html', { waitUntil: 'domcontentloaded' });

const info = await page.evaluate(
  ([a, b, mode, opacity, aa, ab]) => window.__overlay(a, b, mode, opacity, aa, ab),
  [await dataURL(A), await dataURL(B), MODE, OPACITY, ALIGN_A, ALIGN_B]);

await page.locator('#c').screenshot({ path: OUT, timeout: 120000 });
await browser.close();

console.log(`${MODE}: ${A}  vs  ${B}  ->  ${OUT}   ${info.width}x${info.height}`);
if (info.changedPixels !== undefined) {
  console.log(`changed pixels: ${info.changedPixels}  (${(info.changedFraction * 100).toFixed(3)}% of the image)`);
}
