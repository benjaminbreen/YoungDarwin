// Bake an ambient-occlusion sidecar map for a Darwin GLB onto its atlas UVs.
//
// The model ships albedo-only, so nothing darkens the collar, the coat's
// interior, the armpits or the gap between the legs, and in shade he reads as
// pasted onto the scene. This ray-traces contact occlusion straight from the
// shipping GLB (no Blender needed): every primitive is decoded in its bind
// pose and used as an occluder, every texel of the shared atlas is mapped back
// to its surface point, and cosine-weighted hemisphere rays out to --distance
// metres decide how enclosed it is. The bind pose holds the arms away from the
// body, so no arm shadow is baked onto the torso (it would be wrong as soon as
// he moves); the coat, collar, satchel and legs keep their contact shading.
//
// Island edges are dilated so mip levels do not pull in the empty background,
// and the result is written grayscale, loaded at runtime as material.aoMap
// (see materialUpgrade.aoMapUrl in modelAssets.js). Read-only on the GLB.
//
//   node scripts/bake-darwin-ao.mjs \
//     --glb=public/assets/models/darwin5-locomotion-preview.glb \
//     --out=public/assets/models/darwin5-ao.webp
//
// Tuning: --size=1024 --rays=48 --distance=0.12 --power=1.2 --blur=0.8 --dilate=8
// --workers=N (default: cores - 1) splits the triangles across worker threads.
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import draco3d from 'draco3d';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), true];
}));
const num = (key, fallback) => (args[key] !== undefined ? Number(args[key]) : fallback);
const glbPath = args.glb || 'public/assets/models/darwin5-locomotion-preview.glb';
const outPath = args.out || 'public/assets/models/darwin5-ao.webp';
const size = num('size', 1024);
const rayCount = num('rays', 48);
const distance = num('distance', 0.12);
const power = num('power', 1.2);
const blurSigma = num('blur', 0.8);
const dilatePasses = num('dilate', 8);
const bias = num('bias', 0.0015);
const workerCount = Math.max(1, num('workers', os.cpus().length - 1));

function readGlb(path) {
  const buffer = fs.readFileSync(path);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const binLength = buffer.readUInt32LE(20 + jsonLength);
  return { json, bin: buffer.subarray(binStart, binStart + binLength) };
}

// Decode one KHR_draco_mesh_compression primitive into flat arrays.
function decodeDracoPrimitive(decoderModule, json, bin, primitive) {
  const ext = primitive.extensions.KHR_draco_mesh_compression;
  const view = json.bufferViews[ext.bufferView];
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (view.byteOffset || 0), view.byteLength);
  const decoder = new decoderModule.Decoder();
  const dracoBuffer = new decoderModule.DecoderBuffer();
  dracoBuffer.Init(bytes, bytes.length);
  const mesh = new decoderModule.Mesh();
  const status = decoder.DecodeBufferToMesh(dracoBuffer, mesh);
  if (!status.ok()) throw new Error(`Draco decode failed: ${status.error_msg()}`);
  const readAttribute = (name, components) => {
    const id = ext.attributes[name];
    if (id === undefined) return null;
    const attribute = decoder.GetAttributeByUniqueId(mesh, id);
    const values = new decoderModule.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
    const out = new Float32Array(mesh.num_points() * components);
    for (let index = 0; index < out.length; index += 1) out[index] = values.GetValue(index);
    decoderModule.destroy(values);
    return out;
  };
  const position = readAttribute('POSITION', 3);
  const normal = readAttribute('NORMAL', 3);
  const uv = readAttribute('TEXCOORD_0', 2);
  const faceCount = mesh.num_faces();
  const index = new Uint32Array(faceCount * 3);
  const face = new decoderModule.DracoInt32Array();
  for (let f = 0; f < faceCount; f += 1) {
    decoder.GetFaceFromMesh(mesh, f, face);
    index[f * 3] = face.GetValue(0);
    index[f * 3 + 1] = face.GetValue(1);
    index[f * 3 + 2] = face.GetValue(2);
  }
  decoderModule.destroy(face);
  decoderModule.destroy(mesh);
  decoderModule.destroy(dracoBuffer);
  decoderModule.destroy(decoder);
  return { position, normal, uv, index };
}

// Each worker decodes the GLB, builds its own BVH and shades every Nth
// triangle; the main thread merges their per-texel sums and counts.
async function bakeShare(shareIndex, shareCount) {
const { json, bin } = readGlb(glbPath);
const decoderModule = await draco3d.createDecoderModule({});

// Primitives that sample the shared atlas (base texture 0) are baked; all are
// occluders. Skinned primitives in glTF ignore their node transform, so the raw
// positions already share the bind-pose space.
const atlasTexture = 0;
const primitives = [];
for (const mesh of json.meshes) {
  for (const primitive of mesh.primitives) {
    if (!primitive.extensions?.KHR_draco_mesh_compression) {
      throw new Error(`${mesh.name}: expected Draco-compressed primitives`);
    }
    const decoded = decodeDracoPrimitive(decoderModule, json, bin, primitive);
    const material = json.materials[primitive.material];
    const baked = material?.pbrMetallicRoughness?.baseColorTexture?.index === atlasTexture && Boolean(decoded.uv);
    primitives.push({ name: `${mesh.name}/${material?.name}`, baked, ...decoded });
  }
}

// One merged occluder for the BVH.
const totalVertices = primitives.reduce((sum, p) => sum + p.position.length / 3, 0);
const totalIndices = primitives.reduce((sum, p) => sum + p.index.length, 0);
const mergedPosition = new Float32Array(totalVertices * 3);
const mergedIndex = new Uint32Array(totalIndices);
let vertexOffset = 0;
let indexOffset = 0;
for (const primitive of primitives) {
  mergedPosition.set(primitive.position, vertexOffset * 3);
  for (let i = 0; i < primitive.index.length; i += 1) mergedIndex[indexOffset + i] = primitive.index[i] + vertexOffset;
  vertexOffset += primitive.position.length / 3;
  indexOffset += primitive.index.length;
}
const occluder = new THREE.BufferGeometry();
occluder.setAttribute('position', new THREE.BufferAttribute(mergedPosition, 3));
occluder.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
const bvh = new MeshBVH(occluder);
if (shareIndex === 0) console.log(`occluders: ${primitives.length} primitives, ${totalIndices / 3} triangles; baking ${primitives.filter(p => p.baked).map(p => p.name).join(', ')}`);

// Fixed cosine-weighted hemisphere directions about +Z (Hammersley set), rotated
// per texel with a random twist so the pattern does not band across the atlas.
const hemisphere = [];
for (let i = 0; i < rayCount; i += 1) {
  let bits = i;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  const u = (i + 0.5) / rayCount;
  const v = bits / 4294967296;
  const r = Math.sqrt(u);
  const phi = 2 * Math.PI * v;
  hemisphere.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
}

const sums = new Float32Array(size * size);
const coverage = new Uint16Array(size * size);
const ray = new THREE.Ray();
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();
const normal = new THREE.Vector3();
const helper = new THREE.Vector3();
let seed = 1 + shareIndex * 7919;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function shadeTexel(px, py, pz, nx, ny, nz) {
  normal.set(nx, ny, nz).normalize();
  // Any perpendicular basis, then a random twist about the normal.
  helper.set(Math.abs(normal.z) < 0.9 ? 0 : 1, 0, Math.abs(normal.z) < 0.9 ? 1 : 0);
  tangent.crossVectors(helper, normal).normalize();
  bitangent.crossVectors(normal, tangent);
  const twist = random() * Math.PI * 2;
  const c = Math.cos(twist);
  const s = Math.sin(twist);
  let hits = 0;
  for (const [hx, hy, hz] of hemisphere) {
    const x = hx * c - hy * s;
    const y = hx * s + hy * c;
    ray.direction.set(
      tangent.x * x + bitangent.x * y + normal.x * hz,
      tangent.y * x + bitangent.y * y + normal.y * hz,
      tangent.z * x + bitangent.z * y + normal.z * hz,
    );
    ray.origin.set(px, py, pz).addScaledVector(normal, bias);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, bias, distance);
    // Weight near hits more than distant ones so the falloff is soft.
    if (hit) hits += 1 - hit.distance / distance;
  }
  return hits / hemisphere.length;
}

let triangle = 0;
for (const primitive of primitives) {
  if (!primitive.baked) continue;
  const { position, normal: normals, uv, index } = primitive;
  for (let f = 0; f < index.length; f += 3) {
    triangle += 1;
    if (triangle % shareCount !== shareIndex) continue;
    const a = index[f];
    const b = index[f + 1];
    const c = index[f + 2];
    // Texel-space triangle (glTF UVs: origin top-left, matching flipY=false).
    const ax = uv[a * 2] * size;
    const ay = uv[a * 2 + 1] * size;
    const bx = uv[b * 2] * size;
    const by = uv[b * 2 + 1] * size;
    const cx = uv[c * 2] * size;
    const cy = uv[c * 2 + 1] * size;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let ty = minY; ty <= maxY; ty += 1) {
      for (let tx = minX; tx <= maxX; tx += 1) {
        const sx = tx + 0.5;
        const sy = ty + 0.5;
        const w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) / area;
        const w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const px = position[a * 3] * w0 + position[b * 3] * w1 + position[c * 3] * w2;
        const py = position[a * 3 + 1] * w0 + position[b * 3 + 1] * w1 + position[c * 3 + 1] * w2;
        const pz = position[a * 3 + 2] * w0 + position[b * 3 + 2] * w1 + position[c * 3 + 2] * w2;
        const nx = normals[a * 3] * w0 + normals[b * 3] * w1 + normals[c * 3] * w2;
        const ny = normals[a * 3 + 1] * w0 + normals[b * 3 + 1] * w1 + normals[c * 3 + 1] * w2;
        const nz = normals[a * 3 + 2] * w0 + normals[b * 3 + 2] * w1 + normals[c * 3 + 2] * w2;
        const slot = ty * size + tx;
        // Overlapping UV islands average rather than last-write-wins.
        sums[slot] += shadeTexel(px, py, pz, nx, ny, nz);
        coverage[slot] += 1;
      }
    }
  }
}
return { sums, coverage };
}

if (!isMainThread) {
  const result = await bakeShare(workerData.shareIndex, workerData.shareCount);
  parentPort.postMessage(result, [result.sums.buffer, result.coverage.buffer]);
  process.exit(0);
}

const started = Date.now();
const shares = await Promise.all(Array.from({ length: workerCount }, (_, shareIndex) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL(import.meta.url), {
    argv: process.argv.slice(2),
    workerData: { shareIndex, shareCount: workerCount },
  });
  worker.once('message', resolve);
  worker.once('error', reject);
})));
const occlusion = new Float32Array(size * size).fill(-1);
const coverage = new Uint16Array(size * size);
let texels = 0;
for (const share of shares) {
  for (let slot = 0; slot < occlusion.length; slot += 1) {
    if (!share.coverage[slot]) continue;
    occlusion[slot] = (occlusion[slot] < 0 ? 0 : occlusion[slot]) + share.sums[slot];
    coverage[slot] += share.coverage[slot];
    texels += share.coverage[slot];
  }
}
for (let slot = 0; slot < occlusion.length; slot += 1) if (coverage[slot]) occlusion[slot] /= coverage[slot];
let overlapping = 0;
for (let i = 0; i < coverage.length; i += 1) if (coverage[i] > 1) overlapping += 1;
console.log(`shaded ${texels} texel samples in ${((Date.now() - started) / 1000).toFixed(1)}s; ${overlapping} texels hit by more than one triangle`);

// Dilate covered texels outward so mipmaps and bilinear taps at island edges
// never see the uncovered background.
const filled = new Float32Array(occlusion);
for (let pass = 0; pass < dilatePasses; pass += 1) {
  const source = new Float32Array(filled);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const slot = y * size + x;
      if (source[slot] >= 0) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const neighbour = source[ny * size + nx];
          if (neighbour >= 0) { sum += neighbour; count += 1; }
        }
      }
      if (count) filled[slot] = sum / count;
    }
  }
}

const pixels = new Uint8Array(size * size);
for (let i = 0; i < pixels.length; i += 1) {
  const occluded = filled[i] < 0 ? 0 : filled[i];
  pixels[i] = Math.round(255 * Math.pow(1 - Math.min(1, occluded), power));
}
let image = sharp(Buffer.from(pixels), { raw: { width: size, height: size, channels: 1 } });
if (blurSigma > 0.3) image = image.blur(blurSigma);
await image.webp({ quality: 90 }).toFile(outPath);
const stats = await sharp(outPath).stats();
console.log(`wrote ${outPath} (${fs.statSync(outPath).size} bytes), mean ${stats.channels[0].mean.toFixed(1)}/255`);
