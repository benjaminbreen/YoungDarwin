import { terrainHeight, terrainBiomeAt, terrainSlopeAt } from './terrain';

// Deterministic, terrain-aware scatter shared by every ecology. Items carry
// position, slope grade, scale, yaw, and a tone value for per-instance
// variation; placement is seeded so visuals, colliders, and anything else
// derived from a layout always agree.

export function seededRandom(i, k) {
  const v = Math.sin((i + k * 57.13) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

export function makeZoneScatter(zoneId, layer, count, seed, {
  minX,
  maxX,
  minZ,
  maxZ,
  scale = [1, 1],
  accept = null,
  maxGrade = 0.65,
}) {
  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * 70) {
    attempts += 1;
    const i = attempts + seed * 1000;
    const x = minX + seededRandom(i, 3) * (maxX - minX);
    const z = minZ + seededRandom(i, 9) * (maxZ - minZ);
    const y = terrainHeight(x, z, zoneId);
    const biome = terrainBiomeAt(x, z, y, zoneId);
    const { grade } = terrainSlopeAt(x, z, zoneId);
    if (grade > maxGrade) continue;
    if (accept && !accept(biome, x, z, y)) continue;
    items.push({
      id: `${layer}-${items.length}`,
      x,
      y,
      z,
      grade,
      scale: scale[0] + seededRandom(i, 13) * (scale[1] - scale[0]),
      yaw: seededRandom(i, 17) * Math.PI * 2,
      tone: seededRandom(i, 27),
    });
  }
  return items;
}

// Deterministic terrain-aware scatter for species that grow in colonies or
// patches. Patch centers are irregularly spaced, and each accepted item gets
// a center-weighted elliptical offset instead of a uniform map-wide position.
// `variantCount` is optional; when present, every patch cycles through all
// variants before repeating them.
export function makeZonePatchScatter(zoneId, layer, count, seed, {
  minX,
  maxX,
  minZ,
  maxZ,
  scale = [1, 1],
  accept = null,
  maxGrade = 0.65,
  patchCount = Math.max(1, Math.round(count / 9)),
  patchRadius = [2.5, 5.5],
  minPatchSeparation = patchRadius[1] * 1.25,
  minItemSeparation = 0,
  variantCount = null,
  scaleExponent = 1,
  suitability = null,
}) {
  if (count <= 0 || patchCount <= 0) return [];

  const centers = [];
  let centerAttempts = 0;
  while (centers.length < patchCount && centerAttempts < patchCount * 180) {
    centerAttempts += 1;
    const i = centerAttempts + seed * 1000;
    const x = minX + seededRandom(i, 3) * (maxX - minX);
    const z = minZ + seededRandom(i, 9) * (maxZ - minZ);
    const y = terrainHeight(x, z, zoneId);
    const biome = terrainBiomeAt(x, z, y, zoneId);
    const { grade } = terrainSlopeAt(x, z, zoneId);
    if (grade > maxGrade) continue;
    if (accept && !accept(biome, x, z, y)) continue;
    const habitatScore = suitability ? Math.max(0, Math.min(1, suitability(biome, x, z, y, grade))) : 1;
    if (habitatScore <= 0 || seededRandom(i, 59) > habitatScore) continue;
    const separation = centerAttempts < patchCount * 120
      ? minPatchSeparation
      : minPatchSeparation * 0.45;
    if (centers.some(center => Math.hypot(x - center.x, z - center.z) < separation)) continue;
    const radius = patchRadius[0] + seededRandom(i, 19) * (patchRadius[1] - patchRadius[0]);
    centers.push({
      x,
      z,
      radiusX: radius * (0.72 + seededRandom(i, 23) * 0.5),
      radiusZ: radius * (0.72 + seededRandom(i, 29) * 0.5),
      yaw: seededRandom(i, 31) * Math.PI * 2,
    });
  }
  if (!centers.length) return [];

  const items = [];
  const patchItemCounts = new Array(centers.length).fill(0);
  const patchTargets = centers.map((_, patchIndex) => (
    Math.floor(count / centers.length) + (patchIndex < count % centers.length ? 1 : 0)
  ));
  let attempts = 0;
  while (items.length < count && attempts < count * 180) {
    attempts += 1;
    const i = attempts + seed * 4000;
    const patchIndex = (attempts - 1) % centers.length;
    if (patchItemCounts[patchIndex] >= patchTargets[patchIndex]) continue;
    const center = centers[patchIndex];
    // Bias toward the center while leaving a few plants at the loose edge.
    const distance = Math.pow(seededRandom(i, 37), 1.55);
    const angle = seededRandom(i, 41) * Math.PI * 2;
    const localX = Math.cos(angle) * center.radiusX * distance;
    const localZ = Math.sin(angle) * center.radiusZ * distance;
    const cos = Math.cos(center.yaw);
    const sin = Math.sin(center.yaw);
    const x = center.x + localX * cos - localZ * sin;
    const z = center.z + localX * sin + localZ * cos;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const y = terrainHeight(x, z, zoneId);
    const biome = terrainBiomeAt(x, z, y, zoneId);
    const { grade } = terrainSlopeAt(x, z, zoneId);
    if (grade > maxGrade) continue;
    if (accept && !accept(biome, x, z, y)) continue;
    const habitatScore = suitability ? Math.max(0, Math.min(1, suitability(biome, x, z, y, grade))) : 1;
    if (habitatScore <= 0 || seededRandom(i, 61) > habitatScore) continue;
    if (minItemSeparation > 0 && items.some(item => (
      Math.hypot(x - item.x, z - item.z) < minItemSeparation
    ))) continue;

    const patchItemIndex = patchItemCounts[patchIndex];
    patchItemCounts[patchIndex] += 1;
    const item = {
      id: `${layer}-patch-${patchIndex}-${patchItemIndex}`,
      patchIndex,
      x,
      y,
      z,
      grade,
      scale: scale[0] + Math.pow(seededRandom(i, 43), Math.max(0.01, scaleExponent)) * (scale[1] - scale[0]),
      yaw: seededRandom(i, 47) * Math.PI * 2,
      tone: seededRandom(i, 53),
    };
    if (Number.isFinite(variantCount) && variantCount > 0) {
      item.variantIndex = (patchItemIndex + patchIndex * 2) % Math.floor(variantCount);
    }
    items.push(item);
  }
  return items;
}

// Adds small, deterministic silhouette variation to existing instanced assets.
// All fields are optional and default to the authored model proportions.
export function varyScatterTransforms(items, seed, {
  width = [0.9, 1.1],
  height = [0.9, 1.1],
  depth = width,
  maxLean = 0.04,
} = {}) {
  return items.map((item, index) => {
    const i = index + seed * 1000;
    return {
      ...item,
      widthScale: width[0] + seededRandom(i, 31) * (width[1] - width[0]),
      heightScale: height[0] + seededRandom(i, 37) * (height[1] - height[0]),
      depthScale: depth[0] + seededRandom(i, 41) * (depth[1] - depth[0]),
      pitch: (seededRandom(i, 43) - 0.5) * maxLean * 2,
      roll: (seededRandom(i, 47) - 0.5) * maxLean * 2,
    };
  });
}

// Helper for the common "vegetation grows in discrete clumps" pattern.
export function nearAnyCluster(clusters, x, z, radius = 9) {
  return clusters.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < radius);
}
