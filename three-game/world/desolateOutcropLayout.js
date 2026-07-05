import {
  DESOLATE_OUTCROP,
  desolateOutcropDryMask,
  desolateOutcropNorthHornMask,
  desolateOutcropSpineMask,
  desolateOutcropTideShelfMask,
  desolateOutcropTidepoolMask,
} from './regions/desolateOutcrop/terrain';
import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { makeZoneScatter } from './scatter';

const makeOutcropScatter = (layer, count, seed, opts) => makeZoneScatter(DESOLATE_OUTCROP, layer, count, seed, opts);

let rockCache = null;

export function getDesolateOutcropRocks() {
  if (rockCache) return rockCache;

  const spine = makeOutcropScatter('spine-rock', 20, 17, {
    minX: -17,
    maxX: 17,
    minZ: -29,
    maxZ: 20,
    scale: [0.26, 0.96],
    maxGrade: 1.8,
    accept: (biome, x, z, y) => (
      y > -0.34
      && desolateOutcropSpineMask(x, z) > 0.42
      && biome !== 'guano-rock'
    ),
  });

  const horns = makeOutcropScatter('horn-rock', 12, 29, {
    minX: -18,
    maxX: 18,
    minZ: -42,
    maxZ: -24,
    scale: [0.34, 1.18],
    maxGrade: 2.4,
    accept: (biome, x, z, y) => (
      y > -0.12
      && desolateOutcropNorthHornMask(x, z) > 0.18
    ),
  });

  const shelf = makeOutcropScatter('tide-rock', 16, 41, {
    minX: 4,
    maxX: 34,
    minZ: -20,
    maxZ: 22,
    scale: [0.16, 0.62],
    maxGrade: 1.8,
    accept: (biome, x, z, y) => {
      if (desolateOutcropTideShelfMask(x, z) < 0.18) return false;
      if (desolateOutcropTidepoolMask(x, z) > 0.58) return false;
      return y > -1.25 && y < 0.34;
    },
  });

  const saddle = makeOutcropScatter('saddle-rock', 4, 53, {
    minX: -22,
    maxX: 22,
    minZ: 20,
    maxZ: 40,
    scale: [0.2, 0.54],
    maxGrade: 0.8,
    accept: (biome, x, z, y) => (
      y > -0.28
      && desolateOutcropDryMask(x, z) > 0.45
      && biome !== 'red-cinder'
    ),
  });

  rockCache = [...spine, ...horns, ...shelf, ...saddle].map(item => ({
    ...item,
    color: item.tone > 0.74 ? '#3f3c32' : item.tone > 0.35 ? '#282a25' : '#171b18',
    radiusX: item.scale * (1.34 + item.tone * 0.82),
    radiusY: item.scale * (0.24 + item.tone * 0.28),
    radiusZ: item.scale * (0.86 + item.tone * 0.68),
    sink: item.scale * (item.y < -0.55 ? 0.05 : 0.24),
  }));
  return rockCache;
}

export function getDesolateOutcropRockObstacles() {
  return buildRockObstacles(getDesolateOutcropRocks(), {
    zoneId: DESOLATE_OUTCROP,
    idPrefix: 'noutcrop',
    filter: rock => rockVisualBounds(rock).height > 0.34 && rock.y > -1.2,
    extra: rock => ({
      edgeRisk: desolateOutcropNorthHornMask(rock.x, rock.z) > 0.24 || rock.z < -28,
      traversalLabel: 'scramble over sharp basalt',
      climbLabel: 'sharp basalt block',
    }),
  });
}
