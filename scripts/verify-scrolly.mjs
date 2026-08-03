/**
 * Headless end-to-end check of the scrollytelling experience.
 * Serves the built site (run `npm run build` + `npm run preview` first, or
 * pass a URL), scrolls through every story beat, and screenshots each one.
 *
 *   node scripts/verify-scrolly.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv[2] || 'http://localhost:4173';
const outDir = process.argv[3] || 'verify-shots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.scrolly__loading.is-done', { timeout: 20000 });

const scrolly = page.locator('.scrolly');
const box = await scrolly.boundingBox();
const sectionTop = box.y + (await page.evaluate(() => window.scrollY));
const sectionScrollable = box.height - 900; // section height minus viewport

// Shots: top of article, entry, and the middle of each 25%-wide beat + exit.
const beats = [
  ['00-article-top', 0],
  ['01-takeover', sectionTop],
  ['02-right-side-green', sectionTop + sectionScrollable * 0.14],
  ['03-rotating-to-back', sectionTop + sectionScrollable * 0.33],
  ['04-back-green', sectionTop + sectionScrollable * 0.5],
  ['05-left-side-green', sectionTop + sectionScrollable * 0.78],
  ['06-release-dimmed', sectionTop + sectionScrollable * 0.97],
  ['07-after-scrolly', sectionTop + box.height + 400],
];

for (const [name, y] of beats) {
  await page.evaluate((top) => {
    window.scrollTo({ top, behavior: 'instant' });
    // Headless SwiftShader renders at a few fps, which stalls GSAP's
    // lag-smoothed clock and the damped camera. Snap both so screenshots
    // capture settled states; real GPUs never need this.
    const dbg = window.__scrolly;
    if (dbg) {
      dbg.gsap.ticker.lagSmoothing(0);
      requestAnimationFrame(() => { dbg.rig.progress = dbg.rig.targetProgress; });
    }
  }, y);
  // Let highlight/card fades finish (they run in real time).
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot: ${name}`);
}

await browser.close();

if (consoleErrors.length) {
  console.error('\nConsole errors:\n' + consoleErrors.join('\n'));
  process.exit(1);
}
console.log('\nNo console errors. Screenshots in ' + outDir + '/');
