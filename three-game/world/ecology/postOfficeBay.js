import { getModelAsset } from '../../modelAssets';
import { parrotfishSchool } from './parrotfishSchools';
import { mantaCruiser } from './mantaCruisers';
import {
  getPostOfficeBayBasaltBlocks,
  getPostOfficeBayOpuntiaHazards,
  getPostOfficeBaySeaTubeFormations,
  makeFloreanaScatter,
} from '../floreanaCoveLayout';
import { POST_OFFICE_BAY_SEA_TUBE } from '../regions/postOfficeBay/seaTube';
import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { terrainHeight } from '../terrain';
import {
  coveWaterMask,
  postOfficeArroyoInfo,
  postOfficeBayCoastZ,
  POST_OFFICE_BAY_BARREL_CLEARING,
  POST_OFFICE_BAY_LOOKOUT,
  POST_OFFICE_BAY_WHALERS_REST,
  postOfficeInlandMask,
  postOfficeLandingBeachMask,
  postOfficeLookoutMask,
  postOfficePathInfo,
  postOfficeWestLavaMask,
  postOfficeWoodlandMask,
} from '../regions/postOfficeBay/terrain';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { buildBeachFindLayer } from './beachFinds';
import { modelAssetProp } from './ecologyAssetTransforms';
import { getZoneObstacles } from '../../../game-core/obstacles';
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
  MATURE_OPUNTIA_PATH,
  MATURE_OPUNTIA_PLACEMENT,
} from './floraAssets';
import {
  CROTON_SCOULERI_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
  PALO_SANTO_SPECIES,
} from './floraSpecies';
import {
  buildProceduralFloraLayer,
  buildProceduralInteractiveFloraLayer,
  floraCompanionSuitability,
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
  const outerEdge = Math.max(Math.abs(x) / 54, Math.min(1.1, Math.max(0, z - 12) / 34));
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
  // Inland the dry-season grass survives in openings between the scrub, on
  // the wash's fan and along the foot of the knoll.
  { x: -1, z: 45, rx: 9, rz: 6, strength: 0.8 },
  { x: 9, z: 37, rx: 8, rz: 5, strength: 0.9 },
  { x: 6, z: 66, rx: 9, rz: 7, strength: 0.75 },
  { x: 27, z: 47, rx: 8, rz: 6, strength: 0.82 },
  { x: -4, z: 80, rx: 10, rz: 5, strength: 0.72 },
  { x: 27, z: 79, rx: 9, rz: 5.5, strength: 0.7 },
  { x: 49, z: 52, rx: 6, rz: 9, strength: 0.66 },
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
    count: 190,
    seed: 6185,
    bounds: { minX: -58, maxX: 56, minZ: 4, maxZ: 84 },
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

  const valley = (layer, count, seed, options) => makeZoneScatter(POST_OFFICE_BAY, layer, count, seed, options);

  // Jasminocereus keeps to the knoll's rocky flanks, where the soil is thinnest.
  const knollCandelabra = varied(valley('knoll-candelabra', 5, 6701, {
    minX: 18, maxX: 56, minZ: 46, maxZ: 80, scale: [2.9, 3.8], maxGrade: 0.7,
    accept: (biome, x, z) => {
      const knoll = postOfficeLookoutMask(x, z);
      return knoll > 0.12 && knoll < 0.62 && postOfficePathInfo(x, z).distance > 4;
    },
  }).map(item => ({ ...item, id: `knoll-${item.id}`, y: item.y + 0.02, tint: '#6f8a4e' })), 6703, {
    width: [0.94, 1.06],
    height: [0.94, 1.08],
    depth: [0.94, 1.06],
    maxLean: 0.012,
  });

  // Scalesia villosa, the Floreana lowland scalesia, along the banks of the
  // dry wash where run-off lingers longest after the rains.
  const scalesiaVillosa = varied(valley('scalesia-villosa', 9, 6709, {
    minX: 2, maxX: 32, minZ: 38, maxZ: 82, scale: [0.52, 0.86], maxGrade: 0.7,
    accept: (biome, x, z) => {
      const arroyo = postOfficeArroyoInfo(x, z);
      return arroyo.distance > 3.4 && arroyo.distance < 7.5 && postOfficePathInfo(x, z).distance > 3;
    },
  }), 6711);

  return [
    buildCastelaUnderstorey(),
    {
      id: 'post-office-bay-knoll-candelabra-cactus',
      path: `${NATURE}runtime-candelabra-cactus.glb`,
      items: knollCandelabra,
      tintStrength: 0.12,
      castShadow: true,
      maxVisibleDistance: 110,
      motion: { wind: 0.25, bend: 0.05, bendRadius: 1.5 },
      loadTier: 2,
    },
    {
      id: 'post-office-bay-scalesia-villosa',
      label: 'Floreana scalesia / Scalesia villosa',
      path: `${NATURE}runtime-scalesia.glb`,
      items: scalesiaVillosa,
      sink: 0.08,
      tint: '#7d8a58',
      tintStrength: 0.16,
      castShadow: false,
      maxVisibleDistance: 92,
      motion: { wind: 1.2, bend: 0.3, bendRadius: 1.35 },
      loadTier: 2,
    },
    {
      id: 'opuntia',
      label: 'Mature Floreana prickly pear / Opuntia megasperma',
      path: MATURE_OPUNTIA_PATH,
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
      || clearingDistance < POST_OFFICE_BAY_BARREL_CLEARING.radius * 1.45
      || postOfficeValleyKeepClear(x, z),
  };
}

// Inland ground that stays open: the wash bed, the whalers' rest and the
// lookout's summit, from which the anchorage must stay in view.
function postOfficeValleyKeepClear(x, z, { bedOnly = false } = {}) {
  if (z < 34) return false;
  if (postOfficeArroyoInfo(x, z).channel > (bedOnly ? 0.7 : 0.45)) return true;
  const rest = POST_OFFICE_BAY_WHALERS_REST;
  if (Math.hypot(x - rest.x, z - rest.z) < rest.radius * 1.35) return true;
  return postOfficeLookoutMask(x, z) > 0.8;
}

function buildProceduralFlora(authoredFlora, interactiveFlora = []) {
  const authoredCacti = authoredFlora
    .filter(layer => layer.id === 'opuntia' || layer.id.endsWith('candelabra-cactus'))
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
  const youngOpuntiaSites = interactiveFlora
    .filter(layer => layer.speciesId === OPUNTIA_MEGASPERMA_SPECIES.id)
    .flatMap(layer => layer.sites || []);
  const matureOpuntiaHabitatAt = sample => {
    const base = postOfficeInlandHabitat(sample);
    const companionSuitability = floraCompanionSuitability(youngOpuntiaSites, sample.x, sample.z, {
      minimumDistance: 3.6,
      preferredDistance: [5.5, 12],
      maximumDistance: 19,
    });
    const biomeSuitability = {
      'tuff-ridge': 1,
      'black-lava': 0.94,
      'dry-scrub': 0.88,
      'palo-santo': 0.7,
      'wet-basalt': 0.58,
      'ash-slope': 0.42,
    }[sample.biome] || 0.2;
    return {
      ...base,
      biomeSuitability,
      localSuitability: clamp01(companionSuitability * (0.42 + base.inland * 0.58)),
      excluded: base.excluded
        || companionSuitability <= 0
        || distanceToNearestItem(authoredCacti, sample.x, sample.z) < 5.2,
    };
  };

  return [
    buildProceduralFloraLayer({
      id: 'post-office-bay-croton-overlay',
      zoneId: POST_OFFICE_BAY,
      species: CROTON_SCOULERI_SPECIES,
      asset: { path: `${NATURE}runtime-croton.glb` },
      seed: 6481,
      count: 118,
      bounds: { minX: -56, maxX: 56, minZ: 13, maxZ: 84 },
      habitatAt: crotonHabitatAt,
      placement: {
        patchCount: 13,
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
      count: 84,
      bounds: { minX: -56, maxX: 56, minZ: 21, maxZ: 84 },
      habitatAt: darwiniothamnusHabitatAt,
      placement: {
        patchCount: 9,
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
    buildProceduralFloraLayer({
      id: 'post-office-bay-mature-opuntia-overlay',
      zoneId: POST_OFFICE_BAY,
      species: OPUNTIA_MEGASPERMA_SPECIES,
      asset: { path: MATURE_OPUNTIA_PATH },
      seed: 6553,
      count: 6,
      bounds: { minX: -54, maxX: 54, minZ: 28, maxZ: 84 },
      habitatAt: matureOpuntiaHabitatAt,
      placement: {
        ...MATURE_OPUNTIA_PLACEMENT,
        patchCount: 3,
        minPatchSeparation: 14,
        minItemSeparation: 8,
      },
      render: {
        sink: 0.04,
        tint: '#668943',
        tintStrength: 0.08,
        castShadow: true,
        maxVisibleDistance: 116,
        motion: { wind: 0.18, bend: 0.035, bendRadius: 3.2 },
        loadTier: 2,
      },
    }),
  ];
}

function buildInteractiveFlora(authoredFlora) {
  const authoredCacti = authoredFlora
    .filter(layer => layer.id === 'opuntia' || layer.id.endsWith('candelabra-cactus'))
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

  const paloSantoHabitatAt = sample => {
    const base = postOfficeInlandHabitat(sample);
    const biomeSuitability = {
      'palo-santo': 1,
      'dry-scrub': 0.82,
      'wet-basalt': 0.68,
      'tuff-ridge': 0.54,
      'ash-slope': 0.34,
    }[sample.biome] || 0;
    const obstacleClear = rocks.every(rock => (
      Math.hypot(sample.x - rock.x, sample.z - rock.z) > (rock.radiusX || rock.scale || 0.4) + 2.1
    ));
    // The stand is thickest on the woodland slope west of the track.
    const woodland = postOfficeWoodlandMask(sample.x, sample.z);
    return {
      ...base,
      biomeSuitability,
      localSuitability: clamp01((0.22 + base.inland * 0.78) * (0.45 + woodland * 0.55)),
      excluded: base.excluded
        || biomeSuitability <= 0
        || postOfficeWestLavaMask(sample.x, sample.z) > 0.7
        || base.path.distance < base.path.width * 2.45
        || distanceToNearestItem(authoredCacti, sample.x, sample.z) < 7
        || !obstacleClear,
    };
  };

  return [
    buildProceduralInteractiveFloraLayer({
      id: 'post-office-bay-prickly-pear-overlay',
      zoneId: POST_OFFICE_BAY,
      species: OPUNTIA_MEGASPERMA_SPECIES,
      runtime: 'prickly-pear',
      seed: 6577,
      count: 9,
      bounds: { minX: -50, maxX: 54, minZ: 33, maxZ: 82 },
      habitatAt,
      placement: {
        patchCount: 3,
        patchRadius: [7.5, 11],
        minPatchSeparation: 18,
        minItemSeparation: 5,
        maxGrade: 0.6,
      },
      siteFromItem: item => ({
        flowerCount: item.tone < 0.34 ? 0 : item.tone < 0.72 ? 1 : item.tone < 0.93 ? 2 : 3,
      }),
    }),
    buildProceduralInteractiveFloraLayer({
      id: 'post-office-bay-palo-santo-overlay',
      zoneId: POST_OFFICE_BAY,
      species: PALO_SANTO_SPECIES,
      runtime: 'palo-santo',
      seed: 6599,
      // Each tree is a full interactive palo santo (~90k tris dormant), so the
      // grove is a few trees thickened out by the Castela beneath them.
      count: 10,
      bounds: { minX: -50, maxX: 50, minZ: 35, maxZ: 84 },
      habitatAt: paloSantoHabitatAt,
      placement: {
        patchCount: 3,
        patchRadius: [7, 13],
        minPatchSeparation: 14,
        minItemSeparation: 5.5,
        maxGrade: 0.52,
      },
      siteFromItem: item => ({ leafiness: 0.16 + item.tone * 0.36 }),
    }),
  ];
}

function buildSurfaceLitter() {
  const basalt = buildDryVolcanicLitterLayer({
    zoneId: POST_OFFICE_BAY,
    id: 'post-office-bay-basalt-shingle',
    itemIdPrefix: 'post-office-bay-basalt-chip',
    count: 380,
    seed: 6311,
    bounds: { minX: -58, maxX: 56, minZ: -22, maxZ: 84 },
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

  // Gravel skirts at the base of the authored faceted boulders, so the hero
  // rocks read as embedded in the ground rather than set down on it.
  const boulderAnchors = getZoneObstacles(POST_OFFICE_BAY)
    .filter(obstacle => obstacle.kind === 'boulder')
    .map(obstacle => {
      const scale = obstacle.render?.scale || 1;
      const [x = 0, , z = 0] = obstacle.render?.position || [0, 0, 0];
      const footprint = obstacle.collider?.type === 'convex'
        ? Math.max(...obstacle.collider.points.map(([px, pz]) => Math.hypot(px, pz))) * scale
        : (obstacle.collider?.radius || 1) * scale;
      return { x, z, inner: footprint * 0.66, outer: footprint * 1.7 };
    });
  const boulderSkirts = buildDryVolcanicLitterLayer({
    zoneId: POST_OFFICE_BAY,
    id: 'post-office-bay-boulder-skirts',
    itemIdPrefix: 'post-office-bay-boulder-skirt',
    count: 64,
    seed: 6389,
    bounds: { minX: -22, maxX: 26, minZ: -12, maxZ: 28 },
    scale: [0.62, 1.7],
    maxVisibleDistance: 46,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.55, colors: ['#4a463e', '#3a3833', '#575046'] },
      { variant: 'weathered-basalt-chip', weight: 0.45, colors: ['#8d867a', '#a1937b', '#786f60'] },
    ],
    accept: (biome, x, z) => (
      biome !== 'water' && boulderAnchors.some(anchor => {
        const distance = Math.hypot(x - anchor.x, z - anchor.z);
        return distance > anchor.inner && distance < anchor.outer;
      })
    ),
  });

  // Rounded cobbles and grit lying in the bed of the dry wash.
  const washCobbles = buildDryVolcanicLitterLayer({
    zoneId: POST_OFFICE_BAY,
    id: 'post-office-bay-wash-cobbles',
    itemIdPrefix: 'post-office-bay-wash-cobble',
    count: 150,
    seed: 6437,
    bounds: { minX: 4, maxX: 30, minZ: 34, maxZ: 84 },
    scale: [0.6, 1.5],
    sizeVariation: [0.8, 1.14],
    maxVisibleDistance: 44,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.68, colors: ['#3b3934', '#4b463e', '#5a544a'] },
      { variant: 'weathered-basalt-chip', weight: 0.26, colors: ['#857d6f', '#968a74'] },
      { variant: 'oxidized-scoria-chip', weight: 0.06, colors: ['#74463a', '#83503c'] },
    ],
    accept: (biome, x, z) => postOfficeArroyoInfo(x, z).bed > 0.32 && postOfficePathInfo(x, z).tread < 0.3,
  });

  return [
    { ...basalt, loadTier: 1 },
    { ...strandline, loadTier: 1 },
    { ...boulderSkirts, loadTier: 1 },
    { ...washCobbles, loadTier: 1 },
  ];
}

// Galapagos bitterbush (Castela galapageia), the thorny understorey of the
// valley's dry forest, in loose clumps under and between the palo santo.
function buildCastelaUnderstorey() {
  const items = makeZoneScatter(POST_OFFICE_BAY, 'castela', 26, 6743, {
    minX: -52, maxX: 40, minZ: 42, maxZ: 84, scale: [0.18, 0.31], maxGrade: 0.5,
    accept: (biome, x, z) => {
      const path = postOfficePathInfo(x, z);
      if (path.distance < path.width * 1.8 || postOfficeValleyKeepClear(x, z)) return false;
      return postOfficeWoodlandMask(x, z) > 0.2 || (biome === 'palo-santo' && postOfficeLookoutMask(x, z) < 0.3);
    },
  });
  return {
    id: 'post-office-bay-castela',
    label: 'Galapagos bitterbush / Castela galapageia',
    path: `${NATURE}runtime-palo-santo.glb`,
    items: varied(items, 6757),
    sink: 0.06,
    tintStrength: 0.22,
    castShadow: true,
    maxVisibleDistance: 96,
    motion: { wind: 0.54, bend: 0.28, bendRadius: 1.5 },
    loadTier: 2,
  };
}

// Cove life. The bay floor drops to -4 beyond the sandbar, so the adults
// cruise the outer anchorage and the parrotfish stay in the shallow inner
// cove where a wader can see them.
function buildSwimmers() {
  return {
    schools: [
      parrotfishSchool('post-office-cove-parrotfish', {
        variant: 'initial',
        count: 12,
        center: [0, -9],
        radius: 4.6,
        pathRadiusX: 13,
        pathRadiusZ: 4,
        y: [-1.45, -1.28],
        speed: 0.2,
        scale: [0.6, 0.85],
        verticalWander: 0.02,
      }),
      parrotfishSchool('post-office-east-parrotfish', {
        count: 8,
        center: [16, -12],
        radius: 3.6,
        pathRadiusX: 7,
        pathRadiusZ: 4,
        y: [-1.55, -1.35],
        speed: 0.18,
        scale: [0.55, 0.8],
        verticalWander: 0.02,
      }),
    ],
    cruisers: [
      mantaCruiser('post-office-manta', {
        orbit: { cx: 0, cz: -30, rx: 22, rz: 4 },
        y: -1.95,
        bob: 0.16,
        speed: 0.6,
        scale: 0.9,
        direction: 1,
      }),
      mantaCruiser('post-office-manta-west', {
        orbit: { cx: -30, cz: -22, rx: 8, rz: 10 },
        y: -1.7,
        bob: 0.12,
        speed: 0.48,
        scale: 0.7,
        direction: -1,
        phase: 2.6,
      }),
    ],
  };
}

export function buildPostOfficeBayEcology() {
  const flora = buildFlora();
  const interactiveFlora = buildInteractiveFlora(flora);
  return {
    swimmers: buildSwimmers(),
    zoneId: POST_OFFICE_BAY,
    // Stage GLB decoding after the terrain and collidable hero rocks are ready.
    // Procedural litter is lightweight and appears in the first detail tier.
    stream: true,
    streamSchedule: [320, 900, 1550],
    dryGrassPatches: [buildPostOfficeBayDryGrassLayer()],
    flora,
    proceduralFlora: buildProceduralFlora(flora, interactiveFlora),
    interactiveFlora,
    surfaceLitter: buildSurfaceLitter(),
    // This is the same deterministic block set used to derive collision in
    // floreanaCoveLayout, so visual rocks and traversal remain aligned.
    rocks: getPostOfficeBayBasaltBlocks(),
    rockDust: { color: '#c4b590', strength: 0.35 },
    // The seaward mouth of Gabriel's tube, low in the mound's north-west flank.
    caveEntrances: [POST_OFFICE_BAY_SEA_TUBE],
    volcanicFormations: [{
      id: 'post-office-bay-sea-tube-formations',
      items: getPostOfficeBaySeaTubeFormations(),
      maxVisibleDistance: 90,
    }],
    collectibleBeachFinds: [buildBeachFindLayer(POST_OFFICE_BAY, {
      id: 'post-office-bay-beach-finds',
      count: 10,
      seed: 6421,
      bounds: { minX: -8, maxX: 30, minZ: -2, maxZ: 14 },
      biomes: ['ash-slope', 'tuff-ridge', 'wet-basalt', 'dry-scrub'],
      maxVisibleDistance: 56,
      accept: (biome, x, z) => {
        const shoreDistance = z - postOfficeBayCoastZ(x);
        return coveWaterMask(x, z) < 0.42
          && postOfficePathInfo(x, z).tread < 0.2
          && shoreDistance > 0.8
          && shoreDistance < 7.5
          && postOfficeLandingBeachMask(x, z) > 0.12;
      },
    })],
    // Landing clutter at the barrel clearing's edge.
    props: [
      {
        ...modelAssetProp('brokenWoodenCrate', { yaw: 2.1 }),
        id: 'landing-broken-crate',
        position: [-2.4, 0, 9.8],
        terrainY: true,
      },
      {
        ...modelAssetProp('cratesAndBags', { yaw: -0.7 }),
        id: 'landing-crates-and-bags',
        position: [2.1, 0, 10.6],
        terrainY: true,
      },
    ],
    footprintBiomes: ['ash-slope', 'dry-scrub', 'palo-santo', 'tuff-ridge'],
  };
}
