// B-only atlas repair. Work in bind-pose neighbourhoods across fragmented UV
// islands, preserve facial landmarks, and never blur across atlas seams.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import draco3d from 'draco3d';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { DARWIN5_HEAD_SKIN, DARWIN5_HAIR_FACE_SKIN } from '../three-game/components/assets/darwin5HeadSplits.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read('public/assets/models/darwin5-locomotion-preview.glb');
const { data, info } = await sharp('public/assets/models/darwin5-albedo-enh.webp').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const positions = new Float32Array(W * H * 3);
const covered = new Uint8Array(W * H);
for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const name = primitive.getMaterial()?.getName();
  const pos = primitive.getAttribute('POSITION');
  const uv = primitive.getAttribute('TEXCOORD_0');
  const index = primitive.getIndices();
  if (!uv || !index || !['Darwin5 skin', 'Materialmat', 'Darwin5 hair'].includes(name)) continue;
  const at = i => pos.getElement(i, []);
  for (let t = 0; t < index.getCount(); t += 3) {
    const ids = [0, 1, 2].map(k => index.getScalar(t + k));
    const points = ids.map(at);
    const centre = [0, 1, 2].map(k => points.reduce((sum, p) => sum + p[k], 0) / 3);
    if (centre[1] < 1.69 || centre[2] < 0.065 || Math.abs(centre[0] - 0.0105) > 0.066) continue;
    const key = centre.map(v => Math.round(v * 10000)).join(',');
    if (name === 'Materialmat' && !DARWIN5_HEAD_SKIN.centroids.has(key)) continue;
    if (name === 'Darwin5 hair' && !DARWIN5_HAIR_FACE_SKIN.centroids.has(key)) continue;
    const q = ids.map(i => uv.getElement(i, []).map((v, k) => v * (k ? H : W)));
    const [a, b, c] = q;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(...q.map(p => p[1])))); y < Math.min(H, Math.ceil(Math.max(...q.map(p => p[1])))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...q.map(p => p[0])))); x < Math.min(W, Math.ceil(Math.max(...q.map(p => p[0])))); x++) {
        const px = x + 0.5; const py = y + 0.5;
        const r = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
        const s = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
        const weights = [r, s, 1 - r - s];
        if (Math.min(...weights) < 0) continue;
        const i = y * W + x;
        covered[i] = 1;
        for (let k = 0; k < 3; k++) positions[i * 3 + k] = points.reduce((sum, p, j) => sum + p[k] * weights[j], 0);
      }
    }
  }
}
const size = 0.006;
const grid = new Map();
const coords = i => [0, 1, 2].map(k => Math.floor(positions[i * 3 + k] / size));
for (let i = 0; i < covered.length; i++) if (covered[i]) {
  const key = coords(i).join(',');
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(i);
}
const out = Buffer.from(data);
const luma = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const sat = rgb => (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, ...rgb);
let repaired = 0;
for (let i = 0; i < covered.length; i++) {
  if (!covered[i]) continue;
  const [x, y, z] = [0, 1, 2].map(k => positions[i * 3 + k]);
  // Keep brows, eyelid margins, nostrils, lips and their surrounding folds.
  if ((y > 1.801 && y < 1.832 && Math.min(Math.abs(x + 0.0248), Math.abs(x - 0.0444)) < 0.033) || (Math.abs(x - 0.0105) < 0.04 && y < 1.75) || (Math.abs(x - 0.0105) < 0.019 && z > 0.112)) continue;
  const [gx, gy, gz] = coords(i);
  const samples = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    for (const j of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) || []) {
      const distance = Math.hypot(positions[j * 3] - x, positions[j * 3 + 1] - y, positions[j * 3 + 2] - z);
      if (distance < 0.007) samples.push([data[j * 3], data[j * 3 + 1], data[j * 3 + 2]]);
    }
  }
  if (samples.length < 12) continue;
  samples.sort((a, b) => luma(a) - luma(b));
  const local = samples[Math.floor(samples.length * 0.6)];
  const color = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  if (luma(color) < luma(local) * 0.88 || luma(color) > luma(local) * 1.14 || sat(color) < sat(local) - 0.075) {
    for (let k = 0; k < 3; k++) out[i * 3 + k] = local[k];
    repaired++;
  }
}
const output = 'public/assets/models/darwin5-albedo-codex.webp';
// Lossless avoids adding fresh chroma blocks around tiny UV islands.
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ lossless: true }).toFile(output);
await fs.mkdir('assets-src/darwin/codex-look', { recursive: true });
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile('assets-src/darwin/codex-look/build-report.json', JSON.stringify({ source: 'public/assets/models/darwin5-albedo-enh.webp', output, sourceSha256: await hash('public/assets/models/darwin5-albedo-enh.webp'), modelSha256: await hash('public/assets/models/darwin5-locomotion-preview.glb'), splitsSha256: await hash('three-game/components/assets/darwin5HeadSplits.js'), outputSha256: await hash(output), width: W, height: H, repairedTexels: repaired, bytes: (await fs.stat(output)).size, method: '3D-neighbourhood outlier repair, protected facial landmarks, lossless encoding' }, null, 2) + '\n');
console.log(`Wrote ${output}; repaired ${repaired} texels.`);
