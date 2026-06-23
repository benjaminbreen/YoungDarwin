import sharp from 'sharp';

// eye centers in 4K texture space
const A = { x: 2808, y: 218 };  // wonky eye
const B = { x: 3663, y: 2898 }; // good eye
const R = 26; // patch radius
const D = R * 2;

const angles = [-90, -60, -30, 0, 30, 60, 90, 180];
const tex = '/tmp/darwin2-tex-orig.png';

// feathered circular mask
const mask = Buffer.alloc(D * D * 4);
for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
  const d = Math.hypot(x - R + 0.5, y - R + 0.5) / R;
  const a = d < 0.6 ? 255 : d > 1 ? 0 : Math.round(255 * (1 - (d - 0.6) / 0.4));
  const i = (y * D + x) * 4;
  mask[i] = mask[i + 1] = mask[i + 2] = 255; mask[i + 3] = a;
}

const big = 3; // extract larger area to survive rotation crop
const srcPatch = await sharp(tex)
  .extract({ left: B.x - R * big, top: B.y - R * big, width: D * big, height: D * big })
  .png().toBuffer();

for (const ang of angles) {
  const rotated = await sharp(srcPatch).rotate(ang, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(rotated).metadata();
  const cx = Math.floor(meta.width / 2), cy = Math.floor(meta.height / 2);
  const core = await sharp(rotated).extract({ left: cx - R, top: cy - R, width: D, height: D }).png().toBuffer();
  // apply feather mask as alpha
  const masked = await sharp(core).composite([{ input: mask, raw: { width: D, height: D, channels: 4 }, blend: 'dest-in' }]).png().toBuffer();
  const base = await sharp(tex)
    .extract({ left: A.x - 48, top: A.y - 48, width: 96, height: 96 })
    .png().toBuffer();
  const merged = await sharp(base)
    .composite([{ input: masked, left: 48 - R, top: 48 - R }])
    .png().toBuffer();
  await sharp(merged).resize(384, 384, { kernel: 'nearest' }).toFile(`/tmp/transplant-${ang}.png`);
}
console.log('candidates written');
