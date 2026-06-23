import * as THREE from 'three';
import { crackNoise, elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// Western Highlands (W_HIGH) - humid Floreana cloud forest.
// The map is built around a legible north/south field trail through dense
// Scalesia/manzanillo growth, with misty clearings and damp boulder shelves.

export const WESTERN_HIGHLANDS_TRAIL = [
  [1.5, -43],
  [-5.5, -33],
  [-2.2, -22],
  [7.5, -12],
  [3.0, -1],
  [-8.5, 9],
  [-3.5, 20],
  [8.0, 31],
  [2.5, 43],
];

const CLEARINGS = [
  { x: 6, z: -18, rx: 12, rz: 8, strength: 1.0 },
  { x: -8, z: 11, rx: 10, rz: 7, strength: 0.82 },
  { x: 8, z: 33, rx: 11, rz: 8, strength: 0.72 },
];

function pointSegmentDistance(x, z, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lengthSq, 0, 1);
  const px = ax + abx * t;
  const pz = az + abz * t;
  return Math.hypot(x - px, z - pz);
}

export function westernHighlandsTrailInfluence(x, z, inner = 1.45, outer = 5.2) {
  let d = Infinity;
  for (let index = 0; index < WESTERN_HIGHLANDS_TRAIL.length - 1; index += 1) {
    const [ax, az] = WESTERN_HIGHLANDS_TRAIL[index];
    const [bx, bz] = WESTERN_HIGHLANDS_TRAIL[index + 1];
    d = Math.min(d, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const wobble = terrainSurfaceNoise(x * 0.7 + 4, z * 0.7 - 8) * 0.42;
  return 1 - THREE.MathUtils.smoothstep(d + wobble, inner, outer);
}

export function westernHighlandsClearingMask(x, z) {
  let value = 0;
  for (const clearing of CLEARINGS) {
    const dx = (x - clearing.x) / clearing.rx;
    const dz = (z - clearing.z) / clearing.rz;
    value = Math.max(value, Math.exp(-(dx * dx + dz * dz) * 2.1) * clearing.strength);
  }
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function westernHighlandsWetHollowMask(x, z) {
  const streamX = Math.sin(z * 0.115 + 0.8) * 8.5 - 10.5 + Math.sin(z * 0.31) * 2.2;
  const stream = Math.exp(-Math.pow((x - streamX) / 5.2, 2));
  const lowerBench = THREE.MathUtils.smoothstep(z, -38, -10) * (1 - THREE.MathUtils.smoothstep(z, 18, 35));
  const pocket = Math.exp(-Math.pow((x + 18) / 13, 2) - Math.pow((z - 4) / 18, 2));
  return THREE.MathUtils.clamp(Math.max(stream * lowerBench, pocket * 0.75), 0, 1);
}

export function westernHighlandsCanopyMask(x, z) {
  const trail = westernHighlandsTrailInfluence(x, z, 1.4, 6.4);
  const clearing = westernHighlandsClearingMask(x, z);
  const edge = Math.max(Math.abs(x) / 50, Math.abs(z) / 46);
  const edgeFade = 1 - THREE.MathUtils.smoothstep(edge, 0.86, 1.02);
  const noise = terrainSurfaceNoise(x * 0.34 + 7, z * 0.34 - 2);
  return THREE.MathUtils.clamp((0.74 + noise * 0.24) * edgeFade * (1 - trail * 0.72) * (1 - clearing * 0.84), 0, 1);
}

function ridgeMask(x, z) {
  const west = Math.exp(-Math.pow((x + 38) / 14, 2)) * (0.7 + Math.sin(z * 0.09) * 0.22);
  const east = Math.exp(-Math.pow((x - 34) / 16, 2)) * (0.62 + Math.cos(z * 0.08) * 0.2);
  const south = THREE.MathUtils.smoothstep(z, 21, 45) * 0.65;
  return THREE.MathUtils.clamp(Math.max(west, east, south), 0, 1);
}

export function westernHighlandsHeight(x, z, { movementSurface = false } = {}) {
  const nx = x * 0.035;
  const nz = z * 0.037;
  const broad = elevationNoise(nx + 7, nz - 4);
  const medium = elevationNoise(x * 0.075 - 11, z * 0.071 + 5);
  const trail = westernHighlandsTrailInfluence(x, z);
  const clearing = westernHighlandsClearingMask(x, z);
  const wet = westernHighlandsWetHollowMask(x, z);
  const ridge = ridgeMask(x, z);

  let y = 3.05
    + broad * 1.95
    + medium * 0.82
    + ridge * 2.25
    + THREE.MathUtils.smoothstep(z, 22, 46) * 1.2;

  // Trails and clearings are slightly trampled into the forest floor.
  y -= trail * 0.32;
  y -= clearing * 0.18;
  y -= wet * 0.42;

  // Mossy lava shelves: visible relief, but movement receives a smoother
  // version so Darwin does not jitter through the forest.
  const shelf = Math.max(0, crackNoise(x * 0.12 + 4, z * 0.14 - 9));
  y += ridge * shelf * (movementSurface ? 0.18 : 0.55);
  y += terrainFineDetail(x, z) * (movementSurface ? 0.16 : 0.52);
  return Math.max(0.05, y);
}

export function westernHighlandsBiomeAt(x, z, y = westernHighlandsHeight(x, z)) {
  const trail = westernHighlandsTrailInfluence(x, z);
  if (trail > 0.58) return 'mud-trail';
  const clearing = westernHighlandsClearingMask(x, z);
  if (clearing > 0.46) return 'fern-clearing';
  const wet = westernHighlandsWetHollowMask(x, z);
  if (wet > 0.58) return 'wet-hollow';
  const ridge = ridgeMask(x, z);
  if (ridge > 0.58 && y > 4.2) return 'mossy-ridge';
  const canopy = westernHighlandsCanopyMask(x, z);
  if (canopy > 0.58) return 'scalesia-forest';
  return 'humid-understory';
}

export function westernHighlandsColor(x, z, y) {
  const biome = westernHighlandsBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'mud-trail') color.set('#4d4636');
  else if (biome === 'fern-clearing') color.set('#52643e');
  else if (biome === 'wet-hollow') color.set('#303d34');
  else if (biome === 'mossy-ridge') color.set('#4a5843');
  else if (biome === 'scalesia-forest') color.set('#394b34');
  else color.set('#46553a');

  color.lerp(new THREE.Color('#20261f'), westernHighlandsCanopyMask(x, z) * 0.32);
  color.lerp(new THREE.Color('#6f7652'), Math.max(0, noise) * 0.22);
  color.lerp(new THREE.Color('#27342d'), westernHighlandsWetHollowMask(x, z) * 0.38);
  return color;
}

export function isWesternHighlandsWalkable(x, z, config) {
  const margin = 1.8;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const slope = (() => {
    const step = 0.85;
    const left = westernHighlandsHeight(x - step, z, { movementSurface: true });
    const right = westernHighlandsHeight(x + step, z, { movementSurface: true });
    const back = westernHighlandsHeight(x, z - step, { movementSurface: true });
    const forward = westernHighlandsHeight(x, z + step, { movementSurface: true });
    return Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  })();
  return slope < 0.92 || westernHighlandsTrailInfluence(x, z) > 0.34;
}

export const westernHighlandsRegion = {
  id: 'W_HIGH',
  aliases: [],
  terrain: {
    height: westernHighlandsHeight,
    movementHeight: (x, z) => westernHighlandsHeight(x, z, { movementSurface: true }),
    biomeAt: westernHighlandsBiomeAt,
    color: westernHighlandsColor,
    isWalkable: isWesternHighlandsWalkable,
  },
};
