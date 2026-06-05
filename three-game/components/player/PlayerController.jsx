'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { threeSpecimens, threeTools } from '../../data';
import { consumeTouchControls } from '../../input/touchControls';
import { clampToWalkable, getTerrainEdgeRisk, TERRAIN_BOUNDS, terrainHeight } from '../../world/terrain';
import { findClimbTarget, getObstacleEdgeRisk, getObstacleSupportHeight, resolveObstacleCollision } from '../../world/obstacles';
import { getZone } from '../../world/floreanaZones';
import { ModelAsset } from '../assets/ModelAsset';

const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.1,
  jumpVelocity: 6.8,
  gravity: 15.5,
  bounds: TERRAIN_BOUNDS,
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

export function PlayerController() {
  const group = useRef(null);
  const warningRef = useRef(null);
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
  const bounceFeedback = useRef({ startedAt: -10, intensity: 0 });
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
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const applyMovementCost = useThreeGameStore(state => state.applyMovementCost);
  const setNearbySpecimen = useThreeGameStore(state => state.setNearbySpecimen);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);

  const cameraTargets = useMemo(() => ({
    shoulder: new THREE.Vector3(1.05, 2.35, 3.75),
    first: new THREE.Vector3(0, 1.72, 0.16),
    top: new THREE.Vector3(0, 20, 0.1),
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

  useFrame((_, delta) => {
    if (!group.current || health <= 0) return;
    const keys = getKeys();
    const touch = consumeTouchControls();
    const now = performance.now() / 1000;
    if (warningRef.current) {
      const feedbackAge = now - bounceFeedback.current.startedAt;
      const feedbackProgress = THREE.MathUtils.clamp(feedbackAge / 0.72, 0, 1);
      const opacity = (1 - feedbackProgress) * bounceFeedback.current.intensity;
      warningRef.current.visible = opacity > 0.015;
      warningRef.current.position.y = 2.35 + feedbackProgress * 0.42;
      warningRef.current.scale.setScalar(0.72 + bounceFeedback.current.intensity * 0.42 + Math.sin(feedbackProgress * Math.PI) * 0.22);
      warningRef.current.quaternion.copy(camera.quaternion);
      warningRef.current.children.forEach(child => {
        if (child.material) child.material.opacity = opacity;
      });
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
      velocity.current.set(0, 0, 0);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, climb.targetYaw, 10, delta);
      stateRef.current.running = false;
      stateRef.current.walking = false;
      stateRef.current.airborne = false;
      stateRef.current.strafeLeft = false;
      stateRef.current.strafeRight = false;
      if (progress >= 1) {
        group.current.position.copy(climb.end);
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
    const movementLocked = now < stateRef.current.lockMovementUntil;
    const climbPressed = Boolean(keys.climb || touch.climb);
    if (climbPressed && !lastButtons.current.climb && !stateRef.current.crouching && !movementLocked) {
      const target = findClimbTarget(group.current.position, facing.current);
      if (target) {
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

    const obstacleGroundY = getObstacleSupportHeight(group.current.position.x, group.current.position.z, group.current.position.y);
    const groundY = Math.max(terrainHeight(group.current.position.x, group.current.position.z) + 0.04, (obstacleGroundY ?? -Infinity) + 0.04);
    const grounded = group.current.position.y <= groundY + 0.03;
    if ((keys.jump || touch.jump) && grounded && !stateRef.current.crouching && !movementLocked) velocity.current.y = PLAYER.jumpVelocity;
    velocity.current.y -= PLAYER.gravity * delta;
    group.current.position.addScaledVector(velocity.current, delta);
    const collision = resolveObstacleCollision(group.current.position, startOfFramePosition);
    if (collision) {
      const impactSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const intensity = THREE.MathUtils.clamp(0.22 + impactSpeed / 7.5 + collision.penetration * 0.18, 0.28, 1);
      const shove = 0.26 + intensity * 1.05;
      group.current.position.copy(collision.position).addScaledVector(collision.normal, shove);
      velocity.current.x = collision.normal.x * (1.15 + intensity * 3.6);
      velocity.current.z = collision.normal.z * (1.15 + intensity * 3.6);
      bounceFeedback.current = { startedAt: now, intensity };
      if (stateRef.current.action === 'hitReaction' || stateRef.current.action === 'bigHitFall') {
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
        stateRef.current.recoverAction = null;
      }
    }

    const nextObstacleGroundY = getObstacleSupportHeight(group.current.position.x, group.current.position.z, group.current.position.y);
    const nextGroundY = Math.max(terrainHeight(group.current.position.x, group.current.position.z) + 0.04, (nextObstacleGroundY ?? -Infinity) + 0.04);
    const landed = group.current.position.y < nextGroundY;
    if (landed) {
      const falling = wasAirborne.current ? Math.abs(velocity.current.y) : 0;
      group.current.position.y = nextGroundY;
      velocity.current.y = 0;
      if (falling > 9.5 && !stateRef.current.action) startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      else if (falling > 3.2 && !stateRef.current.action) startAction('landing', ACTION_DURATION.landing, { lockMovement: false });
      if (moving || running || falling > 0.5) {
        queueMovementCost({ running, walking: moving && !running, airborne: false, falling, flush: falling > 0.5 }, delta, now);
      }
    } else if (moving || !grounded) {
      queueMovementCost({ running, walking: moving && !running, airborne: !grounded, falling: 0 }, delta, now);
    }
    wasAirborne.current = !landed && !grounded;
    const edgeRisk = getObstacleEdgeRisk(group.current.position.x, group.current.position.z, group.current.position.y)
      || getTerrainEdgeRisk(group.current.position.x, group.current.position.z, facing.current);
    if (edgeRisk && edgeRisk.intensity > 0.52 && moving && now - lastTeeterAt.current > 3.4 && !stateRef.current.action) {
      lastTeeterAt.current = now;
      startAction('teeter', 1.0, { lockMovement: false });
      velocity.current.x -= edgeRisk.direction.x * 0.9;
      velocity.current.z -= edgeRisk.direction.z * 0.9;
    }

    const p = group.current.position;
    const previous = p.clone().addScaledVector(velocity.current, -delta);
    const clamped = clampToWalkable(p, previous);
    if (!clamped.equals(p)) {
      p.copy(clamped);
      velocity.current.x = 0;
      velocity.current.z = 0;
    }

    let nearest = null;
    let nearestDistance = 4.4;
    const collected = useThreeGameStore.getState().collectedSpecimenIds;
    for (const specimen of threeSpecimens) {
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

  const [startX, , startZ] = getZone().playerStart || [0, 0, 7.5];
  return (
    <group ref={group} position={[startX, terrainHeight(startX, startZ) + 0.04, startZ]} rotation={[0, Math.PI, 0]}>
      <NaturalistModel motionRef={stateRef} health={health} fatigue={fatigue} />
      <group ref={warningRef} visible={false} position={[0, 2.35, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshBasicMaterial color="#ff3b30" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, -0.11, 0]} scale={[0.58, 1.35, 0.58]}>
          <boxGeometry args={[0.11, 0.32, 0.11]} />
          <meshBasicMaterial color="#ff3b30" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
