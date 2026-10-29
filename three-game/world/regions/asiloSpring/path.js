import * as THREE from 'three';
import { pathFrameAt, pathShoulderMask } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  ASILO_SPRING_BEACH_HUT_SEAM,
  ASILO_SPRING_MANGROVES_SEAM,
  ASILO_SPRING_PENAL_COLONY_SEAM,
  WESTERN_HIGHLANDS_ASILO_SPRING_SEAM,
} from '../../routeSeams';

export const ASILO_SPRING = 'ASILO_SPRING';

// Highland Spring (region 112 x 98; north = -z). Fresh water rises in a pool
// at the foot of a crescent of weathered tuff, the island's one dependable
// highland water. The pool drains east as a brook toward the colony and
// sheds a smaller branch south toward the southern forest. The trail from the
// western highlands comes down through a narrow cleft in the tuff; the others
// follow the brook and meet at a stepping-stone ford below the pool.
export const ASILO_SPRING_POOL = Object.freeze({ x: -8, z: -2 });
export const ASILO_SPRING_FORD = Object.freeze({ x: 4.2, z: 1.1 });
export const ASILO_SPRING_NORTH_JUNCTION = Object.freeze({ x: 0.5, z: -8.5 });
export const ASILO_SPRING_SOUTH_JUNCTION = Object.freeze({ x: -6, z: 9 });

// [x, z, wet half-width]. The first wide segments are the spring pool.
export const ASILO_SPRING_CHANNELS = [
  [
    [-15.5, -3.6, 4.6],
    [-11, -2.8, 6.2],
    [-5, -1.6, 5.8],
    [-0.5, -0.4, 3.8],
    [ASILO_SPRING_FORD.x, ASILO_SPRING_FORD.z, 2.1],
    [15, 3.6, 1.85],
    [28, 5.6, 1.75],
    [42, 7.6, 1.8],
    [57, 9.2, 1.9],
  ],
  [
    [15, 3.6, 1.6],
    [13, 14, 1.55],
    [10.5, 26, 1.6],
    [9, 38, 1.65],
    [8.6, 50, 1.7],
  ],
];

export const ASILO_SPRING_NORTH_PATH = [
  [...WESTERN_HIGHLANDS_ASILO_SPRING_SEAM.target.point, 1.72],
  [3.2, -38, 1.66],
  [1.2, -27, 1.6],
  [-0.6, -17, 1.58],
  [ASILO_SPRING_NORTH_JUNCTION.x, ASILO_SPRING_NORTH_JUNCTION.z, 1.66],
];

export const ASILO_SPRING_PATH_POINTS = [
  ASILO_SPRING_NORTH_PATH,
  [
    [...ASILO_SPRING_PENAL_COLONY_SEAM.target.point, 1.7],
    [44, 0.4, 1.66],
    [30, -2, 1.62],
    [17, -3.6, 1.62],
    [7, -6, 1.64],
    [ASILO_SPRING_NORTH_JUNCTION.x, ASILO_SPRING_NORTH_JUNCTION.z, 1.66],
  ],
  // Junction to junction across the ford below the pool.
  [
    [ASILO_SPRING_NORTH_JUNCTION.x, ASILO_SPRING_NORTH_JUNCTION.z, 1.66],
    [3.4, -3.6, 1.6],
    [ASILO_SPRING_FORD.x, ASILO_SPRING_FORD.z, 1.62],
    [1.2, 5.6, 1.6],
    [ASILO_SPRING_SOUTH_JUNCTION.x, ASILO_SPRING_SOUTH_JUNCTION.z, 1.66],
  ],
  [
    [ASILO_SPRING_SOUTH_JUNCTION.x, ASILO_SPRING_SOUTH_JUNCTION.z, 1.66],
    [-3, 20, 1.62],
    [-1.5, 31, 1.6],
    [-3, 41, 1.6],
    [...ASILO_SPRING_MANGROVES_SEAM.target.point, 1.62],
  ],
  [
    [...ASILO_SPRING_BEACH_HUT_SEAM.target.point, 1.64],
    [-46, -26, 1.6],
    [-37, -13, 1.58],
    [-27, 0, 1.6],
    [-16, 8, 1.62],
    [ASILO_SPRING_SOUTH_JUNCTION.x, ASILO_SPRING_SOUTH_JUNCTION.z, 1.66],
  ],
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function band(value, innerStart, innerEnd, outerStart, outerEnd) {
  return THREE.MathUtils.smoothstep(value, innerStart, innerEnd)
    * (1 - THREE.MathUtils.smoothstep(value, outerStart, outerEnd));
}

function pathInfoFor(points, x, z) {
  const frame = pathFrameAt(points, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.2 + frame.centerX * 0.12) * 0.18
    + Math.sin(along * 0.08 - frame.centerZ * 0.18) * 0.14
    + terrainSurfaceNoise(x * 0.72 + 2, z * 0.7 - 6) * 0.2;
  const width = Math.max(1.6, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.38, width * 0.84);
  const shoulder = pathShoulderMask(frame, x, z, width);
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

export function asiloSpringPathInfo(x, z) {
  return pathInfoFor(ASILO_SPRING_PATH_POINTS, x, z);
}

// Distance from the cleft trail alone; the ridge is cut away along it.
export function asiloSpringCleftMask(x, z) {
  const frame = pathFrameAt([ASILO_SPRING_NORTH_PATH], x, z);
  return 1 - THREE.MathUtils.smoothstep(frame.distance, 2.4, 7.2);
}

export function asiloSpringChannelInfo(x, z) {
  const frame = pathFrameAt(ASILO_SPRING_CHANNELS, x, z);
  const bankNoise = terrainSurfaceNoise(x * 0.11 + 4, z * 0.12 - 7) * 1.3;
  const wetHalfWidth = Math.max(1.5, frame.width + bankNoise * 0.18);
  const shoreDistance = frame.distance - wetHalfWidth;
  const outer = wetHalfWidth + 10;
  const t = clamp01(1 - (frame.distance + bankNoise) / outer);
  const cross = Math.pow(t, 1.4);
  const water = 1 - THREE.MathUtils.smoothstep(shoreDistance, -0.18, 0.5);
  const pool = Math.exp(
    -Math.pow((x - ASILO_SPRING_POOL.x) / 9.5, 2)
    -Math.pow((z - ASILO_SPRING_POOL.z) / 6.5, 2),
  );
  const ford = Math.exp(
    -Math.pow((x - ASILO_SPRING_FORD.x) / 3.4, 2)
    -Math.pow((z - ASILO_SPRING_FORD.z) / 3.2, 2),
  );
  return {
    ...frame,
    flowX: Math.cos(frame.yaw),
    flowZ: Math.sin(frame.yaw),
    flowSpeed: clamp01(0.5 + ford * 0.3 - pool * 0.45),
    wetHalfWidth,
    shoreDistance,
    cross,
    water: clamp01(water),
    submergedShelf: clamp01(band(shoreDistance, -1.3, -0.65, 0.08, 0.6)),
    shoreline: clamp01(1 - THREE.MathUtils.smoothstep(Math.abs(shoreDistance), 0.08, 0.9)),
    mud: clamp01(band(shoreDistance, -0.5, -0.08, 1.1, 1.85)),
    gravel: clamp01(band(shoreDistance, 0.6, 1.1, 2.6, 3.9)),
    riparian: clamp01(band(shoreDistance, 1.6, 2.5, 5.4, 7.6)),
    valley: clamp01(THREE.MathUtils.smoothstep(cross, 0.035, 0.56)),
    pool: clamp01(pool),
    ford: clamp01(ford),
  };
}

export function asiloSpringStandingWaterMask(x, z) {
  const brook = asiloSpringChannelInfo(x, z);
  return 1 - THREE.MathUtils.smoothstep(brook.shoreDistance, -0.36, 0.78);
}

export function asiloSpringStandingWaterSuppressionMask(x, z) {
  const brook = asiloSpringChannelInfo(x, z);
  return 1 - THREE.MathUtils.smoothstep(brook.shoreDistance, 0.35, 2.5);
}

export function asiloSpringFlowAt(x, z) {
  const brook = asiloSpringChannelInfo(x, z);
  return { x: brook.flowX, z: brook.flowZ, speed: brook.flowSpeed };
}

// The crescent of tuff that shelters the pool on the north. `face` is the
// steep inner wall above the water, `top` the Scalesia-covered crest behind.
export function asiloSpringRidgeInfo(x, z) {
  const dx = x - ASILO_SPRING_POOL.x;
  const dz = z - ASILO_SPRING_POOL.z;
  const d = Math.hypot(dx, dz);
  const dirX = d > 0.001 ? dx / d : 0;
  const dirZ = d > 0.001 ? dz / d : 1;
  const facing = dirX * -0.2 + dirZ * -0.98;
  const wander = terrainSurfaceNoise(dirX * 2.6 + 3, dirZ * 2.6 - 8) * 1.4;
  const window = THREE.MathUtils.smoothstep(facing, 0.3, 0.74);
  const rise = THREE.MathUtils.smoothstep(d, 10.5 + wander, 15.5 + wander);
  const fall = 1 - THREE.MathUtils.smoothstep(d, 27, 40);
  const cleft = asiloSpringCleftMask(x, z);
  const mass = clamp01(window * rise * fall * (1 - cleft));
  const face = clamp01(window * band(d, 9.5 + wander, 11 + wander, 15 + wander, 17.5 + wander) * (1 - cleft * 0.8));
  return {
    distance: d,
    window,
    mass,
    face,
    top: clamp01(mass * THREE.MathUtils.smoothstep(d, 16 + wander, 19 + wander)),
    cleft,
  };
}

export function asiloSpringMoisture(x, z) {
  const brook = asiloSpringChannelInfo(x, z);
  const ridge = asiloSpringRidgeInfo(x, z);
  const shadedFoot = ridge.window * band(ridge.distance, 6, 9, 14, 20) * 0.32;
  return clamp01(
    0.26
    + brook.valley * 0.46
    + brook.water * 0.18
    + brook.mud * 0.2
    + brook.riparian * 0.2
    + brook.pool * 0.18
    + shadedFoot
    + ridge.top * 0.16,
  );
}
