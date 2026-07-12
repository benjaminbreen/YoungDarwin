import * as THREE from 'three';
import { terrainSurfaceNoise } from '../../terrainShared';

export const PENAL_COLONY = 'PENAL_COLONY';

// Settlement ground plan (region 94 x 82; north = -z, east = +x).
// The main red-dirt track drops from the northern highlands, crosses the
// plaza, and continues south toward the lava field; spurs run east to the
// springs/caves and west toward the central highlands.
export const PENAL_COLONY_MAIN_TRACK = [
  [6, -41, 4.8],
  [4.5, -27, 4.4],
  [2, -15, 4.5],
  [1, -6, 5.0],
  [-0.5, 3, 5.0],
  [0.5, 14, 4.4],
  [2, 26, 4.3],
  [2, 41, 4.8],
];

export const PENAL_COLONY_EAST_SPUR = [
  [1, -2, 4.4],
  [12, -1, 4.0],
  [26, 0.5, 3.6],
  [38, -1, 3.4],
  [47, -2, 3.5],
];

export const PENAL_COLONY_WEST_SPUR = [
  [-1, 4, 4.2],
  [-14, 5, 3.8],
  [-27, 4.5, 3.4],
  [-38, 3, 3.3],
  [-47, 2, 3.5],
];

export const PENAL_COLONY_PATHS = [
  PENAL_COLONY_MAIN_TRACK,
  PENAL_COLONY_EAST_SPUR,
  PENAL_COLONY_WEST_SPUR,
];

// Trampled parade ground at the settlement center.
export const PENAL_COLONY_PLAZA = { x: 2, z: -2, radiusX: 11, radiusZ: 8.5 };

// Convict courtyard: huts ring a packed-earth yard behind a crude fence.
export const PENAL_COLONY_COURTYARD = { x: -15, z: 14, halfX: 10.5, halfZ: 6, yaw: 0.05 };

// Isolated punishment/worker hut east of the barracks. It uses the
// destructible timber-structure path rather than the static GLB building path.
export const PENAL_COLONY_INMATE_CABIN = { id: 'inmate-cabin', x: 30, z: -19, yaw: -0.42, radius: 5.8 };
export const PENAL_COLONY_WORK_GANG_CABIN = { id: 'work-gang-cabin', x: 36, z: 14, yaw: 0.28, radius: 7.7 };

// Flattened, scuffed pads under every structure. `pad.y` is resolved lazily
// from the un-flattened base height so terrain.js and the layout agree.
export const PENAL_COLONY_PADS = [
  { id: 'governors-house', x: -26, z: -16, radius: 8.0 },
  { id: 'barracks', x: 14, z: -14, radius: 7.0 },
  { id: 'shack-a', x: -22.5, z: 11, radius: 3.6 },
  { id: 'thatched-a', x: -15, z: 10.5, radius: 4.4 },
  { id: 'shack-b', x: -8.5, z: 12, radius: 3.4 },
  { id: 'thatched-b', x: -19, z: 17.5, radius: 4.2 },
  { id: 'threshing-hut', x: -20, z: 30, radius: 5.4 },
  { id: 'animal-leanto', x: 8, z: 29, radius: 4.6 },
  { id: 'animal-paddock', x: 20, z: 31, radius: 5.6 },
  { id: 'outhouse', x: -9, z: 35, radius: 2.2 },
  { id: PENAL_COLONY_INMATE_CABIN.id, x: PENAL_COLONY_INMATE_CABIN.x, z: PENAL_COLONY_INMATE_CABIN.z, radius: PENAL_COLONY_INMATE_CABIN.radius },
  { id: PENAL_COLONY_WORK_GANG_CABIN.id, x: PENAL_COLONY_WORK_GANG_CABIN.x, z: PENAL_COLONY_WORK_GANG_CABIN.z, radius: PENAL_COLONY_WORK_GANG_CABIN.radius },
];

// Cultivated plots: dark tilled earth ("black mud", as Darwin recorded) with
// row striping. `rowAxis` is the direction the furrows run.
export const PENAL_COLONY_GARDENS = [
  { id: 'sweet-potato-plot', crop: 'sweetPotato', x: -11, z: 22.5, halfX: 6.5, halfZ: 3.8, yaw: 0.05, rowAxis: 'x', rowSpacing: 1.15 },
  { id: 'maize-plot', crop: 'maize', x: 11, z: 20, halfX: 6.0, halfZ: 4.2, yaw: -0.04, rowAxis: 'z', rowSpacing: 1.05 },
  { id: 'cane-plot', crop: 'sugarCane', x: 13, z: 9, halfX: 3.6, halfZ: 2.6, yaw: 0.12, rowAxis: 'z', rowSpacing: 1.25 },
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

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

export function penalColonyPathInfo(x, z) {
  let nearest = null;
  for (const polyline of PENAL_COLONY_PATHS) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const [ax, az, aw] = polyline[i];
      const [bx, bz, bw] = polyline[i + 1];
      const info = segmentInfo(x, z, ax, az, aw, bx, bz, bw);
      if (!nearest || info.distance < nearest.distance) nearest = info;
    }
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
    center: clamp01(center),
    tread: clamp01(tread),
    shoulder: clamp01(shoulder),
    path: clamp01(path),
  };
}

// 1 inside the plaza fading to 0 at its noisy edge.
export function penalColonyPlazaMask(x, z) {
  const { x: cx, z: cz, radiusX, radiusZ } = PENAL_COLONY_PLAZA;
  const wobble = terrainSurfaceNoise(x * 0.35 + 8.0, z * 0.35 - 3.0) * 0.16;
  const d = Math.hypot((x - cx) / radiusX, (z - cz) / radiusZ) + wobble;
  return clamp01(1 - THREE.MathUtils.smoothstep(d, 0.72, 1.04));
}

// World -> ring-local, inverse of a THREE object yaw (rotation [0, yaw, 0]),
// so masks line up exactly with objects/fences placed at the same yaw.
function rotatedLocal(x, z, cx, cz, yaw) {
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { lx: dx * cos - dz * sin, lz: dx * sin + dz * cos };
}

export function penalColonyCourtyardMask(x, z) {
  const { x: cx, z: cz, halfX, halfZ, yaw } = PENAL_COLONY_COURTYARD;
  const { lx, lz } = rotatedLocal(x, z, cx, cz, yaw);
  const wobble = terrainSurfaceNoise(x * 0.4 - 4.0, z * 0.4 + 6.0) * 0.9;
  const dx = Math.abs(lx) - halfX + wobble;
  const dz = Math.abs(lz) - halfZ + wobble;
  const outside = Math.max(dx, dz);
  return clamp01(1 - THREE.MathUtils.smoothstep(outside, -1.6, 1.2));
}

export function penalColonyPadMask(x, z) {
  let mask = 0;
  for (const pad of PENAL_COLONY_PADS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    mask = Math.max(mask, 1 - THREE.MathUtils.smoothstep(d, pad.radius * 0.55, pad.radius * 1.05));
  }
  return clamp01(mask);
}

// Strongest garden plot influence at (x, z): { mask, rowPhase, plot }.
export function penalColonyGardenInfo(x, z) {
  let best = { mask: 0, rowPhase: 0, plot: null };
  for (const plot of PENAL_COLONY_GARDENS) {
    const { lx, lz } = rotatedLocal(x, z, plot.x, plot.z, plot.yaw);
    const wobble = terrainSurfaceNoise(x * 0.5 + plot.x, z * 0.5 - plot.z) * 0.42;
    const dx = Math.abs(lx) - plot.halfX + wobble;
    const dz = Math.abs(lz) - plot.halfZ + wobble;
    const outside = Math.max(dx, dz);
    const mask = clamp01(1 - THREE.MathUtils.smoothstep(outside, -0.9, 0.7));
    if (mask > best.mask) {
      const along = plot.rowAxis === 'x' ? lz : lx;
      best = { mask, rowPhase: (along / plot.rowSpacing) * Math.PI * 2, plot };
    }
  }
  return best;
}

// Combined packed-earth mask (plaza + courtyard + structure pads), used to
// suppress grass and select the trampled biome/colour.
export function penalColonyTrampledMask(x, z) {
  return clamp01(Math.max(
    penalColonyPlazaMask(x, z),
    penalColonyCourtyardMask(x, z) * 0.92,
    penalColonyPadMask(x, z) * 0.85,
  ));
}
