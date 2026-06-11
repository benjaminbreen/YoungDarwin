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
