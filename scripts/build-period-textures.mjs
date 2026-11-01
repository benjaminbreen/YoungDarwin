import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePeriodic } from './lib/generatedTextureBake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets-src/period-materials');
const OUT = path.join(ROOT, 'public/assets/textures/interiors/period-kit');
const SIZE = 1024;
const DATA_SIZE = 512;
const MATERIALS = [
  { key: 'weatheredWood', name: 'weathered-wood', tileMetres: 0.9, reliefMetres: 0.003, roughness: [0.82, 0.97] },
  { key: 'endGrain', name: 'end-grain', tileMetres: 0.5, reliefMetres: 0.0015, roughness: [0.84, 0.97], periodic: false },
  { key: 'canvas', name: 'canvas', tileMetres: 0.2, reliefMetres: 0.0005, roughness: [0.88, 0.98] },
  { key: 'patchedCanvas', name: 'patched-canvas', tileMetres: 1.6, reliefMetres: 0.0015, roughness: [0.88, 0.98], periodic: false },
  { key: 'linen', name: 'linen', tileMetres: 0.15, reliefMetres: 0.00035, roughness: [0.84, 0.96] },
  { key: 'wool', name: 'wool', tileMetres: 0.18, reliefMetres: 0.0006, roughness: [0.94, 0.995] },
  { key: 'sacking', name: 'sacking', tileMetres: 0.25, reliefMetres: 0.0012, roughness: [0.91, 0.99] },
  { key: 'leather', name: 'leather', tileMetres: 0.25, reliefMetres: 0.00035, roughness: [0.56, 0.84] },
];

await fs.mkdir(OUT, { recursive: true });
const report = { albedoSize: SIZE, dataSize: DATA_SIZE, normalConvention: 'OpenGL +Y; derivatives from height, not color', materials: [] };
for (const config of MATERIALS) {
  const { key, name, tileMetres, reliefMetres } = config;
  const colorFile = path.join(SOURCE, `${key}-color.png`);
  const heightFile = path.join(SOURCE, `${key}-height.png`);
  let color = await sharp(colorFile).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
  let height = await sharp(heightFile).resize(DATA_SIZE, DATA_SIZE).removeAlpha().grayscale().blur(0.65).raw().toBuffer();
  if (config.periodic !== false) {
    color = makePeriodic(color, 3, true, SIZE);
    height = makePeriodic(height, 1, false, DATA_SIZE);
  }
  const normal = Buffer.alloc(DATA_SIZE * DATA_SIZE * 3);
  const roughness = Buffer.alloc(DATA_SIZE * DATA_SIZE);
  const coord = v => config.periodic === false ? Math.max(0, Math.min(DATA_SIZE - 1, v)) : (v + DATA_SIZE) % DATA_SIZE;
  const at = (x, y) => height[coord(y) * DATA_SIZE + coord(x)] / 255;
  const gain = DATA_SIZE * reliefMetres / (2 * tileMetres);
  for (let y = 0; y < DATA_SIZE; y += 1) for (let x = 0; x < DATA_SIZE; x += 1) {
    const i = y * DATA_SIZE + x;
    const nx = -(at(x + 1, y) - at(x - 1, y)) * gain;
    const ny = (at(x, y + 1) - at(x, y - 1)) * gain;
    const length = Math.hypot(nx, ny, 1);
    normal[i * 3] = Math.round((nx / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    roughness[i] = Math.round((config.roughness[0] + (1 - height[i] / 255) * (config.roughness[1] - config.roughness[0])) * 255);
  }
  const albedoFile = path.join(OUT, `${name}-albedo.webp`);
  const normalFile = path.join(OUT, `${name}-normal.webp`);
  const roughnessFile = path.join(OUT, `${name}-roughness.webp`);
  await sharp(color, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 88 }).toFile(albedoFile);
  await sharp(normal, { raw: { width: DATA_SIZE, height: DATA_SIZE, channels: 3 } }).webp({ lossless: true }).toFile(normalFile);
  await sharp(roughness, { raw: { width: DATA_SIZE, height: DATA_SIZE, channels: 1 } }).webp({ lossless: true }).toFile(roughnessFile);
  if (!(await sharp(normalFile).removeAlpha().raw().toBuffer()).equals(normal)) throw new Error(`${name}: normal channel encoding changed`);
  if (!(await sharp(roughnessFile).grayscale().raw().toBuffer()).equals(roughness)) throw new Error(`${name}: roughness channel encoding changed`);
  const sourceSha256 = {};
  for (const file of [colorFile, heightFile]) sourceSha256[path.basename(file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const files = await Promise.all([albedoFile, normalFile, roughnessFile].map(async file => ({ file: path.basename(file), bytes: (await fs.stat(file)).size })));
  report.materials.push({ ...config, sourceSha256, losslessDataVerified: true, files });
}
await fs.writeFile(path.join(SOURCE, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
