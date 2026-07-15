import { currentRegionId as currentZoneId } from '../game-core/regionMaps';
import { getInitialNarration, getIslandLocation, getZoneSpecimens } from '../game-core/specimens';
import { expeditionTools } from '../game-core/tools';

const zoneSpecimenCache = new Map();

export function getThreeSpecimens(zoneId = currentZoneId) {
  if (!zoneSpecimenCache.has(zoneId)) {
    zoneSpecimenCache.set(zoneId, getZoneSpecimens(zoneId));
  }
  return zoneSpecimenCache.get(zoneId);
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
