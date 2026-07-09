'use client';

import React, { useMemo } from 'react';
import { PENAL_COLONY_INMATE_CABIN } from '../../world/regions/penalColony/path';
import { getPenalInmateCabinDependents, getPenalInmateCabinPieces } from '../../world/penalInmateCabinLayout';
import { DestructibleTimberStructure } from './DestructibleTimberStructure';

const INMATE_TIMBER_TONES = ['#776f61', '#6a5f51', '#8b7b64', '#554c42'];

export function PenalInmateCabin() {
  const pieces = useMemo(() => getPenalInmateCabinPieces(), []);
  const dependents = useMemo(() => getPenalInmateCabinDependents(), []);

  return (
    <DestructibleTimberStructure
      structureId="penal-inmate-cabin"
      zoneId="PENAL_COLONY"
      origin={PENAL_COLONY_INMATE_CABIN}
      pieces={pieces}
      dependents={dependents}
      timberKind="penal-inmate-cabin-timber"
      timberTones={INMATE_TIMBER_TONES}
      releaseForce={1250}
      renderLabel="Penal colony inmate cabin (destructible structure)"
    />
  );
}
