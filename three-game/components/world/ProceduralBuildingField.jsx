'use client';

import React, { useMemo } from 'react';
import { useHutMaterials } from '../../interiors/huts/hutMaterials';
import { WhalersHutBuilding } from '../../interiors/huts/WhalersHutBuilding';
import { ColonistRanchoBuilding } from '../../interiors/huts/ColonistRanchoBuilding';
import { obstacleRenderPosition } from '../../world/obstacles';
import { terrainHeight } from '../../world/terrain';

// Buildings drawn in code rather than loaded as GLBs — the whalers' hut and
// the colonist's rancho. Their obstacles carry `procedural` instead of a
// model path; the same components form the shells of their interiors.

const BUILDINGS = {
  'whalers-hut': WhalersHutBuilding,
  'colonist-rancho': ColonistRanchoBuilding,
};

// Terrain height in the building's own frame, so its yard can follow the
// ground around it.
function PlacedBuilding({ obstacle, materials }) {
  const [x, y, z] = obstacleRenderPosition(obstacle);
  const baseY = y + (obstacle.baseOffset || 0);
  const yaw = obstacle.yaw || 0;
  const groundAt = useMemo(() => {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return (lx, lz) => terrainHeight(x + lx * cos + lz * sin, z - lx * sin + lz * cos, obstacle.zoneId) - baseY;
  }, [baseY, obstacle.zoneId, x, yaw, z]);
  const Building = BUILDINGS[obstacle.procedural];
  if (!Building) return null;
  return (
    <group position={[x, baseY, z]} rotation={[0, yaw, 0]}>
      <Building materials={materials} variant="exterior" groundAt={groundAt} />
    </group>
  );
}

export function ProceduralBuildingField({ obstacles, currentZoneId }) {
  const materials = useHutMaterials();
  return (
    <group userData={{ renderSource: `procedural-buildings:${currentZoneId}`, renderKind: 'structure' }}>
      {obstacles.map(obstacle => (
        <PlacedBuilding key={obstacle.id} obstacle={obstacle} materials={materials} />
      ))}
    </group>
  );
}
