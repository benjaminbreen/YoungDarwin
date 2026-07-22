import * as THREE from 'three';
import { pathFrameAt } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  COASTAL_SCRUBLAND_EL_MIRADOR_SEAM,
  EASTERN_CLIFFS_COASTAL_SCRUBLAND_SEAM,
} from '../../routeSeams';

export const COASTAL_SCRUBLAND = 'COASTAL_SCRUBLAND';

// A single old foot route descends from the eastern cliffs, crosses the dry
// seep, and turns inland to meet El Mirador's northern approach.
export const COASTAL_SCRUBLAND_PATH_POINTS = [
  [...EASTERN_CLIFFS_COASTAL_SCRUBLAND_SEAM.target.point, 1.72],
  [-12, -42, 1.82],
  [-5, -29, 1.92],
  [7, -14, 2.02],
  [11, -1, 2.08],
  [4, 12, 1.96],
  [-8, 25, 1.86],
  [-22, 38, 1.78],
  [...COASTAL_SCRUBLAND_EL_MIRADOR_SEAM.source.point, 1.72],
];

const SCRUB_BANDS = [
  { x: -25, z: -35, rx: 23, rz: 10, strength: 0.76 },
  { x: 8, z: -27, rx: 25, rz: 9, strength: 0.62 },
  { x: -17, z: -10, rx: 24, rz: 11, strength: 0.88 },
  { x: 19, z: 4, rx: 21, rz: 10, strength: 0.74 },
  { x: -13, z: 20, rx: 27, rz: 11, strength: 0.82 },
  { x: -31, z: 39, rx: 20, rz: 9, strength: 0.72 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function coastalScrubPathInfo(x, z) {
  const frame = pathFrameAt(COASTAL_SCRUBLAND_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.19 + frame.centerX * 0.08) * 0.22
    + Math.sin(along * 0.09 - frame.centerZ * 0.21) * 0.16
    + terrainSurfaceNoise(x * 0.78 + 7, z * 0.78 - 13) * 0.22;
  const width = Math.max(1.65, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.36, width * 0.84);
  const shoulder = THREE.MathUtils.smoothstep(frame.distance, width * 0.46, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.94, width * 1.58));
  const path = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.56, width * 1.12);
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

export function coastalScrubSeepMask(x, z) {
  const upperPocket = Math.exp(-Math.pow((x - 16) / 17, 2) - Math.pow((z + 3) / 8.5, 2));
  const lowerPocket = Math.exp(-Math.pow((x - 4) / 23, 2) - Math.pow((z - 8) / 9.5, 2));
  const outwashCenter = 7 + Math.sin((x - 3) * 0.09) * 2.4;
  const outwash = Math.exp(-Math.pow((z - outwashCenter) / 4.6, 2))
    * THREE.MathUtils.smoothstep(x, 2, 47);
  return clamp01(Math.max(upperPocket, lowerPocket * 0.72, outwash * 0.62));
}

export function coastalScrubThicketStrength(x, z) {
  let strength = 0;
  for (const band of SCRUB_BANDS) {
    const dx = (x - band.x) / band.rx;
    const dz = (z - band.z) / band.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 1.64) * band.strength);
  }
  const shelter = 1 - THREE.MathUtils.smoothstep(x, 4, 48);
  const seep = coastalScrubSeepMask(x, z);
  const windBreakup = terrainSurfaceNoise(x * 0.34 - 11, z * 0.29 + 5) * 0.12;
  return clamp01(strength * (0.72 + shelter * 0.28) + seep * 0.18 + windBreakup);
}

export function coastalScrubBasaltExposure(x, z) {
  const westShoulder = 1 - THREE.MathUtils.smoothstep(x, -45, -10);
  const northRib = Math.exp(-Math.pow((x + 23) / 18, 2) - Math.pow((z + 34) / 17, 2));
  const southRib = Math.exp(-Math.pow((x + 37) / 15, 2) - Math.pow((z - 30) / 24, 2));
  const easternPavement = Math.exp(-Math.pow((x - 39) / 15, 2) - Math.pow((z - 25) / 24, 2));
  const fractured = terrainSurfaceNoise(x * 0.49 + 3, z * 0.45 - 9) * 0.5 + 0.5;
  return clamp01(Math.max(westShoulder, northRib, southRib, easternPavement) * 0.78 + fractured * 0.2);
}

export function coastalScrubSaltExposure(x, z) {
  const coastward = THREE.MathUtils.smoothstep(x, 10, 48);
  const windStreaks = terrainSurfaceNoise(x * 0.22 + z * 0.07, z * 0.34 - 8) * 0.5 + 0.5;
  return clamp01(coastward * (0.72 + windStreaks * 0.28));
}
