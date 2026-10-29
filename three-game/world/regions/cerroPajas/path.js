import * as THREE from 'three';
import { pathFrameAt, pathShoulderMask } from '../../paths/standardPath';
import { terrainSurfaceNoise } from '../../terrainShared';
import {
  CERRO_PAJAS_PENAL_COLONY_SEAM,
  CERRO_PAJAS_ROCKY_CLEARING_SEAM,
  POST_SCRUB_RISE_CERRO_PAJAS_SEAM,
  WESTERN_HIGHLANDS_CERRO_PAJAS_SEAM,
} from '../../routeSeams';

export const CERRO_PAJAS = 'C_HIGH';

// Cerro Pajas, the island's central summit (region 104 x 96; north = -z).
// One broken crater cone dominates the map. Its rim is highest on the
// north-west crown, where a tuff outcrop makes the summit legible from every
// approach; a low south-east notch lets the summit trail drop onto the grassy
// crater floor. The four regional trails meet on the south-east shoulder.
export const CERRO_PAJAS_CONE = Object.freeze({ x: -6, z: -10, rimRadius: 13, rimHeight: 10.5, craterDepth: 3.8 });
export const CERRO_PAJAS_SUMMIT_CROWN = Object.freeze({ x: -15.5, z: -19.5 });
export const CERRO_PAJAS_JUNCTION = Object.freeze({ x: 9, z: 11 });
const RIM_NOTCH = Object.freeze({ x: 3.4, z: -0.6 });

export const CERRO_PAJAS_PATH_POINTS = [
  [
    [...POST_SCRUB_RISE_CERRO_PAJAS_SEAM.target.point, 1.74],
    [11, -38, 1.7],
    [17, -27, 1.66],
    [19, -14, 1.66],
    [16, -1, 1.7],
    [CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 1.82],
  ],
  [
    [...CERRO_PAJAS_ROCKY_CLEARING_SEAM.target.point, 1.7],
    [39, 4.5, 1.68],
    [26, 8.5, 1.72],
    [CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 1.82],
  ],
  [
    [...CERRO_PAJAS_PENAL_COLONY_SEAM.target.point, 1.72],
    [5, 37, 1.7],
    [10, 24, 1.74],
    [CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 1.82],
  ],
  [
    [...WESTERN_HIGHLANDS_CERRO_PAJAS_SEAM.target.point, 1.68],
    [-39, 6, 1.66],
    [-25, 14, 1.68],
    [-9, 17, 1.74],
    [CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 1.82],
  ],
  // Summit spur: up through the rim notch and onto the crater floor.
  [
    [CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 1.82],
    [6.5, 4.5, 1.58],
    [RIM_NOTCH.x, RIM_NOTCH.z, 1.46],
    [-1, -5, 1.42],
    [-5, -9.5, 1.4],
  ],
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function cerroPajasPathInfo(x, z) {
  const frame = pathFrameAt(CERRO_PAJAS_PATH_POINTS, x, z);
  const tangentX = Math.cos(frame.yaw);
  const tangentZ = Math.sin(frame.yaw);
  const along = frame.centerX * tangentX + frame.centerZ * tangentZ;
  const edgeNoise = Math.sin(along * 0.21 + frame.centerX * 0.1) * 0.18
    + Math.sin(along * 0.07 - frame.centerZ * 0.17) * 0.14
    + terrainSurfaceNoise(x * 0.7 + 3, z * 0.68 - 9) * 0.2;
  const width = Math.max(1.5, frame.width + edgeNoise);
  const center = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.18, width * 0.48);
  const tread = 1 - THREE.MathUtils.smoothstep(frame.distance, width * 0.38, width * 0.84);
  const shoulder = pathShoulderMask(frame, x, z, width);
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

// Radial position relative to the crater, plus how much of the rim survives
// at this bearing: highest at the north-west crown, lowest at the south-east
// notch the trail uses.
export function cerroPajasConeInfo(x, z) {
  const dx = x - CERRO_PAJAS_CONE.x;
  const dz = z - CERRO_PAJAS_CONE.z;
  const radius = Math.hypot(dx, dz);
  const dirX = radius > 0.001 ? dx / radius : 0;
  const dirZ = radius > 0.001 ? dz / radius : 1;
  // +1 toward the north-west crown, -1 toward the south-east notch.
  const crownFacing = (-dirX * 0.62 - dirZ * 0.78);
  const notchFacing = Math.max(0, dirX * 0.98 + dirZ * 0.18);
  const rimWobble = terrainSurfaceNoise(dirX * 3.1 + 7, dirZ * 3.1 - 4) * 0.55;
  const rimHeight = CERRO_PAJAS_CONE.rimHeight
    + crownFacing * 1.6
    + rimWobble
    - Math.pow(notchFacing, 6) * 2.9;
  const rimRadius = CERRO_PAJAS_CONE.rimRadius + terrainSurfaceNoise(dirX * 2.2 - 5, dirZ * 2.2 + 6) * 1.1;
  return {
    dx,
    dz,
    radius,
    dirX,
    dirZ,
    rimRadius,
    rimHeight,
    crownFacing,
    inside: radius < rimRadius ? 1 : 0,
    crater: clamp01(1 - THREE.MathUtils.smoothstep(radius, rimRadius * 0.55, rimRadius * 0.95)),
    rim: clamp01(1 - Math.abs(radius - rimRadius) / 4.5),
    summit: clamp01(1 - THREE.MathUtils.smoothstep(radius, rimRadius - 2, rimRadius + 15)),
  };
}

// Damp, misty ground: the lee (south/west) flanks and the crater floor hold
// garua moisture; the north-facing upper cone is windswept straw grass.
export function cerroPajasMoisture(x, z) {
  const cone = cerroPajasConeInfo(x, z);
  const leeward = THREE.MathUtils.smoothstep(z, -20, 34) * 0.42;
  const westLee = Math.exp(-Math.pow((x + 32) / 20, 2) - Math.pow((z - 16) / 22, 2)) * 0.34;
  const craterDamp = cone.crater * 0.62;
  const exposedRim = cone.rim * 0.28;
  return clamp01(0.18 + leeward + westLee + craterDamp - exposedRim);
}

// Bare weathered tuff and basalt where the rim is steep or the crown breaks
// through the grass.
export function cerroPajasRockExposure(x, z) {
  const cone = cerroPajasConeInfo(x, z);
  const crown = Math.exp(
    -Math.pow((x - CERRO_PAJAS_SUMMIT_CROWN.x) / 7.5, 2)
    -Math.pow((z - CERRO_PAJAS_SUMMIT_CROWN.z) / 6.2, 2),
  );
  const rimBreak = cone.rim * clamp01(0.3 + cone.crownFacing * 0.36)
    * (0.6 + (terrainSurfaceNoise(x * 0.31 + 2, z * 0.29 - 5) * 0.5 + 0.5) * 0.5);
  return clamp01(Math.max(crown * 0.96, rimBreak));
}

// Tall summit straw grass ("pajas") on the upper cone.
export function cerroPajasStrawGrass(x, z) {
  const cone = cerroPajasConeInfo(x, z);
  return clamp01(cone.summit * (1 - cone.crater * 0.55));
}
