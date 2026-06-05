import {
  FLOREANA_ZONE_IDS,
  currentZoneId,
  floreanaZones as coreFloreanaZones,
  getTravelCard,
  getZone as getCoreZone,
  getZoneExits,
  getZoneSpecimenIds,
  getZoneSpecimenSpawns,
} from '../../game-core/zones';

function toRuntimeZone(zone) {
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

export { FLOREANA_ZONE_IDS, currentZoneId, getTravelCard, getZoneExits, getZoneSpecimenIds, getZoneSpecimenSpawns };

export const floreanaZones = Object.fromEntries(
  Object.entries(coreFloreanaZones).map(([zoneId, zone]) => [zoneId, toRuntimeZone(zone)]),
);

export function getZone(zoneId = currentZoneId) {
  return toRuntimeZone(getCoreZone(zoneId));
}
