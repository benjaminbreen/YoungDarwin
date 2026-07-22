const INTERNAL_COASTAL_ZONE_IDS = new Set([
  'POST_OFFICE_BAY',
  'POST_OFFICE_BAY_3',
  'ALT_POST_OFFICE_BAY',
  'CORMORANT_BAY',
  'BLACK_BEACH',
  'PUNTA_SUR',
]);

const COASTAL_BIOME_PATTERN = /ocean|reef|beach|shore|coastal|intertidal|promontory/;
const DRY_BIOME_PATTERN = /scrub|lava|grass|clearing|settlement|camp|hut|cliff|beach|bay/;
const WET_OR_HIGH_BIOME_PATTERN = /ocean|reef|water|wetland|mangrove|forest|highland|spring|creek|interior|house|cabin/;

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
  const habitat = [zone?.biome, zone?.terrainPreset]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /interior|house|cabin|office/.test(habitat);
}

export function oceanBoundaryEdges(zone) {
  return (zone?.edgeHints || [])
    .filter(hint => hint?.kind === 'blocked' && hint?.boundaryKind === 'ocean')
    .map(hint => hint.edge)
    .filter(Boolean);
}

export function zoneHasDirectCoast(zone) {
  if (!zone || isInteriorAmbienceZone(zone)) return false;
  return INTERNAL_COASTAL_ZONE_IDS.has(zone.id)
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
  const descriptor = zoneDescriptor(zone);
  return DRY_BIOME_PATTERN.test(descriptor) && !WET_OR_HIGH_BIOME_PATTERN.test(descriptor);
}

function insectTimeActivity(timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  if (hour >= 17.5 && hour < 22) return 1;
  if (hour >= 7 && hour < 17.5) return 0.72;
  if (hour >= 22 || hour < 4.5) return 0.55;
  return 0.36;
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
  if (!zone || isInteriorAmbienceZone(zone)) {
    return { surf: 0, wind: 0, rain: 0, insects: 0 };
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
  const rainResponse = smoothstep(0.015, 0.82, rainIntensity);
  const rain = rainResponse * (0.055 + Math.sqrt(rainIntensity) * 0.155);
  const insectWeather = (1 - smoothstep(0.025, 0.36, rainIntensity))
    * (1 - windStrength * 0.35);
  const insects = dryInsectHabitat(zone)
    ? (0.045 + insectTimeActivity(timeOfDay) * 0.035) * insectWeather
    : 0;

  return { surf, wind, rain, insects };
}
