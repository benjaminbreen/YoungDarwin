'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

// Distant landform silhouettes (volcano cones, ridgelines) rendered as cheap
// fog-tinted basic-material cones beyond the playable bounds.

export function Skyline({ cones, color = '#6b6850' }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, fog: true }), [color]);
  return (
    <group>
      {cones.map((cone, index) => (
        <mesh key={index} material={material} position={cone.position}>
          <coneGeometry args={[cone.radius, cone.height, 40]} />
        </mesh>
      ))}
    </group>
  );
}
