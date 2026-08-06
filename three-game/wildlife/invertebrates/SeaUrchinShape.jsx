'use client';

// The urchin as a placed specimen. It does not travel — a slate-pencil urchin
// wedged in a crevice moves a few centimetres a day — so the only life in the
// rig is the slow rock the surge gives it.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { seededUnit } from '../fish/instancedCreature';
import { buildSeaUrchin, getUrchinMaterials } from './urchinModel';

export function SeaUrchinShape({ specimen }) {
  const actorId = specimen.instanceId || specimen.id;
  const parts = useMemo(() => buildSeaUrchin(actorId), [actorId]);
  useEffect(() => () => parts.forEach(part => part.geometry.dispose()), [parts]);
  const materials = getUrchinMaterials();

  const size = useMemo(() => 0.86 + seededUnit(actorId, 11) * 0.34, [actorId]);
  const yaw = useMemo(() => seededUnit(actorId, 17) * Math.PI * 2, [actorId]);
  const phase = useMemo(() => seededUnit(actorId, 29) * Math.PI * 2, [actorId]);
  const sway = useRef(null);

  useFrame(state => {
    const node = sway.current;
    if (!node) return;
    const t = state.clock.elapsedTime * 0.42 + phase;
    node.rotation.x = Math.sin(t) * 0.022;
    node.rotation.z = Math.cos(t * 0.73) * 0.026;
  });

  return (
    <group scale={size} rotation={[0, yaw, 0]}>
      <group ref={sway}>
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
    </group>
  );
}
