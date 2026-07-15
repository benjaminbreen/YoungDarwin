// Convert the raw penal-colony Tripo GLBs (repo root) into runtime assets in
// public/assets/models/structures/. Buildings pass through with WebP texture
// compression; the two segmented vignette GLBs are split into reusable props
// (trough / hitching post / bucket, fence runs / gate) and recentered so each
// part sits on its own origin with minY = 0.
//
// Usage: node scripts/prepare-penal-colony-assets.mjs

import path from 'node:path';
import fs from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, textureCompress, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';

const root = process.cwd();
const outDir = path.join(root, 'public', 'assets', 'models', 'structures');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Raw file -> runtime name. Buildings keep their single baked mesh.
const WHOLE_MODELS = [
  ['governors+house+nicholas+lawson.glb', 'governors-house.glb', 1024],
  ['wooden+cabin+3d+model.glb', 'barracks-cabin.glb', 1024],
  ['thatched+hut+3d+model.glb', 'thatched-hut-a.glb', 1024],
  ['thatched+hut+3d+model-2.glb', 'thatched-hut-b.glb', 1024],
  ['penal+wooden+shack+3d+model.glb', 'penal-shack.glb', 1024],
  ['grain+threshing+hut.glb', 'threshing-hut.glb', 1024],
  ['animal+leanto+farm+structure.glb', 'animal-leanto.glb', 1024],
  ['animal+paddock.glb', 'animal-paddock.glb', 1024],
  ['wooden+outhouse+3d+model.glb', 'outhouse.glb', 512],
  ['wooden+wheelbarrow+3d+model.glb', 'wheelbarrow.glb', 512],
  ['barrel+3d+model.glb', 'settlement-barrel.glb', 512],
  ['wooden+crates+and+bags+clutter.glb', 'crates-and-bags.glb', 512],
];

// Segmented vignettes -> per-prop part buckets. Part membership was mapped
// with scripts/inspect-glb-parts.mjs; names are stable in the source GLBs.
const names = list => new Set(list.map(n => `tripo_part_${n}`));
const SPLIT_MODELS = [
  {
    source: 'trough+and+hitching+post+segmented.glb',
    outputs: [
      { name: 'water-trough.glb', size: 512, keep: names([3]) },
      { name: 'wooden-bucket.glb', size: 512, keep: names([2, 5, 10, 11, 32, 33]) },
      { name: 'hitching-post.glb', size: 512, keep: names([1, 6, 7, 8, 9, 12, 13, 14, 15, 16, 21, 23, 26, 40, 41]) },
      // Remaining parts are a flat tack-mat of ground clutter; dropped.
    ],
  },
  {
    source: 'wooden+gate+with+fence+3d+model.glb',
    // The fence line runs along Z with a framed gate at the center. Arbor
    // beams and pillar caps all sit above y=0.33; fence-run posts/rails stay
    // below it, so bucket by (cz, cy, cx) instead of hand-listing 97 parts.
    outputs: [
      {
        name: 'fence-run-a.glb',
        size: 512,
        match: c => c.cz >= 0.145 && c.cy < 0.33,
      },
      {
        name: 'fence-run-b.glb',
        size: 512,
        match: c => c.cz <= -0.145 && c.cy < 0.33 && c.cx >= 0.1,
      },
      {
        name: 'settlement-gate.glb',
        size: 512,
        match: c => !((c.cz >= 0.145 && c.cy < 0.33) || (c.cz <= -0.145 && c.cy < 0.33 && c.cx >= 0.1)),
      },
    ],
  },
];

async function report(doc, outFile) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  const size = [0, 1, 2].map(i => (max[i] - min[i]).toFixed(2)).join(' x ');
  const stat = await fs.stat(outFile);
  console.log(`${path.basename(outFile).padEnd(24)} ${Math.round(tris)} tris, ${size}, minY ${min[1].toFixed(3)}, ${(stat.size / 1024).toFixed(0)}kb`);
}

async function crunchWhole(source, outName, textureSize) {
  const doc = await io.read(path.join(root, source));
  await doc.transform(
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize] }),
    prune(),
  );
  const outFile = path.join(outDir, outName);
  await io.write(outFile, doc);
  await report(doc, outFile);
}

function nodeCentroid(node) {
  const { min, max } = getBounds(node);
  return {
    cx: (min[0] + max[0]) / 2,
    cy: (min[1] + max[1]) / 2,
    cz: (min[2] + max[2]) / 2,
  };
}

async function splitSegmented({ source, outputs }) {
  for (const output of outputs) {
    const doc = await io.read(path.join(root, source));
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    const doomed = [];
    scene.traverse(node => {
      if (!node.getMesh()) return;
      const keep = output.keep
        ? output.keep.has(node.getName())
        : output.match(nodeCentroid(node));
      if (!keep) doomed.push(node);
    });
    for (const node of doomed) node.dispose();

    // Recenter: shared origin at the footprint center, feet on y=0. All Tripo
    // parts are root-level children, so a translation shift is sufficient.
    const { min, max } = getBounds(scene);
    const offset = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
    for (const node of scene.listChildren()) {
      const t = node.getTranslation();
      node.setTranslation([t[0] + offset[0], t[1] + offset[1], t[2] + offset[2]]);
    }

    await doc.transform(
      flatten(),
      dedup(),
      join(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [output.size, output.size] }),
      prune(),
    );
    const outFile = path.join(outDir, output.name);
    await io.write(outFile, doc);
    await report(doc, outFile);
  }
}

await fs.mkdir(outDir, { recursive: true });
for (const [source, outName, textureSize] of WHOLE_MODELS) {
  await crunchWhole(source, outName, textureSize);
}
for (const config of SPLIT_MODELS) {
  await splitSegmented(config);
}
console.log('\nDone. Runtime assets in public/assets/models/structures/');
