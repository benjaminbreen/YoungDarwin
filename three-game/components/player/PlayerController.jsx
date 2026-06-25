'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { updateRuntimePlayerPose, useThreeGameStore } from '../../store';
import { getThreeSpecimens, threeTools } from '../../data';
import { consumeTouchControls } from '../../input/touchControls';
import { isGameplayInputBlocked } from '../../input/typingMode';
import { regionSpawnPoint, terrainBiomeAt } from '../../world/terrain';
import { createCollisionAdapter } from '../../physics/collisionAdapter';
import {
  computePushAmount,
  downhillGrade,
  isDownhillMoveAllowed,
  mobilityPushAnimationTarget,
} from '../../physics/objectMobility';
import { emitPropEvent, onPropEvent } from '../../physics/props/propEvents';
import { getZoneProps } from '../../physics/props/propRegistry';
import { PropVisual } from '../../physics/props/PropVisuals';
import { resolveSpecimenCollision } from '../../fauna/specimenCollision';
import { pushSpecimenStimulus } from '../../world/specimenRuntime';
import { WATER_LEVEL, WADE_DEPTH } from '../../world/water';
import {
  CHARACTER_CONTROLLER_CONFIG,
  useKinematicCharacterController,
} from '../../physics/useKinematicCharacterController';
import {
  ACTION_DURATION,
  actionDuration,
  BUMP_FEEDBACK,
  CACTUS_HAZARD,
  CAMERA,
  CONTROL_INTERRUPTIBLE_ACTIONS,
  EMPTY_KEYS,
  MOVEMENT_INTERRUPTIBLE_ACTIONS,
  MOVEMENT_FATIGUE,
  PLAYER,
  SPAWN_DROP,
  SWIM,
} from './playerConfig';
import { usePlayerCameraRig } from './usePlayerCameraRig';
import { usePlayerActions } from './playerActions';
import { triggerDirectPlayerActions } from './playerActionTriggers';
import { updatePlayerInteractions } from './playerInteractions';
import { pulseEquippedToolOnUse, readPlayerInput, sanitizeShortcutKeys } from './playerInputState';
import { findCactusHazardContact, findPushableObstacleNear, LandingDust } from './playerFeedback';
import { updatePlayerFrameFeedback } from './playerFrameFeedback';
import { NaturalistModel } from './PlayerModel';
import {
  dampAngle,
  easeInOutCubic,
  formatVector,
  playerControllerDebugEnabled,
} from './playerUtils';

const BOULDER_WAIST_MAX_HEIGHT = 1.28;
const BOULDER_HEAD_MAX_HEIGHT = 1.9;
const PUSH_ANIMATION_COOLDOWN = 0.42;
const PUSH_ANIMATION_MIN_SPEED = 0.85;
const PUSH_ANIMATION_MIN_FORWARD = 0.42;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_CARRIED_OFFSET = [0.32, 1.02, 0.24];
const DEFAULT_CARRIED_ROTATION = [0, 0, -0.18];

function CarriedObjectVisual() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const prop = useMemo(() => {
    if (!carriedObjectId) return null;
    return getZoneProps(currentZoneId).find(item => item.id === carriedObjectId) || null;
  }, [carriedObjectId, currentZoneId]);

  if (!prop) return null;

  const carryable = prop.behaviors?.carryable || {};
  const offset = carryable.holdOffset || DEFAULT_CARRIED_OFFSET;
  const rotation = carryable.holdRotation || DEFAULT_CARRIED_ROTATION;
  const scale = (prop.scale || 1) * (carryable.holdScale || 1);

  return (
    <group
      position={[offset[0] || 0, offset[1] ?? 1.02, offset[2] ?? 0.24]}
      rotation={rotation}
      scale={scale}
      userData={{
        renderSource: `carried-prop:${prop.id}`,
        renderLabel: `Carried prop: ${prop.label}`,
        renderKind: 'carried-prop',
        renderPath: prop.visualAsset || prop.visual || null,
      }}
    >
      <PropVisual visual={prop.visual} assetId={prop.visualAsset} offsetY={prop.visualOffsetY || 0} />
    </group>
  );
}

function inputWorldDirection(keys, touch, yaw, target = new THREE.Vector3()) {
  target.set(
    (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0),
    0,
    (keys.backward || touch.backward ? 1 : 0) - (keys.forward || touch.forward ? 1 : 0),
  );
  if (target.lengthSq() <= 0.0001) return null;
  return target.normalize().applyAxisAngle(WORLD_UP, yaw);
}

function boulderTraversalProfile(heightDelta, heroic, durationFor) {
  if (heightDelta <= BOULDER_WAIST_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbWaistHeight');
    return {
      clip: 'climbWaistHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.62 : 0.72),
      motionDuration: THREE.MathUtils.clamp(0.24 + heightDelta * (heroic ? 0.16 : 0.2), 0.34, 0.52),
      arcHeight: THREE.MathUtils.clamp(0.08 + heightDelta * 0.08, 0.12, 0.2),
      lockMovement: heroic ? 0.16 : 0.22,
      exitSpeedScale: heroic ? 0.92 : 0.45,
      crouching: false,
      earlyExitAt: heroic ? 0.58 : 0.66,
      cancelAt: heroic ? 0.42 : 0.52,
    };
  }
  if (heightDelta <= BOULDER_HEAD_MAX_HEIGHT) {
    const actionDurationValue = durationFor('climbHeadHeight');
    return {
      clip: 'climbHeadHeight',
      actionDuration: Math.min(actionDurationValue, heroic ? 0.82 : 0.95),
      motionDuration: THREE.MathUtils.clamp(0.36 + heightDelta * (heroic ? 0.18 : 0.22), 0.56, 0.78),
      arcHeight: THREE.MathUtils.clamp(0.1 + heightDelta * 0.09, 0.2, 0.3),
      lockMovement: heroic ? 0.24 : 0.34,
      exitSpeedScale: heroic ? 0.76 : 0.32,
      crouching: false,
      earlyExitAt: heroic ? 0.64 : 0.72,
      cancelAt: heroic ? 0.48 : 0.58,
    };
  }
  const actionDurationValue = durationFor('climbingUpWall');
  return {
    clip: 'climbingUpWall',
    actionDuration: Math.min(actionDurationValue, THREE.MathUtils.clamp(0.82 + heightDelta * 0.22, 1.18, 1.62)),
    motionDuration: THREE.MathUtils.clamp(0.72 + heightDelta * 0.22, 1.05, 1.58),
    arcHeight: THREE.MathUtils.clamp(0.12 + heightDelta * 0.05, 0.2, 0.34),
    lockMovement: heroic ? 0.34 : 0.48,
    exitSpeedScale: heroic ? 0.38 : 0.16,
    crouching: false,
    earlyExitAt: heroic ? 0.7 : 0.78,
    cancelAt: heroic ? 0.52 : 0.62,
  };
}

function pushAnimationForObstacle(obstacle) {
  if (!obstacle) return 'pushMedium';
  const top = Number.isFinite(obstacle.colliderTop) ? obstacle.colliderTop : obstacle.height;
  const mass = obstacle.pushMass || 1;
  if (obstacle.kind === 'boulder' || obstacle.kind === 'cliff' || obstacle.kind === 'wall' || top >= 1.35 || mass >= 60) return 'pushHeavy';
  if (top >= 0.72 || obstacle.height >= 0.78 || mass >= 8) return 'pushMedium';
  return 'pushLow';
}

export function PlayerController({ physicsDebug = false }) {
  const group = useRef(null);
  const warningRef = useRef(null);
  const contactShadowRef = useRef(null);
  // Soft radial alpha falloff so the contact shadow grounds as ambient occlusion
  // rather than a hard sticker disc. White centre → black edge; the material's
  // alphaMap samples this and multiplies the per-frame opacity.
  const contactShadowAlpha = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, '#ffffff');
    g.addColorStop(0.42, '#bdbdbd');
    g.addColorStop(0.74, '#3a3a3a');
    g.addColorStop(1.0, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  }, []);
  const waterlineRef = useRef(null);
  const landingDustTriggerRef = useRef(null);
  const footstepDustTriggerRef = useRef(null);
  const collisionDustTriggerRef = useRef(null);
  const modelFeedbackRef = useRef(null);
  const debugCollisionRef = useRef(null);
  const debugMovementRef = useRef(null);
  const debugStanceRefs = useRef([]);
  const characterBodyRef = useRef(null);
  const characterColliderRef = useRef(null);
  const velocity = useRef(new THREE.Vector3());
  const { yawRef, pointerNdcRef, aimActiveRef, firePulseRef, getAimDirection, resetCameraForSpawn, recenterCamera, updateCamera } = usePlayerCameraRig();
  const lastToolId = useRef(null);
  const lastFirePulse = useRef(0);
  const facing = useRef(new THREE.Vector3(0, 0, -1));
  const wasAirborne = useRef(false);
  const jumpState = useRef({
    phase: 'grounded',
    takeoffUntil: 0,
    wasRunning: false,
    fromPlayerJump: false,
    chargeAmount: 0,
    launchedAt: -10,
    launchY: 0,
  });
  const jumpCharge = useRef({ active: false, startedAt: 0, wasRunning: false, amount: 0 });
  const pendingStandingJump = useRef({ active: false, startedAt: 0 });
  const lastGroundedAt = useRef(-10);
  const jumpBufferedUntil = useRef(-10);
  const touchJumpHoldUntil = useRef(-10);
  const lastInteract = useRef(false);
  const lastCamera = useRef(false);
  const lastButtons = useRef({});
  const footstepDust = useRef({ phase: 0, side: -1 });
  // How deep the player's feet are below the sea surface (0 on dry land).
  const wadeDepth = useRef(0);
  const swimState = useRef({ active: false, enteredAt: 0 });
  const swimFatigue = useRef(0);
  // Accumulates drowning damage so the store isn't hit every frame.
  const drownDamage = useRef(0);
  const cameraImpulse = useRef({ startedAt: -10, intensity: 0, duration: 0.34, seed: 1 });
  const lastTeeterAt = useRef(0);
  const lastWallRunAt = useRef(0);
  const lastTurnFlourishAt = useRef(0);
  const lastAutoClimbAt = useRef(0);
  const lastPushAnimationAt = useRef(-10);
  const latestPropPushContact = useRef(null);
  const sustainedObstaclePush = useRef({ id: null, startedAt: -10, lastAt: -10 });
  const lastCactusHitAt = useRef(-10);
  const lastStepUpDustAt = useRef(-10);
  const lastSkidDustAt = useRef(-10);
  const lastPhysicsDebugAt = useRef(0);
  const lastModelYaw = useRef(Math.PI);
  const idleFidget = useRef({ idleSince: 0, nextAt: 0, count: 0 });
  const terrainFeedback = useRef({
    grade: 0,
    uphillDot: 0,
    downhillDot: 0,
    stancePitch: 0,
    stanceRoll: 0,
    stanceSpread: 0,
    groundSource: 'terrain-function',
  });
  const spawnDrop = useRef({ phase: 'pending', zoneId: null, landingUntil: 0 });
  const lastPublishedPose = useRef({
    x: NaN,
    y: NaN,
    z: NaN,
    fx: NaN,
    fy: NaN,
    fz: NaN,
  });
  const lastPosePublishAt = useRef(-10);
  const bounceFeedback = useRef({
    startedAt: -10,
    lastImpactAt: -10,
    intensity: 0,
    normal: new THREE.Vector3(),
  });
  const characterDebug = useRef({
    movement: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    collisions: 0,
    grounded: false,
    source: 'pending',
  });
  const previousMotion = useRef({ moving: false, running: false });
  const pendingMovementCost = useRef({ fatigue: 0, falling: 0, lastFlushAt: 0 });
  const frameScratch = useMemo(() => ({
    input: new THREE.Vector3(),
    startPosition: new THREE.Vector3(),
    rawInputDirection: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    uphillVector: new THREE.Vector3(),
    uphillDirection: new THREE.Vector3(),
    forwardFacing: new THREE.Vector3(),
    targetVelocity: new THREE.Vector3(),
    desiredDelta: new THREE.Vector3(),
    launchHorizontal: new THREE.Vector3(),
    launchDirection: new THREE.Vector3(),
    turnFacing: new THREE.Vector3(),
    collisionNormal: new THREE.Vector3(),
    horizontalVelocity: new THREE.Vector3(),
    tangentVelocity: new THREE.Vector3(),
    localNormal: new THREE.Vector3(),
    pushDirection: new THREE.Vector3(),
    pushObstaclePosition: new THREE.Vector3(),
    pushCandidate: new THREE.Vector3(),
    cactusHorizontalVelocity: new THREE.Vector3(),
    correction: new THREE.Vector3(),
    footstepPosition: new THREE.Vector3(),
  }), []);
  const stateRef = useRef({
    modelAssetId: 'darwin',
    running: false,
    walking: false,
    airborne: false,
    crouching: false,
    aiming: false,
    crouchRunning: false,
    strafeLeft: false,
    strafeRight: false,
    speed: 0,
    action: null,
    jumpPhase: 'grounded',
    jumpWasRunning: false,
    jumpCharging: false,
    jumpChargeAmount: 0,
    actionUntil: 0,
    actionStartedAt: 0,
    lockMovementUntil: 0,
    recoverAction: null,
    climbMotion: null,
    traverseMotion: null,
    rollMotion: null,
    turnMotion: null,
    slopeGrade: 0,
    uphillDot: 0,
    groundPitch: 0,
    groundDistance: 0,
    verticalSpeed: 0,
    tiredRun: false,
    movingBackward: false,
    sitting: false,
    lying: false,
    swimming: false,
    wadeDepth: 0,
    jumpFromHeight: false,
  });
  const [, getKeys] = useKeyboardControls();
  const rapierContext = useRapier();
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const applyMovementCost = useThreeGameStore(state => state.applyMovementCost);
  const applyCactusDamage = useThreeGameStore(state => state.applyCactusDamage);
  const applyDrowningDamage = useThreeGameStore(state => state.applyDrowningDamage);
  const setNearbySpecimen = useThreeGameStore(state => state.setNearbySpecimen);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const setPhysicsDebug = useThreeGameStore(state => state.setPhysicsDebug);
  const setEdgePrompt = useThreeGameStore(state => state.setEdgePrompt);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const movePushableObstacle = useThreeGameStore(state => state.movePushableObstacle);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const setPlayerPose = useThreeGameStore(state => state.setPlayerPose);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const inventoryCount = useThreeGameStore(state => state.inventory.length);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playerSpawnId = useThreeGameStore(state => state.playerSpawnId);
  const zoneSpecimens = useMemo(() => getThreeSpecimens(currentZoneId), [currentZoneId]);
  const collisionAdapter = useMemo(
    () => createCollisionAdapter(currentZoneId, rapierContext, pushableObstacleOffsets),
    [currentZoneId, pushableObstacleOffsets, rapierContext],
  );
  const modelGrounding = useMemo(() => ({
    collisionAdapter,
    motionRef: stateRef,
  }), [collisionAdapter]);
  const characterController = useKinematicCharacterController(rapierContext, characterBodyRef, characterColliderRef);
  const spawnPoint = useMemo(() => regionSpawnPoint(currentZoneId, playerSpawnId), [currentZoneId, playerSpawnId]);
  const startX = spawnPoint.x;
  const startZ = spawnPoint.z;

  const debugMaterials = useMemo(() => ({
    capsule: new THREE.MeshBasicMaterial({
      color: '#34d399',
      transparent: true,
      opacity: 0.2,
      wireframe: true,
      depthWrite: false,
    }),
    collision: new THREE.MeshBasicMaterial({
      color: '#fb7185',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
    movement: new THREE.MeshBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
    stanceTerrain: new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    stanceObstacle: new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
    stanceUnstable: new THREE.MeshBasicMaterial({
      color: '#ef4444',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  }), []);

  const waterlineMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#dffcff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const {
    startAction: startActionAt,
    interruptAction: interruptActionAt,
    triggerAction: triggerActionAt,
  } = usePlayerActions(stateRef, lastButtons);

  useEffect(() => () => {
    waterlineMaterial.dispose();
  }, [waterlineMaterial]);

  useEffect(() => onPropEvent('player-push-contact', contact => {
    latestPropPushContact.current = {
      ...contact,
      receivedAt: performance.now() / 1000,
    };
  }), []);

  const queueMovementCost = useCallback(({
    running = false,
    walking = false,
    airborne = false,
    falling = 0,
    flush = false,
  } = {}, frameDelta = 0, now = 0) => {
    const frameScale = Math.min(frameDelta, 0.05) * 60;
    const fatigueDelta = (
      (running ? MOVEMENT_FATIGUE.runningPerFrame60 : walking ? MOVEMENT_FATIGUE.walkingPerFrame60 : 0)
      + (airborne ? MOVEMENT_FATIGUE.airbornePerFrame60 : 0)
    ) * frameScale;
    const pending = pendingMovementCost.current;
    pending.fatigue += fatigueDelta;
    pending.falling = Math.max(pending.falling, falling);

    const shouldFlush = flush || now - pending.lastFlushAt >= 0.2;
    if (!shouldFlush || (pending.fatigue <= 0 && pending.falling <= 0)) return;

    applyMovementCost({
      fatigueDelta: pending.fatigue,
      falling: pending.falling,
    });
    pending.fatigue = 0;
    pending.falling = 0;
    pending.lastFlushAt = now;
  }, [applyMovementCost]);

  useEffect(() => {
    const cancelPendingJumpCharge = () => {
      if (!jumpCharge.current.active && !pendingStandingJump.current.active) return;
      jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
      pendingStandingJump.current = { active: false, startedAt: 0 };
      stateRef.current.jumpCharging = false;
      stateRef.current.jumpChargeAmount = 0;
      if (stateRef.current.jumpPhase === 'charging') stateRef.current.jumpPhase = 'grounded';
      lastButtons.current.jump = false;
      touchJumpHoldUntil.current = -10;
    };
    window.addEventListener('blur', cancelPendingJumpCharge);
    document.addEventListener('visibilitychange', cancelPendingJumpCharge);
    return () => {
      window.removeEventListener('blur', cancelPendingJumpCharge);
      document.removeEventListener('visibilitychange', cancelPendingJumpCharge);
    };
  }, []);

  useEffect(() => {
    spawnDrop.current = { phase: 'complete', zoneId: currentZoneId, landingUntil: 0 };
    const groundY = spawnPoint.y;
    if (group.current) {
      group.current.position.set(startX, groundY, startZ);
      group.current.rotation.y = Math.PI;
    }
    characterController.sync(new THREE.Vector3(startX, groundY, startZ));
    velocity.current.set(0, 0, 0);
    wasAirborne.current = false;
    stateRef.current.action = null;
    stateRef.current.jumpPhase = 'grounded';
    stateRef.current.climbMotion = null;
    stateRef.current.traverseMotion = null;
    stateRef.current.rollMotion = null;
    stateRef.current.turnMotion = null;
    stateRef.current.lockMovementUntil = 0;
    jumpState.current = {
      phase: 'grounded',
      takeoffUntil: 0,
      wasRunning: false,
      fromPlayerJump: false,
      chargeAmount: 0,
      launchedAt: -10,
      launchY: group.current?.position?.y || 0,
    };
    jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
    pendingStandingJump.current = { active: false, startedAt: 0 };
    stateRef.current.jumpCharging = false;
    stateRef.current.jumpChargeAmount = 0;
    lastGroundedAt.current = performance.now() / 1000;
    resetCameraForSpawn(groundY);
    jumpBufferedUntil.current = -10;
    touchJumpHoldUntil.current = -10;
    lastModelYaw.current = Math.PI;
    lastPublishedPose.current.x = NaN;
    lastPosePublishAt.current = -10;
    footstepDust.current = { phase: 0, side: -1 };
    idleFidget.current = { idleSince: 0, nextAt: 0, count: 0 };
  }, [currentZoneId, playerSpawnId, resetCameraForSpawn, spawnPoint.y, startX, startZ]);

  useFrame((_, delta) => {
    if (!group.current || health <= 0) return;
    collisionAdapter.beginFrame?.();
    const keys = isGameplayInputBlocked() ? EMPTY_KEYS : sanitizeShortcutKeys(getKeys());
    const touch = consumeTouchControls();
    const now = performance.now() / 1000;
    updatePlayerFrameFeedback({
      group,
      warningRef,
      modelFeedbackRef,
      contactShadowRef,
      debugCollisionRef,
      debugMovementRef,
      bounceFeedback,
      velocity,
      terrainFeedback,
      lastModelYaw,
      collisionAdapter,
      characterDebug,
      viewMode,
      physicsDebug,
      now,
      delta,
    });
    const startOfFramePosition = frameScratch.startPosition.copy(group.current.position);
    const durationFor = (clip) => actionDuration(clip, stateRef.current.modelAssetId);
    const resolveActionDuration = (clip, duration) => (
      stateRef.current.modelAssetId === 'darwin5' && duration === ACTION_DURATION[clip]
        ? durationFor(clip)
        : duration
    );
    const startAction = (clip, duration = durationFor(clip), options = {}) => {
      startActionAt(now, clip, resolveActionDuration(clip, duration), options);
    };
    const startPushFeedback = (target, options = {}) => {
      if (!target || stateRef.current.airborne || stateRef.current.swimming) return false;
      if (stateRef.current.action || now - lastPushAnimationAt.current < PUSH_ANIMATION_COOLDOWN) return false;
      const clip = pushAnimationForObstacle(target);
      startAction(clip, ACTION_DURATION[clip], { lockMovement: options.lockMovement ?? false });
      lastPushAnimationAt.current = now;
      return true;
    };
    const interruptAction = (allowed = MOVEMENT_INTERRUPTIBLE_ACTIONS) => interruptActionAt(now, allowed);
    const triggerAction = (button, clip, duration = durationFor(clip), options = {}) => {
      triggerActionAt(now, keys, touch, button, clip, resolveActionDuration(clip, duration), options);
    };

    const safeDelta = Math.min(delta, 0.05);
    if (spawnDrop.current.phase === 'pending') {
      const spawnGroundY = collisionAdapter.groundInfo(group.current.position).y;
      group.current.position.set(startX, spawnGroundY + SPAWN_DROP.height, startZ);
      characterController.sync(group.current.position);
      group.current.rotation.y = Math.PI;
      velocity.current.set(0, SPAWN_DROP.initialVelocity, 0);
      spawnDrop.current.phase = 'dropping';
      wasAirborne.current = true;
    }
    if (spawnDrop.current.phase === 'dropping') {
      const groundInfo = collisionAdapter.groundInfo(group.current.position);
      velocity.current.y = Math.max(SPAWN_DROP.maxFallSpeed, velocity.current.y - PLAYER.gravity * safeDelta);
      group.current.position.y += velocity.current.y * safeDelta;
      const landed = group.current.position.y <= groundInfo.y;
      if (now - lastPhysicsDebugAt.current > 0.12) {
        lastPhysicsDebugAt.current = now;
        setPhysicsDebug({
          grounded: landed,
          groundSource: groundInfo.source,
          groundY: groundInfo.y,
          terrainY: groundInfo.terrainY,
          physicsY: groundInfo.physicsY,
          playerY: group.current.position.y,
          obstacleCount: collisionAdapter.obstacles.length,
          spawnPhase: 'dropping',
          controller: characterDebug.current.source,
          controllerHits: characterDebug.current.collisions,
          computedMove: formatVector(characterDebug.current.movement),
        });
      }
      if (landed) {
        group.current.position.y = groundInfo.y;
        characterController.sync(group.current.position);
        velocity.current.set(0, 0, 0);
        spawnDrop.current.phase = 'landing';
        spawnDrop.current.landingUntil = now + SPAWN_DROP.landingLock;
        stateRef.current.action = 'landing';
        stateRef.current.actionStartedAt = now;
        stateRef.current.actionUntil = now + ACTION_DURATION.landing;
        stateRef.current.lockMovementUntil = now + SPAWN_DROP.landingLock;
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = false;
        stateRef.current.jumpPhase = 'grounded';
        stateRef.current.groundDistance = 0;
        stateRef.current.verticalSpeed = 0;
        wasAirborne.current = false;
      } else {
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = true;
        stateRef.current.jumpPhase = 'spawnDrop';
        stateRef.current.groundDistance = group.current.position.y - groundInfo.y;
        stateRef.current.verticalSpeed = velocity.current.y;
        return;
      }
    }
    if (spawnDrop.current.phase === 'landing') {
      const groundInfo = collisionAdapter.groundInfo(group.current.position);
      group.current.position.y = groundInfo.y;
      characterController.sync(group.current.position);
      velocity.current.set(0, 0, 0);
      if (now - lastPhysicsDebugAt.current > 0.2) {
        lastPhysicsDebugAt.current = now;
        setPhysicsDebug({
          grounded: true,
          groundSource: groundInfo.source,
          groundY: groundInfo.y,
          terrainY: groundInfo.terrainY,
          physicsY: groundInfo.physicsY,
          playerY: group.current.position.y,
          obstacleCount: collisionAdapter.obstacles.length,
          spawnPhase: 'landing',
          controller: characterDebug.current.source,
          controllerHits: characterDebug.current.collisions,
          computedMove: formatVector(characterDebug.current.movement),
        });
      }
      if (now < spawnDrop.current.landingUntil) {
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = false;
        stateRef.current.jumpPhase = 'grounded';
        stateRef.current.groundDistance = 0;
        stateRef.current.verticalSpeed = 0;
        return;
      }
      spawnDrop.current.phase = 'complete';
    }

    if (stateRef.current.action && now >= stateRef.current.actionUntil) {
      const recovery = stateRef.current.recoverAction;
      // Sitting/lying down hold a looping rest pose once the transition
      // finishes, until the player moves or acts (cleared in input handling).
      if (stateRef.current.action === 'standToSit' && health > 0) stateRef.current.sitting = true;
      if (stateRef.current.action === 'lyingDown' && health > 0) stateRef.current.lying = true;
      stateRef.current.action = null;
      stateRef.current.recoverAction = null;
      if (recovery && health > 0) startAction(recovery.clip, recovery.duration, { lockMovement: true });
    }
    if (stateRef.current.climbMotion) {
      const climb = stateRef.current.climbMotion;
      const progress = THREE.MathUtils.clamp((now - climb.startedAt) / climb.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      const arcHeight = Number.isFinite(climb.arcHeight)
        ? climb.arcHeight
        : Math.max(0.28, climb.heightDelta * 0.32);
      const arc = Math.sin(Math.PI * progress) * arcHeight;
      group.current.position.lerpVectors(climb.start, climb.end, eased);
      group.current.position.y += arc;
      characterController.sync(group.current.position);
      velocity.current.set(0, 0, 0);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, climb.targetYaw, 10, delta);
      stateRef.current.running = false;
      stateRef.current.walking = false;
      stateRef.current.airborne = false;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
      const climbForward = frameScratch.forwardFacing.set(Math.sin(climb.targetYaw), 0, Math.cos(climb.targetYaw));
      const climbInput = inputWorldDirection(keys, touch, yawRef.current, frameScratch.targetVelocity);
      const climbInputDot = climbInput ? climbInput.dot(climbForward) : 0;
      const climbCancelled = climbInput && Number.isFinite(climb.cancelAt) && progress >= climb.cancelAt && climbInputDot < -0.25;
      const climbEarlyExit = Number.isFinite(climb.earlyExitAt) && progress >= climb.earlyExitAt && (!climbInput || climbInputDot >= -0.1);
      if (progress >= 1 || climbCancelled || climbEarlyExit) {
        group.current.position.copy(climb.end);
        characterController.sync(group.current.position);
        stateRef.current.climbMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
        if (climb.exitSpeed && !climbCancelled) {
          const exitDirection = climbInput && climbInputDot > 0.2 ? climbInput : climbForward;
          velocity.current.x = exitDirection.x * climb.exitSpeed;
          velocity.current.z = exitDirection.z * climb.exitSpeed;
        }
      }
      wasAirborne.current = false;
      return;
    }
    if (stateRef.current.traverseMotion) {
      const traverse = stateRef.current.traverseMotion;
      const progress = THREE.MathUtils.clamp((now - traverse.startedAt) / traverse.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      const arc = Math.sin(Math.PI * progress) * traverse.arcHeight;
      group.current.position.lerpVectors(traverse.start, traverse.end, eased);
      group.current.position.y += arc;
      characterController.sync(group.current.position);
      velocity.current.set(0, 0, 0);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, traverse.targetYaw, 14, delta);
      stateRef.current.running = false;
      stateRef.current.walking = false;
      stateRef.current.airborne = false;
      stateRef.current.crouching = traverse.crouching;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
      const traverseForward = frameScratch.forwardFacing.set(Math.sin(traverse.targetYaw), 0, Math.cos(traverse.targetYaw));
      const traverseInput = inputWorldDirection(keys, touch, yawRef.current, frameScratch.targetVelocity);
      const traverseInputDot = traverseInput ? traverseInput.dot(traverseForward) : 0;
      const traverseCancelled = traverseInput && Number.isFinite(traverse.cancelAt) && progress >= traverse.cancelAt && traverseInputDot < -0.25;
      const traverseEarlyExit = Number.isFinite(traverse.earlyExitAt) && progress >= traverse.earlyExitAt && (!traverseInput || traverseInputDot >= -0.1);
      if (progress >= 1 || traverseCancelled || traverseEarlyExit) {
        const landingGround = collisionAdapter.groundInfo(traverse.end);
        group.current.position.copy(traverse.end);
        group.current.position.y = landingGround.y;
        characterController.sync(group.current.position);
        stateRef.current.traverseMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
        stateRef.current.crouching = false;
        if (traverse.exitSpeed && !traverseCancelled) {
          // Carry momentum out of the vault so it chains back into the run
          // instead of resetting to a standstill.
          const exitDirection = traverseInput && traverseInputDot > 0.2 ? traverseInput : traverseForward;
          velocity.current.x = exitDirection.x * traverse.exitSpeed;
          velocity.current.z = exitDirection.z * traverse.exitSpeed;
        }
      }
      wasAirborne.current = false;
      return;
    }
    if (stateRef.current.rollMotion) {
      const roll = stateRef.current.rollMotion;
      const progress = THREE.MathUtils.clamp((now - roll.startedAt) / roll.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const target = roll.start.clone().addScaledVector(roll.direction, roll.distance * eased);
      const desired = new THREE.Vector3(target.x - group.current.position.x, 0, target.z - group.current.position.z);
      const characterMove = {
        movement: desired.clone(),
        grounded: false,
        collisions: 0,
        collision: null,
        source: 'analytic-character',
      };
      characterDebug.current.movement.copy(characterMove.movement);
      characterDebug.current.collisions = characterMove.collisions;
      characterDebug.current.grounded = characterMove.grounded;
      characterDebug.current.source = characterMove.source;
      characterDebug.current.normal.set(0, 0, 0);
      group.current.position.add(characterMove.movement);
      const rollCollision = collisionAdapter.resolveCollision(group.current.position, startOfFramePosition);
      if (rollCollision) {
        group.current.position.copy(rollCollision.position).addScaledVector(rollCollision.normal, 0.035);
        characterMove.collisions = 1;
        characterMove.collision = rollCollision;
        characterDebug.current.collisions = 1;
        characterDebug.current.normal.copy(rollCollision.normal);
      }
      const rollGround = collisionAdapter.groundInfo(group.current.position);
      group.current.position.y = rollGround.y;
      characterController.sync(group.current.position);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, roll.targetYaw, 12, delta);
      velocity.current.set(0, 0, 0);
      stateRef.current.running = false;
      stateRef.current.walking = false;
      stateRef.current.airborne = false;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
      if (progress >= 1 || characterMove.collision) {
        stateRef.current.rollMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
        if (roll.exitSpeed && !characterMove.collision) {
          // Come out of the roll moving so it blends into the run.
          velocity.current.x = roll.direction.x * roll.exitSpeed;
          velocity.current.z = roll.direction.z * roll.exitSpeed;
        }
      }
      wasAirborne.current = false;
      return;
    }
    if (stateRef.current.turnMotion) {
      const turn = stateRef.current.turnMotion;
      const progress = THREE.MathUtils.clamp((now - turn.startedAt) / turn.duration, 0, 1);
      group.current.rotation.y = dampAngle(group.current.rotation.y, turn.targetYaw, 18, delta);
      velocity.current.set(0, 0, 0);
      stateRef.current.running = false;
      stateRef.current.walking = false;
      stateRef.current.airborne = false;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
      if (progress >= 1) {
        group.current.rotation.y = turn.targetYaw;
        facing.current.set(Math.sin(turn.targetYaw), 0, Math.cos(turn.targetYaw)).normalize();
        stateRef.current.turnMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
      }
      wasAirborne.current = false;
      return;
    }
    const {
      input,
      moving,
      crouchPressed,
      riflePressed,
      rotateLeftPressed,
      rotateRightPressed,
      climbPressed,
      dodgePressed,
      jumpPressed,
      anyDirectActionPressed,
      lateralOnlyInput,
    } = readPlayerInput(keys, touch, frameScratch.input);
    const propPushContact = latestPropPushContact.current;
    if (
      moving
      && propPushContact
      && now - propPushContact.receivedAt < 0.24
    ) {
      startPushFeedback({
        kind: propPushContact.fixed ? 'wall' : propPushContact.kind,
        height: propPushContact.height,
        colliderTop: propPushContact.height,
        pushMass: propPushContact.mass,
      });
    }
    const preInputMovementLocked = now < stateRef.current.lockMovementUntil || spawnDrop.current.phase !== 'complete';
    if (crouchPressed && !lastButtons.current.crouch && !preInputMovementLocked && !stateRef.current.action && !swimState.current.active) {
      const slideSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (!stateRef.current.crouching && slideSpeed > PLAYER.walkSpeed * 1.2 && !stateRef.current.aiming) {
        // Crouch at sprint = running slide, reusing the roll mover so the
        // slide travels, keeps direction, and exits back into the run.
        const slideDirection = new THREE.Vector3(velocity.current.x, 0, velocity.current.z).normalize();
        characterController.sync(group.current.position);
        startAction('runningSlide', ACTION_DURATION.runningSlide, { lockMovement: true });
        stateRef.current.rollMotion = {
          start: group.current.position.clone(),
          direction: slideDirection,
          distance: THREE.MathUtils.clamp(slideSpeed * 0.52, 2.6, 4.3),
          duration: ACTION_DURATION.runningSlide,
          startedAt: now,
          targetYaw: Math.atan2(slideDirection.x, slideDirection.z),
          exitSpeed: slideSpeed * 0.72,
        };
      } else {
        stateRef.current.crouching = !stateRef.current.crouching;
        const transitionClip = stateRef.current.aiming
          ? (stateRef.current.crouching ? 'standToCover' : 'coverToStand')
          : (stateRef.current.crouching ? 'standToCrouch' : 'crouchToStand');
        startAction(transitionClip, stateRef.current.aiming ? 0.74 : 0.8, { lockMovement: true });
      }
    }
    lastButtons.current.crouch = crouchPressed;
    // Tool swaps play a quick change-item gesture (HUD/number-key driven, so it
    // is detected by watching the active tool rather than a key edge).
    const activeToolId = useThreeGameStore.getState().activeToolId;
    const hasRifle = activeToolId === 'shotgun';
    if (lastToolId.current !== null && activeToolId !== lastToolId.current
      && !stateRef.current.action && !preInputMovementLocked && !stateRef.current.swimming) {
      const transitionClip = activeToolId === 'shotgun'
        ? 'rifleEquip'
        : (lastToolId.current === 'shotgun' ? 'rifleUnequip' : 'changeItem');
      startAction(transitionClip, ACTION_DURATION[transitionClip] || ACTION_DURATION.changeItem, { lockMovement: false });
    }
    lastToolId.current = activeToolId;
    // F toggles rifle aim mode, but only with the shotgun equipped; losing the
    // rifle drops aim. Entering aim raises the rifle (change-item gesture). The
    // cosmetic change-item gesture itself does not block the toggle.
    const aimToggleAllowed = !stateRef.current.action || stateRef.current.action === 'changeItem';
    if (riflePressed && !lastButtons.current.rifle && !preInputMovementLocked && aimToggleAllowed && hasRifle) {
      stateRef.current.aiming = !stateRef.current.aiming;
      if (stateRef.current.aiming) startAction('rifleEquip', 0.7, { lockMovement: false });
      else startAction('rifleUnequip', 0.7, { lockMovement: false });
    }
    if (!hasRifle) stateRef.current.aiming = false;
    lastButtons.current.rifle = riflePressed;
    if (aimActiveRef) aimActiveRef.current = stateRef.current.aiming;
    // Left-click while aiming fires the rifle (firePulseRef bumped by the rig).
    if (stateRef.current.aiming && hasRifle && firePulseRef
      && firePulseRef.current !== lastFirePulse.current) {
      lastFirePulse.current = firePulseRef.current;
      if (!stateRef.current.action) startAction('fireRifle', ACTION_DURATION.fireRifle, { lockMovement: true });
    }
    if (rotateLeftPressed) yawRef.current += CAMERA.keyRotateSpeed * delta;
    if (rotateRightPressed) yawRef.current -= CAMERA.keyRotateSpeed * delta;
    if (keys.recenterCamera && !lastButtons.current.recenterCamera) {
      recenterCamera(facing.current);
    }
    lastButtons.current.recenterCamera = Boolean(keys.recenterCamera);
    pulseEquippedToolOnUse(keys, lastButtons);
    if (moving) {
      interruptAction(MOVEMENT_INTERRUPTIBLE_ACTIONS);
    }
    if (climbPressed || dodgePressed || jumpPressed || crouchPressed || riflePressed || anyDirectActionPressed) {
      interruptAction(CONTROL_INTERRUPTIBLE_ACTIONS);
    }
    // Any movement or control input ends the seated/lying rest pose.
    if ((stateRef.current.sitting || stateRef.current.lying)
      && (moving || climbPressed || dodgePressed || jumpPressed || crouchPressed || riflePressed || anyDirectActionPressed)) {
      stateRef.current.sitting = false;
      stateRef.current.lying = false;
    }
    const runIntent = Boolean((keys.run || touch.run) && moving && !stateRef.current.crouching);
    const crouchRunIntent = Boolean((keys.run || touch.run) && moving && stateRef.current.crouching);
    const fatigueRunT = THREE.MathUtils.clamp(
      (fatigue - PLAYER.tiredRunFatigue) / Math.max(1, PLAYER.exhaustedRunFatigue - PLAYER.tiredRunFatigue),
      0,
      1,
    );
    const canRun = runIntent && fatigue < PLAYER.exhaustedRunFatigue && !carriedObjectId;
    const running = Boolean(canRun);
    const tiredRun = running && fatigueRunT > 0.04;
    const fatigueRunScale = running ? THREE.MathUtils.lerp(1, 0.72, fatigueRunT) : 1;
    const rawRunSpeed = PLAYER.runSpeed * fatigueRunScale;
    const carrySpeedScale = carriedObjectId ? 0.62 : 1;
    // Wading drag: deeper water slows Darwin — about half speed at armpit
    // depth, slower still when he is in over his head.
    const wadeSpeedScale = 1 - Math.min(0.66, Math.max(0, wadeDepth.current) * 0.42);
    const rawMovementSpeed = swimState.current.active
      ? (running ? SWIM.sprintSpeed : SWIM.speed)
      : (stateRef.current.crouching
        ? PLAYER.walkSpeed * (crouchRunIntent ? 0.92 : 0.45)
        : running ? rawRunSpeed : PLAYER.walkSpeed) * carrySpeedScale * wadeSpeedScale;
    const slope = collisionAdapter.terrainSlopeAt(group.current.position.x, group.current.position.z);
    const rawInputDirection = frameScratch.rawInputDirection;
    if (moving) rawInputDirection.copy(input).normalize().applyAxisAngle(frameScratch.up, yawRef.current);
    else rawInputDirection.copy(facing.current).normalize();
    const uphillVector = frameScratch.uphillVector.set(slope.dx, 0, slope.dz);
    const uphillDirection = frameScratch.uphillDirection.set(0, 0, 0);
    if (uphillVector.lengthSq() > 0.0001) uphillDirection.copy(uphillVector).normalize();
    const uphillDot = moving && uphillDirection.lengthSq() > 0 ? THREE.MathUtils.clamp(rawInputDirection.dot(uphillDirection), -1, 1) : 0;
    const uphillPenalty = Math.max(0, uphillDot) * THREE.MathUtils.clamp(slope.grade * PLAYER.uphillSpeedPenalty, 0, 0.32);
    const downhillBoost = Math.max(0, -uphillDot) * THREE.MathUtils.clamp(slope.grade * PLAYER.downhillSpeedBoost, 0, 0.1);
    const slopeSpeedScale = THREE.MathUtils.clamp(1 - uphillPenalty + downhillBoost, 0.68, 1.08);
    const movementSpeed = rawMovementSpeed * slopeSpeedScale;
    terrainFeedback.current.grade = THREE.MathUtils.damp(terrainFeedback.current.grade, slope.grade, 8, delta);
    terrainFeedback.current.uphillDot = THREE.MathUtils.damp(terrainFeedback.current.uphillDot, uphillDot, 8, delta);
    terrainFeedback.current.downhillDot = THREE.MathUtils.damp(terrainFeedback.current.downhillDot, -uphillDot, 8, delta);
    const movementLocked = now < stateRef.current.lockMovementUntil || spawnDrop.current.phase !== 'complete';
    const canTurnInPlace = !moving && !movementLocked && !stateRef.current.action && !stateRef.current.crouching && !stateRef.current.aiming;
    if (rotateLeftPressed && !lastButtons.current.rotateLeft && canTurnInPlace) {
      const targetYaw = group.current.rotation.y + Math.PI / 2;
      startAction('turnLeft90', ACTION_DURATION.turnLeft90, { lockMovement: true });
      stateRef.current.turnMotion = {
        startedAt: now,
        duration: ACTION_DURATION.turnLeft90,
        targetYaw,
      };
    }
    if (rotateRightPressed && !lastButtons.current.rotateRight && canTurnInPlace) {
      const targetYaw = group.current.rotation.y - Math.PI / 2;
      startAction('turnRight90', ACTION_DURATION.turnRight90, { lockMovement: true });
      stateRef.current.turnMotion = {
        startedAt: now,
        duration: ACTION_DURATION.turnRight90,
        targetYaw,
      };
    }
    lastButtons.current.rotateLeft = rotateLeftPressed;
    lastButtons.current.rotateRight = rotateRightPressed;
    triggerDirectPlayerActions({
      triggerAction,
      group,
      facing,
      movementLocked,
    });
    const idleEligible = !moving
      && !movementLocked
      && !stateRef.current.action
      && !stateRef.current.crouching
      && !stateRef.current.aiming
      && !wasAirborne.current
      && !rotateLeftPressed
      && !rotateRightPressed
      && !anyDirectActionPressed;
    if (idleEligible) {
      if (!idleFidget.current.idleSince) {
        idleFidget.current.idleSince = now;
        idleFidget.current.nextAt = now + 7.5;
      } else if (now >= idleFidget.current.nextAt) {
        startAction('lookAroundShort', ACTION_DURATION.lookAroundShort, { lockMovement: false });
        idleFidget.current.count += 1;
        idleFidget.current.nextAt = now + 8.5 + (idleFidget.current.count % 3) * 2.1;
      }
    } else {
      idleFidget.current.idleSince = 0;
      idleFidget.current.nextAt = 0;
    }
    const beginClimbMotion = (clip, end, heightDelta, targetYaw, durationScale = 1, options = {}) => {
      characterController.sync(group.current.position);
      const climbDuration = options.actionDuration ?? durationFor(clip) * durationScale;
      startAction(clip, climbDuration, { lockMovement: options.lockMovement ?? true });
      stateRef.current.climbMotion = {
        start: group.current.position.clone(),
        end,
        heightDelta,
        duration: options.motionDuration ?? climbDuration * 0.92,
        startedAt: now,
        targetYaw,
        arcHeight: options.arcHeight,
        exitSpeed: options.exitSpeed || 0,
        earlyExitAt: options.earlyExitAt,
        cancelAt: options.cancelAt,
      };
      velocity.current.set(0, 0, 0);
    };
    if (climbPressed && !lastButtons.current.climb && !stateRef.current.crouching && !movementLocked && !swimState.current.active) {
      const target = collisionAdapter.findClimbTarget(group.current.position, facing.current);
      if (target) {
        const approachSpeed = Math.hypot(velocity.current.x, velocity.current.z);
        const heroic = running || approachSpeed > PLAYER.walkSpeed * 1.1;
        const smallWallProfile = stateRef.current.modelAssetId === 'darwin5'
          ? boulderTraversalProfile(target.heightDelta, heroic, durationFor)
          : null;
        const climbClip = heroic
          ? 'sprintToWallClimb'
          : 'climbingUpWall';
        beginClimbMotion(
          smallWallProfile?.clip || climbClip,
          target.end,
          target.heightDelta,
          Math.atan2(target.obstacle.x - group.current.position.x, target.obstacle.z - group.current.position.z),
          target.heightDelta > 2.4 ? 1.35 : 1,
          smallWallProfile ? {
            actionDuration: smallWallProfile.actionDuration,
            motionDuration: smallWallProfile.motionDuration,
            arcHeight: smallWallProfile.arcHeight,
            lockMovement: smallWallProfile.lockMovement,
            exitSpeed: approachSpeed * smallWallProfile.exitSpeedScale,
            earlyExitAt: smallWallProfile.earlyExitAt,
            cancelAt: smallWallProfile.cancelAt,
          } : {},
        );
      } else {
        // No climbable obstacle: scale terrain. A steep rise ahead becomes a
        // wall climb; a drop just past the toes becomes a controlled descent.
        const forward = facing.current.clone().setY(0).normalize();
        const here = group.current.position;
        const sample = (distance) => collisionAdapter.groundInfo(
          new THREE.Vector3(here.x + forward.x * distance, here.y, here.z + forward.z * distance),
        );
        const climbYaw = Math.atan2(forward.x, forward.z);
        let handled = false;
        for (const distance of [1.1, 1.7, 2.4, 3.1]) {
          const ahead = sample(distance);
          const rise = ahead.y - here.y;
          if (rise >= 0.85 && rise <= 4.8) {
            const end = new THREE.Vector3(here.x + forward.x * distance, ahead.y + 0.04, here.z + forward.z * distance);
            beginClimbMotion(rise > 2.2 ? 'climb' : 'climbingUpWall', end, rise, climbYaw, rise > 3.4 ? 1.3 : 1);
            handled = true;
            break;
          }
        }
        if (!handled) {
          for (const distance of [0.8, 1.3, 1.9]) {
            const ahead = sample(distance);
            const drop = here.y - ahead.y;
            if (drop >= 0.95 && drop <= 6.5) {
              const end = new THREE.Vector3(here.x + forward.x * distance, ahead.y + 0.04, here.z + forward.z * distance);
              beginClimbMotion('climbingDownWall', end, -drop, climbYaw, drop > 3 ? 1.3 : 1);
              handled = true;
              break;
            }
          }
        }
        if (!handled) startAction('teeter', 0.95, { lockMovement: false });
      }
    }
    lastButtons.current.climb = climbPressed;
    const canPlayLocomotionFlourish = !moving && !stateRef.current.action && !movementLocked;
    if (!moving && previousMotion.current.moving && previousMotion.current.running && !stateRef.current.action && !movementLocked) {
      const previousSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (previousSpeed > PLAYER.walkSpeed * 1.28) {
        startAction('runToStop', Math.min(0.55, ACTION_DURATION.runToStop), { lockMovement: false });
        if (now - lastSkidDustAt.current > 0.22) {
          lastSkidDustAt.current = now;
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(previousSpeed / PLAYER.runSpeed, 0.45, 0.95),
            position: frameScratch.footstepPosition.set(0, 0.06, -0.34),
          });
          cameraImpulse.current = {
            startedAt: now,
            intensity: 0.13,
            duration: 0.16,
            seed: cameraImpulse.current.seed + 1,
          };
        }
      }
    } else if (canPlayLocomotionFlourish && previousMotion.current.moving && !previousMotion.current.running && !wasAirborne.current) {
      const previousSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (previousSpeed > 1.15) {
        startAction('stopWalking', Math.min(0.22, ACTION_DURATION.stopWalking), { lockMovement: false });
      }
    }

    const airborneForControl = wasAirborne.current && !characterDebug.current.grounded;
    if (moving && !movementLocked) {
      input.copy(rawInputDirection);
      const sidestepping = lateralOnlyInput && (stateRef.current.aiming || stateRef.current.crouching);
      const forwardFacing = frameScratch.forwardFacing.set(0, 0, -1).applyAxisAngle(frameScratch.up, yawRef.current);
      // Pivot flourish: reversing direction at speed plays the authored 180
      // turn instead of the body silently swivelling mid-run.
      const currentSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const normalizedFacing = frameScratch.turnFacing.copy(facing.current);
      if (normalizedFacing.lengthSq() > 0.001) normalizedFacing.normalize();
      const reversalDot = normalizedFacing.lengthSq() > 0.001 ? normalizedFacing.dot(input) : 1;
      if (!sidestepping
        && !airborneForControl
        && !stateRef.current.action
        && !stateRef.current.crouching
        && !stateRef.current.aiming
        && reversalDot < -0.66
        && currentSpeed > PLAYER.walkSpeed * 0.7
        && now - lastTurnFlourishAt.current > 0.85) {
        lastTurnFlourishAt.current = now;
        const turnClip = currentSpeed > PLAYER.walkSpeed * 1.25 ? 'runningTurn180' : 'walkingTurn180';
        startAction(turnClip, Math.min(durationFor(turnClip), currentSpeed > PLAYER.walkSpeed * 1.25 ? 0.38 : 0.32), { lockMovement: false });
        const skidSpeed = THREE.MathUtils.clamp(currentSpeed * 0.58, PLAYER.walkSpeed * 0.85, PLAYER.runSpeed * 0.72);
        velocity.current.x = input.x * skidSpeed;
        velocity.current.z = input.z * skidSpeed;
        if (now - lastSkidDustAt.current > 0.18) {
          lastSkidDustAt.current = now;
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(currentSpeed / PLAYER.runSpeed, 0.5, 1),
            position: frameScratch.footstepPosition.set(0, 0.06, -0.28),
          });
          cameraImpulse.current = {
            startedAt: now,
            intensity: 0.16,
            duration: 0.18,
            seed: cameraImpulse.current.seed + 1,
          };
        }
        facing.current.copy(input);
        group.current.rotation.y = dampAngle(
          group.current.rotation.y,
          Math.atan2(input.x, input.z),
          PLAYER.turnDamping * 2.4,
          delta,
        );
      } else if (!sidestepping
        && !airborneForControl
        && !stateRef.current.action
        && !stateRef.current.crouching
        && !stateRef.current.aiming
        && moving
        && running
        && reversalDot > -0.5
        && reversalDot < 0.62
        && currentSpeed > PLAYER.walkSpeed * 1.25
        && now - lastTurnFlourishAt.current > 0.75) {
        lastTurnFlourishAt.current = now;
        const crossY = normalizedFacing.z * input.x - normalizedFacing.x * input.z;
        const turnClip = crossY >= 0 ? 'runningTurnRight' : 'runningTurnLeft';
        startAction(turnClip, Math.min(durationFor(turnClip), 0.34), { lockMovement: false });
        const carveSpeed = THREE.MathUtils.clamp(currentSpeed * 0.82, PLAYER.walkSpeed * 1.15, PLAYER.runSpeed * 0.92);
        velocity.current.x = input.x * carveSpeed;
        velocity.current.z = input.z * carveSpeed;
        if (now - lastSkidDustAt.current > 0.18) {
          lastSkidDustAt.current = now;
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(currentSpeed / PLAYER.runSpeed * 0.75, 0.35, 0.78),
            position: frameScratch.footstepPosition.set(crossY >= 0 ? -0.22 : 0.22, 0.06, -0.2),
          });
        }
      }
      facing.current.copy(sidestepping ? forwardFacing : input);
      const targetVelocity = frameScratch.targetVelocity.copy(input).multiplyScalar(movementSpeed);
      const accel = airborneForControl ? PLAYER.airAcceleration : PLAYER.groundAcceleration;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, targetVelocity.x, accel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, targetVelocity.z, accel, delta);
      const targetYaw = sidestepping ? Math.atan2(forwardFacing.x, forwardFacing.z) : Math.atan2(input.x, input.z);
      // Stronger turn assist at low speed so direction changes from a near
      // standstill feel snappy without twitchy full-speed steering.
      const turnAssist = THREE.MathUtils.lerp(
        PLAYER.lowSpeedTurnBoost,
        1,
        THREE.MathUtils.clamp(currentSpeed / PLAYER.runSpeed, 0, 1),
      );
      group.current.rotation.y = dampAngle(group.current.rotation.y, targetYaw, PLAYER.turnDamping * turnAssist, delta);
    } else {
      const decel = airborneForControl ? PLAYER.airDeceleration : PLAYER.groundDeceleration;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, decel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, decel, delta);
    }

    // Rifle aim mode: the cursor owns Darwin's facing. This overrides the
    // movement-driven yaw above, so velocity can run opposite/lateral to facing
    // (real backpedal and strafing) and shots track the pointer.
    const aimDirection = (stateRef.current.aiming && getAimDirection && !movementLocked && !stateRef.current.action)
      ? getAimDirection(group.current.position)
      : null;
    stateRef.current.aimDirection = aimDirection ? [aimDirection.x, aimDirection.z] : null;
    if (aimDirection) {
      facing.current.copy(aimDirection);
      const aimYaw = Math.atan2(aimDirection.x, aimDirection.z);
      group.current.rotation.y = dampAngle(group.current.rotation.y, aimYaw, 16, delta);
    }

    const groundInfo = collisionAdapter.groundInfo(group.current.position);
    const groundY = groundInfo.y;
    const groundGap = group.current.position.y - groundY;
    const canSnapToGround = jumpState.current.phase !== 'takeoff'
      && velocity.current.y <= 0
      && groundGap <= PLAYER.groundSnapDistance;
    if (canSnapToGround && groundGap > -PLAYER.groundContactEpsilon) {
      group.current.position.y = groundY;
      characterController.sync(group.current.position);
      velocity.current.y = 0;
    }
    const grounded = group.current.position.y <= groundY + PLAYER.groundContactEpsilon;
    if (now - lastPhysicsDebugAt.current > 0.25) {
      lastPhysicsDebugAt.current = now;
      setPhysicsDebug({
        grounded,
        groundSource: groundInfo.source,
        groundY,
        terrainY: groundInfo.terrainY,
        physicsY: groundInfo.physicsY,
        playerY: group.current.position.y,
        jumpPhase: stateRef.current.jumpPhase,
        jumpCharging: stateRef.current.jumpCharging,
        jumpChargeAmount: stateRef.current.jumpChargeAmount,
        velocityY: velocity.current.y,
        groundDistance: group.current.position.y - groundY,
        coyoteAvailable: now - lastGroundedAt.current <= PLAYER.coyoteTime,
        jumpBuffered: now <= jumpBufferedUntil.current,
        slopeGrade: slope.grade,
        uphillDot,
        speedScale: slopeSpeedScale,
        idleFidgetIn: idleFidget.current.nextAt ? Math.max(0, idleFidget.current.nextAt - now) : null,
        inventoryCount,
        injuredGait: health < 38,
        tiredRun,
        fatigueRunScale,
        obstacleCount: collisionAdapter.obstacles.length,
        spawnPhase: spawnDrop.current.phase,
        controller: characterDebug.current.source,
        controllerHits: characterDebug.current.collisions,
        computedMove: formatVector(characterDebug.current.movement),
      });
    }
    if (grounded && spawnDrop.current.phase === 'complete') {
      lastGroundedAt.current = now;
      if (jumpState.current.phase !== 'takeoff') {
        jumpState.current.phase = 'grounded';
      }
    }
    if (dodgePressed && !lastButtons.current.dodge && grounded && !movementLocked && !stateRef.current.action) {
      const rollInput = moving
        ? input.clone().normalize()
        : facing.current.clone().normalize();
      const rollDirection = rollInput.lengthSq() > 0.001 ? rollInput : new THREE.Vector3(0, 0, -1);
      characterController.sync(group.current.position);
      startAction('fallingToRoll', ACTION_DURATION.dodgeRoll, { lockMovement: true });
      stateRef.current.rollMotion = {
        start: group.current.position.clone(),
        direction: rollDirection,
        distance: running ? THREE.MathUtils.lerp(3.15, 4.1, fatigueRunScale) : 3.15,
        duration: ACTION_DURATION.dodgeRoll,
        startedAt: now,
        targetYaw: Math.atan2(rollDirection.x, rollDirection.z),
        exitSpeed: running ? PLAYER.runSpeed * 0.8 : 0,
      };
      stateRef.current.crouching = false;
      stateRef.current.aiming = false;
    }
    lastButtons.current.dodge = dodgePressed;
    const jumpHeld = Boolean(keys.jump || touch.jump);
    const jumpJustPressed = jumpHeld && !lastButtons.current.jump;
    const canStartJumpInput = !stateRef.current.crouching
      && !stateRef.current.aiming
      && !stateRef.current.action
      && spawnDrop.current.phase === 'complete'
      && now >= stateRef.current.lockMovementUntil
      && jumpState.current.phase !== 'takeoff'
      && (grounded || now - lastGroundedAt.current <= PLAYER.coyoteTime);

    const launchJump = (launchRunning, chargeAmount = 0) => {
      const charge = THREE.MathUtils.clamp(chargeAmount, 0, 1);
      const launchVelocity = PLAYER.jumpVelocity
        + (launchRunning ? PLAYER.runningJumpVerticalBonus : PLAYER.chargedJumpBonus * charge);
      velocity.current.y = launchVelocity;
      if (moving || launchRunning) {
        const horizontal = frameScratch.launchHorizontal.set(velocity.current.x, 0, velocity.current.z);
        const launchDirection = moving
          ? frameScratch.launchDirection.copy(rawInputDirection).normalize()
          : frameScratch.launchDirection.copy(facing.current).normalize();
        const minLaunchSpeed = launchRunning ? rawRunSpeed * 0.78 : PLAYER.walkSpeed * 0.52;
        if (horizontal.length() < minLaunchSpeed) {
          horizontal.copy(launchDirection).setLength(minLaunchSpeed);
          velocity.current.x = horizontal.x;
          velocity.current.z = horizontal.z;
        }
      }
      jumpCharge.current.active = false;
      jumpCharge.current.amount = 0;
      pendingStandingJump.current.active = false;
      lastGroundedAt.current = -10;
      jumpBufferedUntil.current = -10;
      jumpState.current = {
        phase: 'takeoff',
        takeoffUntil: now + ACTION_DURATION.jumpTakeoff * (0.52 + charge * 0.18),
        wasRunning: launchRunning,
        fromPlayerJump: true,
        chargeAmount: charge,
        launchedAt: now,
        launchY: group.current.position.y,
      };
      stateRef.current.jumpCharging = false;
      stateRef.current.jumpPhase = 'takeoff';
      stateRef.current.jumpWasRunning = launchRunning;
      stateRef.current.jumpChargeAmount = charge;
      // Leaping off a boulder/ledge (standing well above the terrain) gets
      // the wall-jump takeoff pose instead of the flat-ground jump.
      const launchGround = collisionAdapter.groundInfo(group.current.position);
      stateRef.current.jumpFromHeight = Number.isFinite(launchGround.terrainY)
        && launchGround.y - launchGround.terrainY > 0.85;
      wasAirborne.current = true;
    };

    if (jumpJustPressed && !canStartJumpInput) {
      jumpBufferedUntil.current = now + PLAYER.jumpBufferTime;
    }
    if ((jumpJustPressed || now <= jumpBufferedUntil.current) && canStartJumpInput && !swimState.current.active) {
      const launchRunning = moving || running || Math.hypot(velocity.current.x, velocity.current.z) > PLAYER.walkSpeed * 1.05;
      if (launchRunning) {
        launchJump(true, 0);
      } else {
        pendingStandingJump.current = { active: true, startedAt: now };
        jumpCharge.current = { active: false, startedAt: now, wasRunning: false, amount: 0 };
      }
    }
    stateRef.current.jumpCharging = false;
    if (pendingStandingJump.current.active) {
      const stillCanResolveStandingJump = !stateRef.current.crouching
        && !stateRef.current.aiming
        && !stateRef.current.action
        && spawnDrop.current.phase === 'complete'
        && now >= stateRef.current.lockMovementUntil
        && grounded
        && jumpState.current.phase !== 'takeoff';
      if (!stillCanResolveStandingJump) {
        pendingStandingJump.current.active = false;
        jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
      } else if (!jumpHeld) {
        launchJump(false, jumpCharge.current.active ? jumpCharge.current.amount : 0);
      } else {
        const heldFor = now - pendingStandingJump.current.startedAt;
        if (heldFor >= PLAYER.jumpChargeStartDelay) {
          const rawCharge = (heldFor - PLAYER.jumpChargeStartDelay) / PLAYER.jumpChargeMaxDuration;
          const chargeAmount = THREE.MathUtils.smoothstep(
            THREE.MathUtils.clamp(rawCharge, 0, 1),
            0,
            1,
          );
          jumpCharge.current.active = true;
          jumpCharge.current.startedAt = pendingStandingJump.current.startedAt;
          jumpCharge.current.wasRunning = false;
          jumpCharge.current.amount = chargeAmount;
          stateRef.current.jumpCharging = true;
          stateRef.current.jumpPhase = 'charging';
          stateRef.current.jumpWasRunning = false;
          stateRef.current.jumpChargeAmount = chargeAmount;
          velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, PLAYER.groundDeceleration, delta);
          velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, PLAYER.groundDeceleration, delta);
        }
      }
    }
    lastButtons.current.jump = jumpHeld;
    if (!jumpCharge.current.active && grounded && jumpState.current.phase !== 'takeoff' && velocity.current.y < 0) {
      velocity.current.y = 0;
    }
    if (!jumpCharge.current.active) {
      const gravityScale = velocity.current.y < 0
        ? PLAYER.fallGravityMultiplier
        : (!jumpHeld && velocity.current.y > 0 ? PLAYER.jumpReleaseGravityMultiplier : 1);
      velocity.current.y -= PLAYER.gravity * gravityScale * delta;
    } else {
      velocity.current.y = 0;
    }
    const desiredDelta = frameScratch.desiredDelta.copy(velocity.current).multiplyScalar(delta);
    const canAutoTraverse = grounded
      && moving
      && !movementLocked
      && !stateRef.current.action
      && !stateRef.current.aiming
      && !stateRef.current.crouching
      && desiredDelta.lengthSq() > 0.0001;
    if (canAutoTraverse) {
      const approachSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const traversalTarget = collisionAdapter.findTraversalTarget(group.current.position, desiredDelta, facing.current);
      if (traversalTarget) {
        characterController.sync(group.current.position);
        // Pick the traversal motion by approach speed and obstacle height:
        // Darwin5 uses small-wall climb clips for boulders so ordinary rocks
        // don't borrow the tall wall mantle. Older rigs keep the previous set.
        const heroic = running || approachSpeed > PLAYER.walkSpeed * 1.1;
        const smallWallProfile = stateRef.current.modelAssetId === 'darwin5'
          ? boulderTraversalProfile(traversalTarget.heightDelta, heroic, durationFor)
          : null;
        const tall = traversalTarget.heightDelta > 1.05;
        const clip = smallWallProfile?.clip || (heroic ? (tall ? 'sprintToWallClimb' : 'vault') : 'crouchWalk');
        const duration = smallWallProfile?.actionDuration || (heroic
          ? (tall ? ACTION_DURATION.sprintToWallClimb : ACTION_DURATION.vault)
          : ACTION_DURATION.scramble);
        startAction(clip, duration, { lockMovement: smallWallProfile?.lockMovement ?? true });
        stateRef.current.traverseMotion = {
          start: group.current.position.clone(),
          end: traversalTarget.end.clone(),
          duration: smallWallProfile?.motionDuration || duration,
          startedAt: now,
          targetYaw: Math.atan2(traversalTarget.direction.x, traversalTarget.direction.z),
          arcHeight: smallWallProfile?.arcHeight ?? (heroic
            ? THREE.MathUtils.clamp(0.2 + traversalTarget.heightDelta * 0.26, 0.26, 0.52)
            : THREE.MathUtils.clamp(0.12 + traversalTarget.heightDelta * 0.18, 0.16, 0.34)),
          crouching: smallWallProfile?.crouching ?? !heroic,
          exitSpeed: smallWallProfile
            ? Math.max(0, approachSpeed * smallWallProfile.exitSpeedScale)
            : (heroic ? Math.max(approachSpeed * 0.85, PLAYER.walkSpeed) : 0),
          earlyExitAt: smallWallProfile?.earlyExitAt,
          cancelAt: smallWallProfile?.cancelAt,
        };
        velocity.current.set(0, 0, 0);
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = false;
        wasAirborne.current = false;
        return;
      }
      // Parkour intent: sprinting head-on into a climbable boulder taller
      // than the vault range mantles up it automatically — the climb key
      // remains for deliberate, slower ascents and for taller faces.
      if (!traversalTarget && running && now - lastAutoClimbAt.current > 1.2) {
        const climbTarget = collisionAdapter.findClimbTarget(group.current.position, facing.current);
        if (climbTarget && climbTarget.heightDelta <= 2.9) {
          const surfaceGap = Math.hypot(
            climbTarget.obstacle.x - group.current.position.x,
            climbTarget.obstacle.z - group.current.position.z,
          ) - climbTarget.obstacle.radius - 0.42;
          if (surfaceGap < 0.55) {
            lastAutoClimbAt.current = now;
            characterController.sync(group.current.position);
            const smallWallProfile = stateRef.current.modelAssetId === 'darwin5'
              ? boulderTraversalProfile(climbTarget.heightDelta, true, durationFor)
              : null;
            const climbClip = smallWallProfile?.clip || 'sprintToWallClimb';
            const climbDuration = smallWallProfile?.actionDuration
              || durationFor('sprintToWallClimb') * (climbTarget.heightDelta > 1.6 ? 1.25 : 1);
            startAction(climbClip, climbDuration, { lockMovement: smallWallProfile?.lockMovement ?? true });
            stateRef.current.climbMotion = {
              start: group.current.position.clone(),
              end: climbTarget.end,
              heightDelta: climbTarget.heightDelta,
              duration: smallWallProfile?.motionDuration || climbDuration * 0.92,
              startedAt: now,
              targetYaw: Math.atan2(
                climbTarget.obstacle.x - group.current.position.x,
                climbTarget.obstacle.z - group.current.position.z,
              ),
              arcHeight: smallWallProfile?.arcHeight,
              exitSpeed: smallWallProfile
                ? approachSpeed * smallWallProfile.exitSpeedScale
                : Math.max(approachSpeed * 0.55, PLAYER.walkSpeed),
              earlyExitAt: smallWallProfile?.earlyExitAt,
              cancelAt: smallWallProfile?.cancelAt,
            };
            velocity.current.set(0, 0, 0);
            stateRef.current.running = false;
            stateRef.current.walking = false;
            stateRef.current.airborne = false;
            wasAirborne.current = false;
            return;
          }
        }
      }
    }
    const characterMove = characterController.move(group.current.position, desiredDelta);
    characterDebug.current.movement.copy(characterMove.movement);
    characterDebug.current.collisions = characterMove.collisions;
    characterDebug.current.grounded = characterMove.grounded;
    characterDebug.current.source = characterMove.source;
    characterDebug.current.normal.set(0, 0, 0);
    group.current.position.add(characterMove.movement);
    let collision = null;
    const fallbackCollision = collisionAdapter.resolveCollision(group.current.position, startOfFramePosition);
    if (fallbackCollision) {
      group.current.position.copy(fallbackCollision.position).addScaledVector(fallbackCollision.normal, 0.035);
      characterMove.collisions = 1;
      characterMove.collision = fallbackCollision;
      characterDebug.current.collisions = 1;
      collision = fallbackCollision;
    }
    const specimenCollision = resolveSpecimenCollision(group.current.position, startOfFramePosition, {
      zoneId: currentZoneId,
      specimens: zoneSpecimens,
      playerRadius: CHARACTER_CONTROLLER_CONFIG.radius,
      carriedObjectId,
    });
    if (specimenCollision) {
      group.current.position.copy(specimenCollision.position).addScaledVector(specimenCollision.normal, 0.018);
      pushSpecimenStimulus(currentZoneId, specimenCollision.actorId, {
        kind: 'contact',
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        radius: Math.max(2.4, specimenCollision.radius + 2.2),
        intensity: Math.min(1.4, 0.65 + specimenCollision.penetration * 1.6),
      });
      characterMove.collisions = Math.max(characterMove.collisions || 0, 1);
      characterMove.collision = specimenCollision;
      characterDebug.current.collisions = Math.max(characterDebug.current.collisions || 0, 1);
      collision = {
        ...specimenCollision,
        obstacle: {
          id: specimenCollision.actorId,
          kind: 'specimen',
          height: specimenCollision.specimen?.interactionHeight || 0.8,
          colliderTop: specimenCollision.specimen?.interactionHeight || 0.8,
          pushMass: 2,
          pushable: false,
        },
      };
    }
    characterController.sync(group.current.position);

    if (collision) {
      const normal = frameScratch.collisionNormal.copy(collision.normal).normalize();
      characterDebug.current.normal.copy(normal);
      const horizontalVelocity = frameScratch.horizontalVelocity.set(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = horizontalVelocity.length();
      const intoSurface = impactSpeed > 0.001
        ? Math.max(0, -frameScratch.pushDirection.copy(horizontalVelocity).normalize().dot(normal))
        : 0;
      const normalVelocity = horizontalVelocity.dot(normal);
      const tangentVelocity = frameScratch.tangentVelocity.copy(horizontalVelocity).addScaledVector(normal, -normalVelocity);

      if (normalVelocity < 0) {
        const slideKeep = intoSurface > 0.74 ? 0.9 : 0.99;
        velocity.current.x = tangentVelocity.x * slideKeep;
        velocity.current.z = tangentVelocity.z * slideKeep;
      }

      // Wall run: a running jump into a face too tall to clear plants a foot
      // on it and kicks Darwin back off instead of pancaking him against it.
      const airborneRunningJump = wasAirborne.current
        && jumpState.current.fromPlayerJump
        && jumpState.current.wasRunning;
      if (airborneRunningJump
        && intoSurface > 0.5
        && impactSpeed > 2.4
        && now - lastWallRunAt.current > 0.9
        && !stateRef.current.action) {
        lastWallRunAt.current = now;
        startAction('wallRun', ACTION_DURATION.wallRun, { lockMovement: false });
        const rebound = Math.max(3.4, impactSpeed * 0.6);
        velocity.current.x = normal.x * rebound;
        velocity.current.z = normal.z * rebound;
        velocity.current.y = Math.max(velocity.current.y, 4.4);
        jumpState.current.phase = 'airborne';
        jumpState.current.wasRunning = false;
        stateRef.current.jumpPhase = 'airborne';
        wasAirborne.current = true;
      }

      const directImpact = impactSpeed >= BUMP_FEEDBACK.minSpeed && intoSurface >= BUMP_FEEDBACK.minHeadOn;
      if (!collision.specimen && impactSpeed >= PUSH_ANIMATION_MIN_SPEED && intoSurface >= PUSH_ANIMATION_MIN_FORWARD) {
        startPushFeedback(collision.obstacle || {
          kind: 'wall',
          height: 1.6,
          colliderTop: 1.6,
          pushMass: 20,
        });
      }
      const canReact = now - bounceFeedback.current.lastImpactAt >= BUMP_FEEDBACK.cooldown;
      const pushable = collision.obstacle?.pushable
        ? collision.obstacle
        : findPushableObstacleNear(collisionAdapter.obstacles, group.current.position, horizontalVelocity, normal);
      if (pushable && impactSpeed > 0.55 && intoSurface >= 0.42) {
        const pushDirection = horizontalVelocity.lengthSq() > 0.001
          ? frameScratch.pushDirection.copy(horizontalVelocity).normalize()
          : frameScratch.pushDirection.copy(normal).multiplyScalar(-1).normalize();
        const currentObstaclePosition = frameScratch.pushObstaclePosition.set(pushable.x, 0, pushable.z);
        const pushState = sustainedObstaclePush.current;
        const pushKey = `${pushable.zoneId || currentZoneId}:${pushable.id}`;
        if (pushState.id !== pushKey || now - pushState.lastAt > 0.45) {
          pushState.id = pushKey;
          pushState.startedAt = now;
        }
        pushState.lastAt = now;
        startPushFeedback(mobilityPushAnimationTarget(pushable));
        const slope = downhillGrade({
          position: currentObstaclePosition,
          direction: pushDirection,
          zoneId: pushable.zoneId || currentZoneId,
        });
        const pushStep = computePushAmount({
          mobility: pushable.mobility,
          impactSpeed,
          sustainedTime: now - pushState.startedAt,
          slope,
        });
        const pushDelta = pushDirection.multiplyScalar(pushStep * (pushable.pushFriction ?? 0.88));
        const candidate = frameScratch.pushCandidate.copy(currentObstaclePosition).add(pushDelta);
        const clamped = collisionAdapter.clampToWalkable(candidate, currentObstaclePosition);
        if (pushStep > 0
          && isDownhillMoveAllowed({
            position: currentObstaclePosition,
            direction: pushDirection,
            zoneId: pushable.zoneId || currentZoneId,
            mobility: pushable.mobility,
          })
          && clamped.distanceTo(candidate) < 0.08) {
          movePushableObstacle(pushable.id, pushDelta, pushable.zoneId);
          velocity.current.x *= 0.78;
          velocity.current.z *= 0.78;
        }
      }
      if (directImpact && canReact) {
        const intensity = THREE.MathUtils.clamp(
          0.22 + impactSpeed / 8.5 + collision.penetration * 0.12 + intoSurface * 0.24,
          0.26,
          0.86,
        );
        const localNormal = frameScratch.localNormal.copy(normal).applyAxisAngle(frameScratch.up, -group.current.rotation.y);
        collisionDustTriggerRef.current?.({
          intensity: Math.min(1, intensity * 0.9),
          position: frameScratch.footstepPosition.set(-localNormal.x * 0.46, 0.08, -localNormal.z * 0.46),
        });
        velocity.current.x += normal.x * intensity * 0.38;
        velocity.current.z += normal.z * intensity * 0.38;
        // A run-speed bump reads as a stumble, not a full hit reaction —
        // movement stays live so it feels like weight, not punishment.
        if (!stateRef.current.action && impactSpeed > PLAYER.walkSpeed * 1.15) {
          startAction('stumble', ACTION_DURATION.stumble, { lockMovement: false });
        }
        bounceFeedback.current.startedAt = now;
        bounceFeedback.current.lastImpactAt = now;
        bounceFeedback.current.intensity = intensity;
        bounceFeedback.current.normal.copy(normal);
        cameraImpulse.current = {
          startedAt: now,
          intensity: Math.min(0.58, intensity * 0.62),
          duration: 0.26,
          seed: cameraImpulse.current.seed + 1,
        };
      }
    }

    const cactusContact = findCactusHazardContact(group.current.position);
    if (cactusContact) {
      const horizontalVelocity = frameScratch.cactusHorizontalVelocity.set(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = horizontalVelocity.length();
      const movingIntoCactus = impactSpeed > CACTUS_HAZARD.minSpeed
        ? frameScratch.pushDirection.copy(horizontalVelocity).normalize().dot(cactusContact.normal) < 0.25
        : true;
      const canCactusHit = movingIntoCactus && now - lastCactusHitAt.current >= CACTUS_HAZARD.cooldown;
      group.current.position.addScaledVector(cactusContact.normal, Math.min(0.34, cactusContact.penetration + 0.08));
      if (canCactusHit) {
        lastCactusHitAt.current = now;
        const shove = CACTUS_HAZARD.shove + Math.min(1.4, impactSpeed * 0.24);
        velocity.current.x = cactusContact.normal.x * shove;
        velocity.current.z = cactusContact.normal.z * shove;
        velocity.current.y = Math.max(velocity.current.y, 0.72);
        applyCactusDamage(cactusContact.cactus.damage || 8);
        startAction('stumble', durationFor('stumble'), { lockMovement: false });
        bounceFeedback.current.startedAt = now;
        bounceFeedback.current.lastImpactAt = now;
        bounceFeedback.current.intensity = 0.72;
        bounceFeedback.current.normal.copy(cactusContact.normal);
        cameraImpulse.current = {
          startedAt: now,
          intensity: 0.42,
          duration: 0.28,
          seed: cameraImpulse.current.seed + 1,
        };
      }
    }

    let nextGroundInfo = collisionAdapter.groundInfo(group.current.position);
    let stanceGroundInfo = collisionAdapter.stanceGroundInfo?.(group.current.position, facing.current);
    if (
      nextGroundInfo.source === 'authored-obstacle'
      && stanceGroundInfo
      && stanceGroundInfo.obstacleSupportCount <= 1
      && stanceGroundInfo.spread > 0.14
    ) {
      nextGroundInfo = collisionAdapter.groundInfo(group.current.position, { ignoreObstacles: true });
      stanceGroundInfo = collisionAdapter.stanceGroundInfo?.(group.current.position, facing.current);
    }
    const nextGroundY = nextGroundInfo.y;
    const groundDistance = group.current.position.y - nextGroundY;
    const groundedForStance = groundDistance <= PLAYER.groundSnapDistance && jumpState.current.phase !== 'takeoff';
    const stancePitch = groundedForStance && stanceGroundInfo
      ? THREE.MathUtils.clamp(stanceGroundInfo.pitch, -0.12, 0.12)
      : 0;
    const stanceRoll = groundedForStance && stanceGroundInfo
      ? THREE.MathUtils.clamp(stanceGroundInfo.roll, -0.12, 0.12)
      : 0;
    terrainFeedback.current.stancePitch = THREE.MathUtils.damp(terrainFeedback.current.stancePitch, stancePitch, 9, delta);
    terrainFeedback.current.stanceRoll = THREE.MathUtils.damp(terrainFeedback.current.stanceRoll, stanceRoll, 9, delta);
    terrainFeedback.current.stanceSpread = THREE.MathUtils.damp(
      terrainFeedback.current.stanceSpread,
      groundedForStance && stanceGroundInfo ? stanceGroundInfo.spread : 0,
      8,
      delta,
    );
    terrainFeedback.current.groundSource = nextGroundInfo.source;
    if (physicsDebug && debugStanceRefs.current.length) {
      const unstable = stanceGroundInfo?.supportedByObstacle
        && stanceGroundInfo.obstacleSupportCount <= 1
        && stanceGroundInfo.spread > 0.14;
      const samples = stanceGroundInfo?.samples || [];
      debugStanceRefs.current.forEach((mesh, index) => {
        if (!mesh) return;
        const sample = samples[index];
        mesh.visible = Boolean(sample);
        if (!sample) return;
        mesh.position.set(
          sample.x - group.current.position.x,
          sample.y - group.current.position.y + 0.035,
          sample.z - group.current.position.z,
        );
        mesh.material = unstable
          ? debugMaterials.stanceUnstable
          : sample.source === 'authored-obstacle'
            ? debugMaterials.stanceObstacle
            : debugMaterials.stanceTerrain;
      });
    }
    const belowTerrainFloor = groundDistance < -PLAYER.groundContactEpsilon
      && (velocity.current.y <= 0 || groundDistance < -PLAYER.groundSnapDistance);
    const canResolveGroundContact = velocity.current.y <= 0 && jumpState.current.phase !== 'takeoff';
    const terrainContact = canResolveGroundContact && groundDistance <= PLAYER.groundContactEpsilon;
    const terrainSnapContact = velocity.current.y <= 0
      && jumpState.current.phase !== 'takeoff'
      && groundDistance <= PLAYER.groundSnapDistance;
    const rapierContact = canResolveGroundContact && characterMove.grounded && Math.abs(groundDistance) <= PLAYER.groundSnapDistance;
    const landed = terrainContact || terrainSnapContact || rapierContact || belowTerrainFloor;
    if (landed) {
      const falling = wasAirborne.current ? Math.abs(velocity.current.y) : 0;
      const intentionalPlayerJump = wasAirborne.current && jumpState.current.fromPlayerJump;
      const landedJumpWasRunning = jumpState.current.wasRunning;
      const landedJumpCharge = jumpState.current.chargeAmount || 0;
      const softStandingJumpLanding = intentionalPlayerJump
        && !landedJumpWasRunning
        && landedJumpCharge < 0.15
        && falling < 7.8;
      if (groundDistance <= PLAYER.groundSnapDistance || belowTerrainFloor) {
        group.current.position.y = nextGroundY;
        characterController.sync(group.current.position);
      }
      velocity.current.y = 0;
      if (wasAirborne.current) {
        jumpState.current = {
          phase: 'grounded',
          takeoffUntil: 0,
          wasRunning: false,
          fromPlayerJump: false,
          chargeAmount: 0,
          launchedAt: -10,
          launchY: group.current.position.y,
        };
        stateRef.current.jumpPhase = 'landing';
      }
      const landingSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (wasAirborne.current && falling > 1.2) {
        const dustIntensity = THREE.MathUtils.clamp(
          0.18 + falling / 15 + landingSpeed / 14,
          0.24,
          0.95,
        );
        if (group.current.position.y < WATER_LEVEL + 0.02) {
          const splashPosition = { x: group.current.position.x, y: WATER_LEVEL, z: group.current.position.z };
          emitPropEvent('water-ripple', {
            position: splashPosition,
            intensity: Math.min(1, dustIntensity + 0.12),
          });
          emitPropEvent('water-splash', {
            position: splashPosition,
            intensity: Math.min(1, dustIntensity + 0.2),
          });
        } else {
          const biome = terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId);
          landingDustTriggerRef.current?.({ intensity: dustIntensity, biome });
        }
        if (falling > 7.2) {
          cameraImpulse.current = {
            startedAt: now,
            intensity: THREE.MathUtils.clamp(falling / 26 + landingSpeed / 30, 0.18, 0.68),
            duration: 0.34,
            seed: cameraImpulse.current.seed + 1,
          };
        }
      }
      if (intentionalPlayerJump && falling > 19.5 && !stateRef.current.action) {
        startAction('shoulderHitAndFall', ACTION_DURATION.shoulderHitAndFall, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      } else if (intentionalPlayerJump && falling > 16.5 && !stateRef.current.action) {
        startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      } else if (falling > 13.5 && !stateRef.current.action) {
        startAction('shoulderHitAndFall', ACTION_DURATION.shoulderHitAndFall, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      } else if (falling > 9.5 && landingSpeed > 3.6 && !stateRef.current.action) {
        // Fast long landings roll through the impact. `runToDive` reads like a
        // swim entry on dry ground, so reserve it for water and use the roll.
        const rollDirection = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
        if (rollDirection.lengthSq() < 0.0001) rollDirection.copy(facing.current);
        rollDirection.setY(0).normalize();
        const rollDuration = durationFor('fallingToRoll');
        startAction('fallingToRoll', rollDuration, { lockMovement: 0.5 });
        stateRef.current.rollMotion = {
          start: group.current.position.clone(),
          direction: rollDirection,
          distance: THREE.MathUtils.clamp(landingSpeed * 0.34, 1.25, 2.65),
          duration: Math.min(rollDuration, 1.05),
          startedAt: now,
          targetYaw: Math.atan2(rollDirection.x, rollDirection.z),
          exitSpeed: Math.min(landingSpeed * 0.62, PLAYER.runSpeed * 0.78),
        };
      } else if (falling > 9.5 && !stateRef.current.action) {
        startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      } else if (!intentionalPlayerJump && falling > 6.8 && !stateRef.current.action) {
        startAction('bigJumpDown', durationFor('bigJumpDown'), { lockMovement: 0.38 });
      } else if (!intentionalPlayerJump && falling > 3.8 && !stateRef.current.action) {
        startAction('jumpDown', durationFor('jumpDown'), { lockMovement: 0.28 });
      } else if (falling > 2.4 && landingSpeed > PLAYER.walkSpeed * 1.1 && !stateRef.current.action) {
        startAction('runningLanding', ACTION_DURATION.runningLanding, { lockMovement: false });
      } else if (falling > 2.4 && !softStandingJumpLanding && !stateRef.current.action) {
        startAction('landing', ACTION_DURATION.landing, { lockMovement: false });
      }
      if (moving || running || falling > 0.5) {
        queueMovementCost({ running, walking: moving && !running, airborne: false, falling, flush: falling > 0.5 }, delta, now);
      }
    } else if (moving || !grounded) {
      if (jumpState.current.phase === 'takeoff' && now >= jumpState.current.takeoffUntil) {
        jumpState.current.phase = 'airborne';
        stateRef.current.jumpPhase = 'airborne';
      }
      if (jumpState.current.phase !== 'takeoff' && velocity.current.y < -1.2 && groundDistance < 1.35) {
        stateRef.current.jumpPhase = 'prelanding';
      } else if (jumpState.current.phase !== 'takeoff') {
        stateRef.current.jumpPhase = 'airborne';
      }
      queueMovementCost({ running, walking: moving && !running, airborne: !grounded, falling: 0 }, delta, now);
    }
    wasAirborne.current = (
      !landed
      && (jumpState.current.phase === 'takeoff' || velocity.current.y > 0 || (!grounded && !characterMove.grounded))
    );
    const p = group.current.position;
    const swim = swimState.current;
    const swimGround = collisionAdapter.groundInfo(p);
    const waterDepthHere = Math.max(0, WATER_LEVEL - swimGround.y);
    frameScratch.pushCandidate.copy(p).addScaledVector(facing.current, 1.25);
    const forwardWaterDepth = Math.max(0, WATER_LEVEL - collisionAdapter.groundInfo(frameScratch.pushCandidate).y);
    const waterEntryAhead = waterDepthHere > 0.22 || forwardWaterDepth > SWIM.exitDepth;
    const edgeRisk = (!swim.active && !wasAirborne.current && !waterEntryAhead)
      ? collisionAdapter.edgeRisk(p, facing.current)
      : null;
    if (edgeRisk && edgeRisk.intensity > 0.52 && moving && now - lastTeeterAt.current > 3.4 && !stateRef.current.action) {
      lastTeeterAt.current = now;
      if (edgeRisk.intensity > 0.72) startAction('teeter', 0.75, { lockMovement: false });
      velocity.current.x -= edgeRisk.direction.x * 0.42;
      velocity.current.z -= edgeRisk.direction.z * 0.42;
    }

    // Swimming: water deeper than SWIM.enterDepth floats Darwin instead of
    // drowning him. Wading in or falling in both transition to a swim state;
    // shallowing terrain transitions back out through the wade.
    if (!swim.active && health > 0) {
      const wadedIn = !wasAirborne.current && waterDepthHere > SWIM.enterDepth;
      const fellIn = wasAirborne.current && p.y <= WATER_LEVEL - 0.18 && waterDepthHere > SWIM.enterDepth;
      if (wadedIn || fellIn) {
        swim.active = true;
        swim.enteredAt = now;
        stateRef.current.crouching = false;
        stateRef.current.aiming = false;
        jumpCharge.current.active = false;
        pendingStandingJump.current.active = false;
        jumpState.current.phase = 'grounded';
        stateRef.current.jumpPhase = 'grounded';
        if (fellIn) {
          startAction('fallingIntoPool', ACTION_DURATION.fallingIntoPool, { lockMovement: true });
          const entryPosition = { x: p.x, y: WATER_LEVEL, z: p.z };
          emitPropEvent('water-ripple', {
            position: entryPosition,
            intensity: 1,
          });
          emitPropEvent('water-splash', {
            position: entryPosition,
            intensity: 1,
          });
        }
        velocity.current.y = 0;
      }
    }
    if (swim.active) {
      // Buoyancy: settle to float height; the seafloor no longer owns Y.
      const floatY = WATER_LEVEL - SWIM.bodySink;
      p.y = Math.abs(p.y - floatY) > 2.4 ? floatY : THREE.MathUtils.damp(p.y, floatY, 5, delta);
      velocity.current.y = 0;
      wasAirborne.current = false;
      stateRef.current.jumpPhase = 'grounded';
      characterController.sync(p);
      if (moving && !stateRef.current.action && !movementLocked && waterDepthHere > SWIM.exitDepth * 0.75) {
        const exitDirection = frameScratch.swimExitDirection || new THREE.Vector3();
        frameScratch.swimExitDirection = exitDirection;
        exitDirection.copy(rawInputDirection.lengthSq() > 0.001 ? rawInputDirection : facing.current).setY(0);
        if (exitDirection.lengthSq() > 0.001) {
          exitDirection.normalize();
          const start = group.current.position;
          const heroic = running || Math.hypot(velocity.current.x, velocity.current.z) > PLAYER.walkSpeed * 0.85;
          const facingTowardExit = facing.current.lengthSq() > 0.001
            ? exitDirection.dot(frameScratch.forwardFacing.copy(facing.current).setY(0).normalize())
            : 1;
          const canAutoExitWater = facingTowardExit > 0.34 || heroic;
          for (const distance of [0.85, 1.2, 1.65, 2.15]) {
            if (!canAutoExitWater) break;
            const probe = frameScratch.pushCandidate.set(
              start.x + exitDirection.x * distance,
              start.y,
              start.z + exitDirection.z * distance,
            );
            const ahead = collisionAdapter.groundInfo(probe);
            const landRise = ahead.y - WATER_LEVEL;
            const actualRise = ahead.y + 0.04 - start.y;
            if (ahead.y > WATER_LEVEL - 0.16 && landRise >= 0.48 && actualRise >= 0.62 && actualRise <= 1.85) {
              const candidateEnd = new THREE.Vector3(probe.x, ahead.y + 0.04, probe.z);
              const walkableEnd = collisionAdapter.clampToWalkable(candidateEnd, start, { wade: false });
              const landingShift = Math.hypot(walkableEnd.x - candidateEnd.x, walkableEnd.z - candidateEnd.z);
              if (landingShift > 0.32) continue;
              const landingGround = collisionAdapter.groundInfo(walkableEnd, { ignoreObstacles: true });
              const end = new THREE.Vector3(walkableEnd.x, landingGround.y + 0.04, walkableEnd.z);
              const profile = stateRef.current.modelAssetId === 'darwin5'
                ? boulderTraversalProfile(actualRise, heroic, durationFor)
                : null;
              swim.active = false;
              stateRef.current.swimming = false;
              wadeDepth.current = 0;
              emitPropEvent('water-ripple', {
                position: { x: start.x, y: WATER_LEVEL, z: start.z },
                intensity: 0.62,
                yaw: Math.atan2(exitDirection.x, exitDirection.z),
              });
              emitPropEvent('water-splash', {
                position: { x: start.x, y: WATER_LEVEL, z: start.z },
                intensity: 0.42,
                yaw: Math.atan2(exitDirection.x, exitDirection.z),
              });
              cameraImpulse.current = {
                startedAt: now,
                intensity: 0.12,
                duration: 0.16,
                seed: cameraImpulse.current.seed + 1,
              };
              beginClimbMotion(
                profile?.clip || (landRise > 1.45 ? 'climbingUpWall' : 'climbWaistHeight'),
                end,
                actualRise,
                Math.atan2(exitDirection.x, exitDirection.z),
                0.72,
                profile ? {
                  actionDuration: Math.min(profile.actionDuration, THREE.MathUtils.clamp(0.46 + actualRise * 0.2, 0.56, 0.86)),
                  motionDuration: THREE.MathUtils.clamp(profile.motionDuration * 0.88, 0.34, 0.82),
                  arcHeight: Math.min(profile.arcHeight ?? 0.18, 0.24),
                  lockMovement: profile.lockMovement,
                  exitSpeed: Math.max(PLAYER.walkSpeed * 0.35, PLAYER.walkSpeed * profile.exitSpeedScale),
                  earlyExitAt: profile.earlyExitAt,
                  cancelAt: profile.cancelAt,
                } : {
                  motionDuration: THREE.MathUtils.clamp(0.32 + actualRise * 0.18, 0.38, 0.82),
                  arcHeight: THREE.MathUtils.clamp(0.1 + actualRise * 0.06, 0.12, 0.22),
                  exitSpeed: PLAYER.walkSpeed * 0.35,
                },
              );
              return;
            }
          }
        }
      }
      if (waterDepthHere < SWIM.exitDepth) {
        // Shore reached: stand up through the shallows. Darwin 5's
        // swim-to-edge source clip is long and reads badly on gentle beaches,
        // so shallow exits simply become wading/walking.
        swim.active = false;
        p.y = swimGround.y;
        characterController.sync(p);
        if (moving && stateRef.current.modelAssetId !== 'darwin5') {
          startAction('swimToEdge', durationFor('swimToEdge'), { lockMovement: 0.34 });
        }
      }
    }
    const allowDeepWater = swim.active || wasAirborne.current || wadeDepth.current > WADE_DEPTH * 0.96;
    const clamped = collisionAdapter.clampToWalkable(p, startOfFramePosition, { wade: true, deep: allowDeepWater });
    if (!clamped.equals(p)) {
      const correction = frameScratch.correction.copy(clamped).sub(p);
      p.copy(clamped);
      characterController.sync(p);
      const correctionDistance = Math.hypot(correction.x, correction.z);
      if (moving && desiredDelta.lengthSq() > 0.0001 && correctionDistance > 0.055) {
        const attempted = frameScratch.pushDirection.copy(desiredDelta).setY(0);
        const pushedBack = frameScratch.collisionNormal.copy(correction).setY(0);
        if (attempted.lengthSq() > 0.0001 && pushedBack.lengthSq() > 0.0001) {
          attempted.normalize();
          pushedBack.normalize();
          if (attempted.dot(pushedBack) < -0.35) {
            startPushFeedback({
              kind: 'cliff',
              height: 1.7,
              colliderTop: 1.7,
              pushMass: 24,
            });
          }
        }
      }
      const velocityKeep = correctionDistance < 0.65 ? 0.72 : 0.35;
      velocity.current.x *= velocityKeep;
      velocity.current.z *= velocityKeep;
    }
    const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    if (!swim.active && !wasAirborne.current && jumpState.current.phase !== 'takeoff') {
      const finalGroundInfo = collisionAdapter.groundInfo(p);
      const groundLift = finalGroundInfo.y - p.y;
      p.y = finalGroundInfo.y;
      characterController.sync(p);
      velocity.current.y = 0;
      if (
        finalGroundInfo.source === 'authored-obstacle'
        && groundLift > 0.08
        && groundLift <= 0.7
        && horizontalSpeed > 0.8
        && now - lastStepUpDustAt.current > 0.28
      ) {
        lastStepUpDustAt.current = now;
        footstepDustTriggerRef.current?.({
          intensity: THREE.MathUtils.clamp(0.25 + groundLift * 0.75 + horizontalSpeed / 18, 0.28, 0.72),
          position: frameScratch.footstepPosition.set(0, 0.06, 0.18),
        });
      }
    }

    updatePlayerInteractions({
      keys,
      touch,
      position: p,
      facing: facing.current,
      currentZoneId,
      zoneSpecimens,
      stateRef,
      lastInteractRef: lastInteract,
      lastCameraRef: lastCamera,
      startAction,
      collectNearby,
      cycleViewMode,
      setNearbySpecimen,
      setActiveTool,
      setEdgePrompt,
      beginZoneTransition,
      setCarriedObject,
    });

    updateCamera({
      playerPosition: p,
      facing: facing.current,
      collisionAdapter,
      wasAirborne: wasAirborne.current,
      cameraImpulse: cameraImpulse.current,
      viewMode,
      now,
      delta,
    });

    stateRef.current.speed = horizontalSpeed;
    stateRef.current.slopeGrade = terrainFeedback.current.grade;
    stateRef.current.uphillDot = terrainFeedback.current.uphillDot;
    stateRef.current.stanceSpread = terrainFeedback.current.stanceSpread;
    stateRef.current.groundSource = terrainFeedback.current.groundSource;
    // Path-relative signed ground pitch for stair clips: grade scaled by how
    // directly travel heads up/down the slope (uphillDot). Walking level across
    // a steep hillside reads ~0, so stairs only trigger on real ascent/descent.
    stateRef.current.groundPitch = terrainFeedback.current.grade * terrainFeedback.current.uphillDot;
    // Backpedalling reads off velocity vs. facing — the body normally realigns
    // to its movement direction, so this only trips when facing stays opposed
    // to travel (aim/strafe reversals), avoiding false moonwalk triggers.
    const facingDot = (horizontalSpeed > 0.2 && facing.current.lengthSq() > 0.001)
      ? (velocity.current.x * facing.current.x + velocity.current.z * facing.current.z) / horizontalSpeed
      : 1;
    stateRef.current.movingBackward = facingDot < -0.5;
    stateRef.current.groundDistance = groundDistance;
    stateRef.current.verticalSpeed = velocity.current.y;
    stateRef.current.tiredRun = tiredRun;
    const runningEnterSpeed = PLAYER.walkSpeed * 0.92;
    const runningExitSpeed = PLAYER.walkSpeed * 0.66;
    stateRef.current.running = running && (
      horizontalSpeed > runningEnterSpeed
      || (stateRef.current.running && horizontalSpeed > runningExitSpeed)
    );
    stateRef.current.walking = horizontalSpeed > 0.55 && !stateRef.current.running;
    stateRef.current.crouchRunning = stateRef.current.crouching && crouchRunIntent && horizontalSpeed > PLAYER.walkSpeed * 0.5;
    stateRef.current.airborne = wasAirborne.current;
    stateRef.current.swimming = swimState.current.active;
    wadeDepth.current = stateRef.current.airborne ? 0 : Math.max(0, WATER_LEVEL - p.y);
    stateRef.current.wadeDepth = wadeDepth.current;
    if (waterlineRef.current) {
      const wet = THREE.MathUtils.clamp(wadeDepth.current / 0.85, 0, 1);
      waterlineRef.current.visible = wet > 0.025;
      waterlineRef.current.position.y = WATER_LEVEL - group.current.position.y + 0.018;
      waterlineRef.current.scale.setScalar(0.8 + wet * 0.18 + THREE.MathUtils.clamp(horizontalSpeed / PLAYER.walkSpeed, 0, 1) * 0.08);
      waterlineRef.current.rotation.z += delta * (0.12 + horizontalSpeed * 0.035);
      waterlineRef.current.material.opacity = wet > 0.025 ? (0.08 + wet * 0.08) : 0;
    }
    // Swimming economy: strokes drain fatigue (faster when sprinting), and an
    // exhausted swimmer starts to drown. Both accumulate locally and hit the
    // store in chunks so we don't set state every frame.
    if (swimState.current.active && health > 0) {
      const sprintingSwim = running && horizontalSpeed > SWIM.speed * 1.05;
      swimFatigue.current += delta * (sprintingSwim ? SWIM.sprintFatiguePerSecond : SWIM.fatiguePerSecond);
      if (swimFatigue.current >= 1.2) {
        applyMovementCost({ fatigueDelta: swimFatigue.current });
        swimFatigue.current = 0;
      }
      if (fatigue >= SWIM.exhaustedFatigue) {
        drownDamage.current += delta * 7;
        if (drownDamage.current >= 4) {
          applyDrowningDamage(drownDamage.current);
          drownDamage.current = 0;
        }
      } else {
        drownDamage.current = 0;
      }
    } else if (wadeDepth.current > WADE_DEPTH && health > 0) {
      // Safety net for any non-swim over-depth state (e.g. carried objects later).
      drownDamage.current += delta * 9;
      if (drownDamage.current >= 4) {
        applyDrowningDamage(drownDamage.current);
        drownDamage.current = 0;
      }
    } else {
      drownDamage.current = 0;
      swimFatigue.current = 0;
    }
    if (!stateRef.current.airborne && moving && horizontalSpeed > 0.85 && !jumpCharge.current.active) {
      if (wadeDepth.current > 0.05) {
        // Wading: every footfall makes a ring; droplets are reserved for
        // deeper, faster movement so shallow water stays understated.
        const cadence = (stateRef.current.running ? 3.1 : 2.1) * THREE.MathUtils.clamp(horizontalSpeed / PLAYER.walkSpeed, 0.55, 1.6);
        footstepDust.current.phase += delta * cadence;
        if (footstepDust.current.phase >= 1) {
          footstepDust.current.phase -= 1;
          footstepDust.current.side *= -1;
          const sideX = -facing.current.z * footstepDust.current.side * 0.18;
          const sideZ = facing.current.x * footstepDust.current.side * 0.18;
          const ripplePosition = {
            x: p.x + sideX + facing.current.x * 0.22,
            y: WATER_LEVEL,
            z: p.z + sideZ + facing.current.z * 0.22,
          };
          const rippleIntensity = THREE.MathUtils.clamp(
            0.16 + horizontalSpeed / PLAYER.runSpeed * 0.28 + wadeDepth.current * 0.36,
            0.18,
            0.72,
          );
          emitPropEvent('water-ripple', {
            position: ripplePosition,
            intensity: rippleIntensity,
            yaw: Math.atan2(facing.current.x, facing.current.z),
          });
          if (stateRef.current.running || horizontalSpeed > PLAYER.walkSpeed * 1.18 || wadeDepth.current > 0.44) {
            emitPropEvent('water-splash', {
              position: ripplePosition,
              intensity: THREE.MathUtils.clamp(rippleIntensity * 0.78, 0.24, 0.62),
            });
          }
        }
      } else {
        const biome = terrainBiomeAt(p.x, p.z, p.y, currentZoneId);
        const dustyBiome = biome === 'ash-slope'
          || biome === 'black-lava'
          || biome === 'tuff-ridge'
          || biome === 'dry-scrub'
          || biome === 'palo-santo'
          || biome === 'wet-basalt';
        if (dustyBiome) {
          const cadence = (stateRef.current.running ? 3.9 : 2.45) * THREE.MathUtils.clamp(horizontalSpeed / PLAYER.walkSpeed, 0.55, 1.85);
          footstepDust.current.phase += delta * cadence;
          if (footstepDust.current.phase >= 1) {
            footstepDust.current.phase -= 1;
            footstepDust.current.side *= -1;
            const wetScale = biome === 'wet-basalt' ? 0.32 : 1;
            const stepIntensity = THREE.MathUtils.clamp(
              (stateRef.current.running ? 0.36 : 0.22) * wetScale + horizontalSpeed / PLAYER.runSpeed * 0.18,
              0.16,
              0.62,
            );
            footstepDustTriggerRef.current?.({
              intensity: stepIntensity,
              position: frameScratch.footstepPosition.set(footstepDust.current.side * 0.18, 0.055, 0.18),
              biome,
            });
          }
        }
      }
    } else {
      footstepDust.current.phase = Math.min(footstepDust.current.phase, 0.35);
    }
    if (!stateRef.current.airborne && !stateRef.current.action && !jumpCharge.current.active) {
      stateRef.current.jumpPhase = 'grounded';
      stateRef.current.jumpChargeAmount = 0;
      stateRef.current.jumpCharging = false;
    }
    stateRef.current.strafeLeft = Boolean((keys.left || touch.left) && !(keys.forward || keys.backward || touch.forward || touch.backward));
    stateRef.current.strafeRight = Boolean((keys.right || touch.right) && !(keys.forward || keys.backward || touch.forward || touch.backward));
    // While aiming, facing is locked to the cursor, so the gait is whatever the
    // velocity is doing relative to that facing — derive strafe/backpedal from
    // velocity vs. facing rather than which key is held.
    if (stateRef.current.aiming) {
      const aimSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const fx = facing.current.x;
      const fz = facing.current.z;
      if (aimSpeed > 0.35 && (fx * fx + fz * fz) > 0.001) {
        const fwd = (velocity.current.x * fx + velocity.current.z * fz) / aimSpeed;
        // Player's right vector: facing (forward = -Z) rotated -90deg about Y
        // maps (fx,fz) -> (-fz, fx). rgt>0 means velocity heads to Darwin's right.
        const rgt = (velocity.current.x * -fz + velocity.current.z * fx) / aimSpeed;
        const lateral = Math.abs(rgt) >= Math.abs(fwd);
        stateRef.current.movingBackward = !lateral && fwd < -0.35;
        stateRef.current.strafeLeft = lateral && rgt < -0.5;
        stateRef.current.strafeRight = lateral && rgt > 0.5;
      } else {
        stateRef.current.movingBackward = false;
        stateRef.current.strafeLeft = false;
        stateRef.current.strafeRight = false;
      }
    }
    const nextPose = {
      position: { x: p.x, y: p.y, z: p.z },
      facing: { x: facing.current.x, y: facing.current.y, z: facing.current.z },
    };
    updateRuntimePlayerPose(nextPose);
    const publishedPose = lastPublishedPose.current;
    const positionChanged = Math.abs(publishedPose.x - p.x) > 0.08
      || Math.abs(publishedPose.y - p.y) > 0.08
      || Math.abs(publishedPose.z - p.z) > 0.08;
    const facingChanged = Math.abs(publishedPose.fx - facing.current.x) > 0.015
      || Math.abs(publishedPose.fy - facing.current.y) > 0.015
      || Math.abs(publishedPose.fz - facing.current.z) > 0.015;
    const posePublishDue = now - lastPosePublishAt.current >= 1 / 15;
    if ((positionChanged || facingChanged) && posePublishDue) {
      publishedPose.x = p.x;
      publishedPose.y = p.y;
      publishedPose.z = p.z;
      publishedPose.fx = facing.current.x;
      publishedPose.fy = facing.current.y;
      publishedPose.fz = facing.current.z;
      lastPosePublishAt.current = now;
      setPlayerPose(nextPose);
    }
    if (playerControllerDebugEnabled()) {
      window.__darwinControllerDebug = {
        airborne: stateRef.current.airborne,
        action: stateRef.current.action,
        jumpPhase: stateRef.current.jumpPhase,
        jumpCharging: stateRef.current.jumpCharging,
        groundDistance,
        groundSource: terrainFeedback.current.groundSource,
        stanceSpread: terrainFeedback.current.stanceSpread,
        stancePitch: terrainFeedback.current.stancePitch,
        stanceRoll: terrainFeedback.current.stanceRoll,
        verticalSpeed: velocity.current.y,
        speed: horizontalSpeed,
      };
    }
    previousMotion.current.moving = moving;
    previousMotion.current.running = stateRef.current.running;
  });

  return (
    <group ref={group} position={[startX, collisionAdapter.spawnY(startX, startZ) + SPAWN_DROP.height, startZ]} rotation={[0, Math.PI, 0]} userData={{
      renderSource: 'player:darwin-controller',
      renderLabel: 'Darwin controller helpers',
      renderKind: 'player-controller',
      renderPath: null,
    }}>
      <RigidBody
        ref={characterBodyRef}
        type="kinematicPosition"
        colliders={false}
        enabledRotations={[false, false, false]}
        position={[startX, collisionAdapter.spawnY(startX, startZ) + SPAWN_DROP.height, startZ]}
        userData={{ id: 'darwin', kind: 'player' }}
      >
        <CapsuleCollider
          ref={characterColliderRef}
          args={[CHARACTER_CONTROLLER_CONFIG.halfHeight, CHARACTER_CONTROLLER_CONFIG.radius]}
          position={[0, CHARACTER_CONTROLLER_CONFIG.centerY, 0]}
        />
      </RigidBody>
      <mesh ref={contactShadowRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <circleGeometry args={[0.82, 48]} />
        <meshBasicMaterial color="#17130d" transparent opacity={0.32} depthWrite={false} alphaMap={contactShadowAlpha || undefined} />
      </mesh>
      <mesh ref={waterlineRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={waterlineMaterial} renderOrder={4}>
        <ringGeometry args={[0.5, 0.76, 48]} />
      </mesh>
      <LandingDust triggerRef={landingDustTriggerRef} />
      <LandingDust triggerRef={footstepDustTriggerRef} />
      <LandingDust triggerRef={collisionDustTriggerRef} />
      <group ref={modelFeedbackRef}>
        <NaturalistModel motionRef={stateRef} health={health} fatigue={fatigue} inventoryCount={inventoryCount} grounding={modelGrounding} />
      </group>
      <CarriedObjectVisual />
      <group ref={warningRef} visible={false} position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.22, 0.34, 28]} />
          <meshBasicMaterial color="#d9c38b" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0.16, 0.05, 0]} scale={[0.55, 0.55, 0.55]}>
          <ringGeometry args={[0.18, 0.28, 20]} />
          <meshBasicMaterial color="#f1ddb0" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {physicsDebug && (
        <group>
          <group position={[0, CHARACTER_CONTROLLER_CONFIG.centerY, 0]}>
            <mesh material={debugMaterials.capsule}>
              <capsuleGeometry
                args={[
                  CHARACTER_CONTROLLER_CONFIG.radius,
                  CHARACTER_CONTROLLER_CONFIG.halfHeight * 2,
                  10,
                  20,
                ]}
              />
            </mesh>
          </group>
          <group ref={debugCollisionRef} position={[0, 1.2, 0]}>
            <mesh position={[0, 0.32, 0]} material={debugMaterials.collision}>
              <cylinderGeometry args={[0.025, 0.025, 0.64, 8]} />
            </mesh>
            <mesh position={[0, 0.68, 0]} material={debugMaterials.collision}>
              <coneGeometry args={[0.08, 0.18, 10]} />
            </mesh>
          </group>
          <group ref={debugMovementRef} position={[0, 0.28, 0]}>
            <mesh position={[0, 0.26, 0]} material={debugMaterials.movement}>
              <cylinderGeometry args={[0.018, 0.018, 0.52, 8]} />
            </mesh>
            <mesh position={[0, 0.56, 0]} material={debugMaterials.movement}>
              <coneGeometry args={[0.06, 0.14, 10]} />
            </mesh>
          </group>
          {[0, 1, 2, 3, 4].map(index => (
            <mesh
              key={`stance-debug-${index}`}
              ref={node => { debugStanceRefs.current[index] = node; }}
              visible={false}
              material={debugMaterials.stanceTerrain}
              renderOrder={6}
            >
              <sphereGeometry args={[index === 0 ? 0.055 : 0.042, 10, 8]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
