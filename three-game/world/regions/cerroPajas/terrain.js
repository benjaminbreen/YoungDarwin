import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  CERRO_PAJAS,
  CERRO_PAJAS_CONE,
  CERRO_PAJAS_JUNCTION,
  CERRO_PAJAS_SUMMIT_CROWN,
  cerroPajasConeInfo,
  cerroPajasMoisture,
  cerroPajasPathInfo,
  cerroPajasRockExposure,
  cerroPajasStrawGrass,
} from './path';

function gaussian(x, z, cx, cz, rx, rz) {
  return Math.exp(-Math.pow((x - cx) / rx, 2) - Math.pow((z - cz) / rz, 2));
}

// Crater cone profile. Inside the rim the floor is a shallow, level bowl; the
// outer flank falls away over ~30 m so the summit reads as the high point from
// every edge while remaining walkable (outer grade stays below ~0.6).
function coneHeight(cone) {
  const floor = CERRO_PAJAS_CONE.rimHeight - CERRO_PAJAS_CONE.craterDepth;
  if (cone.radius < cone.rimRadius) {
    const t = cone.radius / cone.rimRadius;
    return THREE.MathUtils.lerp(floor, cone.rimHeight, t * t);
  }
  const fall = THREE.MathUtils.smoothstep(cone.radius, cone.rimRadius, cone.rimRadius + 31);
  return cone.rimHeight * Math.pow(1 - fall, 1.12);
}

function surfaceDetail(x, z, movementSurface) {
  const hummocks = elevationNoise(x * 0.15 - 4, z * 0.14 + 12);
  const grit = terrainFineDetail(x, z);
  if (movementSurface) return hummocks * 0.06 + grit * 0.04;
  return hummocks * 0.15 + grit * 0.42;
}

export function cerroPajasHeight(x, z, { movementSurface = false } = {}) {
  const cone = cerroPajasConeInfo(x, z);
  const path = cerroPajasPathInfo(x, z);
  const rock = cerroPajasRockExposure(x, z);
  const broad = elevationNoise(x * 0.024 + 3, z * 0.022 - 11);
  const cross = elevationNoise(x * 0.051 - 9, z * 0.047 + 5);

  let y = 4.4
    + broad * 1.25
    + cross * 0.48
    // The four approaches arrive across a broad shoulder that already rises
    // toward the cone, so the summit does not sit in a dish.
    + gaussian(x, z, CERRO_PAJAS_CONE.x, CERRO_PAJAS_CONE.z, 58, 54) * 1.6
    + coneHeight(cone)
    // The crown outcrop lifts the north-west rim into a readable summit knoll.
    + gaussian(x, z, CERRO_PAJAS_SUMMIT_CROWN.x, CERRO_PAJAS_SUMMIT_CROWN.z, 7, 6) * 1.35
    // The junction sits on a gentle bench rather than a slope.
    - gaussian(x, z, CERRO_PAJAS_JUNCTION.x, CERRO_PAJAS_JUNCTION.z, 9, 8) * 0.55
    + surfaceDetail(x, z, movementSurface);

  const fractured = Math.max(0, crackNoise(x * 0.17 + 5, z * 0.16 - 3));
  y += rock * fractured * (movementSurface ? 0.08 : 0.34);
  y -= path.tread * 0.1 + path.center * 0.03;
  return y;
}

export function cerroPajasBiomeAt(x, z, y = cerroPajasHeight(x, z)) {
  const path = cerroPajasPathInfo(x, z);
  const cone = cerroPajasConeInfo(x, z);
  const rock = cerroPajasRockExposure(x, z);
  const moisture = cerroPajasMoisture(x, z);
  const straw = cerroPajasStrawGrass(x, z);
  if (path.tread > 0.5 || path.center > 0.3) return 'summit-cinder-path';
  if (rock > 0.66) return 'weathered-tuff-crown';
  if (cone.crater > 0.5) return 'crater-sedge-meadow';
  if (path.shoulder > 0.36) return 'summit-path-shoulder';
  // Anything high on the cone is wind-cured straw, whatever its bearing.
  if (straw > 0.5 || y > 15) return 'summit-straw-grass';
  if (moisture > 0.58) return 'misty-scalesia-slope';
  return 'highland-pasture-grass';
}

const BIOME_COLORS = {
  'summit-cinder-path': '#93533a',
  'weathered-tuff-crown': '#6b5e4a',
  'crater-sedge-meadow': '#4f6a3e',
  'summit-path-shoulder': '#7d7247',
  'summit-straw-grass': '#9c8d55',
  'misty-scalesia-slope': '#47603c',
  'highland-pasture-grass': '#66733f',
};

export function cerroPajasColor(x, z, y) {
  const biome = cerroPajasBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.17 + 6, z * 0.16 - 2) * 0.5 + 0.5;
  const fine = terrainSurfaceNoise(x * 1.5 - 9, z * 1.4 + 4) * 0.5 + 0.5;
  const color = new THREE.Color(BIOME_COLORS[biome] || '#66733f');
  color.lerp(new THREE.Color('#857a4a'), broad * 0.16);
  color.lerp(new THREE.Color('#2f4430'), cerroPajasMoisture(x, z) * 0.14);
  color.multiplyScalar(0.87 + fine * 0.1);
  return color;
}

export function cerroPajasRenderSample(x, z) {
  const height = cerroPajasHeight(x, z);
  return {
    height,
    biome: cerroPajasBiomeAt(x, z, height),
    color: cerroPajasColor(x, z, height),
  };
}

export function isCerroPajasWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const path = cerroPajasPathInfo(x, z);
  const step = 0.82;
  const left = cerroPajasHeight(x - step, z, { movementSurface: true });
  const right = cerroPajasHeight(x + step, z, { movementSurface: true });
  const back = cerroPajasHeight(x, z - step, { movementSurface: true });
  const forward = cerroPajasHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.02 || path.path > 0.18;
}

export const cerroPajasRegion = {
  id: CERRO_PAJAS,
  aliases: ['cerro-pajas', 'central-highlands-summit'],
  terrain: {
    height: cerroPajasHeight,
    movementHeight: (x, z) => cerroPajasHeight(x, z, { movementSurface: true }),
    biomeAt: cerroPajasBiomeAt,
    color: cerroPajasColor,
    sample: cerroPajasRenderSample,
    isWalkable: isCerroPajasWalkable,
    // Direct loads start on the summit spur below the rim notch, looking
    // through it across the crater floor to the crown outcrop on the far rim.
    defaultSpawn: [8.2, 0, 7.4],
    defaultFacing: [-0.66, 0, -0.75],
    entrySpawns: {
      north: [9.6, 0, -45.5],
      east: [49.5, 0, 2.8],
      south: [6.6, 0, 45.5],
      west: [-49.5, 0, 0.4],
    },
    entryFacings: {
      north: [-0.3, 0, 0.95],
      east: [-1, 0, 0.1],
      south: [-0.1, 0, -1],
      west: [1, 0, 0.15],
    },
  },
};
