import { baseSpecimens } from '../data/specimens';
import { currentZoneId, getZone, getZoneSpecimenSpawns } from './zones';
import type { SpecimenId, ZoneId } from './types';

export function getSpecimenById(specimenId: SpecimenId) {
  return baseSpecimens.find(specimen => specimen.id === specimenId) || null;
}

export function getZoneSpecimens(zoneId: ZoneId = currentZoneId) {
  const spawns = getZoneSpecimenSpawns(zoneId);
  return spawns
    .map(spawn => {
      const specimen = getSpecimenById(spawn.specimenId);
      if (!specimen) return null;
      return {
        ...specimen,
        spawnPoint: spawn.position,
        sceneScale: spawn.sceneScale || 1,
        behavior: spawn.behavior || 'still',
      };
    })
    .filter(Boolean);
}

export function getIslandLocation(zoneId: ZoneId = currentZoneId) {
  const zone = getZone(zoneId);
  return {
    id: zone.id,
    name: zone.name,
    island: zone.island,
    historicalName: zone.historicalName,
    subtitle: zone.subtitle,
    type: zone.biome,
  };
}

export function getInitialNarration(zoneId: ZoneId = currentZoneId) {
  const zone = getZone(zoneId);
  return {
    narration: 'The boat leaves you on the black volcanic landing shelf of Post Office Bay. The Beagle rides beyond the turquoise water while Syms Covington checks the specimen bag against the ash-colored slopes of Floreana.',
    educationalNote: zone.narration.educationalNote,
    weather: zone.narration.weather,
    sounds: zone.narration.sounds || [],
  };
}
