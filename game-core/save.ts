import { currentZoneId } from './zones';
import type { ExpeditionState } from './types';

export const EXPEDITION_CORE_SCHEMA_VERSION = 2;

export function createInitialExpeditionState(seed = 'three-darwin-v1'): ExpeditionState {
  return {
    schemaVersion: EXPEDITION_CORE_SCHEMA_VERSION,
    seed,
    currentZoneId,
    currentLocalCellId: 'POST_OFFICE_BAY',
    playerSpawnId: 'default',
    timeMinutes: 7 * 60 + 9,
    day: 1,
    fatigue: 4,
    health: 100,
    inventory: [],
    journal: [],
    collectedSpecimenIds: [],
    documentedSpecimenIds: [],
    visitedZoneIds: [currentZoneId],
    visitedLocalCellIds: ['POST_OFFICE_BAY'],
  };
}

export function migrateLegacyExpeditionSave(saved: Record<string, unknown> | null | undefined): ExpeditionState {
  const initial = createInitialExpeditionState();
  if (!saved || typeof saved !== 'object') return initial;

  return {
    ...initial,
    currentLocalCellId: String(saved.currentLocalCellId || saved.currentLocationId || initial.currentLocalCellId),
    timeMinutes: Number(saved.timeMinutes || saved.gameTime || initial.timeMinutes),
    day: Number(saved.day || saved.daysPassed || initial.day),
    fatigue: Number(saved.fatigue ?? initial.fatigue),
    health: Number(saved.health ?? initial.health),
    inventory: Array.isArray(saved.inventory) ? saved.inventory as ExpeditionState['inventory'] : initial.inventory,
    journal: Array.isArray(saved.journal) ? saved.journal as ExpeditionState['journal'] : initial.journal,
    collectedSpecimenIds: Array.isArray(saved.collectedSpecimenIds) ? saved.collectedSpecimenIds as string[] : initial.collectedSpecimenIds,
    documentedSpecimenIds: Array.isArray(saved.documentedSpecimenIds) ? saved.documentedSpecimenIds as string[] : initial.documentedSpecimenIds,
  };
}
