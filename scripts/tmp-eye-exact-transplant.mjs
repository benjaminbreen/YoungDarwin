import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('asset-backups/darwin-candidate-2-animated.orig.glb');
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const uv = prim.getAttribute('TEXCOORD_0');
const idx = prim.getIndices();
const SIZE = 4096;

// eye-region verts on the face (front = z > 0.03)
const inEye = p => p[1] > 1.88 && p[1] < 2.02 && Math.abs(p[0]) < 0.09 && Math.abs(p[0]) > 0.005 && p[2] > 0.03;

// Which 3D side does UV island A (the wonky eye, around 2752..2944 x 64..320) belong to?
const n = pos.getCount();
const all = [];
for (let i = 0; i < n; i++) {
  const p = pos.getElement(i, []);
  if (!inEye(p)) continue;
  const t = uv.getElement(i, []);
  all.push({ p, u: t[0] * SIZE, v: t[1] * SIZE, i });
}
const inA = q => q.u > 2700 && q.u < 3000 && q.v < 380;
const aPts = all.filter(inA);
const meanX = aPts.reduce((s, q) => s + q.p[0], 0) / aPts.length;
console.log('island A verts:', aPts.length, 'mean 3D x:', meanX.toFixed(4));
const aSign = Math.sign(meanX);
const inB = q => q.u > 3500 && q.u < 3900 && q.v > 2700 && q.v < 3200;
const bPts = all.filter(q => Math.sign(q.p[0]) === -aSign && inB(q));
console.log('island B candidate verts:', bPts.length);

// match each A vert to nearest mirrored B vert
const pairs = [];
for (const a of aPts) {
  const m = [-a.p[0], a.p[1], a.p[2]];
  let best = null, bd = 1e9;
  for (const b of bPts) {
    const d = (b.p[0] - m[0]) ** 2 + (b.p[1] - m[1]) ** 2 + (b.p[2] - m[2]) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  if (best && bd < 0.0001) pairs.push({ a, b: best }); // < 1cm
}
console.log('matched pairs:', pairs.length);

// least-squares similarity transform B->A, trying both orientation forms
function solve(reflect) {
  // model: [u'] = [a -sb][u] + [tx]   where s = +1 normal, reflection folds into form
  // params a, b, tx, ty ; reflect applies v -> -v on source first
  let Sxx = 0, Sxy = 0, Sx = 0, Sy = 0, Su = 0, Sv = 0, Suu = 0, N = pairs.length;
  // build normal equations for x' = a*u - b*v + tx ; y' = b*u + a*v + ty
  let A11 = 0, A12 = 0, A13 = 0, A14 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, S = 0;
  let suu = 0, su = 0, sv = 0, sxp = 0, syp = 0, suxp = 0, svxp = 0, suyp = 0, svyp = 0;
  for (const { a: A, b: B } of pairs) {
    const u = B.u, v = reflect ? -B.v : B.v, xp = A.u, yp = A.v;
    suu += u * u + v * v; su += u; sv += v;
    suxp += u * xp + v * yp; svxp += u * yp - v * xp;
    sxp += xp; syp += yp;
  }
  const Nn = pairs.length;
  // closed form (Umeyama-like for similarity in 2D)
  const mu = su / Nn, mv = sv / Nn, mxp = sxp / Nn, myp = syp / Nn;
  let Sa = 0, Sb = 0, Sd = 0;
  for (const { a: A, b: B } of pairs) {
    const u = B.u - mu, v = (reflect ? -B.v : B.v) - mv, xp = A.u - mxp, yp = A.v - myp;
    Sa += u * xp + v * yp; Sb += u * yp - v * xp; Sd += u * u + v * v;
  }
  const a = Sa / Sd, b = Sb / Sd;
  const tx = mxp - (a * mu - b * mv), ty = myp - (b * mu + a * mv);
  let err = 0;
  for (const { a: A, b: B } of pairs) {
    const u = B.u, v = reflect ? -B.v : B.v;
    const xp = a * u - b * v + tx, yp = b * u + a * v + ty;
    err += (xp - A.u) ** 2 + (yp - A.v) ** 2;
  }
  return { a, b, tx, ty, reflect, rms: Math.sqrt(err / Nn) };
}
// full affine least squares: [xp] = [m0 m1][u] + [m2]; [yp] = [m3 m4][v] + [m5]
function solveAffine() {
  let Suu = 0, Suv = 0, Svv = 0, Su = 0, Sv = 0, Nn = pairs.length;
  let Sxu = 0, Sxv = 0, Sx = 0, Syu = 0, Syv = 0, Sy = 0;
  for (const { a: A, b: B } of pairs) {
    const u = B.u, v = B.v;
    Suu += u * u; Suv += u * v; Svv += v * v; Su += u; Sv += v;
    Sxu += A.u * u; Sxv += A.u * v; Sx += A.u;
    Syu += A.v * u; Syv += A.v * v; Sy += A.v;
  }
  // solve 3x3 system M * [m0,m1,m2]^T = [Sxu,Sxv,Sx]^T (and same M for y row)
  const M = [[Suu, Suv, Su], [Suv, Svv, Sv], [Su, Sv, Nn]];
  function solve3(rhs) {
    const m = M.map(r => r.slice()), b = rhs.slice();
    for (let c = 0; c < 3; c++) {
      let piv = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      [m[c], m[piv]] = [m[piv], m[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 3; k++) m[r][k] -= f * m[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / m[i][i]);
  }
  const rx = solve3([Sxu, Sxv, Sx]), ry = solve3([Syu, Syv, Sy]);
  let err = 0;
  for (const { a: A, b: B } of pairs) {
    const xp = rx[0] * B.u + rx[1] * B.v + rx[2];
    const yp = ry[0] * B.u + ry[1] * B.v + ry[2];
    err += (xp - A.u) ** 2 + (yp - A.v) ** 2;
  }
  return { rx, ry, rms: Math.sqrt(err / Nn) };
}
const T = solveAffine();
console.log('affine rms:', T.rms.toFixed(2));

// collect B triangles (3D + UV) for exact correspondence sampling
const bTris = [];
{
  const triCount = idx.getCount() / 3;
  const inEyeB = p => p[1] > 1.86 && p[1] < 2.04 && Math.abs(p[0]) < 0.1 && p[2] > 0.02 && Math.sign(p[0]) === -aSign;
  for (let t = 0; t < triCount; t++) {
    const I = [idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2)];
    const P = I.map(i => pos.getElement(i, []));
    if (!P.every(inEyeB)) continue;
    const U = I.map(i => uv.getElement(i, []));
    if (!U.every(q => inB({ u: q[0] * SIZE, v: q[1] * SIZE }))) continue;
    const c = [0, 1, 2].map(k => (P[0][k] + P[1][k] + P[2][k]) / 3);
    bTris.push({ P, U, c });
  }
}
console.log('B tris:', bTris.length);

function closestOnTri(P, q) {
  // returns [w0,w1,w2, dist2] for closest point on triangle P to q
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ab = sub(P[1], P[0]), ac = sub(P[2], P[0]), ap = sub(q, P[0]);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0, dot(ap, ap)];
  const bp = sub(q, P[1]); const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0, dot(bp, bp)];
  const cp = sub(q, P[2]); const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1, dot(cp, cp)];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const w = d1 / (d1 - d3);
    const pt = [P[0][0] + ab[0] * w, P[0][1] + ab[1] * w, P[0][2] + ab[2] * w];
    const dq = sub(q, pt); return [1 - w, w, 0, dot(dq, dq)];
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const pt = [P[0][0] + ac[0] * w, P[0][1] + ac[1] * w, P[0][2] + ac[2] * w];
    const dq = sub(q, pt); return [1 - w, 0, w, dot(dq, dq)];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bc = sub(P[2], P[1]);
    const pt = [P[1][0] + bc[0] * w, P[1][1] + bc[1] * w, P[1][2] + bc[2] * w];
    const dq = sub(q, pt); return [0, 1 - w, w, dot(dq, dq)];
  }
  const denom = 1 / (va + vb + vc);
  const w1 = vb * denom, w2 = vc * denom;
  const pt = [P[0][0] + ab[0] * w1 + ac[0] * w2, P[0][1] + ab[1] * w1 + ac[1] * w2, P[0][2] + ab[2] * w1 + ac[2] * w2];
  const dq = sub(q, pt);
  return [1 - w1 - w2, w1, w2, dot(dq, dq)];
}

function sampleBviaSymmetry(p3d) {
  const q = [-p3d[0], p3d[1], p3d[2]];
  // rank by centroid distance, test best few exactly
  let bestUV = null, bd = 1e9;
  const cands = bTris
    .map(t => ({ t, d: (t.c[0] - q[0]) ** 2 + (t.c[1] - q[1]) ** 2 + (t.c[2] - q[2]) ** 2 }))
    .sort((x, y) => x.d - y.d).slice(0, 10);
  for (const { t } of cands) {
    const [w0, w1, w2, d2] = closestOnTri(t.P, q);
    if (d2 < bd) {
      bd = d2;
      bestUV = [
        (t.U[0][0] * w0 + t.U[1][0] * w1 + t.U[2][0] * w2) * SIZE,
        (t.U[0][1] * w0 + t.U[1][1] * w1 + t.U[2][1] * w2) * SIZE,
      ];
    }
  }
  return bestUV;
}

// rasterize island-A eye triangles -> destination mask + exact source UV per texel
const srcU = new Float32Array(SIZE * SIZE);
const srcV = new Float32Array(SIZE * SIZE);
const mask = new Float32Array(SIZE * SIZE);
const triCount = idx.getCount() / 3;
const inEyeLoose = p => p[1] > 1.885 && p[1] < 2.015 && Math.abs(p[0]) < 0.085 && p[2] > 0.03 && Math.sign(p[0]) === aSign;
for (let t = 0; t < triCount; t++) {
  const I = [idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2)];
  const P = I.map(i => pos.getElement(i, []));
  if (!P.every(inEyeLoose)) continue;
  const U = I.map(i => uv.getElement(i, []));
  if (!U.every(q => inA({ u: q[0] * SIZE, v: q[1] * SIZE }))) continue;
  const xs = U.map(q => q[0] * SIZE), ys = U.map(q => q[1] * SIZE);
  const minX = Math.max(0, Math.floor(Math.min(...xs)) - 1), maxX = Math.min(SIZE - 1, Math.ceil(Math.max(...xs)) + 1);
  const minY = Math.max(0, Math.floor(Math.min(...ys)) - 1), maxY = Math.min(SIZE - 1, Math.ceil(Math.max(...ys)) + 1);
  const d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
  if (Math.abs(d) < 1e-9) continue;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let w0 = ((ys[1] - ys[2]) * (x - xs[2]) + (xs[2] - xs[1]) * (y - ys[2])) / d;
    let w1 = ((ys[2] - ys[0]) * (x - xs[2]) + (xs[0] - xs[2]) * (y - ys[2])) / d;
    let w2 = 1 - w0 - w1;
    if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05) continue;
    w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
    const s = w0 + w1 + w2; w0 /= s; w1 /= s; w2 /= s;
    const p3d = [0, 1, 2].map(k => P[0][k] * w0 + P[1][k] * w1 + P[2][k] * w2);
    const uvB = sampleBviaSymmetry(p3d);
    if (!uvB) continue;
    mask[y * SIZE + x] = 1;
    srcU[y * SIZE + x] = uvB[0];
    srcV[y * SIZE + x] = uvB[1];
  }
}
let maskCount = 0; for (let i = 0; i < mask.length; i++) maskCount += mask[i];
console.log('dest texels:', maskCount);

// feather: blur mask a bit (cheap box blur x3)
function blur(src) {
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * SIZE + x + dx];
    out[y * SIZE + x] = s / 9;
  }
  return out;
}
let fmask = mask; for (let k = 0; k < 3; k++) fmask = blur(fmask);
// keep core fully opaque
for (let i = 0; i < fmask.length; i++) if (mask[i] && fmask[i] > 0.95) fmask[i] = 1;

// sample: dest texel (x,y) <- B at inverse transform
const { data, info } = await sharp('/tmp/darwin2-tex-orig.png').raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const out = Buffer.from(data);
// invert similarity: p' = R p + t  =>  p = R^-1 (p' - t); with reflect, v was negated pre-transform
const det = T.rx[0] * T.ry[1] - T.rx[1] * T.ry[0];
function invMap(xp, yp) {
  const dx = xp - T.rx[2], dy = yp - T.ry[2];
  const u = (T.ry[1] * dx - T.rx[1] * dy) / det;
  const v = (-T.ry[0] * dx + T.rx[0] * dy) / det;
  return [u, v];
}
function sampleBilinear(u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const px = (x, y) => {
    x = Math.max(0, Math.min(SIZE - 1, x)); y = Math.max(0, Math.min(SIZE - 1, y));
    const o = (y * SIZE + x) * ch; return [data[o], data[o + 1], data[o + 2]];
  };
  const c00 = px(x0, y0), c10 = px(x0 + 1, y0), c01 = px(x0, y0 + 1), c11 = px(x0 + 1, y0 + 1);
  return [0, 1, 2].map(k =>
    c00[k] * (1 - fx) * (1 - fy) + c10[k] * fx * (1 - fy) + c01[k] * (1 - fx) * fy + c11[k] * fx * fy);
}
let written = 0;
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const w = Math.min(fmask[y * SIZE + x], 1);
  if (w <= 0.01) continue;
  let u, v;
  if (mask[y * SIZE + x]) {
    u = srcU[y * SIZE + x]; v = srcV[y * SIZE + x];
  } else {
    [u, v] = invMap(x + 0.5, y + 0.5);
  }
  const c = sampleBilinear(u - 0.5, v - 0.5);
  const o = (y * SIZE + x) * ch;
  for (let k = 0; k < 3; k++) out[o + k] = Math.round(data[o + k] * (1 - w) + c[k] * w);
  written++;
}
console.log('texels written:', written);
await sharp(out, { raw: { width: SIZE, height: SIZE, channels: ch } }).png().toFile('/tmp/darwin2-tex-fixed.png');

// preview crops: fixed eye A and source eye B at same zoom
await sharp('/tmp/darwin2-tex-fixed.png').extract({ left: 2710, top: 70, width: 240, height: 300 }).resize(480, null, { kernel: 'nearest' }).toFile('/tmp/fixedA.png');
console.log('done');
