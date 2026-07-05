'use client';

import React, { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ModelAsset } from '../../assets/ModelAsset';

export function FlyingModelFlock({ birds }) {
  const groupRef = useRef(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((bird, index) => {
      const spec = birds[index];
      if (!spec) return;
      const speed = spec.speed ?? 0.06;
      const radiusX = spec.radiusX ?? spec.radius ?? 22;
      const radiusZ = spec.radiusZ ?? spec.radius ?? 14;
      const phase = spec.phase ?? 0;
      const a = t * speed + phase;
      bird.position.set(
        (spec.cx || 0) + Math.cos(a) * radiusX,
        (spec.height || 18) + Math.sin(t * 0.28 + phase) * (spec.floatAmount ?? 0.9),
        (spec.cz || 0) + Math.sin(a) * radiusZ,
      );
      const tangentYaw = Math.atan2(-Math.sin(a) * radiusX, Math.cos(a) * radiusZ);
      bird.rotation.set(
        spec.pitch ?? -0.03,
        tangentYaw + (speed < 0 ? Math.PI : 0) + (spec.yawOffset ?? 0),
        Math.cos(a) * (spec.rollAmount ?? 0.12),
      );
    });
  });

  return (
    <group ref={groupRef}>
      {birds.map((spec, index) => (
        <group key={spec.id || index} scale={spec.scale || 1}>
          <Suspense fallback={null}>
            <ModelAsset
              id={spec.assetId}
              animationSelector={() => ({
                clip: spec.clip,
                timeScale: spec.timeScale ?? 0.62,
                fade: 0.22,
              })}
            />
          </Suspense>
        </group>
      ))}
    </group>
  );
}
