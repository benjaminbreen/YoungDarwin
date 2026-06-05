'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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

export function Atmosphere() {
  const sunMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffe58a',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  }), []);
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fff1a9',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  return (
    <group renderOrder={-5}>
      <mesh position={[-18, 21, -48]} material={glowMaterial}>
        <circleGeometry args={[8.5, 48]} />
      </mesh>
      <mesh position={[-18, 21, -47.9]} material={sunMaterial}>
        <circleGeometry args={[2.1, 48]} />
      </mesh>
      <Cloud position={[-19, 16, -42]} scale={2.5} speed={0.035} />
      <Cloud position={[8, 18, -48]} scale={1.8} speed={0.026} />
      <Cloud position={[22, 14, -36]} scale={1.45} speed={0.04} />
    </group>
  );
}
