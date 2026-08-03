#!/usr/bin/env node
//
// Perf lab: run a scripted scenario against the running dev server on real GPU
// hardware, record every frame, and print a digest that says where the time
// went and whether the bottleneck is the main thread or the GPU.
//
//   node scripts/three-perf-lab.mjs --scenario=stutter
//   node scripts/three-perf-lab.mjs --scenario=quick --tag=after-fix --compare=last
//   node scripts/three-perf-lab.mjs --list
//
// Requires a dev server (default http://localhost:3000/three). Refuses to run
// on a software renderer, because a SwiftShader frame time is not evidence
// about anything a player will experience.

import fs from 'node:fs/promises';
import path from 'node:path';
import { SCENARIOS, resolveScenario } from './perf-lab/scenarios.mjs';
import {
  DEFAULTS,
  bootToGameplay,
  hideHud,
  openSession,
  runSteps,
  settle,
  stopTrace,
} from './perf-lab/driver.mjs';
import {
  analyseTrace,
  formatCompare,
  formatCostDigest,
  formatDigest,
} from './perf-lab/report.mjs';

const OUT_ROOT = path.join(process.cwd(), 'test-results', 'perf-lab');

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

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function listRuns() {
  try {
    const entries = await fs.readdir(OUT_ROOT, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function resolveComparison(reference, scenario, excludeName = null) {
  if (!reference) return null;
  // The current run's artifacts are already on disk by the time this is called,
  // so it has to be excluded or `--compare=last` compares a run with itself.
  const runs = (await listRuns()).filter(run => run !== excludeName);
  let name = reference;
  if (reference === 'last' || reference === 'latest' || reference === true) {
    const matching = runs.filter(run => run.includes(`-${scenario}-`) || run.endsWith(`-${scenario}`));
    name = (matching.length ? matching : runs).pop();
  }
  if (!name) return null;
  const file = path.join(OUT_ROOT, name, 'run.json');
  try {
    return { name, data: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.list) {
    console.log('\nscenarios');
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      console.log(`  ${name.padEnd(10)} ${scenario.description}`);
    }
    const runs = await listRuns();
    console.log(`\nrecorded runs (${runs.length})`);
    for (const run of runs.slice(-12)) console.log(`  ${run}`);
    console.log('');
    return;
  }

  const scenarioName = options.scenario || 'stutter';
  const scenario = resolveScenario(scenarioName);
  const zone = options.zone || DEFAULTS.zone;
  const tag = options.tag ? slug(options.tag) : '';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runName = [stamp, scenarioName, tag].filter(Boolean).join('-');
  const outDir = path.join(OUT_ROOT, runName);
  const shotDir = path.join(outDir, 'shots');
  await fs.mkdir(shotDir, { recursive: true });

  const sessionOptions = {
    url: options.url,
    zone,
    quality: options.quality,
    adaptiveDpr: options.adaptiveDpr === 'true' || options.adaptiveDpr === true,
    width: Number(options.width) || DEFAULTS.width,
    height: Number(options.height) || DEFAULTS.height,
    deviceScaleFactor: Number(options.dpr) || DEFAULTS.deviceScaleFactor,
    settleMs: options.settle !== undefined ? Number(options.settle) : (scenario.settleMs ?? DEFAULTS.settleMs),
    params: options.params ? JSON.parse(options.params) : {},
  };

  console.log(`[perf-lab] scenario=${scenarioName} zone=${zone} -> ${path.relative(process.cwd(), outDir)}`);
  const session = await openSession(sessionOptions);
  let trace = null;
  let boot = null;
  let cost = null;

  try {
    boot = await bootToGameplay(session.page, sessionOptions);
    console.log(
      `[perf-lab] gameplay ready in ${(boot.timings.gameplayReadyMs / 1000).toFixed(1)}s`
      + ` (content settled ${(boot.timings.contentSettledMs / 1000).toFixed(1)}s)`,
    );
    if (options.hud === '0' || options.hud === 'off') await hideHud(session.page);

    const settled = await settle(session.page, sessionOptions);
    console.log(
      `[perf-lab] frame times stabilised ${(settled.stabilisedMs / 1000).toFixed(1)}s after load`
      + (settled.stable ? '' : ' (never reached a quiet window — see the settle phase)'),
    );

    const repeat = Math.max(1, Number(options.repeat) || 1);
    for (let pass = 0; pass < repeat; pass += 1) {
      await runSteps(session.page, scenario.steps, { shotDir, fullPage: options.fullPage === 'true' });
    }

    // Walked after the trace's work is done, so the traversal cost is not
    // inside any measured phase.
    cost = await session.page.evaluate(() => window.__perfLab?.sceneCost() || null);
    trace = await stopTrace(session.page);
  } finally {
    await session.browser.close().catch(() => {});
  }

  if (!trace || !trace.columns?.t?.length) {
    console.error('[perf-lab] no frames recorded — is window.__darwinScene present (dev build)?');
    process.exitCode = 1;
    return;
  }

  const analysis = analyseTrace(trace);
  const meta = {
    scenario: scenarioName,
    zone,
    tag: options.tag || null,
    url: boot?.url || null,
    timings: boot?.timings || null,
    rendererInfo: session.rendererInfo,
    options: sessionOptions,
    consoleErrors: session.consoleErrors.slice(0, 40),
  };

  const digest = formatDigest(analysis, meta) + formatCostDigest(cost);
  console.log(digest);
  if (session.consoleErrors.length) {
    console.log(`  ${session.consoleErrors.length} console error(s); first: ${session.consoleErrors[0].slice(0, 160)}`);
  }

  await fs.writeFile(
    path.join(outDir, 'run.json'),
    JSON.stringify({ meta, analysis, cost, trace }, null, 0),
  );
  await fs.writeFile(path.join(outDir, 'digest.txt'), digest);

  const comparison = await resolveComparison(options.compare, scenarioName, runName);
  if (comparison) {
    const compareText = formatCompare(comparison.data.analysis, analysis, {
      base: comparison.name,
      head: runName,
    });
    console.log(compareText);
    await fs.writeFile(path.join(outDir, 'compare.txt'), compareText);
  } else if (options.compare) {
    console.log(`[perf-lab] no comparable earlier run found for "${options.compare}"`);
  }

  console.log(`[perf-lab] artifacts: ${path.relative(process.cwd(), outDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
