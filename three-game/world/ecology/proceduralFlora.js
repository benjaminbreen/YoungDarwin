import { getRegionDisplayName } from '../../../game-core/regionMaps';
import { makeZonePatchScatter, varyScatterTransforms } from '../scatter';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt } from '../terrain';

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

export function scoreFloraHabitatBreakdown(species, sample = {}) {
  const exclusionReasons = Array.isArray(sample.exclusionReasons)
    ? sample.exclusionReasons.filter(Boolean)
    : sample.exclusionReason
      ? [sample.exclusionReason]
      : [];
  if (sample.excluded === true) {
    return {
      score: 0,
      factors: {},
      limitingFactor: exclusionReasons[0] || 'hard exclusion',
      rejectionReason: exclusionReasons[0] || 'hard exclusion',
    };
  }
  const preferences = species?.habitat?.preferences || {};
  let weightedLog = 0;
  let totalWeight = 0;
  const factors = {};
  for (const [field, preference] of Object.entries(preferences)) {
    if (!Number.isFinite(sample[field])) continue;
    const score = floraPreferenceSuitability(sample[field], preference);
    factors[field] = score;
    if (score <= 0) {
      return {
        score: 0,
        factors,
        limitingFactor: field,
        rejectionReason: field,
      };
    }
    const weight = Math.max(0.01, Number(preference.weight) || 1);
    weightedLog += Math.log(Math.max(score, 1e-4)) * weight;
    totalWeight += weight;
  }
  const environmentalFit = totalWeight > 0 ? Math.exp(weightedLog / totalWeight) : 1;
  const localFit = Number.isFinite(sample.localSuitability) ? clamp01(sample.localSuitability) : 1;
  const biomeFit = Number.isFinite(sample.biomeSuitability) ? clamp01(sample.biomeSuitability) : 1;
  factors.local = localFit;
  factors.biome = biomeFit;
  const score = clamp01(environmentalFit * localFit * biomeFit);
  const limitingFactor = Object.entries(factors)
    .sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  return {
    score,
    factors,
    limitingFactor,
    rejectionReason: score <= 0 ? (limitingFactor || 'unsuitable habitat') : null,
  };
}

export function scoreFloraHabitat(species, sample = {}) {
  return scoreFloraHabitatBreakdown(species, sample).score;
}

export function buildFloraHabitatDiagnostics({
  zoneId,
  species,
  bounds,
  habitatAt,
  placement: placementOverrides = {},
  columns = 14,
  rows = 12,
}) {
  if (!zoneId || !species || !bounds || !habitatAt) return null;
  const placement = {
    ...(species.placement || {}),
    ...placementOverrides,
  };
  const minimumSuitability = placement.minimumSuitability ?? species.habitat?.minimumSuitability ?? 0.24;
  const width = Math.max(1, columns);
  const depth = Math.max(1, rows);
  const samples = [];
  const rejectionCounts = {};
  let suitableCount = 0;

  for (let row = 0; row < depth; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = bounds.minX + ((column + 0.5) / width) * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + ((row + 0.5) / depth) * (bounds.maxZ - bounds.minZ);
      const y = terrainHeight(x, z, zoneId);
      const biome = terrainBiomeAt(x, z, y, zoneId);
      const { grade } = terrainSlopeAt(x, z, zoneId);
      const placementRejected = placement.accept && !placement.accept(biome, x, z, y, grade);
      const habitat = habitatAt({ biome, x, z, y, grade, zoneId }) || {};
      const breakdown = scoreFloraHabitatBreakdown(species, habitat);
      const rejectionReason = grade > (placement.maxGrade ?? 0.65)
        ? 'slope'
        : placementRejected
          ? 'placement mask'
          : breakdown.score < minimumSuitability
            ? breakdown.rejectionReason || breakdown.limitingFactor || 'minimum suitability'
            : null;
      const accepted = !rejectionReason;
      if (accepted) suitableCount += 1;
      else rejectionCounts[rejectionReason] = (rejectionCounts[rejectionReason] || 0) + 1;
      samples.push({
        x,
        y,
        z,
        biome,
        grade,
        score: breakdown.score,
        accepted,
        rejectionReason,
        exclusionReasons: Array.isArray(habitat.exclusionReasons) ? [...habitat.exclusionReasons] : [],
        factors: breakdown.factors,
      });
    }
  }

  return {
    speciesId: species.id,
    label: species.label,
    zoneId,
    zoneName: getRegionDisplayName(zoneId),
    bounds: { ...bounds },
    columns: width,
    rows: depth,
    minimumSuitability,
    suitableCount,
    sampleCount: samples.length,
    suitableFraction: samples.length ? suitableCount / samples.length : 0,
    rejectionCounts,
    samples,
  };
}

// Scores the annulus around an existing cohort or companion species. This is
// useful for mixed-age stands: new items can share a patch without occupying
// the same physical point as an older plant. With no companions, placement is
// left unconstrained so the helper remains additive.
export function floraCompanionSuitability(items, x, z, {
  minimumDistance = 2.5,
  preferredDistance = [4, 10],
  maximumDistance = 16,
} = {}) {
  if (!items?.length) return 1;
  const nearest = items.reduce((distance, item) => (
    Math.min(distance, Math.hypot(x - item.x, z - item.z))
  ), Infinity);
  const preferredMin = Math.max(minimumDistance, preferredDistance[0]);
  const preferredMax = Math.max(preferredMin, preferredDistance[1]);
  const maximum = Math.max(preferredMax, maximumDistance);
  if (nearest < minimumDistance || nearest > maximum) return 0;
  if (nearest < preferredMin) {
    return clamp01((nearest - minimumDistance) / Math.max(1e-6, preferredMin - minimumDistance));
  }
  if (nearest <= preferredMax) return 1;
  return clamp01((maximum - nearest) / Math.max(1e-6, maximum - preferredMax));
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
  const patchCenters = Array.from(new Set(items.map(item => item.patchIndex)))
    .map(patchIndex => {
      const patchItems = items.filter(item => item.patchIndex === patchIndex);
      return {
        patchIndex,
        x: patchItems.reduce((sum, item) => sum + item.x, 0) / patchItems.length,
        y: patchItems.reduce((sum, item) => sum + item.y, 0) / patchItems.length,
        z: patchItems.reduce((sum, item) => sum + item.z, 0) / patchItems.length,
        itemCount: patchItems.length,
      };
    });
  return {
    items,
    placementStats: {
      requestedCount: count,
      generatedCount: items.length,
      shortfallCount: Math.max(0, count - items.length),
      requestedPatchCount,
      generatedPatchCount: patchCenters.length,
      patchCenters,
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
  const diagnostics = buildFloraHabitatDiagnostics({
    zoneId,
    species,
    bounds,
    habitatAt,
    placement: placementOverrides,
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
    diagnostics: diagnostics ? { ...diagnostics, placementStats } : null,
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
  const diagnostics = buildFloraHabitatDiagnostics({
    zoneId,
    species,
    bounds,
    habitatAt,
    placement: placementOverrides,
  });
  return {
    id,
    label: species.label,
    speciesId: species.id,
    runtime,
    procedural: true,
    sites,
    placementStats,
    diagnostics: diagnostics ? { ...diagnostics, placementStats } : null,
  };
}
