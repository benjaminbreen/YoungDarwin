// Find Darwin5's watch chain on the clothing mesh and write its triangles as a
// runtime module, so ModelAsset can render it with the brass-button material.
//
// The chain is painted into the shared clothing atlas and fused into the main
// clothing primitive, so it renders as cloth. This decodes that primitive,
// colours every triangle from the albedo, keeps the leather/brass orange ones,
// splits them into connected pieces (vertices welded by position), and keeps
// the pieces that lie entirely inside a small box on the waistcoat front: the
// chain loop and the hook where it meets the waistcoat. The satchel strap
// crosses the waistcoat in the same orange but extends far outside the box.
//
// Triangles are identified by their bind-pose centroid rounded to 0.1 mm, not
// by index: the shipping GLBs encode the same mesh in different triangle
// orders, and centroids survive that.
//
//   node scripts/build-darwin-watch-chain.mjs
import fs from 'node:fs';
import sharp from 'sharp';
import draco3d from 'draco3d';

const glbPath = 'public/assets/models/darwin5-locomotion-preview.glb';
const albedoPath = 'public/assets/models/darwin5-albedo-enh.webp';
const outPath = 'three-game/components/assets/darwin5WatchChain.js';
const clothingMaterial = 'Materialmat';
// Bind-pose metres: x = Darwin's left, y = up, z = forward.
const box = { min: [-0.03, 1.18, 0.115], max: [0.115, 1.30, 0.17] };
const minPieceTriangles = 5;

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
  const faceCount = mesh.num_faces();
  const index = new Uint32Array(faceCount * 3);
  const face = new decoderModule.DracoInt32Array();
  for (let f = 0; f < faceCount; f += 1) {
    decoder.GetFaceFromMesh(mesh, f, face);
    for (let k = 0; k < 3; k += 1) index[f * 3 + k] = face.GetValue(k);
  }
  return { position: read('POSITION', 3), uv: read('TEXCOORD_0', 2), index };
}

const primitive = json.meshes.flatMap(mesh => mesh.primitives)
  .find(p => json.materials[p.material]?.name === clothingMaterial);
const { position, uv, index } = decode(primitive);
const triangleCount = index.length / 3;

const { data, info } = await sharp(albedoPath).raw().toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * info.channels;
  return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
};
const isOrange = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta || max !== r) return false;
  let hue = ((g - b) / delta) * 60;
  if (hue < 0) hue += 360;
  return hue >= 14 && hue <= 38 && delta / max >= 0.5 && max >= 0.25;
};

// Average a few points inside each triangle so one stray texel cannot decide it.
const orange = new Uint8Array(triangleCount);
const weights = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
for (let t = 0; t < triangleCount; t += 1) {
  const colour = [0, 0, 0];
  for (const w of weights) {
    let u = 0;
    let v = 0;
    for (let k = 0; k < 3; k += 1) {
      const vertex = index[t * 3 + k];
      u += w[k] * uv[vertex * 2];
      v += w[k] * uv[vertex * 2 + 1];
    }
    sample(u, v).forEach((c, i) => { colour[i] += c / weights.length; });
  }
  if (isOrange(colour)) orange[t] = 1;
}

// Weld by position (UV seams split vertices) and flood-fill orange triangles.
const weld = new Map();
const welded = new Int32Array(position.length / 3);
for (let i = 0; i < welded.length; i += 1) {
  const key = `${Math.round(position[i * 3] * 2000)},${Math.round(position[i * 3 + 1] * 2000)},${Math.round(position[i * 3 + 2] * 2000)}`;
  if (!weld.has(key)) weld.set(key, weld.size);
  welded[i] = weld.get(key);
}
const byVertex = new Map();
for (let t = 0; t < triangleCount; t += 1) {
  if (!orange[t]) continue;
  for (let k = 0; k < 3; k += 1) {
    const v = welded[index[t * 3 + k]];
    if (!byVertex.has(v)) byVertex.set(v, []);
    byVertex.get(v).push(t);
  }
}
const piece = new Int32Array(triangleCount).fill(-1);
const kept = [];
for (let t = 0; t < triangleCount; t += 1) {
  if (!orange[t] || piece[t] >= 0) continue;
  const triangles = [];
  const stack = [t];
  piece[t] = t;
  while (stack.length) {
    const a = stack.pop();
    triangles.push(a);
    for (let k = 0; k < 3; k += 1) {
      for (const b of byVertex.get(welded[index[a * 3 + k]])) {
        if (piece[b] < 0) { piece[b] = t; stack.push(b); }
      }
    }
  }
  if (triangles.length < minPieceTriangles) continue;
  const inside = triangles.every(a => [0, 1, 2].every(k => {
    const v = index[a * 3 + k];
    return [0, 1, 2].every(axis => position[v * 3 + axis] >= box.min[axis] && position[v * 3 + axis] <= box.max[axis]);
  }));
  if (inside) kept.push(triangles);
}

const centroidKey = t => [0, 1, 2].map(axis => Math.round(
  (position[index[t * 3] * 3 + axis] + position[index[t * 3 + 1] * 3 + axis] + position[index[t * 3 + 2] * 3 + axis]) / 3 * 10000,
)).join(',');
const keys = kept.flat().map(centroidKey).sort();
console.log(`${clothingMaterial}: ${triangleCount} triangles; kept ${kept.length} pieces (${kept.map(p => p.length).join(', ')}) = ${keys.length} triangles`);

const body = `// Generated by scripts/build-darwin-watch-chain.mjs from ${glbPath}; do not edit.
// Bind-pose centroids (x,y,z in 0.1 mm) of the watch-chain triangles on the
// clothing primitive, rendered with the brass-button material at load.
export const DARWIN5_WATCH_CHAIN = {
  sourceMaterial: '${clothingMaterial}',
  targetMaterial: 'Darwin5 brass buttons',
  triangleCount: ${triangleCount},
  centroids: new Set([
${keys.map(key => `    '${key}',`).join('\n')}
  ]),
};
`;
fs.writeFileSync(outPath, body);
console.log(`wrote ${outPath}`);
