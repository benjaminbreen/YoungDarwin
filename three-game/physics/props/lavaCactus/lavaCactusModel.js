// Procedural lava cactus (Brachycereus nesioticus): pure geometry/material/
// graph builder shared by the destructible field component. The plant is a
// clump of short upright finger-columns radiating from a common base — young
// columns yellow-green and furred in pale golden bristles, aging to grey-
// brown — so every column (and the rare cream flower) becomes its own rigid
// body, generated as pieces rather than a single mesh.

import * as THREE from 'three';
import { makeRng, pushSpike, seededUnit } from '../breakablePlant/plantGeoUtils';

// --- Visual tuning knobs ---------------------------------------------------
export const COLUMN_TINTS_YOUNG = ['#a9b352', '#98a54b', '#b4bd5f'];
export const COLUMN_TINTS_OLD = ['#7b7163', '#6e655a', '#867d6e'];
export const COLUMN_ROUGHNESS_YOUNG = 0.78;
export const COLUMN_ROUGHNESS_OLD = 0.9;
// Vertex-shade multipliers over the material tint: shadowed base, mid stem,
// and the pale golden new-growth glow at the tip.
export const COLUMN_BASE_SHADE = [0.52, 0.5, 0.44];
export const COLUMN_MID_SHADE = [0.94, 0.96, 0.86];
export const COLUMN_TIP_SHADE = [1.16, 1.18, 0.82];
export const COLUMN_MOTTLE = 0.1; // +/- per-vertex brightness jitter
export const RIB_SHADE = 0.07; // crest/valley brightness swing across ribs
export const SPINE_COLOR_YOUNG = '#e6d79c';
export const SPINE_COLOR_OLD = '#57504a';
export const FLOWER_PETAL_COLOR = '#f4ecd2';
export const FLOWER_CENTER_COLOR = '#dfb04c';
export const OLD_AGE_THRESHOLD = 0.55; // age above this renders grey/woody

const COLUMN_DENSITY = 480; // kg/m^3-ish, light pulpy stems

// Column silhouette variants: rib count and profile jitter so clumps aren't
// built from one repeated finger.
export const COLUMN_VARIANTS = [
  { ribs: 8, swell: 0.5, swellAt: 0.42, tipRadius: 0.34 },
  { ribs: 9, swell: 0.48, swellAt: 0.5, tipRadius: 0.37 },
  { ribs: 10, swell: 0.5, swellAt: 0.36, tipRadius: 0.32 },
];

// Unit column radius at normalized height t in [0, 1]: slightly pinched
// base, gentle mid swell, taper, then a domed cap.
function columnRadius(t, variant) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  if (clamped > 0.9) {
    // Dome: quarter-circle falloff from the taper radius to the tip.
    const capT = (clamped - 0.9) / 0.1;
    return Math.max(variant.tipRadius * Math.sqrt(Math.max(0, 1 - capT * capT)), 0.01);
  }
  const swell = Math.sin(Math.PI * Math.pow(clamped / 0.9, 0.85));
  const base = 0.4 + (variant.swell - 0.4) * Math.pow(swell, 0.7);
  const taper = 1 - Math.max(0, (clamped - variant.swellAt) / (0.9 - variant.swellAt)) * (1 - variant.tipRadius / variant.swell);
  return base * taper;
}

// --- Shared geometries (unit column: height 1, max radius 0.5, base y=0) ---

const columnGeometryCache = new Map();
export function getColumnGeometry(variantIndex = 0) {
  const index = ((variantIndex | 0) % COLUMN_VARIANTS.length + COLUMN_VARIANTS.length) % COLUMN_VARIANTS.length;
  if (columnGeometryCache.has(index)) return columnGeometryCache.get(index);
  const variant = COLUMN_VARIANTS[index];
  const points = [];
  const rings = 22;
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    points.push(new THREE.Vector2(columnRadius(t, variant), t));
  }
  const geometry = new THREE.LatheGeometry(points, 18);

  // Ribs: radial ripple fading out over the cap dome.
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp(positions.getY(i), 0, 1);
    const angle = Math.atan2(z, x);
    const fade = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.13) : 1;
    const factor = 1 + 0.05 * Math.cos(angle * variant.ribs) * fade;
    positions.setX(i, x * factor);
    positions.setZ(i, z * factor);
  }
  geometry.computeVertexNormals();

  // Vertex shading: dark base rising to waxy mid flesh, pale golden glow at
  // the growing tip, darkened rib valleys, and hash mottle. Stored as
  // multipliers over the material tint so young/old columns share geometry.
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color(...COLUMN_BASE_SHADE);
  const mid = new THREE.Color(...COLUMN_MID_SHADE);
  const tip = new THREE.Color(...COLUMN_TIP_SHADE);
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp(y, 0, 1);
    shade.copy(base).lerp(mid, THREE.MathUtils.smoothstep(t, 0.03, 0.38));
    shade.lerp(tip, THREE.MathUtils.smoothstep(t, 0.7, 0.96));
    const angle = Math.atan2(z, x);
    const rib = 1 + RIB_SHADE * Math.cos(angle * variant.ribs);
    const mottle = 1 + (seededUnit(`${x.toFixed(3)}:${y.toFixed(3)}:${z.toFixed(3)}`, 9) - 0.5) * 2 * COLUMN_MOTTLE;
    colors[i * 3] = shade.r * rib * mottle;
    colors[i * 3 + 1] = shade.g * rib * mottle;
    colors[i * 3 + 2] = shade.b * rib * mottle;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  columnGeometryCache.set(index, geometry);
  return geometry;
}

// Dense fine bristles in rings along the column, riding the rib crests, plus
// a longer crown at the tip — the golden fur that makes the plant.
const columnSpineGeometryCache = new Map();
export function getColumnSpineGeometry(variantIndex = 0) {
  const index = ((variantIndex | 0) % COLUMN_VARIANTS.length + COLUMN_VARIANTS.length) % COLUMN_VARIANTS.length;
  if (columnSpineGeometryCache.has(index)) return columnSpineGeometryCache.get(index);
  const variant = COLUMN_VARIANTS[index];
  const positions = [];
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const rows = 8;
  for (let row = 0; row < rows; row += 1) {
    const t = 0.09 + (row / (rows - 1)) * 0.8;
    const radius = columnRadius(t, variant);
    for (let ribIndex = 0; ribIndex < variant.ribs; ribIndex += 1) {
      const seed = `lava-spine:${index}:${row}:${ribIndex}`;
      // Areoles sit on rib crests, staggered row to row.
      const angle = ((ribIndex + (row % 2) * 0.5) / variant.ribs) * Math.PI * 2
        + (seededUnit(seed, 1) - 0.5) * 0.14;
      origin.set(Math.cos(angle) * radius * 1.04, t, Math.sin(angle) * radius * 1.04);
      const spikes = 2 + Math.floor(seededUnit(seed, 2) * 2);
      for (let s = 0; s < spikes; s += 1) {
        dir.set(
          Math.cos(angle) + (seededUnit(seed, 3 + s * 3) - 0.5) * 0.9,
          0.3 + (seededUnit(seed, 4 + s * 3) - 0.5) * 0.5,
          Math.sin(angle) + (seededUnit(seed, 5 + s * 3) - 0.5) * 0.9,
        );
        pushSpike(positions, origin, dir, 0.006, 0.05 + seededUnit(seed, 6 + s * 3) * 0.045);
      }
    }
  }
  // Tip crown: longer bristles splayed up and out around the dome.
  for (let i = 0; i < 7; i += 1) {
    const seed = `lava-crown:${index}:${i}`;
    const angle = (i / 7) * Math.PI * 2 + seededUnit(seed, 1) * 0.5;
    const radius = columnRadius(0.93, variant);
    origin.set(Math.cos(angle) * radius * 0.8, 0.94, Math.sin(angle) * radius * 0.8);
    dir.set(Math.cos(angle) * 0.7, 1, Math.sin(angle) * 0.7);
    pushSpike(positions, origin, dir, 0.007, 0.09 + seededUnit(seed, 2) * 0.05);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  columnSpineGeometryCache.set(index, geometry);
  return geometry;
}

// --- Materials (module cache, shared across all plants) --------------------

let materialsCache = null;
export function getLavaCactusMaterials() {
  if (materialsCache) return materialsCache;
  materialsCache = {
    columnsYoung: COLUMN_TINTS_YOUNG.map(tint => new THREE.MeshStandardMaterial({
      color: tint,
      roughness: COLUMN_ROUGHNESS_YOUNG,
      metalness: 0,
      vertexColors: true,
    })),
    columnsOld: COLUMN_TINTS_OLD.map(tint => new THREE.MeshStandardMaterial({
      color: tint,
      roughness: COLUMN_ROUGHNESS_OLD,
      metalness: 0,
      vertexColors: true,
    })),
    spinesYoung: new THREE.MeshStandardMaterial({
      color: SPINE_COLOR_YOUNG,
      roughness: 0.85,
      metalness: 0,
    }),
    spinesOld: new THREE.MeshStandardMaterial({
      color: SPINE_COLOR_OLD,
      roughness: 0.92,
      metalness: 0,
    }),
    petal: new THREE.MeshStandardMaterial({
      color: FLOWER_PETAL_COLOR,
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    center: new THREE.MeshStandardMaterial({
      color: FLOWER_CENTER_COLOR,
      roughness: 0.72,
      metalness: 0,
    }),
    deadColumn: new THREE.MeshStandardMaterial({
      color: '#8d8377',
      roughness: 0.95,
      metalness: 0,
      vertexColors: true,
    }),
    clinker: new THREE.MeshStandardMaterial({
      color: '#2f2b26',
      roughness: 0.97,
      metalness: 0,
      flatShading: true,
    }),
  };
  return materialsCache;
}

// --- Plant graph builder ----------------------------------------------------
// Returns columns/flowers in plant-local space (origin at the ground under
// the clump center, +Y up). Positions are the piece BASE attach points;
// orientation quaternions point each piece's local +Y along its growth axis.

const UP = new THREE.Vector3(0, 1, 0);

export function buildLavaCactus({ seed, size = 1, flowerCount = 0 }) {
  const rng = makeRng(`lava-cactus:${seed}`);
  const columnTarget = THREE.MathUtils.clamp(Math.round(4.5 + size * 4.5 + rng() * 3), 4, 13);
  const columns = [];

  for (let i = 0; i < columnTarget; i += 1) {
    // Golden-angle spiral: tall young columns in the clump center, shorter
    // older ones leaning outward at the rim.
    const angle = i * 2.399 + rng() * 0.7;
    const spread = Math.pow(i / Math.max(1, columnTarget - 1), 0.62);
    const radial = spread * 0.36 * size + rng() * 0.04;
    const height = Math.max(0.13, size * (0.52 - spread * 0.26) * (0.82 + rng() * 0.4));
    const radius = Math.max(0.028, height * (0.11 + rng() * 0.05));
    const age = THREE.MathUtils.clamp(rng() * 0.55 + spread * 0.5, 0, 1);
    const tilt = radial * (0.6 + rng() * 0.8) + (rng() - 0.5) * 0.06;
    // yaw -angle points local +X radially outward, so the Z-tilt leans the
    // column away from the clump center.
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, -angle + (rng() - 0.5) * 0.4)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tilt));
    columns.push({
      id: `column-${i}`,
      position: new THREE.Vector3(
        Math.cos(angle) * radial,
        -(0.02 + rng() * 0.015),
        Math.sin(angle) * radial,
      ),
      quaternion,
      height,
      radius,
      age,
      variant: Math.floor(rng() * COLUMN_VARIANTS.length),
      mass: Math.max(0.35, Math.PI * radius * radius * height * COLUMN_DENSITY),
      tone: rng(),
    });
  }

  // Flowers crown the tallest young columns.
  const flowers = [];
  const hosts = columns
    .filter(column => column.age < OLD_AGE_THRESHOLD)
    .sort((a, b) => b.height - a.height);
  const blossoms = Math.min(Math.max(0, Math.round(flowerCount)), hosts.length, 2);
  for (let i = 0; i < blossoms; i += 1) {
    const host = hosts[i];
    const position = new THREE.Vector3(0, host.height * 0.97, 0)
      .applyQuaternion(host.quaternion)
      .add(host.position);
    const quaternion = host.quaternion.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rng() * 2 - 1) * 0.25));
    flowers.push({
      id: `flower-${i}`,
      columnId: host.id,
      position,
      quaternion,
      scale: host.radius * 3.4,
      mass: 0.06,
    });
  }

  return { columns, flowers };
}

// Static ground dressing: jagged basalt clinker chunks (this plant grows on
// bare lava — no grass) and sometimes one dead grey column lying on its side.
// Deterministic per site; offsets are plant-local XZ.
export function buildLavaCactusDressing({ seed, size = 1 }) {
  const rng = makeRng(`lava-cactus-dressing:${seed}`);
  const clinker = [];
  const chunkCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < chunkCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = (0.2 + rng() * 0.45) * size;
    clinker.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      scale: 0.04 + rng() * 0.07,
      stretch: [0.7 + rng() * 0.7, 0.45 + rng() * 0.4, 0.7 + rng() * 0.7],
      yaw: rng() * Math.PI * 2,
      sink: 0.3 + rng() * 0.3,
    });
  }
  const fallenColumn = rng() > 0.45
    ? {
      x: (rng() * 2 - 1) * 0.5 * size,
      z: (rng() * 2 - 1) * 0.5 * size,
      yaw: rng() * Math.PI * 2,
      radius: 0.035 * size * (0.8 + rng() * 0.4),
      length: 0.26 * size * (0.7 + rng() * 0.5),
      variant: Math.floor(rng() * COLUMN_VARIANTS.length),
    }
    : null;
  return { clinker, fallenColumn };
}

// Collider half-extents + local center offset for a column rigid body.
export function columnColliderSpec(column) {
  const lateral = Math.max(0.03, column.radius * 0.85);
  return {
    halfExtents: [lateral, column.height * 0.47, lateral],
    offset: [0, column.height * 0.5, 0],
  };
}

// Hammer blows a column absorbs before snapping: old woody stems are tough,
// young pulpy ones part in one.
export function columnHitPoints(column) {
  return column.age > OLD_AGE_THRESHOLD ? 2 : 1;
}
