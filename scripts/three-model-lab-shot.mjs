#!/usr/bin/env node
//
// Screenshot a model in the animal animation lab. The fast loop for judging a
// creature model: no walking to a spawn, just the rig on the lab grid.
//
//   node scripts/three-model-lab-shot.mjs --animal=seaUrchinProcedural
//   node scripts/three-model-lab-shot.mjs --animal=parrotfishProcedural --mode=live --wait=4000
//
// --views orbits the preview and shoots each named angle. The lab's viewport
// is an OrbitControls rig, so the angles are produced by dragging it exactly
// as a human would; they reproduce run to run because the start pose is fixed.
//
//   node scripts/three-model-lab-shot.mjs --animal=hammerheadProcedural --views=default,top,front
//
// Written to test-results/looks/<stamp>-lab-<animal>/ and the paths printed.

import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULTS, bootToGameplay, openSession } from './perf-lab/driver.mjs';

function parseArgs(argv) {
  const options = {};
  for (const argument of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (match) options[match[1]] = match[2] === undefined ? true : match[2];
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const animal = options.animal;
  if (!animal) throw new Error('Pass --animal=<lab entry id>, e.g. --animal=seaUrchinProcedural');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(process.cwd(), 'test-results', 'looks', `${stamp}-lab-${animal.toLowerCase()}`);
  await fs.mkdir(outDir, { recursive: true });

  const sessionOptions = {
    zone: options.zone || DEFAULTS.zone,
    width: Number(options.width) || 1600,
    height: Number(options.height) || 1000,
    deviceScaleFactor: Number(options.dpr) || 2,
    params: {
      animalAnimationLab: animal,
      ...(options.mode ? { animalAnimationMode: options.mode } : {}),
    },
  };

  const session = await openSession(sessionOptions);
  try {
    const boot = await bootToGameplay(session.page, sessionOptions);
    console.log(`[lab-shot] ready in ${(boot.timings.gameplayReadyMs / 1000).toFixed(1)}s`);
    // The panel's preview canvas mounts its own R3F scene; give the model and
    // its lazy chunk a moment.
    await session.page.waitForTimeout(Number(options.wait) || 3000);

    // Drag deltas from the default pose, in preview-canvas pixels.
    const VIEWS = {
      default: [0, 0],
      top: [0, -260],
      bottom: [0, 220],
      front: [-300, -40],
      back: [300, -40],
      quarter: [-150, -110],
    };
    const names = String(options.views || 'default').split(',');
    const preview = session.page.locator('canvas').last();
    const box = await preview.boundingBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    let applied = [0, 0];

    for (const name of names) {
      const target = VIEWS[name];
      if (!target) throw new Error(`Unknown view "${name}". Known: ${Object.keys(VIEWS).join(', ')}`);
      const dx = target[0] - applied[0];
      const dy = target[1] - applied[1];
      if (dx || dy) {
        await session.page.mouse.move(centre.x, centre.y);
        await session.page.mouse.down();
        await session.page.mouse.move(centre.x + dx, centre.y + dy, { steps: 30 });
        await session.page.mouse.up();
        applied = target;
        await session.page.waitForTimeout(900);
      }
      const file = path.join(outDir, `${animal}-${name}.png`);
      await preview.screenshot({ path: file });
      console.log(`[lab-shot] ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await session.browser.close().catch(() => {});
  }
  if (session.consoleErrors.length) {
    console.log(`[lab-shot] ${session.consoleErrors.length} console error(s); first: ${session.consoleErrors[0].slice(0, 200)}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
