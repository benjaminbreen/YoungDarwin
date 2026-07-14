'use client';

// Hand-authored Floreana lava lizard specimen shape — replaces the Tripo GLB.
// The fauna AI (SpecimenActor → useFaunaBehavior) still owns where the animal
// goes; this component owns how it looks doing it. It is deliberately
// self-animating from observed motion: it tracks its own world position to
// derive speed, so the same rig reads correctly patrolling, fleeing, held in
// Darwin's hands, framed in an examine session, or lying downed.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { weatherEnv } from '../../world/weatherEnvRuntime';
import { createReptileAnimator } from './reptileGaitRuntime';
import {
  createLavaLizardRig,
  pickLavaLizardVariant,
  LAVA_LIZARD_GAIT,
} from './lavaLizardModel';

// The fauna controller floats the actor origin ~4cm above the terrain
// (groundOffset) but samples it at one point, so a long body clips on any
// slope if the feet sit exactly at the sample height. Keep a small positive
// clearance and let the contact shadow sell the contact.
const GROUND_TRIM = -0.025;
// The fauna controller's yaw convention travels toward +z; the rig is
// authored head-at--z like the GLBs before their manifest flip.
const FORWARD_FLIP = Math.PI;
// Beyond this distance the secondary animation runs at 1/3 frame rate and
// the micro-behaviors (tongue, blinks, displays) stand down on their own.
const DETAIL_DISTANCE = 22;
const TELEPORT_SPEED = 6;

const _world = new THREE.Vector3();
const _player = new THREE.Vector3();

export function LavaLizardShape({ specimen }) {
  const actorId = specimen.instanceId || specimen.id;
  const variant = useMemo(() => pickLavaLizardVariant(actorId), [actorId]);
  const rig = useMemo(() => createLavaLizardRig(variant), [variant]);
  const animator = useMemo(
    () => createReptileAnimator({ nodes: rig.nodes, config: LAVA_LIZARD_GAIT, seed: actorId }),
    [actorId, rig],
  );
  const downed = useThreeGameStore(state => Boolean(state.downedSpecimenActors?.[actorId]));
  const held = useThreeGameStore(state => state.carriedObjectId === actorId);
  const track = useRef({ has: false, x: 0, z: 0, speed: 0, throttle: 0, accum: 0 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const t = track.current;
    rig.group.getWorldPosition(_world);
    if (t.has) {
      const raw = Math.hypot(_world.x - t.x, _world.z - t.z) / Math.max(dt, 1 / 240);
      t.speed = raw > TELEPORT_SPEED ? 0 : raw;
    }
    t.x = _world.x;
    t.z = _world.z;
    t.has = true;

    const pose = getRuntimePlayerPose();
    let playerLocal = null;
    let playerDist = Infinity;
    if (pose?.position) {
      playerDist = Math.hypot(pose.position.x - _world.x, pose.position.z - _world.z);
      if (playerDist < 9) {
        playerLocal = rig.group.worldToLocal(
          _player.set(pose.position.x, pose.position.y + 1.2, pose.position.z),
        );
      }
    }

    // Far lizards batch their secondary animation into every third frame.
    t.accum += dt;
    if (playerDist > DETAIL_DISTANCE) {
      t.throttle = (t.throttle + 1) % 3;
      if (t.throttle !== 0) return;
    }
    const stepDt = t.accum;
    t.accum = 0;

    const store = useThreeGameStore.getState();
    const sky = skyState(store.timeOfDay ?? 12, store.day || 1);
    animator.update({
      dt: stepDt,
      time: state.clock.elapsedTime,
      speed: t.speed,
      playerLocal,
      playerDist,
      daylight: sky.daylight,
      rain: weatherEnv.rainIntensity,
      downed,
      held,
    });
  });

  return (
    <group position={[0, GROUND_TRIM, 0]} rotation={[0, FORWARD_FLIP, 0]}>
      <primitive object={rig.group} />
    </group>
  );
}
