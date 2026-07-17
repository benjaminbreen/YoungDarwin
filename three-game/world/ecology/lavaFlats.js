import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { getLavaFlatsFlowShelves, getLavaFlatsRocks } from '../lavaFlatsLayout';
import {
  LAVA_FLATS,
  lavaFlatsPathInfo,
  lavaFlatsPioneerMask,
  lavaFlatsPressureRidgeMask,
  lavaFlatsScoriaMask,
  lavaFlatsTubeMasks,
} from '../regions/lavaFlats/path';

const NATURE = '/assets/models/nature/';

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: LAVA_FLATS,
    id: 'lava-flats-fractured-litter',
    count: 286,
    seed: 821,
    bounds: { minX: -51, maxX: 51, minZ: -47, maxZ: 47 },
    scale: [0.62, 1.62],
    sizeVariation: [0.82, 1.3],
    maxGrade: 1.12,
    maxVisibleDistance: 52,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 5.2, colors: ['#2b2d2b', '#383934', '#46433c'] },
      { variant: 'weathered-basalt-chip', weight: 2.6, colors: ['#74736d', '#5f605b', '#858077'] },
      { variant: 'oxidized-scoria-chip', weight: 1.6, colors: ['#7d4936', '#985d42', '#693a30'] },
    ],
    accept: (biome, x, z) => {
      const path = lavaFlatsPathInfo(x, z);
      if (path.distance < path.width * 1.42) return false;
      const ridge = lavaFlatsPressureRidgeMask(x, z);
      const scoria = lavaFlatsScoriaMask(x, z);
      const tube = lavaFlatsTubeMasks(x, z);
      return Math.max(ridge, scoria * 0.92, tube.rim * 0.86) > 0.24;
    },
  })];
}

function buildPioneerFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(LAVA_FLATS, layer, count, seed, options);
  const lowPioneers = varyScatterTransforms(scatter('lava-flats-low-pioneers', 12, 863, {
    minX: -45,
    maxX: 45,
    minZ: -39,
    maxZ: 44,
    scale: [0.72, 1.3],
    maxGrade: 0.78,
    accept: (biome, x, z) => {
      const path = lavaFlatsPathInfo(x, z);
      return path.distance > path.width * 2.1
        && lavaFlatsPioneerMask(x, z) > 0.42
        && lavaFlatsScoriaMask(x, z) < 0.72;
    },
  }), 863, { width: [0.86, 1.14], height: [0.78, 1.06], depth: [0.9, 1.12], maxLean: 0.07 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#776f4d' : '#5e6546' }));

  const saltbush = varyScatterTransforms(scatter('lava-flats-saltbush', 5, 887, {
    minX: -43,
    maxX: 43,
    minZ: -36,
    maxZ: 43,
    scale: [0.42, 0.72],
    maxGrade: 0.7,
    accept: (biome, x, z) => {
      const path = lavaFlatsPathInfo(x, z);
      return path.distance > path.width * 2.4
        && lavaFlatsPioneerMask(x, z) > 0.58
        && lavaFlatsPressureRidgeMask(x, z) < 0.62;
    },
  }), 887, { width: [0.88, 1.12], height: [0.86, 1.08], depth: [0.9, 1.1], maxLean: 0.045 })
    .map(item => ({ ...item, tint: item.tone > 0.52 ? '#777b54' : '#5b6447' }));

  return [
    {
      id: 'lava-flats-sesuvium-pioneers',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.04,
      ySquash: 0.48,
      tintStrength: 0.24,
      castShadow: false,
      motion: { wind: 1.0, bend: 0.2, bendRadius: 1.0 },
      maxVisibleDistance: 72,
      items: lowPioneers,
    },
    {
      id: 'lava-flats-saltbush-1',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.35, bend: 0.3, bendRadius: 1.1 },
      maxVisibleDistance: 78,
      items: saltbush.filter((_, index) => index % 2 === 0),
    },
    {
      id: 'lava-flats-saltbush-2',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.05,
      tintStrength: 0.2,
      castShadow: false,
      motion: { wind: 1.35, bend: 0.3, bendRadius: 1.1 },
      maxVisibleDistance: 78,
      items: saltbush.filter((_, index) => index % 2 === 1),
    },
  ];
}

export function buildLavaFlatsEcology() {
  return {
    zoneId: LAVA_FLATS,
    flora: buildPioneerFlora(),
    surfaceLitter: buildSurfaceLitter(),
    rocks: getLavaFlatsRocks(),
    volcanicFormations: [{
      id: 'lava-flats-flow-shelves',
      items: getLavaFlatsFlowShelves(),
      maxVisibleDistance: 112,
    }],
    footprintBiomes: ['black-lava', 'lava-shelf', 'ash-slope', 'trail'],
  };
}
