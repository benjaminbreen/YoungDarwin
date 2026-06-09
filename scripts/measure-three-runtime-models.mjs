import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const baseUrl = process.env.THREE_DARWIN_URL || 'http://localhost:3004/three';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');

function runtimeUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  url.searchParams.set('modelBoundsDebug', '1');
  return url.toString();
}

await fs.mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(runtimeUrl(), { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => {
  const bounds = window.__modelBoundsDebug || {};
  return bounds.darwin?.height > 0 && bounds.syms?.height > 0;
}, null, { timeout: 45000 });
await page.waitForTimeout(1200);
const result = await page.evaluate(() => ({
  bounds: window.__modelBoundsDebug || null,
  animations: window.__modelAnimationDebug || null,
  darwin: window.__darwinAnimationDebug || null,
  controller: window.__darwinControllerDebug || null,
}));
await page.screenshot({ path: path.join(outDir, 'runtime-model-bounds.png'), fullPage: true });
await browser.close();
console.log(JSON.stringify(result, null, 2));
