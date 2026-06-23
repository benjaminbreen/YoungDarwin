import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const baseUrl = process.env.THREE_DARWIN_URL || 'http://localhost:3003/three';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');

function screenshotUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  return url.toString();
}

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function canvasPixelHealth(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, reason: 'missing-canvas' };
    const rect = canvas.getBoundingClientRect();
    const full = rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95;
    const source = document.createElement('canvas');
    source.width = 12;
    source.height = 12;
    const context = source.getContext('2d');
    context.drawImage(canvas, 0, 0, source.width, source.height);
    const data = context.getImageData(0, 0, source.width, source.height).data;
    let varied = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = data[i] + data[i + 1] + data[i + 2];
      if (brightness > 24 && brightness < 740) varied += 1;
    }
    return {
      ok: full && varied > 24,
      full,
      varied,
      rect: { width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await launchChromium();
  const results = [];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(screenshotUrl(), { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByRole('button', { name: 'New Expedition' }).click({ timeout: 15000 });
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForSelector('[data-testid="three-launch-overlay"]', { state: 'detached', timeout: 60000 });
    await page.waitForTimeout(1500);
    const health = await canvasPixelHealth(page);
    const screenshot = path.join(outDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    results.push({ viewport: viewport.name, screenshot, health, errors });
    await page.close();
  }

  await browser.close();
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));

  const failed = results.filter(result => !result.health.ok || result.errors.length > 0);
  if (failed.length) {
    console.error(JSON.stringify(results, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(results, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
