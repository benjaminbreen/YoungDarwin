// Rebase GLBs so the bounding-box bottom-center sits at the origin — scatter
// placement then puts every plant's base exactly on the terrain.
// Usage: node scripts/ground-pivot.mjs <file.glb> [...more]

import { NodeIO, Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of process.argv.slice(2)) {
  const document = await io.read(file);
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  if (Math.abs(cx) < 0.01 && Math.abs(min[1]) < 0.01 && Math.abs(cz) < 0.01) {
    console.log(`${file}: already grounded`);
    continue;
  }
  const root = document.createNode('ground-root').setTranslation([-cx, -min[1], -cz]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  await io.write(file, document);
  console.log(`${file}: rebased by [${(-cx).toFixed(2)}, ${(-min[1]).toFixed(2)}, ${(-cz).toFixed(2)}]`);
}
