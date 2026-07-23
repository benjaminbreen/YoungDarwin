import { pointSegmentDistance } from '../../terrainShared';
import {
  BLACK_BEACH_WESTERN_LOWLANDS_SEAM,
  WESTERN_LOWLANDS_BEACH_HUT_SEAM,
  WESTERN_LOWLANDS_WESTERN_HIGHLANDS_SEAM,
} from '../../routeSeams';

export const WESTERN_LOWLANDS = 'W_LAVA';

const north = BLACK_BEACH_WESTERN_LOWLANDS_SEAM.target.point;
const east = WESTERN_LOWLANDS_WESTERN_HIGHLANDS_SEAM.source.point;
const south = WESTERN_LOWLANDS_BEACH_HUT_SEAM.source.point;

export const WESTERN_LOWLANDS_PATHS = Object.freeze([
  Object.freeze({
    id: 'black-beach-to-beach-hut',
    width: 2.25,
    points: Object.freeze([
      Object.freeze([north[0], north[1]]),
      Object.freeze([18, -35]),
      Object.freeze([13, -22]),
      Object.freeze([9, -9]),
      Object.freeze([10, 7]),
      Object.freeze([20, 22]),
      Object.freeze([31, 36]),
      Object.freeze([south[0], south[1]]),
    ]),
  }),
  Object.freeze({
    id: 'western-highlands-branch',
    width: 2.15,
    points: Object.freeze([
      Object.freeze([9, -9]),
      Object.freeze([23, -10]),
      Object.freeze([38, -11]),
      Object.freeze([east[0], east[1]]),
    ]),
  }),
  Object.freeze({
    id: 'whaler-camp-spur',
    width: 1.65,
    points: Object.freeze([
      Object.freeze([10, 7]),
      Object.freeze([15, 5]),
      Object.freeze([23, 2]),
      Object.freeze([31, -1]),
    ]),
  }),
  Object.freeze({
    id: 'boat-haul',
    width: 1.45,
    points: Object.freeze([
      Object.freeze([-31, 10]),
      Object.freeze([-20, 9]),
      Object.freeze([-8, 8]),
      Object.freeze([10, 7]),
    ]),
  }),
]);

function distanceToPath(x, z, path) {
  let distance = Infinity;
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const [ax, az] = path.points[index];
    const [bx, bz] = path.points[index + 1];
    distance = Math.min(distance, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  return distance;
}

export function westernLowlandsPathInfo(x, z) {
  let nearest = null;
  for (const path of WESTERN_LOWLANDS_PATHS) {
    const distance = distanceToPath(x, z, path);
    if (!nearest || distance < nearest.distance) nearest = { path, distance };
  }
  const width = nearest?.path.width || 2;
  const distance = nearest?.distance ?? Infinity;
  return {
    id: nearest?.path.id || null,
    distance,
    width,
    center: Math.max(0, 1 - distance / Math.max(0.1, width * 0.48)),
    tread: Math.max(0, 1 - distance / Math.max(0.1, width)),
    shoulder: Math.max(0, 1 - distance / Math.max(0.1, width * 2.15)),
  };
}

export function westernLowlandsCampBenchMask(x, z) {
  const cabin = Math.exp(-(((x - 17) / 13) ** 2 + ((z - 5) / 10) ** 2));
  const pen = Math.exp(-(((x - 30) / 10) ** 2 + ((z + 2) / 8) ** 2));
  return Math.max(cabin, pen);
}
