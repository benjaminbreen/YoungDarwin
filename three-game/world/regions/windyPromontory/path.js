import * as THREE from 'three';
import { pathFrameAt, pathShoulderMask } from '../../paths/standardPath';
import {
  pointSegmentDistance,
  smoothMin,
  terrainSurfaceNoise,
} from '../../terrainShared';

export const WINDY_PROMONTORY = 'SE_PROMONTORY';

// The Windy Promontory: the high southeastern shoulder of the island where
// the land climbs out of the wetlands and the Watkins ravine onto a bare
// crown, then stops at sea cliffs on the east and south. The trade wind
// comes off the sea from the southeast and has the place to itself: the
// grass is combed flat, the scrub grows shorn and leaning away from it, and
// the ledges of old lava are scoured bare. Below the south cliff lies a small
// cove beach that cannot be reached from above; offshore, stacks of the same
// lava stand in the swell.
//
// Mask functions here are mirrored in material.js GLSL. Change both together.

// Trails: the ravine path up from Watkins in the north, the wetland track
// climbing from the west, and spurs out to the two cliff lookouts.
const RAVINE_TRAIL = [
  [2, -45, 1.3],
  [2.6, -36, 1.34],
  [5.2, -26, 1.38],
  [8.6, -16, 1.42],
  [11.4, -7, 1.46],
  [14.5, -2.5, 1.5],
];

const WETLAND_TRAIL = [
  [-48, 11, 1.4],
  [-37, 10, 1.4],
  [-25, 6.4, 1.42],
  [-13, 1.8, 1.44],
  [-1.5, -3.6, 1.46],
  [8, -5.8, 1.48],
  [14.5, -2.5, 1.5],
];

const EAST_LOOKOUT_SPUR = [
  [14.5, -2.5, 1.36],
  [21, -1.4, 1.26],
  [27, -2.6, 1.16],
];

const COVE_LOOKOUT_SPUR = [
  [-1.5, -3.6, 1.3],
  [-5, 5, 1.24],
  [-10.4, 12.6, 1.16],
];

export const WINDY_PROMONTORY_PATH_POINTS = [
  RAVINE_TRAIL,
  WETLAND_TRAIL,
  EAST_LOOKOUT_SPUR,
  COVE_LOOKOUT_SPUR,
];

export const WINDY_PROMONTORY_ENTRY_SPAWNS = {
  north: [2, 0, -42.4],
  west: [-45.4, 0, 10.8],
};

export const EAST_LOOKOUT = { x: 27, z: -2.6 };
export const COVE_LOOKOUT = { x: -10.4, z: 12.6 };

// The crown of the promontory: broad, a little east of centre.
export const CROWN = { x: 12, z: -3, rx: 27, rz: 25, height: 9.4 };

export const SEA_STACKS = [
  { id: 'north-stack', x: 41.5, z: -19, rx: 2.6, rz: 3.2, height: 13.5 },
  { id: 'tip-stack', x: 46, z: 1.5, rx: 3.4, rz: 2.8, height: 16 },
  { id: 'arch-stack', x: 39.5, z: 23, rx: 2.2, rz: 2.6, height: 10.5 },
  { id: 'cove-stack', x: -7, z: 38.5, rx: 2.4, rz: 2.2, height: 8.5 },
];

export const POCKET_COVE = { x: -14, halfWidth: 6.4 };

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function windyPromontoryEastCoastX(z) {
  return 33.4
    + Math.sin(z * 0.11 + 0.4) * 1.8
    + Math.sin(z * 0.29 - 1.0) * 0.7
    + Math.exp(-Math.pow((z + 4) / 9, 2)) * 5
    - Math.exp(-Math.pow((z - 14) / 4.6, 2)) * 3.6;
}

export function windyPromontorySouthCoastZ(x) {
  return 33
    + Math.sin(x * 0.1 + 0.6) * 1.6
    + Math.sin(x * 0.27) * 0.7
    - Math.exp(-Math.pow((x - POCKET_COVE.x) / 7.5, 2)) * 9
    + Math.exp(-Math.pow((x - 20) / 8, 2)) * 2.5;
}

// Signed distance-ish from the sea: positive on land, negative offshore.
export function windyPromontoryCoastDistance(x, z) {
  return smoothMin(
    windyPromontoryEastCoastX(z) - x,
    windyPromontorySouthCoastZ(x) - z,
    3,
  );
}

// The beach strip at the foot of the south cliff in the cove.
export function windyPromontoryBeachWidth(x) {
  return 5.6 * Math.exp(-Math.pow((x - POCKET_COVE.x) / POCKET_COVE.halfWidth, 2));
}

export function windyPromontoryCliffFace(x, z) {
  const d = windyPromontoryCoastDistance(x, z) - windyPromontoryBeachWidth(x);
  return clamp01(1 - THREE.MathUtils.smoothstep(d, 0.4, 4.2));
}

// The crumbling rim: the last few metres of turf before the drop, where the
// wind strips soil off the lava and the scrub gives up.
export function windyPromontoryRimMask(x, z) {
  const d = windyPromontoryCoastDistance(x, z) - windyPromontoryBeachWidth(x);
  return clamp01(THREE.MathUtils.smoothstep(d, 2.6, 4.6) * (1 - THREE.MathUtils.smoothstep(d, 8, 13)));
}

export function windyPromontoryCrownMask(x, z) {
  const dx = (x - CROWN.x) / CROWN.rx;
  const dz = (z - CROWN.z) / CROWN.rz;
  return Math.exp(-(dx * dx + dz * dz) * 1.6);
}

// How hard the trade wind hits: open ground near the sea and on the crown,
// less in the ravine and the low western fold.
export function windyPromontoryExposure(x, z) {
  const coast = 1 - THREE.MathUtils.smoothstep(windyPromontoryCoastDistance(x, z), 4, 26);
  const crown = windyPromontoryCrownMask(x, z);
  const westFold = Math.exp(-Math.pow((x + 32) / 14, 2) - Math.pow((z - 2) / 18, 2));
  return clamp01(coast * 0.7 + crown * 0.55 - westFold * 0.45 - windyPromontoryRavineMask(x, z) * 0.5);
}

export function windyPromontoryRavineMask(x, z) {
  let best = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const [ax, az] = RAVINE_TRAIL[i];
    const [bx, bz] = RAVINE_TRAIL[i + 1];
    best = Math.min(best, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const wobble = terrainSurfaceNoise(x * 0.3 + 4, z * 0.3 - 2) * 0.8;
  return clamp01(1 - THREE.MathUtils.smoothstep(best + wobble, 2.2, 7.4));
}

// Bare lava ledges: the stepped outcrops where the old flows show through
// the thin soil, strongest on the crown's seaward shoulder.
export function windyPromontoryLedgeMask(x, z) {
  const field = terrainSurfaceNoise(x * 0.07 + 11, z * 0.08 - 6) * 0.5 + 0.5;
  const seaward = THREE.MathUtils.smoothstep(x, -12, 18);
  return clamp01(THREE.MathUtils.smoothstep(field, 0.42, 0.7) * (0.4 + seaward * 0.6) + windyPromontoryRimMask(x, z) * 0.4);
}

export function windyPromontoryPathInfo(x, z) {
  const frame = pathFrameAt(WINDY_PROMONTORY_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.2 + frame.centerX * 0.06) * 0.18
    + terrainSurfaceNoise(x * 0.72 + 3, z * 0.72 - 8) * 0.18;
  const width = Math.max(1.16, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.15, width * 0.42);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.33, width * 0.84);
  const shoulder = pathShoulderMask(frame, x, z, width);
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
