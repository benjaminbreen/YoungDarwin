'use client';

// The single collectible parrotfish. Like the lava lizard, the fauna AI owns
// where the animal goes and this component owns how it looks doing it: it
// tracks its own world position to derive swimming effort, so the same rig
// reads correctly hovering over a coral head, fleeing a wading naturalist,
// held in Darwin's hands, or lying downed in the collecting basket.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { createParrotfishSchoolMesh, pickParrotfishVariant, seededUnit } from './parrotfishModel';

// A fish does not stand on the seabed. The fauna controller grounds the actor
// like everything else, so the rig floats itself clear of the sand.
const HOVER_LIFT = 0.16;
// The fauna controller's yaw convention travels toward +z; the rig is authored
// head-at--z to match the GLB specimens.
const FORWARD_FLIP = Math.PI;
const CRUISE_SPEED = 1.3; // world m/s that counts as full effort
const TELEPORT_SPEED = 6;

const _world = new THREE.Vector3();

export function ParrotfishShape({ specimen }) {
  const actorId = specimen.instanceId || specimen.id;
  const variant = useMemo(
    () => specimen.parrotfishVariant || pickParrotfishVariant(actorId),
    [actorId, specimen.parrotfishVariant],
  );
  const size = useMemo(() => {
    const eased = seededUnit(actorId, 17);
    return (variant === 'terminal' ? 1.08 : 0.9) + eased * 0.3;
  }, [actorId, variant]);
  const rig = useMemo(() => createParrotfishSchoolMesh({ variant, count: 1 }), [variant]);
  useEffect(() => () => rig.dispose(), [rig]);

  const downed = useThreeGameStore(state => Boolean(state.downedSpecimenActors?.[actorId]));
  const held = useThreeGameStore(state => state.carriedObjectId === actorId);
  const hover = useRef(null);
  const track = useRef({ has: false, x: 0, z: 0, energy: 0.3 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const t = track.current;
    rig.mesh.getWorldPosition(_world);
    let speed = 0;
    if (t.has) {
      const raw = Math.hypot(_world.x - t.x, _world.z - t.z) / Math.max(dt, 1 / 240);
      speed = raw > TELEPORT_SPEED ? 0 : raw;
    }
    t.x = _world.x;
    t.z = _world.z;
    t.has = true;

    // Out of the water the fish is finished; in the hand it still works. A
    // downed specimen freezes the rig outright.
    const target = downed
      ? 0
      : THREE.MathUtils.clamp(speed / CRUISE_SPEED, held ? 0.55 : 0.12, 1);
    t.energy += (target - t.energy) * Math.min(1, dt * (target > t.energy ? 6 : 2.2));
    rig.energy[0] = t.energy;
    rig.mesh.geometry.getAttribute('aDead').setX(0, downed ? 1 : 0);
    rig.mesh.geometry.getAttribute('aDead').needsUpdate = true;
    rig.advance(downed ? 0 : dt);

    const node = hover.current;
    if (!node) return;
    const time = state.clock.elapsedTime;
    if (downed) {
      // Settled on its side on the seabed or in the basket.
      node.position.y = 0;
      node.rotation.z = 1.42;
      node.rotation.x = 0;
      return;
    }
    // Station-keeping: a hovering parrotfish rises and falls on the stroke and
    // rolls a few degrees as it noses over the reef.
    const idle = 1 - t.energy;
    node.position.y = HOVER_LIFT * size + Math.sin(time * 1.5 + size) * 0.012 * (0.4 + idle);
    node.rotation.z = Math.sin(time * 0.62 + size * 2.1) * 0.09 * idle;
    node.rotation.x = Math.sin(time * 0.47 + size) * 0.06 * idle - t.energy * 0.05;
  });

  return (
    <group rotation={[0, FORWARD_FLIP, 0]} scale={size}>
      <group ref={hover}>
        <primitive object={rig.mesh} />
      </group>
    </group>
  );
}
