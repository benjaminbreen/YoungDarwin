import {
  FLOREANA_CENTRAL_PEAK_ID,
  FLOREANA_CHART_ASPECT,
  FLOREANA_CHART_WIDTH_KM,
  FLOREANA_MAP_PLACEMENTS,
} from '../../../game-core/floreanaGeography';

const HIDDEN_PLACEMENT_KINDS = new Set([
  'houseInterior',
  'shipInterior',
  'test',
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value, low, high) {
  if (high <= low) return value >= high ? 1 : 0;
  const t = clamp01((value - low) / (high - low));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function placementFor(regionId) {
  return FLOREANA_MAP_PLACEMENTS.find(entry => entry.id === regionId) || null;
}

// Bearing is radians clockwise from geographic north. Local region coordinates
// use +X east and +Z south, matching the cardinal border-vista axes.
export function getCentralPeakView(regionId) {
  const source = placementFor(regionId);
  const peak = placementFor(FLOREANA_CENTRAL_PEAK_ID);
  if (
    !source
    || !peak
    || source.id === peak.id
    || source.test
    || HIDDEN_PLACEMENT_KINDS.has(source.kind)
  ) return null;

  const chartHeightKm = FLOREANA_CHART_WIDTH_KM / FLOREANA_CHART_ASPECT;
  const eastKm = (peak.at[0] - source.at[0]) * FLOREANA_CHART_WIDTH_KM;
  const southKm = (peak.at[1] - source.at[1]) * chartHeightKm;
  const distanceKm = Math.hypot(eastKm, southKm);
  if (!Number.isFinite(distanceKm) || distanceKm < 0.05) return null;

  return {
    regionId,
    peakRegionId: peak.id,
    bearing: Math.atan2(eastKm, -southKm),
    bearingDegrees: Math.atan2(eastKm, -southKm) * 180 / Math.PI,
    distanceKm,
    eastKm,
    southKm,
  };
}

export function resolveCentralPeakAppearance(view, tuning) {
  if (!view) return null;
  const hazeNearKm = Math.max(0, tuning.hazeNearKm);
  const hazeFarKm = Math.max(hazeNearKm + 0.1, tuning.hazeFarKm);
  const geographicHaze = smoothstep(view.distanceKm, hazeNearKm, hazeFarKm);
  const proximity = 1 - geographicHaze;
  return {
    geographicHaze,
    proximity,
    width: lerp(52, 108, proximity) * tuning.widthScale,
    height: lerp(14, 43, proximity) * tuning.heightScale,
    contrast: lerp(tuning.nearContrast, tuning.farContrast, geographicHaze),
    baseY: -4.2 + tuning.verticalOffset,
  };
}
