import { WATER_LEVEL } from './terrainShared';
import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  ASILO_SPRING,
  ASILO_SPRING_FORD,
  asiloSpringChannelInfo,
  asiloSpringPathInfo,
  asiloSpringRidgeInfo,
} from './regions/asiloSpring/path';
import { asiloSpringHeight } from './regions/asiloSpring/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#6b5d49',
  collide = false,
  ford = false,
}) {
  return {
    id,
    x,
    y: asiloSpringHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    collide,
    ford,
    // Highland tuff, not the dark coastal gravel RockField falls back to.
    materialKey: 'weatheredHighlandBasalt',
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

// Fallen tuff blocks at the foot of the seeping face frame the pool from the
// southern approach; their colliders keep players off the wet wall.
const HERO_ROCKS = [
  makeRock({ id: 'pool-head-block', x: -14.5, z: -11.6, radiusX: 2.2, radiusY: 1.5, radiusZ: 1.6, yaw: 0.3, sink: 0.24, color: '#6d5c45', collide: true }),
  makeRock({ id: 'pool-head-slab', x: -7.8, z: -13.4, radiusX: 2.6, radiusY: 1.1, radiusZ: 1.4, yaw: -0.2, sink: 0.2, color: '#5f513f', collide: true }),
  makeRock({ id: 'cleft-gatepost-west', x: -3.2, z: -18.5, radiusX: 1.6, radiusY: 1.9, radiusZ: 1.3, yaw: 0.6, sink: 0.22, color: '#74624a', collide: true }),
  makeRock({ id: 'cleft-gatepost-east', x: 4.6, z: -19.8, radiusX: 1.5, radiusY: 1.7, radiusZ: 1.2, yaw: -0.4, sink: 0.22, color: '#68583f', collide: true }),
  makeRock({ id: 'pool-west-boulder', x: -21.5, z: -6.8, radiusX: 1.7, radiusY: 1.0, radiusZ: 1.3, yaw: 1.1, sink: 0.18, color: '#5a4e3f', collide: true }),
  makeRock({ id: 'brook-east-shoulder', x: 21, z: -0.6, radiusX: 1.4, radiusY: 0.7, radiusZ: 1.0, yaw: -0.3, sink: 0.16, color: '#4f4b44', collide: true }),
];

let fordStones = null;

// Stepping stones across the brook below the pool. Render geometry and fixed
// colliders come from these same records.
export function getAsiloSpringFordStones() {
  if (fordStones) return fordStones;
  const centerZ = asiloSpringChannelInfo(ASILO_SPRING_FORD.x, ASILO_SPRING_FORD.z).centerZ;
  fordStones = Array.from({ length: 4 }, (_, index) => {
    const t = index / 3;
    const z = centerZ - 2.25 + t * 4.5;
    const x = ASILO_SPRING_FORD.x + Math.sin(t * Math.PI * 1.6 + 0.4) * 0.4;
    const bedY = asiloSpringHeight(x, z, { movementSurface: true });
    const sink = 0.025;
    const topY = WATER_LEVEL + 0.12 + seededRandom(index, 53) * 0.05;
    const radiusY = Math.max(0.22, (topY - bedY + sink * 2) * 0.5);
    return {
      id: `spring-ford-stone-${index}`,
      x,
      y: bedY,
      z,
      radiusX: 0.6 + seededRandom(index, 31) * 0.12,
      radiusY,
      radiusZ: 0.5 + seededRandom(index, 37) * 0.1,
      yaw: seededRandom(index, 41) * Math.PI,
      sink,
      color: index % 2 ? '#47463f' : '#5a5448',
      collide: true,
      ford: true,
      scale: Math.max(0.74, radiusY),
    };
  });
  return fordStones;
}

let rockCache = null;

export function getAsiloSpringRocks() {
  if (rockCache) return rockCache;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 70 && attempts < 7000) {
    attempts += 1;
    const i = attempts + 8311;
    const x = -54 + seededRandom(i, 3) * 108;
    const z = -46 + seededRandom(i, 9) * 92;
    const path = asiloSpringPathInfo(x, z);
    const brook = asiloSpringChannelInfo(x, z);
    const ridge = asiloSpringRidgeInfo(x, z);
    if (path.distance < path.width * 1.35) continue;
    if (brook.water > 0.15) continue;
    const bankCandidate = brook.valley > 0.36 && brook.gravel + brook.riparian > 0.2;
    const ridgeCandidate = ridge.face > 0.3 || ridge.top > 0.4;
    if (!bankCandidate && !ridgeCandidate) continue;
    if (seededRandom(i, 13) > (ridgeCandidate ? 0.42 : 0.26)) continue;
    const tone = seededRandom(i, 17);
    const scale = 0.22 + tone * (ridgeCandidate ? 0.78 : 0.42);
    rocks.push(makeRock({
      id: `spring-tuff-${rocks.length}`,
      x,
      z,
      radiusX: scale * (0.9 + seededRandom(i, 21) * 0.6),
      radiusY: scale * (0.32 + seededRandom(i, 23) * 0.34),
      radiusZ: scale * (0.72 + seededRandom(i, 25) * 0.58),
      yaw: seededRandom(i, 27) * Math.PI * 2,
      sink: scale * 0.18,
      color: ridgeCandidate
        ? (tone > 0.5 ? '#76654c' : '#5e5241')
        : (tone > 0.5 ? '#5e5f57' : '#43463f'),
      collide: scale > 0.66,
    }));
  }
  rockCache = [...rocks, ...getAsiloSpringFordStones()];
  return rockCache;
}

export function getAsiloSpringRockObstacles() {
  return buildRockObstacles(getAsiloSpringRocks(), {
    zoneId: ASILO_SPRING,
    idPrefix: 'asilo-spring',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    traversalLabel: 'step across weathered tuff',
    climbLabel: 'spring-side tuff block',
    pushFriction: 0.94,
    filter: rock => rock.collide === true,
  });
}
