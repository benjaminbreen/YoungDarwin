import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { getWatkinsCreekRocks } from '../watkinsCreekLayout';
import {
  WATKINS_CREEK,
  WATKINS_CREEK_FORD,
  watkinsCreekBasaltExposure,
  watkinsCreekChannelInfo,
  watkinsCreekMoisture,
  watkinsCreekPathInfo,
} from '../regions/watkinsCreek/path';
import { WATER_LEVEL, terrainSurfaceNoise } from '../terrainShared';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clearOfTrailAndWater(biome, x, z, pathMultiplier = 1.6) {
  const path = watkinsCreekPathInfo(x, z);
  const creek = watkinsCreekChannelInfo(x, z);
  return path.distance > path.width * pathMultiplier
    && creek.water < 0.08
    && biome !== 'highland-cinder-path'
    && biome !== 'muddy-ford-path';
}

function clearFordSightline(x, z, radius = 9) {
  return Math.hypot(x - WATKINS_CREEK_FORD.x, z - WATKINS_CREEK_FORD.z) > radius;
}

function tint(items, light, dark) {
  return items.map(item => ({
    ...item,
    tint: item.tone > 0.5 ? light : dark,
  }));
}

function buildGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: WATKINS_CREEK,
    idPrefix: 'watkins-creek-grass',
    count: 1180,
    seed: 67113,
    bounds: { minX: -52, maxX: 52, minZ: -45, maxZ: 45 },
    pathInfo: watkinsCreekPathInfo,
    rejectBiomes: [
      'creek-water',
      'creek-pool',
      'saturated-creek-mud',
      'creek-gravel-bank',
      'riparian-creek-bank',
      'muddy-ford-path',
      'highland-cinder-path',
      'weathered-basalt-shelf',
    ],
    pathCenterMax: 0.04,
    pathTreadMax: 0.2,
    maxGrade: 0.88,
    slopeStep: 0.82,
    scale: [0.46, 1.08],
    windYaw: -0.56,
    attemptsPerItem: 150,
    accept: ({ x, z, path }) => {
      const creek = watkinsCreekChannelInfo(x, z);
      if (creek.water > 0.04 || watkinsCreekBasaltExposure(x, z) > 0.82) return false;
      if (creek.shoreDistance < 5.2) return false;
      if (path.distance < path.width * 1.14) return false;
      // A restrained open collar around the crossing keeps the ford legible
      // from the northern entrance while greener banks frame it farther out.
      if (!clearFordSightline(x, z, 6.5) && creek.valley < 0.48) return false;
      return true;
    },
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.66 + tone * 0.16 + (path?.shoulder || 0) * 0.12 - watkinsCreekMoisture(x, z) * 0.56,
    ),
    tintAt: (tone, dryness) => {
      if (dryness > 0.62) return tone > 0.5 ? '#c2b367' : '#9e9252';
      if (dryness > 0.36) return tone > 0.5 ? '#91a45a' : '#72884b';
      return tone > 0.5 ? '#729853' : '#527744';
    },
  });

  return createStandardDryGrassPatchLayer({
    id: 'watkins-creek-gradient-grass',
    items,
    materialColor: '#f0edd4',
    emissive: '#1f2918',
    emissiveIntensity: 0.045,
    widthScale: 1.04,
    heightScale: 1.1,
    depthScale: 1.02,
    maxVisibleDistance: 102,
    motion: { wind: 1.02, bend: 0.24, bendRadius: 1.18 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(WATKINS_CREEK, layer, count, seed, options);

  const sedges = varyScatterTransforms(scatter('watkins-creek-riparian-sedges', 156, 659, {
    minX: -52, maxX: 52, minZ: -12, maxZ: 17, scale: [0.09, 0.23], maxGrade: 0.82,
    accept: (biome, x, z) => {
      const creek = watkinsCreekChannelInfo(x, z);
      const path = watkinsCreekPathInfo(x, z);
      const patch = terrainSurfaceNoise(x * 0.12 + 8, z * 0.14 - 3) * 0.5 + 0.5;
      return creek.shoreDistance > -0.08
        && creek.shoreDistance < 5.8
        && (creek.mud > 0.18 || creek.riparian > 0.22)
        && creek.gravel < 0.76
        && path.tread < 0.22
        && clearFordSightline(x, z, 5.4)
        && patch > 0.42
        && biome !== 'highland-cinder-path';
    },
  }), 659, { width: [0.72, 1.12], height: [0.72, 1.22], depth: [0.76, 1.14], maxLean: 0.055 });

  const trees = varyScatterTransforms(scatter('watkins-creek-scalesia-trees', 14, 683, {
    minX: -47, maxX: 47, minZ: -12, maxZ: 31, scale: [0.64, 1.04], maxGrade: 0.62,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 2.35)
      && clearFordSightline(x, z, 12)
      && watkinsCreekMoisture(x, z) > 0.42
      && watkinsCreekBasaltExposure(x, z) < 0.7,
  }), 683, { width: [0.9, 1.12], height: [0.9, 1.12], maxLean: 0.025 });

  const croton = varyScatterTransforms(scatter('watkins-creek-croton', 68, 701, {
    minX: -50, maxX: 50, minZ: -18, maxZ: 32, scale: [0.58, 1.02], maxGrade: 0.74,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.72)
      && clearFordSightline(x, z, 7.5)
      && watkinsCreekMoisture(x, z) > 0.28
      && watkinsCreekMoisture(x, z) < 0.88,
  }), 701, { width: [0.88, 1.14], height: [0.9, 1.13], maxLean: 0.04 });

  const darwiniothamnus = makeDarwiniothamnusPatchScatter(
    WATKINS_CREEK,
    'watkins-creek-darwiniothamnus',
    58,
    719,
    {
      minX: -49, maxX: 49, minZ: -38, maxZ: 39, scale: [0.78, 2.32], maxGrade: 0.72,
      patchCount: 6, patchRadius: [3.2, 6.2],
      accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.82)
        && clearFordSightline(x, z, 8.5)
        && watkinsCreekMoisture(x, z) > 0.2
        && watkinsCreekMoisture(x, z) < 0.74
        && watkinsCreekBasaltExposure(x, z) < 0.72,
    },
    { width: [0.88, 1.15], height: [0.88, 1.12], maxLean: 0.04 },
  );

  const ferns = varyScatterTransforms(scatter('watkins-creek-ferns', 72, 737, {
    minX: -48, maxX: 48, minZ: -12, maxZ: 29, scale: [0.82, 1.52], maxGrade: 0.7,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.58)
      && clearFordSightline(x, z, 7)
      && watkinsCreekMoisture(x, z) > 0.56
      && watkinsCreekBasaltExposure(x, z) < 0.78,
  }), 737, { width: [0.9, 1.14], height: [0.86, 1.1], maxLean: 0.05 });

  const groundPlants = varyScatterTransforms(scatter('watkins-creek-ground-plants', 96, 751, {
    minX: -49, maxX: 49, minZ: -15, maxZ: 31, scale: [0.055, 0.13], maxGrade: 0.74,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 1.5)
      && watkinsCreekMoisture(x, z) > 0.48,
  }), 751, { width: [0.9, 1.14], height: [0.84, 1.08], maxLean: 0.055 });

  const hummocks = varyScatterTransforms(scatter('watkins-creek-bush-hummocks', 28, 769, {
    minX: -48, maxX: 48, minZ: -17, maxZ: 34, scale: [0.013, 0.024], maxGrade: 0.7,
    accept: (biome, x, z) => clearOfTrailAndWater(biome, x, z, 2.05)
      && clearFordSightline(x, z, 11)
      && watkinsCreekMoisture(x, z) > 0.38
      && watkinsCreekBasaltExposure(x, z) < 0.72,
  }), 769, { width: [0.88, 1.16], height: [0.84, 1.1], maxLean: 0.025 });

  return [
    { id: 'watkins-creek-riparian-sedges', path: `${NATURE}runtime-saltgrass.glb`, sink: 0.095, tintStrength: 0.22, castShadow: false, motion: { wind: 1.18, bend: 0.42, bendRadius: 1.05 }, items: tint(sedges, '#718f50', '#4f7043') },
    { id: 'watkins-creek-scalesia-trees', path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`, sink: 0.14, tintStrength: 0.12, castShadow: true, motion: { wind: 0.5, bend: 0.12, bendRadius: 3.2 }, items: tint(trees, '#719452', '#4f7245') },
    { id: 'watkins-creek-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.2, castShadow: false, motion: { wind: 1.02, bend: 0.28, bendRadius: 1.38 }, items: tint(croton, '#78945a', '#557448') },
    { id: 'watkins-creek-darwiniothamnus', label: DARWINIOTHAMNUS_LABEL, path: DARWINIOTHAMNUS_PATH, variantMode: DARWINIOTHAMNUS_VARIANT_MODE, sink: 0.055, tintStrength: 0.16, castShadow: false, motion: { wind: 0.86, bend: 0.22, bendRadius: 1.62 }, items: tint(darwiniothamnus, '#829b5d', '#5e7c4c') },
    { id: 'watkins-creek-ferns', path: `${NATURE}runtime-galapagos-fern.glb`, sink: 0.075, tintStrength: 0.18, castShadow: false, motion: { wind: 0.44, bend: 0.11, bendRadius: 1.18 }, items: tint(ferns, '#5f824f', '#3d6444') },
    { id: 'watkins-creek-ground-plants', path: `${NATURE}runtime-ground-plants.glb`, sink: 0.05, ySquash: 0.52, tintStrength: 0.26, castShadow: false, motion: { wind: 1.12, bend: 0.32, bendRadius: 1.16 }, items: tint(groundPlants, '#688b53', '#456946') },
    { id: 'watkins-creek-bush-hummocks', path: `${NATURE}runtime-galapagos-bushes.glb`, sink: 0.07, tintStrength: 0.18, castShadow: false, motion: { wind: 0.72, bend: 0.18, bendRadius: 1.8 }, items: tint(hummocks, '#839b5e', '#58774c') },
  ];
}

function buildSurfaceLitter() {
  return [
    buildDryVolcanicLitterLayer({
      zoneId: WATKINS_CREEK,
      id: 'watkins-creek-bank-cobbles',
      itemIdPrefix: 'watkins-creek-bank-cobble',
      count: 720,
      seed: 773,
      bounds: { minX: -53, maxX: 53, minZ: -13, maxZ: 18 },
      scale: [0.28, 0.82],
      sizeVariation: [0.72, 1.18],
      colors: ['#77766d', '#5d625d', '#454c48', '#343b38'],
      wetnessAt: (x, z) => {
        const creek = watkinsCreekChannelInfo(x, z);
        return Math.max(creek.mud, creek.submergedShelf * 0.82);
      },
      maxGrade: 0.86,
      maxVisibleDistance: 64,
      accept: (biome, x, z) => {
        const creek = watkinsCreekChannelInfo(x, z);
        const path = watkinsCreekPathInfo(x, z);
        return path.tread < 0.34
          && creek.shoreDistance > -0.82
          && creek.shoreDistance < 4.5
          && (creek.gravel > 0.16 || creek.submergedShelf > 0.28 || creek.mud > 0.22)
          && creek.ford < 0.76;
      },
    }),
    buildDryVolcanicLitterLayer({
      zoneId: WATKINS_CREEK,
      id: 'watkins-creek-weathered-litter',
      itemIdPrefix: 'watkins-creek-chip',
      count: 340,
      seed: 787,
      bounds: { minX: -51, maxX: 51, minZ: -42, maxZ: 42 },
      scale: [0.48, 1.38],
      colors: ['#68665c', '#4d514c', '#343a37'],
      wetnessAt: (x, z) => watkinsCreekChannelInfo(x, z).valley,
      accept: (biome, x, z) => {
        const path = watkinsCreekPathInfo(x, z);
        const creek = watkinsCreekChannelInfo(x, z);
        return creek.water < 0.12
          && creek.mud < 0.48
          && path.tread < 0.18
          && (watkinsCreekBasaltExposure(x, z) > 0.5 || path.shoulder > 0.26);
      },
    }),
  ];
}

export function buildWatkinsCreekEcology() {
  return {
    zoneId: WATKINS_CREEK,
    stream: false,
    lagoonSurfaces: [
      {
        id: 'watkins-creek-surface',
        zoneId: WATKINS_CREEK,
        position: [0, WATER_LEVEL + 0.036, 1],
        bounds: { minX: -56, maxX: 56, minZ: -19, maxZ: 20 },
        geometryResolution: [320, 128],
        colorA: '#334a42',
        colorB: '#82998b',
        mudColor: '#4d4939',
        algaeColor: '#5d754c',
        waterColor: '#b6c4bc',
        opacity: 0.052,
        reflectivity: 0.085,
        waterAlpha: 0.9,
        waterShoreAlpha: 0.04,
        flowSpeed: 0.018,
        flowScale: 3.8,
        flowDirection: [0.99, -0.12],
        flowMapResolution: [256, 96],
        shoreNoise: 0.018,
        maskThreshold: 0.14,
        shoreBrighten: 0,
        shoreFade: 0.96,
        windRippleStrength: 1.08,
        rippleStrength: 0.82,
        distortionScale: 0.021,
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
    rocks: getWatkinsCreekRocks(),
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: [
      'highland-cinder-path',
      'muddy-ford-path',
      'damp-creek-bank',
      'green-creek-meadow',
      'dry-highland-grass',
    ],
    birds: [
      { species: 'coastal-small', path: 'lazyFigureEight', radiusX: 15, radiusZ: 10, height: 10, speed: 0.1, phase: 0.9, cx: -18, cz: 9, flapRate: 0.9 },
      { species: 'gull', path: 'thermalCircle', radiusX: 25, radiusZ: 15, height: 24, speed: -0.048, phase: 2.6, cx: 16, cz: -5, flapRate: 0.62 },
    ],
  };
}
