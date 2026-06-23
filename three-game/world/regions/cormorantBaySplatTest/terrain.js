import * as THREE from 'three';
import { WATER_LEVEL, crackNoise, elevationNoise, ellipseDistance, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

export const CORMORANT_BAY_SPLAT_TEST = 'CORMORANT_BAY_SPLAT_TEST';

export function cormorantCoastZ(x) {
  return -22 + Math.sin(x * 0.052 + 0.6) * 3.6 + Math.sin(x * 0.021 - 1.4) * 2.4;
}

export function cormorantLagoonField(x, z) {
  const north = ellipseDistance(x, z, 28, 14, -8, -1);
  const south = ellipseDistance(x, z, 20, 10, 14, 7);
  return Math.min(north, south);
}

export function cormorantTrailDistance(x, z) {
  const points = [[-38, 25], [-24, 14], [-8, 10], [10, 15], [31, 27]];
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lenSq, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
  }
  return best + terrainSurfaceNoise(x * 0.55 + 4, z * 0.55 - 7) * 0.32;
}

export function cormorantRimMask(x, z) {
  const north = THREE.MathUtils.smoothstep(-z, 17, 41);
  const east = THREE.MathUtils.smoothstep(x, 31, 51);
  const west = THREE.MathUtils.smoothstep(-x, 42, 55);
  const broken = 0.78 + terrainSurfaceNoise(x * 0.22 - 9, z * 0.24 + 3) * 0.22;
  return THREE.MathUtils.clamp(Math.max(north, Math.max(east * 0.75, west * 0.62)) * broken, 0, 1);
}

export function cormorantBayHeight(x, z, { movementSurface = false } = {}) {
  const coast = cormorantCoastZ(x);
  const shoreD = z - coast;
  const lagoon = cormorantLagoonField(x, z);
  const lagoonBasin = 1 - THREE.MathUtils.smoothstep(lagoon, 0.68, 1.08);
  const lagoonEdge = 1 - THREE.MathUtils.smoothstep(lagoon, 1.0, 1.38);
  const trail = 1 - THREE.MathUtils.smoothstep(cormorantTrailDistance(x, z), 1.4, 4.8);
  const rim = cormorantRimMask(x, z);

  let y = -0.1 + elevationNoise(x * 0.032 - 8, z * 0.034 + 2) * 0.42;
  y += THREE.MathUtils.smoothstep(shoreD, 0, 26) * 0.9;
  y += rim * (1.2 + Math.abs(crackNoise(x * 0.25 + 5, z * 0.23 - 3)) * (movementSurface ? 0.1 : 0.45));
  y -= lagoonBasin * 1.35;
  y -= lagoonEdge * 0.24;
  y -= trail * 0.1;
  y += terrainFineDetail(x, z) * (movementSurface ? 0.04 : 0.22);

  // Keep open-ocean side underwater; the visible Cormorant scene is the lagoon
  // and olivine shore, not a surf traversal test.
  if (shoreD < -2) y = Math.min(y, WATER_LEVEL - 0.25 + shoreD * 0.06);
  return Math.max(-2.45, y);
}

export function cormorantBayBiomeAt(x, z, y = cormorantBayHeight(x, z)) {
  const shoreD = z - cormorantCoastZ(x);
  const lagoon = cormorantLagoonField(x, z);
  const trail = cormorantTrailDistance(x, z);
  if (y < WATER_LEVEL - 0.72) return 'deep-lagoon';
  if (lagoon < 1.2 && y < WATER_LEVEL - 0.16) return 'brackish-lagoon';
  if (lagoon < 1.42) return 'wet-mud';
  if (trail < 3.2) return 'olivine-trail';
  if (shoreD < 6 && y > WATER_LEVEL - 0.1) return 'green-beach';
  if (cormorantRimMask(x, z) > 0.48) return 'tuff-rim';
  return 'salt-scrub';
}

export function cormorantBayColor(x, z, y) {
  const biome = cormorantBayBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color('#7a7d4a');
  if (biome === 'deep-lagoon') color.set('#2a4a43');
  else if (biome === 'brackish-lagoon') color.set('#496a58');
  else if (biome === 'wet-mud') color.set('#4f4935');
  else if (biome === 'olivine-trail') color.set('#7f7a4b');
  else if (biome === 'green-beach') color.set('#8c9157');
  else if (biome === 'tuff-rim') color.set('#755c43');
  else color.set('#6f7547');
  color.lerp(new THREE.Color('#253f2c'), Math.max(0, -noise) * 0.22);
  color.lerp(new THREE.Color('#a59658'), Math.max(0, noise) * 0.18);
  color.multiplyScalar(0.9 + noise * 0.08);
  return color;
}

export function isCormorantBayWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = cormorantBayHeight(x, z, { movementSurface: true });
  if (cormorantLagoonField(x, z) < 1.16 && y < WATER_LEVEL - 0.05) return false;
  return y > WATER_LEVEL - 0.28;
}

export const cormorantBaySplatTestRegion = {
  id: CORMORANT_BAY_SPLAT_TEST,
  aliases: ['cormorant-bay-splat-test'],
  terrain: {
    height: cormorantBayHeight,
    movementHeight: (x, z) => cormorantBayHeight(x, z, { movementSurface: true }),
    biomeAt: cormorantBayBiomeAt,
    color: cormorantBayColor,
    isWalkable: isCormorantBayWalkable,
    defaultSpawn: [-30, 0, 24],
  },
};
