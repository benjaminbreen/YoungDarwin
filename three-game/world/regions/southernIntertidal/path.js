import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import {
  pointSegmentDistance,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  MANGROVES_SOUTHERN_INTERTIDAL_SEAM,
  SOUTHWESTERN_CLIFFS_SOUTHERN_INTERTIDAL_SEAM,
  SOUTHERN_INTERTIDAL_PUNTA_SUR_SEAM,
} from '../../routeSeams';

export const SOUTHERN_INTERTIDAL = 'S_INTERTIDAL';

const NORTH_APPROACH = [
  [...MANGROVES_SOUTHERN_INTERTIDAL_SEAM.target.point, 1.82],
  [1, -38, 1.92],
  [-5, -29, 2.02],
  [-4, -20, 2.12],
];

const EAST_CAUSEWAY = [
  [-4, -20, 2.08],
  [8, -16, 2.18],
  [21, -12, 2.1],
  [37, -9, 2.0],
  [...SOUTHERN_INTERTIDAL_PUNTA_SUR_SEAM.source.point, 1.9],
];

const WEST_CAUSEWAY = [
  [-4, -20, 2.04],
  [-17, -14, 2.12],
  [-30, -4, 2.02],
  [-42, 4, 1.92],
  [...SOUTHWESTERN_CLIFFS_SOUTHERN_INTERTIDAL_SEAM.target.point, 1.82],
];

// A deliberately optional low-tide loop. It crosses shallow water and basalt
// stepping shelves without becoming the required route between map exits.
const TIDEPOOL_LOOP = [
  [-17, -14, 1.44],
  [-23, -1, 1.38],
  [-14, 10, 1.34],
  [0, 16, 1.38],
  [15, 10, 1.42],
  [21, -12, 1.5],
];

export const SOUTHERN_INTERTIDAL_PATH_POINTS = [
  NORTH_APPROACH,
  EAST_CAUSEWAY,
  WEST_CAUSEWAY,
  TIDEPOOL_LOOP,
];

const BASALT_FINGERS = [
  [[-43, -13], [-34, 1], 8.4],
  [[-34, 1], [-22, 27], 7.4],
  [[-8, -11], [2, 10], 6.4],
  [[2, 10], [-2, 31], 6.1],
  [[24, -8], [34, 12], 7.3],
  [[34, 12], [24, 31], 6.7],
];

const TIDAL_CHANNELS = [
  [[-31, 51], [-28, 28], 9.2],
  [[-28, 28], [-17, 15], 6.4],
  [[-17, 15], [-8, 7], 4.8],
  [[12, 51], [8, 31], 10.4],
  [[8, 31], [16, 17], 7.2],
  [[16, 17], [13, 3], 4.9],
  [[44, 51], [38, 29], 9.0],
  [[38, 29], [28, 16], 6.2],
];

const POOLS = [
  { x: -25, z: -1, rx: 9.2, rz: 6.1, strength: 1 },
  { x: 1, z: 14, rx: 7.8, rz: 5.4, strength: 0.92 },
  { x: 29, z: 10, rx: 8.5, rz: 5.6, strength: 0.96 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function segmentRibbon(x, z, a, b, width, inner = 0.48) {
  const distance = pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]);
  return 1 - THREE.MathUtils.smoothstep(distance, width * inner, width);
}

export function intertidalPathInfo(x, z) {
  const frame = pathFrameAt(SOUTHERN_INTERTIDAL_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.17 + frame.centerX * 0.09) * 0.2
    + terrainSurfaceNoise(x * 0.72 + 3, z * 0.7 - 11) * 0.18;
  const width = Math.max(1.35, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.16, width * 0.46);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.35, width * 0.84);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.48, width * 1.04)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.56));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.56, width * 1.14);
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

export function intertidalRequiredCausewayMask(x, z) {
  const frame = pathFrameAt([NORTH_APPROACH, EAST_CAUSEWAY, WEST_CAUSEWAY], x, z);
  const width = Math.max(1.45, frame.width);
  return clamp01(1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.48, width * 1.08));
}

export function intertidalBackshoreMask(x, z) {
  const shoreward = 1 - THREE.MathUtils.smoothstep(z, -34, -19);
  const rolling = 0.84 + terrainSurfaceNoise(x * 0.14 - 5, z * 0.16 + 8) * 0.16;
  return clamp01(shoreward * rolling);
}

export function intertidalScrubBandStrength(x, z) {
  const west = Math.exp(-Math.pow((x + 28) / 28, 2) - Math.pow((z + 34) / 12, 2));
  const east = Math.exp(-Math.pow((x - 28) / 28, 2) - Math.pow((z + 33) / 12, 2));
  const centerGate = 1 - Math.exp(-Math.pow((x - 1) / 7.5, 2) - Math.pow((z + 37) / 15, 2));
  const broken = 0.78 + terrainSurfaceNoise(x * 0.32 + 7, z * 0.29 - 4) * 0.22;
  return clamp01(Math.max(west, east) * centerGate * broken);
}

export function intertidalBasaltShelfMask(x, z) {
  let value = 0;
  for (const [a, b, width] of BASALT_FINGERS) {
    value = Math.max(value, segmentRibbon(x, z, a, b, width));
  }
  const broken = 0.86 + terrainSurfaceNoise(x * 0.34 - 8, z * 0.31 + 4) * 0.14;
  return clamp01(value * broken);
}

export function intertidalTidalChannelMask(x, z) {
  let value = 0;
  for (const [a, b, width] of TIDAL_CHANNELS) {
    value = Math.max(value, segmentRibbon(x, z, a, b, width, 0.42));
  }
  return clamp01(value);
}

export function intertidalPoolMask(x, z) {
  let value = 0;
  for (const pool of POOLS) {
    const dx = (x - pool.x) / pool.rx;
    const dz = (z - pool.z) / pool.rz;
    value = Math.max(value, Math.exp(-(dx * dx + dz * dz) * 1.3) * pool.strength);
  }
  return clamp01(value * (1 - intertidalTidalChannelMask(x, z) * 0.72));
}

export function intertidalStandingWaterMask(x, z) {
  const pool = intertidalPoolMask(x, z);
  const inset = 1 - THREE.MathUtils.smoothstep(pool, 0.28, 0.56);
  return clamp01(pool * (1 - inset));
}

export function intertidalShellSandMask(x, z) {
  const centralFan = Math.exp(-Math.pow((x - 10) / 35, 2) - Math.pow((z - 5) / 26, 2));
  const eastFan = Math.exp(-Math.pow((x - 30) / 23, 2) - Math.pow((z - 20) / 21, 2)) * 0.82;
  const sand = Math.max(centralFan, eastFan);
  return clamp01(sand * (1 - intertidalBasaltShelfMask(x, z) * 0.82));
}

export function intertidalWrackBandMask(x, z) {
  const line = -18 + Math.sin(x * 0.075 + 0.4) * 3.2 + Math.sin(x * 0.19 - 1.2) * 1.2;
  const distance = Math.abs(z - line);
  const backshore = intertidalBackshoreMask(x, z);
  return clamp01((1 - THREE.MathUtils.smoothstep(distance, 1.2, 5.8)) * (0.42 + backshore * 0.58));
}

export function intertidalSaltExposure(x, z) {
  const south = THREE.MathUtils.smoothstep(z, -22, 39);
  const channels = intertidalTidalChannelMask(x, z);
  const pools = intertidalPoolMask(x, z);
  return clamp01(south * 0.58 + channels * 0.3 + pools * 0.36);
}

// The exposed flat ends in an irregular south-facing strand rather than at a
// straight map boundary. Shared by bathymetry, surf anchors, and litter bands.
export function southernIntertidalSouthCoastZ(x) {
  return 33
    + Math.sin(x * 0.072 + 0.55) * 2.35
    + Math.sin(x * 0.031 - 1.1) * 1.15;
}

export const SOUTHERN_INTERTIDAL_POOL_SITES = Object.freeze(POOLS.map(pool => Object.freeze({ ...pool })));
