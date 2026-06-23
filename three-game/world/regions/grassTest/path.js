import * as THREE from 'three';
import { terrainSurfaceNoise } from '../../terrainShared';

export const GRASS_TEST_PATH_POINTS = [
  [-29, 28, 4.8],
  [-18, 18, 4.2],
  [-5, 11, 3.6],
  [8, 2, 4.0],
  [20, -10, 4.6],
  [30, -27, 5.2],
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
  return {
    distance: Math.hypot(dx, dz),
    width,
    tangentX: abx / Math.sqrt(lengthSq),
    tangentZ: abz / Math.sqrt(lengthSq),
    centerX: cx,
    centerZ: cz,
  };
}

export function grassTestPathInfo(x, z) {
  let nearest = null;
  for (let i = 0; i < GRASS_TEST_PATH_POINTS.length - 1; i += 1) {
    const [ax, az, aw] = GRASS_TEST_PATH_POINTS[i];
    const [bx, bz, bw] = GRASS_TEST_PATH_POINTS[i + 1];
    const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
    if (!nearest || info.distance < nearest.distance) nearest = info;
  }

  const edgeNoise = Math.sin(nearest.centerX * 0.27 + nearest.centerZ * 0.19) * 0.28
    + Math.sin(nearest.centerX * 0.11 - nearest.centerZ * 0.35) * 0.18
    + terrainSurfaceNoise(x * 0.95 + 7.0, z * 0.95 - 4.0) * 0.36;
  const width = Math.max(2.2, nearest.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.28, width * 0.58);
  const tread = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.48, width * 0.86);
  const shoulder = THREE.MathUtils.smoothstep(nearest.distance, width * 0.38, width * 1.25)
    * (1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.9, width * 1.55));
  const path = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.55, width * 1.12);

  return {
    ...nearest,
    width,
    center: THREE.MathUtils.clamp(center, 0, 1),
    tread: THREE.MathUtils.clamp(tread, 0, 1),
    shoulder: THREE.MathUtils.clamp(shoulder, 0, 1),
    path: THREE.MathUtils.clamp(path, 0, 1),
  };
}
