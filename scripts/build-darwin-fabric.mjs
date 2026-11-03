// Reuse the period wool's generated height source, not atlas color/lighting.
// node scripts/build-darwin-fabric.mjs
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePeriodic } from './lib/generatedTextureBake.mjs';

const source = 'assets-src/period-materials/wool-height.png';
const output = 'public/assets/models/darwin5-fabric-height.webp';
const size = 512;
const input = await fs.readFile(source);
const height = makePeriodic(await sharp(input).resize(size, size)
  .removeAlpha().grayscale().blur(0.65).raw().toBuffer(), 1, false, size);
await sharp(height, { raw: { width: size, height: size, channels: 1 } })
  .webp({ lossless: true }).toFile(output);
if (!(await sharp(output).grayscale().raw().toBuffer()).equals(height)) {
  throw new Error('Wool height encoding changed data values');
}
const report = {
  source, sourceSha256: createHash('sha256').update(input).digest('hex'),
  provenance: 'assets-src/period-materials/provenance.json',
  output, size, bytes: (await fs.stat(output)).size,
  tileMetres: 0.18, reliefMetres: 0.0006, losslessDataVerified: true,
};
await fs.mkdir('assets-src/darwin/fabric', { recursive: true });
await fs.writeFile('assets-src/darwin/fabric/build-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
