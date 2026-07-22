import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  COASTAL_SCRUBLAND_EL_MIRADOR_SEAM,
  EL_MIRADOR_SOUTHEASTERN_COAST_SEAM,
  ROCKY_CLEARING_EL_MIRADOR_SEAM,
} from '../../routeSeams';

export const EL_MIRADOR = 'EL_MIRADOR';

const NORTH_SWITCHBACK = [
  [...COASTAL_SCRUBLAND_EL_MIRADOR_SEAM.target.point, 2.08],
  [-33, -39, 2.14],
  [-20, -32, 2.24],
  [-8, -25, 2.18],
  [-22, -17, 2.12],
  [-27, -10, 2.06],
  [-13, -4, 2.02],
  [2, 2, 1.98],
  [-10, 10, 1.92],
  [-5, 17, 1.88],
  [10, 21, 1.94],
  [21, 24, 2.04],
];

const ROCKY_CLEARING_TRAVERSE = [
  [...ROCKY_CLEARING_EL_MIRADOR_SEAM.target.point, 2.18],
  [-41, 5, 2.14],
  [-29, 2, 2.08],
  [-13, -4, 2.02],
];

const SOUTH_DESCENT = [
  [21, 24, 2.04],
  [29, 31, 2.12],
  [27, 40, 2.18],
  [...EL_MIRADOR_SOUTHEASTERN_COAST_SEAM.source.point, 2.22],
];

const SUMMIT_LOOKOUT = [
  [21, 24, 1.76],
  [28, 20, 1.7],
  [33, 14, 1.58],
];

export const EL_MIRADOR_PATH_POINTS = [
  NORTH_SWITCHBACK,
  ROCKY_CLEARING_TRAVERSE,
  SOUTH_DESCENT,
  SUMMIT_LOOKOUT,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function elMiradorEastCoastX(z) {
  return 43.5
    + Math.sin(z * 0.09 + 0.5) * 2.1
    + Math.sin(z * 0.22 - 1.1) * 0.9
    - Math.exp(-Math.pow((z - 11) / 10, 2)) * 3.2;
}

// Positive values are inland. The east edge becomes a real below-water shelf,
// allowing the summit to overlook the ocean instead of a decorative map wall.
export function elMiradorCoastDistance(x, z) {
  return elMiradorEastCoastX(z) - x;
}

export function elMiradorCliffFaceMask(x, z) {
  return clamp01(1 - THREE.MathUtils.smoothstep(elMiradorCoastDistance(x, z), 1.8, 9.8));
}

export function elMiradorRimMask(x, z) {
  const distanceToSea = elMiradorCoastDistance(x, z);
  return clamp01(
    THREE.MathUtils.smoothstep(distanceToSea, 5.8, 8.2)
    * (1 - THREE.MathUtils.smoothstep(distanceToSea, 11.5, 16.5)),
  );
}

export function elMiradorSummitMask(x, z) {
  const crown = gaussian(x, z, 20, 25, 18, 16);
  const saddle = gaussian(x, z, 3, 17, 28, 13) * 0.46;
  return clamp01(Math.max(crown, saddle));
}

export function elMiradorGullyMask(x, z) {
  const northActive = THREE.MathUtils.smoothstep(z, -34, -22)
    * (1 - THREE.MathUtils.smoothstep(z, 5, 15));
  const northCenter = 14 + Math.sin((z + 17) * 0.13) * 4.5;
  const north = Math.exp(-Math.pow((x - northCenter) / 4.2, 2)) * northActive;
  const southActive = THREE.MathUtils.smoothstep(z, 4, 14)
    * (1 - THREE.MathUtils.smoothstep(z, 34, 44));
  const southCenter = -27 + Math.sin((z - 12) * 0.12) * 5;
  const south = Math.exp(-Math.pow((x - southCenter) / 4.8, 2)) * southActive;
  return clamp01(Math.max(north, south * 0.78));
}

export function elMiradorShelterMask(x, z) {
  const westHollow = gaussian(x, z, -35, 18, 18, 16) * 0.9;
  const lowerFold = gaussian(x, z, -10, -27, 24, 12) * 0.58;
  return clamp01(Math.max(westHollow, lowerFold) - elMiradorRimMask(x, z) * 0.72);
}

export function elMiradorWindExposure(x, z) {
  const eastward = THREE.MathUtils.smoothstep(x, 3, 38);
  return clamp01(elMiradorSummitMask(x, z) * 0.68 + elMiradorRimMask(x, z) * 0.84 + eastward * 0.24);
}

export function elMiradorBasaltExposure(x, z) {
  const fracture = terrainSurfaceNoise(x * 0.42 + 7, z * 0.39 - 11) * 0.5 + 0.5;
  return clamp01(Math.max(
    elMiradorCliffFaceMask(x, z),
    elMiradorRimMask(x, z) * 0.76,
    elMiradorGullyMask(x, z) * 0.54,
    elMiradorSummitMask(x, z) * (0.24 + fracture * 0.34),
  ));
}

export function elMiradorPathInfo(x, z) {
  const frame = pathFrameAt(EL_MIRADOR_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.21 + frame.centerX * 0.11) * 0.22
    + Math.sin(along * 0.12 - frame.centerZ * 0.19) * 0.16
    + terrainSurfaceNoise(x * 0.84 + 12.0, z * 0.84 - 4.0) * 0.32;
  const width = Math.max(1.58, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.16, width * 0.45);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.34, width * 0.82);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.44, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.58));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.54, width * 1.12);

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
