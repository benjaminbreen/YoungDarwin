'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  BallCollider,
  CoefficientCombineRule,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useRapier,
} from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { movementTerrainHeight, isWalkableTerrain } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/water';
import {
  capHorizontalVelocity,
  computeContactPushImpulse,
  computeControlledPushVelocity,
  computeLandingSettleMotion,
  computeSustainedPushTorque,
  canPickupObject,
  canPushObject,
  isDownhillMoveAllowed,
  mobilityVelocityCaps,
  normalizeMobility,
} from '../objectMobility';
import { onPropEvent, emitPropEvent, claimSwing } from './propEvents';
import { triggerHitstop } from '../../world/worldTime';
import { catalogToInspectable } from '../../world/inspectables';
import { PropVisual, HighlightRing } from './PropVisuals';
import {
  publishPropPose,
  publishPropWaterInfluence,
  removePropPose,
  removePropWaterInfluence,
} from './propRuntime';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { carryPlacementCandidates } from '../../components/player/carryProfiles';

const PICKUP_DISTANCE = 2.15;
const STRIKE_RANGE = 2.6;
const STRIKE_FACING_DOT = 0.3;
const IDLE_PROP_ACTIVE_DISTANCE_SQ = 8 * 8;
const PLAYER_PUSH_FEEDBACK_COOLDOWN = 0.18;
const PLAYER_PUSH_CONTACT_RESET = 0.14;
const RECENT_STRIKE_UNCAPPED_SECONDS = 0.7;
// Loose props near a hammer blow get rattled: small clutter hops, heavy props
// ignore it. Radius is measured from the impact point ahead of the swing.
const RATTLE_IMPACT_REACH = 1.1;
const RATTLE_IMPACT_HEIGHT = 0.55;
const RATTLE_RADIUS = 1.35;
const RATTLE_MAX_MASS = 30;
const RATTLE_MAX_IMPULSE = 2.4;
const GROUNDED_PROP_EPSILON = 0.26;
// Polished water consumes these as occasional instanced rings. Distance and
// time gates prevent a physics-rate event stream when several props drift.
const WATER_OBJECT_RIPPLE_MIN_SPEED = 0.14;
const WATER_OBJECT_RIPPLE_INTERVAL = 0.42;
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

function mobilityFor(prop) {
  if (prop.behaviors?.mobility) return normalizeMobility(prop.behaviors.mobility);
  if (prop.fixed) return normalizeMobility(null, 'fixed');
  if (prop.behaviors?.carryable) return normalizeMobility(null, 'pickup');
  return normalizeMobility();
}

function isSidewaysBarrel(body, mobility, scratch) {
  if (mobility.rotationPolicy !== 'autoBarrel') return false;
  const rotation = body.rotation();
  scratch.bodyQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  scratch.bodyUp.set(0, 1, 0).applyQuaternion(scratch.bodyQuaternion);
  return Math.abs(scratch.bodyUp.y) < 0.68;
}

function bodyUprightness(body, scratch) {
  const rotation = body.rotation();
  scratch.bodyQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  scratch.bodyUp.set(0, 1, 0).applyQuaternion(scratch.bodyQuaternion);
  return scratch.bodyUp.y;
}

function bodyFaceAlignment(body) {
  const rotation = body.rotation();
  const { x, y, z, w } = rotation;
  // World-space Y components of the body's three local basis axes. Computing
  // these from the quaternion avoids adding scratch-ref fields that may be
  // absent on a component instance preserved by React Fast Refresh.
  return Math.max(
    Math.abs(2 * (x * y + w * z)),
    Math.abs(1 - 2 * (x * x + z * z)),
    Math.abs(2 * (y * z - w * x)),
  );
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
    body.setAngvel({ x, y, z }, false);
  }
}

function applyMobilityVelocityLimits({ body, mobility, grounded, recentlyStruck, rolling, delta }) {
  const velocity = body.linvel();
  const caps = mobilityVelocityCaps(mobility, { rolling });
  const horizontalMax = recentlyStruck ? caps.struckHorizontalMaxSpeed : caps.horizontalMaxSpeed;
  let next = capHorizontalVelocity(velocity, horizontalMax);
  let changed = next.x !== velocity.x || next.z !== velocity.z;

  if (grounded) {
    const verticalMax = recentlyStruck ? caps.struckVerticalLaunchMax : caps.verticalLaunchMax;
    if (next.y > verticalMax) {
      next = { ...next, y: verticalMax };
      changed = true;
    }
    if (!recentlyStruck && caps.groundedExtraDamping > 0) {
      const keep = Math.exp(-caps.groundedExtraDamping * Math.min(delta, 0.05));
      const dampedX = next.x * keep;
      const dampedZ = next.z * keep;
      if (dampedX !== next.x || dampedZ !== next.z) {
        next = { ...next, x: dampedX, z: dampedZ };
        changed = true;
      }
    }
  }

  if (changed) body.setLinvel(next, true);
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
  const mass = Math.max(0.001, prop.mass * Math.pow(scale, 2.2));
  const common = {
    ref: colliderRef,
    friction: prop.friction,
    frictionCombineRule: CoefficientCombineRule.Min,
    restitution: prop.restitution,
    mass,
    sensor,
  };
  if (shape === 'cuboid') return <CuboidCollider {...common} args={prop.collider.halfExtents.map(value => value * scale)} />;
  if (shape === 'ball') return <BallCollider {...common} args={[prop.collider.radius * scale]} />;
  return <CylinderCollider {...common} args={[prop.collider.halfHeight * scale, prop.collider.radius * scale]} />;
}

function createPlacementShape(rapier, prop) {
  const scale = prop.scale || 1;
  const collider = prop.collider || {};
  if (collider.shape === 'cuboid') {
    const [halfX = 0.25, halfY = 0.25, halfZ = 0.25] = collider.halfExtents || [];
    return new rapier.Cuboid(halfX * scale, halfY * scale, halfZ * scale);
  }
  if (collider.shape === 'ball') return new rapier.Ball((collider.radius || 0.2) * scale);
  return new rapier.Cylinder(
    (collider.halfHeight || 0.25) * scale,
    (collider.radius || 0.2) * scale,
  );
}

// A single dynamic physics prop. Behaviors (carryable / breakable /
// strikeable) come from the prop's type config; see propTypes.js.
export function PhysicsProp({ prop, onBreak }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const visualRef = useRef(null);
  const carriedRef = useRef(false);
  const inWaterRef = useRef(false);
  const pendingStrikesRef = useRef([]);
  const playerPushContactRef = useRef({
    startedAt: -10,
    lastAt: -10,
    lastFeedbackAt: -10,
    tipCommitted: false,
    tipCommittedFor: 0,
    tipRotationsLocked: false,
    tipSettledFor: 0,
  });
  const playerPushActiveForRef = useRef(0);
  const waterDampingRef = useRef(false);
  const waterRippleRef = useRef({ initialized: false, lastAt: -10, x: 0, z: 0 });
  const lastStrikeAtRef = useRef(-10);
  const clockRef = useRef(0);
  const { world, rapier } = useRapier();
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
    bodyUp: new THREE.Vector3(0, 1, 0),
    bodyQuaternion: new THREE.Quaternion(),
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
    () => (Number.isFinite(prop.y)
      ? prop.y
      : movementTerrainHeight(prop.x, prop.z, currentZoneId) + (prop.restOffset * propScale) + 0.05),
    [currentZoneId, prop, propScale],
  );
  const isPrompted = carryPrompt?.id === prop.id;
  const isCarried = carriedObjectId === prop.id;
  const breakable = prop.behaviors?.breakable;
  const strikeable = prop.behaviors?.strikeable;
  const mobility = useMemo(() => mobilityFor(prop), [prop]);
  const carryable = canPickupObject(mobility, prop.behaviors?.carryable) ? prop.behaviors.carryable : null;
  const buoyant = prop.behaviors?.buoyant;
  const propMass = prop.mass * Math.pow(propScale, 2.2);
  const fixedBody = prop.fixed || mobility.mode === 'fixed';
  const placementShape = useMemo(() => createPlacementShape(rapier, prop), [prop, rapier]);

  useEffect(() => onPropEvent('player-physics-prop-contact', event => {
    if (event.propId !== prop.id || carriedRef.current) return;
    const body = bodyRef.current;
    if (!body) return;
    if (event.contactKind === 'landing') {
      if (!fixedBody) {
        const settle = computeLandingSettleMotion({
          linearVelocity: body.linvel(),
          angularVelocity: body.angvel(),
          direction: event.direction,
          mass: propMass,
          fallSpeed: event.verticalSpeed,
        });
        body.wakeUp();
        body.setLinvel(settle.linear, true);
        body.setAngvel(settle.angular, true);
      }
      return;
    }
    if (!canPushObject(mobility)) return;
    const now = Number.isFinite(event.now) ? event.now : clockRef.current;
    const contact = playerPushContactRef.current;
    if (now - contact.lastAt > PLAYER_PUSH_CONTACT_RESET) contact.startedAt = now;
    contact.lastAt = now;
    playerPushActiveForRef.current = Math.max(
      playerPushActiveForRef.current,
      PLAYER_PUSH_CONTACT_RESET + 0.04,
    );

    const direction = event.direction || DEFAULT_FACING;
    const translation = body.translation();
    const propPosition = scratch.current.propPosition.set(translation.x, translation.y, translation.z);
    if (!isDownhillMoveAllowed({
      position: propPosition,
      direction,
      zoneId: currentZoneId,
      mobility,
    })) return;

    if (!fixedBody && clockRef.current - lastStrikeAtRef.current > RECENT_STRIKE_UNCAPPED_SECONDS) {
      const velocity = body.linvel();
      const seabedY = movementTerrainHeight(translation.x, translation.z, currentZoneId);
      const floating = Boolean(
        buoyant
        && seabedY < WATER_LEVEL - 0.12
        && translation.y < WATER_LEVEL + buoyant.rideHeight + 0.35
      );
      const rolling = isSidewaysBarrel(body, mobility, scratch.current);
      const sustainedTime = now - contact.startedAt;
      const hasTipAssist = Number(mobility.tipAssistTorque) > 0;
      const uprightness = bodyUprightness(body, scratch.current);
      if (hasTipAssist && !contact.tipCommitted && Math.abs(uprightness) <= 0.62) {
        contact.tipCommitted = true;
        contact.tipCommittedFor = 0;
        contact.tipRotationsLocked = false;
        contact.tipSettledFor = 0;
        const settleVerticalMax = Math.max(0.18, mobility.verticalLaunchMax ?? 0.1);
        if (velocity.y > settleVerticalMax) {
          body.setLinvel({ x: velocity.x, y: settleVerticalMax, z: velocity.z }, true);
        }
      }
      const pushedVelocity = computeControlledPushVelocity({
        velocity,
        direction,
        mobility,
        mass: propMass,
        impactSpeed: event.impactSpeed,
        sustainedTime,
        delta: event.delta,
        rolling,
        floating,
      });
      const impulse = computeContactPushImpulse({
        velocity,
        targetVelocity: pushedVelocity,
        direction,
        mass: body.mass(),
      });
      const witness = event.contactPoint;
      // Once this shove has carried the crate over its balance point, keep any
      // further pressure linear. Reusing an upper-edge witness after each half
      // turn would inject a fresh overturning moment forever.
      const contactPoint = !contact.tipCommitted
        && witness
        && Number.isFinite(witness.x)
        && Number.isFinite(witness.y)
        && Number.isFinite(witness.z)
        ? witness
        : translation;
      body.wakeUp();
      body.applyImpulseAtPoint(impulse, contactPoint, true);
      if (!floating && hasTipAssist && !contact.tipCommitted && Math.abs(uprightness) > 0.62) {
        const torque = computeSustainedPushTorque({
          direction,
          mobility,
          sustainedTime,
          impactSpeed: event.impactSpeed,
        });
        if (torque.x || torque.z) body.addTorque(torque, true);
      }
    }

    if (now - contact.lastFeedbackAt >= PLAYER_PUSH_FEEDBACK_COOLDOWN) {
      contact.lastFeedbackAt = now;
      emitPropEvent('player-push-contact', {
        propId: prop.id,
        kind: prop.type,
        label: prop.label,
        height: propInteractionHeight(prop),
        mass: propMass,
        fixed: Boolean(fixedBody),
        direction: { x: direction.x || 0, y: 0, z: direction.z || 0 },
      });
    }
  }), [buoyant, currentZoneId, fixedBody, mobility, prop, propMass]);

  // Queue tool swings; the hit lands impactDelay seconds into the animation.
  // Direct responders (breakable/strikeable) take the full hit; any other
  // loose, light prop near the impact point merely rattles.
  useEffect(() => {
    const canRattle = !fixedBody && propMass <= RATTLE_MAX_MASS;
    if (!breakable && !strikeable && !canRattle) return undefined;
    return onPropEvent('tool-swing', event => {
      const responds = (breakable && event.tool === breakable.tool)
        || (strikeable && event.tool === strikeable.tool);
      if (!responds && !(canRattle && event.tool === 'hammer')) return;
      pendingStrikesRef.current.push({
        ...event,
        rattleOnly: !responds,
        at: clockRef.current + (event.impactDelay ?? 0.55),
      });
    });
  }, [breakable, strikeable, fixedBody, propMass]);

  // Shotgun pellets: the resolver has already delayed to the muzzle moment,
  // so react immediately. Each prop tests itself against the pellet ray;
  // close passes kick the body, direct hits shatter breakables.
  useEffect(() => {
    if (fixedBody && !breakable) return undefined;
    return onPropEvent('shotgun-blast', event => {
      const body = bodyRef.current;
      if (!body || carriedRef.current) return;
      const o = event.origin;
      const d = event.dir;
      if (!o || !d) return;
      const translation = body.translation();
      const tx = translation.x - o.x;
      const ty = translation.y - o.y;
      const tz = translation.z - o.z;
      const along = tx * d.x + ty * d.y + tz * d.z;
      if (along < 0.3 || along > (event.range ?? 24) + 0.6) return;
      const lateralSq = Math.max(0, tx * tx + ty * ty + tz * tz - along * along);
      const propRadius = prop.collider?.radius
        ? prop.collider.radius * propScale
        : prop.collider?.halfExtents
          ? Math.max(...prop.collider.halfExtents) * propScale
          : 0.4;
      const reach = SHOTGUN.prop.rayRadius + propRadius;
      if (lateralSq > reach * reach) return;
      const falloff = Math.max(0.3, 1 - along / Math.max(1, event.range ?? 24));
      const directness = 1 - Math.sqrt(lateralSq) / reach;
      if (breakable && along <= SHOTGUN.prop.breakRange && directness > 0.45) {
        emitPropEvent('prop-struck', {
          propId: prop.id,
          position: { x: translation.x, y: translation.y, z: translation.z },
          impactDir: { x: d.x, y: 0, z: d.z },
          dustCount: 16,
          sparkCount: 4,
        });
        onBreak?.(prop, {
          position: { x: translation.x, y: translation.y, z: translation.z },
          impactDir: { x: d.x, y: 0, z: d.z },
        });
        return;
      }
      if (fixedBody) return;
      lastStrikeAtRef.current = clockRef.current;
      const kick = propMass * SHOTGUN.prop.impulse * falloff * (0.5 + directness * 0.5);
      body.wakeUp();
      body.applyImpulse({ x: d.x * kick, y: kick * 0.3, z: d.z * kick }, true);
      body.applyTorqueImpulse({
        x: d.z * kick * 0.06,
        y: (directness - 0.5) * kick * 0.05,
        z: -d.x * kick * 0.06,
      }, true);
      emitPropEvent('prop-struck', {
        propId: prop.id,
        position: { x: translation.x, y: translation.y, z: translation.z },
        impactDir: { x: d.x, y: 0, z: d.z },
        dustCount: 10,
        sparkCount: 2,
      });
    });
  }, [breakable, fixedBody, onBreak, prop, propMass, propScale]);

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
    removePropPose(currentZoneId, prop.id);
    removePropWaterInfluence(currentZoneId, prop.id);
  }, [currentZoneId, prop.id, setCarryPrompt]);

  useEffect(() => {
    if (carryable) return;
    const state = useThreeGameStore.getState();
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
  }, [carryable, prop.id, setCarryPrompt]);

  const enterCarry = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !carryable) return;
    carriedRef.current = true;
    if (visualRef.current) visualRef.current.visible = false;
    const collider = colliderRef.current;
    collider?.setSensor(true);
    collider?.setEnabled(false);
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const pose = getRuntimePlayerPose();
    const player = vectorFromStore(pose?.position, scratch.current.player);
    const facing = vectorFromStore(pose?.facing, scratch.current.facing, DEFAULT_FACING);
    computeCarryPose(player, facing, carryable, scratch.current);
    body.setTranslation(scratch.current.carryTarget, true);
    body.setRotation(scratch.current.carryQuaternion, true);
    body.wakeUp();
  }, [carryable, rapier.RigidBodyType.KinematicPositionBased]);

  const placeCarriedBody = useCallback(pose => {
    const body = bodyRef.current;
    if (!body) return null;
    const facing = vectorFromStore(pose?.facing, scratch.current.facing, DEFAULT_FACING);
    if (facing.lengthSq() < 0.001) facing.set(0, 0, -1);
    facing.normalize();
    const player = vectorFromStore(pose?.position, scratch.current.player);
    const candidates = carryPlacementCandidates({
      prop,
      player,
      facing,
      terrainHeight: (x, z) => movementTerrainHeight(x, z, currentZoneId),
    });
    const placement = candidates.find(candidate => {
      if (!isWalkableTerrain(candidate.position.x, candidate.position.z, currentZoneId)) return false;
      scratch.current.carryEuler.set(
        candidate.rotation[0] || 0,
        candidate.rotation[1] || 0,
        candidate.rotation[2] || 0,
        'YXZ',
      );
      scratch.current.carryQuaternion.setFromEuler(scratch.current.carryEuler);
      return !world.intersectionWithShape(
        candidate.position,
        scratch.current.carryQuaternion,
        placementShape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        colliderRef.current || undefined,
        body,
      );
    });
    if (!placement) return null;
    scratch.current.carryEuler.set(
      placement.rotation[0] || 0,
      placement.rotation[1] || 0,
      placement.rotation[2] || 0,
      'YXZ',
    );
    scratch.current.carryQuaternion.setFromEuler(scratch.current.carryEuler);
    body.setTranslation(placement.position, true);
    body.setRotation(scratch.current.carryQuaternion, true);
    return placement;
  }, [currentZoneId, placementShape, prop, rapier.QueryFilterFlags.EXCLUDE_SENSORS, world]);

  const leaveCarry = useCallback((pose, mode = 'place') => {
    const body = bodyRef.current;
    if (!body) return null;
    const placement = mode === 'release' ? null : placeCarriedBody(pose);
    if (mode !== 'release' && !placement) return null;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const collider = colliderRef.current;
    collider?.setSensor(false);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    collider?.setEnabled(true);
    body.wakeUp();
    carriedRef.current = false;
    if (visualRef.current) visualRef.current.visible = true;
    return { placement };
  }, [placeCarriedBody, rapier.RigidBodyType.Dynamic]);

  // Store subscriptions run in the same call stack as the carry action. That
  // gives physics, rendering ownership, and prompt state one atomic handoff;
  // React's declarative type/sensor props then render the same final state.
  // The collider itself stays disabled for the whole carry so the prop cannot
  // block its carrier through contact or character-controller queries.
  useEffect(() => {
    const syncCarryState = (state, previousState = {}) => {
      const request = state.carryDropRequest;
      if (
        request?.id === prop.id
        && request.requestId !== previousState.carryDropRequest?.requestId
      ) {
        if (request.zoneId !== currentZoneId) {
          state.cancelCarryDrop?.(prop.id, request.requestId);
          return;
        }
        const result = leaveCarry(request, request.mode);
        if (result) {
          state.completeCarryDrop?.(prop.id, request.requestId);
          emitPropEvent('carried-prop-settle', {
            propId: prop.id,
            zoneId: currentZoneId,
            mode: request.mode,
            position: result.placement?.position || request.position,
          });
          if (result.placement) {
            const distance = Math.max(0, Math.hypot(
              result.placement.position.x - request.position.x,
              result.placement.position.z - request.position.z,
            ) - propPickupRadius(prop));
            setCarryPrompt({
              id: prop.id,
              label: prop.label,
              mode: 'pickup',
              distance,
              text: `Press E to pick up ${prop.label}`,
            });
          }
        } else {
          state.cancelCarryDrop?.(
            prop.id,
            request.requestId,
            `There is not enough room to put down ${prop.label}.`,
          );
        }
        return;
      }

      const carriedHere = state.carriedObjectId === prop.id;
      if (carriedHere && !carriedRef.current) enterCarry();
      else if (!carriedHere && carriedRef.current) {
        // Compatibility path for teardown and older direct callers.
        if (!leaveCarry(getRuntimePlayerPose())) leaveCarry(null, 'release');
      }
    };

    const state = useThreeGameStore.getState();
    syncCarryState(state);
    return useThreeGameStore.subscribe(syncCarryState);
  }, [currentZoneId, enterCarry, leaveCarry, prop, setCarryPrompt]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    clockRef.current += delta;
    playerPushActiveForRef.current = Math.max(0, playerPushActiveForRef.current - delta);
    const carriedHere = carriedRef.current;

    const translation = body.translation();
    const vectors = scratch.current;
    const propPosition = vectors.propPosition.set(translation.x, translation.y, translation.z);
    if (carriedHere) removePropPose(currentZoneId, prop.id);
    else publishPropPose(currentZoneId, prop.id, translation);
    const sidewaysBarrel = !fixedBody
      && !carriedHere
      && isSidewaysBarrel(body, mobility, vectors);
    if (!fixedBody && !carriedHere) clampAngularVelocity(body, mobility, sidewaysBarrel);

    // Rearm the one-shot tipping leverage only after the crate has actually
    // come to rest and Darwin has stopped pressing it. A momentary loss of
    // contact during a flip must not start a new torque cycle.
    const pushContact = playerPushContactRef.current;
    if (pushContact.tipCommitted) {
      pushContact.tipCommittedFor += delta;
      if (!pushContact.tipRotationsLocked) {
        const linear = body.linvel();
        const settleVerticalMax = Math.max(0.18, mobility.verticalLaunchMax ?? 0.1);
        if (linear.y > settleVerticalMax) {
          body.setLinvel({ x: linear.x, y: settleVerticalMax, z: linear.z }, false);
        }
        if (
          pushContact.tipCommittedFor >= 0.35
          && bodyFaceAlignment(body) >= 0.97
        ) {
          body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          body.lockRotations(true, false);
          pushContact.tipRotationsLocked = true;
        }
      }
    }
    if (pushContact.tipCommitted && playerPushActiveForRef.current <= 0) {
      const linear = body.linvel();
      const angular = body.angvel();
      const settled = Math.hypot(linear.x, linear.z) < 0.12
        && Math.abs(linear.y) < 0.12
        && Math.hypot(angular.x, angular.y, angular.z) < 0.16;
      pushContact.tipSettledFor = settled ? pushContact.tipSettledFor + delta : 0;
      if (pushContact.tipSettledFor >= 0.65) {
        body.sleep();
        if (pushContact.tipRotationsLocked) body.lockRotations(false, false);
        pushContact.tipCommitted = false;
        pushContact.tipCommittedFor = 0;
        pushContact.tipRotationsLocked = false;
        pushContact.tipSettledFor = 0;
      }
    } else if (!pushContact.tipCommitted || playerPushActiveForRef.current > 0) {
      pushContact.tipSettledFor = 0;
    }

    // Resolve queued tool strikes once their impact moment arrives.
    if (pendingStrikesRef.current.length) {
      const due = pendingStrikesRef.current.filter(s => s.at <= clockRef.current);
      if (due.length) {
        pendingStrikesRef.current = pendingStrikesRef.current.filter(s => s.at > clockRef.current);
        for (const strike of due) {
          const origin = vectorFromStore(strike.position, vectors.origin);
          const facing = vectorFromStore(strike.facing, vectors.facing, DEFAULT_FACING).setY(0).normalize();
          if (strike.rattleOnly) {
            if (carriedRef.current) continue;
            const impactX = origin.x + facing.x * RATTLE_IMPACT_REACH;
            const impactZ = origin.z + facing.z * RATTLE_IMPACT_REACH;
            const dx = translation.x - impactX;
            const dz = translation.z - impactZ;
            const lateral = Math.hypot(dx, dz);
            if (lateral > RATTLE_RADIUS) continue;
            if (Math.abs(translation.y - (origin.y + RATTLE_IMPACT_HEIGHT)) > 1.6) continue;
            const falloff = 1 - lateral / RATTLE_RADIUS;
            const kick = Math.min(RATTLE_MAX_IMPULSE, propMass * 0.6) * (0.35 + 0.65 * falloff);
            const nx = lateral > 0.05 ? dx / lateral : facing.x;
            const nz = lateral > 0.05 ? dz / lateral : facing.z;
            body.wakeUp();
            body.applyImpulse({ x: nx * kick * 0.7, y: kick * 0.55, z: nz * kick * 0.7 }, true);
            continue;
          }
          const toProp = vectors.toProp.copy(propPosition).sub(origin).setY(0);
          const distance = toProp.length();
          if (distance > STRIKE_RANGE) continue;
          if (distance > 0.2 && toProp.normalize().dot(facing) < STRIKE_FACING_DOT) continue;
          const impactDir = distance > 0.2 ? toProp.normalize() : facing;
          if (breakable && strike.tool === breakable.tool) {
            claimSwing(strike.swingId);
            triggerHitstop(0.055);
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
            claimSwing(strike.swingId);
            triggerHitstop(0.045);
            lastStrikeAtRef.current = clockRef.current;
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
      && !carriedHere
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
      // Only steer the body once the synchronous carry transition made it kinematic;
      // before that, setNextKinematicTranslation would teleport a dynamic body.
      if (carriedHere) {
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

    const seabedY = movementTerrainHeight(translation.x, translation.z, currentZoneId);
    // Deep enough to float in vs. merely off the walkable shelf (wet shallows
    // start well above WATER_LEVEL; isWalkableTerrain cuts off at y <= -0.82).
    const overWater = seabedY < WATER_LEVEL - 0.12;
    const nearWater = seabedY < WATER_LEVEL + 0.55;
    const wateryMotion = overWater && translation.y < WATER_LEVEL + 0.35;
    const useWaterDamping = Boolean(!fixedBody && !carriedHere && buoyant && wateryMotion);
    if (waterDampingRef.current !== useWaterDamping) {
      waterDampingRef.current = useWaterDamping;
      body.setLinearDamping(useWaterDamping
        ? (buoyant.linearDamping ?? Math.min(prop.linearDamping ?? 0, 0.65))
        : (prop.linearDamping ?? 0));
      body.setAngularDamping(useWaterDamping
        ? (buoyant.rigidBodyAngularDamping ?? Math.min(prop.angularDamping ?? 0, 0.8))
        : (prop.angularDamping ?? 0));
    }
    if (!fixedBody && !carriedHere && !wateryMotion) {
      const restY = seabedY + (prop.restOffset * propScale);
      applyMobilityVelocityLimits({
        body,
        mobility,
        grounded: translation.y <= restY + GROUNDED_PROP_EPSILON,
        recentlyStruck: clockRef.current - lastStrikeAtRef.current <= RECENT_STRIKE_UNCAPPED_SECONDS,
        rolling: sidewaysBarrel,
        delta,
      });
    }

    // --- Water: splash on entry, buoyancy/current for floating props -------
    const inWater = nearWater && translation.y < WATER_LEVEL + 0.08;
    if (inWater && !inWaterRef.current) {
      const velocity = body.linvel();
      emitPropEvent('water-splash', {
        position: { x: translation.x, y: WATER_LEVEL, z: translation.z },
        intensity: THREE.MathUtils.clamp(Math.abs(velocity.y) / 5 + 0.25, 0.3, 1),
      });
    }
    inWaterRef.current = inWater;

    // Feed the cinematic water path directly from the rigid body's current
    // pose. Surface intersection (rather than merely being over the seabed)
    // keeps sunk props from generating wakes several metres above them.
    const halfHeight = propInteractionHeight(prop) * 0.5;
    const touchesSurface = !carriedHere
      && nearWater
      && translation.y - halfHeight < WATER_LEVEL + 0.12
      && translation.y + halfHeight > WATER_LEVEL - 0.42;
    if (touchesSurface) {
      const velocity = body.linvel();
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      const rippleState = waterRippleRef.current;
      const rippleRadius = propPickupRadius(prop);
      if (!rippleState.initialized) {
        rippleState.initialized = true;
        rippleState.lastAt = clockRef.current;
        rippleState.x = translation.x;
        rippleState.z = translation.z;
      } else {
        const moved = Math.hypot(translation.x - rippleState.x, translation.z - rippleState.z);
        const rippleDistance = Math.max(0.16, rippleRadius * 0.32);
        if (
          horizontalSpeed >= WATER_OBJECT_RIPPLE_MIN_SPEED
          && clockRef.current - rippleState.lastAt >= WATER_OBJECT_RIPPLE_INTERVAL
          && moved >= rippleDistance
        ) {
          const invSpeed = 1 / Math.max(horizontalSpeed, 0.001);
          emitPropEvent('water-object-ripple', {
            propId: prop.id,
            position: { x: translation.x, y: WATER_LEVEL, z: translation.z },
            direction: { x: velocity.x * invSpeed, y: 0, z: velocity.z * invSpeed },
            yaw: Math.atan2(velocity.x, velocity.z),
            radius: rippleRadius,
            intensity: THREE.MathUtils.clamp(0.1 + horizontalSpeed * 0.24, 0.12, 0.48),
          });
          rippleState.lastAt = clockRef.current;
          rippleState.x = translation.x;
          rippleState.z = translation.z;
        }
      }
      publishPropWaterInfluence(currentZoneId, prop.id, {
        x: translation.x,
        z: translation.z,
        vx: velocity.x,
        vz: velocity.z,
        radius: rippleRadius,
        strength: buoyant ? 1 : 0.62,
      });
    } else {
      waterRippleRef.current.initialized = false;
      removePropWaterInfluence(currentZoneId, prop.id);
    }

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
      const activePush = playerPushActiveForRef.current > 0;
      const blendXZ = (1 - Math.exp(-buoyant.drag * dt)) * (activePush ? 0.12 : 1);
      const blendY = 1 - Math.exp(-buoyant.strength * 0.2 * dt);
      body.setLinvel({
        x: velocity.x + (targetVx - velocity.x) * blendXZ,
        y: velocity.y + (targetVy - velocity.y) * blendY,
        z: velocity.z + (targetVz - velocity.z) * blendXZ,
      }, true);
      // Damp spin and add a gentle roll so it reads as bobbing, not gliding.
      const spin = body.angvel();
      const angularDrag = buoyant.angularDrag * (activePush ? 0.25 : 1);
      const angularKeep = Math.max(0, 1 - angularDrag * delta);
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
      removePropWaterInfluence(currentZoneId, prop.id);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type={fixedBody ? 'fixed' : (isCarried ? 'kinematicPosition' : 'dynamic')}
      colliders={false}
      position={[prop.x, spawnY, prop.z]}
      rotation={prop.rotation}
      {...(prop.enabledRotations ? { enabledRotations: prop.enabledRotations } : {})}
      linearDamping={prop.linearDamping}
      angularDamping={prop.angularDamping}
      canSleep
      ccd
      additionalSolverIterations={4}
      userData={userData}
    >
      <PropCollider prop={prop} colliderRef={colliderRef} sensor={isCarried} />
      <group
        ref={visualRef}
        visible={!isCarried}
        scale={propScale}
        onClick={prop.inspectable ? event => {
          event.stopPropagation();
          useThreeGameStore.getState().setInspectedObject?.(
            catalogToInspectable(prop.inspectable, event.point, { sourceId: prop.id }),
          );
        } : undefined}
        userData={{
        renderSource: `physics-prop:${prop.id}`,
        renderLabel: `Physics prop: ${prop.id}`,
        renderKind: 'physics-prop',
        renderPath: null,
      }}>
        <PropVisual visual={prop.visual} assetId={prop.visualAsset} offsetY={prop.visualOffsetY || 0} propId={prop.id} />
        <HighlightRing visible={(isPrompted || isCarried) && prop.interactionRing !== false} />
      </group>
    </RigidBody>
  );
}
