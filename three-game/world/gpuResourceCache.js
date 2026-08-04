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

// Sized to hold several regions' worth of entries at once. Too small is worse
// than no cache at all: a limit of 96 thrashed across three consumers and drove
// linked programs per travel from 49 back up to 137, because eviction disposes
// and disposal is exactly what releases the program.
const DEFAULT_LIMIT = 640;

const entries = new Map();
let limit = DEFAULT_LIMIT;

function evictOldest() {
  // Map preserves insertion order and every hit re-inserts, so the first key is
  // the least recently used.
  const oldestKey = entries.keys().next().value;
  if (oldestKey === undefined) return;
  const entry = entries.get(oldestKey);
  entries.delete(oldestKey);
  try {
    entry?.dispose?.(entry.value);
  } catch {
    // A disposer that throws must not strand the cache above its limit.
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
  entries.set(key, { value, dispose: options.dispose, hits: 0 });
  while (entries.size > limit) evictOldest();
  return value;
}

export function setGpuResourceCacheLimit(next) {
  limit = Math.max(1, Math.floor(next) || DEFAULT_LIMIT);
  while (entries.size > limit) evictOldest();
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
  for (const entry of entries.values()) hits += entry.hits;
  return { size: entries.size, limit, hits };
}
