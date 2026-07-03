'use client';

import React, { Suspense, useMemo } from 'react';
import { SpecimenActor } from '../../world/SpecimenActor';
import { createAmbientWildlifeSpecimen } from '../../../wildlife/wildlifeCatalog';

export function AmbientWildlifeLayer({ layer }) {
  const specimens = useMemo(() => (
    (layer?.items || [])
      .map(item => createAmbientWildlifeSpecimen({
        ...item,
        instanceId: item.instanceId || `${layer.id}-${item.id || item.speciesId || item.species}`,
      }))
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
