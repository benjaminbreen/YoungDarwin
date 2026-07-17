#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXTURE_DIR = path.join(ROOT, 'public/assets/textures/world/floreana-pbr');
const LAYERS = [
  'sandy-tuff',
  'red-cinder-dirt',
  'coastal-scrub',
  'coastal-grass-shoulder',
  'dry-grass-litter',
  'dark-basalt-gravel',
  'galapagos-sand',
];

async function readRgb(file, targetSize) {
  let image = sharp(file, { limitInputPixels: false }).removeAlpha();
  if (targetSize) {
    image = image.resize(targetSize.width, targetSize.height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }
  return image.raw().toBuffer({ resolveWithObject: true });
}

async function readGray(file, targetSize) {
  let image = sharp(file, { limitInputPixels: false }).grayscale();
  if (targetSize) {
    image = image.resize(targetSize.width, targetSize.height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }
  return image.raw().toBuffer({ resolveWithObject: true });
}

async function buildLayer(name) {
  const normalPath = path.join(TEXTURE_DIR, `${name}_normal.png`);
  const roughnessPath = path.join(TEXTURE_DIR, `${name}_roughness.png`);
  const heightPath = path.join(TEXTURE_DIR, `${name}_height.png`);
  const outputPath = path.join(TEXTURE_DIR, `${name}_nrh.png`);
  const heightMetadata = await sharp(heightPath, { limitInputPixels: false }).metadata();
  const targetSize = { width: heightMetadata.width, height: heightMetadata.height };
  const [normal, roughness, height] = await Promise.all([
    readRgb(normalPath, targetSize),
    readGray(roughnessPath, targetSize),
    readGray(heightPath, targetSize),
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

const requestedLayers = process.argv.slice(2);
const layersToBuild = requestedLayers.length > 0 ? requestedLayers : LAYERS;
for (const layer of layersToBuild) await buildLayer(layer);
