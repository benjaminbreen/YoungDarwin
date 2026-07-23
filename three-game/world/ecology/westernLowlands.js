import { makeZoneScatter } from '../scatter';
import { getWesternLowlandsRocks } from '../westernLowlandsLayout';
import {
  WESTERN_LOWLANDS,
  westernLowlandsCampBenchMask,
  westernLowlandsPathInfo,
} from '../regions/westernLowlands/path';
import {
  westernLowlandsInlandDistance,
  westernLowlandsLagoonMask,
} from '../regions/westernLowlands/terrain';
import { WATER_LEVEL } from '../terrainShared';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';

function buildFlora() {
  const saltgrass = makeZoneScatter(WESTERN_LOWLANDS, 'western-lowlands-saltgrass', 52, 733, {
    minX: -34, maxX: 18, minZ: -30, maxZ: 33, scale: [0.12, 0.28], maxGrade: 0.5,
    accept: (biome, x, z) => westernLowlandsLagoonMask(x, z) > 0.02
      && westernLowlandsLagoonMask(x, z) < 0.42
      && westernLowlandsPathInfo(x, z).tread < 0.12
      && (biome === 'lagoon-mud' || biome === 'saltgrass-margin'),
  });
  const saltbush = makeZoneScatter(WESTERN_LOWLANDS, 'western-lowlands-saltbush', 24, 751, {
    minX: 0, maxX: 49, minZ: -38, maxZ: 39, scale: [0.52, 1.04], maxGrade: 0.62,
    accept: (biome, x, z) => westernLowlandsInlandDistance(x, z) > 18
      && westernLowlandsCampBenchMask(x, z) < 0.22
      && westernLowlandsPathInfo(x, z).shoulder < 0.18
      && (biome === 'basalt-lowland' || biome === 'dry-scrub'),
  });
  return [
    {
      id: 'western-lowlands-saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.12,
      castShadow: false,
      motion: { wind: 1.25, bend: 0.42, bendRadius: 1.1 },
      items: saltgrass,
    },
    {
      id: 'western-lowlands-saltbush',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      tint: '#77754b',
      tintStrength: 0.18,
      motion: { wind: 1.0, bend: 0.22, bendRadius: 1.3 },
      items: saltbush,
    },
  ];
}

export function buildWesternLowlandsEcology() {
  return {
    zoneId: WESTERN_LOWLANDS,
    flora: buildFlora(),
    rocks: getWesternLowlandsRocks(),
    lagoonSurfaces: [{
      id: 'western-lowlands-tidal-lagoon-water',
      zoneId: WESTERN_LOWLANDS,
      bounds: { minX: -46, maxX: 3, minZ: -29, maxZ: 32 },
      position: [0, WATER_LEVEL + 0.018, 0],
      geometryResolution: [148, 166],
      flowMapResolution: [128, 144],
      maskThreshold: 0.28,
      shoreNoise: 0.045,
      color: '#557d72',
      scale: [24, 30],
    }],
    footprintBiomes: ['lagoon-mud', 'wet-basalt', 'black-shingle', 'coastal-trail', 'whaler-camp-bench', 'basalt-lowland'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 30, radiusZ: 16, height: 19, speed: -0.058, phase: 0.8, cx: -20, cz: 4, flapRate: 0.82 },
      { species: 'frigatebird', radiusX: 39, radiusZ: 20, height: 31, speed: 0.045, phase: 3.1, cx: 5, cz: -3, flapRate: 0.43 },
    ]),
  };
}
