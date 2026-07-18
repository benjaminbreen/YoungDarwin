import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  NORTHERN_HIGHLANDS,
  northernHighlandsBasaltExposure,
  northernHighlandsGardenInfo,
  northernHighlandsPathInfo,
} from './regions/northernHighlands/path';
import { northernHighlandsHeight } from './regions/northernHighlands/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#50514a',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: northernHighlandsHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'west-approach-marker', x: -39, z: 13, radiusX: 1.4, radiusY: 0.68, radiusZ: 1.02, yaw: 0.46, sink: 0.17, obstacle: true }),
  makeRock({ id: 'north-weathered-shelf', x: -11, z: -31, radiusX: 1.3, radiusY: 0.58, radiusZ: 0.96, yaw: -0.28, sink: 0.15, obstacle: true }),
  makeRock({ id: 'east-route-block', x: 34, z: 5, radiusX: 1.16, radiusY: 0.54, radiusZ: 0.9, yaw: 0.72, sink: 0.14 }),
  makeRock({ id: 'junction-west-stone', x: -10, z: 14, radiusX: 1.02, radiusY: 0.45, radiusZ: 0.78, yaw: -0.52, sink: 0.12 }),
  makeRock({ id: 'garden-edge-stone', x: 28.5, z: 13.2, radiusX: 1.22, radiusY: 0.58, radiusZ: 0.88, yaw: 0.31, sink: 0.14, obstacle: true }),
  makeRock({ id: 'south-browse-block', x: -16, z: 31.5, radiusX: 1.5, radiusY: 0.72, radiusZ: 1.08, yaw: 0.58, sink: 0.18, obstacle: true }),
  makeRock({ id: 'hollow-weathered-stone', x: -23, z: 42, radiusX: 1.08, radiusY: 0.48, radiusZ: 0.82, yaw: -0.62, sink: 0.13 }),
  makeRock({ id: 'southeast-shoulder', x: 34, z: 38, radiusX: 1.34, radiusY: 0.63, radiusZ: 1.0, yaw: 0.22, sink: 0.16, obstacle: true }),
];

let rocksCache = null;

export function getNorthernHighlandsRocks() {
  if (rocksCache) return rocksCache;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 64 && attempts < 5600) {
    attempts += 1;
    const i = attempts + 3907;
    const x = -52 + seededRandom(i, 3) * 104;
    const z = -48 + seededRandom(i, 9) * 96;
    const path = northernHighlandsPathInfo(x, z);
    if (path.distance < path.width * 1.32) continue;
    if (northernHighlandsGardenInfo(x, z).mask > 0.04) continue;
    const exposure = northernHighlandsBasaltExposure(x, z);
    const shoulderStone = path.shoulder > 0.18 || path.distance < path.width * 2.5;
    if (exposure < 0.44 && !shoulderStone) continue;
    if (seededRandom(i, 13) > 0.25 + exposure * 0.54 + (shoulderStone ? 0.12 : 0)) continue;
    const tone = seededRandom(i, 17);
    const scale = 0.2 + tone * (exposure > 0.66 ? 0.74 : 0.46);
    rocks.push(makeRock({
      id: `northern-highlands-basalt-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 21) * 0.58),
      radiusY: scale * (0.3 + seededRandom(i, 23) * 0.32),
      radiusZ: scale * (0.72 + seededRandom(i, 25) * 0.58),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.18,
      color: tone > 0.64 ? '#65635a' : tone > 0.34 ? '#4e5049' : '#383b37',
      obstacle: exposure > 0.7 && scale > 0.7,
    }));
  }
  rocksCache = rocks;
  return rocksCache;
}

export function getNorthernHighlandsRockObstacles() {
  return buildRockObstacles(getNorthernHighlandsRocks(), {
    zoneId: NORTHERN_HIGHLANDS,
    idPrefix: 'northern-highlands',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over weathered basalt',
    climbLabel: 'highlands lava block',
    pushFriction: 0.9,
    filter: rock => rock.obstacle === true && rock.radiusY > 0.5,
  });
}
