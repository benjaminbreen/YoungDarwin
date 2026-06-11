// Weather state table: each discrete state maps to the continuous visual
// parameters the renderer actually consumes. The store keeps weather as a
// string (narration/LLM compatibility); everything visual reads these numbers
// through the smoothed runtime env, so transitions never pop.
export const WEATHER_STATES = {
  sunny:    { overcast: 0.0,  fogDensity: 0.010, rain: 0.0, mist: 0.0,  lightDim: 0.0,  skyTint: '#78bdf6' },
  cloudy:   { overcast: 0.55, fogDensity: 0.013, rain: 0.0, mist: 0.08, lightDim: 0.3,  skyTint: '#9fc1d4' },
  overcast: { overcast: 0.92, fogDensity: 0.015, rain: 0.0, mist: 0.14, lightDim: 0.5,  skyTint: '#93aebd' },
  // Garúa: the cool-season inversion mist that drapes the Galápagos highlands.
  misty:    { overcast: 0.8,  fogDensity: 0.026, rain: 0.0, mist: 1.0,  lightDim: 0.45, skyTint: '#b9d7de' },
  drizzle:  { overcast: 0.88, fogDensity: 0.020, rain: 0.3, mist: 0.5,  lightDim: 0.5,  skyTint: '#a3bcc8' },
  rain:     { overcast: 1.0,  fogDensity: 0.022, rain: 0.8, mist: 0.22, lightDim: 0.65, skyTint: '#8da4b2' },
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
