#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createStandardFootPathSplatTexture } from '../three-game/world/paths/standardPath.js';
import {
  POST_SCRUB_RISE_PATH_POINTS,
} from '../three-game/world/regions/postScrubRise/path.js';
import {
  POST_SCRUB_RISE_SPLAT_BOUNDS,
} from '../three-game/world/regions/postScrubRise/material.js';
import {
  NORTHERN_HIGHLANDS_PATH_POINTS,
} from '../three-game/world/regions/northernHighlands/path.js';
import {
  NORTHERN_HIGHLANDS_SPLAT_BOUNDS,
} from '../three-game/world/regions/northernHighlands/material.js';

const outputDirectory = path.join(
  process.cwd(),
  'public',
  'assets',
  'textures',
  'world',
  'floreana-generated',
);

const definitions = [
  {
    name: 'post-scrub-rise-path-splat.png',
    pathPoints: POST_SCRUB_RISE_PATH_POINTS,
    bounds: POST_SCRUB_RISE_SPLAT_BOUNDS,
    minimumWidth: 1.62,
  },
  {
    name: 'northern-highlands-path-splat.png',
    pathPoints: NORTHERN_HIGHLANDS_PATH_POINTS,
    bounds: NORTHERN_HIGHLANDS_SPLAT_BOUNDS,
    minimumWidth: 1.58,
  },
];

async function build({ name, pathPoints, bounds, minimumWidth }) {
  const startedAt = performance.now();
  const texture = createStandardFootPathSplatTexture({
    pathPoints,
    bounds,
    size: bounds.size,
    minimumWidth,
  });
  const { data, width, height } = texture.image;
  const outputPath = path.join(outputDirectory, name);
  await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  texture.dispose();
  console.log(`[path-splat] ${name}: ${width}x${height} in ${(performance.now() - startedAt).toFixed(0)}ms`);
}

await fs.mkdir(outputDirectory, { recursive: true });
for (const definition of definitions) await build(definition);
