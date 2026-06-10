'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../store';
import { terrainHeight } from '../world/terrain';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';

function seedFromSpecimen(specimen) {
  const text = `${specimen.id}:${specimen.spawnPoint?.join(',')}:${specimen.behavior || 'still'}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function habitatFor(specimen, profile) {
  const radiusX = Number(specimen?.habitatRadiusX);
  const radiusZ = Number(specimen?.habitatRadiusZ);
  return {
    radiusX: Number.isFinite(radiusX) && radiusX > 0 ? radiusX : profile.habitatRadiusX,
    radiusZ: Number.isFinite(radiusZ) && radiusZ > 0 ? radiusZ : profile.habitatRadiusZ,
  };
}

function clampOffset(offset, habitat) {
  const radiusX = Math.max(0.05, habitat.radiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || 0.2);
  const normalized = new THREE.Vector2(offset.x / radiusX, offset.y / radiusZ);
  if (normalized.lengthSq() <= 1) return offset;
  const scale = 1 / normalized.length();
  return new THREE.Vector2(normalized.x * radiusX * scale, normalized.y * radiusZ * scale);
}

function yawFromXZ(direction) {
  return Math.atan2(direction.x, direction.y);
}

function smoothStep(from, to, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(from, to, eased);
}

export function useFaunaBehavior({ specimen, groupRef, basePosition, collected }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setSpecimenRuntimePosition = useThreeGameStore(state => state.setSpecimenRuntimePosition);
  const profile = useMemo(() => getFaunaBehaviorProfile(specimen), [specimen]);
  const seed = useMemo(() => seedFromSpecimen(specimen), [specimen]);
  const habitat = useMemo(() => (profile ? habitatFor(specimen, profile) : null), [profile, specimen]);
  const offset = useRef(new THREE.Vector2(0, 0));
  const phase = useRef(0);

  useEffect(() => {
    if (!profile || !basePosition) return;
    offset.current.set(0, 0);
    phase.current = seed * 10;
    setSpecimenRuntimePosition(specimen.id, {
      x: basePosition.x,
      y: basePosition.y,
      z: basePosition.z,
    }, currentZoneId);
  }, [basePosition, currentZoneId, profile, seed, setSpecimenRuntimePosition, specimen.id]);

  useFrame(({ clock, delta }) => {
    if (!profile || !habitat || !groupRef.current || collected) return;
    // While Darwin carries this animal, SpecimenActor drives its transform.
    if (useThreeGameStore.getState().carriedObjectId === specimen.id) return;

    const t = clock.elapsedTime;
    const dt = Math.min(0.07, Math.max(0.001, delta));
    const base = basePosition;
    const current = offset.current;
    const playerPose = useThreeGameStore.getState().playerPose;
    const player = playerPose?.position || { x: base.x, z: base.z };
    const worldX = base.x + current.x;
    const worldZ = base.z + current.y;
    const awayFromPlayer = new THREE.Vector2(worldX - player.x, worldZ - player.z);
    const distanceToPlayer = awayFromPlayer.length();
    const panic = distanceToPlayer < profile.alertRadius
      ? THREE.MathUtils.clamp((profile.alertRadius - distanceToPlayer) / Math.max(0.01, profile.alertRadius - profile.panicRadius), 0, 1)
      : 0;

    phase.current += dt * profile.patrolRate;
    const patrolTarget = clampOffset(new THREE.Vector2(
      Math.sin(phase.current + seed * 6.3) * habitat.radiusX,
      Math.cos(phase.current * 0.73 + seed * 3.1) * habitat.radiusZ,
    ), habitat);

    let direction = new THREE.Vector2(0, 0);
    if (panic > 0.01) {
      direction = awayFromPlayer.lengthSq() > 0.0001
        ? awayFromPlayer.clone().normalize()
        : new THREE.Vector2(1, 0);
      const sidestep = new THREE.Vector2(-direction.y, direction.x)
        .multiplyScalar(Math.sin(t * 2.0 + seed * 5.0) * 0.22 * panic);
      direction.add(sidestep).normalize();
    } else {
      direction = patrolTarget.clone().sub(current);
      if (direction.lengthSq() > 0.0001) direction.normalize();
    }

    const speed = panic > 0.01
      ? smoothStep(profile.walkSpeed, profile.fleeSpeed, panic)
      : profile.walkSpeed;
    const proposed = current.clone().add(direction.clone().multiplyScalar(speed * dt));
    const clamped = clampOffset(proposed, habitat);
    const blocked = clamped.distanceTo(proposed) > 0.0005;

    if (profile.cornerable && blocked && panic > 0.45) {
      offset.current.copy(clamped);
    } else {
      offset.current.copy(clamped);
    }

    const x = base.x + offset.current.x;
    const z = base.z + offset.current.y;
    const groundY = terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.04);
    const bob = Math.abs(Math.sin(t * 2.4 + seed)) * (profile.bobAmount || 0);
    const parentScale = groupRef.current.parent?.scale || { x: 1, y: 1, z: 1 };
    groupRef.current.position.set(
      offset.current.x / (parentScale.x || 1),
      (groundY - base.y + bob) / (parentScale.y || 1),
      offset.current.y / (parentScale.z || 1),
    );
    if (direction.lengthSq() > 0.0001) {
      groupRef.current.rotation.y = yawFromXZ(direction);
    }

    setSpecimenRuntimePosition(specimen.id, { x, y: groundY, z }, currentZoneId);
  });

  return {
    active: Boolean(profile),
    profile,
  };
}
