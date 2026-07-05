'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getThreeSpecimens } from '../../data';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { emitPropEvent } from '../../physics/props/propEvents';
import {
  SNARE_ARM_SECONDS,
  SNARE_CHARACTER_TRIGGER_RADIUS,
  SNARE_TRIGGER_RADIUS,
  isSnareCompatibleSpecimen,
  snareActorId,
} from '../../snareTraps';

const CHECK_DISTANCE = 2.1;
const PROMPT_POLL_S = 0.12;
const VISIBLE_SNARE_STATUSES = new Set(['set', 'sprung', 'failed', 'sprung-darwin', 'sprung-syms']);

function TwineSegment({ position, length, radius = 0.008, rotation = [0, 0, Math.PI / 2], color = '#9b7a4d' }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function TwineBetween({ from, to, radius = 0.007, color = '#9b7a4d' }) {
  const fromVec = new THREE.Vector3(from[0], from[1], from[2]);
  const toVec = new THREE.Vector3(to[0], to[1], to[2]);
  const midpoint = fromVec.clone().add(toVec).multiplyScalar(0.5);
  const direction = toVec.clone().sub(fromVec);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.lengthSq() > 0.000001 ? direction.normalize() : new THREE.Vector3(0, 1, 0),
  );
  return (
    <mesh castShadow receiveShadow position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, Math.max(0.001, length), 8]} />
      <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function SnareTrapActor({ trap }) {
  const rootRef = useRef(null);
  const loopRef = useRef(null);
  const triggerRef = useRef(null);
  const lureRef = useRef(null);
  const markerRef = useRef(null);
  const pollAt = useRef(0);
  const promptAt = useRef(0);
  const triggeredRef = useRef(false);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const springSnareTrap = useThreeGameStore(state => state.springSnareTrap);
  const springSnareTrapByCharacter = useThreeGameStore(state => state.springSnareTrapByCharacter);
  const specimens = useMemo(() => getThreeSpecimens(trap.zoneId || currentZoneId), [currentZoneId, trap.zoneId]);

  const visible = VISIBLE_SNARE_STATUSES.has(trap.status);
  const triggerRadius = trap.triggerRadius || SNARE_TRIGGER_RADIUS;

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === trap.id) setCarryPrompt(null);
  }, [setCarryPrompt, trap.id]);

  useFrame(({ clock }) => {
    if (!visible || !rootRef.current) return;
    const elapsed = clock.elapsedTime;
    const isSet = trap.status === 'set';
    const isCharacterSprung = trap.status === 'sprung-darwin' || trap.status === 'sprung-syms';
    const isSprung = trap.status === 'sprung' || isCharacterSprung;
    const isFailed = trap.status === 'failed';
    const targetScaleX = isSprung ? 0.5 : isFailed ? 0.82 : 1.28 + Math.sin(elapsed * 2.4 + trap.position.x) * 0.018;
    const targetScaleZ = isSprung ? 0.42 : isFailed ? 0.56 : 0.82 + Math.cos(elapsed * 2.1 + trap.position.z) * 0.012;
    if (loopRef.current) {
      loopRef.current.scale.lerp({ x: targetScaleX, y: targetScaleZ, z: 1 }, 0.18);
      loopRef.current.position.y = isSprung ? 0.075 + Math.sin(elapsed * 11) * 0.004 : 0.026;
      loopRef.current.rotation.z = isFailed ? 0.28 : isSprung ? -0.1 + Math.sin(elapsed * 9) * 0.025 : 0;
    }
    if (triggerRef.current) {
      triggerRef.current.rotation.z = isSprung ? -0.88 : isFailed ? 0.45 : Math.sin(elapsed * 3.1) * 0.04;
      triggerRef.current.position.y = isSprung ? 0.047 : 0.032;
    }
    if (lureRef.current) {
      lureRef.current.visible = isSet;
      lureRef.current.position.y = 0.035 + Math.sin(elapsed * 4.7) * 0.002;
    }
    if (markerRef.current) {
      markerRef.current.rotation.z = Math.sin(elapsed * 1.7 + trap.position.x) * 0.045;
    }

    if (elapsed - promptAt.current >= PROMPT_POLL_S) {
      promptAt.current = elapsed;
      const player = getRuntimePlayerPose()?.position || { x: 0, z: 0 };
      const distance = Math.hypot((player.x || 0) - trap.position.x, (player.z || 0) - trap.position.z);
      const state = useThreeGameStore.getState();
      const activePrompt = state.carryPrompt;
      const ownsPrompt = activePrompt?.id === trap.id;
      if (distance <= CHECK_DISTANCE && (!activePrompt || ownsPrompt || distance < (activePrompt.distance ?? Infinity))) {
        const verb = trap.status === 'sprung' ? 'collect' : (trap.status === 'failed' || isCharacterSprung) ? 'clear' : 'check';
        setCarryPrompt({
          id: trap.id,
          label: trap.targetName || 'snare',
          mode: 'check-snare',
          distance,
          text: `Press E to ${verb} snare`,
        });
      } else if (ownsPrompt) {
        setCarryPrompt(null);
      }
    }

    if (!isSet || elapsed - pollAt.current < 0.16) return;
    pollAt.current = elapsed;
    if (triggeredRef.current) return;
    if (Date.now() - (trap.placedAtRealMs || Date.now()) < SNARE_ARM_SECONDS * 1000) return;
    const state = useThreeGameStore.getState();
    const playerPose = getRuntimePlayerPose()?.position || state.playerPose?.position || { x: 0, z: 0 };
    const playerDistance = Math.hypot((playerPose.x || 0) - trap.position.x, (playerPose.z || 0) - trap.position.z);
    if ((state.playableModeId === 'darwin' || !state.playableModeId) && playerDistance <= SNARE_CHARACTER_TRIGGER_RADIUS) {
      triggeredRef.current = true;
      springSnareTrapByCharacter?.(trap.id, 'darwin');
      emitPropEvent('snare-player-trigger', {
        trapId: trap.id,
        culprit: 'darwin',
        position: { x: trap.position.x, y: trap.position.y, z: trap.position.z },
      });
      return;
    }
    const runtimePositions = state.specimenRuntimePositions?.[trap.zoneId || currentZoneId] || {};
    const collected = new Set(state.collectedSpecimenActorIds || []);
    for (const specimen of specimens) {
      if (!isSnareCompatibleSpecimen(specimen)) continue;
      const actorId = snareActorId(specimen);
      if (!actorId || collected.has(actorId)) continue;
      if (trap.targetActorId && actorId !== trap.targetActorId) continue;
      const runtime = runtimePositions[actorId];
      const spawn = specimen.spawnPoint || [0, 0, 0];
      const x = runtime?.x ?? spawn[0] ?? 0;
      const z = runtime?.z ?? spawn[2] ?? 0;
      if (Math.hypot(x - trap.position.x, z - trap.position.z) <= triggerRadius) {
        triggeredRef.current = true;
        springSnareTrap(trap.id, actorId);
        break;
      }
    }
  });

  if (!visible) return null;

  return (
    <group ref={rootRef} position={[trap.position.x, trap.position.y, trap.position.z]} rotation={[0, trap.yaw || 0, 0]}>
      <mesh receiveShadow position={[0, 0.007, 0.04]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.45, 0.74, 1]}>
        <circleGeometry args={[0.56, 54]} />
        <meshStandardMaterial color="#6f624a" roughness={1} metalness={0} transparent opacity={0.32} depthWrite={false} />
      </mesh>

      <mesh receiveShadow position={[0, 0.012, 0.04]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.53, 56]} />
        <meshStandardMaterial color="#d2bd82" roughness={0.96} transparent opacity={trap.status === 'set' ? 0.32 : 0.18} depthWrite={false} />
      </mesh>

      <mesh ref={loopRef} castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.026, 0.05]}>
        <torusGeometry args={[0.43, 0.014, 10, 72]} />
        <meshStandardMaterial color={trap.status === 'sprung' ? '#d0b06e' : '#a9854f'} roughness={0.94} metalness={0.02} />
      </mesh>

      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.034, 0.05]} scale={[1.12, 0.7, 1]}>
        <torusGeometry args={[0.31, 0.005, 8, 48]} />
        <meshStandardMaterial color="#e1ce98" roughness={0.92} metalness={0.02} />
      </mesh>

      <TwineBetween from={[0.42, 0.035, -0.03]} to={[0.96, 0.065, -0.18]} radius={0.009} />
      <TwineBetween from={[0.3, 0.036, -0.16]} to={[0.89, 0.055, -0.28]} radius={0.006} color="#d0b47a" />
      <TwineSegment position={[-0.45, 0.032, -0.02]} length={0.3} radius={0.007} color="#735936" />

      <mesh castShadow receiveShadow position={[1.02, 0.16, -0.22]} rotation={[0.26, 0, 0.1]}>
        <cylinderGeometry args={[0.032, 0.048, 0.34, 8]} />
        <meshStandardMaterial color="#5f3f22" roughness={0.88} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.05, 0.01, -0.235]} rotation={[0.26, 0, 0.1]}>
        <coneGeometry args={[0.052, 0.12, 8]} />
        <meshStandardMaterial color="#3f2a18" roughness={0.9} />
      </mesh>

      <mesh ref={triggerRef} castShadow receiveShadow position={[0.3, 0.032, 0.47]} rotation={[Math.PI / 2, 0, 0.06]}>
        <cylinderGeometry args={[0.018, 0.014, 0.44, 8]} />
        <meshStandardMaterial color="#6b4b2f" roughness={0.9} />
      </mesh>

      <group ref={lureRef} position={[-0.08, 0.035, 0.1]}>
        <mesh castShadow>
          <sphereGeometry args={[0.034, 8, 5]} />
          <meshStandardMaterial color="#c3a55f" roughness={0.86} />
        </mesh>
        <mesh castShadow position={[0.06, 0.002, -0.045]} scale={[0.7, 0.45, 0.7]}>
          <sphereGeometry args={[0.024, 7, 5]} />
          <meshStandardMaterial color="#d0bb7b" roughness={0.88} />
        </mesh>
      </group>

      <group ref={markerRef} position={[0.72, 0.15, 0.36]} rotation={[0.1, 0, -0.18]}>
        <TwineBetween from={[0, 0, 0]} to={[0.03, 0.36, 0.02]} radius={0.006} color="#7c6038" />
        <mesh castShadow position={[0.038, 0.39, 0.025]} rotation={[0, 0.2, 0.15]}>
          <boxGeometry args={[0.18, 0.05, 0.018]} />
          <meshStandardMaterial color="#d8c389" roughness={0.9} />
        </mesh>
      </group>

      {(trap.status === 'sprung' || trap.status === 'sprung-darwin' || trap.status === 'sprung-syms') && (
        <mesh position={[0, 0.09, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.008, 8, 40]} />
          <meshStandardMaterial color="#d7bd7a" roughness={0.86} emissive="#3a2a10" emissiveIntensity={0.08} />
        </mesh>
      )}
    </group>
  );
}

export function SnareTraps() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const traps = useThreeGameStore(state => state.snareTraps || []);
  const visibleTraps = traps.filter(trap => trap.zoneId === currentZoneId && VISIBLE_SNARE_STATUSES.has(trap.status));
  if (!visibleTraps.length) return null;
  return visibleTraps.map(trap => <SnareTrapActor key={trap.id} trap={trap} />);
}
