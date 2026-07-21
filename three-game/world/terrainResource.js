import * as THREE from 'three';
import { getRegionTerrainConfig, movementTerrainHeight } from './terrain';
import { getCachedTerrainGeometry, resolveTerrainSegments } from './terrainGeometry';

const RESOURCE_CACHE_LIMIT = 3;
const resources = new Map();
const pending = new Map();
let worker = null;
let requestCounter = 0;
let useCounter = 0;

function resolveColliderSegments(regionId, authoredSegments) {
  // Movement uses the smoother analytic surface, so a ~0.8-1 m heightfield
  // cell remains finer than the character footprint while making Rapier body
  // creation cheap enough to stage during arrival.
  const cap = regionId === 'N_SHORE' || regionId === 'PENAL_COLONY' ? 96 : 128;
  return Math.min(cap, Math.max(96, Math.floor(authoredSegments || 96)));
}

function resourceKey(regionId, segmentCap) {
  const config = getRegionTerrainConfig(regionId);
  return `${regionId}:${resolveTerrainSegments(config.segments, segmentCap)}`;
}

function buildGeometry(payload) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(payload.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(payload.colors, 3));
  geometry.setAttribute('roughnessMix', new THREE.BufferAttribute(payload.roughness, 1));
  geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
  const centerY = (payload.minimumHeight + payload.maximumHeight) * 0.5;
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-payload.width * 0.5, payload.minimumHeight, -payload.depth * 0.5),
    new THREE.Vector3(payload.width * 0.5, payload.maximumHeight, payload.depth * 0.5),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, centerY, 0),
    Math.hypot(
      payload.width * 0.5,
      (payload.maximumHeight - payload.minimumHeight) * 0.5,
      payload.depth * 0.5,
    ),
  );
  geometry.userData.terrainSegments = payload.segments;
  geometry.userData.terrainRegionId = payload.regionId;
  return geometry;
}

function pruneResources(protectedKey = null) {
  if (resources.size <= RESOURCE_CACHE_LIMIT) return;
  const candidates = [...resources.entries()]
    .filter(([key, entry]) => key !== protectedKey && entry.status === 'ready')
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (resources.size > RESOURCE_CACHE_LIMIT && candidates.length) {
    const [key, entry] = candidates.shift();
    entry.value?.geometryEntry?.geometry?.dispose?.();
    resources.delete(key);
  }
}

function ensureWorker() {
  if (worker || typeof window === 'undefined' || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    const { requestId, payload, error } = event.data || {};
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    const entry = resources.get(request.key);
    if (!entry) return;
    if (error) {
      recoverRequest(request, entry, error);
      return;
    }
    const geometry = buildGeometry(payload);
    entry.status = 'ready';
    entry.value = {
      key: request.key,
      preparation: {
        mode: 'worker',
        durationMs: payload.preparationDurationMs,
      },
      geometryEntry: {
        key: request.key,
        geometry,
        segments: payload.segments,
      },
      heightfield: {
        subdivisionsX: payload.colliderSegments,
        subdivisionsZ: payload.colliderSegments,
        heights: payload.colliderHeights,
        scale: { x: payload.width, y: 1, z: payload.depth },
      },
    };
    entry.lastUsed = ++useCounter;
    request.resolve(entry.value);
    pruneResources(request.key);
  };
  worker.onerror = event => {
    for (const [requestId, request] of pending) {
      pending.delete(requestId);
      const entry = resources.get(request.key);
      if (entry) {
        recoverRequest(request, entry, event?.message || 'worker load error');
      }
    }
    worker?.terminate?.();
    worker = null;
  };
  return worker;
}

function synchronousHeightfield(regionId, segmentCap = null) {
  const config = getRegionTerrainConfig(regionId);
  const colliderSegments = Math.min(
    resolveColliderSegments(regionId, config.segments),
    Number.isFinite(segmentCap) ? Math.max(32, Math.floor(segmentCap)) : Infinity,
  );
  const side = colliderSegments + 1;
  const heights = new Float32Array(side * side);
  let index = 0;
  for (let xIndex = 0; xIndex < side; xIndex += 1) {
    const x = -config.width * 0.5 + (xIndex / colliderSegments) * config.width;
    for (let zIndex = 0; zIndex < side; zIndex += 1) {
      const z = -config.depth * 0.5 + (zIndex / colliderSegments) * config.depth;
      heights[index++] = movementTerrainHeight(x, z, regionId);
    }
  }
  return {
    subdivisionsX: colliderSegments,
    subdivisionsZ: colliderSegments,
    heights,
    scale: { x: config.width, y: 1, z: config.depth },
  };
}

function synchronousResource(regionId, segmentCap, key, { degraded = false } = {}) {
  const startedAt = performance.now();
  const fallbackCap = degraded
    ? Math.min(64, Number.isFinite(segmentCap) ? segmentCap : 64)
    : segmentCap;
  const value = {
    key,
    geometryEntry: getCachedTerrainGeometry(regionId, fallbackCap),
    heightfield: synchronousHeightfield(regionId, degraded ? 64 : null),
    degraded,
  };
  value.preparation = {
    mode: degraded ? 'reduced-main-thread-fallback' : 'main-thread',
    durationMs: performance.now() - startedAt,
  };
  return value;
}

function recoverRequest(request, entry, reason = 'unknown worker error') {
  const [regionId, segments] = request.key.split(':');
  console.error(`[terrain-resource] ${regionId}: ${reason}. Using reduced-detail terrain fallback.`);
  const value = synchronousResource(regionId, Number(segments), request.key, { degraded: true });
  entry.status = 'ready';
  entry.error = null;
  entry.value = value;
  entry.lastUsed = ++useCounter;
  request.resolve(value);
}

export function prepareTerrainResource(regionId, segmentCap = null) {
  const key = resourceKey(regionId, segmentCap);
  const existing = resources.get(key);
  if (existing) {
    existing.lastUsed = ++useCounter;
    return existing.promise;
  }
  const activeWorker = ensureWorker();
  if (!activeWorker) {
    const value = synchronousResource(regionId, segmentCap, key, {
      degraded: typeof window !== 'undefined',
    });
    const entry = { status: 'ready', value, promise: Promise.resolve(value), lastUsed: ++useCounter };
    resources.set(key, entry);
    pruneResources(key);
    return entry.promise;
  }
  const requestId = ++requestCounter;
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  resources.set(key, { status: 'pending', promise, value: null, error: null, lastUsed: ++useCounter });
  pending.set(requestId, { key, resolve });
  activeWorker.postMessage({ requestId, regionId, segmentCap });
  return promise;
}

export function readTerrainResource(regionId, segmentCap = null) {
  const key = resourceKey(regionId, segmentCap);
  const entry = resources.get(key);
  if (!entry) {
    const promise = prepareTerrainResource(regionId, segmentCap);
    const created = resources.get(key);
    if (created?.status === 'ready') return created.value;
    throw promise;
  }
  entry.lastUsed = ++useCounter;
  if (entry.status === 'ready') return entry.value;
  if (entry.status === 'error') {
    resources.delete(key);
    return synchronousResource(regionId, segmentCap, key);
  }
  throw entry.promise;
}

export function terrainResourceIsReady(regionId, segmentCap = null) {
  return resources.get(resourceKey(regionId, segmentCap))?.status === 'ready';
}
