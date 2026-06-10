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

// Helper for the common "vegetation grows in discrete clumps" pattern.
export function nearAnyCluster(clusters, x, z, radius = 9) {
  return clusters.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < radius);
}
