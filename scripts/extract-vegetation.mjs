// Extracts game-ready vegetation GLBs from the raw asset dumps at the repo
// root. Each job keeps only the meshes matching `keep`, prunes everything
// else, compresses textures to small WebP, and reports the result's bounds so
// runtime scales can be tuned.
//
// Usage: node scripts/extract-vegetation.mjs

import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, textureCompress, getBounds, metalRough } from '@gltf-transform/functions';
import sharp from 'sharp';

const root = process.cwd();
const outDir = path.join(root, 'public', 'assets', 'models', 'nature');

const JOBS = [
  {
    input: 'grass_patches.glb',
    output: 'runtime-grass-patch-1.glb',
    keep: /grasspatch1/i,
  },
  {
    input: 'grass_patches.glb',
    output: 'runtime-grass-patch-2.glb',
    keep: /grasspatch2/i,
  },
  {
    input: 'grass_patches.glb',
    output: 'runtime-grass-patch-3.glb',
    keep: /grasspatch3/i,
  },
  {
    input: 'cacti.glb',
    output: 'runtime-opuntia.glb',
    keep: /prickly pear/i,
    // The pack shares one "spines" point-cloud mesh across ALL cacti — keeping
    // it ghosts the other cacti as dotted outlines and costs heavy overdraw.
    drop: /spines/i,
  },
  {
    input: 'low_poly_plants.glb',
    output: 'runtime-ground-plants.glb',
    keep: /^(Grass [123]|Clover [12])/i,
  },
  // --- Northern Shore candidates (review in the dev asset browser) ---------
  { input: 'shapespark_low_poly_exterior_plants_kit.glb', output: 'candidate-saltbush-1.glb', keep: /^Bush-01/i },
  { input: 'shapespark_low_poly_exterior_plants_kit.glb', output: 'candidate-saltbush-2.glb', keep: /^Bush-03/i },
  { input: 'shapespark_low_poly_exterior_plants_kit.glb', output: 'candidate-saltbush-3.glb', keep: /^Bush-05/i },
  { input: 'shapespark_low_poly_exterior_plants_kit.glb', output: 'candidate-high-grass.glb', keep: /^Grass-02/i },
  { input: 'shapespark_low_poly_exterior_plants_kit.glb', output: 'candidate-low-tree.glb', keep: /^Tree-03-1/i },
  { input: 'uploads-grass.glb', output: 'candidate-dry-branches.glb', keep: /^Wasteland branches/i },
  { input: 'uploads-grass.glb', output: 'candidate-dry-grass-tuft.glb', keep: /^Wasteland grass medium/i },
  { input: 'uploads-grass.glb', output: 'candidate-lava-gravel.glb', keep: /^Wasteland gravel/i },
  { input: 'uploads-grass.glb', output: 'candidate-beach-weeds.glb', keep: /^weed 0[12]/i },
  { input: 'simple_grass_chunks.glb', output: 'candidate-ground-chunk.glb', keep: /^rostlinka_07c/i },
  { input: 'desert-pack.glb', output: 'candidate-sagebrush.glb', keep: /^Sagebrush_Bush_Low$/i },
  { input: 'desert-pack.glb', output: 'candidate-sagebrush-small.glb', keep: /^Sagebrush_Low$/i },
  { input: 'desert-pack.glb', output: 'candidate-snakeweed.glb', keep: /^BroomSnakeweed_Low$/i },
  { input: 'desert-pack.glb', output: 'candidate-ocotillo.glb', keep: /^Ocotillo_Low$/i },
  { input: 'desert-pack.glb', output: 'candidate-elephant-grass.glb', keep: /^ElephantGrass_Low$/i },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const job of JOBS) {
  const document = await io.read(path.join(root, 'assets-src', 'raw', job.input));
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];

  // Drop scene nodes that contain no matching mesh anywhere beneath them.
  const matches = node => {
    if (job.keep.test(node.getName())) return true;
    const mesh = node.getMesh();
    if (mesh && job.keep.test(mesh.getName())) return true;
    return node.listChildren().some(matches);
  };
  const pruneNode = node => {
    const mesh = node.getMesh();
    // A node matching by name keeps its entire subtree (grouped models name
    // the parent, not the mesh children).
    if (job.keep.test(node.getName()) || (mesh && job.keep.test(mesh.getName()))) return;
    if (!node.listChildren().some(matches)) {
      node.dispose();
      return;
    }
    node.listChildren().forEach(pruneNode);
  };
  scene.listChildren().forEach(pruneNode);

  if (job.drop) {
    const dropNode = node => {
      const mesh = node.getMesh();
      if (job.drop.test(node.getName()) || (mesh && job.drop.test(mesh.getName()))) {
        node.dispose();
        return;
      }
      node.listChildren().forEach(dropNode);
    };
    scene.listChildren().forEach(dropNode);
  }

  await document.transform(
    // Convert legacy specular-glossiness materials to metallic-roughness —
    // three.js dropped KHR_materials_pbrSpecularGlossiness support, so without
    // this the textures are silently ignored at runtime.
    metalRough(),
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
  );

  // Foliage cards need alpha-cutout, not blending (correct depth sorting, no
  // halo artifacts).
  for (const material of document.getRoot().listMaterials()) {
    if (material.getAlphaMode() === 'BLEND') {
      material.setAlphaMode('MASK');
      material.setAlphaCutoff(0.42);
    }
    material.setDoubleSided(true);
  }

  const outPath = path.join(outDir, job.output);
  await io.write(outPath, document);

  const { min, max } = getBounds(scene);
  const size = [0, 1, 2].map(i => (max[i] - min[i]).toFixed(2)).join(' x ');
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  console.log(`${job.output}: ${Math.round(tris)} tris, bounds ${size} (minY ${min[1].toFixed(2)})`);
}
