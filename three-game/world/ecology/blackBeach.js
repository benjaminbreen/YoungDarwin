import { blackBeachInlandDistance, BLACK_BEACH } from '../regions/blackBeach/terrain';
import { makeZoneScatter, nearAnyCluster } from '../scatter';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';

const scrubClumps = [[19, -27], [34, -9], [25, 15], [42, 28], [13, 32]];
const grassClumps = [[10, -28], [22, -16], [36, 0], [19, 20], [39, 32]];

const scatter = (layer, count, seed, opts) => makeZoneScatter(BLACK_BEACH, layer, count, seed, opts);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clearOfSwash(x, z) {
  return blackBeachInlandDistance(x, z) > 4;
}

function buildFlora() {
  const saltgrass = scatter('black-beach-saltgrass', 18, 421, {
    minX: -2, maxX: 42, minZ: -38, maxZ: 38, scale: [0.1, 0.2], maxGrade: 0.55,
    accept: (biome, x, z) => {
      const d = blackBeachInlandDistance(x, z);
      return d > 5 && d < 23 && (biome === 'black-sand' || biome === 'black-dune-sand');
    },
  });

  const saltbush = scatter('black-beach-saltbush', 11, 433, {
    minX: 8, maxX: 48, minZ: -36, maxZ: 38, scale: [0.52, 0.98], maxGrade: 0.62,
    accept: (biome, x, z) => clearOfSwash(x, z)
      && nearAnyCluster(scrubClumps, x, z, 11)
      && (biome === 'black-dune-sand' || biome === 'dune-scrub' || biome === 'dry-scrub'),
  });

  const drybrush = scatter('black-beach-drybrush', 7, 449, {
    minX: 14, maxX: 50, minZ: -34, maxZ: 38, scale: [0.5, 0.9], maxGrade: 0.68,
    accept: (biome, x, z) => clearOfSwash(x, z)
      && nearAnyCluster(scrubClumps, x, z, 12)
      && (biome === 'dune-scrub' || biome === 'dry-scrub'),
  });

  const darwiniothamnus = scatter('black-beach-tall-shrub', 4, 461, {
    minX: 20, maxX: 50, minZ: -30, maxZ: 34, scale: [0.4, 0.62], maxGrade: 0.6,
    accept: (biome, x, z) => blackBeachInlandDistance(x, z) > 24
      && nearAnyCluster(scrubClumps, x, z, 13)
      && (biome === 'dune-scrub' || biome === 'dry-scrub'),
  });

  const driftwood = scatter('black-beach-driftwood', 4, 477, {
    minX: -10, maxX: 16, minZ: -34, maxZ: 34, scale: [1.2, 2.2], maxGrade: 0.45,
    accept: (biome, x, z) => {
      const d = blackBeachInlandDistance(x, z);
      return d > 0.8 && d < 8 && (biome === 'wet-black-sand' || biome === 'black-sand');
    },
  });

  return [
    {
      id: 'black-beach-saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.13,
      castShadow: false,
      motion: { wind: 1.35, bend: 0.5, bendRadius: 1.22 },
      items: saltgrass,
    },
    {
      id: 'black-beach-saltbush',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      castShadow: false,
      tint: '#8b8457',
      tintStrength: 0.16,
      motion: { wind: 1.05, bend: 0.24, bendRadius: 1.35 },
      items: saltbush,
    },
    {
      id: 'black-beach-drybrush',
      path: `${NATURE}runtime-drybrush.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#7a714b',
      tintStrength: 0.14,
      motion: { wind: 0.95, bend: 0.2, bendRadius: 1.25 },
      items: drybrush,
    },
    {
      id: 'black-beach-darwiniothamnus',
      path: `${NATURE}runtime-darwiniothamnus.glb`,
      sink: 0.05,
      tint: '#7e834f',
      tintStrength: 0.12,
      motion: { wind: 0.95, bend: 0.2, bendRadius: 1.6 },
      items: darwiniothamnus,
    },
    {
      id: 'black-beach-driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#716a5b',
      tintStrength: 0.48,
      items: driftwood,
    },
  ];
}

function buildGrassPatches() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: BLACK_BEACH,
    idPrefix: 'black-beach-dry-grass',
    count: 360,
    seed: 491,
    bounds: { minX: 8, maxX: 50, minZ: -39, maxZ: 39 },
    rejectBiomes: ['deep-water', 'shallow-water', 'ankle-water', 'wet-black-sand', 'black-sand'],
    maxGrade: 0.74,
    scale: [0.45, 0.92],
    attemptsPerItem: 130,
    accept: ({ x, z, biome }) => {
      if (blackBeachInlandDistance(x, z) < 20) return false;
      if (!nearAnyCluster(grassClumps, x, z, 16)) return false;
      return biome === 'black-dune-sand' || biome === 'dune-scrub' || biome === 'dry-scrub';
    },
    drynessAt: ({ x, z, tone }) => clamp01(
      0.58 + tone * 0.24 + clamp01((blackBeachInlandDistance(x, z) - 22) / 26) * 0.2,
    ),
  });

  return createStandardDryGrassPatchLayer({
    id: 'black-beach-dry-grass-patches',
    items,
    materialColor: '#ddd39a',
    emissive: '#292914',
    emissiveIntensity: 0.07,
    maxVisibleDistance: 86,
    widthScale: 1.02,
    heightScale: 0.96,
    motion: { wind: 1.18, bend: 0.26, bendRadius: 1.15 },
  });
}

export function buildBlackBeachEcology() {
  return {
    zoneId: BLACK_BEACH,
    flora: buildFlora(),
    dryGrassPatches: [buildGrassPatches()],
    footprintBiomes: ['wet-black-sand', 'black-sand', 'black-dune-sand', 'dune-scrub', 'dry-scrub'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 28, radiusZ: 12, height: 21, speed: -0.06, phase: 1.1, cx: -10, cz: -12, flapRate: 0.82 },
      { species: 'frigatebird', radiusX: 32, radiusZ: 16, height: 28, speed: 0.052, phase: 3.4, cx: 20, cz: 8, flapRate: 0.46 },
    ]),
  };
}
