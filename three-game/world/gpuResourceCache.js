// Three refcounts shader programs and releases one the moment the last
// material using it is disposed. A zone change disposes every material in the
// departing region, so the destination re-links programs the driver had already
// compiled: a measured 115 of 123 links on a return trip were byte-identical to
// programs from earlier in the same session, and the driver spent 1.6-3.9s
// recompiling them behind the travel chart.
//
// Keeping the material instances alive across the change keeps the programs.
// This is an LRU of built GPU resources (geometry + material bundles), keyed on
// everything that went into building them, so a cache hit is by construction
// identical to what the caller would have rebuilt.
//
// Measure with scripts/perf-lab/shader-probe.mjs: programsLinked and
// programsDeleted per travel are the numbers this exists to drive down.

// The cache used to retain 640 entries without knowing whether any were still
// mounted. That made eviction unsafe and allowed every visited region to remain
// GPU-resident. Entries now carry leases: mounted consumers are pinned, while
// travel can discard everything belonging only to the departed region.
export const DEFAULT_GPU_RESOURCE_CACHE_LIMIT = 384;
export const CONSTRAINED_GPU_RESOURCE_CACHE_LIMIT = 160;

const entries = new Map();
let limit = DEFAULT_GPU_RESOURCE_CACHE_LIMIT;

function disposeEntry(key, entry) {
  entries.delete(key);
  try {
    entry?.dispose?.(entry.value);
  } catch {
    // A disposer that throws must not strand the cache above its limit.
  }
}

function evictOldestInactive() {
  // Map preserves insertion order and every hit re-inserts, so the first key is
  // the least recently used.
  for (const [key, entry] of entries) {
    if (entry.activeRefs > 0) continue;
    disposeEntry(key, entry);
    return true;
  }
  return false;
}

function trimToLimit() {
  while (entries.size > limit && evictOldestInactive()) {
    // Keep trimming until only live entries remain or the limit is met.
  }
}

export function cachedGpuResource(key, factory, options = {}) {
  const existing = entries.get(key);
  if (existing) {
    entries.delete(key);
    entries.set(key, existing);
    existing.hits += 1;
    return existing.value;
  }
  const value = factory();
  entries.set(key, {
    value,
    dispose: options.dispose,
    hits: 0,
    activeRefs: 0,
  });
  // Consumers acquire their lease in a React effect. Trimming synchronously
  // here could dispose the just-created value between render and that effect.
  // Release, travel sweep, and explicit limit changes are the safe trim points.
  return value;
}

// Pin a cached resource for as long as its scene consumer is mounted. Returns
// an idempotent release callback suitable for a React effect cleanup.
export function retainGpuResource(key) {
  const entry = entries.get(key);
  if (!entry) return () => {};
  entry.activeRefs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = entries.get(key);
    if (!current) return;
    current.activeRefs = Math.max(0, current.activeRefs - 1);
    trimToLimit();
  };
}

// Dispose cache entries no mounted scene still references. `retainRecent` is
// available for desktop experiments, but travel deliberately passes zero: the
// destination is already mounted and leased, so every inactive entry belongs
// to a departed/abandoned scene and is safe to release.
export function sweepInactiveGpuResources({ retainRecent = 0 } = {}) {
  const inactive = Array.from(entries.entries())
    .filter(([, entry]) => entry.activeRefs === 0);
  const keep = Math.max(0, Math.floor(retainRecent) || 0);
  const disposable = keep > 0 ? inactive.slice(0, -keep) : inactive;
  let disposed = 0;
  for (const [key, entry] of disposable) {
    disposeEntry(key, entry);
    disposed += 1;
  }
  trimToLimit();
  return disposed;
}

export function setGpuResourceCacheLimit(next) {
  limit = Math.max(1, Math.floor(next) || DEFAULT_GPU_RESOURCE_CACHE_LIMIT);
  trimToLimit();
}

export function clearGpuResourceCache() {
  for (const entry of entries.values()) {
    try {
      entry.dispose?.(entry.value);
    } catch {
      // As above.
    }
  }
  entries.clear();
}

export function gpuResourceCacheStats() {
  let hits = 0;
  let activeEntries = 0;
  let activeRefs = 0;
  for (const entry of entries.values()) {
    hits += entry.hits;
    activeRefs += entry.activeRefs;
    if (entry.activeRefs > 0) activeEntries += 1;
  }
  return {
    size: entries.size,
    limit,
    hits,
    activeEntries,
    activeRefs,
  };
}
