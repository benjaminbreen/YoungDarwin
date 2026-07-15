// Weather state table: each discrete state maps to the continuous visual
// parameters the renderer actually consumes. The store keeps weather as a
// string (narration/LLM compatibility); everything visual reads these numbers
// through the smoothed runtime env, so transitions never pop.
// `cumulus` + `cumulusRange` drive the fair-weather puff coverage separately
// from `overcast` (deck closure): the director adds a slow deterministic wave
// scaled by cumulusRange, so a "sunny" day ranges from empty blue to a broken
// field of trade-wind cumulus without ever leaving the sunny state.
// `cumulusClump` groups puffs into a few large masses with clean blue between
// (0 = even confetti, 1 = heavily clustered); `cumulusScale` sizes individual
// puffs (<1 = fewer, bigger). Both only shape the fair-weather regime — the
// closed deck ignores them.
export const WEATHER_STATES = {
  sunny:      { overcast: 0.0,  fogDensity: 0.008, rain: 0.0,  mist: 0.0,  lightDim: 0.0,  cumulus: 0.05, cumulusRange: 0.9,  cumulusClump: 0.85, cumulusScale: 0.72, windBoost: 0.0,  frontBias: 0.0,  skyTint: '#70bef4' },
  tradeWind:  { overcast: 0.18, fogDensity: 0.009, rain: 0.0,  mist: 0.02, lightDim: 0.04, cumulus: 0.38, cumulusRange: 0.45, cumulusClump: 0.5,  cumulusScale: 0.95, windBoost: 0.55, frontBias: 0.04, skyTint: '#78c6f4' },
  marineHaze: { overcast: 0.24, fogDensity: 0.014, rain: 0.0,  mist: 0.10, lightDim: 0.12, cumulus: 0.24, cumulusRange: 0.25, cumulusClump: 0.35, cumulusScale: 1.0,  windBoost: 0.12, frontBias: 0.06, skyTint: '#9fc7d5' },
  cloudy:     { overcast: 0.46, fogDensity: 0.012, rain: 0.0,  mist: 0.05, lightDim: 0.2,  cumulus: 0.5,  cumulusRange: 0.4,  cumulusClump: 0.55, cumulusScale: 0.9,  windBoost: 0.0,  frontBias: 0.0,  skyTint: '#a5c8d9' },
  sunbreak:   { overcast: 0.38, fogDensity: 0.011, rain: 0.0,  mist: 0.07, lightDim: 0.12, cumulus: 0.55, cumulusRange: 0.28, cumulusClump: 0.65, cumulusScale: 0.82, windBoost: 0.08, frontBias: 0.0,  skyTint: '#8ccff3' },
  sunshower:  { overcast: 0.28, fogDensity: 0.010, rain: 0.22, mist: 0.04, lightDim: 0.05, cumulus: 0.45, cumulusRange: 0.3,  cumulusClump: 0.7,  cumulusScale: 0.78, windBoost: 0.1,  frontBias: 0.08, skyTint: '#7ccbf7' },
  overcast:   { overcast: 0.88, fogDensity: 0.016, rain: 0.0,  mist: 0.16, lightDim: 0.44, cumulus: 0.3,  cumulusRange: 0.2,  cumulusClump: 0.3,  cumulusScale: 1.0,  windBoost: 0.0,  frontBias: 0.0,  skyTint: '#96afbc' },
  misty:      { overcast: 0.62, fogDensity: 0.026, rain: 0.0,  mist: 0.55, lightDim: 0.30, cumulus: 0.20, cumulusRange: 0.18, cumulusClump: 0.25, cumulusScale: 1.0,  windBoost: 0.02, frontBias: 0.08, skyTint: '#b7d4dc' },
  // Garua is common highland low cloud; denseGarua is the rare whiteout.
  garua:      { overcast: 0.78, fogDensity: 0.034, rain: 0.08, mist: 0.72, lightDim: 0.42, cumulus: 0.15, cumulusRange: 0.12, cumulusClump: 0.2,  cumulusScale: 1.0,  windBoost: 0.05, frontBias: 0.12, skyTint: '#b6d0d5' },
  denseGarua: { overcast: 0.86, fogDensity: 0.050, rain: 0.04, mist: 0.95, lightDim: 0.52, cumulus: 0.10, cumulusRange: 0.10, cumulusClump: 0.2,  cumulusScale: 1.0,  windBoost: 0.02, frontBias: 0.16, skyTint: '#c2d6d8' },
  drizzle:    { overcast: 0.84, fogDensity: 0.024, rain: 0.30, mist: 0.48, lightDim: 0.48, cumulus: 0.28, cumulusRange: 0.2,  cumulusClump: 0.3,  cumulusScale: 1.0,  windBoost: 0.08, frontBias: 0.14, skyTint: '#a5bdc7' },
  rain:       { overcast: 0.98, fogDensity: 0.023, rain: 0.8,  mist: 0.24, lightDim: 0.62, cumulus: 0.4,  cumulusRange: 0.2,  cumulusClump: 0.45, cumulusScale: 0.9,  windBoost: 0.18, frontBias: 0.2,  skyTint: '#8da4b2' },
  storm:      { overcast: 1.0,  fogDensity: 0.028, rain: 1.0,  mist: 0.3,  lightDim: 0.8,  cumulus: 0.5,  cumulusRange: 0.2,  cumulusClump: 0.55, cumulusScale: 0.85, windBoost: 0.35, frontBias: 0.3,  skyTint: '#74909f' },
};

export const DEFAULT_WEATHER_STATE = 'cloudy';

const WEATHER_ALIAS_RULES = [
  ['dense garua', 'denseGarua'],
  ['densegarua', 'denseGarua'],
  ['heavy mist', 'denseGarua'],
  ['whiteout', 'denseGarua'],
  ['garua', 'garua'],
  ['trade wind', 'tradeWind'],
  ['tradewind', 'tradeWind'],
  ['windy', 'tradeWind'],
  ['wind', 'tradeWind'],
  ['marine haze', 'marineHaze'],
  ['marinehaze', 'marineHaze'],
  ['hazy', 'marineHaze'],
  ['haze', 'marineHaze'],
  ['sun break', 'sunbreak'],
  ['sunbreak', 'sunbreak'],
  ['broken cloud', 'sunbreak'],
  ['clearing', 'sunbreak'],
  ['rainbow', 'sunshower'],
  ['sun shower', 'sunshower'],
  ['sunshower', 'sunshower'],
  ['showers', 'sunshower'],
  ['shower', 'sunshower'],
  ['stormy', 'storm'],
  ['thunder', 'storm'],
  ['rainy', 'rain'],
  ['rain', 'rain'],
  ['drizzle', 'drizzle'],
  ['foggy', 'misty'],
  ['fog', 'misty'],
  ['mist', 'misty'],
  ['overcast', 'overcast'],
  ['cloudy', 'cloudy'],
  ['cloud', 'cloudy'],
  ['humid', 'cloudy'],
  ['cool', 'cloudy'],
  ['cold', 'cloudy'],
  ['hot', 'sunny'],
  ['clear', 'sunny'],
  ['sunny', 'sunny'],
  ['sun', 'sunny'],
];

export function normalizeWeatherState(value, fallback = DEFAULT_WEATHER_STATE) {
  if (value == null || value === '') return fallback;
  if (WEATHER_STATES[value]) return value;
  const text = String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = text.replace(/\s+/g, '');

  if (WEATHER_STATES[text]) return text;
  if (WEATHER_STATES[compact]) return compact;

  const direct = WEATHER_ALIAS_RULES.find(([alias]) => alias === text || alias === compact);
  if (direct) return direct[1];
  const contained = WEATHER_ALIAS_RULES.find(([alias]) => text.includes(alias) || compact.includes(alias));
  return contained ? contained[1] : fallback;
}

export function weatherProfile(weather) {
  return WEATHER_STATES[normalizeWeatherState(weather)];
}

export function isOvercastWeather(weather) {
  return weatherProfile(weather).overcast >= 0.5;
}

export function isWetWeather(weather) {
  return weatherProfile(weather).rain > 0;
}

export function weatherSkyTint(weather) {
  return WEATHER_STATES[normalizeWeatherState(weather)]?.skyTint || WEATHER_STATES.sunny.skyTint;
}
