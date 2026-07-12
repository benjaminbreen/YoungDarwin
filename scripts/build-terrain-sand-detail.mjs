// Build restrained PBR data maps for the sand texture sets. Existing height
// maps are used when available; otherwise a high-pass of the authored albedo
// becomes a deliberately shallow grain heightfield. This keeps sand tactile at
// close range without inventing large false relief from painted light/shadow.
//
// Source textures: assets-src/textures/floreana-pbr/
// Runtime textures: public/assets/textures/world/floreana-pbr/
//
// Run: node scripts/build-terrain-sand-detail.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'assets-src/textures/floreana-pbr');
const runtimeDir = path.join(root, 'public/assets/textures/world/floreana-pbr');

const sets = [
  { stem: 'sandy-beach', baseRoughness: 228, normalStrength: 1.45, deriveHeight: true, deriveRoughness: true },
  { stem: 'white-sand', baseRoughness: 238, normalStrength: 1.2 },
  { stem: 'whiter-sand', baseRoughness: 242, normalStrength: 1.0, deriveHeight: true, deriveRoughness: true },
  { stem: 'normal-sand', baseRoughness: 232, normalStrength: 1.35 },
];

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(rgb, index) {
  return 0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2];
}

async function rawImage(file) {
  return sharp(file, { limitInputPixels: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function existingInput(filename) {
  for (const directory of [sourceDir, runtimeDir]) {
    const candidate = path.join(directory, filename);
    if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  throw new Error(`Missing source and runtime texture: ${filename}`);
}

async function outputPng(buffer, width, height, channels, filename) {
  const source = sharp(buffer, { raw: { width, height, channels } });
  const runtime = sharp(buffer, { raw: { width, height, channels } })
    // Repeated terrain detail does not need the oversized source resolution in
    // browser memory. 512² stays crisp at the authored tile scales while
    // cutting normal-map bandwidth substantially.
    .resize({ width: 512, height: 512, fit: 'fill', kernel: 'lanczos3' });
  await Promise.all([
    source.png({ compressionLevel: 9 }).toFile(path.join(sourceDir, filename)),
    runtime.png({ compressionLevel: 9 }).toFile(path.join(runtimeDir, filename)),
  ]);
}

function normalFromHeight(height, width, heightPx, strength) {
  const out = Buffer.alloc(width * heightPx * 3);
  const at = (x, y) => height[Math.min(heightPx - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Dividing by 255 keeps the authored texture's grain much subtler than
      // terrain geometry; normalStrength in the material is a second guard.
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = dy * strength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      const index = (y * width + x) * 3;
      out[index] = clampByte((nx / length * 0.5 + 0.5) * 255);
      out[index + 1] = clampByte((ny / length * 0.5 + 0.5) * 255);
      out[index + 2] = clampByte((nz / length * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

function roughnessFromHeight(height, width, heightPx, baseRoughness) {
  const out = Buffer.alloc(width * heightPx);
  const at = (x, y) => height[Math.min(heightPx - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const grain = Math.min(1, Math.hypot(dx, dy) / 70);
      // Sand stays matte: this merely makes compact, smoother grains catch a
      // little more light instead of becoming visibly glossy.
      out[y * width + x] = clampByte(baseRoughness - grain * 22);
    }
  }
  return out;
}

async function heightForSet(stem, forceDerived = false) {
  const heightFilename = `${stem}_height.png`;
  const hasHeight = await Promise.any(
    [sourceDir, runtimeDir].map(directory => fs.access(path.join(directory, heightFilename))),
  ).then(() => true).catch(() => false);
  if (hasHeight && !forceDerived) {
    const heightPath = await existingInput(heightFilename);
    const { data, info } = await sharp(heightPath, { limitInputPixels: false }).grayscale().raw().toBuffer({ resolveWithObject: true });
    return { height: Buffer.from(data), width: info.width, heightPx: info.height, generated: false };
  }

  const { data, info } = await rawImage(await existingInput(`${stem}_albedo.png`));
  const luma = Buffer.alloc(info.width * info.height);
  for (let index = 0, pixel = 0; pixel < luma.length; pixel += 1, index += info.channels) {
    luma[pixel] = clampByte(luminance(data, index));
  }
  const low = await sharp(luma, { raw: { width: info.width, height: info.height, channels: 1 } })
    .blur(5)
    .raw()
    .toBuffer();
  const height = Buffer.alloc(luma.length);
  for (let index = 0; index < height.length; index += 1) {
    // High-pass only: broad painted colour variation must not become bumps.
    height[index] = clampByte(128 + (luma[index] - low[index]) * 1.2);
  }
  return { height, width: info.width, heightPx: info.height, generated: true };
}

await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(runtimeDir, { recursive: true });

for (const set of sets) {
  const { height, width, heightPx, generated } = await heightForSet(set.stem, set.deriveHeight);
  const files = [];
  if (generated) {
    await outputPng(height, width, heightPx, 1, `${set.stem}_height.png`);
    files.push('height');
  }
  await outputPng(normalFromHeight(height, width, heightPx, set.normalStrength), width, heightPx, 3, `${set.stem}_normal.png`);
  files.push('normal');

  const hasRoughness = await fs.access(path.join(sourceDir, `${set.stem}_roughness.png`)).then(() => true).catch(() => false);
  if (set.deriveRoughness || !hasRoughness) {
    await outputPng(roughnessFromHeight(height, width, heightPx, set.baseRoughness), width, heightPx, 1, `${set.stem}_roughness.png`);
    files.push('roughness');
  }
  console.log(`${set.stem}: ${files.join(', ')}`);
}
