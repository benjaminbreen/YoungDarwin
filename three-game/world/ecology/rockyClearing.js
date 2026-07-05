import { makeZoneScatter, seededRandom } from '../scatter';
import {
  getRockyClearingCaveFeature,
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

function notOnPathOrCave(biome, x, z) {
  const path = rockyClearingPathInfo(x, z);
  return path.distance > path.width * 1.85
    && rockyClearingCaveThresholdMask(x, z) < 0.24
    && rockyClearingRubbleMask(x, z) < 0.62
    && biome !== 'red-dirt-path'
    && biome !== 'cave-threshold';
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ROCKY_CLEARING, layer, count, seed, opts);
  const shrubs = scatter('rocky-clearing-shrub', 20, 331, {
    minX: -42, maxX: 42, minZ: -30, maxZ: 32, scale: [0.1, 0.24], maxGrade: 0.9,
    accept: (biome, x, z) => notOnPathOrCave(biome, x, z)
      && rockyClearingCentralMask(x, z) < 0.62
      && hash2(x, z, 7) < 0.68,
  }).map(item => ({
    ...item,
    y: item.y + 0.02,
    tint: item.tone > 0.54 ? '#7f8749' : '#596b3b',
  }));
  const smallShrubs = scatter('rocky-clearing-low-shrub', 24, 347, {
    minX: -43, maxX: 43, minZ: -32, maxZ: 35, scale: [0.07, 0.17], maxGrade: 1.0,
    accept: (biome, x, z) => notOnPathOrCave(biome, x, z)
      && (Math.abs(x) > 18 || Math.abs(z) > 16 || rockyClearingCentralMask(x, z) < 0.28),
  }).map(item => ({
    ...item,
    y: item.y + 0.02,
    tint: item.tone > 0.5 ? '#8c7c48' : '#536437',
  }));
  const flatCactus = scatter('rocky-clearing-flat-cactus', 5, 359, {
    minX: -38, maxX: 38, minZ: -28, maxZ: 32, scale: [0.17, 0.26], maxGrade: 0.82,
    accept: (biome, x, z) => notOnPathOrCave(biome, x, z)
      && z > -4
      && rockyClearingCentralMask(x, z) < 0.36
      && hash2(x, z, 17) < 0.42,
  }).map(item => ({ ...item, y: item.y + 0.02, tint: '#728f47' }));

  return [
    {
      id: 'rocky-clearing-shrub',
      path: `${NATURE}runtime-plant-shrub.glb`,
      sink: 0.04,
      tintStrength: 0.34,
      motion: { wind: 1.08, bend: 0.24, bendRadius: 1.28 },
      castShadow: false,
      items: shrubs,
    },
    {
      id: 'rocky-clearing-low-shrub',
      path: `${NATURE}runtime-small-shrub.glb`,
      sink: 0.04,
      tintStrength: 0.36,
      motion: { wind: 1.32, bend: 0.28, bendRadius: 1.14 },
      castShadow: false,
      items: smallShrubs,
    },
    {
      id: 'rocky-clearing-flat-cactus',
      path: `${NATURE}runtime-flat-cactus.glb`,
      sink: 0.02,
      tintStrength: 0.14,
      motion: { wind: 0.28, bend: 0.24 },
      castShadow: false,
      items: flatCactus,
    },
  ];
}

const LITTER_COLORS = ['#282723', '#36342e', '#4b463b', '#615846', '#7a6c51'];

function buildSurfaceLitter() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ROCKY_CLEARING, layer, count, seed, opts);
  const chips = scatter('rocky-clearing-basalt-chip', 130, 421, {
    minX: -24, maxX: 25, minZ: -16, maxZ: 7, scale: [0.18, 0.54], maxGrade: 1.1,
    accept: (biome, x, z) => rockyClearingRubbleMask(x, z) > 0.22
      || (rockyClearingCentralMask(x, z) > 0.36 && hash2(x, z, 27) < 0.32)
      || biome === 'cave-threshold',
  }).map((item, index) => {
    const i = index + 42100;
    return {
      ...item,
      id: `rocky-clearing-chip-${index}`,
      variant: seededRandom(i, 3) > 0.22 ? 'basalt-pebble' : 'limestone-chip',
      color: LITTER_COLORS[Math.floor(seededRandom(i, 5) * LITTER_COLORS.length) % LITTER_COLORS.length],
      wetness: 0,
      scale: item.scale * (0.62 + seededRandom(i, 7) * 0.5),
      stretchX: 0.7 + seededRandom(i, 11) * 0.72,
      stretchZ: 0.62 + seededRandom(i, 13) * 0.66,
      heightScale: 0.66 + seededRandom(i, 17) * 0.58,
      lift: 0.008 + seededRandom(i, 19) * 0.01,
      pitch: (seededRandom(i, 23) - 0.5) * 0.22,
      roll: (seededRandom(i, 29) - 0.5) * 0.22,
    };
  });
  return [{
    id: 'rocky-clearing-cave-basalt-chips',
    maxVisibleDistance: 42,
    items: chips,
  }];
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
    dryGrassPatches: [buildGrass()],
    surfaceLitter: buildSurfaceLitter(),
    flora: buildFlora(),
    rocks: getRockyClearingRocks(),
    props: buildProps(),
    footprintBiomes: ['red-dirt-path', 'path-shoulder', 'dusty-clearing', 'cave-threshold'],
    birds: [
      { radius: 14, height: 15, speed: 0.08, phase: 1.2, cx: -12, cz: 9 },
    ],
  };
}
