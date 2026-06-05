'use client';

import React, { useMemo } from 'react';
import { HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { TERRAIN_SIZE, terrainHeight } from '../world/terrain';

const COLLIDER_SEGMENTS = 96;

function buildTerrainHeightfield() {
  const rows = COLLIDER_SEGMENTS + 1;
  const cols = COLLIDER_SEGMENTS + 1;
  const heights = [];
  const half = TERRAIN_SIZE / 2;

  for (let zIndex = 0; zIndex < rows; zIndex += 1) {
    const z = -half + (zIndex / COLLIDER_SEGMENTS) * TERRAIN_SIZE;
    for (let xIndex = 0; xIndex < cols; xIndex += 1) {
      const x = -half + (xIndex / COLLIDER_SEGMENTS) * TERRAIN_SIZE;
      heights.push(terrainHeight(x, z));
    }
  }

  return {
    subdivisionsX: COLLIDER_SEGMENTS,
    subdivisionsZ: COLLIDER_SEGMENTS,
    heights,
    scale: { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE },
  };
}

export function PhysicsTerrain() {
  const heightfield = useMemo(() => buildTerrainHeightfield(), []);
  const half = TERRAIN_SIZE / 2;
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[-half, 0, -half]}
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
