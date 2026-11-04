// Build Darwin's fowling piece (public/assets/models/tools/shotgun.glb): an
// 1830s percussion side-by-side, modelled and textured procedurally in Node.
//
// Replaces the Blender primitive build (blender_build_shotgun.py) with turned
// and lofted geometry and generated PBR textures:
//   - damascus "twist" barrels (lathe-turned, with a real bore at the muzzle),
//     concave top rib, bead, bottom rib and ramrod pipes;
//   - a lofted walnut stock (slim wrist, straight comb, dropping butt) with
//     grain, an oil finish, and chequering on the wrist;
//   - colour case-hardened bar-action lock plates with scroll engraving,
//     dolphin-head hammers over the nipples, side nails;
//   - brass trigger guard, butt plate, wedge escutcheons and ramrod tip.
//
// Convention (unchanged, so the twoHand hold keeps working): glTF forward is
// -Z, up is +Y, and the grip sits at the origin where the right hand holds it.
//
//   node scripts/build-shotgun.mjs
import fs from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OUT = 'public/assets/models/tools/shotgun.glb';

// ---------------------------------------------------------------- dimensions
const BARREL_Y = 0.036;
const BARREL_X = 0.0165;
const BREECH_Z = -0.062;
const BARREL_LENGTH = 0.80;
const MUZZLE_Z = BREECH_Z - BARREL_LENGTH;
const BUTT_Z = 0.335;
const LOCK_Z = [BREECH_Z - 0.006, 0.042];
const LOCK_Y = [-0.012, 0.03];

// ------------------------------------------------------------------- noise
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix; const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy); const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1); const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// Noise that tiles with period (px, py) in lattice units.
function tileNoise(x, y, px, py) {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix; const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const m = (v, p) => ((v % p) + p) % p;
  const h = (i, j) => hash2(m(i, px), m(j, py));
  const a = h(ix, iy); const b = h(ix + 1, iy); const c = h(ix, iy + 1); const d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, octaves = 5) {
  let sum = 0; let amp = 0.5; let f = 1;
  for (let i = 0; i < octaves; i += 1) { sum += amp * valueNoise(x * f, y * f); amp *= 0.5; f *= 2.03; }
  return sum;
}
function tileFbm(x, y, px, py, octaves = 4) {
  let sum = 0; let amp = 0.5; let f = 1;
  for (let i = 0; i < octaves; i += 1) { sum += amp * tileNoise(x * f, y * f, px * f, py * f); amp *= 0.5; f *= 2; }
  return sum;
}
const clamp01 = v => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;
const mixColour = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- textures
// Each texture set: albedo (sRGB), metal/rough (G rough, B metal) and a normal
// map from a height field, all W x H with v (rows) down the image.
async function encodeSet(name, W, H, sample, { normalStrength = 1, wrapU = true, wrapV = true } = {}) {
  const albedo = Buffer.alloc(W * H * 3);
  const mr = Buffer.alloc(W * H * 3);
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const s = sample((x + 0.5) / W, (y + 0.5) / H);
      const o = (y * W + x) * 3;
      for (let k = 0; k < 3; k += 1) albedo[o + k] = Math.round(clamp01(s.colour[k]) * 255);
      mr[o] = 255;
      mr[o + 1] = Math.round(clamp01(s.roughness) * 255);
      mr[o + 2] = Math.round(clamp01(s.metalness) * 255);
      height[y * W + x] = s.height;
    }
  }
  const normal = Buffer.alloc(W * H * 3);
  const at = (x, y) => {
    x = wrapU ? (x + W) % W : Math.min(W - 1, Math.max(0, x));
    y = wrapV ? (y + H) % H : Math.min(H - 1, Math.max(0, y));
    return height[y * W + x];
  };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * normalStrength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * normalStrength;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const o = (y * W + x) * 3;
      normal[o] = Math.round((n.x * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
    }
  }
  const jpeg = (buf, q) => sharp(buf, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: q, chromaSubsampling: '4:4:4' }).toBuffer();
  const set = { albedo: await jpeg(albedo, 88), mr: await jpeg(mr, 85), normal: await jpeg(normal, 90) };
  if (process.env.SHOTGUN_DEBUG) {
    fs.mkdirSync('test-results/shotgun', { recursive: true });
    for (const [k, v] of Object.entries(set)) fs.writeFileSync(`test-results/shotgun/${name}-${k}.jpg`, v);
  }
  return set;
}

// Walnut: u runs around the stock, v along its length. Grain lines follow the
// length, warped; pores are dark elongated specks; the wrist (v band) carries
// diamond chequering on its sides.
const STOCK_V_LENGTH = 0.48; // metres of stock length mapped to v 0..1
const WRIST_V = [(0.022 + 0.07) / STOCK_V_LENGTH, (0.112 + 0.07) / STOCK_V_LENGTH];
function walnut(u, v) {
  const warp = fbm(u * 3, v * 2.2) * 2.4 + fbm(u * 9, v * 6) * 0.4;
  const g = u * 30 + warp * 5 + Math.sin(v * 9 + u * 5) * 0.6;
  const line = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(g * Math.PI)), 0.6);
  const figure = fbm(u * 5 + 7, v * 3.5 + 3);
  const pores = smooth(0.78, 0.92, valueNoise(u * 900, v * 90)) * 0.5;
  const base = [0.36, 0.2, 0.105];
  const dark = [0.16, 0.085, 0.045];
  const light = [0.5, 0.3, 0.16];
  let colour = mixColour(dark, base, line);
  colour = mixColour(colour, light, smooth(0.55, 0.85, figure) * 0.45);
  colour = mixColour(colour, dark, pores);
  // Chequering panels on both sides of the wrist (u near 0/1 and 0.5).
  const side = Math.min(Math.abs(u - 0.5), Math.min(u, 1 - u));
  const panelU = smooth(0.15, 0.11, side);
  const panelV = smooth(WRIST_V[0], WRIST_V[0] + 0.012, v) * smooth(WRIST_V[1], WRIST_V[1] - 0.012, v);
  const panel = panelU * panelV;
  const du = u * 64; const dv = v * 150;
  const a = Math.abs(((du + dv) % 1 + 1) % 1 - 0.5);
  const b = Math.abs(((du - dv) % 1 + 1) % 1 - 0.5);
  const diamond = Math.min(a, b) * 2; // 0 at the cut lines, 1 at diamond peaks
  colour = mixColour(colour, mixColour(dark, base, 0.6 + 0.4 * diamond), panel * 0.85);
  const grainHeight = (1 - line) * -0.4 - pores * 0.8;
  const height = grainHeight * (1 - panel) + panel * (diamond * 3.2);
  // Oil finish: soft sheen, worn slightly drier on the figure; chequering matte.
  const roughness = mix(0.36 + figure * 0.12 + pores * 0.3, 0.72, panel);
  return { colour, roughness, metalness: 0, height };
}

// Damascus twist: browned steel in welded bands spiralling around the barrel.
// Tiles in u (around) and v (one repeat per 0.2 m of barrel).
function damascus(u, v) {
  const warp = tileFbm(u * 8, v * 8, 8, 8) * 1.6;
  const spiral = Math.sin((u * 6 + v * 7 + warp) * Math.PI * 2);
  const fine = Math.sin((u * 18 - v * 5 + warp * 2.5) * Math.PI * 2);
  const band = smooth(-0.2, 0.6, spiral * 0.7 + fine * 0.3);
  const rust = tileFbm(u * 24 + 3, v * 24, 24, 24);
  const dark = [0.08, 0.055, 0.04];
  const light = [0.34, 0.22, 0.13];
  let colour = mixColour(dark, light, band * 0.75);
  colour = mixColour(colour, [0.42, 0.3, 0.2], smooth(0.62, 0.8, rust) * 0.3);
  return { colour, roughness: mix(0.42, 0.3, band), metalness: 0.75, height: band * 0.25 };
}

// Case-hardened lock plate: mottled straw, blue and purple over grey steel,
// with scroll engraving and a border line. u along the plate, v down it.
const scrollMask = (() => {
  const W = 768; const H = 256;
  const mask = new Float32Array(W * H);
  const stamp = (x, y, r) => {
    for (let j = Math.floor(y - r - 1); j <= Math.ceil(y + r + 1); j += 1) {
      for (let i = Math.floor(x - r - 1); i <= Math.ceil(x + r + 1); i += 1) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const d = Math.hypot(i - x, j - y);
        mask[j * W + i] = Math.max(mask[j * W + i], clamp01(r + 0.5 - d));
      }
    }
  };
  // Logarithmic scrolls with leafy offshoots.
  const scrolls = [
    [0.2, 0.5, 0.18, 1], [0.42, 0.42, 0.15, -1], [0.62, 0.55, 0.16, 1], [0.82, 0.45, 0.12, -1],
    [0.31, 0.72, 0.08, -1], [0.53, 0.25, 0.08, 1], [0.73, 0.75, 0.07, 1],
  ];
  for (const [cx, cy, size, dir] of scrolls) {
    for (let t = 0; t < 1; t += 0.0015) {
      const angle = dir * t * Math.PI * 4.2;
      const r = size * Math.exp(-2.2 * t);
      stamp((cx + Math.cos(angle) * r * 0.55) * W, (cy + Math.sin(angle) * r) * H, 1.1 * (1 - t * 0.6));
      if (Math.abs((t * 13) % 1 - 0.5) < 0.004) {
        for (let s = 0; s < 1; s += 0.03) {
          const la = angle + dir * 1.2 * s;
          stamp((cx + Math.cos(angle) * r * 0.55 + Math.cos(la) * s * 0.06) * W, (cy + Math.sin(angle) * r + Math.sin(la) * s * 0.12) * H, 0.8);
        }
      }
    }
  }
  return { W, H, mask };
})();
function caseHardened(u, v) {
  const m = fbm(u * 7, v * 4.5, 5);
  const m2 = fbm(u * 15 + 9, v * 9 + 4, 4);
  const steel = [0.42, 0.42, 0.44];
  const straw = [0.62, 0.48, 0.24];
  const blue = [0.12, 0.2, 0.42];
  const purple = [0.32, 0.17, 0.36];
  let colour = steel;
  colour = mixColour(colour, straw, smooth(0.45, 0.7, m) * 0.8);
  colour = mixColour(colour, blue, smooth(0.5, 0.75, m2) * 0.9);
  colour = mixColour(colour, purple, smooth(0.62, 0.8, m) * smooth(0.4, 0.6, m2) * 0.8);
  const x = Math.min(scrollMask.W - 1, Math.floor(u * scrollMask.W));
  const y = Math.min(scrollMask.H - 1, Math.floor(v * scrollMask.H));
  let cut = scrollMask.mask[y * scrollMask.W + x];
  // Border line just inside the plate outline.
  const edge = Math.min(u, 1 - u, v * 0.35, (1 - v) * 0.35);
  cut = Math.max(cut, smooth(0.016, 0.01, Math.abs(edge - 0.03)));
  colour = mixColour(colour, [0.12, 0.11, 0.1], cut * 0.85);
  return { colour, roughness: mix(0.36 + m2 * 0.1, 0.62, cut), metalness: 1, height: -cut * 1.6 };
}

// ---------------------------------------------------------------- geometry
const parts = { walnut: [], damascus: [], lock: [], brass: [], steel: [], bore: [] };
function add(material, geometry) {
  const g = geometry.index ? geometry : mergeVertices(geometry);
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  parts[material].push(g);
  return g;
}

// A solid of revolution along -Z from a profile of [radius, distance forward].
function turned(profile, { x = 0, y = 0, z = 0, segments = 28, uvLength = null } = {}) {
  const points = profile.map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(points, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  if (uvLength) {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      const angle = Math.atan2(pos.getY(i) - y, pos.getX(i) - x);
      uv.setXY(i, angle / (Math.PI * 2) + 0.5, (z - pos.getZ(i)) / uvLength);
    }
  }
  return g;
}

// Barrels: outer tube, muzzle face and visible bore, all turned.
for (const side of [-1, 1]) {
  const x = side * BARREL_X;
  const L = BARREL_LENGTH;
  add('damascus', turned([
    [0.0158, 0], [0.0158, 0.035], [0.0149, 0.05], [0.0141, 0.2], [0.0131, 0.45],
    [0.0122, L - 0.06], [0.0119, L - 0.02], [0.0122, L - 0.006], [0.0122, L],
  ], { x, y: BARREL_Y, z: BREECH_Z, segments: 32, uvLength: 0.2 }));
  const face = new THREE.RingGeometry(0.0093, 0.0122, 32, 1);
  face.rotateY(Math.PI);
  face.translate(x, BARREL_Y, MUZZLE_Z);
  add('steel', face);
  add('bore', turned([[0.0093, L], [0.0093, L - 0.12]], { x, y: BARREL_Y, z: BREECH_Z, segments: 24 }));
}

// Extruded profile in the (z, y) plane, given as [z, y] points, extruded
// across x from x0 by depth, with bevelled edges.
function profile(points, x0, depth, bevel = 0.0012, curveSegments = 10) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0002, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
  return placeAcross(g, x0);
}
// Shape x -> world z, shape y -> world y, extrusion -> world x (a rotation,
// so winding and normals stay correct), then shifted to start at x0.
function placeAcross(g, x0) {
  g.rotateY(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(x0 - g.boundingBox.min.x, 0, 0);
  return g;
}
function shapeProfile(shape, x0, depth, bevel = 0.001, curveSegments = 14) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0002, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
  return placeAcross(g, x0);
}
function planarUV(g, z0, z1, y0, y1) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, (pos.getZ(i) - z0) / (z1 - z0), (y1 - pos.getY(i)) / (y1 - y0));
  }
  return g;
}

// Top rib (concave, tapering) and bottom rib between the barrels.
{
  const rib = new THREE.BoxGeometry(0.011, 0.005, BARREL_LENGTH - 0.01, 1, 1, 8);
  const pos = rib.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = (pos.getZ(i) + (BARREL_LENGTH - 0.01) / 2) / (BARREL_LENGTH - 0.01); // 0 muzzle .. 1 breech
    pos.setX(i, pos.getX(i) * mix(0.8, 1.15, t));
    pos.setY(i, pos.getY(i) - (pos.getY(i) > 0 ? 0.0015 * (1 - Math.abs(pos.getX(i)) / 0.007) : 0) + mix(-0.0024, 0, t));
  }
  rib.computeVertexNormals();
  rib.translate(0, BARREL_Y + 0.0132, BREECH_Z - BARREL_LENGTH / 2);
  add('steel', rib);
  const under = new THREE.BoxGeometry(0.006, 0.006, BARREL_LENGTH - 0.03);
  under.translate(0, BARREL_Y - 0.0125, BREECH_Z - BARREL_LENGTH / 2 - 0.01);
  add('steel', under);
  const bead = new THREE.SphereGeometry(0.0024, 12, 8);
  bead.translate(0, BARREL_Y + 0.0168, MUZZLE_Z + 0.012);
  add('brass', bead);
}

// Breech (false breech / standing breech) and the top tang along the wrist.
add('lock', planarUV(profile([
  [BREECH_Z + 0.002, BARREL_Y + 0.016], [BREECH_Z + 0.012, BARREL_Y + 0.016], [BREECH_Z + 0.03, BARREL_Y + 0.003],
  [BREECH_Z + 0.03, BARREL_Y - 0.019], [BREECH_Z + 0.002, BARREL_Y - 0.019],
], -0.03, 0.06, 0.004), LOCK_Z[0], LOCK_Z[1] + 0.006, LOCK_Y[0], LOCK_Y[1]));
add('steel', profile([
  [BREECH_Z + 0.026, 0.035], [0.055, 0.0205], [0.06, 0.0185], [0.055, 0.0172], [BREECH_Z + 0.026, 0.03],
], -0.006, 0.012, 0.0012));
// Breech bolsters with nipples, one per barrel, on the outside top.
for (const side of [-1, 1]) {
  const bolster = new THREE.BoxGeometry(0.009, 0.012, 0.016);
  bolster.translate(side * 0.0275, BARREL_Y + 0.004, BREECH_Z + 0.008);
  add('steel', bolster);
  const nipple = turned([[0.0034, 0], [0.0034, 0.004], [0.0022, 0.009], [0.0016, 0.011], [0, 0.011]], { segments: 12 });
  nipple.rotateX(Math.PI / 2); // point up (+Y)
  nipple.rotateZ(-side * 0.35);
  nipple.translate(side * 0.028, BARREL_Y + 0.009, BREECH_Z + 0.008);
  add('steel', nipple);
}

// Lock plates (bar action), hammers, side nails.
for (const side of [-1, 1]) {
  const plate = new THREE.Shape();
  plate.moveTo(LOCK_Z[0], 0.013);
  plate.quadraticCurveTo(LOCK_Z[0] + 0.03, 0.03, 0.0, 0.019);
  plate.quadraticCurveTo(0.03, 0.012, LOCK_Z[1], 0.006);
  plate.quadraticCurveTo(LOCK_Z[1] + 0.006, -0.002, LOCK_Z[1] - 0.006, -0.008);
  plate.quadraticCurveTo(0.012, -0.008, -0.03, -0.006);
  plate.quadraticCurveTo(LOCK_Z[0] + 0.01, -0.004, LOCK_Z[0], 0.013);
  const x0 = side > 0 ? 0.0228 : -0.0228 - 0.0032;
  add('lock', planarUV(shapeProfile(plate, x0, 0.0032, 0.0008), LOCK_Z[0], LOCK_Z[1] + 0.006, LOCK_Y[0], LOCK_Y[1]));

  // Dolphin-head hammer at half-cock: pivots on the tumbler behind the
  // nipple, rises into a short spur, and arches forward to a cupped nose
  // just clear of the cap.
  const hammer = new THREE.Shape();
  const pz = -0.026; const py = 0.014;
  const nz = BREECH_Z + 0.008; const ny = BARREL_Y + 0.0215;
  hammer.moveTo(pz + 0.006, py - 0.006);
  hammer.quadraticCurveTo(pz + 0.011, py + 0.008, pz + 0.012, py + 0.024);
  hammer.quadraticCurveTo(pz + 0.016, py + 0.033, pz + 0.019, py + 0.037); // spur
  hammer.quadraticCurveTo(pz + 0.012, py + 0.041, pz + 0.006, py + 0.036);
  hammer.quadraticCurveTo(pz - 0.006, py + 0.044, nz + 0.007, ny + 0.007); // neck to nose
  hammer.lineTo(nz - 0.004, ny + 0.006);
  hammer.lineTo(nz - 0.005, ny);
  hammer.lineTo(nz + 0.006, ny - 0.001); // cup
  hammer.quadraticCurveTo(pz - 0.004, py + 0.03, pz - 0.006, py + 0.008); // neck underside
  hammer.quadraticCurveTo(pz - 0.004, py - 0.004, pz + 0.006, py - 0.006);
  const hx0 = side > 0 ? 0.0262 : -0.0262 - 0.0052;
  add('lock', planarUV(shapeProfile(hammer, hx0, 0.0052, 0.0009), LOCK_Z[0], LOCK_Z[1] + 0.006, LOCK_Y[0], LOCK_Y[1]));
  // Hammer pivot screw and two side nails through the plate.
  for (const [z, y, r] of [[pz, py, 0.0042], [-0.022, 0.004, 0.0026], [0.03, 0.0035, 0.0026]]) {
    const head = turned([[0, 0.0018], [r, 0.0012], [r, 0], [0, 0]], { segments: 14 });
    head.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    head.translate(side * (z === pz ? 0.0322 : 0.0262), y, z);
    add(z === pz ? 'steel' : 'brass', head);
  }
}

// Stock: lofted rings from the head of the stock (behind the breech) to the
// butt. Each station: z, centre y, half width, half height, squareness.
function loft(stations, { segments = 40, vOffset = 0, capEnd = false, capStart = false } = {}) {
  const positions = []; const uvs = []; const indices = [];
  let vLen = vOffset;
  stations.forEach((s, i) => {
    if (i) vLen += Math.abs(s.z - stations[i - 1].z);
    for (let j = 0; j <= segments; j += 1) {
      const th = (j / segments) * Math.PI * 2;
      const c = Math.cos(th); const sn = Math.sin(th);
      const e = 2 / (s.e || 2.4);
      const yn = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const narrow = 1 - (s.toe || 0) * Math.max(0, -yn); // slimmer toward the toe
      positions.push(s.x0 || 0) ;
      positions[positions.length - 1] += Math.sign(c) * Math.pow(Math.abs(c), e) * s.w * narrow;
      positions.push(s.y + yn * s.h, s.z);
      uvs.push(j / segments, vLen / STOCK_V_LENGTH);
    }
  });
  const ring = segments + 1;
  for (let i = 0; i < stations.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * ring + j; const b = a + 1; const c = a + ring; const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Orientation check: normals must point away from the loft axis.
  const p = g.attributes.position; const n = g.attributes.normal;
  const s0 = stations[1];
  const outward = (p.getX(ring + 0) - (s0.x0 || 0)) * n.getX(ring + 0);
  if (outward < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
    g.setIndex(indices);
    g.computeVertexNormals();
  }
  const caps = [];
  const cap = (i, facing) => {
    const s = stations[i];
    const shape = [];
    for (let j = 0; j < segments; j += 1) shape.push(new THREE.Vector3(p.getX(i * ring + j), p.getY(i * ring + j), s.z));
    const centre = new THREE.Vector3((s.x0 || 0), s.y, s.z);
    const pos = [centre.x, centre.y, centre.z];
    shape.forEach(v => pos.push(v.x, v.y, v.z));
    const idx = [];
    for (let j = 0; j < segments; j += 1) idx.push(0, 1 + j, 1 + ((j + 1) % segments));
    const e1 = shape[0].clone().sub(centre); const e2 = shape[1].clone().sub(centre);
    if (Math.sign(e1.cross(e2).z) !== facing) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * 2), 2));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    caps.push(cg);
  };
  const dir = Math.sign(stations[stations.length - 1].z - stations[0].z);
  if (capStart) cap(0, -dir);
  if (capEnd) cap(stations.length - 1, dir);
  return { body: g, caps };
}

const stock = loft([
  { z: BREECH_Z + 0.004, y: 0.01, w: 0.0222, h: 0.016, e: 3.2 },
  { z: BREECH_Z + 0.03, y: 0.012, w: 0.0228, h: 0.023, e: 3.2 },
  { z: -0.015, y: 0.009, w: 0.0232, h: 0.026, e: 3.0 },
  { z: 0.02, y: 0.003, w: 0.02, h: 0.024, e: 2.6 },
  { z: 0.05, y: -0.002, w: 0.0168, h: 0.0215, e: 2.3 },
  { z: 0.08, y: -0.006, w: 0.0172, h: 0.023, e: 2.3 },
  { z: 0.12, y: -0.018, w: 0.0198, h: 0.034, e: 2.4, toe: 0.12 },
  { z: 0.18, y: -0.033, w: 0.0218, h: 0.047, e: 2.5, toe: 0.2 },
  { z: 0.25, y: -0.045, w: 0.0228, h: 0.056, e: 2.6, toe: 0.24 },
  { z: BUTT_Z - 0.004, y: -0.051, w: 0.0226, h: 0.061, e: 2.7, toe: 0.26 },
], { capStart: true });
add('walnut', stock.body);
stock.caps.forEach(c => add('walnut', c));
// Brass butt plate: a thin shell matching the butt's last section, with a
// heel tang running up over the comb.
{
  const plate = loft([
    { z: BUTT_Z - 0.004, y: -0.051, w: 0.0231, h: 0.0615, e: 2.7, toe: 0.26 },
    { z: BUTT_Z + 0.002, y: -0.051, w: 0.0229, h: 0.0612, e: 2.7, toe: 0.26 },
  ], { capEnd: true });
  add('brass', plate.body);
  plate.caps.forEach(c => add('brass', c));
  add('brass', profile([[BUTT_Z - 0.04, 0.0117], [BUTT_Z + 0.002, 0.0112], [BUTT_Z + 0.002, 0.0085], [BUTT_Z - 0.04, 0.0098]], -0.0055, 0.011, 0.001));
}

// Fore-end under the barrels, with a rounded tip; wedge escutcheons.
const FORE_END = [BREECH_Z - 0.002, BREECH_Z - 0.36];
const foreEnd = loft([
  { z: FORE_END[0], y: BARREL_Y - 0.017, w: 0.021, h: 0.0115, e: 2.4 },
  { z: BREECH_Z - 0.12, y: BARREL_Y - 0.0168, w: 0.0205, h: 0.0112, e: 2.4 },
  { z: BREECH_Z - 0.3, y: BARREL_Y - 0.0165, w: 0.0195, h: 0.0105, e: 2.4 },
  { z: FORE_END[1] + 0.012, y: BARREL_Y - 0.0165, w: 0.0185, h: 0.0098, e: 2.3 },
  { z: FORE_END[1], y: BARREL_Y - 0.0158, w: 0.0135, h: 0.007, e: 2.1 },
], { vOffset: 0.0, capEnd: true, capStart: true });
add('walnut', foreEnd.body);
foreEnd.caps.forEach(c => add('walnut', c));
const tip = turned([[0.0105, 0], [0.0105, 0.012], [0.008, 0.016], [0, 0.017]], { segments: 20 });
tip.scale(1.25, 0.72, 1);
tip.translate(0, BARREL_Y - 0.0158, FORE_END[1] + 0.002);
add('walnut', tip);
for (const side of [-1, 1]) {
  const esc = turned([[0, 0.0012], [0.0052, 0.0008], [0.0052, 0], [0, 0]], { segments: 18 });
  esc.scale(1, 0.7, 1.6);
  esc.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  esc.translate(side * 0.0205, BARREL_Y - 0.017, BREECH_Z - 0.2);
  add('brass', esc);
}

// Trigger guard (brass bow with long tangs) and two steel triggers.
{
  const bow = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.012, -0.046), new THREE.Vector3(0, -0.026, -0.044),
    new THREE.Vector3(0, -0.04, -0.03), new THREE.Vector3(0, -0.043, -0.012),
    new THREE.Vector3(0, -0.035, 0.004), new THREE.Vector3(0, -0.024, 0.014),
  ]);
  const tube = new THREE.TubeGeometry(bow, 40, 0.0032, 10, false);
  tube.scale(1.6, 1, 1);
  add('brass', tube);
  const tangs = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.0072, -0.056), new THREE.Vector3(0, -0.012, -0.035),
    new THREE.Vector3(0, -0.0185, -0.01), new THREE.Vector3(0, -0.0228, 0.02),
    new THREE.Vector3(0, -0.0302, 0.07), new THREE.Vector3(0, -0.0418, 0.1),
  ]);
  const tang = new THREE.TubeGeometry(tangs, 48, 0.0034, 10, false);
  tang.scale(2.1, 0.55, 1);
  add('brass', tang);
  for (const [z, len] of [[-0.036, 0.021], [-0.02, 0.019]]) {
    const trig = new THREE.Shape();
    trig.moveTo(z, -0.02);
    trig.quadraticCurveTo(z - 0.006, -0.02 - len * 0.6, z + 0.003, -0.02 - len);
    trig.lineTo(z + 0.006, -0.02 - len + 0.001);
    trig.quadraticCurveTo(z - 0.002, -0.02 - len * 0.6, z + 0.004, -0.02);
    add('steel', profile(trig.getPoints(10).map(p => [p.x, p.y]), -0.0016, 0.0032, 0.0006));
  }
}

// Ramrod with a brass tip, seated in three brass pipes under the barrels.
{
  const rodY = BARREL_Y - 0.026;
  const rodLength = (BREECH_Z - 0.06) - (MUZZLE_Z + 0.035);
  add('walnut', turned([[0.0042, 0], [0.0042, rodLength], [0, rodLength]], { y: rodY, z: BREECH_Z - 0.06, segments: 12 }));
  const tipCap = turned([[0.0049, 0], [0.0049, 0.024], [0.0042, 0.028], [0, 0.028]], { segments: 14 });
  tipCap.translate(0, rodY, MUZZLE_Z + 0.035);
  add('brass', tipCap);
  for (const z of [BREECH_Z - 0.4, BREECH_Z - 0.58, BREECH_Z - 0.72]) {
    const pipe = turned([[0.0058, 0], [0.0066, 0.004], [0.0066, 0.016], [0.0058, 0.02], [0.0046, 0.02], [0.0046, 0]], { segments: 16 });
    pipe.translate(0, rodY, z);
    add('brass', pipe);
  }
}

// ------------------------------------------------------------------- GLB
const textures = {
  walnut: await encodeSet('walnut', 1024, 1024, walnut, { normalStrength: 2.2 }),
  damascus: await encodeSet('damascus', 512, 512, damascus, { normalStrength: 1.5 }),
  lock: await encodeSet('lock', 768, 256, caseHardened, { normalStrength: 2.5, wrapU: false, wrapV: false }),
};
const materialDefs = {
  walnut: { name: 'gunWalnut', set: 'walnut' },
  damascus: { name: 'gunBarrel', set: 'damascus' },
  lock: { name: 'gunLock', set: 'lock' },
  brass: { name: 'gunBrass', color: [0.72, 0.52, 0.25, 1], metallic: 1, roughness: 0.3 },
  steel: { name: 'gunSteel', color: [0.13, 0.135, 0.15, 1], metallic: 1, roughness: 0.34 },
  bore: { name: 'gunBore', color: [0.02, 0.02, 0.02, 1], metallic: 0.6, roughness: 0.7 },
};

const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
function pushView(buffer, target) {
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length, ...(target ? { target } : {}) });
  chunks.push(buffer);
  byteLength += buffer.length;
  return bufferViews.length - 1;
}
function accessor(array, type, componentType, target, minmax = false) {
  const view = pushView(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target);
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
  const acc = { bufferView: view, componentType, count: array.length / size, type };
  if (minmax) {
    acc.min = [Infinity, Infinity, Infinity]; acc.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i += 3) for (let k = 0; k < 3; k += 1) {
      acc.min[k] = Math.min(acc.min[k], array[i + k]); acc.max[k] = Math.max(acc.max[k], array[i + k]);
    }
  }
  accessors.push(acc);
  return accessors.length - 1;
}

const images = []; const gltfTextures = []; const materials = []; const meshes = []; const nodes = [];
const textureIndex = {};
for (const [setName, set] of Object.entries(textures)) {
  textureIndex[setName] = {};
  for (const kind of ['albedo', 'mr', 'normal']) {
    images.push({ bufferView: pushView(set[kind]), mimeType: 'image/jpeg' });
    gltfTextures.push({ source: images.length - 1, sampler: setName === 'lock' ? 1 : 0 });
    textureIndex[setName][kind] = gltfTextures.length - 1;
  }
}
let triangles = 0;
for (const [key, def] of Object.entries(materialDefs)) {
  if (!parts[key].length) continue;
  const merged = mergeGeometries(parts[key], false);
  const position = merged.attributes.position.array;
  const normal = merged.attributes.normal.array;
  const uv = merged.attributes.uv.array;
  const index = Uint32Array.from(merged.index.array);
  triangles += index.length / 3;
  const material = { name: def.name, pbrMetallicRoughness: {} };
  if (def.set) {
    const t = textureIndex[def.set];
    material.pbrMetallicRoughness = { baseColorTexture: { index: t.albedo }, metallicRoughnessTexture: { index: t.mr }, metallicFactor: 1, roughnessFactor: 1 };
    material.normalTexture = { index: t.normal, scale: 1 };
  } else {
    material.pbrMetallicRoughness = { baseColorFactor: def.color, metallicFactor: def.metallic, roughnessFactor: def.roughness };
  }
  materials.push(material);
  meshes.push({
    name: def.name,
    primitives: [{
      attributes: {
        POSITION: accessor(Float32Array.from(position), 'VEC3', 5126, 34962, true),
        NORMAL: accessor(Float32Array.from(normal), 'VEC3', 5126, 34962),
        TEXCOORD_0: accessor(Float32Array.from(uv), 'VEC2', 5126, 34962),
      },
      indices: accessor(index, 'SCALAR', 5125, 34963),
      material: materials.length - 1,
    }],
  });
  nodes.push({ name: def.name, mesh: meshes.length - 1 });
}
nodes.push({ name: 'shotgun', children: nodes.map((n, i) => i) });
const gltf = {
  asset: { version: '2.0', generator: 'scripts/build-shotgun.mjs' },
  scene: 0,
  scenes: [{ nodes: [nodes.length - 1] }],
  nodes, meshes, materials,
  textures: gltfTextures, images,
  samplers: [
    { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
    { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 },
  ],
  accessors, bufferViews,
  buffers: [{ byteLength }],
};
const bin = Buffer.concat(chunks);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binPadded.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([header, jsonHeader, json, binHeader, binPadded]));
console.log(`wrote ${OUT}: ${triangles} triangles, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
