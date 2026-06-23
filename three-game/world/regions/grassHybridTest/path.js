import * as THREE from 'three';
import { terrainSurfaceNoise } from '../../terrainShared';

export const GRASS_HYBRID_TEST = 'GRASS_HYBRID_TEST';

export const HYBRID_GRASS_PATH_POINTS = [
  [-34, 21, 5.4],
  [-21, 12, 4.7],
  [-7, 6, 4.1],
  [7, -2, 4.4],
  [19, -10, 4.8],
  [33, -24, 5.6],
];

function segmentInfo(px, pz, ax, az, aw, bx, bz, bw) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return {
    distance: Math.hypot(px - cx, pz - cz),
    width: THREE.MathUtils.lerp(aw, bw, t),
    tangentX: abx / Math.sqrt(lengthSq),
    tangentZ: abz / Math.sqrt(lengthSq),
    centerX: cx,
    centerZ: cz,
  };
}

export function hybridGrassPathInfo(x, z) {
  let nearest = null;
  for (let i = 0; i < HYBRID_GRASS_PATH_POINTS.length - 1; i += 1) {
    const [ax, az, aw] = HYBRID_GRASS_PATH_POINTS[i];
    const [bx, bz, bw] = HYBRID_GRASS_PATH_POINTS[i + 1];
    const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
    if (!nearest || info.distance < nearest.distance) nearest = info;
  }

  const edgeNoise = Math.sin(nearest.centerX * 0.22 + nearest.centerZ * 0.31) * 0.36
    + Math.sin(nearest.centerX * 0.07 - nearest.centerZ * 0.24) * 0.28
    + terrainSurfaceNoise(x * 0.62 + 2.0, z * 0.62 - 5.0) * 0.5;
  const width = Math.max(2.6, nearest.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.24, width * 0.52);
  const tread = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.42, width * 0.78);
  const shoulder = THREE.MathUtils.smoothstep(nearest.distance, width * 0.36, width * 1.1)
    * (1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.86, width * 1.5));
  const path = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.56, width * 1.08);
  return {
    ...nearest,
    width,
    center: THREE.MathUtils.clamp(center, 0, 1),
    tread: THREE.MathUtils.clamp(tread, 0, 1),
    shoulder: THREE.MathUtils.clamp(shoulder, 0, 1),
    path: THREE.MathUtils.clamp(path, 0, 1),
  };
}
