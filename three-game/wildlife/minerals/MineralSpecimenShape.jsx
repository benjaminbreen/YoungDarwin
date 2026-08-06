'use client';

// Mount point for the hand-specimen minerals. Each build returns a handful of
// merged geometries, one per material, so a mineral costs two or three draw
// calls rather than one per crystal.

import React, { useEffect, useMemo } from 'react';
import { buildMineralSpecimen, getMineralMaterials } from './mineralSpecimenModels';

export function MineralSpecimenShape({ specimen }) {
  const seed = specimen.instanceId || specimen.id;
  const parts = useMemo(
    () => buildMineralSpecimen(specimen.id, seed),
    [seed, specimen.id],
  );
  useEffect(() => () => parts.forEach(part => part.geometry.dispose()), [parts]);
  const materials = getMineralMaterials();

  return (
    <group>
      {parts.map((part, index) => (
        <mesh
          key={index}
          geometry={part.geometry}
          material={materials[part.material]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
