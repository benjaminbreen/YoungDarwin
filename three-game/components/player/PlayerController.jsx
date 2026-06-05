'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getThreeSpecimens, threeTools } from '../../data';
import { consumeTouchControls } from '../../input/touchControls';
import { TERRAIN_BOUNDS } from '../../world/terrain';
import { getZone } from '../../world/floreanaZones';
import { createCollisionAdapter } from '../../physics/collisionAdapter';
import {
  CHARACTER_CONTROLLER_CONFIG,
  useKinematicCharacterController,
} from '../../physics/useKinematicCharacterController';
import { ModelAsset } from '../assets/ModelAsset';

const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.1,
  jumpVelocity: 6.8,
  gravity: 15.5,
  bounds: TERRAIN_BOUNDS,
};

const SPAWN_DROP = {
  height: 7.2,
  initialVelocity: -1.2,
  maxFallSpeed: -16,
  landingLock: 0.55,
};

const BUMP_FEEDBACK = {
  duration: 0.32,
  cooldown: 0.34,
  minSpeed: 2.1,
  minHeadOn: 0.42,
};

const CAMERA = {
  minZoom: 2.8,
  maxZoom: 22,
  defaultZoom: 4.45,
  rotateSpeed: 0.0042,
  keyRotateSpeed: 2.2,
};

const ACTION_DURATION = {
  pray: 2.8,
  fireRifle: 1.25,
  swingHammer: 1.15,
  swingNet: 1.2,
  gather: 2.2,
  pickUp: 1.35,
  lookAround: 2.1,
  point: 1.4,
  trip: 1.8,
  hitReaction: 1.15,
  bigHitFall: 2.25,
  changeItem: 1.0,
  write: 2.7,
  kneelInspect: 2.35,
  climb: 2.15,
  teeter: 1.45,
  startWalking: 0.75,
  stopWalking: 0.82,
  runToStop: 0.7,
  landing: 0.65,
  hardLanding: 1.15,
  gettingUp: 1.65,
  fallingForwardDeath: 2.4,
};

function easeInOutCubic(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function ProceduralNaturalistModel({ motionRef }) {
  const group = useRef(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const running = motionRef.current.running;
    const airborne = motionRef.current.airborne;
    const stride = running ? 10 : 6;
    group.current.children.forEach((child, index) => {
      if (child.userData.limb) {
        child.rotation.x = Math.sin(t * stride + index) * (running ? 0.65 : 0.38);
      }
    });
    group.current.position.y = airborne ? 0.08 : Math.abs(Math.sin(t * stride)) * (running ? 0.055 : 0.025);
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.28, 18, 18]} />
        <meshToonMaterial color="#d0a070" />
      </mesh>
      <mesh castShadow position={[0, 2.0, 0]} rotation={[0.05, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.43, 0.16, 20]} />
        <meshToonMaterial color="#b58b46" />
      </mesh>
      <mesh castShadow position={[0, 1.08, 0]}>
        <capsuleGeometry args={[0.3, 0.85, 6, 12]} />
        <meshToonMaterial color="#4a3527" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[-0.26, 0.54, 0]}>
        <capsuleGeometry args={[0.08, 0.75, 4, 8]} />
        <meshToonMaterial color="#2b2520" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[0.26, 0.54, 0]}>
        <capsuleGeometry args={[0.08, 0.75, 4, 8]} />
        <meshToonMaterial color="#2b2520" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[-0.42, 1.15, 0]}>
        <capsuleGeometry args={[0.055, 0.62, 4, 8]} />
        <meshToonMaterial color="#6d5941" />
      </mesh>
      <mesh userData={{ limb: true }} castShadow position={[0.42, 1.15, 0]}>
        <capsuleGeometry args={[0.055, 0.62, 4, 8]} />
        <meshToonMaterial color="#6d5941" />
      </mesh>
      <mesh castShadow position={[-0.38, 1.02, -0.14]} rotation={[0, 0.2, 0.16]}>
        <boxGeometry args={[0.36, 0.42, 0.16]} />
        <meshToonMaterial color="#8a5d30" />
      </mesh>
    </group>
  );
}

function NaturalistModel({ motionRef, health, fatigue }) {
  const statusRef = useRef({ health, fatigue });
  useEffect(() => {
    statusRef.current.health = health;
    statusRef.current.fatigue = fatigue;
  }, [health, fatigue]);

  const selectAnimation = useCallback(() => {
    const status = statusRef.current;
    if (status.health <= 0) return 'fallingForwardDeath';
    if (motionRef.current.action) return motionRef.current.action;
    if (motionRef.current.aiming && motionRef.current.crouching) return 'crouchRifle';
    if (motionRef.current.aiming && motionRef.current.walking) return 'walkRifle';
    if (motionRef.current.aiming) return 'aim';
    if (motionRef.current.airborne) return motionRef.current.running ? 'runJump' : 'jump';
    if (motionRef.current.crouching && motionRef.current.walking) return 'crouchWalk';
    if (motionRef.current.crouching) return 'crouchIdle';
    if (motionRef.current.strafeLeft) return motionRef.current.running ? 'runStrafeLeft' : 'walkStrafeLeft';
    if (motionRef.current.strafeRight) return motionRef.current.running ? 'runStrafeRight' : 'walkStrafeRight';
    if (motionRef.current.running) return 'run';
    if (motionRef.current.walking) return 'walk';
    if (status.fatigue >= 82) return 'exhaustedIdle';
    return 'idle';
  }, [motionRef]);
  return <ModelAsset id="darwin" animationSelector={selectAnimation} fallback={<ProceduralNaturalistModel motionRef={motionRef} />} />;
}

function collectionAnimationForTool(toolId) {
  if (toolId === 'shotgun') return { clip: 'fireRifle', duration: ACTION_DURATION.fireRifle, lockMovement: true };
  if (toolId === 'insect_net') return { clip: 'swingNet', duration: ACTION_DURATION.swingNet, lockMovement: true };
  if (toolId === 'hammer') return { clip: 'swingHammer', duration: ACTION_DURATION.swingHammer, lockMovement: true };
  if (toolId === 'sketch') return { clip: 'kneelInspect', duration: ACTION_DURATION.kneelInspect, lockMovement: true };
  if (toolId === 'snare') return { clip: 'gather', duration: ACTION_DURATION.gather, lockMovement: true };
  return { clip: 'pickUp', duration: ACTION_DURATION.pickUp, lockMovement: true };
}

function formatVector(vector) {
  if (!vector) return '--';
  return `${vector.x.toFixed(2)},${vector.y.toFixed(2)},${vector.z.toFixed(2)}`;
}

function orientDebugVector(group, direction, length) {
  if (!group) return;
  const normalized = direction.clone();
  if (normalized.lengthSq() < 0.0001 || length <= 0.001) {
    group.visible = false;
    return;
  }
  normalized.normalize();
  group.visible = true;
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized);
  group.scale.set(1, length, 1);
}

export function PlayerController({ physicsDebug = false }) {
  const group = useRef(null);
  const warningRef = useRef(null);
  const modelFeedbackRef = useRef(null);
  const debugCollisionRef = useRef(null);
  const debugMovementRef = useRef(null);
  const characterBodyRef = useRef(null);
  const characterColliderRef = useRef(null);
  const velocity = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const zoom = useRef(CAMERA.defaultZoom);
  const dragging = useRef(false);
  const lastPointerX = useRef(0);
  const facing = useRef(new THREE.Vector3(0, 0, -1));
  const wasAirborne = useRef(false);
  const lastInteract = useRef(false);
  const lastCamera = useRef(false);
  const lastButtons = useRef({});
  const lastTeeterAt = useRef(0);
  const lastPhysicsDebugAt = useRef(0);
  const spawnDrop = useRef({ phase: 'pending', zoneId: null, landingUntil: 0 });
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
  const stateRef = useRef({
    running: false,
    walking: false,
    airborne: false,
    crouching: false,
    aiming: false,
    strafeLeft: false,
    strafeRight: false,
    action: null,
    actionUntil: 0,
    actionStartedAt: 0,
    lockMovementUntil: 0,
    recoverAction: null,
    climbMotion: null,
  });
  const [, getKeys] = useKeyboardControls();
  const { camera, gl } = useThree();
  const rapierContext = useRapier();
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const applyMovementCost = useThreeGameStore(state => state.applyMovementCost);
  const setNearbySpecimen = useThreeGameStore(state => state.setNearbySpecimen);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const setPhysicsDebug = useThreeGameStore(state => state.setPhysicsDebug);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zoneSpecimens = useMemo(() => getThreeSpecimens(currentZoneId), [currentZoneId]);
  const collisionAdapter = useMemo(() => createCollisionAdapter(currentZoneId, rapierContext), [currentZoneId, rapierContext]);
  const characterController = useKinematicCharacterController(rapierContext, characterBodyRef, characterColliderRef);
  const [startX, , startZ] = getZone(currentZoneId).playerStart || [0, 0, 7.5];

  const cameraTargets = useMemo(() => ({
    shoulder: new THREE.Vector3(1.05, 2.35, 3.75),
    first: new THREE.Vector3(0, 1.72, 0.16),
    top: new THREE.Vector3(0, 20, 0.1),
  }), []);

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
  }), []);

  const queueMovementCost = useCallback(({
    running = false,
    walking = false,
    airborne = false,
    falling = 0,
    flush = false,
  } = {}, frameDelta = 0, now = 0) => {
    const frameScale = Math.min(frameDelta, 0.05) * 60;
    const fatigueDelta = ((running ? 0.026 : walking ? 0.008 : 0) + (airborne ? 0.004 : 0)) * frameScale;
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
    const element = gl.domElement;
    const onPointerDown = event => {
      if (event.button !== 0) return;
      dragging.current = true;
      lastPointerX.current = event.clientX;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = event => {
      if (!dragging.current) return;
      yaw.current -= (event.clientX - lastPointerX.current) * CAMERA.rotateSpeed;
      lastPointerX.current = event.clientX;
    };
    const stopDrag = event => {
      dragging.current = false;
      if (event?.pointerId !== undefined) element.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = event => {
      event.preventDefault();
      const normalizedDelta = Math.sign(event.deltaY) * Math.min(1.8, Math.abs(event.deltaY) / 80);
      zoom.current = THREE.MathUtils.clamp(zoom.current + normalizedDelta * 0.9, CAMERA.minZoom, CAMERA.maxZoom);
    };
    element.style.cursor = 'grab';
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', stopDrag);
    element.addEventListener('pointercancel', stopDrag);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', stopDrag);
      element.removeEventListener('pointercancel', stopDrag);
      element.removeEventListener('wheel', onWheel);
      element.style.cursor = '';
      element.style.touchAction = '';
    };
  }, [gl]);

  useEffect(() => {
    spawnDrop.current = { phase: 'pending', zoneId: currentZoneId, landingUntil: 0 };
    velocity.current.set(0, SPAWN_DROP.initialVelocity, 0);
    wasAirborne.current = true;
    stateRef.current.action = null;
    stateRef.current.climbMotion = null;
    stateRef.current.lockMovementUntil = 0;
  }, [currentZoneId]);

  useFrame((_, delta) => {
    if (!group.current || health <= 0) return;
    const keys = getKeys();
    const touch = consumeTouchControls();
    const now = performance.now() / 1000;
    const feedback = bounceFeedback.current;
    const feedbackAge = now - feedback.startedAt;
    const feedbackProgress = THREE.MathUtils.clamp(feedbackAge / BUMP_FEEDBACK.duration, 0, 1);
    const feedbackEase = Math.sin(feedbackProgress * Math.PI);
    if (warningRef.current) {
      const opacity = (1 - feedbackProgress) * feedback.intensity * 0.42;
      warningRef.current.visible = opacity > 0.015;
      warningRef.current.position.set(-feedback.normal.x * 0.28, 0.055, -feedback.normal.z * 0.28);
      warningRef.current.scale.setScalar(0.74 + feedbackProgress * 0.95 + feedback.intensity * 0.28);
      warningRef.current.children.forEach(child => {
        if (child.material) child.material.opacity = opacity;
      });
    }
    if (modelFeedbackRef.current) {
      const lean = feedbackEase * feedback.intensity * 0.105;
      modelFeedbackRef.current.rotation.x = -feedback.normal.z * lean;
      modelFeedbackRef.current.rotation.z = feedback.normal.x * lean;
      modelFeedbackRef.current.position.x = feedback.normal.x * feedbackEase * feedback.intensity * 0.045;
      modelFeedbackRef.current.position.z = feedback.normal.z * feedbackEase * feedback.intensity * 0.045;
    }
    if (physicsDebug) {
      orientDebugVector(debugCollisionRef.current, characterDebug.current.normal, characterDebug.current.normal.length() * 0.85);
      orientDebugVector(debugMovementRef.current, characterDebug.current.movement, Math.min(1.2, characterDebug.current.movement.length() * 18));
    }
    const startOfFramePosition = group.current.position.clone();
    const startAction = (clip, duration = ACTION_DURATION[clip] || 1.2, {
      lockMovement = true,
      recoverAction = null,
      recoverDuration = ACTION_DURATION[recoverAction] || 1.2,
    } = {}) => {
      stateRef.current.action = clip;
      stateRef.current.actionStartedAt = now;
      stateRef.current.actionUntil = now + duration;
      stateRef.current.lockMovementUntil = lockMovement ? now + duration : stateRef.current.lockMovementUntil;
      stateRef.current.recoverAction = recoverAction ? { clip: recoverAction, duration: recoverDuration } : null;
    };
    const triggerAction = (button, clip, duration = ACTION_DURATION[clip] || 1.2, options = {}) => {
      const pressed = Boolean(keys[button] || touch[button]);
      if (pressed && !lastButtons.current[button]) {
        startAction(clip, duration, options);
      }
      lastButtons.current[button] = pressed;
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
        wasAirborne.current = false;
      } else {
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = true;
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
        return;
      }
      spawnDrop.current.phase = 'complete';
    }

    if (stateRef.current.action && now >= stateRef.current.actionUntil) {
      const recovery = stateRef.current.recoverAction;
      stateRef.current.action = null;
      stateRef.current.recoverAction = null;
      if (recovery && health > 0) startAction(recovery.clip, recovery.duration, { lockMovement: true });
    }
    if (stateRef.current.climbMotion) {
      const climb = stateRef.current.climbMotion;
      const progress = THREE.MathUtils.clamp((now - climb.startedAt) / climb.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      const arc = Math.sin(Math.PI * progress) * Math.max(0.28, climb.heightDelta * 0.32);
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
      if (progress >= 1) {
        group.current.position.copy(climb.end);
        characterController.sync(group.current.position);
        stateRef.current.climbMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
      }
      wasAirborne.current = false;
      return;
    }
    const crouchPressed = Boolean(keys.crouch || touch.crouch);
    if (crouchPressed && !lastButtons.current.crouch) {
      stateRef.current.crouching = !stateRef.current.crouching;
      startAction(stateRef.current.crouching ? 'standToCrouch' : 'crouchToStand', 0.8, { lockMovement: true });
    }
    lastButtons.current.crouch = crouchPressed;
    const riflePressed = Boolean(keys.rifle || touch.rifle);
    if (riflePressed && !lastButtons.current.rifle) {
      stateRef.current.aiming = !stateRef.current.aiming;
      if (stateRef.current.aiming) startAction('changeItem', 0.8, { lockMovement: false });
    }
    lastButtons.current.rifle = riflePressed;
    triggerAction('pray', 'pray', 3.0);
    triggerAction('fireRifle', 'fireRifle', 1.2);
    triggerAction('hammer', 'swingHammer', 1.15);
    triggerAction('net', 'swingNet', 1.2);
    triggerAction('gather', 'gather', 2.0);
    triggerAction('write', 'write', 2.7, { lockMovement: true });
    triggerAction('inspect', 'kneelInspect', 2.35, { lockMovement: true });
    triggerAction('lookAround', 'lookAround', 2.1);
    triggerAction('point', 'point', 1.4);
    triggerAction('trip', 'trip', 1.8, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.45 });
    triggerAction('teeter', 'teeter', 1.45, { lockMovement: false });
    if (keys.rotateLeft) yaw.current += CAMERA.keyRotateSpeed * delta;
    if (keys.rotateRight) yaw.current -= CAMERA.keyRotateSpeed * delta;
    const input = new THREE.Vector3(
      (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0),
      0,
      (keys.backward || touch.backward ? 1 : 0) - (keys.forward || touch.forward ? 1 : 0),
    );
    const moving = input.lengthSq() > 0;
    const running = Boolean((keys.run || touch.run) && moving && !stateRef.current.crouching);
    const movementSpeed = stateRef.current.crouching ? PLAYER.walkSpeed * 0.45 : running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const movementLocked = now < stateRef.current.lockMovementUntil || spawnDrop.current.phase !== 'complete';
    const climbPressed = Boolean(keys.climb || touch.climb);
    if (climbPressed && !lastButtons.current.climb && !stateRef.current.crouching && !movementLocked) {
      const target = collisionAdapter.findClimbTarget(group.current.position, facing.current);
      if (target) {
        characterController.sync(group.current.position);
        startAction('climb', ACTION_DURATION.climb, { lockMovement: true });
        stateRef.current.climbMotion = {
          start: group.current.position.clone(),
          end: target.end,
          heightDelta: target.heightDelta,
          duration: ACTION_DURATION.climb * 0.92,
          startedAt: now,
          targetYaw: Math.atan2(target.obstacle.x - group.current.position.x, target.obstacle.z - group.current.position.z),
        };
      } else {
        startAction('teeter', 0.95, { lockMovement: false });
      }
    }
    lastButtons.current.climb = climbPressed;
    if (moving && !previousMotion.current.moving && !stateRef.current.action && !movementLocked) {
      startAction(running ? 'jog' : 'startWalking', running ? 0.5 : ACTION_DURATION.startWalking, { lockMovement: false });
    }
    if (!moving && previousMotion.current.moving && !stateRef.current.action && !movementLocked) {
      startAction(previousMotion.current.running ? 'runToStop' : 'stopWalking', previousMotion.current.running ? ACTION_DURATION.runToStop : ACTION_DURATION.stopWalking, { lockMovement: false });
    }

    if (moving && !movementLocked) {
      input.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
      facing.current.copy(input);
      velocity.current.x = input.x * movementSpeed;
      velocity.current.z = input.z * movementSpeed;
      group.current.rotation.y = Math.atan2(input.x, input.z);
    } else {
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, 10, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, 10, delta);
    }

    const groundInfo = collisionAdapter.groundInfo(group.current.position);
    const groundY = groundInfo.y;
    const grounded = group.current.position.y <= groundY + 0.03;
    if (now - lastPhysicsDebugAt.current > 0.25) {
      lastPhysicsDebugAt.current = now;
      setPhysicsDebug({
        grounded,
        groundSource: groundInfo.source,
        groundY,
        playerY: group.current.position.y,
        obstacleCount: collisionAdapter.obstacles.length,
        spawnPhase: spawnDrop.current.phase,
        controller: characterDebug.current.source,
        controllerHits: characterDebug.current.collisions,
        computedMove: formatVector(characterDebug.current.movement),
      });
    }
    if ((keys.jump || touch.jump) && grounded && !stateRef.current.crouching && !movementLocked) velocity.current.y = PLAYER.jumpVelocity;
    velocity.current.y -= PLAYER.gravity * delta;
    const desiredDelta = velocity.current.clone().multiplyScalar(delta);
    const characterMove = characterController.move(group.current.position, desiredDelta);
    characterDebug.current.movement.copy(characterMove.movement);
    characterDebug.current.collisions = characterMove.collisions;
    characterDebug.current.grounded = characterMove.grounded;
    characterDebug.current.source = characterMove.source;
    characterDebug.current.normal.copy(characterMove.collision?.normal || new THREE.Vector3());
    group.current.position.add(characterMove.movement);
    let collision = characterMove.collision
      ? {
          normal: characterMove.collision.normal,
          penetration: Math.max(0.02, desiredDelta.length() - characterMove.movement.length()),
          source: characterMove.source,
        }
      : null;

    if (!characterController.ready()) {
      const fallbackCollision = collisionAdapter.resolveCollision(group.current.position, startOfFramePosition);
      if (fallbackCollision) {
        group.current.position.copy(fallbackCollision.position).addScaledVector(fallbackCollision.normal, 0.035);
        collision = fallbackCollision;
      }
    }

    if (collision) {
      const normal = collision.normal.clone().normalize();
      characterDebug.current.normal.copy(normal);
      const horizontalVelocity = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = horizontalVelocity.length();
      const intoSurface = impactSpeed > 0.001
        ? Math.max(0, -horizontalVelocity.clone().normalize().dot(normal))
        : 0;
      const normalVelocity = horizontalVelocity.dot(normal);
      const tangentVelocity = horizontalVelocity.clone().addScaledVector(normal, -normalVelocity);

      if (normalVelocity < 0) {
        velocity.current.x = tangentVelocity.x * 0.88;
        velocity.current.z = tangentVelocity.z * 0.88;
      }

      const directImpact = impactSpeed >= BUMP_FEEDBACK.minSpeed && intoSurface >= BUMP_FEEDBACK.minHeadOn;
      const canReact = now - bounceFeedback.current.lastImpactAt >= BUMP_FEEDBACK.cooldown;
      if (directImpact && canReact) {
        const intensity = THREE.MathUtils.clamp(
          0.22 + impactSpeed / 8.5 + collision.penetration * 0.12 + intoSurface * 0.24,
          0.26,
          0.86,
        );
        velocity.current.x += normal.x * intensity * 0.72;
        velocity.current.z += normal.z * intensity * 0.72;
        bounceFeedback.current = {
          startedAt: now,
          lastImpactAt: now,
          intensity,
          normal,
        };
        if (!stateRef.current.action && impactSpeed > 4.8) {
          startAction('stopWalking', 0.34, { lockMovement: false });
        }
      }
    }

    const nextGroundInfo = collisionAdapter.groundInfo(group.current.position);
    const nextGroundY = nextGroundInfo.y;
    const landed = characterMove.grounded || group.current.position.y < nextGroundY;
    if (landed) {
      const falling = wasAirborne.current ? Math.abs(velocity.current.y) : 0;
      if (group.current.position.y < nextGroundY) {
        group.current.position.y = nextGroundY;
        characterController.sync(group.current.position);
      }
      velocity.current.y = 0;
      if (falling > 9.5 && !stateRef.current.action) startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      else if (falling > 3.2 && !stateRef.current.action) startAction('landing', ACTION_DURATION.landing, { lockMovement: false });
      if (moving || running || falling > 0.5) {
        queueMovementCost({ running, walking: moving && !running, airborne: false, falling, flush: falling > 0.5 }, delta, now);
      }
    } else if (moving || !grounded) {
      queueMovementCost({ running, walking: moving && !running, airborne: !grounded, falling: 0 }, delta, now);
    }
    wasAirborne.current = !landed && !grounded && !characterMove.grounded;
    const edgeRisk = collisionAdapter.edgeRisk(group.current.position, facing.current);
    if (edgeRisk && edgeRisk.intensity > 0.52 && moving && now - lastTeeterAt.current > 3.4 && !stateRef.current.action) {
      lastTeeterAt.current = now;
      startAction('teeter', 1.0, { lockMovement: false });
      velocity.current.x -= edgeRisk.direction.x * 0.9;
      velocity.current.z -= edgeRisk.direction.z * 0.9;
    }

    const p = group.current.position;
    const previous = p.clone().addScaledVector(velocity.current, -delta);
    const clamped = collisionAdapter.clampToWalkable(p, previous);
    if (!clamped.equals(p)) {
      p.copy(clamped);
      characterController.sync(p);
      velocity.current.x = 0;
      velocity.current.z = 0;
    }

    let nearest = null;
    let nearestDistance = 4.4;
    const collected = useThreeGameStore.getState().collectedSpecimenIds;
    for (const specimen of zoneSpecimens) {
      if (collected.includes(specimen.id)) continue;
      const [x, , z] = specimen.spawnPoint;
      const distance = Math.hypot(p.x - x, p.z - z);
      if (distance < nearestDistance) {
        nearest = specimen.id;
        nearestDistance = distance;
      }
    }
    if (useThreeGameStore.getState().nearbySpecimenId !== nearest) {
      setNearbySpecimen(nearest);
    }

    if ((keys.interact || touch.interact) && !lastInteract.current) {
      const currentState = useThreeGameStore.getState();
      const specimenId = currentState.nearbySpecimenId || currentState.selectedSpecimenId;
      if (specimenId && !currentState.collectedSpecimenIds.includes(specimenId) && !stateRef.current.action) {
        const animation = collectionAnimationForTool(currentState.activeToolId);
        startAction(animation.clip, animation.duration, { lockMovement: animation.lockMovement });
      }
      collectNearby();
    }
    if (keys.camera && !lastCamera.current) cycleViewMode();
    for (let index = 0; index < 6; index += 1) {
      if (keys[`tool${index + 1}`] && threeTools[index]) {
        setActiveTool(threeTools[index].id);
      }
    }
    lastInteract.current = keys.interact || touch.interact;
    lastCamera.current = keys.camera;

    const offset = cameraTargets[viewMode] || cameraTargets.shoulder;
    const desired = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current).add(p);
    if (viewMode === 'first') {
      desired.copy(p).add(new THREE.Vector3(0, 1.7, 0));
      camera.position.lerp(desired, 0.28);
      camera.rotation.set(0, yaw.current, 0);
    } else if (viewMode === 'top') {
      const top = p.clone().add(new THREE.Vector3(0, THREE.MathUtils.clamp(zoom.current * 3.4, 9, 42), 0.1));
      camera.position.lerp(top, 0.12);
      camera.lookAt(p.x, p.y, p.z);
    } else {
      const cameraForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
      const cameraDistance = zoom.current;
      const height = THREE.MathUtils.lerp(2.15, 4.7, THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom));
      const side = THREE.MathUtils.lerp(1.0, 2.4, THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom));
      const shoulder = p.clone()
        .add(cameraForward.clone().multiplyScalar(-cameraDistance))
        .add(new THREE.Vector3(side, height, 0));
      camera.position.lerp(shoulder, 0.14);
      const lookAhead = cameraForward.clone().multiplyScalar(Math.min(6.4, 2.2 + cameraDistance * 0.25));
      camera.lookAt(p.x + lookAhead.x, p.y + 1.16, p.z + lookAhead.z);
    }

    stateRef.current.running = running;
    stateRef.current.walking = moving && !running;
    stateRef.current.airborne = wasAirborne.current;
    stateRef.current.strafeLeft = Boolean((keys.left || touch.left) && !(keys.forward || keys.backward || touch.forward || touch.backward));
    stateRef.current.strafeRight = Boolean((keys.right || touch.right) && !(keys.forward || keys.backward || touch.forward || touch.backward));
    previousMotion.current.moving = moving;
    previousMotion.current.running = running;
  });

  return (
    <group ref={group} position={[startX, collisionAdapter.spawnY(startX, startZ) + SPAWN_DROP.height, startZ]} rotation={[0, Math.PI, 0]}>
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
      <group ref={modelFeedbackRef}>
        <NaturalistModel motionRef={stateRef} health={health} fatigue={fatigue} />
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
        </group>
      )}
    </group>
  );
}
