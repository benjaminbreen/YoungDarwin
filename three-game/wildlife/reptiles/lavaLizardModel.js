// Procedural Floreana lava lizard (Microlophus grayii): geometry, painted
// skin, materials, and the jointed rig consumed by reptileGaitRuntime. Built
// entirely from lofts and merged primitives — no GLB, no skinning — aiming at
// the detail level of the retired photo-textured GLB rather than a toy:
// angular lofted skull with a painted head map, pale gold dorsolateral
// stripes over dark saddle blotches, scale-grain bump relief, dark lidded
// eyes with a narrow amber iris ring, and tapered limbs in an alert stance.
// Dimorphic variants: dark males with sooty throats, browner females with
// the brick-red throat and cheeks and stronger cream striping.
//
// Authoring frame matches the specimen-shape convention used by the GLBs
// after their manifest flip: head at -z, ground at y=0, ~0.45m total.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Palette / tuning knobs -------------------------------------------------
export const LAVA_LIZARD_VARIANTS = {
  male: {
    flank: '#57503f',
    flankWash: '#6e5638', // rusty shoulder wash
    dorsal: '#37322a',
    belly: '#c3b493',
    stripe: '#c8b476', // dorsolateral stripe (olive-gold)
    saddle: '#211d17',
    fleck: '#d3c49f',
    skin: '#4e473c',
    snout: '#403a30',
    brow: '#6e6350',
    throat: '#241f1b', // sooty black throat
    cheek: '#514a3e',
    leg: '#4a4337',
    lip: '#b7a582',
  },
  female: {
    flank: '#75644b',
    flankWash: '#8a6c4c',
    dorsal: '#4a3f30',
    belly: '#d8c9a8',
    stripe: '#e8d9a9', // strong cream stripes
    saddle: '#2a231a',
    fleck: '#efe1bd',
    skin: '#7c5540', // rusty head wash — the female's red face
    snout: '#69452f',
    brow: '#9a6e4e',
    throat: '#b8452f', // the brick-red throat
    cheek: '#bb4f2e',
    leg: '#60513f',
    lip: '#d3bf95',
  },
};
export const EYE_IRIS = '#a06b22';
export const EYE_PUPIL = '#131009';
export const TONGUE_COLOR = '#7c2532';
export const SKIN_ROUGHNESS = 0.78;
export const BUMP_SCALE = 0.45;

// Root/torso rest height above ground — alert stance, daylight under the
// belly. The gait config below re-exports it so animator and rig agree.
export const LIZARD_ROOT_HEIGHT = 0.056;

// Gait character for this species — small and wiry but unhurried between
// darts: longer, slower strides, deliberate blinks, calm eye darts, and a
// draped tail that drifts rather than twitches.
export const LAVA_LIZARD_GAIT = {
  rootHeight: LIZARD_ROOT_HEIGHT,
  strideLength: 0.165,
  maxStrideHz: 4.4,
  sprintSpeed: 1.25,
  hipSwingAmp: 0.36,
  kneeLiftAmp: 0.26,
  undulationAmp: 0.11,
  tailSwingAmp: 0.2,
  bobAmp: 0.003,
  blinkMin: 4,
  blinkMax: 11,
  blinkDuration: 0.26,
  doubleBlinkChance: 0.18,
  saccadeMin: 1.4,
  saccadeMax: 4.6,
  saccadeAmp: 0.11,
  saccadeDamp: 10,
  scanRate: 0.3,
  tongueDuration: 0.3,
  pushup: { rate: 2.1 },
  tailIdleAmp: 0.085,
  tailIdleRate: 0.45,
  // Rest droop per segment (radians): the tail arcs down off the raised
  // hips toward the ground, tip easing back up — no more straight spike.
  tailRestPitch: [0.16, 0.12, -0.05],
  tailRestCurl: 0.07,
};

function seededUnit(seed, salt = 0) {
  let hash = 2166136261;
  const text = `${seed}:${salt}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const value = Math.sin(hash * 0.0001739) * 43758.5453;
  return value - Math.floor(value);
}

export function pickLavaLizardVariant(actorId) {
  return seededUnit(actorId, 11) < 0.55 ? 'male' : 'female';
}

// Adult size spread. The base rig is the smallest animal in the population;
// males run noticeably larger (up to +50%), females stay slighter — the
// species' real dimorphism. Smoothstep biases toward mid-sized adults.
export function pickLavaLizardSize(actorId, variantKey = pickLavaLizardVariant(actorId)) {
  const u = seededUnit(actorId, 29);
  const eased = u * u * (3 - 2 * u);
  return variantKey === 'male' ? 1.14 + eased * 0.36 : 1 + eased * 0.24;
}

function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

// --- Loft helper --------------------------------------------------------------
// Rings along +z. Cross-section angle 0 at the belly so the UV seam hides
// underneath; u: 0 belly → 0.5 dorsal → 1 belly, v runs front→back.
// `superN` > 2 squares the section off (lizard skulls are angular).

function lerpStations(stations, t) {
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    if (t <= b.t) {
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return {
        z: a.z + (b.z - a.z) * f,
        hw: a.hw + (b.hw - a.hw) * f,
        yc: (a.yc ?? 0) + ((b.yc ?? 0) - (a.yc ?? 0)) * f,
      };
    }
  }
  return stations[stations.length - 1];
}

function loftZ({
  stations,
  rings = 20,
  radial = 14,
  vRange = [0, 1],
  bellyFlat = 0.42,
  heightRatio = 0.9,
  superN = 2,
}) {
  const cols = radial + 1;
  const positions = new Float32Array(rings * cols * 3);
  const uvs = new Float32Array(rings * cols * 2);
  const indices = [];
  for (let r = 0; r < rings; r += 1) {
    const t = r / (rings - 1);
    const s = lerpStations(stations, t);
    const hh = s.hw * heightRatio;
    for (let c = 0; c < cols; c += 1) {
      const a = (c / radial) * Math.PI * 2;
      const sa = Math.sin(a);
      const ca = -Math.cos(a);
      const f = superN === 2
        ? 1
        : Math.pow(Math.pow(Math.abs(sa), superN) + Math.pow(Math.abs(ca), superN), -1 / superN)
          * Math.hypot(sa, ca);
      const x = sa * s.hw * f;
      let y = ca * hh * f;
      if (y < 0) y *= 1 - bellyFlat;
      const i = (r * cols + c) * 3;
      positions[i] = x;
      positions[i + 1] = y + (s.yc ?? 0);
      positions[i + 2] = s.z;
      uvs[(r * cols + c) * 2] = c / radial;
      uvs[(r * cols + c) * 2 + 1] = vRange[0] + (vRange[1] - vRange[0]) * t;
    }
  }
  for (let r = 0; r < rings - 1; r += 1) {
    for (let c = 0; c < radial; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // Winding chosen so front faces point OUTWARD (at the belly ring the
      // +radial edge crossed with the +z edge must give -y).
      indices.push(a, b, d, b, e, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Trunk & tail ---------------------------------------------------------------
// Alert posture baked in: the chest rides higher than the pelvis.

const TRUNK_STATIONS = [
  { t: 0, z: -0.104, hw: 0.009, yc: 0.01 },
  { t: 0.08, z: -0.096, hw: 0.016, yc: 0.01 },
  { t: 0.2, z: -0.074, hw: 0.0255, yc: 0.009 },
  { t: 0.36, z: -0.043, hw: 0.024, yc: 0.006 },
  { t: 0.56, z: 0.006, hw: 0.0305, yc: 0.003 },
  { t: 0.73, z: 0.044, hw: 0.027, yc: 0.002 },
  { t: 0.89, z: 0.076, hw: 0.0175, yc: 0.002 },
  { t: 1, z: 0.096, hw: 0.008, yc: 0.002 },
];

let trunkGeometryCache = null;
export function getTrunkGeometry() {
  if (!trunkGeometryCache) {
    trunkGeometryCache = loftZ({
      stations: TRUNK_STATIONS,
      rings: 24,
      radial: 16,
      vRange: [0, 0.6],
      bellyFlat: 0.4,
      heightRatio: 0.92,
    });
  }
  return trunkGeometryCache;
}

const TAIL_SPECS = [
  { length: 0.075, hw0: 0.0135, hw1: 0.0095, v: [0.6, 0.76] },
  { length: 0.066, hw0: 0.0095, hw1: 0.0058, v: [0.76, 0.9] },
  { length: 0.058, hw0: 0.0058, hw1: 0.0012, v: [0.9, 1] },
];

const tailGeometryCache = new Map();
export function getTailSegmentGeometry(index) {
  if (!tailGeometryCache.has(index)) {
    const spec = TAIL_SPECS[index];
    tailGeometryCache.set(index, loftZ({
      stations: [
        { t: 0, z: 0, hw: spec.hw0, yc: 0 },
        { t: 1, z: spec.length, hw: spec.hw1, yc: 0 },
      ],
      rings: 5,
      radial: 12,
      vRange: spec.v,
      bellyFlat: 0.18,
      heightRatio: 0.96,
    }));
  }
  return tailGeometryCache.get(index);
}

export function tailSegmentLength(index) {
  return TAIL_SPECS[index].length;
}

function trunkTopAt(t) {
  const s = lerpStations(TRUNK_STATIONS, t);
  return { z: s.z, y: (s.yc ?? 0) + s.hw * 0.92 };
}

// Low vertebral crest — a dense run of small enlarged scales, not croc
// armor. Silhouette seasoning only.
let crestGeometryCache = null;
export function getCrestGeometry() {
  if (crestGeometryCache) return crestGeometryCache;
  const positions = [];
  const spikes = 26;
  for (let i = 0; i < spikes; i += 1) {
    const t = 0.06 + (i / (spikes - 1)) * 0.88;
    const top = trunkTopAt(t);
    const half = 0.0021;
    const height = 0.0012 + Math.sin(t * Math.PI) * 0.0019 + seededUnit('crest', i) * 0.0006;
    positions.push(
      0, top.y - 0.0012, top.z - half,
      0, top.y - 0.0012, top.z + half,
      0, top.y + height, top.z + 0.0013,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  crestGeometryCache = geometry;
  return geometry;
}

// --- Skull loft --------------------------------------------------------------------
// Pivot at the neck joint; the head extends toward -z. Angular sections,
// flat-topped, widest at the jowls, tapering to a blunt wedge snout.

// Rounder and larger than strict realism — the repo's animal style keeps a
// touch of big-head charm — but still wedge-snouted and flat-crowned enough
// to read as a lizard, not a toy.
const HEAD_STATIONS = [
  { t: 0, z: -0.061, hw: 0.0042, yc: -0.001 },
  { t: 0.1, z: -0.055, hw: 0.008, yc: 0.001 },
  { t: 0.28, z: -0.043, hw: 0.0122, yc: 0.003 },
  { t: 0.5, z: -0.03, hw: 0.0175, yc: 0.005 },
  { t: 0.72, z: -0.015, hw: 0.0215, yc: 0.005 },
  { t: 0.9, z: -0.002, hw: 0.019, yc: 0.004 },
  { t: 1, z: 0.008, hw: 0.014, yc: 0.002 },
];

let headGeometryCache = null;
export function getHeadGeometry() {
  if (!headGeometryCache) {
    headGeometryCache = loftZ({
      stations: HEAD_STATIONS,
      rings: 18,
      radial: 18,
      vRange: [0, 1],
      bellyFlat: 0.25,
      heightRatio: 0.88,
      superN: 2.35,
    });
  }
  return headGeometryCache;
}

// --- Painted textures -----------------------------------------------------------------
// All canvases draw with flipY disabled so canvas-y maps directly to v.

const bodyTextureCache = new Map();
export function getBodySkinTexture(variantKey) {
  if (bodyTextureCache.has(variantKey)) return bodyTextureCache.get(variantKey);
  if (typeof document === 'undefined') return null;
  const p = LAVA_LIZARD_VARIANTS[variantKey];
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tailStartY = size * 0.6; // trunk maps v 0–0.6, tail 0.6–1

  ctx.fillStyle = p.flank;
  ctx.fillRect(0, 0, size, size);

  // Pale belly rising from both u edges (seam hidden underneath).
  for (const leftSide of [true, false]) {
    const grad = leftSide
      ? ctx.createLinearGradient(size * 0.18, 0, 0, 0)
      : ctx.createLinearGradient(size * 0.82, 0, size, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, hexToRgba(p.belly, 0.85));
    grad.addColorStop(1, p.belly);
    ctx.fillStyle = grad;
    ctx.fillRect(leftSide ? 0 : size * 0.82, 0, size * 0.18, size);
  }

  // Rusty wash over the shoulders/upper flanks (strongest toward the neck).
  const washAlpha = variantKey === 'male' ? 0.36 : 0.22;
  for (const [x0, x1] of [[size * 0.2, size * 0.38], [size * 0.62, size * 0.8]]) {
    const grad = ctx.createLinearGradient(0, 0, 0, tailStartY);
    grad.addColorStop(0, hexToRgba(p.flankWash, washAlpha));
    grad.addColorStop(0.45, hexToRgba(p.flankWash, washAlpha * 0.45));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, x1 - x0, tailStartY);
  }

  // Dark dorsal field.
  for (const [from, to] of [[0.38, 0.5], [0.62, 0.5]]) {
    const grad = ctx.createLinearGradient(size * from, 0, size * to, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, p.dorsal);
    ctx.fillStyle = grad;
    ctx.fillRect(size * Math.min(from, to), 0, size * Math.abs(to - from), size);
  }

  // Dark saddle blotches crossing the back, in offset pairs.
  const saddleRows = 11;
  for (let row = 0; row < saddleRows; row += 1) {
    const y = (row + 0.5) / saddleRows * tailStartY;
    for (const side of [-1, 1]) {
      const cx = size * 0.5 + side * (size * 0.05 + seededUnit(variantKey, row * 5 + 1) * size * 0.02);
      ctx.fillStyle = hexToRgba(p.saddle, 0.62 + seededUnit(variantKey, row * 5 + 2) * 0.2);
      ctx.save();
      ctx.translate(cx, y + (seededUnit(variantKey, row * 5 + 3) - 0.5) * 12);
      ctx.rotate(side * 0.55);
      ctx.beginPath();
      ctx.ellipse(0, 0, 15 + seededUnit(variantKey, row * 5 + 4) * 8, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Dorsolateral stripes: the pale gold lines from nape to hips that make
  // the species read. Drawn as chains of overlapping soft dabs so the edge
  // stays organic, with a dark keyline below.
  const stripeAlpha = variantKey === 'female' ? 0.85 : 0.6;
  for (const xu of [0.345, 0.655]) {
    for (let i = 0; i < 46; i += 1) {
      const y = (i / 46) * tailStartY * 0.98;
      const fade = 1 - Math.pow(i / 46, 2.2) * 0.75;
      const wobble = Math.sin(i * 0.55 + (xu > 0.5 ? 1.7 : 0)) * 3.5;
      ctx.fillStyle = hexToRgba(p.stripe, stripeAlpha * fade * (0.7 + seededUnit(variantKey, i * 3 + (xu > 0.5 ? 900 : 0)) * 0.3));
      ctx.beginPath();
      ctx.ellipse(size * xu + wobble, y, 5.5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hexToRgba(p.saddle, 0.3 * fade);
      ctx.beginPath();
      ctx.ellipse(size * xu + wobble + (xu > 0.5 ? 8 : -8), y, 2.6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mid-flank mottling between stripe and belly.
  for (let i = 0; i < 90; i += 1) {
    const left = seededUnit(variantKey, i * 7 + 21) > 0.5;
    const x = size * (left ? 0.2 + seededUnit(variantKey, i * 7 + 22) * 0.12 : 0.68 + seededUnit(variantKey, i * 7 + 23) * 0.12);
    const y = seededUnit(variantKey, i * 7 + 24) * tailStartY;
    ctx.fillStyle = seededUnit(variantKey, i * 7 + 25) > 0.5
      ? hexToRgba(p.saddle, 0.22)
      : hexToRgba(p.fleck, 0.28);
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + seededUnit(variantKey, i * 7 + 26) * 5, 2.5 + seededUnit(variantKey, i * 7 + 27) * 3, seededUnit(variantKey, i * 7 + 28) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine peppered speckling across the dorsum — the salt-and-pepper grain
  // that reads so strongly in photos of the species.
  for (let i = 0; i < 340; i += 1) {
    const x = size * (0.26 + seededUnit(variantKey, i * 13 + 700) * 0.48);
    const y = seededUnit(variantKey, i * 13 + 701) * tailStartY;
    const r = 1.2 + seededUnit(variantKey, i * 13 + 702) * 2.2;
    ctx.fillStyle = seededUnit(variantKey, i * 13 + 703) > 0.7
      ? hexToRgba(p.fleck, 0.5)
      : hexToRgba(p.saddle, 0.32);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tail: transverse whorl bands that wrap the tapering tail.
  for (let y = tailStartY + 6; y < size; y += 13) {
    const alpha = 0.3 + seededUnit(variantKey, y) * 0.25;
    ctx.fillStyle = hexToRgba(p.saddle, alpha);
    ctx.fillRect(0, y, size, 4 + seededUnit(variantKey, y + 1) * 3);
    ctx.fillStyle = hexToRgba(p.fleck, 0.12);
    ctx.fillRect(0, y + 6, size, 2);
  }

  // Scale grain: thousands of tiny cells with darker outlines — this is what
  // keeps the skin from reading as smooth plastic up close.
  for (let i = 0; i < 2600; i += 1) {
    const x = seededUnit(variantKey, i * 9 + 101) * size;
    const y = seededUnit(variantKey, i * 9 + 102) * size;
    const rx = 1.6 + seededUnit(variantKey, i * 9 + 103) * 1.4;
    const light = seededUnit(variantKey, i * 9 + 104);
    ctx.strokeStyle = hexToRgba(p.saddle, 0.1 + light * 0.08);
    ctx.lineWidth = 0.7;
    ctx.fillStyle = light > 0.5
      ? hexToRgba(p.fleck, 0.05 + light * 0.06)
      : hexToRgba(p.dorsal, 0.06);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  bodyTextureCache.set(variantKey, texture);
  return texture;
}

// Head map: u around (0 throat → 0.5 crown → 1 throat), v snout(0)→neck(1).
const headTextureCache = new Map();
export function getHeadSkinTexture(variantKey) {
  if (headTextureCache.has(variantKey)) return headTextureCache.get(variantKey);
  if (typeof document === 'undefined') return null;
  const p = LAVA_LIZARD_VARIANTS[variantKey];
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = p.skin;
  ctx.fillRect(0, 0, size, size);

  // Slightly darker snout ramp toward the nose (v 0).
  const snoutGrad = ctx.createLinearGradient(0, 0, 0, size * 0.4);
  snoutGrad.addColorStop(0, hexToRgba(p.snout, 0.9));
  snoutGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = snoutGrad;
  ctx.fillRect(0, 0, size, size * 0.4);

  // Crown mottling.
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = seededUnit(variantKey, i * 3 + 300) > 0.5
      ? hexToRgba(p.snout, 0.34)
      : hexToRgba(p.brow, 0.3);
    ctx.beginPath();
    ctx.ellipse(
      size * (0.4 + seededUnit(variantKey, i * 3 + 301) * 0.2),
      size * (0.15 + seededUnit(variantKey, i * 3 + 302) * 0.75),
      3 + seededUnit(variantKey, i * 3 + 303) * 5,
      2.5 + seededUnit(variantKey, i * 3 + 303) * 3,
      0, 0, Math.PI * 2,
    );
    ctx.fill();
  }

  // Throat color (u near 0/1) — sooty on males, brick red on females.
  for (const leftEdge of [true, false]) {
    const grad = leftEdge
      ? ctx.createLinearGradient(size * 0.16, 0, 0, 0)
      : ctx.createLinearGradient(size * 0.84, 0, size, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, hexToRgba(p.throat, 0.8));
    grad.addColorStop(1, p.throat);
    ctx.fillStyle = grad;
    ctx.fillRect(leftEdge ? 0 : size * 0.84, size * 0.3, size * 0.16, size * 0.7);
  }

  // Female red cheeks spreading up from the throat behind the mouth.
  if (variantKey === 'female') {
    for (const cx of [0.2, 0.8]) {
      const grad = ctx.createRadialGradient(size * cx, size * 0.72, 2, size * cx, size * 0.72, size * 0.14);
      grad.addColorStop(0, hexToRgba(p.cheek, 0.85));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
  }

  // Mouth seam + pale labial scale band along it.
  for (const xu of [0.145, 0.855]) {
    ctx.fillStyle = hexToRgba(p.lip, 0.8);
    ctx.fillRect(size * xu - 4, size * 0.02, 8, size * 0.66);
    ctx.strokeStyle = hexToRgba('#1d1912', 0.75);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(size * xu, size * 0.02);
    for (let y = 0.02; y <= 0.68; y += 0.06) {
      ctx.lineTo(size * xu + Math.sin(y * 40) * 1.2, size * y);
    }
    ctx.stroke();
    // Labial scale ticks.
    for (let y = 0.05; y < 0.64; y += 0.055) {
      ctx.strokeStyle = hexToRgba(p.snout, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size * xu - 4, size * y);
      ctx.lineTo(size * xu + 4, size * y);
      ctx.stroke();
    }
  }

  // Dark canthal/postocular stripe running through the eye line.
  for (const xu of [0.33, 0.67]) {
    const grad = ctx.createLinearGradient(0, size * 0.06, 0, size * 0.95);
    grad.addColorStop(0, hexToRgba(p.saddle, 0.55));
    grad.addColorStop(0.5, hexToRgba(p.saddle, 0.72));
    grad.addColorStop(1, hexToRgba(p.saddle, 0.15));
    ctx.fillStyle = grad;
    ctx.fillRect(size * xu - 7, size * 0.06, 14, size * 0.9);
    // Pale line above the stripe (supraciliary edge).
    ctx.fillStyle = hexToRgba(p.fleck, 0.4);
    ctx.fillRect(size * (xu > 0.5 ? xu - 12 : xu + 7) + (xu > 0.5 ? 0 : 0), size * 0.2, 4, size * 0.6);
  }

  // Scale grain, finer than the body's.
  for (let i = 0; i < 900; i += 1) {
    const x = seededUnit(variantKey, i * 11 + 500) * size;
    const y = seededUnit(variantKey, i * 11 + 501) * size;
    const light = seededUnit(variantKey, i * 11 + 502);
    ctx.strokeStyle = hexToRgba(p.saddle, 0.08 + light * 0.07);
    ctx.lineWidth = 0.6;
    ctx.fillStyle = light > 0.5 ? hexToRgba(p.fleck, 0.06) : hexToRgba(p.snout, 0.07);
    ctx.beginPath();
    ctx.ellipse(x, y, 1.3 + light * 1.1, 1 + light * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  headTextureCache.set(variantKey, texture);
  return texture;
}

// Tileable pebbled-scale bump map shared by body and head, repeated finer
// than the albedo so the relief reads as individual scales.
let bumpTextureCache = null;
export function getScaleBumpTexture() {
  if (bumpTextureCache) return bumpTextureCache;
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6d6d6d';
  ctx.fillRect(0, 0, size, size);
  const cells = 24;
  const step = size / cells;
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const cx = (col + 0.5 + (row % 2) * 0.5 + (seededUnit('bump', row * 97 + col * 3) - 0.5) * 0.5) * step;
      const cy = (row + 0.5 + (seededUnit('bump', row * 97 + col * 3 + 1) - 0.5) * 0.4) * step;
      const r = step * (0.5 + seededUnit('bump', row * 97 + col * 3 + 2) * 0.2);
      const grad = ctx.createRadialGradient(cx % size, cy % size, r * 0.1, cx % size, cy % size, r);
      const peak = 150 + Math.floor(seededUnit('bump', row * 97 + col * 3 + 3) * 40);
      grad.addColorStop(0, `rgb(${peak},${peak},${peak})`);
      grad.addColorStop(0.75, '#6d6d6d');
      grad.addColorStop(1, '#4d4d4d');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx % size, cy % size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 6);
  bumpTextureCache = texture;
  return texture;
}

// --- Vertex-colored small parts ----------------------------------------------------

function tintGeometry(geometry, hex, { jitter = 0.05, seed = 'tint' } = {}) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const m = 1 + (seededUnit(seed, i) - 0.5) * 2 * jitter;
    colors[i * 3] = color.r * m;
    colors[i * 3 + 1] = color.g * m;
    colors[i * 3 + 2] = color.b * m;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function tintedSphere(radius, scale, position, hex, { widthSegments = 9, heightSegments = 7, jitter = 0.05, seed = 'part' } = {}) {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  geometry.scale(...scale);
  geometry.translate(...position);
  return tintGeometry(geometry, hex, { jitter, seed });
}

// Eye placement on the skull loft (the orbit rides high on the side of the
// head). The ball is embedded so about a third protrudes as the orbital
// bulge.
export const EYE_POS = side => [side * 0.0127, 0.012, -0.03];

// Non-blinking head furniture in one merged mesh: raised eye-socket rims,
// nostril beads, and the tympanum (ear) ovals behind the jaw hinge.
const headDetailsCache = new Map();
export function getHeadDetailsGeometry(variantKey) {
  if (headDetailsCache.has(variantKey)) return headDetailsCache.get(variantKey);
  const p = LAVA_LIZARD_VARIANTS[variantKey];
  const parts = [];
  for (const side of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.0066, 0.0012, 6, 14);
    rim.scale(1, 1, 0.8);
    rim.rotateY(side * Math.PI / 2);
    const [ex, ey, ez] = EYE_POS(side);
    rim.translate(ex + side * 0.0014, ey, ez);
    tintGeometry(rim, p.brow, { jitter: 0.06, seed: `rim${side}` });
    parts.push(rim);
    parts.push(tintedSphere(0.0016, [1, 1, 1], [side * 0.0056, 0.005, -0.054], EYE_PUPIL, { widthSegments: 6, heightSegments: 5, jitter: 0, seed: `nostril${side}` }));
    parts.push(tintedSphere(0.0036, [0.22, 1.15, 0.85], [side * 0.0205, 0.001, -0.006], '#221d16', { widthSegments: 6, heightSegments: 5, jitter: 0.04, seed: `ear${side}` }));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  headDetailsCache.set(variantKey, merged);
  return merged;
}

const jawGeometryCache = new Map();
export function getJawGeometry(variantKey) {
  if (!jawGeometryCache.has(variantKey)) {
    const p = LAVA_LIZARD_VARIANTS[variantKey];
    // Tucked up under the skull — long/low enough to color the throat but
    // never poking past the snout silhouette as a red spike.
    jawGeometryCache.set(
      variantKey,
      tintedSphere(0.0125, [0.78, 0.26, 1.35], [0, -0.001, -0.017], p.throat, { jitter: 0.06, seed: 'jaw' }),
    );
  }
  return jawGeometryCache.get(variantKey);
}

// Forked tongue authored at full extension along -z; the animator drives
// scale.z between ~0 and 1 for the flick.
let tongueGeometryCache = null;
export function getTongueGeometry() {
  if (tongueGeometryCache) return tongueGeometryCache;
  const stem = new THREE.CylinderGeometry(0.0012, 0.0015, 0.009, 5);
  stem.rotateX(Math.PI / 2);
  stem.translate(0, 0, -0.0045);
  tintGeometry(stem, TONGUE_COLOR, { jitter: 0.03, seed: 'tongue' });
  const tines = [];
  for (const side of [-1, 1]) {
    const tine = new THREE.ConeGeometry(0.0009, 0.0062, 4);
    tine.rotateX(-Math.PI / 2);
    tine.rotateY(side * 0.42);
    tine.translate(side * 0.0016, 0, -0.0112);
    tintGeometry(tine, TONGUE_COLOR, { jitter: 0.03, seed: `tine${side}` });
    tines.push(tine);
  }
  tongueGeometryCache = mergeGeometries([stem, ...tines], false);
  stem.dispose();
  tines.forEach(t => t.dispose());
  return tongueGeometryCache;
}

// Eye: a dark bead like the real animal — big soft-edged black pupil facing
// out and slightly forward, narrow amber iris ring, dark sclera hidden in
// the socket. Painted per-vertex on a single sphere so saccade rotations
// carry the pupil with them. (The old build merged a separate pupil sphere
// that sat entirely *inside* the iris ball — the eyes read as blank balls.)
const eyeGeometryCache = new Map();
export function getEyeGeometry(side) {
  if (!eyeGeometryCache.has(side)) {
    const geometry = new THREE.SphereGeometry(0.0072, 16, 12);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const pupil = new THREE.Color(EYE_PUPIL);
    const iris = new THREE.Color(EYE_IRIS);
    const sclera = new THREE.Color('#33261a');
    const gaze = new THREE.Vector3(side, 0.1, -0.42).normalize();
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < positions.count; i += 1) {
      v.fromBufferAttribute(positions, i).normalize();
      const angle = Math.acos(Math.min(1, Math.max(-1, v.dot(gaze))));
      if (angle < 0.6) {
        c.copy(pupil);
      } else if (angle < 0.94) {
        const f = (angle - 0.6) / 0.34;
        // Pupil melts through the amber ring into the sclera.
        c.copy(pupil).lerp(iris, Math.min(1, f * 2.6));
        if (f > 0.5) c.lerp(sclera, (f - 0.5) / 0.5);
      } else {
        c.copy(sclera);
      }
      const m = 1 + (seededUnit('eye', i) - 0.5) * 0.12;
      colors[i * 3] = c.r * m;
      colors[i * 3 + 1] = c.g * m;
      colors[i * 3 + 2] = c.b * m;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    eyeGeometryCache.set(side, geometry);
  }
  return eyeGeometryCache.get(side);
}

// Eyelid: skin-toned dome the animator swings over the eye (group rotation.x
// 0 → LID_CLOSED_ANGLE). Lizards blink with the LOWER lid, so at rest the
// dome tucks down into the cheek and the closed angle is negative — the lid
// wipes upward across the eye.
export const LID_CLOSED_ANGLE = -1.05;
const lidGeometryCache = new Map();
export function getLidGeometry(variantKey) {
  if (!lidGeometryCache.has(variantKey)) {
    const p = LAVA_LIZARD_VARIANTS[variantKey];
    const dome = new THREE.SphereGeometry(0.0084, 10, 5, 0, Math.PI * 2, 0, 1.35);
    tintGeometry(dome, p.skin, { jitter: 0.04, seed: 'lid' });
    lidGeometryCache.set(variantKey, dome);
  }
  return lidGeometryCache.get(variantKey);
}

// --- Limbs ---------------------------------------------------------------------------
// Hand-placed joints in torso space (root rides at LIZARD_ROOT_HEIGHT, so
// world foot height = LIZARD_ROOT_HEIGHT + local y). Alert stance: forearms
// near vertical, hind knees out-forward, drumstick thighs.

export const LIMB_LAYOUT = {
  front: {
    hip: side => [side * 0.024, -0.004, -0.062],
    knee: side => [side * 0.02, -0.016, 0.004], // elbow, relative to hip
    ankle: side => [side * 0.004, -0.036, -0.004], // wrist, relative to elbow
    thighR: [0.0068, 0.005],
    shinR: [0.005, 0.0036],
    toes: { count: 5, base: 0.006, long: 0.011, spread: 1.15 },
  },
  hind: {
    hip: side => [side * 0.026, -0.004, 0.052],
    knee: side => [side * 0.024, -0.012, -0.01],
    ankle: side => [side * 0.004, -0.04, 0.014],
    thighR: [0.0095, 0.0062],
    shinR: [0.0056, 0.004],
    toes: { count: 4, base: 0.008, long: 0.02, spread: 0.95 },
  },
};

// Tapered segment from the local origin to `to`, with ball caps at both
// joints so animated rotations never tear the silhouette open.
function limbSegment(to, r0, r1, hex, seed) {
  const dir = new THREE.Vector3(...to);
  const length = dir.length();
  const cyl = new THREE.CylinderGeometry(r1, r0, length, 9, 1, true);
  cyl.translate(0, length / 2, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  cyl.applyQuaternion(quat);
  const capA = new THREE.SphereGeometry(r0, 8, 6);
  const capB = new THREE.SphereGeometry(r1, 8, 6);
  capB.translate(...to);
  const merged = mergeGeometries([cyl, capA, capB], false);
  cyl.dispose();
  capA.dispose();
  capB.dispose();
  return tintGeometry(merged, hex, { jitter: 0.09, seed });
}

const thighGeometryCache = new Map();
export function getThighGeometry(front, side, variantKey) {
  const key = `${front}:${side}:${variantKey}`;
  if (!thighGeometryCache.has(key)) {
    const layout = front ? LIMB_LAYOUT.front : LIMB_LAYOUT.hind;
    const p = LAVA_LIZARD_VARIANTS[variantKey];
    thighGeometryCache.set(key, limbSegment(layout.knee(side), layout.thighR[0], layout.thighR[1], p.leg, `thigh${key}`));
  }
  return thighGeometryCache.get(key);
}

const shinGeometryCache = new Map();
export function getShinGeometry(front, side, variantKey) {
  const key = `${front}:${side}:${variantKey}`;
  if (!shinGeometryCache.has(key)) {
    const layout = front ? LIMB_LAYOUT.front : LIMB_LAYOUT.hind;
    const p = LAVA_LIZARD_VARIANTS[variantKey];
    const ankle = layout.ankle(side);
    const parts = [limbSegment(ankle, layout.shinR[0], layout.shinR[1], p.leg, `shin${key}`)];
    // Palm.
    const palm = new THREE.SphereGeometry(0.0052, 8, 6);
    palm.scale(1.15, 0.4, 1.35);
    palm.translate(ankle[0], ankle[1] - 0.001, ankle[2] - 0.002);
    tintGeometry(palm, p.leg, { jitter: 0.08, seed: `palm${key}` });
    parts.push(palm);
    // Slender toes fanned forward, longest to the outside (the lizard hind
    // foot's long fourth toe), each tipped with a darker claw.
    const toes = layout.toes;
    for (let toe = 0; toe < toes.count; toe += 1) {
      const spreadT = toes.count === 1 ? 0 : toe / (toes.count - 1) - 0.5;
      const angle = spreadT * toes.spread;
      const outerness = side > 0 ? spreadT + 0.5 : 0.5 - spreadT;
      const length = toes.base + outerness * (toes.long - toes.base)
        + seededUnit(`toe${key}`, toe) * 0.0015;
      const dx = Math.sin(angle) * length;
      const dz = -Math.cos(angle) * length;
      const shaft = new THREE.CylinderGeometry(0.0006, 0.0011, length, 5, 1, true);
      shaft.translate(0, length / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, -0.0016, dz).normalize(),
      );
      shaft.applyQuaternion(q);
      shaft.translate(ankle[0], ankle[1] - 0.0012, ankle[2] - 0.003);
      tintGeometry(shaft, p.leg, { jitter: 0.07, seed: `toe${key}${toe}` });
      parts.push(shaft);
      const claw = new THREE.ConeGeometry(0.0007, 0.0028, 4);
      claw.rotateX(-Math.PI / 2 - 0.35);
      claw.rotateY(angle);
      claw.translate(ankle[0] + dx, ankle[1] - 0.0028, ankle[2] - 0.003 + dz);
      tintGeometry(claw, '#2a251d', { jitter: 0, seed: `claw${key}${toe}` });
      parts.push(claw);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach(g => g.dispose());
    shinGeometryCache.set(key, merged);
  }
  return shinGeometryCache.get(key);
}

// --- Materials -------------------------------------------------------------------------

const materialsCache = new Map();
export function getLavaLizardMaterials(variantKey) {
  const cached = materialsCache.get(variantKey);
  if (cached) return cached;
  const p = LAVA_LIZARD_VARIANTS[variantKey];
  const bodyTexture = getBodySkinTexture(variantKey);
  const headTexture = getHeadSkinTexture(variantKey);
  const bump = getScaleBumpTexture();
  const bumpProps = bump ? { bumpMap: bump, bumpScale: BUMP_SCALE } : {};
  // Faint thin-film iridescence gives the scales a beetle-wing shimmer at
  // grazing angles — stronger on the dark males, whisper-quiet on females.
  // Deliberately subtle: it should only read when the light rakes the flank.
  const iridescenceProps = {
    iridescence: variantKey === 'male' ? 0.3 : 0.16,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [140, 420],
  };
  const materials = {
    body: new THREE.MeshPhysicalMaterial({
      ...(bodyTexture ? { map: bodyTexture } : {}),
      ...bumpProps,
      ...iridescenceProps,
      color: '#ffffff',
      roughness: SKIN_ROUGHNESS,
      metalness: 0,
    }),
    head: new THREE.MeshPhysicalMaterial({
      ...(headTexture ? { map: headTexture } : {}),
      ...bumpProps,
      ...iridescenceProps,
      color: '#ffffff',
      roughness: SKIN_ROUGHNESS - 0.04,
      metalness: 0,
    }),
    limb: new THREE.MeshStandardMaterial({
      ...bumpProps,
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.82,
      metalness: 0,
    }),
    parts: new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.72,
      metalness: 0,
    }),
    crest: new THREE.MeshStandardMaterial({
      color: p.dorsal,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    eye: new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.18,
      metalness: 0,
    }),
  };
  // Only cache once the browser textures exist so an early SSR call can't
  // pin map-less materials for the whole session.
  if (bodyTexture && headTexture) materialsCache.set(variantKey, materials);
  return materials;
}

// --- Rig assembly -------------------------------------------------------------------------
// Returns { group, nodes } honoring the reptileGaitRuntime node contract.
// Geometries/materials are module-cached and shared; only the group/mesh
// wrappers are per-instance.

const HEAD_PIVOT = [0, 0.016, -0.098];
const TAIL_BASE = [0, 0.002, 0.094];

export function createLavaLizardRig(variantKey = 'male') {
  const materials = getLavaLizardMaterials(variantKey);
  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);

  const trunk = new THREE.Mesh(getTrunkGeometry(), materials.body);
  trunk.castShadow = true;
  torso.add(trunk);
  torso.add(new THREE.Mesh(getCrestGeometry(), materials.crest));

  const head = new THREE.Group();
  head.position.set(...HEAD_PIVOT);
  torso.add(head);
  const skull = new THREE.Mesh(getHeadGeometry(), materials.head);
  skull.castShadow = true;
  skull.rotation.x = 0.05; // slight alert nose-up carriage
  head.add(skull);
  head.add(new THREE.Mesh(getHeadDetailsGeometry(variantKey), materials.parts));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.0075, -0.004);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(getJawGeometry(variantKey), materials.parts);
  jaw.add(jawMesh);

  const tongue = new THREE.Group();
  tongue.position.set(0, -0.0035, -0.032);
  tongue.scale.z = 0.02;
  jaw.add(tongue);
  tongue.add(new THREE.Mesh(getTongueGeometry(), materials.parts));

  const eyes = {};
  const lids = {};
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(...EYE_POS(side));
    head.add(eye);
    eye.add(new THREE.Mesh(getEyeGeometry(side), materials.eye));
    const lid = new THREE.Group();
    lid.position.set(...EYE_POS(side));
    head.add(lid);
    const lidMesh = new THREE.Mesh(getLidGeometry(variantKey), materials.parts);
    // Rest pose: the dome tucks down into the cheek; the animator's rotation.x
    // (0 → negative LID_CLOSED_ANGLE) wipes it up over the eye, lower-lid
    // first like a real lizard.
    lidMesh.rotation.x = 1.25;
    lid.add(lidMesh);
    if (side < 0) { eyes.L = eye; lids.L = lid; } else { eyes.R = eye; lids.R = lid; }
  }

  const legs = [];
  for (const front of [true, false]) {
    const layout = front ? LIMB_LAYOUT.front : LIMB_LAYOUT.hind;
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(...layout.hip(side));
      torso.add(hip);
      const thigh = new THREE.Mesh(getThighGeometry(front, side, variantKey), materials.limb);
      thigh.castShadow = true;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.set(...layout.knee(side));
      hip.add(knee);
      const shin = new THREE.Mesh(getShinGeometry(front, side, variantKey), materials.limb);
      shin.castShadow = true;
      knee.add(shin);
      // Diagonal trot pairs: FR+HL in phase, FL+HR opposite.
      const phase = (front ? side > 0 : side < 0) ? 0 : Math.PI;
      legs.push({ hip, knee, side, front, phase });
    }
  }

  const tailSegments = [];
  let tailParent = torso;
  let pivot = TAIL_BASE;
  for (let k = 0; k < TAIL_SPECS.length; k += 1) {
    const segment = new THREE.Group();
    segment.position.set(...pivot);
    tailParent.add(segment);
    const mesh = new THREE.Mesh(getTailSegmentGeometry(k), materials.body);
    mesh.castShadow = k < 2;
    segment.add(mesh);
    tailSegments.push(segment);
    tailParent = segment;
    pivot = [0, 0, tailSegmentLength(k) * 0.96];
  }

  group.position.y = LIZARD_ROOT_HEIGHT;

  const nodes = {
    root: group,
    torso,
    head,
    jaw,
    gular: jawMesh,
    tongue,
    eyeL: eyes.L,
    eyeR: eyes.R,
    lidL: lids.L,
    lidR: lids.R,
    lidClosedAngle: LID_CLOSED_ANGLE,
    legs,
    tailSegments,
    breathe: trunk,
  };
  return { group, nodes };
}
