'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

function Cloud({ position, scale = 1, speed = 0.02 }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x = position[0] + Math.sin(clock.elapsedTime * speed) * 1.8;
  });

  return (
    <group ref={ref} position={position} scale={scale}>
      {[
        [-0.7, 0, 0, 0.7],
        [0, 0.1, 0, 0.95],
        [0.75, 0.02, 0, 0.62],
        [1.25, -0.08, 0, 0.42],
      ].map(([x, y, z, s], index) => (
        <mesh key={index} position={[x, y, z]} scale={[s * 1.6, s * 0.42, s * 0.18]}>
          <sphereGeometry args={[1, 14, 8]} />
          <meshBasicMaterial color="#f8f2d8" transparent opacity={0.72} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// The sun and moon are now rendered and animated by <SkyController>; this layer
// keeps only the drifting cloud puffs, which re-tint for free from the
// sky-driven lighting rig.
export function Atmosphere() {
  return (
    <group renderOrder={-5}>
      <Cloud position={[-19, 16, -42]} scale={2.5} speed={0.035} />
      <Cloud position={[8, 18, -48]} scale={1.8} speed={0.026} />
      <Cloud position={[22, 14, -36]} scale={1.45} speed={0.04} />
    </group>
  );
}
