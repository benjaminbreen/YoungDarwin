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
  'olivine-beach',
  // Grass and loam are repeated at a relatively small world-space scale; a
  // 768px packed map retains sub-centimetre relief while trimming about 44%
  // of their uncompressed GPU footprint versus the separate 1K maps.
  'grass',
  'loam',
];

const TARGET_SIZE = {
  // These packed maps tile every ~3-6 world metres. At 512px they still
  // deliver far more texel density than the camera can resolve, while cutting
  // PNG decode and GPU upload cost to one quarter of the former 1K maps.
  'red-cinder-dirt': 512,
  'coastal-scrub': 512,
  'coastal-grass-shoulder': 512,
  'dry-grass-litter': 512,
  'dark-basalt-gravel': 512,
  grass: 768,
  loam: 768,
  'olivine-beach': 768,
};

const OPTIMIZED_ALBEDO = [
  {
    source: 'coastal-scrub_albedo.png',
    output: 'coastal-scrub_albedo.webp',
    quality: 84,
  },
  {
    source: 'coastal-grass-shoulder_albedo.png',
    output: 'coastal-grass-shoulder_albedo.webp',
    quality: 84,
  },
  {
    source: 'weathered_highland_basalt_albedo_1024.png',
    output: 'weathered_highland_basalt_albedo_1024.webp',
    quality: 86,
  },
];

const BRACKISH_MUD_SIZE = 768;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

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
  const requestedSize = TARGET_SIZE[name];
  const targetSize = requestedSize
    ? { width: requestedSize, height: requestedSize }
    : { width: heightMetadata.width, height: heightMetadata.height };
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

async function buildOptimizedAlbedo({ source, output, quality }) {
  const sourcePath = path.join(TEXTURE_DIR, source);
  const outputPath = path.join(TEXTURE_DIR, output);
  await sharp(sourcePath, { limitInputPixels: false })
    .webp({ quality, smartSubsample: true, effort: 6 })
    .toFile(outputPath);
  console.log(`Built ${path.relative(ROOT, outputPath)}`);
}

async function buildBrackishMudLayer() {
  const sourcePath = path.join(TEXTURE_DIR, 'mangrove-lagoon_albedo.png');
  const albedoPath = path.join(TEXTURE_DIR, 'brackish-mud_albedo.webp');
  const outputPath = path.join(TEXTURE_DIR, 'brackish-mud_nrh.png');
  const resized = sharp(sourcePath, { limitInputPixels: false })
    .resize(BRACKISH_MUD_SIZE, BRACKISH_MUD_SIZE, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });

  const [albedo, localBlur, broadBlur] = await Promise.all([
    resized.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    resized.clone().grayscale().blur(1.4).raw().toBuffer({ resolveWithObject: true }),
    resized.clone().grayscale().blur(7.5).raw().toBuffer({ resolveWithObject: true }),
    resized.clone()
      .webp({ quality: 84, smartSubsample: true, effort: 6 })
      .toFile(albedoPath),
  ]);

  const { width, height, channels } = albedo.info;
  const heightField = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * channels;
    const luminance = albedo.data[offset] * 0.2126
      + albedo.data[offset + 1] * 0.7152
      + albedo.data[offset + 2] * 0.0722;
    const local = localBlur.data[pixel];
    const broad = broadBlur.data[pixel];
    // Local contrast carries pebbles and litter while the broader component
    // retains shallow mud plates. Keeping the range tight prevents inflated,
    // albedo-shaped relief under low grazing light.
    heightField[pixel] = clampByte(128 + (luminance - local) * 0.72 + (local - broad) * 0.5);
  }

  const packed = Buffer.alloc(width * height * 4);
  const at = (x, y) => heightField[((y + height) % height) * width + ((x + width) % width)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * 3.2;
      const ny = -dy * 3.2;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      const normalX = nx * inverseLength;
      const normalY = ny * inverseLength;
      const localRelief = Math.abs(heightField[pixel] - 128) / 32;
      const sourceOffset = pixel * channels;
      const sourceLuminance = albedo.data[sourceOffset] * 0.2126
        + albedo.data[sourceOffset + 1] * 0.7152
        + albedo.data[sourceOffset + 2] * 0.0722;
      // Dark mud reads wetter and smoother; exposed pebbles/litter stay rough.
      const roughness = 142 + sourceLuminance * 0.28 + localRelief * 14;

      packed[offset] = clampByte((normalX * 0.5 + 0.5) * 255);
      packed[offset + 1] = clampByte((normalY * 0.5 + 0.5) * 255);
      packed[offset + 2] = clampByte(roughness);
      packed[offset + 3] = heightField[pixel];
    }
  }

  await sharp(packed, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
  console.log(`Built ${path.relative(ROOT, albedoPath)}`);
  console.log(`Built ${path.relative(ROOT, outputPath)}`);
}

const requestedLayers = process.argv.slice(2);
const layersToBuild = requestedLayers.length > 0
  ? requestedLayers.filter(layer => layer !== 'brackish-mud')
  : LAYERS;
for (const layer of layersToBuild) await buildLayer(layer);
for (const albedo of OPTIMIZED_ALBEDO) await buildOptimizedAlbedo(albedo);
if (requestedLayers.length === 0 || requestedLayers.includes('brackish-mud')) {
  await buildBrackishMudLayer();
}
