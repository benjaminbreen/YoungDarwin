import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const baseUrl = process.env.THREE_DARWIN_URL || 'http://localhost:3003/three';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');
const scenario = process.env.THREE_COST_SCENARIO || 'performance';
const zone = process.env.THREE_COST_ZONE || '';

function probeUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  url.searchParams.set('perfProbe', '1');
  url.searchParams.set('costProbe', '1');
  url.searchParams.set('quality', scenario === 'cinematic' ? 'cinematic' : 'performance');
  if (zone) url.searchParams.set('zone', zone);
  return url.toString();
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    const url = probeUrl();
    console.log(`[three:cost] opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: 'New Expedition' }).click({ timeout: 15000 });
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForSelector('[data-testid="three-launch-overlay"]', { state: 'detached', timeout: 60000 });
    await page.waitForFunction(
      () => {
        const cost = window.__threeSceneCost;
        return Boolean(
          cost?.totals?.triangles > 10000
          && cost.byTriangles?.length
          && cost.byDrawCalls?.length
        );
      },
      null,
      { timeout: 45000 },
    );

    // Let deferred GLB/ecology content settle so the report captures gameplay,
    // not just the first visible terrain frame.
    await page.waitForTimeout(4500);
    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      await page.waitForTimeout(350);
      samples.push(await page.evaluate(() => window.__threeSceneCost || null));
    }
    const valid = samples.filter(Boolean);
    const latest = valid[valid.length - 1] || null;
    const report = {
      scenario,
      zone: zone || null,
      url,
      generatedAt: new Date().toISOString(),
      totals: latest?.totals || null,
      byTriangles: latest?.byTriangles?.slice(0, 25) || [],
      byDrawCalls: latest?.byDrawCalls?.slice(0, 25) || [],
      byUncullable: latest?.byUncullable?.filter(bucket => bucket.uncullable > 0).slice(0, 25) || [],
      samples: valid,
      errors,
    };
    const outputPath = path.join(outDir, 'scene-cost.json');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      outputPath,
      totals: report.totals,
      byTriangles: report.byTriangles.slice(0, 12),
      byDrawCalls: report.byDrawCalls.slice(0, 12),
      byUncullable: report.byUncullable.slice(0, 12),
      errors,
    }, null, 2));
    if (errors.length || !report.totals?.triangles) process.exitCode = 1;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
