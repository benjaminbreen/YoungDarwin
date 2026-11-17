// KTX2 (Basis Universal) texture loading for the standalone world textures.
//
// A .ktx2 uploads through compressedTexImage2D — no decode, no runtime mipmap
// generation, a quarter of the bytes on the wire and a quarter of the GPU
// residency. Boot spends ~600ms in texSubImage2D without it.
//
// Two things shape this module:
//
// 1. Terrain materials are built outside React and need a texture on the spot,
//    but KTX2Loader.load() hands back nothing synchronous. So the baked set is
//    prefetched into a cache and the loader reads that cache synchronously — a
//    prefetch that lands after the material is built buys nothing.
//
//    The mounted renderer reports which compressed formats it can upload.
//    Reuse it to avoid allocating a second WebGL context at launch.
//
// 2. Every outcome that is not "cached and transcoded" falls back to the
//    original WebP: no WebGL2, no supported block format, a slow prefetch, a
//    failed transcode. A miss costs the old upload, never a blank texture.
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { KTX2_BAKED_TEXTURES, ktx2UrlFor } from './regions/materials/ktx2TextureManifest';
import { setCompressedTextureProvider } from './regions/materials/pbrTerrainTextures';

const TRANSCODER_PATH = '/assets/basis/';

let loader = null;
let started = false;
const cache = new Map();
const inFlight = new Map();

function ensureLoader(renderer) {
  if (!renderer) return null;
  if (started) return loader;
  started = true;
  try {
    loader = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(renderer);
  } catch {
    loader = null;
  }
  return loader;
}

// Failures are cached as null rather than retried: one 404, or one device with
// no supported block format, is a permanent answer for the session.
export function prefetchKtx2Textures(urls, renderer) {
  const active = ensureLoader(renderer);
  if (!active) return Promise.resolve();
  const pending = [];
  for (const url of urls) {
    if (cache.has(url) || inFlight.has(url)) continue;
    const task = active.loadAsync(url)
      .then(texture => { cache.set(url, texture); })
      .catch(() => { cache.set(url, null); })
      .finally(() => { inFlight.delete(url); });
    inFlight.set(url, task);
    pending.push(task);
  }
  return Promise.all(pending);
}

// Returns a clone, so two materials can repeat the same texture differently.
// Clones share the transcoded source, so this costs no extra GPU memory.
export function takeKtx2Texture(url) {
  const texture = cache.get(url);
  if (!texture) { misses += 1; return null; }
  hits += 1;
  const clone = texture.clone();
  clone.needsUpdate = true;
  return clone;
}

let hits = 0;
let misses = 0;

export function ktx2CacheStats() {
  let ready = 0;
  for (const value of cache.values()) if (value) ready += 1;
  return {
    ready, failed: cache.size - ready, pending: inFlight.size, enabled: Boolean(loader), hits, misses,
  };
}

export function disposeKtx2Loader() {
  for (const texture of cache.values()) texture?.dispose();
  cache.clear();
  inFlight.clear();
  loader?.dispose();
  loader = null;
  started = false;
}

// Installs this module as the terrain loader's compressed-texture source and
// warms the baked set. Main thread only — importing this module from the
// terrain worker's graph kills the worker, which is why the loader asks for a
// provider instead of importing one.
export function installKtx2TerrainProvider(renderer) {
  if (typeof window === 'undefined') return;
  setCompressedTextureProvider(url => {
    const ktx2Url = ktx2UrlFor(url);
    return ktx2Url ? takeKtx2Texture(ktx2Url) : null;
  });
  prefetchKtx2Textures([...KTX2_BAKED_TEXTURES].map(base => `${base}.ktx2`), renderer);
  window.__darwinKtx2 = ktx2CacheStats;
}
