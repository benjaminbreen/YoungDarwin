#!/usr/bin/env node
//
// Bake every region's foot-path splat mask to a PNG.
//
//   npm run asset:path-splats
//
// The generator in three-game/world/paths/standardPath.js runs ~200 million
// transcendental calls for a 1024px mask. Doing that in the browser costs about
// four seconds of uninterrupted main thread inside a React render, which is
// where the zone-transition freeze and a large slice of first load came from.
// Baking moves it here, where four seconds is free.
//
// Every key in PATH_SPLAT_BAKES must have a recipe below and vice versa; the
// run fails otherwise, so a region cannot ship asking for a file that does not
// exist.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  STANDARD_FOOT_PATH_SPLAT_BOUNDS,
  createStandardFootPathSplatTexture,
} from '../three-game/world/paths/standardPath.js';
import { PATH_SPLAT_BAKES } from '../three-game/world/paths/pathSplatBakes.js';

import { POST_SCRUB_RISE_PATH_POINTS } from '../three-game/world/regions/postScrubRise/path.js';
import { POST_SCRUB_RISE_SPLAT_BOUNDS } from '../three-game/world/regions/postScrubRise/material.js';
import { NORTHERN_HIGHLANDS_PATH_POINTS } from '../three-game/world/regions/northernHighlands/path.js';
import { NORTHERN_HIGHLANDS_SPLAT_BOUNDS } from '../three-game/world/regions/northernHighlands/material.js';
import { N_SHORE_PATH_POINTS } from '../three-game/world/regions/northShore/terrain.js';
import { N_SHORE_PATH_SPLAT_BOUNDS } from '../three-game/world/regions/northShore/material.js';
import { POST_OFFICE_BAY_PATH_POINTS } from '../three-game/world/regions/postOfficeBay/terrain.js';
import { POST_OFFICE_PATH_SPLAT_BOUNDS } from '../three-game/world/regions/postOfficeBay/material.js';
import { LAVA_FLATS_PATH_POINTS } from '../three-game/world/regions/lavaFlats/path.js';
import { LAVA_FLATS_SPLAT_BOUNDS } from '../three-game/world/regions/lavaFlats/material.js';
import { PENAL_COLONY_PATHS } from '../three-game/world/regions/penalColony/path.js';
import { PENAL_COLONY_SPLAT_BOUNDS } from '../three-game/world/regions/penalColony/material.js';
import { WATKINS_CREEK_PATH_POINTS } from '../three-game/world/regions/watkinsCreek/path.js';
import { WATKINS_CREEK_SPLAT_BOUNDS } from '../three-game/world/regions/watkinsCreek/material.js';
import { COASTAL_SCRUBLAND_PATH_POINTS } from '../three-game/world/regions/coastalScrubland/path.js';
import { COASTAL_SCRUBLAND_SPLAT_BOUNDS } from '../three-game/world/regions/coastalScrubland/material.js';
import { PUNTA_SUR_PATH_POINTS } from '../three-game/world/regions/puntaSur/path.js';
import { PUNTA_SUR_SPLAT_BOUNDS } from '../three-game/world/regions/puntaSur/material.js';
import { SOUTHEASTERN_COAST_PATH_POINTS } from '../three-game/world/regions/southeasternCoast/path.js';
import { SOUTHEASTERN_COAST_SPLAT_BOUNDS } from '../three-game/world/regions/southeasternCoast/material.js';
import { EL_MIRADOR_PATH_POINTS } from '../three-game/world/regions/elMirador/path.js';
import { EL_MIRADOR_SPLAT_BOUNDS } from '../three-game/world/regions/elMirador/material.js';
import { ROCKY_CLEARING_PATH_POINTS } from '../three-game/world/regions/rockyClearing/path.js';
import { EASTERN_CLIFFS_PATH_POINTS } from '../three-game/world/regions/easternCliffs/path.js';
import { EASTERN_CLIFFS_SPLAT_BOUNDS } from '../three-game/world/regions/easternCliffs/material.js';
import { GRASS_TEST_PATH_POINTS } from '../three-game/world/regions/grassTest/path.js';
import { HYBRID_GRASS_PATH_POINTS } from '../three-game/world/regions/grassHybridTest/path.js';

// bounds and minimumWidth must match what the material passes to
// standardFootPathSplatUniforms, or the mask samples offset from the terrain
// the shader draws it on.
const RECIPES = {
  'n-shore': {
    pathPoints: N_SHORE_PATH_POINTS[0],
    bounds: N_SHORE_PATH_SPLAT_BOUNDS,
    minimumWidth: 1.76,
  },
  'post-office-bay': {
    pathPoints: POST_OFFICE_BAY_PATH_POINTS,
    bounds: POST_OFFICE_PATH_SPLAT_BOUNDS,
    minimumWidth: 1.68,
  },
  'lava-flats': {
    pathPoints: LAVA_FLATS_PATH_POINTS,
    bounds: LAVA_FLATS_SPLAT_BOUNDS,
    minimumWidth: 1.28,
  },
  'penal-colony': {
    pathPoints: PENAL_COLONY_PATHS,
    bounds: PENAL_COLONY_SPLAT_BOUNDS,
  },
  'watkins-creek': {
    pathPoints: WATKINS_CREEK_PATH_POINTS,
    bounds: WATKINS_CREEK_SPLAT_BOUNDS,
    minimumWidth: 1.62,
  },
  'coastal-scrubland': {
    pathPoints: COASTAL_SCRUBLAND_PATH_POINTS,
    bounds: COASTAL_SCRUBLAND_SPLAT_BOUNDS,
    minimumWidth: 1.65,
  },
  'punta-sur': {
    pathPoints: PUNTA_SUR_PATH_POINTS,
    bounds: PUNTA_SUR_SPLAT_BOUNDS,
    minimumWidth: 1.5,
  },
  'southeastern-coast': {
    pathPoints: SOUTHEASTERN_COAST_PATH_POINTS,
    bounds: SOUTHEASTERN_COAST_SPLAT_BOUNDS,
    minimumWidth: 1.55,
  },
  'el-mirador': {
    pathPoints: EL_MIRADOR_PATH_POINTS,
    bounds: EL_MIRADOR_SPLAT_BOUNDS,
    minimumWidth: 1.58,
  },
  'rocky-clearing': {
    pathPoints: ROCKY_CLEARING_PATH_POINTS,
    bounds: STANDARD_FOOT_PATH_SPLAT_BOUNDS,
    minimumWidth: 2.5,
  },
  'eastern-cliffs': {
    pathPoints: EASTERN_CLIFFS_PATH_POINTS,
    bounds: EASTERN_CLIFFS_SPLAT_BOUNDS,
    minimumWidth: 1.48,
  },
  'grass-test': {
    pathPoints: GRASS_TEST_PATH_POINTS,
    bounds: STANDARD_FOOT_PATH_SPLAT_BOUNDS,
    minimumWidth: 2.35,
  },
  'grass-hybrid-test': {
    pathPoints: HYBRID_GRASS_PATH_POINTS,
    bounds: STANDARD_FOOT_PATH_SPLAT_BOUNDS,
  },
  'post-scrub-rise': {
    pathPoints: POST_SCRUB_RISE_PATH_POINTS,
    bounds: POST_SCRUB_RISE_SPLAT_BOUNDS,
    minimumWidth: 1.62,
  },
  'northern-highlands': {
    pathPoints: NORTHERN_HIGHLANDS_PATH_POINTS,
    bounds: NORTHERN_HIGHLANDS_SPLAT_BOUNDS,
    minimumWidth: 1.58,
  },
};

const publicRoot = path.join(process.cwd(), 'public');

function assertManifestMatchesRecipes() {
  const manifestKeys = Object.keys(PATH_SPLAT_BAKES);
  const recipeKeys = Object.keys(RECIPES);
  const missing = manifestKeys.filter(key => !recipeKeys.includes(key));
  const orphaned = recipeKeys.filter(key => !manifestKeys.includes(key));
  if (missing.length || orphaned.length) {
    const lines = [];
    if (missing.length) lines.push(`  no recipe for: ${missing.join(', ')}`);
    if (orphaned.length) lines.push(`  not in pathSplatBakes.js: ${orphaned.join(', ')}`);
    throw new Error(`path splat manifest and bake recipes disagree\n${lines.join('\n')}`);
  }
}

async function build(key) {
  const { pathPoints, bounds, minimumWidth } = RECIPES[key];
  const startedAt = performance.now();
  const texture = createStandardFootPathSplatTexture({
    pathPoints,
    bounds,
    size: bounds.size,
    ...(minimumWidth === undefined ? {} : { minimumWidth }),
  });
  const { data, width, height } = texture.image;
  const outputPath = path.join(publicRoot, PATH_SPLAT_BAKES[key].replace(/^\//, ''));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  texture.dispose();
  const bytes = (await fs.stat(outputPath)).size;
  console.log(
    `[path-splat] ${key.padEnd(20)} ${width}x${height}`
    + ` ${(performance.now() - startedAt).toFixed(0)}ms -> ${(bytes / 1024).toFixed(0)}KB`,
  );
  return performance.now() - startedAt;
}

assertManifestMatchesRecipes();
const only = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const keys = only.length ? only : Object.keys(RECIPES);
let generatedMs = 0;
for (const key of keys) {
  if (!RECIPES[key]) throw new Error(`unknown path splat "${key}"`);
  generatedMs += await build(key);
}
console.log(
  `[path-splat] ${keys.length} mask(s); ${(generatedMs / 1000).toFixed(1)}s of generation`
  + ' moved off the browser main thread',
);
