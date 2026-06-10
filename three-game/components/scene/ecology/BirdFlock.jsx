'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Circling bird silhouettes (frigatebird kite shape by default). Specs come
// from the ecology definition: { radius, height, speed, phase, cx, cz }.

function frigatebirdGeometry() {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0.12, -0.95, 0.06, -0.1, -0.45, 0.02, 0.16,
    0, 0, 0.12, 0.45, 0.02, 0.16, 0.95, 0.06, -0.1,
    -0.06, 0, 0.1, 0.06, 0, 0.1, 0, -0.01, -0.42,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

export function BirdFlock({ birds, color = '#16140f', scale = 2.2 }) {
  const groupRef = useRef(null);
  const geometry = useMemo(() => frigatebirdGeometry(), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true }),
    [color],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((bird, index) => {
      const spec = birds[index];
      const a = t * spec.speed + spec.phase;
      bird.position.set(
        spec.cx + Math.cos(a) * spec.radius,
        spec.height + Math.sin(t * 0.3 + spec.phase) * 1.4,
        spec.cz + Math.sin(a) * spec.radius,
      );
      bird.rotation.y = -a - Math.PI / 2 + (spec.speed < 0 ? Math.PI : 0);
      bird.rotation.z = (spec.speed < 0 ? -0.3 : 0.3) + Math.sin(t * 2.1 + spec.phase) * 0.16;
    });
  });

  return (
    <group ref={groupRef}>
      {birds.map((spec, index) => (
        <mesh key={index} geometry={geometry} material={material} scale={scale} />
      ))}
    </group>
  );
}
