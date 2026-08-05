'use client';

// The manta as a placed specimen. Nothing in the fauna AI can drive a
// three-metre animal that flies rather than walks, so the rig supplies its own
// life: a slow banked drift around the spawn point, the flap driven by the
// distance it actually covers.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { seededUnit } from './instancedCreature';
import { createMantaMesh, pickMantaVariant } from './mantaRayModel';

// A manta cruises well clear of the bottom.
const HOVER_LIFT = 0.95;
// The fauna convention travels toward +z; the rig is authored head-at--z.
const FORWARD_FLIP = Math.PI;

export function MantaRayShape({ specimen }) {
  const actorId = specimen.instanceId || specimen.id;
  const variant = useMemo(
    () => specimen.mantaVariant || pickMantaVariant(actorId),
    [actorId, specimen.mantaVariant],
  );
  const size = useMemo(() => 0.82 + seededUnit(actorId, 23) * 0.42, [actorId]);
  const rig = useMemo(() => createMantaMesh({ variant, count: 1 }), [variant]);
  useEffect(() => () => rig.dispose(), [rig]);

  const drift = useRef(null);
  const carry = useRef(null);
  const seedPhase = useMemo(() => seededUnit(actorId, 31) * Math.PI * 2, [actorId]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const t = state.clock.elapsedTime * 0.055 + seedPhase;
    // A slow, wide figure of eight around the spawn point. The animal is big
    // enough that even this much travel reads as unhurried.
    const radiusX = 5.6 * size;
    const radiusZ = 3.2 * size;
    const x = Math.sin(t) * radiusX;
    const z = Math.sin(t * 2) * radiusZ * 0.5;
    const ahead = 0.12;
    const heading = Math.atan2(
      Math.sin(t + ahead) * radiusX - x,
      Math.sin((t + ahead) * 2) * radiusZ * 0.5 - z,
    );

    const node = drift.current;
    const body = carry.current;
    if (!node || !body) return;
    node.position.set(x, 0, z);
    node.rotation.y = heading;
    // Bank into the turn, and rise and fall on the long axis of the loop.
    body.rotation.z = -Math.cos(t) * 0.26;
    body.rotation.x = Math.sin(t * 2) * 0.07;
    body.position.y = HOVER_LIFT * size + Math.sin(t * 1.6 + 0.7) * 0.22 * size;

    rig.energy[0] = 0.42 + Math.abs(Math.cos(t)) * 0.2;
    rig.advance(dt);
  });

  return (
    <group scale={size}>
      <group ref={drift}>
        <group ref={carry} rotation={[0, FORWARD_FLIP, 0]}>
          <primitive object={rig.mesh} />
        </group>
      </group>
    </group>
  );
}
