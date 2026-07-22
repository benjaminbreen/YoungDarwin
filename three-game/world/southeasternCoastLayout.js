import { seededRandom } from './scatter';
import {
  SOUTHEASTERN_COAST,
  southeasternCoastBasaltShelfMask,
  southeasternCoastPathInfo,
  southeasternCoastWetShoreMask,
} from './regions/southeasternCoast/path';
import { southeasternCoastHeight } from './regions/southeasternCoast/terrain';
import {
  SHALLOW_SURF,
  shallowSurfHeight,
  shallowSurfRockMask,
} from './regions/shallowSurf/terrain';

function makeRock(zoneId, heightAt, {
  id,
  x,
  z,
  radiusX,
  radiusY,
  radiusZ,
  yaw = 0,
  sink = 0.12,
  color = '#292d29',
  obstacle = false,
}) {
  return {
    id: `${zoneId.toLowerCase()}-${id}`,
    x,
    y: heightAt(x, z),
    z,
    radiusX,
    radiusY,
    radiusZ,
    yaw,
    sink,
    color,
    materialKey: 'darkBasaltGravel',
    obstacle,
    scale: Math.max(radiusX, radiusY, radiusZ),
  };
}

const COAST_HERO_ROCKS = [
  makeRock(SOUTHEASTERN_COAST, southeasternCoastHeight, { id: 'north-notch-stack', x: 27, z: -25, radiusX: 2.6, radiusY: 1.05, radiusZ: 1.8, yaw: 0.38, sink: 0.2, obstacle: true }),
  makeRock(SOUTHEASTERN_COAST, southeasternCoastHeight, { id: 'central-broken-table', x: 30, z: -4, radiusX: 3.2, radiusY: 0.72, radiusZ: 2.1, yaw: -0.27, sink: 0.22, obstacle: true, color: '#34352f' }),
  makeRock(SOUTHEASTERN_COAST, southeasternCoastHeight, { id: 'south-swash-block', x: 26, z: 17, radiusX: 2.4, radiusY: 0.9, radiusZ: 1.7, yaw: 0.61, sink: 0.18, obstacle: true }),
  makeRock(SOUTHEASTERN_COAST, southeasternCoastHeight, { id: 'outer-wading-rock', x: 43, z: 8, radiusX: 2.1, radiusY: 0.92, radiusZ: 1.45, yaw: -0.44, sink: 0.14, color: '#202725' }),
];

const SURF_HERO_ROCKS = [
  makeRock(SHALLOW_SURF, shallowSurfHeight, { id: 'inner-north-rock', x: -33, z: -18, radiusX: 2.8, radiusY: 1.0, radiusZ: 2.0, yaw: 0.31, sink: 0.16 }),
  makeRock(SHALLOW_SURF, shallowSurfHeight, { id: 'inner-south-rock', x: -25, z: 18, radiusX: 3.0, radiusY: 1.12, radiusZ: 1.8, yaw: -0.52, sink: 0.18 }),
  makeRock(SHALLOW_SURF, shallowSurfHeight, { id: 'middle-ledger', x: -8, z: -4, radiusX: 2.7, radiusY: 0.82, radiusZ: 2.2, yaw: 0.72, sink: 0.14 }),
  makeRock(SHALLOW_SURF, shallowSurfHeight, { id: 'outer-north-tooth', x: 18, z: -24, radiusX: 2.3, radiusY: 1.28, radiusZ: 1.55, yaw: -0.14, sink: 0.12, color: '#1d2423' }),
  makeRock(SHALLOW_SURF, shallowSurfHeight, { id: 'outer-south-tooth', x: 9, z: 19, radiusX: 2.4, radiusY: 1.18, radiusZ: 1.7, yaw: 0.46, sink: 0.13, color: '#1f2725' }),
];

function fillRocks({ zoneId, heightAt, heroes, targetCount, seedBase, bounds, accept }) {
  const rocks = [...heroes];
  let attempt = 0;
  while (rocks.length < targetCount && attempt < 12000) {
    attempt += 1;
    const seed = seedBase + attempt;
    const x = bounds.minX + seededRandom(seed, 3) * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + seededRandom(seed, 7) * (bounds.maxZ - bounds.minZ);
    if (!accept(x, z, seed)) continue;
    const base = 0.2 + Math.pow(seededRandom(seed, 11), 1.7) * 0.92;
    const slab = seededRandom(seed, 13) > 0.42;
    const radiusX = base * (slab ? 1.18 + seededRandom(seed, 17) * 0.8 : 0.82 + seededRandom(seed, 17) * 0.58);
    const radiusY = base * (slab ? 0.25 + seededRandom(seed, 19) * 0.27 : 0.45 + seededRandom(seed, 19) * 0.48);
    const radiusZ = base * (slab ? 0.86 + seededRandom(seed, 23) * 0.62 : 0.75 + seededRandom(seed, 23) * 0.68);
    const footprint = Math.max(radiusX, radiusZ);
    if (rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) < Math.max(0.58, (footprint + Math.max(rock.radiusX, rock.radiusZ)) * 0.52))) continue;
    const tone = seededRandom(seed, 29);
    rocks.push(makeRock(zoneId, heightAt, {
      id: `basalt-${rocks.length}`,
      x,
      z,
      radiusX,
      radiusY,
      radiusZ,
      yaw: seededRandom(seed, 31) * Math.PI * 2,
      sink: Math.min(0.22, base * 0.2),
      color: tone > 0.72 ? '#3b3a33' : tone > 0.25 ? '#292d29' : '#171d1c',
      obstacle: radiusY > 0.56 && footprint > 0.9,
    }));
  }
  return Object.freeze(rocks);
}

let coastRocks = null;
export function getSoutheasternCoastRocks() {
  if (!coastRocks) {
    coastRocks = fillRocks({
      zoneId: SOUTHEASTERN_COAST,
      heightAt: southeasternCoastHeight,
      heroes: COAST_HERO_ROCKS,
      targetCount: 72,
      seedBase: 73100,
      bounds: { minX: 14, maxX: 52, minZ: -42, maxZ: 42 },
      accept: (x, z, seed) => {
        const path = southeasternCoastPathInfo(x, z);
        const habitat = Math.max(southeasternCoastBasaltShelfMask(x, z), southeasternCoastWetShoreMask(x, z));
        return path.distance > path.width * 1.25
          && habitat > 0.16
          && seededRandom(seed, 37) < 0.18 + habitat * 0.7;
      },
    });
  }
  return coastRocks;
}

let surfRocks = null;
export function getShallowSurfRocks() {
  if (!surfRocks) {
    surfRocks = fillRocks({
      zoneId: SHALLOW_SURF,
      heightAt: shallowSurfHeight,
      heroes: SURF_HERO_ROCKS,
      targetCount: 58,
      seedBase: 74200,
      bounds: { minX: -41, maxX: 39, minZ: -36, maxZ: 36 },
      accept: (x, z, seed) => {
        const habitat = shallowSurfRockMask(x, z);
        return habitat > 0.2 && seededRandom(seed, 37) < 0.12 + habitat * 0.68;
      },
    });
  }
  return surfRocks;
}
