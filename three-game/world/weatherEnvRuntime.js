// Mutable per-frame weather environment. The WeatherDirector damps these
// values toward the active weather profile; Rain, clouds, fog, and lighting
// read them every frame without touching React state.
export const weatherEnv = {
  overcast: 0,
  fogDensity: 0.011,
  rainIntensity: 0,
  mistAmount: 0,
  lightDim: 0,
  // Prevailing southeast trades: blows from SE toward NW by default.
  windX: -0.55,
  windZ: -0.83,
  windSpeed: 1,
};

// Frame-rate independent exponential approach (same idea as THREE.MathUtils.damp).
export function dampTowards(current, target, lambda, delta) {
  return target + (current - target) * Math.exp(-lambda * delta);
}
