// Print per-node world-space bounding boxes for a segmented GLB so part
// clusters can be identified before splitting. Usage:
//   node scripts/inspect-glb-parts.mjs <file.glb> [...]

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const total = getBounds(scene);
  console.log(`\n=== ${file.split('/').pop()} ===`);
  console.log(`scene bounds: min [${total.min.map(v => v.toFixed(2))}] max [${total.max.map(v => v.toFixed(2))}]`);
  const parts = [];
  scene.traverse(node => {
    if (!node.getMesh()) return;
    const b = getBounds(node);
    parts.push({
      name: node.getName(),
      cx: (b.min[0] + b.max[0]) / 2,
      cy: (b.min[1] + b.max[1]) / 2,
      cz: (b.min[2] + b.max[2]) / 2,
      sx: b.max[0] - b.min[0],
      sy: b.max[1] - b.min[1],
      sz: b.max[2] - b.min[2],
    });
  });
  parts.sort((a, b) => a.cx - b.cx);
  for (const p of parts) {
    console.log(`${p.name.padEnd(16)} center(${p.cx.toFixed(2)}, ${p.cy.toFixed(2)}, ${p.cz.toFixed(2)}) size(${p.sx.toFixed(2)} x ${p.sy.toFixed(2)} x ${p.sz.toFixed(2)})`);
  }
}
