import {
  beachHutCoastDistance,
  beachHutPadMask,
  beachHutPathInfo,
  BEACH_WITH_HUT,
} from '../regions/beachWithHut/terrain';
import { makeZoneScatter, nearAnyCluster, seededRandom } from '../scatter';
import { getBeachWithHutRocks } from '../beachWithHutLayout';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import { buildBeachFindLayer } from './beachFinds';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';

const NATURE = '/assets/models/nature/';
const BEACH_HUT_SWASH_PERIOD = (Math.PI * 2) / 0.5984;

const scrubClumps = [[18, -28], [31, -19], [24, -6], [5, -27]];
const scatter = (layer, count, seed, opts) => makeZoneScatter(BEACH_WITH_HUT, layer, count, seed, opts);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function band(center, radius, value) {
  const t = Math.abs(value - center) / radius;
  return Math.max(0, 1 - t * t);
}

function litterNoise(x, z, seed) {
  const v = Math.sin((x * 12.9898 + z * 78.233 + seed * 37.719) * 0.73) * 43758.5453;
  return v - Math.floor(v);
}

const LITTER_PALE = ['#e7d9b8', '#d4c4a0', '#f0e2bf', '#c8b996', '#efe5c7'];
const LITTER_CORAL = ['#c98570', '#d19a7d', '#b8756d', '#d7ad8e'];
const LITTER_BASALT = ['#5a554c', '#4d493f', '#625c51', '#48483f'];

function pickColor(palette, i, k) {
  return palette[Math.floor(seededRandom(i, k) * palette.length) % palette.length];
}

function decorateLitter(item, index, seed, bandKind) {
  const i = seed * 10000 + index * 97;
  const r = seededRandom(i, 5);
  const variant = r < 0.26
    ? 'shell-cap'
    : r < 0.58
      ? 'shell-shard-a'
      : r < 0.76
        ? 'limestone-chip'
        : r < 0.96
          ? 'coral-chip'
          : 'basalt-pebble';
  const color = variant === 'basalt-pebble'
    ? pickColor(LITTER_BASALT, i, 19)
    : variant === 'coral-chip'
      ? pickColor(LITTER_CORAL, i, 23)
      : pickColor(LITTER_PALE, i, 29);
  const d = beachHutCoastDistance(item.x, item.z);
  const wetness = clamp01((1 - Math.min(1, Math.max(0, (d - 0.7) / 4.0))) * (bandKind === 'dry' ? 0.28 : 0.82));
  const shellScale = variant.startsWith('shell') ? 0.58 : variant === 'basalt-pebble' ? 0.34 : 0.46;
  return {
    ...item,
    id: `${bandKind}-litter-${index}`,
    variant,
    color,
    wetness,
    scale: item.scale * shellScale,
    stretchX: 0.72 + seededRandom(i, 31) * 0.92,
    stretchZ: 0.64 + seededRandom(i, 37) * 0.66,
    heightScale: variant.startsWith('shell') ? 1.0 + seededRandom(i, 41) * 0.42 : 0.82 + seededRandom(i, 43) * 0.55,
    lift: variant.startsWith('shell') ? 0.016 + wetness * 0.006 : 0.008 + seededRandom(i, 47) * 0.012,
    pitch: (seededRandom(i, 53) - 0.5) * 0.2,
    roll: (seededRandom(i, 59) - 0.5) * 0.2,
  };
}

function buildSurfaceLitter() {
  const strand = scatter('hut-strand-shells', 210, 701, {
    minX: -35, maxX: 35, minZ: -3, maxZ: 28, scale: [0.32, 0.86], maxGrade: 0.5,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      if (!(biome === 'white-sand' || biome === 'wet-white-sand') || d < 0.35 || d > 10.5) return false;
      const strandBand = Math.max(band(2.2, 2.0, d), band(5.4, 3.0, d) * 0.74);
      return litterNoise(x, z, 17) < clamp01(strandBand * 0.58 + 0.12);
    },
  }).map((item, index) => decorateLitter(item, index, 701, 'strand'));
  const dry = scatter('hut-dry-shells', 58, 719, {
    minX: -25, maxX: 32, minZ: -2, maxZ: 18, scale: [0.24, 0.62], maxGrade: 0.52,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return biome === 'white-sand' && d > 9 && d < 22 && litterNoise(x, z, 37) < 0.24;
    },
  }).map((item, index) => decorateLitter(item, index, 719, 'dry'));

  return [{
    id: 'beach-hut-shell-strandline',
    maxVisibleDistance: 42,
    items: [...strand, ...dry],
  }];
}

function buildCollectibleBeachFinds() {
  return [buildBeachFindLayer(BEACH_WITH_HUT, {
    id: 'beach-with-hut-beach-finds',
    count: 8,
    seed: 751,
    bounds: { minX: -32, maxX: 30, minZ: -2, maxZ: 21 },
    maxGrade: 0.42,
    maxVisibleDistance: 54,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      if (!(biome === 'white-sand' || biome === 'wet-white-sand')) return false;
      return d > 0.7 && d < 13 && litterNoise(x * 0.8, z * 0.9, 71) < 0.24 + band(4.5, 4.4, d) * 0.38;
    },
  })];
}

function clearOfGardenAndHuts(x, z) {
  return beachHutPadMask(x, z) < 0.16;
}

function buildFlora() {
  const saltgrass = scatter('hut-saltgrass', 13, 761, {
    minX: -20, maxX: 34, minZ: -4, maxZ: 21, scale: [0.11, 0.2], maxGrade: 0.62,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return d > 5 && d < 19 && (biome === 'white-sand' || biome === 'normal-sand') && clearOfGardenAndHuts(x, z);
    },
  });
  const sesuvium = scatter('hut-sesuvium', 4, 773, {
    minX: -10, maxX: 30, minZ: -6, maxZ: 14, scale: [1.35, 2.4], maxGrade: 0.55,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return d > 12 && d < 25 && biome === 'normal-sand' && clearOfGardenAndHuts(x, z);
    },
  });
  const saltbush = scatter('hut-saltbush', 8, 787, {
    minX: -2, maxX: 37, minZ: -31, maxZ: -2, scale: [0.52, 0.95], maxGrade: 0.62,
    accept: (biome, x, z) => nearAnyCluster(scrubClumps, x, z, 9.5)
      && (biome === 'normal-sand' || biome === 'dry-grass-shelf')
      && clearOfGardenAndHuts(x, z),
  });
  const drybrush = scatter('hut-drybrush', 7, 797, {
    minX: -2, maxX: 36, minZ: -31, maxZ: -3, scale: [0.48, 0.9], maxGrade: 0.68,
    accept: (biome, x, z) => nearAnyCluster(scrubClumps, x, z, 10.5)
      && biome === 'dry-grass-shelf'
      && clearOfGardenAndHuts(x, z),
  });
  const driftwood = scatter('hut-driftwood', 5, 821, {
    minX: -28, maxX: 28, minZ: -1, maxZ: 23, scale: [1.25, 2.4], maxGrade: 0.56,
    accept: (biome, x, z) => {
      const d = beachHutCoastDistance(x, z);
      return d > 0.8 && d < 7.5 && (biome === 'white-sand' || biome === 'wet-white-sand');
    },
  });

  return [
    {
      id: 'beach-hut-saltgrass',
      path: `${NATURE}runtime-saltgrass.glb`,
      sink: 0.15,
      castShadow: false,
      motion: { wind: 1.4, bend: 0.52, bendRadius: 1.25 },
      items: saltgrass,
    },
    {
      id: 'beach-hut-sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.03,
      castShadow: false,
      ySquash: 0.32,
      motion: { wind: 0.72, bend: 0.22, bendRadius: 1.15 },
      items: sesuvium,
    },
    {
      id: 'beach-hut-saltbush',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      castShadow: false,
      motion: { wind: 1.1, bend: 0.27, bendRadius: 1.35 },
      items: saltbush,
    },
    {
      id: 'beach-hut-drybrush',
      path: `${NATURE}runtime-drybrush.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#897c54',
      tintStrength: 0.12,
      motion: { wind: 0.95, bend: 0.2, bendRadius: 1.25 },
      items: drybrush,
    },
    {
      id: 'beach-hut-driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#d0c4ad',
      tintStrength: 0.52,
      items: driftwood,
    },
  ];
}

function grassAllowedAt({ x, z, biome, path }) {
  if (path.distance < path.width * 1.35) return false;
  if (beachHutPadMask(x, z) > 0.12) return false;
  const d = beachHutCoastDistance(x, z);
  if (d < 22) return false;
  return biome === 'normal-sand' || biome === 'dry-grass-shelf';
}

function buildGrassPatches() {
  return buildStandardDryGrassPatchItems({
    zoneId: BEACH_WITH_HUT,
    idPrefix: 'beach-hut-dry-grass-patch',
    count: 520,
    seed: 9411,
    bounds: { minX: -6, maxX: 38, minZ: -32, maxZ: 6 },
    pathInfo: beachHutPathInfo,
    rejectBiomes: ['water', 'shallow-water', 'wet-white-sand', 'white-sand', 'sandy-path', 'basalt'],
    pathCenterMax: 0.05,
    pathTreadMax: 0.14,
    maxGrade: 0.85,
    scale: [0.58, 1.05],
    windYaw: -0.68,
    accept: grassAllowedAt,
    drynessAt: ({ tone, path }) => clamp01(0.54 + tone * 0.32 + (path.shoulder || 0) * 0.18),
  });
}

export function buildBeachWithHutEcology() {
  const rocks = getBeachWithHutRocks();
  const swashRocks = rocks.filter(rock => {
    const d = beachHutCoastDistance(rock.x, rock.z);
    return d > -2.8 && d < 2.2 && rock.radiusY > 0.22;
  });
  return {
    zoneId: BEACH_WITH_HUT,
    flora: buildFlora(),
    surfaceLitter: buildSurfaceLitter(),
    collectibleBeachFinds: buildCollectibleBeachFinds(),
    rocks,
    splashes: { anchors: swashRocks.slice(0, 10), period: BEACH_HUT_SWASH_PERIOD },
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'beach-hut-dry-grass-patches',
        items: buildGrassPatches(),
        maxVisibleDistance: 82,
      }),
    ],
    footprintBiomes: ['wet-white-sand', 'white-sand', 'normal-sand', 'sandy-path', 'dry-grass-shelf'],
    flyingModels: [
      flamingoFlyoverLayer('beach-hut-flamingo-flyover', [
        { cx: -18, cz: -10, radiusX: 38, radiusZ: 12, height: 33, speed: 0.024, phase: 1.4, scale: 0.86 },
        { cx: 18, cz: -18, radiusX: 34, radiusZ: 11, height: 37, speed: -0.02, phase: 3.7, scale: 0.8, timeScale: 0.6 },
      ]),
    ],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 24, radiusZ: 13, height: 22, speed: -0.06, phase: 0.6, cx: -8, cz: 8, flapRate: 0.8 },
      { species: 'frigatebird', radiusX: 28, radiusZ: 16, height: 26, speed: 0.064, phase: 3.1, cx: 20, cz: -16, flapRate: 0.44 },
      { species: 'gull', radiusX: 19, radiusZ: 10, height: 21, speed: 0.075, phase: 5.4, cx: -20, cz: -12, flapRate: 0.84 },
    ]),
  };
}
