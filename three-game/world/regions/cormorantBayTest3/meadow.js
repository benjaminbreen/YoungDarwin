import * as THREE from 'three';
import { cormorantCoastZ, cormorantLagoonField, cormorantRimMask, cormorantTrailDistance } from '../cormorantBaySplatTest/terrain';

const WIDTH = 112;
const DEPTH = 98;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash21(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

export function meadowNoise(x, z, scale = 1, salt = 0) {
  const gx = x * scale;
  const gz = z * scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = THREE.MathUtils.lerp(hash21(ix, iz, salt), hash21(ix + 1, iz, salt), ux);
  const b = THREE.MathUtils.lerp(hash21(ix, iz + 1, salt), hash21(ix + 1, iz + 1, salt), ux);
  return THREE.MathUtils.lerp(a, b, uz);
}

export function meadowFbm(x, z, scale = 1, salt = 0) {
  let value = 0;
  let amp = 0.5;
  let sx = x * scale;
  let sz = z * scale;
  for (let i = 0; i < 4; i += 1) {
    value += meadowNoise(sx, sz, 1, salt + i * 19) * amp;
    const nx = sx * 1.62 - sz * 0.88 + 7.1;
    const nz = sx * 0.88 + sz * 1.62 - 4.3;
    sx = nx;
    sz = nz;
    amp *= 0.54;
  }
  return value;
}

export function cormorantTest3MeadowSample(x, z) {
  const shore = z - cormorantCoastZ(x);
  const lagoon = cormorantLagoonField(x, z);
  const trail = cormorantTrailDistance(x, z);
  const rim = cormorantRimMask(x, z);
  const shoreBand = smoothstep(3.5, 16, shore);
  const lagoonClear = smoothstep(1.36, 2.18, lagoon);
  const trailClear = smoothstep(4.4, 7.4, trail);
  const rimClear = 1 - rim * 0.46;
  const broad = meadowFbm(x, z, 0.038, 11);
  const tuft = meadowFbm(x + 17, z - 9, 0.105, 31);
  const lane = Math.sin((x * 0.72 + z * 0.42) * 0.78 + meadowFbm(x, z, 0.05, 47) * 3.6) * 0.5 + 0.5;
  const density = clamp01(shoreBand * lagoonClear * trailClear * rimClear * THREE.MathUtils.lerp(0.48, 1.08, broad) * THREE.MathUtils.lerp(0.76, 1.18, lane));
  const dryness = clamp01(0.34 + meadowFbm(x - 12, z + 5, 0.07, 71) * 0.42 + smoothstep(8, 38, z) * 0.22);
  const underbrush = clamp01(density * smoothstep(0.48, 0.9, tuft) * 0.52);
  const direction = -0.86 + (meadowNoise(x, z, 0.036, 83) - 0.5) * 0.42 + (meadowNoise(x + 9, z - 4, 0.018, 97) - 0.5) * 0.34;
  return { density, dryness, underbrush, direction, trailClear, lagoonClear };
}

export function cormorantTest3GrassDensityAt({ x, z, tone }) {
  const sample = cormorantTest3MeadowSample(x, z);
  return clamp01(sample.density * THREE.MathUtils.lerp(0.72, 1.12, tone));
}

export function cormorantTest3DrynessAt({ x, z, tone }) {
  const sample = cormorantTest3MeadowSample(x, z);
  return clamp01(sample.dryness * 0.86 + tone * 0.14);
}

export function cormorantTest3DirectionAt(x, z) {
  return cormorantTest3MeadowSample(x, z).direction;
}

export function createCormorantMeadowAtlas(size = 512) {
  const data = new Uint8Array(size * size * 4);
  let cursor = 0;
  for (let y = 0; y < size; y += 1) {
    const z = -DEPTH * 0.5 + (y / (size - 1)) * DEPTH;
    for (let xIndex = 0; xIndex < size; xIndex += 1) {
      const x = -WIDTH * 0.5 + (xIndex / (size - 1)) * WIDTH;
      const sample = cormorantTest3MeadowSample(x, z);
      data[cursor] = Math.round(sample.density * 255);
      data[cursor + 1] = Math.round(sample.dryness * 255);
      data[cursor + 2] = Math.round(sample.underbrush * 255);
      data[cursor + 3] = Math.round(Math.min(sample.trailClear, sample.lagoonClear) * 255);
      cursor += 4;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
