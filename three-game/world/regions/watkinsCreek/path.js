import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM,
  PENAL_COLONY_WATKINS_CREEK_SEAM,
  WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM,
  WATKINS_CREEK_WATKINS_SEAM,
} from '../../routeSeams';

export const WATKINS_CREEK = 'WATKINS_CREEK';
export const WATKINS_CREEK_FORD = Object.freeze({ x: -5, z: 3.2 });
export const WATKINS_CREEK_BASALT_ISLAND = Object.freeze({ x: 4.2, z: 5.1 });

// Four trails meet at the ford. The northern approach is the main reveal;
// west/east follow the creek terraces toward the colony and Watkins Camp,
// while the south branch descends toward the wetlands.
export const WATKINS_CREEK_PATH_POINTS = [
  [
    [...NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM.target.point, 1.78],
    [-7.5, -38, 1.76],
    [-10, -25, 1.72],
    [-8.5, -11, 1.68],
    [WATKINS_CREEK_FORD.x, WATKINS_CREEK_FORD.z, 1.72],
  ],
  [
    [...PENAL_COLONY_WATKINS_CREEK_SEAM.target.point, 1.72],
    [-43, -1.2, 1.7],
    [-29, 1.5, 1.68],
    [-16, 3.8, 1.72],
    [WATKINS_CREEK_FORD.x, WATKINS_CREEK_FORD.z, 1.76],
  ],
  [
    [WATKINS_CREEK_FORD.x, WATKINS_CREEK_FORD.z, 1.76],
    [8, -0.5, 1.74],
    [23, -7.2, 1.7],
    [40, -12.4, 1.68],
    [...WATKINS_CREEK_WATKINS_SEAM.source.point, 1.66],
  ],
  [
    [WATKINS_CREEK_FORD.x, WATKINS_CREEK_FORD.z, 1.74],
    [0.5, 15, 1.7],
    [7, 28, 1.66],
    [13.5, 40, 1.64],
    [...WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM.source.point, 1.62],
  ],
];

// The stream divides briefly around one weathered basalt shelf. Width is the
// wet-channel half-width; the analytic valley adds a much wider bank collar.
export const WATKINS_CREEK_CHANNELS = [
  [
    [-58, 3.2, 4.2],
    [-43, 1.2, 4.0],
    [-27, 3.3, 3.8],
    [-13, 4.6, 3.55],
    [-2, 2.1, 3.25],
    [10, 0.8, 3.35],
    [23, -2.2, 3.65],
    [39, -7.5, 3.9],
    [58, -11.4, 4.05],
  ],
  [
    [-13, 4.6, 3.4],
    [-2, 9.4, 3.05],
    [10, 8.8, 3.15],
    [23, -2.2, 3.55],
  ],
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function band(value, innerStart, innerEnd, outerStart, outerEnd) {
  return THREE.MathUtils.smoothstep(value, innerStart, innerEnd)
    * (1 - THREE.MathUtils.smoothstep(value, outerStart, outerEnd));
}

export function watkinsCreekPathInfo(x, z) {
  const frame = pathFrameAt(WATKINS_CREEK_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.2 + frame.centerX * 0.11) * 0.2
    + Math.sin(along * 0.08 - frame.centerZ * 0.19) * 0.16
    + terrainSurfaceNoise(x * 0.72 + 5, z * 0.7 - 8) * 0.22;
  const width = Math.max(1.7, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.38, width * 0.84);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.46, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.92, width * 1.56));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.56, width * 1.12);
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

export function watkinsCreekChannelInfo(x, z) {
  const frame = pathFrameAt(WATKINS_CREEK_CHANNELS, x, z);
  const bankNoise = terrainSurfaceNoise(x * 0.1 + 6, z * 0.11 - 4) * 1.45;
  const wetHalfWidth = Math.max(2.8, frame.width + bankNoise * 0.22);
  const shoreDistance = frame.distance - wetHalfWidth;
  const outer = wetHalfWidth + 11.5;
  const t = clamp01(1 - (frame.distance + bankNoise) / outer);
  const cross = Math.pow(t, 1.42);
  // All visible creek transitions derive from one signed distance. Negative
  // values are submerged; positive values walk outward across mud, gravel,
  // then the vegetated bank. Keeping these masks together prevents water,
  // terrain material, and ecology from drawing three unrelated shorelines.
  const water = 1 - THREE.MathUtils.smoothstep(shoreDistance, -0.18, 0.52);
  const submergedShelf = band(shoreDistance, -1.45, -0.72, 0.08, 0.62);
  const mud = band(shoreDistance, -0.56, -0.08, 1.18, 1.92);
  const gravel = band(shoreDistance, 0.62, 1.18, 3.0, 4.35);
  const riparian = band(shoreDistance, 1.72, 2.65, 5.7, 7.8);
  const valley = THREE.MathUtils.smoothstep(cross, 0.035, 0.56);
  const pool = Math.exp(-Math.pow((x - 27) / 6.4, 2)) * water;
  const ford = Math.exp(
    -Math.pow((x - WATKINS_CREEK_FORD.x) / 4.2, 2)
    -Math.pow((z - WATKINS_CREEK_FORD.z) / 4.0, 2),
  );
  return {
    ...frame,
    flowX: Math.cos(frame.yaw),
    flowZ: Math.sin(frame.yaw),
    flowSpeed: clamp01(0.58 + ford * 0.34 - pool * 0.3),
    wetHalfWidth,
    shoreDistance,
    cross,
    water: clamp01(water),
    submergedShelf: clamp01(submergedShelf),
    shoreline: clamp01(1 - THREE.MathUtils.smoothstep(Math.abs(shoreDistance), 0.08, 0.92)),
    mud: clamp01(mud),
    gravel: clamp01(gravel),
    riparian: clamp01(riparian),
    valley: clamp01(valley),
    pool: clamp01(pool),
    ford: clamp01(ford),
  };
}

export function watkinsCreekStandingWaterMask(x, z) {
  const creek = watkinsCreekChannelInfo(x, z);
  // The render mesh intentionally reaches beyond the physical waterline. Its
  // shore attribute fades the last cells to transparent over the submerged
  // shelf, hiding the polygon edge before it meets dry land.
  return 1 - THREE.MathUtils.smoothstep(creek.shoreDistance, -0.36, 0.78);
}

export function watkinsCreekStandingWaterSuppressionMask(x, z) {
  const creek = watkinsCreekChannelInfo(x, z);
  // The shared ocean and surf meshes occupy the same world height as authored
  // standing water. Keep those global layers hidden past the creek mesh's
  // transparent feather, then let them return only beneath raised gravel bank.
  // This prevents an ocean-blue/white fringe from showing through the creek's
  // reflective shoreline without making the visible creek itself wider.
  return 1 - THREE.MathUtils.smoothstep(creek.shoreDistance, 0.35, 2.5);
}

export function watkinsCreekFlowAt(x, z) {
  const creek = watkinsCreekChannelInfo(x, z);
  return {
    x: creek.flowX,
    z: creek.flowZ,
    speed: creek.flowSpeed,
  };
}

export function watkinsCreekBasaltExposure(x, z) {
  const creek = watkinsCreekChannelInfo(x, z);
  const island = Math.exp(
    -Math.pow((x - WATKINS_CREEK_BASALT_ISLAND.x) / 9.5, 2)
    -Math.pow((z - WATKINS_CREEK_BASALT_ISLAND.z) / 6.6, 2),
  );
  const northShelf = Math.exp(-Math.pow((x + 31) / 14, 2) - Math.pow((z + 4) / 9, 2));
  const southShelf = Math.exp(-Math.pow((x - 34) / 14, 2) - Math.pow((z - 8) / 13, 2));
  const broken = terrainSurfaceNoise(x * 0.43 + 9, z * 0.45 - 6) * 0.5 + 0.5;
  const bankBand = creek.valley * (1 - creek.water) * (0.42 + broken * 0.28);
  return clamp01(Math.max(island * 0.94, northShelf * 0.72, southShelf * 0.68, bankBand));
}

export function watkinsCreekMoisture(x, z) {
  const creek = watkinsCreekChannelInfo(x, z);
  const shadedWest = Math.exp(-Math.pow((x + 27) / 18, 2) - Math.pow((z - 8) / 13, 2));
  const downstream = THREE.MathUtils.smoothstep(x, 4, 50) * creek.valley;
  return clamp01(
    creek.valley * 0.54
    + creek.water * 0.2
    + creek.mud * 0.24
    + creek.riparian * 0.22
    + shadedWest * 0.2
    + downstream * 0.08,
  );
}
