// Convert every remaining PNG texture inside runtime GLBs to WebP, in place.
// Batch generalization of optimize-npc-runtime-glb.mjs with the same
// structural guarantees: a texture pass must not move a vertex, drop a clip,
// or de-skin a character.
//
// Color/roughness/emissive go lossy (quality 90, capped 2048). Normal maps
// go lossless WebP: lossy chroma quantization on a normal map reads as
// shading ripple on smooth surfaces.
//
// Usage:
//   node scripts/optimize-batch-webp.mjs --dry     # list candidates
//   node scripts/optimize-batch-webp.mjs           # convert
//   node scripts/optimize-batch-webp.mjs path.glb  # convert one file
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, textureCompress } from '@gltf-transform/functions';

const MODELS_ROOT = 'public/assets/models';
const MAX_SIZE = 2048;
const QUALITY = 90;
const dry = process.argv.includes('--dry');
const only = process.argv.slice(2).filter(value => !value.startsWith('--'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function listGlbs(root) {
  const out = [];
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.glb')) out.push(full);
    }
  };
  await walk(root);
  return out;
}

function documentStats(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  return {
    bounds: getBounds(scene),
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    skins: root.listSkins().length,
    animations: root.listAnimations().map(animation => animation.getName()),
    pngs: root.listTextures().filter(texture => texture.getMimeType() === 'image/png').length,
  };
}

function assertPreserved(before, after, file) {
  for (const key of ['nodes', 'meshes', 'skins']) {
    if (before[key] !== after[key]) throw new Error(`${file}: ${key} changed ${before[key]} -> ${after[key]}`);
  }
  if (before.animations.join('\n') !== after.animations.join('\n')) {
    throw new Error(`${file}: animation inventory changed`);
  }
  for (const axis of [0, 1, 2]) {
    for (const edge of ['min', 'max']) {
      if (Math.abs(before.bounds[edge][axis] - after.bounds[edge][axis]) > 0.0005) {
        throw new Error(`${file}: ${edge} bound changed on axis ${axis}`);
      }
    }
  }
}

const files = only.length ? only.map(value => path.resolve(value)) : await listGlbs(MODELS_ROOT);
let totalBefore = 0;
let totalAfter = 0;
let converted = 0;

for (const file of files) {
  let document;
  try {
    document = await io.read(file);
  } catch (error) {
    console.log(`skip (unreadable): ${file} — ${error.message}`);
    continue;
  }
  const before = documentStats(document);
  if (!before.pngs) continue;
  const beforeBytes = (await fs.stat(file)).size;
  if (dry) {
    console.log(`${String((beforeBytes / 1024 | 0)).padStart(7)}KB  ${before.pngs} png  ${path.relative(process.cwd(), file)}`);
    continue;
  }

  // Two passes: everything except normals lossy, normals lossless.
  await document.transform(textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [MAX_SIZE, MAX_SIZE],
    quality: QUALITY,
    slots: /^(?!normalTexture)/,
  }));
  await document.transform(textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [MAX_SIZE, MAX_SIZE],
    lossless: true,
    slots: /^normalTexture$/,
  }));

  const after = documentStats(document);
  assertPreserved(before, after, file);
  const temporary = `${file}.optimizing.glb`;
  try {
    await io.write(temporary, document);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  const afterBytes = (await fs.stat(file)).size;
  totalBefore += beforeBytes;
  totalAfter += afterBytes;
  converted += 1;
  console.log(`${String((beforeBytes / 1024 | 0)).padStart(7)}KB -> ${String((afterBytes / 1024 | 0)).padStart(7)}KB  ${path.relative(process.cwd(), file)}`);
}

if (!dry) {
  console.log(`\n${converted} files: ${(totalBefore / 1048576).toFixed(1)}MB -> ${(totalAfter / 1048576).toFixed(1)}MB`);
}
