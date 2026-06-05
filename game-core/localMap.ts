import { getCellById, estimateRouteTravel } from '../utils/locationSystem';
import { getZone } from './zones';
import type { LocalCellId, ZoneId } from './types';

export function getLocalCellsForZone(zoneId: ZoneId) {
  const zone = getZone(zoneId);
  return zone.localCellIds
    .map(cellId => getCellById(cellId))
    .filter(Boolean);
}

export function getDefaultLocalCell(zoneId: ZoneId) {
  return getCellById(getZone(zoneId).defaultLocalCellId);
}

export function getLocalCell(cellId: LocalCellId) {
  return getCellById(cellId);
}

export function estimateLocalMapTravel(fromCellId: LocalCellId, toCellId: LocalCellId) {
  const fromCell = getCellById(fromCellId);
  const toCell = getCellById(toCellId);
  if (!fromCell || !toCell) return null;
  return estimateRouteTravel(fromCell, toCell);
}
