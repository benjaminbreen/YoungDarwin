'use client';

// One question, asked from texture loaders: is this a device whose process
// will be killed for crossing a memory ceiling? iOS Safari gives a tab
// ~1.4GB including GPU allocations, and a single zone's full-resolution
// terrain sets decode to ~440MB — most of the budget before gameplay
// exists. Same signals as recommendedQualityFromDevice (Safari exposes no
// deviceMemory, so coarse pointer + compact screen carries iPhones).
//
// `?constrainedMemory=1` / `=0` overrides for testing either path anywhere.

// One zone's residency is ~157 textures, almost all already 1024 — a long
// tail of rock/prop/vegetation PBR sets at ~5MB each, ~430MB total. 512 is
// the cap that actually halves that (and matches the shipped "compact"
// 512 variants the Post Office Bay hero terrain layers already use). Hero
// characters, seen at portrait distance, keep 1024.
export const CONSTRAINED_TEXTURE_MAX_DIM = 512;
export const CONSTRAINED_HERO_TEXTURE_MAX_DIM = 1024;

let cached = null;

export function isConstrainedMemoryDevice() {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('constrainedMemory')) {
    cached = params.get('constrainedMemory') !== '0';
    return cached;
  }
  const memory = Number(window.navigator?.deviceMemory);
  const cores = Number(window.navigator?.hardwareConcurrency);
  const compactTouch = Boolean(window.matchMedia?.('(pointer: coarse)').matches)
    && Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight) <= 1024;
  cached = compactTouch
    || (Number.isFinite(memory) && memory > 0 && memory <= 4)
    || (Number.isFinite(cores) && cores > 0 && cores <= 4);
  return cached;
}
