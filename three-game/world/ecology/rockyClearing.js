import { makeZoneScatter } from '../scatter';
import { terrainHeight } from '../terrain';
import {
  getRockyClearingCaveFeature,
  getRockyClearingFormations,
  getRockyClearingRocks,
} from '../rockyClearingLayout';
import {
  ROCKY_CLEARING,
  rockyClearingCaveThresholdMask,
  rockyClearingCentralMask,
  rockyClearingPathInfo,
  rockyClearingRubbleMask,
} from '../regions/rockyClearing/path';
import { buildStandardDryPathGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { LAVA_CACTUS_SPECIES } from './floraSpecies';
import { buildProceduralInteractiveFloraLayer } from './proceduralFlora';

const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function grassDryness({ x, z, y, tone, path }) {
  const high = clamp01((y - 3.4) / 3.4);
  const clearingEdge = rockyClearingCentralMask(x, z);
  return clamp01(0.34 + tone * 0.24 + high * 0.18 + (path?.shoulder || 0) * 0.16 + clearingEdge * 0.12);
}

function grassTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.72 + tone * 0.2 + pathShoulder * 0.12);
  if (warm > 0.68) return tone > 0.5 ? '#c4b765' : '#9e9050';
  if (warm > 0.44) return tone > 0.52 ? '#939e58' : '#737f47';
  return tone > 0.48 ? '#6f8447' : '#526a3b';
}

function buildGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: ROCKY_CLEARING,
    idPrefix: 'rocky-clearing-dry-grass',
    count: 1450,
    seed: 18117,
    bounds: { minX: -45, maxX: 45, minZ: -37, maxZ: 37 },
    pathInfo: rockyClearingPathInfo,
    rejectBiomes: ['red-dirt-path', 'path-shoulder', 'cave-threshold', 'basalt-rubble', 'dusty-clearing'],
    pathClearance: 1.35,
    sparseBand: 1.35,
    baseChance: 0.12,
    pathDistanceWeight: 0.34,
    clumpWeight: 0.34,
    gapWeight: 0.22,
    maxGrade: 1.08,
    slopeStep: 0.8,
    scale: [0.46, 1.05],
    windYaw: -0.68,
    attemptsPerItem: 150,
    accept: ({ x, z }) => rockyClearingRubbleMask(x, z) < 0.42 && rockyClearingCaveThresholdMask(x, z) < 0.28,
    densityAt: ({ x, z }) => {
      const clearing = rockyClearingCentralMask(x, z);
      const edgeBand = clearing > 0.12 && clearing < 0.48 ? 0.18 : 0;
      return edgeBand + (Math.abs(z) > 20 ? 0.08 : 0);
    },
    drynessAt: grassDryness,
    tintAt: grassTint,
  });
  return createStandardDryGrassPatchLayer({
    id: 'rocky-clearing-dry-grass-patches',
    items,
    materialColor: '#f0edcf',
    emissive: '#282b16',
    emissiveIntensity: 0.055,
    widthScale: 1.04,
    heightScale: 1.04,
    depthScale: 1.0,
    maxVisibleDistance: 92,
    motion: { wind: 1.05, bend: 0.2, bendRadius: 1.12 },
  });
}

function buildFlora() {
  const caveFerns = [
    { x: -3.2, z: -9.35, scale: 0.98, yaw: 0.42, widthScale: 1.08, heightScale: 0.92 },
    { x: 6.8, z: -9.15, scale: 0.86, yaw: 2.18, widthScale: 0.92, heightScale: 1.06 },
    { x: -0.7, z: -11.95, scale: 0.76, yaw: 1.34, widthScale: 1.12, heightScale: 0.88 },
    { x: 3.45, z: -12.25, scale: 0.68, yaw: 4.72, widthScale: 0.9, heightScale: 1.08 },
    { x: -5.15, z: -8.0, scale: 0.82, yaw: 5.46, widthScale: 1.04, heightScale: 0.95 },
    { x: 8.25, z: -7.75, scale: 0.9, yaw: 3.1, widthScale: 0.94, heightScale: 1.05 },
  ].map((item, index) => ({
    ...item,
    id: `rocky-clearing-cave-fern-${index}`,
    y: terrainHeight(item.x, item.z, ROCKY_CLEARING),
    depthScale: 0.94 + (index % 3) * 0.05,
    tint: index > 1 && index < 4 ? '#3f6540' : '#58774a',
  }));
  return [
    {
      id: 'rocky-clearing-cave-ferns',
      path: `${NATURE}runtime-galapagos-fern.glb`,
      sink: 0.04,
      tintStrength: 0.24,
      motion: { wind: 0.38, bend: 0.12, bendRadius: 1.16 },
      castShadow: false,
      maxVisibleDistance: 54,
      items: caveFerns,
    },
  ];
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: ROCKY_CLEARING,
    id: 'rocky-clearing-cave-basalt-chips',
    itemIdPrefix: 'rocky-clearing-chip',
    count: 420,
    seed: 421,
    bounds: { minX: -24, maxX: 25, minZ: -16, maxZ: 7 },
    scale: [0.5, 1.4],
    maxVisibleDistance: 42,
    variantOptions: [
      { variant: 'weathered-basalt-chip', weight: 0.73, colors: ['#c6c3ba', '#aaa9a3'] },
      { variant: 'oxidized-scoria-chip', weight: 0.27, colors: ['#cc886b', '#b96d50'] },
    ],
    accept: (biome, x, z) => {
      const path = rockyClearingPathInfo(x, z);
      return path.tread < 0.24 && (
        rockyClearingRubbleMask(x, z) > 0.22
        || (rockyClearingCentralMask(x, z) > 0.36 && hash2(x, z, 27) < 0.32)
        || biome === 'cave-threshold'
      );
    },
  })];
}

function buildInteractiveFlora() {
  return [buildProceduralInteractiveFloraLayer({
    id: 'rocky-clearing-lava-cactus-rubble',
    zoneId: ROCKY_CLEARING,
    species: LAVA_CACTUS_SPECIES,
    runtime: 'lava-cactus',
    seed: 457,
    count: 4,
    bounds: { minX: -38, maxX: 38, minZ: -31, maxZ: 29 },
    habitatAt: ({ biome, x, z }) => {
      const path = rockyClearingPathInfo(x, z);
      const rubble = rockyClearingRubbleMask(x, z);
      const cave = rockyClearingCaveThresholdMask(x, z);
      const clearing = rockyClearingCentralMask(x, z);
      const biomeSuitability = {
        'basalt-rubble': 1,
        'rocky-rise': 0.78,
        'stony-highland-grass': 0.36,
        'dusty-clearing': 0.12,
      }[biome] || 0;
      return {
        moisture: clamp01(0.16 + (1 - clearing) * 0.05),
        canopy: 0.03,
        exposure: clamp01(0.74 + rubble * 0.22),
        disturbance: clamp01(path.path * 0.9 + path.shoulder * 0.34),
        salinity: 0.01,
        rockiness: clamp01(0.5 + rubble * 0.48),
        biomeSuitability,
        localSuitability: clamp01(0.3 + rubble * 0.64),
        excluded: biomeSuitability <= 0
          || path.distance < path.width * 1.8
          || cave > 0.3
          || rubble < 0.32,
      };
    },
    placement: {
      patchCount: 2,
      patchRadius: [2.2, 4.4],
      minPatchSeparation: 7,
      minItemSeparation: 1.55,
      maxGrade: 0.65,
    },
    siteFromItem: item => ({
      flowerCount: item.tone < 0.66 ? 0 : 1,
    }),
  })];
}

function buildProps() {
  return [
    {
      id: 'rocky-clearing-weathered-branch-a',
      path: `${NATURE}runtime-driftwood.glb`,
      position: [-6.2, 0, -4.1],
      terrainY: true,
      rotation: [0, 0.55, 0],
      scale: 0.86,
      castShadow: false,
      receiveShadow: true,
      maxVisibleDistance: 56,
    },
    {
      id: 'rocky-clearing-weathered-branch-b',
      path: `${NATURE}runtime-driftwood.glb`,
      position: [11.4, 0, 2.8],
      terrainY: true,
      rotation: [0, -0.86, 0],
      scale: 0.72,
      castShadow: false,
      receiveShadow: true,
      maxVisibleDistance: 56,
    },
  ];
}

export function buildRockyClearingEcology() {
  return {
    zoneId: ROCKY_CLEARING,
    stream: false,
    caveEntrances: [getRockyClearingCaveFeature()],
    volcanicFormations: [{
      id: 'rocky-clearing-volcanic-formations',
      items: getRockyClearingFormations(),
      maxVisibleDistance: 110,
    }],
    dryGrassPatches: [buildGrass()],
    surfaceLitter: buildSurfaceLitter(),
    flora: buildFlora(),
    interactiveFlora: buildInteractiveFlora(),
    rocks: getRockyClearingRocks(),
    props: buildProps(),
    footprintBiomes: ['red-dirt-path', 'path-shoulder', 'dusty-clearing', 'cave-threshold'],
    birds: [
      { radius: 14, height: 15, speed: 0.08, phase: 1.2, cx: -12, cz: 9 },
    ],
  };
}
