// Rebuild the Syms runtime GLB with a web-sized embedded texture while
// preserving its scene, rig, and animation inventory.
//
// Usage:
//   node scripts/optimize-syms-runtime.mjs [path/to/syms-animated.glb]

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { getBounds, textureCompress } from '@gltf-transform/functions';

const input = path.resolve(process.argv[2] || 'public/assets/models/syms-animated.glb');
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

function assertPreserved(before, after) {
  for (const key of ['nodes', 'meshes', 'skins']) {
    if (before[key] !== after[key]) throw new Error(`Syms ${key} changed: ${before[key]} -> ${after[key]}`);
  }
  if (before.animations.join('\n') !== after.animations.join('\n')) {
    throw new Error('Syms animation inventory changed during texture optimization.');
  }
  for (const axis of [0, 1, 2]) {
    for (const edge of ['min', 'max']) {
      if (Math.abs(before.bounds[edge][axis] - after.bounds[edge][axis]) > 0.0005) {
        throw new Error(`Syms ${edge} bound changed on axis ${axis}.`);
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
    resize: [2048, 2048],
    quality: 90,
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
    animations: after.animations.length,
  }, null, 2));
} finally {
  await fs.rm(temporary, { force: true });
}
