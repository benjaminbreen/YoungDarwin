'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { movementTerrainHeight, isWalkableTerrain } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import {
  DEFAULT_MOBILITY,
  canPickupObject,
  canPushObject,
  isDownhillMoveAllowed,
  normalizeMobility,
} from '../objectMobility';
import { onPropEvent, emitPropEvent } from './propEvents';
import { PropVisual, HighlightRing } from './PropVisuals';

const PICKUP_DISTANCE = 2.15;
const STRIKE_RANGE = 2.6;
const STRIKE_FACING_DOT = 0.3;
const IDLE_PROP_ACTIVE_DISTANCE_SQ = 8 * 8;
const PLAYER_PUSH_CONTACT_COOLDOWN = 0.18;
const PLAYER_PUSH_FACING_DOT = 0.48;
const ZERO_VECTOR = { x: 0, y: 0, z: 0 };
const DEFAULT_FACING = { x: 0, y: 0, z: -1 };
const DEFAULT_HOLD_OFFSET = [0.32, 1.02, 0.24];
const DEFAULT_HOLD_ROTATION = [0, 0, -0.18];

function vectorFromStore(value, target, fallback = ZERO_VECTOR) {
  const source = value || fallback;
  return target.set(source.x || 0, source.y || 0, source.z || 0);
}

function propPickupRadius(prop) {
  const scale = prop.scale || 1;
  const collider = prop.collider || {};
  if (collider.shape === 'cuboid') {
    const [hx = 0, , hz = 0] = collider.halfExtents || [];
    return Math.hypot(hx * scale, hz * scale);
  }
  if (collider.shape === 'ball') return (collider.radius || 0) * scale;
  return (collider.radius || 0) * scale;
}

function propInteractionHeight(prop) {
  const scale = prop.scale || 1;
  const collider = prop.collider || {};
  if (collider.shape === 'cuboid') return (collider.halfExtents?.[1] || 0.45) * 2 * scale;
  if (collider.shape === 'ball') return (collider.radius || 0.34) * 2 * scale;
  return (collider.halfHeight || 0.45) * 2 * scale;
}

function isPlayerCollisionTarget(target) {
  return target?.rigidBodyObject?.userData?.kind === 'player'
    || target?.colliderObject?.userData?.kind === 'player'
    || target?.colliderObject?.parent?.userData?.kind === 'player';
}

function mobilityFor(prop) {
  if (prop.behaviors?.mobility) return normalizeMobility(prop.behaviors.mobility);
  if (prop.fixed) return normalizeMobility(null, 'fixed');
  if (prop.behaviors?.carryable) return normalizeMobility(null, 'pickup');
  return normalizeMobility();
}

function isSidewaysBarrel(prop, mobility) {
  if (mobility.rotationPolicy !== 'autoBarrel') return false;
  const [rx = 0, , rz = 0] = prop.rotation || [];
  return Math.abs(Math.sin(rx)) > 0.55 || Math.abs(Math.sin(rz)) > 0.55;
}

function clampAngularVelocity(body, mobility, sidewaysBarrel) {
  const angularMax = sidewaysBarrel
    ? mobility.angularMax
    : (mobility.uprightAngularMax ?? mobility.angularMax);
  if (!angularMax) return;
  const spin = body.angvel();
  const yawMax = mobility.yawAngularMax ?? Math.max(angularMax, 0.65);
  const x = THREE.MathUtils.clamp(spin.x, -angularMax, angularMax);
  const y = THREE.MathUtils.clamp(spin.y, -yawMax, yawMax);
  const z = THREE.MathUtils.clamp(spin.z, -angularMax, angularMax);
  if (x !== spin.x || y !== spin.y || z !== spin.z) {
    body.setAngvel({ x, y, z }, true);
  }
}

function computeCarryPose(player, facing, carryable, scratch) {
  const offset = carryable?.holdOffset || DEFAULT_HOLD_OFFSET;
  const rotation = carryable?.holdRotation || DEFAULT_HOLD_ROTATION;
  const { carryTarget: target, carryQuaternion: quaternion, carryForward: forward, carryRight: right, carryEuler: euler } = scratch;
  forward.copy(facing).setY(0);
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();
  right.set(forward.z, 0, -forward.x).normalize();
  target.copy(player)
    .addScaledVector(right, offset[0] || 0)
    .addScaledVector(forward, offset[2] ?? 0.24);
  target.y += offset[1] ?? carryable?.holdHeight ?? 1.02;

  const yaw = Math.atan2(forward.x, forward.z);
  euler.set(
    rotation[0] || 0,
    yaw + (rotation[1] || 0),
    rotation[2] || 0,
    'YXZ',
  );
  quaternion.setFromEuler(euler);
}

function PropCollider({ prop, colliderRef, sensor }) {
  const { shape } = prop.collider;
  const scale = prop.scale || 1;
  const common = { ref: colliderRef, friction: prop.friction, restitution: prop.restitution, sensor };
  if (shape === 'cuboid') return <CuboidCollider {...common} args={prop.collider.halfExtents.map(value => value * scale)} />;
  if (shape === 'ball') return <BallCollider {...common} args={[prop.collider.radius * scale]} />;
  return <CylinderCollider {...common} args={[prop.collider.halfHeight * scale, prop.collider.radius * scale]} />;
}

// A single dynamic physics prop. Behaviors (carryable / breakable /
// strikeable) come from the prop's type config; see propTypes.js.
export function PhysicsProp({ prop, onBreak }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const carriedRef = useRef(false);
  const inWaterRef = useRef(false);
  const pendingStrikesRef = useRef([]);
  const lastPlayerPushContactRef = useRef(-10);
  const clockRef = useRef(0);
  const scratch = useRef({
    origin: new THREE.Vector3(),
    facing: new THREE.Vector3(),
    toProp: new THREE.Vector3(),
    propPosition: new THREE.Vector3(),
    player: new THREE.Vector3(),
    carryTarget: new THREE.Vector3(),
    carryQuaternion: new THREE.Quaternion(),
    carryForward: new THREE.Vector3(),
    carryRight: new THREE.Vector3(),
    carryEuler: new THREE.Euler(),
  });
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const propScale = prop.scale || 1;

  // Stable reference: userData is a "mutable option" in react-three-rapier,
  // and an inline object here makes its options effect re-run every render,
  // re-applying the type prop and clobbering carry state.
  const userData = useMemo(
    () => ({ id: prop.id, kind: `physics-${prop.type}` }),
    [prop.id, prop.type],
  );
  const spawnY = useMemo(
    () => movementTerrainHeight(prop.x, prop.z, currentZoneId) + (prop.restOffset * propScale) + 0.05,
    [currentZoneId, prop, propScale],
  );
  const isPrompted = carryPrompt?.id === prop.id;
  const isCarried = carriedObjectId === prop.id;
  const breakable = prop.behaviors?.breakable;
  const strikeable = prop.behaviors?.strikeable;
  const mobility = mobilityFor(prop);
  const carryable = canPickupObject(mobility, prop.behaviors?.carryable) ? prop.behaviors.carryable : null;
  const buoyant = prop.behaviors?.buoyant;
  const propMass = prop.mass * Math.pow(propScale, 2.2);
  const fixedBody = prop.fixed || mobility.mode === 'fixed';
  const sidewaysBarrel = isSidewaysBarrel(prop, mobility);

  const handlePlayerContact = useCallback((payload = {}) => {
    const body = bodyRef.current;
    if (!body || isCarried || !isPlayerCollisionTarget(payload.other)) return;
    if (!canPushObject(mobility)) return;
    if (clockRef.current - lastPlayerPushContactRef.current <= PLAYER_PUSH_CONTACT_COOLDOWN) return;

    const vectors = scratch.current;
    const pose = getRuntimePlayerPose();
    const translation = body.translation();
    const propPosition = vectors.propPosition.set(translation.x, translation.y, translation.z);
    const player = vectorFromStore(pose?.position, vectors.player);
    const facing = vectorFromStore(pose?.facing, vectors.facing, DEFAULT_FACING).setY(0);
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();

    const toProp = vectors.toProp.copy(propPosition).sub(player).setY(0);
    const distance = toProp.length();
    if (distance > 0.001) toProp.divideScalar(distance);
    else toProp.copy(facing);
    const facingDot = toProp.dot(facing);
    if (facingDot < PLAYER_PUSH_FACING_DOT) return;
    if (!isDownhillMoveAllowed({ position: propPosition, direction: toProp, zoneId: currentZoneId, mobility })) return;

    lastPlayerPushContactRef.current = clockRef.current;

    if (!fixedBody) {
      const velocity = body.linvel();
      const targetSpeed = mobility.assistSpeed ?? mobility.strength ?? DEFAULT_MOBILITY.strength;
      const currentAlongPush = Math.max(0, velocity.x * toProp.x + velocity.z * toProp.z);
      const assistedSpeed = Math.max(currentAlongPush, targetSpeed);
      const maxSpeed = mobility.maxSpeed ?? Math.max(DEFAULT_MOBILITY.maxSpeed, targetSpeed);
      const blend = mobility.blend ?? DEFAULT_MOBILITY.blend;
      body.wakeUp();
      body.setLinvel({
        x: THREE.MathUtils.clamp(
          velocity.x + (toProp.x * assistedSpeed - velocity.x) * blend,
          -maxSpeed,
          maxSpeed,
        ),
        y: velocity.y,
        z: THREE.MathUtils.clamp(
          velocity.z + (toProp.z * assistedSpeed - velocity.z) * blend,
          -maxSpeed,
          maxSpeed,
        ),
      }, true);
    }

    emitPropEvent('player-push-contact', {
      propId: prop.id,
      kind: prop.type,
      label: prop.label,
      height: propInteractionHeight(prop),
      mass: propMass,
      fixed: Boolean(fixedBody),
      direction: { x: toProp.x, y: 0, z: toProp.z },
    });
  }, [currentZoneId, fixedBody, isCarried, mobility, prop, propMass]);

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

  useEffect(() => {
    if (carryable) return;
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
  }, [carryable, prop.id, setCarryPrompt]);

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
      const pose = getRuntimePlayerPose();
      const player = vectorFromStore(pose?.position, scratch.current.player);
      const facing = vectorFromStore(pose?.facing, scratch.current.facing, DEFAULT_FACING);
      computeCarryPose(player, facing, carryable, scratch.current);
      body.setTranslation(scratch.current.carryTarget, true);
      body.setRotation(scratch.current.carryQuaternion, true);
      body.wakeUp();
    } else if (carriedRef.current) {
      carriedRef.current = false;
      const pose = getRuntimePlayerPose();
      const facing = vectorFromStore(pose?.facing, scratch.current.facing, DEFAULT_FACING);
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
    const vectors = scratch.current;
    const propPosition = vectors.propPosition.set(translation.x, translation.y, translation.z);
    if (!fixedBody && !isCarried) clampAngularVelocity(body, mobility, sidewaysBarrel);

    // Resolve queued tool strikes once their impact moment arrives.
    if (pendingStrikesRef.current.length) {
      const due = pendingStrikesRef.current.filter(s => s.at <= clockRef.current);
      if (due.length) {
        pendingStrikesRef.current = pendingStrikesRef.current.filter(s => s.at > clockRef.current);
        for (const strike of due) {
          const origin = vectorFromStore(strike.position, vectors.origin);
          const facing = vectorFromStore(strike.facing, vectors.facing, DEFAULT_FACING).setY(0).normalize();
          const toProp = vectors.toProp.copy(propPosition).sub(origin).setY(0);
          const distance = toProp.length();
          if (distance > STRIKE_RANGE) continue;
          if (distance > 0.2 && toProp.normalize().dot(facing) < STRIKE_FACING_DOT) continue;
          const impactDir = distance > 0.2 ? toProp.normalize() : facing;
          if (breakable && strike.tool === breakable.tool) {
            emitPropEvent('prop-struck', {
              propId: prop.id,
              position: { x: translation.x, y: translation.y, z: translation.z },
              impactDir: { x: impactDir.x, y: 0, z: impactDir.z },
              dustCount: 14,
              sparkCount: 3,
            });
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
            emitPropEvent('prop-struck', {
              propId: prop.id,
              position: { x: translation.x, y: translation.y, z: translation.z },
              impactDir: { x: impactDir.x, y: 0, z: impactDir.z },
              dustCount: 16,
              sparkCount: 5,
            });
          }
        }
      }
    }

    const playerPose = getRuntimePlayerPose();
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

    const player = vectorFromStore(playerPose.position, vectors.player);
    const facing = vectorFromStore(playerPose.facing, vectors.facing, DEFAULT_FACING);
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();

    const horizontalDistance = Math.hypot(propPosition.x - player.x, propPosition.z - player.z);

    if (carryable) {
      // Only steer the body once the carry effect has flipped it kinematic;
      // before that, setNextKinematicTranslation would teleport a dynamic body.
      if (isCarried && carriedRef.current) {
        // Sleeping bodies are skipped by @react-three/rapier's mesh sync and
        // setNextKinematicTranslation does not wake them, so keep it awake.
        body.wakeUp();
        computeCarryPose(player, facing, carryable, vectors);
        body.setTranslation(vectors.carryTarget, true);
        body.setNextKinematicTranslation(vectors.carryTarget);
        body.setRotation(vectors.carryQuaternion, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
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

      const distance = Math.max(0, horizontalDistance - propPickupRadius(prop));
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
      type={fixedBody ? 'fixed' : (isCarried ? 'kinematicPosition' : 'dynamic')}
      colliders={false}
      position={[prop.x, spawnY, prop.z]}
      rotation={prop.rotation}
      linearDamping={prop.linearDamping}
      angularDamping={prop.angularDamping}
      mass={prop.mass * Math.pow(propScale, 2.2)}
      canSleep
      ccd
      additionalSolverIterations={4}
      userData={userData}
      onCollisionEnter={handlePlayerContact}
      onContactForce={handlePlayerContact}
    >
      <PropCollider prop={prop} colliderRef={colliderRef} sensor={isCarried} />
      <group visible={!isCarried} scale={propScale} userData={{
        renderSource: `physics-prop:${prop.id}`,
        renderLabel: `Physics prop: ${prop.id}`,
        renderKind: 'physics-prop',
        renderPath: null,
      }}>
        <PropVisual visual={prop.visual} assetId={prop.visualAsset} offsetY={prop.visualOffsetY || 0} />
        <HighlightRing visible={isPrompted || isCarried} />
      </group>
    </RigidBody>
  );
}
