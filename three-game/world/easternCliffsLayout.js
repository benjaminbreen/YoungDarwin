import { buildRockObstacles } from './proceduralRocks';
import { seededRandom } from './scatter';
import {
  EASTERN_CLIFFS,
  easternCliffsBasaltExposure,
  easternCliffsCoastDistance,
  easternCliffsPathInfo,
  easternCliffsRimMask,
} from './regions/easternCliffs/path';
import { easternCliffsHeight } from './regions/easternCliffs/terrain';

function makeRock({
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.1,
  color = '#353a37',
  materialKey = 'weatheredHighlandBasalt',
  obstacle = false,
}) {
  return {
    id,
    x,
    y: easternCliffsHeight(x, z),
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

// Landmark boulders break the rim silhouette and anchor the scattered rubble.
// All sit inland of the blocked face band and outside the lookout/traverse.
const HERO_BOULDERS = [
  makeRock({ id: 'north-west-split-block', x: -16, z: -29, radiusX: 1.72, radiusY: 0.9, radiusZ: 1.22, yaw: 0.38, sink: 0.2, obstacle: true }),
  makeRock({ id: 'north-weathered-slab', x: -3, z: -26, radiusX: 1.42, radiusY: 0.66, radiusZ: 1.04, yaw: -0.58, sink: 0.17, obstacle: true, color: '#4a4e48' }),
  makeRock({ id: 'north-east-oxide-block', x: 14, z: -21, radiusX: 1.26, radiusY: 0.7, radiusZ: 0.96, yaw: 0.82, sink: 0.16, obstacle: true, color: '#59483c', materialKey: 'oxidizedScoriaceousBasalt' }),
  makeRock({ id: 'colony-rim-boulder', x: 18, z: -22, radiusX: 1.58, radiusY: 0.84, radiusZ: 1.12, yaw: -0.24, sink: 0.2, obstacle: true, color: '#2b302e' }),
  makeRock({ id: 'east-rim-dark-block', x: 29, z: 5, radiusX: 1.48, radiusY: 0.78, radiusZ: 1.06, yaw: 0.52, sink: 0.19, obstacle: true, color: '#252a28', materialKey: 'darkBasaltGravel' }),
  makeRock({ id: 'east-rim-paired-block', x: 32, z: 10, radiusX: 1.14, radiusY: 0.58, radiusZ: 0.88, yaw: -0.76, sink: 0.14, obstacle: true }),
  makeRock({ id: 'east-rim-long-slab', x: 30, z: 20, radiusX: 1.86, radiusY: 0.72, radiusZ: 1.08, yaw: 0.17, sink: 0.2, obstacle: true, color: '#464945' }),
  makeRock({ id: 'south-east-tumbled-block', x: 25, z: 29, radiusX: 1.32, radiusY: 0.82, radiusZ: 1.22, yaw: -0.43, sink: 0.2, obstacle: true, color: '#58463a', materialKey: 'oxidizedScoriaceousBasalt' }),
];

function localGrade(x, z) {
  const step = 0.65;
  const dx = easternCliffsHeight(x + step, z) - easternCliffsHeight(x - step, z);
  const dz = easternCliffsHeight(x, z + step) - easternCliffsHeight(x, z - step);
  return Math.hypot(dx, dz) / (step * 2);
}

let easternCliffsRocks = null;

export function getEasternCliffsRocks() {
  if (easternCliffsRocks) return easternCliffsRocks;
  const rocks = [...HERO_BOULDERS];
  let attempts = 0;
  while (rocks.length < 138 && attempts < 14000) {
    attempts += 1;
    const seed = attempts + 18473;
    const x = -43 + seededRandom(seed, 3) * 76;
    const z = -31 + seededRandom(seed, 7) * 70;
    const coastDistance = easternCliffsCoastDistance(x, z);
    if (coastDistance < 5.75 || coastDistance > 17.5) continue;
    const path = easternCliffsPathInfo(x, z);
    if (path.distance < path.width * 1.72) continue;
    if (localGrade(x, z) > 0.82) continue;

    const rim = easternCliffsRimMask(x, z);
    const exposure = easternCliffsBasaltExposure(x, z);
    const habitat = Math.max(rim, exposure * 0.74);
    if (habitat < 0.48 || seededRandom(seed, 11) > 0.2 + habitat * 0.68) continue;

    const sizeRoll = seededRandom(seed, 13);
    const base = sizeRoll > 0.84
      ? 0.58 + seededRandom(seed, 17) * 0.68
      : 0.17 + Math.pow(sizeRoll, 1.45) * 0.52;
    const radiusX = base * (0.88 + seededRandom(seed, 19) * 0.7);
    const radiusY = base * (0.34 + seededRandom(seed, 23) * 0.38);
    const radiusZ = base * (0.72 + seededRandom(seed, 29) * 0.68);
    const footprint = Math.max(radiusX, radiusZ);
    if (path.distance < path.width * 1.36 + footprint + 0.7) continue;
    if (rocks.some(rock => {
      const combined = footprint + Math.max(rock.radiusX, rock.radiusZ);
      return Math.hypot(rock.x - x, rock.z - z) < Math.max(0.72, combined * 0.54);
    })) continue;
    const tone = seededRandom(seed, 31);
    const oxidized = tone > 0.83;
    const dark = tone < 0.32;

    rocks.push(makeRock({
      id: `rim-rubble-${rocks.length}`,
      x,
      z,
      radiusX,
      radiusY,
      radiusZ,
      yaw: seededRandom(seed, 37) * Math.PI * 2,
      sink: Math.min(0.25, base * (0.16 + seededRandom(seed, 41) * 0.1)),
      color: oxidized ? '#644b3d' : dark ? '#252a28' : '#424742',
      materialKey: oxidized
        ? 'oxidizedScoriaceousBasalt'
        : dark ? 'darkBasaltGravel' : 'weatheredHighlandBasalt',
      obstacle: radiusY > 0.48 && Math.max(radiusX, radiusZ) > 0.72,
    }));
  }
  easternCliffsRocks = rocks;
  return easternCliffsRocks;
}

export function getEasternCliffsRockObstacles() {
  return buildRockObstacles(getEasternCliffsRocks(), {
    zoneId: EASTERN_CLIFFS,
    idPrefix: 'eastern-cliffs',
    radiusScale: 0.76,
    colliderShape: 'cylinder',
    traversalLabel: 'scramble over fractured cliff basalt',
    climbLabel: 'cliff-rim boulder',
    pushFriction: 0.94,
    filter: rock => rock.obstacle === true,
  });
}
