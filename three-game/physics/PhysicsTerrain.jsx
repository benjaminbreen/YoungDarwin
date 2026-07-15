'use client';

import React from 'react';
import { HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { useThreeGameStore } from '../store';
import { readTerrainResource } from '../world/terrainResource';

export function PhysicsTerrain({ segmentCap = null }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { heightfield } = readTerrainResource(currentZoneId, segmentCap);
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
