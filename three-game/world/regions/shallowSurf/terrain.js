import * as THREE from 'three';
import {
  WATER_LEVEL,
  WADE_DEPTH,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import { SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM } from '../../routeSeams';

export const SHALLOW_SURF = 'SE_SHALLOW_SURF';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function shallowSurfShelfProgress(x) {
  return clamp01((x + 48) / 96);
}

export function shallowSurfRockMask(x, z) {
  return clamp01(Math.max(
    gaussian(x, z, -32, -19, 7.5, 8.5),
    gaussian(x, z, -25, 18, 8.5, 9.5) * 0.9,
    gaussian(x, z, -8, -4, 9.5, 8) * 0.88,
    gaussian(x, z, 9, 19, 8.5, 7.5),
    gaussian(x, z, 18, -24, 9.5, 7.5) * 0.92,
    gaussian(x, z, 34, 3, 8.5, 9) * 0.76,
  ));
}

export function shallowSurfSedimentMask(x, z) {
  return clamp01(Math.max(
    gaussian(x, z, -35, 6, 15, 12),
    gaussian(x, z, -6, -23, 17, 10) * 0.8,
    gaussian(x, z, 18, 8, 16, 11) * 0.66,
  ) * (1 - shallowSurfRockMask(x, z) * 0.76));
}

export function shallowSurfHeight(x, z, { movementSurface = false } = {}) {
  const progress = shallowSurfShelfProgress(x);
  const depth = 0.66 + progress * 2.0 + progress * progress * 0.56;
  const edgeDrop = THREE.MathUtils.smoothstep(Math.abs(z), 31, 43) * 0.72;
  const rock = shallowSurfRockMask(x, z);
  const sediment = shallowSurfSedimentMask(x, z);
  const fractured = Math.max(0, crackNoise(x * 0.21 + 8, z * 0.23 - 6));
  const shelfRoll = elevationNoise(x * 0.052 - 5, z * 0.058 + 11) * 0.13;
  const detail = terrainFineDetail(x, z) * (movementSurface ? 0.025 : 0.1)
    + terrainSurfaceNoise(x * 0.54 + 4, z * 0.5 - 7) * (movementSurface ? 0.015 : 0.055);
  const rockLift = rock * (0.28 + fractured * (movementSurface ? 0.07 : 0.24));
  const sandFill = sediment * 0.12;
  return Math.max(-4.75, WATER_LEVEL - depth - edgeDrop + shelfRoll + rockLift + sandFill + detail);
}

export function shallowSurfBiomeAt(x, z, y = shallowSurfHeight(x, z)) {
  const depth = WATER_LEVEL - y;
  if (depth > WADE_DEPTH + 1.05) return 'deep-rocky-water';
  if (depth > WADE_DEPTH) return 'swim-channel';
  if (shallowSurfRockMask(x, z) > 0.44) return 'submerged-basalt-ledge';
  if (shallowSurfSedimentMask(x, z) > 0.38) return 'shallow-sediment-pocket';
  return 'wadeable-rocky-shelf';
}

export function shallowSurfColor(x, z, y) {
  const biome = shallowSurfBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.3 + 9, z * 0.27 - 4) * 0.5 + 0.5;
  const color = new THREE.Color('#2c5452');
  if (biome === 'deep-rocky-water') color.set('#0c3040');
  else if (biome === 'swim-channel') color.set('#164754');
  else if (biome === 'submerged-basalt-ledge') color.set('#294a45');
  else if (biome === 'shallow-sediment-pocket') color.set('#688076');
  else color.set('#3d655f');
  color.lerp(new THREE.Color('#738b79'), broad * (biome === 'shallow-sediment-pocket' ? 0.12 : 0.05));
  color.multiplyScalar(0.9 + broad * 0.08);
  return color;
}

export function isShallowSurfWalkable(x, z, config) {
  const margin = 1.2;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const y = shallowSurfHeight(x, z, { movementSurface: true });
  return y > WATER_LEVEL - WADE_DEPTH + 0.06;
}

export const shallowSurfRegion = {
  id: SHALLOW_SURF,
  aliases: ['shallow-surf', 'southeastern-shallow-surf'],
  terrain: {
    height: shallowSurfHeight,
    movementHeight: (x, z) => shallowSurfHeight(x, z, { movementSurface: true }),
    biomeAt: shallowSurfBiomeAt,
    color: shallowSurfColor,
    isWalkable: isShallowSurfWalkable,
    defaultSpawn: [-44, 0, SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM.target.point[1]],
    defaultFacing: [1, 0, 0],
    defaultCameraFacing: [0.96, 0, -0.08],
    entrySpawns: {
      west: [-44, 0, SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM.target.point[1]],
    },
    entryFacings: {
      west: [1, 0, -0.04],
    },
    entryCameraFacings: {
      west: [0.96, 0, -0.1],
    },
  },
};
