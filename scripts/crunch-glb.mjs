// Heavy-duty GLB cruncher for photoreal source assets: weld + meshopt
// simplify + small WebP textures. Usage:
//   node scripts/crunch-glb.mjs <in.glb> <out.glb> [simplifyRatio=0.15]

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, ratioArg, errorArg] = process.argv.slice(2);
const ratio = Number(ratioArg || 0.15);
const error = Number(errorArg || 0.001);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);

await document.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
  prune(),
);

await io.write(output, document);

const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
const { min, max } = getBounds(scene);
let tris = 0;
for (const mesh of document.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
  }
}
console.log(`${output}: ${Math.round(tris)} tris, bounds ${[0, 1, 2].map(i => (max[i] - min[i]).toFixed(2)).join(' x ')}`);
