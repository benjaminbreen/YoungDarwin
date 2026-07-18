import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  NORTHERN_HIGHLANDS,
  northernHighlandsBasaltExposure,
  northernHighlandsGardenInfo,
  northernHighlandsMoisture,
  northernHighlandsPathInfo,
  northernHighlandsScrubStrength,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

function authoredRelief(x, z) {
  const westShelf = gaussian(x, z, -38, 1, 18, 31) * 1.15;
  // Two broad volcanic shoulders give the transition zone a legible skyline
  // without turning it into Cerro Pajas. A shallow bite in the northern rise
  // hints at eroded crater structure like the island reference landscape.
  const northShoulder = gaussian(x, z, 11, -34, 29, 22) * 2.35;
  const northNotch = gaussian(x, z, 6, -33, 10, 8) * -0.72;
  const junctionSaddle = gaussian(x, z, 1, 5, 19, 15) * -0.64;
  const southShoulder = gaussian(x, z, 28, 35, 29, 20) * 2.15;
  const wetHollow = gaussian(x, z, -10, 34, 15, 21) * -0.68;
  return westShelf + northShoulder + northNotch + junctionSaddle + southShoulder + wetHollow;
}

function surfaceDetail(x, z, movementSurface) {
  const hummocks = elevationNoise(x * 0.15 - 11, z * 0.14 + 8);
  const crossRoll = elevationNoise(x * 0.24 + 17, z * 0.21 - 13);
  const grit = terrainFineDetail(x, z);
  if (movementSurface) return hummocks * 0.065 + crossRoll * 0.028 + grit * 0.045;
  return hummocks * 0.16 + crossRoll * 0.07 + grit * 0.48;
}

export function northernHighlandsHeight(x, z, { movementSurface = false } = {}) {
  const inlandProgress = THREE.MathUtils.clamp((z + 52) / 104, 0, 1);
  const broad = elevationNoise(x * 0.023 + 9, z * 0.022 - 6);
  const cross = elevationNoise(x * 0.047 - 5, z * 0.044 + 14);
  const medium = elevationNoise(x * 0.086 + 19, z * 0.078 - 7);
  const path = northernHighlandsPathInfo(x, z);
  const garden = northernHighlandsGardenInfo(x, z);
  const moisture = northernHighlandsMoisture(x, z);
  const basalt = northernHighlandsBasaltExposure(x, z);
  const fissures = Math.max(0, crackNoise(x * 0.15 + 3, z * 0.14 - 8));

  let y = 4.15
    + inlandProgress * 4.65
    + broad * 1.58
    + cross * 0.88
    + medium * 0.36
    + Math.sin(x * 0.037 + z * 0.047 + 0.6) * 0.56
    + authoredRelief(x, z)
    - moisture * 0.24
    + fissures * basalt * (movementSurface ? 0.1 : 0.32)
    + surfaceDetail(x, z, movementSurface);

  y -= path.tread * 0.115 + path.center * 0.035;
  // The worked plot occupies a naturally gentle bench. A shallow depression
  // and visible furrows communicate turned soil without affecting movement.
  y -= garden.mask * (0.07 + (movementSurface ? 0 : Math.sin(garden.rowPhase) * 0.04));
  return y;
}

export function northernHighlandsBiomeAt(x, z, y = northernHighlandsHeight(x, z)) {
  const path = northernHighlandsPathInfo(x, z);
  const garden = northernHighlandsGardenInfo(x, z);
  const moisture = northernHighlandsMoisture(x, z);
  const basalt = northernHighlandsBasaltExposure(x, z);
  const scrub = northernHighlandsScrubStrength(x, z);
  if (path.tread > 0.48 || path.center > 0.3) return 'highlands-cinder-path';
  if (garden.mask > 0.42) return 'highlands-garden-loam';
  if (path.shoulder > 0.38) return 'highlands-path-shoulder';
  if (moisture > 0.64) return 'transition-moist-hollow';
  if (basalt > 0.68) return 'weathered-basalt-scrub';
  if (scrub > 0.44) return 'highlands-thorn-scrub';
  if (moisture > 0.4 || y > 7.2) return 'green-transition-grass';
  return 'open-seed-grass';
}

export function northernHighlandsColor(x, z, y) {
  const biome = northernHighlandsBiomeAt(x, z, y);
  const path = northernHighlandsPathInfo(x, z);
  const garden = northernHighlandsGardenInfo(x, z);
  const moisture = northernHighlandsMoisture(x, z);
  const basalt = northernHighlandsBasaltExposure(x, z);
  const broad = terrainSurfaceNoise(x * 0.18 + 4, z * 0.17 - 8) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.6 - 12, z * 1.45 + 3) * 0.5 + 0.5;
  const color = new THREE.Color('#66603c');
  color.lerp(new THREE.Color('#8a7947'), broad * 0.32);
  color.lerp(new THREE.Color('#59633c'), moisture * 0.3);
  color.lerp(new THREE.Color('#41443a'), basalt * 0.24);
  if (biome === 'highlands-thorn-scrub') color.lerp(new THREE.Color('#5e6841'), 0.28);
  if (biome === 'green-transition-grass') color.lerp(new THREE.Color('#667747'), 0.34);
  if (biome === 'transition-moist-hollow') color.lerp(new THREE.Color('#3f5c3d'), 0.48);
  if (biome === 'weathered-basalt-scrub') color.lerp(new THREE.Color('#4f5047'), 0.5);
  if (biome === 'highlands-path-shoulder') color.lerp(new THREE.Color('#827046'), 0.46);
  if (biome === 'highlands-cinder-path') color.lerp(new THREE.Color('#9b5433'), 0.68 + path.center * 0.12);
  if (biome === 'highlands-garden-loam') {
    color.lerp(new THREE.Color('#2b2018'), 0.72 + garden.mask * 0.12);
    color.lerp(new THREE.Color('#493624'), (Math.sin(garden.rowPhase) * 0.5 + 0.5) * 0.24);
  }
  color.multiplyScalar(0.86 + fine * 0.1);
  return color;
}

export function northernHighlandsRenderSample(x, z) {
  const height = northernHighlandsHeight(x, z);
  return {
    height,
    biome: northernHighlandsBiomeAt(x, z, height),
    color: northernHighlandsColor(x, z, height),
  };
}

export function isNorthernHighlandsWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const path = northernHighlandsPathInfo(x, z);
  const step = 0.82;
  const left = northernHighlandsHeight(x - step, z, { movementSurface: true });
  const right = northernHighlandsHeight(x + step, z, { movementSurface: true });
  const back = northernHighlandsHeight(x, z - step, { movementSurface: true });
  const forward = northernHighlandsHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.02 || path.path > 0.18;
}

export const northernHighlandsRegion = {
  id: NORTHERN_HIGHLANDS,
  aliases: ['northern-highlands'],
  terrain: {
    height: northernHighlandsHeight,
    movementHeight: (x, z) => northernHighlandsHeight(x, z, { movementSurface: true }),
    biomeAt: northernHighlandsBiomeAt,
    color: northernHighlandsColor,
    sample: northernHighlandsRenderSample,
    isWalkable: isNorthernHighlandsWalkable,
    defaultSpawn: [-48.5, 0, 6.5],
    defaultFacing: [1, 0, 0],
    entrySpawns: {
      west: [-50.5, 0, 7],
      north: [8, 0, -46.5],
      east: [50.5, 0, -11],
      south: [-6, 0, 46.5],
    },
    entryFacings: {
      west: [1, 0, 0],
      north: [0, 0, 1],
      east: [-1, 0, 0],
      south: [0, 0, -1],
    },
  },
};
