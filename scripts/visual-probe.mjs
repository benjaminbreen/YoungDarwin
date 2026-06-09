import { launchChromium } from './playwright-launch.mjs';

const url = new URL(process.env.THREE_DARWIN_URL || 'http://localhost:3003/three');
url.searchParams.set('preserveDrawingBuffer', '1');
const out = process.env.PROBE_OUT || 'test-results/three-darwin/probe.png';
const keys = (process.env.PROBE_KEYS || '').split(',').filter(Boolean);
const settle = Number(process.env.PROBE_SETTLE || 9000);

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(settle);

for (const spec of keys) {
  const [key, ms] = spec.split(':');
  await page.keyboard.down(key);
  await page.waitForTimeout(Number(ms || 600));
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
