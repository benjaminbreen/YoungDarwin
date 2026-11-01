import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePeriodic } from './lib/generatedTextureBake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets-src/landscape-materials');
const OUT = path.join(ROOT, 'public/assets/textures/world/floreana-landscape');
const SIZE = 1024;
const DATA_SIZE = 512;
const MATERIALS = [
  { name: 'pahoehoe', source: 'pahoehoe', tileMetres: 2.5, reliefMetres: 0.065 },
  { name: 'wind-turf', source: 'windTurf', tileMetres: 2.5, reliefMetres: 0.014 },
  { name: 'highland-litter', source: 'highlandLitter', tileMetres: 1.5, reliefMetres: 0.018 },
  { name: 'scoria', source: 'scoria', tileMetres: 1.5, reliefMetres: 0.035 },
];

await fs.mkdir(OUT, { recursive: true });
const report = { albedoSize: SIZE, dataSize: DATA_SIZE, packing: 'R normal X, G normal Y (OpenGL), B roughness variation, A height; linear lossless data', materials: [] };
for (const config of MATERIALS) {
  const { name, source, tileMetres, reliefMetres } = config;
  const colorFile = path.join(SOURCE, `${source}-color.png`);
  const heightFile = path.join(SOURCE, `${source}-height.png`);
  const color = makePeriodic(await sharp(colorFile).resize(SIZE, SIZE).removeAlpha().raw().toBuffer(), 3, true);
  const height = makePeriodic(await sharp(heightFile).resize(DATA_SIZE, DATA_SIZE).removeAlpha().grayscale().blur(0.65).raw().toBuffer(), 1, false, DATA_SIZE);
  const packed = Buffer.alloc(DATA_SIZE * DATA_SIZE * 4);
  const at = (x, y) => height[((y + DATA_SIZE) % DATA_SIZE) * DATA_SIZE + (x + DATA_SIZE) % DATA_SIZE] / 255;
  const gain = DATA_SIZE * reliefMetres / (2 * tileMetres);
  for (let y = 0; y < DATA_SIZE; y += 1) {
    for (let x = 0; x < DATA_SIZE; x += 1) {
      const i = y * DATA_SIZE + x;
      const nx = -(at(x + 1, y) - at(x - 1, y)) * gain;
      const ny = (at(x, y + 1) - at(x, y - 1)) * gain;
      const length = Math.hypot(nx, ny, 1);
      packed[i * 4] = Math.round((nx / length * 0.5 + 0.5) * 255);
      packed[i * 4 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      // Relative variation; each shader remaps this into its material's range.
      packed[i * 4 + 2] = Math.round((0.25 + (1 - height[i] / 255) * 0.65) * 255);
      // Keep alpha nonzero: WebP must retain RGB in the lowest recesses too.
      packed[i * 4 + 3] = Math.max(1, height[i]);
    }
  }
  const albedoFile = path.join(OUT, `${name}-albedo.webp`);
  const nrhFile = path.join(OUT, `${name}-nrh.webp`);
  await sharp(color, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 88 }).toFile(albedoFile);
  await sharp(packed, { raw: { width: DATA_SIZE, height: DATA_SIZE, channels: 4 } }).webp({ lossless: true }).toFile(nrhFile);
  const decoded = await sharp(nrhFile).ensureAlpha().raw().toBuffer();
  if (!decoded.equals(packed)) throw new Error(`${name}: packed linear channels changed during encoding`);
  const sourceSha256 = {};
  for (const file of [colorFile, heightFile]) sourceSha256[path.basename(file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const files = await Promise.all([albedoFile, nrhFile].map(async file => ({ file: path.basename(file), bytes: (await fs.stat(file)).size })));
  report.materials.push({ ...config, sourceSha256, losslessDataVerified: true, files });
}
await fs.writeFile(path.join(SOURCE, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

