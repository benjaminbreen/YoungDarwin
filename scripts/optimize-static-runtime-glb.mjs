// Losslessly collapse compatible static GLB nodes/primitives to reduce draw
// calls and parse overhead. Geometry, textures, materials, and world bounds are
// preserved; this intentionally does not decimate silhouettes.
//
// Usage:
//   node scripts/optimize-static-runtime-glb.mjs path/to/a.glb path/to/b.glb

// Files are replaced atomically only after their bounds and triangle count
// match the source document.

import path from 'node:path';
import fs from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, join, prune, weld } from '@gltf-transform/functions';

const files = process.argv.slice(2);
if (!files.length) {
  throw new Error('Pass one or more static runtime GLB paths.');
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function documentStats(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const bounds = getBounds(scene);
  let triangles = 0;
  let primitives = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const positions = primitive.getAttribute('POSITION');
      triangles += (indices ? indices.getCount() : positions.getCount()) / 3;
      primitives += 1;
    }
  }
  return { bounds, triangles: Math.round(triangles), primitives };
}

function assertEquivalent(file, before, after) {
  if (before.triangles !== after.triangles) {
    throw new Error(`${file}: triangle count changed (${before.triangles} -> ${after.triangles}).`);
  }
  for (const axis of [0, 1, 2]) {
    for (const edge of ['min', 'max']) {
      if (Math.abs(before.bounds[edge][axis] - after.bounds[edge][axis]) > 0.0005) {
        throw new Error(`${file}: ${edge} bound changed on axis ${axis}.`);
      }
    }
  }
}

for (const input of files) {
  const absolute = path.resolve(input);
  const document = await io.read(absolute);
  const before = documentStats(document);
  await document.transform(
    flatten(),
    dedup(),
    join(),
    weld({ tolerance: 0.00001 }),
    prune(),
  );
  const after = documentStats(document);
  assertEquivalent(input, before, after);
  const temporary = `${absolute}.optimizing.glb`;
  await io.write(temporary, document);
  const [oldStat, newStat] = await Promise.all([fs.stat(absolute), fs.stat(temporary)]);
  await fs.rename(temporary, absolute);
  const saved = Math.max(0, oldStat.size - newStat.size);
  console.log(
    `${input}: ${before.primitives} -> ${after.primitives} primitives, `
    + `${before.triangles} tris, saved ${Math.round(saved / 1024)} KiB`,
  );
}
