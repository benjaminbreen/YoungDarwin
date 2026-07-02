// Weather state table: each discrete state maps to the continuous visual
// parameters the renderer actually consumes. The store keeps weather as a
// string (narration/LLM compatibility); everything visual reads these numbers
// through the smoothed runtime env, so transitions never pop.
export const WEATHER_STATES = {
  sunny:    { overcast: 0.0,  fogDensity: 0.008, rain: 0.0,  mist: 0.0,  lightDim: 0.0,  skyTint: '#70bef4' },
  cloudy:   { overcast: 0.46, fogDensity: 0.012, rain: 0.0,  mist: 0.05, lightDim: 0.2,  skyTint: '#a5c8d9' },
  sunshower: { overcast: 0.28, fogDensity: 0.010, rain: 0.22, mist: 0.04, lightDim: 0.05, skyTint: '#7ccbf7' },
  overcast: { overcast: 0.88, fogDensity: 0.016, rain: 0.0,  mist: 0.16, lightDim: 0.44, skyTint: '#96afbc' },
  // Garúa: the cool-season inversion mist that drapes the Galápagos highlands.
  // Density 0.05 ≈ 35–40m visibility: a genuine whiteout, not a grey day.
  misty:    { overcast: 0.8,  fogDensity: 0.05,  rain: 0.0, mist: 1.0,  lightDim: 0.45, skyTint: '#b9d7de' },
  drizzle:  { overcast: 0.84, fogDensity: 0.026, rain: 0.32, mist: 0.52, lightDim: 0.48, skyTint: '#a5bdc7' },
  rain:     { overcast: 0.98, fogDensity: 0.023, rain: 0.8,  mist: 0.24, lightDim: 0.62, skyTint: '#8da4b2' },
  storm:    { overcast: 1.0,  fogDensity: 0.028, rain: 1.0, mist: 0.3,  lightDim: 0.8,  skyTint: '#74909f' },
};

export const DEFAULT_WEATHER_STATE = 'cloudy';

export function weatherProfile(weather) {
  return WEATHER_STATES[weather] || WEATHER_STATES[DEFAULT_WEATHER_STATE];
}

export function isOvercastWeather(weather) {
  return weatherProfile(weather).overcast >= 0.5;
}

export function isWetWeather(weather) {
  return weatherProfile(weather).rain > 0;
}

export function weatherSkyTint(weather) {
  return WEATHER_STATES[weather]?.skyTint || WEATHER_STATES.sunny.skyTint;
}
