import * as THREE from 'three';
import { publishRuntimeFootStep, updateRuntimeFootContacts } from '../../store';
import {
  footPhasePulse,
  getFootContactProfile,
  getFootProbePatterns,
  getVisualSoleOffset,
} from './gaitProfiles';

const VISUAL_GROUNDING_MAX_UP = 0.1;
const VISUAL_GROUNDING_OBSTACLE_MAX_UP = 0.9;
const VISUAL_GROUNDING_FAST_OBSTACLE_MAX_UP = 0.58;
const VISUAL_GROUNDING_SPEED_REFERENCE = 8.6;
const VISUAL_GROUNDING_PROBE_RANGE = 0.36;

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

function speedScaledObstacleLiftCap(speed, slowCap, fastCap) {
  const speedRatio = THREE.MathUtils.clamp((speed || 0) / VISUAL_GROUNDING_SPEED_REFERENCE, 0, 1);
  return THREE.MathUtils.lerp(slowCap, fastCap, speedRatio);
}

function visibleGroundY(ground, fallback = 0) {
  if (!ground) return fallback;
  if (ground.source === 'authored-obstacle' || ground.source === 'physics-prop') {
    return Number.isFinite(ground.y) ? ground.y : fallback;
  }
  if (Number.isFinite(ground.terrainY)) return ground.terrainY;
  return Number.isFinite(ground.y) ? ground.y : fallback;
}

export function createFootContactRig({
  assetId,
  asset,
  scene,
  groupRef,
  grounding,
}) {
  const isDarwin = String(assetId).startsWith('darwin');
  const footGrounding = {
    left: { bone: null, contact: 0, pulse: 0, wasDown: false },
    right: { bone: null, contact: 0, pulse: 0, wasDown: false },
    stepId: 0,
  };
  const probeWorld = new THREE.Vector3();
  const probePatterns = getFootProbePatterns(assetId);
  let visualGroundOffset = 0;

  scene.traverse(object => {
    if (!object.isBone) return;
    Object.entries(probePatterns).forEach(([side, patterns]) => {
      if (footGrounding[side]?.bone) return;
      if (patterns.some(pattern => pattern.test(object.name))) footGrounding[side].bone = object;
    });
  });

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
      let obstacleProbeCount = 0;
      Object.entries(footGrounding).forEach(([side, entry]) => {
        if (side === 'stepId' || !entry.bone) return;
        entry.bone.getWorldPosition(probeWorld);
        const ground = adapter.groundInfo(probeWorld, { supportRadius: 0.07 });
        if (ground.source === 'authored-obstacle') obstacleProbeCount += 1;
        const contactY = visibleGroundY(ground, probeWorld.y);
        const footGap = probeWorld.y - contactY;
        const phaseContact = profile ? footPhasePulse(phase, profile[side], profile.width) : 0.5;
        const proximity = THREE.MathUtils.clamp(1 - Math.abs(footGap) / VISUAL_GROUNDING_PROBE_RANGE, 0, 1);
        sampled[side] = {
          groundY: contactY,
          groundSource: ground.source,
          phaseContact,
          contact: proximity * (0.34 + phaseContact * 0.66),
        };
        const plantedWeight = profile
          ? phaseContact
          : ((motionState?.speed || 0) < 0.6 ? 1 : 0);
        if (plantedWeight > 0.08) {
          deltas.push({
            value: (contactY - getVisualSoleOffset(assetId, side)) - probeWorld.y,
            weight: plantedWeight,
          });
        }
      });
      if (deltas.length) {
        const totalWeight = deltas.reduce((sum, item) => sum + item.weight, 0);
        const averageDelta = deltas.reduce((sum, item) => sum + item.value * item.weight, 0)
          / Math.max(0.001, totalWeight);
        const maxUp = obstacleProbeCount > 0
          ? speedScaledObstacleLiftCap(motionState?.speed, VISUAL_GROUNDING_OBSTACLE_MAX_UP, VISUAL_GROUNDING_FAST_OBSTACLE_MAX_UP)
          : VISUAL_GROUNDING_MAX_UP;
        targetOffset = THREE.MathUtils.clamp(
          visualGroundOffset + averageDelta,
          0,
          maxUp,
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
        const contactY = Number.isFinite(sample.groundY)
          ? sample.groundY
          : visibleGroundY(ground, probeWorld.y);
        const proximity = THREE.MathUtils.clamp(1 - Math.abs(probeWorld.y - contactY) / VISUAL_GROUNDING_PROBE_RANGE, 0, 1);
        const phaseContact = profile ? footPhasePulse(phase, profile[side], profile.width) : (sample.phaseContact ?? 0.5);
        const rawContact = canGround ? proximity * (0.34 + phaseContact * 0.66) : 0;
        entry.contact = THREE.MathUtils.damp(entry.contact, rawContact, 20, delta);
        // Locomotion phase owns timing; ground projection owns placement. A
        // proximity requirement here made missing IK suppress real footfalls.
        const down = Boolean(
          canGround
          && profile
          && phaseContact > 0.52
          && (motionState?.speed || 0) > 0.45,
        );
        entry.pulse = Math.max(0, entry.pulse - delta * 5.6);
        if (down && !entry.wasDown) {
          entry.pulse = 1;
          lastStep = {
            side,
            x: probeWorld.x,
            y: contactY + 0.018,
            z: probeWorld.z,
            groundSource: ground.source || 'terrain-function',
            target: ground.obstacle || null,
            intensity: THREE.MathUtils.clamp(0.32 + (motionState?.speed || 0) / 7.5, 0.22, 1),
            time: typeof performance !== 'undefined' ? performance.now() / 1000 : 0,
          };
        }
        entry.wasDown = down;
        contacts[side] = {
          x: probeWorld.x,
          y: probeWorld.y,
          z: probeWorld.z,
          groundY: contactY,
          groundSource: ground.source,
          contact: entry.contact,
          pulse: entry.pulse,
          phase,
          active: canGround,
        };
      });
      updateRuntimeFootContacts(contacts);
      if (lastStep) {
        footGrounding.stepId = publishRuntimeFootStep(lastStep).id;
      }
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
      applyVisualGrounding(delta, activeAction, activeRequest);
    },
    dispose() {},
  };
}
