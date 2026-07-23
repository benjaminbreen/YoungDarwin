'use client';

import React, { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerAvatarModel } from '../components/player/PlayerAvatarModel';
import { useMultiplayerSnapshot } from './MultiplayerContext';

function dampAngle(current, target, lambda, delta) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
}

function RemoteActor({ actor }) {
  const groupRef = useRef(null);
  const initializedRef = useRef(false);
  const motionRef = useRef({
    speed: 0,
    walking: false,
    running: false,
    action: null,
    actionUntil: 0,
    modelAssetId: actor.roleId === 'darwin' ? 'darwin5' : 'tripoTortoiseRigged',
  });
  const scratch = useMemo(() => ({ target: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const targetPose = actor.targetPose || actor.pose;
    if (!group || !targetPose?.position) return;
    scratch.target.set(targetPose.position.x, targetPose.position.y, targetPose.position.z);
    if (!initializedRef.current) {
      group.position.copy(scratch.target);
      initializedRef.current = true;
    } else {
      const alpha = 1 - Math.exp(-11 * Math.min(delta, 0.1));
      group.position.lerp(scratch.target, alpha);
    }
    const facing = targetPose.facing || { x: 0, z: -1 };
    const targetYaw = Math.atan2(facing.x || 0, facing.z || -1);
    group.rotation.y = dampAngle(group.rotation.y, targetYaw, 13, delta);

    const sourceMotion = actor.motion || {};
    motionRef.current.speed = sourceMotion.speed || 0;
    motionRef.current.walking = Boolean(sourceMotion.walking || motionRef.current.speed > 0.08);
    motionRef.current.running = Boolean(sourceMotion.running);
    if (actor.action?.until > Date.now()) {
      motionRef.current.action = actor.action.id;
      motionRef.current.actionUntil = actor.action.until / 1_000;
    } else {
      motionRef.current.action = null;
      motionRef.current.actionUntil = 0;
    }
  });

  if (!actor.pose && !actor.targetPose) return null;
  return (
    <group ref={groupRef} userData={{ id: actor.playerId, kind: 'remote-player', roleId: actor.roleId }}>
      <PlayerAvatarModel
        playableModeId={actor.roleId}
        motionRef={motionRef}
        health={100}
        fatigue={0}
        inventoryCount={0}
      />
      <Html position={[0, actor.roleId === 'darwin' ? 2.25 : 1.45, 0]} center distanceFactor={12} zIndexRange={[8, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-sm border border-expedition-brass/70 bg-[rgba(10,16,20,0.82)] px-2 py-1 font-expedition text-[11px] tracking-[0.06em] text-expedition-parchment shadow-lg backdrop-blur-sm">
          {actor.displayName || (actor.roleId === 'darwin' ? 'Darwin' : 'Tortoise')}
        </div>
      </Html>
    </group>
  );
}

export function RemotePlayerActors() {
  const snapshot = useMultiplayerSnapshot();
  const remoteActors = snapshot.actors.filter(actor => (
    actor.playerId !== snapshot.playerId && actor.connected && actor.zoneId === 'POST_OFFICE_BAY'
  ));
  return remoteActors.map(actor => <RemoteActor key={actor.playerId} actor={actor} />);
}
