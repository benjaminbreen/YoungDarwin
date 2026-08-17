import { currentRegionId as currentZoneId } from '../game-core/regionMaps';
import { getInitialNarration, getIslandLocation, getZoneSpecimens } from '../game-core/specimens';
import { expeditionTools } from '../game-core/tools';

const zoneSpecimenCache = new Map();
const zoneSpecimenTypeCache = new Map();

export function getThreeSpecimens(zoneId = currentZoneId) {
  if (!zoneSpecimenCache.has(zoneId)) {
    zoneSpecimenCache.set(zoneId, getZoneSpecimens(zoneId));
  }
  return zoneSpecimenCache.get(zoneId);
}

// The distinct kinds in a region, not the spawn instances. Punta Cormorant has
// eight spawns of three species, so counting instances made "1 of 3 species
// recorded" read as "5 of 8" the moment the first flamingo was written up.
// Progress counters must use this; anything placing actors wants the instances.
export function getThreeSpecimenTypeIds(zoneId = currentZoneId) {
  if (!zoneSpecimenTypeCache.has(zoneId)) {
    zoneSpecimenTypeCache.set(zoneId, [...new Set(getThreeSpecimens(zoneId).map(specimen => specimen.id))]);
  }
  return zoneSpecimenTypeCache.get(zoneId);
}

// Fieldwork done in one region, shared by the HUD's field-record panel and the
// island chart so the two never disagree. Documented specimens count alongside
// collected ones: the objectives and `questComplete` treat them as equivalent.
export function zoneSpecimenProgress(zoneId, collectedSpecimenIds, documentedSpecimenIds) {
  const types = getThreeSpecimenTypeIds(zoneId) || [];
  const recorded = new Set([
    ...(collectedSpecimenIds || []),
    ...(documentedSpecimenIds || []),
  ]);
  return {
    total: types.length,
    recorded: types.filter(id => recorded.has(id)).length,
  };
}

export const threeSpecimens = getThreeSpecimens();

export const threeTools = expeditionTools.map(tool => (
  tool.id === 'sketch' ? { ...tool, icon: '✒️' } : tool
));

export function getThreeIslandLocation(zoneId = currentZoneId) {
  return getIslandLocation(zoneId);
}

export function getThreeInitialNarration(zoneId = currentZoneId) {
  return getInitialNarration(zoneId);
}

export const islandLocation = getThreeIslandLocation();
export const initialNarration = getThreeInitialNarration();
