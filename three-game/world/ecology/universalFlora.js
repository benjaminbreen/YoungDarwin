import { getRegionMap } from '../../../game-core/regionMaps';
import { getModelAsset } from '../../modelAssets';
import {
  getRegionTerrainConfig,
  isWalkableTerrain,
  terrainBiomeAt,
  terrainHeight,
} from '../terrain';
import { WATER_LEVEL } from '../terrainShared';
import {
  buildFloraHabitatDiagnostics,
  buildProceduralFloraLayer,
  buildProceduralInteractiveFloraLayer,
  floraCompanionSuitability,
} from './proceduralFlora';
import {
  CANDELABRA_CACTUS_SPECIES,
  DARWINIOTHAMNUS_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
  PLEOPELTIS_POLYPODIOIDES_SPECIES,
} from './floraSpecies';
import { MATURE_OPUNTIA_PLACEMENT } from './floraAssets';

const UNIVERSAL_FLORA_VERSION = 2;
const DEVELOPMENT_ZONE_RE = /(?:_TEST(?:_|$)|GRASS_TEST|SPLAT_TEST)/;
const NON_LAND_TYPES = new Set([
  'beagle',
  'cabin',
  'cave',
  'governorshouse',
  'governorslibrary',
  'houseinterior',
  'interior',
  'mailbarrel',
  'ocean',
  'office',
  'reef',
  'shipinterior',
]);

const TYPE_HABITAT = Object.freeze({
  bay: { moisture: 0.24, canopy: 0.08, exposure: 0.84, disturbance: 0.1, salinity: 0.16, rockiness: 0.42 },
  beach: { moisture: 0.16, canopy: 0.02, exposure: 0.94, disturbance: 0.08, salinity: 0.2, rockiness: 0.28 },
  coastallava: { moisture: 0.08, canopy: 0.01, exposure: 0.98, disturbance: 0.04, salinity: 0.14, rockiness: 0.9 },
  coastaltrail: { moisture: 0.16, canopy: 0.07, exposure: 0.88, disturbance: 0.12, salinity: 0.14, rockiness: 0.58 },
  lavafield: { moisture: 0.07, canopy: 0, exposure: 0.98, disturbance: 0.03, salinity: 0.04, rockiness: 0.94 },
  scrubland: { moisture: 0.23, canopy: 0.2, exposure: 0.79, disturbance: 0.08, salinity: 0.06, rockiness: 0.46 },
  cliff: { moisture: 0.17, canopy: 0.04, exposure: 0.96, disturbance: 0.03, salinity: 0.12, rockiness: 0.82 },
  promontory: { moisture: 0.16, canopy: 0.03, exposure: 0.97, disturbance: 0.04, salinity: 0.16, rockiness: 0.72 },
  grassland: { moisture: 0.45, canopy: 0.06, exposure: 0.72, disturbance: 0.12, salinity: 0, rockiness: 0.18 },
  clearing: { moisture: 0.36, canopy: 0.16, exposure: 0.67, disturbance: 0.18, salinity: 0, rockiness: 0.38 },
  highland: { moisture: 0.7, canopy: 0.38, exposure: 0.38, disturbance: 0.08, salinity: 0, rockiness: 0.34 },
  forest: { moisture: 0.82, canopy: 0.82, exposure: 0.18, disturbance: 0.04, salinity: 0, rockiness: 0.2 },
  wetland: { moisture: 0.9, canopy: 0.28, exposure: 0.5, disturbance: 0.06, salinity: 0.44, rockiness: 0.08 },
  settlement: { moisture: 0.42, canopy: 0.12, exposure: 0.66, disturbance: 0.78, salinity: 0, rockiness: 0.16 },
  camp: { moisture: 0.5, canopy: 0.28, exposure: 0.54, disturbance: 0.68, salinity: 0, rockiness: 0.16 },
  hut: { moisture: 0.28, canopy: 0.08, exposure: 0.78, disturbance: 0.72, salinity: 0.18, rockiness: 0.2 },
  shipwreck: { moisture: 0.2, canopy: 0.02, exposure: 0.94, disturbance: 0.4, salinity: 0.3, rockiness: 0.56 },
});

const UNIVERSAL_INTERACTIVE_SPECIES = Object.freeze([
  Object.freeze({
    species: OPUNTIA_MEGASPERMA_SPECIES,
    runtime: 'prickly-pear',
    layerId: 'universal-young-opuntia',
    lifeStage: 'breakable juvenile',
    itemsPerPatch: 3,
    structureClearance: 6,
    specimenClearance: 4.5,
    authoredClearance: 4.5,
    // These two older physics cohorts predate ecology-owned interactive sites.
    // Count them for budgeting so the universal pass does not double-populate
    // their maps while the runtime continues to merge both sources.
    authoredCountByZone: { POST_OFFICE_BAY: 4, E_MID: 5 },
    siteFromItem: item => ({
      flowerCount: item.tone < 0.34 ? 0 : item.tone < 0.72 ? 1 : item.tone < 0.93 ? 2 : 3,
    }),
  }),
]);

const UNIVERSAL_SPECIES = Object.freeze([
  Object.freeze({
    species: CANDELABRA_CACTUS_SPECIES,
    assetId: 'candelabracactus',
    layerId: 'universal-candelabra-cactus',
    excludedZoneIds: new Set(['N_OUTCROP']),
    sameSpeciesPath: /runtime-candelabra-cactus\.glb$/,
    companionPath: /runtime-(?:darwiniothamnus|croton|big-opuntia)\.glb$/,
    companionAnnulus: { minimumDistance: 3.5, preferredDistance: [6, 14], maximumDistance: 24 },
    authoredClearance: 7.5,
    structureClearance: 5.5,
    specimenClearance: 4.5,
    itemsPerPatch: 1,
    render: {
      sink: 0.04,
      tint: '#6f8649',
      tintStrength: 0.08,
      castShadow: true,
      maxVisibleDistance: 118,
      motion: { wind: 0.24, bend: 0.04, bendRadius: 1.45 },
      loadTier: 2,
    },
  }),
  Object.freeze({
    species: OPUNTIA_MEGASPERMA_SPECIES,
    assetId: 'matureOpuntia',
    layerId: 'universal-mature-opuntia',
    lifeStage: 'mature tree cactus',
    sameSpeciesPath: /runtime-big-opuntia\.glb$/,
    companionRuntime: 'prickly-pear',
    companionAnnulus: { minimumDistance: 4.2, preferredDistance: [6, 14], maximumDistance: 24 },
    requireCompanionRange: true,
    placement: {
      ...MATURE_OPUNTIA_PLACEMENT,
      densityPerHectare: 7,
      maximumPerRegion: 6,
    },
    itemsPerPatch: 2,
    authoredClearance: 8,
    structureClearance: 7,
    specimenClearance: 5,
    render: {
      sink: 0.04,
      tint: '#698b45',
      tintStrength: 0.08,
      castShadow: true,
      maxVisibleDistance: 120,
      motion: { wind: 0.16, bend: 0.03, bendRadius: 3.4 },
      loadTier: 2,
    },
  }),
  Object.freeze({
    species: DARWINIOTHAMNUS_SPECIES,
    assetId: 'darwiniothamnusShrub',
    layerId: 'universal-darwiniothamnus',
    sameSpeciesPath: /runtime-darwiniothamnus\.glb$/,
    companionPath: /runtime-(?:croton|big-opuntia|palo-santo)\.glb$/,
    companionAnnulus: { minimumDistance: 1.6, preferredDistance: [3, 9], maximumDistance: 18 },
    itemsPerPatch: 7,
    authoredClearance: 2.2,
    structureClearance: 4.5,
    specimenClearance: 3.5,
    asset: { variantMode: 'mesh', variantCount: 9 },
    render: {
      sink: 0.05,
      tint: '#788952',
      tintStrength: 0.15,
      castShadow: false,
      maxVisibleDistance: 98,
      motion: { wind: 0.96, bend: 0.23, bendRadius: 1.6 },
      loadTier: 2,
    },
  }),
  Object.freeze({
    species: PLEOPELTIS_POLYPODIOIDES_SPECIES,
    assetId: 'resurrectionfern',
    layerId: 'universal-resurrection-fern',
    sameSpeciesPath: /runtime-galapagos-fern\.glb$/,
    companionPath: /runtime-(?:palo-santo|manzanillo|scalesia[^/]*)\.glb$/,
    companionAnnulus: { minimumDistance: 0.8, preferredDistance: [1.5, 5], maximumDistance: 11 },
    itemsPerPatch: 8,
    authoredClearance: 1.2,
    structureClearance: 3.5,
    specimenClearance: 2.8,
    render: {
      sink: 0.025,
      tint: '#55734d',
      tintStrength: 0.14,
      castShadow: false,
      maxVisibleDistance: 78,
      motion: { wind: 0.62, bend: 0.16, bendRadius: 0.65 },
      loadTier: 2,
    },
  }),
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pointFor(item) {
  if (Number.isFinite(item?.x) && Number.isFinite(item?.z)) return { x: item.x, z: item.z };
  const position = item?.position;
  if (Array.isArray(position) && Number.isFinite(position[0]) && Number.isFinite(position[2])) {
    return { x: position[0], z: position[2] };
  }
  return null;
}

function nearestDistance(items, x, z) {
  let nearest = Infinity;
  for (const item of items || []) {
    const point = pointFor(item);
    if (!point) continue;
    nearest = Math.min(nearest, Math.hypot(x - point.x, z - point.z));
  }
  return nearest;
}

function biomeAdjustments(biome) {
  const name = String(biome || '').toLowerCase();
  const wet = /wet|water|lagoon|pool|stream|spring|mangrove|marsh|mud/.test(name);
  const humid = /forest|canopy|understory|humid|fern|meadow|grass/.test(name);
  const rocky = /lava|basalt|cinder|tuff|rock|scree|outcrop|ash/.test(name);
  const exposed = /beach|sand|shore|cliff|ridge|rise|open|dry/.test(name);
  const route = /path|trail|track|road|tread|furrow|garden|crop|yard|settlement|camp|structure/.test(name);
  return { wet, humid, rocky, exposed, route, name };
}

function defaultHabitat(type) {
  return TYPE_HABITAT[type] || {
    moisture: 0.34,
    canopy: 0.14,
    exposure: 0.7,
    disturbance: 0.12,
    salinity: 0.04,
    rockiness: 0.38,
  };
}

function authoredContext(ecology, policy) {
  const floraLayers = [...(ecology.flora || []), ...(ecology.proceduralFlora || [])];
  const interactiveLayers = ecology.interactiveFlora || [];
  const decorativeSameSpecies = floraLayers
    .filter(layer => layer.speciesId === policy.species.id || policy.sameSpeciesPath?.test(layer.path || ''))
    .flatMap(layer => layer.items || []);
  const interactiveSameSpecies = interactiveLayers
    .filter(layer => layer.speciesId === policy.species.id || layer.runtime === policy.runtime)
    .flatMap(layer => layer.sites || []);
  const sameSpecies = policy.runtime ? interactiveSameSpecies : decorativeSameSpecies;
  const tallFlora = floraLayers
    .filter(layer => /runtime-(?:candelabra-cactus|big-opuntia|palo-santo|manzanillo|scalesia[^/]*)\.glb$/.test(layer.path || ''))
    .flatMap(layer => layer.items || []);
  const companions = floraLayers
    .filter(layer => policy.companionPath?.test(layer.path || ''))
    .flatMap(layer => layer.items || []);
  const interactiveCompanions = interactiveLayers
    .filter(layer => policy.companionRuntime && layer.runtime === policy.companionRuntime)
    .flatMap(layer => layer.sites || []);
  return {
    sameSpecies,
    tallFlora,
    companions: [...companions, ...interactiveCompanions],
    structures: (ecology.props || []).filter(prop => (
      prop.kind === 'structure'
      || /hut|house|cabin|barrel|crate|camp|wreck|boat|fence|gate/i.test(`${prop.id || ''} ${prop.path || ''}`)
    )),
    specimenActors: getRegionMap(ecology.zoneId)?.specimens || [],
  };
}

export function createUniversalFloraHabitatSampler(zoneId, ecology, policy) {
  const region = getRegionMap(zoneId);
  const config = getRegionTerrainConfig(zoneId);
  const type = String(region.type || '').toLowerCase();
  const baseline = defaultHabitat(type);
  const context = authoredContext({ ...ecology, zoneId }, policy);
  const edgeMargin = Math.max(3.5, Math.min(config.width, config.depth) * 0.045);
  const playerStart = Array.isArray(region.playerStart) ? [{ position: region.playerStart }] : [];

  return ({ biome, x, z, y = terrainHeight(x, z, zoneId), grade = 0 }) => {
    const adjustments = biomeAdjustments(biome || terrainBiomeAt(x, z, y, zoneId));
    const edgeDistance = Math.min(
      config.width * 0.5 - Math.abs(x),
      config.depth * 0.5 - Math.abs(z),
    );
    const elevationDrying = clamp01(Math.max(0, y - 1.5) / 9);
    const reasons = [];
    if (DEVELOPMENT_ZONE_RE.test(zoneId)) reasons.push('development map');
    if (NON_LAND_TYPES.has(type)) reasons.push('non-terrestrial map');
    if (policy.excludedZoneIds?.has(zoneId)) reasons.push('region exclusion');
    if (edgeDistance < edgeMargin) reasons.push('map edge');
    if (!isWalkableTerrain(x, z, zoneId)) reasons.push('unwalkable terrain');
    if (y <= WATER_LEVEL + 0.04 || adjustments.name.includes('water')) reasons.push('water');
    if (adjustments.route) reasons.push('path or worked ground');
    if (nearestDistance(context.structures, x, z) < policy.structureClearance) reasons.push('structure clearance');
    if (nearestDistance(context.specimenActors, x, z) < policy.specimenClearance) reasons.push('specimen clearance');
    if (nearestDistance(playerStart, x, z) < 5.5) reasons.push('arrival sightline');
    if (nearestDistance(context.sameSpecies, x, z) < policy.authoredClearance) reasons.push('authored cohort clearance');

    const moisture = clamp01(
      baseline.moisture
      + (adjustments.wet ? 0.36 : 0)
      + (adjustments.humid ? 0.18 : 0)
      - (adjustments.rocky ? 0.05 : 0)
      - (adjustments.exposed ? 0.08 : 0)
      - elevationDrying * 0.05,
    );
    const canopy = clamp01(
      baseline.canopy
      + (adjustments.humid ? 0.24 : 0)
      + (adjustments.wet ? 0.08 : 0)
      - (adjustments.exposed ? 0.12 : 0),
    );
    const exposure = clamp01(
      baseline.exposure
      + (adjustments.exposed ? 0.14 : 0)
      + (adjustments.rocky ? 0.08 : 0)
      - (adjustments.humid ? 0.18 : 0)
      - (adjustments.wet ? 0.1 : 0),
    );
    const disturbance = clamp01(
      baseline.disturbance
      + (adjustments.route ? 0.7 : 0)
      + Math.max(0, 4 - nearestDistance(context.structures, x, z)) * 0.12,
    );
    const salinity = clamp01(
      baseline.salinity
      + (adjustments.wet && ['bay', 'beach', 'wetland'].includes(type) ? 0.18 : 0)
      + (y < 0.45 ? 0.08 : y < 0.9 ? 0.03 : 0),
    );
    const rockiness = clamp01(
      baseline.rockiness
      + (adjustments.rocky ? 0.3 : 0)
      + grade * 0.16
      - (adjustments.wet ? 0.12 : 0),
    );
    const tallFloraDistance = nearestDistance(context.tallFlora, x, z);
    const companionFit = context.companions.length > 0
      ? floraCompanionSuitability(context.companions, x, z, policy.companionAnnulus)
      : 1;
    if (policy.requireCompanionRange && context.companions.length > 0 && companionFit <= 0) {
      reasons.push('companion cohort range');
    }
    const companionMultiplier = policy.requireCompanionRange && context.companions.length > 0
      ? companionFit
      : 0.72 + companionFit * 0.28;

    return {
      moisture,
      canopy,
      exposure,
      disturbance,
      salinity,
      rockiness,
      biomeSuitability: NON_LAND_TYPES.has(type) ? 0 : 1,
      localSuitability: clamp01(
        (tallFloraDistance < 2.4 ? tallFloraDistance / 2.4 : 1)
        * companionMultiplier,
      ),
      excluded: reasons.length > 0,
      exclusionReasons: reasons,
    };
  };
}

function densityBudget(placement, config, diagnostic, existingCount) {
  const hectares = (config.width * config.depth) / 10000;
  const density = placement.densityPerHectare || 0;
  const maximum = placement.maximumPerRegion ?? Infinity;
  const habitatWeightedTarget = Math.round(
    hectares * density * Math.pow(diagnostic?.suitableFraction || 0, 0.72),
  );
  const target = Math.min(maximum, Math.max(0, habitatWeightedTarget));
  return {
    hectares,
    densityPerHectare: density,
    targetCount: target,
    existingCount,
    proceduralCount: Math.max(0, target - existingCount),
  };
}

function diagnosticEntry(diagnostic, placementStats, density, policy) {
  return {
    ...diagnostic,
    placementStats,
    densityBudget: density,
    lifeStage: policy.lifeStage || null,
    placementMode: policy.runtime ? 'physics' : 'decorative',
    runtime: policy.runtime || null,
  };
}

function emptyPlacementStats() {
  return {
    requestedCount: 0,
    generatedCount: 0,
    shortfallCount: 0,
    requestedPatchCount: 0,
    generatedPatchCount: 0,
    patchCenters: [],
  };
}

function placementForPolicy(policy, count) {
  return {
    ...(policy.species.placement || {}),
    ...(policy.placement || {}),
    patchCount: Math.max(1, Math.ceil(count / Math.max(1, policy.itemsPerPatch || count || 1))),
  };
}

function allocateDensity(policy, config, diagnostic, existingCount, vegetationBudget, placement) {
  const uncappedDensity = densityBudget(placement, config, diagnostic, existingCount);
  return {
    ...uncappedDensity,
    uncappedProceduralCount: uncappedDensity.proceduralCount,
    proceduralCount: Math.min(uncappedDensity.proceduralCount, vegetationBudget.remainingCount),
    totalBudgetLimited: uncappedDensity.proceduralCount > vegetationBudget.remainingCount,
  };
}

function commitBudget(vegetationBudget, generatedCount) {
  vegetationBudget.allocatedCount += generatedCount;
  vegetationBudget.remainingCount = Math.max(
    0,
    vegetationBudget.maximumOverlayCount - vegetationBudget.allocatedCount,
  );
}

function createUniversalVegetationBudget(config, ecology) {
  const hectares = (config.width * config.depth) / 10000;
  const authoredWoodyCount = [...(ecology.flora || []), ...(ecology.proceduralFlora || [])]
    .filter(layer => /shrub|bush|cactus|opuntia|tree|croton|darwiniothamnus|scalesia|miconia/i.test(
      `${layer.id || ''} ${layer.label || ''} ${layer.path || ''}`,
    ))
    .reduce((total, layer) => total + (layer.items?.length || 0), 0);
  const maximumOverlayCount = Math.max(6, Math.min(72, Math.round(hectares * 46)));
  return {
    hectares,
    authoredWoodyCount,
    maximumOverlayCount,
    allocatedCount: 0,
    remainingCount: maximumOverlayCount,
  };
}

export function applyUniversalProceduralFlora(zoneId, ecology = null) {
  if (ecology?.universalFloraVersion === UNIVERSAL_FLORA_VERSION) return ecology;
  const base = {
    zoneId,
    flora: [],
    proceduralFlora: [],
    interactiveFlora: [],
    rocks: [],
    surfaceLitter: [],
    props: [],
    ...(ecology || {}),
  };
  const config = getRegionTerrainConfig(zoneId);
  const margin = Math.max(4, Math.min(config.width, config.depth) * 0.055);
  const bounds = {
    minX: -config.width * 0.5 + margin,
    maxX: config.width * 0.5 - margin,
    minZ: -config.depth * 0.5 + margin,
    maxZ: config.depth * 0.5 - margin,
  };
  const universalLayers = [];
  const universalInteractiveLayers = [];
  const universalDiagnostics = [];
  const vegetationBudget = createUniversalVegetationBudget(config, base);
  let workingEcology = base;

  for (const policy of UNIVERSAL_INTERACTIVE_SPECIES) {
    const preliminaryPlacement = placementForPolicy(policy, 1);
    const habitatAt = createUniversalFloraHabitatSampler(zoneId, workingEcology, policy);
    const diagnostic = buildFloraHabitatDiagnostics({
      zoneId,
      species: policy.species,
      bounds,
      habitatAt,
      placement: preliminaryPlacement,
    });
    const context = authoredContext(workingEcology, policy);
    const legacyCount = policy.authoredCountByZone?.[zoneId] || 0;
    const density = allocateDensity(
      policy,
      config,
      diagnostic,
      context.sameSpecies.length + legacyCount,
      vegetationBudget,
      preliminaryPlacement,
    );
    const placement = placementForPolicy(policy, density.proceduralCount);

    if (density.proceduralCount <= 0) {
      universalDiagnostics.push(diagnosticEntry(diagnostic, emptyPlacementStats(), density, policy));
      continue;
    }

    const layer = buildProceduralInteractiveFloraLayer({
      id: `${policy.layerId}-${zoneId.toLowerCase().replaceAll('_', '-')}`,
      zoneId,
      species: policy.species,
      runtime: policy.runtime,
      seed: hashText(`${zoneId}:${policy.layerId}:universal`),
      count: density.proceduralCount,
      bounds,
      habitatAt,
      placement,
      siteFromItem: policy.siteFromItem,
    });
    layer.universal = true;
    layer.lifeStage = policy.lifeStage || null;
    layer.densityBudget = density;
    layer.diagnostics = diagnosticEntry(layer.diagnostics, layer.placementStats, density, policy);
    universalInteractiveLayers.push(layer);
    universalDiagnostics.push(layer.diagnostics);
    workingEcology = {
      ...workingEcology,
      interactiveFlora: [...(workingEcology.interactiveFlora || []), layer],
    };
    commitBudget(vegetationBudget, layer.sites.length);
  }

  for (const policy of UNIVERSAL_SPECIES) {
    const preliminaryPlacement = placementForPolicy(policy, 1);
    const habitatAt = createUniversalFloraHabitatSampler(zoneId, workingEcology, policy);
    const diagnostic = buildFloraHabitatDiagnostics({
      zoneId,
      species: policy.species,
      bounds,
      habitatAt,
      placement: preliminaryPlacement,
    });
    const context = authoredContext(workingEcology, policy);
    const density = allocateDensity(
      policy,
      config,
      diagnostic,
      context.sameSpecies.length,
      vegetationBudget,
      preliminaryPlacement,
    );
    const placement = placementForPolicy(policy, density.proceduralCount);

    if (density.proceduralCount <= 0) {
      universalDiagnostics.push(diagnosticEntry(diagnostic, emptyPlacementStats(), density, policy));
      continue;
    }

    const asset = getModelAsset(policy.assetId);
    const layer = buildProceduralFloraLayer({
      id: `${policy.layerId}-${zoneId.toLowerCase().replaceAll('_', '-')}`,
      zoneId,
      species: policy.species,
      asset: {
        path: asset?.path || policy.fallbackPath,
        ...(policy.asset || {}),
      },
      seed: hashText(`${zoneId}:${policy.layerId}:universal`),
      count: density.proceduralCount,
      bounds,
      habitatAt,
      placement,
      render: policy.render || {},
    });
    layer.universal = true;
    layer.lifeStage = policy.lifeStage || null;
    layer.densityBudget = density;
    layer.diagnostics = diagnosticEntry(layer.diagnostics, layer.placementStats, density, policy);
    universalLayers.push(layer);
    universalDiagnostics.push(layer.diagnostics);
    workingEcology = {
      ...workingEcology,
      proceduralFlora: [...(workingEcology.proceduralFlora || []), layer],
    };
    commitBudget(vegetationBudget, layer.items.length);
  }

  const existingDiagnostics = [
    ...(base.proceduralFlora || []).map(layer => layer.diagnostics).filter(Boolean),
    ...(base.interactiveFlora || []).map(layer => layer.diagnostics).filter(Boolean),
  ];
  return {
    ...base,
    proceduralFlora: [...(base.proceduralFlora || []), ...universalLayers],
    interactiveFlora: [...(base.interactiveFlora || []), ...universalInteractiveLayers],
    proceduralFloraDiagnostics: [...existingDiagnostics, ...universalDiagnostics],
    universalFloraBudget: vegetationBudget,
    universalFloraVersion: UNIVERSAL_FLORA_VERSION,
  };
}
