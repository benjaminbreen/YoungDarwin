// Clean the painted smudges out of Darwin5's skin albedo.
//
// The Tripo atlas paints small grey-brown blotches and stray sideburn-coloured
// flecks onto the face (under the eyes, across the cheeks, at the hairline).
// Every texel the skin primitive maps is compared with the skin around it in
// 3D (bind pose, not UV space - the atlas is fragmented into small islands);
// small connected patches that are clearly darker or greyer than that local
// skin are filled with it. Large dark regions (sideburns, hairline) are kept, and the
// eyes, nostrils, mouth and ears are protected by bind-pose position, so real
// facial detail is never treated as a smudge. Only skin texels change; the
// clothing and hair parts of the shared atlas pass through untouched.
//
//   node scripts/clean-darwin-skin-albedo.mjs [--debug=path.png]
import fs from 'node:fs';
import sharp from 'sharp';
import draco3d from 'draco3d';

const glbPath = 'public/assets/models/darwin5-locomotion-preview.glb';
const inPath = 'public/assets/models/darwin5-albedo-enh.webp';
const outPath = 'public/assets/models/darwin5-albedo-clean.webp';
const splitsPath = 'three-game/components/assets/darwin5HeadSplits.js';
const debugPath = process.argv.find(arg => arg.startsWith('--debug='))?.slice(8);
const darkerThan = 0.86; // texel luma / local skin luma that counts as a smudge
const maxPatchTexels = 1500; // larger dark regions are features, not smudges
const greyerThan = 0.1;
const paleGreyerThan = 0.05; // the same, for texels as light as the skin // saturation below local skin that counts as a grey smudge
const neighbourhood = 0.012; // metres of surrounding skin that sets "local"

const buffer = fs.readFileSync(glbPath);
const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
const bin = buffer.subarray(20 + jsonLength + 8);
const decoderModule = await draco3d.createDecoderModule({});
function decode(primitive) {
  const ext = primitive.extensions.KHR_draco_mesh_compression;
  const view = json.bufferViews[ext.bufferView];
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (view.byteOffset || 0), view.byteLength);
  const decoder = new decoderModule.Decoder();
  const dracoBuffer = new decoderModule.DecoderBuffer();
  dracoBuffer.Init(bytes, bytes.length);
  const mesh = new decoderModule.Mesh();
  const status = decoder.DecodeBufferToMesh(dracoBuffer, mesh);
  if (!status.ok()) throw new Error(status.error_msg());
  const read = (name, components) => {
    const attribute = decoder.GetAttributeByUniqueId(mesh, ext.attributes[name]);
    const values = new decoderModule.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
    const out = new Float32Array(mesh.num_points() * components);
    for (let i = 0; i < out.length; i += 1) out[i] = values.GetValue(i);
    return out;
  };
  const index = new Uint32Array(mesh.num_faces() * 3);
  const face = new decoderModule.DracoInt32Array();
  for (let f = 0; f < mesh.num_faces(); f += 1) {
    decoder.GetFaceFromMesh(mesh, f, face);
    for (let k = 0; k < 3; k += 1) index[f * 3 + k] = face.GetValue(k);
  }
  return { position: read('POSITION', 3), uv: read('TEXCOORD_0', 2), index };
}
const primitives = json.meshes.flatMap(mesh => mesh.primitives);
const byName = name => primitives.find(p => json.materials[p.material]?.name === name);
const skin = decode(byName('Darwin5 skin'));

// Landmarks. The brow shells (named "eye gloss", see modelAssets.js) sit just
// above each eye in the primary mesh's space.
const brows = json.meshes.filter(mesh => /EyeGloss/.test(mesh.name)).map(mesh => {
  const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
  return accessor.min.map((min, axis) => (min + accessor.max[axis]) / 2);
});
const eyes = brows.map(([x, y, z]) => [x, y - 0.02, z]);
const midX = (eyes[0][0] + eyes[1][0]) / 2;
let noseTip = [midX, 0, -1];
for (let i = 0; i < skin.position.length; i += 3) {
  const [x, y, z] = [skin.position[i], skin.position[i + 1], skin.position[i + 2]];
  if (Math.abs(x - midX) < 0.02 && y > eyes[0][1] - 0.08 && y < eyes[0][1] && z > noseTip[2]) noseTip = [x, y, z];
}
// Just the eye openings (lids and lashes), not the cheek below: the old 2.4 cm
// sphere shielded the under-eye flecks from cleaning.
const eyeOpenings = brows.map(([x, y, z]) => [x, y - 0.012, z]);
const isEye = (x, y, z) => eyeOpenings.some(([ex, ey, ez]) =>
  ((x - ex) / 0.019) ** 2 + ((y - ey) / 0.008) ** 2 + ((z - ez) / 0.03) ** 2 < 1);
const protect = [
  { centre: [noseTip[0], noseTip[1] - 0.012, noseTip[2] - 0.01], radius: 0.022 },
];
// The lips (bind pose, from the face profile), not the chin below them.
const isMouth = (x, y, z) => ((x - midX) / 0.03) ** 2 + ((y - 1.7335) / 0.012) ** 2 + ((z - 0.104) / 0.025) ** 2 < 1;
const isSideburn = (x, y) => Math.abs(x - midX) > 0.06 && y < eyes[0][1] + 0.012 && y > 1.66;
const isProtected = (x, y, z) => isEye(x, y, z) || isMouth(x, y, z) || protect.some(({ centre, radius }) =>
  (x - centre[0]) ** 2 + (y - centre[1]) ** 2 + (z - centre[2]) ** 2 < radius * radius)
  // Sideburns: painted onto the skin in fragments across many UV islands, so
  // each fragment looks like a small dark patch; filling them made the
  // sideburns patchy.
  // From 6 cm out: nearer the midline is cheek, where the flecks are.
  || isSideburn(x, y, z)
  // Ears: well to the side and behind the cheek, around eye height.
  || (Math.abs(x - midX) > 0.066 && Math.abs(y - eyes[0][1] + 0.01) < 0.04 && z < 0.025);
// The brows are fused into the clothing primitive and move to the skin
// material with the face; the skin shader colours them, so keep their paint.
const isBrow = (x, y, z) => brows.some(brow => Math.abs(x - brow[0]) < 0.03 && Math.abs(y - brow[1]) < 0.012 && z > brow[2] - 0.03);
console.log('eyes', eyes.map(e => e.map(v => v.toFixed(3)).join(',')), 'nose tip', noseTip.map(v => v.toFixed(3)).join(','));

const { data, info } = await sharp(inPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const luma = o => 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];

// Rasterize triangles into UV space, handing each texel its bind-pose position.
function rasterize({ position, uv, index }, include, onTexel) {
  const pos = [0, 0, 0];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]; const b = index[t + 1]; const c = index[t + 2];
    if (!include(t / 3, a, b, c)) continue;
    const ax = uv[a * 2] * W; const ay = uv[a * 2 + 1] * H;
    const bx = uv[b * 2] * W; const by = uv[b * 2 + 1] * H;
    const cx = uv[c * 2] * W; const cy = uv[c * 2 + 1] * H;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by, cy))); y += 1) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))); x += 1) {
        const px = x + 0.5; const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        for (let k = 0; k < 3; k += 1) pos[k] = w0 * position[a * 3 + k] + w1 * position[b * 3 + k] + w2 * position[c * 3 + k];
        onTexel(y * W + x, pos);
      }
    }
  }
}
const texelPos = new Float32Array(W * H * 3);
const covered = new Uint8Array(W * H);
// Only the head: hands share the skin material.
rasterize(skin, (t, a, b, c) => Math.min(skin.position[a * 3 + 1], skin.position[b * 3 + 1], skin.position[c * 3 + 1]) >= 1.55, (i, pos) => {
  covered[i] = 1;
  texelPos.set(pos, i * 3);
});

// Local skin colour per texel from its 3D neighbourhood: hash covered texels
// into a grid of neighbourhood-sized cells and average the cell and its
// neighbours, excluding dark texels so a smudge does not set its own fill.
const cell = neighbourhood;
const cells = new Map();
const cellKey = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (let i = 0; i < W * H; i += 1) {
  if (!covered[i]) continue;
  const key = cellKey(texelPos[i * 3], texelPos[i * 3 + 1], texelPos[i * 3 + 2]);
  let entry = cells.get(key);
  if (!entry) cells.set(key, entry = { sum: [0, 0, 0], lumas: [] });
  entry.lumas.push(luma(i * 3));
  for (let k = 0; k < 3; k += 1) entry.sum[k] += data[i * 3 + k];
}
// Typical skin of a cell: the mean of its brighter half, leaving out the
// brightest tenth (pale blocks and baked highlights).
for (const entry of cells.values()) {
  entry.lumas.sort((p, q) => p - q);
  entry.median = entry.lumas[Math.floor(entry.lumas.length / 2)];
  entry.high = entry.lumas[Math.floor(entry.lumas.length * 0.9)];
}
const skinSum = new Map();
for (let i = 0; i < W * H; i += 1) {
  if (!covered[i]) continue;
  const key = cellKey(texelPos[i * 3], texelPos[i * 3 + 1], texelPos[i * 3 + 2]);
  const l = luma(i * 3);
  if (l < cells.get(key).median || l > cells.get(key).high) continue;
  let s = skinSum.get(key);
  if (!s) skinSum.set(key, s = [0, 0, 0, 0]);
  for (let k = 0; k < 3; k += 1) s[k] += data[i * 3 + k];
  s[3] += 1;
}
// Gaussian-weighted by distance to each cell's centre, so the field has no
// cell-boundary steps.
const sigma2 = 2 * (cell * 0.75) ** 2;
const localSkin = (x, y, z) => {
  const cx = Math.floor(x / cell); const cy = Math.floor(y / cell); const cz = Math.floor(z / cell);
  const out = [0, 0, 0, 0];
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    const s = skinSum.get(`${cx + dx},${cy + dy},${cz + dz}`);
    if (!s) continue;
    const d2 = ((cx + dx + 0.5) * cell - x) ** 2 + ((cy + dy + 0.5) * cell - y) ** 2 + ((cz + dz + 0.5) * cell - z) ** 2;
    const w = Math.exp(-d2 / sigma2) * Math.sqrt(s[3]);
    for (let k = 0; k < 3; k += 1) out[k] += s[k] / s[3] * w;
    out[3] += w;
  }
  return out[3] ? [out[0] / out[3], out[1] / out[3], out[2] / out[3]] : null;
};

const local = new Float32Array(W * H * 3);
const candidate = new Uint8Array(W * H);
for (let i = 0; i < W * H; i += 1) {
  if (!covered[i]) continue;
  const [x, y, z] = [texelPos[i * 3], texelPos[i * 3 + 1], texelPos[i * 3 + 2]];
  const ref = localSkin(x, y, z);
  if (!ref) continue;
  local.set(ref, i * 3);
  const refLuma = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
  const sat = rgb => (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, Math.max(...rgb));
  const texel = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  // Pale grey blocks too: lighter than the skin but washed out.
  const smudge = luma(i * 3) < refLuma * darkerThan || sat(texel) < sat(ref) - greyerThan
    || (luma(i * 3) > refLuma * 0.97 && sat(texel) < sat(ref) - paleGreyerThan);
  if (smudge && !isProtected(x, y, z)) candidate[i] = 1;
}

// Connected patches of candidates in UV space; fill only the small ones.
const label = new Int32Array(W * H).fill(-1);
const out = Buffer.from(data);
let filledPatches = 0;
let filledTexels = 0;
const debug = debugPath ? Buffer.alloc(W * H * 3) : null;
for (let start = 0; start < W * H; start += 1) {
  if (!candidate[start] || label[start] >= 0) continue;
  const patch = [];
  const stack = [start];
  label[start] = start;
  while (stack.length) {
    const i = stack.pop();
    patch.push(i);
    const x = i % W; const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (candidate[n] && label[n] < 0) { label[n] = start; stack.push(n); }
    }
  }
  const small = patch.length <= maxPatchTexels;
  for (const i of patch) {
    if (debug) { debug[i * 3] = small ? 255 : 0; debug[i * 3 + 1] = small ? 0 : 160; debug[i * 3 + 2] = small ? 255 : 0; }
    if (!small) continue;
    for (let k = 0; k < 3; k += 1) out[i * 3 + k] = Math.round(local[i * 3 + k]);
  }
  if (small) { filledPatches += 1; filledTexels += patch.length; }
}

// Rebuild the open face. Patching flecks one rule at a time kept missing some:
// the atlas is too fragmented. Away from the features, every skin texel takes
// the smooth local skin colour and keeps only a gentle share of its own
// brightness, clamped so no fleck or pale block survives.
// The sideburns are painted as scattered fragments, so their edge reads as
// shards. Re-draw them as a smooth field: how much of the skin around a
// point (6 mm cells, Gaussian-weighted) carries dark paint decides between a
// solid sideburn colour and skin.
const burnCell = 0.006;
const burnCells = new Map();
const isDarkPaint = i => luma(i * 3) < 0.75 * (0.2126 * local[i * 3] + 0.7152 * local[i * 3 + 1] + 0.0722 * local[i * 3 + 2]);
for (let i = 0; i < W * H; i += 1) {
  if (!covered[i] || !isSideburn(texelPos[i * 3], texelPos[i * 3 + 1])) continue;
  const key = [0, 1, 2].map(k => Math.floor(texelPos[i * 3 + k] / burnCell)).join(',');
  let c = burnCells.get(key);
  if (!c) burnCells.set(key, c = [0, 0, 0, 0, 0]);
  c[4] += 1;
  if (!isDarkPaint(i)) continue;
  for (let k = 0; k < 3; k += 1) c[k] += data[i * 3 + k];
  c[3] += 1;
}
const burnSigma2 = 2 * burnCell ** 2;
const sideburnAt = (x, y, z) => {
  const at = [x, y, z].map(v => Math.floor(v / burnCell));
  const acc = [0, 0, 0, 0, 0];
  for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) for (let dz = -2; dz <= 2; dz += 1) {
    const c = burnCells.get(`${at[0] + dx},${at[1] + dy},${at[2] + dz}`);
    if (!c) continue;
    const d2 = ((at[0] + dx + 0.5) * burnCell - x) ** 2 + ((at[1] + dy + 0.5) * burnCell - y) ** 2 + ((at[2] + dz + 0.5) * burnCell - z) ** 2;
    const w = Math.exp(-d2 / burnSigma2);
    for (let k = 0; k < 5; k += 1) acc[k] += c[k] * w;
  }
  if (!acc[4] || !acc[3]) return { amount: 0 };
  const f = acc[3] / acc[4];
  const t = Math.min(1, Math.max(0, (f - 0.3) / 0.3));
  return { amount: t * t * (3 - 2 * t), colour: [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]] };
};

let rebuilt = 0;
for (let i = 0; i < W * H; i += 1) {
  if (!covered[i]) continue;
  const [x, y, z] = [texelPos[i * 3], texelPos[i * 3 + 1], texelPos[i * 3 + 2]];
  const ref = local.subarray(i * 3, i * 3 + 3);
  const refLuma = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
  if (!refLuma) continue;
  if (isBrow(x, y, z) || (!isSideburn(x, y) && isProtected(x, y, z))) continue;
  const shade = Math.min(1.04, Math.max(0.95, luma(i * 3) / refLuma));
  const burn = isSideburn(x, y) ? sideburnAt(x, y, z) : { amount: 0 };
  for (let k = 0; k < 3; k += 1) {
    const skinValue = ref[k] * shade;
    out[i * 3 + k] = Math.round(Math.min(255, burn.amount ? skinValue + (burn.colour[k] - skinValue) * burn.amount : skinValue));
  }
  label[i] = 1;
  rebuilt += 1;
}
console.log(`rebuilt ${rebuilt} open-face texels`);

// Triangles moved onto the skin material at load (darwin5HeadSplits.js) sample
// atlas paint meant for cloth or hair, lighter or greyer than the cheek around
// them: they read as pale squares. Repaint their texels with the local skin.
const splits = fs.readFileSync(splitsPath, 'utf8');
const centroidsOf = name => new Set(splits.slice(splits.indexOf(`export const ${name}`)).split('};')[0].match(/'-?\d+,-?\d+,-?\d+'/g).map(key => key.slice(1, -1)));
const largest = name => decode(primitives.filter(p => json.materials[p.material]?.name === name)
  .sort((p, q) => json.accessors[q.indices].count - json.accessors[p.indices].count)[0]);
let movedTexels = 0;
for (const [name, material] of [['DARWIN5_HEAD_SKIN', 'Materialmat'], ['DARWIN5_HAIR_FACE_SKIN', 'Darwin5 hair']]) {
  const keys = centroidsOf(name);
  const mesh = largest(material);
  const keyOf = (a, b, c) => [0, 1, 2].map(k => Math.round((mesh.position[a * 3 + k] + mesh.position[b * 3 + k] + mesh.position[c * 3 + k]) / 3 * 10000)).join(',');
  rasterize(mesh, (t, a, b, c) => keys.has(keyOf(a, b, c)), (i, [x, y, z]) => {
    if (covered[i] || isBrow(x, y, z) || (!isSideburn(x, y) && isProtected(x, y, z))) return;
    const ref = localSkin(x, y, z);
    if (!ref) return;
    const burn = isSideburn(x, y) ? sideburnAt(x, y, z) : { amount: 0 };
    const paint = process.env.MARK_MOVED ? [255, 0, 255] : ref.map((v, k) => (burn.amount ? v + (burn.colour[k] - v) * burn.amount : v));
    for (let k = 0; k < 3; k += 1) out[i * 3 + k] = Math.round(paint[k]);
    label[i] = 1;
    movedTexels += 1;
  });
}
console.log(`moved-triangle texels repainted ${movedTexels}`);
if (process.env.MARK_PROTECTED) {
  for (let i = 0; i < W * H; i += 1) {
    if (covered[i] && isProtected(texelPos[i * 3], texelPos[i * 3 + 1], texelPos[i * 3 + 2])) { out[i * 3] = 0; out[i * 3 + 1] = 255; out[i * 3 + 2] = 255; }
  }
}

// Soften the seams of filled patches with a 3x3 average of their rim.
const filled = new Uint8Array(W * H);
for (let i = 0; i < W * H; i += 1) if (label[i] >= 0 && out[i * 3] !== data[i * 3]) filled[i] = 1;
const softened = Buffer.from(out);
for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
  const i = y * W + x;
  if (!covered[i]) continue;
  let near = false;
  for (let dy = -1; dy <= 1 && !near; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (filled[(y + dy) * W + x + dx] !== filled[i]) { near = true; break; }
  if (!near) continue;
  for (let k = 0; k < 3; k += 1) {
    let s = 0; let n = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const j = (y + dy) * W + x + dx;
      if (covered[j]) { s += out[j * 3 + k]; n += 1; }
    }
    softened[i * 3 + k] = Math.round(s / n);
  }
}
console.log(`skin texels ${covered.reduce((a, b) => a + b, 0)}; filled ${filledPatches} patches, ${filledTexels} texels`);
await sharp(softened, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92 }).toFile(outPath);
console.log(`wrote ${outPath}`);
if (debug) {
  for (let i = 0; i < W * H; i += 1) if (covered[i] && !debug[i * 3] && !debug[i * 3 + 1]) { debug[i * 3] = debug[i * 3 + 1] = debug[i * 3 + 2] = 70; }
  await sharp(debug, { raw: { width: W, height: H, channels: 3 } }).png().toFile(debugPath);
}
