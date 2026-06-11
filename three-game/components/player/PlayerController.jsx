'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { getThreeSpecimens, threeTools } from '../../data';
import { consumeTouchControls, triggerToolUse } from '../../input/touchControls';
import { isGameplayInputBlocked } from '../../input/typingMode';
import { getRegionTerrainConfig, regionSpawnPoint, terrainBiomeAt, TERRAIN_BOUNDS } from '../../world/terrain';
import { getZone } from '../../world/floreanaZones';
import { getPostOfficeBayOpuntiaHazards } from '../../world/floreanaCoveLayout';
import { createCollisionAdapter } from '../../physics/collisionAdapter';
import { emitPropEvent } from '../../physics/props/propEvents';
import { WATER_LEVEL, WADE_DEPTH } from '../../world/water';
import { EDGE_DIRECTIONS, getRegionEdgeHints } from '../../../game-core/regionMaps';
import {
  CHARACTER_CONTROLLER_CONFIG,
  useKinematicCharacterController,
} from '../../physics/useKinematicCharacterController';
import { ModelAsset } from '../assets/ModelAsset';

// Stand-in for getKeys() while a HUD text input has focus: every control
// reads as released, so typing never drives the character.
const EMPTY_KEYS = {};

const PLAYER = {
  walkSpeed: 4.45,
  runSpeed: 7.45,
  jumpVelocity: 6.8,
  gravity: 10.8,
  groundAcceleration: 24,
  groundDeceleration: 22,
  airAcceleration: 6.2,
  airDeceleration: 2.4,
  turnDamping: 15,
  coyoteTime: 0.16,
  runningJumpVerticalBonus: 0.65,
  fallGravityMultiplier: 1.18,
  jumpReleaseGravityMultiplier: 1.85,
  groundContactEpsilon: 0.11,
  groundSnapDistance: 0.62,
  uphillSpeedPenalty: 0.14,
  downhillSpeedBoost: 0.05,
  tiredRunFatigue: 68,
  exhaustedRunFatigue: 92,
  bounds: TERRAIN_BOUNDS,
};

const SPAWN_DROP = {
  height: 0,
  initialVelocity: -1.2,
  maxFallSpeed: -16,
  landingLock: 0,
};

const BUMP_FEEDBACK = {
  duration: 0.24,
  cooldown: 0.48,
  minSpeed: 3.4,
  minHeadOn: 0.68,
};

const CACTUS_HAZARD = {
  cooldown: 1.15,
  shove: 3.8,
  minSpeed: 0.35,
};

const LANDING_DUST = {
  duration: 0.82,
  particles: 14,
};

const CAMERA = {
  minZoom: 2.8,
  maxZoom: 22,
  defaultZoom: 5.7,
  rotateSpeed: 0.0042,
  pitchSpeed: 0.005,
  minPitch: -0.45,   // look up from near water level
  maxPitch: 1.45,    // look down from nearly overhead
  defaultPitch: 0.3, // gentle downward tilt, matching the old shoulder framing
  panSpeed: 0.0017,
  maxPan: 7,
  keyRotateSpeed: 2.2,
};

const ACTION_DURATION = {
  pray: 2.8,
  fireRifle: 1.25,
  swingHammer: 1.15,
  swingNet: 1.6,
  gather: 3.2,
  pickUp: 1.35,
  lookAround: 2.1,
  lookAroundShort: 1.45,
  point: 1.4,
  trip: 1.8,
  hitReaction: 1.15,
  bigHitFall: 2.25,
  shoulderHitAndFall: 2.35,
  changeItem: 1.0,
  write: 3.8,
  kneelInspect: 3.0,
  standingInspectDownward: 2.4,
  climb: 2.15,
  sprintToWallClimb: 1.25,
  climbingUpWall: 1.55,
  scramble: 0.58,
  teeter: 1.45,
  startWalking: 0.42,
  stopWalking: 0.38,
  runToStop: 0.83,
  standingJump: 1.1,
  runningJump: 0.82,
  turnLeft90: 0.48,
  turnRight90: 0.48,
  fallingToLanding: 0.55,
  landing: 1.0,
  runningLanding: 0.9,
  hardLanding: 1.8,
  bigJumpDown: 1.35,
  fallingToRoll: 1.5,
  dodgeRoll: 0.95,
  gettingUp: 1.65,
  fallingForwardDeath: 2.4,
  jumpTakeoff: 0.42,
};

const MOVEMENT_INTERRUPTIBLE_ACTIONS = new Set([
  'startWalking',
  'lookAroundShort',
  'stopWalking',
  'runToStop',
  'landing',
  'runningLanding',
  'teeter',
]);

const CONTROL_INTERRUPTIBLE_ACTIONS = new Set([
  ...MOVEMENT_INTERRUPTIBLE_ACTIONS,
  'startWalking',
]);

function easeInOutCubic(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function playerControllerDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return window.__enablePlayerControllerDebug === true
    || new URLSearchParams(window.location.search).has('playerControllerDebug')
    || new URLSearchParams(window.location.search).has('modelBoundsDebug');
}

function dampAngle(current, target, lambda, delta) {
  const deltaAngle = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}

function oppositeEdge(edge) {
  return EDGE_DIRECTIONS[edge]?.opposite || null;
}

function nearestRegionEdgePrompt(regionId, position, facing) {
  const config = getRegionTerrainConfig(regionId);
  const threshold = 5.2;
  const hints = getRegionEdgeHints(regionId);
  const distances = {
    east: config.width / 2 - position.x,
    west: position.x + config.width / 2,
    south: config.depth / 2 - position.z,
    north: position.z + config.depth / 2,
  };
  const candidates = [];
  for (const hint of hints) {
    const edge = hint.edge;
    if (edge.includes('north') && distances.north > threshold) continue;
    if (edge.includes('south') && distances.south > threshold) continue;
    if (edge.includes('east') && distances.east > threshold) continue;
    if (edge.includes('west') && distances.west > threshold) continue;
    const edgeDirection = EDGE_DIRECTIONS[edge];
    if (!edgeDirection) continue;
    const direction = new THREE.Vector3(edgeDirection.dx, 0, edgeDirection.dy).normalize();
    const facingWeight = facing?.lengthSq?.() > 0.001 ? direction.dot(facing.clone().normalize()) : 0;
    if (facingWeight < -0.15) continue;
    const distance = Math.min(
      edge.includes('north') ? distances.north : Infinity,
      edge.includes('south') ? distances.south : Infinity,
      edge.includes('east') ? distances.east : Infinity,
      edge.includes('west') ? distances.west : Infinity,
    );
    candidates.push({ ...hint, distance, facingWeight });
  }
  candidates.sort((a, b) => (a.distance - b.distance) || (b.facingWeight - a.facingWeight));
  return candidates[0] || null;
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

function NaturalistModel({ motionRef, health, fatigue, inventoryCount }) {
  const [damageFlash, setDamageFlash] = useState(0);
  const previousHealth = useRef(health);
  const damageFlashRef = useRef({ startedAt: -10, duration: 0.58 });
  const statusRef = useRef({ health, fatigue, inventoryCount });
  useEffect(() => {
    if (health < previousHealth.current - 0.01) {
      damageFlashRef.current = { startedAt: null, duration: 0.58 };
      setDamageFlash(1);
    }
    previousHealth.current = health;
    statusRef.current.health = health;
    statusRef.current.fatigue = fatigue;
    statusRef.current.inventoryCount = inventoryCount;
  }, [health, fatigue, inventoryCount]);

  useFrame(({ clock }) => {
    if (damageFlashRef.current.startedAt === null) {
      damageFlashRef.current.startedAt = clock.elapsedTime;
    }
    const elapsed = clock.elapsedTime - damageFlashRef.current.startedAt;
    if (elapsed < 0 || elapsed > damageFlashRef.current.duration) {
      if (damageFlash !== 0) setDamageFlash(0);
      return;
    }
    const t = THREE.MathUtils.clamp(elapsed / damageFlashRef.current.duration, 0, 1);
    const next = Math.pow(1 - t, 1.75);
    if (Math.abs(next - damageFlash) > 0.025) setDamageFlash(next);
  });

  const selectAnimation = useCallback(() => {
    const status = statusRef.current;
    const speed = motionRef.current.speed || 0;
    const walkScale = THREE.MathUtils.clamp(speed / PLAYER.walkSpeed, 0.72, 1.24);
    const runScale = THREE.MathUtils.clamp(speed / PLAYER.runSpeed, 0.78, 1.28);
    const tiredRunScale = THREE.MathUtils.clamp(speed / Math.max(PLAYER.walkSpeed, PLAYER.runSpeed * 0.74), 0.72, 1.18);
    if (status.health <= 0) return 'fallingForwardDeath';
    if (motionRef.current.action) return motionRef.current.action;
    const injured = status.health < 45;
    const badlyInjured = status.health < 30;
    if (motionRef.current.jumpCharging) return { clip: 'crouchIdle', fade: 0.08, timeScale: 0.72 };
    const jumpPhase = motionRef.current.jumpPhase;
    const activePlayerJump = jumpPhase === 'takeoff' || jumpPhase === 'airborne' || jumpPhase === 'prelanding';
    const nearGround = Math.abs(motionRef.current.groundDistance ?? Infinity) <= PLAYER.groundSnapDistance * 1.15;
    if (motionRef.current.airborne && activePlayerJump) {
      const charge = THREE.MathUtils.clamp(motionRef.current.jumpChargeAmount || 0, 0, 1);
      const standingJumpScale = THREE.MathUtils.lerp(1.0, 0.76, charge);
      const runningJumpScale = THREE.MathUtils.lerp(0.95, 0.72, charge);
      if (jumpPhase === 'takeoff') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        return motionRef.current.jumpWasRunning
          ? { clip: 'runningJump', fade: 0.05, timeScale: runningJumpScale }
          : { clip: 'standingJump', fade: 0.05, timeScale: standingJumpScale };
      }
      if (jumpPhase === 'airborne' || jumpPhase === 'prelanding') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        return motionRef.current.jumpWasRunning
          ? { clip: 'runningJumpHold', fade: 0.05 }
          : { clip: 'standingJumpHold', fade: 0.05 };
      }
      return motionRef.current.jumpWasRunning
        ? { clip: 'runningJumpHold', fade: 0.05 }
        : { clip: 'standingJumpHold', fade: 0.05 };
    }
    if (motionRef.current.airborne && !nearGround) return { clip: 'fallingIdle', fade: 0.1 };
    if (motionRef.current.aiming && motionRef.current.crouching) return 'crouchRifle';
    if (motionRef.current.aiming && motionRef.current.strafeLeft) return { clip: 'walkStrafeLeft', timeScale: walkScale };
    if (motionRef.current.aiming && motionRef.current.strafeRight) return { clip: 'walkStrafeRight', timeScale: walkScale };
    if (motionRef.current.aiming && motionRef.current.walking) return 'walkRifle';
    if (motionRef.current.aiming) return 'aim';
    if (motionRef.current.crouching && motionRef.current.strafeLeft) return { clip: 'crouchSneakLeft', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.strafeRight) return { clip: 'crouchSneakRight', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.walking) return { clip: 'crouchWalk', timeScale: Math.max(0.7, walkScale * 0.85) };
    if (motionRef.current.crouching) return 'crouchIdle';
    if (badlyInjured && motionRef.current.running) return { clip: 'injuredRun', timeScale: Math.max(0.7, tiredRunScale * 0.92) };
    if (injured && motionRef.current.walking) return { clip: 'injuredWalk', timeScale: Math.max(0.62, walkScale * 0.88) };
    if (motionRef.current.running) {
      if (motionRef.current.tiredRun || status.fatigue >= PLAYER.tiredRunFatigue) return { clip: 'jog', timeScale: tiredRunScale };
      return { clip: 'run', timeScale: runScale };
    }
    if (motionRef.current.walking) {
      const carryingObject = Boolean(useThreeGameStore.getState().carriedObjectId);
      if (carryingObject || status.inventoryCount > 0) return { clip: 'walkCarry', timeScale: Math.max(0.68, walkScale * 0.92) };
      return { clip: 'walk', timeScale: walkScale };
    }
    if (badlyInjured) return status.fatigue >= 82 ? 'injuredStumbleIdle' : 'injuredHurtingIdle';
    if (injured) return 'injuredIdle';
    if (status.fatigue >= 82) return 'exhaustedIdle';
    return 'idle';
  }, [motionRef]);
  return <ModelAsset id="darwin" animationSelector={selectAnimation} damageFlash={damageFlash} fallback={<ProceduralNaturalistModel motionRef={motionRef} />} />;
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

function findPushableObstacleNear(obstacles, position, horizontalVelocity, collisionNormal = null) {
  if (!obstacles?.length || horizontalVelocity.lengthSq() < 0.01) return null;
  const travel = horizontalVelocity.clone().normalize();
  let best = null;
  for (const obstacle of obstacles) {
    if (!obstacle.pushable) continue;
    const toObstacle = new THREE.Vector3(obstacle.x - position.x, 0, obstacle.z - position.z);
    const distance = toObstacle.length();
    if (distance > obstacle.radius + 0.86) continue;
    const direction = distance > 0.001 ? toObstacle.clone().divideScalar(distance) : travel.clone();
    const travelDot = travel.dot(direction);
    const normalDot = collisionNormal?.lengthSq?.() > 0.001 ? Math.max(0, -travel.dot(collisionNormal.clone().normalize())) : 0;
    const score = travelDot + normalDot * 0.5 - distance * 0.12;
    if (travelDot < 0.16 && normalDot < 0.18) continue;
    if (!best || score > best.score) best = { obstacle, score };
  }
  return best?.obstacle || null;
}

function findCactusHazardContact(position, playerRadius = 0.42) {
  let best = null;
  for (const cactus of getPostOfficeBayOpuntiaHazards()) {
    const dx = position.x - cactus.x;
    const dz = position.z - cactus.z;
    const distance = Math.hypot(dx, dz);
    const radius = cactus.hazardRadius + playerRadius;
    if (distance > radius) continue;
    const normal = distance > 0.001
      ? new THREE.Vector3(dx / distance, 0, dz / distance)
      : new THREE.Vector3(0, 0, 1);
    const penetration = radius - distance;
    if (!best || penetration > best.penetration) {
      best = { cactus, normal, penetration, distance };
    }
  }
  return best;
}

function LandingDust({ triggerRef }) {
  const ringRef = useRef(null);
  const particleRefs = useRef([]);
  const burst = useRef({
    startedAt: -10,
    intensity: 0,
    origin: new THREE.Vector3(),
    seed: 1,
    active: false,
  });
  const particles = useMemo(() => Array.from({ length: LANDING_DUST.particles }, (_, index) => ({
    index,
    angle: index * (Math.PI * 2 / LANDING_DUST.particles),
    speed: 0.55 + ((index * 37) % 11) / 10 * 0.42,
    lift: 0.035 + ((index * 19) % 7) / 100,
    size: 0.075 + ((index * 13) % 5) / 100,
  })), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d6bf8a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }), []);
  const particleMaterials = useMemo(() => particles.map((_, index) => new THREE.MeshBasicMaterial({
    color: index % 4 === 0 ? '#e0c993' : '#c7ad78',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [particles]);

  useEffect(() => () => {
    ringMaterial.dispose();
    particleMaterials.forEach(material => material.dispose());
  }, [particleMaterials, ringMaterial]);

  useEffect(() => {
    triggerRef.current = ({ intensity = 0.45, position = null } = {}) => {
      burst.current.startedAt = performance.now() / 1000;
      burst.current.intensity = THREE.MathUtils.clamp(intensity, 0.18, 1);
      burst.current.origin.copy(position || new THREE.Vector3());
      burst.current.seed += 1;
      burst.current.active = true;
      if (ringRef.current) ringRef.current.visible = true;
      particleRefs.current.forEach(mesh => {
        if (mesh) mesh.visible = true;
      });
    };
    return () => {
      if (triggerRef.current) triggerRef.current = null;
    };
  }, [triggerRef]);

  useFrame((_, delta) => {
    const state = burst.current;
    if (!state.active) return;
    const age = performance.now() / 1000 - state.startedAt;
    const progress = THREE.MathUtils.clamp(age / LANDING_DUST.duration, 0, 1);
    const fade = Math.pow(1 - progress, 1.55) * state.intensity;
    const spread = 0.42 + progress * (0.88 + state.intensity * 0.72);

    if (ringRef.current) {
      ringRef.current.position.copy(state.origin);
      ringRef.current.scale.setScalar(spread);
      ringRef.current.rotation.z += delta * 0.42;
      ringRef.current.material.opacity = fade * 0.3;
    }

    particles.forEach(item => {
      const mesh = particleRefs.current[item.index];
      if (!mesh) return;
      const wobble = Math.sin(state.seed * 1.73 + item.index * 2.1) * 0.26;
      const angle = item.angle + wobble;
      const distance = progress * item.speed * (0.72 + state.intensity * 0.58);
      mesh.position.set(
        state.origin.x + Math.cos(angle) * distance,
        state.origin.y + 0.035 + Math.sin(progress * Math.PI) * item.lift * (1 + state.intensity),
        state.origin.z + Math.sin(angle) * distance,
      );
      mesh.rotation.z += delta * (0.9 + item.index * 0.02);
      mesh.scale.setScalar(item.size * (0.75 + state.intensity * 0.7) * (1 + progress * 1.5));
      mesh.material.opacity = fade * (0.2 + (item.index % 3) * 0.035);
    });

    if (progress >= 1) {
      state.active = false;
      if (ringRef.current) {
        ringRef.current.visible = false;
        ringRef.current.material.opacity = 0;
      }
      particleRefs.current.forEach(mesh => {
        if (!mesh) return;
        mesh.visible = false;
        mesh.material.opacity = 0;
      });
    }
  });

  return (
    <group position={[0, 0.065, 0]}>
      <mesh ref={ringRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={ringMaterial} renderOrder={4}>
        <ringGeometry args={[0.42, 0.72, 40]} />
      </mesh>
      {particles.map(item => (
        <mesh
          key={item.index}
          ref={mesh => { particleRefs.current[item.index] = mesh; }}
          visible={false}
          rotation={[-Math.PI / 2, 0, item.angle]}
          material={particleMaterials[item.index]}
          renderOrder={5}
        >
          <circleGeometry args={[1, 10]} />
        </mesh>
      ))}
    </group>
  );
}

export function PlayerController({ physicsDebug = false }) {
  const group = useRef(null);
  const warningRef = useRef(null);
  const contactShadowRef = useRef(null);
  const landingDustTriggerRef = useRef(null);
  const footstepDustTriggerRef = useRef(null);
  const collisionDustTriggerRef = useRef(null);
  const modelFeedbackRef = useRef(null);
  const debugCollisionRef = useRef(null);
  const debugMovementRef = useRef(null);
  const characterBodyRef = useRef(null);
  const characterColliderRef = useRef(null);
  const velocity = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(CAMERA.defaultPitch);
  const zoom = useRef(CAMERA.defaultZoom);
  const dragging = useRef(false);
  const panning = useRef(false);
  const panOffset = useRef(new THREE.Vector3());
  const lastPointerX = useRef(0);
  const lastPointerY = useRef(0);
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
  const lastGroundedAt = useRef(-10);
  const jumpBufferedUntil = useRef(-10);
  const touchJumpHoldUntil = useRef(-10);
  const lastInteract = useRef(false);
  const lastCamera = useRef(false);
  const lastButtons = useRef({});
  const footstepDust = useRef({ phase: 0, side: -1 });
  // How deep the player's feet are below the sea surface (0 on dry land).
  const wadeDepth = useRef(0);
  // Accumulates drowning damage so the store isn't hit every frame.
  const drownDamage = useRef(0);
  const cameraImpulse = useRef({ startedAt: -10, intensity: 0, duration: 0.34, seed: 1 });
  const lastTeeterAt = useRef(0);
  const lastCactusHitAt = useRef(-10);
  const lastPhysicsDebugAt = useRef(0);
  const lastModelYaw = useRef(Math.PI);
  const cameraFollowY = useRef(null);
  // Smoothed look-at point for the diegetic status view; non-null while the
  // hero shot is active or still easing back out.
  const statusLook = useRef(null);
  const idleFidget = useRef({ idleSince: 0, nextAt: 0, count: 0 });
  const terrainFeedback = useRef({ grade: 0, uphillDot: 0, downhillDot: 0 });
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
    groundDistance: 0,
    verticalSpeed: 0,
    tiredRun: false,
  });
  const [, getKeys] = useKeyboardControls();
  const { camera, gl } = useThree();
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
  const characterController = useKinematicCharacterController(rapierContext, characterBodyRef, characterColliderRef);
  const spawnPoint = useMemo(() => regionSpawnPoint(currentZoneId, playerSpawnId), [currentZoneId, playerSpawnId]);
  const startX = spawnPoint.x;
  const startZ = spawnPoint.z;

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
      // Left button orbits; middle button (or Shift+left) pans.
      if (event.button !== 0 && event.button !== 1) return;
      dragging.current = true;
      panning.current = event.button === 1 || event.shiftKey;
      lastPointerX.current = event.clientX;
      lastPointerY.current = event.clientY;
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = event => {
      if (!dragging.current) return;
      const dx = event.clientX - lastPointerX.current;
      const dy = event.clientY - lastPointerY.current;
      lastPointerX.current = event.clientX;
      lastPointerY.current = event.clientY;
      if (panning.current || event.shiftKey) {
        // Slide the look target in the camera's screen plane (clamped).
        const dist = THREE.MathUtils.clamp(zoom.current, 4, 14);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
        panOffset.current
          .add(right.multiplyScalar(-dx * CAMERA.panSpeed * dist))
          .add(new THREE.Vector3(0, dy * CAMERA.panSpeed * dist, 0));
        if (panOffset.current.length() > CAMERA.maxPan) panOffset.current.setLength(CAMERA.maxPan);
      } else {
        // Full free rotation: yaw horizontally, pitch vertically (clamped).
        yaw.current -= dx * CAMERA.rotateSpeed;
        pitch.current = THREE.MathUtils.clamp(pitch.current - dy * CAMERA.pitchSpeed, CAMERA.minPitch, CAMERA.maxPitch);
      }
    };
    const stopDrag = event => {
      dragging.current = false;
      panning.current = false;
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
    const cancelPendingJumpCharge = () => {
      if (!jumpCharge.current.active) return;
      jumpCharge.current = { active: false, startedAt: 0, wasRunning: false, amount: 0 };
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
    stateRef.current.jumpCharging = false;
    stateRef.current.jumpChargeAmount = 0;
    lastGroundedAt.current = performance.now() / 1000;
    cameraFollowY.current = groundY;
    jumpBufferedUntil.current = -10;
    touchJumpHoldUntil.current = -10;
    lastModelYaw.current = Math.PI;
    footstepDust.current = { phase: 0, side: -1 };
    idleFidget.current = { idleSince: 0, nextAt: 0, count: 0 };
  }, [currentZoneId, playerSpawnId, spawnPoint.y, startX, startZ]);

  useFrame((_, delta) => {
    if (!group.current || health <= 0) return;
    const keys = isGameplayInputBlocked() ? EMPTY_KEYS : getKeys();
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
      const horizontalVelocity = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
      const speedRatio = THREE.MathUtils.clamp(horizontalVelocity.length() / PLAYER.runSpeed, 0, 1);
      const localVelocity = horizontalVelocity.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.current.rotation.y);
      const yawDelta = Math.atan2(
        Math.sin(group.current.rotation.y - lastModelYaw.current),
        Math.cos(group.current.rotation.y - lastModelYaw.current),
      );
      lastModelYaw.current = group.current.rotation.y;
      const slope = terrainFeedback.current;
      const collisionLean = feedbackEase * feedback.intensity * 0.105;
      const slopePitch = THREE.MathUtils.clamp(slope.grade * slope.uphillDot * -0.18, -0.12, 0.09);
      const targetPitch = -speedRatio * 0.075 + slopePitch - feedback.normal.z * collisionLean;
      const targetRoll = THREE.MathUtils.clamp((localVelocity.x / PLAYER.runSpeed) * -0.08 + yawDelta * -1.4, -0.16, 0.16)
        + feedback.normal.x * collisionLean;
      modelFeedbackRef.current.rotation.x = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.x, targetPitch, 10, delta);
      modelFeedbackRef.current.rotation.z = THREE.MathUtils.damp(modelFeedbackRef.current.rotation.z, targetRoll, 10, delta);
      modelFeedbackRef.current.position.x = feedback.normal.x * feedbackEase * feedback.intensity * 0.045;
      modelFeedbackRef.current.position.z = feedback.normal.z * feedbackEase * feedback.intensity * 0.045;
    }
    if (contactShadowRef.current) {
      const shadowGround = collisionAdapter.groundInfo(group.current.position);
      const groundOffset = shadowGround.y - group.current.position.y + 0.018;
      const airGap = Math.max(0, group.current.position.y - shadowGround.y);
      const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      const airborneFade = THREE.MathUtils.clamp(1 - airGap / 3.2, 0, 1);
      const speedScale = THREE.MathUtils.clamp(horizontalSpeed / PLAYER.runSpeed, 0, 1);
      contactShadowRef.current.position.y = groundOffset;
      contactShadowRef.current.scale.set(
        0.72 + speedScale * 0.18 + airGap * 0.045,
        0.5 + speedScale * 0.08 + airGap * 0.025,
        1,
      );
      contactShadowRef.current.material.opacity = 0.24 * airborneFade;
      contactShadowRef.current.visible = airborneFade > 0.02;
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
      onStart = null,
    } = {}) => {
      stateRef.current.action = clip;
      stateRef.current.actionStartedAt = now;
      stateRef.current.actionUntil = now + duration;
      stateRef.current.lockMovementUntil = lockMovement ? now + duration : stateRef.current.lockMovementUntil;
      stateRef.current.recoverAction = recoverAction ? { clip: recoverAction, duration: recoverDuration } : null;
      onStart?.();
    };
    const interruptAction = (allowed = MOVEMENT_INTERRUPTIBLE_ACTIONS) => {
      if (!allowed.has(stateRef.current.action)) return false;
      stateRef.current.action = null;
      stateRef.current.recoverAction = null;
      stateRef.current.actionUntil = 0;
      stateRef.current.lockMovementUntil = Math.min(stateRef.current.lockMovementUntil, now);
      return true;
    };
    const triggerAction = (button, clip, duration = ACTION_DURATION[clip] || 1.2, options = {}) => {
      const pressed = Boolean(keys[button] || touch[button]);
      const allowWhileActing = options.allowWhileActing === true;
      const blocked = options.movementLocked || (!allowWhileActing && stateRef.current.action);
      if (pressed && !lastButtons.current[button] && !blocked) {
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
      if (progress >= 1) {
        const landingGround = collisionAdapter.groundInfo(traverse.end);
        group.current.position.copy(traverse.end);
        group.current.position.y = landingGround.y;
        characterController.sync(group.current.position);
        stateRef.current.traverseMotion = null;
        stateRef.current.action = null;
        stateRef.current.lockMovementUntil = 0;
        stateRef.current.crouching = false;
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
    const crouchPressed = Boolean(keys.crouch || touch.crouch);
    const preInputMovementLocked = now < stateRef.current.lockMovementUntil || spawnDrop.current.phase !== 'complete';
    if (crouchPressed && !lastButtons.current.crouch && !preInputMovementLocked && !stateRef.current.action) {
      stateRef.current.crouching = !stateRef.current.crouching;
      const transitionClip = stateRef.current.aiming
        ? (stateRef.current.crouching ? 'standToCover' : 'coverToStand')
        : (stateRef.current.crouching ? 'standToCrouch' : 'crouchToStand');
      startAction(transitionClip, stateRef.current.aiming ? 0.74 : 0.8, { lockMovement: true });
    }
    lastButtons.current.crouch = crouchPressed;
    const riflePressed = Boolean(keys.rifle || touch.rifle);
    if (riflePressed && !lastButtons.current.rifle && !preInputMovementLocked && !stateRef.current.action) {
      stateRef.current.aiming = !stateRef.current.aiming;
      if (stateRef.current.aiming) startAction('changeItem', 0.8, { lockMovement: false });
    }
    lastButtons.current.rifle = riflePressed;
    const rotateLeftPressed = Boolean(keys.rotateLeft);
    const rotateRightPressed = Boolean(keys.rotateRight);
    if (rotateLeftPressed) yaw.current += CAMERA.keyRotateSpeed * delta;
    if (rotateRightPressed) yaw.current -= CAMERA.keyRotateSpeed * delta;
    const input = new THREE.Vector3(
      (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0),
      0,
      (keys.backward || touch.backward ? 1 : 0) - (keys.forward || touch.forward ? 1 : 0),
    );
    const moving = input.lengthSq() > 0;
    const climbPressed = Boolean(keys.climb || touch.climb);
    const dodgePressed = Boolean(keys.dodge || touch.dodge);
    const jumpPressed = Boolean(keys.jump || touch.jump);
    const anyDirectActionPressed = Boolean(
      keys.pray || keys.fireRifle || keys.hammer || keys.net || keys.gather || keys.write || keys.inspect
      || keys.lookAround || keys.point || keys.trip || keys.teeter
      || touch.net || touch.hammer || touch.gather || touch.fireRifle || touch.write
    );
    // "Use tool" command (Meta key / clicking the equipped tool): pulse the
    // control mapped to the active tool; triggerAction picks it up next frame.
    const useToolPressed = Boolean(keys.useTool);
    if (useToolPressed && !lastButtons.current.useTool) {
      triggerToolUse(useThreeGameStore.getState().activeToolId);
    }
    lastButtons.current.useTool = useToolPressed;
    if (moving) {
      interruptAction(MOVEMENT_INTERRUPTIBLE_ACTIONS);
    }
    if (climbPressed || dodgePressed || jumpPressed || crouchPressed || riflePressed || anyDirectActionPressed) {
      interruptAction(CONTROL_INTERRUPTIBLE_ACTIONS);
    }
    const lateralOnlyInput = input.z === 0 && input.x !== 0;
    const runIntent = Boolean((keys.run || touch.run) && moving && !stateRef.current.crouching);
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
    const rawMovementSpeed = (stateRef.current.crouching ? PLAYER.walkSpeed * 0.45 : running ? rawRunSpeed : PLAYER.walkSpeed) * carrySpeedScale * wadeSpeedScale;
    const slope = collisionAdapter.terrainSlopeAt(group.current.position.x, group.current.position.z);
    const rawInputDirection = moving ? input.clone().normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current) : facing.current.clone().normalize();
    const uphillVector = new THREE.Vector3(slope.dx, 0, slope.dz);
    const uphillDirection = uphillVector.lengthSq() > 0.0001 ? uphillVector.clone().normalize() : new THREE.Vector3();
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
    const actionOptions = { movementLocked };
    triggerAction('pray', 'pray', ACTION_DURATION.pray, actionOptions);
    triggerAction('fireRifle', 'fireRifle', ACTION_DURATION.fireRifle, actionOptions);
    triggerAction('hammer', 'swingHammer', ACTION_DURATION.swingHammer, {
      ...actionOptions,
      onStart: () => {
        emitPropEvent('tool-swing', {
          tool: 'hammer',
          position: { x: group.current.position.x, y: group.current.position.y, z: group.current.position.z },
          facing: { x: facing.current.x, y: 0, z: facing.current.z },
          impactDelay: 0.55,
        });
      },
    });
    triggerAction('net', 'swingNet', ACTION_DURATION.swingNet, actionOptions);
    triggerAction('gather', 'gather', ACTION_DURATION.gather, actionOptions);
    triggerAction('write', 'write', ACTION_DURATION.write, { ...actionOptions, lockMovement: true });
    triggerAction('inspect', 'kneelInspect', ACTION_DURATION.kneelInspect, { ...actionOptions, lockMovement: true });
    triggerAction('lookAround', 'lookAround', ACTION_DURATION.lookAround, actionOptions);
    triggerAction('point', 'point', ACTION_DURATION.point, actionOptions);
    triggerAction('trip', 'trip', ACTION_DURATION.trip, { ...actionOptions, lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.45 });
    triggerAction('teeter', 'teeter', ACTION_DURATION.teeter, { ...actionOptions, lockMovement: false });
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
    if (climbPressed && !lastButtons.current.climb && !stateRef.current.crouching && !movementLocked) {
      const target = collisionAdapter.findClimbTarget(group.current.position, facing.current);
      if (target) {
        characterController.sync(group.current.position);
        const climbClip = running || Math.hypot(velocity.current.x, velocity.current.z) > PLAYER.walkSpeed * 1.1
          ? 'sprintToWallClimb'
          : 'climbingUpWall';
        const climbDuration = ACTION_DURATION[climbClip] || ACTION_DURATION.climb;
        startAction(climbClip, climbDuration, { lockMovement: true });
        stateRef.current.climbMotion = {
          start: group.current.position.clone(),
          end: target.end,
          heightDelta: target.heightDelta,
          duration: climbDuration * 0.92,
          startedAt: now,
          targetYaw: Math.atan2(target.obstacle.x - group.current.position.x, target.obstacle.z - group.current.position.z),
        };
      } else {
        startAction('teeter', 0.95, { lockMovement: false });
      }
    }
    lastButtons.current.climb = climbPressed;
    const canPlayLocomotionFlourish = !moving && !stateRef.current.action && !movementLocked;
    if (!moving && previousMotion.current.moving && previousMotion.current.running && !stateRef.current.action && !movementLocked) {
      const previousSpeed = Math.hypot(velocity.current.x, velocity.current.z);
      if (previousSpeed > PLAYER.walkSpeed * 1.28) {
        startAction('runToStop', Math.min(0.38, ACTION_DURATION.runToStop), { lockMovement: false });
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
      const forwardFacing = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
      facing.current.copy(sidestepping ? forwardFacing : input);
      const targetVelocity = input.clone().multiplyScalar(movementSpeed);
      const accel = airborneForControl ? PLAYER.airAcceleration : PLAYER.groundAcceleration;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, targetVelocity.x, accel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, targetVelocity.z, accel, delta);
      const targetYaw = sidestepping ? Math.atan2(forwardFacing.x, forwardFacing.z) : Math.atan2(input.x, input.z);
      group.current.rotation.y = dampAngle(group.current.rotation.y, targetYaw, PLAYER.turnDamping, delta);
    } else {
      const decel = airborneForControl ? PLAYER.airDeceleration : PLAYER.groundDeceleration;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, decel, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, 0, decel, delta);
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
      };
      stateRef.current.crouching = false;
      stateRef.current.aiming = false;
    }
    lastButtons.current.dodge = dodgePressed;
    const jumpHeld = Boolean(keys.jump || touch.jump);
    const jumpJustPressed = jumpHeld && !lastButtons.current.jump;
    const canJump = jumpJustPressed
      && !stateRef.current.crouching
      && !stateRef.current.aiming
      && !stateRef.current.action
      && spawnDrop.current.phase === 'complete'
      && now >= stateRef.current.lockMovementUntil
      && jumpState.current.phase !== 'takeoff'
      && (grounded || now - lastGroundedAt.current <= PLAYER.coyoteTime);
    if (canJump) {
      const launchRunning = running || Math.hypot(velocity.current.x, velocity.current.z) > PLAYER.walkSpeed * 1.05;
      const launchVelocity = PLAYER.jumpVelocity + (launchRunning ? PLAYER.runningJumpVerticalBonus : 0);
      velocity.current.y = launchVelocity;
      if (moving || launchRunning) {
        const horizontal = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
        const launchDirection = moving
          ? rawInputDirection.clone().normalize()
          : facing.current.clone().normalize();
        const minLaunchSpeed = launchRunning ? rawRunSpeed * 0.78 : PLAYER.walkSpeed * 0.52;
        if (horizontal.length() < minLaunchSpeed) {
          horizontal.copy(launchDirection).setLength(minLaunchSpeed);
          velocity.current.x = horizontal.x;
          velocity.current.z = horizontal.z;
        }
      }
      jumpCharge.current.active = false;
      lastGroundedAt.current = -10;
      jumpBufferedUntil.current = -10;
      jumpState.current = {
        phase: 'takeoff',
        takeoffUntil: now + ACTION_DURATION.jumpTakeoff * 0.52,
        wasRunning: launchRunning,
        fromPlayerJump: true,
        chargeAmount: 0,
        launchedAt: now,
        launchY: group.current.position.y,
      };
      stateRef.current.jumpCharging = false;
      stateRef.current.jumpPhase = 'takeoff';
      stateRef.current.jumpWasRunning = launchRunning;
      stateRef.current.jumpChargeAmount = 0;
      wasAirborne.current = true;
    }
    stateRef.current.jumpCharging = false;
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
    const desiredDelta = velocity.current.clone().multiplyScalar(delta);
    const canAutoTraverse = grounded
      && moving
      && !movementLocked
      && !stateRef.current.action
      && !stateRef.current.aiming
      && !stateRef.current.crouching
      && desiredDelta.lengthSq() > 0.0001;
    if (canAutoTraverse) {
      const traversalTarget = collisionAdapter.findTraversalTarget(group.current.position, desiredDelta, facing.current);
      if (traversalTarget) {
        characterController.sync(group.current.position);
        const duration = ACTION_DURATION.scramble;
        const clip = 'crouchWalk';
        startAction(clip, duration, { lockMovement: true });
        stateRef.current.traverseMotion = {
          start: group.current.position.clone(),
          end: traversalTarget.end.clone(),
          duration,
          startedAt: now,
          targetYaw: Math.atan2(traversalTarget.direction.x, traversalTarget.direction.z),
          arcHeight: THREE.MathUtils.clamp(0.12 + traversalTarget.heightDelta * 0.18, 0.16, 0.34),
          crouching: true,
        };
        velocity.current.set(0, 0, 0);
        stateRef.current.running = false;
        stateRef.current.walking = false;
        stateRef.current.airborne = false;
        wasAirborne.current = false;
        return;
      }
    }
    const characterMove = {
      movement: desiredDelta.clone(),
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
    let collision = null;
    const fallbackCollision = collisionAdapter.resolveCollision(group.current.position, startOfFramePosition);
    if (fallbackCollision) {
      group.current.position.copy(fallbackCollision.position).addScaledVector(fallbackCollision.normal, 0.035);
      characterMove.collisions = 1;
      characterMove.collision = fallbackCollision;
      characterDebug.current.collisions = 1;
      collision = fallbackCollision;
    }
    characterController.sync(group.current.position);

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
        const slideKeep = intoSurface > 0.74 ? 0.9 : 0.99;
        velocity.current.x = tangentVelocity.x * slideKeep;
        velocity.current.z = tangentVelocity.z * slideKeep;
      }

      const directImpact = impactSpeed >= BUMP_FEEDBACK.minSpeed && intoSurface >= BUMP_FEEDBACK.minHeadOn;
      const canReact = now - bounceFeedback.current.lastImpactAt >= BUMP_FEEDBACK.cooldown;
      if (directImpact && canReact) {
        const intensity = THREE.MathUtils.clamp(
          0.22 + impactSpeed / 8.5 + collision.penetration * 0.12 + intoSurface * 0.24,
          0.26,
          0.86,
        );
        const localNormal = normal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.current.rotation.y);
        collisionDustTriggerRef.current?.({
          intensity: Math.min(1, intensity * 0.9),
          position: new THREE.Vector3(-localNormal.x * 0.46, 0.08, -localNormal.z * 0.46),
        });
        const pushable = collision.obstacle?.pushable
          ? collision.obstacle
          : findPushableObstacleNear(collisionAdapter.obstacles, group.current.position, horizontalVelocity, normal);
        if (pushable && impactSpeed > 1.15) {
          const pushDirection = horizontalVelocity.lengthSq() > 0.001
            ? horizontalVelocity.clone().normalize()
            : normal.clone().multiplyScalar(-1).normalize();
          const pushStep = THREE.MathUtils.clamp(
            (0.055 + impactSpeed * 0.012 + intensity * 0.08) / Math.max(0.65, pushable.pushMass),
            0.035,
            0.22,
          );
          const pushDelta = pushDirection.multiplyScalar(pushStep * (pushable.pushFriction ?? 0.88));
          const currentObstaclePosition = new THREE.Vector3(pushable.x, 0, pushable.z);
          const candidate = currentObstaclePosition.clone().add(pushDelta);
          const clamped = collisionAdapter.clampToWalkable(candidate, currentObstaclePosition);
          if (clamped.distanceTo(candidate) < 0.08) {
            movePushableObstacle(pushable.id, pushDelta, pushable.zoneId);
            velocity.current.x *= 0.78;
            velocity.current.z *= 0.78;
          }
        }
        velocity.current.x += normal.x * intensity * 0.38;
        velocity.current.z += normal.z * intensity * 0.38;
        bounceFeedback.current = {
          startedAt: now,
          lastImpactAt: now,
          intensity,
          normal,
        };
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
      const horizontalVelocity = new THREE.Vector3(velocity.current.x, 0, velocity.current.z);
      const impactSpeed = horizontalVelocity.length();
      const movingIntoCactus = impactSpeed > CACTUS_HAZARD.minSpeed
        ? horizontalVelocity.clone().normalize().dot(cactusContact.normal) < 0.25
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
        startAction('hitReaction', 0.78, { lockMovement: true });
        bounceFeedback.current = {
          startedAt: now,
          lastImpactAt: now,
          intensity: 0.72,
          normal: cactusContact.normal.clone(),
        };
        cameraImpulse.current = {
          startedAt: now,
          intensity: 0.42,
          duration: 0.28,
          seed: cameraImpulse.current.seed + 1,
        };
      }
    }

    const nextGroundInfo = collisionAdapter.groundInfo(group.current.position);
    const nextGroundY = nextGroundInfo.y;
    const groundDistance = group.current.position.y - nextGroundY;
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
          emitPropEvent('water-splash', {
            position: { x: group.current.position.x, y: WATER_LEVEL, z: group.current.position.z },
            intensity: Math.min(1, dustIntensity + 0.2),
          });
        } else {
        landingDustTriggerRef.current?.({ intensity: dustIntensity });
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
        startAction('fallingToRoll', ACTION_DURATION.fallingToRoll, { lockMovement: true });
      } else if (falling > 9.5 && !stateRef.current.action) {
        startAction('hardLanding', ACTION_DURATION.hardLanding, { lockMovement: true, recoverAction: 'gettingUp', recoverDuration: 1.25 });
      } else if (falling > 2.4 && landingSpeed > PLAYER.walkSpeed * 1.1 && !stateRef.current.action) {
        startAction('runningLanding', ACTION_DURATION.runningLanding, { lockMovement: false });
      } else if (falling > 2.4 && !stateRef.current.action) {
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
    const edgeRisk = collisionAdapter.edgeRisk(group.current.position, facing.current);
    if (edgeRisk && edgeRisk.intensity > 0.52 && moving && now - lastTeeterAt.current > 3.4 && !stateRef.current.action) {
      lastTeeterAt.current = now;
      if (edgeRisk.intensity > 0.72) startAction('teeter', 0.75, { lockMovement: false });
      velocity.current.x -= edgeRisk.direction.x * 0.42;
      velocity.current.z -= edgeRisk.direction.z * 0.42;
    }

    const edgePrompt = nearestRegionEdgePrompt(currentZoneId, group.current.position, facing.current);
    const promptPayload = edgePrompt
      ? {
          id: `${currentZoneId}:${edgePrompt.edge}:${edgePrompt.toRegionId || edgePrompt.boundaryKind || edgePrompt.kind}`,
          ...edgePrompt,
        }
      : null;
    const currentPromptId = useThreeGameStore.getState().edgePrompt?.id || null;
    if ((promptPayload?.id || null) !== currentPromptId) {
      setEdgePrompt(promptPayload);
    }

    const p = group.current.position;
    // Deep water can't be walked into, but it can be fallen into (cliff jumps)
    // — and once in, Darwin can struggle in any direction while he drowns.
    const allowDeepWater = wasAirborne.current || wadeDepth.current > WADE_DEPTH * 0.96;
    const clamped = collisionAdapter.clampToWalkable(p, startOfFramePosition, { wade: true, deep: allowDeepWater });
    if (!clamped.equals(p)) {
      const correction = clamped.clone().sub(p);
      p.copy(clamped);
      characterController.sync(p);
      const correctionDistance = Math.hypot(correction.x, correction.z);
      const velocityKeep = correctionDistance < 0.65 ? 0.72 : 0.35;
      velocity.current.x *= velocityKeep;
      velocity.current.z *= velocityKeep;
    }
    if (!wasAirborne.current && jumpState.current.phase !== 'takeoff') {
      const finalGroundInfo = collisionAdapter.groundInfo(p);
      p.y = finalGroundInfo.y;
      characterController.sync(p);
      velocity.current.y = 0;
    }

    let nearest = null;
    let nearestDistance = 4.4;
    const collected = useThreeGameStore.getState().collectedSpecimenIds;
    const specimenRuntimePositions = useThreeGameStore.getState().specimenRuntimePositions?.[currentZoneId] || {};
    for (const specimen of zoneSpecimens) {
      if (collected.includes(specimen.id)) continue;
      const runtime = specimenRuntimePositions[specimen.id];
      const [x, , z] = specimen.spawnPoint;
      const runtimeX = runtime?.x ?? x;
      const runtimeZ = runtime?.z ?? z;
      const distance = Math.hypot(p.x - runtimeX, p.z - runtimeZ);
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
      if (currentState.carryPrompt) {
        if (currentState.carriedObjectId) {
          setCarriedObject(null);
        } else if (currentState.carryPrompt.mode === 'pickup') {
          setCarriedObject(currentState.carryPrompt.id);
        }
      } else if (!specimenId && currentState.edgePrompt?.kind === 'open' && currentState.edgePrompt.toRegionId && !stateRef.current.action) {
        beginZoneTransition(currentState.edgePrompt.toRegionId, {
          entryEdge: oppositeEdge(currentState.edgePrompt.edge),
          note: currentState.edgePrompt.description,
        });
      } else if (currentState.edgePrompt?.kind === 'blocked' && !specimenId) {
        setEdgePrompt({
          ...currentState.edgePrompt,
          message: currentState.edgePrompt.description,
        });
      } else if (specimenId && !currentState.collectedSpecimenIds.includes(specimenId) && !stateRef.current.action) {
        const animation = collectionAnimationForTool(currentState.activeToolId);
        startAction(animation.clip, animation.duration, { lockMovement: animation.lockMovement });
        collectNearby();
      }
    }
    if (keys.camera && !lastCamera.current) cycleViewMode();
    const toolbarOrder = useThreeGameStore.getState().toolbarOrder;
    for (let index = 0; index < 6; index += 1) {
      if (keys[`tool${index + 1}`] && toolbarOrder[index]) {
        setActiveTool(toolbarOrder[index]);
      }
    }
    lastInteract.current = keys.interact || touch.interact;
    lastCamera.current = keys.camera;

    const terrainCameraY = collisionAdapter.terrainHeight(p.x, p.z) + 0.04;
    const lowTraversalLift = Math.max(0, p.y - terrainCameraY);
    const cameraTargetY = lowTraversalLift > 0.05 && lowTraversalLift < 0.85 && !wasAirborne.current
      ? terrainCameraY
      : p.y;
    cameraFollowY.current = cameraFollowY.current === null
      ? cameraTargetY
      : THREE.MathUtils.damp(cameraFollowY.current, cameraTargetY, 7, delta);
    const cameraAnchor = p.clone();
    cameraAnchor.y = cameraFollowY.current;

    const offset = cameraTargets[viewMode] || cameraTargets.shoulder;
    const desired = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current).add(cameraAnchor);
    const impulse = cameraImpulse.current;
    const impulseProgress = THREE.MathUtils.clamp((now - impulse.startedAt) / Math.max(0.01, impulse.duration), 0, 1);
    const impulseFade = Math.sin(impulseProgress * Math.PI) * impulse.intensity;
    const cameraShake = impulseFade > 0.001
      ? new THREE.Vector3(
          Math.sin(now * 43.7 + impulse.seed) * 0.035 * impulseFade,
          Math.sin(now * 51.1 + impulse.seed * 2.3) * 0.025 * impulseFade,
          Math.cos(now * 39.3 + impulse.seed * 1.7) * 0.03 * impulseFade,
        )
      : new THREE.Vector3();
    const statusViewOpen = useThreeGameStore.getState().statusViewOpen;
    const statusPivot = cameraAnchor.clone().add(new THREE.Vector3(0, 1.22, 0)).add(panOffset.current);
    if (statusViewOpen) {
      // Diegetic status view: ease into a static hero shot just in front of
      // Darwin, slightly off-axis, framing his head and chest.
      const forward = new THREE.Vector3(facing.current.x, 0, facing.current.z);
      if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
      forward.normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const chest = p.clone().add(new THREE.Vector3(0, 1.5, 0));
      if (!statusLook.current) {
        // Seed the look point from the current view direction so the first
        // frame eases rather than snaps.
        statusLook.current = camera.position.clone()
          .add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
      }
      const ease = 1 - Math.exp(-2.4 * delta);
      const eye = chest.clone()
        .add(forward.clone().multiplyScalar(1.15))
        .add(right.multiplyScalar(0.18))
        .add(new THREE.Vector3(0, 0.05, 0));
      camera.position.lerp(eye, ease);
      statusLook.current.lerp(chest, ease);
      camera.lookAt(statusLook.current);
    } else if (viewMode === 'first') {
      desired.copy(p).add(new THREE.Vector3(0, 1.7, 0));
      camera.position.lerp(desired, 0.28);
      // Vertical look from the same pitch control (level at the default pitch).
      const lookPitch = THREE.MathUtils.clamp((CAMERA.defaultPitch - pitch.current) * 1.5, -1.3, 1.3);
      camera.rotation.order = 'YXZ'; // yaw then pitch -> no unwanted roll
      camera.rotation.set(lookPitch, yaw.current, 0);
    } else if (viewMode === 'top') {
      const top = cameraAnchor.clone().add(new THREE.Vector3(0, THREE.MathUtils.clamp(zoom.current * 3.4, 9, 42), 0.1));
      camera.position.lerp(top.add(cameraShake), 0.12);
      camera.lookAt(cameraAnchor.x, cameraAnchor.y, cameraAnchor.z);
    } else {
      // Full spherical orbit around the player: yaw + pitch + pan offset.
      const cameraForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
      const cameraRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
      const cameraDistance = zoom.current;
      const zoomT = THREE.MathUtils.smoothstep(cameraDistance, CAMERA.minZoom, CAMERA.maxZoom);
      const side = THREE.MathUtils.lerp(0.6, 1.5, zoomT);
      const pitchA = THREE.MathUtils.clamp(pitch.current, CAMERA.minPitch, CAMERA.maxPitch);
      // Pivot around the player's upper body, shifted by any active pan.
      const pivot = cameraAnchor.clone().add(new THREE.Vector3(0, 1.22, 0)).add(panOffset.current);
      // Orbit: pull back horizontally by cos(pitch), rise by sin(pitch).
      const horiz = Math.cos(pitchA) * cameraDistance;
      const vert = Math.sin(pitchA) * cameraDistance;
      const eye = pivot.clone()
        .add(cameraForward.clone().multiplyScalar(-horiz))
        .add(cameraRight.multiplyScalar(side))
        .add(new THREE.Vector3(0, vert, 0));
      camera.position.lerp(eye.add(cameraShake), 0.1);
      camera.lookAt(pivot);
    }
    if (!statusViewOpen && statusLook.current) {
      // Status view just closed: the branch above eases position back while we
      // ease the look point home, then release it to the regular lookAt.
      const ease = 1 - Math.exp(-3.2 * delta);
      statusLook.current.lerp(statusPivot, ease);
      camera.lookAt(statusLook.current);
      if (statusLook.current.distanceToSquared(statusPivot) < 0.02) statusLook.current = null;
    }

    const horizontalSpeed = Math.hypot(velocity.current.x, velocity.current.z);
    stateRef.current.speed = horizontalSpeed;
    stateRef.current.slopeGrade = terrainFeedback.current.grade;
    stateRef.current.uphillDot = terrainFeedback.current.uphillDot;
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
    stateRef.current.airborne = wasAirborne.current;
    wadeDepth.current = stateRef.current.airborne ? 0 : Math.max(0, WATER_LEVEL - p.y);
    // Drowning: past wading depth the sea takes its toll. Damage accumulates
    // locally and hits the store in chunks so we don't set state every frame.
    if (wadeDepth.current > WADE_DEPTH && health > 0) {
      drownDamage.current += delta * 9;
      if (drownDamage.current >= 4) {
        applyDrowningDamage(drownDamage.current);
        drownDamage.current = 0;
      }
    } else {
      drownDamage.current = 0;
    }
    if (!stateRef.current.airborne && moving && horizontalSpeed > 0.85 && !jumpCharge.current.active) {
      if (wadeDepth.current > 0.05) {
        // Wading: footfalls kick up splashes instead of dust.
        const cadence = (stateRef.current.running ? 3.1 : 2.1) * THREE.MathUtils.clamp(horizontalSpeed / PLAYER.walkSpeed, 0.55, 1.6);
        footstepDust.current.phase += delta * cadence;
        if (footstepDust.current.phase >= 1) {
          footstepDust.current.phase -= 1;
          footstepDust.current.side *= -1;
          const sideX = -facing.current.z * footstepDust.current.side * 0.18;
          const sideZ = facing.current.x * footstepDust.current.side * 0.18;
          emitPropEvent('water-splash', {
            position: {
              x: p.x + sideX + facing.current.x * 0.22,
              y: WATER_LEVEL,
              z: p.z + sideZ + facing.current.z * 0.22,
            },
            intensity: THREE.MathUtils.clamp(
              0.28 + horizontalSpeed / PLAYER.runSpeed * 0.3 + wadeDepth.current * 0.5,
              0.3,
              0.8,
            ),
          });
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
            position: new THREE.Vector3(footstepDust.current.side * 0.18, 0.055, 0.18),
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
    setPlayerPose({
      position: { x: p.x, y: p.y, z: p.z },
      facing: { x: facing.current.x, y: facing.current.y, z: facing.current.z },
    });
    if (playerControllerDebugEnabled()) {
      window.__darwinControllerDebug = {
        airborne: stateRef.current.airborne,
        action: stateRef.current.action,
        jumpPhase: stateRef.current.jumpPhase,
        jumpCharging: stateRef.current.jumpCharging,
        groundDistance,
        verticalSpeed: velocity.current.y,
        speed: horizontalSpeed,
      };
    }
    previousMotion.current.moving = moving;
    previousMotion.current.running = stateRef.current.running;
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
      <mesh ref={contactShadowRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <circleGeometry args={[0.72, 36]} />
        <meshBasicMaterial color="#17130d" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <LandingDust triggerRef={landingDustTriggerRef} />
      <LandingDust triggerRef={footstepDustTriggerRef} />
      <LandingDust triggerRef={collisionDustTriggerRef} />
      <group ref={modelFeedbackRef}>
        <NaturalistModel motionRef={stateRef} health={health} fatigue={fatigue} inventoryCount={inventoryCount} />
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
