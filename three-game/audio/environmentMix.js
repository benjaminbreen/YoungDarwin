const AUTHORED_COASTAL_ZONE_IDS = new Set([
  'post-office-bay-anchorage',
  'POST_OFFICE_BAY',
  'POST_OFFICE_BAY_3',
  'ALT_POST_OFFICE_BAY',
  'CORMORANT_BAY',
  'BLACK_BEACH',
  'PUNTA_SUR',
  'SE_COAST',
]);

const INTERIOR_BIOMES = new Set([
  'cabin',
  'governorshouse',
  'governorslibrary',
  'houseinterior',
  'interior',
  'mailbarrel',
  'office',
  'shipinterior',
]);

const COASTAL_BIOME_PATTERN = /ocean|reef|beach|shore|coast|intertidal|promontory|bay|cove|anchorage|shipwreck/;
const DRY_BIOME_PATTERN = /scrub|lava|grass|clearing|settlement|camp|hut|cliff|beach|bay|cove|coastaltrail/;
const WET_OR_HIGH_BIOME_PATTERN = /ocean|reef|water|wetland|mangrove|forest|highland|spring|creek|intertidal|interior|house|cabin/;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function zoneDescriptor(zone) {
  return [zone?.id, zone?.name, zone?.biome, zone?.terrainPreset]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isInteriorAmbienceZone(zone) {
  const biome = String(zone?.biome || zone?.type || '').trim().toLowerCase();
  if (INTERIOR_BIOMES.has(biome)) return true;
  // Use complete preset segments only as a fallback. A broad `/office/`
  // match previously classified `post-office-scrub-rise` as an interior and
  // silently removed every outdoor bed from that playable region.
  const preset = String(zone?.terrainPreset || zone?.terrain?.preset || '').trim().toLowerCase();
  return /(^|[-_])(interior|cabin|cabins)([-_]|$)/.test(preset)
    || /^placeholder-(office|governorshouse|governorslibrary|mailbarrel)$/.test(preset);
}

export function oceanBoundaryEdges(zone) {
  return (zone?.edgeHints || [])
    .filter(hint => hint?.kind === 'blocked' && hint?.boundaryKind === 'ocean')
    .map(hint => hint.edge)
    .filter(Boolean);
}

export function zoneHasDirectCoast(zone) {
  if (!zone || isInteriorAmbienceZone(zone)) return false;
  return AUTHORED_COASTAL_ZONE_IDS.has(zone.id)
    || oceanBoundaryEdges(zone).length > 0
    || COASTAL_BIOME_PATTERN.test(zoneDescriptor(zone));
}

export function distanceToOceanBoundary(position, zone) {
  if (!position || !zone) return Infinity;
  const width = Math.max(1, Number(zone.terrainWidth || zone.terrainSize) || 1);
  const depth = Math.max(1, Number(zone.terrainDepth || zone.terrainSize) || 1);
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const x = Number(position.x) || 0;
  const z = Number(position.z) || 0;
  const distances = oceanBoundaryEdges(zone).map(edge => {
    if (edge === 'north') return z + halfDepth;
    if (edge === 'south') return halfDepth - z;
    if (edge === 'east') return halfWidth - x;
    if (edge === 'west') return x + halfWidth;
    return Infinity;
  });
  return distances.length ? Math.max(0, Math.min(...distances)) : Infinity;
}

function zoneHasCoastalNeighbor(zone, resolveZone) {
  if (!zone || typeof resolveZone !== 'function') return false;
  return (zone.neighbors || []).some(neighbor => {
    const neighborId = neighbor?.zoneId || neighbor?.toRegionId;
    return neighborId && zoneHasDirectCoast(resolveZone(neighborId));
  });
}

export function surfPresenceForZone({
  zone,
  position,
  resolveZone,
  shorelineDistance = null,
} = {}) {
  if (!zone || isInteriorAmbienceZone(zone)) return 0;
  if (Number.isFinite(shorelineDistance)) {
    const nearShore = 1 - smoothstep(7, 105, Math.max(0, shorelineDistance));
    return 0.14 + nearShore * 0.86;
  }
  if (zoneHasDirectCoast(zone)) {
    const edgeDistance = distanceToOceanBoundary(position, zone);
    if (Number.isFinite(edgeDistance)) {
      const nearShore = 1 - smoothstep(5, 90, edgeDistance);
      return 0.14 + nearShore * 0.86;
    }
    // Some authored bays place water inside the terrain rather than at an
    // outer route edge. Keep them coastal without pretending a precise line.
    return 0.38;
  }
  // One region inland, surf should be atmosphere rather than silence.
  return zoneHasCoastalNeighbor(zone, resolveZone) ? 0.035 : 0;
}

export function dryInsectHabitat(zone) {
  if (!zone || isInteriorAmbienceZone(zone)) return false;
  // Biome is authoritative here. Region ids and asset presets often contain
  // route names such as "highlands" or "post-office" that do not describe
  // the ground-level habitat actually being rendered.
  const habitat = String(zone.biome || zone.type || zone.terrainPreset || zone.name || '').toLowerCase();
  return DRY_BIOME_PATTERN.test(habitat) && !WET_OR_HIGH_BIOME_PATTERN.test(habitat);
}

function insectTimeActivity(timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  // A broad quiet daytime floor with smooth dawn/dusk shoulders. Night
  // returns 1 across midnight instead of dropping after the evening chorus.
  const daylight = smoothstep(5.1, 7, hour) * (1 - smoothstep(17.1, 18.6, hour));
  return 1 - daylight * 0.72;
}

export function diurnalBirdCallsAllowed({ timeOfDay = 12, rainIntensity = 0 } = {}) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  const daylight = hour >= 5.35 && hour <= 19.25;
  // Rain particles become visible at 0.005. Keep a tiny hysteresis margin so
  // a passing numerical trace does not continually reopen the call scheduler.
  return daylight && clamp01(rainIntensity) < 0.008;
}

export function nocturnalOwlCallsAllowed({ timeOfDay = 12, rainIntensity = 0 } = {}) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  const night = hour >= 17.75 || hour <= 6.15;
  return night && clamp01(rainIntensity) < 0.008;
}

function interiorEnvironmentalAudioTargets({ zone, weather = {}, timeOfDay = 12, gust = 1 }) {
  const windStrength = clamp01((Number(weather.windSpeed) - 0.45) / 1.35);
  const rainIntensity = clamp01(weather.rainIntensity);
  const rainResponse = smoothstep(0.02, 0.18, rainIntensity);
  if (zone?.id === 'BEAGLE_CABIN') {
    return {
      surf: 0.075,
      wind: (0.008 + windStrength * 0.035) * Math.max(0.75, Number(gust) || 1),
      rain: rainResponse * (0.022 + Math.sqrt(rainIntensity) * 0.085),
      insects: 0,
      occlusion: 0.78,
    };
  }
  if (zone?.id === 'LAWSON_HOUSE') {
    const nightActivity = insectTimeActivity(timeOfDay);
    return {
      surf: 0,
      wind: (0.006 + windStrength * 0.028) * Math.max(0.75, Number(gust) || 1),
      rain: rainResponse * (0.026 + Math.sqrt(rainIntensity) * 0.105),
      insects: rainIntensity < 0.025 ? 0.008 * nightActivity : 0,
      occlusion: 0.7,
    };
  }
  return { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0.75 };
}

export function computeEnvironmentalAudioTargets({
  zone,
  position,
  resolveZone,
  shorelineDistance = null,
  weather = {},
  timeOfDay = 12,
  gust = 1,
} = {}) {
  if (!zone) return { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0 };
  if (isInteriorAmbienceZone(zone)) {
    return interiorEnvironmentalAudioTargets({ zone, weather, timeOfDay, gust });
  }

  const windStrength = clamp01((Number(weather.windSpeed) - 0.45) / 1.35);
  const rainIntensity = clamp01(weather.rainIntensity);
  const surfPresence = surfPresenceForZone({ zone, position, resolveZone, shorelineDistance });
  const surf = surfPresence > 0
    // The source is a naturally dynamic field recording (its rolling body is
    // much quieter than each crest). A square-root response keeps that body
    // audible on coastal maps and faintly audible one map inland without
    // flattening the recording or making the crests unnaturally constant.
    ? (0.045 + Math.sqrt(surfPresence) * 0.385) * (0.94 + windStrength * 0.12)
    : 0;
  const wind = (0.018 + windStrength * 0.115) * Math.max(0.72, Number(gust) || 1);
  // The field recording sits around -23 LUFS before runtime gain. The old
  // response squared away most of a shower twice (a long smoothstep followed
  // by a small gain), leaving visible drizzle near -50 LUFS at the output.
  // Let the bed arrive gently through garua, but make a real shower clearly
  // audible; the recording's own dynamics still provide the fine variation.
  const rainResponse = smoothstep(0.02, 0.18, rainIntensity);
  const rain = rainResponse * (0.055 + Math.sqrt(rainIntensity) * 0.3);
  const insectWeather = (1 - smoothstep(0.025, 0.36, rainIntensity))
    * (1 - windStrength * 0.35);
  const insects = dryInsectHabitat(zone)
    ? (0.045 + insectTimeActivity(timeOfDay) * 0.1) * insectWeather
    : 0;

  return { surf, wind, rain, insects, occlusion: 0 };
}
