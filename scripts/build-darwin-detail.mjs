// Generate sidecar DETAIL maps for a Darwin GLB from its baseColor albedo:
//   1) a micro-detail NORMAL map  — adds tactile surface relief the model lacks
//      (it ships albedo-only). Derived from the albedo's HIGH-FREQUENCY detail
//      only (a high-pass), so large painted shading isn't double-baked into fake
//      geometry; only fine wrinkle/weave detail becomes relief. Applied gently.
//   2) an enhanced ALBEDO — a mild sharpen for crispness + taming the hot cream
//      trousers (bright, desaturated cloth gets pulled down a touch).
//
// Both load at runtime as sidecars on the same UVs as the baseColor (channel 0),
// non-destructive (the GLB is only read). See ModelAsset.jsx / modelAssets.js.
//
//   node scripts/build-darwin-detail.mjs --glb=public/assets/models/darwin4.glb \
//     --normalOut=public/assets/models/darwin4-normal.webp \
//     --albedoOut=public/assets/models/darwin4-albedo-enh.webp \
//     --normalPreview=/tmp/d4-normal.png --albedoPreview=/tmp/d4-albedo.png
import fs from 'node:fs';
import sharp from 'sharp';

const a = Object.fromEntries(process.argv.slice(2).map(s => {
  const m = s.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [s.replace(/^--/, ''), true];
}));
const num = (k, d) => (a[k] !== undefined ? Number(a[k]) : d);
const glbPath = a.glb || 'public/assets/models/darwin4.glb';
const normalOut = a.normalOut || 'public/assets/models/darwin4-normal.webp';
const albedoOut = a.albedoOut || 'public/assets/models/darwin4-albedo-enh.webp';

// Normal tunables: strength = bump amount; detailSigma = low-freq cutoff (bigger
// → only finer detail survives); denoise smooths webp compression blocks first.
const strength = num('strength', 4.0);
const detailSigma = num('detailSigma', 6);
const denoise = num('denoise', 0.7);
// Albedo tunables.
const sharpenSigma = num('sharpen', 1.0);
const creamTame = num('creamTame', 0.12); // up to 12% darker on hot cream cloth

function extractBaseColorImage(p) {
  const buf = fs.readFileSync(p);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const mat = json.materials[0];
  const texIdx = mat.pbrMetallicRoughness?.baseColorTexture?.index ?? 0;
  const t = json.textures[texIdx];
  const imgIdx = t.extensions?.EXT_texture_webp?.source ?? t.source ?? 0;
  const bv = json.bufferViews[json.images[imgIdx].bufferView];
  const start = binStart + (bv.byteOffset || 0);
  return buf.slice(start, start + bv.byteLength);
}

const albedoBytes = a.albedo ? fs.readFileSync(a.albedo) : extractBaseColorImage(glbPath);
const { data, info } = await sharp(albedoBytes, { limitInputPixels: false })
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels, N = W * H;

// ---- 1) NORMAL MAP from high-pass of luminance -----------------------------
const lum = Buffer.alloc(N);
for (let p = 0, i = 0; p < N; p++, i += C) {
  lum[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
}
const smooth = await sharp(lum, { raw: { width: W, height: H, channels: 1 } }).blur(denoise).raw().toBuffer();
const low = await sharp(lum, { raw: { width: W, height: H, channels: 1 } }).blur(detailSigma).raw().toBuffer();
// height = fine detail only, centred at 128
const height = new Float32Array(N);
for (let p = 0; p < N; p++) height[p] = (smooth[p] - low[p]); // ~[-128,128]

const nrm = Buffer.alloc(N * 3);
const at = (x, y) => height[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y) - at(x - 1, y)) / 255;
    const gy = (at(x, y + 1) - at(x, y - 1)) / 255;
    let vx = -gx * strength;
    let vy = gy * strength; // image +y is down; flip for OpenGL/glTF +Y-up tangent space
    let vz = 1;
    const len = Math.hypot(vx, vy, vz) || 1;
    const p = (y * W + x) * 3;
    nrm[p] = Math.round((vx / len * 0.5 + 0.5) * 255);
    nrm[p + 1] = Math.round((vy / len * 0.5 + 0.5) * 255);
    nrm[p + 2] = Math.round((vz / len * 0.5 + 0.5) * 255);
  }
}
await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 95 }).toFile(normalOut);
if (a.normalPreview) await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).png().toFile(a.normalPreview);

// ---- 2) ENHANCED ALBEDO: tame hot cream, then mild sharpen -----------------
const enh = Buffer.from(data);
for (let p = 0, i = 0; p < N; p++, i += C) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255, s = max === 0 ? 0 : (max - min) / max;
  // soft mask for bright, desaturated cloth (the cream trousers/shirt)
  const vM = Math.max(0, Math.min(1, (v - 0.6) / 0.25));
  const sM = Math.max(0, Math.min(1, (0.22 - s) / 0.12));
  const f = 1 - creamTame * vM * sM;
  enh[i] = r * f; enh[i + 1] = g * f; enh[i + 2] = b * f;
}
let img = sharp(enh, { raw: { width: W, height: H, channels: C } });
if (sharpenSigma > 0) img = img.sharpen({ sigma: sharpenSigma, m1: 0.5, m2: 0.4 });
await img.webp({ quality: 92 }).toFile(albedoOut);
if (a.albedoPreview) await sharp(enh, { raw: { width: W, height: H, channels: C } }).sharpen({ sigma: sharpenSigma, m1: 0.5, m2: 0.4 }).png().toFile(a.albedoPreview);

console.log('normal →', normalOut, (fs.statSync(normalOut).size / 1024).toFixed(0) + 'KB',
  `(strength ${strength}, detailSigma ${detailSigma})`);
console.log('albedo →', albedoOut, (fs.statSync(albedoOut).size / 1024).toFixed(0) + 'KB',
  `(sharpen ${sharpenSigma}, creamTame ${creamTame})`);
