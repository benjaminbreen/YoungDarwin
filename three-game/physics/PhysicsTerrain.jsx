'use client';

import React, { useMemo } from 'react';
import { HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { getRegionTerrainConfig, movementTerrainHeight } from '../world/terrain';
import { useThreeGameStore } from '../store';

function buildTerrainHeightfield(regionId) {
  const config = getRegionTerrainConfig(regionId);
  const colliderSegments = Math.min(192, Math.max(96, Math.floor(config.segments || 96)));
  const rows = colliderSegments + 1;
  const cols = colliderSegments + 1;
  const heights = [];
  const halfWidth = config.width / 2;
  const halfDepth = config.depth / 2;

  // Rapier heightfields are column-major: columns run along x, rows along z,
  // so x must be the outer loop. The reversed order skews heights by metres.
  for (let xIndex = 0; xIndex < cols; xIndex += 1) {
    const x = -halfWidth + (xIndex / colliderSegments) * config.width;
    for (let zIndex = 0; zIndex < rows; zIndex += 1) {
      const z = -halfDepth + (zIndex / colliderSegments) * config.depth;
      heights.push(movementTerrainHeight(x, z, regionId));
    }
  }

  return {
    subdivisionsX: colliderSegments,
    subdivisionsZ: colliderSegments,
    heights,
    scale: { x: config.width, y: 1, z: config.depth },
  };
}

export function PhysicsTerrain() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const heightfield = useMemo(() => buildTerrainHeightfield(currentZoneId), [currentZoneId]);
  return (
    <RigidBody
      key={currentZoneId}
      type="fixed"
      colliders={false}
      position={[0, 0, 0]}
      userData={{ id: 'terrain', kind: 'terrain' }}
    >
      <HeightfieldCollider
        args={[
          heightfield.subdivisionsX,
          heightfield.subdivisionsZ,
          heightfield.heights,
          heightfield.scale,
        ]}
        friction={1.05}
      />
    </RigidBody>
  );
}
