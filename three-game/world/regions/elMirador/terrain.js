import * as THREE from 'three';
import { crackNoise, elevationNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';
import { EL_MIRADOR, elMiradorPathInfo } from './path';

function ridgeMask(x, z) {
  const westRidge = Math.exp(-Math.pow((x + 31) / 14, 2)) * (0.72 + Math.sin(z * 0.08) * 0.18);
  const summit = Math.exp(-Math.pow((x - 21) / 18, 2) - Math.pow((z - 28) / 26, 2)) * 0.86;
  const upperSlope = THREE.MathUtils.smoothstep(z, 10, 44) * 0.58;
  return THREE.MathUtils.clamp(Math.max(westRidge, summit, upperSlope), 0, 1);
}

function cliffDropMask(x, z) {
  const east = THREE.MathUtils.smoothstep(x, 31, 49);
  const middle = THREE.MathUtils.smoothstep(z, -30, 2) * (1 - THREE.MathUtils.smoothstep(z, 34, 48));
  return THREE.MathUtils.clamp(east * middle, 0, 1);
}

export function elMiradorHeight(x, z, { movementSurface = false } = {}) {
  const climb = THREE.MathUtils.smoothstep(z, -44, 44);
  const broad = elevationNoise(x * 0.032 + 10.0, z * 0.034 - 6.0);
  const medium = elevationNoise(x * 0.078 - 13.0, z * 0.072 + 9.0);
  const ridge = ridgeMask(x, z);
  const cliff = cliffDropMask(x, z);
  const path = elMiradorPathInfo(x, z);
  const shelf = Math.max(0, crackNoise(x * 0.14 + 2.0, z * 0.12 - 11.0));
  const fine = terrainFineDetail(x, z) * (movementSurface ? 0.1 : 0.34);

  let y = 2.15
    + climb * 4.8
    + broad * 1.45
    + medium * 0.72
    + ridge * 1.22
    + shelf * ridge * (movementSurface ? 0.12 : 0.48)
    - cliff * 2.1;

  // Cut a walkable bench into the hillside without making the route look paved.
  y -= path.tread * 0.24 + path.center * 0.08;
  y += fine;
  return Math.max(0.35, y);
}

export function elMiradorBiomeAt(x, z, y = elMiradorHeight(x, z)) {
  const path = elMiradorPathInfo(x, z);
  if (path.tread > 0.48 || path.center > 0.28) return 'red-dirt-path';
  if (path.shoulder > 0.36) return 'path-shoulder';
  if (cliffDropMask(x, z) > 0.58) return 'mirador-cliff';
  if (ridgeMask(x, z) > 0.62 && y > 5.2) return 'dry-ridge-grass';
  const exposed = terrainSurfaceNoise(x * 0.46 + 4.0, z * 0.46 - 8.0);
  if (exposed > 0.26) return 'stony-highland-slope';
  return 'dry-highland-grass';
}

export function elMiradorColor(x, z, y) {
  const biome = elMiradorBiomeAt(x, z, y);
  const path = elMiradorPathInfo(x, z);
  const noise = terrainSurfaceNoise(x * 0.52 + 3.0, z * 0.52 - 2.0) * 0.5 + 0.5;
  const color = new THREE.Color('#6f7449');
  color.lerp(new THREE.Color('#9a8a50'), noise * 0.28);
  color.lerp(new THREE.Color('#4b6037'), (1 - noise) * 0.18);
  if (biome === 'dry-ridge-grass') color.lerp(new THREE.Color('#a09a5a'), 0.28);
  if (biome === 'stony-highland-slope') color.lerp(new THREE.Color('#887a5c'), 0.26);
  if (biome === 'mirador-cliff') color.lerp(new THREE.Color('#7a6750'), 0.52);
  if (biome === 'path-shoulder') color.lerp(new THREE.Color('#7e7351'), 0.48 + path.shoulder * 0.18);
  if (biome === 'red-dirt-path') {
    color.lerp(new THREE.Color('#a7582b'), 0.68 + path.center * 0.12);
    color.lerp(new THREE.Color('#d0b072'), noise * 0.1);
  }
  color.multiplyScalar(0.88 + noise * 0.12);
  return color;
}

export function isElMiradorWalkable(x, z, config) {
  const margin = 1.6;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  if (cliffDropMask(x, z) > 0.72) return false;
  const path = elMiradorPathInfo(x, z);
  const step = 0.85;
  const left = elMiradorHeight(x - step, z, { movementSurface: true });
  const right = elMiradorHeight(x + step, z, { movementSurface: true });
  const back = elMiradorHeight(x, z - step, { movementSurface: true });
  const forward = elMiradorHeight(x, z + step, { movementSurface: true });
  const slope = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return slope < 1.08 || path.path > 0.22;
}

export const elMiradorRegion = {
  id: EL_MIRADOR,
  aliases: ['el-mirador'],
  terrain: {
    height: elMiradorHeight,
    movementHeight: (x, z) => elMiradorHeight(x, z, { movementSurface: true }),
    biomeAt: elMiradorBiomeAt,
    color: elMiradorColor,
    isWalkable: isElMiradorWalkable,
    defaultSpawn: [-3, 0, -7],
  },
};
