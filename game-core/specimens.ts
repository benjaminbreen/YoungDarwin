import { baseSpecimens } from '../data/specimens';
import { getRegionMap, getRegionSpecimenSpawns, regionMaps } from './regionMaps';
import { currentZoneId, getZone, getZoneSpecimenSpawns } from './zones';
import type { SpecimenId, ZoneId, ZoneSpecimenSpawn } from './types';

export function getSpecimenById(specimenId: SpecimenId) {
  return baseSpecimens.find(specimen => specimen.id === specimenId) || null;
}

export function getZoneSpecimens(zoneId: ZoneId = currentZoneId) {
  const zoneSpawns = regionMaps[zoneId] ? [] : getZoneSpecimenSpawns(zoneId);
  const spawns = (zoneSpawns.length > 0 ? zoneSpawns : getRegionSpecimenSpawns(zoneId)) as ZoneSpecimenSpawn[];
  return spawns
    .map((spawn, index) => {
      const specimen = getSpecimenById(spawn.specimenId);
      if (!specimen) return null;
      return {
        ...specimen,
        instanceId: `${spawn.specimenId}-${index}`,
        spawnPoint: spawn.position,
        habitatRadiusX: spawn.habitatRadiusX ?? null,
        habitatRadiusZ: spawn.habitatRadiusZ ?? null,
        sceneScale: spawn.sceneScale || 1,
        behavior: spawn.behavior || 'still',
      };
    })
    .filter(Boolean);
}

export function getIslandLocation(zoneId: ZoneId = currentZoneId) {
  const region = getRegionMap(zoneId);
  const zone = regionMaps[zoneId] ? region : getZone(zoneId);
  return {
    id: zone.id || region.id,
    name: zone.name || region.name,
    island: zone.island || region.island,
    historicalName: zone.historicalName || region.historicalName,
    subtitle: zone.subtitle || region.subtitle,
    type: zone.biome || region.biome,
  };
}

export function getInitialNarration(zoneId: ZoneId = currentZoneId) {
  const zone = getZone(zoneId);
  return {
    narration: zone.narration.loadingNote || 'The boat leaves you on the black volcanic landing shelf of Post Office Bay. The Beagle rides beyond the turquoise water while Syms Covington checks the specimen bag against the ash-colored slopes of Floreana.',
    educationalNote: zone.narration.educationalNote,
    weather: zone.narration.weather,
    sounds: zone.narration.sounds || [],
  };
}
