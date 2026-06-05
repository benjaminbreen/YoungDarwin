import { currentZoneId } from '../game-core/zones';
import { getInitialNarration, getIslandLocation, getZoneSpecimens } from '../game-core/specimens';
import { expeditionTools } from '../game-core/tools';

export function getThreeSpecimens(zoneId = currentZoneId) {
  return getZoneSpecimens(zoneId);
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
