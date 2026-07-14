// Enhance the V1 Darwin baked texture in two ways, then re-embed into the GLB:
//   1. Regrade the albedo (contrast / saturation / warmth / sharpen) to fight
//      the muddy, low-contrast bake.
//   2. Derive a tangent-space normal map from the albedo luminance so the
//      otherwise flat model gets fabric/leather micro-relief under lighting.
//
// Idempotent: it always reads from a one-time pristine backup, so re-running
// with different tunables never compounds. Revert by restoring the backup.
//
// Usage:
//   node scripts/enhance-darwin-texture.mjs [--key=value ...]
// Tunables (defaults in parens):
//   --saturation=1.15  --brightness=1.02  --contrast=1.10  --warm=0.04
//   --sharpen=0.7  --baseQuality=90  --normalSize=2048  --normalStrength=2.2
//   --normalBlur=0.7  --normalScale=0.5  --normalClamp=1.2  --normalQuality=95
//   --flipGreen
// Textures are written as WebP (EXT_texture_webp); --normalQuality switches the
// normal map from lossless to lossy WebP. Reverts via the pristine backup.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ASSET = 'public/assets/models/darwin-final-animated.glb';
const BACKUP_DIR = 'assets-src/darwin/backups';
const BACKUP = path.join(BACKUP_DIR, 'darwin-final-animated.pristine.glb');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const num = (k, d) => (args[k] !== undefined ? Number(args[k]) : d);

const grade = {
  saturation: num('saturation', 1.15),
  brightness: num('brightness', 1.02),
  contrast: num('contrast', 1.10), // slope around mid-grey (128)
  warm: num('warm', 0.04),         // 0..~0.1 — lifts R, drops B
  sharpen: num('sharpen', 0.7),
  quality: num('baseQuality', 90), // base-color WebP quality
};
const normal = {
  size: num('normalSize', 2048),
  strength: num('normalStrength', 2.2),
  blur: num('normalBlur', 0.7),
  scale: num('normalScale', 0.5),
  clamp: num('normalClamp', 1.2),  // caps tilt so hard atlas seams don't spike
  flipGreen: Boolean(args.flipGreen),
  // Normal map defaults to lossless WebP (no shading artifacts); pass
  // --normalQuality=95 to use lossy WebP for a smaller file.
  quality: args.normalQuality !== undefined ? Number(args.normalQuality) : null,
};

function ensureBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(ASSET, BACKUP);
    console.log('Backed up pristine GLB ->', BACKUP);
  } else {
    console.log('Using existing pristine backup ->', BACKUP);
  }
}

async function regrade(baseBuf) {
  const c = grade.contrast;
  const off = 128 * (1 - c);   // out = c*in + off, pivot 128
  const w = grade.warm * 255;  // warm split between R and B
  return sharp(baseBuf, { limitInputPixels: false })
    .modulate({ saturation: grade.saturation, brightness: grade.brightness })
    .linear([c, c, c], [off + w, off, off - w])
    .sharpen({ sigma: grade.sharpen })
    .webp({ quality: grade.quality })
    .toBuffer();
}

async function makeNormal(baseBuf) {
  let pipe = sharp(baseBuf, { limitInputPixels: false })
    .resize(normal.size, normal.size, { fit: 'fill' })
    .removeAlpha()
    .greyscale();
  if (normal.blur >= 0.3) pipe = pipe.blur(normal.blur);
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const out = Buffer.allocUnsafe(w * h * 3);
  const at = (x, y) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return data[cy * w + cx];
  };
  const s = normal.strength;
  const cl = normal.clamp;
  const gy = normal.flipGreen ? -1 : 1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl); // Sobel x
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr); // Sobel y
      let nx = -(dX / 1020) * s;        // 1020 = 4*255 (max Sobel magnitude)
      let ny = -(dY / 1020) * s * gy;
      nx = nx < -cl ? -cl : nx > cl ? cl : nx;
      ny = ny < -cl ? -cl : ny > cl ? cl : ny;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 3;
      out[i] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    }
  }
  const encoded = sharp(out, { raw: { width: w, height: h, channels: 3 } });
  return (normal.quality === null
    ? encoded.webp({ lossless: true })
    : encoded.webp({ quality: normal.quality })
  ).toBuffer();
}

async function main() {
  ensureBackup();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(BACKUP);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const root = doc.getRoot();
  const mat = root.listMaterials()[0];
  const baseTex = mat.getBaseColorTexture();
  const baseBuf = Buffer.from(baseTex.getImage());

  console.log('Regrading albedo (sat', grade.saturation, 'contrast', grade.contrast, 'warm', grade.warm, ')...');
  baseTex.setImage(await regrade(baseBuf)).setMimeType('image/webp');

  console.log('Deriving normal map (', normal.size, 'strength', normal.strength, 'scale', normal.scale, ')...');
  const normalTex = doc.createTexture('darwin_normal')
    .setImage(await makeNormal(baseBuf))
    .setMimeType('image/webp');
  mat.setNormalTexture(normalTex);
  mat.setNormalScale(normal.scale);

  await io.write(ASSET, doc);
  console.log('Wrote', ASSET, (fs.statSync(ASSET).size / 1e6).toFixed(1) + 'MB');
}

main().catch(err => { console.error(err); process.exit(1); });
