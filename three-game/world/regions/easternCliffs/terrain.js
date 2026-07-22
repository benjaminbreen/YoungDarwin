import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  EASTERN_CLIFFS,
  easternCliffsBasaltExposure,
  easternCliffsCoastDistance,
  easternCliffsEastCoastX,
  easternCliffsFaceMask,
  easternCliffsGuanoMask,
  easternCliffsNorthCoastZ,
  easternCliffsPathInfo,
  easternCliffsRimMask,
  easternCliffsSeaStackMask,
  easternCliffsShelterMask,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

export function easternCliffsHeight(x, z, { movementSurface = false } = {}) {
  const coastDistance = easternCliffsCoastDistance(x, z);
  if (coastDistance < 0) {
    const deepWater = Math.max(0, -coastDistance - 4);
    const seabed = -1.12 + coastDistance * 0.32 - deepWater * 0.13;
    const seaStack = easternCliffsSeaStackMask(x, z);
    const stackFracture = Math.max(0, crackNoise(x * 0.3 + 7, z * 0.28 - 5));
    return Math.max(-5.2, seabed + seaStack * (16.2 + stackFracture * 1.05));
  }

  const face = easternCliffsFaceMask(x, z);
  const rim = easternCliffsRimMask(x, z);
  const path = easternCliffsPathInfo(x, z);
  const eastDistance = easternCliffsEastCoastX(z) - x;
  const northDistance = z - easternCliffsNorthCoastZ(x);
  const faceAlong = eastDistance < northDistance ? z : x;
  // Keep the movement surface simple, but give the rendered wall the stepped
  // profile of successive basalt flows. Each boundary wanders and changes
  // strength along the coast so the ledges do not read as stacked contour lines.
  const smoothCliffRise = 12.1 * (1 - Math.exp(-coastDistance * 0.68));
  const flowWarp = Math.sin(faceAlong * 0.17 + 0.4) * 0.28
    + Math.sin(faceAlong * 0.071 - 1.3) * 0.34
    + elevationNoise(faceAlong * 0.052 + 6, coastDistance * 0.08 - 3) * 0.2;
  const lowerFlowStrength = 0.7 + Math.sin(faceAlong * 0.113 + 1.1) * 0.16;
  const middleFlowStrength = 0.63 + Math.sin(faceAlong * 0.087 - 0.7) * 0.2;
  const upperFlowStrength = 0.51 + Math.sin(faceAlong * 0.137 + 2.2) * 0.14;
  const flowCliffRise = 9.78 * (1 - Math.exp(-coastDistance * 0.78))
    + THREE.MathUtils.smoothstep(coastDistance, 0.62 + flowWarp, 1.04 + flowWarp) * lowerFlowStrength
    + THREE.MathUtils.smoothstep(coastDistance, 2.02 - flowWarp * 0.72, 2.58 - flowWarp * 0.72) * middleFlowStrength
    + THREE.MathUtils.smoothstep(coastDistance, 4.36 + flowWarp * 0.54, 5.12 + flowWarp * 0.54) * upperFlowStrength;
  const faceDetail = face * (1 - THREE.MathUtils.smoothstep(coastDistance, 4.35, 5.3));
  const renderedCliffRise = THREE.MathUtils.lerp(smoothCliffRise, flowCliffRise, faceDetail);
  const cliffRise = movementSurface ? smoothCliffRise : renderedCliffRise;
  const westApproach = 1 - THREE.MathUtils.smoothstep(x, -48, -32);
  const southDescent = THREE.MathUtils.smoothstep(z, 27, 46);
  const broad = elevationNoise(x * 0.028 + 8.2, z * 0.026 - 4.7);
  const crossRoll = elevationNoise(x * 0.062 - 11, z * 0.057 + 13);
  const windSwell = Math.sin(x * 0.052 + z * 0.073 + 0.9) * 0.3;
  const nestingShelf = gaussian(x, z, 24, -14, 13, 9) * rim;
  const northShelf = gaussian(x, z, 7, -25, 18, 8) * rim;
  const jointPhase = faceAlong * 0.76
    + Math.sin(faceAlong * 0.19 + 0.8) * 1.18
    + elevationNoise(faceAlong * 0.1 + 2.4, coastDistance * 0.2 - 7) * 0.62;
  const columnJoint = Math.pow(1 - Math.abs(Math.sin(jointPhase)), 9);
  const secondaryJointPhase = faceAlong * 1.37
    + elevationNoise(faceAlong * 0.16 - 9, coastDistance * 0.31 + 4) * 0.78;
  const secondaryJoint = Math.pow(1 - Math.abs(Math.sin(secondaryJointPhase)), 13);
  const columnFacets = elevationNoise(faceAlong * 0.18 + 4, coastDistance * 0.2 - 8) * 0.28
    + Math.sin(faceAlong * 0.51 - 0.9) * 0.12;
  const faceStrata = Math.sin(coastDistance * 2.08 + flowWarp * 1.7) * faceDetail
    + Math.sin(coastDistance * 4.35 - faceAlong * 0.037) * faceDetail * 0.38;
  const jointRelief = faceDetail * (columnJoint * 0.36 + secondaryJoint * 0.14);
  const middleFace = THREE.MathUtils.smoothstep(coastDistance, 0.55, 1.4)
    * (1 - THREE.MathUtils.smoothstep(coastDistance, 4.15, 5.2));
  const chuteA = Math.exp(-Math.pow((faceAlong + 23) / 3.6, 2)) * 0.72;
  const chuteB = Math.exp(-Math.pow((faceAlong + 4) / 2.5, 2)) * 0.48;
  const chuteC = Math.exp(-Math.pow((faceAlong - 18) / 4.4, 2)) * 0.82;
  const chuteD = Math.exp(-Math.pow((faceAlong - 35) / 2.2, 2)) * 0.38;
  const erosionChutes = Math.max(chuteA, chuteB, chuteC, chuteD)
    * middleFace
    * (0.66 + elevationNoise(faceAlong * 0.12 - 3, coastDistance * 0.24 + 8) * 0.22);
  const rockfallScars = (
    gaussian(faceAlong, coastDistance, -12, 2.8, 6.2, 1.8) * 0.46
    + gaussian(faceAlong, coastDistance, 9, 4.3, 4.8, 2.1) * 0.34
    + gaussian(faceAlong, coastDistance, 29, 1.9, 3.6, 1.2) * 0.28
  ) * faceDetail;
  const buttressRelief = middleFace * (
    Math.sin(faceAlong * 0.16 + 1.3) * 0.32
    + elevationNoise(faceAlong * 0.047 - 5, coastDistance * 0.13 + 11) * 0.42
  );
  const fractured = Math.max(0, crackNoise(x * 0.19 + 4, z * 0.2 - 9));
  const smallRelief = movementSurface
    ? elevationNoise(x * 0.16 - 4, z * 0.15 + 7) * 0.06 + terrainFineDetail(x, z) * 0.06
    : elevationNoise(x * 0.16 - 4, z * 0.15 + 7) * 0.17 + terrainFineDetail(x, z) * 0.42;

  let y = -0.78
    + cliffRise
    - westApproach * 3.15
    - southDescent * 4.25
    + broad * 0.72
    + crossRoll * 0.38
    + windSwell
    - nestingShelf * 0.5
    - northShelf * 0.38
    + faceStrata * (movementSurface ? 0.06 : 0.34)
    + (movementSurface ? 0 : columnFacets * faceDetail - jointRelief + buttressRelief - erosionChutes - rockfallScars)
    + fractured * easternCliffsBasaltExposure(x, z) * (movementSurface ? 0.08 : 0.3)
    + smallRelief;

  // The old traverse is worn but follows the headland instead of becoming a
  // floating flat shelf. Its lookout spur ends before the unsafe rim.
  y -= path.tread * 0.15 + path.center * 0.04;
  return y;
}

export function easternCliffsBiomeAt(x, z, y = easternCliffsHeight(x, z)) {
  if (y < WATER_LEVEL - 0.12) return 'open-water-bed';
  const path = easternCliffsPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.3) return 'cliff-cinder-traverse';
  if (path.shoulder > 0.38) return 'cliff-path-shoulder';
  if (easternCliffsGuanoMask(x, z) > 0.3) return 'frigatebird-guano-ledge';
  if (easternCliffsFaceMask(x, z) > 0.46) return 'eastern-basalt-face';
  if (easternCliffsRimMask(x, z) > 0.42) return 'wind-scoured-cliff-rim';
  if (easternCliffsBasaltExposure(x, z) > 0.64) return 'fractured-headland-basalt';
  if (easternCliffsShelterMask(x, z) > 0.34) return 'sheltered-cliff-scrub';
  return 'open-headland-scrub';
}

export function easternCliffsColor(x, z, y) {
  const biome = easternCliffsBiomeAt(x, z, y);
  const path = easternCliffsPathInfo(x, z);
  const broad = terrainSurfaceNoise(x * 0.38 + 5, z * 0.36 - 7) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.42 - 17, z * 1.36 + 2) * 0.5 + 0.5;
  const color = new THREE.Color('#565044');
  color.lerp(new THREE.Color('#70614b'), broad * 0.28);
  color.lerp(new THREE.Color('#343631'), easternCliffsBasaltExposure(x, z) * 0.38);
  color.lerp(new THREE.Color('#8a7452'), fine * 0.07);
  if (biome === 'open-water-bed') color.set('#1d3438');
  if (biome === 'eastern-basalt-face') color.lerp(new THREE.Color('#242824'), 0.68);
  if (biome === 'wind-scoured-cliff-rim') color.lerp(new THREE.Color('#4a4940'), 0.48);
  if (biome === 'frigatebird-guano-ledge') color.lerp(new THREE.Color('#c2bda5'), 0.72);
  if (biome === 'sheltered-cliff-scrub') color.lerp(new THREE.Color('#596440'), 0.32);
  if (biome === 'cliff-path-shoulder') color.lerp(new THREE.Color('#82704e'), 0.48 + path.shoulder * 0.14);
  if (biome === 'cliff-cinder-traverse') color.lerp(new THREE.Color('#9a5635'), 0.68 + path.center * 0.12);
  color.multiplyScalar(0.86 + broad * 0.1 + fine * 0.04);
  return color;
}

export function isEasternCliffsWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const coastDistance = easternCliffsCoastDistance(x, z);
  if (coastDistance < 5.1) return false;
  const path = easternCliffsPathInfo(x, z);
  const step = 0.78;
  const left = easternCliffsHeight(x - step, z, { movementSurface: true });
  const right = easternCliffsHeight(x + step, z, { movementSurface: true });
  const back = easternCliffsHeight(x, z - step, { movementSurface: true });
  const forward = easternCliffsHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 0.96 || path.path > 0.2;
}

export const easternCliffsRegion = {
  id: EASTERN_CLIFFS,
  aliases: ['eastern-cliffs'],
  terrain: {
    height: easternCliffsHeight,
    movementHeight: (x, z) => easternCliffsHeight(x, z, { movementSurface: true }),
    biomeAt: easternCliffsBiomeAt,
    color: easternCliffsColor,
    isWalkable: isEasternCliffsWalkable,
    // Start on the safe lookout approach: close enough for the ocean drop and
    // nesting colony to read immediately, but outside the blocked rim band.
    defaultSpawn: [21.5, 0, -12.5],
    defaultFacing: [0.96, 0, 0.28],
    entrySpawns: {
      west: [-44.5, 0, 14],
      south: [-9, 0, 40.5],
    },
    entryFacings: {
      west: [1, 0, -0.05],
      south: [0.12, 0, -1],
    },
  },
};
