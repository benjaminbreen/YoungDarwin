import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  EL_MIRADOR_SOUTHEASTERN_COAST_SEAM,
  SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM,
  WATKINS_SOUTHEASTERN_COAST_SEAM,
} from '../../routeSeams';

export const SOUTHEASTERN_COAST = 'SE_COAST';

const NORTH_TRAIL = [
  [...EL_MIRADOR_SOUTHEASTERN_COAST_SEAM.target.point, 1.8],
  [18, -35, 1.9],
  [8, -24, 2.0],
  [1, -11, 2.05],
];

const WEST_TRAIL = [
  [...WATKINS_SOUTHEASTERN_COAST_SEAM.target.point, 1.8],
  [-39, -4, 1.9],
  [-25, -7, 2.0],
  [-10, -9, 2.05],
  [1, -11, 2.05],
];

const SHORE_TRAIL = [
  [1, -11, 2.05],
  [12, -4, 2.0],
  [21, 3, 1.92],
  [29, 7, 1.8],
  [...SOUTHEASTERN_COAST_SHALLOW_SURF_SEAM.source.point, 2.15],
];

export const SOUTHEASTERN_COAST_PATH_POINTS = [NORTH_TRAIL, WEST_TRAIL, SHORE_TRAIL];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

// Satellite-derived morphology: a low, diagonal, intricately notched coast.
// Land is west of this line and the open Pacific is east of it.
export function southeasternCoastShoreX(z) {
  return 29.5
    + Math.sin(z * 0.105 + 0.42) * 2.8
    + Math.sin(z * 0.265 - 0.9) * 1.35
    + Math.sin(z * 0.61 + 0.25) * 0.48
    - gaussian(0, z, 0, -22, 1, 7.5) * 4.2
    + gaussian(0, z, 0, -6, 1, 5.5) * 3.4
    - gaussian(0, z, 0, 14, 1, 6.5) * 3.7
    + gaussian(0, z, 0, 29, 1, 5.8) * 2.8;
}

export function southeasternCoastInlandDistance(x, z) {
  return southeasternCoastShoreX(z) - x;
}

export function southeasternCoastWetShoreMask(x, z) {
  const distance = southeasternCoastInlandDistance(x, z);
  return clamp01(
    THREE.MathUtils.smoothstep(distance, -3.2, -0.45)
    * (1 - THREE.MathUtils.smoothstep(distance, 0.8, 3.3)),
  );
}

export function southeasternCoastBasaltShelfMask(x, z) {
  const distance = southeasternCoastInlandDistance(x, z);
  const shoreBand = THREE.MathUtils.smoothstep(distance, -5.5, -1)
    * (1 - THREE.MathUtils.smoothstep(distance, 12, 24));
  const ledges = Math.max(
    gaussian(x, z, 25, -27, 12, 10),
    gaussian(x, z, 27, -5, 13, 12) * 0.92,
    gaussian(x, z, 24, 17, 11, 10),
    gaussian(x, z, 29, 34, 12, 8) * 0.82,
  );
  const fractured = terrainSurfaceNoise(x * 0.2 + 7, z * 0.24 - 3) * 0.5 + 0.5;
  return clamp01(shoreBand * ledges * (0.8 + fractured * 0.28));
}

export function southeasternCoastSaltExposure(x, z) {
  const distance = southeasternCoastInlandDistance(x, z);
  const shoreward = 1 - THREE.MathUtils.smoothstep(distance, 5, 37);
  const broken = 0.78 + (terrainSurfaceNoise(x * 0.12 - 4, z * 0.17 + 9) * 0.5 + 0.5) * 0.22;
  return clamp01(shoreward * broken);
}

export function southeasternCoastScrubStrength(x, z) {
  const distance = southeasternCoastInlandDistance(x, z);
  const inland = THREE.MathUtils.smoothstep(distance, 10, 35);
  const saltOpening = 1 - southeasternCoastSaltExposure(x, z) * 0.62;
  const patches = 0.68 + (terrainSurfaceNoise(x * 0.08 + 11, z * 0.1 - 6) * 0.5 + 0.5) * 0.38;
  return clamp01(inland * saltOpening * patches);
}

export function southeasternCoastPathInfo(x, z) {
  const frame = pathFrameAt(SOUTHEASTERN_COAST_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const width = Math.max(
    1.55,
    frame.width
      + Math.sin(along * 0.19 + frame.centerX * 0.08) * 0.15
      + terrainSurfaceNoise(x * 0.68 + 5, z * 0.63 - 8) * 0.16,
  );
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.44);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.36, width * 0.8);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.45, width * 1.02)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.92, width * 1.55));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.55, width * 1.12);
  return {
    ...frame,
    tangentX,
    tangentZ,
    width,
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}
