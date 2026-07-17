// Procedural young Floreana prickly pear (Opuntia megasperma): pure geometry/material/graph
// builder shared by the destructible field component. Every pad and blossom in
// the graph becomes its own rigid body, so the plant is generated as a set of
// pieces with parent links rather than a single mesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, pushSpike, seededUnit } from '../breakablePlant/plantGeoUtils';

export { seededUnit };

// --- Visual tuning knobs ---------------------------------------------------
export const PAD_TINTS = ['#7c9455', '#6b874a', '#8aa062', '#617e44'];
export const PAD_ROUGHNESS = 0.82;
export const PAD_THICKNESS_RATIO = 0.26;
// Vertex-shade multipliers (multiply the material tint): shadowed base,
// mid-pad flesh, waxy pale-yellow rim band.
export const PAD_BASE_SHADE = [0.6, 0.64, 0.5];
export const PAD_MID_SHADE = [0.95, 0.97, 0.88];
export const PAD_RIM_SHADE = [1.1, 1.12, 0.86];
export const PAD_MOTTLE = 0.12; // +/- per-vertex brightness jitter
export const AREOLE_COLOR = '#a97e4f';
export const AREOLE_ROWS = 7;
export const AREOLE_SPREAD = 1.55; // radians of pad face covered by stud grid
export const FLOWER_PETAL_COLOR = '#f2c127';
export const FLOWER_CENTER_COLOR = '#d97e1f';
export const FLOWER_DIAMETER_RATIO = 0.58; // relative to host pad width
export const BASAL_SINK = 0.09; // how deep the ground pads sit, scaled by size

const PAD_DENSITY = 420; // kg/m^3-ish, keeps pads light but not floaty

// Pad silhouette variants so plants aren't built from one repeated leaf:
// classic obovate, rounder with a sideways lean, and an elongated paddle.
// peak/round shape the profile, skew leans the pad, wave ripples the rim.
export const PAD_VARIANTS = [
  { peak: 1.45, round: 0.8, skew: 0.045, wave: 0.02, wavePhase: 0.4 },
  { peak: 1.18, round: 0.92, skew: -0.075, wave: 0.028, wavePhase: 2.1 },
  { peak: 1.72, round: 0.7, skew: 0.09, wave: 0.016, wavePhase: 4.4 },
];

// Half-width of the pad at normalized height t in [0, 1]: widest above the
// middle, pinched base, rounded tip, with a subtle rim ripple per variant.
function padHalfWidth(t, variant = PAD_VARIANTS[0]) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const base = 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(clamped, variant.peak)), variant.round);
  const wave = 1 + variant.wave * Math.sin(clamped * 7.3 * Math.PI + variant.wavePhase);
  return Math.max(base * wave, 0.004);
}

// Sideways lean applied to both the shell and the stud anchors.
function padSkew(t, variant) {
  return Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) * variant.skew;
}

// --- Shared geometries (unit pad: height 1, max width 1, base at y=0) ------

const padGeometryCache = new Map();
export function getPadGeometry(variantIndex = 0) {
  const index = ((variantIndex | 0) % PAD_VARIANTS.length + PAD_VARIANTS.length) % PAD_VARIANTS.length;
  if (padGeometryCache.has(index)) return padGeometryCache.get(index);
  const variant = PAD_VARIANTS[index];
  const points = [];
  const rings = 26;
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    points.push(new THREE.Vector2(padHalfWidth(t, variant), t));
  }
  const geometry = new THREE.LatheGeometry(points, 20);
  geometry.scale(1, 1, PAD_THICKNESS_RATIO);
  {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      positions.setX(i, positions.getX(i) + padSkew(positions.getY(i), variant));
    }
  }
  geometry.computeVertexNormals();

  // Vertex shading: dark base rising to waxy flesh, pale rim band where the
  // surface turns edge-on, and hash mottle so pads never read as one flat
  // green. Stored as multipliers over the material tint.
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color(...PAD_BASE_SHADE);
  const mid = new THREE.Color(...PAD_MID_SHADE);
  const rim = new THREE.Color(...PAD_RIM_SHADE);
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp(y, 0, 1);
    shade.copy(base).lerp(mid, THREE.MathUtils.smoothstep(t, 0.02, 0.42));
    const halfWidth = Math.max(padHalfWidth(t, variant), 0.02);
    const radial = Math.hypot(x - padSkew(t, variant), z / PAD_THICKNESS_RATIO) / halfWidth;
    shade.lerp(rim, THREE.MathUtils.smoothstep(radial, 0.72, 1) * 0.85);
    const mottle = 1 + (seededUnit(`${x.toFixed(3)}:${y.toFixed(3)}:${z.toFixed(3)}`, 5) - 0.5) * 2 * PAD_MOTTLE;
    colors[i * 3] = shade.r * mottle;
    colors[i * 3 + 1] = shade.g * mottle;
    colors[i * 3 + 2] = shade.b * mottle;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  padGeometryCache.set(index, geometry);
  return geometry;
}

// Subtle blotch/speckle map shared by all pads; multiplied over tint and
// vertex shade, so it only has to carry fine detail.
let padDetailTextureCache = null;
export function getPadDetailTexture() {
  if (padDetailTextureCache) return padDetailTextureCache;
  if (typeof document === 'undefined') return null;
  const sizePx = 256;
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 0, sizePx, sizePx);
  for (let i = 0; i < 260; i += 1) {
    const dark = seededUnit('pad-blotch', i * 7 + 1) > 0.45;
    const alpha = 0.03 + seededUnit('pad-blotch', i * 7 + 2) * 0.06;
    ctx.fillStyle = dark ? `rgba(52, 64, 38, ${alpha})` : `rgba(240, 246, 214, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(
      seededUnit('pad-blotch', i * 7 + 3) * sizePx,
      seededUnit('pad-blotch', i * 7 + 4) * sizePx,
      3 + seededUnit('pad-blotch', i * 7 + 5) * 16,
      2 + seededUnit('pad-blotch', i * 7 + 6) * 10,
      seededUnit('pad-blotch', i * 7 + 7) * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (let i = 0; i < 900; i += 1) {
    const alpha = 0.05 + seededUnit('pad-speck', i * 5 + 1) * 0.08;
    ctx.fillStyle = seededUnit('pad-speck', i * 5 + 2) > 0.5
      ? `rgba(58, 70, 42, ${alpha})`
      : `rgba(238, 243, 216, ${alpha})`;
    ctx.fillRect(
      seededUnit('pad-speck', i * 5 + 3) * sizePx,
      seededUnit('pad-speck', i * 5 + 4) * sizePx,
      1.4,
      1.4,
    );
  }
  // Faint diamond areole-dot grid so the spotted-pad read survives beyond the
  // distance where the tuft geometry drops below a pixel.
  const dotStep = sizePx / 9;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const cx = (col + (row % 2) * 0.5) * dotStep;
      const cy = (row + 0.5) * dotStep;
      ctx.fillStyle = 'rgba(96, 74, 46, 0.16)';
      ctx.beginPath();
      ctx.arc(cx % sizePx, cy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  padDetailTextureCache = texture;
  return texture;
}

// Areole spine tufts across both pad faces in a jittered diamond grid, plus
// longer spines along the rim. Each areole is a small splayed cluster of
// spikes (with the occasional long spine) rather than a single uniform cone.
const padStudGeometryCache = new Map();
export function getPadStudGeometry(variantIndex = 0) {
  const index = ((variantIndex | 0) % PAD_VARIANTS.length + PAD_VARIANTS.length) % PAD_VARIANTS.length;
  if (padStudGeometryCache.has(index)) return padStudGeometryCache.get(index);
  const variant = PAD_VARIANTS[index];
  const positions = [];
  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const spikeDir = new THREE.Vector3();

  const pushTuft = (areoleSeed, longSpineChance) => {
    const spikes = 2 + Math.floor(seededUnit(areoleSeed, 20) * 2);
    for (let s = 0; s < spikes; s += 1) {
      const splayA = (seededUnit(areoleSeed, 21 + s * 3) - 0.5) * 0.9;
      const splayB = (seededUnit(areoleSeed, 22 + s * 3) - 0.5) * 0.9;
      spikeDir.copy(normal);
      spikeDir.x += splayA * 0.45;
      spikeDir.y += splayB * 0.45;
      spikeDir.normalize();
      const long = seededUnit(areoleSeed, 23 + s * 3) > (1 - longSpineChance);
      pushSpike(
        positions,
        origin,
        spikeDir,
        long ? 0.007 : 0.009,
        long ? 0.055 + seededUnit(areoleSeed, 24 + s * 3) * 0.025 : 0.02 + seededUnit(areoleSeed, 25 + s * 3) * 0.014,
      );
    }
  };

  for (let row = 0; row < AREOLE_ROWS; row += 1) {
    const rowT = 0.16 + (row / (AREOLE_ROWS - 1)) * 0.74;
    const cols = Math.max(2, Math.round(padHalfWidth(rowT, variant) * 11));
    for (const faceTheta of [Math.PI / 2, -Math.PI / 2]) {
      for (let col = 0; col < cols; col += 1) {
        const areoleSeed = `areole:${index}:${row}:${faceTheta > 0 ? 'f' : 'b'}:${col}`;
        const t = THREE.MathUtils.clamp(rowT + (seededUnit(areoleSeed, 1) - 0.5) * 0.05, 0.1, 0.95);
        const halfWidth = padHalfWidth(t, variant);
        const u = (col + (row % 2) * 0.5) / Math.max(1, cols - 0.5);
        const theta = faceTheta
          + (u - 0.5) * AREOLE_SPREAD
          + (seededUnit(areoleSeed, 2) - 0.5) * 0.18;
        origin.set(
          Math.cos(theta) * halfWidth + padSkew(t, variant),
          t,
          Math.sin(theta) * halfWidth * PAD_THICKNESS_RATIO,
        );
        normal.set(Math.cos(theta), 0.16, Math.sin(theta) / PAD_THICKNESS_RATIO).normalize();
        pushTuft(areoleSeed, 0.14);
      }
    }
    // Rim spines on both edges of the pad silhouette.
    for (const edge of [0, Math.PI]) {
      const halfWidth = padHalfWidth(rowT, variant);
      origin.set(Math.cos(edge) * halfWidth + padSkew(rowT, variant), rowT, 0);
      normal.set(Math.cos(edge), 0.3, 0).normalize();
      pushTuft(`rim:${index}:${row}:${edge}`, 0.4);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  padStudGeometryCache.set(index, geometry);
  return geometry;
}

// Unit flower (radius ~0.5): a cupped rosette of soft ellipsoid petals in two
// rings around a domed center with a raised stamen ring — no box corners.
let flowerGeometryCache = null;
export function getFlowerGeometries() {
  if (flowerGeometryCache) return flowerGeometryCache;
  const petals = [];
  const rings = [
    { count: 10, tilt: 0.4, length: 0.44, width: 0.16, thick: 0.05, lift: 0.015, reach: 0.56 },
    { count: 7, tilt: 0.86, length: 0.3, width: 0.13, thick: 0.05, lift: 0.05, reach: 0.5 },
  ];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let i = 0; i < ring.count; i += 1) {
      const petal = new THREE.SphereGeometry(0.5, 8, 6);
      // Ellipsoid petal: long axis outward, flattened vertically, slightly
      // narrower at the tip via a gentle taper of the outer hemisphere.
      const pos = petal.attributes.position;
      for (let v = 0; v < pos.count; v += 1) {
        const px = pos.getX(v);
        if (px > 0) {
          const pinch = 1 - px * 0.5;
          pos.setY(v, pos.getY(v) * pinch);
          pos.setZ(v, pos.getZ(v) * (pinch * 0.7 + 0.3));
        }
      }
      petal.scale(ring.length, ring.thick, ring.width);
      petal.computeVertexNormals();
      petal.translate(ring.length * ring.reach, 0, 0);
      petal.rotateZ(ring.tilt);
      const jitter = (seededUnit(`petal:${ringIndex}:${i}`, 1) - 0.5) * 0.14;
      petal.rotateY((i / ring.count) * Math.PI * 2 + ringIndex * 0.45 + jitter);
      petal.translate(0, ring.lift, 0);
      petals.push(petal);
    }
  }
  // Stamen ring shares the petal material so the whole corolla is one draw.
  const stamenRing = new THREE.TorusGeometry(0.085, 0.028, 6, 14);
  stamenRing.rotateX(Math.PI / 2);
  stamenRing.translate(0, 0.1, 0);
  petals.push(stamenRing);
  const petalGeometry = mergeGeometries(petals, false);
  for (const petal of petals) petal.dispose();
  const centerGeometry = new THREE.SphereGeometry(0.14, 10, 8);
  centerGeometry.scale(1, 0.66, 1);
  centerGeometry.translate(0, 0.05, 0);
  flowerGeometryCache = { petals: petalGeometry, center: centerGeometry };
  return flowerGeometryCache;
}

// Unopened bud: a small teardrop that rides on a pad's top rim and breaks off
// with it (visual only, not separately collectible).
let budGeometryCache = null;
export function getBudGeometry() {
  if (budGeometryCache) return budGeometryCache;
  const geometry = new THREE.SphereGeometry(0.5, 8, 7);
  const pos = geometry.attributes.position;
  for (let v = 0; v < pos.count; v += 1) {
    const py = pos.getY(v);
    if (py > 0) {
      const pinch = 1 - py * 0.9;
      pos.setX(v, pos.getX(v) * pinch);
      pos.setZ(v, pos.getZ(v) * pinch);
      pos.setY(v, py * 1.25);
    }
  }
  geometry.computeVertexNormals();
  budGeometryCache = geometry;
  return budGeometryCache;
}

// --- Materials (module cache, shared across all plants) --------------------

let materialsCache = null;
export function getPricklyPearMaterials() {
  if (materialsCache) return materialsCache;
  const detailMap = getPadDetailTexture();
  const materials = {
    pads: PAD_TINTS.map(tint => new THREE.MeshStandardMaterial({
      color: tint,
      roughness: PAD_ROUGHNESS,
      metalness: 0,
      vertexColors: true,
      map: detailMap,
    })),
    areole: new THREE.MeshStandardMaterial({
      color: AREOLE_COLOR,
      roughness: 0.9,
      metalness: 0,
    }),
    petal: new THREE.MeshStandardMaterial({
      color: FLOWER_PETAL_COLOR,
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    center: new THREE.MeshStandardMaterial({
      color: FLOWER_CENTER_COLOR,
      roughness: 0.72,
      metalness: 0,
    }),
    driedPad: new THREE.MeshStandardMaterial({
      color: '#8a7a4a',
      roughness: 0.95,
      metalness: 0,
      vertexColors: true,
      map: detailMap,
    }),
    bud: new THREE.MeshStandardMaterial({
      color: '#c96f31',
      roughness: 0.7,
      metalness: 0,
    }),
    pebble: new THREE.MeshStandardMaterial({
      color: '#3e3b34',
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    }),
    tuft: new THREE.MeshStandardMaterial({
      color: '#b3a065',
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  };
  // Only cache once the browser texture exists so an early server-side call
  // can't pin map-less materials for the whole session.
  if (detailMap) materialsCache = materials;
  return materials;
}

// --- Plant graph builder ----------------------------------------------------
// Returns pads/flowers in plant-local space (origin at the ground under the
// basal pad, +Y up). Positions are the piece BASE attach points; orientation
// quaternions point each piece's local +Y along its growth direction.

export function buildPricklyPear({ seed, size = 1, flowerCount = 0 }) {
  const rng = makeRng(`prickly-pear:${seed}`);
  const padTarget = THREE.MathUtils.clamp(Math.round(3.2 + size * 4.2 + rng() * 1.6), 3, 10);
  const pads = [];

  const addPad = (parent, tiltAngle, yawAngle) => {
    const generation = parent ? parent.generation + 1 : 0;
    const height = (parent ? parent.height * (0.78 + rng() * 0.14) : 0.46 * size * (0.92 + rng() * 0.16));
    const width = height * (0.62 + rng() * 0.14);
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    if (parent) {
      const attachU = tiltAngle === 0 ? (rng() * 2 - 1) * 0.35 : Math.sign(tiltAngle) * (0.35 + rng() * 0.3);
      position.set(
        attachU * padHalfWidth(0.82) * parent.width,
        0.85 * parent.height,
        0,
      );
      position.applyQuaternion(parent.quaternion).add(parent.position);
      quaternion.copy(parent.quaternion)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tiltAngle));
    } else {
      position.set((rng() * 2 - 1) * 0.05 * size, -BASAL_SINK * size, (rng() * 2 - 1) * 0.05 * size);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rng() * 2 - 1) * 0.12));
    }
    const pad = {
      id: `pad-${pads.length}`,
      parentId: parent ? parent.id : null,
      generation,
      position,
      quaternion,
      height,
      width,
      variant: Math.floor(rng() * PAD_VARIANTS.length),
      mass: Math.max(0.9, width * height * width * PAD_THICKNESS_RATIO * PAD_DENSITY),
      children: 0,
      tone: rng(),
      buds: [],
    };
    if (parent) parent.children += 1;
    pads.push(pad);
    return pad;
  };

  addPad(null, 0, 0);
  if (size > 1.05 && rng() > 0.55) addPad(null, 0, 0);

  while (pads.length < padTarget) {
    const candidates = pads.filter(pad => (
      pad.generation < 3 && pad.children < (pad.generation === 0 ? 3 : 2) && pad.height > 0.16
    ));
    if (!candidates.length) break;
    const parent = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    const lean = (rng() * 2 - 1);
    const tilt = lean * (0.35 + rng() * 0.4);
    const yaw = (rng() * 2 - 1) * 0.55;
    addPad(parent, tilt, yaw);
  }

  // Blossoms sit on the top rims of the highest leaf pads.
  const up = new THREE.Vector3();
  const leafPads = pads
    .filter(pad => pad.children === 0)
    .map(pad => {
      up.set(0, pad.height, 0).applyQuaternion(pad.quaternion);
      return { pad, topY: pad.position.y + up.y };
    })
    .sort((a, b) => b.topY - a.topY);
  // Unopened buds on upper leaf pads (pad-local metric coords; they render as
  // children of the pad body and tumble away with it when it breaks).
  for (const { pad } of leafPads.slice(0, Math.ceil(leafPads.length * 0.6))) {
    const budCount = rng() > 0.45 ? 1 + Math.floor(rng() * 2) : 0;
    for (let b = 0; b < budCount; b += 1) {
      const u = (rng() * 2 - 1) * 0.5;
      pad.buds.push({
        x: u * 0.36 * pad.width,
        y: pad.height * (0.9 - Math.abs(u) * 0.14),
        z: 0,
        scale: pad.width * (0.075 + rng() * 0.035),
      });
    }
  }

  const flowers = [];
  const blossoms = Math.min(Math.max(0, Math.round(flowerCount)), leafPads.length, 3);
  for (let i = 0; i < blossoms; i += 1) {
    const host = leafPads[i].pad;
    const position = new THREE.Vector3((rng() * 2 - 1) * 0.12 * host.width, host.height * 0.94, 0)
      .applyQuaternion(host.quaternion)
      .add(host.position);
    const quaternion = host.quaternion.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rng() * 2 - 1) * 0.3));
    flowers.push({
      id: `flower-${i}`,
      padId: host.id,
      position,
      quaternion,
      scale: host.width * FLOWER_DIAMETER_RATIO,
      mass: 0.12,
    });
  }

  return { pads, flowers };
}

// Small fan of dry grass blades used to seat the plant in the ground.
let tuftGeometryCache = null;
export function getTuftGeometry() {
  if (tuftGeometryCache) return tuftGeometryCache;
  const positions = [];
  const blades = 7;
  const origin = new THREE.Vector3(0, 0, 0);
  const dir = new THREE.Vector3();
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + seededUnit('tuft', i * 3 + 1) * 0.8;
    const lean = 0.35 + seededUnit('tuft', i * 3 + 2) * 0.5;
    dir.set(Math.cos(angle) * lean, 1, Math.sin(angle) * lean).normalize();
    pushSpike(positions, origin, dir, 0.012, 0.14 + seededUnit('tuft', i * 3 + 3) * 0.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  tuftGeometryCache = geometry;
  return geometry;
}

// Static ground dressing around a plant: scattered basalt pebbles, dry
// tufts, and (usually) one dried fallen pad. Deterministic per site; offsets
// are plant-local XZ.
export function buildSiteDressing({ seed, size = 1 }) {
  const rng = makeRng(`prickly-pear-dressing:${seed}`);
  const pebbles = [];
  const pebbleCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < pebbleCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = (0.22 + rng() * 0.4) * size;
    pebbles.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      scale: 0.03 + rng() * 0.05,
      stretch: [0.8 + rng() * 0.6, 0.5 + rng() * 0.35, 0.8 + rng() * 0.6],
      yaw: rng() * Math.PI * 2,
      sink: 0.35 + rng() * 0.25,
    });
  }
  const tufts = [];
  const tuftCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < tuftCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = (0.28 + rng() * 0.35) * size;
    tufts.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      scale: (0.7 + rng() * 0.7) * size,
      yaw: rng() * Math.PI * 2,
    });
  }
  const fallenPad = rng() > 0.35
    ? {
      x: (rng() * 2 - 1) * 0.45 * size,
      z: (rng() * 2 - 1) * 0.45 * size,
      yaw: rng() * Math.PI * 2,
      width: 0.2 * size * (0.8 + rng() * 0.4),
      height: 0.3 * size * (0.8 + rng() * 0.4),
      sink: 0.4,
    }
    : null;
  return {
    pebbles,
    tufts,
    fallenPad,
  };
}

// Collider half-extents + local center offset for a pad rigid body. Basal
// pads get a fattened depth so the plant's trunk blocks the player capsule
// instead of letting it knife between thin slabs.
export function padColliderSpec(pad) {
  const depth = pad.width * PAD_THICKNESS_RATIO * 0.62;
  return {
    halfExtents: [
      pad.width * 0.46,
      pad.height * 0.47,
      pad.generation === 0 ? Math.max(depth, 0.12) : depth,
    ],
    offset: [0, pad.height * 0.5, 0],
  };
}

// Hammer blows a pad absorbs before snapping off: the woody basal pads are
// tough, outer pads part easily.
export function padHitPoints(pad) {
  if (pad.generation === 0) return 3;
  if (pad.generation === 1) return 2;
  return 1;
}
