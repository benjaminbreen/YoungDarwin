import type { ExpeditionState } from './types';

export const EXPEDITION_CORE_SCHEMA_VERSION = 3;
const initialRegionId = 'POST_OFFICE_BAY';

export function createInitialExpeditionState(seed = 'three-darwin-v1'): ExpeditionState {
  return {
    schemaVersion: EXPEDITION_CORE_SCHEMA_VERSION,
    seed,
    currentZoneId: initialRegionId,
    currentLocalCellId: 'POST_OFFICE_BAY',
    playerSpawnId: 'default',
    timeMinutes: 7 * 60 + 9,
    day: 1,
    fatigue: 4,
    health: 100,
    inventory: [],
    journal: [
      {
        id: 'seed-marineiguana',
        specimenId: 'marineiguana',
        specimenName: 'Marine Iguana',
        latin: 'Amblyrhynchus cristatus',
        location: 'Post Office Bay, Charles Island',
        method: 'observation',
        day: 1,
        kind: 'specimen',
        content:
          'Observed several large black lizards frequenting the lava rocks near the shore. Their appearance at first repulsive, though they seem remarkably well adapted to this harsh country.\n\nThe nostrils are often encrusted with salt. Individuals repeatedly entered the sea in search of vegetable matter.\n\nQuestion:\nHow are these animals related to the land iguanas observed elsewhere?',
        createdAt: '1835-09-17T08:00:00.000Z',
      },
    ],
    collectedSpecimenIds: [],
    collectedSpecimenActorIds: [],
    documentedSpecimenIds: [],
    examinedTypeIds: [],
    visitedZoneIds: [initialRegionId],
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
    journal: Array.isArray(saved.journal) && saved.journal.length > 0 ? saved.journal as ExpeditionState['journal'] : initial.journal,
    collectedSpecimenIds: Array.isArray(saved.collectedSpecimenIds) ? saved.collectedSpecimenIds as string[] : initial.collectedSpecimenIds,
    collectedSpecimenActorIds: Array.isArray(saved.collectedSpecimenActorIds) ? saved.collectedSpecimenActorIds as string[] : initial.collectedSpecimenActorIds,
    documentedSpecimenIds: Array.isArray(saved.documentedSpecimenIds) ? saved.documentedSpecimenIds as string[] : initial.documentedSpecimenIds,
    examinedTypeIds: Array.isArray(saved.examinedTypeIds) ? saved.examinedTypeIds as string[] : initial.examinedTypeIds,
  };
}
