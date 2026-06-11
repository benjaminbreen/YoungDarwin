'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { movementTerrainHeight, isWalkableTerrain } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import { onPropEvent, emitPropEvent } from './propEvents';
import { PropVisual, HighlightRing } from './PropVisuals';

const PICKUP_DISTANCE = 2.15;
const HOLD_DISTANCE = 1.12;
const STRIKE_RANGE = 2.6;
const STRIKE_FACING_DOT = 0.3;
const IDLE_PROP_ACTIVE_DISTANCE_SQ = 8 * 8;

function vectorFromStore(value, fallback = new THREE.Vector3()) {
  if (!value) return fallback.clone();
  return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
}

function PropCollider({ prop, colliderRef, sensor }) {
  const { shape } = prop.collider;
  const common = { ref: colliderRef, friction: prop.friction, restitution: prop.restitution, sensor };
  if (shape === 'cuboid') return <CuboidCollider {...common} args={prop.collider.halfExtents} />;
  if (shape === 'ball') return <BallCollider {...common} args={[prop.collider.radius]} />;
  return <CylinderCollider {...common} args={[prop.collider.halfHeight, prop.collider.radius]} />;
}

// A single dynamic physics prop. Behaviors (carryable / breakable /
// strikeable) come from the prop's type config; see propTypes.js.
export function PhysicsProp({ prop, onBreak }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const carriedRef = useRef(false);
  const inWaterRef = useRef(false);
  const pendingStrikesRef = useRef([]);
  const clockRef = useRef(0);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);

  // Stable reference: userData is a "mutable option" in react-three-rapier,
  // and an inline object here makes its options effect re-run every render,
  // re-applying the type prop and clobbering carry state.
  const userData = useMemo(
    () => ({ id: prop.id, kind: `physics-${prop.type}` }),
    [prop.id, prop.type],
  );
  const spawnY = useMemo(
    () => movementTerrainHeight(prop.x, prop.z, currentZoneId) + prop.restOffset + 0.05,
    [currentZoneId, prop],
  );
  const isPrompted = carryPrompt?.id === prop.id;
  const isCarried = carriedObjectId === prop.id;
  const breakable = prop.behaviors?.breakable;
  const strikeable = prop.behaviors?.strikeable;
  const carryable = prop.behaviors?.carryable;
  const buoyant = prop.behaviors?.buoyant;

  // Queue tool swings; the hit lands impactDelay seconds into the animation.
  useEffect(() => {
    if (!breakable && !strikeable) return undefined;
    return onPropEvent('tool-swing', event => {
      const responds = (breakable && event.tool === breakable.tool)
        || (strikeable && event.tool === strikeable.tool);
      if (!responds) return;
      pendingStrikesRef.current.push({ ...event, at: clockRef.current + (event.impactDelay ?? 0.55) });
    });
  }, [breakable, strikeable]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
  }, [prop.id, setCarryPrompt]);

  // Carry transitions. Body type and sensor flips are declared on the JSX
  // below (type/sensor props) because react-three-rapier re-applies its
  // `type` option whenever its options effect re-runs — an imperative
  // setBodyType gets silently reverted to "dynamic" on the next re-render.
  // This effect runs after RigidBody's own effects, so on drop the body is
  // already dynamic when the release toss is applied.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !carryable) return;
    if (isCarried) {
      carriedRef.current = true;
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
    } else if (carriedRef.current) {
      carriedRef.current = false;
      const pose = useThreeGameStore.getState().playerPose;
      const facing = vectorFromStore(pose?.facing, new THREE.Vector3(0, 0, -1));
      if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
      facing.normalize();
      body.wakeUp();
      body.setLinvel({ x: facing.x * carryable.release, y: 0.02, z: facing.z * carryable.release }, true);
      body.setAngvel({ x: facing.z * -carryable.release * 1.8, y: 0, z: facing.x * carryable.release * 1.8 }, true);
    }
  }, [carryable, isCarried]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    clockRef.current += delta;

    const translation = body.translation();
    const propPosition = new THREE.Vector3(translation.x, translation.y, translation.z);

    // Resolve queued tool strikes once their impact moment arrives.
    if (pendingStrikesRef.current.length) {
      const due = pendingStrikesRef.current.filter(s => s.at <= clockRef.current);
      if (due.length) {
        pendingStrikesRef.current = pendingStrikesRef.current.filter(s => s.at > clockRef.current);
        for (const strike of due) {
          const origin = vectorFromStore(strike.position);
          const facing = vectorFromStore(strike.facing, new THREE.Vector3(0, 0, -1)).setY(0).normalize();
          const toProp = propPosition.clone().sub(origin).setY(0);
          const distance = toProp.length();
          if (distance > STRIKE_RANGE) continue;
          if (distance > 0.2 && toProp.clone().normalize().dot(facing) < STRIKE_FACING_DOT) continue;
          const impactDir = distance > 0.2 ? toProp.normalize() : facing;
          if (breakable && strike.tool === breakable.tool) {
            onBreak?.(prop, {
              position: { x: translation.x, y: translation.y, z: translation.z },
              impactDir: { x: impactDir.x, y: 0, z: impactDir.z },
            });
            return;
          }
          if (strikeable && strike.tool === strikeable.tool) {
            body.wakeUp();
            body.applyImpulse({
              x: impactDir.x * strikeable.impulse,
              y: strikeable.impulse * 0.22,
              z: impactDir.z * strikeable.impulse,
            }, true);
          }
        }
      }
    }

    const playerPose = useThreeGameStore.getState().playerPose;
    if (
      body.isSleeping?.()
      && !isCarried
      && !buoyant
      && !inWaterRef.current
      && !pendingStrikesRef.current.length
    ) {
      const playerX = playerPose?.position?.x || 0;
      const playerZ = playerPose?.position?.z || 0;
      const dx = translation.x - playerX;
      const dz = translation.z - playerZ;
      const activePrompt = useThreeGameStore.getState().carryPrompt;
      if (dx * dx + dz * dz > IDLE_PROP_ACTIVE_DISTANCE_SQ) {
        if (activePrompt?.id === prop.id) setCarryPrompt(null);
        return;
      }
    }

    const player = vectorFromStore(playerPose.position);
    const facing = vectorFromStore(playerPose.facing, new THREE.Vector3(0, 0, -1));
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();

    if (carryable) {
      // Only steer the body once the carry effect has flipped it kinematic;
      // before that, setNextKinematicTranslation would teleport a dynamic body.
      if (isCarried && carriedRef.current) {
        // Sleeping bodies are skipped by @react-three/rapier's mesh sync and
        // setNextKinematicTranslation does not wake them, so keep it awake.
        body.wakeUp();
        const target = player.clone().addScaledVector(facing, HOLD_DISTANCE);
        target.y += carryable.holdHeight;
        body.setNextKinematicTranslation(target);
        setCarryPrompt({
          id: prop.id,
          label: prop.label,
          mode: 'drop',
          distance: 0,
          text: `Press E to drop ${prop.label}`,
        });
        return;
      }
      // Transition frame: carried but the effect hasn't run yet — hold off.
      if (isCarried) return;

      const distance = propPosition.distanceTo(player);
      const activePrompt = useThreeGameStore.getState().carryPrompt;
      if (!activePrompt || activePrompt.id === prop.id || distance < (activePrompt.distance ?? Infinity)) {
        if (distance <= PICKUP_DISTANCE) {
          setCarryPrompt({
            id: prop.id,
            label: prop.label,
            mode: 'pickup',
            distance,
            text: `Press E to pick up ${prop.label}`,
          });
        } else if (activePrompt?.id === prop.id) {
          setCarryPrompt(null);
        }
      }
    }

    // --- Water: splash on entry, buoyancy/current for floating props -------
    const seabedY = movementTerrainHeight(translation.x, translation.z, currentZoneId);
    // Deep enough to float in vs. merely off the walkable shelf (wet shallows
    // start well above WATER_LEVEL; isWalkableTerrain cuts off at y <= -0.82).
    const overWater = seabedY < WATER_LEVEL - 0.12;
    const nearWater = seabedY < WATER_LEVEL + 0.55;
    const inWater = nearWater && translation.y < WATER_LEVEL + 0.08;
    if (inWater && !inWaterRef.current) {
      const velocity = body.linvel();
      emitPropEvent('water-splash', {
        position: { x: translation.x, y: WATER_LEVEL, z: translation.z },
        intensity: THREE.MathUtils.clamp(Math.abs(velocity.y) / 5 + 0.25, 0.3, 1),
      });
    }
    inWaterRef.current = inWater;

    if (buoyant && overWater && translation.y < WATER_LEVEL + buoyant.rideHeight + 0.35) {
      body.wakeUp();
      const velocity = body.linvel();
      // Steer velocity toward a target instead of integrating a spring with
      // impulses — exponential blending cannot add energy, so no trampoline
      // resonance regardless of frame rate vs. physics step.
      const bobY = Math.sin(clockRef.current * 1.35 + prop.x * 0.7 + prop.z * 1.3) * buoyant.bob;
      const depthError = (WATER_LEVEL + buoyant.rideHeight + bobY) - translation.y;
      const targetVy = THREE.MathUtils.clamp(depthError * 3.0, -1.4, 1.6);
      // Current flows toward deeper water (downhill on the seabed), so flotsam
      // drifts out of the cove instead of beaching itself.
      const step = 1.4;
      let flowX = movementTerrainHeight(translation.x - step, translation.z, currentZoneId)
        - movementTerrainHeight(translation.x + step, translation.z, currentZoneId);
      let flowZ = movementTerrainHeight(translation.x, translation.z - step, currentZoneId)
        - movementTerrainHeight(translation.x, translation.z + step, currentZoneId);
      const flowLength = Math.hypot(flowX, flowZ) || 1;
      flowX /= flowLength;
      flowZ /= flowLength;
      const swirl = Math.sin(clockRef.current * 0.45 + prop.z * 0.5) * 0.35;
      const targetVx = (flowX - flowZ * swirl) * buoyant.currentSpeed;
      const targetVz = (flowZ + flowX * swirl) * buoyant.currentSpeed;
      const dt = Math.min(delta, 0.05);
      const blendXZ = 1 - Math.exp(-buoyant.drag * dt);
      const blendY = 1 - Math.exp(-buoyant.strength * 0.2 * dt);
      body.setLinvel({
        x: velocity.x + (targetVx - velocity.x) * blendXZ,
        y: velocity.y + (targetVy - velocity.y) * blendY,
        z: velocity.z + (targetVz - velocity.z) * blendXZ,
      }, true);
      // Damp spin and add a gentle roll so it reads as bobbing, not gliding.
      const spin = body.angvel();
      const angularKeep = Math.max(0, 1 - buoyant.angularDrag * delta);
      body.setAngvel({
        x: spin.x * angularKeep + Math.sin(clockRef.current * 1.1 + prop.x) * 0.04 * delta * 60 * 0.02,
        y: spin.y * angularKeep,
        z: spin.z * angularKeep + Math.cos(clockRef.current * 0.9 + prop.z) * 0.04 * delta * 60 * 0.02,
      }, true);
    }

    // Fail-safe only: respawn props that escape the world. Normal resting
    // contact is left entirely to rapier — no per-frame snapping. Props in a
    // water column are exempt (floaters bob, sinkers rest on the seabed), but
    // anything drifting past the rendered sea gets recalled.
    const driftedTooFar = Math.hypot(translation.x - prop.x, translation.z - prop.z) > 68;
    const escapedLand = !isWalkableTerrain(translation.x, translation.z, currentZoneId) && !nearWater;
    if (escapedLand || driftedTooFar || translation.y < Math.min(seabedY, WATER_LEVEL) - 6) {
      body.setTranslation({ x: prop.x, y: spawnY, z: prop.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      inWaterRef.current = false;
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type={isCarried ? 'kinematicPosition' : 'dynamic'}
      colliders={false}
      position={[prop.x, spawnY, prop.z]}
      rotation={prop.rotation}
      linearDamping={prop.linearDamping}
      angularDamping={prop.angularDamping}
      mass={prop.mass}
      canSleep
      ccd
      additionalSolverIterations={4}
      userData={userData}
    >
      <PropCollider prop={prop} colliderRef={colliderRef} sensor={isCarried} />
      <PropVisual visual={prop.visual} />
      <HighlightRing visible={isPrompted || isCarried} />
    </RigidBody>
  );
}
