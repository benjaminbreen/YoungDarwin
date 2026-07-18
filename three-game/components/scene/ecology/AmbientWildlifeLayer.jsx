'use client';

import React, { Suspense, useMemo } from 'react';
import { specimenActorId } from '../../../../game-core/specimens';
import { SpecimenActor } from '../../world/SpecimenActor';
import { createAmbientWildlifeSpecimen } from '../../../wildlife/wildlifeCatalog';

export function AmbientWildlifeLayer({ layer }) {
  const specimens = useMemo(() => (
    (layer?.items || [])
      .map(item => {
        const localInstanceId = item.instanceId || `${layer.id}-${item.id || item.speciesId || item.species}`;
        return createAmbientWildlifeSpecimen({
          ...item,
          instanceId: specimenActorId(layer.zoneId, localInstanceId),
          localInstanceId,
        });
      })
      .filter(Boolean)
  ), [layer]);

  if (!specimens.length) return null;
  return (
    <group userData={{
      renderSource: `ecology:${layer.zoneId || 'zone'}:${layer.id}`,
      renderLabel: layer.id,
      renderKind: 'ecology-ambient-wildlife',
    }}>
      {specimens.map(specimen => (
        <Suspense key={specimen.instanceId || specimen.id} fallback={null}>
          <SpecimenActor specimen={specimen} />
        </Suspense>
      ))}
    </group>
  );
}
