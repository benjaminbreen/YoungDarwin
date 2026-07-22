import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { crackNoise, terrainSurfaceNoise } from '../../terrainShared';
import {
  MARINE_IGUANA_COLONY_BEACH_HUT_SEAM,
  MARINE_IGUANA_COLONY_MANGROVES_SEAM,
  MARINE_IGUANA_COLONY_SOUTHWESTERN_CLIFFS_SEAM,
} from '../../routeSeams';

export const MARINE_IGUANA_COLONY = 'SW_BEACH';

const NORTH_TRAIL = [
  [...MARINE_IGUANA_COLONY_BEACH_HUT_SEAM.source.point, 1.75],
  [9, -39, 1.82],
  [4, -29, 1.9],
  [-1, -18, 1.95],
  [-4, -7, 2.05],
];

const EAST_TRAIL = [
  [-4, -7, 2.05],
  [8, -8, 2.1],
  [21, -5, 2.0],
  [35, -9, 1.9],
  [...MARINE_IGUANA_COLONY_MANGROVES_SEAM.source.point, 1.8],
];

const SOUTH_TRAIL = [
  [-4, -7, 2.05],
  [2, 6, 2.0],
  [8, 18, 1.95],
  [13, 31, 1.86],
  [...MARINE_IGUANA_COLONY_SOUTHWESTERN_CLIFFS_SEAM.source.point, 1.76],
];

const COLONY_SPUR = [
  [-4, -7, 1.86],
  [-11, -4, 1.7],
  [-18, 1, 1.58],
  [-23, 7, 1.46],
];

export const MARINE_IGUANA_COLONY_PATH_POINTS = [
  NORTH_TRAIL,
  EAST_TRAIL,
  SOUTH_TRAIL,
  COLONY_SPUR,
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function marineIguanaColonyWestCoastX(z) {
  return -29.5
    + Math.sin(z * 0.095 + 0.65) * 2.2
    + Math.sin(z * 0.245 - 1.1) * 1.15
    + Math.sin(z * 0.52 + 0.2) * 0.42
    - gaussian(0, z, 0, -13, 1, 9) * 4.8
    - gaussian(0, z, 0, 21, 1, 8) * 3.6
    + gaussian(0, z, 0, 5, 1, 5.4) * 3.2
    + gaussian(0, z, 0, 37, 1, 5.6) * 2.2;
}

export function marineIguanaColonyCoastDistance(x, z) {
  return x - marineIguanaColonyWestCoastX(z);
}

export function marineIguanaColonyBeachMask(x, z) {
  const distance = marineIguanaColonyCoastDistance(x, z);
  const shoreBand = THREE.MathUtils.smoothstep(distance, -0.7, 1.4)
    * (1 - THREE.MathUtils.smoothstep(distance, 18, 29));
  const northCove = gaussian(x, z, -18, -14, 19, 13);
  const southCove = gaussian(x, z, -18, 22, 18, 11) * 0.9;
  const centralPocket = gaussian(x, z, -15, 3, 16, 9) * 0.74;
  return clamp01(shoreBand * Math.max(northCove, southCove, centralPocket));
}

export function marineIguanaColonyWetShoreMask(x, z) {
  const distance = marineIguanaColonyCoastDistance(x, z);
  return clamp01(
    THREE.MathUtils.smoothstep(distance, -2.2, -0.1)
    * (1 - THREE.MathUtils.smoothstep(distance, 1.1, 3.4)),
  );
}

export function marineIguanaColonyBasaltShelfMask(x, z) {
  const distance = marineIguanaColonyCoastDistance(x, z);
  const coastBand = THREE.MathUtils.smoothstep(distance, -0.6, 1.4)
    * (1 - THREE.MathUtils.smoothstep(distance, 18, 29));
  const centralTerrace = gaussian(x, z, -15, 5, 24, 15);
  const northLedge = gaussian(x, z, -19, -32, 18, 11) * 0.86;
  const southLedge = gaussian(x, z, -18, 38, 20, 10) * 0.92;
  const fingers = Math.max(
    gaussian(x, z, -12, -3, 5.6, 15),
    gaussian(x, z, -15, 10, 6.2, 13),
    gaussian(x, z, -12, 32, 5.4, 12),
  );
  const fractured = terrainSurfaceNoise(x * 0.19 + 8, z * 0.22 - 5) * 0.5 + 0.5;
  return clamp01(Math.max(centralTerrace, northLedge, southLedge, fingers * 0.8)
    * coastBand * (0.78 + fractured * 0.26));
}

export function marineIguanaColonyTerraceMask(x, z) {
  const primary = gaussian(x, z, -18, 3, 16, 11);
  const north = gaussian(x, z, -18, -25, 15, 10) * 0.7;
  const south = gaussian(x, z, -17, 34, 16, 9) * 0.72;
  return clamp01(Math.max(primary, north, south) * marineIguanaColonyBasaltShelfMask(x, z));
}

export function marineIguanaColonyPoolMask(x, z) {
  return clamp01(Math.max(
    gaussian(x, z, -27.5, 4, 4.4, 6.2),
    gaussian(x, z, -25.5, -28, 4.0, 5.2) * 0.84,
    gaussian(x, z, -26.0, 34, 4.5, 5.0) * 0.9,
  ) * marineIguanaColonyBasaltShelfMask(x, z));
}

export function marineIguanaColonyGuanoMask(x, z) {
  const terrace = marineIguanaColonyTerraceMask(x, z);
  const colonyAprons = Math.max(
    gaussian(x, z, -18, 1, 9, 6.2),
    gaussian(x, z, -12, 9, 7.5, 5.5),
    gaussian(x, z, -20, -24, 7, 5.5) * 0.58,
  );
  const verticalVeins = Math.abs(crackNoise(x * 0.18 + 7, z * 0.72 - 3));
  const broken = terrainSurfaceNoise(x * 0.62 - 11, z * 0.58 + 9) * 0.5 + 0.5;
  return clamp01(Math.max(terrace * 0.48, colonyAprons)
    * THREE.MathUtils.smoothstep(verticalVeins, 0.22, 0.72)
    * (0.62 + broken * 0.44));
}

export function marineIguanaColonyRubbleMask(x, z) {
  const inland = THREE.MathUtils.smoothstep(x, -2, 37);
  const fractured = terrainSurfaceNoise(x * 0.17 - 5, z * 0.19 + 12) * 0.5 + 0.5;
  const ribs = Math.max(
    gaussian(x, z, 9, -30, 9, 17),
    gaussian(x, z, 24, 14, 12, 20),
    gaussian(x, z, 40, -20, 8, 18),
  );
  return clamp01(inland * (ribs * 0.78 + THREE.MathUtils.smoothstep(fractured, 0.63, 0.84) * 0.34));
}

export function marineIguanaColonyHillockMask(x, z) {
  return clamp01(Math.max(
    gaussian(x, z, 9, -32, 16, 13) * 0.82,
    gaussian(x, z, 20, -15, 17, 14),
    gaussian(x, z, 34, 2, 18, 16) * 0.9,
    gaussian(x, z, 20, 21, 16, 13) * 0.88,
    gaussian(x, z, 37, 31, 17, 14) * 0.76,
    gaussian(x, z, 6, 37, 13, 10) * 0.7,
  ));
}

export function marineIguanaColonyPathInfo(x, z) {
  const frame = pathFrameAt(MARINE_IGUANA_COLONY_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.2 + frame.centerX * 0.08) * 0.18
    + terrainSurfaceNoise(x * 0.72 + 6, z * 0.68 - 4) * 0.2;
  const width = Math.max(1.55, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.17, width * 0.46);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.36, width * 0.82);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.44, width * 1.05)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.56));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.55, width * 1.12);
  return { ...frame, tangentX, tangentZ, width, center: clamp01(center), tread: clamp01(tread), shoulder: clamp01(shoulder), path: clamp01(path) };
}
