// Shrink an NPC runtime GLB's embedded texture without touching its rig,
// animations, or bounds. Generalized from optimize-syms-runtime.mjs, which was
// hard-wired to one file; every character asset needs the same pass.
//
// Usage:
//   node scripts/optimize-npc-runtime-glb.mjs public/assets/models/npc-nicolas-lawson.glb [--size 1024] [--quality 88]

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { getBounds, textureCompress } from '@gltf-transform/functions';

const positional = process.argv.slice(2).filter(value => !value.startsWith('--'));
const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};

const input = path.resolve(positional[0] || '');
if (!positional[0]) throw new Error('Pass the GLB to optimize.');
const size = flag('size', 1024);
const quality = flag('quality', 88);
const temporary = `${input}.optimizing.glb`;
const io = new NodeIO().registerExtensions([KHRMaterialsSpecular, EXTTextureWebP]);

function documentStats(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  return {
    bounds: getBounds(scene),
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    skins: root.listSkins().length,
    animations: root.listAnimations().map(animation => animation.getName()),
    textures: root.listTextures().map(texture => ({
      mimeType: texture.getMimeType(),
      size: texture.getSize(),
      bytes: texture.getImage()?.byteLength || 0,
    })),
  };
}

// A texture pass must not move a vertex or drop a clip. Assert rather than
// trust: a silently de-skinned character renders as a T-posed statue.
function assertPreserved(before, after) {
  for (const key of ['nodes', 'meshes', 'skins']) {
    if (before[key] !== after[key]) throw new Error(`${key} changed: ${before[key]} -> ${after[key]}`);
  }
  if (before.animations.join('\n') !== after.animations.join('\n')) {
    throw new Error('animation inventory changed during texture optimization.');
  }
  for (const axis of [0, 1, 2]) {
    for (const edge of ['min', 'max']) {
      if (Math.abs(before.bounds[edge][axis] - after.bounds[edge][axis]) > 0.0005) {
        throw new Error(`${edge} bound changed on axis ${axis}.`);
      }
    }
  }
}

try {
  const beforeBytes = (await fs.stat(input)).size;
  const document = await io.read(input);
  const before = documentStats(document);
  await document.transform(textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [size, size],
    quality,
  }));
  const after = documentStats(document);
  assertPreserved(before, after);
  await io.write(temporary, document);
  const afterBytes = (await fs.stat(temporary)).size;
  await fs.rename(temporary, input);
  console.log(JSON.stringify({
    file: path.relative(process.cwd(), input),
    beforeBytes,
    afterBytes,
    savedBytes: beforeBytes - afterBytes,
    beforeTextures: before.textures,
    afterTextures: after.textures,
    animations: after.animations,
    skins: after.skins,
  }, null, 2));
} finally {
  await fs.rm(temporary, { force: true });
}
