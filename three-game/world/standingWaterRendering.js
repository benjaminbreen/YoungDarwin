import { getRegionDefinition } from './regions';

const DEFAULT_GLOBAL_WATER_SUPPRESSION = Object.freeze({
  fadeStart: 0.34,
  fadeEnd: 0.78,
  rippleCutoff: 0.18,
});

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function standingWaterMaskAt(x, z, zoneId) {
  const maskFn = getRegionDefinition(zoneId)?.terrain?.standingWaterMask;
  return maskFn ? clamp(maskFn(x, z)) : 0;
}

export function standingWaterSuppressionMaskAt(x, z, zoneId) {
  const terrain = getRegionDefinition(zoneId)?.terrain;
  const maskFn = terrain?.standingWaterSuppressionMask || terrain?.standingWaterMask;
  return maskFn ? clamp(maskFn(x, z)) : 0;
}

export function getStandingWaterRenderingConfig(zoneId) {
  const terrain = getRegionDefinition(zoneId)?.terrain || {};
  const rendering = terrain.standingWaterRendering || {};
  const suppression = rendering.globalWaterSuppression || {};

  const fadeStart = clamp(
    finiteNumber(suppression.fadeStart, DEFAULT_GLOBAL_WATER_SUPPRESSION.fadeStart),
    0,
    0.999,
  );
  const fadeEnd = clamp(
    Math.max(
      fadeStart + 0.001,
      finiteNumber(suppression.fadeEnd, DEFAULT_GLOBAL_WATER_SUPPRESSION.fadeEnd),
    ),
    fadeStart + 0.001,
    1,
  );
  const rippleCutoff = clamp(
    finiteNumber(
      suppression.rippleCutoff ?? rendering.oceanRippleMaskCutoff,
      DEFAULT_GLOBAL_WATER_SUPPRESSION.rippleCutoff,
    ),
  );

  return {
    globalWaterSuppression: {
      fadeStart,
      fadeEnd,
    },
    oceanRippleMaskCutoff: rippleCutoff,
  };
}
