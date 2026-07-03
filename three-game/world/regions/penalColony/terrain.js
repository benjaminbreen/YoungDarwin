import * as THREE from 'three';
import { elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';
import {
  PENAL_COLONY,
  PENAL_COLONY_PADS,
  penalColonyGardenInfo,
  penalColonyPathInfo,
  penalColonyTrampledMask,
} from './path';

// Darwin found the settlement on "a flat space of ground" in the green
// highlands: a gentle village flat, a low knoll for the Vice-Governor's
// house, rising scrub at the north/west rim, and a dry fall toward the lava
// field to the south.

function knollMask(x, z) {
  return Math.exp(-(((x + 26) / 9.5) ** 2) - (((z + 16) / 9.0) ** 2));
}

function rimLift(x, z) {
  const north = THREE.MathUtils.smoothstep(-z, 20, 41) * 1.35;
  const west = THREE.MathUtils.smoothstep(-x, 34, 47) * 0.72;
  const east = THREE.MathUtils.smoothstep(x, 30, 47) * 0.95;
  return north + west + east;
}

function southFall(x, z) {
  return THREE.MathUtils.smoothstep(z, 26, 41) * 0.85;
}

function baseHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.026 + 4.0, z * 0.03 - 9.0) * 0.6;
  const roll = Math.sin(x * 0.05 + z * 0.037) * 0.14 + Math.sin(z * 0.045 - 2.1) * 0.15;
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.024 : 0.11);
  const settle = penalColonyTrampledMask(x, z);
  const path = penalColonyPathInfo(x, z);
  const garden = penalColonyGardenInfo(x, z);

  let y = 2.5
    + broad * (1 - settle * 0.72)
    + roll * (1 - settle * 0.6)
    + knollMask(x, z) * 1.35
    + rimLift(x, z)
    - southFall(x, z);

  y -= path.tread * 0.12 + path.center * 0.05;
  // Tilled plots sit a touch low (turned, wet earth) with shallow furrows.
  y -= garden.mask * (0.08 + (movementSurface ? 0 : Math.sin(garden.rowPhase) * 0.045));
  y += fine * (1 - garden.mask * 0.5);
  return y;
}

let padHeights = null;
function getPadHeights() {
  if (!padHeights) {
    padHeights = PENAL_COLONY_PADS.map(pad => ({
      ...pad,
      y: baseHeight(pad.x, pad.z),
    }));
  }
  return padHeights;
}

export function penalColonyHeight(x, z, options = {}) {
  let y = baseHeight(x, z, options);
  // Structures need level ground: blend each pad toward the height sampled at
  // its centre, hardest at the middle, feathered at the apron.
  for (const pad of getPadHeights()) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d > pad.radius * 1.15) continue;
    const w = 1 - THREE.MathUtils.smoothstep(d, pad.radius * 0.5, pad.radius * 1.1);
    y = THREE.MathUtils.lerp(y, pad.y, w * 0.92);
  }
  return y;
}

export function penalColonyBiomeAt(x, z) {
  const path = penalColonyPathInfo(x, z);
  if (path.center > 0.24 || path.tread > 0.5) return 'red-dirt-path';
  const garden = penalColonyGardenInfo(x, z);
  if (garden.mask > 0.45) return 'garden-mud';
  if (penalColonyTrampledMask(x, z) > 0.42) return 'trampled-court';
  if (path.shoulder > 0.36) return 'trampled-grass-edge';
  if (southFall(x, z) > 0.45 || rimLift(x, z) > 0.9) return 'dry-rim';
  return 'settlement-meadow';
}

export function penalColonyColor(x, z, y) {
  const biome = penalColonyBiomeAt(x, z, y);
  const path = penalColonyPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.34 - 5.0, z * 0.34 + 2.0) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.8 + 2.0, z * 1.6 - 8.0) * 0.5 + 0.5;
  const color = new THREE.Color('#3a5a34');
  color.lerp(new THREE.Color('#68803f'), broad * 0.3);
  color.lerp(new THREE.Color('#22402a'), (1 - broad) * 0.2);
  color.lerp(new THREE.Color('#7d7440'), fine * 0.08);
  if (biome === 'dry-rim') color.lerp(new THREE.Color('#6f6c3e'), 0.28);
  if (biome === 'trampled-grass-edge') color.lerp(new THREE.Color('#6b5b32'), 0.3 + path.shoulder * 0.34);
  if (biome === 'trampled-court') {
    color.lerp(new THREE.Color('#7a6743'), 0.62 + broad * 0.1);
    color.lerp(new THREE.Color('#4c3d27'), (1 - fine) * 0.22);
  }
  if (biome === 'garden-mud') {
    const garden = penalColonyGardenInfo(x, z);
    color.lerp(new THREE.Color('#241a12'), 0.66 + garden.mask * 0.16);
    color.lerp(new THREE.Color('#4a3722'), (Math.sin(garden.rowPhase) * 0.5 + 0.5) * 0.24);
  }
  if (biome === 'red-dirt-path') {
    color.lerp(new THREE.Color('#8c3519'), 0.7 + path.tread * 0.18);
    color.lerp(new THREE.Color('#35140b'), path.center * 0.26);
  }
  color.multiplyScalar(0.82 + fine * 0.12);
  return color;
}

export function isPenalColonyWalkable(x, z, config) {
  return Math.abs(x) <= config.width * 0.5 - 1.4 && Math.abs(z) <= config.depth * 0.5 - 1.4;
}

export const penalColonyRegion = {
  id: PENAL_COLONY,
  aliases: ['penal-colony', 'asilo-de-la-paz'],
  terrain: {
    height: penalColonyHeight,
    movementHeight: (x, z) => penalColonyHeight(x, z, { movementSurface: true }),
    biomeAt: penalColonyBiomeAt,
    color: penalColonyColor,
    isWalkable: isPenalColonyWalkable,
    defaultSpawn: [5, 0, -12],
  },
};
