#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXTURE_DIR = path.join(ROOT, 'public/assets/textures/world/floreana-pbr');
const LAYERS = [
  'red-cinder-dirt',
  'coastal-scrub',
  'dry-grass-litter',
  'dark-basalt-gravel',
];

async function readRgb(file) {
  return sharp(file, { limitInputPixels: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function readGray(file) {
  return sharp(file, { limitInputPixels: false })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function buildLayer(name) {
  const normalPath = path.join(TEXTURE_DIR, `${name}_normal.png`);
  const roughnessPath = path.join(TEXTURE_DIR, `${name}_roughness.png`);
  const heightPath = path.join(TEXTURE_DIR, `${name}_height.png`);
  const outputPath = path.join(TEXTURE_DIR, `${name}_nrh.png`);
  const [normal, roughness, height] = await Promise.all([
    readRgb(normalPath),
    readGray(roughnessPath),
    readGray(heightPath),
  ]);

  const { width, height: pixelHeight, channels: normalChannels } = normal.info;
  for (const source of [roughness, height]) {
    if (source.info.width !== width || source.info.height !== pixelHeight) {
      throw new Error(`${name}: PBR channel dimensions do not match.`);
    }
  }

  const packed = Buffer.alloc(width * pixelHeight * 4);
  for (let pixel = 0; pixel < width * pixelHeight; pixel += 1) {
    packed[pixel * 4] = normal.data[pixel * normalChannels];
    packed[pixel * 4 + 1] = normal.data[pixel * normalChannels + 1];
    packed[pixel * 4 + 2] = roughness.data[pixel];
    packed[pixel * 4 + 3] = height.data[pixel];
  }

  await sharp(packed, { raw: { width, height: pixelHeight, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  console.log(`Built ${path.relative(ROOT, outputPath)}`);
}

for (const layer of LAYERS) await buildLayer(layer);
