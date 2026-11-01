import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePeriodic } from './lib/generatedTextureBake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets-src/rancho-materials');
const OUT = path.join(ROOT, 'public/assets/textures/interiors/rancho');
const SIZE = 1024;
const DATA_SIZE = 512;
const MATERIALS = [
  { name: 'daub', tileMetres: 1.8, reliefMetres: 0.018 },
  { name: 'thatch', tileMetres: 1.6, reliefMetres: 0.028 },
];

await fs.mkdir(OUT, { recursive: true });
const report = { albedoSize: SIZE, dataSize: DATA_SIZE, materials: [] };
for (const config of MATERIALS) {
  const { name, tileMetres, reliefMetres } = config;
  const colorFile = path.join(SOURCE, `${name}-color.png`);
  const heightFile = path.join(SOURCE, `${name}-height.png`);
  const color = makePeriodic(await sharp(colorFile).resize(SIZE, SIZE).removeAlpha().raw().toBuffer(), 3, true);
  // A modest blur removes image-generation speckle before taking derivatives.
  const height = makePeriodic(await sharp(heightFile).resize(DATA_SIZE, DATA_SIZE).grayscale().blur(0.65).raw().toBuffer(), 1, false, DATA_SIZE);
  const normal = Buffer.alloc(DATA_SIZE * DATA_SIZE * 3);
  const roughness = Buffer.alloc(DATA_SIZE * DATA_SIZE);
  const at = (x, y) => height[((y + DATA_SIZE) % DATA_SIZE) * DATA_SIZE + (x + DATA_SIZE) % DATA_SIZE] / 255;
  const gain = DATA_SIZE * reliefMetres / (2 * tileMetres);
  for (let y = 0; y < DATA_SIZE; y += 1) {
    for (let x = 0; x < DATA_SIZE; x += 1) {
      const i = y * DATA_SIZE + x;
      const nx = -(at(x + 1, y) - at(x - 1, y)) * gain;
      // OpenGL +Y: image rows run opposite to texture v.
      const ny = (at(x, y + 1) - at(x, y - 1)) * gain;
      const length = Math.hypot(nx, ny, 1);
      normal[i * 3] = Math.round((nx / length * 0.5 + 0.5) * 255);
      normal[i * 3 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      normal[i * 3 + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      // Both materials stay dry and matte, with slightly rougher recesses.
      roughness[i] = Math.round((0.87 + (1 - height[i] / 255) * 0.1) * 255);
    }
  }
  await Promise.all([
    sharp(color, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 88 }).toFile(path.join(OUT, `${name}-albedo.webp`)),
    sharp(normal, { raw: { width: DATA_SIZE, height: DATA_SIZE, channels: 3 } }).webp({ lossless: true }).toFile(path.join(OUT, `${name}-normal.webp`)),
    sharp(roughness, { raw: { width: DATA_SIZE, height: DATA_SIZE, channels: 1 } }).webp({ lossless: true }).toFile(path.join(OUT, `${name}-roughness.webp`)),
  ]);
  const sourceSha256 = {};
  for (const file of [colorFile, heightFile]) sourceSha256[path.basename(file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const files = await Promise.all(['albedo', 'normal', 'roughness'].map(async role => {
    const file = `${name}-${role}.webp`;
    return { file, bytes: (await fs.stat(path.join(OUT, file))).size };
  }));
  report.materials.push({ ...config, sourceSha256, files });
}
await fs.writeFile(path.join(SOURCE, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
