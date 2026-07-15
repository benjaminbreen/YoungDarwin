import * as THREE from 'three';
import { crackNoise, elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';
import {
  ROCKY_CLEARING,
  ROCKY_CLEARING_CAVE,
  rockyClearingCaveThresholdMask,
  rockyClearingCaveWallMask,
  rockyClearingCentralMask,
  rockyClearingPathInfo,
  rockyClearingRubbleMask,
} from './path';

function edgeLift(x, z) {
  const north = THREE.MathUtils.smoothstep(-z, 11, 38) * 1.65;
  const west = THREE.MathUtils.smoothstep(-x, 34, 48) * 0.62;
  const east = THREE.MathUtils.smoothstep(x, 34, 48) * 0.7;
  const south = THREE.MathUtils.smoothstep(z, 26, 41) * 0.45;
  return north + west + east + south;
}

function rockyRiseMask(x, z) {
  const cave = ROCKY_CLEARING_CAVE;
  const northShelf = THREE.MathUtils.smoothstep(-z, 7, 25) * Math.exp(-Math.pow((x - cave.x) / 28, 2));
  const westOutcrop = Math.exp(-Math.pow((x + 28) / 13, 2) - Math.pow((z + 18) / 17, 2)) * 0.68;
  const eastOutcrop = Math.exp(-Math.pow((x - 30) / 15, 2) - Math.pow((z + 13) / 16, 2)) * 0.52;
  return THREE.MathUtils.clamp(Math.max(northShelf, westOutcrop, eastOutcrop), 0, 1);
}

function caveMouthCut(x, z) {
  const cave = ROCKY_CLEARING_CAVE;
  return Math.exp(-Math.pow((x - cave.x) / 4.8, 2) - Math.pow((z - cave.z) / 3.15, 2));
}

function caveBedrockRise(x, z) {
  const cave = ROCKY_CLEARING_CAVE;
  const northBank = THREE.MathUtils.smoothstep(-z, 5.4, 22.5)
    * Math.exp(-Math.pow((x - cave.x) / 28, 2));
  const centralMass = Math.exp(
    -Math.pow((x - cave.x) / 22, 2)
    -Math.pow((z - (cave.z - 3.2)) / 12.5, 2),
  ) * 0.82;
  const westMass = Math.exp(-Math.pow((x - (cave.x - 17)) / 14, 2) - Math.pow((z + 15) / 13, 2)) * 0.62;
  const eastMass = Math.exp(-Math.pow((x - (cave.x + 18)) / 15, 2) - Math.pow((z + 14) / 14, 2)) * 0.56;
  return THREE.MathUtils.clamp(Math.max(northBank, centralMass, westMass, eastMass), 0, 1);
}

export function rockyClearingHeight(x, z, { movementSurface = false } = {}) {
  const broad = elevationNoise(x * 0.03 + 6.0, z * 0.034 - 8.0);
  const medium = elevationNoise(x * 0.075 - 12.0, z * 0.069 + 4.0);
  const path = rockyClearingPathInfo(x, z);
  const clearing = rockyClearingCentralMask(x, z);
  const threshold = rockyClearingCaveThresholdMask(x, z);
  const rubble = rockyClearingRubbleMask(x, z);
  const rise = rockyRiseMask(x, z);
  const bedrock = caveBedrockRise(x, z);
  const mouthCut = caveMouthCut(x, z);
  const shelf = Math.max(0, crackNoise(x * 0.13 + 4.0, z * 0.12 - 9.0));
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.08 : 0.34);

  let y = 3.0
    + broad * 1.05
    + medium * 0.46
    + edgeLift(x, z)
    + rise * 1.24
    + bedrock * 1.72
    + rubble * shelf * (movementSurface ? 0.12 : 0.42);

  y -= clearing * 0.22;
  y -= path.tread * 0.18 + path.center * 0.06;

  // The cave threshold is a deliberate, mostly level apron cut into the
  // north rock face; flatten it enough that the local entrance prompt is easy
  // to reach without making the surrounding boulder field feel paved.
  const caveApronY = 3.38 + broad * 0.18 + medium * 0.08;
  y = THREE.MathUtils.lerp(y, caveApronY, threshold * 0.78);
  y += rockyClearingCaveWallMask(x, z) * 1.48;
  y -= mouthCut * (1.05 + bedrock * 0.82);
  y += fine * (1 - threshold * 0.55);
  return Math.max(0.6, y);
}

export function rockyClearingBiomeAt(x, z, y = rockyClearingHeight(x, z)) {
  const path = rockyClearingPathInfo(x, z);
  if (path.center > 0.28 || path.tread > 0.56) return 'red-dirt-path';
  if (rockyClearingCaveThresholdMask(x, z) > 0.42) return 'cave-threshold';
  if (rockyClearingRubbleMask(x, z) > 0.56) return 'basalt-rubble';
  if (path.shoulder > 0.36) return 'path-shoulder';
  if (rockyClearingCentralMask(x, z) > 0.38) return 'dusty-clearing';
  if (rockyRiseMask(x, z) > 0.58 || y > 5.3) return 'rocky-rise';
  const exposed = terrainSurfaceNoise(x * 0.48 + 3.0, z * 0.48 - 11.0);
  if (exposed > 0.32) return 'stony-highland-grass';
  return 'dry-highland-grass';
}

export function rockyClearingColor(x, z, y) {
  const biome = rockyClearingBiomeAt(x, z, y);
  const path = rockyClearingPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.32 - 6.0, z * 0.31 + 2.0) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.8 + 5.0, z * 1.6 - 7.0) * 0.5 + 0.5;
  const color = new THREE.Color('#687144');
  color.lerp(new THREE.Color('#9a8f51'), broad * 0.24);
  color.lerp(new THREE.Color('#465c36'), (1 - broad) * 0.16);

  if (biome === 'stony-highland-grass') color.lerp(new THREE.Color('#84775a'), 0.25);
  if (biome === 'rocky-rise') color.lerp(new THREE.Color('#6a6350'), 0.42);
  if (biome === 'dusty-clearing') {
    color.lerp(new THREE.Color('#8b7a56'), 0.48);
    color.lerp(new THREE.Color('#b19a68'), fine * 0.14);
  }
  if (biome === 'path-shoulder') color.lerp(new THREE.Color('#756a46'), 0.48 + path.shoulder * 0.18);
  if (biome === 'basalt-rubble') {
    color.lerp(new THREE.Color('#35322c'), 0.6);
    color.lerp(new THREE.Color('#5d5648'), fine * 0.16);
  }
  if (biome === 'cave-threshold') {
    color.lerp(new THREE.Color('#433a2f'), 0.7);
    color.lerp(new THREE.Color('#897654'), fine * 0.1);
  }
  if (biome === 'red-dirt-path') {
    color.lerp(new THREE.Color('#9b4e27'), 0.68 + path.tread * 0.14);
    color.lerp(new THREE.Color('#3e271c'), path.center * 0.18);
  }
  color.multiplyScalar(0.84 + fine * 0.13);
  return color;
}

export function isRockyClearingWalkable(x, z, config) {
  const margin = 1.6;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const cave = ROCKY_CLEARING_CAVE;
  if (z < cave.z - 2.8 && Math.abs(x - cave.x) < 10.5) return false;
  if (rockyClearingCaveWallMask(x, z) > 0.76 && rockyClearingCaveThresholdMask(x, z) < 0.34) return false;
  const path = rockyClearingPathInfo(x, z);
  const step = 0.85;
  const left = rockyClearingHeight(x - step, z, { movementSurface: true });
  const right = rockyClearingHeight(x + step, z, { movementSurface: true });
  const back = rockyClearingHeight(x, z - step, { movementSurface: true });
  const forward = rockyClearingHeight(x, z + step, { movementSurface: true });
  const slope = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return slope < 1.02 || path.path > 0.22 || rockyClearingCaveThresholdMask(x, z) > 0.32;
}

export const rockyClearingRegion = {
  id: ROCKY_CLEARING,
  aliases: ['rocky-clearing', 'gabriels-cave-clearing'],
  terrain: {
    height: rockyClearingHeight,
    movementHeight: (x, z) => rockyClearingHeight(x, z, { movementSurface: true }),
    biomeAt: rockyClearingBiomeAt,
    color: rockyClearingColor,
    isWalkable: isRockyClearingWalkable,
    defaultSpawn: [-5, 0, 3.2],
  },
};
