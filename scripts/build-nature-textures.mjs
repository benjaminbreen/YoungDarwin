import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { NATURE_SURFACES } from '../three-game/wildlife/natureTextureCatalog.js';
import { makePeriodic } from './lib/generatedTextureBake.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets-src/nature-materials');
const output = path.join(root, 'public/assets/textures/nature/generated');
await fs.mkdir(output, { recursive: true });
const report = { normalConvention: 'OpenGL +Y; derived from generated height, never pigment', surfaces: [] };

async function sourceImage(config, role) {
  const file = path.join(root, 'assets-src', config.sourceFolder || 'nature-materials', `${config.source}-${role}.png`);
  if (config.cell === undefined) return sharp(file);
  // Resample the complete registered sheet first, then cut its seven cells.
  const [columns, rows] = config.atlasGrid || [4, 2];
  const sheet = await sharp(file).resize(columns * 512, rows * 512, { fit: 'fill' }).toBuffer();
  return sharp(sheet).extract({ left: (config.cell % columns) * 512, top: Math.floor(config.cell / columns) * 512, width: 512, height: 512 });
}

for (const [key, config] of Object.entries(NATURE_SURFACES)) {
  const [width, height] = config.size;
  const dw = width / 2, dh = height / 2;
  let color = await (await sourceImage(config, 'color')).resize(width, height, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  let elevation = await (await sourceImage(config, 'height')).resize(dw, dh, { fit: 'fill' }).grayscale().blur(0.55).raw().toBuffer();
  if (config.periodic?.length) {
    if (width !== height) throw new Error(`Periodic surface must be square: ${key}`);
    color = makePeriodic(color, 3, true, width, config.periodic);
    elevation = makePeriodic(elevation, 1, false, dw, config.periodic);
  }
  const normal = Buffer.alloc(dw * dh * 3), roughness = Buffer.alloc(dw * dh);
  const coordinate = (v, size, axis) => config.periodic?.includes(axis) ? (v + size) % size : Math.max(0, Math.min(size - 1, v));
  const at = (x, y) => elevation[coordinate(y, dh, 1) * dw + coordinate(x, dw, 0)] / 255;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = y * dw + x;
    const nx = -(at(x + 1, y) - at(x - 1, y)) * dw * config.relief / (2 * config.span[0]);
    const ny = (at(x, y + 1) - at(x, y - 1)) * dh * config.relief / (2 * config.span[1]);
    const length = Math.hypot(nx, ny, 1);
    normal[i * 3] = Math.round((nx / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    roughness[i] = Math.round((config.roughness[0] + (1 - elevation[i] / 255) * (config.roughness[1] - config.roughness[0])) * 255);
  }
  const destination = path.join(root, 'public', path.dirname(config.albedo));
  await fs.mkdir(destination, { recursive: true });
  const file = role => path.join(destination, `${config.file}-${role}.webp`);
  await sharp(color, { raw: { width, height, channels: 3 } }).webp({ quality: 90 }).toFile(file('albedo'));
  await sharp(normal, { raw: { width: dw, height: dh, channels: 3 } }).webp({ lossless: true }).toFile(file('normal'));
  await sharp(roughness, { raw: { width: dw, height: dh, channels: 1 } }).webp({ lossless: true }).toFile(file('roughness'));
  if (!(await sharp(file('normal')).removeAlpha().raw().toBuffer()).equals(normal)) throw new Error(`${key}: normal data changed during encoding`);
  if (!(await sharp(file('roughness')).grayscale().raw().toBuffer()).equals(roughness)) throw new Error(`${key}: roughness data changed during encoding`);
  const hashes = {};
  for (const role of ['color', 'height']) hashes[role] = createHash('sha256').update(await fs.readFile(path.join(root, 'assets-src', config.sourceFolder || 'nature-materials', `${config.source}-${role}.png`))).digest('hex');
  report.surfaces.push({ key, ...config, hashes, losslessDataVerified: true });
}
const grassSource = path.join(source, 'grass-fibres-color.png');
const grass = makePeriodic(await sharp(grassSource).resize(1024, 1024).removeAlpha().raw().toBuffer(), 3, true);
await sharp(grass, { raw: { width: 1024, height: 1024, channels: 3 } }).webp({ quality: 90 }).toFile(path.join(output, 'grass-fibres-albedo.webp'));
report.grass = { size: [1024, 1024], sourceSha256: createHash('sha256').update(await fs.readFile(grassSource)).digest('hex') };
const outputs = Object.values(NATURE_SURFACES).flatMap(config => [config.albedo, config.normal, config.roughnessMap]);
outputs.push('/assets/textures/nature/generated/grass-fibres-albedo.webp');
report.runtimeBytes = (await Promise.all(outputs.map(async name => (await fs.stat(path.join(root, 'public', name))).size))).reduce((a, b) => a + b, 0);
await fs.writeFile(path.join(source, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Built ${report.surfaces.length} surface sets and the grass atlas: ${report.runtimeBytes} bytes.`);
