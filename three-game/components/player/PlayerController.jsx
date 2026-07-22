'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CapsuleCollider, CylinderCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { updateRuntimePlayerMotion, useThreeGameStore } from '../../store';
import { faunaDebugEnabled } from '../../runtimeDebug';
import { getThreeSpecimens } from '../../data';
import { DEFAULT_PLAYER_MODEL_ASSET_ID } from '../../modelAssets';
import { consumeTouchControls } from '../../input/touchControls';
import { isGameplayInputBlocked } from '../../input/typingMode';
import { regionSpawnFacing, regionSpawnPoint, terrainBiomeAt } from '../../world/terrain';
import { getSurfaceContactProfile } from '../../world/surfaceContact';
import { createCollisionAdapter } from '../../physics/collisionAdapter';
import {
  computePushAmount,
  downhillGrade,
  isDownhillMoveAllowed,
  mobilityPushAnimationTarget,
} from '../../physics/objectMobility';
import { emitPropEvent, onPropEvent } from '../../physics/props/propEvents';
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
  SPRINT,
  SWIM,
  SWIM_POLISH,
} from './playerConfig';
import { usePlayerCameraRig } from './usePlayerCameraRig';
import { usePlayerActions } from './playerActions';
import { triggerDirectPlayerActions } from './playerActionTriggers';
import { shouldRunInPlaceAtTravelEdge, updatePlayerInteractions } from './playerInteractions';
import { pulseEquippedToolOnUse, readPlayerInput, sanitizeShortcutKeys } from './playerInputState';
import {
  cactusSpineInjuryChance,
  findCactusHazardContact,
  findPushableObstacleNear,
} from './playerFeedback';
import { updatePlayerFrameFeedback } from './playerFrameFeedback';
import { finalizePlayerFrame } from './playerFrameFinalization';
import { updatePlayerActionMotion } from './playerActionMotion';
import { classifyRapierCharacterContacts } from './playerCollisionContacts';
import { updatePlayerEquipmentState } from './playerEquipmentState';
import { shotgunAimState, resetShotgunAimState } from '../../shooting/aimState';
import { SHOTGUN } from '../../shooting/shotgunConfig';
import { setWorldTimeTarget } from '../../world/worldTime';
import { beginClimbMotion as beginClimbMotionState, boulderTraversalProfile } from './playerTraversalMotion';
import { resolvePlayerLanding, updatePlayerJumpInputAndGravity } from './playerAirborneMotion';
import { PlayerAvatarModel } from './PlayerAvatarModel';
import { useFootstepEffects } from './useFootstepEffects';
import {
  getAnimalAction,
  getPlayableControllerProfile,
  getPlayableMode,
} from '../../playable/playableModes';
import {
  applyArcadeSteering,
  cappedArcadeSpeedScale,
  computeArcadeLocomotion,
  createArcadeLocomotionState,
} from './arcadeLocomotion';
import {
  dampAngle,
  formatVector,
} from './playerUtils';
import { getInteriorCameraProfile } from '../../interiors/interiorRegistry';

const PUSH_ANIMATION_COOLDOWN = 0.34;
const PUSH_ANIMATION_MIN_SPEED = 0.85;
const PUSH_ANIMATION_MIN_FORWARD = 0.42;
const PUSH_FEEDBACK_DURATION = {
  pushLow: 0.34,
  pushMedium: 0.4,
  pushHeavy: 0.48,
};
const PUSH_FEEDBACK_ACTIONS = new Set(['pushLow', 'pushMedium', 'pushHeavy', 'pushStart', 'pushStop']);
// Idle fidget pool: weighted-random with no immediate repeats. Deep fidgets
// (long stretches) only surface after Darwin has already fidgeted a couple of
// times, so a briefly parked player never sees the theatrical ones first.
// inspectNearbyIdle (head down, studying the ground) only makes sense with a
// specimen close by — near one it dominates the roll, elsewhere it is skipped.
const DARWIN5_IDLE_FIDGETS = [
  { clip: 'lookAroundShort', weight: 3 },
  { clip: 'inspectNearbyIdle', weight: 5, requiresSpecimen: true },
  { clip: 'fidgetStand', weight: 2 },
  { clip: 'neckStretch', weight: 2 },
  { clip: 'neutralIdle', weight: 2 },
  { clip: 'lookAround', weight: 1, minCount: 1 },
  { clip: 'armStretch', weight: 1, minCount: 2 },
];
const DARWIN5_LOCOMOTION_PREVIEW_IDLE_FIDGETS = [
  { clip: 'calmIdle', weight: 4 },
  ...DARWIN5_IDLE_FIDGETS,
];
const LOCOMOTION_START_ACTIONS = new Set(['startWalking', 'startRunning']);
const LEGACY_IDLE_FIDGETS = [{ clip: 'lookAroundShort', weight: 1 }];

function pickIdleFidget(pool, lastClip, count, nearSpecimen) {
  const options = pool.filter(entry => entry.clip !== lastClip
    && (entry.minCount ?? 0) <= count
    && (!entry.requiresSpecimen || nearSpecimen));
  if (!options.length) return pool[0];
  const totalWeight = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of options) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return options[options.length - 1];
}

const FINCH_DROPPING_SLOW_MOTION = {
  minScale: 0.34,
  attack: 0.12,
  holdUntil: 1.05,
  releaseUntil: 2.08,
};

function finchDroppingSlowMotionScale(event, now) {
  if (!event || now >= event.until) return 1;
  const elapsed = Math.max(0, now - (event.startedAt || now));
  const attack = THREE.MathUtils.smoothstep(elapsed, 0, FINCH_DROPPING_SLOW_MOTION.attack);
  const release = 1 - THREE.MathUtils.smoothstep(
    elapsed,
    FINCH_DROPPING_SLOW_MOTION.holdUntil,
    FINCH_DROPPING_SLOW_MOTION.releaseUntil,
  );
  const amount = THREE.MathUtils.clamp(attack * release, 0, 1);
  return THREE.MathUtils.lerp(1, FINCH_DROPPING_SLOW_MOTION.minScale, amount);
}

function PlayerPhysicsCollider({ colliderConfig, colliderRef }) {
  if (colliderConfig.shape === 'cylinder') {
    return (
      <CylinderCollider
        ref={colliderRef}
        args={[colliderConfig.halfHeight, colliderConfig.radius]}
        position={[0, colliderConfig.centerY, 0]}
      />
    );
  }
  return (
    <CapsuleCollider
      ref={colliderRef}
      args={[colliderConfig.halfHeight, colliderConfig.radius]}
      position={[0, colliderConfig.centerY, 0]}
    />
  );
}

function PlayerColliderDebugMesh({ colliderConfig, material }) {
  if (colliderConfig.shape === 'cylinder') {
    return (
      <mesh material={material}>
        <cylinderGeometry
          args={[
            colliderConfig.radius,
            colliderConfig.radius,
            colliderConfig.halfHeight * 2,
            28,
            1,
          ]}
        />
      </mesh>
    );
  }
  return (
    <mesh material={material}>
      <capsuleGeometry
        args={[
          colliderConfig.radius,
          colliderConfig.halfHeight * 2,
          10,
          20,
        ]}
      />
    </mesh>
  );
}

function pushAnimationForObstacle(obstacle) {
  if (!obstacle) return 'pushMedium';
  const top = Number.isFinite(obstacle.colliderTop) ? obstacle.colliderTop : obstacle.height;
  const mass = obstacle.pushMass || 1;
  if (obstacle.kind === 'boulder' || obstacle.kind === 'cliff' || obstacle.kind === 'wall' || top >= 1.35 || mass >= 60) return 'pushHeavy';
  if (top >= 0.72 || obstacle.height >= 0.78 || mass >= 8) return 'pushMedium';
  return 'pushLow';
}

function shadowAnimationActive(state) {
  return Boolean(
    state?.action
    || state?.walking
    || state?.running
    || state?.airborne
    || state?.swimming
    || state?.crouching
    || state?.aiming
    || state?.firing,
  );
}

export function PlayerController({
  physicsDebug = false,
  openingCamera = null,
  inputLocked = false,
  animationBankPhase = Number.POSITIVE_INFINITY,
  onAnimationBanksReady = null,
  onVisualReady = null,
}) {
  const faunaDebug = useMemo(faunaDebugEnabled, []);
  const group = useRef(null);
  const warningRef = useRef(null);
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
  const { yawRef, aimActiveRef, firePulseRef, getAimDirection, resetCameraForSpawn, recenterCamera, updateCamera } = usePlayerCameraRig();
  const lastToolId = useRef(null);
  const lastFirePulse = useRef(0);
  // Never leave the world stuck in bullet time if the controller unmounts
  // mid-aim (zone change, mode swap).
  useEffect(() => () => setWorldTimeTarget(1), []);
  const facing = useRef(new THREE.Vector3(0, 0, -1));
  const wasAirborne = useRef(false);
  const jumpState = useRef({
    phase: 'grounded',
    takeoffUntil: 0,
    wasRunning: false,
    fromPlayerJump: false,
    chargeAmount: 0,
    waterEntryIntent: null,
    launchedAt: -10,
    launchY: 0,
    launchX: 0,
    launchZ: 0,
  });
  const jumpCharge = useRef({ active: false, startedAt: 0, wasRunning: false, amount: 0 });
  const pendingStandingJump = useRef({ active: false, startedAt: 0 });
  const lastGroundedAt = useRef(-10);
  const jumpBufferedUntil = useRef(-10);
  const touchJumpHoldUntil = useRef(-10);
  const lastInteract = useRef(false);
  const lastExamine = useRef(false);
  const lastCamera = useRef(false);
  const lastButtons = useRef({});
  const footstepEffects = useFootstepEffects({ footstepDustTriggerRef });
  // How deep the player's feet are below the sea surface (0 on dry land).
  const wadeDepth = useRef(0);
  const swimState = useRef({ active: false, enteredAt: 0 });
  const swimSink = useRef(SWIM.bodySink);
  const swimFatigue = useRef(0);
  const flightState = useRef({ active: false, phase: 'grounded', phaseUntil: 0, lastFlapAt: -10, bankYaw: null });
  // Accumulates drowning damage so the store isn't hit every frame.
  const drownDamage = useRef(0);
  const cameraImpulse = useRef({ startedAt: -10, intensity: 0, duration: 0.34, seed: 1 });
  const finchDroppingCamera = useRef({ startedAt: -10, until: -10, sequence: 0 });
  const lastTeeterAt = useRef(0);
  const lastWallRunAt = useRef(0);
  const lastTurnFlourishAt = useRef(0);
  const lastAutoClimbAt = useRef(0);
  const lastPushAnimationAt = useRef(-10);
  const latestPropPushContact = useRef(null);
  const pendingSnareTrip = useRef(null);
  const pendingAnimalDropping = useRef(null);
  const lastConstraintReactionKey = useRef(null);
  const sustainedObstaclePush = useRef({ id: null, startedAt: -10, lastAt: -10 });
  const lastCactusHitAt = useRef(-10);
  const cactusHazardStreak = useRef({ count: 0, lastAt: -10 });
  const lastStepUpDustAt = useRef(-10);
  const lastStepPulseAt = useRef(-10);
  const lastSkidDustAt = useRef(-10);
  const prevSprintingRef = useRef(false);
  const prevRunningIntentRef = useRef(false);
  const lastDownhillSprintCameraAt = useRef(-10);
  const lastArcadeStumbleAt = useRef(-10);
  const lastDroppingSmushAt = useRef(-10);
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
  const previousMotion = useRef({ moving: false, running: false, yaw: Math.PI });
  const pendingMovementCost = useRef({ fatigue: 0, falling: 0, lastFlushAt: 0 });
  const arcadeLocomotion = useRef(createArcadeLocomotionState());
  const visualLocomotion = useRef({
    phase: 'idle',
    running: false,
    walking: false,
    lastRunAt: -10,
    stopUntil: 0,
  });
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
    spawnSyncPosition: new THREE.Vector3(),
    slideDirection: new THREE.Vector3(),
    terrainProbe: new THREE.Vector3(),
    climbEnd: new THREE.Vector3(),
    dodgeDirection: new THREE.Vector3(),
    fallbackRollDirection: new THREE.Vector3(0, 0, -1),
    landingRollDirection: new THREE.Vector3(),
    swimExitDirection: new THREE.Vector3(),
    swimCandidateEnd: new THREE.Vector3(),
    swimExitEnd: new THREE.Vector3(),
    droppingPosition: new THREE.Vector3(),
  }), []);
  const stateRef = useRef({
    modelAssetId: DEFAULT_PLAYER_MODEL_ASSET_ID,
    modelVariantId: DEFAULT_PLAYER_MODEL_ASSET_ID,
    playableModeId: 'darwin',
    playableKind: 'human',
    running: false,
    walking: false,
    bracing: false,
    braceStartedAt: 0,
    braceIntensity: 0,
    turnRate: 0,
    turnDirection: 0,
    flying: false,
    flightPhase: null,
    flightPitch: 0,
    flightBank: 0,
    flightFlap: false,
    flightDive: false,
    flightDescend: false,
    flightSpeedT: 0,
    airborne: false,
    crouching: false,
    aiming: false,
    aimToggled: false,
    crouchRunning: false,
    strafeLeft: false,
    strafeRight: false,
    speed: 0,
    animationSpeed: 0,
    travelRunInPlace: false,
    action: null,
    jumpPhase: 'grounded',
    jumpWasRunning: false,
    jumpCharging: false,
    jumpChargeAmount: 0,
    jumpWaterEntryIntent: null,
    actionUntil: 0,
    actionStartedAt: 0,
    lockMovementUntil: 0,
    recoverAction: null,
    climbMotion: null,
    traverseMotion: null,
    rollMotion: null,
    turnMotion: null,
    collectionFaceMotion: null,
    slopeGrade: 0,
    uphillDot: 0,
    groundPitch: 0,
    arcadeSkid: 0,
    arcadeScramble: 0,
    groundDistance: 0,
    verticalSpeed: 0,
    tiredRun: false,
    locomotionPhase: 'idle',
    locomotionVisualRunning: false,
    movingBackward: false,
    sitting: false,
    lying: false,
    swimming: false,
    swimSprinting: false,
    wadeDepth: 0,
    jumpFromHeight: false,
  });
  const [, getKeys] = useKeyboardControls();
  const rapierContext = useRapier();
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const openExamine = useThreeGameStore(state => state.openExamine);
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
  const animalDroppings = useThreeGameStore(state => state.animalDroppings);
  const addAnimalDropping = useThreeGameStore(state => state.addAnimalDropping);
  const smushAnimalDropping = useThreeGameStore(state => state.smushAnimalDropping);
  const recordAnimalModeAction = useThreeGameStore(state => state.recordAnimalModeAction);
  const consumeForageable = useThreeGameStore(state => state.consumeForageable);
  const setPlayerPose = useThreeGameStore(state => state.setPlayerPose);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  const dropCarriedObject = useThreeGameStore(state => state.dropCarriedObject);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);
  const examineOpen = useThreeGameStore(state => Boolean(state.examineSession));
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const inventoryCount = useThreeGameStore(state => state.inventory.length);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playerSpawnId = useThreeGameStore(state => state.playerSpawnId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const playableSpawnPoint = useThreeGameStore(state => state.playableSpawnPoint);
  const playableHiddenActorId = useThreeGameStore(state => state.playableHiddenActorId);
  const activeConstraint = useThreeGameStore(state => state.activeConstraint);
  const playableMode = useMemo(() => getPlayableMode(playableModeId), [playableModeId]);
  const playerProfile = useMemo(() => getPlayableControllerProfile(playableMode.id), [playableMode.id]);
  const cameraProfile = useMemo(() => {
    const interior = getInteriorCameraProfile(currentZoneId);
    if (!interior) return playerProfile.camera;
    return {
      ...(playerProfile.camera || {}),
      ...interior,
      collision: {
        ...(playerProfile.camera?.collision || {}),
        ...(interior.collision || {}),
      },
    };
  }, [currentZoneId, playerProfile.camera]);
  const playerConfig = playerProfile;
  const swimConfig = playerProfile.swim || SWIM;
  const isDarwinMode = playableMode.kind !== 'animal';
  const colliderConfig = playerProfile.collider || CHARACTER_CONTROLLER_CONFIG;
  const zoneSpecimens = useMemo(() => (
    getThreeSpecimens(currentZoneId).filter(specimen => (specimen.instanceId || specimen.id) !== playableHiddenActorId)
  ), [currentZoneId, playableHiddenActorId]);
  const collisionAdapter = useMemo(
    () => createCollisionAdapter(
      currentZoneId,
      rapierContext,
      pushableObstacleOffsets,
      { diagnostics: physicsDebug },
    ),
    [currentZoneId, physicsDebug, pushableObstacleOffsets, rapierContext],
  );
  const modelGrounding = useMemo(() => ({
    collisionAdapter,
    motionRef: stateRef,
  }), [collisionAdapter]);
  const characterController = useKinematicCharacterController(rapierContext, characterBodyRef, characterColliderRef);
  const spawnPoint = useMemo(() => {
    if (playableMode.kind === 'animal' && playableSpawnPoint) {
      return playableSpawnPoint;
    }
    return regionSpawnPoint(currentZoneId, playerSpawnId);
  }, [currentZoneId, playableMode.kind, playableSpawnPoint, playerSpawnId]);
  const spawnFacing = useMemo(
    () => regionSpawnFacing(currentZoneId, playerSpawnId),
    [currentZoneId, playerSpawnId],
  );
  const startX = spawnPoint.x;
  const startZ = spawnPoint.z;

  useEffect(() => {
    stateRef.current.playableModeId = playableMode.id;
    stateRef.current.playableKind = playableMode.kind;
    if (playableMode.kind === 'animal') {
      stateRef.current.modelAssetId = playableMode.assetId;
    }
  }, [playableMode.assetId, playableMode.id, playableMode.kind]);

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

  const {
    startAction: startActionAt,
    interruptAction: interruptActionAt,
    triggerAction: triggerActionAt,
  } = usePlayerActions(stateRef, lastButtons);

  useEffect(() => onPropEvent('player-push-contact', contact => {
    latestPropPushContact.current = {
      ...contact,
      receivedAt: performance.now() / 1000,
    };
  }), []);

  useEffect(() => onPropEvent('snare-player-trigger', event => {
    pendingSnareTrip.current = {
      ...event,
      receivedAt: performance.now() / 1000,
    };
  }), []);

  const emitPlayerDustEvent = useCallback((event = {}, defaultKind = 'footstep') => {
    const source = group.current;
    if (!source) return;
    const rawPosition = event.worldPosition || event.position || null;
    const worldPosition = frameScratch.footstepPosition;
    if (rawPosition) {
      worldPosition.set(
        Number.isFinite(rawPosition.x) ? rawPosition.x : 0,
        Number.isFinite(rawPosition.y) ? rawPosition.y : 0.055,
        Number.isFinite(rawPosition.z) ? rawPosition.z : 0,
      );
      if (!event.worldPosition) source.localToWorld(worldPosition);
    } else {
      worldPosition.set(0, 0.06, 0);
      source.localToWorld(worldPosition);
    }
    const direction = event.direction || {
      x: facing.current.x,
      y: 0,
      z: facing.current.z,
    };
    const surfaceProfile = event.surfaceProfile || getSurfaceContactProfile({
      x: worldPosition.x,
      z: worldPosition.z,
      y: worldPosition.y,
      zoneId: currentZoneId,
      biome: event.biome,
    });
    const biome = surfaceProfile.biome || event.biome || terrainBiomeAt(worldPosition.x, worldPosition.z, worldPosition.y, currentZoneId);
    emitPropEvent('surface-contact', {
      ...event,
      kind: event.kind || defaultKind,
      position: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
      direction: { x: direction.x || 0, y: direction.y || 0, z: direction.z || 0 },
      biome,
      surfaceProfile,
      source: 'darwin',
    });
  }, [currentZoneId, frameScratch.footstepPosition]);

  useEffect(() => {
    const landingHandler = event => emitPlayerDustEvent(event, 'landing');
    const footstepHandler = event => emitPlayerDustEvent(event, 'footstep');
    const collisionHandler = event => emitPlayerDustEvent(event, 'skid');
    landingDustTriggerRef.current = landingHandler;
    footstepDustTriggerRef.current = footstepHandler;
    collisionDustTriggerRef.current = collisionHandler;
    return () => {
      if (landingDustTriggerRef.current === landingHandler) landingDustTriggerRef.current = null;
      if (footstepDustTriggerRef.current === footstepHandler) footstepDustTriggerRef.current = null;
      if (collisionDustTriggerRef.current === collisionHandler) collisionDustTriggerRef.current = null;
    };
  }, [emitPlayerDustEvent]);

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
    const rawSpawnY = Number(spawnPoint.y);
    const sampledGroundY = collisionAdapter.groundInfo(frameScratch.spawnSyncPosition.set(startX, Number.isFinite(rawSpawnY) ? rawSpawnY : 0, startZ)).y;
    const groundY = Number.isFinite(rawSpawnY) && Math.abs(rawSpawnY) > 0.001 ? rawSpawnY : sampledGroundY;
    const startsInFlight = Boolean(playerProfile.startInFlight && playerConfig.canFly && playerConfig.flight);
    const spawnY = startsInFlight ? groundY + (playerProfile.startFlightHeight || 2.8) : groundY;
    if (group.current) {
      group.current.position.set(startX, spawnY, startZ);
      group.current.rotation.y = Math.atan2(spawnFacing.x, spawnFacing.z);
    }
    facing.current.copy(spawnFacing);
    setPlayerPose({
      position: { x: startX, y: spawnY, z: startZ },
      facing: { x: facing.current.x, y: facing.current.y, z: facing.current.z },
    });
    characterController.sync(frameScratch.spawnSyncPosition.set(startX, spawnY, startZ));
    velocity.current.set(
      startsInFlight ? facing.current.x * (playerProfile.startForwardSpeed || 0) : 0,
      0,
      startsInFlight ? facing.current.z * (playerProfile.startForwardSpeed || 0) : 0,
    );
    wasAirborne.current = startsInFlight;
    stateRef.current.action = null;
    stateRef.current.jumpPhase = startsInFlight ? 'flight' : 'grounded';
    stateRef.current.climbMotion = null;
    stateRef.current.traverseMotion = null;
    stateRef.current.rollMotion = null;
    stateRef.current.turnMotion = null;
    stateRef.current.collectionFaceMotion = null;
    stateRef.current.lockMovementUntil = 0;
    jumpState.current = {
      phase: startsInFlight ? 'airborne' : 'grounded',
      takeoffUntil: 0,
      wasRunning: false,
      fromPlayerJump: false,
      chargeAmount: 0,
      launchedAt: -10,
      launchY: group.current?.position?.y || spawnY,
      launchX: group.current?.position?.x || startX,
      launchZ: group.current?.position?.z || startZ,
    };
    jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
    pendingStandingJump.current = { active: false, startedAt: 0 };
    swimState.current = { active: false, enteredAt: 0 };
    swimSink.current = swimConfig.bodySink;
    swimFatigue.current = 0;
    flightState.current = {
      active: startsInFlight,
      phase: startsInFlight ? 'cruise' : 'grounded',
      phaseUntil: 0,
      lastFlapAt: startsInFlight ? performance.now() / 1000 : -10,
      bankYaw: null,
    };
    finchDroppingCamera.current = {
      startedAt: -10,
      until: -10,
      sequence: finchDroppingCamera.current.sequence || 0,
    };
    pendingAnimalDropping.current = null;
    drownDamage.current = 0;
    stateRef.current.playableModeId = playableMode.id;
    stateRef.current.playableKind = playableMode.kind;
    stateRef.current.modelAssetId = playableMode.kind === 'animal' ? playableMode.assetId : stateRef.current.modelAssetId;
    stateRef.current.jumpCharging = false;
    stateRef.current.jumpChargeAmount = 0;
    stateRef.current.swimming = false;
    stateRef.current.swimSprinting = false;
    stateRef.current.bracing = false;
    stateRef.current.braceStartedAt = 0;
    stateRef.current.braceIntensity = 0;
    stateRef.current.flying = startsInFlight;
    stateRef.current.flightPhase = startsInFlight ? 'cruise' : null;
    stateRef.current.sitting = false;
    stateRef.current.lying = false;
    stateRef.current.pendingCarryPickup = null;
    stateRef.current.flightPitch = 0;
    stateRef.current.flightBank = 0;
    stateRef.current.flightFlap = false;
    stateRef.current.flightDive = false;
    stateRef.current.flightDescend = false;
    stateRef.current.flightSpeedT = startsInFlight ? 0.55 : 0;
    stateRef.current.timeScale = 1;
    stateRef.current.wadeDepth = 0;
    stateRef.current.speed = 0;
    stateRef.current.animationSpeed = 0;
    stateRef.current.travelRunInPlace = false;
    lastGroundedAt.current = performance.now() / 1000;
    resetCameraForSpawn(groundY);
    jumpBufferedUntil.current = -10;
    touchJumpHoldUntil.current = -10;
    lastModelYaw.current = Math.PI;
    lastPublishedPose.current.x = NaN;
    lastPosePublishAt.current = -10;
    footstepEffects.reset();
    idleFidget.current = { idleSince: 0, nextAt: 0, count: 0 };
  }, [
    characterController,
    collisionAdapter,
    currentZoneId,
    footstepEffects,
    frameScratch.spawnSyncPosition,
    playableMode.assetId,
    playableMode.id,
    playableMode.kind,
    playerConfig.canFly,
    playerConfig.flight,
    playerProfile.startFlightHeight,
    playerProfile.startForwardSpeed,
    playerProfile.startInFlight,
    playerSpawnId,
    resetCameraForSpawn,
    setPlayerPose,
    spawnFacing,
    spawnPoint.y,
    startX,
    startZ,
    swimConfig.bodySink,
  ]);

  useFrame((_, rawDelta) => {
    if (!group.current) return;
    // Clear stale intent first. Frames that reach the character move publish
    // the pre-collision velocity below; early-return/paused frames stay zero.
    updateRuntimePlayerMotion({
      x: 0,
      z: 0,
      visualActive: shadowAnimationActive(stateRef.current),
    });
    collisionAdapter.beginFrame?.();
    const keys = inputLocked || isGameplayInputBlocked() ? EMPTY_KEYS : sanitizeShortcutKeys(getKeys());
    const rawTouch = consumeTouchControls();
    const touch = inputLocked ? EMPTY_KEYS : rawTouch;
    const now = performance.now() / 1000;
    const activeFinchDroppingCamera = finchDroppingCamera.current.until > now ? finchDroppingCamera.current : null;
    const timeScale = finchDroppingSlowMotionScale(activeFinchDroppingCamera, now);
    const delta = rawDelta * timeScale;
    stateRef.current.timeScale = timeScale;
    updatePlayerFrameFeedback({
      group,
      warningRef,
      modelFeedbackRef,
      stateRef,
      debugCollisionRef,
      debugMovementRef,
      bounceFeedback,
      velocity,
      terrainFeedback,
      lastModelYaw,
      characterDebug,
      viewMode,
      physicsDebug,
      now,
      delta,
    });
    const startOfFramePosition = frameScratch.startPosition.copy(group.current.position);
    const wasAirborneAtFrameStart = wasAirborne.current;
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
      const duration = options.duration ?? PUSH_FEEDBACK_DURATION[clip] ?? ACTION_DURATION[clip];
      startAction(clip, duration, { lockMovement: options.lockMovement ?? false });
      lastPushAnimationAt.current = now;
      return true;
    };
    const interruptAction = (allowed = MOVEMENT_INTERRUPTIBLE_ACTIONS) => interruptActionAt(now, allowed);
    const triggerAction = (button, clip, duration = durationFor(clip), options = {}) => {
      triggerActionAt(now, keys, touch, button, clip, resolveActionDuration(clip, duration), options);
    };
    const spawnAnimalDropping = (pending = {}) => {
      if (!group.current || typeof addAnimalDropping !== 'function') return;
      const forward = frameScratch.forwardFacing.copy(facing.current).setY(0);
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
      else forward.normalize();
      const dropDistance = playableMode.id === 'tortoise' ? 1.08 : 0.32;
      const candidate = frameScratch.droppingPosition
        .copy(group.current.position)
        .addScaledVector(forward, -dropDistance);
      const ground = collisionAdapter.groundInfo(candidate).y;
      const airborneFinchDropping = playableMode.id === 'finch'
        && (flightState.current.active || candidate.y > ground + 0.72);
      if (airborneFinchDropping) {
        const start = frameScratch.droppingPosition
          .copy(group.current.position)
          .addScaledVector(forward, -0.18);
        start.y = Math.max(ground + 0.42, start.y - 0.08);
        const inheritedHorizontal = 0.72;
        addAnimalDropping({
          zoneId: currentZoneId,
          sourceModeId: pending.sourceModeId || playableMode.id,
          kind: 'bird',
          status: 'falling',
          position: { x: start.x, y: start.y, z: start.z },
          velocity: {
            x: velocity.current.x * inheritedHorizontal + forward.x * 0.22,
            y: Math.min(velocity.current.y, 0) - 0.55,
            z: velocity.current.z * inheritedHorizontal + forward.z * 0.22,
          },
          yaw: Math.atan2(forward.x, forward.z),
          radius: 0.085,
        });
        emitPropEvent('animal-dropping-projectile-spawned', {
          zoneId: currentZoneId,
          sourceModeId: pending.sourceModeId || playableMode.id,
          position: { x: start.x, y: start.y, z: start.z },
        });
        finchDroppingCamera.current = {
          startedAt: now,
          until: now + 3,
          sequence: (finchDroppingCamera.current.sequence || 0) + 1,
        };
        return;
      }
      addAnimalDropping({
        zoneId: currentZoneId,
        sourceModeId: pending.sourceModeId || playableMode.id,
        kind: playableMode.id === 'finch' ? 'bird' : 'animal',
        position: { x: candidate.x, y: ground + 0.026, z: candidate.z },
        yaw: Math.atan2(forward.x, forward.z),
        radius: playableMode.id === 'tortoise' ? 0.26 : 0.12,
      });
      emitPropEvent('animal-dropping-spawned', {
        zoneId: currentZoneId,
        sourceModeId: pending.sourceModeId || playableMode.id,
        position: { x: candidate.x, y: ground + 0.026, z: candidate.z },
      });
    };
    const finalizeFrame = (options = {}) => finalizePlayerFrame({
      group,
      updateCamera,
      collisionAdapter,
      facing,
      wasAirborne,
      velocity,
      stateRef,
      terrainFeedback,
      visualLocomotion,
      jumpCharge,
      swimState,
      wadeDepth,
      waterlineRef,
      footstepEffects,
      lastPublishedPose,
      lastPosePublishAt,
      previousMotion,
      cameraImpulse,
      setPlayerPose,
      applyMovementCost,
      applyDrowningDamage,
      drownDamage,
      swimFatigue,
      playerConfig,
      swimConfig,
      cameraProfile,
      currentZoneId,
      viewMode,
      openingCamera,
      finchDroppingCamera: activeFinchDroppingCamera,
      cameraDelta: rawDelta,
      health,
      fatigue,
      now,
      delta,
      keys,
      touch,
      ...options,
    });

    const safeDelta = Math.min(delta, 0.05);
    if (health <= 0) {
      // Keep publishing a complete frame after the fatal/collapse animation
      // starts. The former early return froze camera and visibility updates,
      // which made Darwin appear to vanish when his health reached zero.
      setWorldTimeTarget(0.18);
      velocity.current.set(0, 0, 0);
      stateRef.current.walking = false;
      stateRef.current.running = false;
      stateRef.current.airborne = false;
      finalizeFrame({
        moving: false,
        running: false,
        crouchRunIntent: false,
        groundDistance: stateRef.current.groundDistance,
        skipFootsteps: true,
        skipSwimEconomy: true,
        keys: EMPTY_KEYS,
        touch: EMPTY_KEYS,
      });
      return;
    }
    if (statusViewOpen || examineOpen) {
      // Examination owns the camera and freezes player/world locomotion, while
      // a low non-zero world scale keeps the subject's idle animation alive.
      setWorldTimeTarget(examineOpen ? 0.18 : 1);
      finalizeFrame({
        moving: false,
        running: false,
        crouchRunIntent: false,
        groundDistance: stateRef.current.groundDistance,
        skipFootsteps: true,
        skipSwimEconomy: true,
        keys: EMPTY_KEYS,
        touch: EMPTY_KEYS,
      });
      return;
    }
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
      velocity.current.y = Math.max(SPAWN_DROP.maxFallSpeed, velocity.current.y - playerConfig.gravity * safeDelta);
      group.current.position.y += velocity.current.y * safeDelta;
      const landed = group.current.position.y <= groundInfo.y;
      if (physicsDebug && now - lastPhysicsDebugAt.current > 0.12) {
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
        finalizeFrame({ groundDistance: stateRef.current.groundDistance, skipFootsteps: true, skipSwimEconomy: true });
        return;
      }
    }
    if (spawnDrop.current.phase === 'landing') {
      const groundInfo = collisionAdapter.groundInfo(group.current.position);
      group.current.position.y = groundInfo.y;
      characterController.sync(group.current.position);
      velocity.current.set(0, 0, 0);
      if (physicsDebug && now - lastPhysicsDebugAt.current > 0.2) {
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
        finalizeFrame({ groundDistance: 0, skipFootsteps: true, skipSwimEconomy: true });
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
      if (stateRef.current.action === 'animalSleep' && health > 0) stateRef.current.lying = true;
      stateRef.current.action = null;
      stateRef.current.recoverAction = null;
      if (recovery && health > 0) startAction(recovery.clip, recovery.duration, { lockMovement: true });
    }
    const pendingDropping = pendingAnimalDropping.current;
    if (pendingDropping) {
      if (pendingDropping.spawned || now > pendingDropping.cancelAt) {
        pendingAnimalDropping.current = null;
      } else if (now >= pendingDropping.spawnAt && stateRef.current.action === 'animalDefecate') {
        spawnAnimalDropping(pendingDropping);
        pendingDropping.spawned = true;
        pendingAnimalDropping.current = null;
      }
    }
    const movementConstraintActive = Boolean(
      activeConstraint?.type === 'snare_immobilized'
      || activeConstraint?.movementLock
    );
    if (movementConstraintActive) {
      stateRef.current.lockMovementUntil = Math.max(stateRef.current.lockMovementUntil, now + 0.35);
    }
    const constraintReaction = activeConstraint?.reaction;
    const constraintReactionKey = activeConstraint
      ? `${activeConstraint.type}:${activeConstraint.startedAt || ''}`
      : null;
    if (!constraintReactionKey) {
      lastConstraintReactionKey.current = null;
    } else if (
      isDarwinMode
      && constraintReaction
      && lastConstraintReactionKey.current !== constraintReactionKey
      && (constraintReaction.interrupt || !stateRef.current.action)
    ) {
      lastConstraintReactionKey.current = constraintReactionKey;
      const clip = constraintReaction.clip || 'hitReaction';
      const duration = Number.isFinite(Number(constraintReaction.duration))
        ? Number(constraintReaction.duration)
        : durationFor(clip);
      stateRef.current.sitting = false;
      stateRef.current.lying = false;
      velocity.current.x *= 0.28;
      velocity.current.z *= 0.28;
      startAction(clip, duration, {
        lockMovement: constraintReaction.lockMovement ?? true,
        recoverAction: constraintReaction.recoverAction || null,
        recoverDuration: constraintReaction.recoverDuration || undefined,
      });
      cameraImpulse.current = {
        startedAt: now,
        intensity: clip === 'shoulderHitAndFall' ? 0.24 : 0.14,
        duration: 0.28,
        seed: cameraImpulse.current.seed + 1,
      };
    }
    const snareTrip = pendingSnareTrip.current;
    if (snareTrip && isDarwinMode) {
      if (now - (snareTrip.receivedAt || now) > 1.2) {
        pendingSnareTrip.current = null;
      } else if (!stateRef.current.lying && stateRef.current.action !== 'shoulderHitAndFall' && stateRef.current.action !== 'lyingDown') {
        pendingSnareTrip.current = null;
        velocity.current.set(0, 0, 0);
        stateRef.current.rollMotion = null;
        stateRef.current.traverseMotion = null;
        stateRef.current.climbMotion = null;
        stateRef.current.sitting = false;
        stateRef.current.lying = false;
        stateRef.current.lockMovementUntil = Math.max(stateRef.current.lockMovementUntil, now + 8.2);
        cameraImpulse.current = {
          startedAt: now,
          intensity: 0.22,
          duration: 0.34,
          seed: cameraImpulse.current.seed + 1,
        };
        startAction('shoulderHitAndFall', ACTION_DURATION.shoulderHitAndFall, {
          lockMovement: 8.2,
          recoverAction: 'lyingDown',
          recoverDuration: ACTION_DURATION.lyingDown,
        });
      }
    }
    if (updatePlayerActionMotion({
      group,
      stateRef,
      velocity,
      facing,
      wasAirborne,
      characterController,
      characterDebug,
      collisionAdapter,
      frameScratch,
      keys,
      touch,
      yawRef,
      startOfFramePosition,
      now,
      delta,
      finalizeFrame,
    })) {
      return;
    }
    const {
      input,
      moving,
      analogSpeedScale,
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
    const snareImmobilized = movementConstraintActive;
    pulseEquippedToolOnUse(keys, lastButtons);
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
    if (playableMode.id === 'tortoise') {
      const braceHeld = Boolean(jumpPressed && spawnDrop.current.phase === 'complete' && !snareImmobilized);
      const currentBraceAction = stateRef.current.action;
      const braceCanInterruptAction = Boolean(
        currentBraceAction
        && currentBraceAction !== 'animalBrace'
        && MOVEMENT_INTERRUPTIBLE_ACTIONS.has(currentBraceAction)
      );
      const braceBlockedByAction = Boolean(
        currentBraceAction
        && currentBraceAction !== 'animalBrace'
        && !braceCanInterruptAction
      );
      if (braceHeld && !braceBlockedByAction) {
        if (braceCanInterruptAction) {
          interruptAction(MOVEMENT_INTERRUPTIBLE_ACTIONS);
        }
        if (!lastButtons.current.tortoiseBrace) {
          startAction('animalBrace', 0.9, { lockMovement: 0.16 });
          stateRef.current.braceStartedAt = now;
          velocity.current.x *= 0.35;
          velocity.current.z *= 0.35;
        }
        stateRef.current.bracing = true;
        stateRef.current.braceIntensity = Math.min(1, Math.max(0, (now - (stateRef.current.braceStartedAt || now)) * 2.6));
      } else {
        stateRef.current.bracing = false;
        stateRef.current.braceIntensity = 0;
      }
      lastButtons.current.tortoiseBrace = Boolean(braceHeld && !braceBlockedByAction);
    } else {
      stateRef.current.bracing = false;
      stateRef.current.braceIntensity = 0;
      lastButtons.current.tortoiseBrace = false;
    }
    if (playableMode.kind === 'animal' && !stateRef.current.action && !stateRef.current.bracing && !preInputMovementLocked) {
      const activeAnimalAction = getAnimalAction(useThreeGameStore.getState().activeToolId);
      const requestedAnimalAction = [
        activeAnimalAction,
        getAnimalAction('eat'),
        getAnimalAction('sleep'),
        getAnimalAction('defecate'),
      ].find(action => action && touch[action.control]);
      if (requestedAnimalAction) {
        const requiresGround = requestedAnimalAction.id === 'eat' || requestedAnimalAction.id === 'sleep';
        if (!(flightState.current.active && requiresGround)) {
          const animalActionDuration = requestedAnimalAction.duration || 1.35;
          const airborneFinchDefecate = requestedAnimalAction.id === 'defecate'
            && playableMode.id === 'finch'
            && flightState.current.active;
          startAction(requestedAnimalAction.clip, animalActionDuration, {
            lockMovement: airborneFinchDefecate ? 0 : (requestedAnimalAction.lockMovement ?? 0.45),
            onStart: () => {
              const forageResult = requestedAnimalAction.id === 'eat'
                ? consumeForageable?.(useThreeGameStore.getState().carryPrompt?.forageable)
                : null;
              recordAnimalModeAction?.({
                actionId: requestedAnimalAction.id,
                foodLabel: requestedAnimalAction.id === 'eat'
                  ? (forageResult?.foodLabel || (playableMode.id === 'tortoise' ? 'low leaves and ground herbs' : 'dry seeds and small shoots'))
                  : undefined,
                forage: forageResult?.consumed ? forageResult : null,
              });
              if (requestedAnimalAction.id === 'defecate') {
                const spawnDelay = airborneFinchDefecate
                  ? 0.12
                  : animalActionDuration * 0.62;
                pendingAnimalDropping.current = {
                  sourceModeId: playableMode.id,
                  spawnAt: now + spawnDelay,
                  cancelAt: now + animalActionDuration + 0.3,
                  spawned: false,
                };
              }
            },
          });
        }
      }
    }
    if (playerConfig.canCrouch !== false && !carriedObjectId && crouchPressed && !lastButtons.current.crouch && !preInputMovementLocked && !stateRef.current.action && !swimState.current.active) {
      const slideSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (!stateRef.current.crouching && slideSpeed > playerConfig.walkSpeed * 1.2 && !stateRef.current.aiming) {
        // Crouch at sprint = running slide, reusing the roll mover so the
        // slide travels, keeps direction, and exits back into the run.
        const slideDirection = frameScratch.slideDirection.set(velocity.current.x, 0, velocity.current.z).normalize();
        characterController.sync(group.current.position);
        startAction('runningSlide', ACTION_DURATION.runningSlide, { lockMovement: true });
        stateRef.current.rollMotion = {
          start: group.current.position.clone(),
          direction: slideDirection.clone(),
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
    if (playerConfig.canUseDarwinTools !== false) {
      updatePlayerEquipmentState({
        keys,
        stateRef,
        lastButtons,
        lastToolId,
        lastFirePulse,
        activeToolId: useThreeGameStore.getState().activeToolId,
        riflePressed,
        preInputMovementLocked,
        swimState,
        firePulseRef,
        aimActiveRef,
        startAction,
        playerPosition: group.current.position,
        playerFacing: facing.current,
        disabled: Boolean(carriedObjectId),
      });
    } else {
      stateRef.current.aiming = false;
      aimActiveRef.current = false;
      lastToolId.current = useThreeGameStore.getState().activeToolId;
    }
    // Shotgun recoil lands as a camera impulse the frame the barrel fires.
    if (shotgunAimState.recoilPending) {
      shotgunAimState.recoilPending = false;
      cameraImpulse.current = {
        startedAt: now,
        intensity: SHOTGUN.recoil.intensity,
        duration: SHOTGUN.recoil.duration,
        seed: cameraImpulse.current.seed + 1,
      };
    }
    // A blast into his own feet: Darwin goes down, health follows.
    if (shotgunAimState.selfHitPending) {
      shotgunAimState.selfHitPending = false;
      useThreeGameStore.getState().applyShotgunSelfInjury?.(SHOTGUN.selfHit.damage);
      startAction('trip', ACTION_DURATION.trip, {
        lockMovement: true,
        recoverAction: 'gettingUp',
        recoverDuration: 1.45,
      });
    }
    // Bullet time: the living world slows while Darwin shoulders the gun.
    setWorldTimeTarget(stateRef.current.aiming ? SHOTGUN.ads.timeScale : 1);
    if (rotateLeftPressed) yawRef.current += CAMERA.keyRotateSpeed * delta;
    if (rotateRightPressed) yawRef.current -= CAMERA.keyRotateSpeed * delta;
    if (keys.recenterCamera && !lastButtons.current.recenterCamera) {
      recenterCamera(facing.current, { behind: Boolean(stateRef.current.flying) });
    }
    lastButtons.current.recenterCamera = Boolean(keys.recenterCamera);
    if (moving) {
      interruptAction(MOVEMENT_INTERRUPTIBLE_ACTIONS);
    }
    if (climbPressed || dodgePressed || jumpPressed || crouchPressed || riflePressed || anyDirectActionPressed) {
      interruptAction(CONTROL_INTERRUPTIBLE_ACTIONS);
    }
    // Any movement or control input ends the seated/lying rest pose.
    if ((stateRef.current.sitting || stateRef.current.lying)
      && !snareImmobilized
      && (moving || climbPressed || dodgePressed || jumpPressed || crouchPressed || riflePressed || anyDirectActionPressed)) {
      stateRef.current.sitting = false;
      stateRef.current.lying = false;
    }
    const flightActive = Boolean(flightState.current.active && playerConfig.flight);
    const steeringMoving = moving || flightActive;
    const locomotionPreview = stateRef.current.modelVariantId === 'darwin5LocomotionPreview';
    const runIntent = Boolean((keys.run || touch.run) && steeringMoving && !stateRef.current.crouching);
    const crouchRunIntent = Boolean((keys.run || touch.run) && moving && stateRef.current.crouching);
    const constraintSpeedScale = isDarwinMode && Number.isFinite(Number(activeConstraint?.movementSpeedScale))
      ? THREE.MathUtils.clamp(Number(activeConstraint.movementSpeedScale), 0.25, 1)
      : 1;
    const constraintDisablesRun = Boolean(isDarwinMode && activeConstraint?.disableRun);
    const fatigueRunT = THREE.MathUtils.clamp(
      (fatigue - playerConfig.tiredRunFatigue) / Math.max(1, playerConfig.exhaustedRunFatigue - playerConfig.tiredRunFatigue),
      0,
      1,
    );
    const canRun = runIntent && fatigue < playerConfig.exhaustedRunFatigue && !carriedObjectId && !constraintDisablesRun;
    const running = Boolean(canRun);
    const tiredRun = running && fatigueRunT > 0.04;
    const fatigueRunScale = running ? THREE.MathUtils.lerp(1, 0.72, fatigueRunT) : 1;
    // Spooled-up sprint (see playerFrameFinalization): a small top-speed lift
    // so committing to a straight makes the sprint tier feel earned.
    const sprintScale = stateRef.current.sprinting && !tiredRun ? SPRINT.speedScale : 1;
    const rawRunSpeed = playerConfig.runSpeed * fatigueRunScale * sprintScale;
    // Carrying already disables sprinting. Keep normal walking responsive;
    // the old 0.62 multiplier made indoor carrying feel like a collision bug.
    const carrySpeedScale = carriedObjectId ? 0.92 : 1;
    const braceSpeedScale = stateRef.current.bracing ? 0.16 : 1;
    // Wading drag: deeper water slows Darwin — about half speed at armpit
    // depth, slower still when he is in over his head.
    const wadeSpeedScale = 1 - Math.min(0.66, Math.max(0, wadeDepth.current) * 0.42);
    // Flight speed targets: a bird in the air is always going somewhere —
    // cruise is the default, landing bleeds to a near-stop, takeoff ramps in
    // gently. Altitude comes from W/S in the flight block, not from speed.
    const flightPhase = flightActive ? flightState.current.phase : null;
    const flightSpeedTarget = !flightActive
      ? 0
      : flightPhase === 'landing'
        ? 0.3
        : flightPhase === 'takeoff'
          ? Math.max(playerConfig.flight.idleGlideSpeed ?? 1, playerConfig.flight.cruiseSpeed * 0.45)
          : (running ? playerConfig.flight.maxSpeed : playerConfig.flight.cruiseSpeed);
    const rawMovementSpeed = flightActive
      ? flightSpeedTarget
      : swimState.current.active
      ? (running ? swimConfig.sprintSpeed : swimConfig.speed)
      : (stateRef.current.crouching
        ? playerConfig.walkSpeed * (crouchRunIntent ? 0.92 : 0.45)
        : running ? rawRunSpeed : playerConfig.walkSpeed) * carrySpeedScale * wadeSpeedScale * braceSpeedScale * constraintSpeedScale;
    const slope = collisionAdapter.terrainSlopeAt(group.current.position.x, group.current.position.z);
    const rawInputDirection = frameScratch.rawInputDirection;
    if (flightActive) {
      // Flight steers like a bird, not a walker: the finch always cruises
      // forward along its heading, and A/D carve that heading left or right
      // at a fixed turn rate — camera-independent, so orbiting the camera
      // mid-flight never yanks the flight path. W/S are altitude, handled in
      // the flight block below.
      const steer = (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0);
      if (facing.current.lengthSq() > 0.001) rawInputDirection.copy(facing.current).normalize();
      else rawInputDirection.set(0, 0, -1).applyAxisAngle(frameScratch.up, yawRef.current);
      if (steer !== 0) {
        rawInputDirection.applyAxisAngle(frameScratch.up, -steer * (playerConfig.flight.turnRate ?? 1.5) * delta);
      }
    } else if (moving) rawInputDirection.copy(input).normalize().applyAxisAngle(frameScratch.up, yawRef.current);
    else rawInputDirection.copy(facing.current).normalize();
    const uphillVector = frameScratch.uphillVector.set(slope.dx, 0, slope.dz);
    const uphillDirection = frameScratch.uphillDirection.set(0, 0, 0);
    if (uphillVector.lengthSq() > 0.0001) uphillDirection.copy(uphillVector).normalize();
    const uphillDot = moving && uphillDirection.lengthSq() > 0 ? THREE.MathUtils.clamp(rawInputDirection.dot(uphillDirection), -1, 1) : 0;
    const uphillPenalty = Math.max(0, uphillDot) * THREE.MathUtils.clamp(slope.grade * playerConfig.uphillSpeedPenalty, 0, 0.32);
    const downhillBoost = Math.max(0, -uphillDot) * THREE.MathUtils.clamp(slope.grade * playerConfig.downhillSpeedBoost, 0, 0.1);
    const slopeSpeedScale = flightActive ? 1 : THREE.MathUtils.clamp(1 - uphillPenalty + downhillBoost, 0.68, 1.08);
    const surfaceBiome = terrainBiomeAt(group.current.position.x, group.current.position.z, group.current.position.y, currentZoneId);
    const arcade = computeArcadeLocomotion({
      state: arcadeLocomotion.current,
      delta,
      now,
      biome: surfaceBiome,
      slopeGrade: slope.grade,
      downhillDot: -uphillDot,
      moving: steeringMoving,
      running,
      airborne: wasAirborne.current || flightActive,
      swimming: swimState.current.active,
      crouching: stateRef.current.crouching,
      aiming: stateRef.current.aiming,
      velocity: velocity.current,
      inputDirection: rawInputDirection,
    });
    const arcadeSpeedScale = cappedArcadeSpeedScale({
      slopeSpeedScale,
      arcadeSpeedScale: arcade.speedScale,
      airborne: wasAirborne.current,
      swimming: swimState.current.active,
    });
    // Flight ignores stick deflection — W/S are altitude there, not throttle.
    const transitionSpan = Math.max(0.001, (stateRef.current.actionUntil || now) - (stateRef.current.actionStartedAt || now));
    const transitionProgress = THREE.MathUtils.clamp(
      (now - (stateRef.current.actionStartedAt || now)) / transitionSpan,
      0,
      1,
    );
    const easedTransitionProgress = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
    const locomotionStartSpeedScale = locomotionPreview && stateRef.current.action === 'startWalking'
      ? THREE.MathUtils.lerp(0.3, 1, easedTransitionProgress)
      : locomotionPreview && stateRef.current.action === 'startRunning'
        ? THREE.MathUtils.lerp(0.36, 1, easedTransitionProgress)
        : 1;
    const movementSpeed = rawMovementSpeed * slopeSpeedScale * arcadeSpeedScale
      * (flightActive ? 1 : analogSpeedScale) * locomotionStartSpeedScale;
    terrainFeedback.current.grade = THREE.MathUtils.damp(terrainFeedback.current.grade, slope.grade, 8, delta);
    terrainFeedback.current.uphillDot = THREE.MathUtils.damp(terrainFeedback.current.uphillDot, uphillDot, 8, delta);
    terrainFeedback.current.downhillDot = THREE.MathUtils.damp(terrainFeedback.current.downhillDot, -uphillDot, 8, delta);
    const movementLocked = now < stateRef.current.lockMovementUntil || spawnDrop.current.phase !== 'complete';
    const bareHandedLocomotion = useThreeGameStore.getState().activeToolId === 'hands'
      && !carriedObjectId
      && !stateRef.current.aiming
      && !stateRef.current.crouching;
    if (locomotionPreview
      && isDarwinMode
      && moving
      && !previousMotion.current.moving
      && !wasAirborne.current
      && !swimState.current.active
      && !flightActive
      && !movementLocked
      && !stateRef.current.action
      && bareHandedLocomotion) {
      const startClip = running ? 'startRunning' : 'startWalking';
      startAction(startClip, durationFor(startClip), { lockMovement: false });
    }
    const canTurnInPlace = isDarwinMode && !moving && !movementLocked && !stateRef.current.action && !stateRef.current.crouching && !stateRef.current.aiming;
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
    if (playerConfig.canUseDarwinTools !== false && !carriedObjectId) {
      triggerDirectPlayerActions({
        triggerAction,
        group,
        facing,
        movementLocked,
        keys,
        touch,
        lastButtons,
        activeConstraint,
      });
    }
    // The look-around fidget plays bare-handed only: with a tool or gun
    // equipped the clip's empty-handed gestures clip through the prop.
    const idleEligible = !moving
      && !movementLocked
      && !stateRef.current.action
      && !stateRef.current.crouching
      && !stateRef.current.aiming
      && !wasAirborne.current
      && !rotateLeftPressed
      && !rotateRightPressed
      && !anyDirectActionPressed
      // Winded/waiting base idles carry their own body language; layering a
      // fidget over them reads as twitchy.
      && !stateRef.current.winded
      && !stateRef.current.longIdle
      && useThreeGameStore.getState().activeToolId === 'hands';
    if (isDarwinMode && idleEligible) {
      if (!idleFidget.current.idleSince) {
        idleFidget.current.idleSince = now;
        idleFidget.current.nextAt = now + 12;
      } else if (now >= idleFidget.current.nextAt) {
        const pool = locomotionPreview
          ? DARWIN5_LOCOMOTION_PREVIEW_IDLE_FIDGETS
          : stateRef.current.modelAssetId === 'darwin5'
            ? DARWIN5_IDLE_FIDGETS
            : LEGACY_IDLE_FIDGETS;
        const nearSpecimen = Boolean(useThreeGameStore.getState().nearbySpecimenId);
        const picked = pickIdleFidget(pool, idleFidget.current.lastClip, idleFidget.current.count, nearSpecimen);
        startAction(picked.clip, durationFor(picked.clip), { lockMovement: false });
        idleFidget.current.lastClip = picked.clip;
        idleFidget.current.count += 1;
        idleFidget.current.nextAt = now + 15 + Math.random() * 8;
      }
    } else {
      idleFidget.current.idleSince = 0;
      idleFidget.current.nextAt = 0;
    }
    const beginClimbMotion = (clip, end, heightDelta, targetYaw, durationScale = 1, options = {}) => {
      beginClimbMotionState({
        group,
        stateRef,
        velocity,
        characterController,
        startAction,
        durationFor,
        now,
        clip,
        end,
        heightDelta,
        targetYaw,
        durationScale,
        options,
      });
    };
    if (playerConfig.canClimb !== false && !carriedObjectId && climbPressed && !lastButtons.current.climb && !stateRef.current.crouching && !movementLocked && !swimState.current.active) {
      const target = collisionAdapter.findClimbTarget(group.current.position, facing.current);
      if (target) {
        const approachSpeed = Math.hypot(velocity.current.x, velocity.current.z);
        const heroic = running || approachSpeed > playerConfig.walkSpeed * 1.1;
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
        const forward = frameScratch.forwardFacing.copy(facing.current).setY(0).normalize();
        const here = group.current.position;
        const sample = (distance) => collisionAdapter.groundInfo(
          frameScratch.terrainProbe.set(here.x + forward.x * distance, here.y, here.z + forward.z * distance),
        );
        const climbYaw = Math.atan2(forward.x, forward.z);
        let handled = false;
        for (const distance of [1.1, 1.7, 2.4, 3.1]) {
          const ahead = sample(distance);
          const rise = ahead.y - here.y;
          if (rise >= 0.85 && rise <= 4.8) {
            const end = frameScratch.climbEnd.clone().set(here.x + forward.x * distance, ahead.y + 0.04, here.z + forward.z * distance);
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
              const end = frameScratch.climbEnd.clone().set(here.x + forward.x * distance, ahead.y + 0.04, here.z + forward.z * distance);
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
    if (!moving && LOCOMOTION_START_ACTIONS.has(stateRef.current.action)) {
      interruptAction(LOCOMOTION_START_ACTIONS);
    }
    const canPlayLocomotionFlourish = isDarwinMode && !moving && !stateRef.current.action && !movementLocked;
    if (isDarwinMode && !moving && previousMotion.current.moving && previousMotion.current.running && !stateRef.current.action && !movementLocked) {
      const previousSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (previousSpeed > playerConfig.walkSpeed * 1.28) {
        const runStopDuration = stateRef.current.modelAssetId === 'darwin5'
          ? durationFor('runToStop')
          : Math.min(0.55, ACTION_DURATION.runToStop);
        startAction('runToStop', runStopDuration, { lockMovement: false });
        emitPropEvent('player-skid', {
          position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
          direction: { x: velocity.current.x, y: 0, z: velocity.current.z },
          intensity: THREE.MathUtils.clamp(previousSpeed / playerConfig.runSpeed * 0.68, 0.38, 0.72),
          biome: surfaceBiome,
          source: 'darwin',
        });
        if (now - lastSkidDustAt.current > 0.22) {
          lastSkidDustAt.current = now;
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(previousSpeed / playerConfig.runSpeed * 0.84, 0.5, 0.88),
            position: frameScratch.footstepPosition.set(0, 0.06, -0.34),
            kind: 'skid',
            radiusScale: 1.08,
            horizontalSpeed: previousSpeed,
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
        const walkStopDuration = locomotionPreview
          ? durationFor('stopWalking')
          : Math.min(0.22, ACTION_DURATION.stopWalking);
        startAction('stopWalking', walkStopDuration, { lockMovement: false });
        collisionDustTriggerRef.current?.({
          intensity: THREE.MathUtils.clamp(previousSpeed / playerConfig.walkSpeed * 0.24, 0.2, 0.34),
          position: frameScratch.footstepPosition.set(0, 0.05, -0.24),
          biome: surfaceBiome,
          kind: 'footstep',
          horizontalSpeed: previousSpeed,
        });
      }
    }

    const airborneForControl = (wasAirborne.current || flightActive) && !characterDebug.current.grounded;
    if (steeringMoving && !movementLocked) {
      input.copy(rawInputDirection);
      const sidestepping = !flightActive && lateralOnlyInput && (stateRef.current.aiming || stateRef.current.crouching);
      const forwardFacing = frameScratch.forwardFacing.set(0, 0, -1).applyAxisAngle(frameScratch.up, yawRef.current);
      // Pivot flourish: reversing direction at speed plays the authored 180
      // turn instead of the body silently swivelling mid-run.
      const currentSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const normalizedFacing = frameScratch.turnFacing.copy(facing.current);
      if (normalizedFacing.lengthSq() > 0.001) normalizedFacing.normalize();
      const reversalDot = normalizedFacing.lengthSq() > 0.001 ? normalizedFacing.dot(input) : 1;
      if (isDarwinMode
        && !sidestepping
        && !airborneForControl
        && !stateRef.current.action
        && !stateRef.current.crouching
        && !stateRef.current.aiming
        && reversalDot < -0.66
        && currentSpeed > playerConfig.walkSpeed * 0.7
        && now - lastTurnFlourishAt.current > 0.85) {
        lastTurnFlourishAt.current = now;
        const turnClip = currentSpeed > playerConfig.walkSpeed * 1.25 ? 'runningTurn180' : 'walkingTurn180';
        const turnDuration = stateRef.current.modelAssetId === 'darwin5'
          ? durationFor(turnClip)
          : Math.min(durationFor(turnClip), currentSpeed > playerConfig.walkSpeed * 1.25 ? 0.38 : 0.32);
        startAction(turnClip, turnDuration, { lockMovement: false });
        const skidSpeed = THREE.MathUtils.clamp(currentSpeed * 0.58, playerConfig.walkSpeed * 0.85, playerConfig.runSpeed * 0.72);
        velocity.current.x = input.x * skidSpeed;
        velocity.current.z = input.z * skidSpeed;
        if (now - lastSkidDustAt.current > 0.18) {
          lastSkidDustAt.current = now;
          const runningPivot = turnClip === 'runningTurn180';
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(
              currentSpeed / playerConfig.runSpeed * (runningPivot ? 1.2 : 0.72),
              runningPivot ? 0.72 : 0.38,
              runningPivot ? 1.18 : 0.7,
            ),
            position: frameScratch.footstepPosition.set(0, 0.06, -0.28),
            biome: surfaceBiome,
            kind: 'skid',
            radiusScale: runningPivot ? 1.38 : 1.05,
            horizontalSpeed: currentSpeed,
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
          playerConfig.turnDamping * 2.4,
          delta,
        );
      } else if (isDarwinMode
        && !sidestepping
        && !airborneForControl
        && !stateRef.current.action
        && !stateRef.current.crouching
        && !stateRef.current.aiming
        && moving
        && running
        && reversalDot > -0.5
        && reversalDot < 0.62
        && currentSpeed > playerConfig.walkSpeed * 1.25
        && now - lastTurnFlourishAt.current > 0.75) {
        lastTurnFlourishAt.current = now;
        const crossY = normalizedFacing.z * input.x - normalizedFacing.x * input.z;
        const turnClip = crossY >= 0 ? 'runningTurnRight' : 'runningTurnLeft';
        const turnDuration = stateRef.current.modelAssetId === 'darwin5'
          ? durationFor(turnClip)
          : Math.min(durationFor(turnClip), 0.34);
        startAction(turnClip, turnDuration, { lockMovement: false });
        const carveSpeed = THREE.MathUtils.clamp(currentSpeed * 0.82, playerConfig.walkSpeed * 1.15, playerConfig.runSpeed * 0.92);
        velocity.current.x = input.x * carveSpeed;
        velocity.current.z = input.z * carveSpeed;
        if (now - lastSkidDustAt.current > 0.18) {
          lastSkidDustAt.current = now;
          collisionDustTriggerRef.current?.({
            intensity: THREE.MathUtils.clamp(currentSpeed / playerConfig.runSpeed * 1.08, 0.64, 1.08),
            position: frameScratch.footstepPosition.set(crossY >= 0 ? -0.22 : 0.22, 0.06, -0.2),
            biome: surfaceBiome,
            kind: 'skid',
            radiusScale: 1.3,
            horizontalSpeed: currentSpeed,
          });
        }
      }
      facing.current.copy(sidestepping ? forwardFacing : input);
      const targetVelocity = frameScratch.targetVelocity.copy(input).multiplyScalar(movementSpeed);
      applyArcadeSteering({
        state: arcadeLocomotion.current,
        velocity: velocity.current,
        inputDirection: input,
        targetVelocity,
        arcade,
      });
      let accel = (airborneForControl ? playerConfig.airAcceleration : playerConfig.groundAcceleration) * arcade.accelScale;
      if (flightActive) {
        const planarSpeed = Math.hypot(velocity.current.x, velocity.current.z);
        if (flightState.current.phase === 'landing') {
          accel = 6.5;
        } else if (!moving && planarSpeed > movementSpeed + 0.05) {
          // Releasing the keys mid-flight: ease off toward the idle glide
          // instead of braking hard in mid-air.
          accel = playerConfig.flight.idleDeceleration ?? 1.7;
        }
      }
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, targetVelocity.x, accel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, targetVelocity.z, accel, delta);
      if (arcade.feedbackIntensity > 0.18 && !airborneForControl && now - lastSkidDustAt.current > 0.2) {
        lastSkidDustAt.current = now;
        const skidEvent = {
          position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
          direction: { x: velocity.current.x, y: 0, z: velocity.current.z },
          intensity: THREE.MathUtils.clamp(arcade.feedbackIntensity, 0.12, 1),
          biome: surfaceBiome,
          source: isDarwinMode ? 'darwin' : 'animal',
        };
        emitPropEvent(arcade.scramble > 0.45 ? 'player-scramble' : 'player-skid', skidEvent);
        collisionDustTriggerRef.current?.({
          intensity: THREE.MathUtils.clamp(arcade.feedbackIntensity * arcade.traction.dust * 2.05, 0.48, 1.18),
          position: frameScratch.footstepPosition.set(0, 0.06, -0.24),
          biome: surfaceBiome,
          kind: arcade.scramble > 0.45 ? 'scramble' : 'skid',
          radiusScale: 1.34,
          horizontalSpeed: currentSpeed,
        });
        if (arcade.pivotBurst > 0.12 || arcade.scramble > 0.45) {
          cameraImpulse.current = {
            startedAt: now,
            intensity: THREE.MathUtils.clamp(0.08 + arcade.feedbackIntensity * 0.1, 0.08, 0.22),
            duration: 0.16,
            seed: cameraImpulse.current.seed + 1,
          };
        }
      }
      if (
        running
        && !airborneForControl
        && !stateRef.current.action
        && !stateRef.current.crouching
        && !stateRef.current.aiming
        && now - lastArcadeStumbleAt.current > 1.65
        && (
          (arcade.pivotBurst > 0.48 && currentSpeed > playerConfig.runSpeed * 0.74)
          || (arcade.downhill > 0.6 && arcade.skid > 0.5 && currentSpeed > playerConfig.runSpeed * 0.78)
        )
      ) {
        lastArcadeStumbleAt.current = now;
        const tripping = arcade.downhill > 0.7 && arcade.skid > 0.62;
        startAction(tripping ? 'trip' : 'stumble', tripping ? durationFor('trip') : durationFor('stumble'), {
          lockMovement: tripping ? 0.28 : false,
        });
        velocity.current.x *= tripping ? 0.58 : 0.82;
        velocity.current.z *= tripping ? 0.58 : 0.82;
        cameraImpulse.current = {
          startedAt: now,
          intensity: tripping ? 0.18 : 0.11,
          duration: tripping ? 0.24 : 0.16,
          seed: cameraImpulse.current.seed + 1,
        };
      }
      if (
        running
        && arcade.downhill > 0.52
        && currentSpeed > playerConfig.runSpeed * 0.78
        && !stateRef.current.action
        && now - lastDownhillSprintCameraAt.current > 0.72
      ) {
        lastDownhillSprintCameraAt.current = now;
        cameraImpulse.current = {
          startedAt: now,
          intensity: THREE.MathUtils.clamp(0.055 + arcade.downhill * 0.075 + arcade.scramble * 0.035, 0.06, 0.16),
          duration: 0.22,
          seed: cameraImpulse.current.seed + 1,
        };
      }
      const targetYaw = sidestepping ? Math.atan2(forwardFacing.x, forwardFacing.z) : Math.atan2(input.x, input.z);
      // Stronger turn assist at low speed so direction changes from a near
      // standstill feel snappy without twitchy full-speed steering.
      const turnAssist = THREE.MathUtils.lerp(
        playerConfig.lowSpeedTurnBoost,
        1,
        THREE.MathUtils.clamp(currentSpeed / playerConfig.runSpeed, 0, 1),
      );
      group.current.rotation.y = dampAngle(group.current.rotation.y, targetYaw, playerConfig.turnDamping * turnAssist * (1 - arcade.skid * 0.16), delta);
    } else {
      const stopEnvelopeScale = locomotionPreview && stateRef.current.action === 'runToStop'
        ? 0.2
        : locomotionPreview && stateRef.current.action === 'stopWalking'
          ? 0.25
          : 1;
      const decel = (airborneForControl ? playerConfig.airDeceleration : playerConfig.groundDeceleration)
        * arcade.decelScale
        * stopEnvelopeScale;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, decel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, decel, delta);
    }

    // Rifle aim mode: the camera owns Darwin's facing (crosshair at screen
    // center, shooter-style). This overrides the movement-driven yaw above,
    // so velocity can run opposite/lateral to facing (real backpedal and
    // strafing) and shots track the camera. getAimDirection also publishes
    // the full 3D fire direction (yaw + aim pitch) to shotgunAimState.
    const aimDirection = (stateRef.current.aiming && getAimDirection && !movementLocked && !stateRef.current.action)
      ? getAimDirection()
      : null;
    stateRef.current.aimDirection = aimDirection ? [aimDirection.x, aimDirection.z] : null;
    if (aimDirection) {
      facing.current.copy(aimDirection);
      const aimYaw = Math.atan2(aimDirection.x, aimDirection.z);
      group.current.rotation.y = dampAngle(group.current.rotation.y, aimYaw, 16, delta);
      shotgunAimState.active = true;
      shotgunAimState.playerX = group.current.position.x;
      shotgunAimState.playerY = group.current.position.y;
      shotgunAimState.playerZ = group.current.position.z;
    } else if (shotgunAimState.active && !stateRef.current.aiming) {
      resetShotgunAimState();
    }

    const groundInfo = collisionAdapter.groundInfo(group.current.position);
    const groundY = groundInfo.y;
    const groundGap = group.current.position.y - groundY;
    const canSnapToGround = !flightState.current.active
      && jumpState.current.phase !== 'takeoff'
      && velocity.current.y <= 0
      && groundGap <= playerConfig.groundSnapDistance;
    if (canSnapToGround && groundGap > -playerConfig.groundContactEpsilon) {
      group.current.position.y = groundY;
      characterController.sync(group.current.position);
      velocity.current.y = 0;
    }
    const grounded = group.current.position.y <= groundY + playerConfig.groundContactEpsilon;
    if (physicsDebug && now - lastPhysicsDebugAt.current > 0.25) {
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
        coyoteAvailable: now - lastGroundedAt.current <= playerConfig.coyoteTime,
        jumpBuffered: now <= jumpBufferedUntil.current,
        slopeGrade: slope.grade,
        uphillDot,
        speedScale: slopeSpeedScale,
        arcadeSpeedScale,
        arcadeSkid: arcade.skid,
        arcadeScramble: arcade.scramble,
        surfaceBiome,
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
    if (playerConfig.canFly && playerConfig.flight) {
      const flight = flightState.current;
      const flightConfig = playerConfig.flight;
      const flyHeld = Boolean(jumpPressed);
      const flyJustPressed = flyHeld && !lastButtons.current.jump;
      // Bird controls: Space toggles takeoff/landing, W climbs, S descends,
      // A/D carve the heading (steering above), Shift dives.
      const climbHeld = flight.active && Boolean(keys.forward || touch.forward);
      const descendHeld = flight.active && Boolean(keys.backward || touch.backward);
      // Over water the sea surface is the floor: clearance (and the
      // low-altitude push-up below) measure against it so the finch can
      // neither glide underwater nor settle onto open sea.
      const overWater = groundY < WATER_LEVEL - 0.05;
      const flightFloorY = Math.max(groundY, WATER_LEVEL);
      const terrainClearance = Math.max(0, group.current.position.y - flightFloorY);
      if (!flight.active && flyJustPressed && !movementLocked && !stateRef.current.action) {
        // Takeoff: from the ground, a short wing-burst windup that lofts the
        // finch before it blends into cruising flight. Mid-air (walked off a
        // ledge), the wings simply open straight into a glide.
        flight.active = true;
        flight.phase = grounded ? 'takeoff' : 'cruise';
        // phaseUntil doubles as a grace window: the tap that opened the
        // wings must not immediately read as a landing tap below.
        flight.phaseUntil = now + (grounded ? (flightConfig.takeoffDuration ?? 0.55) : 0.35);
        flight.lastFlapAt = now;
        flight.bankYaw = null;
        if (grounded) {
          velocity.current.y = Math.max(velocity.current.y, flightConfig.takeoffImpulse);
        }
        wasAirborne.current = true;
        jumpState.current.phase = 'airborne';
        jumpState.current.fromPlayerJump = false;
        stateRef.current.jumpPhase = 'flight';
      }
      if (flight.active) {
        if (flight.phase === 'takeoff' && now >= flight.phaseUntil) flight.phase = 'cruise';
        if (flight.phase === 'cruise' && flyJustPressed && now >= flight.phaseUntil && !overWater) {
          // Landing approach: flare and bleed speed, then sink until the
          // ground arrives — from any height. Over open sea Space does
          // nothing; there is nowhere to land.
          flight.phase = 'landing';
          flight.phaseUntil = now + (flightConfig.landingDuration ?? 0.55);
        }
        const diveHeld = Boolean(keys.run || touch.run) && !flyHeld && flight.phase === 'cruise';
        if (flight.phase === 'landing') {
          if (grounded || terrainClearance <= 0.05) {
            flight.active = false;
            flight.phase = 'grounded';
            velocity.current.x *= 0.3;
            velocity.current.z *= 0.3;
            velocity.current.y = Math.min(velocity.current.y, 0);
            stateRef.current.lockMovementUntil = Math.max(stateRef.current.lockMovementUntil, now + 0.24);
            landingDustTriggerRef.current?.({ intensity: 0.55 });
          } else if (climbHeld || (flyJustPressed && now >= flight.phaseUntil)) {
            // Pulling up (W) or tapping Space again aborts the approach.
            flight.phase = 'cruise';
            flight.phaseUntil = now + 0.3;
          } else {
            velocity.current.y = THREE.MathUtils.damp(
              velocity.current.y,
              -(flightConfig.landingSinkRate ?? 1.45),
              9,
              delta,
            );
          }
        } else {
          let targetVertical;
          if (flight.phase === 'takeoff') {
            targetVertical = flightConfig.takeoffClimbRate ?? flightConfig.flapClimbRate;
          } else if (climbHeld) {
            targetVertical = flightConfig.flapClimbRate;
          } else if (diveHeld) {
            targetVertical = -flightConfig.diveSinkRate;
          } else if (descendHeld) {
            targetVertical = -(flightConfig.descendSinkRate ?? flightConfig.diveSinkRate * 0.55);
          } else {
            targetVertical = -flightConfig.glideSinkRate;
          }
          if (terrainClearance < flightConfig.minTerrainClearance && targetVertical < 0) {
            targetVertical = Math.max(0.65, flightConfig.flapClimbRate * 0.35);
          }
          if (terrainClearance > flightConfig.maxTerrainClearance) {
            targetVertical = Math.min(targetVertical, -1.15);
          }
          velocity.current.y = THREE.MathUtils.damp(
            velocity.current.y,
            targetVertical,
            flightConfig.acceleration || 7.5,
            delta,
          );
        }
        if (flight.active) {
          wasAirborne.current = true;
          jumpState.current.phase = 'airborne';
          stateRef.current.jumpPhase = 'flight';
          stateRef.current.flying = true;
          stateRef.current.flightFlap = climbHeld || flight.phase === 'takeoff';
          stateRef.current.flightDive = diveHeld;
          stateRef.current.flightDescend = descendHeld && flight.phase === 'cruise';
          stateRef.current.flightSpeedT = THREE.MathUtils.clamp(
            Math.hypot(velocity.current.x, velocity.current.z) / Math.max(0.001, flightConfig.maxSpeed || flightConfig.cruiseSpeed || 1),
            0,
            1.4,
          );
          const pitchTarget = flight.phase === 'landing'
            ? -(flightConfig.pitchAmount ?? 0.28) * 0.9
            : THREE.MathUtils.clamp(-velocity.current.y * 0.055, -flightConfig.pitchAmount, flightConfig.pitchAmount);
          stateRef.current.flightPitch = THREE.MathUtils.damp(stateRef.current.flightPitch || 0, pitchTarget, 9, delta);
          // Bank follows the actual (damped) turn rate of the body, so it
          // eases in and out instead of snapping with the steering keys.
          const yawNow = group.current.rotation.y;
          if (flight.bankYaw === null) flight.bankYaw = yawNow;
          const yawStep = Math.atan2(Math.sin(yawNow - flight.bankYaw), Math.cos(yawNow - flight.bankYaw));
          flight.bankYaw = yawNow;
          const yawRate = delta > 0 ? yawStep / delta : 0;
          const bankTarget = flight.phase === 'cruise'
            ? THREE.MathUtils.clamp(yawRate * 0.42, -flightConfig.bankAmount, flightConfig.bankAmount)
            : 0;
          stateRef.current.flightBank = THREE.MathUtils.damp(
            stateRef.current.flightBank || 0,
            bankTarget,
            flightConfig.bankDamping ?? 4.5,
            delta,
          );
        }
      }
      if (!flight.active) {
        stateRef.current.flying = false;
        stateRef.current.flightFlap = false;
        stateRef.current.flightDive = false;
        stateRef.current.flightDescend = false;
        stateRef.current.flightSpeedT = 0;
        stateRef.current.flightPitch = THREE.MathUtils.damp(stateRef.current.flightPitch || 0, 0, 7, delta);
        stateRef.current.flightBank = THREE.MathUtils.damp(stateRef.current.flightBank || 0, 0, 7, delta);
        // Flightless profiles skip the jump/gravity system entirely, so the
        // grounded flier needs its own gravity for ledges and touchdowns.
        if (!grounded) {
          velocity.current.y -= (playerConfig.gravity ?? 10.8) * delta;
        }
      }
      stateRef.current.flightPhase = flight.active ? flight.phase : null;
      lastButtons.current.jump = flyHeld;
    }
    if (playerConfig.canDodge !== false && !carriedObjectId && dodgePressed && !lastButtons.current.dodge && grounded && !movementLocked && !stateRef.current.action) {
      const rollInput = frameScratch.dodgeDirection.copy(moving ? input : facing.current).normalize();
      const rollDirection = rollInput.lengthSq() > 0.001 ? rollInput : frameScratch.fallbackRollDirection;
      characterController.sync(group.current.position);
      startAction('fallingToRoll', ACTION_DURATION.dodgeRoll, { lockMovement: true });
      stateRef.current.rollMotion = {
        start: group.current.position.clone(),
        direction: rollDirection.clone(),
        distance: running ? THREE.MathUtils.lerp(3.15, 4.1, fatigueRunScale) : 3.15,
        duration: ACTION_DURATION.dodgeRoll,
        startedAt: now,
        targetYaw: Math.atan2(rollDirection.x, rollDirection.z),
        exitSpeed: running ? playerConfig.runSpeed * 0.8 : 0,
      };
      stateRef.current.crouching = false;
      stateRef.current.aiming = false;
    }
    lastButtons.current.dodge = dodgePressed;
    // Run-jump at a climbable face: a fresh jump press while running at a
    // boulder/wall within reach mantles it directly — no climb key needed.
    // The jump handler below then sees an action in progress and only buffers
    // the press, so open-ground jumps are untouched.
    if (playerConfig.canClimb !== false
      && isDarwinMode
      && jumpPressed && !lastButtons.current.jump
      && running && moving && grounded
      && !movementLocked
      && !stateRef.current.action
      && !stateRef.current.crouching
      && !stateRef.current.aiming
      && !swimState.current.active
      && now - lastAutoClimbAt.current > 0.9) {
      const jumpClimbTarget = collisionAdapter.findClimbTarget(group.current.position, facing.current);
      if (jumpClimbTarget && jumpClimbTarget.heightDelta >= 1.05 && jumpClimbTarget.heightDelta <= 3.6) {
        const jumpClimbGap = Math.hypot(
          jumpClimbTarget.obstacle.x - group.current.position.x,
          jumpClimbTarget.obstacle.z - group.current.position.z,
        ) - (jumpClimbTarget.obstacle.radius || 0) - 0.42;
        if (jumpClimbGap < 1.35) {
          lastAutoClimbAt.current = now;
          const approachSpeed = Math.hypot(velocity.current.x, velocity.current.z);
          const jumpClimbProfile = stateRef.current.modelAssetId === 'darwin5'
            ? boulderTraversalProfile(jumpClimbTarget.heightDelta, true, durationFor)
            : null;
          beginClimbMotion(
            jumpClimbProfile?.clip || 'sprintToWallClimb',
            jumpClimbTarget.end,
            jumpClimbTarget.heightDelta,
            Math.atan2(
              jumpClimbTarget.obstacle.x - group.current.position.x,
              jumpClimbTarget.obstacle.z - group.current.position.z,
            ),
            jumpClimbTarget.heightDelta > 2.4 ? 1.35 : 1,
            jumpClimbProfile ? {
              actionDuration: jumpClimbProfile.actionDuration,
              motionDuration: jumpClimbProfile.motionDuration,
              arcHeight: jumpClimbProfile.arcHeight,
              lockMovement: jumpClimbProfile.lockMovement,
              exitSpeed: approachSpeed * jumpClimbProfile.exitSpeedScale,
              earlyExitAt: jumpClimbProfile.earlyExitAt,
              cancelAt: jumpClimbProfile.cancelAt,
            } : {},
          );
        }
      }
    }
    if (playerConfig.canJump !== false && !playerConfig.canFly) {
      updatePlayerJumpInputAndGravity({
        keys,
        touch,
        stateRef,
        spawnDrop,
        velocity,
        group,
        facing,
        wasAirborne,
        jumpState,
        jumpCharge,
        pendingStandingJump,
        swimState,
        lastGroundedAt,
        jumpBufferedUntil,
        lastButtons,
        collisionAdapter,
        footstepDustTriggerRef,
        frameScratch,
        currentZoneId,
        moving,
        running,
        grounded,
        rawRunSpeed,
        rawInputDirection,
        jumpInputAllowed: !carriedObjectId,
        delta,
        now,
      });
    } else if (!playerConfig.canFly) {
      lastButtons.current.jump = jumpPressed;
      jumpCharge.current.active = false;
      pendingStandingJump.current.active = false;
      stateRef.current.jumpCharging = false;
      stateRef.current.jumpChargeAmount = 0;
    }
    const desiredDelta = frameScratch.desiredDelta.copy(velocity.current).multiplyScalar(delta);
    const canAutoTraverse = playerConfig.canAutoTraverse !== false
      && grounded
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
        const heroic = running || approachSpeed > playerConfig.walkSpeed * 1.1;
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
            : (heroic ? Math.max(approachSpeed * 0.85, playerConfig.walkSpeed) : 0),
          earlyExitAt: smallWallProfile?.earlyExitAt,
          cancelAt: smallWallProfile?.cancelAt,
        };
        velocity.current.set(0, 0, 0);
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = false;
        wasAirborne.current = false;
        finalizeFrame({
          moving,
          running,
          crouchRunIntent,
          arcade,
          groundDistance: 0,
          skipFootsteps: true,
        });
        return;
      }
      // Parkour intent: sprinting head-on into a climbable boulder taller
      // than the vault range mantles up it automatically — the climb key
      // remains for deliberate, slower ascents and for taller faces.
      if (!traversalTarget && running && now - lastAutoClimbAt.current > 1.2) {
        const climbTarget = collisionAdapter.findClimbTarget(group.current.position, facing.current);
        const rockLikeTarget = climbTarget?.obstacle?.kind === 'rock' || climbTarget?.obstacle?.kind === 'boulder';
        if (climbTarget && !rockLikeTarget && climbTarget.heightDelta <= 2.9) {
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
                : Math.max(approachSpeed * 0.55, playerConfig.walkSpeed),
              earlyExitAt: smallWallProfile?.earlyExitAt,
              cancelAt: smallWallProfile?.cancelAt,
            };
            velocity.current.set(0, 0, 0);
            stateRef.current.running = false;
            stateRef.current.walking = false;
            stateRef.current.airborne = false;
            wasAirborne.current = false;
            finalizeFrame({
              moving,
              running,
              crouchRunIntent,
              arcade,
              groundDistance: 0,
              skipFootsteps: true,
            });
            return;
          }
        }
      }
    }
    // Contact-reactive plants need the velocity Darwin is trying to carry into
    // a collider, not the near-zero displacement left after Rapier stops him.
    updateRuntimePlayerMotion({
      x: velocity.current.x,
      z: velocity.current.z,
      visualActive: shadowAnimationActive(stateRef.current),
    });
    const characterMove = characterController.move(group.current.position, desiredDelta);
    characterDebug.current.movement.copy(characterMove.movement);
    characterDebug.current.collisions = characterMove.collisions;
    characterDebug.current.grounded = characterMove.grounded;
    characterDebug.current.source = characterMove.source;
    characterDebug.current.normal.set(0, 0, 0);
    group.current.position.add(characterMove.movement);

    // Rapier's character controller stops at dynamic bodies but does not push
    // them automatically. Forward those exact contacts to the owning prop so
    // its mass/mobility profile can apply one bounded horizontal response
    // before the next physics step.
    if (characterMove.collisionDetails?.length) {
      const pushSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (pushSpeed > 0.05) {
        const dirX = velocity.current.x / pushSpeed;
        const dirZ = velocity.current.z / pushSpeed;
        const contactedPropIds = new Set();
        for (const contact of characterMove.collisionDetails) {
          const target = contact.userData || contact.rigidBody?.userData;
          if (!target?.id || !String(target.kind || '').startsWith('physics-')) continue;
          if (contactedPropIds.has(target.id)) continue;
          contactedPropIds.add(target.id);
          emitPropEvent('player-physics-prop-contact', {
            propId: target.id,
            direction: { x: dirX, y: 0, z: dirZ },
            contactPoint: contact.witness1 ? {
              x: contact.witness1.x,
              y: contact.witness1.y,
              z: contact.witness1.z,
            } : null,
            impactSpeed: pushSpeed,
            delta,
            now,
          });
        }
      }
    }

    const {
      sideContact: rapierSideContact,
      sideTarget: rapierTarget,
      groundTarget: rapierGroundTarget,
    } = classifyRapierCharacterContacts(characterMove.collisionDetails);
    let collision = rapierSideContact ? {
      normal: rapierSideContact.normal,
      penetration: rapierSideContact.translationDeltaRemaining?.length?.() || 0,
      contactPoint: rapierSideContact.witness1 || null,
      target: rapierTarget,
      obstacle: rapierTarget ? {
        ...rapierTarget,
        pushable: false,
      } : null,
    } : null;
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
      playerRadius: colliderConfig.radius,
      carriedObjectId,
    });
    if (specimenCollision) {
      group.current.position.copy(specimenCollision.position).addScaledVector(specimenCollision.normal, 0.018);
      const contactStimulus = {
        kind: 'contact',
        position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
        radius: Math.max(2.4, specimenCollision.radius + 2.2),
        intensity: Math.min(1.4, 0.65 + specimenCollision.penetration * 1.6),
      };
      pushSpecimenStimulus(currentZoneId, specimenCollision.actorId, contactStimulus);
      if (faunaDebug && typeof window !== 'undefined') {
        window.__faunaContactDebug = {
          ...(window.__faunaContactDebug || {}),
          [specimenCollision.actorId]: {
            zoneId: currentZoneId,
            specimenId: specimenCollision.specimen?.id,
            radius: specimenCollision.radius,
            playerRadius: colliderConfig.radius,
            penetration: specimenCollision.penetration,
            stimulus: contactStimulus,
            at: performance.now() / 1000,
          },
        };
      }
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

    let cactusCollisionImpact = null;
    if (collision) {
      const normal = frameScratch.collisionNormal.copy(collision.normal).normalize();
      characterDebug.current.normal.copy(normal);
      const horizontalVelocity = frameScratch.horizontalVelocity.set(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = horizontalVelocity.length();
      const intoSurface = impactSpeed > 0.001
        ? Math.max(0, -frameScratch.pushDirection.copy(horizontalVelocity).normalize().dot(normal))
        : 0;
      if (collision.obstacle?.kind === 'cactus' && collision.obstacle.spineHazard) {
        cactusCollisionImpact = {
          cactus: collision.obstacle,
          normal: normal.clone(),
          penetration: Math.max(0, collision.penetration || 0),
          distance: 0,
          impactSpeed,
          movingIntoCactus: intoSurface > 0.05,
        };
      }
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
      const physicsPropCollision = String(collision.target?.kind || '').startsWith('physics-');
      if (collision.obstacle?.bendable && impactSpeed > 0.32 && intoSurface > 0.2) {
        const bendDirection = horizontalVelocity.lengthSq() > 0.001
          ? frameScratch.pushDirection.copy(horizontalVelocity).normalize()
          : frameScratch.pushDirection.copy(normal).multiplyScalar(-1).normalize();
        emitPropEvent('obstacle-push-contact', {
          obstacleId: collision.obstacle.id,
          zoneId: collision.obstacle.zoneId || currentZoneId,
          kind: collision.obstacle.kind,
          direction: { x: bendDirection.x, y: 0, z: bendDirection.z },
          intensity: THREE.MathUtils.clamp(impactSpeed / 3.2 + collision.penetration * 0.18, 0.15, 1),
        });
      }
      const travelEdgeContact = shouldRunInPlaceAtTravelEdge(
        useThreeGameStore.getState(),
        { moving, isDarwinMode },
      );
      if (!travelEdgeContact
        && !collision.specimen
        && !physicsPropCollision
        && collision.obstacle
        && collision.obstacle.kind !== 'terrain'
        && impactSpeed >= PUSH_ANIMATION_MIN_SPEED
        && intoSurface >= PUSH_ANIMATION_MIN_FORWARD) {
        startPushFeedback(collision.obstacle);
      }
      const canReact = now - bounceFeedback.current.lastImpactAt >= BUMP_FEEDBACK.cooldown;
      const pushable = physicsPropCollision
        ? null
        : collision.obstacle?.pushable
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
          movePushableObstacle(
            pushable.id,
            pushDelta,
            pushable.zoneId,
            pushable.mobility?.maxOffset ?? pushable.maxPushOffset ?? null,
          );
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
        const contactPoint = collision.contactPoint;
        const fallbackContactHeight = Math.min(
          1.05,
          Math.max(0.42, (collision.obstacle?.height || collision.obstacle?.colliderTop || 1.4) * 0.55),
        );
        collisionDustTriggerRef.current?.({
          kind: 'collision',
          intensity: Math.min(1, intensity * 0.9),
          worldPosition: contactPoint
            ? { x: contactPoint.x, y: contactPoint.y, z: contactPoint.z }
            : {
              x: group.current.position.x - normal.x * colliderConfig.radius,
              y: group.current.position.y + fallbackContactHeight,
              z: group.current.position.z - normal.z * colliderConfig.radius,
            },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          direction: {
            x: horizontalVelocity.x / Math.max(impactSpeed, 0.001),
            y: 0,
            z: horizontalVelocity.z / Math.max(impactSpeed, 0.001),
          },
          horizontalSpeed: impactSpeed,
          target: collision.target || collision.obstacle || null,
        });
        velocity.current.x += normal.x * intensity * 0.38;
        velocity.current.z += normal.z * intensity * 0.38;
        // A run-speed bump reads as a stumble, not a full hit reaction —
        // movement stays live so it feels like weight, not punishment.
        if (!stateRef.current.action && impactSpeed > playerConfig.walkSpeed * 1.15) {
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

    const cactusContact = cactusCollisionImpact
      || findCactusHazardContact(group.current.position, colliderConfig.radius, currentZoneId);
    if (cactusContact) {
      const horizontalVelocity = frameScratch.cactusHorizontalVelocity.set(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = cactusContact.impactSpeed ?? horizontalVelocity.length();
      const movingIntoCactus = cactusContact.movingIntoCactus ?? (impactSpeed > CACTUS_HAZARD.minSpeed
        ? frameScratch.pushDirection.copy(horizontalVelocity).normalize().dot(cactusContact.normal) < 0.25
        : false);
      const canCactusHit = impactSpeed >= CACTUS_HAZARD.minSpeed
        && movingIntoCactus
        && now - lastCactusHitAt.current >= CACTUS_HAZARD.cooldown;
      group.current.position.addScaledVector(cactusContact.normal, Math.min(0.34, cactusContact.penetration + 0.08));
      if (canCactusHit) {
        lastCactusHitAt.current = now;
        const shove = CACTUS_HAZARD.shove + Math.min(1.4, impactSpeed * 0.24);
        velocity.current.x = cactusContact.normal.x * shove;
        velocity.current.z = cactusContact.normal.z * shove;
        velocity.current.y = Math.max(velocity.current.y, 0.72);
        const hazard = cactusContact.cactus.spineHazard || {};
        const injuryChance = cactusSpineInjuryChance({
          running,
          impactSpeed,
          walkSpeed: playerConfig.walkSpeed,
          runSpeed: playerConfig.runSpeed,
          walkChance: CACTUS_HAZARD.walkInjuryChance,
          runChance: CACTUS_HAZARD.runInjuryChance,
        });
        const spineInjury = isDarwinMode && Math.random() < injuryChance;
        if (spineInjury) {
          const streak = cactusHazardStreak.current;
          streak.count = now - streak.lastAt <= 8 ? streak.count + 1 : 1;
          streak.lastAt = now;
          const severeFall = impactSpeed >= playerConfig.runSpeed * 0.86;
          const embedSpines = streak.count >= 2 || impactSpeed >= playerConfig.runSpeed * 0.62;
          if (embedSpines) streak.count = 0;
          applyCactusDamage(hazard.damage || cactusContact.cactus.damage || 8, {
            embedSpines,
            severeFall,
            impactSpeed,
            injuryChance,
            cactusId: cactusContact.cactus.id,
            cactusKind: hazard.kind,
            hazardLabel: hazard.label,
            educationalNote: hazard.educationalNote,
          });
          startAction('stumble', durationFor('stumble'), { lockMovement: false });
        }
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
      characterMove.grounded
      && String(rapierGroundTarget?.kind || '').startsWith('physics-')
    ) {
      // Dynamic props are outside the analytic terrain/obstacle adapter. The
      // KCC has already stopped at their top, so its resolved player position
      // is the support height for this frame.
      nextGroundInfo = {
        ...nextGroundInfo,
        y: group.current.position.y,
        source: 'physics-prop',
        physicsTarget: rapierGroundTarget,
      };
      stanceGroundInfo = null;
    }
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
    const groundedForStance = groundDistance <= playerConfig.groundSnapDistance && jumpState.current.phase !== 'takeoff';
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
    if (!flightState.current.active) {
      resolvePlayerLanding({
        group,
        velocity,
        facing,
        stateRef,
        wasAirborne,
        jumpState,
        characterController,
        characterMove,
        frameScratch,
        terrainFeedback,
        arcadeLocomotion,
        landingDustTriggerRef,
        cameraImpulse,
        collisionAdapter,
        currentZoneId,
        moving,
        running,
        grounded,
        groundDistance,
        nextGroundY,
        queueMovementCost,
        startAction,
        durationFor,
        delta,
        now,
      });
    }
    const p = group.current.position;
    const swim = swimState.current;
    const swimGround = collisionAdapter.groundInfo(p);
    const waterDepthHere = Math.max(0, WATER_LEVEL - swimGround.y);
    frameScratch.pushCandidate.copy(p).addScaledVector(facing.current, 1.25);
    const forwardWaterDepth = Math.max(0, WATER_LEVEL - collisionAdapter.groundInfo(frameScratch.pushCandidate).y);
    const waterEntryAhead = waterDepthHere > 0.22 || forwardWaterDepth > swimConfig.exitDepth;
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
    if (!swim.active && health > 0 && playerConfig.canSwim !== false) {
      const wadedIn = !wasAirborne.current && waterDepthHere > swimConfig.enterDepth;
      const fellIn = wasAirborne.current && p.y <= WATER_LEVEL - 0.18 && waterDepthHere > swimConfig.enterDepth;
      if (wadedIn || fellIn) {
        if (carriedObjectId) dropCarriedObject({ reason: 'swimming', mode: 'release' });
        const jumpWaterEntryIntent = jumpState.current.waterEntryIntent;
        swim.active = true;
        swim.enteredAt = now;
        if (SWIM_POLISH.enabled) {
          const currentSink = THREE.MathUtils.clamp(WATER_LEVEL - p.y, swimConfig.bodySink, SWIM_POLISH.idleBodySink);
          const depthLimit = Math.max(swimConfig.bodySink, waterDepthHere - SWIM_POLISH.seafloorClearance);
          swimSink.current = Math.min(currentSink, depthLimit);
        } else {
          swimSink.current = swimConfig.bodySink;
        }
        stateRef.current.crouching = false;
        stateRef.current.aiming = false;
        jumpCharge.current.active = false;
        pendingStandingJump.current.active = false;
        jumpState.current.phase = 'grounded';
        jumpState.current.waterEntryIntent = null;
        stateRef.current.jumpPhase = 'grounded';
        stateRef.current.jumpWaterEntryIntent = null;
        if (fellIn) {
          if (jumpWaterEntryIntent !== 'dive') {
            startAction('fallingIntoPool', durationFor('fallingIntoPool'), { lockMovement: true });
          }
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
      const swimSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const swimMoveT = THREE.MathUtils.smoothstep(swimSpeed, 0.34, swimConfig.speed * 0.88);
      const swimSprintT = THREE.MathUtils.smoothstep(swimSpeed, swimConfig.speed * 1.04, swimConfig.sprintSpeed);
      let targetSink = swimConfig.bodySink;
      if (SWIM_POLISH.enabled) {
        targetSink = THREE.MathUtils.lerp(SWIM_POLISH.idleBodySink, SWIM_POLISH.movingBodySink, swimMoveT);
        targetSink = THREE.MathUtils.lerp(targetSink, SWIM_POLISH.sprintBodySink, swimSprintT);
        const depthLimit = Math.max(swimConfig.bodySink, waterDepthHere - SWIM_POLISH.seafloorClearance);
        targetSink = Math.min(targetSink, depthLimit);
        swimSink.current = THREE.MathUtils.damp(swimSink.current, targetSink, SWIM_POLISH.sinkDamping, delta);
      } else {
        swimSink.current = swimConfig.bodySink;
      }
      const floatY = WATER_LEVEL - swimSink.current;
      const snapDistance = SWIM_POLISH.enabled ? SWIM_POLISH.snapDistance : 2.4;
      const heightDamping = SWIM_POLISH.enabled ? SWIM_POLISH.heightDamping : 5;
      p.y = Math.abs(p.y - floatY) > snapDistance ? floatY : THREE.MathUtils.damp(p.y, floatY, heightDamping, delta);
      velocity.current.y = 0;
      wasAirborne.current = false;
      stateRef.current.jumpPhase = 'grounded';
      characterController.sync(p);
      if (moving && !stateRef.current.action && !movementLocked && waterDepthHere > swimConfig.exitDepth * 0.75) {
        const exitDirection = frameScratch.swimExitDirection;
        exitDirection.copy(rawInputDirection.lengthSq() > 0.001 ? rawInputDirection : facing.current).setY(0);
        if (exitDirection.lengthSq() > 0.001) {
          exitDirection.normalize();
          const start = group.current.position;
          const heroic = running || Math.hypot(velocity.current.x, velocity.current.z) > playerConfig.walkSpeed * 0.85;
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
              const candidateEnd = frameScratch.swimCandidateEnd.set(probe.x, ahead.y + 0.04, probe.z);
              const walkableEnd = collisionAdapter.clampToWalkable(candidateEnd, start, { wade: false });
              const landingShift = Math.hypot(walkableEnd.x - candidateEnd.x, walkableEnd.z - candidateEnd.z);
              if (landingShift > 0.32) continue;
              const landingGround = collisionAdapter.groundInfo(walkableEnd, { ignoreObstacles: true });
              const end = frameScratch.swimExitEnd.clone().set(walkableEnd.x, landingGround.y + 0.04, walkableEnd.z);
              const profile = stateRef.current.modelAssetId === 'darwin5'
                ? boulderTraversalProfile(actualRise, heroic, durationFor)
                : null;
              swim.active = false;
              swimSink.current = swimConfig.bodySink;
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
                  exitSpeed: Math.max(playerConfig.walkSpeed * 0.35, playerConfig.walkSpeed * profile.exitSpeedScale),
                  earlyExitAt: profile.earlyExitAt,
                  cancelAt: profile.cancelAt,
                } : {
                  motionDuration: THREE.MathUtils.clamp(0.32 + actualRise * 0.18, 0.38, 0.82),
                  arcHeight: THREE.MathUtils.clamp(0.1 + actualRise * 0.06, 0.12, 0.22),
                  exitSpeed: playerConfig.walkSpeed * 0.35,
                },
              );
              finalizeFrame({
                moving,
                running,
                crouchRunIntent,
                arcade,
                groundDistance: 0,
                skipFootsteps: true,
              });
              return;
            }
          }
        }
      }
      if (waterDepthHere < swimConfig.exitDepth) {
        // Shore reached: stand up through the shallows. Darwin 5's
        // swim-to-edge source clip is long and reads badly on gentle beaches,
        // so shallow exits simply become wading/walking.
        swim.active = false;
        swimSink.current = swimConfig.bodySink;
        p.y = swimGround.y;
        characterController.sync(p);
        if (moving && stateRef.current.modelAssetId !== 'darwin5') {
          startAction('swimToEdge', durationFor('swimToEdge'), { lockMovement: 0.34 });
        }
      }
    }
    const allowDeepWater = swim.active || wasAirborne.current || wadeDepth.current > WADE_DEPTH * 0.96;
    const clamped = collisionAdapter.clampToWalkable(p, startOfFramePosition, { wade: true, deep: allowDeepWater });
    if (swim.active) {
      // While swimming, terrain/cove bounds may still correct X/Z, but buoyancy
      // owns Y. Letting the walkable clamp restore terrain height makes Darwin
      // visibly bob against the float solver on uneven seabeds.
      clamped.y = p.y;
    }
    if (!clamped.equals(p)) {
      const correction = frameScratch.correction.copy(clamped).sub(p);
      p.copy(clamped);
      characterController.sync(p);
      const correctionDistance = Math.hypot(correction.x, correction.z);
      const velocityKeep = correctionDistance < 0.65 ? 0.72 : 0.35;
      velocity.current.x *= velocityKeep;
      velocity.current.z *= velocityKeep;
    }
    const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    if (!swim.active && !wasAirborne.current && jumpState.current.phase !== 'takeoff') {
      const finalGroundInfo = collisionAdapter.groundInfo(p);
      const groundLift = finalGroundInfo.y - p.y;
      if (groundLift < -(playerConfig.ledgeReleaseDrop ?? PLAYER.ledgeReleaseDrop)) {
        // The ground fell away by more than a body-length in a single frame —
        // a tall ledge, not a steppable drop. Release to the airborne/landing
        // systems instead of gluing Darwin to the lower surface.
        wasAirborne.current = true;
        stateRef.current.jumpPhase = 'airborne';
      } else {
        p.y = finalGroundInfo.y;
        characterController.sync(p);
        velocity.current.y = 0;
        if (
          finalGroundInfo.source === 'authored-obstacle'
          && groundLift > 0.08
          && groundLift <= 1.0
          && horizontalSpeed > 0.8
          && now - lastStepUpDustAt.current > 0.28
        ) {
          lastStepUpDustAt.current = now;
          footstepDustTriggerRef.current?.({
            kind: 'step-up',
            intensity: THREE.MathUtils.clamp(0.25 + groundLift * 0.75 + horizontalSpeed / 18, 0.28, 0.72),
            position: frameScratch.footstepPosition.set(0, 0.06, 0.18),
          });
        }
      }
    }

    // Step smoothing: obstacle support moves the collider up or down in sharp
    // per-frame increments a walk cycle cannot follow. Bank the vertical snap
    // as a visual model offset (eased back by playerFrameFeedback) so the body
    // rises or settles through the step instead of teleporting, and pulse the
    // squash/stretch fields so bigger steps read in the silhouette.
    if (!swim.active
      && !wasAirborneAtFrameStart
      && !wasAirborne.current
      && jumpState.current.phase !== 'takeoff'
      && !stateRef.current.climbMotion
      && !stateRef.current.rollMotion
      && spawnDrop.current.phase === 'complete') {
      const stepDy = p.y - startOfFramePosition.y;
      const stepTravel = Math.hypot(p.x - startOfFramePosition.x, p.z - startOfFramePosition.z);
      // Anything steeper than ~45° of instantaneous grade is a step, not a
      // slope being followed; huge deltas are teleports and stay untouched.
      const slopeAllowance = Math.max(0.085, stepTravel * 0.95);
      if (Math.abs(stepDy) > slopeAllowance && Math.abs(stepDy) < 2.2) {
        stateRef.current.stepSmoothOffset = THREE.MathUtils.clamp(
          (stateRef.current.stepSmoothOffset || 0) - stepDy,
          -0.85,
          0.85,
        );
        if (stepDy > 0) {
          // Climbing costs a little momentum so tall steps read as effort.
          const stepMomentumKeep = 1 - Math.min(0.12, stepDy * 0.3);
          velocity.current.x *= stepMomentumKeep;
          velocity.current.z *= stepMomentumKeep;
        }
        if (Math.abs(stepDy) > 0.15 && !stateRef.current.action && now - lastStepPulseAt.current > 0.3) {
          lastStepPulseAt.current = now;
          if (stepDy > 0) {
            stateRef.current.impactTakeoffAt = now;
            stateRef.current.impactStretch = THREE.MathUtils.clamp(0.3 + stepDy * 0.8, 0.35, 0.8);
          } else {
            stateRef.current.impactLandedAt = now;
            stateRef.current.impactIntensity = THREE.MathUtils.clamp(-stepDy * 0.55, 0.14, 0.5);
          }
        }
      }
    }

    if (!swim.active && (moving || horizontalSpeed > 0.05) && now - lastDroppingSmushAt.current > 0.12) {
      const realNow = Date.now();
      const playerSmushRadius = playableMode.id === 'tortoise'
        ? 0.64
        : Math.max(0.22, (colliderConfig.radius || CHARACTER_CONTROLLER_CONFIG.radius) * 0.72);
      const contact = (animalDroppings || []).find(dropping => {
        if (!dropping || dropping.zoneId !== currentZoneId || dropping.status === 'smushed') return false;
        if (dropping.status === 'falling' || dropping.status === 'stuck') return false;
        if (realNow - (dropping.createdAtRealMs || realNow) < 900) return false;
        const position = dropping.position || {};
        const dx = p.x - (Number(position.x) || 0);
        const dz = p.z - (Number(position.z) || 0);
        return Math.hypot(dx, dz) <= playerSmushRadius + (dropping.radius || 0.22);
      });
      if (contact) {
        lastDroppingSmushAt.current = now;
        smushAnimalDropping?.(contact.id, { by: playableMode.id });
        emitPropEvent('animal-dropping-smushed', {
          zoneId: currentZoneId,
          id: contact.id,
          by: playableMode.id,
          position: contact.position,
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
      lastExamineRef: lastExamine,
      lastCameraRef: lastCamera,
      startAction,
      collectNearby,
      openExamine,
      cycleViewMode,
      setNearbySpecimen,
      setActiveTool,
      setEdgePrompt,
      beginZoneTransition,
      setCarriedObject,
      placePlayerAt: target => {
        const targetPosition = target?.position;
        if (!group.current || !Array.isArray(targetPosition)) return;
        group.current.position.set(
          Number(targetPosition[0]) || 0,
          Number(targetPosition[1]) || 0,
          Number(targetPosition[2]) || 0,
        );
        const targetFacing = target?.facing;
        if (Array.isArray(targetFacing)) {
          facing.current.set(targetFacing[0] || 0, 0, targetFacing[2] ?? 1).normalize();
          group.current.rotation.y = Math.atan2(facing.current.x, facing.current.z);
        }
        characterController.sync(group.current.position);
        velocity.current.set(0, 0, 0);
      },
      allowSpecimenInteractions: playerConfig.canUseDarwinInteractions !== false,
    });

    const travelRunInPlace = shouldRunInPlaceAtTravelEdge(
      useThreeGameStore.getState(),
      { moving, isDarwinMode },
    );
    if (travelRunInPlace && PUSH_FEEDBACK_ACTIONS.has(stateRef.current.action)) {
      stateRef.current.action = null;
      stateRef.current.actionUntil = 0;
      stateRef.current.recoverAction = null;
      stateRef.current.lockMovementUntil = Math.min(stateRef.current.lockMovementUntil, now);
    }

    finalizeFrame({
      moving,
      running,
      crouchRunIntent,
      arcade,
      groundDistance,
      tiredRun,
      runInPlace: travelRunInPlace,
    });

    // Sprint surge: the moment the spool completes, kick a puff of dust off
    // the back foot so the tier change lands as a felt beat (the camera adds
    // a matching FOV pop from the same sprintT edge).
    if (stateRef.current.sprinting && !prevSprintingRef.current && !swimState.current.active && !airborneForControl) {
      collisionDustTriggerRef.current?.({
        intensity: 0.58,
        position: frameScratch.footstepPosition.set(0, 0.05, -0.3),
        biome: surfaceBiome,
        kind: 'footstep',
        radiusScale: 1,
        horizontalSpeed: Math.hypot(velocity.current.x, velocity.current.z),
      });
    }
    prevSprintingRef.current = stateRef.current.sprinting;
    const runningBurstActive = Boolean(
      isDarwinMode
      && running
      && moving
      && !swimState.current.active
      && !airborneForControl
      && !stateRef.current.crouching
      && !stateRef.current.aiming
    );
    if (runningBurstActive && !prevRunningIntentRef.current) {
      collisionDustTriggerRef.current?.({
        intensity: 0.46,
        position: frameScratch.footstepPosition.set(0, 0.05, -0.24),
        biome: surfaceBiome,
        kind: 'footstep',
        radiusScale: 0.94,
      });
    }
    prevRunningIntentRef.current = runningBurstActive;
  }, -1);

  return (
    <group ref={group} position={[startX, collisionAdapter.spawnY(startX, startZ) + SPAWN_DROP.height, startZ]} rotation={[0, Math.PI, 0]} userData={{
      renderSource: 'player:darwin-controller',
      renderLabel: 'Darwin controller helpers',
      renderKind: 'player-controller',
      renderPath: null,
    }}>
      <RigidBody
        key={`player-body-${playableMode.id}`}
        ref={characterBodyRef}
        type="kinematicPosition"
        colliders={false}
        enabledRotations={[false, false, false]}
        position={[startX, collisionAdapter.spawnY(startX, startZ) + SPAWN_DROP.height, startZ]}
        userData={{ id: 'darwin', kind: 'player' }}
      >
        <PlayerPhysicsCollider colliderConfig={colliderConfig} colliderRef={characterColliderRef} />
      </RigidBody>
      <group ref={modelFeedbackRef}>
        <PlayerAvatarModel
          playableModeId={playableMode.id}
          motionRef={stateRef}
          health={health}
          fatigue={fatigue}
          inventoryCount={inventoryCount}
          grounding={modelGrounding}
          animationBankPhase={animationBankPhase}
          onAnimationBanksReady={onAnimationBanksReady}
          onVisualReady={onVisualReady}
        />
      </group>
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
          <group position={[0, colliderConfig.centerY, 0]}>
            <PlayerColliderDebugMesh colliderConfig={colliderConfig} material={debugMaterials.capsule} />
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
