import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  MARINE_IGUANA_COLONY,
  marineIguanaColonyBasaltShelfMask,
  marineIguanaColonyBeachMask,
  marineIguanaColonyCoastDistance,
  marineIguanaColonyGuanoMask,
  marineIguanaColonyHillockMask,
  marineIguanaColonyPathInfo,
  marineIguanaColonyPoolMask,
  marineIguanaColonyRubbleMask,
  marineIguanaColonyTerraceMask,
  marineIguanaColonyWetShoreMask,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function marineIguanaColonyHeight(x, z, { movementSurface = false } = {}) {
  const coastDistance = marineIguanaColonyCoastDistance(x, z);
  if (coastDistance < 0) {
    const shelfNoise = elevationNoise(x * 0.065 + 8, z * 0.064 - 5) * 0.07;
    const deepWater = Math.max(0, -coastDistance - 7.5);
    const seabed = -1.08 + coastDistance * 0.24 - deepWater * 0.13 + shelfNoise;
    const offshoreStacks = Math.max(
      gaussian(x, z, -39, -32, 3.8, 5.2),
      gaussian(x, z, -41, 30, 4.2, 4.8) * 0.84,
    );
    return Math.max(-5.2, seabed + offshoreStacks * 2.4);
  }

  const path = marineIguanaColonyPathInfo(x, z);
  const beach = marineIguanaColonyBeachMask(x, z);
  const wetShore = marineIguanaColonyWetShoreMask(x, z);
  const basalt = marineIguanaColonyBasaltShelfMask(x, z);
  const terrace = marineIguanaColonyTerraceMask(x, z);
  const pools = marineIguanaColonyPoolMask(x, z);
  const hillocks = marineIguanaColonyHillockMask(x, z);
  const rubble = marineIguanaColonyRubbleMask(x, z);

  const coastRise = 1.55 * (1 - Math.exp(-coastDistance * 0.1));
  const inland = THREE.MathUtils.smoothstep(coastDistance, 12, 56);
  const broadRoll = elevationNoise(x * 0.034 + 9, z * 0.036 - 7);
  const crossRoll = elevationNoise(x * 0.075 - 4, z * 0.068 + 12);
  const hillRelief = hillocks * (1.45 + broadRoll * 0.42);
  const shallowSwales = Math.max(
    gaussian(x, z, 6, -17, 10, 8),
    gaussian(x, z, 18, 9, 11, 8) * 0.8,
    gaussian(x, z, 31, 24, 12, 9) * 0.72,
  );

  let y = -0.58
    + coastRise
    + inland * 1.12
    + hillRelief
    + broadRoll * (0.18 + inland * 0.44)
    + crossRoll * inland * 0.24
    - shallowSwales * 0.34;

  const beachTarget = -0.34 + Math.min(coastDistance, 16) * 0.055
    + elevationNoise(x * 0.095 + 2, z * 0.09 - 11) * 0.055;
  y = THREE.MathUtils.lerp(y, beachTarget, beach * 0.92);

  const shelfTarget = -0.05
    + THREE.MathUtils.smoothstep(coastDistance, 2, 19) * 0.72
    + crackNoise(x * 0.13 + 5, z * 0.16 - 8) * 0.12;
  y = THREE.MathUtils.lerp(y, shelfTarget, basalt * 0.74);
  y += terrace * (0.28 + Math.max(0, crackNoise(x * 0.24 - 3, z * 0.21 + 9)) * 0.18);
  y = THREE.MathUtils.lerp(y, WATER_LEVEL - 0.32, pools * 0.88);
  y = THREE.MathUtils.lerp(y, WATER_LEVEL - 0.08, wetShore * beach * 0.48);

  const rubbleKnob = Math.pow(Math.abs(crackNoise(x * 0.44 + 9, z * 0.4 - 3)), 3.4);
  y += rubble * rubbleKnob * (movementSurface ? 0.06 : 0.22);

  const pathTarget = 0.48
    + inland * 1.24
    + hillocks * 0.68
    + elevationNoise(x * 0.05 - 11, z * 0.055 + 4) * 0.14;
  y = THREE.MathUtils.lerp(y, pathTarget, path.tread * 0.5);
  y -= path.center * 0.04;

  const detailMask = Math.max(beach, basalt, inland);
  const detailSuppression = THREE.MathUtils.clamp(path.path * 0.56 + pools * 0.9, 0, 1);
  y += terrainFineDetail(x, z) * detailMask * (movementSurface ? 0.08 : 0.3) * (1 - detailSuppression);
  y += terrainSurfaceNoise(x * 0.7 + 2, z * 0.66 - 6) * basalt * (movementSurface ? 0.025 : 0.11);
  return Math.max(-5.2, y);
}

export function marineIguanaColonyBiomeAt(x, z, y = marineIguanaColonyHeight(x, z)) {
  if (y < -2.2) return 'open-ocean-seabed';
  if (y < WATER_LEVEL) {
    if (marineIguanaColonyPoolMask(x, z) > 0.24) return 'basalt-tidepool';
    return marineIguanaColonyBeachMask(x, z) > 0.2 ? 'shallow-shell-sand' : 'submerged-basalt';
  }
  const path = marineIguanaColonyPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.28) return 'colony-trail';
  if (marineIguanaColonyGuanoMask(x, z) > 0.32) return 'guano-streaked-basalt';
  if (marineIguanaColonyTerraceMask(x, z) > 0.34) return 'colony-basking-terrace';
  if (marineIguanaColonyWetShoreMask(x, z) > 0.3) return 'wet-basalt-swash';
  if (marineIguanaColonyBasaltShelfMask(x, z) > 0.28) return 'black-basalt-shelf';
  if (marineIguanaColonyBeachMask(x, z) > 0.28) return 'white-shell-beach';
  if (marineIguanaColonyRubbleMask(x, z) > 0.42) return 'volcanic-rubble';
  return 'wind-rounded-cinder';
}

export function marineIguanaColonyColor(x, z, y) {
  const biome = marineIguanaColonyBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.31 + 7, z * 0.3 - 4) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.2 - 9, z * 1.14 + 2) * 0.5 + 0.5;
  const color = new THREE.Color('#5a4334');
  if (biome === 'open-ocean-seabed') color.set('#153642');
  else if (biome === 'shallow-shell-sand') color.set('#91bdb2');
  else if (biome === 'submerged-basalt') color.set('#254947');
  else if (biome === 'basalt-tidepool') color.set('#23453f');
  else if (biome === 'white-shell-beach') color.set('#e1d7bf');
  else if (biome === 'wet-basalt-swash') color.set('#1d2928');
  else if (biome === 'black-basalt-shelf') color.set('#242522');
  else if (biome === 'colony-basking-terrace') color.set('#292925');
  else if (biome === 'guano-streaked-basalt') color.set('#8f8a76');
  else if (biome === 'volcanic-rubble') color.set('#3c3731');
  else if (biome === 'colony-trail') color.set('#7b6048');
  else color.set('#6b4936');
  if (biome === 'white-shell-beach') color.lerp(new THREE.Color('#f0e8d3'), broad * 0.2);
  if (biome.includes('basalt')) color.lerp(new THREE.Color('#484139'), broad * 0.12);
  color.multiplyScalar(0.89 + broad * 0.08 + fine * 0.03);
  return color;
}

export function isMarineIguanaColonyWalkable(x, z, config) {
  const margin = 1.4;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const coastDistance = marineIguanaColonyCoastDistance(x, z);
  if (coastDistance < -0.8) return false;
  const y = marineIguanaColonyHeight(x, z, { movementSurface: true });
  if (y < WATER_LEVEL - 0.16 && marineIguanaColonyPoolMask(x, z) < 0.3) return false;
  const step = 0.82;
  const left = marineIguanaColonyHeight(x - step, z, { movementSurface: true });
  const right = marineIguanaColonyHeight(x + step, z, { movementSurface: true });
  const back = marineIguanaColonyHeight(x, z - step, { movementSurface: true });
  const forward = marineIguanaColonyHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 0.92 || marineIguanaColonyPathInfo(x, z).path > 0.2;
}

export const marineIguanaColonyRegion = {
  id: MARINE_IGUANA_COLONY,
  aliases: ['marine-iguana-colony', 'marine-iguana-rocks'],
  terrain: {
    height: marineIguanaColonyHeight,
    movementHeight: (x, z) => marineIguanaColonyHeight(x, z, { movementSurface: true }),
    biomeAt: marineIguanaColonyBiomeAt,
    color: marineIguanaColonyColor,
    isWalkable: isMarineIguanaColonyWalkable,
    defaultSpawn: [2, 0, -4],
    defaultFacing: [-1, 0, 0.08],
    defaultCameraFacing: [-1, 0, 0.08],
    entrySpawns: {
      north: [10, 0, -44.5],
      east: [49.5, 0, -12],
      south: [18, 0, 44.5],
    },
    entryFacings: {
      north: [-0.08, 0, 1],
      east: [-1, 0, 0.05],
      south: [-0.18, 0, -0.98],
    },
    entryCameraFacings: {
      north: [-0.3, 0, 0.95],
      east: [-1, 0, 0.05],
      south: [-0.3, 0, -0.95],
    },
  },
};
