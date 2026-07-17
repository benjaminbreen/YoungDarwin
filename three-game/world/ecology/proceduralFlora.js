import { makeZonePatchScatter, varyScatterTransforms } from '../scatter';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Trapezoid preference curve: fully suitable inside `preferred`, fading to
// zero at the edges of `tolerated`. This keeps species profiles readable and
// avoids a full simulation model for each environmental signal.
export function floraPreferenceSuitability(value, preference) {
  if (!Number.isFinite(value) || !preference) return 1;
  const preferred = preference.preferred || preference.tolerated || [0, 1];
  const tolerated = preference.tolerated || preferred;
  const preferredMin = Math.min(preferred[0], preferred[1]);
  const preferredMax = Math.max(preferred[0], preferred[1]);
  const toleratedMin = Math.min(tolerated[0], tolerated[1], preferredMin);
  const toleratedMax = Math.max(tolerated[0], tolerated[1], preferredMax);
  if (value < toleratedMin || value > toleratedMax) return 0;
  if (value >= preferredMin && value <= preferredMax) return 1;
  if (value < preferredMin) {
    return clamp01((value - toleratedMin) / Math.max(1e-6, preferredMin - toleratedMin));
  }
  return clamp01((toleratedMax - value) / Math.max(1e-6, toleratedMax - preferredMax));
}

export function scoreFloraHabitat(species, sample = {}) {
  if (sample.excluded === true) return 0;
  const preferences = species?.habitat?.preferences || {};
  let weightedLog = 0;
  let totalWeight = 0;
  for (const [field, preference] of Object.entries(preferences)) {
    if (!Number.isFinite(sample[field])) continue;
    const score = floraPreferenceSuitability(sample[field], preference);
    if (score <= 0) return 0;
    const weight = Math.max(0.01, Number(preference.weight) || 1);
    weightedLog += Math.log(Math.max(score, 1e-4)) * weight;
    totalWeight += weight;
  }
  const environmentalFit = totalWeight > 0 ? Math.exp(weightedLog / totalWeight) : 1;
  const localFit = Number.isFinite(sample.localSuitability) ? clamp01(sample.localSuitability) : 1;
  const biomeFit = Number.isFinite(sample.biomeSuitability) ? clamp01(sample.biomeSuitability) : 1;
  return clamp01(environmentalFit * localFit * biomeFit);
}

function buildHabitatScatter({
  id,
  zoneId,
  species,
  seed,
  count,
  bounds,
  habitatAt,
  placement: placementOverrides = {},
}) {
  if (!id || !zoneId || !species || !habitatAt) {
    throw new Error('Procedural flora requires id, zoneId, species, and habitatAt.');
  }
  const placement = {
    ...(species.placement || {}),
    ...placementOverrides,
  };
  const variation = {
    ...(species.placement?.variation || {}),
    ...(placementOverrides.variation || {}),
  };
  const minimumSuitability = placement.minimumSuitability ?? species.habitat?.minimumSuitability ?? 0.24;
  const suitability = (biome, x, z, y, grade) => {
    if (placement.accept && !placement.accept(biome, x, z, y, grade)) return 0;
    const sample = habitatAt({ biome, x, z, y, grade, zoneId }) || {};
    const score = scoreFloraHabitat(species, sample);
    return score >= minimumSuitability ? score : 0;
  };

  const rawItems = makeZonePatchScatter(zoneId, id, count, seed, {
    ...bounds,
    scale: placement.scale || [1, 1],
    scaleExponent: placement.scaleExponent ?? 1,
    maxGrade: placement.maxGrade ?? 0.65,
    patchCount: placement.patchCount ?? Math.max(1, Math.round(count / 9)),
    patchRadius: placement.patchRadius || [2.5, 5.5],
    minPatchSeparation: placement.minPatchSeparation,
    minItemSeparation: placement.minItemSeparation,
    variantCount: placement.variantCount || null,
    suitability,
  });
  const items = varyScatterTransforms(rawItems, seed + 1, variation);
  const requestedPatchCount = placement.patchCount ?? Math.max(1, Math.round(count / 9));
  return {
    items,
    placementStats: {
      requestedCount: count,
      generatedCount: items.length,
      requestedPatchCount,
      generatedPatchCount: new Set(items.map(item => item.patchIndex)).size,
    },
  };
}

// Builds an optional procedural overlay layer using the same item contract as
// hand-authored flora. Callers opt in per species and region; existing `flora`
// arrays are never read, replaced, or mutated.
export function buildProceduralFloraLayer({
  id,
  zoneId,
  species,
  asset,
  seed,
  count,
  bounds,
  habitatAt,
  placement: placementOverrides = {},
  render = {},
}) {
  if (!asset?.path) {
    throw new Error('Procedural rendered flora requires asset.path.');
  }
  const { items, placementStats } = buildHabitatScatter({
    id,
    zoneId,
    species,
    seed,
    count,
    bounds,
    habitatAt,
    placement: {
      ...placementOverrides,
      variantCount: asset.variantCount || null,
    },
  });
  return {
    ...render,
    id,
    label: species.label,
    path: asset.path,
    variantMode: asset.variantMode || null,
    speciesId: species.id,
    procedural: true,
    items,
    placementStats,
  };
}

// Interactive flora uses the same deterministic habitat placement but hands
// stable site data to a specialized gameplay runtime instead of rendering an
// instanced asset. This keeps physics, breakage, and collection in their
// existing owner while ecology controls where the plants can grow.
export function buildProceduralInteractiveFloraLayer({
  id,
  zoneId,
  species,
  runtime,
  seed,
  count,
  bounds,
  habitatAt,
  placement: placementOverrides = {},
  siteFromItem = null,
}) {
  if (!runtime) throw new Error('Procedural interactive flora requires a runtime id.');
  const { items, placementStats } = buildHabitatScatter({
    id,
    zoneId,
    species,
    seed,
    count,
    bounds,
    habitatAt,
    placement: placementOverrides,
  });
  const sites = items.map((item, index) => {
    const additions = siteFromItem?.(item, index) || {};
    return {
      id: item.id,
      x: item.x,
      y: item.y,
      z: item.z,
      yaw: item.yaw,
      size: item.scale,
      seed: `${zoneId}:${item.id}`,
      patchIndex: item.patchIndex,
      ...additions,
    };
  });
  return {
    id,
    label: species.label,
    speciesId: species.id,
    runtime,
    procedural: true,
    sites,
    placementStats,
  };
}
