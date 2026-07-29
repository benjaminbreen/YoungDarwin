// Mutable per-frame weather environment. The WeatherDirector damps these
// values toward the active weather profile; Rain, clouds, fog, and lighting
// read them every frame without touching React state.
export const weatherEnv = {
  overcast: 0,
  // Fair-weather cumulus coverage (0 = empty blue, 1 = broken puffy field).
  // Independent of `overcast`, which is deck/ceiling closure.
  cumulus: 0.3,
  // Macro grouping of the puff field (0 = even confetti, 1 = a few big
  // masses with clean blue between) and puff size (<1 = fewer, bigger).
  cumulusClump: 0.5,
  cumulusScale: 0.9,
  fogDensity: 0.011,
  rainIntensity: 0,
  mistAmount: 0,
  lightDim: 0,
  // Prevailing southeast trades: blows from SE toward NW by default.
  windX: -0.55,
  windZ: -0.83,
  // Surface wind is the shared physical baseline. Derived visual channels
  // below keep rain, mist, foliage, and cloud ceilings from all moving at the
  // same apparent scale.
  windSpeed: 1,
  cloudDriftSpeed: 0.32,
  mistDriftSpeed: 0.18,
  rainShearSpeed: 0.72,
  foliageWindSpeed: 0.9,
  // Shared low-frequency gust envelope, 0 (lull) to 1 (peak of a surge).
  // Every wind consumer reads THIS instead of rolling its own gust sine, so
  // hair, shrubs, grass, and blown dust all surge on the same beat. Consumers
  // still keep their own spatial phase — a gust should cross the field, not
  // strike every plant in lockstep.
  windGust: 0.5,
  // Overall foliage sway amplitude multiplier (1 = the calm baseline the
  // ecology layers were authored against). Combines surface wind and gust so
  // a single number carries "how hard is it blowing right now".
  foliageWindGain: 1,
  frontAmount: 0,
  frontDarkness: 0,
  frontProgress: 0,
};

// Canonical trade-wind yaw the ecology layers were authored against, derived
// from the default wind vector above under each field's `yaw -> (sin, -cos)`
// convention. Layers store an absolute `windYaw`, and nearly all of them sit
// within a few hundredths of this value; treating the authored number as an
// offset from this baseline preserves deliberate local channeling (headlands,
// cliff funnels) while still letting the whole island veer with the live wind.
export const BASE_WIND_YAW = Math.atan2(-0.55, 0.83);

// Resolve a layer's authored yaw against the live wind and write the unit
// direction into `target`. Allocation-free so it can be called per frame.
export function resolveLayerWindDir(target, layerWindYaw) {
  const yaw = Math.atan2(weatherEnv.windX, -weatherEnv.windZ)
    + ((layerWindYaw ?? BASE_WIND_YAW) - BASE_WIND_YAW);
  return target.set(Math.sin(yaw), -Math.cos(yaw));
}

// Frame-rate independent exponential approach (same idea as THREE.MathUtils.damp).
export function dampTowards(current, target, lambda, delta) {
  return target + (current - target) * Math.exp(-lambda * delta);
}
