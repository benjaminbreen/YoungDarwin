'use client';

import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { shareTextureSources } from './sharedTextureSources';
import {
  CONSTRAINED_HERO_TEXTURE_MAX_DIM,
  CONSTRAINED_TEXTURE_MAX_DIM,
  isConstrainedMemoryDevice,
} from '../../world/constrainedDevice';

// Parsed GLTF scenes and animation clips are large CPU-side objects. Keep the
// currently mounted set plus a modest recent-history window; zone revisits can
// still hit that window without retaining every model encountered in a long
// expedition.
//
// GPU copies are a separate story: three only frees a texture or geometry's
// GPU residency on dispose(), and nothing disposed unmounted-but-cached
// models. Measured (memory-probe.mjs): one round trip POB -> penal colony
// -> POB left 234 orphaned GPU textures and 241 orphaned geometries — the
// ratchet that walks an iPhone into Safari's ~1.4GB jetsam kill during
// travel. sweepInactiveGltfGpu() drops GPU copies for cached-but-unmounted
// models; the parse survives, so a revisit re-uploads instead of refetching.
const GLTF_RECENT_CACHE_LIMIT = 24;
// Six keeps Darwin's phased animation banks from thrashing between preload and
// mount while still bounding inactive parsed scenes tightly on mobile.
const CONSTRAINED_GLTF_RECENT_CACHE_LIMIT = 6;
const activePathRefs = new Map();
const recentPaths = new Map();
const pendingPaths = new Set();
const parsedByPath = new Map();

function disposeSceneGpu(scene) {
  if (!scene) return 0;
  let disposed = 0;
  const seenTextures = new Set();
  scene.traverse(object => {
    if (object.geometry) {
      object.geometry.dispose();
      disposed += 1;
    }
    if (object.skeleton?.boneTexture) {
      object.skeleton.boneTexture.dispose();
      object.skeleton.boneTexture = null;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && !seenTextures.has(value)) {
          seenTextures.add(value);
          value.dispose();
          disposed += 1;
        }
      }
      material.dispose();
    }
  });
  return disposed;
}

// Drop GPU residency for every cached model that is not mounted right now.
// Safe at any time: active models are refcounted and skipped, and a disposed
// texture/geometry re-uploads from the parsed CPU data on its next draw.
// Called when a travel unmounts the origin zone (that is where the two-zone
// memory peak lives) and again after arrival as a catch-all.
export function sweepInactiveGltfGpu() {
  let swept = 0;
  for (const [path, gltf] of parsedByPath) {
    if (activePathRefs.has(path) || pendingPaths.has(path)) continue;
    swept += disposeSceneGpu(gltf?.scene);
  }
  return swept;
}

function touchPath(path) {
  if (!path) return;
  recentPaths.delete(path);
  recentPaths.set(path, true);
}

function pruneParsedCache() {
  // A parsed GLB holds decoded bitmaps and typed arrays; two dozen of them
  // are fine on a laptop and a meaningful share of an iPhone tab's budget.
  const limit = isConstrainedMemoryDevice()
    ? CONSTRAINED_GLTF_RECENT_CACHE_LIMIT
    : GLTF_RECENT_CACHE_LIMIT;
  while (recentPaths.size > limit) {
    const candidate = Array.from(recentPaths.keys()).find(path => (
      !activePathRefs.has(path) && !pendingPaths.has(path)
    ));
    if (!candidate) return;
    recentPaths.delete(candidate);
    // GPU copies first: dropping only the parse reference leaked them for
    // the lifetime of the page.
    disposeSceneGpu(parsedByPath.get(candidate)?.scene);
    parsedByPath.delete(candidate);
    useGLTF.clear(candidate);
  }
}

export function noteGLTFLoadStarted(path) {
  if (path) pendingPaths.add(path);
}

export function noteGLTFLoadSettled(path) {
  if (!path) return;
  pendingPaths.delete(path);
  touchPath(path);
  pruneParsedCache();
}

export function noteGLTFLoadAbandoned(path) {
  if (path) pendingPaths.delete(path);
}

export function useTrackedGLTF(path) {
  // Every runtime GLB arrives through here, which makes it the one place that
  // can see a pack piece re-embedding an image another piece already loaded.
  // Hero characters are the only models inspected at portrait distance; on
  // constrained devices everything else caps at the lower texture dim.
  const heroModel = /darwin5|syms/.test(path || '');
  const gltf = shareTextureSources(
    useGLTF(path),
    heroModel ? CONSTRAINED_HERO_TEXTURE_MAX_DIM : CONSTRAINED_TEXTURE_MAX_DIM,
  );
  parsedByPath.set(path, gltf);
  useEffect(() => {
    pendingPaths.delete(path);
    activePathRefs.set(path, (activePathRefs.get(path) || 0) + 1);
    touchPath(path);
    pruneParsedCache();
    return () => {
      const next = (activePathRefs.get(path) || 1) - 1;
      if (next > 0) activePathRefs.set(path, next);
      else activePathRefs.delete(path);
      pruneParsedCache();
    };
  }, [path]);
  return gltf;
}

export function gltfCachePolicyStats() {
  const constrained = isConstrainedMemoryDevice();
  return {
    active: activePathRefs.size,
    pending: pendingPaths.size,
    recent: recentPaths.size,
    parsed: parsedByPath.size,
    limit: constrained ? CONSTRAINED_GLTF_RECENT_CACHE_LIMIT : GLTF_RECENT_CACHE_LIMIT,
  };
}
