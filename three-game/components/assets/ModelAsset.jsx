'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getModelAsset, modelAssets } from '../../modelAssets';
import { applyFoliageMotion } from '../scene/ecology/foliageMotion';

function normalizeImportedMaterials(scene, asset, motion = null) {
  if (!asset.normalizeMaterials) return;
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.side = THREE.FrontSide;
      material.toneMapped = false;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.02);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.72);
      if (material.color) {
        material.color.lerp(new THREE.Color('#f1dfbd'), asset.materialLift || 0.18);
      }
      if (material.emissive) {
        material.emissive.set(asset.materialEmissive || '#241c12');
        material.emissiveIntensity = asset.materialEmissiveIntensity ?? 0.22;
      }
      if (motion) applyFoliageMotion(material, object.geometry, motion);
      material.needsUpdate = true;
    });
  });
}

function prepareImportedScene(scene) {
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return scene;
}

function applyDamageFlash(scene, strength = 0) {
  const amount = THREE.MathUtils.clamp(strength, 0, 1);
  const flashColor = new THREE.Color('#ff3b2f');
  scene.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      if (!material.userData.damageFlashBase) {
        material.userData.damageFlashBase = {
          color: material.color?.clone?.() || null,
          emissive: material.emissive?.clone?.() || null,
          emissiveIntensity: material.emissiveIntensity ?? 0,
        };
      }
      const base = material.userData.damageFlashBase;
      if (material.color && base.color) {
        material.color.copy(base.color).lerp(flashColor, amount * 0.78);
      }
      if (material.emissive) {
        material.emissive.copy(base.emissive || new THREE.Color('#000000')).lerp(flashColor, amount * 0.68);
        material.emissiveIntensity = base.emissiveIntensity + amount * 0.92;
      }
      material.needsUpdate = true;
    });
  });
}

function normalizeClipName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ONE_SHOT_CLIPS = new Set([
  'startWalking',
  'stopWalking',
  'standToCover',
  'coverToStand',
  'turnLeft90',
  'turnRight90',
  'runToStop',
  'standingJump',
  'runningJump',
  'jumpTakeoff',
  'jump',
  'runJump',
  'climbJump',
  'sprintToWallClimb',
  'climbingUpWall',
  'highJump',
  'fallingToRoll',
  'fallingToLanding',
  'landing',
  'runningLanding',
  'hardLanding',
  'land',
  'jumpDown',
  'bigJumpDown',
  'jumpDownHandhold',
  'climb',
  'teeter',
  'trip',
  'gettingUp',
  'hitReaction',
  'bigHitFall',
  'shoulderHitAndFall',
  'fallingForwardDeath',
  'changeItem',
  'fireRifle',
  'swingHammer',
  'swingNet',
  'gather',
  'write',
  'kneelInspect',
  'standingInspectDownward',
  'lookAround',
  'lookAroundShort',
  'point',
  'pray',
  'injuredStandingJump',
  'injuredRunJump',
  'injuredTurnLeft',
  'injuredTurnRight',
  'injuredWalkLeftTurn',
  'injuredWalkRightTurn',
  'injuredRunLeftTurn',
  'injuredRunRightTurn',
].map(normalizeClipName));

const CLIP_SETTINGS = {
  jumpLoop: { loop: true, fade: 0.06 },
  standingJumpHold: { loop: true, fade: 0.05 },
  runningJumpHold: { loop: true, fade: 0.05 },
  fallingIdle: { loop: true, fade: 0.08 },
  idle: { loop: true, fade: 0.22 },
  exhaustedIdle: { loop: true, fade: 0.24 },
  injuredIdle: { loop: true, fade: 0.22 },
  injuredHurtingIdle: { loop: true, fade: 0.2 },
  injuredStumbleIdle: { loop: true, fade: 0.18 },
  injuredWaveIdle: { loop: true, fade: 0.18 },
  walk: { loop: true, fade: 0.14 },
  run: { loop: true, fade: 0.12 },
  jog: { loop: true, fade: 0.14 },
  injuredWalk: { loop: true, fade: 0.16 },
  injuredRun: { loop: true, fade: 0.14 },
  crouchWalk: { loop: true, fade: 0.16 },
  crouchIdle: { loop: true, fade: 0.18 },
  crouchSneakLeft: { loop: true, fade: 0.14 },
  crouchSneakRight: { loop: true, fade: 0.14 },
  landing: { fade: 0.05 },
  runningLanding: { fade: 0.05 },
  hardLanding: { fade: 0.06 },
  fallingToLanding: { fade: 0.05 },
  sprintToWallClimb: { fade: 0.06 },
  climbingUpWall: { fade: 0.06 },
};

function isOneShotClip(name) {
  return ONE_SHOT_CLIPS.has(normalizeClipName(name));
}

function settingsForClip(name) {
  return CLIP_SETTINGS[name] || CLIP_SETTINGS[normalizeClipName(name)] || {};
}

function fadeForTransition(fromName, toName) {
  const to = normalizeClipName(toName);
  const from = normalizeClipName(fromName);
  const settings = settingsForClip(toName);
  if (settings.fade !== undefined) return settings.fade;
  if (to.includes('jump') || to.includes('land')) return 0.08;
  if (from.includes('jump') && (to.includes('landing') || to === 'land')) return 0.06;
  if (to === 'startwalking' || to === 'stopwalking' || to === 'runtostop') return 0.12;
  if (to.includes('run') || to.includes('walk') || from.includes('run') || from.includes('walk')) return 0.16;
  if (isOneShotClip(toName)) return 0.1;
  return 0.2;
}

function normalizeAnimationRequest(request) {
  if (!request) return null;
  if (typeof request === 'string') return { clip: request, timeScale: 1, fade: null, maxTime: null };
  return {
    clip: request.clip || request.name,
    timeScale: request.timeScale ?? 1,
    fade: request.fade ?? null,
    maxTime: request.maxTime ?? null,
  };
}

function modelBoundsDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return window.__enableModelBoundsDebug === true
    || new URLSearchParams(window.location.search).has('modelBoundsDebug');
}

function GLBPrimitive({ assetId, asset, animationSelector = null, motion = null, damageFlash = 0, reflect = false }) {
  const group = useRef(null);
  const activeAction = useRef(null);
  const activeRequest = useRef(null);
  const animationSelectorRef = useRef(animationSelector);
  const warnedMissing = useRef(new Set());
  const lastBoundsDebugAt = useRef(0);
  const { scene, animations } = useGLTF(asset.path);
  const importedScene = useMemo(() => prepareImportedScene(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(importedScene), [importedScene]);
  const debugBounds = useMemo(() => new THREE.Box3(), []);
  const debugSize = useMemo(() => new THREE.Vector3(), []);
  const debugCenter = useMemo(() => new THREE.Vector3(), []);
  const actions = useMemo(() => {
    const result = {};
    animations.forEach(clip => {
      result[clip.name] = mixer.clipAction(clip, importedScene);
    });
    return result;
  }, [animations, importedScene, mixer]);
  const actionLookup = useMemo(() => {
    const lookup = new Map();
    Object.entries(actions).forEach(([key, action]) => {
      if (!action) return;
      const clipName = action.getClip()?.name || key;
      lookup.set(key, action);
      lookup.set(clipName, action);
      lookup.set(normalizeClipName(key), action);
      lookup.set(normalizeClipName(clipName), action);
    });
    return lookup;
  }, [actions]);

  const getAction = useCallback((name) => {
    if (!name) return null;
    return actionLookup.get(name) || actionLookup.get(normalizeClipName(name)) || null;
  }, [actionLookup]);

  const publishAnimationDebug = useCallback((requested, action, metadata = {}) => {
    if (typeof window === 'undefined') return;
    const debugPayload = {
      assetId,
      requested,
      active: action?.getClip?.()?.name || null,
      timeScale: action?.getEffectiveTimeScale?.() ?? null,
      weight: action?.getEffectiveWeight?.() ?? null,
      ...metadata,
      available: Object.keys(actions),
    };
    window.__modelAnimationDebug = {
      ...(window.__modelAnimationDebug || {}),
      [assetId]: debugPayload,
    };
    if (assetId === 'darwin') {
      window.__darwinAnimationDebug = debugPayload;
    }
  }, [actions, assetId]);

  const playAnimation = useCallback((request) => {
    const normalized = normalizeAnimationRequest(request);
    const requestedClip = normalized?.clip;
    const fade = normalized?.fade ?? null;
    const timeScale = THREE.MathUtils.clamp(normalized?.timeScale ?? 1, 0.35, 1.8);
    const maxTime = Number.isFinite(normalized?.maxTime) ? Math.max(0, normalized.maxTime) : null;
    const next = getAction(requestedClip);
    if (!next) {
      if (requestedClip && !warnedMissing.current.has(requestedClip)) {
        warnedMissing.current.add(requestedClip);
        console.warn(`Missing GLB animation clip: ${requestedClip}`, Object.keys(actions));
      }
      publishAnimationDebug(requestedClip, activeAction.current, { missing: true });
      return false;
    }
    if (next === activeAction.current && requestedClip === activeRequest.current) {
      next.setEffectiveTimeScale(timeScale);
      if (maxTime !== null && next.time >= maxTime) {
        next.time = maxTime;
        next.paused = true;
      } else {
        next.paused = false;
      }
      publishAnimationDebug(requestedClip, next, { held: true, maxTime });
      return true;
    }
    const previous = activeAction.current;
    const previousName = previous?.getClip?.()?.name || activeRequest.current;
    const transitionFade = fade ?? fadeForTransition(previousName, requestedClip);
    const clipSettings = settingsForClip(requestedClip);
    const oneShot = clipSettings.loop === true ? false : isOneShotClip(requestedClip);
    next.enabled = true;
    next.paused = false;
    next.clampWhenFinished = oneShot;
    next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1);
    if (previous && previous !== next) {
      previous.crossFadeTo(next, transitionFade, false);
    } else {
      next.fadeIn(transitionFade);
    }
    next.play();
    activeAction.current = next;
    activeRequest.current = requestedClip;
    publishAnimationDebug(requestedClip, next, { fade: transitionFade, oneShot });
    return true;
  }, [actions, getAction, publishAnimationDebug]);

  useEffect(() => {
    normalizeImportedMaterials(importedScene, asset, motion);
  }, [asset, importedScene, motion]);

  useEffect(() => {
    applyDamageFlash(importedScene, damageFlash);
  }, [damageFlash, importedScene]);

  useEffect(() => {
    animationSelectorRef.current = animationSelector;
  }, [animationSelector]);

  useEffect(() => {
    const first = getAction('idle') ? 'idle' : animations[0]?.name;
    const selector = animationSelectorRef.current;
    const initial = selector ? selector() : first;
    Object.values(actions).forEach(item => item?.stop());
    playAnimation({ clip: initial || first, fade: 0.15 });
    return () => {
      Object.values(actions).forEach(item => item?.stop());
      activeAction.current = null;
      activeRequest.current = null;
    };
  }, [actions, animations, getAction, playAnimation]);

  useFrame((frameState, delta) => {
    if (!animations.length) return;
    mixer.update(delta);
    if ((assetId === 'darwin' || assetId === 'syms') && modelBoundsDebugEnabled()) {
      const elapsed = frameState.clock.elapsedTime;
      if (group.current && elapsed - lastBoundsDebugAt.current >= 0.3) {
        lastBoundsDebugAt.current = elapsed;
        debugBounds.setFromObject(group.current);
        debugBounds.getSize(debugSize);
        debugBounds.getCenter(debugCenter);
        window.__modelBoundsDebug = {
          ...(window.__modelBoundsDebug || {}),
          [assetId]: {
            height: debugSize.y,
            width: debugSize.x,
            depth: debugSize.z,
            center: [debugCenter.x, debugCenter.y, debugCenter.z],
            minY: debugBounds.min.y,
            maxY: debugBounds.max.y,
          },
        };
      }
    }
    const selector = animationSelectorRef.current;
    if (!selector) return;
    const nextClip = selector();
    if (!nextClip) return;
    playAnimation(nextClip);
  });

  return (
    <group
      ref={group}
      scale={asset.scale || 1}
      rotation={asset.rotation || [0, 0, 0]}
      position={[0, asset.yOffset || 0, 0]}
      userData={reflect ? { reflect: true } : undefined}
    >
      <primitive object={importedScene} />
    </group>
  );
}

export function ModelAsset({ id, fallback = null, animationSelector = null, motion = null, damageFlash = 0, reflect = false }) {
  const asset = getModelAsset(id);
  if (!asset?.enabled) return fallback;

  return (
    <Suspense fallback={fallback}>
      <GLBPrimitive assetId={id} asset={asset} animationSelector={animationSelector} motion={motion} damageFlash={damageFlash} reflect={reflect} />
    </Suspense>
  );
}

// Eager-preload the assets every zone needs. Zone-specific heavyweights
// (preload: false) load lazily behind their Suspense fallback instead of
// slowing down every initial load.
Object.values(modelAssets)
  .filter(asset => asset.enabled && asset.preload !== false)
  .forEach(asset => {
    useGLTF.preload(asset.path);
  });
