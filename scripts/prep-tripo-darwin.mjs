// Prep a segmented Tripo Darwin GLB for Mixamo rigging.
//   join (15 parts -> 1 mesh, closing the split seams) + weld + meshopt simplify
// Outputs:
//   asset-backups/darwin-tripo-decimated.glb  — decimated + textured (recombine source)
//   asset-backups/darwin-tripo-for-mixamo.obj — decimated geometry (upload to Mixamo)
//
// Usage: node scripts/prep-tripo-darwin.mjs [--in=path.glb] [--tris=60000]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, dedup, join, weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const INPUT = args.in || 'assets-src/root-raw-assets/darwin-tripo-segmented.glb';
const TARGET_TRIS = Number(args.tris || 60000);
const OUT_GLB = 'asset-backups/darwin-tripo-decimated.glb';
const OUT_OBJ = 'asset-backups/darwin-tripo-for-mixamo.obj';

function countTris(root) {
  let t = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      t += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  }
  return t;
}

function writeObj(root, path) {
  const lines = [];
  let vOff = 0;
  const p = [0, 0, 0], n = [0, 0, 0], t = [0, 0];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const nor = prim.getAttribute('NORMAL');
      const uv = prim.getAttribute('TEXCOORD_0');
      const idx = prim.getIndices();
      const vc = pos.getCount();
      for (let i = 0; i < vc; i += 1) { pos.getElement(i, p); lines.push(`v ${p[0]} ${p[1]} ${p[2]}`); }
      if (uv) for (let i = 0; i < vc; i += 1) { uv.getElement(i, t); lines.push(`vt ${t[0]} ${t[1]}`); }
      if (nor) for (let i = 0; i < vc; i += 1) { nor.getElement(i, n); lines.push(`vn ${n[0]} ${n[1]} ${n[2]}`); }
      const tri = idx ? idx.getCount() : vc;
      for (let i = 0; i < tri; i += 3) {
        const a = (idx ? idx.getScalar(i) : i) + 1 + vOff;
        const b = (idx ? idx.getScalar(i + 1) : i + 1) + 1 + vOff;
        const c = (idx ? idx.getScalar(i + 2) : i + 2) + 1 + vOff;
        const tag = (k) => (uv && nor ? `${k}/${k}/${k}` : uv ? `${k}/${k}` : nor ? `${k}//${k}` : `${k}`);
        lines.push(`f ${tag(a)} ${tag(b)} ${tag(c)}`);
      }
      vOff += vc;
    }
  }
  fs.writeFileSync(path, lines.join('\n'));
  return vOff;
}

async function main() {
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(INPUT);
  const before = countTris(doc.getRoot());
  const ratio = Math.min(1, TARGET_TRIS / before);
  console.log(`Input tris: ${before.toLocaleString()} -> target ${TARGET_TRIS.toLocaleString()} (ratio ${ratio.toFixed(4)})`);

  await doc.transform(
    flatten(),                 // bake the ParentNode transform into the meshes
    dedup(),
    join(),                    // merge the 15 same-material parts into one primitive
    weld(),                    // close the split part seams so simplify stays watertight
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0015, lockBorder: false }),
    prune(),
  );

  const after = countTris(doc.getRoot());
  console.log(`Decimated tris: ${after.toLocaleString()} | meshes: ${doc.getRoot().listMeshes().length}`);

  await io.write(OUT_GLB, doc);
  const verts = writeObj(doc.getRoot(), OUT_OBJ);
  console.log(`Wrote ${OUT_GLB} (${(fs.statSync(OUT_GLB).size / 1e6).toFixed(1)}MB)`);
  console.log(`Wrote ${OUT_OBJ} (${(fs.statSync(OUT_OBJ).size / 1e6).toFixed(1)}MB, ${verts.toLocaleString()} verts) -> upload to Mixamo`);
}

main().catch(err => { console.error(err); process.exit(1); });
