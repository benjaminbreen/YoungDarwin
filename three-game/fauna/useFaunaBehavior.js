'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { isWalkableTerrain, terrainBiomeAt, terrainHeight } from '../world/terrain';
import { getFaunaBehaviorProfile } from './faunaBehaviorProfiles';

// Beyond this distance from the player, fauna simulate at FAR_SIM_INTERVAL
// instead of every frame. The expensive terrain sampling dominates the cost,
// and distant motion isn't closely watched. The gate is always kept well
// outside a profile's alert radius so reactions near the player stay instant.
const FAR_SIM_RADIUS = 42;
const FAR_SIM_INTERVAL = 1 / 6;

// Shared scratch for pickWaypoint so its 10-attempt search allocates nothing.
// Safe because the caller copies the returned vector before pickWaypoint runs
// again (single-threaded, sequential).
const _wpCandidate = new THREE.Vector2();
const _wpBest = new THREE.Vector2();

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

function clampOffset(offset, habitat, target = new THREE.Vector2()) {
  const radiusX = Math.max(0.05, habitat.radiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || 0.2);
  const normalizedX = offset.x / radiusX;
  const normalizedY = offset.y / radiusZ;
  const lengthSq = normalizedX * normalizedX + normalizedY * normalizedY;
  if (lengthSq <= 1) return target.copy(offset);
  const scale = 1 / Math.sqrt(lengthSq);
  return target.set(normalizedX * radiusX * scale, normalizedY * radiusZ * scale);
}

function yawFromXZ(direction) {
  return Math.atan2(direction.x, direction.y);
}

function smoothStep(from, to, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(from, to, eased);
}

function profileRange(value, fallback) {
  if (Array.isArray(value)) return value;
  if (Number.isFinite(value)) return [value, value];
  return fallback;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function biomeAllowed(profile, biome) {
  if (profile.avoidBiomes?.includes(biome)) return false;
  if (profile.allowedBiomes?.length && !profile.allowedBiomes.includes(biome)) return false;
  return true;
}

function pickWaypoint({ profile, habitat, base, zoneId, seed, index, current }) {
  const radiusX = Math.max(0.05, habitat.radiusX || profile.habitatRadiusX || 0.4);
  const radiusZ = Math.max(0.05, habitat.radiusZ || profile.habitatRadiusZ || 0.2);
  const baseSeed = (seed + 0.13) * 1000 + index * 37.17;
  const best = _wpBest.copy(current);
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = seededUnit(baseSeed + attempt * 13.7) * Math.PI * 2;
    const distance = Math.sqrt(seededUnit(baseSeed + attempt * 19.9));
    const candidate = _wpCandidate.set(
      Math.cos(angle) * radiusX * distance,
      Math.sin(angle) * radiusZ * distance,
    );
    const worldX = base.x + candidate.x;
    const worldZ = base.z + candidate.y;
    if (!isWalkableTerrain(worldX, worldZ, zoneId)) continue;
    const groundY = terrainHeight(worldX, worldZ, zoneId);
    const biome = terrainBiomeAt(worldX, worldZ, groundY, zoneId);
    if (!biomeAllowed(profile, biome)) continue;
    const travel = candidate.distanceTo(current);
    const edge = 1 - Math.min(1, Math.hypot(candidate.x / radiusX, candidate.y / radiusZ));
    const score = travel * 0.9 + edge * 0.35 + seededUnit(baseSeed + attempt * 7.3) * 0.2;
    if (score > bestScore) {
      best.copy(candidate);
      bestScore = score;
    }
  }

  return best;
}

function publishRuntimePosition(publisher, ref, specimenId, zoneId, position, now, force = false) {
  if (
    !Number.isFinite(position?.x)
    || !Number.isFinite(position?.y)
    || !Number.isFinite(position?.z)
  ) return;
  const previous = ref.current;
  const dx = position.x - previous.x;
  const dy = position.y - previous.y;
  const dz = position.z - previous.z;
  if (!force && now - previous.time < 0.22 && Math.hypot(dx, dy, dz) < 0.45) return;
  publisher(specimenId, { x: position.x, y: position.y, z: position.z }, zoneId);
  if (typeof window !== 'undefined') {
    window.__faunaMotionDebug = {
      ...(window.__faunaMotionDebug || {}),
      [specimenId]: {
        x: position.x,
        y: position.y,
        z: position.z,
        zoneId,
        updatedAt: now,
      },
    };
  }
  ref.current = { x: position.x, y: position.y, z: position.z, time: now };
}

export function useFaunaBehavior({ specimen, groupRef, basePosition, collected }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const setSpecimenRuntimePosition = useThreeGameStore(state => state.setSpecimenRuntimePosition);
  const profile = useMemo(() => getFaunaBehaviorProfile(specimen), [specimen]);
  const seed = useMemo(() => seedFromSpecimen(specimen), [specimen]);
  const habitat = useMemo(() => (profile ? habitatFor(specimen, profile) : null), [profile, specimen]);
  const offset = useRef(new THREE.Vector2(0, 0));
  const waypoint = useRef(new THREE.Vector2(0, 0));
  const waypointIndex = useRef(0);
  const waitUntil = useRef(0);
  const phase = useRef(0);
  const simAccumulator = useRef(0);
  const publishRef = useRef({ x: Infinity, y: Infinity, z: Infinity, time: -Infinity });
  const scratch = useRef({
    awayFromPlayer: new THREE.Vector2(),
    toWaypoint: new THREE.Vector2(),
    direction: new THREE.Vector2(),
    sidestep: new THREE.Vector2(),
    proposed: new THREE.Vector2(),
    clamped: new THREE.Vector2(),
  });

  useEffect(() => {
    if (!profile || !basePosition) return;
    offset.current.set(0, 0);
    waypoint.current.set(0, 0);
    waypointIndex.current = 0;
    waitUntil.current = 0;
    phase.current = seed * 10;
    const initial = {
      x: basePosition.x,
      y: basePosition.y,
      z: basePosition.z,
    };
    publishRuntimePosition(setSpecimenRuntimePosition, publishRef, specimen.id, currentZoneId, initial, 0, true);
  }, [basePosition, currentZoneId, profile, seed, setSpecimenRuntimePosition, specimen.id]);

  useFrame(({ clock, delta }) => {
    if (!profile || !habitat || !groupRef.current || collected) return;
    // While Darwin carries this animal, SpecimenActor drives its transform.
    if (useThreeGameStore.getState().carriedObjectId === specimen.id) return;

    const base = basePosition;
    if (
      !Number.isFinite(base?.x)
      || !Number.isFinite(base?.y)
      || !Number.isFinite(base?.z)
    ) return;
    const current = offset.current;
    const playerPose = getRuntimePlayerPose();
    const player = playerPose?.position || { x: base.x, z: base.z };
    const worldX = base.x + current.x;
    const worldZ = base.z + current.y;
    const vectors = scratch.current;
    const awayFromPlayer = vectors.awayFromPlayer.set(worldX - player.x, worldZ - player.z);
    const distanceToPlayer = awayFromPlayer.length();

    // Throttle distant fauna: the per-frame terrain sampling below dominates
    // the cost. The threshold sits outside the alert radius so panic/flee near
    // the player still runs every frame.
    simAccumulator.current += delta;
    const farThreshold = Math.max(FAR_SIM_RADIUS, profile.alertRadius + 8);
    if (distanceToPlayer > farThreshold && simAccumulator.current < FAR_SIM_INTERVAL) return;
    const t = clock.elapsedTime;
    const dt = Math.min(0.2, Math.max(0.001, simAccumulator.current));
    simAccumulator.current = 0;
    const panic = distanceToPlayer < profile.alertRadius
      ? THREE.MathUtils.clamp((profile.alertRadius - distanceToPlayer) / Math.max(0.01, profile.alertRadius - profile.panicRadius), 0, 1)
      : 0;

    phase.current += dt * (profile.patrolRate || 0.5);
    const toWaypoint = vectors.toWaypoint.copy(waypoint.current).sub(current);
    const waypointDistance = toWaypoint.length();
    if (t >= waitUntil.current && waypointDistance < 0.28) {
      waypointIndex.current += 1;
      waypoint.current.copy(pickWaypoint({
        profile,
        habitat,
        base,
        zoneId: currentZoneId,
        seed,
        index: waypointIndex.current,
        current,
      }));
      const [minTarget, maxTarget] = profileRange(profile.targetInterval, [1.5, 3.5]);
      waitUntil.current = t + THREE.MathUtils.lerp(minTarget, maxTarget, seededUnit(seed * 1000 + waypointIndex.current * 23));
    }

    const direction = vectors.direction.set(0, 0);
    if (panic > 0.01) {
      if (awayFromPlayer.lengthSq() > 0.0001) direction.copy(awayFromPlayer).normalize();
      else direction.set(1, 0);
      const sidestep = vectors.sidestep
        .set(-direction.y, direction.x)
        .multiplyScalar(Math.sin(t * 2.0 + seed * 5.0) * 0.22 * panic);
      direction.add(sidestep).normalize();
    } else if (t >= waitUntil.current) {
      direction.copy(waypoint.current).sub(current);
      if (direction.lengthSq() > 0.0001) direction.normalize();
    }

    const speed = panic > 0.01
      ? smoothStep(profile.walkSpeed, profile.fleeSpeed, panic)
      : profile.walkSpeed;
    const proposed = vectors.proposed.copy(current).addScaledVector(direction, speed * dt);
    let movementTarget = proposed;
    const proposedWorldX = base.x + proposed.x;
    const proposedWorldZ = base.z + proposed.y;
    const proposedGroundY = terrainHeight(proposedWorldX, proposedWorldZ, currentZoneId);
    const proposedBiome = terrainBiomeAt(proposedWorldX, proposedWorldZ, proposedGroundY, currentZoneId);
    if (
      direction.lengthSq() > 0.0001
      && (!isWalkableTerrain(proposedWorldX, proposedWorldZ, currentZoneId) || !biomeAllowed(profile, proposedBiome))
    ) {
      waypointIndex.current += 1;
      waypoint.current.copy(pickWaypoint({
        profile,
        habitat,
        base,
        zoneId: currentZoneId,
        seed,
        index: waypointIndex.current,
        current,
      }));
      direction.set(0, 0);
      movementTarget = current;
    }
    const clamped = clampOffset(movementTarget, habitat, vectors.clamped);
    const blocked = clamped.distanceTo(movementTarget) > 0.0005;

    if (profile.cornerable && blocked && panic > 0.45) {
      offset.current.copy(clamped);
    } else {
      offset.current.copy(clamped);
    }

    const x = base.x + offset.current.x;
    const z = base.z + offset.current.y;
    const groundY = terrainHeight(x, z, currentZoneId) + (profile.groundOffset || 0.04);
    const moving = direction.lengthSq() > 0.0001;
    const bob = Math.abs(Math.sin(t * (moving ? 5.2 : 1.7) + seed)) * (profile.bobAmount || 0) * (moving ? 1 : 0.25);
    const parentScale = groupRef.current.parent?.scale || { x: 1, y: 1, z: 1 };
    groupRef.current.position.set(
      offset.current.x / (parentScale.x || 1),
      (groundY - base.y + bob) / (parentScale.y || 1),
      offset.current.y / (parentScale.z || 1),
    );
    if (direction.lengthSq() > 0.0001) {
      const targetYaw = yawFromXZ(direction);
      const turnRate = profile.turnRate || 10;
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetYaw, turnRate, dt);
    }

    publishRuntimePosition(setSpecimenRuntimePosition, publishRef, specimen.id, currentZoneId, { x, y: groundY, z }, t);
  });

  return {
    active: Boolean(profile),
    profile,
  };
}
