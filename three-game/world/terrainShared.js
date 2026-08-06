import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Sea surface height. Defined here (the dependency root) and re-exported by
// world/terrain.js so rendering and physics share one constant.
export const WATER_LEVEL = -0.9;
// Deepest seabed Darwin can wade across on foot (armpit depth). Beyond this
// he can only arrive by falling in — and starts to drown.
export const WADE_DEPTH = 1.25;

export const elevationNoise = createNoise2D(() => 0.37);
export const surfaceNoise = createNoise2D(() => 0.73);
export const crackNoise = createNoise2D(() => 0.19);

export function ellipseDistance(x, z, sx, sz, ox = 0, oz = 0) {
  const nx = (x - ox) / sx;
  const nz = (z - oz) / sz;
  return Math.sqrt(nx * nx + nz * nz);
}

// Open-ocean falloff at the map's blocked sea edges.
//
// The obvious spelling — `max(smoothstep(-z, a, b), smoothstep(-x, a, b))` —
// draws the shelf edge as two ruler-straight lines meeting at a right angle,
// which is the one shape a reef never has. This takes the same per-edge lips
// and returns a rounded-box distance past them, warped by low-frequency noise,
// so the turquoise-to-blue line wanders and the corners curve.
//
// `edges` gives the lip position for each side in world units, measured from
// the origin outward; omit a side that stays shallow. `ramp` is the width of
// the drop, `warp` the peak wander of the lip.
export function oceanEdgeFalloff(x, z, { north, south, east, west, ramp = 11, warp = 6 } = {}) {
  const wander = warp > 0
    ? (elevationNoise(x * 0.028 + 17, z * 0.028 - 9) * 0.68
      + elevationNoise(x * 0.071 - 4, z * 0.071 + 21) * 0.32) * warp
    : 0;
  // Signed distance past each lip: positive once outside it.
  const past = [
    north == null ? null : -z - north + wander,
    south == null ? null : z - south + wander,
    east == null ? null : x - east + wander,
    west == null ? null : -x - west + wander,
  ].filter(v => v != null);
  if (!past.length) return 0;
  // Rounded-box exterior distance: hypot of the positive parts rounds the
  // corner where two edges meet; the max of the negatives handles the inside.
  let sq = 0;
  let inside = -Infinity;
  for (const v of past) {
    if (v > 0) sq += v * v;
    inside = Math.max(inside, v);
  }
  const distance = Math.sqrt(sq) + Math.min(inside, 0);
  return THREE.MathUtils.smoothstep(distance, 0, ramp);
}

export function smoothMin(a, b, k = 0.28) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}

export function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

export function variableChannelMask(px, pz, points) {
  let mask = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az, aw] = points[i];
    const [bx, bz, bw] = points[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const lengthSq = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const baseWidth = THREE.MathUtils.lerp(aw, bw, t);
    const bankWobble = Math.sin(cx * 0.23 + cz * 0.31) * 0.34 + Math.sin(cx * 0.11 - cz * 0.27) * 0.22;
    const width = Math.max(1.2, baseWidth + bankWobble);
    const d = Math.hypot(px - cx, pz - cz);
    mask = Math.max(mask, 1 - THREE.MathUtils.smoothstep(d, width * 0.62, width));
  }
  return mask;
}

export function terrainSurfaceNoise(x, z) {
  return surfaceNoise(x * 0.23, z * 0.23);
}

export function terrainFineDetail(x, z) {
  const lavaChip = crackNoise(x * 1.15 + 8, z * 1.08 - 3) * 0.055;
  const ashRipple = surfaceNoise(x * 0.74 - 11, z * 0.68 + 4) * 0.035;
  const fracture = Math.abs(crackNoise(x * 0.52, z * 0.48));
  return lavaChip + ashRipple + Math.pow(fracture, 5) * 0.12;
}
