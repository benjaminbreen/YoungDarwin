import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './playwright-launch.mjs';

const baseUrl = process.env.THREE_DARWIN_URL || 'http://localhost:3003/three';
const outDir = path.join(process.cwd(), 'test-results', 'three-darwin');
const launchTimeoutMs = Number(process.env.THREE_PERF_LAUNCH_TIMEOUT_MS || 60_000);

const scenarios = [
  { name: 'performance', params: { quality: 'performance', perfProbe: '1' } },
  { name: 'cinematic', params: { quality: 'cinematic', perfProbe: '1' } },
  { name: 'performance-water-cinematic', params: { quality: 'performance', waterQuality: 'cinematic', perfProbe: '1', reflections: '1' } },
];

const selectedScenario = process.env.THREE_PERF_SCENARIO || '';
const activeScenarios = selectedScenario
  ? scenarios.filter(scenario => scenario.name === selectedScenario)
  : scenarios;

function scenarioUrl(scenario) {
  const url = new URL(baseUrl);
  url.searchParams.set('preserveDrawingBuffer', '1');
  url.searchParams.set('skipIntro', '1');
  for (const [key, value] of Object.entries(scenario.params)) url.searchParams.set(key, value);
  return url.toString();
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await launchChromium();
  const results = [];

  try {
    if (!activeScenarios.length) {
      throw new Error(`Unknown THREE_PERF_SCENARIO "${selectedScenario}"`);
    }

    for (const scenario of activeScenarios) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      try {
        console.log(`[three:perf] ${scenario.name}: opening ${scenarioUrl(scenario)}`);
        await page.goto(scenarioUrl(scenario), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.getByRole('button', { name: 'New Expedition' }).click({ timeout: 15000 });
        await page.getByRole('button', { name: /^Darwin\b/i }).click({ timeout: 15000 });
        await page.waitForSelector('canvas', { timeout: 60000 });
        try {
          await page.waitForSelector('[data-testid="three-launch-overlay"]', {
            state: 'detached',
            timeout: launchTimeoutMs,
          });
        } catch (error) {
          const diagnostics = await page.evaluate(() => {
            const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
            return {
              url: window.location.href,
              overlay: overlay
                ? {
                    mode: overlay.getAttribute('data-mode'),
                    text: overlay.textContent?.replace(/\s+/g, ' ').trim() || '',
                  }
                : null,
              canvasPresent: Boolean(document.querySelector('canvas')),
              activeContentPhase: window.__threeActiveContentPhase ?? null,
              launchDebug: window.__threeLaunchDebug ?? null,
              perfSample: window.__threePerfSample ?? null,
              audioDebug: window.__darwinAudioDebug ?? null,
              adaptiveDpr: window.__adaptiveDpr ?? null,
            };
          });
          console.error(
            `[three:perf] ${scenario.name}: launch diagnostics`,
            JSON.stringify(diagnostics, null, 2),
          );
          throw error;
        }
        try {
          await page.waitForFunction(
            () => {
              const sample = window.__threePerfSample;
              return Boolean(
                sample?.fps > 0
                && sample.sceneTriangles > 10000
                && sample.sceneVisibleObjects > 20
              );
            },
            null,
            { timeout: 45000 },
          );
        } catch (error) {
          const lastSample = await page.evaluate(() => ({
            perf: window.__threePerfSample || null,
            reflection: window.__threeReflectionDebug || null,
          })).catch(() => null);
          console.error(JSON.stringify({
            scenario: scenario.name,
            reason: 'scene-perf-sample-timeout',
            lastSample,
          }, null, 2));
          throw error;
        }
        await page.waitForTimeout(2500);
        const samples = [];
        for (let index = 0; index < 8; index += 1) {
          await page.waitForTimeout(250);
          samples.push(await page.evaluate(() => window.__threePerfSample || null));
        }
        const valid = samples.filter(Boolean);
        const average = averageSamples(valid);
        results.push({ scenario: scenario.name, average, samples: valid, errors });
      } finally {
        await page.close().catch(() => {});
      }
    }

    await fs.writeFile(path.join(outDir, 'perf-summary.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));

    if (results.some(result => (
      result.errors.length
      || !result.average?.fps
      || !result.average?.sceneTriangles
      || result.average.sceneTriangles <= 10000
    ))) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

function averageSamples(samples) {
  if (!samples.length) return null;
  const keys = [
    'fps',
    'frameMs',
    'rawCalls',
    'rawTriangles',
    'points',
    'lines',
    'geometries',
    'textures',
    'pixelRatio',
    'sceneDrawCalls',
    'sceneTriangles',
    'sceneMeshes',
    'sceneSkinnedMeshes',
    'sceneInstancedMeshes',
    'sceneInstances',
    'scenePoints',
    'sceneLines',
    'sceneObjects',
    'sceneChildren',
    'sceneVisibleObjects',
  ];
  return Object.fromEntries(keys.map(key => [
    key,
    Number((samples.reduce((sum, sample) => sum + (Number(sample[key]) || 0), 0) / samples.length).toFixed(3)),
  ]));
}
