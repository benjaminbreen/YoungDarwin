import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXTURE_DIR = path.join(ROOT, 'public/assets/textures/world/floreana-pbr');
const SIZE = 1024;
const NRH_SIZE = 512;

const SOURCE_ALBEDO = path.join(TEXTURE_DIR, 'white-sand_albedo.png');
const SOURCE_NRH = path.join(TEXTURE_DIR, 'galapagos-sand_nrh.png');
const OUTPUT_ALBEDO = path.join(TEXTURE_DIR, 'white-sand-beach_albedo.webp');
const OUTPUT_NRH = path.join(TEXTURE_DIR, 'white-sand-beach_nrh.png');

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function hash2d(x, y, seed) {
  let value = Math.imul(x + seed * 1013, 374761393)
    ^ Math.imul(y - seed * 1619, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

// Periodic value noise keeps the baked tile seamless. It replaces the runtime
// four-octave FBM that previously ran for every terrain fragment.
function periodicNoise(u, v, cells, seed) {
  const px = u * cells;
  const py = v * cells;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const tx = smooth(px - x0);
  const ty = smooth(py - y0);
  const wrap = value => ((value % cells) + cells) % cells;
  const a = hash2d(wrap(x0), wrap(y0), seed);
  const b = hash2d(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2d(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2d(wrap(x0 + 1), wrap(y0 + 1), seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function srgbToLinear(value) {
  if (value <= 0.04045) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const clamped = clamp01(value);
  if (clamped <= 0.0031308) return clamped * 12.92;
  return 1.055 * (clamped ** (1 / 2.4)) - 0.055;
}

async function readRgba(file, size) {
  return sharp(file, { limitInputPixels: false })
    .ensureAlpha()
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function buildAlbedo() {
  const [albedo, nrh] = await Promise.all([
    readRgba(SOURCE_ALBEDO, SIZE),
    readRgba(SOURCE_NRH, SIZE),
  ]);
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4;
      const u = x / SIZE;
      const v = y / SIZE;
      const source = [
        srgbToLinear(albedo.data[index] / 255),
        srgbToLinear(albedo.data[index + 1] / 255),
        srgbToLinear(albedo.data[index + 2] / 255),
      ];
      const sourceLuma = source[0] * 0.299 + source[1] * 0.587 + source[2] * 0.114;
      const broad = periodicNoise(u, v, 4, 17) * 0.64
        + periodicNoise(u, v, 8, 29) * 0.24
        + periodicNoise(u, v, 16, 43) * 0.12;
      const fine = periodicNoise(u, v, 32, 71) * 0.65
        + periodicNoise(u, v, 64, 89) * 0.35;
      const heightGrain = nrh.data[index + 3] / 255 - 0.5;
      const paletteMix = clamp01(broad * 0.64 + fine * 0.16);
      const low = [0.3, 0.3, 0.295];
      const high = [0.46, 0.455, 0.445];

      for (let channel = 0; channel < 3; channel += 1) {
        const shellWhite = low[channel] + (high[channel] - low[channel]) * paletteMix;
        const restrainedChroma = (source[channel] - sourceLuma) * 0.06;
        const value = shellWhite
          + restrainedChroma
          + (sourceLuma - 0.5) * 0.18
          + heightGrain * [0.08, 0.079, 0.076][channel]
          + (fine - 0.5) * [0.03, 0.029, 0.027][channel];
        pixels[index + channel] = Math.round(linearToSrgb(value) * 255);
      }
      pixels[index + 3] = 255;
    }
  }

  await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ quality: 84, effort: 6, smartSubsample: true })
    .toFile(OUTPUT_ALBEDO);
}

async function buildNrh() {
  await sharp(SOURCE_NRH, { limitInputPixels: false })
    .resize(NRH_SIZE, NRH_SIZE, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(OUTPUT_NRH);
}

await Promise.all([buildAlbedo(), buildNrh()]);

const [albedoStats, nrhStats] = await Promise.all([
  fs.stat(OUTPUT_ALBEDO),
  fs.stat(OUTPUT_NRH),
]);
console.log(`Built ${path.relative(ROOT, OUTPUT_ALBEDO)} (${Math.round(albedoStats.size / 1024)} KiB)`);
console.log(`Built ${path.relative(ROOT, OUTPUT_NRH)} (${Math.round(nrhStats.size / 1024)} KiB)`);
