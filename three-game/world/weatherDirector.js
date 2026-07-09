// Island-wide weather simulation. Every region cell on Floreana carries its
// own weather state that evolves over game time, so the coast can bake in sun
// while garúa sits on the highlands and a shower works across the windward
// south. Module-level singleton: the store reads it on zone transitions and
// the WeatherDirector component ticks it from the game clock.
import { regionMaps } from '../../game-core/regionMaps';
import { DEFAULT_WEATHER_STATE, WEATHER_STATES, normalizeWeatherState, weatherProfile } from './weatherStates';

const MINUTES_PER_DAY = 24 * 60;

// Deterministic hash → [0,1). Seeded by (day, regionId, roll index) so a
// reloaded expedition replays the same skies.
function hashRandom(seedString) {
  let h = 2166136261;
  for (let i = 0; i < seedString.length; i += 1) {
    h ^= seedString.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const CLIMATE_BAND_OVERRIDES = {
  PENAL_COLONY: 'inland',
  POST_SCRUB_RISE: 'inland',
  NORTHERN_HIGHLANDS: 'inland',
  E_MID: 'inland',
  EL_MIRADOR: 'inland',
  WATKINS: 'inland',
  W_HIGH: 'highland',
  C_HIGH: 'highland',
  CORMORANT_BAY: 'coast',
  CORMORANT_BAY_SPLAT_TEST: 'coast',
  CORMORANT_BAY_TEST_2: 'coast',
  CORMORANT_BAY_TEST_3: 'coast',
  PUNTA_CORMORANT: 'coast',
  ALT_POST_OFFICE_BAY: 'coast',
  ASILO_SPRING: 'windward',
  WATKINS_CREEK: 'windward',
  MANGROVES: 'windward',
  S_INTERTIDAL: 'windward',
  S_VOLCANIC: 'windward',
  PUNTA_SUR: 'windward',
  S_WETLANDS: 'windward',
  S_REEFS: 'windward',
  SE_COAST: 'windward',
  SE_PROMONTORY: 'windward',
  SE_SHALLOW_SURF: 'windward',
};

// Climate bands. Floreana's real pattern: dry sunlit coast, mixed inland
// slopes, mist-prone highlands, and wetter windward southern cells.
function climateBand(region) {
  if (CLIMATE_BAND_OVERRIDES[region.id]) return CLIMATE_BAND_OVERRIDES[region.id];
  if (region.type === 'highland' || region.type === 'forest') return 'highland';
  if (region.type === 'wetland') return 'windward';
  if ((region.grid?.y ?? 0) >= 5) return 'windward';
  return 'coast';
}

export const WEATHER_BAND_WEIGHTS = {
  coast: {
    sunny: 34, tradeWind: 18, marineHaze: 16, cloudy: 18, sunbreak: 7,
    sunshower: 4, overcast: 3, misty: 1, garua: 0, denseGarua: 0,
    drizzle: 2, rain: 2, storm: 0.5,
  },
  inland: {
    sunny: 20, tradeWind: 10, marineHaze: 8, cloudy: 22, sunbreak: 10,
    sunshower: 3, overcast: 10, misty: 7, garua: 3, denseGarua: 0,
    drizzle: 4, rain: 2, storm: 0.5,
  },
  highland: {
    sunny: 5, tradeWind: 3, marineHaze: 3, cloudy: 19, sunbreak: 10,
    sunshower: 2, overcast: 12, misty: 16, garua: 18, denseGarua: 4,
    drizzle: 9, rain: 3, storm: 0.5,
  },
  windward: {
    sunny: 7, tradeWind: 8, marineHaze: 5, cloudy: 17, sunbreak: 8,
    sunshower: 6, overcast: 15, misty: 6, garua: 5, denseGarua: 1,
    drizzle: 16, rain: 8, storm: 2,
  },
};

// Diurnal multipliers: garúa mist belongs to the night and early morning and
// burns off through midday (faster on the coast); sun peaks midday.
function diurnalWeights(base, band, hour) {
  const midday = Math.max(0, 1 - Math.abs(hour - 13) / 6); // 1 at 13:00, 0 by 07:00/19:00
  const mistHours = hour < 9 || hour > 20 ? 1.55 : hour < 11 ? 1.0 : 0.35;
  const mistFactor = band === 'highland' ? Math.max(mistHours, 0.55) : mistHours;
  return {
    ...base,
    sunny: base.sunny * (0.55 + midday * 0.9),
    tradeWind: base.tradeWind * (0.7 + midday * 0.7),
    marineHaze: base.marineHaze * (hour < 10 || hour > 16 ? 1.15 : 0.85),
    sunbreak: base.sunbreak * (0.55 + midday * 0.8),
    sunshower: base.sunshower * (0.45 + midday * 0.8),
    misty: base.misty * mistFactor,
    garua: base.garua * mistFactor,
    denseGarua: base.denseGarua * (band === 'highland' ? mistFactor : mistFactor * 0.45),
    drizzle: base.drizzle * (band === 'highland' ? mistFactor * 0.8 + 0.4 : 1),
  };
}

function weightedPick(weights, roll) {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  let cursor = roll * total;
  for (const [state, weight] of Object.entries(weights)) {
    cursor -= weight;
    if (cursor <= 0) return state;
  }
  return 'cloudy';
}

function neighborIds(region) {
  return (region.edgeHints || [])
    .filter(hint => hint.kind === 'open' && hint.toRegionId)
    .map(hint => hint.toRegionId);
}

function authoredState(region) {
  if (!region.narration?.weatherAuthored) return null;
  return normalizeWeatherState(region.narration.weather, null);
}

function initialState(region, nowMinutes) {
  const authored = authoredState(region);
  if (authored) return authored;
  const band = climateBand(region);
  const hour = (nowMinutes / 60) % 24;
  return weightedPick(
    diurnalWeights(WEATHER_BAND_WEIGHTS[band], band, hour),
    hashRandom(`initial:${region.id}:${Math.floor(nowMinutes / MINUTES_PER_DAY)}`),
  );
}

const sim = {
  regions: null, // { [regionId]: { state, nextChangeAt, rollIndex } }
  lastMinutes: 0,
};

function ensureSim(nowMinutes) {
  if (sim.regions) return;
  sim.regions = {};
  sim.lastMinutes = nowMinutes;
  Object.values(regionMaps).forEach(region => {
    sim.regions[region.id] = {
      state: initialState(region, nowMinutes),
      nextChangeAt: nowMinutes + 30 + hashRandom(`init:${region.id}`) * 150,
      rollIndex: 0,
    };
  });
}

function rollNextState(region, entry, nowMinutes) {
  const band = climateBand(region);
  const hour = (nowMinutes / 60) % 24;
  const day = Math.floor(nowMinutes / MINUTES_PER_DAY);
  entry.rollIndex += 1;
  const seed = `${day}:${region.id}:${entry.rollIndex}`;

  // Spatial coherence: a third of the time, adopt a neighbour's weather so
  // fronts move across the island instead of every cell rolling alone.
  const neighbors = neighborIds(region);
  if (neighbors.length && hashRandom(`${seed}:coherence`) < 0.34) {
    const pick = neighbors[Math.floor(hashRandom(`${seed}:neighbor`) * neighbors.length) % neighbors.length];
    const neighborEntry = sim.regions[pick];
    const neighborState = normalizeWeatherState(neighborEntry?.state, null);
    if (neighborState && WEATHER_STATES[neighborState]) return neighborState;
  }

  const weights = diurnalWeights(WEATHER_BAND_WEIGHTS[band], band, hour);
  const currentState = normalizeWeatherState(entry.state, DEFAULT_WEATHER_STATE);
  // Persistence: the current state keeps extra weight so weather lingers
  // rather than strobing through the table.
  const persistence = currentState === 'storm'
    ? 1.2
    : ['misty', 'garua', 'denseGarua'].includes(currentState) ? 1.35 : 1.55;
  if (weights[currentState] != null) weights[currentState] *= persistence;
  // Storms only build out of already-wet skies.
  if (weatherProfile(currentState).rain === 0 && currentState !== 'overcast') weights.storm = 0;
  return weightedPick(weights, hashRandom(`${seed}:state`));
}

// Advance the whole island to `nowMinutes` (absolute game minutes:
// day * 1440 + timeOfDay * 60). Cheap — a few dozen entries, string hashes
// only when a region is actually due for a change.
export function tickWeatherSim(nowMinutes) {
  ensureSim(nowMinutes);
  sim.lastMinutes = nowMinutes;
  Object.values(regionMaps).forEach(region => {
    const entry = sim.regions[region.id];
    while (entry.nextChangeAt <= nowMinutes) {
      entry.state = rollNextState(region, entry, entry.nextChangeAt);
      entry.nextChangeAt += 45 + hashRandom(`dur:${region.id}:${entry.rollIndex}`) * 135;
    }
  });
}

export function getRegionWeather(regionId, nowMinutes = sim.lastMinutes) {
  ensureSim(nowMinutes);
  return sim.regions[regionId]?.state || null;
}

export function getRegionClimateBand(regionId) {
  const region = regionMaps[regionId];
  return region ? climateBand(region) : 'coast';
}

// Dev/debug hook: force a state for the current zone (used by the perf panel).
export function forceRegionWeather(regionId, state, holdMinutes = 240) {
  ensureSim(sim.lastMinutes);
  const entry = sim.regions[regionId];
  const normalized = normalizeWeatherState(state, null);
  if (!entry || !normalized || !WEATHER_STATES[normalized]) return;
  entry.state = normalized;
  entry.nextChangeAt = sim.lastMinutes + holdMinutes;
}
