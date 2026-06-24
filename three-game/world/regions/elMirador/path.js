import * as THREE from 'three';
import { terrainSurfaceNoise } from '../../terrainShared';

export const EL_MIRADOR = 'EL_MIRADOR';

export const EL_MIRADOR_PATH_POINTS = [
  [-34, -38, 4.4],
  [-25, -26, 4.1],
  [-13, -17, 3.6],
  [-2, -8, 3.35],
  [7, 4, 3.25],
  [15, 16, 3.45],
  [27, 32, 4.0],
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

export function elMiradorPathInfo(x, z) {
  let nearest = null;
  for (let i = 0; i < EL_MIRADOR_PATH_POINTS.length - 1; i += 1) {
    const [ax, az, aw] = EL_MIRADOR_PATH_POINTS[i];
    const [bx, bz, bw] = EL_MIRADOR_PATH_POINTS[i + 1];
    const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
    if (!nearest || info.distance < nearest.distance) nearest = info;
  }

  const along = nearest.centerX * nearest.tangentX + nearest.centerZ * nearest.tangentZ;
  const edgeNoise = Math.sin(along * 0.21 + nearest.centerX * 0.11) * 0.35
    + Math.sin(along * 0.12 - nearest.centerZ * 0.19) * 0.24
    + terrainSurfaceNoise(x * 0.84 + 12.0, z * 0.84 - 4.0) * 0.32;
  const width = Math.max(2.35, nearest.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.36, width * 0.8);
  const shoulder = THREE.MathUtils.smoothstep(nearest.distance, width * 0.46, width * 1.14)
    * (1 - THREE.MathUtils.smoothstep(nearest.distance, width * 0.98, width * 1.62));
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
