import * as THREE from 'three';
import { elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';
import { GRASS_HYBRID_TEST, hybridGrassPathInfo } from './path';

export function hybridGrassHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.024 - 7.5, z * 0.028 + 3.0) * 0.62;
  const roll = Math.sin(x * 0.055 + z * 0.032) * 0.16 + Math.sin(z * 0.049 - 1.2) * 0.18;
  const edge = Math.max(Math.abs(x) / 40, Math.abs(z) / 40);
  const rim = Math.max(0, edge - 0.68) * 0.95;
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.024 : 0.12);
  const path = hybridGrassPathInfo(x, z);
  return 0.26 + broad + roll + rim + fine - path.tread * 0.1 - path.center * 0.06;
}

export function hybridGrassBiomeAt(x, z, y = hybridGrassHeight(x, z)) {
  const path = hybridGrassPathInfo(x, z);
  if (path.center > 0.24) return 'red-dirt-path';
  if (path.shoulder > 0.34) return 'trampled-grass-edge';
  if (y < 0.08 && terrainSurfaceNoise(x * 0.7, z * 0.7) > 0.16) return 'dark-underbrush';
  if (Math.max(Math.abs(x) / 40, Math.abs(z) / 40) > 0.74) return 'dry-meadow-rise';
  return 'hybrid-meadow';
}

export function hybridGrassColor(x, z, y) {
  const biome = hybridGrassBiomeAt(x, z, y);
  const path = hybridGrassPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.34 - 5.0, z * 0.34 + 2.0) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.8 + 2.0, z * 1.6 - 8.0) * 0.5 + 0.5;
  const color = new THREE.Color('#355833');
  color.lerp(new THREE.Color('#657a3d'), broad * 0.28);
  color.lerp(new THREE.Color('#203b24'), (1 - broad) * 0.2);
  color.lerp(new THREE.Color('#7d7440'), fine * 0.08);
  if (biome === 'dark-underbrush') color.lerp(new THREE.Color('#1e422d'), 0.34);
  if (biome === 'dry-meadow-rise') color.lerp(new THREE.Color('#6f6c3e'), 0.22);
  if (biome === 'trampled-grass-edge') color.lerp(new THREE.Color('#6b5b32'), 0.3 + path.shoulder * 0.34);
  if (biome === 'red-dirt-path') {
    color.lerp(new THREE.Color('#8c3519'), 0.72 + path.tread * 0.18);
    color.lerp(new THREE.Color('#35140b'), path.center * 0.28);
  }
  color.multiplyScalar(0.82 + fine * 0.12);
  return color;
}

export function isHybridGrassWalkable(x, z, config) {
  return Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
}

export const grassHybridTestRegion = {
  id: GRASS_HYBRID_TEST,
  aliases: ['grass-hybrid-test', 'hybrid-grass-test'],
  terrain: {
    height: hybridGrassHeight,
    movementHeight: (x, z) => hybridGrassHeight(x, z, { movementSurface: true }),
    biomeAt: hybridGrassBiomeAt,
    color: hybridGrassColor,
    isWalkable: isHybridGrassWalkable,
    defaultSpawn: [-4, 0, 7],
  },
};
