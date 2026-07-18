import { getPostScrubRiseRocks } from '../postScrubRiseLayout';
import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import {
  POST_SCRUB_RISE,
  scrubRiseBasaltExposure,
  scrubRisePathInfo,
  scrubRiseThicketStrength,
  scrubRiseWashMask,
} from '../regions/postScrubRise/path';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  DARWINIOTHAMNUS_SPECIES,
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  MATURE_OPUNTIA_PATH,
  MATURE_OPUNTIA_PLACEMENT,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';
import {
  LAVA_CACTUS_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
  PALO_SANTO_SPECIES,
} from './floraSpecies';
import {
  buildProceduralFloraLayer,
  buildProceduralInteractiveFloraLayer,
  floraCompanionSuitability,
} from './proceduralFlora';

const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function offPath(biome, x, z) {
  const path = scrubRisePathInfo(x, z);
  return path.distance > path.width * 1.72
    && biome !== 'scrub-rise-path'
    && biome !== 'scrub-rise-path-shoulder';
}

function grassDryness({ x, z, y, tone, path }) {
  const inland = clamp01((z + 48) / 96);
  const sheltered = scrubRiseThicketStrength(x, z);
  const washMoisture = scrubRiseWashMask(x, z);
  return clamp01(0.4 + tone * 0.2 + inland * 0.08 + (path?.shoulder || 0) * 0.12 - sheltered * 0.1 - washMoisture * 0.08 + Math.max(0, y - 7) * 0.025);
}

function grassTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.72 + tone * 0.16 + pathShoulder * 0.1);
  if (warm > 0.68) return tone > 0.52 ? '#bbb061' : '#95894d';
  if (warm > 0.46) return tone > 0.5 ? '#8f9b58' : '#6e7e49';
  return tone > 0.48 ? '#718a50' : '#526c3f';
}

function buildGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: POST_SCRUB_RISE,
    idPrefix: 'post-scrub-rise-grass',
    count: 1180,
    seed: 24113,
    bounds: { minX: -52, maxX: 52, minZ: -48, maxZ: 48 },
    pathInfo: scrubRisePathInfo,
    rejectBiomes: ['scrub-rise-path', 'scrub-rise-path-shoulder', 'basalt-scrub'],
    pathClearance: 1.3,
    sparseBand: 1.4,
    baseChance: 0.14,
    pathDistanceWeight: 0.38,
    clumpWeight: 0.34,
    gapWeight: 0.2,
    maxGrade: 1.04,
    slopeStep: 0.82,
    scale: [0.42, 1.02],
    windYaw: -0.66,
    attemptsPerItem: 170,
    densityAt: ({ x, z }) => {
      const thicket = scrubRiseThicketStrength(x, z);
      const wash = scrubRiseWashMask(x, z);
      const openPocket = thicket > 0.16 && thicket < 0.56 ? 0.18 : 0;
      return openPocket + wash * 0.08;
    },
    accept: ({ x, z }) => scrubRiseBasaltExposure(x, z) < 0.78
      && (scrubRiseThicketStrength(x, z) < 0.72 || hash2(x, z, 31) < 0.28),
    drynessAt: grassDryness,
    tintAt: grassTint,
  });
  return createStandardDryGrassPatchLayer({
    id: 'post-scrub-rise-olive-grass-patches',
    items,
    materialColor: '#efedcf',
    emissive: '#242916',
    emissiveIntensity: 0.045,
    roughness: 1,
    widthScale: 0.96,
    heightScale: 1.03,
    depthScale: 0.98,
    maxVisibleDistance: 94,
    motion: { wind: 1.04, bend: 0.22, bendRadius: 1.12 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(POST_SCRUB_RISE, layer, count, seed, options);
  const acceptThicket = (minimum, salt = 0) => (biome, x, z) => offPath(biome, x, z)
    && scrubRiseThicketStrength(x, z) > minimum
    && hash2(x, z, salt) < 0.58 + scrubRiseThicketStrength(x, z) * 0.36;

  const saltbush = varyScatterTransforms(scatter('scrub-rise-saltbush', 96, 359, {
    minX: -52, maxX: 52, minZ: -47, maxZ: 48, scale: [0.78, 1.38], maxGrade: 0.92,
    accept: acceptThicket(0.24, 29),
  }), 359, { width: [0.88, 1.12], height: [0.9, 1.12], maxLean: 0.045 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#89925d' : '#66724b' }));
  const croton = varyScatterTransforms(scatter('scrub-rise-croton', 58, 383, {
    minX: -50, maxX: 50, minZ: -45, maxZ: 47, scale: [0.52, 0.92], maxGrade: 0.9,
    accept: acceptThicket(0.32, 41),
  }), 383, { width: [0.88, 1.12], height: [0.9, 1.12], maxLean: 0.04 })
    .map(item => ({ ...item, tint: item.tone > 0.52 ? '#839252' : '#5f713f' }));
  // The source GLB was built from ocotillo branches and is 7.8 m tall at 1x.
  // At shrub scale its dense, thorny silhouette is a useful dry-season proxy
  // for Floreana's endemic bitterbush, rather than a convincing palo santo.
  const castela = varyScatterTransforms(scatter('scrub-rise-castela', 26, 401, {
    minX: -48, maxX: 48, minZ: -43, maxZ: 48, scale: [0.18, 0.32], maxGrade: 0.78,
    accept: (biome, x, z) => offPath(biome, x, z)
      && scrubRiseThicketStrength(x, z) > 0.36
      && scrubRiseBasaltExposure(x, z) < 0.78,
  }), 401, { width: [0.9, 1.1], height: [0.88, 1.14], maxLean: 0.035 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#777b54' : '#5a6044' }));
  const darwiniothamnus = makeDarwiniothamnusPatchScatter(POST_SCRUB_RISE, 'scrub-rise-darwiniothamnus', 63, 419, {
    minX: -49, maxX: 49, minZ: -44, maxZ: 46, scale: [0.8, 2.45], maxGrade: 0.84,
    patchCount: 7, patchRadius: [3.2, 6.6],
    accept: (biome, x, z) => {
      const thicket = scrubRiseThicketStrength(x, z);
      return offPath(biome, x, z)
        && thicket > 0.16
        && thicket < 0.72
        && scrubRiseWashMask(x, z) < 0.58
        && scrubRiseBasaltExposure(x, z) < 0.82;
    },
  }, { width: [0.88, 1.15], height: [0.88, 1.12], maxLean: 0.045 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#89955d' : '#687849' }));
  const cactus = varyScatterTransforms(scatter('scrub-rise-candelabra', 6, 431, {
    minX: -46, maxX: 48, minZ: -34, maxZ: 46, scale: [2.5, 3.65], maxGrade: 0.52,
    accept: (biome, x, z) => offPath(biome, x, z)
      && scrubRiseBasaltExposure(x, z) > 0.48
      && scrubRiseThicketStrength(x, z) < 0.7,
  }), 431, { width: [0.92, 1.08], height: [0.9, 1.1], maxLean: 0.015 })
    .map(item => ({ ...item, tint: '#6f8950' }));

  return [
    { id: 'scrub-rise-saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: saltbush.filter((_, index) => index % 2 === 0) },
    { id: 'scrub-rise-saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: saltbush.filter((_, index) => index % 2 === 1) },
    { id: 'scrub-rise-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.22, castShadow: false, motion: { wind: 1.1, bend: 0.26, bendRadius: 1.3 }, items: croton },
    { id: 'scrub-rise-darwiniothamnus', label: DARWINIOTHAMNUS_LABEL, path: DARWINIOTHAMNUS_PATH, variantMode: DARWINIOTHAMNUS_VARIANT_MODE, sink: 0.05, tintStrength: 0.16, castShadow: false, motion: { wind: 0.92, bend: 0.24, bendRadius: 1.6 }, items: darwiniothamnus },
    { id: 'scrub-rise-castela', label: 'Galapagos bitterbush / Castela galapageia', path: `${NATURE}runtime-palo-santo.glb`, sink: 0.06, tintStrength: 0.22, castShadow: true, motion: { wind: 0.54, bend: 0.1, bendRadius: 1.5 }, items: castela },
    { id: 'scrub-rise-candelabra-cactus', path: `${NATURE}runtime-candelabra-cactus.glb`, sink: 0.04, tintStrength: 0.1, castShadow: true, motion: { wind: 0.24, bend: 0.04, bendRadius: 1.45 }, items: cactus },
  ];
}

function distanceToNearestItem(items, x, z) {
  let nearest = Infinity;
  for (const item of items) {
    nearest = Math.min(nearest, Math.hypot(x - item.x, z - item.z));
  }
  return nearest;
}

function makeOpuntiaHabitatAt(authoredFlora) {
  const candelabra = authoredFlora
    .find(layer => layer.id === 'scrub-rise-candelabra-cactus')?.items || [];
  return ({ biome, x, z }) => {
    const path = scrubRisePathInfo(x, z);
    const thicket = scrubRiseThicketStrength(x, z);
    const wash = scrubRiseWashMask(x, z);
    const basalt = scrubRiseBasaltExposure(x, z);
    const inland = clamp01((z + 48) / 96);
    const biomeSuitability = {
      'basalt-scrub': 1,
      'open-dry-grass': 0.9,
      'thorn-scrub': 0.74,
      'inland-grass-rise': 0.58,
      'dry-wash': 0.16,
    }[biome] || 0;

    return {
      moisture: clamp01(0.14 + thicket * 0.18 + wash * 0.12),
      canopy: clamp01(0.04 + thicket * 0.42),
      exposure: clamp01(0.91 - thicket * 0.32),
      disturbance: clamp01(path.path * 0.9 + path.shoulder * 0.34),
      salinity: (1 - inland) * 0.16,
      rockiness: basalt,
      biomeSuitability,
      localSuitability: clamp01(0.42 + basalt * 0.38 + (1 - thicket) * 0.2),
      excluded: biomeSuitability <= 0
        || path.distance < path.width * 1.85
        || wash > 0.48
        || thicket > 0.72
        || basalt > 0.9
        || distanceToNearestItem(candelabra, x, z) < 5
        // Preserve the authored collectible cactus clearing west of the wash.
        || Math.hypot(x + 31, z + 9) < 5,
    };
  };
}

function buildProceduralFlora(authoredFlora, interactiveFlora = []) {
  const authoredDarwiniothamnus = authoredFlora
    .find(layer => layer.id === 'scrub-rise-darwiniothamnus')?.items || [];
  const habitatAt = ({ biome, x, z }) => {
    const path = scrubRisePathInfo(x, z);
    const thicket = scrubRiseThicketStrength(x, z);
    const wash = scrubRiseWashMask(x, z);
    const basalt = scrubRiseBasaltExposure(x, z);
    const inland = clamp01((z + 48) / 96);
    const thicketEdge = clamp01(1 - Math.abs(thicket - 0.42) / 0.4);
    const biomeSuitability = {
      'thorn-scrub': 1,
      'inland-grass-rise': 0.94,
      'open-dry-grass': 0.72,
      'basalt-scrub': 0.32,
      'dry-wash': 0.18,
    }[biome] || 0;

    return {
      moisture: clamp01(0.27 + thicket * 0.3 + wash * 0.1),
      canopy: clamp01(0.05 + thicket * 0.65),
      exposure: clamp01(0.84 - thicket * 0.42 + basalt * 0.08),
      disturbance: clamp01(path.path * 0.86 + path.shoulder * 0.34),
      salinity: (1 - inland) * 0.12,
      biomeSuitability,
      localSuitability: clamp01(0.34 + thicketEdge * 0.5 + inland * 0.16),
      excluded: biomeSuitability <= 0
        || path.distance < path.width * 1.72
        || wash > 0.58
        || basalt > 0.82
        || distanceToNearestItem(authoredDarwiniothamnus, x, z) < 3.2,
    };
  };

  const youngOpuntiaSites = interactiveFlora
    .filter(layer => layer.speciesId === OPUNTIA_MEGASPERMA_SPECIES.id)
    .flatMap(layer => layer.sites || []);
  const opuntiaHabitatAt = makeOpuntiaHabitatAt(authoredFlora);
  const matureOpuntiaHabitatAt = sample => {
    const base = opuntiaHabitatAt(sample);
    const companionSuitability = floraCompanionSuitability(youngOpuntiaSites, sample.x, sample.z, {
      minimumDistance: 3.5,
      preferredDistance: [5.2, 11.5],
      maximumDistance: 18.5,
    });
    return {
      ...base,
      localSuitability: base.localSuitability * companionSuitability,
      excluded: base.excluded || companionSuitability <= 0,
    };
  };

  return [
    buildProceduralFloraLayer({
      id: 'post-scrub-rise-darwiniothamnus-overlay',
      zoneId: POST_SCRUB_RISE,
      species: DARWINIOTHAMNUS_SPECIES,
      asset: {
        path: DARWINIOTHAMNUS_PATH,
        variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
        variantCount: 9,
      },
      seed: 907,
      count: 36,
      bounds: { minX: -49, maxX: 49, minZ: -44, maxZ: 46 },
      habitatAt,
      placement: {
        patchCount: 4,
        patchRadius: [3.2, 6.2],
        minPatchSeparation: 8,
        maxGrade: 0.72,
      },
      render: {
        sink: 0.05,
        tintStrength: 0.16,
        castShadow: false,
        motion: { wind: 0.92, bend: 0.24, bendRadius: 1.6 },
      },
    }),
    buildProceduralFloraLayer({
      id: 'post-scrub-rise-mature-opuntia-overlay',
      zoneId: POST_SCRUB_RISE,
      species: OPUNTIA_MEGASPERMA_SPECIES,
      asset: { path: MATURE_OPUNTIA_PATH },
      seed: 929,
      count: 4,
      bounds: { minX: -47, maxX: 47, minZ: -42, maxZ: 44 },
      habitatAt: matureOpuntiaHabitatAt,
      placement: {
        ...MATURE_OPUNTIA_PLACEMENT,
        patchCount: 2,
        minPatchSeparation: 14,
        minItemSeparation: 8,
      },
      render: {
        sink: 0.04,
        tint: '#698b45',
        tintStrength: 0.08,
        castShadow: true,
        maxVisibleDistance: 116,
        motion: { wind: 0.16, bend: 0.03, bendRadius: 3.4 },
      },
    }),
  ];
}

function buildInteractiveFlora(authoredFlora) {
  const habitatAt = makeOpuntiaHabitatAt(authoredFlora);
  const authoredTreesAndCacti = authoredFlora
    .filter(layer => layer.id.includes('candelabra') || layer.id.includes('castela'))
    .flatMap(layer => layer.items || []);
  const rocks = getPostScrubRiseRocks();

  const lavaCactusHabitatAt = ({ biome, x, z }) => {
    const path = scrubRisePathInfo(x, z);
    const thicket = scrubRiseThicketStrength(x, z);
    const wash = scrubRiseWashMask(x, z);
    const basalt = scrubRiseBasaltExposure(x, z);
    const biomeSuitability = {
      'basalt-scrub': 1,
      'open-dry-grass': 0.55,
      'thorn-scrub': 0.24,
      'inland-grass-rise': 0.18,
      'dry-wash': 0,
    }[biome] || 0;
    return {
      moisture: clamp01(0.07 + thicket * 0.14 + wash * 0.08),
      canopy: clamp01(thicket * 0.28),
      exposure: clamp01(0.96 - thicket * 0.3),
      disturbance: clamp01(path.path * 0.9 + path.shoulder * 0.3),
      salinity: 0.04,
      rockiness: basalt,
      biomeSuitability,
      localSuitability: clamp01(0.34 + basalt * 0.58 + (1 - thicket) * 0.08),
      excluded: biomeSuitability <= 0
        || path.distance < path.width * 1.85
        || wash > 0.32
        || thicket > 0.46
        || basalt < 0.48
        || Math.hypot(x + 31, z + 9) < 5.5,
    };
  };

  const paloSantoHabitatAt = ({ biome, x, z }) => {
    const path = scrubRisePathInfo(x, z);
    const thicket = scrubRiseThicketStrength(x, z);
    const wash = scrubRiseWashMask(x, z);
    const basalt = scrubRiseBasaltExposure(x, z);
    const biomeSuitability = {
      'thorn-scrub': 1,
      'inland-grass-rise': 0.9,
      'open-dry-grass': 0.64,
      'basalt-scrub': 0.34,
      'dry-wash': 0.08,
    }[biome] || 0;
    const obstacleClear = rocks.every(rock => (
      Math.hypot(x - rock.x, z - rock.z) > (rock.radiusX || rock.scale || 0.4) + 2
    ));
    return {
      moisture: clamp01(0.16 + thicket * 0.28 + wash * 0.1),
      canopy: clamp01(0.03 + thicket * 0.32),
      exposure: clamp01(0.88 - thicket * 0.32 + basalt * 0.06),
      disturbance: clamp01(path.path * 0.9 + path.shoulder * 0.34),
      salinity: 0.03,
      rockiness: basalt,
      biomeSuitability,
      localSuitability: clamp01(0.28 + thicket * 0.52 + (1 - wash) * 0.2),
      excluded: biomeSuitability <= 0
        || path.distance < path.width * 2.35
        || wash > 0.48
        || thicket < 0.2
        || thicket > 0.82
        || basalt > 0.84
        || !obstacleClear
        || distanceToNearestItem(authoredTreesAndCacti, x, z) < 5.5,
    };
  };

  return [
    buildProceduralInteractiveFloraLayer({
      id: 'post-scrub-rise-prickly-pear-overlay',
      zoneId: POST_SCRUB_RISE,
      species: OPUNTIA_MEGASPERMA_SPECIES,
      runtime: 'prickly-pear',
      seed: 941,
      count: 6,
      bounds: { minX: -46, maxX: 46, minZ: -40, maxZ: 43 },
      habitatAt,
      placement: {
        patchCount: 2,
        patchRadius: [7.5, 10.5],
        minPatchSeparation: 18,
        minItemSeparation: 4.5,
        maxGrade: 0.62,
      },
      siteFromItem: item => ({
        flowerCount: item.tone < 0.32 ? 0 : item.tone < 0.7 ? 1 : item.tone < 0.92 ? 2 : 3,
      }),
    }),
    buildProceduralInteractiveFloraLayer({
      id: 'post-scrub-rise-lava-cactus-overlay',
      zoneId: POST_SCRUB_RISE,
      species: LAVA_CACTUS_SPECIES,
      runtime: 'lava-cactus',
      seed: 953,
      count: 5,
      bounds: { minX: -46, maxX: 46, minZ: -40, maxZ: 43 },
      habitatAt: lavaCactusHabitatAt,
      placement: {
        patchCount: 2,
        patchRadius: [2.8, 5.2],
        minPatchSeparation: 11,
        minItemSeparation: 1.8,
        maxGrade: 0.64,
      },
      siteFromItem: item => ({
        flowerCount: item.tone < 0.56 ? 0 : item.tone < 0.9 ? 1 : 2,
      }),
    }),
    buildProceduralInteractiveFloraLayer({
      id: 'post-scrub-rise-palo-santo-overlay',
      zoneId: POST_SCRUB_RISE,
      species: PALO_SANTO_SPECIES,
      runtime: 'palo-santo',
      seed: 967,
      count: 5,
      bounds: { minX: -47, maxX: 47, minZ: -42, maxZ: 45 },
      habitatAt: paloSantoHabitatAt,
      placement: {
        patchCount: 2,
        patchRadius: [8, 12],
        minPatchSeparation: 18,
        minItemSeparation: 9,
        maxGrade: 0.54,
      },
      siteFromItem: item => ({ leafiness: 0.14 + item.tone * 0.34 }),
    }),
  ];
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: POST_SCRUB_RISE,
    id: 'scrub-rise-basalt-litter',
    itemIdPrefix: 'scrub-rise-chip',
    count: 520,
    seed: 467,
    bounds: { minX: -50, maxX: 50, minZ: -46, maxZ: 47 },
    scale: [0.55, 1.55],
    accept: (biome, x, z) => {
      const path = scrubRisePathInfo(x, z);
      return path.tread < 0.18 && (
        scrubRiseWashMask(x, z) > 0.22
        || scrubRiseBasaltExposure(x, z) > 0.56
        || path.shoulder > 0.28
      );
    },
  })];
}

export function buildPostScrubRiseEcology() {
  const flora = buildFlora();
  const interactiveFlora = buildInteractiveFlora(flora);
  return {
    zoneId: POST_SCRUB_RISE,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora,
    proceduralFlora: buildProceduralFlora(flora, interactiveFlora),
    interactiveFlora,
    rocks: getPostScrubRiseRocks(),
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: ['scrub-rise-path', 'scrub-rise-path-shoulder', 'dry-wash', 'open-dry-grass'],
    birds: [
      { radius: 18, height: 14, speed: 0.105, phase: 0.7, cx: -12, cz: -8 },
      { radius: 14, height: 11, speed: -0.12, phase: 3.4, cx: 21, cz: 24 },
    ],
  };
}
