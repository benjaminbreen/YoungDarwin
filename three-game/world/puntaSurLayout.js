import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  PUNTA_SUR,
  puntaSurBasaltExposure,
  puntaSurCoastDistance,
  puntaSurGullyMask,
  puntaSurPathInfo,
  puntaSurRedEarthMask,
  puntaSurRimMask,
  puntaSurRockRibMask,
  puntaSurWaterEntryMask,
} from './regions/puntaSur/path';
import { puntaSurHeight } from './regions/puntaSur/terrain';

function makeRock({ id, x, z, radiusX, radiusY, radiusZ, yaw = 0, sink = 0.12, color = '#37413d', materialKey = 'weatheredHighlandBasalt', obstacle = false }) {
  return { id, x, y: puntaSurHeight(x, z), z, radiusX, radiusY, radiusZ, yaw, sink, color, materialKey, obstacle, scale: Math.max(radiusX, radiusY, radiusZ) };
}

const HERO_ROCKS = [
  makeRock({ id: 'west-cape-block', x: -26, z: 17, radiusX: 1.72, radiusY: 0.82, radiusZ: 1.18, yaw: 0.42, obstacle: true, color: '#4f3c32', materialKey: 'oxidizedScoriaceousBasalt' }),
  makeRock({ id: 'west-rain-polished', x: -15, z: 24, radiusX: 1.34, radiusY: 0.7, radiusZ: 0.96, yaw: -0.66, obstacle: true, color: '#293330' }),
  makeRock({ id: 'lookout-split-block', x: 11, z: 25, radiusX: 1.42, radiusY: 0.74, radiusZ: 1.08, yaw: 0.3, obstacle: true, color: '#58443a', materialKey: 'oxidizedScoriaceousBasalt' }),
  makeRock({ id: 'east-cape-oxide', x: 23, z: 25, radiusX: 1.64, radiusY: 0.82, radiusZ: 1.14, yaw: -0.48, obstacle: true, color: '#704735', materialKey: 'oxidizedScoriaceousBasalt' }),
  makeRock({ id: 'east-descent-marker', x: 36, z: 15, radiusX: 1.02, radiusY: 0.5, radiusZ: 0.78, yaw: 0.74, obstacle: true, color: '#4b3d35' }),
  makeRock({ id: 'inland-rib-slab', x: -9, z: -15, radiusX: 1.9, radiusY: 0.68, radiusZ: 1.1, yaw: -0.2, obstacle: true, color: '#6b4939', materialKey: 'oxidizedScoriaceousBasalt' }),
];

const OUTCROP_ROCKS = [
  [-18.2, 19.2, 0.86, 0.38, 0.58, 0.2], [-16.1, 21.1, 0.64, 0.31, 0.48, -0.5],
  [-12.8, 20.2, 0.76, 0.36, 0.52, 0.65], [-11.4, 23.1, 0.55, 0.28, 0.43, -0.25],
  [15.4, 24.4, 0.92, 0.42, 0.61, 0.4], [18.1, 22.6, 0.61, 0.3, 0.5, -0.7],
  [20.2, 26.2, 0.74, 0.34, 0.55, 0.1], [-11.8, -18.3, 0.72, 0.32, 0.5, 0.55],
  [-7.2, -14.2, 0.58, 0.26, 0.44, -0.35],
].map(([x, z, radiusX, radiusY, radiusZ, yaw], index) => makeRock({
  id: `weathered-outcrop-${index}`,
  x, z, radiusX, radiusY, radiusZ, yaw,
  color: index % 3 === 0 ? '#774a35' : '#51423a',
  materialKey: index % 3 === 0 ? 'oxidizedScoriaceousBasalt' : 'weatheredHighlandBasalt',
  obstacle: radiusY > 0.34,
}));

const ROCK_CLUSTER_CENTERS = [
  [-25, 17, 8.5], [-14, 23, 7.5], [17, 24, 8], [27, 20, 7], [-9, -16, 8.5],
];

let rocksCache = null;

export function getPuntaSurRocks() {
  if (rocksCache) return rocksCache;
  const rocks = [...HERO_ROCKS, ...OUTCROP_ROCKS];
  let attempts = 0;
  while (rocks.length < 66 && attempts < 9000) {
    attempts += 1;
    const seed = attempts + 23117;
    const x = -43 + seededRandom(seed, 3) * 86;
    const z = -29 + seededRandom(seed, 7) * 63;
    const coast = puntaSurCoastDistance(x, z);
    if (coast < 4.8 || coast > 29 || puntaSurWaterEntryMask(x, z) > 0.12) continue;
    const path = puntaSurPathInfo(x, z);
    if (path.distance < path.width * 1.75) continue;
    const rim = puntaSurRimMask(x, z);
    const rib = puntaSurRockRibMask(x, z);
    const gully = puntaSurGullyMask(x, z);
    const erosion = puntaSurRedEarthMask(x, z);
    const habitat = Math.max(rim * 0.82, rib, gully * 0.74, puntaSurBasaltExposure(x, z) * 0.42);
    const cluster = ROCK_CLUSTER_CENTERS.reduce((best, [cx, cz, radius]) => (
      Math.max(best, Math.exp(-Math.pow(Math.hypot(x - cx, z - cz) / radius, 2)))
    ), 0);
    if (Math.max(habitat, cluster) < 0.28 || seededRandom(seed, 11) > 0.1 + habitat * 0.48 + cluster * 0.42) continue;
    const roll = seededRandom(seed, 13);
    const base = roll > 0.79 ? 0.58 + seededRandom(seed, 17) * 0.62 : 0.2 + roll * 0.46;
    const radiusX = base * (0.9 + seededRandom(seed, 19) * 0.62);
    const radiusY = base * (0.34 + seededRandom(seed, 23) * 0.36);
    const radiusZ = base * (0.72 + seededRandom(seed, 29) * 0.65);
    const footprint = Math.max(radiusX, radiusZ);
    if (path.distance < path.width * 1.35 + footprint + 0.7) continue;
    if (rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) < Math.max(0.9, (footprint + Math.max(rock.radiusX, rock.radiusZ)) * 0.62))) continue;
    const tone = seededRandom(seed, 31);
    const oxidized = erosion > 0.48 ? tone > 0.34 : tone > 0.76;
    rocks.push(makeRock({
      id: `cape-basalt-${rocks.length}`,
      x, z, radiusX, radiusY, radiusZ,
      yaw: seededRandom(seed, 37) * Math.PI * 2,
      sink: Math.min(0.22, base * 0.2),
      color: oxidized ? (tone > 0.72 ? '#7b4a34' : '#654638') : tone < 0.24 ? '#29332f' : '#4c4b43',
      materialKey: oxidized ? 'oxidizedScoriaceousBasalt' : tone < 0.24 ? 'darkBasaltGravel' : 'weatheredHighlandBasalt',
      obstacle: radiusY > 0.48 && footprint > 0.72,
    }));
  }
  rocksCache = rocks;
  return rocksCache;
}

export function getPuntaSurRockObstacles() {
  return buildRockObstacles(getPuntaSurRocks(), {
    zoneId: PUNTA_SUR,
    idPrefix: 'punta-sur',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over rain-polished basalt',
    climbLabel: 'Punta Sur boulder',
    pushFriction: 0.95,
    filter: rock => rock.obstacle === true,
  });
}
