// Mutable per-frame weather environment. The WeatherDirector damps these
// values toward the active weather profile; Rain, clouds, fog, and lighting
// read them every frame without touching React state.
export const weatherEnv = {
  overcast: 0,
  // Fair-weather cumulus coverage (0 = empty blue, 1 = broken puffy field).
  // Independent of `overcast`, which is deck/ceiling closure.
  cumulus: 0.3,
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
  frontAmount: 0,
  frontDarkness: 0,
  frontProgress: 0,
};

// Frame-rate independent exponential approach (same idea as THREE.MathUtils.damp).
export function dampTowards(current, target, lambda, delta) {
  return target + (current - target) * Math.exp(-lambda * delta);
}
