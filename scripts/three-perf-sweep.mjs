#!/usr/bin/env node
//
// Ablation sweep: run the same short scenario under several renderer
// configurations and print what each one is worth.
//
//   node scripts/three-perf-sweep.mjs
//   node scripts/three-perf-sweep.mjs --zone=E_MID --variants=baseline,no-post,dpr-1
//   node scripts/three-perf-sweep.mjs --scenario=swivel --list
//
// This answers the two questions that matter when tuning:
//   * which single knob removes the hitch, and
//   * which visual features are currently free, so they can be spent on
//     something that shows.
//
// One browser, one page per variant, same scenario, same seat. Variant order is
// as given, and every variant reports the same phases, so the table is a fair
// comparison rather than a collection of anecdotes.

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScenario } from './perf-lab/scenarios.mjs';
import {
  DEFAULTS,
  bootToGameplay,
  buildUrl,
  readTraceSource,
  runSteps,
  settle,
  stopTrace,
} from './perf-lab/driver.mjs';
import { analyseTrace } from './perf-lab/report.mjs';
import { launchChromium, getBrowserRendererInfo } from './playwright-launch.mjs';

const OUT_ROOT = path.join(process.cwd(), 'test-results', 'perf-lab');

// Each variant is a set of URL parameters layered onto the same base run.
// Keep them single-purpose: a variant that changes two things cannot tell you
// which of them mattered.
export const VARIANTS = {
  baseline: { params: {}, note: 'current defaults' },
  'no-post': { params: { noPost: '1' }, note: 'entire post chain off' },
  'no-reflections': { params: { noReflections: '1' }, note: 'water planar reflection off' },
  'dpr-1': { params: { dpr: '1x' }, note: 'render at 1x instead of native' },
  'dpr-1.25': { params: { dpr: '1.25x' }, note: 'render at 1.25x' },
  'dpr-1.5': { params: { dpr: '1.5x' }, note: 'render at 1.5x' },
  // Every other variant pins resolution so a comparison is not secretly a
  // comparison of two different resolutions. But players run with the
  // adaptive ladder ON, so a controller that hunts up and down would never
  // appear in a pinned run — which is exactly what a bimodal frame rate
  // looks like from the outside.
  'adaptive-dpr': { session: { adaptiveDpr: true }, note: 'adaptive DPR ladder live, as players get it' },
  'no-ao': { params: { noAO: '1' }, note: 'ambient occlusion off (already default off)' },
  'no-hdr-post': { params: { noHdrPost: '1' }, note: '8-bit composer targets' },
  // MSAA lives on the MAIN pass, not the post chain, so the 2026-08-04
  // "post is within noise" result says nothing about it. SMAA still runs.
  'msaa-0': { params: { msaa: '0' }, note: 'composer MSAA off, SMAA only' },
  'msaa-0-dpr-1.25': { params: { msaa: '0', dpr: '1.25x' }, note: 'MSAA off at 1.25x' },
  'water-performance': { params: { waterQuality: 'performance' }, note: 'cheapest water tier' },
  'no-water': { params: { noWater: '1' }, note: 'water surface removed entirely' },
  'no-details': { params: { noDetails: '1' }, note: 'world detail props off' },
  'no-specimens': { params: { noSpecimens: '1' }, note: 'collectable fauna off' },
  'shadow-low': { params: { shadowQuality: 'low' }, note: 'small shadow map' },
  'no-shadows': { params: { noShadows: '1' }, note: 'shadows off' },
};

const DEFAULT_VARIANTS = ['baseline', 'no-post', 'no-reflections', 'dpr-1'];

function parseArgs(argv) {
  const options = {};
  for (const argument of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (!match) continue;
    const [, key, value] = match;
    options[key] = value === undefined ? true : value;
  }
  return options;
}

function pad(value, width, align = 'left') {
  const text = String(value);
  if (text.length >= width) return text.slice(0, width);
  const fill = ' '.repeat(width - text.length);
  return align === 'right' ? fill + text : text + fill;
}

// A phase whose numbers are worth comparing: long enough to be stable, and not
// one of the boot/settle phases whose cost is load, not steady state.
function comparablePhases(analysis) {
  return analysis.phases.filter(
    phase => phase.frames >= 40 && phase.label !== 'boot' && phase.label !== 'settle',
  );
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.list) {
    console.log('\nvariants');
    for (const [name, variant] of Object.entries(VARIANTS)) {
      console.log(`  ${pad(name, 20)}${variant.note}`);
    }
    console.log(`\ndefault set: ${DEFAULT_VARIANTS.join(', ')}\n`);
    return;
  }

  const scenarioName = options.scenario || 'quick';
  const scenario = resolveScenario(scenarioName);
  const zone = options.zone || DEFAULTS.zone;
  const names = options.variants ? String(options.variants).split(',') : DEFAULT_VARIANTS;
  for (const name of names) {
    if (!VARIANTS[name]) throw new Error(`Unknown variant "${name}". Try --list.`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUT_ROOT, `${stamp}-sweep-${scenarioName}`);
  await fs.mkdir(outDir, { recursive: true });

  const browser = await launchChromium({
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const rendererInfo = getBrowserRendererInfo(browser);
  if (!rendererInfo || rendererInfo.software) {
    await browser.close().catch(() => {});
    throw new Error(`Refusing to sweep on a software renderer (${rendererInfo?.name || 'no WebGL'}).`);
  }

  const traceSource = await readTraceSource();
  const contextOptions = {
    viewport: {
      width: Number(options.width) || DEFAULTS.width,
      height: Number(options.height) || DEFAULTS.height,
    },
    deviceScaleFactor: Number(options.dpr) || DEFAULTS.deviceScaleFactor,
  };

  // Run-to-run spread on this workload is several fps, so a single pass cannot
  // resolve a small change. Every variant is measured `repeat` times and
  // reported as a median with its observed range; a delta smaller than the
  // range is not a result.
  //
  // Passes are the OUTER loop on purpose. This machine drifts over a long
  // session — sustained GPU load heats it and later runs come in slower — and
  // running variant A three times before variant B maps that drift straight
  // onto variant order, manufacturing a difference that is really just
  // position in the queue. Interleaving spreads the drift across every variant
  // so it cancels in the median instead.
  const repeat = Math.max(1, Number(options.repeat) || 1);
  const results = [];
  try {
    for (let pass = 0; pass < repeat; pass += 1) {
      for (const name of names) {
      const variant = VARIANTS[name];
      // A fresh context per variant. Sharing one leaks an in-progress
      // expedition through localStorage, which changes the launch menu for
      // every run after the first and leaves the harness clicking a button
      // that is no longer there.
      const context = await browser.newContext(contextOptions);
      await context.addInitScript({ content: traceSource });
      const page = await context.newPage();
      await page.bringToFront();
      const sessionOptions = {
        url: options.url,
        zone,
        quality: options.quality,
        settleMs: options.settle !== undefined ? Number(options.settle) : DEFAULTS.settleMs,
        params: variant.params || {},
        ...(variant.session || {}),
      };
      process.stdout.write(`[sweep] ${name}${repeat > 1 ? ` (${pass + 1}/${repeat})` : ''} ... `);
      try {
        const boot = await bootToGameplay(page, sessionOptions);
        await settle(page, sessionOptions);
        await runSteps(page, scenario.steps, {
          shotDir: path.join(outDir, 'shots', name),
        });
        const cost = await page.evaluate(() => window.__perfLab?.sceneCost() || null);
        const trace = await stopTrace(page);
        const analysis = analyseTrace(trace);
        results.push({ name, pass, variant, url: buildUrl(sessionOptions), boot, analysis, cost });
        const phases = comparablePhases(analysis);
        process.stdout.write(
          `${phases.map(phase => `${phase.label} ${phase.avgFps}fps`).join('  ')}\n`,
        );
      } catch (error) {
        const readiness = await page
          .evaluate(() => window.__darwinE2E?.getReadiness?.() || null)
          .catch(() => null);
        process.stdout.write(
          `FAILED (${String(error.message).split('\n')[0].slice(0, 90)})`
          + `${readiness ? ` readiness=${JSON.stringify(readiness).slice(0, 200)}` : ''}\n`,
        );
        results.push({ name, pass, variant, error: String(error.message), readiness });
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const ok = results.filter(result => result.analysis);
  if (!ok.length) {
    console.error('[sweep] every variant failed');
    process.exitCode = 1;
    return;
  }

  const phaseLabels = [];
  for (const phase of comparablePhases(ok[0].analysis)) phaseLabels.push(phase.name);

  const median = values => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
  };

  // Collapse the repeats of one variant into a single row's worth of numbers.
  const aggregate = name => {
    const runs = ok.filter(result => result.name === name);
    const perPhase = new Map();
    for (const label of phaseLabels) {
      const phases = runs.map(run => run.analysis.phases.find(phase => phase.name === label)).filter(Boolean);
      if (!phases.length) continue;
      const fps = phases.map(phase => phase.avgFps);
      perPhase.set(label, {
        fps: median(fps),
        min: Math.min(...fps),
        max: Math.max(...fps),
        p95: median(phases.map(phase => phase.p95FrameMs)),
        calls: Math.round(median(phases.map(phase => phase.avgDrawCalls))),
        scenePasses: median(phases.map(phase => phase.avgScenePasses)),
      });
    }
    const quads = runs.map(run => (run.analysis.quadPassTally || [])
      .reduce((sum, entry) => sum + entry.count, 0) / Math.max(1, run.analysis.totalFrames));
    return { name, runs: runs.length, perPhase, quadPerFrame: Math.round(median(quads) * 10) / 10 };
  };

  const aggregates = [...new Set(ok.map(result => result.name))].map(aggregate);
  const spread = Math.max(
    0,
    ...aggregates.flatMap(entry => [...entry.perPhase.values()].map(phase => phase.max - phase.min)),
  );

  const lines = [];
  lines.push('');
  lines.push(`PERF SWEEP  ${scenarioName} @ ${zone}${repeat > 1 ? `  (${repeat} runs per variant, median)` : ''}`);
  lines.push(`  ${rendererInfo.name}`);
  lines.push('');
  const header = [`  ${pad('variant', 18)}`];
  for (const label of phaseLabels) header.push(pad(`${label} fps`, 25, 'right'));
  header.push(pad('p95ms', 9, 'right'), pad('calls', 8, 'right'), pad('scene/f', 9, 'right'), pad('post/f', 8, 'right'));
  lines.push(header.join(''));
  lines.push(`  ${'-'.repeat(header.join('').length - 2)}`);

  const baseline = aggregates.find(entry => entry.name === 'baseline') || aggregates[0];

  for (const entry of aggregates) {
    const row = [`  ${pad(entry.name, 18)}`];
    let worstP95 = 0;
    let calls = 0;
    let scenePasses = 0;
    for (const label of phaseLabels) {
      const phase = entry.perPhase.get(label);
      if (!phase) {
        row.push(pad('-', 25, 'right'));
        continue;
      }
      const base = baseline.perPhase.get(label);
      const deltaValue = base ? Math.round((phase.fps - base.fps) * 10) / 10 : 0;
      // A delta only earns the marker if it is larger than the worst spread
      // observed inside any single variant. Everything else is within noise
      // and must not be reported as an effect.
      const decisive = base && entry !== baseline && Math.abs(deltaValue) > spread;
      const delta = base && entry !== baseline
        ? ` (${deltaValue >= 0 ? '+' : ''}${deltaValue}${decisive ? '*' : ''})`
        : '';
      const range = entry.runs > 1 ? ` [${phase.min}-${phase.max}]` : '';
      row.push(pad(`${phase.fps}${delta}${range}`, 25, 'right'));
      worstP95 = Math.max(worstP95, phase.p95);
      calls = Math.max(calls, phase.calls);
      scenePasses = Math.max(scenePasses, phase.scenePasses);
    }
    row.push(
      pad(worstP95, 9, 'right'),
      pad(calls, 8, 'right'),
      pad(scenePasses, 9, 'right'),
      pad(entry.quadPerFrame, 8, 'right'),
    );
    lines.push(row.join(''));
  }
  lines.push('');
  lines.push('  scene/f = world-scene renders per frame · post/f = fullscreen passes per frame');
  if (spread > 0) {
    lines.push(
      `  worst spread within a single variant: ${Math.round(spread * 10) / 10} fps.`
      + ' Only deltas marked * exceed it; the rest are noise.',
    );
  } else if (repeat === 1) {
    lines.push('  single run per variant: deltas under ~3 fps on this workload are noise. Use --repeat=3.');
  }
  lines.push('');
  for (const result of results.filter(entry => entry.error)) {
    lines.push(`  ${result.name}: FAILED — ${result.error.slice(0, 140)}`);
  }

  const digest = lines.join('\n');
  console.log(digest);
  await fs.writeFile(path.join(outDir, 'sweep.txt'), digest);
  await fs.writeFile(
    path.join(outDir, 'sweep.json'),
    JSON.stringify(
      {
        scenario: scenarioName,
        zone,
        rendererInfo,
        results: results.map(({ name, variant, url, error, analysis, cost }) => ({
          name,
          variant,
          url,
          error,
          analysis,
          cost,
        })),
      },
      null,
      0,
    ),
  );
  console.log(`[sweep] artifacts: ${path.relative(process.cwd(), outDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
