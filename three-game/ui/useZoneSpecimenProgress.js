'use client';

import { useMemo } from 'react';
import { useThreeGameStore } from '../store';
import { zoneSpecimenProgress } from '../data';

// One subscription shape for "n of m recorded in this zone", shared by the
// HUD field-record rail and the collection celebration so the two surfaces
// can never disagree about the count.
export function useZoneSpecimenProgress() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const collectedSpecimenIds = useThreeGameStore(state => state.collectedSpecimenIds);
  const documentedSpecimenIds = useThreeGameStore(state => state.documentedSpecimenIds);
  return useMemo(
    () => zoneSpecimenProgress(currentZoneId, collectedSpecimenIds, documentedSpecimenIds),
    [currentZoneId, collectedSpecimenIds, documentedSpecimenIds],
  );
}
