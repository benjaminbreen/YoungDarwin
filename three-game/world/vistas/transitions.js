import * as THREE from 'three';
import { terrainBiomeAt, terrainColor, terrainHeight, WATER_LEVEL } from '../terrain';
import { surfaceProfileForRegion } from './index';

export const CARDINAL_VISTA_EDGES = new Set(['north', 'south', 'east', 'west']);

export const OPPOSITE_VISTA_EDGE = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const ATMOSPHERE_HAZE_COLOR = new THREE.Color('#b9d7de');

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function edgePoint(config, edge, u, inset = 0) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (edge === 'north') return [(u - 0.5) * config.width, -halfD + inset];
  if (edge === 'south') return [(u - 0.5) * config.width, halfD - inset];
  if (edge === 'east') return [halfW - inset, (u - 0.5) * config.depth];
  return [-halfW + inset, (u - 0.5) * config.depth];
}

function hasFamily(profile, family) {
  return Boolean(profile?.families?.includes(family));
}

function profileColorValue(profile, key, fallback = '#7b7354') {
  return new THREE.Color(profile?.[key] || fallback);
}

function sampleEdgeStats(regionId, config, edge, samples = 21) {
  const color = new THREE.Color();
  const landColor = new THREE.Color();
  const biomes = new Map();
  let dry = 0;
  let shore = 0;
  let colorSamples = 0;
  let landColorSamples = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;

  for (let index = 0; index < samples; index += 1) {
    const u = samples === 1 ? 0.5 : index / (samples - 1);
    const [x, z] = edgePoint(config, edge, u, 1.8);
    const y = terrainHeight(x, z, regionId);
    const sampleColor = terrainColor(x, z, y, regionId);
    const biome = terrainBiomeAt(x, z, y, regionId);
    color.add(sampleColor);
    colorSamples += 1;
    if (y > WATER_LEVEL - 0.2) {
      landColor.add(sampleColor);
      landColorSamples += 1;
    }
    if (y > WATER_LEVEL + 0.18) dry += 1;
    if (Math.abs(y - WATER_LEVEL) < 0.72) shore += 1;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
    biomes.set(biome, (biomes.get(biome) || 0) + 1);
  }

  if (colorSamples) color.multiplyScalar(1 / colorSamples);
  if (landColorSamples) landColor.multiplyScalar(1 / landColorSamples);
  else landColor.copy(color);
  const dominantBiome = [...biomes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  return {
    dryRatio: dry / samples,
    waterRatio: 1 - dry / samples,
    shoreRatio: shore / samples,
    avgHeight: sumY / samples,
    minY,
    maxY,
    color,
    landColor,
    dominantBiome,
    biomes,
  };
}

const TRANSITION_RECIPES = {
  default: {
    id: 'default',
    targetStart: 8,
    targetFull: 38,
    midStart: 10,
    midFull: 34,
    sourceBias: 0.32,
    midStrength: 0.45,
    farBias: 0.36,
    literalTarget: 0.34,
    shoreBlend: 0.22,
    shoreFloor: WATER_LEVEL - 0.28,
    landThreshold: 0.18,
  },
  'volcanic-to-reef-shelf': {
    id: 'volcanic-to-reef-shelf',
    targetStart: 18,
    targetFull: 62,
    midStart: 14,
    midFull: 46,
    sourceBias: 0.52,
    midStrength: 0.68,
    farBias: 0.58,
    literalTarget: 0.18,
    shoreBlend: 0.38,
    shoreFloor: WATER_LEVEL - 0.52,
    landThreshold: 0.1,
  },
  'reef-to-volcanic-coast': {
    id: 'reef-to-volcanic-coast',
    targetStart: 10,
    targetFull: 46,
    midStart: 8,
    midFull: 34,
    sourceBias: 0.42,
    midStrength: 0.56,
    farBias: 0.5,
    literalTarget: 0.24,
    shoreBlend: 0.32,
    shoreFloor: WATER_LEVEL - 0.42,
    landThreshold: 0.12,
  },
  'volcanic-to-black-sand': {
    id: 'volcanic-to-black-sand',
    targetStart: 12,
    targetFull: 50,
    midStart: 10,
    midFull: 38,
    sourceBias: 0.45,
    midStrength: 0.58,
    farBias: 0.46,
    literalTarget: 0.26,
    shoreBlend: 0.34,
    shoreFloor: WATER_LEVEL - 0.36,
    landThreshold: 0.14,
  },
  'dry-to-dry': {
    id: 'dry-to-dry',
    targetStart: 6,
    targetFull: 32,
    midStart: 6,
    midFull: 28,
    sourceBias: 0.28,
    midStrength: 0.36,
    farBias: 0.28,
    literalTarget: 0.42,
    shoreBlend: 0.16,
    shoreFloor: WATER_LEVEL - 0.24,
    landThreshold: 0.18,
  },
  'coast-to-water': {
    id: 'coast-to-water',
    targetStart: 10,
    targetFull: 42,
    midStart: 8,
    midFull: 32,
    sourceBias: 0.38,
    midStrength: 0.45,
    farBias: 0.42,
    literalTarget: 0.24,
    shoreBlend: 0.48,
    shoreFloor: WATER_LEVEL - 0.62,
    landThreshold: 0.08,
  },
};

function chooseTransitionRecipe(sourceProfile, targetProfile, sourceStats, targetStats) {
  const sourceVolcanic = hasFamily(sourceProfile, 'volcanic') || hasFamily(sourceProfile, 'lava');
  const targetVolcanic = hasFamily(targetProfile, 'volcanic') || hasFamily(targetProfile, 'lava');
  const sourceReef = hasFamily(sourceProfile, 'reef-sand') || hasFamily(sourceProfile, 'white-sand');
  const targetReef = hasFamily(targetProfile, 'reef-sand') || hasFamily(targetProfile, 'white-sand');
  const targetBlackSand = hasFamily(targetProfile, 'black-sand');
  const sourceCoastal = hasFamily(sourceProfile, 'coast') || sourceStats.shoreRatio > 0.18 || sourceStats.waterRatio > 0.18;
  const targetCoastal = hasFamily(targetProfile, 'coast') || targetStats.shoreRatio > 0.18 || targetStats.waterRatio > 0.18;

  if (sourceCoastal && targetStats.waterRatio > 0.82 && targetStats.dryRatio < 0.18) return TRANSITION_RECIPES['coast-to-water'];
  if (sourceVolcanic && targetReef) return TRANSITION_RECIPES['volcanic-to-reef-shelf'];
  if (sourceReef && targetVolcanic) return TRANSITION_RECIPES['reef-to-volcanic-coast'];
  if (sourceVolcanic && targetBlackSand) return TRANSITION_RECIPES['volcanic-to-black-sand'];
  if (!sourceCoastal && !targetCoastal && sourceStats.dryRatio > 0.72 && targetStats.dryRatio > 0.72) return TRANSITION_RECIPES['dry-to-dry'];
  return TRANSITION_RECIPES.default;
}

function buildContinuityRules(recipe, sourceProfile, targetProfile, sourceStats, targetStats) {
  const heightRise = Math.max(0, targetStats.avgHeight - sourceStats.avgHeight);
  const highRidgeRise = Math.max(0, targetStats.maxY - sourceStats.maxY);
  const heightContrast = heightRise + highRidgeRise * 0.35;
  const edgeColorContrast = colorDistance(sourceStats.landColor, targetStats.landColor);
  const profileContrast = colorDistance(
    profileColorValue(sourceProfile, 'nearColor'),
    profileColorValue(targetProfile, 'nearColor'),
  );
  const colorContrast = Math.max(edgeColorContrast, profileContrast);
  const dryContinuity = Math.min(sourceStats.dryRatio, targetStats.dryRatio);
  const coastalMix = Math.max(sourceStats.shoreRatio, targetStats.shoreRatio);
  const waterMix = Math.max(sourceStats.waterRatio, targetStats.waterRatio);
  const sourceVolcanic = hasFamily(sourceProfile, 'volcanic') || hasFamily(sourceProfile, 'lava');
  const targetVolcanic = hasFamily(targetProfile, 'volcanic') || hasFamily(targetProfile, 'lava');
  const rocky = sourceVolcanic || targetVolcanic;

  const carryStart = Math.max(2.5, recipe.targetStart * 0.38);
  const carryEnd = THREE.MathUtils.clamp(
    13
      + colorContrast * 15
      + heightContrast * 1.5
      + sourceStats.dryRatio * 5
      + coastalMix * 4,
    14,
    34,
  );
  const targetColorStart = carryEnd * 0.76;
  const targetColorFull = THREE.MathUtils.clamp(
    carryEnd + 16 + colorContrast * 12 + heightContrast * 1.7,
    carryEnd + 16,
    carryEnd + 44,
  );
  const ridgeStart = THREE.MathUtils.clamp(
    carryEnd * 0.82 + heightContrast * 1.6,
    13,
    38,
  );
  const ridgeFull = THREE.MathUtils.clamp(
    ridgeStart + 20 + heightContrast * 3.2 + colorContrast * 10,
    ridgeStart + 20,
    72,
  );
  const shorePatchStart = THREE.MathUtils.clamp(carryEnd * 0.72, 9, 26);
  const shorePatchFull = shorePatchStart + 18 + waterMix * 10;
  const seamNoiseStrength = THREE.MathUtils.clamp(0.18 + colorContrast * 0.72 + coastalMix * 0.2, 0.18, 0.82);
  const detailStrength = THREE.MathUtils.clamp(dryContinuity * 0.75 + coastalMix * 0.22, 0, 1);

  return {
    heightContrast,
    colorContrast,
    dryContinuity,
    coastalMix,
    waterMix,
    carryStart,
    carryEnd,
    targetColorStart,
    targetColorFull,
    ridgeStart,
    ridgeFull,
    shorePatchStart,
    shorePatchFull,
    seamNoiseStrength,
    detail: {
      scrubCount: Math.round(THREE.MathUtils.lerp(0, 14, detailStrength)),
      rockCount: Math.round(THREE.MathUtils.lerp(0, rocky ? 7 : 4, detailStrength)),
    },
  };
}

export function buildBorderTransition(regionId, config, vista, targetConfig) {
  if (!CARDINAL_VISTA_EDGES.has(vista.edge) || !vista.toRegionId || !targetConfig) return null;
  const targetEdge = OPPOSITE_VISTA_EDGE[vista.edge];
  if (!targetEdge) return null;
  const sourceProfile = surfaceProfileForRegion(regionId);
  const targetProfile = surfaceProfileForRegion(vista.toRegionId);
  const sourceStats = sampleEdgeStats(regionId, config, vista.edge);
  const targetStats = sampleEdgeStats(vista.toRegionId, targetConfig, targetEdge);
  const recipe = chooseTransitionRecipe(sourceProfile, targetProfile, sourceStats, targetStats);
  const continuity = buildContinuityRules(recipe, sourceProfile, targetProfile, sourceStats, targetStats);
  return {
    targetEdge,
    sourceProfile,
    targetProfile,
    sourceStats,
    targetStats,
    recipe,
    continuity,
    sourceColor: sourceStats.landColor.clone().lerp(profileColorValue(sourceProfile, 'nearColor'), recipe.sourceBias),
    midColor: profileColorValue(sourceProfile, 'midColor').lerp(profileColorValue(targetProfile, 'midColor'), 0.5),
    farColor: targetStats.landColor.clone().lerp(profileColorValue(targetProfile, 'farColor'), recipe.farBias),
    shoreColor: profileColorValue(sourceProfile, 'shoreColor').lerp(profileColorValue(targetProfile, 'shoreColor'), 0.58),
    wetColor: profileColorValue(sourceProfile, 'wetColor').lerp(profileColorValue(targetProfile, 'wetColor'), 0.45),
  };
}

export function transitionVistaColor(transition, currentColor, targetColor, outsideDistance, outsideT, targetY) {
  if (!transition) {
    return currentColor.clone().lerp(targetColor, THREE.MathUtils.smoothstep(outsideDistance, 6, 34));
  }
  const { recipe, targetProfile, continuity } = transition;
  const targetT = THREE.MathUtils.smoothstep(outsideDistance, recipe.targetStart, recipe.targetFull);
  const midT = THREE.MathUtils.smoothstep(outsideDistance, recipe.midStart, recipe.midFull);
  const targetColorT = continuity
    ? THREE.MathUtils.smoothstep(outsideDistance, continuity.targetColorStart, continuity.targetColorFull)
    : targetT;
  const literalT = targetColorT * recipe.literalTarget * (targetProfile?.targetLiteralWeight ?? 0.34);
  const shoreGate = continuity
    ? THREE.MathUtils.smoothstep(outsideDistance, continuity.shorePatchStart, continuity.shorePatchFull)
    : 1;
  const shoreT = (1 - THREE.MathUtils.smoothstep(Math.abs(targetY - WATER_LEVEL), 0.08, 0.72))
    * recipe.shoreBlend
    * shoreGate
    * (0.2 + targetT * 0.8);

  const profileColor = transition.sourceColor.clone()
    .lerp(transition.midColor, midT * recipe.midStrength)
    .lerp(transition.farColor, targetT);
  profileColor.lerp(targetColor, literalT);
  profileColor.lerp(transition.shoreColor, shoreT);
  if (targetY < WATER_LEVEL - 0.08) {
    const wetT = THREE.MathUtils.smoothstep(WATER_LEVEL - targetY, 0.04, 0.7) * recipe.shoreBlend;
    profileColor.lerp(transition.wetColor, wetT);
  }
  profileColor.lerp(ATMOSPHERE_HAZE_COLOR, Math.max(0, outsideT - 0.7) * 0.22);
  const seamT = THREE.MathUtils.smoothstep(
    outsideDistance,
    continuity?.carryStart ?? 3.5,
    continuity?.targetColorFull ?? Math.max(16, recipe.targetStart + 12),
  );
  return currentColor.clone().lerp(profileColor, seamT);
}
