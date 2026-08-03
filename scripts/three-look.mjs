#!/usr/bin/env node
//
// Fast look: boot the game and take screenshots. One browser, many shots.
//
//   node scripts/three-look.mjs                                  default view, Post Office Bay
//   node scripts/three-look.mjs --zone=E_MID --time=17.5 --hud=0
//   node scripts/three-look.mjs --views=inland,ocean,ship --zone=POST_OFFICE_BAY
//   node scripts/three-look.mjs --yaw=180,90,0 --zoom=6
//
// Written to test-results/looks/<stamp>-<zone>/ and the paths are printed, so
// the images can be read straight back. This is the loop for judging a visual
// change; three-perf-lab.mjs is the loop for judging its cost.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULTS,
  bootToGameplay,
  hideHud,
  openSession,
  settle,
  yawTo,
} from './perf-lab/driver.mjs';

const OUT_ROOT = path.join(process.cwd(), 'test-results', 'looks');

// Named headings, in degrees **relative to the spawn facing** — spawn facings
// differ per zone, so an absolute world yaw would frame something different in
// every region. The harness rotates with the same keys a player uses and stops
// within a few degrees, so a named view reproduces run to run.
const VIEWS = {
  spawn: 0,
  right: -90,
  back: 180,
  left: 90,
};

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

async function main() {
  const options = parseArgs(process.argv);
  const zone = options.zone || DEFAULTS.zone;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUT_ROOT, `${stamp}-${zone.toLowerCase()}`);
  await fs.mkdir(outDir, { recursive: true });

  const params = options.params ? JSON.parse(options.params) : {};
  if (options.time !== undefined) params.time = options.time;

  const sessionOptions = {
    url: options.url,
    zone,
    quality: options.quality,
    width: Number(options.width) || 1600,
    height: Number(options.height) || 1000,
    deviceScaleFactor: Number(options.dpr) || 2,
    settleMs: options.settle !== undefined ? Number(options.settle) : 6000,
    params,
  };

  const targets = [];
  if (options.yaw) {
    for (const value of String(options.yaw).split(',')) {
      targets.push({ name: `yaw${value}`, degrees: Number(value) });
    }
  } else if (options.views) {
    for (const name of String(options.views).split(',')) {
      if (!(name in VIEWS)) throw new Error(`Unknown view "${name}". Known: ${Object.keys(VIEWS).join(', ')}`);
      targets.push({ name, degrees: VIEWS[name] });
    }
  } else {
    targets.push({ name: 'spawn', degrees: 0 });
  }

  const session = await openSession(sessionOptions);
  const written = [];
  try {
    const boot = await bootToGameplay(session.page, sessionOptions);
    console.log(`[look] ${zone} ready in ${(boot.timings.gameplayReadyMs / 1000).toFixed(1)}s`);
    await settle(session.page, sessionOptions);
    if (options.hud === '0' || options.hud === 'off') await hideHud(session.page);
    if (options.zoom) {
      for (let i = 0; i < Number(options.zoom); i += 1) {
        await session.page.mouse.wheel(0, 200);
        await session.page.waitForTimeout(60);
      }
      await session.page.waitForTimeout(600);
    }

    const canvas = session.page.locator('canvas').first();
    for (const target of targets) {
      if (target.degrees !== 0 || targets.length > 1) {
        const result = await yawTo(session.page, target.degrees);
        if (!result.ok) {
          console.log(`[look] ${target.name}: heading not reached (${result.reason}), shooting anyway`);
        }
      }
      // Let motion blur / camera damping / streaming settle before the shot.
      await session.page.waitForTimeout(1200);
      const file = path.join(outDir, `${target.name}.png`);
      const shooter = options.fullPage === 'true' ? session.page : canvas;
      await shooter.screenshot({ path: file });
      written.push(file);
      console.log(`[look] ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await session.browser.close().catch(() => {});
  }

  if (session.consoleErrors.length) {
    console.log(`[look] ${session.consoleErrors.length} console error(s); first: ${session.consoleErrors[0].slice(0, 200)}`);
  }
  console.log(`[look] ${written.length} shot(s) in ${path.relative(process.cwd(), outDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
