import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import fs from 'fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('asset-backups/darwin-candidate-2-animated.orig.glb');
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const uv = prim.getAttribute('TEXCOORD_0');
const idx = prim.getIndices();
const SIZE = 4096;

function inBand(p, side) {
  if (p[1] < 1.88 || p[1] > 2.02) return false;
  if (Math.abs(p[0]) > 0.09) return false;
  return side === 'pos' ? p[2] > 0.03 : p[2] < -0.03;
}

for (const side of ['pos', 'neg']) {
  const mask = new Uint8Array(SIZE * SIZE);
  const triCount = idx.getCount() / 3;
  let marked = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = idx.getScalar(t * 3), ib = idx.getScalar(t * 3 + 1), ic = idx.getScalar(t * 3 + 2);
    const pa = pos.getElement(ia, []), pb = pos.getElement(ib, []), pc = pos.getElement(ic, []);
    if (!(inBand(pa, side) && inBand(pb, side) && inBand(pc, side))) continue;
    marked++;
    const ua = uv.getElement(ia, []), ub = uv.getElement(ib, []), uc = uv.getElement(ic, []);
    // rasterize triangle in UV space (simple bbox + barycentric)
    const xs = [ua[0], ub[0], uc[0]].map(u => u * SIZE);
    const ys = [ua[1], ub[1], uc[1]].map(v => v * SIZE);
    const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(SIZE - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(SIZE - 1, Math.ceil(Math.max(...ys)));
    const d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const w0 = ((ys[1] - ys[2]) * (x - xs[2]) + (xs[2] - xs[1]) * (y - ys[2])) / d;
      const w1 = ((ys[2] - ys[0]) * (x - xs[2]) + (xs[0] - xs[2]) * (y - ys[2])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) mask[y * SIZE + x] = 255;
    }
  }
  console.log(side, 'tris:', marked);
  // cluster bboxes via coarse grid flood fill
  const G = 64, cell = SIZE / G;
  const grid = new Uint8Array(G * G);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
    if (mask[y * SIZE + x]) grid[Math.floor(y / cell) * G + Math.floor(x / cell)] = 1;
  const seen = new Uint8Array(G * G);
  const clusters = [];
  for (let i = 0; i < G * G; i++) {
    if (!grid[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let minX = G, maxX = 0, minY = G, maxY = 0, count = 0;
    while (stack.length) {
      const c = stack.pop(); count++;
      const cx = c % G, cy = Math.floor(c / G);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
        const ni = ny * G + nx;
        if (grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    clusters.push({ count, x: minX * cell, y: minY * cell, w: (maxX - minX + 1) * cell, h: (maxY - minY + 1) * cell });
  }
  clusters.sort((a, b) => b.count - a.count);
  console.log(side, 'clusters:', clusters.slice(0, 6).map(c => `${c.x},${c.y} ${c.w}x${c.h} (${c.count})`).join(' | '));
  fs.writeFileSync(`/tmp/clusters-${side}.json`, JSON.stringify(clusters));
  // save crops of top 4 clusters
  for (let k = 0; k < Math.min(4, clusters.length); k++) {
    const c = clusters[k];
    const pad = 32;
    const left = Math.max(0, c.x - pad), top = Math.max(0, c.y - pad);
    const w = Math.min(SIZE - left, c.w + 2 * pad), h = Math.min(SIZE - top, c.h + 2 * pad);
    await sharp('/tmp/darwin2-tex-orig.png').extract({ left, top, width: w, height: h })
      .resize({ width: Math.min(512, w * 4), kernel: 'nearest' })
      .png().toFile(`/tmp/eyecrop-${side}-${k}.png`);
  }
}
