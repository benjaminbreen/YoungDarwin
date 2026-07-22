import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  SOUTHERN_INTERTIDAL,
  intertidalBasaltShelfMask,
  intertidalPathInfo,
  intertidalPoolMask,
  intertidalSaltExposure,
  intertidalTidalChannelMask,
} from './regions/southernIntertidal/path';
import { southernIntertidalHeight } from './regions/southernIntertidal/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.12,
  color = '#29332f',
  materialKey = 'darkBasaltGravel',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: southernIntertidalHeight(x, z),
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
  makeRock({ id: 'algae-wing-slab', x: -14, z: -7, radiusX: 2.9, radiusY: 0.42, radiusZ: 1.28, yaw: -0.38, obstacle: false, color: '#48662f' }),
  makeRock({ id: 'algae-anchor-slab', x: 9, z: -5, radiusX: 2.35, radiusY: 0.38, radiusZ: 1.52, yaw: 0.58, obstacle: false, color: '#527435' }),
  makeRock({ id: 'algae-pool-lip', x: 18, z: 3, radiusX: 1.72, radiusY: 0.5, radiusZ: 1.04, yaw: -0.72, obstacle: true, color: '#3e622f' }),
  makeRock({ id: 'western-basking-slab', x: -35, z: 7, radiusX: 2.35, radiusY: 0.62, radiusZ: 1.65, yaw: 0.46, obstacle: true, color: '#202b28' }),
  makeRock({ id: 'pool-a-split-rock', x: -20, z: -4, radiusX: 1.48, radiusY: 0.88, radiusZ: 1.12, yaw: -0.62, obstacle: true }),
  makeRock({ id: 'center-stepping-slab', x: -2, z: 20, radiusX: 1.72, radiusY: 0.46, radiusZ: 1.28, yaw: 0.18, obstacle: false, color: '#263532' }),
  makeRock({ id: 'barnacle-ledge', x: -18, z: 25, radiusX: 1.92, radiusY: 0.58, radiusZ: 1.36, yaw: -0.24, obstacle: true, color: '#1c2927' }),
  makeRock({ id: 'east-algae-rock', x: 36, z: 15, radiusX: 1.66, radiusY: 0.76, radiusZ: 1.2, yaw: 0.7, obstacle: true, color: '#20322c' }),
  makeRock({ id: 'south-channel-tooth', x: 24, z: 32, radiusX: 1.22, radiusY: 1.05, radiusZ: 0.94, yaw: -0.38, obstacle: true, color: '#172725' }),
];

let rocksCache = null;

export function getSouthernIntertidalRocks() {
  if (rocksCache) return rocksCache;
  const rocks = [...HERO_ROCKS];
  let attempts = 0;
  while (rocks.length < 74 && attempts < 12000) {
    attempts += 1;
    const seed = 28601 + attempts;
    const x = -50 + seededRandom(seed, 3) * 100;
    const z = -16 + seededRandom(seed, 7) * 53;
    const basalt = intertidalBasaltShelfMask(x, z);
    const channel = intertidalTidalChannelMask(x, z);
    const pool = intertidalPoolMask(x, z);
    const path = intertidalPathInfo(x, z);
    if (basalt < 0.38 && channel < 0.42 && pool < 0.32) continue;
    if (path.distance < path.width * 1.38) continue;
    const habitat = Math.max(basalt, channel * 0.54, pool * 0.62);
    if (seededRandom(seed, 11) > 0.28 + habitat * 0.64) continue;
    const heroRoll = seededRandom(seed, 13);
    const base = heroRoll > 0.9
      ? 0.58 + seededRandom(seed, 17) * 0.62
      : 0.18 + seededRandom(seed, 19) * 0.44;
    const radiusX = base * (0.9 + seededRandom(seed, 23) * 0.72);
    const radiusY = base * (0.3 + seededRandom(seed, 29) * 0.48);
    const radiusZ = base * (0.72 + seededRandom(seed, 31) * 0.7);
    const footprint = Math.max(radiusX, radiusZ);
    if (rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) < Math.max(0.7, (footprint + Math.max(rock.radiusX, rock.radiusZ)) * 0.58))) continue;
    const wetness = intertidalSaltExposure(x, z);
    rocks.push(makeRock({
      id: `intertidal-basalt-${rocks.length}`,
      x,
      z,
      radiusX,
      radiusY,
      radiusZ,
      yaw: seededRandom(seed, 37) * Math.PI * 2,
      sink: Math.min(0.22, base * 0.22),
      color: wetness > 0.64 ? '#1a2926' : seededRandom(seed, 41) > 0.78 ? '#4e493e' : '#303833',
      obstacle: radiusY > 0.54 && footprint > 0.8,
    }));
  }
  rocksCache = rocks;
  return rocksCache;
}

export function getSouthernIntertidalRockObstacles() {
  return buildRockObstacles(getSouthernIntertidalRocks(), {
    zoneId: SOUTHERN_INTERTIDAL,
    idPrefix: 'southern-intertidal',
    radiusScale: 0.74,
    colliderShape: 'cylinder',
    traversalLabel: 'step across tide-darkened basalt',
    climbLabel: 'intertidal basalt block',
    pushFriction: 0.96,
    filter: rock => rock.obstacle === true,
  });
}
