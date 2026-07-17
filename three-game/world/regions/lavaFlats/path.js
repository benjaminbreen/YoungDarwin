import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import {
  crackNoise,
  terrainSurfaceNoise,
  variableChannelMask,
} from '../../terrainShared';

export const LAVA_FLATS = 'LAVA_FLATS';

// A lightly worn nineteenth-century crossing rather than a modern road. The
// tread follows the long axis of the lava field and becomes less distinct as
// it reaches the fractured southern flows.
export const LAVA_FLATS_PATH_POINTS = [
  [-10.5, -52, 1.25],
  [-8.4, -39, 1.3],
  [-5.8, -25, 1.34],
  [-3.2, -10, 1.42],
  [-0.6, 5, 1.5],
  [2.2, 20, 1.56],
  [5.1, 36, 1.62],
  [7.4, 52, 1.7],
];

// Two coherent flow units give the field a geological direction. Their broad
// masks drive height, material weathering, and raised-detail placement.
const WEST_FLOW = [
  [-43, -48, 15],
  [-35, -28, 17],
  [-27, -7, 18],
  [-18, 16, 19],
  [-7, 43, 17],
];

const EAST_FLOW = [
  [33, -50, 13],
  [27, -28, 15],
  [29, -5, 16],
  [23, 19, 17],
  [17, 49, 15],
];

const NORTH_PRESSURE_RIDGE = [
  [-48, -27, 3.1],
  [-29, -20, 3.7],
  [-8, -17, 3.4],
  [13, -21, 2.8],
  [34, -29, 2.4],
];

const SOUTH_PRESSURE_RIDGE = [
  [-39, 30, 2.7],
  [-19, 24, 3.4],
  [2, 26, 3.8],
  [22, 31, 3.2],
  [42, 27, 2.5],
];

const SCORIA_BAND = [
  [-52, 24, 4.8],
  [-31, 18, 5.5],
  [-10, 10, 5.9],
  [12, 1, 5.4],
  [35, -12, 4.9],
  [53, -20, 4.4],
];

const PIONEER_POCKETS = [
  { x: -31, z: -8, rx: 8.5, rz: 5.6, strength: 0.82 },
  { x: 25, z: -20, rx: 7.2, rz: 5.2, strength: 0.76 },
  { x: -17, z: 25, rx: 7.8, rz: 5.4, strength: 0.9 },
  { x: 31, z: 27, rx: 7.4, rz: 5.0, strength: 0.72 },
  { x: 9, z: 40, rx: 6.8, rz: 4.8, strength: 0.68 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function lavaFlatsPathInfo(x, z) {
  const frame = pathFrameAt(LAVA_FLATS_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.19 + frame.centerX * 0.08) * 0.19
    + Math.sin(along * 0.095 - frame.centerZ * 0.17) * 0.14
    + terrainSurfaceNoise(x * 0.76 + 8, z * 0.76 - 5) * 0.18;
  const width = Math.max(1.28, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.14, width * 0.4);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.32, width * 0.84);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.5, width * 1.0)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.92, width * 1.55));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.55, width * 1.1);
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

export function lavaFlatsFlowMask(x, z) {
  const west = variableChannelMask(x, z, WEST_FLOW);
  const east = variableChannelMask(x, z, EAST_FLOW);
  return clamp01(Math.max(west, east));
}

export function lavaFlatsPressureRidgeMask(x, z) {
  return clamp01(Math.max(
    variableChannelMask(x, z, NORTH_PRESSURE_RIDGE),
    variableChannelMask(x, z, SOUTH_PRESSURE_RIDGE),
  ));
}

export function lavaFlatsScoriaMask(x, z) {
  const band = variableChannelMask(x, z, SCORIA_BAND);
  const southeastPocket = Math.exp(-Math.pow((x - 29) / 11, 2) - Math.pow((z - 24) / 8, 2));
  const northwestPocket = Math.exp(-Math.pow((x + 38) / 10, 2) - Math.pow((z + 28) / 7, 2)) * 0.72;
  const breakup = terrainSurfaceNoise(x * 0.39 + 7, z * 0.39 - 11) * 0.12;
  return clamp01(Math.max(band, southeastPocket, northwestPocket) + breakup);
}

export function lavaFlatsWeatheredMask(x, z) {
  const flow = lavaFlatsFlowMask(x, z);
  const broad = terrainSurfaceNoise(x * 0.12 - 4, z * 0.12 + 9) * 0.5 + 0.5;
  const southernAge = THREE.MathUtils.smoothstep(z, 6, 48) * 0.2;
  return clamp01(0.16 + flow * 0.48 + broad * 0.28 + southernAge);
}

export function lavaFlatsTubeMasks(x, z) {
  const dx = (x - 14.5) / 10.6;
  const dz = (z - 6.5) / 6.2;
  const distance = Math.hypot(dx, dz);
  const bowl = 1 - THREE.MathUtils.smoothstep(distance, 0.12, 0.94);
  const rim = THREE.MathUtils.smoothstep(distance, 0.48, 0.78)
    * (1 - THREE.MathUtils.smoothstep(distance, 0.9, 1.22));
  return { distance, bowl: clamp01(bowl), rim: clamp01(rim) };
}

export function lavaFlatsPioneerMask(x, z) {
  let pockets = 0;
  for (const pocket of PIONEER_POCKETS) {
    const dx = (x - pocket.x) / pocket.rx;
    const dz = (z - pocket.z) / pocket.rz;
    pockets = Math.max(pockets, Math.exp(-(dx * dx + dz * dz) * 1.8) * pocket.strength);
  }
  const fissures = 1 - THREE.MathUtils.smoothstep(
    Math.abs(crackNoise(x * 0.27 + 4, z * 0.25 - 9)),
    0.035,
    0.2,
  );
  return clamp01(pockets * (0.62 + fissures * 0.56));
}
