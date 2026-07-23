'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { terrainHeight, clampToWalkable } from '../../world/terrain';
import { useThreeGameStore } from '../../store';
import { getPlayableMode } from '../../playable/playableModes';
import { ModelAsset } from '../assets/ModelAsset';
import { useMultiplayerRolePresent } from '../../multiplayer/MultiplayerContext';

function ProceduralDarwinNpc() {
  return (
    <group>
      <mesh castShadow position={[0, 1.48, 0]}>
        <sphereGeometry args={[0.23, 16, 16]} />
        <meshToonMaterial color="#d0a070" />
      </mesh>
      <mesh castShadow position={[0, 1.76, 0]}>
        <cylinderGeometry args={[0.34, 0.43, 0.16, 20]} />
        <meshToonMaterial color="#b58b46" />
      </mesh>
      <mesh castShadow position={[0, 1.04, 0]}>
        <capsuleGeometry args={[0.29, 0.8, 6, 12]} />
        <meshToonMaterial color="#4a3527" />
      </mesh>
    </group>
  );
}

function encounterMessage(modeId) {
  if (modeId === 'finch') {
    return 'Darwin steps softly beneath the finch, pencil lifted, waiting for a lower perch before attempting a capture.';
  }
  if (modeId === 'tortoise') {
    return 'Darwin kneels beside the tortoise and studies the shell as if deciding whether to mark, measure, or collect it.';
  }
  return 'Darwin pauses nearby, suddenly an observer inside the animal player loop.';
}

function playerBlockRadiusForMode(modeId) {
  if (modeId === 'tortoise') return 1.85;
  if (modeId === 'finch') return 0.72;
  return 1.05;
}

function playerBlockHeightForMode(modeId) {
  if (modeId === 'finch') return 0.75;
  return 1.55;
}

function darwinNpcReactionForDropping(dropping, time) {
  const part = dropping.stuckTo?.part || 'coat';
  const verticalSpeed = Number(dropping.impact?.verticalSpeed) || 0;
  const hardHit = part === 'hat' || verticalSpeed >= 4.6;
  if (hardHit) {
    return {
      kind: 'fall',
      clip: 'shoulderHitAndFall',
      clipUntil: time + 2.65,
      downUntil: time + 3.2,
      getUpUntil: time + 5.65,
      doneAt: time + 5.65,
    };
  }
  return {
    kind: 'stagger',
    clip: part === 'coat' ? 'stumble' : 'hitReaction',
    clipUntil: time + 1.45,
    doneAt: time + 1.65,
  };
}

function reactionClipAt(reaction, time) {
  if (!reaction) return null;
  if (time < reaction.clipUntil) return reaction.clip;
  if (reaction.kind === 'fall') {
    if (time < reaction.downUntil) return 'layingIdle';
    if (time < reaction.getUpUntil) return 'gettingUp';
  }
  return null;
}

function DarwinPoopSplat({ dropping }) {
  const local = dropping.stuckTo?.localPosition || { x: 0, y: 1.55, z: 0 };
  const scale = dropping.stuckTo?.part === 'hat' ? 0.22 : 0.17;
  return (
    <group position={[local.x || 0, local.y || 1.55, local.z || 0]} rotation={[-Math.PI / 2, 0, dropping.yaw || 0]}>
      <mesh renderOrder={6}>
        <circleGeometry args={[scale, 24]} />
        <meshBasicMaterial color="#f1edd7" transparent opacity={0.88} depthWrite={false} />
      </mesh>
      <mesh position={[scale * 0.38, scale * -0.22, 0.002]} scale={[0.42, 0.2, 1]} renderOrder={6}>
        <circleGeometry args={[scale, 18]} />
        <meshBasicMaterial color="#fff8df" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh position={[scale * -0.46, scale * 0.18, 0.003]} scale={[0.26, 0.18, 1]} renderOrder={6}>
        <circleGeometry args={[scale, 16]} />
        <meshBasicMaterial color="#e8e0bd" transparent opacity={0.72} depthWrite={false} />
      </mesh>
    </group>
  );
}

function pushOutsidePlayerFootprint(x, z, playerX, playerZ, radius, seed = 0) {
  const dx = x - playerX;
  const dz = z - playerZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return { x, z, pushed: false };
  const angle = distance > 0.001 ? Math.atan2(dz, dx) : seed * 0.37 + 1.9;
  return {
    x: playerX + Math.cos(angle) * radius,
    z: playerZ + Math.sin(angle) * radius,
    pushed: true,
  };
}

export function AnimalModeDarwinNpc() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const playableSpawnPoint = useThreeGameStore(state => state.playableSpawnPoint);
  const recordEncounter = useThreeGameStore(state => state.recordAnimalModeNpcEncounter);
  const setNpcPose = useThreeGameStore(state => state.setAnimalModeDarwinNpcPose);
  const droppings = useThreeGameStore(state => state.animalDroppings);
  const mode = getPlayableMode(playableModeId);
  const humanDarwinPresent = useMultiplayerRolePresent('darwin');
  const visible = mode.kind === 'animal' && Boolean(playableSpawnPoint) && !humanDarwinPresent;
  const stuckDroppings = useMemo(() => (
    (droppings || []).filter(dropping => (
      dropping.zoneId === currentZoneId
      && dropping.status === 'stuck'
      && dropping.stuckTo?.type === 'darwin'
    ))
  ), [currentZoneId, droppings]);
  const group = useRef(null);
  const animationRef = useRef('idle');
  const stuckDroppingsRef = useRef(stuckDroppings);
  const reactedDroppingIds = useRef(new Set());
  const npc = useRef({
    initialized: false,
    x: 0,
    z: 0,
    targetX: 0,
    targetZ: 0,
    nextTargetAt: 0,
    lastEncounterAt: -Infinity,
    reaction: null,
    seed: 0,
  });

  useEffect(() => {
    stuckDroppingsRef.current = stuckDroppings;
  }, [stuckDroppings]);

  useEffect(() => {
    if (!visible) {
      npc.current.initialized = false;
      setNpcPose?.(null);
      return;
    }
    const spawnX = playableSpawnPoint?.x || 0;
    const spawnZ = playableSpawnPoint?.z || 0;
    const seed = Array.from(`${currentZoneId}:${playableModeId}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const angle = seed * 0.73;
    const start = clampToWalkable({
      x: spawnX + Math.cos(angle) * 5.4,
      y: 0,
      z: spawnZ + Math.sin(angle) * 5.4,
    }, null, currentZoneId);
    npc.current = {
      initialized: true,
      x: start.x,
      z: start.z,
      targetX: start.x,
      targetZ: start.z,
      nextTargetAt: 0,
      lastEncounterAt: -Infinity,
      reaction: null,
      seed,
    };
    reactedDroppingIds.current = new Set((stuckDroppingsRef.current || []).map(dropping => dropping.id));
    if (group.current) {
      group.current.position.set(start.x, terrainHeight(start.x, start.z, currentZoneId) + 0.04, start.z);
    }
    return () => {
      setNpcPose?.(null);
    };
  }, [currentZoneId, playableModeId, playableSpawnPoint?.x, playableSpawnPoint?.z, setNpcPose, visible]);

  useFrame(({ clock }, delta) => {
    if (!visible || !group.current || !playableSpawnPoint) return;
    const state = npc.current;
    if (!state.initialized) return;
    const store = useThreeGameStore.getState();
    if (store.statusViewOpen) {
      const groundY = terrainHeight(state.x, state.z, currentZoneId) + 0.04;
      group.current.position.set(state.x, groundY, state.z);
      setNpcPose?.({
        zoneId: currentZoneId,
        x: state.x,
        y: groundY,
        z: state.z,
        yaw: group.current.rotation.y || 0,
      });
      return;
    }
    const time = clock.elapsedTime;
    const freshDarwinHit = stuckDroppings.find(dropping => (
      dropping?.id
      && !reactedDroppingIds.current.has(dropping.id)
    ));
    if (freshDarwinHit) {
      reactedDroppingIds.current.add(freshDarwinHit.id);
      state.reaction = darwinNpcReactionForDropping(freshDarwinHit, time);
      state.targetX = state.x;
      state.targetZ = state.z;
      state.nextTargetAt = Math.max(state.nextTargetAt, time + 1.4);
    }
    const reactionClip = reactionClipAt(state.reaction, time);
    if (reactionClip) {
      animationRef.current = reactionClip;
      const groundY = terrainHeight(state.x, state.z, currentZoneId) + 0.04;
      group.current.position.set(state.x, groundY, state.z);
      setNpcPose?.({
        zoneId: currentZoneId,
        x: state.x,
        y: groundY,
        z: state.z,
        yaw: group.current.rotation.y || 0,
      });
      return;
    }
    if (state.reaction && time >= state.reaction.doneAt) {
      state.reaction = null;
    }
    const playerPosition = store.playerPose?.position || playableSpawnPoint;
    const playerX = Number.isFinite(playerPosition.x) ? playerPosition.x : playableSpawnPoint.x;
    const playerY = Number.isFinite(playerPosition.y) ? playerPosition.y : playableSpawnPoint.y || 0;
    const playerZ = Number.isFinite(playerPosition.z) ? playerPosition.z : playableSpawnPoint.z;
    let npcY = terrainHeight(state.x, state.z, currentZoneId) + 0.04;
    let dxToPlayer = playerX - state.x;
    let dzToPlayer = playerZ - state.z;
    let distanceToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
    let verticalGap = Math.abs(playerY - npcY);
    const blockRadius = playerBlockRadiusForMode(mode.id);
    const blockHeight = playerBlockHeightForMode(mode.id);
    const encounterRadius = mode.id === 'finch' ? 0.95 : 1.65;

    if (verticalGap < blockHeight && distanceToPlayer < blockRadius) {
      const separated = pushOutsidePlayerFootprint(state.x, state.z, playerX, playerZ, blockRadius, state.seed);
      const safe = clampToWalkable({ x: separated.x, y: 0, z: separated.z }, null, currentZoneId);
      state.x = safe.x;
      state.z = safe.z;
      state.targetX = safe.x;
      state.targetZ = safe.z;
      state.nextTargetAt = Math.max(state.nextTargetAt, time + 0.75);
      npcY = terrainHeight(state.x, state.z, currentZoneId) + 0.04;
      dxToPlayer = playerX - state.x;
      dzToPlayer = playerZ - state.z;
      distanceToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
      verticalGap = Math.abs(playerY - npcY);
    }

    if (distanceToPlayer < encounterRadius && verticalGap < 1.25 && time - state.lastEncounterAt > 18) {
      state.lastEncounterAt = time;
      recordEncounter?.({
        type: 'collectable-contact',
        npcPosition: { x: state.x, y: npcY, z: state.z },
        playerPosition: { x: playerX, y: playerY, z: playerZ },
        message: encounterMessage(mode.id),
      });
      state.nextTargetAt = 0;
    }

    if (time >= state.nextTargetAt) {
      const shouldInvestigate = distanceToPlayer > encounterRadius + 0.45
        && distanceToPlayer < (mode.id === 'finch' ? 9.5 : 7.5)
        && verticalGap < (mode.id === 'finch' ? 4.2 : 1.8)
        && Math.sin(time * 0.34 + state.seed) > -0.15;
      if (shouldInvestigate) {
        const length = Math.max(0.001, distanceToPlayer);
        const standOff = mode.id === 'finch' ? 1.8 : blockRadius + 0.22;
        state.targetX = playerX - (dxToPlayer / length) * standOff;
        state.targetZ = playerZ - (dzToPlayer / length) * standOff;
        state.nextTargetAt = time + 2.2;
      } else {
        const angle = state.seed * 0.19 + time * 0.17 + Math.sin(time * 0.41 + state.seed) * 1.4;
        const radius = mode.id === 'finch' ? 4.8 : 5.8;
        state.targetX = playableSpawnPoint.x + Math.cos(angle) * radius;
        state.targetZ = playableSpawnPoint.z + Math.sin(angle * 0.83) * radius;
        state.nextTargetAt = time + 4.5 + (Math.sin(state.seed + time) + 1) * 1.7;
      }
      const safeTarget = clampToWalkable({ x: state.targetX, y: 0, z: state.targetZ }, null, currentZoneId);
      const separatedTarget = verticalGap < blockHeight
        ? pushOutsidePlayerFootprint(safeTarget.x, safeTarget.z, playerX, playerZ, blockRadius + 0.12, state.seed + time)
        : { x: safeTarget.x, z: safeTarget.z };
      const safeSeparatedTarget = clampToWalkable({ x: separatedTarget.x, y: 0, z: separatedTarget.z }, null, currentZoneId);
      state.targetX = safeSeparatedTarget.x;
      state.targetZ = safeSeparatedTarget.z;
    }

    const dx = state.targetX - state.x;
    const dz = state.targetZ - state.z;
    const distance = Math.hypot(dx, dz);
    const speed = distanceToPlayer < 7.5 ? 1.25 : 0.78;
    if (distance > 0.04) {
      const step = Math.min(distance, speed * Math.max(0.001, delta));
      state.x += (dx / distance) * step;
      state.z += (dz / distance) * step;
      if (verticalGap < blockHeight) {
        const separated = pushOutsidePlayerFootprint(state.x, state.z, playerX, playerZ, blockRadius, state.seed + time);
        if (separated.pushed) {
          const safe = clampToWalkable({ x: separated.x, y: 0, z: separated.z }, null, currentZoneId);
          state.x = safe.x;
          state.z = safe.z;
        }
      }
      group.current.rotation.y = Math.atan2(dx, dz);
      animationRef.current = 'walk';
    } else {
      const idleCycle = (time + state.seed * 0.01) % 14;
      animationRef.current = idleCycle > 10 ? 'kneelInspect' : idleCycle > 7 ? 'lookAroundShort' : 'idle';
    }

    const groundY = terrainHeight(state.x, state.z, currentZoneId) + 0.04;
    group.current.position.set(state.x, groundY, state.z);
    setNpcPose?.({
      zoneId: currentZoneId,
      x: state.x,
      y: groundY,
      z: state.z,
      yaw: group.current.rotation.y || 0,
    });
  });

  if (!visible) return null;

  return (
    <group
      ref={group}
      userData={{
        renderSource: 'npc:animal-mode-darwin',
        renderLabel: 'Animal mode Darwin NPC',
        renderKind: 'npc',
      }}
    >
      <ModelAsset id="darwin5" animationSelector={() => animationRef.current} reflect fallback={<ProceduralDarwinNpc />} />
      {stuckDroppings.map(dropping => (
        <DarwinPoopSplat key={dropping.id} dropping={dropping} />
      ))}
      <mesh position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.62, 0.72, 36]} />
        <meshBasicMaterial color="#e1c47a" transparent opacity={0.34} />
      </mesh>
    </group>
  );
}
