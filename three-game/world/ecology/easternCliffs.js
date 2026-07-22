import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { getEasternCliffsRocks } from '../easternCliffsLayout';
import {
  EASTERN_CLIFFS,
  easternCliffsBasaltExposure,
  easternCliffsCoastDistance,
  easternCliffsFaceMask,
  easternCliffsGuanoMask,
  easternCliffsPathInfo,
  easternCliffsRimMask,
  easternCliffsShelterMask,
} from '../regions/easternCliffs/path';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { coastalBirds } from './flyingBirds';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function safeOffPath(biome, x, z, clearance = 1.6) {
  const path = easternCliffsPathInfo(x, z);
  return easternCliffsCoastDistance(x, z) > 9
    && path.distance > path.width * clearance
    && biome !== 'cliff-cinder-traverse'
    && biome !== 'cliff-path-shoulder';
}

function buildGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: EASTERN_CLIFFS,
    idPrefix: 'eastern-cliffs-wind-grass',
    count: 620,
    seed: 18113,
    bounds: { minX: -44, maxX: 29, minZ: -28, maxZ: 40 },
    pathInfo: easternCliffsPathInfo,
    rejectBiomes: [
      'open-water-bed',
      'eastern-basalt-face',
      'wind-scoured-cliff-rim',
      'frigatebird-guano-ledge',
      'cliff-cinder-traverse',
      'cliff-path-shoulder',
    ],
    pathClearance: 1.48,
    sparseBand: 1.5,
    baseChance: 0.08,
    pathDistanceWeight: 0.25,
    clumpWeight: 0.42,
    gapWeight: 0.3,
    maxGrade: 0.78,
    scale: [0.34, 0.82],
    windYaw: -0.24,
    attemptsPerItem: 180,
    densityAt: ({ x, z }) => easternCliffsShelterMask(x, z) * 0.28
      - easternCliffsBasaltExposure(x, z) * 0.1,
    accept: ({ x, z }) => easternCliffsCoastDistance(x, z) > 11
      && easternCliffsGuanoMask(x, z) < 0.2
      && hash2(x, z, 31) > easternCliffsRimMask(x, z) * 0.4,
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.54
      + tone * 0.22
      + easternCliffsRimMask(x, z) * 0.18
      + (path?.shoulder || 0) * 0.1
      - easternCliffsShelterMask(x, z) * 0.2,
    ),
  });

  return createStandardDryGrassPatchLayer({
    id: 'eastern-cliffs-flattened-grass',
    items,
    materialColor: '#e8e2c1',
    emissive: '#252718',
    emissiveIntensity: 0.04,
    roughness: 1,
    widthScale: 1.16,
    heightScale: 0.72,
    depthScale: 1.18,
    maxVisibleDistance: 92,
    motion: { wind: 1.5, bend: 0.4, bendRadius: 1.02 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(
    EASTERN_CLIFFS,
    layer,
    count,
    seed,
    options,
  );
  const saltbush = varyScatterTransforms(scatter('eastern-cliffs-saltbush', 58, 18137, {
    minX: -44, maxX: 27, minZ: -27, maxZ: 40, scale: [0.52, 1.02], maxGrade: 0.76,
    accept: (biome, x, z) => safeOffPath(biome, x, z)
      && easternCliffsShelterMask(x, z) > 0.18
      && easternCliffsGuanoMask(x, z) < 0.22,
  }), 18137, { width: [0.9, 1.16], height: [0.76, 1.02], depth: [0.92, 1.18], maxLean: 0.075 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#8e9460' : '#68734d' }));

  const croton = varyScatterTransforms(scatter('eastern-cliffs-croton', 26, 18161, {
    minX: -42, maxX: 20, minZ: -25, maxZ: 39, scale: [0.42, 0.76], maxGrade: 0.72,
    accept: (biome, x, z) => safeOffPath(biome, x, z)
      && easternCliffsShelterMask(x, z) > 0.34
      && easternCliffsBasaltExposure(x, z) < 0.72,
  }), 18161, { width: [0.9, 1.12], height: [0.82, 1.06], maxLean: 0.06 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#7e8c55' : '#5a6d43' }));

  const cotton = varyScatterTransforms(scatter('eastern-cliffs-cotton', 14, 18191, {
    minX: -39, maxX: 16, minZ: -21, maxZ: 38, scale: [0.5, 0.84], maxGrade: 0.7,
    accept: (biome, x, z) => safeOffPath(biome, x, z, 1.5)
      && easternCliffsShelterMask(x, z) > 0.3
      && easternCliffsBasaltExposure(x, z) < 0.66,
  }), 18191, { width: [0.9, 1.1], height: [0.86, 1.08], maxLean: 0.05 });

  const candelabra = varyScatterTransforms(scatter('eastern-cliffs-candelabra', 3, 18223, {
    minX: -36, maxX: 17, minZ: -18, maxZ: 34, scale: [2.45, 3.35], maxGrade: 0.48,
    accept: (biome, x, z) => safeOffPath(biome, x, z, 1.9)
      && easternCliffsBasaltExposure(x, z) > 0.4
      && easternCliffsRimMask(x, z) < 0.36,
  }), 18223, { width: [0.94, 1.06], height: [0.9, 1.08], maxLean: 0.018 });

  return [
    { id: 'eastern-cliffs-saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.52, bend: 0.4, bendRadius: 1.14 }, items: saltbush.filter((_, index) => index % 2 === 0) },
    { id: 'eastern-cliffs-saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.52, bend: 0.4, bendRadius: 1.14 }, items: saltbush.filter((_, index) => index % 2 === 1) },
    { id: 'eastern-cliffs-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.22, castShadow: false, motion: { wind: 1.36, bend: 0.36, bendRadius: 1.22 }, items: croton },
    { id: 'eastern-cliffs-cotton', path: `${NATURE}runtime-galapagos-cotton.glb`, sink: 0.06, tint: '#758653', tintStrength: 0.16, castShadow: false, motion: { wind: 1.24, bend: 0.28, bendRadius: 1.28 }, items: cotton },
    { id: 'eastern-cliffs-candelabra', path: `${NATURE}runtime-candelabra-cactus.glb`, sink: 0.04, tint: '#6d844c', tintStrength: 0.1, castShadow: true, motion: { wind: 0.28, bend: 0.045, bendRadius: 1.45 }, items: candelabra },
  ];
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: EASTERN_CLIFFS,
    id: 'eastern-cliffs-rim-litter',
    itemIdPrefix: 'eastern-cliffs-chip',
    count: 560,
    seed: 18251,
    bounds: { minX: -44, maxX: 32, minZ: -29, maxZ: 41 },
    scale: [0.46, 1.34],
    maxGrade: 1.18,
    maxVisibleDistance: 58,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.66, colors: ['#4a4941', '#30332f', '#222622'] },
      { variant: 'oxidized-scoria-chip', weight: 0.2, colors: ['#8d5038', '#6f4032'] },
      { variant: 'shell-shard-a', weight: 0.14, colors: ['#d0cbb5', '#b9b49f'] },
    ],
    accept: (biome, x, z) => {
      const path = easternCliffsPathInfo(x, z);
      const coastDistance = easternCliffsCoastDistance(x, z);
      return coastDistance > 5.45
        && coastDistance < 19
        && path.tread < 0.18
        && (
          easternCliffsRimMask(x, z) > 0.22
          || easternCliffsGuanoMask(x, z) > 0.14
          || easternCliffsBasaltExposure(x, z) > 0.58
          || path.shoulder > 0.26
        );
    },
    wetnessAt: (x, z) => easternCliffsFaceMask(x, z) * 0.18,
  })];
}

export function buildEasternCliffsEcology() {
  return {
    zoneId: EASTERN_CLIFFS,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora: buildFlora(),
    rocks: getEasternCliffsRocks(),
    surfaceLitter: buildSurfaceLitter(),
    cliffSurf: getCliffSurfProfile(EASTERN_CLIFFS),
    props: [],
    footprintBiomes: [
      'cliff-cinder-traverse',
      'cliff-path-shoulder',
      'frigatebird-guano-ledge',
      'fractured-headland-basalt',
      'open-headland-scrub',
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 26, radiusZ: 15, height: 25, speed: 0.074, phase: 0.2, cx: 18, cz: -18, flapRate: 0.32, scale: 1.08 },
      { species: 'frigatebird', path: 'lazyFigureEight', radiusX: 26, radiusZ: 15, height: 31, speed: -0.052, phase: 2.1, cx: 34, cz: -7, flapRate: 0.26, scale: 1.12 },
      { species: 'frigatebird', radiusX: 22, radiusZ: 13, height: 22, speed: 0.086, phase: 4.4, cx: 8, cz: -25, flapRate: 0.38, scale: 0.96 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 30, radiusZ: 16, height: 19, speed: -0.068, phase: 5.6, cx: 30, cz: 13, flapRate: 0.68 },
    ]),
  };
}
