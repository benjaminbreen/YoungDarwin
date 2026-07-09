'use client';

import React, { useMemo } from 'react';
import { WATKINS_CABIN } from '../../world/regions/watkinsCamp/terrain';
import { getWatkinsCabinPieces, getWatkinsCabinDependents } from '../../world/watkinsCabinLayout';
import { DestructibleTimberStructure } from './DestructibleTimberStructure';

export function WatkinsCabin() {
  const pieces = useMemo(() => getWatkinsCabinPieces(), []);
  const dependents = useMemo(() => getWatkinsCabinDependents(), []);

  return (
    <DestructibleTimberStructure
      structureId="watkins-cabin"
      zoneId="WATKINS"
      origin={WATKINS_CABIN}
      pieces={pieces}
      dependents={dependents}
      timberKind="watkins-cabin-timber"
      renderLabel="Watkins cabin (destructible structure)"
    />
  );
}
