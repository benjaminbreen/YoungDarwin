import * as THREE from 'three';
import { elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';
import { grassTestPathInfo } from './path';

export const GRASS_TEST = 'GRASS_TEST';

export function grassTestHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.028 + 4.2, z * 0.03 - 8.5) * 0.78;
  const roll = Math.sin(x * 0.075 + z * 0.035) * 0.18 + Math.sin(z * 0.066 - 1.4) * 0.14;
  const edge = Math.max(Math.abs(x) / 38, Math.abs(z) / 38);
  const rim = Math.max(0, edge - 0.66) * 1.25;
  const fine = movementSurface ? terrainFineDetail(x, z) * 0.035 : terrainFineDetail(x, z) * 0.22;
  const path = grassTestPathInfo(x, z);
  const compacted = path.tread * 0.11 + path.center * 0.055;
  return 0.36 + broad + roll + rim + fine - compacted;
}

export function grassTestBiomeAt(x, z, y = grassTestHeight(x, z)) {
  const path = grassTestPathInfo(x, z);
  if (path.center > 0.28) return 'dirt-path';
  if (path.shoulder > 0.42) return 'path-shoulder';
  const low = y < 0.2;
  if (low && terrainSurfaceNoise(x * 0.8, z * 0.8) > 0.28) return 'lush-hollow';
  if (Math.max(Math.abs(x) / 38, Math.abs(z) / 38) > 0.72) return 'meadow-rise';
  return 'grass-meadow';
}

export function grassTestColor(x, z, y) {
  const biome = grassTestBiomeAt(x, z, y);
  const path = grassTestPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.42 + 3.0, z * 0.42 - 6.0) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 2.2 - 9.0, z * 2.0 + 4.0) * 0.5 + 0.5;
  const color = new THREE.Color('#3f6034');
  color.lerp(new THREE.Color('#6f823f'), broad * 0.28);
  color.lerp(new THREE.Color('#263f25'), (1 - broad) * 0.22);
  color.lerp(new THREE.Color('#817d45'), fine * 0.08);
  if (biome === 'lush-hollow') color.lerp(new THREE.Color('#3f7241'), 0.3);
  if (biome === 'meadow-rise') color.lerp(new THREE.Color('#777646'), 0.18);
  if (biome === 'path-shoulder') color.lerp(new THREE.Color('#665f36'), 0.34 + path.shoulder * 0.32);
  if (biome === 'dirt-path') {
    color.lerp(new THREE.Color('#6f2d17'), 0.72 + path.center * 0.16);
    color.lerp(new THREE.Color('#28120b'), path.center * 0.34);
    color.lerp(new THREE.Color('#b45728'), fine * 0.14);
  }
  color.multiplyScalar(0.82 + fine * 0.12);
  return color;
}

export function isGrassTestWalkable(x, z, config) {
  return Math.abs(x) <= config.width * 0.5 - 1.1 && Math.abs(z) <= config.depth * 0.5 - 1.1;
}

export const grassTestRegion = {
  id: GRASS_TEST,
  aliases: ['grass-test', 'grass-test-field'],
  terrain: {
    height: grassTestHeight,
    movementHeight: (x, z) => grassTestHeight(x, z, { movementSurface: true }),
    biomeAt: grassTestBiomeAt,
    color: grassTestColor,
    isWalkable: isGrassTestWalkable,
    defaultSpawn: [0, 0, 6],
  },
};
