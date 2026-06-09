import {
  FLOREANA_ZONE_IDS,
  floreanaZones as coreFloreanaZones,
  getTravelCard,
  getZone as getCoreZone,
  getZoneExits,
  getZoneSpecimenIds,
  getZoneSpecimenSpawns,
} from '../../game-core/zones';
import { currentRegionId, getRegionMap, getRegionTravelCard, regionMaps } from '../../game-core/regionMaps';

export const currentZoneId = currentRegionId;

function regionExitToZoneExit(hint) {
  return {
    zoneId: hint.toRegionId,
    label: hint.label,
    exit: hint.edge,
    edge: hint.edge,
    minutes: hint.minutes,
    fatigue: hint.fatigue,
    note: hint.description,
  };
}

function toRuntimeZone(zone) {
  if (!zone) return toRuntimeRegion(getRegionMap(currentRegionId));
  const specimenSpawns = Object.fromEntries(
    zone.specimens.map(spawn => [spawn.specimenId, spawn.position]),
  );
  const specimenBehaviors = Object.fromEntries(
    zone.specimens.map(spawn => [spawn.specimenId, spawn.behavior || 'still']),
  );

  return {
    ...zone,
    terrainPreset: zone.terrain.preset,
    bounds: zone.terrain.bounds,
    terrainSize: zone.terrain.size,
    terrainSegments: zone.terrain.segments,
    neighbors: zone.exits,
    specimens: zone.specimens.map(spawn => spawn.specimenId),
    specimenSpawns,
    specimenBehaviors,
    weather: zone.narration.weather,
    sounds: zone.narration.sounds,
    educationalNote: zone.narration.educationalNote,
    loadingNote: zone.narration.loadingNote,
    travelCost: {
      minutes: 0,
      fatigue: 0,
    },
  };
}

function toRuntimeRegion(region) {
  const specimenSpawns = Object.fromEntries(
    region.specimens.map(spawn => [spawn.specimenId, spawn.position]),
  );
  const specimenBehaviors = Object.fromEntries(
    region.specimens.map(spawn => [spawn.specimenId, spawn.behavior || 'still']),
  );

  return {
    id: region.id,
    name: region.name,
    shortName: region.shortName,
    island: region.island,
    historicalName: region.historicalName,
    subtitle: region.subtitle,
    biome: region.biome,
    terrain: region.terrain,
    terrainPreset: region.terrain.preset,
    bounds: Math.min(region.terrain.width, region.terrain.depth) * 0.48,
    terrainSize: Math.max(region.terrain.width, region.terrain.depth),
    terrainWidth: region.terrain.width,
    terrainDepth: region.terrain.depth,
    terrainSegments: region.terrain.segments,
    edgeHints: region.edgeHints,
    neighbors: region.edgeHints.filter(hint => hint.kind === 'open').map(regionExitToZoneExit),
    specimens: region.specimens.map(spawn => spawn.specimenId),
    specimenSpawns,
    specimenBehaviors,
    npcs: region.npcs,
    discoveries: region.discoveries,
    notableFeatures: region.notableFeatures,
    localCellIds: [region.id],
    defaultLocalCellId: region.id,
    playerStart: region.playerStart,
    weather: region.narration.weather,
    sounds: region.narration.sounds,
    educationalNote: region.narration.educationalNote,
    loadingNote: region.narration.loadingNote,
    travelCost: {
      minutes: 0,
      fatigue: 0,
    },
  };
}

export { FLOREANA_ZONE_IDS, getTravelCard, getZoneExits, getZoneSpecimenIds, getZoneSpecimenSpawns };

export const floreanaZones = Object.fromEntries(
  [
    ...Object.entries(coreFloreanaZones).map(([zoneId, zone]) => [zoneId, toRuntimeZone(zone)]),
    ...Object.entries(regionMaps).map(([regionId, region]) => [regionId, toRuntimeRegion(region)]),
  ],
);

export function getZone(zoneId = currentZoneId) {
  if (regionMaps[zoneId]) return toRuntimeRegion(getRegionMap(zoneId));
  return toRuntimeZone(getCoreZone(zoneId));
}

export function getTravelCardForRoute(fromZoneId, toZoneId) {
  return getRegionTravelCard(fromZoneId, toZoneId) || getTravelCard(fromZoneId, toZoneId);
}
