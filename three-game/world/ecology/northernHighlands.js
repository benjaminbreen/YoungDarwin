import { AUTHORED_LAVA_CACTUS_SITES } from '../../physics/props/lavaCactus/lavaCactusAuthoredSites';
import { buildNorthernHighlandsCropFields } from '../crops/northernHighlandsCrops';
import { getNorthernHighlandsRocks } from '../northernHighlandsLayout';
import {
  NORTHERN_HIGHLANDS,
  northernHighlandsBasaltExposure,
  northernHighlandsCormorantEcotone,
  northernHighlandsGardenFringe,
  northernHighlandsGardenInfo,
  northernHighlandsMoisture,
  northernHighlandsPathInfo,
  northernHighlandsScrubStrength,
} from '../regions/northernHighlands/path';
import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_SPECIES,
  DARWINIOTHAMNUS_VARIANT_MODE,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';
import { buildProceduralFloraLayer } from './proceduralFlora';
import { buildProceduralInteractiveFloraLayer } from './proceduralFlora';
import {
  DELILIA_INELEGANS_SPECIES,
  LECOCARPUS_PINNATIFIDUS_SPECIES,
  SICYOS_VILLOSUS_SPECIES,
} from './floraSpecies';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';
const CACTUS_SITES = AUTHORED_LAVA_CACTUS_SITES[NORTHERN_HIGHLANDS] || [];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function cactusClearance(x, z) {
  return CACTUS_SITES.reduce((nearest, site) => (
    Math.min(nearest, Math.hypot(x - site.x, z - site.z))
  ), Infinity);
}

function offWorkedGround(biome, x, z, pathMultiplier = 1.65) {
  const path = northernHighlandsPathInfo(x, z);
  return path.distance > path.width * pathMultiplier
    && northernHighlandsGardenInfo(x, z).mask < 0.05
    && biome !== 'highlands-cinder-path'
    && biome !== 'highlands-path-shoulder';
}

function grassDryness({ x, z, tone, path }) {
  const moisture = northernHighlandsMoisture(x, z);
  const scrub = northernHighlandsScrubStrength(x, z);
  return clamp01(0.58 + tone * 0.18 + (path?.shoulder || 0) * 0.1 - moisture * 0.45 - scrub * 0.06);
}

function grassTint(tone, dryness) {
  if (dryness > 0.66) return tone > 0.5 ? '#c2b568' : '#9f9252';
  if (dryness > 0.42) return tone > 0.5 ? '#99a75d' : '#768a4d';
  return tone > 0.5 ? '#799b56' : '#567b47';
}

function buildGrass() {
  const highlandItems = buildStandardDryPathGrassPatchItems({
    zoneId: NORTHERN_HIGHLANDS,
    idPrefix: 'northern-highlands-grass',
    count: 1260,
    seed: 53117,
    bounds: { minX: -52, maxX: 52, minZ: -48, maxZ: 48 },
    pathInfo: northernHighlandsPathInfo,
    rejectBiomes: ['highlands-cinder-path', 'highlands-garden-loam', 'weathered-basalt-scrub'],
    pathClearance: 1.06,
    sparseBand: 1.5,
    baseChance: 0.18,
    pathDistanceWeight: 0.35,
    clumpWeight: 0.34,
    gapWeight: 0.2,
    maxGrade: 0.96,
    slopeStep: 0.82,
    scale: [0.44, 1.06],
    windYaw: -0.58,
    attemptsPerItem: 160,
    densityAt: ({ x, z, path }) => northernHighlandsMoisture(x, z) * 0.2
      + northernHighlandsGardenFringe(x, z) * 0.28
      + (path?.shoulder || 0) * 0.18,
    accept: ({ x, z }) => northernHighlandsGardenInfo(x, z).mask < 0.04
      && northernHighlandsBasaltExposure(x, z) < 0.8
      && cactusClearance(x, z) > 1.9,
    drynessAt: grassDryness,
    tintAt: grassTint,
  });
  const cormorantEdgeItems = buildStandardDryPathGrassPatchItems({
    zoneId: NORTHERN_HIGHLANDS,
    idPrefix: 'northern-highlands-cormorant-edge-grass',
    count: 300,
    seed: 53203,
    bounds: { minX: -52, maxX: 52, minZ: -51.4, maxZ: -31.5 },
    pathInfo: northernHighlandsPathInfo,
    rejectBiomes: ['highlands-cinder-path', 'highlands-garden-loam', 'weathered-basalt-scrub'],
    pathClearance: 1.08,
    sparseBand: 1.38,
    baseChance: 0.26,
    pathDistanceWeight: 0.34,
    clumpWeight: 0.38,
    gapWeight: 0.16,
    clumpScale: 0.06,
    gapScale: 0.13,
    maxGrade: 0.92,
    slopeStep: 0.82,
    scale: [0.5, 1.12],
    windYaw: -0.6,
    attemptsPerItem: 180,
    densityAt: ({ x, z, path }) => northernHighlandsCormorantEcotone(x, z) * 0.38
      + northernHighlandsMoisture(x, z) * 0.16
      + (path?.shoulder || 0) * 0.12,
    accept: ({ x, z }) => northernHighlandsCormorantEcotone(x, z) > 0.08
      && northernHighlandsGardenInfo(x, z).mask < 0.04
      && northernHighlandsBasaltExposure(x, z) < 0.86
      && cactusClearance(x, z) > 1.9,
    drynessAt: grassDryness,
    tintAt: grassTint,
  });
  return createStandardDryGrassPatchLayer({
    id: 'northern-highlands-transition-grass',
    items: [...highlandItems, ...cormorantEdgeItems],
    materialColor: '#f1eed6',
    emissive: '#202917',
    emissiveIntensity: 0.045,
    widthScale: 1.04,
    heightScale: 1.08,
    depthScale: 1.02,
    maxVisibleDistance: 96,
    motion: { wind: 1.08, bend: 0.25, bendRadius: 1.18 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(NORTHERN_HIGHLANDS, layer, count, seed, options);
  const thicketAccept = (minimum, salt) => (biome, x, z) => offWorkedGround(biome, x, z)
    && northernHighlandsScrubStrength(x, z) > minimum
    && cactusClearance(x, z) > 2.3
    && hash2(x, z, salt) < 0.6 + northernHighlandsScrubStrength(x, z) * 0.3;

  const saltbush = varyScatterTransforms(scatter('northern-highlands-saltbush', 132, 551, {
    minX: -51, maxX: 51, minZ: -46, maxZ: 46, scale: [0.72, 1.3], maxGrade: 0.86,
    accept: (biome, x, z) => thicketAccept(0.24, 17)(biome, x, z)
      && northernHighlandsMoisture(x, z) < 0.58,
  }), 551, { width: [0.88, 1.12], height: [0.9, 1.12], maxLean: 0.045 });

  const croton = varyScatterTransforms(scatter('northern-highlands-croton', 94, 569, {
    minX: -49, maxX: 49, minZ: -44, maxZ: 46, scale: [0.54, 0.98], maxGrade: 0.82,
    accept: (biome, x, z) => offWorkedGround(biome, x, z)
      && northernHighlandsScrubStrength(x, z) > 0.25
      && northernHighlandsMoisture(x, z) > 0.18
      && cactusClearance(x, z) > 2.1,
  }), 569, { width: [0.88, 1.13], height: [0.9, 1.13], maxLean: 0.04 });

  const cotton = varyScatterTransforms(scatter('northern-highlands-cotton', 38, 587, {
    minX: -48, maxX: 48, minZ: -42, maxZ: 44, scale: [0.66, 1.08], maxGrade: 0.78,
    accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.8)
      && northernHighlandsMoisture(x, z) < 0.54
      && northernHighlandsBasaltExposure(x, z) < 0.74
      && cactusClearance(x, z) > 2.4,
  }), 587, { width: [0.9, 1.12], height: [0.9, 1.12], maxLean: 0.035 });

  const darwiniothamnus = makeDarwiniothamnusPatchScatter(
    NORTHERN_HIGHLANDS,
    'northern-highlands-darwiniothamnus',
    72,
    601,
    {
      minX: -48, maxX: 48, minZ: -42, maxZ: 45, scale: [0.8, 2.4], maxGrade: 0.72,
      patchCount: 6, patchRadius: [3.2, 6.4],
      accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.75)
        && northernHighlandsMoisture(x, z) > 0.24
        && northernHighlandsMoisture(x, z) < 0.78
        && northernHighlandsBasaltExposure(x, z) < 0.76
        && cactusClearance(x, z) > 2.4,
    },
    { width: [0.88, 1.15], height: [0.88, 1.12], maxLean: 0.04 },
  );

  const groundPlants = varyScatterTransforms(scatter('northern-highlands-ground-plants', 110, 619, {
    minX: -44, maxX: 42, minZ: 10, maxZ: 46, scale: [0.055, 0.13], maxGrade: 0.68,
    accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.55)
      && northernHighlandsMoisture(x, z) > 0.5
      && northernHighlandsGardenInfo(x, z).mask < 0.08,
  }), 619, { width: [0.9, 1.12], height: [0.86, 1.08], maxLean: 0.055 });

  // The multi-mesh bush asset reads as a connected shrub hummock rather than
  // a single specimen. Restrict it to the stronger habitat fields so the map
  // gains the dense, interlocking matrix visible in the Floreana reference
  // without closing the trails or distant sightlines.
  const bushHummocks = varyScatterTransforms(scatter('northern-highlands-bush-hummocks', 46, 631, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 46, scale: [0.014, 0.027], maxGrade: 0.74,
    accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.9)
      && cactusClearance(x, z) > 3
      && (northernHighlandsScrubStrength(x, z) > 0.34 || northernHighlandsMoisture(x, z) > 0.52),
  }), 631, { width: [0.9, 1.14], height: [0.88, 1.12], maxLean: 0.025 });

  const cormorantEdgeHummocks = varyScatterTransforms(scatter('northern-highlands-cormorant-edge-hummocks', 26, 633, {
    minX: -50, maxX: 50, minZ: -50.5, maxZ: -32, scale: [0.012, 0.022], maxGrade: 0.76,
    accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.8)
      && northernHighlandsCormorantEcotone(x, z) > 0.2
      && northernHighlandsBasaltExposure(x, z) < 0.84
      && cactusClearance(x, z) > 2.6,
  }), 633, { width: [0.86, 1.18], height: [0.78, 1.04], maxLean: 0.025 });

  const castela = varyScatterTransforms(scatter('northern-highlands-castela', 30, 637, {
    minX: -49, maxX: 49, minZ: -42, maxZ: 44, scale: [0.17, 0.31], maxGrade: 0.72,
    accept: (biome, x, z) => offWorkedGround(biome, x, z, 1.85)
      && northernHighlandsScrubStrength(x, z) > 0.32
      && northernHighlandsMoisture(x, z) < 0.58
      && cactusClearance(x, z) > 2.8,
  }), 637, { width: [0.9, 1.12], height: [0.88, 1.14], maxLean: 0.03 });

  const tint = (items, light, dark) => items.map(item => ({
    ...item,
    tint: item.tone > 0.5 ? light : dark,
  }));

  return [
    { id: 'northern-highlands-saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: tint(saltbush.filter((_, i) => i % 3 === 0), '#a1a666', '#69764a') },
    { id: 'northern-highlands-saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: tint(saltbush.filter((_, i) => i % 3 === 1), '#8f985e', '#64744a') },
    { id: 'northern-highlands-saltbush-3', path: `${NATURE}runtime-saltbush-3.glb`, sink: 0.04, tintStrength: 0.2, castShadow: false, motion: { wind: 0.9, bend: 0.22, bendRadius: 1.42 }, items: tint(saltbush.filter((_, i) => i % 3 === 2).map(item => ({ ...item, scale: item.scale * 0.46 })), '#87965d', '#556943') },
    { id: 'northern-highlands-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.22, castShadow: false, motion: { wind: 1.08, bend: 0.27, bendRadius: 1.35 }, items: tint(croton, '#81985d', '#597447') },
    { id: 'northern-highlands-cotton', path: `${NATURE}runtime-galapagos-cotton.glb`, sink: 0.07, tintStrength: 0.18, castShadow: false, motion: { wind: 0.82, bend: 0.16, bendRadius: 1.5 }, items: tint(cotton, '#748852', '#52683f') },
    { id: 'northern-highlands-darwiniothamnus', label: DARWINIOTHAMNUS_LABEL, path: DARWINIOTHAMNUS_PATH, variantMode: DARWINIOTHAMNUS_VARIANT_MODE, sink: 0.05, tintStrength: 0.16, castShadow: false, motion: { wind: 0.88, bend: 0.22, bendRadius: 1.65 }, items: tint(darwiniothamnus, '#829b5c', '#617d4c') },
    { id: 'northern-highlands-ground-plants', path: `${NATURE}runtime-ground-plants.glb`, sink: 0.05, ySquash: 0.48, tintStrength: 0.3, castShadow: false, motion: { wind: 1.18, bend: 0.36, bendRadius: 1.2 }, items: tint(groundPlants, '#668451', '#405f42') },
    { id: 'northern-highlands-bush-hummocks', path: `${NATURE}runtime-galapagos-bushes.glb`, sink: 0.07, tintStrength: 0.2, castShadow: false, motion: { wind: 0.76, bend: 0.18, bendRadius: 1.8 }, items: tint(bushHummocks, '#91a45f', '#637b4c') },
    { id: 'northern-highlands-cormorant-edge-hummocks', path: `${NATURE}runtime-galapagos-bushes.glb`, sink: 0.075, ySquash: 0.82, tintStrength: 0.24, castShadow: false, motion: { wind: 0.82, bend: 0.2, bendRadius: 1.7 }, items: tint(cormorantEdgeHummocks, '#789455', '#536f45') },
    { id: 'northern-highlands-castela', label: 'Galapagos bitterbush / Castela galapageia', path: `${NATURE}runtime-palo-santo.glb`, sink: 0.07, tintStrength: 0.2, castShadow: true, motion: { wind: 0.46, bend: 0.08, bendRadius: 1.8 }, items: tint(castela, '#899263', '#656c4e') },
  ];
}

function buildProceduralFlora(authoredFlora) {
  const authored = authoredFlora.find(layer => layer.id === 'northern-highlands-darwiniothamnus')?.items || [];
  return [buildProceduralFloraLayer({
    id: 'northern-highlands-darwiniothamnus-overlay',
    zoneId: NORTHERN_HIGHLANDS,
    species: DARWINIOTHAMNUS_SPECIES,
    asset: {
      path: DARWINIOTHAMNUS_PATH,
      variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
      variantCount: 9,
    },
    seed: 641,
    count: 44,
    bounds: { minX: -47, maxX: 47, minZ: -40, maxZ: 45 },
    habitatAt: ({ biome, x, z }) => {
      const path = northernHighlandsPathInfo(x, z);
      const moisture = northernHighlandsMoisture(x, z);
      const scrub = northernHighlandsScrubStrength(x, z);
      const basalt = northernHighlandsBasaltExposure(x, z);
      const nearestAuthored = authored.reduce((nearest, item) => (
        Math.min(nearest, Math.hypot(x - item.x, z - item.z))
      ), Infinity);
      return {
        moisture,
        canopy: clamp01(0.05 + scrub * 0.58),
        exposure: clamp01(0.9 - scrub * 0.38 - moisture * 0.16),
        disturbance: clamp01(path.path * 0.86 + path.shoulder * 0.34 + northernHighlandsGardenInfo(x, z).mask),
        salinity: 0.02,
        rockiness: basalt,
        biomeSuitability: biome === 'green-transition-grass' || biome === 'highlands-thorn-scrub' ? 1 : 0.42,
        localSuitability: clamp01(0.38 + moisture * 0.34 + scrub * 0.28),
        excluded: !offWorkedGround(biome, x, z, 1.72)
          || moisture < 0.22
          || moisture > 0.82
          || basalt > 0.8
          || cactusClearance(x, z) < 2.5
          || nearestAuthored < 3.2,
      };
    },
    placement: {
      patchCount: 4,
      patchRadius: [3.2, 6.2],
      minPatchSeparation: 8,
      maxGrade: 0.72,
    },
    render: {
      sink: 0.05,
      tint: '#789356',
      tintStrength: 0.16,
      castShadow: false,
      motion: { wind: 0.88, bend: 0.22, bendRadius: 1.65 },
    },
  })];
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: NORTHERN_HIGHLANDS,
    id: 'northern-highlands-weathered-litter',
    itemIdPrefix: 'northern-highlands-chip',
    count: 380,
    seed: 659,
    bounds: { minX: -50, maxX: 50, minZ: -46, maxZ: 47 },
    scale: [0.5, 1.42],
    colors: ['#626057', '#4a4d47', '#353a36'],
    accept: (biome, x, z) => {
      const path = northernHighlandsPathInfo(x, z);
      return northernHighlandsGardenInfo(x, z).mask < 0.05
        && path.tread < 0.18
        && (northernHighlandsBasaltExposure(x, z) > 0.52 || path.shoulder > 0.24);
    },
  })];
}

function buildLostPlantInteractiveFlora() {
  const sicyos = buildProceduralInteractiveFloraLayer({
    id: 'northern-highlands-sicyos-villosus-reconstruction',
    zoneId: NORTHERN_HIGHLANDS,
    species: SICYOS_VILLOSUS_SPECIES,
    runtime: 'sicyos-villosus',
    seed: 661,
    count: 1,
    bounds: { minX: -45, maxX: 45, minZ: -38, maxZ: 43 },
    habitatAt: ({ biome, x, z }) => {
      const path = northernHighlandsPathInfo(x, z);
      const moisture = northernHighlandsMoisture(x, z);
      const scrub = northernHighlandsScrubStrength(x, z);
      const basalt = northernHighlandsBasaltExposure(x, z);
      const suitableBiome = biome === 'green-transition-grass'
        || biome === 'highlands-thorn-scrub'
        || biome === 'transition-moist-hollow';
      return {
        moisture,
        canopy: clamp01(0.1 + scrub * 0.58),
        exposure: clamp01(0.78 - scrub * 0.36 - moisture * 0.2),
        disturbance: clamp01(path.path * 0.44 + path.shoulder * 0.2),
        salinity: 0,
        rockiness: basalt,
        biomeSuitability: suitableBiome ? 1 : 0,
        localSuitability: clamp01(0.42 + moisture * 0.36 + scrub * 0.18),
        excluded: !suitableBiome
          || !offWorkedGround(biome, x, z, 1.35)
          || moisture < 0.42
          || moisture > 0.82
          || basalt > 0.68
          || northernHighlandsGardenInfo(x, z).mask > 0.03
          || cactusClearance(x, z) < 2.8,
      };
    },
    placement: {
      patchCount: 1,
      patchRadius: [3.4, 4.8],
      minItemSeparation: 7,
      maxGrade: 0.58,
    },
    siteFromItem: item => ({ flowering: 0.54 + item.tone * 0.32 }),
  });
  const delilia = buildProceduralInteractiveFloraLayer({
    id: 'northern-highlands-delilia-inelegans-reconstruction',
    zoneId: NORTHERN_HIGHLANDS,
    species: DELILIA_INELEGANS_SPECIES,
    runtime: 'delilia-inelegans',
    seed: 673,
    count: 1,
    bounds: { minX: -44, maxX: 44, minZ: -37, maxZ: 42 },
    habitatAt: ({ biome, x, z }) => {
      const path = northernHighlandsPathInfo(x, z);
      const moisture = northernHighlandsMoisture(x, z);
      const scrub = northernHighlandsScrubStrength(x, z);
      const basalt = northernHighlandsBasaltExposure(x, z);
      const suitableBiome = biome === 'green-transition-grass'
        || biome === 'open-seed-grass'
        || biome === 'transition-moist-hollow';
      const nearestSicyos = sicyos.sites.reduce((nearest, site) => (
        Math.min(nearest, Math.hypot(x - site.x, z - site.z))
      ), Infinity);
      return {
        moisture,
        canopy: clamp01(0.04 + scrub * 0.5),
        exposure: clamp01(0.86 - scrub * 0.34 - moisture * 0.18),
        disturbance: clamp01(path.path * 0.48 + path.shoulder * 0.22),
        salinity: 0,
        rockiness: basalt,
        biomeSuitability: suitableBiome ? 1 : 0,
        localSuitability: clamp01(0.5 + moisture * 0.22 + path.shoulder * 0.18),
        excluded: !suitableBiome
          || !offWorkedGround(biome, x, z, 1.28)
          || moisture < 0.28
          || moisture > 0.72
          || scrub > 0.68
          || basalt > 0.66
          || northernHighlandsGardenInfo(x, z).mask > 0.03
          || cactusClearance(x, z) < 2.5
          || nearestSicyos < 5,
      };
    },
    placement: {
      patchCount: 1,
      patchRadius: [1.5, 2.4],
      minItemSeparation: 5,
      maxGrade: 0.58,
    },
    siteFromItem: item => ({ flowering: 0.76 + item.tone * 0.2 }),
  });
  const lecocarpus = buildProceduralInteractiveFloraLayer({
    id: 'northern-highlands-lecocarpus-pinnatifidus',
    zoneId: NORTHERN_HIGHLANDS,
    species: LECOCARPUS_PINNATIFIDUS_SPECIES,
    runtime: 'lecocarpus-pinnatifidus',
    seed: 683,
    count: 1,
    bounds: { minX: -45, maxX: 45, minZ: -39, maxZ: 43 },
    habitatAt: ({ biome, x, z }) => {
      const path = northernHighlandsPathInfo(x, z);
      const moisture = northernHighlandsMoisture(x, z);
      const scrub = northernHighlandsScrubStrength(x, z);
      const basalt = northernHighlandsBasaltExposure(x, z);
      const suitableBiome = biome === 'open-seed-grass'
        || biome === 'green-transition-grass'
        || biome === 'highlands-thorn-scrub';
      const lostPlantSites = [...sicyos.sites, ...delilia.sites];
      const nearestLostPlant = lostPlantSites.reduce((nearest, site) => (
        Math.min(nearest, Math.hypot(x - site.x, z - site.z))
      ), Infinity);
      return {
        moisture,
        canopy: clamp01(0.04 + scrub * 0.44),
        exposure: clamp01(0.9 - scrub * 0.34 - moisture * 0.14),
        disturbance: clamp01(path.path * 0.6 + path.shoulder * 0.24),
        salinity: 0,
        rockiness: basalt,
        biomeSuitability: suitableBiome ? 1 : 0,
        localSuitability: clamp01(0.52 + scrub * 0.18 + basalt * 0.12),
        excluded: !suitableBiome
          || !offWorkedGround(biome, x, z, 1.3)
          || moisture < 0.16
          || moisture > 0.58
          || scrub > 0.7
          || basalt > 0.76
          || northernHighlandsGardenInfo(x, z).mask > 0.03
          || cactusClearance(x, z) < 2.6
          || nearestLostPlant < 5.5,
      };
    },
    placement: { patchCount: 1, patchRadius: [2.4, 4], minItemSeparation: 7, maxGrade: 0.62 },
    siteFromItem: item => ({ flowering: 0.7 + item.tone * 0.24 }),
  });
  return [sicyos, delilia, lecocarpus];
}

export function buildNorthernHighlandsEcology() {
  const flora = buildFlora();
  return {
    zoneId: NORTHERN_HIGHLANDS,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora,
    proceduralFlora: buildProceduralFlora(flora),
    interactiveFlora: buildLostPlantInteractiveFlora(),
    rocks: getNorthernHighlandsRocks(),
    surfaceLitter: buildSurfaceLitter(),
    crops: buildNorthernHighlandsCropFields(),
    props: [],
    footprintBiomes: [
      'highlands-cinder-path',
      'highlands-path-shoulder',
      'highlands-garden-loam',
      'open-seed-grass',
      'green-transition-grass',
      'transition-moist-hollow',
    ],
    birds: [
      { radius: 13, height: 9, speed: 0.13, phase: 0.8, cx: 17, cz: 17 },
      { radius: 18, height: 13, speed: -0.095, phase: 3.2, cx: -20, cz: -8 },
    ],
  };
}
