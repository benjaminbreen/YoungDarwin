import { makeZoneScatter, seededRandom, varyScatterTransforms } from '../scatter';
import { spreadBounds, spreadBoundsNear, spreadCount } from '../regionSpread';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { getSouthernVolcanicFlowToes, getSouthernVolcanicRocks } from '../southernVolcanicLayout';
import {
  AUTHORED_KIPUKA,
  FUMAROLES,
  SOUTHERN_VOLCANIC,
  SOUTHERN_VOLCANIC_SPREAD as S,
  southernVolcanicConeInfo,
  southernVolcanicKipukaMask,
  southernVolcanicPathInfo,
  southernVolcanicPioneerMask,
  southernVolcanicPressureRidgeMask,
  southernVolcanicScoriaMask,
  southernVolcanicSulphurMask,
  southernVolcanicTumulusInfo,
} from '../regions/southernVolcanic/path';
import { southernVolcanicHeight } from '../regions/southernVolcanic/terrain';
import { MATURE_OPUNTIA_PATH } from './floraAssets';
import { LAVA_CACTUS_SPECIES, PALO_SANTO_SPECIES } from './floraSpecies';
import { buildProceduralInteractiveFloraLayer } from './proceduralFlora';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import { coastalBirds } from './flyingBirds';

// Basalt Plains (S_VOLCANIC): fresh pāhoehoe almost bare of life. Lava
// cactus and sesuvium root in the cracks and tumulus clefts; saltbush where
// ash has gathered; and on the one kīpuka of older ground, leafless palo
// santo, tree prickly pear and a little dry grass. Nothing grows near the
// vents.

const NATURE = '/assets/models/nature/';

// Bounds and counts are authored at the original map scale. Plain-wide layers
// grow with the spread map and keep their density; kīpuka layers follow the
// kīpuka, which keeps its size.
const plain = bounds => spreadBounds(bounds, S);
const onKipuka = bounds => spreadBoundsNear(bounds, AUTHORED_KIPUKA, S);
const plainCount = count => spreadCount(count, S);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function offTrail(x, z, factor) {
  const path = southernVolcanicPathInfo(x, z);
  return path.distance > path.width * factor;
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: SOUTHERN_VOLCANIC,
    id: 'southern-volcanic-clinker-litter',
    count: plainCount(300),
    seed: 4417,
    bounds: plain({ minX: -52, maxX: 52, minZ: -48, maxZ: 48 }),
    scale: [0.6, 1.58],
    sizeVariation: [0.82, 1.3],
    maxGrade: 1.15,
    maxVisibleDistance: 54,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 4.8, colors: ['#2a2b29', '#363631', '#44413a'] },
      { variant: 'weathered-basalt-chip', weight: 2.2, colors: ['#6f6d66', '#5c5c57', '#817c72'] },
      { variant: 'oxidized-scoria-chip', weight: 2.4, colors: ['#7f4836', '#9a5b41', '#6a392f'] },
    ],
    accept: (biome, x, z) => {
      if (!offTrail(x, z, 1.4)) return false;
      if (southernVolcanicKipukaMask(x, z) > 0.6) return false;
      const scoria = southernVolcanicScoriaMask(x, z);
      const ridge = southernVolcanicPressureRidgeMask(x, z);
      const tumulus = southernVolcanicTumulusInfo(x, z);
      return Math.max(scoria, ridge * 0.9, tumulus.dome * 0.8) > 0.26;
    },
  })];
}

function buildPioneerFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(SOUTHERN_VOLCANIC, layer, count, seed, options);
  const pioneers = varyScatterTransforms(scatter('southern-volcanic-sesuvium', plainCount(16), 4433, {
    ...plain({ minX: -50, maxX: 50, minZ: -46, maxZ: 48 }),
    scale: [0.66, 1.24],
    maxGrade: 0.82,
    accept: (biome, x, z) => offTrail(x, z, 2)
      && southernVolcanicPioneerMask(x, z) > 0.4
      && southernVolcanicSulphurMask(x, z) < 0.1
      && southernVolcanicScoriaMask(x, z) < 0.7,
  }), 4433, { width: [0.86, 1.14], height: [0.78, 1.06], depth: [0.9, 1.12], maxLean: 0.07 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#7d6a48' : '#5f6646' }));

  const saltbush = varyScatterTransforms(scatter('southern-volcanic-saltbush', plainCount(9), 4441, {
    ...plain({ minX: -48, maxX: 48, minZ: -44, maxZ: 46 }),
    scale: [0.42, 0.74],
    maxGrade: 0.7,
    accept: (biome, x, z) => offTrail(x, z, 2.4)
      && southernVolcanicPioneerMask(x, z) > 0.55
      && southernVolcanicSulphurMask(x, z) < 0.05,
  }), 4441, { width: [0.88, 1.12], height: [0.86, 1.08], depth: [0.9, 1.1], maxLean: 0.045 })
    .map(item => ({ ...item, tint: item.tone > 0.52 ? '#767a52' : '#5b6447' }));

  const kipuka = (layer, count, seed, options) => scatter(layer, count, seed, {
    ...onKipuka({ minX: 16, maxX: 46, minZ: -24, maxZ: -2 }),
    maxGrade: 0.5,
    ...options,
    accept: (biome, x, z) => offTrail(x, z, 2.2) && southernVolcanicKipukaMask(x, z) > (options.threshold ?? 0.45),
  });

  return [
    {
      id: 'southern-volcanic-sesuvium-pioneers',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.04,
      ySquash: 0.48,
      tintStrength: 0.24,
      castShadow: false,
      motion: { wind: 1.0, bend: 0.2, bendRadius: 1.0 },
      maxVisibleDistance: 72,
      items: pioneers,
    },
    {
      id: 'southern-volcanic-saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.35, bend: 0.3, bendRadius: 1.1 },
      maxVisibleDistance: 78,
      items: saltbush.filter((_, index) => index % 2 === 0),
    },
    {
      id: 'southern-volcanic-saltbush-2',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.35, bend: 0.3, bendRadius: 1.1 },
      maxVisibleDistance: 78,
      items: saltbush.filter((_, index) => index % 2 === 1),
    },
    {
      // Old tree prickly pear on the kīpuka, the tallest thing on the plain.
      id: 'southern-volcanic-kipuka-opuntia',
      label: 'Mature Floreana prickly pear / Opuntia megasperma',
      path: MATURE_OPUNTIA_PATH,
      sink: 0.04,
      tint: '#698b45',
      tintStrength: 0.08,
      castShadow: true,
      maxVisibleDistance: 120,
      motion: { wind: 0.16, bend: 0.03, bendRadius: 3.4 },
      items: kipuka('southern-volcanic-kipuka-opuntia', 4, 4451, { scale: [3.4, 4.6], threshold: 0.55 }),
    },
    {
      id: 'southern-volcanic-kipuka-croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.05,
      tint: '#7c7a52',
      tintStrength: 0.22,
      castShadow: false,
      motion: { wind: 1.0, bend: 0.22, bendRadius: 1.3 },
      maxVisibleDistance: 80,
      items: kipuka('southern-volcanic-kipuka-croton', 10, 4457, { scale: [0.55, 0.95], threshold: 0.35 }),
    },
  ];
}

function buildInteractiveFlora() {
  return [
    buildProceduralInteractiveFloraLayer({
      id: 'southern-volcanic-lava-cactus',
      zoneId: SOUTHERN_VOLCANIC,
      species: LAVA_CACTUS_SPECIES,
      runtime: 'lava-cactus',
      seed: 4463,
      count: plainCount(16),
      bounds: plain({ minX: -48, maxX: 48, minZ: -44, maxZ: 46 }),
      habitatAt: ({ biome, x, z }) => {
        const path = southernVolcanicPathInfo(x, z);
        const pioneer = southernVolcanicPioneerMask(x, z);
        const tumulus = southernVolcanicTumulusInfo(x, z);
        const ridge = southernVolcanicPressureRidgeMask(x, z);
        const freshRock = Math.max(ridge, tumulus.dome, southernVolcanicScoriaMask(x, z) * 0.6);
        const biomeSuitability = {
          'black-lava': 1,
          'lava-shelf': 1,
          'ash-slope': 0.7,
          'spatter-cone': 0.4,
        }[biome] || 0;
        return {
          moisture: clamp01(0.05 + pioneer * 0.16),
          canopy: 0,
          exposure: 0.98,
          disturbance: clamp01(path.path * 0.92 + path.shoulder * 0.28),
          salinity: 0.04,
          rockiness: clamp01(0.62 + freshRock * 0.36),
          biomeSuitability,
          localSuitability: clamp01(0.5 + freshRock * 0.3 + tumulus.cleft * 0.4 - pioneer * 0.12),
          excluded: biomeSuitability <= 0
            || path.distance < path.width * 1.85
            || southernVolcanicSulphurMask(x, z) > 0.08
            || southernVolcanicConeInfo(x, z).crater > 0.2,
        };
      },
      placement: {
        patchCount: plainCount(5),
        patchRadius: [2.6, 5.4],
        minPatchSeparation: 9,
        minItemSeparation: 1.6,
        maxGrade: 0.7,
      },
      siteFromItem: item => ({
        flowerCount: item.tone < 0.5 ? 0 : item.tone < 0.86 ? 1 : 2,
      }),
    }),
    buildProceduralInteractiveFloraLayer({
      id: 'southern-volcanic-kipuka-palo-santo',
      zoneId: SOUTHERN_VOLCANIC,
      species: PALO_SANTO_SPECIES,
      runtime: 'palo-santo',
      seed: 4471,
      count: 6,
      bounds: onKipuka({ minX: 16, maxX: 46, minZ: -24, maxZ: -2 }),
      habitatAt: ({ biome, x, z }) => {
        const kipuka = southernVolcanicKipukaMask(x, z);
        const biomeSuitability = biome === 'dry-scrub' ? 1 : 0;
        return {
          moisture: 0.18,
          canopy: 0.1,
          exposure: 0.86,
          disturbance: 0.05,
          salinity: 0.03,
          rockiness: 0.4,
          biomeSuitability,
          localSuitability: clamp01(kipuka),
          excluded: biomeSuitability <= 0 || !offTrail(x, z, 2.6),
        };
      },
      placement: {
        patchCount: 2,
        patchRadius: [4.5, 7.5],
        minPatchSeparation: 9,
        minItemSeparation: 4.2,
        maxGrade: 0.5,
      },
      // Leafless in the dry season, as Darwin saw the lowland scrub.
      siteFromItem: item => ({ leafiness: 0.04 + item.tone * 0.14 }),
    }),
  ];
}

function kipukaGrassTint(tone, dryness) {
  const shade = clamp01(tone * 0.5 + dryness * 0.3);
  return shade > 0.5 ? '#a49a64' : '#8c8656';
}

function buildKipukaGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: SOUTHERN_VOLCANIC,
    idPrefix: 'southern-volcanic-kipuka-grass',
    count: 150,
    seed: 4481,
    bounds: onKipuka({ minX: 18, maxX: 44, minZ: -22, maxZ: -4 }),
    rejectBiomes: ['trail'],
    maxGrade: 0.6,
    scale: [0.6, 1.1],
    drynessAt: ({ tone }) => clamp01(0.62 + tone * 0.3),
    tintAt: kipukaGrassTint,
    accept: ({ x, z }) => {
      const kipuka = southernVolcanicKipukaMask(x, z);
      return kipuka > 0.3 && seededRandom(Math.floor(x * 29 + z * 13), 7) < kipuka;
    },
  });
  return createStandardDryGrassPatchLayer({
    id: 'southern-volcanic-kipuka-dry-grass-patches',
    items,
    materialColor: '#e0d6aa',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 1,
    castShadow: false,
    widthScale: 0.9,
    heightScale: 0.9,
    maxVisibleDistance: 84,
    bladeTextureStrength: 0.24,
    motion: { wind: 1.0, bend: 0.26, bendRadius: 1.1 },
  });
}

function buildFumaroles() {
  return [{
    id: 'southern-volcanic-fumaroles',
    items: FUMAROLES.map(vent => ({
      id: vent.id,
      x: vent.x,
      y: southernVolcanicHeight(vent.x, vent.z),
      z: vent.z,
      strength: vent.strength,
    })),
  }];
}

export function buildSouthernVolcanicEcology() {
  return {
    zoneId: SOUTHERN_VOLCANIC,
    flora: buildPioneerFlora(),
    interactiveFlora: buildInteractiveFlora(),
    dryGrassPatches: [buildKipukaGrass()],
    surfaceLitter: buildSurfaceLitter(),
    rocks: getSouthernVolcanicRocks(),
    volcanicFormations: [{
      id: 'southern-volcanic-flow-toes',
      items: getSouthernVolcanicFlowToes(),
      maxVisibleDistance: 112,
    }],
    fumaroles: buildFumaroles(),
    footprintBiomes: ['black-lava', 'lava-shelf', 'ash-slope', 'trail', 'olivine-sand', 'dry-scrub'],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 26, radiusZ: 16, height: 34, speed: 0.048, phase: 1.1, cx: 4, cz: 6, flapRate: 0.34 },
      { species: 'frigatebird', radiusX: 18, radiusZ: 12, height: 40, speed: -0.052, phase: 3.6, cx: -20, cz: 26, flapRate: 0.38 },
    ].map(bird => ({
      ...bird,
      radiusX: bird.radiusX * S,
      radiusZ: bird.radiusZ * S,
      cx: bird.cx * S,
      cz: bird.cz * S,
    }))),
  };
}

