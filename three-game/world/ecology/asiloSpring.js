import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { getAsiloSpringRocks } from '../asiloSpringLayout';
import {
  ASILO_SPRING,
  ASILO_SPRING_FORD,
  ASILO_SPRING_POOL,
  asiloSpringChannelInfo,
  asiloSpringMoisture,
  asiloSpringPathInfo,
  asiloSpringRidgeInfo,
} from '../regions/asiloSpring/path';
import { WATER_LEVEL, terrainSurfaceNoise } from '../terrainShared';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';

// Highland Spring ecology: a green fern-and-sedge collar around the pool and
// brook, Scalesia on the tuff crest above the seep, and open damp grass on the
// southern approach so the water stays visible from the trail.

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clearOfTrailAndWater(biome, x, z, pathMultiplier = 1.6) {
  const path = asiloSpringPathInfo(x, z);
  const brook = asiloSpringChannelInfo(x, z);
  return path.distance > path.width * pathMultiplier
    && brook.water < 0.08
    && biome !== 'highland-cinder-path'
    && biome !== 'muddy-ford-path';
}

// The southern approach looks across the pool to the seeping face; keep that
// view open of trees and tall shrubs.
function clearPoolSightline(x, z) {
  const inView = x > -22 && x < 10 && z > -2 && z < 30;
  return !inView;
}

function clearFord(x, z, radius = 6) {
  return Math.hypot(x - ASILO_SPRING_FORD.x, z - ASILO_SPRING_FORD.z) > radius;
}

function tint(items, light, dark) {
  return items.map(item => ({ ...item, tint: item.tone > 0.5 ? light : dark }));
}

function buildGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: ASILO_SPRING,
    idPrefix: 'asilo-spring-grass',
    count: 1100,
    seed: 90113,
    bounds: { minX: -54, maxX: 54, minZ: -46, maxZ: 46 },
    pathInfo: asiloSpringPathInfo,
    rejectBiomes: [
      'spring-pool',
      'spring-brook',
      'spring-mud',
      'brook-gravel-bank',
      'muddy-ford-path',
      'highland-cinder-path',
      'seeping-tuff-face',
    ],
    pathCenterMax: 0.04,
    pathTreadMax: 0.2,
    maxGrade: 0.88,
    slopeStep: 0.82,
    scale: [0.46, 1.06],
    windYaw: -0.4,
    attemptsPerItem: 150,
    accept: ({ x, z, path }) => {
      const brook = asiloSpringChannelInfo(x, z);
      if (brook.water > 0.04 || brook.shoreDistance < 4.6) return false;
      if (asiloSpringRidgeInfo(x, z).face > 0.4) return false;
      return path.distance > path.width * 1.12;
    },
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.6 + tone * 0.16 + (path?.shoulder || 0) * 0.1 - asiloSpringMoisture(x, z) * 0.62,
    ),
    tintAt: (tone, dryness) => {
      if (dryness > 0.6) return tone > 0.5 ? '#b9ad66' : '#978c50';
      if (dryness > 0.34) return tone > 0.5 ? '#8ea65a' : '#6e884b';
      return tone > 0.5 ? '#6c9852' : '#4d7644';
    },
  });

  return createStandardDryGrassPatchLayer({
    id: 'asilo-spring-damp-grass',
    items,
    materialColor: '#f0edd4',
    emissive: '#1f2918',
    emissiveIntensity: 0.045,
    widthScale: 1.04,
    heightScale: 1.1,
    depthScale: 1.02,
    maxVisibleDistance: 102,
    motion: { wind: 0.96, bend: 0.24, bendRadius: 1.18 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(ASILO_SPRING, layer, count, seed, options);

  const sedges = varyScatterTransforms(scatter('asilo-spring-sedges', 190, 1013, {
    minX: -26, maxX: 54, minZ: -14, maxZ: 48, scale: [0.09, 0.24], maxGrade: 0.82,
    accept: (biome, x, z) => {
      const brook = asiloSpringChannelInfo(x, z);
      const path = asiloSpringPathInfo(x, z);
      const patch = terrainSurfaceNoise(x * 0.13 + 6, z * 0.14 - 1) * 0.5 + 0.5;
      return brook.shoreDistance > -0.1
        && brook.shoreDistance < 5.4
        && (brook.mud > 0.16 || brook.riparian > 0.2)
        && path.tread < 0.22
        && clearFord(x, z, 4)
        && patch > 0.38;
    },
  }), 1013, { width: [0.72, 1.12], height: [0.72, 1.24], depth: [0.76, 1.14], maxLean: 0.055 });

  // Ferns crowd the shaded foot of the tuff face and the brook banks.
  const ferns = varyScatterTransforms(scatter('asilo-spring-ferns', 140, 1031, {
    minX: -40, maxX: 50, minZ: -34, maxZ: 46, scale: [0.86, 1.62], maxGrade: 0.95,
    accept: (biome, x, z) => {
      const ridge = asiloSpringRidgeInfo(x, z);
      const brook = asiloSpringChannelInfo(x, z);
      return clearOfTrailAndWater(biome, x, z, 1.5)
        && (ridge.face > 0.2 || brook.riparian > 0.3 || asiloSpringMoisture(x, z) > 0.68)
        && clearFord(x, z, 5);
    },
  }), 1031, { width: [0.9, 1.16], height: [0.86, 1.12], maxLean: 0.06 });

  const scalesia = varyScatterTransforms(scatter('asilo-spring-scalesia', 24, 1049, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 44, scale: [0.66, 1.06], maxGrade: 0.66,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 2.5)
      && clearPoolSightline(x, z)
      && clearFord(x, z, 12)
      && asiloSpringRidgeInfo(x, z).face < 0.2
      && (asiloSpringRidgeInfo(x, z).top > 0.4 || asiloSpringMoisture(x, z) > 0.56),
  }), 1049, { width: [0.9, 1.12], height: [0.9, 1.12], maxLean: 0.025 });

  const croton = varyScatterTransforms(scatter('asilo-spring-croton', 52, 1067, {
    minX: -52, maxX: 52, minZ: -44, maxZ: 46, scale: [0.58, 1.0], maxGrade: 0.74,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.8)
      && clearPoolSightline(x, z)
      && asiloSpringMoisture(x, z) > 0.3
      && asiloSpringMoisture(x, z) < 0.8,
  }), 1067, { width: [0.88, 1.14], height: [0.9, 1.12], maxLean: 0.04 });

  const groundPlants = varyScatterTransforms(scatter('asilo-spring-ground-plants', 110, 1081, {
    minX: -50, maxX: 52, minZ: -30, maxZ: 46, scale: [0.055, 0.13], maxGrade: 0.78,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.4)
      && asiloSpringMoisture(x, z) > 0.5,
  }), 1081, { width: [0.9, 1.14], height: [0.84, 1.08], maxLean: 0.055 });

  const hummocks = varyScatterTransforms(scatter('asilo-spring-bush-hummocks', 26, 1097, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 44, scale: [0.013, 0.024], maxGrade: 0.7,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 2)
      && clearPoolSightline(x, z)
      && asiloSpringMoisture(x, z) > 0.38,
  }), 1097, { width: [0.88, 1.16], height: [0.84, 1.1], maxLean: 0.025 });

  return [
    { id: 'asilo-spring-sedges', path: `${NATURE}runtime-saltgrass.glb`, sink: 0.095, tintStrength: 0.22, castShadow: false, motion: { wind: 1.16, bend: 0.42, bendRadius: 1.05 }, items: tint(sedges, '#6f8f50', '#4c6e43') },
    { id: 'asilo-spring-ferns', path: `${NATURE}runtime-galapagos-fern.glb`, sink: 0.075, tintStrength: 0.18, castShadow: false, motion: { wind: 0.44, bend: 0.11, bendRadius: 1.18 }, items: tint(ferns, '#5f824f', '#3b6243') },
    { id: 'asilo-spring-scalesia', path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`, sink: 0.14, tintStrength: 0.12, castShadow: true, motion: { wind: 0.5, bend: 0.12, bendRadius: 3.2 }, items: tint(scalesia, '#709350', '#4d7044') },
    { id: 'asilo-spring-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.2, castShadow: false, motion: { wind: 1.0, bend: 0.28, bendRadius: 1.38 }, items: tint(croton, '#78945a', '#557448') },
    { id: 'asilo-spring-ground-plants', path: `${NATURE}runtime-ground-plants.glb`, sink: 0.05, ySquash: 0.52, tintStrength: 0.26, castShadow: false, motion: { wind: 1.1, bend: 0.32, bendRadius: 1.16 }, items: tint(groundPlants, '#688b53', '#456946') },
    { id: 'asilo-spring-bush-hummocks', path: `${NATURE}runtime-galapagos-bushes.glb`, sink: 0.07, tintStrength: 0.18, castShadow: false, motion: { wind: 0.72, bend: 0.18, bendRadius: 1.8 }, items: tint(hummocks, '#839b5e', '#58774c') },
  ];
}

function buildSurfaceLitter() {
  return [
    buildDryVolcanicLitterLayer({
      zoneId: ASILO_SPRING,
      id: 'asilo-spring-bank-cobbles',
      itemIdPrefix: 'asilo-spring-cobble',
      count: 520,
      seed: 1109,
      bounds: { minX: -26, maxX: 56, minZ: -12, maxZ: 48 },
      scale: [0.26, 0.78],
      sizeVariation: [0.72, 1.18],
      colors: ['#77766d', '#5d625d', '#454c48', '#343b38'],
      wetnessAt: (x, z) => {
        const brook = asiloSpringChannelInfo(x, z);
        return Math.max(brook.mud, brook.submergedShelf * 0.82);
      },
      maxGrade: 0.86,
      maxVisibleDistance: 64,
      accept: (biome, x, z) => {
        const brook = asiloSpringChannelInfo(x, z);
        const path = asiloSpringPathInfo(x, z);
        return path.tread < 0.34
          && brook.shoreDistance > -0.8
          && brook.shoreDistance < 4.2
          && (brook.gravel > 0.16 || brook.submergedShelf > 0.28 || brook.mud > 0.22)
          && brook.ford < 0.76;
      },
    }),
    buildDryVolcanicLitterLayer({
      zoneId: ASILO_SPRING,
      id: 'asilo-spring-tuff-chips',
      itemIdPrefix: 'asilo-spring-tuff-chip',
      count: 300,
      seed: 1123,
      bounds: { minX: -46, maxX: 34, minZ: -46, maxZ: 0 },
      scale: [0.42, 1.3],
      colors: ['#7b6a52', '#62553f', '#463f34'],
      accept: (biome, x, z) => {
        const ridge = asiloSpringRidgeInfo(x, z);
        const path = asiloSpringPathInfo(x, z);
        return path.tread < 0.18 && (ridge.face > 0.25 || ridge.cleft > 0.3 || ridge.top > 0.5);
      },
    }),
  ];
}

export function buildAsiloSpringEcology() {
  return {
    zoneId: ASILO_SPRING,
    stream: false,
    lagoonSurfaces: [
      {
        id: 'asilo-spring-surface',
        zoneId: ASILO_SPRING,
        position: [0, WATER_LEVEL + 0.036, 0],
        bounds: { minX: -24, maxX: 57, minZ: -12, maxZ: 50 },
        geometryResolution: [256, 192],
        colorA: '#2c4640',
        colorB: '#86a294',
        mudColor: '#4a4737',
        algaeColor: '#5b7a4c',
        waterColor: '#b9c9c0',
        opacity: 0.05,
        reflectivity: 0.09,
        waterAlpha: 0.9,
        waterShoreAlpha: 0.04,
        flowSpeed: 0.014,
        flowScale: 3.4,
        flowDirection: [0.97, 0.18],
        flowMapResolution: [224, 160],
        shoreNoise: 0.018,
        maskThreshold: 0.14,
        shoreBrighten: 0,
        shoreFade: 0.96,
        windRippleStrength: 0.9,
        rippleStrength: 0.78,
        distortionScale: 0.02,
        stepRippleStrength: 0.9,
        stepRippleDisplacement: 0.024,
        playerIdleRippleStrength: 0.5,
        overlayLift: 0.012,
        playerVeilLift: 0.032,
        playerVeilScale: [1.3, 0.9],
        textureWidth: 512,
        textureHeight: 512,
      },
    ],
    dryGrassPatches: [buildGrass()],
    flora: buildFlora(),
    proceduralFlora: [],
    rocks: getAsiloSpringRocks(),
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: [
      'highland-cinder-path',
      'muddy-ford-path',
      'spring-mud',
      'damp-spring-meadow',
      'fern-bank',
      'highland-grass',
    ],
    birds: [
      { species: 'coastal-small', path: 'lazyFigureEight', radiusX: 13, radiusZ: 9, height: 9, speed: 0.1, phase: 0.6, cx: ASILO_SPRING_POOL.x + 4, cz: ASILO_SPRING_POOL.z + 6, flapRate: 0.9 },
      { species: 'coastal-small', path: 'lazyFigureEight', radiusX: 18, radiusZ: 12, height: 13, speed: -0.08, phase: 2.4, cx: 22, cz: 12, flapRate: 0.85 },
    ],
  };
}
