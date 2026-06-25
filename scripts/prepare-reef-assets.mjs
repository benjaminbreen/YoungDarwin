// One-off importer for the Northwest Reef asset drop: crunches archived raw
// GLBs into runtime-sized files under public/assets/models/.
// Static corals get welded + simplified; animated creatures keep their
// skins/clips and just get resampled animation + WebP textures.
//   node scripts/prepare-reef-assets.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, resample, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const NATURE = 'public/assets/models/nature/';
const ANIMALS = 'public/assets/models/animals/runtime/';
const RAW = 'assets-src/root-raw-assets/';

const JOBS = [
  { in: `${RAW}coral.glb`, out: `${NATURE}runtime-coral-branch.glb`, kind: 'static', texSize: 512 },
  { in: `${RAW}coral_piece.glb`, out: `${NATURE}runtime-coral-head.glb`, kind: 'static', ratio: 0.45, texSize: 512 },
  { in: `${RAW}coral_reef_3_l.glb`, out: `${NATURE}runtime-coral-cluster.glb`, kind: 'static', ratio: 0.4, texSize: 512 },
  { in: `${RAW}aniamted_seal.glb`, out: `${ANIMALS}sea-lion.glb`, kind: 'animated', texSize: 512 },
  { in: `${RAW}model_50a_-_hawksbill_sea_turtle.glb`, out: `${ANIMALS}green-turtle.glb`, kind: 'animated', texSize: 512 },
  { in: `${RAW}animated_low_poly_fish.glb`, out: `${ANIMALS}reef-fish.glb`, kind: 'animated', texSize: 256 },
  { in: `${RAW}clown_fish_low_poly_animated.glb`, out: `${ANIMALS}clownfish.glb`, kind: 'animated', texSize: 128 },
  { in: `${RAW}manta_ray_birostris_animated.glb`, out: `${ANIMALS}manta-ray.glb`, kind: 'animated', texSize: 512 },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const job of JOBS) {
  const document = await io.read(job.in);
  const transforms = [dedup(), resample()];
  if (job.kind === 'static' && job.ratio) {
    transforms.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: job.ratio, error: 0.001 }));
  }
  transforms.push(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [job.texSize, job.texSize] }),
    prune(),
  );
  await document.transform(...transforms);
  await io.write(job.out, document);

  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  const kb = Math.round(statSync(job.out).size / 1024);
  console.log(`${job.out}: ${kb}KB, ${Math.round(tris)} tris, bounds ${[0, 1, 2].map(i => (max[i] - min[i]).toFixed(2)).join(' x ')}`);
}
