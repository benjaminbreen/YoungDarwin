'use client';

// The hammerhead as a placed specimen. Like the manta, no fauna controller can
// drive a three-metre animal that never touches the bottom, so the rig owns its
// own patrol: a long, flat circuit around the spawn point at a steady cruise.
// Hammerheads do not dart — the drama is that they keep coming back.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { seededUnit } from './instancedCreature';
import { createHammerheadMesh } from './hammerheadModel';

// It cruises above the drop-off rather than along the bottom.
const HOVER_LIFT = 1.35;
// The fauna convention travels toward +z; the rig is authored head-at--z.
const FORWARD_FLIP = Math.PI;
const CIRCUIT_SPEED = 0.052; // radians/sec — one lap takes about two minutes

export function HammerheadShape({ specimen, motionRef = null }) {
  const actorId = specimen.instanceId || specimen.id;
  const size = useMemo(() => 0.9 + seededUnit(actorId, 13) * 0.32, [actorId]);
  const rig = useMemo(() => createHammerheadMesh({ count: 1, seed: actorId }), [actorId]);
  useEffect(() => () => rig.dispose(), [rig]);

  const drift = useRef(null);
  const carry = useRef(null);
  const seedPhase = useMemo(() => seededUnit(actorId, 37) * Math.PI * 2, [actorId]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const t = state.clock.elapsedTime * CIRCUIT_SPEED + seedPhase;
    // A wide ellipse, wider than it is deep, so the shark passes broadside
    // across a wader's view rather than head-on and gone.
    const radiusX = 9.5 * size;
    const radiusZ = 6.2 * size;
    const x = Math.sin(t) * radiusX;
    const z = Math.cos(t) * radiusZ;
    const ahead = 0.08;
    const heading = Math.atan2(
      Math.sin(t + ahead) * radiusX - x,
      Math.cos(t + ahead) * radiusZ - z,
    );

    const node = drift.current;
    const body = carry.current;
    if (!node || !body) return;
    // The animation lab wants the rig, not the patrol: hold station there so
    // the shark does not simply swim out of the preview frame.
    const lift = specimen.previewStationary ? 0 : HOVER_LIFT * size;
    if (specimen.previewStationary) {
      node.position.set(0, 0, 0);
      node.rotation.y = 0;
    } else if (motionRef) {
      // Hand the circuit to SpecimenActor so the published pose follows the
      // animal. Driving it here instead leaves the marker, the interaction
      // radius and the examine camera pinned to an empty patch of spawn.
      node.position.set(0, 0, 0);
      node.rotation.y = 0;
      motionRef.current.cruise = { x, y: lift, z, yaw: heading };
    } else {
      node.position.set(x, 0, z);
      node.rotation.y = heading;
    }
    // Bank into the turn, and rise and fall slowly across the circuit.
    body.rotation.z = -Math.cos(t) * 0.15;
    body.rotation.x = Math.sin(t * 1.7) * 0.045;
    // The actor owns the cruise height when it is driving the circuit, so the
    // rig only adds the bob on top.
    body.position.y = (motionRef ? 0 : lift) + Math.sin(t * 2.3 + 0.5) * 0.32 * size;

    // Effort barely varies: a cruising hammerhead is a metronome.
    rig.energy[0] = 0.34 + Math.abs(Math.sin(t * 2)) * 0.1;
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
