import { WEATHER_STATES, normalizeWeatherState } from './weatherStates';

// Derived "notable condition" callout for the objective banner.
//
// The weather model itself is optical — cloud deck, rain, mist, wind — and
// carries no temperature or humidity channel. Rather than bolt a thermal
// simulation onto it, this reads a condition off what the model already knows
// plus the two things that decide how a Galapagos day actually feels: the hour
// and whether you are standing on bare lava or in the highland cloud belt.
//
// Only the single most notable condition is returned. The banner is narrow,
// and a stack of badges reads as a status effect list rather than a remark
// about the weather.

// Biome strings are authored free text across the region maps, so match on
// keywords rather than an enum that does not exist.
const HUMID_BIOME = /highland|humid|forest|wetland|garua|interior/i;
const EXPOSED_BIOME = /lava|scrub|basalt|beach|cliff|volcanic|water-edge/i;

// Mirrors the surface wind target in WeatherDirector. Kept as a pure function
// of the profile so the HUD never has to read the mutable per-frame env.
export function profileSurfaceWind(profile) {
  return 0.55 + profile.overcast * 0.18 + profile.rain * 0.65 + (profile.windBoost || 0);
}

const CONDITIONS = [
  {
    id: 'squall',
    label: 'Squall',
    note: 'Rain driven near sideways. Footing and sightlines both suffer.',
    test: ({ profile }) => profile.rain >= 0.75,
  },
  {
    id: 'gusty',
    label: 'Gusty',
    note: 'The trades are up. Open ground offers nothing to shelter behind.',
    test: ({ profile }) => profileSurfaceWind(profile) >= 1.05,
  },
  {
    id: 'hot',
    label: 'Hot',
    note: 'Equatorial sun on bare rock, with no shade worth the name.',
    test: ({ profile, hour, exposed }) => (
      exposed
      && profile.rain === 0
      && profile.lightDim < 0.2
      && profile.overcast < 0.5
      && hour >= 10
      && hour < 16
    ),
  },
  {
    id: 'cold',
    label: 'Cold',
    note: 'Damp highland air with the sun off it. Wet clothes stay wet.',
    test: ({ profile, hour, humid }) => (
      humid && profile.mist >= 0.4 && (hour < 7 || hour >= 18.5)
    ),
  },
  {
    id: 'humid',
    label: 'Humid',
    note: 'Saturated garúa air. Paper curls and nothing dries.',
    test: ({ profile, humid }) => profile.mist >= 0.45 || (humid && profile.rain > 0),
  },
];

// Returns `{ id, label, note }` for the dominant condition, or null when the
// day is unremarkable — which is most days, and deliberately so. A badge that
// is always lit stops being information.
export function fieldConditionFor({ weather, timeOfDay = 12, zone } = {}) {
  const profile = WEATHER_STATES[normalizeWeatherState(weather)];
  if (!profile) return null;
  const biome = String(zone?.biome || '');
  const context = {
    profile,
    hour: Number(timeOfDay) || 0,
    humid: HUMID_BIOME.test(biome),
    exposed: EXPOSED_BIOME.test(biome) || !HUMID_BIOME.test(biome),
  };
  const match = CONDITIONS.find(condition => condition.test(context));
  return match ? { id: match.id, label: match.label, note: match.note } : null;
}
