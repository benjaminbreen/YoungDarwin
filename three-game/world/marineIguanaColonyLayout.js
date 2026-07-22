import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  MARINE_IGUANA_COLONY,
  marineIguanaColonyBasaltShelfMask,
  marineIguanaColonyBeachMask,
  marineIguanaColonyGuanoMask,
  marineIguanaColonyPathInfo,
  marineIguanaColonyPoolMask,
  marineIguanaColonyRubbleMask,
  marineIguanaColonyTerraceMask,
} from './regions/marineIguanaColony/path';
import { marineIguanaColonyHeight } from './regions/marineIguanaColony/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.12,
  color = '#242724',
  materialKey = 'darkBasaltGravel',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: marineIguanaColonyHeight(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    materialKey,
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const HERO_ROCKS = [
  makeRock({ id: 'colony-west-slab', x: -24, z: 4, radiusX: 3.1, radiusY: 0.62, radiusZ: 2.2, yaw: 0.22, sink: 0.2, obstacle: true }),
  makeRock({ id: 'colony-north-altar', x: -17, z: -4, radiusX: 2.5, radiusY: 0.74, radiusZ: 1.75, yaw: -0.44, sink: 0.18, obstacle: true, color: '#34322c' }),
  makeRock({ id: 'colony-south-table', x: -11, z: 10, radiusX: 2.8, radiusY: 0.68, radiusZ: 1.9, yaw: 0.52, sink: 0.2, obstacle: true, color: '#2c2d28' }),
  makeRock({ id: 'black-gate-north', x: -21, z: -30, radiusX: 2.2, radiusY: 1.0, radiusZ: 1.45, yaw: 0.34, obstacle: true, color: '#191d1b' }),
  makeRock({ id: 'black-gate-south', x: -20, z: 36, radiusX: 2.5, radiusY: 0.9, radiusZ: 1.6, yaw: -0.31, obstacle: true, color: '#1d211f' }),
  makeRock({ id: 'inland-hillock-block', x: 21, z: 17, radiusX: 1.8, radiusY: 0.82, radiusZ: 1.3, yaw: 0.72, obstacle: true, color: '#514238', materialKey: 'weatheredHighlandBasalt' }),
];

const CLUSTERS = [
  { x: -22, z: 3, radiusX: 12, radiusZ: 9, strength: 1.0 },
  { x: -19, z: -28, radiusX: 11, radiusZ: 8, strength: 0.78 },
  { x: -18, z: 35, radiusX: 12, radiusZ: 8, strength: 0.82 },
  { x: 8, z: -31, radiusX: 10, radiusZ: 14, strength: 0.62 },
  { x: 25, z: 18, radiusX: 14, radiusZ: 16, strength: 0.66 },
  { x: 41, z: -18, radiusX: 8, radiusZ: 15, strength: 0.58 },
];

function clusterStrength(x, z) {
  return CLUSTERS.reduce((best, cluster) => {
    const dx = (x - cluster.x) / cluster.radiusX;
    const dz = (z - cluster.z) / cluster.radiusZ;
    return Math.max(best, Math.exp(-(dx * dx + dz * dz) * 1.4) * cluster.strength);
  }, 0);
}

let rockCache = null;

export function getMarineIguanaColonyRocks() {
  if (rockCache) return rockCache;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 92 && attempts < 14000) {
    attempts += 1;
    const seed = attempts + 41317;
    const x = -31 + seededRandom(seed, 3) * 80;
    const z = -43 + seededRandom(seed, 7) * 86;
    const y = marineIguanaColonyHeight(x, z);
    if (y < -0.7) continue;
    const path = marineIguanaColonyPathInfo(x, z);
    if (path.distance < path.width * 1.56) continue;
    if (marineIguanaColonyPoolMask(x, z) > 0.48) continue;
    const basalt = marineIguanaColonyBasaltShelfMask(x, z);
    const terrace = marineIguanaColonyTerraceMask(x, z);
    const rubble = marineIguanaColonyRubbleMask(x, z);
    const beach = marineIguanaColonyBeachMask(x, z);
    const cluster = clusterStrength(x, z);
    const habitat = Math.max(basalt, terrace, rubble * 0.8, cluster, beach * 0.12);
    if (habitat < 0.22 || seededRandom(seed, 11) > 0.08 + habitat * 0.62) continue;

    const sizeRoll = seededRandom(seed, 13);
    const base = sizeRoll > 0.86 ? 0.72 + seededRandom(seed, 17) * 0.76 : 0.18 + sizeRoll * 0.56;
    const slab = basalt > 0.42 && seededRandom(seed, 19) > 0.38;
    const radiusX = base * (slab ? 1.35 + seededRandom(seed, 23) * 0.82 : 0.82 + seededRandom(seed, 23) * 0.72);
    const radiusY = base * (slab ? 0.22 + seededRandom(seed, 29) * 0.25 : 0.38 + seededRandom(seed, 29) * 0.42);
    const radiusZ = base * (slab ? 0.88 + seededRandom(seed, 31) * 0.68 : 0.74 + seededRandom(seed, 31) * 0.74);
    const footprint = Math.max(radiusX, radiusZ);
    if (rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) < Math.max(0.62, (footprint + Math.max(rock.radiusX, rock.radiusZ)) * 0.53))) continue;

    const guano = marineIguanaColonyGuanoMask(x, z);
    const tone = seededRandom(seed, 37);
    const inlandWeathered = rubble > basalt && x > -3;
    rocks.push(makeRock({
      id: `colony-basalt-${rocks.length}`,
      x,
      z,
      radiusX,
      radiusY,
      radiusZ,
      yaw: seededRandom(seed, 41) * Math.PI * 2,
      sink: Math.min(0.25, base * (slab ? 0.24 : 0.16)),
      color: guano > 0.4
        ? (tone > 0.5 ? '#777568' : '#5e5d53')
        : inlandWeathered
          ? (tone > 0.6 ? '#57473b' : '#403c36')
          : (tone > 0.72 ? '#34332e' : tone > 0.22 ? '#222522' : '#151a18'),
      materialKey: inlandWeathered ? 'weatheredHighlandBasalt' : 'darkBasaltGravel',
      obstacle: radiusY > 0.5 && footprint > 0.78,
    }));
  }
  rockCache = rocks;
  return rockCache;
}

export function getMarineIguanaColonyRockObstacles() {
  return buildRockObstacles(getMarineIguanaColonyRocks(), {
    zoneId: MARINE_IGUANA_COLONY,
    idPrefix: 'marine-iguana-colony',
    radiusScale: 0.78,
    colliderShape: 'cylinder',
    filter: rock => rock.obstacle === true,
    extra: rock => ({
      edgeRisk: marineIguanaColonyBasaltShelfMask(rock.x, rock.z) > 0.42,
      traversalLabel: 'scramble over guano-streaked basalt',
      climbLabel: 'black basalt ledge',
      pushFriction: 0.96,
    }),
  });
}
