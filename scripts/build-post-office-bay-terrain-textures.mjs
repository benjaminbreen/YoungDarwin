#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'public/assets/textures/world/floreana-pbr');
const OUTPUT_DIR = path.join(SOURCE_DIR, 'post-office-bay');

// Post Office Bay tiles these maps roughly every four metres. A 512px packed
// data map therefore retains about 120 texels per metre while cutting the two
// former 1K uploads to one quarter of their decoded size. The remaining maps
// retain their authored dimensions and only change lossless container.
const JOBS = [
  {
    source: 'sandy-tuff_nrh.png',
    output: 'sandy-tuff_nrh-512-lossless-v1.webp',
    size: 512,
  },
  {
    source: 'galapagos-sand_albedo.png',
    output: 'galapagos-sand_albedo-lossless-v1.webp',
  },
  {
    source: 'galapagos-sand_nrh.png',
    output: 'galapagos-sand_nrh-512-lossless-v1.webp',
    size: 512,
  },
];

function preparedImage(sourcePath, size) {
  let image = sharp(sourcePath, { limitInputPixels: false });
  if (size) {
    image = image.resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }
  return image;
}

async function buildJob({ source, output, size = null }) {
  const sourcePath = path.join(SOURCE_DIR, source);
  const outputPath = path.join(OUTPUT_DIR, output);
  const expected = await preparedImage(sourcePath, size)
    .raw()
    .toBuffer({ resolveWithObject: true });

  await preparedImage(sourcePath, size)
    .webp({ lossless: true, effort: 6 })
    .toFile(outputPath);

  // Assert that WebP changed only the container. For resized variants this
  // compares against the deterministic Lanczos result, not the 1K source.
  const decoded = await sharp(outputPath, { limitInputPixels: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    expected.info.width !== decoded.info.width
    || expected.info.height !== decoded.info.height
    || expected.info.channels !== decoded.info.channels
    || !expected.data.equals(decoded.data)
  ) {
    throw new Error(`${output}: lossless verification failed.`);
  }

  const [sourceStat, outputStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(outputPath),
  ]);
  const saved = sourceStat.size - outputStat.size;
  console.log(
    `${path.relative(ROOT, outputPath)}: `
    + `${Math.round(outputStat.size / 1024)} KiB `
    + `(${Math.round(saved / 1024)} KiB smaller)`,
  );
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
for (const job of JOBS) await buildJob(job);
