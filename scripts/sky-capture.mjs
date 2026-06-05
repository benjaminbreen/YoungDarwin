import { chromium } from '@playwright/test';
import path from 'node:path';

const origin = process.env.SKY_ORIGIN || 'http://localhost:3002';
const outDir = path.join(process.cwd(), 'test-results', 'sky');

const shots = [
  { name: 'dawn', t: 6.6 },
  { name: 'morning', t: 9 },
  { name: 'noon', t: 12.5 },
  { name: 'sunset', t: 18.4 },
  { name: 'night', t: 22.5 },
];

const launches = [
  () => chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] }),
  () => chromium.launch({ headless: true }),
];
let browser;
for (const l of launches) { try { browser = await l(); break; } catch {} }
if (!browser) { console.error('no browser'); process.exit(1); }

const results = [];
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
  await page.goto(`${origin}/sky-test?t=${shot.t}&post=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
  await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
  results.push({ name: shot.name, t: shot.t, hasCanvas, err: errors.slice(0, 3) });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
