'use client';

import React, { useMemo } from 'react';
import { PENAL_COLONY_WORK_GANG_CABIN } from '../../world/regions/penalColony/path';
import { getPenalWorkGangCabinDependents, getPenalWorkGangCabinPieces } from '../../world/penalWorkGangCabinLayout';
import { DestructibleTimberStructure } from './DestructibleTimberStructure';

const WORK_GANG_TIMBER_TONES = ['#6f6658', '#85745d', '#5a5146', '#9a8567', '#4c453d'];

export function PenalWorkGangCabin() {
  const pieces = useMemo(() => getPenalWorkGangCabinPieces(), []);
  const dependents = useMemo(() => getPenalWorkGangCabinDependents(), []);

  return (
    <DestructibleTimberStructure
      structureId="penal-work-gang-cabin"
      zoneId="PENAL_COLONY"
      origin={PENAL_COLONY_WORK_GANG_CABIN}
      pieces={pieces}
      dependents={dependents}
      timberKind="penal-work-gang-cabin-timber"
      timberTones={WORK_GANG_TIMBER_TONES}
      releaseForce={1350}
      shotgunMaxPieces={4}
      renderLabel="Penal colony work-gang quarters (destructible structure)"
    />
  );
}
