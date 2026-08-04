#!/usr/bin/env node
//
// Watch the real launch intro: a contact sheet plus a DOM timeline.
//
//   npm run intro:timing
//   npm run intro:timing -- --interval=400 --repeat=2
//
// The perf lab boots with `?e2e=1&skipIntro=1`, so it never runs the prologue
// at all. This walks the menu the way a player does, screenshots every frame
// interval, and records what is actually on screen — which is the only way to
// catch a restarted animation or a stray black cover.
//
// Headful and hardware-rendered for the same reason the lab is: SwiftShader
// renders the scene wrong, and Chromium throttles rAF in a window it thinks is
// occluded, which stalls the frame-driven readiness signals being timed.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { launchChromium } from './playwright-launch.mjs';

const DEFAULT_URL = process.env.THREE_DARWIN_URL || 'http://localhost:3000/three';

const NO_THROTTLE_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
];

const SHEET_COLUMNS = 5;
const SHEET_TILE_WIDTH = 480;

function parseArgs(argv) {
  const options = { url: DEFAULT_URL, repeat: 1, interval: 400, maxMs: 45_000 };
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'url') options.url = value;
    else if (key === 'repeat') options.repeat = Math.max(1, Number(value) || 1);
    else if (key === 'interval') options.interval = Math.max(100, Number(value) || 400);
    else if (key === 'maxMs') options.maxMs = Math.max(5_000, Number(value) || 45_000);
  }
  return options;
}

// Reports what is on screen, not what the state machine believes. A prologue
// that remounts shows up as its first text block dropping back toward zero
// after having reached one.
const DOM_SAMPLER = `(() => {
  const debug = window.__threeLaunchDebug || {};
  const prologue = document.querySelector('[data-testid="three-historical-prologue"]');
  const overlay = document.querySelector('[data-testid="three-launch-overlay"]');
  const opacityOf = selector => {
    const node = prologue?.querySelector(selector);
    return node ? Number(getComputedStyle(node).opacity).toFixed(2) : null;
  };
  const openingBlack = document.querySelector('.opening-black-fade');
  return {
    launchState: debug.launchState ?? null,
    phase: debug.startupContentPhase ?? null,
    sceneReady: debug.sceneReady ?? null,
    prologuePresent: Boolean(prologue),
    overlayPresent: Boolean(overlay),
    departing: overlay?.dataset?.departing ?? null,
    block: opacityOf('.launch-prologue-block'),
    veil: opacityOf('.launch-prologue-veil'),
    blackout: opacityOf('.launch-prologue-blackout'),
    openingBlack: openingBlack
      ? Number(getComputedStyle(openingBlack).opacity).toFixed(2)
      : null,
    begin: Boolean([...document.querySelectorAll('button')]
      .find(b => /Begin exploring/.test(b.textContent))),
  };
})()`;

function formatRow(elapsedMs, sample) {
  const flag = value => (value === null || value === undefined ? '·' : String(value));
  return `${String(elapsedMs).padStart(6)}ms  `
    + `${flag(sample.launchState).padEnd(8)} `
    + `ph${flag(sample.phase).padEnd(4)}`
    + `${(sample.prologuePresent ? 'prologue' : '·').padEnd(9)}`
    + `dep=${flag(sample.departing).padEnd(6)}`
    + `text=${flag(sample.block).padEnd(6)}`
    + `veil=${flag(sample.veil).padEnd(6)}`
    + `black=${flag(sample.blackout).padEnd(6)}`
    + `cover=${flag(sample.openingBlack).padEnd(6)}`
    + `${sample.begin ? 'BEGIN' : ''}`;
}

async function buildContactSheet(frames, outPath) {
  if (!frames.length) return null;
  const tiles = await Promise.all(frames.map(async frame => {
    const label = Buffer.from(
      `<svg width="${SHEET_TILE_WIDTH}" height="26">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)"/>
        <text x="8" y="18" font-family="monospace" font-size="15" fill="#f4e7c6">${frame.label}</text>
      </svg>`,
    );
    return sharp(frame.file)
      .resize({ width: SHEET_TILE_WIDTH })
      .composite([{ input: label, gravity: 'southwest' }])
      .toBuffer({ resolveWithObject: true });
  }));

  const tileHeight = tiles[0].info.height;
  const rows = Math.ceil(tiles.length / SHEET_COLUMNS);
  const sheet = sharp({
    create: {
      width: SHEET_COLUMNS * SHEET_TILE_WIDTH,
      height: rows * tileHeight,
      channels: 3,
      background: { r: 12, g: 12, b: 14 },
    },
  });
  await sheet
    .composite(tiles.map((tile, index) => ({
      input: tile.data,
      left: (index % SHEET_COLUMNS) * SHEET_TILE_WIDTH,
      top: Math.floor(index / SHEET_COLUMNS) * tileHeight,
    })))
    .png()
    .toFile(outPath);
  return outPath;
}

async function runOnce(page, { url, interval, maxMs, outDir, index }) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  // The menu sets pointer-events only once it has hydrated and read the save
  // snapshot. Clicking before that lands on nothing and the run stalls.
  await page.waitForSelector('[data-testid="three-launch-overlay"][data-interactive="true"]', {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^New Expedition$/i }).click({ timeout: 45_000 });

  const frameDir = path.join(outDir, `run-${index}`);
  await fs.mkdir(frameDir, { recursive: true });

  const t0 = Date.now();
  await page.getByRole('button', { name: /^Darwin\b/i }).click({ timeout: 45_000 });

  const samples = [];
  const frames = [];
  let clickedBeginMs = null;
  let overlayGoneMs = null;
  let frameIndex = 0;

  // One loop drives everything: sample, shoot, and press Begin the moment it is
  // offered. A separate poller racing the screenshots is what made earlier
  // attempts hang.
  while (Date.now() - t0 < maxMs) {
    const elapsedMs = Date.now() - t0;
    let sample;
    try {
      sample = await page.evaluate(DOM_SAMPLER);
    } catch {
      break;
    }
    samples.push({ elapsedMs, ...sample });

    const file = path.join(frameDir, `${String(frameIndex).padStart(3, '0')}.png`);
    try {
      await page.screenshot({ path: file });
      frames.push({
        file,
        label: `${(elapsedMs / 1000).toFixed(1)}s  ${sample.launchState || '-'}`
          + `${sample.prologuePresent ? ' prologue' : ''}`
          + `${sample.departing === 'true' ? ' DEPARTING' : ''}`
          + `${sample.begin ? ' BEGIN' : ''}`,
      });
      frameIndex += 1;
    } catch {
      // A screenshot during teardown is not worth failing the run over.
    }

    if (sample.begin && clickedBeginMs === null) {
      clickedBeginMs = elapsedMs;
      await page.getByRole('button', { name: /^Begin exploring/i }).click().catch(() => {});
    }
    if (clickedBeginMs !== null && !sample.overlayPresent && overlayGoneMs === null) {
      overlayGoneMs = elapsedMs;
    }
    // Keep shooting a little past the reveal, then stop.
    if (overlayGoneMs !== null && elapsedMs - overlayGoneMs > 1500) break;

    const spent = Date.now() - t0 - elapsedMs;
    await page.waitForTimeout(Math.max(0, interval - spent));
  }

  const handoff = await page.evaluate(() => (window.__threeLaunchHandoff?.events || [])
    .map(event => ({ label: event.label, elapsedMs: Math.round(event.elapsedMs) })))
    .catch(() => []);

  const sheetPath = await buildContactSheet(frames, path.join(outDir, `contact-sheet-${index}.png`));
  return { clickedBeginMs, overlayGoneMs, samples, handoff, sheetPath };
}

async function main() {
  const options = parseArgs(process.argv);
  const outDir = path.resolve('test-results/intro-timing');
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const browser = await launchChromium({ args: NO_THROTTLE_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.bringToFront();

  const runs = [];
  try {
    for (let index = 0; index < options.repeat; index += 1) {
      const run = await runOnce(page, { ...options, outDir, index });
      runs.push(run);
      console.log(`\n=== run ${index + 1} ===`);
      console.log(`  Begin offered at ${run.clickedBeginMs ?? 'never'}ms`);
      console.log(`  overlay gone at  ${run.overlayGoneMs ?? 'never'}ms`);
      console.log('\n  launch handoff');
      for (const event of run.handoff) {
        console.log(`    ${String(event.elapsedMs).padStart(6)}ms  ${event.label}`);
      }
      console.log('\n  screen timeline');
      for (const sample of run.samples) console.log(`    ${formatRow(sample.elapsedMs, sample)}`);
      if (run.sheetPath) console.log(`\n  contact sheet: ${path.relative(process.cwd(), run.sheetPath)}`);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  await fs.writeFile(path.join(outDir, 'runs.json'), JSON.stringify({ url: options.url, runs }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
