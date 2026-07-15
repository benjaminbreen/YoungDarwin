import * as THREE from 'three';
import { terrainSurfaceNoise } from '../../terrainShared';

export const ROCKY_CLEARING = 'E_MID';

export const ROCKY_CLEARING_CAVE = {
  id: 'rocky-clearing-cave-mouth',
  x: 1.8,
  z: -10.8,
  yaw: 0,
  promptX: 1.8,
  promptZ: -6.4,
  destinationZoneId: 'CAVE_ENTRANCE',
};

export const ROCKY_CLEARING_PATH_POINTS = [
  [-44, 2.3, 4.4],
  [-30, 1.2, 4.1],
  [-16, 0.1, 4.35],
  [-3, -0.8, 5.75],
  [9, -1.1, 5.45],
  [24, -0.5, 4.35],
  [43, -1.8, 4.55],
];

function segmentInfo(px, pz, ax, az, aw, bx, bz, bw) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const width = THREE.MathUtils.lerp(aw, bw, t);
  const dx = px - cx;
  const dz = pz - cz;
  const length = Math.sqrt(lengthSq);
  return {
    distance: Math.hypot(dx, dz),
    width,
    tangentX: abx / length,
    tangentZ: abz / length,
    centerX: cx,
    centerZ: cz,
  };
}

export function rockyClearingPathInfo(x, z) {
  let nearest = null;
  for (let i = 0; i < ROCKY_CLEARING_PATH_POINTS.length - 1; i += 1) {
    const [ax, az, aw] = ROCKY_CLEARING_PATH_POINTS[i];
    const [bx, bz, bw] = ROCKY_CLEARING_PATH_POINTS[i + 1];
    const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
    if (!nearest || info.distance < nearest.distance) nearest = info;
  }

  const along = nearest.centerX * nearest.tangentX + nearest.centerZ * nearest.tangentZ;
  const edgeNoise = Math.sin(along * 0.18 + nearest.centerX * 0.09) * 0.42
    + Math.sin(along * 0.11 - nearest.centerZ * 0.21) * 0.28
    + terrainSurfaceNoise(x * 0.72 + 9.0, z * 0.72 - 13.0) * 0.36;
  const width = Math.max(2.5, nearest.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.16, width * 0.44);
  const tread = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.34, width * 0.82);
  const shoulder = THREE.MathUtils.smoothstep(nearest.distance, width * 0.46, width * 1.08)
    * (1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.96, width * 1.58));
  const path = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.56, width * 1.12);

  return {
    ...nearest,
    width,
    center: THREE.MathUtils.clamp(center, 0, 1),
    tread: THREE.MathUtils.clamp(tread, 0, 1),
    shoulder: THREE.MathUtils.clamp(shoulder, 0, 1),
    path: THREE.MathUtils.clamp(path, 0, 1),
  };
}

export function rockyClearingCentralMask(x, z) {
  const dx = x / 20;
  const dz = (z + 1.9) / 13.5;
  const basin = Math.exp(-(dx * dx + dz * dz) * 1.55);
  const southFan = Math.exp(-Math.pow((x - 3.5) / 21, 2) - Math.pow((z - 6.4) / 12, 2)) * 0.36;
  return THREE.MathUtils.clamp(Math.max(basin, southFan), 0, 1);
}

export function rockyClearingCaveThresholdMask(x, z) {
  const dx = (x - ROCKY_CLEARING_CAVE.x) / 7.6;
  const dz = (z - (ROCKY_CLEARING_CAVE.z + 3.0)) / 5.2;
  const threshold = Math.exp(-(dx * dx + dz * dz) * 1.8);
  const fan = Math.exp(-Math.pow((x - ROCKY_CLEARING_CAVE.x) / 9.2, 2) - Math.pow((z + 5.6) / 7.5, 2)) * 0.58;
  return THREE.MathUtils.clamp(Math.max(threshold, fan), 0, 1);
}

export function rockyClearingRubbleMask(x, z) {
  const cave = ROCKY_CLEARING_CAVE;
  const apron = Math.exp(-Math.pow((x - cave.x) / 12, 2) - Math.pow((z - cave.z) / 7.5, 2));
  const westPile = Math.exp(-Math.pow((x + 13.0) / 8.5, 2) - Math.pow((z + 8.2) / 5.8, 2)) * 0.82;
  const eastPile = Math.exp(-Math.pow((x - 15.0) / 9.0, 2) - Math.pow((z + 7.0) / 6.2, 2)) * 0.68;
  const northShelf = THREE.MathUtils.smoothstep(-z, 8.0, 20.0)
    * Math.exp(-Math.pow((x - 2.0) / 24.0, 2)) * 0.72;
  return THREE.MathUtils.clamp(Math.max(apron, westPile, eastPile, northShelf), 0, 1);
}

export function rockyClearingCaveWallMask(x, z) {
  const cave = ROCKY_CLEARING_CAVE;
  const northFace = THREE.MathUtils.smoothstep(-z, 6.2, 20.5)
    * Math.exp(-Math.pow((x - cave.x) / 24.0, 2));
  const westShoulder = Math.exp(-Math.pow((x - (cave.x - 11.5)) / 10.5, 2) - Math.pow((z - (cave.z - 1.8)) / 8.5, 2)) * 0.82;
  const eastShoulder = Math.exp(-Math.pow((x - (cave.x + 12.0)) / 11.0, 2) - Math.pow((z - (cave.z - 1.5)) / 8.8, 2)) * 0.76;
  const mouthCut = Math.exp(-Math.pow((x - cave.x) / 5.0, 2) - Math.pow((z - cave.z) / 3.35, 2));
  return THREE.MathUtils.clamp(Math.max(northFace, westShoulder, eastShoulder) * (1 - mouthCut * 0.94), 0, 1);
}
