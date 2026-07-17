import { getModelAsset } from '../../modelAssets';
import {
  getPostOfficeBayBasaltBlocks,
  getPostOfficeBayOpuntiaHazards,
  makeFloreanaScatter,
} from '../floreanaCoveLayout';
import { varyScatterTransforms } from '../scatter';
import { terrainHeight } from '../terrain';
import {
  coveWaterMask,
  postOfficeBayCoastZ,
  POST_OFFICE_BAY_BARREL_CLEARING,
  postOfficeLandingBeachMask,
  postOfficePathInfo,
} from '../regions/postOfficeBay/terrain';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
  standardDryGrassTint,
} from './standardGrass';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_SPECIES,
  DARWINIOTHAMNUS_VARIANT_MODE,
} from './floraAssets';
import {
  CROTON_SCOULERI_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
} from './floraSpecies';
import {
  buildProceduralFloraLayer,
  buildProceduralInteractiveFloraLayer,
} from './proceduralFlora';

const POST_OFFICE_BAY = 'POST_OFFICE_BAY';
const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value, edge0, edge1) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function postOfficeDryness({ x, z, biome, tone, path }) {
  const outerEdge = Math.max(Math.abs(x) / 54, Math.max(0, z - 12) / 34);
  return clamp01(
    0.26
    + tone * 0.18
    + (path?.shoulder || 0) * 0.18
    + Math.max(0, outerEdge - 0.42) * 0.5
    + (biome === 'dry-scrub' || biome === 'palo-santo' ? 0.12 : 0),
  );
}

const EDGE_GRASS_CLUSTERS = [
  { x: -49, z: 9, rx: 8.5, rz: 5.5, strength: 1.0 },
  { x: -41, z: 24, rx: 10, rz: 6.5, strength: 0.85 },
  { x: -18, z: 34, rx: 13, rz: 4.8, strength: 0.7 },
  { x: 25, z: 31, rx: 11, rz: 6, strength: 0.82 },
  { x: 37, z: 19, rx: 7.5, rz: 8, strength: 0.78 },
];

function edgeClusterStrength(x, z) {
  let strength = 0;
  for (const cluster of EDGE_GRASS_CLUSTERS) {
    const dx = (x - cluster.x) / cluster.rx;
    const dz = (z - cluster.z) / cluster.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 2.4) * cluster.strength);
  }
  return strength;
}

function acceptPostOfficeGrass({ x, z, path, biome }) {
  if (coveWaterMask(x, z) > 0.18 || biome === 'water') return false;
  if (path && path.distance < path.width * 2.4) return false;
  const farEdge = Math.abs(x) > 28 || z > 23;
  return farEdge && edgeClusterStrength(x, z) > 0.18;
}

function acceptLandingTransitionGrass({ x, z, path, biome }) {
  if (biome === 'water' || coveWaterMask(x, z) > 0.1) return false;
  if (path && path.distance < path.width * 1.7) return false;
  const shoreDistance = z - postOfficeBayCoastZ(x);
  return shoreDistance > 9
    && shoreDistance < 14.5
    && postOfficeLandingBeachMask(x, z) > 0.08;
}

export function buildPostOfficeBayDryGrassLayer() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: POST_OFFICE_BAY,
    idPrefix: 'post-office-bay-dry-grass',
    count: 120,
    seed: 6185,
    bounds: { minX: -58, maxX: 42, minZ: 4, maxZ: 36 },
    pathInfo: postOfficePathInfo,
    rejectBiomes: ['water'],
    pathCenterMax: 0,
    pathTreadMax: 0.02,
    maxGrade: 0.82,
    slopeStep: 0.85,
    scale: [0.42, 0.88],
    windYaw: -0.64,
    attemptsPerItem: 160,
    accept: acceptPostOfficeGrass,
    drynessAt: postOfficeDryness,
    tintAt: standardDryGrassTint,
  });
  const landingTransitionItems = buildStandardDryGrassPatchItems({
    zoneId: POST_OFFICE_BAY,
    idPrefix: 'post-office-bay-landing-transition-grass',
    count: 28,
    seed: 6217,
    bounds: { minX: -3, maxX: 26, minZ: 8, maxZ: 18 },
    pathInfo: postOfficePathInfo,
    rejectBiomes: ['water'],
    pathCenterMax: 0,
    pathTreadMax: 0.02,
    maxGrade: 0.82,
    slopeStep: 0.85,
    scale: [0.46, 0.9],
    windYaw: -0.64,
    attemptsPerItem: 160,
    accept: acceptLandingTransitionGrass,
    drynessAt: postOfficeDryness,
    tintAt: standardDryGrassTint,
  });
  return {
    ...createStandardDryGrassPatchLayer({
      id: 'post-office-bay-path-dry-grass',
      items: [...items, ...landingTransitionItems],
      materialColor: '#f1edc9',
      emissive: '#262714',
      emissiveIntensity: 0.06,
      roughness: 1,
      widthScale: 0.94,
      heightScale: 0.98,
      depthScale: 0.94,
      maxVisibleDistance: 86,
      motion: { wind: 1.0, bend: 0.22, bendRadius: 1.08 },
    }),
    loadTier: 1,
  };
}

function varied(items, seed, options = {}) {
  return varyScatterTransforms(items, seed, {
    width: [0.88, 1.12],
    height: [0.9, 1.12],
    depth: [0.9, 1.1],
    maxLean: 0.04,
    ...options,
  });
}

function buildFlora() {
  const opuntia = varied(getPostOfficeBayOpuntiaHazards().map(item => ({
    ...item,
    y: item.y + 0.02,
    scale: item.renderScale,
  })), 53, {
    width: [0.94, 1.06],
    height: [0.94, 1.08],
    depth: [0.94, 1.06],
    maxLean: 0.012,
  });

  const candelabra = varied([
    { id: 'candelabra-cactus-1', x: -24.5, z: 30.8, yaw: -0.25, scale: 3.4, tone: 0.42 },
    { id: 'candelabra-cactus-2', x: -4.2, z: 34.5, yaw: 0.62, scale: 3.9, tone: 0.58 },
    { id: 'candelabra-cactus-3', x: 18.6, z: 31.2, yaw: -0.9, scale: 3.2, tone: 0.66 },
  ].map(item => ({
    ...item,
    y: terrainHeight(item.x, item.z, POST_OFFICE_BAY) + 0.02,
    tint: '#748d50',
  })), 61, {
    width: [0.94, 1.06],
    height: [0.94, 1.08],
    depth: [0.94, 1.06],
    maxLean: 0.01,
  });

  const cottonAsset = getModelAsset('galapagoscotton');
  const cotton = cottonAsset?.enabled && cottonAsset.path
    ? varied(makeFloreanaScatter('galapagos-cotton', 7, 97, {
      minX: -25,
      maxX: 27,
      minZ: 3,
      maxZ: 30,
      scale: [0.22, 0.42],
    }).filter(item => item.z > 8 || item.x > 8), 97).map(item => ({
      ...item,
      y: item.y + (cottonAsset.yOffset || 0.02),
      scale: (cottonAsset.scale || 1) * item.scale,
      tint: item.tone > 0.55 ? '#879153' : '#667442',
    }))
    : [];

  return [
    {
      id: 'opuntia',
      path: `${NATURE}runtime-opuntia.glb`,
      items: opuntia,
      sink: 0.02,
      tint: '#6fa046',
      tintStrength: 0.08,
      castShadow: true,
      maxVisibleDistance: 98,
      motion: { wind: 0.32, bend: 0.32 },
      loadTier: 2,
    },
    {
      id: 'post-office-bay-candelabra-cactus',
      path: `${NATURE}runtime-candelabra-cactus.glb`,
      items: candelabra,
      tintStrength: 0.12,
      castShadow: true,
      maxVisibleDistance: 110,
      motion: { wind: 0.25, bend: 0.05, bendRadius: 1.5 },
      loadTier: 2,
    },
    ...(cotton.length ? [{
      id: 'post-office-bay-galapagos-cotton',
      path: cottonAsset.path,
      items: cotton,
      tintStrength: 0.18,
      castShadow: false,
      maxVisibleDistance: 80,
      motion: { wind: 1.8, bend: 0.35, bendRadius: 1.45 },
      loadTier: 2,
    }] : []),
  ];
}

function distanceToNearestItem(items, x, z) {
  let nearest = Infinity;
  for (const item of items) {
    nearest = Math.min(nearest, Math.hypot(x - item.x, z - item.z));
  }
  return nearest;
}

function postOfficeRockiness(biome) {
  return {
    'black-lava': 0.9,
    'wet-basalt': 0.72,
    'tuff-ridge': 0.58,
    'ash-slope': 0.3,
    'dry-scrub': 0.28,
    'palo-santo': 0.22,
  }[biome] ?? 0.34;
}

function postOfficeInlandHabitat({ biome, x, z }) {
  const path = postOfficePathInfo(x, z);
  const water = coveWaterMask(x, z);
  const landing = postOfficeLandingBeachMask(x, z);
  const shoreDistance = z - postOfficeBayCoastZ(x);
  const inland = smoothstep01(shoreDistance, 10, 50);
  const paloSanto = biome === 'palo-santo' ? 1 : 0;
  const dryScrub = biome === 'dry-scrub' ? 1 : 0;
  const canopy = clamp01(0.04 + inland * 0.28 + paloSanto * 0.14 + dryScrub * 0.06);
  const clearingDistance = Math.hypot(
    x - POST_OFFICE_BAY_BARREL_CLEARING.x,
    z - POST_OFFICE_BAY_BARREL_CLEARING.z,
  );
  return {
    path,
    water,
    landing,
    shoreDistance,
    inland,
    clearingDistance,
    moisture: clamp01(0.18 + inland * 0.2 + paloSanto * 0.08),
    canopy,
    exposure: clamp01(0.92 - canopy * 0.52),
    disturbance: clamp01(path.path * 0.9 + path.shoulder * 0.32),
    salinity: (1 - inland) * 0.24,
    rockiness: postOfficeRockiness(biome),
    excluded: water > 0.1
      || landing > 0.1
      || shoreDistance < 10
      || path.distance < path.width * 1.72
      || clearingDistance < POST_OFFICE_BAY_BARREL_CLEARING.radius * 1.45,
  };
}

function buildProceduralFlora(authoredFlora) {
  const authoredCacti = authoredFlora
    .filter(layer => layer.id === 'opuntia' || layer.id === 'post-office-bay-candelabra-cactus')
    .flatMap(layer => layer.items || []);
  const crotonHabitatAt = sample => {
    const base = postOfficeInlandHabitat(sample);
    const biomeSuitability = {
      'dry-scrub': 1,
      'palo-santo': 1,
      'tuff-ridge': 0.76,
      'ash-slope': 0.58,
      'wet-basalt': 0.38,
      'black-lava': 0.3,
    }[sample.biome] || 0.2;
    return {
      ...base,
      biomeSuitability,
      localSuitability: clamp01(0.28 + base.inland * 0.72),
      excluded: base.excluded || distanceToNearestItem(authoredCacti, sample.x, sample.z) < 2.2,
    };
  };
  const darwiniothamnusHabitatAt = sample => {
    const base = postOfficeInlandHabitat(sample);
    const biomeSuitability = {
      'dry-scrub': 1,
      'palo-santo': 0.94,
      'tuff-ridge': 0.82,
      'ash-slope': 0.54,
      'wet-basalt': 0.3,
      'black-lava': 0.24,
    }[sample.biome] || 0.16;
    return {
      ...base,
      biomeSuitability,
      localSuitability: clamp01(0.16 + smoothstep01(base.shoreDistance, 18, 48) * 0.84),
      excluded: base.excluded || distanceToNearestItem(authoredCacti, sample.x, sample.z) < 2.4,
    };
  };

  return [
    buildProceduralFloraLayer({
      id: 'post-office-bay-croton-overlay',
      zoneId: POST_OFFICE_BAY,
      species: CROTON_SCOULERI_SPECIES,
      asset: { path: `${NATURE}runtime-croton.glb` },
      seed: 6481,
      count: 72,
      bounds: { minX: -50, maxX: 50, minZ: 13, maxZ: 54 },
      habitatAt: crotonHabitatAt,
      placement: {
        patchCount: 8,
        patchRadius: [4.2, 7.8],
        minPatchSeparation: 7.5,
        maxGrade: 0.74,
      },
      render: {
        sink: 0.06,
        tint: '#667746',
        tintStrength: 0.18,
        castShadow: false,
        maxVisibleDistance: 92,
        motion: { wind: 1.08, bend: 0.27, bendRadius: 1.4 },
        loadTier: 2,
      },
    }),
    buildProceduralFloraLayer({
      id: 'post-office-bay-darwiniothamnus-overlay',
      zoneId: POST_OFFICE_BAY,
      species: DARWINIOTHAMNUS_SPECIES,
      asset: {
        path: DARWINIOTHAMNUS_PATH,
        variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
        variantCount: 9,
      },
      seed: 6529,
      count: 54,
      bounds: { minX: -48, maxX: 48, minZ: 21, maxZ: 54 },
      habitatAt: darwiniothamnusHabitatAt,
      placement: {
        patchCount: 6,
        patchRadius: [3.4, 6.8],
        minPatchSeparation: 8,
        maxGrade: 0.72,
      },
      render: {
        label: DARWINIOTHAMNUS_LABEL,
        sink: 0.05,
        tint: '#788952',
        tintStrength: 0.15,
        castShadow: false,
        maxVisibleDistance: 96,
        motion: { wind: 0.96, bend: 0.23, bendRadius: 1.6 },
        loadTier: 2,
      },
    }),
  ];
}

function buildInteractiveFlora(authoredFlora) {
  const authoredCacti = authoredFlora
    .filter(layer => layer.id === 'opuntia' || layer.id === 'post-office-bay-candelabra-cactus')
    .flatMap(layer => layer.items || []);
  const rocks = getPostOfficeBayBasaltBlocks();
  const habitatAt = sample => {
    const base = postOfficeInlandHabitat(sample);
    const biomeSuitability = {
      'tuff-ridge': 1,
      'black-lava': 0.94,
      'dry-scrub': 0.88,
      'palo-santo': 0.7,
      'wet-basalt': 0.58,
      'ash-slope': 0.45,
    }[sample.biome] || 0.24;
    const rockClear = rocks.every(rock => (
      Math.hypot(sample.x - rock.x, sample.z - rock.z) > (rock.radiusX || rock.scale || 0.4) + 1.25
    ));
    return {
      ...base,
      biomeSuitability,
      localSuitability: clamp01(0.12 + smoothstep01(base.shoreDistance, 25, 50) * 0.88),
      excluded: base.excluded
        || base.path.distance < base.path.width * 2.05
        || distanceToNearestItem(authoredCacti, sample.x, sample.z) < 5
        || !rockClear,
    };
  };

  return [buildProceduralInteractiveFloraLayer({
    id: 'post-office-bay-prickly-pear-overlay',
    zoneId: POST_OFFICE_BAY,
    species: OPUNTIA_MEGASPERMA_SPECIES,
    runtime: 'prickly-pear',
    seed: 6577,
    count: 6,
    bounds: { minX: -45, maxX: 45, minZ: 33, maxZ: 53 },
    habitatAt,
    placement: {
      patchCount: 2,
      patchRadius: [7.5, 11],
      minPatchSeparation: 18,
      minItemSeparation: 5,
      maxGrade: 0.6,
    },
    siteFromItem: item => ({
      flowerCount: item.tone < 0.34 ? 0 : item.tone < 0.72 ? 1 : item.tone < 0.93 ? 2 : 3,
    }),
  })];
}

function buildSurfaceLitter() {
  const basalt = buildDryVolcanicLitterLayer({
    zoneId: POST_OFFICE_BAY,
    id: 'post-office-bay-basalt-shingle',
    itemIdPrefix: 'post-office-bay-basalt-chip',
    count: 260,
    seed: 6311,
    bounds: { minX: -38, maxX: 40, minZ: -22, maxZ: 36 },
    scale: [0.52, 1.32],
    maxVisibleDistance: 44,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.72, colors: ['#34332e', '#46413a', '#575046'] },
      { variant: 'weathered-basalt-chip', weight: 0.2, colors: ['#817b70', '#9a8d75'] },
      { variant: 'oxidized-scoria-chip', weight: 0.08, colors: ['#774333', '#8c5139'] },
    ],
    wetnessAt: (x, z) => clamp01((5.2 - (z - postOfficeBayCoastZ(x))) / 5.5),
    accept: (biome, x, z) => {
      const path = postOfficePathInfo(x, z);
      if (path.tread > 0.18 || coveWaterMask(x, z) > 0.62) return false;
      return biome === 'wet-basalt'
        || biome === 'black-lava'
        || path.shoulder > 0.32
        || (biome === 'tuff-ridge' && z > 8);
    },
  });

  const strandline = buildDryVolcanicLitterLayer({
    zoneId: POST_OFFICE_BAY,
    id: 'post-office-bay-landing-strandline',
    itemIdPrefix: 'post-office-bay-strandline-piece',
    count: 72,
    seed: 6359,
    bounds: { minX: -5, maxX: 28, minZ: -2, maxZ: 16 },
    scale: [0.58, 1.28],
    sizeVariation: [0.78, 1.08],
    maxVisibleDistance: 38,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.56, colors: ['#3b3933', '#514b42'] },
      { variant: 'shell-shard-a', weight: 0.23, colors: ['#c7bba2', '#d4c9b1'] },
      { variant: 'shell-shard-b', weight: 0.16, colors: ['#bcb19b', '#d7ccb5'] },
      { variant: 'shell-cap', weight: 0.05, colors: ['#d7ccb5', '#c8bea9'] },
    ],
    wetnessAt: (x, z) => clamp01((4.6 - (z - postOfficeBayCoastZ(x))) / 4.2),
    accept: (biome, x, z) => {
      const shoreDistance = z - postOfficeBayCoastZ(x);
      const path = postOfficePathInfo(x, z);
      return coveWaterMask(x, z) < 0.42
        && path.tread < 0.18
        && shoreDistance > 1.0
        && shoreDistance < 8.2
        && postOfficeLandingBeachMask(x, z) > 0.08
        && biome !== 'water';
    },
  });

  return [
    { ...basalt, loadTier: 1 },
    { ...strandline, loadTier: 1 },
  ];
}

export function buildPostOfficeBayEcology() {
  const flora = buildFlora();
  return {
    zoneId: POST_OFFICE_BAY,
    // Stage GLB decoding after the terrain and collidable hero rocks are ready.
    // Procedural litter is lightweight and appears in the first detail tier.
    stream: true,
    streamSchedule: [320, 900, 1550],
    dryGrassPatches: [buildPostOfficeBayDryGrassLayer()],
    flora,
    proceduralFlora: buildProceduralFlora(flora),
    interactiveFlora: buildInteractiveFlora(flora),
    surfaceLitter: buildSurfaceLitter(),
    // This is the same deterministic block set used to derive collision in
    // floreanaCoveLayout, so visual rocks and traversal remain aligned.
    rocks: getPostOfficeBayBasaltBlocks(),
    props: [],
    footprintBiomes: ['ash-slope', 'dry-scrub', 'palo-santo', 'tuff-ridge'],
  };
}
