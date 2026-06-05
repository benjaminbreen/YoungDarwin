'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getModelAsset, modelAssets } from '../../modelAssets';

function normalizeImportedMaterials(scene, asset) {
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
      material.needsUpdate = true;
    });
  });
}

function normalizeClipName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function GLBPrimitive({ asset, animationSelector = null }) {
  const group = useRef(null);
  const activeAction = useRef(null);
  const activeRequest = useRef(null);
  const animationSelectorRef = useRef(animationSelector);
  const warnedMissing = useRef(new Set());
  const { scene, animations } = useGLTF(asset.path);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const actions = useMemo(() => {
    const result = {};
    animations.forEach(clip => {
      result[clip.name] = mixer.clipAction(clip, scene);
    });
    return result;
  }, [animations, mixer, scene]);
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

  const publishAnimationDebug = useCallback((requested, action) => {
    if (typeof window === 'undefined') return;
    window.__darwinAnimationDebug = {
      requested,
      active: action?.getClip?.()?.name || null,
      available: Object.keys(actions),
    };
  }, [actions]);

  const playAnimation = useCallback((requestedClip, fade = 0.18) => {
    const next = getAction(requestedClip);
    if (!next) {
      if (requestedClip && !warnedMissing.current.has(requestedClip)) {
        warnedMissing.current.add(requestedClip);
        console.warn(`Missing GLB animation clip: ${requestedClip}`, Object.keys(actions));
      }
      publishAnimationDebug(requestedClip, activeAction.current);
      return false;
    }
    if (next === activeAction.current && requestedClip === activeRequest.current) {
      return true;
    }
    const previous = activeAction.current;
    next.enabled = true;
    next.clampWhenFinished = false;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (previous && previous !== next) {
      previous.crossFadeTo(next, fade, false);
    } else {
      next.fadeIn(fade);
    }
    next.play();
    activeAction.current = next;
    activeRequest.current = requestedClip;
    publishAnimationDebug(requestedClip, next);
    return true;
  }, [actions, getAction, publishAnimationDebug]);

  useEffect(() => {
    normalizeImportedMaterials(scene, asset);
  }, [asset, scene]);

  useEffect(() => {
    animationSelectorRef.current = animationSelector;
  }, [animationSelector]);

  useEffect(() => {
    const first = getAction('idle') ? 'idle' : animations[0]?.name;
    const selector = animationSelectorRef.current;
    const initial = selector ? selector() : first;
    Object.values(actions).forEach(item => item?.stop());
    playAnimation(initial || first, 0.15);
    return () => {
      Object.values(actions).forEach(item => item?.stop());
      activeAction.current = null;
      activeRequest.current = null;
    };
  }, [actions, animations, getAction, playAnimation]);

  useFrame((_, delta) => {
    if (!animations.length) return;
    mixer.update(delta);
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
    >
      <primitive object={scene} />
    </group>
  );
}

export function ModelAsset({ id, fallback = null, animationSelector = null }) {
  const asset = getModelAsset(id);
  if (!asset?.enabled) return fallback;

  return (
    <Suspense fallback={fallback}>
      <GLBPrimitive asset={asset} animationSelector={animationSelector} />
    </Suspense>
  );
}

Object.values(modelAssets)
  .filter(asset => asset.enabled)
  .forEach(asset => {
    useGLTF.preload(asset.path);
  });
