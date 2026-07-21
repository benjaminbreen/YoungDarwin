import { cacheEcology } from './index';
import { getBorderVistas } from '../vistas';

const resources = new Map();
const pending = new Map();
let worker = null;
let requestCounter = 0;

function regionIds(regionId) {
  return [...new Set([
    regionId,
    ...getBorderVistas(regionId).map(vista => vista.toRegionId),
  ].filter(Boolean))];
}

function hydrate(payload) {
  const startedAt = performance.now();
  const definitions = (payload.definitions || []).map(({ zoneId, ecology }) => ({
    zoneId,
    ecology: cacheEcology(zoneId, ecology) || ecology,
  }));
  return {
    regionId: payload.regionId,
    definitions,
    preparation: {
      ...payload.preparation,
      hydrateDurationMs: performance.now() - startedAt,
    },
  };
}

function degradedEcology(zoneId) {
  return {
    zoneId,
    stream: true,
    flora: [],
    proceduralFlora: [],
    interactiveFlora: [],
    rocks: [],
    surfaceLitter: [],
    props: [],
  };
}

function recoverRequest(request, entry, reason = 'unknown worker error') {
  // A synchronous fallback here is worse than a sparse destination: several
  // authored ecology builders perform thousands of terrain/scatter samples
  // and can freeze both the chart and the main thread for seconds. Preserve a
  // playable terrain-only failure mode and surface the worker error instead.
  console.error(`[ecology-resource] ${request.regionId}: ${reason}. Using sparse ecology fallback.`);
  const value = {
    regionId: request.regionId,
    definitions: regionIds(request.regionId).map(zoneId => ({
      zoneId,
      ecology: cacheEcology(zoneId, degradedEcology(zoneId)),
    })),
    preparation: { mode: 'sparse-worker-fallback', durationMs: 0, reason },
  };
  entry.status = 'ready';
  entry.value = value;
  request.resolve(value);
}

function ensureWorker() {
  if (worker || typeof window === 'undefined' || typeof Worker === 'undefined') return worker;
  worker = new Worker(new URL('./ecologyWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    const { requestId, payload, error } = event.data || {};
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    const entry = resources.get(request.regionId);
    if (!entry) return;
    if (error) {
      recoverRequest(request, entry, error);
      return;
    }
    const value = hydrate(payload);
    entry.status = 'ready';
    entry.value = value;
    request.resolve(value);
  };
  worker.onerror = event => {
    for (const [requestId, request] of pending) {
      pending.delete(requestId);
      const entry = resources.get(request.regionId);
      if (entry) recoverRequest(request, entry, event?.message || 'worker load error');
    }
    worker?.terminate?.();
    worker = null;
  };
  return worker;
}

export function prepareRegionEcologyResource(regionId) {
  const existing = resources.get(regionId);
  if (existing) return existing.promise;
  const activeWorker = ensureWorker();
  if (!activeWorker) {
    const value = {
      regionId,
      definitions: regionIds(regionId).map(zoneId => ({
        zoneId,
        ecology: cacheEcology(zoneId, degradedEcology(zoneId)),
      })),
      preparation: {
        mode: 'sparse-worker-fallback',
        durationMs: 0,
        reason: 'Web Workers are unavailable',
      },
    };
    const entry = { status: 'ready', value, promise: Promise.resolve(value) };
    resources.set(regionId, entry);
    return entry.promise;
  }
  const requestId = ++requestCounter;
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  resources.set(regionId, { status: 'pending', value: null, promise });
  pending.set(requestId, { regionId, resolve });
  activeWorker.postMessage({ requestId, regionId });
  return promise;
}

export function readRegionEcologyResource(regionId) {
  const entry = resources.get(regionId);
  if (!entry) {
    const promise = prepareRegionEcologyResource(regionId);
    const created = resources.get(regionId);
    if (created?.status === 'ready') return created.value;
    throw promise;
  }
  if (entry.status === 'ready') return entry.value;
  throw entry.promise;
}

export function regionEcologyResourceIsReady(regionId) {
  return resources.get(regionId)?.status === 'ready';
}
