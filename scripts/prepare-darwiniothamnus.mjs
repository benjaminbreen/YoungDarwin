// Converts the Darwiniothamnus source catalog sheet into one compact runtime
// GLB containing nine centered LOD0 shrub variants. The source arranges each
// form in three rows (LOD0 / LOD1 / billboard); rendering that file directly
// repeats the entire sheet at every ecology scatter point.
//
// Usage:
//   node scripts/prepare-darwiniothamnus.mjs [input.glb] [output.glb]

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  getBounds,
  prune,
  textureCompress,
  weld,
} from '@gltf-transform/functions';

const input = path.resolve(
  process.argv[2] || 'assets-src/root-raw-assets/Darwiniothamnus lancifolius_pack.glb',
);
const output = path.resolve(
  process.argv[3] || 'public/assets/models/nature/runtime-darwiniothamnus.glb',
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function variantName(sourceName) {
  const base = sourceName.split('_LOD0_')[0];
  const match = /Daisy_patch_(big|small)_(\d+)/i.exec(base);
  if (match) return `darwiniothamnus-${match[1]}-${match[2]}`;
  const single = /Daisy_(\d+)/i.exec(base);
  if (single) return `darwiniothamnus-single-${single[1]}`;
  throw new Error(`Unrecognized Darwiniothamnus LOD0 node: ${sourceName}`);
}

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      triangles += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(triangles);
}

const document = await io.read(input);
const root = document.getRoot();
const sourceScenes = root.listScenes();
const variants = root.listNodes().filter(node => (
  node.getMesh() && /_LOD0_/i.test(node.getName())
));

if (variants.length !== 9) {
  throw new Error(`Expected 9 Darwiniothamnus LOD0 variants, found ${variants.length}.`);
}

const runtimeScene = document.createScene('Darwiniothamnus shrub variants');
root.setDefaultScene(runtimeScene);

for (const node of variants) {
  const name = variantName(node.getName());
  // The source's parent nodes provide the FBX unit conversion and -90° X
  // rotation that make the shrubs upright. Preserve that complete world
  // transform while removing only the catalog-sheet placement.
  const worldMatrix = node.getWorldMatrix();
  runtimeScene.addChild(node);
  node.setMatrix(worldMatrix);
  const bounds = getBounds(node);
  const translation = node.getTranslation();
  node.setTranslation([
    translation[0] - (bounds.min[0] + bounds.max[0]) * 0.5,
    translation[1] - bounds.min[1],
    translation[2] - (bounds.min[2] + bounds.max[2]) * 0.5,
  ]);
  node.setName(name);
  node.getMesh().setName(name);
}

for (const scene of sourceScenes) scene.dispose();

await document.transform(
  weld(),
  dedup(),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [512, 512],
    quality: 86,
  }),
);

for (const material of root.listMaterials()) {
  if (material.getAlphaMode() === 'BLEND') {
    material.setAlphaMode('MASK');
    material.setAlphaCutoff(0.42);
  }
  material.setDoubleSided(true);
}

await fs.mkdir(path.dirname(output), { recursive: true });
await io.write(output, document);

const reread = await io.read(output);
const rereadRoot = reread.getRoot();
const scene = rereadRoot.getDefaultScene() || rereadRoot.listScenes()[0];
const meshNodes = rereadRoot.listNodes().filter(node => node.getMesh());
if (meshNodes.length !== 9 || meshNodes.some(node => !/^darwiniothamnus-/.test(node.getName()))) {
  throw new Error('Runtime Darwiniothamnus variant inventory failed validation.');
}

const bounds = getBounds(scene);
const bytes = (await fs.stat(output)).size;
console.log(JSON.stringify({
  input: path.relative(process.cwd(), input),
  output: path.relative(process.cwd(), output),
  bytes,
  variants: meshNodes.map(node => node.getName()).sort(),
  meshes: rereadRoot.listMeshes().length,
  materials: rereadRoot.listMaterials().length,
  textures: rereadRoot.listTextures().length,
  triangles: triangleCount(reread),
  bounds: {
    min: bounds.min.map(value => Number(value.toFixed(4))),
    max: bounds.max.map(value => Number(value.toFixed(4))),
  },
}, null, 2));
