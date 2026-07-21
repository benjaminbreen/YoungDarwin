import { WATER_LEVEL } from './terrainShared';
import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  WATKINS_CREEK,
  WATKINS_CREEK_FORD,
  watkinsCreekBasaltExposure,
  watkinsCreekChannelInfo,
  watkinsCreekPathInfo,
} from './regions/watkinsCreek/path';
import { watkinsCreekHeight } from './regions/watkinsCreek/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#4b4d47',
  collide = false,
  ford = false,
}) {
  return {
    id,
    x,
    y: watkinsCreekHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    collide,
    ford,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'fork-island-west', x: -0.5, z: 5.1, radiusX: 1.7, radiusY: 0.72, radiusZ: 1.18, yaw: 0.35, sink: 0.18, collide: true }),
  makeRock({ id: 'fork-island-center', x: 4.2, z: 5.6, radiusX: 2.05, radiusY: 0.86, radiusZ: 1.42, yaw: -0.28, sink: 0.2, collide: true }),
  makeRock({ id: 'fork-island-east', x: 9.2, z: 4.8, radiusX: 1.42, radiusY: 0.62, radiusZ: 1.08, yaw: 0.62, sink: 0.16, collide: true }),
  makeRock({ id: 'west-bank-marker', x: -34, z: -4.8, radiusX: 1.35, radiusY: 0.64, radiusZ: 1.02, yaw: -0.5, sink: 0.16, collide: true }),
  makeRock({ id: 'north-bank-block', x: -18.5, z: -3.8, radiusX: 1.5, radiusY: 0.7, radiusZ: 1.08, yaw: 0.42, sink: 0.18, collide: true }),
  makeRock({ id: 'east-pool-shoulder', x: 28.5, z: -10.4, radiusX: 1.7, radiusY: 0.82, radiusZ: 1.18, yaw: -0.36, sink: 0.19, collide: true }),
  makeRock({ id: 'south-route-shoulder', x: 10.5, z: 25, radiusX: 1.45, radiusY: 0.66, radiusZ: 1.05, yaw: 0.24, sink: 0.17, collide: true }),
];

let fordStones = null;

// Five broad, irregular stones form the authored ford. Their render geometry
// and fixed colliders come from these same records.
export function getWatkinsCreekFordStones() {
  if (fordStones) return fordStones;
  const centerZ = watkinsCreekChannelInfo(WATKINS_CREEK_FORD.x, WATKINS_CREEK_FORD.z).centerZ;
  fordStones = Array.from({ length: 5 }, (_, index) => {
    const t = index / 4;
    const z = centerZ - 3.15 + t * 6.3;
    const x = WATKINS_CREEK_FORD.x + Math.sin(t * Math.PI * 1.8 + 0.35) * 0.48;
    const bedY = watkinsCreekHeight(x, z, { movementSurface: true });
    const sink = 0.025;
    const topY = WATER_LEVEL + 0.12 + seededRandom(index, 47) * 0.06;
    const radiusY = Math.max(0.22, (topY - bedY + sink * 2) * 0.5);
    return {
      id: `ford-stone-${index}`,
      x,
      y: bedY,
      z,
      radiusX: 0.62 + seededRandom(index, 31) * 0.14,
      radiusY,
      radiusZ: 0.52 + seededRandom(index, 37) * 0.12,
      yaw: seededRandom(index, 41) * Math.PI,
      sink,
      color: index % 2 ? '#414641' : '#555850',
      collide: true,
      ford: true,
      scale: Math.max(0.76, radiusY),
    };
  });
  return fordStones;
}

let rockCache = null;

export function getWatkinsCreekRocks() {
  if (rockCache) return rockCache;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 88 && attempts < 7600) {
    attempts += 1;
    const i = attempts + 6029;
    const x = -52 + seededRandom(i, 3) * 104;
    const z = -44 + seededRandom(i, 9) * 88;
    const path = watkinsCreekPathInfo(x, z);
    const creek = watkinsCreekChannelInfo(x, z);
    const exposure = watkinsCreekBasaltExposure(x, z);
    if (path.distance < path.width * 1.34) continue;
    if (creek.water > 0.2 && exposure < 0.66) continue;
    const bankCandidate = creek.valley > 0.34 && creek.water < 0.18;
    if (exposure < 0.44 && !bankCandidate) continue;
    if (seededRandom(i, 13) > 0.24 + exposure * 0.5 + (bankCandidate ? 0.14 : 0)) continue;
    const tone = seededRandom(i, 17);
    const scale = 0.2 + tone * (exposure > 0.68 ? 0.82 : 0.5);
    rocks.push(makeRock({
      id: `creek-weathered-basalt-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 21) * 0.6),
      radiusY: scale * (0.3 + seededRandom(i, 23) * 0.34),
      radiusZ: scale * (0.72 + seededRandom(i, 25) * 0.58),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.18,
      color: tone > 0.64 ? '#66675f' : tone > 0.34 ? '#4c504b' : '#343a37',
      collide: exposure > 0.7 && scale > 0.72,
    }));
  }
  rockCache = [...rocks, ...getWatkinsCreekFordStones()];
  return rockCache;
}

export function getWatkinsCreekRockObstacles() {
  return buildRockObstacles(getWatkinsCreekRocks(), {
    zoneId: WATKINS_CREEK,
    idPrefix: 'watkins-creek',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    traversalLabel: 'step across weathered basalt',
    climbLabel: 'creek-side basalt block',
    pushFriction: 0.94,
    filter: rock => rock.collide === true,
  });
}
