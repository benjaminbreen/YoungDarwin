import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  LAVA_FLATS,
  lavaFlatsFlowMask,
  lavaFlatsPathInfo,
  lavaFlatsPressureRidgeMask,
  lavaFlatsScoriaMask,
  lavaFlatsTubeMasks,
  lavaFlatsWeatheredMask,
} from './path';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function flowPlateRelief(x, z, movementSurface) {
  const flow = lavaFlatsFlowMask(x, z);
  const directional = Math.sin((x * 0.13 - z * 0.045) + Math.sin(z * 0.038) * 1.2);
  const secondary = Math.sin(x * 0.055 + z * 0.086 - 1.4);
  const broadPlate = elevationNoise(x * 0.048 + 17, z * 0.036 - 8);
  const amount = directional * 0.11 + secondary * 0.055 + broadPlate * 0.13;
  return flow * amount * (movementSurface ? 0.5 : 1);
}

function fracturedRelief(x, z, movementSurface) {
  const scoria = lavaFlatsScoriaMask(x, z);
  const ridge = lavaFlatsPressureRidgeMask(x, z);
  const chips = Math.pow(Math.abs(crackNoise(x * 0.34 + 7, z * 0.31 - 5)), 4.2);
  const broken = terrainSurfaceNoise(x * 0.82 - 11, z * 0.76 + 3);
  if (movementSurface) return scoria * chips * 0.04 + ridge * broken * 0.028;
  return scoria * (chips * 0.17 + broken * 0.075) + ridge * chips * 0.08;
}

export function lavaFlatsHeight(x, z, { movementSurface = false } = {}) {
  const inland = THREE.MathUtils.clamp((z + 52) / 104, 0, 1);
  const broad = elevationNoise(x * 0.019 + 5.2, z * 0.017 - 8.1);
  const cross = elevationNoise(x * 0.041 - 13.4, z * 0.038 + 2.8);
  const longRoll = Math.sin(x * 0.026 + z * 0.019 + 0.7) * 0.16
    + Math.sin(x * 0.018 - z * 0.031 - 1.2) * 0.11;
  const flow = lavaFlatsFlowMask(x, z);
  const ridge = lavaFlatsPressureRidgeMask(x, z);
  const scoria = lavaFlatsScoriaMask(x, z);
  const tube = lavaFlatsTubeMasks(x, z);
  const path = lavaFlatsPathInfo(x, z);

  let y = 1.82
    + inland * 1.18
    + broad * 0.42
    + cross * 0.19
    + longRoll
    + flow * 0.28
    + flowPlateRelief(x, z, movementSurface)
    + ridge * (movementSurface ? 0.42 : 0.78)
    + scoria * terrainSurfaceNoise(x * 0.17 + 2, z * 0.16 - 3) * (movementSurface ? 0.05 : 0.13)
    + tube.rim * (movementSurface ? 0.28 : 0.56)
    - tube.bowl * (movementSurface ? 0.52 : 0.74)
    + fracturedRelief(x, z, movementSurface);

  // The route is only a compacted trace. It follows the lava rather than
  // becoming an implausibly level road through the field.
  y -= path.tread * (movementSurface ? 0.045 : 0.075);
  y -= path.center * 0.025;

  if (movementSurface) {
    y += elevationNoise(x * 0.12 + 7, z * 0.11 - 11) * 0.035;
  } else {
    const seam = 1 - THREE.MathUtils.smoothstep(
      Math.abs(crackNoise(x * 0.23 - 3, z * 0.21 + 8)),
      0.018,
      0.095,
    );
    y -= seam * (0.035 + scoria * 0.035);
    y += terrainFineDetail(x * 0.82, z * 0.82) * (0.52 + scoria * 0.38);
  }
  return y;
}

export function lavaFlatsBiomeAt(x, z) {
  const path = lavaFlatsPathInfo(x, z);
  if (path.tread > 0.48) return 'trail';
  if (lavaFlatsScoriaMask(x, z) > 0.48) return 'ash-slope';
  const tube = lavaFlatsTubeMasks(x, z);
  if (tube.bowl > 0.34 || tube.rim > 0.4) return 'lava-shelf';
  if (lavaFlatsPressureRidgeMask(x, z) > 0.46) return 'lava-shelf';
  return 'black-lava';
}

export function lavaFlatsColor(x, z) {
  const color = new THREE.Color('#292925');
  const weathered = lavaFlatsWeatheredMask(x, z);
  const scoria = lavaFlatsScoriaMask(x, z);
  const path = lavaFlatsPathInfo(x, z);
  const tube = lavaFlatsTubeMasks(x, z);
  const macro = terrainSurfaceNoise(x * 0.16 + 8, z * 0.15 - 5) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 0.84 - 6, z * 0.78 + 12) * 0.5 + 0.5;

  color.lerp(new THREE.Color('#504c43'), weathered * (0.23 + macro * 0.2));
  color.lerp(new THREE.Color('#673b2a'), scoria * (0.26 + fine * 0.12));
  color.lerp(new THREE.Color('#5a4835'), path.path * (0.34 + path.tread * 0.22));
  color.lerp(new THREE.Color('#20211f'), tube.bowl * 0.18);
  color.multiplyScalar(0.88 + macro * 0.09 + fine * 0.035);
  return color;
}

export function isLavaFlatsWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const step = 0.86;
  const left = lavaFlatsHeight(x - step, z, { movementSurface: true });
  const right = lavaFlatsHeight(x + step, z, { movementSurface: true });
  const back = lavaFlatsHeight(x, z - step, { movementSurface: true });
  const forward = lavaFlatsHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.08 || lavaFlatsPathInfo(x, z).path > 0.22;
}

export const lavaFlatsRegion = {
  id: LAVA_FLATS,
  aliases: [],
  terrain: {
    height: lavaFlatsHeight,
    movementHeight: (x, z) => lavaFlatsHeight(x, z, { movementSurface: true }),
    biomeAt: lavaFlatsBiomeAt,
    color: lavaFlatsColor,
    isWalkable: isLavaFlatsWalkable,
    defaultSpawn: [-8.4, 0, -38.5],
    defaultFacing: [0.15, 0, 1],
    entrySpawns: {
      north: [-10.2, 0, -49.5],
      west: [-52.5, 0, 10.5],
      east: [52.5, 0, -7.5],
      south: [7.2, 0, 49.5],
    },
    entryFacings: {
      north: [0.12, 0, 1],
      west: [1, 0, 0.08],
      east: [-1, 0, 0.05],
      south: [-0.1, 0, -1],
    },
  },
};
