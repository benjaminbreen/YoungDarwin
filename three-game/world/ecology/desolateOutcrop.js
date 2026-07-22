import {
  DESOLATE_OUTCROP,
  desolateOutcropDryMask,
  desolateOutcropGuanoMask,
  desolateOutcropSouthSaddleMask,
  desolateOutcropTideShelfMask,
  desolateOutcropTidepoolMask,
} from '../regions/desolateOutcrop/terrain';
import { makeZoneScatter, seededRandom } from '../scatter';
import { getDesolateOutcropRocks } from '../desolateOutcropLayout';
import { modelAssetProp } from './ecologyAssetTransforms';
import { buildAmbientWildlifeLayer } from './ambientWildlife';
import { LAVA_CACTUS_SPECIES } from './floraSpecies';
import { buildProceduralInteractiveFloraLayer } from './proceduralFlora';
import { getCliffSurfProfile } from '../cliffSurfProfiles';

const NATURE = '/assets/models/nature/';

export const DESOLATE_OUTCROP_SWASH_PERIOD = (Math.PI * 2) / 0.5984;

const scatter = (layer, count, seed, opts) => makeZoneScatter(DESOLATE_OUTCROP, layer, count, seed, opts);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function buildFlora() {
  const saltbush = scatter('outcrop-saltbush', 5, 71, {
    minX: -18,
    maxX: 18,
    minZ: 18,
    maxZ: 39,
    scale: [0.38, 0.74],
    maxGrade: 0.7,
    accept: (biome, x, z, y) => (
      y > -0.05
      && z > 18
      && desolateOutcropSouthSaddleMask(x, z) > 0.28
      && (biome === 'red-cinder' || biome === 'dry-basalt')
    ),
  });

  return [
    {
      id: 'outcrop-saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.04,
      castShadow: false,
      motion: { wind: 1.8, bend: 0.36, bendRadius: 1.1 },
      items: saltbush.filter((_, index) => index % 2 === 0),
    },
    {
      id: 'outcrop-saltbush-2',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.04,
      castShadow: false,
      motion: { wind: 1.8, bend: 0.36, bendRadius: 1.1 },
      items: saltbush.filter((_, index) => index % 2 === 1),
    },
    {
      id: 'outcrop-sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.035,
      ySquash: 0.32,
      tint: '#9c6952',
      tintStrength: 0.22,
      castShadow: false,
      motion: { wind: 0.9, bend: 0.18, bendRadius: 1.1 },
      items: scatter('outcrop-sesuvium', 4, 83, {
        minX: -16,
        maxX: 20,
        minZ: 8,
        maxZ: 34,
        scale: [1.4, 2.5],
        maxGrade: 0.82,
        accept: (biome, x, z, y) => (
          y > -0.08
          && desolateOutcropDryMask(x, z) > 0.3
          && desolateOutcropGuanoMask(x, z) < 0.15
          && (biome === 'red-cinder' || biome === 'dry-basalt')
        ),
      }),
    },
    {
      id: 'outcrop-driftwood',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.02,
      tint: '#b6b0a0',
      tintStrength: 0.54,
      castShadow: false,
      items: scatter('outcrop-driftwood', 4, 97, {
        minX: 2,
        maxX: 30,
        minZ: -18,
        maxZ: 20,
        scale: [1.2, 2.6],
        maxGrade: 1.2,
        accept: (biome, x, z, y) => (
          y > -0.55
          && y < 0.4
          && desolateOutcropTideShelfMask(x, z) > 0.22
          && desolateOutcropTidepoolMask(x, z) < 0.48
          && (biome === 'wet-basalt' || biome === 'dry-basalt' || biome === 'red-cinder')
        ),
      }),
    },
  ];
}

function pickLitterVariant(i) {
  const r = seededRandom(i, 13);
  if (r < 0.52) return 'basalt-pebble';
  if (r < 0.68) return 'limestone-chip';
  if (r < 0.86) return 'coral-chip';
  return 'shell-shard-a';
}

function buildSurfaceLitter() {
  const palette = ['#4b463d', '#3c3c35', '#62594a', '#c7bfa5', '#b78978'];
  const items = scatter('outcrop-litter', 86, 113, {
    minX: -22,
    maxX: 32,
    minZ: -26,
    maxZ: 30,
    scale: [0.26, 0.72],
    maxGrade: 1.9,
    accept: (biome, x, z, y) => {
      if (y < -0.62 || y > 1.8) return false;
      if (desolateOutcropTidepoolMask(x, z) > 0.62) return false;
      return biome === 'wet-basalt'
        || biome === 'dry-basalt'
        || biome === 'red-cinder'
        || biome === 'guano-rock';
    },
  }).map((item, index) => {
    const seed = 9000 + index * 97;
    const variant = pickLitterVariant(seed);
    const guano = desolateOutcropGuanoMask(item.x, item.z);
    return {
      ...item,
      id: `outcrop-litter-${index}`,
      variant,
      color: guano > 0.32 ? '#d5cfb4' : palette[Math.floor(seededRandom(seed, 17) * palette.length)],
      wetness: item.y < -0.08 ? 0.8 : desolateOutcropTideShelfMask(item.x, item.z) * 0.38,
      scale: item.scale * (variant === 'basalt-pebble' ? 0.42 : 0.56),
      stretchX: 0.7 + seededRandom(seed, 23) * 0.8,
      stretchZ: 0.68 + seededRandom(seed, 29) * 0.62,
      heightScale: variant === 'basalt-pebble' ? 0.84 + seededRandom(seed, 31) * 0.5 : 0.75,
      lift: 0.008 + seededRandom(seed, 37) * 0.012,
      pitch: (seededRandom(seed, 41) - 0.5) * 0.24,
      roll: (seededRandom(seed, 43) - 0.5) * 0.22,
    };
  });

  return [{
    id: 'outcrop-basalt-shell-litter',
    maxVisibleDistance: 42,
    items,
  }];
}

function buildAmbientWildlife() {
  return [
    buildAmbientWildlifeLayer(DESOLATE_OUTCROP, {
      id: 'outcrop-swash-crabs',
      speciesId: 'crab',
      count: 5,
      seed: 151,
      bounds: { minX: 5, maxX: 31, minZ: -18, maxZ: 20 },
      scale: [1.1, 1.65],
      behavior: 'skitter',
      habitatRadiusX: 3.4,
      habitatRadiusZ: 2.0,
      maxGrade: 1.3,
      accept: (biome, x, z, y) => (
        y > -0.72
        && y < 0.38
        && desolateOutcropTideShelfMask(x, z) > 0.16
        && desolateOutcropTidepoolMask(x, z) < 0.62
        && (biome === 'wet-basalt' || biome === 'dry-basalt' || biome === 'tidepool')
      ),
    }),
  ];
}

function buildInteractiveFlora() {
  return [buildProceduralInteractiveFloraLayer({
    id: 'outcrop-lava-cactus-pioneers',
    zoneId: DESOLATE_OUTCROP,
    species: LAVA_CACTUS_SPECIES,
    runtime: 'lava-cactus',
    seed: 167,
    count: 5,
    bounds: { minX: -17, maxX: 17, minZ: 18, maxZ: 39 },
    habitatAt: ({ biome, x, z, y }) => {
      const dry = desolateOutcropDryMask(x, z);
      const guano = desolateOutcropGuanoMask(x, z);
      const saddle = desolateOutcropSouthSaddleMask(x, z);
      const tideShelf = desolateOutcropTideShelfMask(x, z);
      const tidepool = desolateOutcropTidepoolMask(x, z);
      const biomeSuitability = {
        'dry-basalt': 1,
        'red-cinder': 0.9,
        'guano-rock': 0.08,
        'wet-basalt': 0,
      }[biome] || 0;
      return {
        moisture: clamp01(0.06 + tideShelf * 0.14),
        canopy: 0,
        exposure: 0.98,
        disturbance: 0.03,
        salinity: 0.1,
        rockiness: clamp01(0.72 + dry * 0.25),
        biomeSuitability,
        localSuitability: clamp01(0.38 + dry * 0.36 + saddle * 0.26),
        excluded: biomeSuitability <= 0
          || y < -0.03
          || dry < 0.3
          || guano > 0.18
          || tideShelf > 0.3
          || tidepool > 0.16,
      };
    },
    placement: {
      patchCount: 2,
      patchRadius: [2.2, 4.2],
      minPatchSeparation: 6.5,
      minItemSeparation: 1.5,
      maxGrade: 0.66,
    },
    siteFromItem: item => ({
      flowerCount: item.tone < 0.62 ? 0 : 1,
    }),
  })];
}

function buildCrabProps(rocks) {
  return rocks
    .filter(rock => rock.y > -0.65 && rock.y < 0.44 && desolateOutcropTideShelfMask(rock.x, rock.z) > 0.16)
    .slice(0, 2)
    .map(rock => ({
      ...modelAssetProp('crab', { yaw: rock.yaw * 1.7, fallbackPath: '/assets/models/crab.glb' }),
      id: `outcrop-crab-${rock.id}`,
      position: [
        rock.x,
        rock.y + rock.radiusY * 2 - rock.sink * 2 + modelAssetProp('crab').yOffset,
        rock.z,
      ],
      maxVisibleDistance: 38,
    }));
}

export function buildDesolateOutcropEcology() {
  const rocks = getDesolateOutcropRocks();
  const splashAnchors = rocks.filter(rock => (
    rock.y > -1.1
    && rock.y < 0.28
    && (desolateOutcropTideShelfMask(rock.x, rock.z) > 0.14 || rock.z < -25)
  ));

  return {
    zoneId: DESOLATE_OUTCROP,
    cliffSurf: getCliffSurfProfile(DESOLATE_OUTCROP),
    flora: buildFlora(),
    interactiveFlora: buildInteractiveFlora(),
    surfaceLitter: buildSurfaceLitter(),
    ambientWildlife: buildAmbientWildlife(),
    rocks,
    splashes: { anchors: splashAnchors.slice(0, 16), period: DESOLATE_OUTCROP_SWASH_PERIOD },
    footprintBiomes: ['dry-basalt', 'red-cinder', 'guano-rock', 'wet-basalt'],
    birds: [
      { radius: 14, height: 16, speed: 0.12, phase: 0.4, cx: -5, cz: -30 },
      { radius: 23, height: 22, speed: -0.075, phase: 2.3, cx: 8, cz: -18 },
      { radius: 18, height: 19, speed: 0.09, phase: 4.1, cx: -10, cz: -9 },
    ],
    props: buildCrabProps(rocks),
  };
}
