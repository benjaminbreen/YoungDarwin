import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import { POST_OFFICE_SCRUB_RISE_SEAM } from '../../routeSeams';

export const POST_SCRUB_RISE = 'POST_SCRUB_RISE';

// Four connected foot trails preserve the regional route topology while
// keeping the Post Office Bay approach as the visual spine of the map.
export const POST_SCRUB_RISE_PATH_POINTS = [
  [
    [-6.85, -54, 1.75],
    [...POST_OFFICE_SCRUB_RISE_SEAM.target.point, 1.74],
    [-10, -43, 1.7],
    [-6, -31, 1.65],
    [1, -19, 1.7],
    [-1, -7, 1.72],
    [5, 7, 1.78],
    [3, 19, 1.82],
  ],
  [
    [3, 19, 1.82],
    [-8, 27, 1.72],
    [-23, 32, 1.65],
    [-39, 31, 1.58],
    [-56, 26, 1.55],
  ],
  [
    [3, 19, 1.82],
    [16, 17, 1.72],
    [29, 11, 1.65],
    [43, 8, 1.6],
    [56, 7, 1.55],
  ],
  [
    [3, 19, 1.82],
    [8, 29, 1.75],
    [6, 40, 1.68],
    [10, 53, 1.62],
  ],
];

const THICKET_CLUSTERS = [
  { x: -18, z: -43, rx: 14, rz: 11, strength: 0.96 },
  { x: 6, z: -39, rx: 14, rz: 12, strength: 0.9 },
  { x: -31, z: -39, rx: 19, rz: 13, strength: 0.94 },
  { x: 21, z: -37, rx: 20, rz: 14, strength: 0.86 },
  { x: -17, z: -25, rx: 14, rz: 13, strength: 0.92 },
  { x: 12, z: -21, rx: 15, rz: 14, strength: 0.9 },
  { x: -29, z: -12, rx: 18, rz: 19, strength: 1.0 },
  { x: 28, z: -8, rx: 18, rz: 16, strength: 0.94 },
  { x: -18, z: 16, rx: 17, rz: 14, strength: 0.88 },
  { x: 31, z: 27, rx: 19, rz: 16, strength: 0.92 },
  { x: -34, z: 43, rx: 18, rz: 12, strength: 0.78 },
  { x: 28, z: 46, rx: 16, rz: 12, strength: 0.82 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function scrubRisePathInfo(x, z) {
  const frame = pathFrameAt(POST_SCRUB_RISE_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.23 + frame.centerX * 0.09) * 0.24
    + Math.sin(along * 0.11 - frame.centerZ * 0.2) * 0.18
    + terrainSurfaceNoise(x * 0.82 + 9.0, z * 0.82 - 5.0) * 0.26;
  const width = Math.max(1.72, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.38, width * 0.86);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.48, width * 1.12)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.6));
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

export function scrubRiseWashMask(x, z) {
  const centerZ = -2.5
    + Math.sin((x + 8) * 0.055) * 4.1
    + Math.sin((x - 5) * 0.13) * 1.25;
  const width = 3.2 + (terrainSurfaceNoise(x * 0.42 + 5, z * 0.42 - 8) * 0.5 + 0.5) * 1.8;
  return 1 - THREE.MathUtils.smoothstep(Math.abs(z - centerZ), width * 0.58, width * 1.55);
}

export function scrubRiseThicketStrength(x, z) {
  let strength = 0;
  for (const cluster of THICKET_CLUSTERS) {
    const dx = (x - cluster.x) / cluster.rx;
    const dz = (z - cluster.z) / cluster.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 1.72) * cluster.strength);
  }
  const breakup = terrainSurfaceNoise(x * 0.31 - 7, z * 0.31 + 11) * 0.12;
  return clamp01(strength + breakup);
}

export function scrubRiseBasaltExposure(x, z) {
  const westSpine = Math.exp(-Math.pow((x + 39) / 13, 2) - Math.pow((z + 3) / 34, 2));
  const eastSpine = Math.exp(-Math.pow((x - 35) / 15, 2) - Math.pow((z - 8) / 30, 2));
  const southKnoll = Math.exp(-Math.pow((x + 8) / 22, 2) - Math.pow((z - 39) / 13, 2));
  const fractured = terrainSurfaceNoise(x * 0.52 + 4, z * 0.52 - 9) * 0.5 + 0.5;
  return clamp01(Math.max(westSpine, eastSpine, southKnoll) * 0.78 + fractured * 0.28);
}
