'use client';

import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';

// Parsed GLTF scenes and animation clips are large CPU-side objects. Keep the
// currently mounted set plus a modest recent-history window; zone revisits can
// still hit that window without retaining every model encountered in a long
// expedition. GPU resources derived from a GLTF have their own explicit
// owners/caches, so eviction deliberately clears only Drei's parsed-load cache.
const GLTF_RECENT_CACHE_LIMIT = 24;
const activePathRefs = new Map();
const recentPaths = new Map();
const pendingPaths = new Set();

function touchPath(path) {
  if (!path) return;
  recentPaths.delete(path);
  recentPaths.set(path, true);
}

function pruneParsedCache() {
  while (recentPaths.size > GLTF_RECENT_CACHE_LIMIT) {
    const candidate = Array.from(recentPaths.keys()).find(path => (
      !activePathRefs.has(path) && !pendingPaths.has(path)
    ));
    if (!candidate) return;
    recentPaths.delete(candidate);
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
  const gltf = useGLTF(path);
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
  return {
    active: activePathRefs.size,
    pending: pendingPaths.size,
    recent: recentPaths.size,
    limit: GLTF_RECENT_CACHE_LIMIT,
  };
}
