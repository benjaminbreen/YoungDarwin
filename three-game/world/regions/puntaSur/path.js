import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  PUNTA_SUR_SOUTHERN_REEFS_SEAM,
  SOUTHERN_INTERTIDAL_PUNTA_SUR_SEAM,
  SOUTHERN_VOLCANIC_PUNTA_SUR_SEAM,
} from '../../routeSeams';

export const PUNTA_SUR = 'PUNTA_SUR';

const NORTH_CAPE_TRAIL = [
  [...SOUTHERN_VOLCANIC_PUNTA_SUR_SEAM.target.point, 2.0],
  [-9, -34, 2.08],
  [-3, -22, 2.14],
  [2, -10, 2.2],
  [4, 3, 2.15],
  [4, 13, 1.96],
];

const WEST_HEADLAND_TRAIL = [
  [...SOUTHERN_INTERTIDAL_PUNTA_SUR_SEAM.target.point, 1.9],
  [-35, -6, 1.98],
  [-23, -2, 2.06],
  [-10, 4, 2.14],
  [4, 13, 1.96],
];

const EAST_REEF_DESCENT = [
  [4, 13, 1.96],
  [15, 15, 2.0],
  [27, 17, 2.08],
  [38, 18, 2.0],
  [...PUNTA_SUR_SOUTHERN_REEFS_SEAM.source.point, 1.9],
];

const RAINBOW_LOOKOUT_SPUR = [
  [4, 13, 1.76],
  [2, 20, 1.64],
  [1, 26, 1.48],
];

export const PUNTA_SUR_PATH_POINTS = [
  NORTH_CAPE_TRAIL,
  WEST_HEADLAND_TRAIL,
  EAST_REEF_DESCENT,
  RAINBOW_LOOKOUT_SPUR,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function puntaSurSouthCoastZ(x) {
  return 30.2
    + Math.sin(x * 0.088 + 0.45) * 2.15
    + Math.sin(x * 0.224 - 1.08) * 1.2
    + Math.sin(x * 0.49 + 0.3) * 0.58
    + Math.exp(-Math.pow((x - 2) / 18, 2)) * 5.4
    + Math.exp(-Math.pow((x + 18) / 5.4, 2)) * 2.0
    + Math.exp(-Math.pow((x - 18) / 5.8, 2)) * 2.4
    - Math.exp(-Math.pow((x + 34) / 6.4, 2)) * 3.25
    - Math.exp(-Math.pow((x + 7) / 5.2, 2)) * 2.1
    - Math.exp(-Math.pow((x - 31) / 5.6, 2)) * 3.4;
}

export function puntaSurCoastDistance(x, z) {
  return puntaSurSouthCoastZ(x) - z;
}

export function puntaSurWaterEntryMask(x, z) {
  const distance = puntaSurCoastDistance(x, z);
  const coastBand = THREE.MathUtils.smoothstep(distance, -1.5, 1.2)
    * (1 - THREE.MathUtils.smoothstep(distance, 18, 31));
  const westCove = Math.exp(-Math.pow((x + 35.5) / 5.2, 2));
  const eastCove = Math.exp(-Math.pow((x - 32) / 4.8, 2));
  return clamp01(Math.max(westCove, eastCove) * coastBand);
}

export function puntaSurRedEarthMask(x, z) {
  const centralBasin = Math.exp(-Math.pow((x - 4) / 25, 2) - Math.pow((z + 1) / 35, 2));
  const southFan = Math.exp(-Math.pow((x + 3) / 20, 2) - Math.pow((z - 22) / 17, 2));
  const westScour = Math.exp(-Math.pow((x + 17) / 13, 2) - Math.pow((z - 3) / 23, 2)) * 0.62;
  const mottling = terrainSurfaceNoise(x * 0.105 + 13, z * 0.096 - 8) * 0.5 + 0.5;
  const fineBreakup = terrainSurfaceNoise(x * 0.31 - 4, z * 0.29 + 11) * 0.5 + 0.5;
  const field = Math.max(centralBasin, southFan, westScour);
  const greenIslands = THREE.MathUtils.smoothstep(fineBreakup, 0.58, 0.78);
  return clamp01(field * (0.5 + mottling * 0.5) - greenIslands * field * 0.48 - puntaSurFaceMask(x, z) * 0.46);
}

export function puntaSurRockRibMask(x, z) {
  const westRib = Math.exp(-Math.pow((x + 14) / 4.8, 2) - Math.pow((z - 20) / 15, 2));
  const eastRib = Math.exp(-Math.pow((x - 18) / 5.4, 2) - Math.pow((z - 24) / 12, 2)) * 0.84;
  const inlandOutcrop = Math.exp(-Math.pow((x + 9) / 7, 2) - Math.pow((z + 17) / 9, 2)) * 0.64;
  return clamp01(Math.max(westRib, eastRib, inlandOutcrop));
}

export function puntaSurFaceMask(x, z) {
  return clamp01(1 - THREE.MathUtils.smoothstep(puntaSurCoastDistance(x, z), 1.6, 10.8));
}

export function puntaSurRimMask(x, z) {
  const distance = puntaSurCoastDistance(x, z);
  return clamp01(
    THREE.MathUtils.smoothstep(distance, 5.2, 7.6)
    * (1 - THREE.MathUtils.smoothstep(distance, 11.2, 16.4)),
  );
}

export function puntaSurCrownMask(x, z) {
  const crown = Math.exp(-Math.pow((x - 3) / 24, 2) - Math.pow((z - 8) / 24, 2));
  const southShoulder = Math.exp(-Math.pow((x - 1) / 16, 2) - Math.pow((z - 22) / 14, 2)) * 0.72;
  return clamp01(Math.max(crown, southShoulder));
}

export function puntaSurGullyMask(x, z) {
  const active = THREE.MathUtils.smoothstep(z, -21, -5)
    * (1 - THREE.MathUtils.smoothstep(z, 25, 36));
  const westCenter = -19 + Math.sin((z + 8) * 0.115) * 4.2;
  const eastCenter = 21 + Math.sin((z - 3) * 0.13) * 3.6;
  const west = Math.exp(-Math.pow((x - westCenter) / 4.6, 2)) * active;
  const east = Math.exp(-Math.pow((x - eastCenter) / 4.1, 2)) * active * 0.86;
  return clamp01(Math.max(west, east));
}

export function puntaSurSprayExposure(x, z) {
  const distance = puntaSurCoastDistance(x, z);
  const coastBand = 1 - THREE.MathUtils.smoothstep(distance, 8, 28);
  const windBreakup = terrainSurfaceNoise(x * 0.11 + 7, z * 0.095 - 5) * 0.12;
  return clamp01(coastBand * 0.88 + puntaSurRimMask(x, z) * 0.22 + windBreakup);
}

export function puntaSurShelterMask(x, z) {
  const westFold = Math.exp(-Math.pow((x + 28) / 15, 2) - Math.pow((z + 3) / 18, 2)) * 0.86;
  const northFold = Math.exp(-Math.pow((x - 9) / 25, 2) - Math.pow((z + 27) / 13, 2)) * 0.64;
  return clamp01(Math.max(westFold, northFold) - puntaSurSprayExposure(x, z) * 0.45);
}

export function puntaSurBasaltExposure(x, z) {
  const fractured = terrainSurfaceNoise(x * 0.43 + 5, z * 0.4 - 9) * 0.5 + 0.5;
  return clamp01(Math.max(
    puntaSurFaceMask(x, z),
    puntaSurRimMask(x, z) * 0.86,
    puntaSurGullyMask(x, z) * 0.7,
  ) + fractured * 0.14);
}

export function puntaSurPathInfo(x, z) {
  const frame = pathFrameAt(PUNTA_SUR_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.18 + frame.centerX * 0.07) * 0.2
    + terrainSurfaceNoise(x * 0.73 + 9, z * 0.71 - 4) * 0.2;
  const width = Math.max(1.5, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.16, width * 0.44);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.35, width * 0.82);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.45, width * 1.02)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.95, width * 1.58));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.56, width * 1.12);
  return { ...frame, tangentX, tangentZ, width, center: clamp01(center), tread: clamp01(tread), shoulder: clamp01(shoulder), path: clamp01(path) };
}
