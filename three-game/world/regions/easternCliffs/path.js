import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { crackNoise, terrainSurfaceNoise } from '../../terrainShared';
import {
  ALT_POST_OFFICE_BAY_EASTERN_CLIFFS_SEAM,
  EASTERN_CLIFFS_COASTAL_SCRUBLAND_SEAM,
} from '../../routeSeams';

export const EASTERN_CLIFFS = 'EASTERN_CLIFFS';

const MAIN_TRAVERSE = [
  [...ALT_POST_OFFICE_BAY_EASTERN_CLIFFS_SEAM.target.point, 1.88],
  [-39, 13, 1.94],
  [-27, 8, 2.02],
  [-15, 2, 2.08],
  [-3, 5, 2.12],
  [6, 16, 2.04],
  [4, 28, 1.94],
  [...EASTERN_CLIFFS_COASTAL_SCRUBLAND_SEAM.source.point, 1.82],
];

const COLONY_LOOKOUT_SPUR = [
  [-3, 5, 1.76],
  [8, 0, 1.68],
  [17, -7, 1.58],
  [22, -13, 1.5],
];

export const EASTERN_CLIFFS_PATH_POINTS = [MAIN_TRAVERSE, COLONY_LOOKOUT_SPUR];

const SHELTER_PATCHES = [
  { x: -34, z: -5, rx: 15, rz: 13, strength: 0.78 },
  { x: -24, z: 23, rx: 19, rz: 12, strength: 0.88 },
  { x: -2, z: 32, rx: 16, rz: 10, strength: 0.62 },
  { x: -12, z: -17, rx: 17, rz: 11, strength: 0.58 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function easternCliffsEastCoastX(z) {
  return 36.5
    + Math.sin(z * 0.105 + 0.8) * 3.2
    + Math.sin(z * 0.235 - 1.4) * 1.35
    - Math.exp(-Math.pow((z + 13) / 8.5, 2)) * 3.8;
}

export function easternCliffsNorthCoastZ(x) {
  return -33.5
    + Math.sin(x * 0.098 - 0.4) * 3.4
    + Math.sin(x * 0.21 + 1.2) * 1.25
    + Math.exp(-Math.pow((x - 13) / 9.5, 2)) * 3.6;
}

// Positive values are inland from both coastal faces; negative values are
// seaward. The minimum makes the northeast corner a continuous headland rim.
export function easternCliffsCoastDistance(x, z) {
  const eastDistance = easternCliffsEastCoastX(z) - x;
  const northDistance = z - easternCliffsNorthCoastZ(x);
  return Math.min(eastDistance, northDistance);
}

export function easternCliffsSeaStackMask(x, z) {
  const eastStack = Math.exp(-Math.pow((x - 43) / 4.2, 2) - Math.pow((z + 6) / 6.2, 2));
  const northStack = Math.exp(-Math.pow((x - 17) / 5.1, 2) - Math.pow((z + 41) / 3.8, 2));
  return clamp01(Math.max(eastStack, northStack * 0.82));
}

export function easternCliffsFaceMask(x, z) {
  const distance = easternCliffsCoastDistance(x, z);
  return clamp01(1 - THREE.MathUtils.smoothstep(distance, 2.2, 9.5));
}

export function easternCliffsRimMask(x, z) {
  const distance = easternCliffsCoastDistance(x, z);
  return clamp01(
    THREE.MathUtils.smoothstep(distance, 4.5, 7.5)
    * (1 - THREE.MathUtils.smoothstep(distance, 10.5, 15.5)),
  );
}

export function easternCliffsPathInfo(x, z) {
  const frame = pathFrameAt(EASTERN_CLIFFS_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.21 + frame.centerX * 0.08) * 0.2
    + Math.sin(along * 0.1 - frame.centerZ * 0.19) * 0.15
    + terrainSurfaceNoise(x * 0.82 + 11, z * 0.82 - 6) * 0.2;
  const width = Math.max(1.48, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.16, width * 0.46);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.34, width * 0.82);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.44, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.58));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.54, width * 1.12);
  return {
    ...frame,
    tangentX,
    tangentZ,
    width,
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}

export function easternCliffsGuanoMask(x, z) {
  const rim = easternCliffsRimMask(x, z);
  const northColony = Math.exp(-Math.pow((x - 10) / 17, 2) - Math.pow((z + 25) / 9, 2));
  const eastColony = Math.exp(-Math.pow((x - 28) / 9, 2) - Math.pow((z + 5) / 19, 2));
  const streaks = Math.abs(crackNoise(x * 0.22 - 7, z * 0.62 + 4));
  return clamp01(Math.max(northColony, eastColony) * rim * THREE.MathUtils.smoothstep(streaks, 0.18, 0.82));
}

export function easternCliffsShelterMask(x, z) {
  let strength = 0;
  for (const patch of SHELTER_PATCHES) {
    const dx = (x - patch.x) / patch.rx;
    const dz = (z - patch.z) / patch.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 1.7) * patch.strength);
  }
  const windwardPenalty = easternCliffsRimMask(x, z) * 0.72 + easternCliffsFaceMask(x, z);
  const breakup = terrainSurfaceNoise(x * 0.31 + 8, z * 0.28 - 13) * 0.1;
  return clamp01(strength + breakup - windwardPenalty);
}

export function easternCliffsBasaltExposure(x, z) {
  const face = easternCliffsFaceMask(x, z);
  const rim = easternCliffsRimMask(x, z);
  const inlandRib = Math.exp(-Math.pow((x + 5) / 17, 2) - Math.pow((z + 17) / 24, 2));
  const fractured = terrainSurfaceNoise(x * 0.5 + 5, z * 0.46 - 9) * 0.5 + 0.5;
  return clamp01(Math.max(face, rim * 0.76, inlandRib * 0.62) + fractured * 0.16);
}
