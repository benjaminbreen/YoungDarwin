'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { DEFAULT_PLAYER_MODEL_ASSET_ID } from '../../modelAssets';
import { ModelAsset } from '../assets/ModelAsset';
import { PLAYER } from './playerConfig';
import { attachToBone } from './handAttachment';
import { calibratedStrideTimeScale } from './gaitProfiles';

const RIGHT_HAND = /righthand$/i;
const LEFT_HAND = /lefthand$/i;
const LEFT_INDEX_FINGER = /lefthandindex2$/i;

const LAMP_MODEL_PATH = '/assets/models/oil-lamp.glb';
// Tunables — the lamp mesh's grip pose may need adjusting in-game.
const LAMP_TARGET_HEIGHT = 0.26;   // desired world height of the lamp, metres
const LAMP_LOCAL_OFFSET = [0.04, 0.02, 0.0]; // hand-local position, world metres
const LAMP_LIGHT_COLOR = '#ffb867';
const LAMP_LIGHT_INTENSITY = 2.5;  // at deep night (was 6.0 — blew out the body at point-blank range)
const LAMP_LIGHT_DISTANCE = 8.0;
const LAMP_ATTACHMENT = {
  default: {
    position: LAMP_LOCAL_OFFSET,
  },
  // Darwin4's idle hand hangs naturally open; put the lantern's bail just below
  // the fingers instead of clipping the wrist/cuff.
  darwin4: {
    bone: LEFT_INDEX_FINGER,
    position: [0.0, -0.018, 0.0],
  },
};

// Held-tool props. Placeholder GLBs live under /assets/models/tools/ — swap in
// finished models by replacing the file at the same path.
const HAND_TOOLS = [
  {
    toolId: 'shotgun',
    path: '/assets/models/tools/shotgun.glb',
    scale: 1,
    position: [0, 0, 0],
    euler: [0, 0, 0],
    hand: 'right',
    orient: 'body',
    modelOverrides: {
      darwin5: {
        position: [0.0, -0.012, -0.015],
        euler: [1.86, 0.91, -2.74],
        orient: 'hand',
      },
    },
  },
  { toolId: 'insect_net', path: '/assets/models/tools/net.glb',     scale: 1, position: [0.0, -0.012, -0.015], euler: [0, 0, -Math.PI / 2], hand: 'right', orient: 'hand' },
  { toolId: 'snare',      path: '/assets/models/tools/snare.glb',   scale: 1, position: [0.0, -0.012, -0.015], euler: [0, 0, -Math.PI / 2], hand: 'right', orient: 'hand' },
  { toolId: 'hammer',     path: '/assets/models/tools/hammer.glb',  scale: 1, position: [0.0, -0.012, -0.015], euler: [0, 0, -Math.PI / 2], hand: 'right', orient: 'hand' },
];

const PLAYER_MODEL_CYCLE = Array.from(new Set([
  DEFAULT_PLAYER_MODEL_ASSET_ID,
  'darwin4',
  'darwin',
  'darwinCandidate2',
  'darwin5',
]));

function darwin5StandingJumpRequest(charge, jumpPhase) {
  const charged = charge >= 0.35;
  return {
    clip: 'standingJump',
    fade: jumpPhase === 'takeoff' ? 0.04 : 0.02,
    // The source clip is a full 1.93s Mixamo jump cycle, while normal game
    // airtime is much shorter. Play only the takeoff/air pose window and let
    // the landing resolver handle impact procedurally.
    timeScale: THREE.MathUtils.lerp(1.55, 1.28, charge),
    maxTime: charged ? 1.28 : 0.92,
  };
}

const DARWIN5_FALL_IDLE_MIN_DISTANCE = 1.35;
const DARWIN5_FALL_IDLE_MIN_DESCENT_SPEED = -1.05;

function jumpHoldClipForMotion(motion, fade = 0.05) {
  return motion.jumpWasRunning
    ? { clip: 'runningJumpHold', fade }
    : { clip: 'standingJumpHold', fade };
}

function darwin5UncontrolledFallClip(motion) {
  const groundDistance = motion.groundDistance ?? 0;
  const verticalSpeed = motion.verticalSpeed ?? 0;
  if (
    verticalSpeed < DARWIN5_FALL_IDLE_MIN_DESCENT_SPEED
    && groundDistance > DARWIN5_FALL_IDLE_MIN_DISTANCE
  ) {
    return { clip: 'fallingIdle', fade: 0.1 };
  }
  return jumpHoldClipForMotion(motion, 0.08);
}

function darwin5TorchActionClip(action, crouching) {
  if (action === 'turnLeft90') return crouching ? 'torchCrouchTurnLeft90' : 'torchTurnLeft90';
  if (action === 'turnRight90') return crouching ? 'torchCrouchTurnRight90' : 'torchTurnRight90';
  if (action === 'standToCrouch') return 'torchStandToCrouch';
  if (action === 'crouchToStand') return 'torchCrouchToStand';
  if (action === 'swingHammer' || action === 'heavyToolSwing') return 'heavyToolSwing';
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'kneelInspect') return 'kneelInspect';
  if (action === 'gather') return 'gather';
  if (action === 'standingInspectDownward') return 'standingInspectDownward';
  if (action === 'changeItem') return 'torchEquip';
  return null;
}

function darwin5HeldToolActionClip(action) {
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'swingHammer' || action === 'swingTool' || action === 'heavyToolSwing') return 'heavyToolSwing';
  return null;
}

function darwin5RifleActionClip(action) {
  if (action === 'standToCover' || action === 'standToCrouch') return 'rifleCrouchWalkToIdle';
  if (action === 'coverToStand' || action === 'crouchToStand') return 'rifleKneelToStand';
  if (action === 'changeItem') return 'rifleEquip';
  return null;
}

function darwin5AdaptedActionClip(action) {
  if (action === 'climbWaistHeight') return { clip: 'climbWaistHeight', timeScale: 1.65, fade: 0.05 };
  if (action === 'climbHeadHeight') return { clip: 'climbHeadHeight', timeScale: 1.45, fade: 0.05 };
  if (action === 'fallingToRoll') return { clip: 'fallingToRoll', timeScale: 1.2, fade: 0.05 };
  if (action === 'swingNet' || action === 'butterflyNetSwing') return 'butterflyNetSwing';
  if (action === 'swingHammer' || action === 'heavyToolSwing') return 'heavyToolSwing';
  if (action === 'kneelInspect') return 'kneelInspect';
  if (action === 'lookAround' || action === 'lookAroundShort') return action;
  if (action === 'write') return 'write';
  if (action === 'gather' || action === 'gatherGround' || action === 'gatherChestHeight') return action;
  if (action === 'pushLow') return { clip: 'pushLow', timeScale: 1.35, fade: 0.05 };
  if (action === 'pushMedium') return { clip: 'pushMedium', timeScale: 1.45, fade: 0.05 };
  if (action === 'pushHeavy') return { clip: 'pushHeavy', timeScale: 1.6, fade: 0.05 };
  if (action === 'pushStart' || action === 'pushStop') return action;
  if (action === 'standingInspectDownward') return 'standingInspectDownward';
  if (action === 'point') return 'point';
  if (action === 'vault') return 'vault';
  if (action === 'shoulderHitAndFall') return 'shoulderHitAndFall';
  if (action === 'hitReaction') return 'hitReaction';
  if (action === 'stumble') return 'stumble';
  if (action === 'trip') return 'trip';
  if (action === 'gettingUp') return 'gettingUp';
  if (action === 'runningSlide') return 'runningSlide';
  if (action === 'dodgeRoll' || action === 'standToRoll') return 'fallingToRoll';
  return null;
}

// 1 at deep night, 0 in full day, ramping across dawn/dusk.
function lampNightFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 20) return (h - 18) / 2;   // dusk ramp up
  if (h > 5 && h < 7) return (7 - h) / 2;       // dawn ramp down
  return 1;                                       // 20:00–05:00
}

// Attaches the oil lamp + a warm flickering point light to Darwin's left hand,
// visible only at night. Scale is normalised against the bone's world scale so
// the lamp is a predictable size regardless of how the rig was exported.
function HandLamp({ scene, modelAssetId }) {
  const { scene: lampSource } = useGLTF(LAMP_MODEL_PATH);
  const groupRef = useRef(null);
  const lightRef = useRef(null);
  const flameMatsRef = useRef([]);
  const boneQuat = useMemo(() => new THREE.Quaternion(), []);
  const swingQuat = useMemo(() => new THREE.Quaternion(), []);
  const swingAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useEffect(() => {
    if (!scene || !lampSource) return undefined;
    const attachment = LAMP_ATTACHMENT[modelAssetId] || LAMP_ATTACHMENT.default;
    const lamp = lampSource.clone(true);
    const box = new THREE.Box3().setFromObject(lamp);
    const nativeHeight = Math.max(1e-3, box.max.y - box.min.y);
    // The Sketchfab lamp's origin is near the base, so putting the object
    // directly on the hand makes it look strapped to the wrist. Move the object
    // so its top handle/bail is the attachment point; the lamp body then hangs.
    lamp.position.y = -box.max.y;

    const flameMats = [];
    lamp.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.userData.noTint = true; // exclude from the damage-flash recolour
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const isFlame = /flame/i.test(obj.name) || mats.some(m => /phong7|phong5/i.test(m?.name || ''));
      mats.forEach(material => {
        if (!material) return;
        material.toneMapped = false;
        if (isFlame && material.emissive) {
          material.emissive.set('#ffae54');
          material.emissiveIntensity = 2.4;
          flameMats.push(material);
        }
      });
    });
    flameMatsRef.current = flameMats;

    const handle = attachToBone(scene, attachment.bone || LEFT_HAND, lamp, {
      worldScale: LAMP_TARGET_HEIGHT / nativeHeight,
      position: attachment.position,
    });
    if (!handle) return undefined;
    handle.group.name = 'darwinHandLamp';
    handle.group.visible = false;

    // decay 1.4 (not the physical 2): the flame sits ~0.3 m from the torso, so
    // inverse-square falloff slammed the near body to clipping while the far side
    // crushed to black. A softer decay flattens that near-field gradient.
    const light = new THREE.PointLight(LAMP_LIGHT_COLOR, 0, LAMP_LIGHT_DISTANCE, 1.4);
    light.castShadow = false;
    // Sit the light at the flame, in lamp-native units (group scale handles the rest).
    light.position.set(0, nativeHeight * 0.55 - box.max.y, 0);
    handle.group.add(light);

    groupRef.current = handle.group;
    lightRef.current = light;

    return () => {
      handle.dispose();
      groupRef.current = null;
      lightRef.current = null;
      flameMatsRef.current = [];
    };
  }, [scene, lampSource, modelAssetId]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const state = useThreeGameStore.getState();
    const hour = state.timeOfDay ?? 12;
    const night = lampNightFactor(hour);
    const leftHandToolActive = HAND_TOOLS.some(tool => tool.hand === 'left' && tool.toolId === state.activeToolId);
    if (night <= 0.02 || leftHandToolActive) {
      if (group.visible) group.visible = false;
      if (lightRef.current) lightRef.current.intensity = 0;
      return;
    }
    group.visible = true;
    const t = clock.elapsedTime;
    // Keep the lamp world-upright (a hanging lantern stays vertical via gravity),
    // with a gentle pendulum sway so it reads as carried rather than welded on.
    const bone = group.parent;
    if (bone) {
      bone.getWorldQuaternion(boneQuat);
      swingQuat.setFromAxisAngle(swingAxis, Math.sin(t * 1.7) * 0.06);
      group.quaternion.copy(boneQuat).invert().multiply(swingQuat);
    }
    const flicker = 0.82 + 0.12 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 24.7 + 1.3);
    if (lightRef.current) lightRef.current.intensity = night * LAMP_LIGHT_INTENSITY * flicker;
    for (let i = 0; i < flameMatsRef.current.length; i += 1) {
      flameMatsRef.current[i].emissiveIntensity = night * (1.6 + 0.6 * flicker);
    }
  });

  return null;
}

// Attaches a held-tool GLB to Darwin's right hand and shows it only while that
// tool is the active one. Hand-oriented props inherit the animated grip pose;
// body-oriented props remain supported for future coarse world-facing tools.
function HandProp({ scene, config, modelAssetId }) {
  const resolvedConfig = useMemo(() => {
    const override = config.modelOverrides?.[modelAssetId];
    return override ? { ...config, ...override } : config;
  }, [config, modelAssetId]);
  const { scene: source } = useGLTF(resolvedConfig.path);
  const groupRef = useRef(null);
  const boneQuat = useMemo(() => new THREE.Quaternion(), []);
  const bodyQuat = useMemo(() => new THREE.Quaternion(), []);
  const tweakQuat = useMemo(() => new THREE.Quaternion(), []);
  const tweakEuler = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    if (!scene || !source) return undefined;
    const object = source.clone(true);
    object.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.noTint = true;
    });
    const handRegex = resolvedConfig.hand === 'left' ? LEFT_HAND : RIGHT_HAND;
    const handle = attachToBone(scene, handRegex, object, {
      worldScale: resolvedConfig.scale,
      position: resolvedConfig.position,
    });
    if (!handle) return undefined;
    handle.group.name = `darwinTool:${resolvedConfig.toolId}`;
    handle.group.visible = false;
    tweakEuler.set(resolvedConfig.euler[0], resolvedConfig.euler[1], resolvedConfig.euler[2]);
    tweakQuat.setFromEuler(tweakEuler);
    groupRef.current = handle.group;
    return () => {
      handle.dispose();
      groupRef.current = null;
    };
  }, [scene, source, resolvedConfig, tweakEuler, tweakQuat]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const visible = useThreeGameStore.getState().activeToolId === resolvedConfig.toolId;
    if (group.visible !== visible) group.visible = visible;
    if (!visible) return;
    const bone = group.parent;
    if (!bone) return;
    if (resolvedConfig.orient === 'hand') {
      group.quaternion.copy(tweakQuat);
      return;
    }
    bone.getWorldQuaternion(boneQuat);
    scene.getWorldQuaternion(bodyQuat);
    // Cancel the bone's world rotation, re-apply the body's, then the tweak.
    group.quaternion.copy(boneQuat).invert().multiply(bodyQuat).multiply(tweakQuat);
  });

  return null;
}

// Above this path-relative ground pitch (+ ascending, - descending) the
// locomotion reads as taking the steps rather than a flat walk. Pitch is
// grade*uphillDot, so 0.45 ~ heading fairly directly up a >=25deg slope.
// Conservative so ordinary inclines still use walk/run; tune if it misfires.
const STAIR_PITCH = 0.45;

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

export function NaturalistModel({ motionRef, health, fatigue, inventoryCount, grounding = null }) {
  const [modelAssetId, setModelAssetId] = useState(DEFAULT_PLAYER_MODEL_ASSET_ID);
  const [damageFlash, setDamageFlash] = useState(0);
  const [modelScene, setModelScene] = useState(null);
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

  useEffect(() => {
    if (motionRef?.current) motionRef.current.modelAssetId = modelAssetId;
    if (typeof window === 'undefined') return undefined;
    window.__darwinPlayerModel = modelAssetId;
    // Hotkey 9 cycles the stable player models for A/B comparison. The Tripo
    // candidate stays in the manifest for dev inspection, but is excluded here
    // because its texture pass is not production-ready.
    const cycle = PLAYER_MODEL_CYCLE;
    const onKeyDown = (event) => {
      if (event.code !== 'Digit9' && event.key !== '9') return;
      if (event.repeat) return;
      setModelAssetId(current => {
        const idx = cycle.indexOf(current);
        const next = cycle[(idx + 1) % cycle.length];
        window.__darwinPlayerModel = next;
        if (motionRef?.current) motionRef.current.modelAssetId = next;
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modelAssetId, motionRef]);

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
    const stride = (clip, scale) => calibratedStrideTimeScale(modelAssetId, clip, scale);
    const gameState = useThreeGameStore.getState();
    const toolId = gameState.activeToolId;
    const holdingTool = toolId === 'insect_net' || toolId === 'snare' || toolId === 'hammer';
    const hasRifle = toolId === 'shotgun';
    const carryingObject = Boolean(gameState.carriedObjectId);
    const lampMode = modelAssetId === 'darwin5' && !hasRifle && lampNightFactor(gameState.timeOfDay ?? 12) > 0.02;
    const heldToolMode = modelAssetId === 'darwin5' && holdingTool;
    const torchMode = modelAssetId === 'darwin5' && !hasRifle && !heldToolMode && lampMode;
    const groundPitch = motionRef.current.groundPitch || 0;
    if (status.health <= 0) return 'fallingForwardDeath';
    if (motionRef.current.action) {
      if (modelAssetId === 'darwin5' && hasRifle) {
        const rifleAction = darwin5RifleActionClip(motionRef.current.action, motionRef.current.crouching);
        if (rifleAction) return rifleAction;
      }
      if (heldToolMode) {
        const heldToolAction = darwin5HeldToolActionClip(motionRef.current.action);
        if (heldToolAction) return heldToolAction;
      }
      if (torchMode) {
        const torchAction = darwin5TorchActionClip(motionRef.current.action, motionRef.current.crouching);
        if (torchAction) return torchAction;
      }
      if (modelAssetId === 'darwin5') {
        const adaptedAction = darwin5AdaptedActionClip(motionRef.current.action);
        if (adaptedAction) return adaptedAction;
      }
      return motionRef.current.action;
    }
    if (motionRef.current.lying && !motionRef.current.walking && !motionRef.current.running) return 'layingIdle';
    if (motionRef.current.sitting && !motionRef.current.walking && !motionRef.current.running) return 'sitIdle';
    if (motionRef.current.swimming) {
      const strokeScale = THREE.MathUtils.clamp(speed / 3.2, 0.85, 1.3);
      return speed > 0.7
        ? { clip: 'swim', fade: 0.24, timeScale: strokeScale }
        : { clip: 'treadWater', fade: 0.28 };
    }
    const injured = status.health < 45;
    const badlyInjured = status.health < 30;
    if (motionRef.current.jumpCharging) return { clip: torchMode ? 'torchCrouchIdle' : 'crouchIdle', fade: 0.08, timeScale: 0.72 };
    const jumpPhase = motionRef.current.jumpPhase;
    const activePlayerJump = jumpPhase === 'takeoff' || jumpPhase === 'airborne' || jumpPhase === 'prelanding';
    const nearGround = Math.abs(motionRef.current.groundDistance ?? Infinity) <= PLAYER.groundSnapDistance * 1.15;
    if (motionRef.current.airborne && activePlayerJump) {
      const charge = THREE.MathUtils.clamp(motionRef.current.jumpChargeAmount || 0, 0, 1);
      const standingJumpScale = THREE.MathUtils.lerp(1.0, 0.76, charge);
      const runningJumpScale = THREE.MathUtils.lerp(0.95, 0.72, charge);
      const shortStandingJump = !motionRef.current.jumpWasRunning && charge < 0.15;
      const useDarwin5FullStandingJump = modelAssetId === 'darwin5' && !motionRef.current.jumpWasRunning;
      if (useDarwin5FullStandingJump) {
        return darwin5StandingJumpRequest(charge, jumpPhase);
      }
      if (jumpPhase === 'takeoff') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        if (motionRef.current.jumpFromHeight) return { clip: 'jumpFromWall', fade: 0.05, timeScale: 1.05 };
        return motionRef.current.jumpWasRunning
          ? { clip: 'runningJump', fade: 0.05, timeScale: runningJumpScale }
          : { clip: 'standingJump', fade: 0.05, timeScale: standingJumpScale };
      }
      if (jumpPhase === 'airborne' || jumpPhase === 'prelanding') {
        if (injured) return motionRef.current.jumpWasRunning ? 'injuredRunJump' : 'injuredStandingJump';
        if (shortStandingJump) return { clip: 'standingJump', fade: 0.05, timeScale: 0.92, maxTime: 0.58 };
        return jumpHoldClipForMotion(motionRef.current, 0.05);
      }
      return jumpHoldClipForMotion(motionRef.current, 0.05);
    }
    if (motionRef.current.airborne && !nearGround) {
      if (modelAssetId === 'darwin5') return darwin5UncontrolledFallClip(motionRef.current);
      return jumpHoldClipForMotion(motionRef.current, 0.08);
    }
    // Aiming: facing is locked to the cursor, so strafe/backpedal flags are
    // velocity-relative. Priority strafe -> backpedal -> run -> walk -> aim idle.
    if (motionRef.current.aiming) {
      if (motionRef.current.crouching) {
        if (modelAssetId === 'darwin5') {
          if (motionRef.current.walking || motionRef.current.crouchRunning) {
            const crouchScale = motionRef.current.crouchRunning
              ? THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.92), 0.88, 1.35)
              : Math.max(0.7, walkScale * 0.85);
            return { clip: 'rifleCrouchWalk', timeScale: stride('walkRifle', crouchScale) };
          }
          return 'rifleKneelIdle';
        }
        return 'crouchRifle';
      }
      if (motionRef.current.strafeLeft) {
        return speed > PLAYER.walkSpeed * 1.15
          ? { clip: 'runStrafeLeft', timeScale: stride('run', runScale) }
          : { clip: 'walkStrafeLeft', timeScale: stride('walk', walkScale) };
      }
      if (motionRef.current.strafeRight) {
        return speed > PLAYER.walkSpeed * 1.15
          ? { clip: 'runStrafeRight', timeScale: stride('run', runScale) }
          : { clip: 'walkStrafeRight', timeScale: stride('walk', walkScale) };
      }
      if (motionRef.current.movingBackward) {
        return injured
          ? { clip: 'injuredWalkBackwards', timeScale: stride('walk', Math.max(0.62, walkScale * 0.88)) }
          : { clip: 'walkBackwards', timeScale: stride('walk', walkScale) };
      }
      if (motionRef.current.running) return { clip: 'runRifle', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'walkRifle', timeScale: stride('walkRifle', walkScale) };
      return 'aim';
    }
    if (motionRef.current.crouching && modelAssetId === 'darwin5' && lampMode && (motionRef.current.walking || motionRef.current.crouchRunning)) {
      const crouchScale = motionRef.current.crouchRunning
        ? THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.92), 0.88, 1.35)
        : Math.max(0.7, walkScale * 0.85);
      return { clip: 'torchCrouchWalk', timeScale: stride('torchWalk', crouchScale) };
    }
    if (motionRef.current.crouching && modelAssetId === 'darwin5' && lampMode) return 'torchCrouchIdle';
    if (motionRef.current.crouching && motionRef.current.strafeLeft) return { clip: 'crouchSneakLeft', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.strafeRight) return { clip: 'crouchSneakRight', timeScale: Math.max(0.72, walkScale * 0.9) };
    if (motionRef.current.crouching && motionRef.current.crouchRunning) {
      return { clip: 'crouchRun', timeScale: THREE.MathUtils.clamp(speed / (PLAYER.walkSpeed * 0.95), 0.75, 1.2) };
    }
    if (motionRef.current.crouching && motionRef.current.walking) return { clip: 'crouchWalk', timeScale: stride('walk', Math.max(0.7, walkScale * 0.85)) };
    if (motionRef.current.crouching) return 'crouchIdle';
    if (!motionRef.current.airborne && (motionRef.current.wadeDepth || 0) > 0.42
      && (motionRef.current.walking || motionRef.current.running)) {
      // Thigh-deep water: heavy wading gait regardless of run intent.
      return { clip: 'wadeWalk', fade: 0.2, timeScale: stride('walk', THREE.MathUtils.clamp(speed / PLAYER.walkSpeed, 0.7, 1.15)) };
    }
    // Backpedalling: play a reversed-facing gait instead of the forward cycle
    // so Darwin doesn't moonwalk when moving away from the camera.
    if (motionRef.current.movingBackward && (motionRef.current.walking || motionRef.current.running)) {
      if (badlyInjured) return { clip: 'injuredRunBackwards', timeScale: stride('run', Math.max(0.7, tiredRunScale * 0.9)) };
      if (injured) return { clip: 'injuredWalkBackwards', timeScale: stride('walk', Math.max(0.62, walkScale * 0.88)) };
      return { clip: 'walkBackwards', timeScale: stride('walk', walkScale) };
    }
    if (badlyInjured && motionRef.current.running) return { clip: 'injuredRun', timeScale: stride('run', Math.max(0.7, tiredRunScale * 0.92)) };
    if (injured && motionRef.current.walking) {
      if (modelAssetId === 'darwin5' && status.health < 24) {
        return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.58, walkScale * 0.82)) };
      }
      if (modelAssetId === 'darwin5' && status.health < 34) {
        return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.6, walkScale * 0.84)) };
      }
      return { clip: 'injuredWalk', timeScale: stride('tiredWalk', Math.max(0.62, walkScale * 0.88)) };
    }
    // Rifle equipped but not aiming: carried low, normal locomotion with rifle.
    if (hasRifle) {
      if (motionRef.current.running) return { clip: 'runRifle', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'walkRifle', timeScale: stride('walkRifle', walkScale) };
    }
    if (heldToolMode) {
      if (modelAssetId === 'darwin5') {
        if (motionRef.current.running) return { clip: 'holdToolRun', timeScale: stride('holdToolRun', runScale) };
        if (motionRef.current.walking) return { clip: 'holdToolWalk', timeScale: stride('holdToolWalk', Math.max(0.7, walkScale)) };
      }
      if (motionRef.current.running) return { clip: 'holdToolRun', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'holdToolWalk', timeScale: stride('holdToolWalk', walkScale) };
    }
    if (torchMode) {
      if (motionRef.current.running) return { clip: 'torchRun', timeScale: stride('run', runScale) };
      if (motionRef.current.walking) return { clip: 'torchWalk', timeScale: stride('torchWalk', walkScale) };
    }
    // Carrying a handheld tool (net/snare/hammer): held walk, paralleling the rifle set.
    if (holdingTool && (motionRef.current.walking || motionRef.current.running)) {
      return { clip: 'holdWalk', timeScale: stride('holdWalk', Math.max(0.7, walkScale)) };
    }
    if (motionRef.current.running) {
      if (groundPitch > STAIR_PITCH) return { clip: 'runUpStairs', timeScale: stride('run', runScale) };
      if (motionRef.current.tiredRun || status.fatigue >= PLAYER.tiredRunFatigue) return { clip: 'jog', timeScale: stride('jog', tiredRunScale) };
      return { clip: 'run', timeScale: stride('run', runScale) };
    }
    if (motionRef.current.walking) {
      if (groundPitch > STAIR_PITCH) return { clip: 'walkUpStairs', timeScale: stride('walk', walkScale) };
      if (groundPitch < -STAIR_PITCH) return { clip: 'descendStairs', timeScale: stride('walk', walkScale) };
      if (carryingObject) return { clip: 'walkCarry', timeScale: stride('walkCarry', Math.max(0.68, walkScale * 0.92)) };
      if (motionRef.current.tiredRun || status.fatigue >= PLAYER.tiredRunFatigue) return { clip: 'tiredWalk', timeScale: stride('tiredWalk', Math.max(0.66, walkScale * 0.92)) };
      return { clip: 'walk', timeScale: stride('walk', walkScale) };
    }
    if (badlyInjured) return status.fatigue >= 82 ? 'injuredStumbleIdle' : 'injuredHurtingIdle';
    if (injured) return 'injuredIdle';
    if (hasRifle) return 'rifleIdle';
    if (carryingObject) return 'holdIdle';
    if (torchMode) return 'torchIdle';
    if (heldToolMode) return 'holdToolIdle';
    if (holdingTool) return 'holdIdle';
    if (status.fatigue >= 82 && modelAssetId !== 'darwin5') return 'exhaustedIdle';
    return 'idle';
  }, [modelAssetId, motionRef]);

  return (
    <>
      <ModelAsset
        key={modelAssetId}
        id={modelAssetId}
        animationSelector={selectAnimation}
        damageFlash={damageFlash}
        reflect
        onSceneReady={setModelScene}
        grounding={grounding}
        fallback={<ProceduralNaturalistModel motionRef={motionRef} />}
      />
      {modelScene && <HandLamp scene={modelScene} modelAssetId={modelAssetId} />}
      {modelScene && HAND_TOOLS.map(tool => (
        <HandProp key={tool.toolId} scene={modelScene} config={tool} modelAssetId={modelAssetId} />
      ))}
    </>
  );
}

useGLTF.preload(LAMP_MODEL_PATH);
HAND_TOOLS.forEach(tool => useGLTF.preload(tool.path));
