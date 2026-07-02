import * as THREE from 'three';
import { updateRuntimeFootContacts } from '../../store';
import {
  footPhasePulse,
  getFootContactProfile,
  getFootProbePatterns,
  getVisualSoleOffset,
} from './gaitProfiles';

const FOOT_PLANT_MAX_UP = 0.075;
const FOOT_PLANT_MAX_DOWN = -0.045;
const FOOT_PLANT_MAX_SPEED = 2.1;
const VISUAL_GROUNDING_MAX_UP = 0.1;
const VISUAL_GROUNDING_PROBE_RANGE = 0.24;
const FOOT_PLANT_BONE = {
  left: /leftfoot$/i,
  right: /rightfoot$/i,
};

function normalizeClipName(name = '') {
  return String(name).replace(/\s+/g, '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
}

function footDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return window.__enableFootDebug === true
    || new URLSearchParams(window.location.search).has('footDebug');
}

function actionPhase(action) {
  const clip = action?.getClip?.();
  const duration = clip?.duration || 0;
  if (duration <= 0) return 0;
  return (((action.time || 0) / duration) % 1 + 1) % 1;
}

export function createFootContactRig({
  assetId,
  asset,
  scene,
  groupRef,
  grounding,
  positionAnimatedBones,
}) {
  const isDarwin = String(assetId).startsWith('darwin');
  const footPlant = {
    left: { bone: null, offset: 0, correction: new THREE.Vector3() },
    right: { bone: null, offset: 0, correction: new THREE.Vector3() },
  };
  const footGrounding = {
    left: { bone: null, contact: 0, pulse: 0, wasDown: false },
    right: { bone: null, contact: 0, pulse: 0, wasDown: false },
    stepId: 0,
  };
  const temps = {
    world: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    local: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    localDelta: new THREE.Vector3(),
  };
  const probeWorld = new THREE.Vector3();
  const probePatterns = getFootProbePatterns(assetId);
  const animatedPositionBones = positionAnimatedBones || new Set();
  let visualGroundOffset = 0;

  scene.traverse(object => {
    if (!object.isBone) return;
    if (FOOT_PLANT_BONE.left.test(object.name)) footPlant.left.bone = object;
    if (FOOT_PLANT_BONE.right.test(object.name)) footPlant.right.bone = object;
    Object.entries(probePatterns).forEach(([side, patterns]) => {
      if (footGrounding[side]?.bone) return;
      if (patterns.some(pattern => pattern.test(object.name))) footGrounding[side].bone = object;
    });
  });

  function applyFootPlanting(delta) {
    const motionState = grounding?.motionRef?.current;
    const adapter = grounding?.collisionAdapter;
    const enabled = asset.footPlanting === true;
    const canPlant = Boolean(
      enabled && adapter
      && motionState
      && !motionState.airborne
      && !motionState.swimming
      && !motionState.crouching
      && !motionState.action
      && !motionState.jumpCharging
      && Math.abs(motionState.groundDistance ?? 0) <= 0.2
      && (motionState.speed || 0) <= FOOT_PLANT_MAX_SPEED,
    );
    const speedStrength = 1 - THREE.MathUtils.clamp((motionState?.speed || 0) / FOOT_PLANT_MAX_SPEED, 0, 1);
    const strength = canPlant ? speedStrength : 0;
    Object.entries(footPlant).forEach(([side, entry]) => {
      const bone = entry.bone;
      if (!bone?.parent) return;
      const boneHasPositionTrack = animatedPositionBones.has(normalizeClipName(bone.name));
      if (!boneHasPositionTrack && entry.correction.lengthSq() > 0) {
        bone.position.sub(entry.correction);
        entry.correction.set(0, 0, 0);
      }
      let targetOffset = 0;
      if (strength > 0) {
        bone.getWorldPosition(temps.world);
        const ground = adapter.groundInfo(temps.world, { supportRadius: 0.06 });
        targetOffset = THREE.MathUtils.clamp(
          (ground.y - temps.world.y) * strength,
          FOOT_PLANT_MAX_DOWN,
          FOOT_PLANT_MAX_UP,
        );
      }
      entry.offset = THREE.MathUtils.damp(entry.offset, targetOffset, 14, delta);
      if (Math.abs(entry.offset) < 0.0005) return;
      bone.getWorldPosition(temps.world);
      temps.targetWorld.copy(temps.world).y += entry.offset;
      bone.parent.worldToLocal(temps.local.copy(temps.world));
      bone.parent.worldToLocal(temps.targetLocal.copy(temps.targetWorld));
      temps.localDelta.copy(temps.targetLocal).sub(temps.local);
      bone.position.add(temps.localDelta);
      entry.correction.copy(temps.localDelta);
    });
  }

  function applyVisualGrounding(delta, action, requestedClip) {
    const motionState = grounding?.motionRef?.current;
    const adapter = grounding?.collisionAdapter;
    const enabled = asset.visualGrounding === true;
    const group = groupRef.current;
    const canGround = Boolean(
      enabled
      && adapter
      && group
      && motionState
      && !motionState.airborne
      && !motionState.swimming
      && Math.abs(motionState.groundDistance ?? 0) <= 0.28,
    );

    const clip = action?.getClip?.();
    const phase = actionPhase(action);
    const profile = getFootContactProfile(assetId, clip?.name || requestedClip);
    const sampled = {};
    let targetOffset = 0;
    if (canGround) {
      const deltas = [];
      Object.entries(footGrounding).forEach(([side, entry]) => {
        if (side === 'stepId' || !entry.bone) return;
        entry.bone.getWorldPosition(probeWorld);
        const ground = adapter.groundInfo(probeWorld, { supportRadius: 0.07 });
        const footGap = probeWorld.y - ground.y;
        const phaseContact = profile ? footPhasePulse(phase, profile[side], profile.width) : 0.5;
        const proximity = THREE.MathUtils.clamp(1 - Math.abs(footGap) / VISUAL_GROUNDING_PROBE_RANGE, 0, 1);
        sampled[side] = {
          groundY: ground.y,
          phaseContact,
          contact: proximity * (0.34 + phaseContact * 0.66),
        };
        if (Math.abs(footGap) <= VISUAL_GROUNDING_PROBE_RANGE || phaseContact > 0.55) {
          deltas.push((ground.y - getVisualSoleOffset(assetId, side)) - probeWorld.y);
        }
      });
      if (deltas.length) {
        const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
        targetOffset = THREE.MathUtils.clamp(
          Math.max(0, averageDelta),
          0,
          VISUAL_GROUNDING_MAX_UP,
        );
      }
    }

    visualGroundOffset = THREE.MathUtils.damp(visualGroundOffset, targetOffset, 18, delta);
    if (group) group.position.y = (asset.yOffset || 0) + visualGroundOffset;

    if (isDarwin) {
      const contacts = {};
      let lastStep = null;
      Object.entries(footGrounding).forEach(([side, entry]) => {
        if (side === 'stepId' || !entry.bone) return;
        entry.bone.getWorldPosition(probeWorld);
        const ground = adapter?.groundInfo?.(probeWorld, { supportRadius: 0.07 }) || { y: probeWorld.y };
        const sample = sampled[side] || {};
        const proximity = THREE.MathUtils.clamp(1 - Math.abs(probeWorld.y - ground.y) / VISUAL_GROUNDING_PROBE_RANGE, 0, 1);
        const phaseContact = profile ? footPhasePulse(phase, profile[side], profile.width) : (sample.phaseContact ?? 0.5);
        const rawContact = canGround ? proximity * (0.34 + phaseContact * 0.66) : 0;
        entry.contact = THREE.MathUtils.damp(entry.contact, rawContact, 20, delta);
        const down = entry.contact > 0.68 && phaseContact > 0.45 && (motionState?.speed || 0) > 0.45;
        entry.pulse = Math.max(0, entry.pulse - delta * 5.6);
        if (down && !entry.wasDown) {
          entry.pulse = 1;
          footGrounding.stepId += 1;
          lastStep = {
            side,
            id: footGrounding.stepId,
            x: probeWorld.x,
            y: ground.y + 0.018,
            z: probeWorld.z,
            intensity: THREE.MathUtils.clamp(0.32 + (motionState?.speed || 0) / 7.5, 0.22, 1),
            time: typeof performance !== 'undefined' ? performance.now() / 1000 : 0,
          };
        }
        entry.wasDown = down;
        contacts[side] = {
          x: probeWorld.x,
          y: probeWorld.y,
          z: probeWorld.z,
          groundY: ground.y,
          contact: entry.contact,
          pulse: entry.pulse,
          phase,
          active: canGround,
        };
      });
      updateRuntimeFootContacts(lastStep ? { ...contacts, lastStep } : contacts);
    }

    if (footDebugEnabled() && isDarwin) {
      window.__darwinFootDebug = {
        ...(window.__darwinFootDebug || {}),
        [assetId]: {
          clip: clip?.name || requestedClip || null,
          phase,
          offset: visualGroundOffset,
          left: footGrounding.left.contact,
          right: footGrounding.right.contact,
          lastStepId: footGrounding.stepId,
          canGround,
        },
      };
    }
  }

  return {
    update(delta, activeAction, activeRequest) {
      applyFootPlanting(delta);
      applyVisualGrounding(delta, activeAction, activeRequest);
    },
    dispose() {},
  };
}
