import * as THREE from 'three';
import { crackNoise, elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// Southern Forest (MANGROVES) - brackish mangrove/fern forest testbed.
// Built as a narrow, occluded trail system so the streaming ecology renderer
// can load a small foreground ring first, then richer forest cells after play.

export const MANGROVE_TRAIL = [
  [-4, -42],
  [6, -31],
  [-7, -18],
  [1, -6],
  [-10, 7],
  [-3, 20],
  [10, 32],
  [2, 43],
];

const POOLS = [
  { x: -22, z: -24, rx: 13, rz: 8, strength: 1.0 },
  { x: 20, z: -5, rx: 15, rz: 10, strength: 0.86 },
  { x: -18, z: 24, rx: 13, rz: 9, strength: 0.9 },
  { x: 26, z: 31, rx: 10, rz: 7, strength: 0.62 },
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

export function mangroveTrailInfluence(x, z, inner = 1.35, outer = 5.4) {
  let d = Infinity;
  for (let index = 0; index < MANGROVE_TRAIL.length - 1; index += 1) {
    const [ax, az] = MANGROVE_TRAIL[index];
    const [bx, bz] = MANGROVE_TRAIL[index + 1];
    d = Math.min(d, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const wobble = terrainSurfaceNoise(x * 0.65 + 2, z * 0.7 - 6) * 0.38;
  return 1 - THREE.MathUtils.smoothstep(d + wobble, inner, outer);
}

export function mangrovePoolMask(x, z) {
  let value = 0;
  for (const pool of POOLS) {
    const dx = (x - pool.x) / pool.rx;
    const dz = (z - pool.z) / pool.rz;
    value = Math.max(value, Math.exp(-(dx * dx + dz * dz) * 2.25) * pool.strength);
  }
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function mangroveRootWallMask(x, z) {
  const trail = mangroveTrailInfluence(x, z, 1.4, 7.2);
  const pool = mangrovePoolMask(x, z);
  const edge = Math.max(Math.abs(x) / 50, Math.abs(z) / 46);
  const edgeFade = 1 - THREE.MathUtils.smoothstep(edge, 0.88, 1.04);
  const noise = terrainSurfaceNoise(x * 0.32 - 9, z * 0.33 + 4);
  return THREE.MathUtils.clamp((0.68 + noise * 0.28) * edgeFade * (1 - trail * 0.64) * (1 - pool * 0.38), 0, 1);
}

export function mangroveFernBenchMask(x, z) {
  const trailEdge = mangroveTrailInfluence(x, z, 2.2, 9.5);
  const poolEdge = mangrovePoolMask(x, z);
  return THREE.MathUtils.clamp(Math.max(trailEdge * 0.76, poolEdge * 0.65), 0, 1);
}

export function mangroveHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.034 - 12, z * 0.038 + 5);
  const medium = elevationNoise(x * 0.085 + 4, z * 0.08 - 8);
  const trail = mangroveTrailInfluence(x, z);
  const pool = mangrovePoolMask(x, z);
  const rootWall = mangroveRootWallMask(x, z);

  let y = 0.72 + broad * 0.78 + medium * 0.32;
  y += THREE.MathUtils.smoothstep(z, 20, 46) * 0.55;
  y += rootWall * 0.38;
  y -= trail * 0.22;
  y -= pool * 2.25;

  const rootRidges = Math.max(0, crackNoise(x * 0.18 + 6, z * 0.2 - 3));
  y += rootWall * rootRidges * (movementSurface ? 0.08 : 0.32);
  y += terrainFineDetail(x, z) * (movementSurface ? 0.08 : 0.28);
  return Math.max(-1.28, y);
}

export function mangroveBiomeAt(x, z, y = mangroveHeight(x, z)) {
  const pool = mangrovePoolMask(x, z);
  if (pool > 0.38 && y < -0.38) return 'brackish-pool';
  const trail = mangroveTrailInfluence(x, z);
  if (trail > 0.56) return 'mud-trail';
  if (pool > 0.28) return 'pool-edge';
  const fern = mangroveFernBenchMask(x, z);
  if (fern > 0.5) return 'fern-bank';
  const rootWall = mangroveRootWallMask(x, z);
  if (rootWall > 0.52) return 'mangrove-root-wall';
  return 'humid-leaf-litter';
}

export function mangroveColor(x, z, y) {
  const biome = mangroveBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'brackish-pool') color.set('#263b35');
  else if (biome === 'mud-trail') color.set('#3a3327');
  else if (biome === 'pool-edge') color.set('#354133');
  else if (biome === 'fern-bank') color.set('#42583b');
  else if (biome === 'mangrove-root-wall') color.set('#293425');
  else color.set('#394735');

  color.lerp(new THREE.Color('#1f2722'), mangroveRootWallMask(x, z) * 0.34);
  color.lerp(new THREE.Color('#68734a'), Math.max(0, noise) * 0.18);
  color.lerp(new THREE.Color('#202b27'), mangrovePoolMask(x, z) * 0.36);
  return color;
}

export function isMangroveWalkable(x, z, config) {
  const margin = 1.8;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const y = mangroveHeight(x, z, { movementSurface: true });
  const trail = mangroveTrailInfluence(x, z, 1.15, 8.2);
  const fern = mangroveFernBenchMask(x, z);
  const pool = mangrovePoolMask(x, z);
  const rootWall = mangroveRootWallMask(x, z);

  if (y < -0.88 && trail < 0.36) return false;
  if (rootWall > 0.62 && trail < 0.18 && fern < 0.34) return false;
  const step = 0.85;
  const left = mangroveHeight(x - step, z, { movementSurface: true });
  const right = mangroveHeight(x + step, z, { movementSurface: true });
  const back = mangroveHeight(x, z - step, { movementSurface: true });
  const forward = mangroveHeight(x, z + step, { movementSurface: true });
  const slope = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  const corridor = trail > 0.12 || (fern > 0.31 && pool < 0.64);
  return corridor && slope < 0.72;
}

export const mangroveRegion = {
  id: 'MANGROVES',
  aliases: [],
  terrain: {
    height: mangroveHeight,
    movementHeight: (x, z) => mangroveHeight(x, z, { movementSurface: true }),
    biomeAt: mangroveBiomeAt,
    color: mangroveColor,
    isWalkable: isMangroveWalkable,
  },
};
