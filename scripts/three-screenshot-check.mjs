import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');
const DEFAULT_BASE_URL = 'http://localhost:3000/three';
const BOOT_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_TIMEOUT_MS || 45000);
const NAVIGATION_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_NAV_TIMEOUT_MS || 20000);
const SCREENSHOT_TIMEOUT_MS = Number(process.env.THREE_SCREENSHOT_WRITE_TIMEOUT_MS || 60000);
const SETTLE_MS = Number(process.env.THREE_SCREENSHOT_SETTLE_MS || 700);

const ALL_VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 900 },
  mobile: { name: 'mobile', width: 390, height: 844 },
};

function screenshotUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  return url.toString();
}

function selectedViewports() {
  const raw = process.env.THREE_SCREENSHOT_VIEWPORTS || process.argv.find(arg => arg.startsWith('--viewports='))?.slice('--viewports='.length);
  const names = (raw || 'desktop,mobile').split(',').map(name => name.trim()).filter(Boolean);
  const selected = names.map(name => ALL_VIEWPORTS[name]).filter(Boolean);
  if (!selected.length) {
    throw new Error(`No valid screenshot viewports selected from "${raw}". Use desktop, mobile, or desktop,mobile.`);
  }
  return selected;
}

async function readNextDevLockUrl() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.next/dev/lock'), 'utf8');
    const lock = JSON.parse(raw);
    if (typeof lock.appUrl === 'string' && lock.appUrl) return `${lock.appUrl.replace(/\/$/, '')}/three`;
    if (lock.port) return `http://${lock.hostname || 'localhost'}:${lock.port}/three`;
  } catch {
    // No active dev lock is fine; Playwright will fail quickly if the fallback
    // URL is not reachable.
  }
  return null;
}

async function resolveBaseUrl() {
  if (process.env.THREE_DARWIN_URL) return process.env.THREE_DARWIN_URL;
  return (await readNextDevLockUrl()) || DEFAULT_BASE_URL;
}

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
  const baseUrl = await resolveBaseUrl();
  const viewports = selectedViewports();
  console.log(`[three:screenshot] using ${screenshotUrl(baseUrl)}`);
  console.log(`[three:screenshot] viewports: ${viewports.map(viewport => viewport.name).join(', ')}`);

  const browser = await launchChromium();
  const results = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      console.log(`[three:screenshot] ${viewport.name}: loading`);
      const targetUrl = screenshotUrl(baseUrl);
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (String(error?.message || error).includes('ERR_CONNECTION_REFUSED')) {
          throw new Error(
            `Could not reach ${targetUrl}.\n`
            + 'Start the 3D dev server with `npm run dev`, or set THREE_DARWIN_URL=http://localhost:<port>/three.'
          );
        }
        throw error;
      }
      await page.getByRole('button', { name: 'New Expedition' }).click({ timeout: BOOT_TIMEOUT_MS });
      await page.waitForSelector('canvas', { timeout: BOOT_TIMEOUT_MS });
      await page.waitForSelector('[data-testid="three-launch-overlay"]', { state: 'detached', timeout: BOOT_TIMEOUT_MS });
      await page.waitForTimeout(SETTLE_MS);
      const health = await canvasPixelHealth(page);
      const screenshot = path.join(outDir, `${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false, timeout: SCREENSHOT_TIMEOUT_MS });
      results.push({ viewport: viewport.name, screenshot, health, errors });
      console.log(`[three:screenshot] ${viewport.name}: ${health.ok && errors.length === 0 ? 'ok' : 'failed'}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
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
