import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePeriodic } from './lib/generatedTextureBake.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets-src/coastal-basalt-preview');
const out = path.join(root, 'public/assets/textures/world/coastal-basalt-preview');
await fs.mkdir(out, { recursive: true });
const size = 1024, dataSize = 512;
const colourPath = path.join(source, 'coastal-basalt-color.png');
const heightPath = path.join(source, 'coastal-basalt-height.png');
const colour = await sharp(colourPath).resize(size, size).removeAlpha().raw().toBuffer();
const reference = await sharp(path.join(root, 'public/assets/textures/world/floreana-pbr/weathered_highland_basalt_albedo_1024.webp')).removeAlpha().raw().toBuffer();
const linear = b => b <= 10 ? b / 3294.6 : ((b / 255 + 0.055) / 1.055) ** 2.4;
const encode = n => Math.round(255 * (n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055));
const mean = data => { let sum = 0; for (let i = 0; i < data.length; i += 3) sum += linear(data[i]) * 0.2126 + linear(data[i + 1]) * 0.7152 + linear(data[i + 2]) * 0.0722; return sum / (data.length / 3); };
// Match the existing material's average reflectance, not the screenshot's
// lighting. The trial tests surface structure without an arbitrary exposure lift.
const reflectanceGain = mean(reference) / mean(colour);
for (let i = 0; i < colour.length; i++) colour[i] = encode(Math.min(1, linear(colour[i]) * reflectanceGain));
const periodicColour = makePeriodic(colour, 3, true, size);
const height = makePeriodic(await sharp(heightPath).resize(dataSize, dataSize).grayscale().blur(0.55).raw().toBuffer(), 1, false, dataSize);
const packed = Buffer.alloc(dataSize * dataSize * 4);
const at = (x, y) => height[((y + dataSize) % dataSize) * dataSize + (x + dataSize) % dataSize] / 255;
const gain = dataSize * 0.012 / (2 * 1.25);
for (let y = 0; y < dataSize; y++) for (let x = 0; x < dataSize; x++) {
  const i = y * dataSize + x;
  const nx = -(at(x + 1, y) - at(x - 1, y)) * gain;
  const ny = (at(x, y + 1) - at(x, y - 1)) * gain;
  const length = Math.hypot(nx, ny, 1);
  packed[i * 4] = Math.round((nx / length * 0.5 + 0.5) * 255);
  packed[i * 4 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
  packed[i * 4 + 2] = Math.round((0.3 + (1 - height[i] / 255) * 0.65) * 255);
  packed[i * 4 + 3] = Math.max(1, height[i]);
}
await sharp(periodicColour, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 91 }).toFile(path.join(out, 'coastal-basalt-albedo.webp'));
const nrhPath = path.join(out, 'coastal-basalt-nrh.webp');
await sharp(packed, { raw: { width: dataSize, height: dataSize, channels: 4 } }).webp({ lossless: true }).toFile(nrhPath);
if (!(await sharp(nrhPath).ensureAlpha().raw().toBuffer()).equals(packed)) throw new Error('NRH channels changed');
const hashes = {};
for (const file of [colourPath, heightPath]) hashes[path.basename(file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = { hashes, reflectanceGain, tileMetres: 1.25, reliefMetres: 0.012, packing: 'linear R normal X, G normal Y OpenGL +Y, B roughness variation, A height', albedoSize: size, dataSize, losslessDataVerified: true };
await fs.writeFile(path.join(source, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(report);
