// Find the head pieces fused into Darwin5's clothing primitive and write them
// as runtime split tables (three-game/components/assets/darwin5HeadSplits.js).
//
// The Tripo mesh's clothing primitive (Materialmat) runs up over the head:
// forehead patches, the brows and much of the back and sides of the hair are
// clothing triangles, so they rendered with cloth roughness, cloth AO and the
// wool detail instead of the skin and hair shading - dark smudges on the face,
// mustard-painted brows. Every clothing triangle above the collar line is
// classified by its painted albedo: skin-toned pieces move to the skin
// material, everything else (hair, brows, sideburns) to the hair material.
// Pieces near the collar line that read as shirt white or cravat black stay.
//
// Triangles are identified by bind-pose centroid rounded to 0.1 mm (see
// build-darwin-watch-chain.mjs).
//
//   node scripts/build-darwin-head-splits.mjs
import fs from 'node:fs';
import sharp from 'sharp';
import draco3d from 'draco3d';

const glbPath = 'public/assets/models/darwin5-locomotion-preview.glb';
const albedoPath = 'public/assets/models/darwin5-albedo-enh.webp';
const outPath = 'three-game/components/assets/darwin5HeadSplits.js';
const clothingMaterial = 'Materialmat';
// Bind-pose metres. Below collarY everything stays clothing; between collarY
// and hairlineY only skin-toned pieces move (the coat collar is hair-brown).
// The sideburns stay on the clothing material too: their painted locks read
// as one soft shape there, and as dark scraggly flecks under hair shading.
// Only the scalp moves: above eye level, or behind the ears down to the nape.
const collarY = 1.62;
const hairlineY = 1.7;
const scalpY = 1.795;
const behindEarsZ = 0.0;
const onSkinMetres = 0.004; // clothing-primitive triangles this close to the skin lie on it
const hairOnSkinMetres = 0.01; // skin-painted hair triangles are within 1 cm or beyond 2 cm

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

const primitive = json.meshes.flatMap(mesh => mesh.primitives)
  .find(p => json.materials[p.material]?.name === clothingMaterial);
const { position, uv, index } = decode(primitive);
const triangleCount = index.length / 3;
const { data, info } = await sharp(albedoPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * 3;
  return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
};
const weights = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
const colourOf = (t, mesh = { uv, index }) => {
  const colour = [0, 0, 0];
  for (const w of weights) {
    let u = 0;
    let v = 0;
    for (let k = 0; k < 3; k += 1) {
      u += w[k] * mesh.uv[mesh.index[t * 3 + k] * 2];
      v += w[k] * mesh.uv[mesh.index[t * 3 + k] * 2 + 1];
    }
    sample(u, v).forEach((c, i) => { colour[i] += c / weights.length; });
  }
  return colour;
};
// Skin in this atlas: light warm orange, hue ~(g-b)/(r-b) 0.38-0.48,
// saturation 0.25-0.5. Shirt white: bright and nearly grey. Cravat: very dark.
const classify = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max ? (max - min) / max : 0;
  if (max < 0.12) return 'dark';
  if (sat < 0.18 && max > 0.45) return 'white';
  if (max > 0.5 && sat >= 0.2 && sat <= 0.52 && r === max) return 'skin';
  return 'hair';
};

const centroidOf = (t, mesh = { position, index }) => [0, 1, 2].map(axis =>
  (mesh.position[mesh.index[t * 3] * 3 + axis] + mesh.position[mesh.index[t * 3 + 1] * 3 + axis] + mesh.position[mesh.index[t * 3 + 2] * 3 + axis]) / 3);
const centroidKey = (t, mesh) => centroidOf(t, mesh).map(v => Math.round(v * 10000)).join(',');
// Distance to the skin primitive's surface. Shaded skin paint on the cheeks
// and temples classifies as "hair"; as hair it took the hair shading (and its
// brown fill for skin-coloured texels) and read as dark flecks on the face.
// Triangles lying on the skin stay where they are; real hair stands off it.
// The body mesh's own primitive, not the small authored hair-lock meshes.
const byName = name => decode(json.meshes.flatMap(mesh => mesh.primitives)
  .filter(p => json.materials[p.material]?.name === name)
  .sort((p, q) => json.accessors[q.indices].count - json.accessors[p.indices].count)[0]);
const hairMesh = byName('Darwin5 hair');
const skinMesh = byName('Darwin5 skin');
const cell = 0.004;
const grid = new Map();
for (let i = 0; i < skinMesh.position.length; i += 3) {
  const key = [0, 1, 2].map(k => Math.floor(skinMesh.position[i + k] / cell)).join(',');
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(i);
}
const skinDistance = point => {
  const at = point.map(v => Math.floor(v / cell));
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    for (const i of grid.get(`${at[0] + dx},${at[1] + dy},${at[2] + dz}`) || []) {
      best = Math.min(best, Math.hypot(...[0, 1, 2].map(k => skinMesh.position[i + k] - point[k])));
    }
  }
  return best;
};
const skin = [];
const hair = [];
const distances = [];
for (let t = 0; t < triangleCount; t += 1) {
  const y = (position[index[t * 3] * 3 + 1] + position[index[t * 3 + 1] * 3 + 1] + position[index[t * 3 + 2] * 3 + 1]) / 3;
  if (y < collarY) continue;
  const z = (position[index[t * 3] * 3 + 2] + position[index[t * 3 + 1] * 3 + 2] + position[index[t * 3 + 2] * 3 + 2]) / 3;
  const kind = classify(colourOf(t));
  if (kind === 'skin') skin.push(centroidKey(t));
  else if (kind === 'hair' && (y >= scalpY || (y >= hairlineY && z < behindEarsZ))) {
    const d = skinDistance(centroidOf(t));
    if (process.env.STATS) distances.push(d);
    if (d > onSkinMetres) hair.push(centroidKey(t));
  }
}
// The hair primitive itself also lays skin-painted triangles flat on the
// temples and cheeks; they move to the skin material.
const hairTriangles = hairMesh.index.length / 3;
const faceSkin = [];
const hairDistances = [];
for (let t = 0; t < hairTriangles; t += 1) {
  if (classify(colourOf(t, hairMesh)) !== 'skin') continue;
  const centre = centroidOf(t, hairMesh);
  if (centre[1] < collarY) continue;
  const d = skinDistance(centre);
  hairDistances.push(d);
  if (d <= hairOnSkinMetres) faceSkin.push(centroidKey(t, hairMesh));
}
faceSkin.sort();
skin.sort();
hair.sort();
console.log(`Darwin5 hair: ${hairTriangles} triangles; skin-coloured ${hairDistances.length}, on the skin ${faceSkin.length}`);
if (process.env.STATS) for (const limit of [0.002, 0.004, 0.006, 0.01, 0.02]) console.log(' hair', limit, hairDistances.filter(d => d <= limit).length);
console.log(`${clothingMaterial}: ${triangleCount} triangles; head skin ${skin.length}, head hair ${hair.length}`);
if (process.env.STATS) for (const limit of [0.001, 0.002, 0.003, 0.004, 0.006, 0.01]) console.log(limit, distances.filter(d => d <= limit).length);


const set = keys => `new Set([\n${keys.map(key => `    '${key}',`).join('\n')}\n  ])`;
fs.writeFileSync(outPath, `// Generated by scripts/build-darwin-head-splits.mjs from ${glbPath}; do not edit.
// Bind-pose centroids (x,y,z in 0.1 mm) of head triangles fused into the
// clothing primitive, moved to the skin and hair materials at load.
export const DARWIN5_HEAD_SKIN = {
  sourceMaterial: '${clothingMaterial}',
  targetMaterial: 'Darwin5 skin',
  triangleCount: ${triangleCount},
  centroids: ${set(skin)},
};

export const DARWIN5_HAIR_FACE_SKIN = {
  sourceMaterial: 'Darwin5 hair',
  targetMaterial: 'Darwin5 skin',
  triangleCount: ${hairTriangles},
  centroids: ${set(faceSkin)},
};

export const DARWIN5_HEAD_HAIR = {
  sourceMaterial: '${clothingMaterial}',
  targetMaterial: 'Darwin5 hair',
  triangleCount: ${triangleCount},
  centroids: ${set(hair)},
};
`);
console.log(`wrote ${outPath}`);
