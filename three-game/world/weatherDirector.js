// Island-wide weather simulation. Every region cell on Floreana carries its
// own weather state that evolves over game time, so the coast can bake in sun
// while garúa sits on the highlands and a shower works across the windward
// south. Module-level singleton: the store reads it on zone transitions and
// the WeatherDirector component ticks it from the game clock.
import { regionMaps } from '../../game-core/regionMaps';
import { WEATHER_STATES } from './weatherStates';

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

// Climate bands. Floreana's real pattern: dry sunlit coast, mist-prone
// humid highlands, wetter windward (southern) side. Tuned "gameplay-varied":
// wet states show up often enough to be seen in a normal session.
function climateBand(region) {
  if (region.type === 'highland' || region.type === 'forest') return 'highland';
  if (region.type === 'wetland') return 'windward';
  if ((region.grid?.y ?? 0) >= 2) return 'windward';
  return 'coast';
}

const BAND_WEIGHTS = {
  coast:    { sunny: 38, cloudy: 24, sunshower: 8, overcast: 8, misty: 4, drizzle: 8, rain: 12, storm: 6 },
  highland: { sunny: 6, cloudy: 16, sunshower: 4, overcast: 10, misty: 32, drizzle: 18, rain: 14, storm: 4 },
  windward: { sunny: 8, cloudy: 16, sunshower: 6, overcast: 14, misty: 6, drizzle: 18, rain: 26, storm: 12 },
};

// Diurnal multipliers: garúa mist belongs to the night and early morning and
// burns off through midday (faster on the coast); sun peaks midday.
function diurnalWeights(base, band, hour) {
  const midday = Math.max(0, 1 - Math.abs(hour - 13) / 6); // 1 at 13:00, 0 by 07:00/19:00
  const mistHours = hour < 9 || hour > 20 ? 1.8 : hour < 11 ? 1.0 : 0.35;
  const mistFactor = band === 'highland' ? Math.max(mistHours, 0.7) : mistHours;
  return {
    ...base,
    sunny: base.sunny * (0.55 + midday * 0.9),
    sunshower: base.sunshower * (0.45 + midday * 0.8),
    misty: base.misty * mistFactor,
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

function initialState(region) {
  return region.narration?.weather && WEATHER_STATES[region.narration.weather]
    ? region.narration.weather
    : climateBand(region) === 'highland' ? 'misty' : 'sunny';
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
      state: initialState(region),
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
    if (neighborEntry && WEATHER_STATES[neighborEntry.state]) return neighborEntry.state;
  }

  const weights = diurnalWeights(BAND_WEIGHTS[band], band, hour);
  // Persistence: the current state keeps extra weight so weather lingers
  // rather than strobing through the table.
  if (weights[entry.state] != null) weights[entry.state] *= 2.2;
  // Storms only build out of already-wet skies.
  if (WEATHER_STATES[entry.state].rain === 0 && entry.state !== 'overcast') weights.storm = 0;
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
  if (!entry || !WEATHER_STATES[state]) return;
  entry.state = state;
  entry.nextChangeAt = sim.lastMinutes + holdMinutes;
}
