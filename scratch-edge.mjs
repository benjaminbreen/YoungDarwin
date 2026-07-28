// How much geometry sits within +/-2 m of a standing eye line at long range?
// That band is what renders as edge-on slivers.
import fs from 'node:fs';
const buf = fs.readFileSync('public/assets/generated/border-vistas/post_office_bay.bin');
const headerLen = buf.readUInt32LE(0);
const header = JSON.parse(buf.subarray(4, 4 + headerLen).toString());
const payloadStart = 4 + Math.ceil(headerLen / 4) * 4;
const EYE = 2.5;
let near = 0, total = 0;
function scan(rec, label) {
  const p = rec?.attributes?.position;
  if (!p) return;
  const arr = new Float32Array(buf.buffer, buf.byteOffset + payloadStart + p.offset, p.length);
  let n = 0, t = 0;
  for (let i = 0; i < arr.length; i += 3) {
    const r = Math.hypot(arr[i], arr[i + 2]);
    if (r < 150) continue;               // only long range matters
    t++;
    if (Math.abs(arr[i + 1] - EYE) < 2) n++;
  }
  if (t) console.log(`  ${label.padEnd(22)} ${n}/${t} verts within 2 m of eye line (${(100*n/t).toFixed(1)}%)`);
  near += n; total += t;
}
for (const e of header.entries) (e.rings || []).forEach((r, i) => scan(r, `${e.edge} ring${i}`));
for (const d of header.diagonals || []) scan(d.geometry, `${d.corner} quadrant`);
console.log(`\n  TOTAL ${near}/${total} (${total ? (100*near/total).toFixed(1) : 0}%) in the sliver band`);
