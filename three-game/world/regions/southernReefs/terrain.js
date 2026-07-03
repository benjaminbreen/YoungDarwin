import * as THREE from 'three';
import { elevationNoise, surfaceNoise, terrainFineDetail, terrainSurfaceNoise } from '../../terrainShared';

// ---------------------------------------------------------------------------
// Southern Reefs (S_REEFS) — open tropical white sand and shallow teal water.
//
// Layout (z axis: -46 north/inland -> +46 south/ocean):
//   a clean white-sand beach slopes south into a broad, wadeable tropical
//   shelf. The far southern edge drops into open water for the blocked ocean
//   boundary. No rocks, huts, grass, paths, coral props, or strandline clutter.

export const SOUTHERN_REEFS = 'S_REEFS';

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep01(value, min, max) {
  return THREE.MathUtils.smoothstep(value, min, max);
}

export function southernReefsCoastZ(x) {
  return 7.5
    + Math.sin(x * 0.045 + 0.4) * 1.9
    + Math.sin(x * 0.018 - 1.0) * 1.15;
}

export function southernReefsCoastDistance(x, z) {
  return southernReefsCoastZ(x) - z;
}

function southernReefsRipple(x, z) {
  const shoreParallel = Math.sin((x * 0.32 - z * 0.9) * 1.55 + surfaceNoise(x * 0.09, z * 0.09) * 1.6);
  return shoreParallel * 0.028 + surfaceNoise(x * 0.36 + 2, z * 0.32 - 4) * 0.025;
}

export function southernReefsHeight(x, z, { movementSurface = false } = {}) {
  const d = southernReefsCoastDistance(x, z); // >0 inland/dry, <0 seaward.
  let y;

  if (d < 0) {
    // Long, calm white-sand shelf. It remains mostly wadeable, with only the
    // far southern edge dropping into blocked open water.
    y = -0.18 + Math.max(d * 0.042, -1.08);
    y += surfaceNoise(x * 0.14 + 4, z * 0.14 - 6) * (movementSurface ? 0.025 : 0.055);
  } else {
    // Dry beach: a very gentle rise and broad low dunes, kept intentionally
    // smooth so the scene reads as pure white sand rather than lumpy terrain.
    y = -0.18 + 0.82 * (1 - Math.exp(-d * 0.07));
    y += smoothstep01(d, 10, 32) * (elevationNoise(x * 0.045 + 3, z * 0.04 + 8) * 0.18 + 0.08);
    y += smoothstep01(-z, 34, 46) * 0.32;
  }

  const dampBand = 1 - smoothstep01(Math.abs(d), 0.8, 6.5);
  y += southernReefsRipple(x, z) * (movementSurface ? 0.25 : 1.0) * (0.45 + dampBand * 0.55);

  const dry = smoothstep01(y, -0.4, 0.1);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.08 : 0.22);

  const farSouth = smoothstep01(z, 34, 45.5);
  const seaward = 1 - smoothstep01(d, -3.5, 0);
  y -= farSouth * seaward * 2.75;

  return Math.max(-4.0, y);
}

export function southernReefsBiomeAt(x, z, y = southernReefsHeight(x, z)) {
  const d = southernReefsCoastDistance(x, z);
  if (y < -2.05) return 'water';
  if (y < -0.45) return 'shallow-white-sand';
  if (d < 2.2) return 'wet-white-sand';
  return 'white-sand';
}

export function southernReefsColor(x, z, y) {
  const noise = terrainSurfaceNoise(x, z);
  const biome = southernReefsBiomeAt(x, z, y);
  const color = new THREE.Color();
  if (biome === 'water') {
    color.set('#2f9fba');
    color.lerp(new THREE.Color('#6edbc9'), Math.max(0, noise) * 0.22);
  } else if (biome === 'shallow-white-sand') {
    const depth = clamp01((-0.45 - y) / 1.35);
    color.set('#d7f0df');
    color.lerp(new THREE.Color('#82d7cb'), depth * 0.58);
    color.lerp(new THREE.Color('#f1ecd0'), Math.max(0, noise) * 0.18);
  } else if (biome === 'wet-white-sand') {
    color.set('#dcdcc8');
    color.lerp(new THREE.Color('#eef0d8'), Math.max(0, noise) * 0.28);
    color.lerp(new THREE.Color('#b9cdbc'), Math.max(0, -noise) * 0.18);
  } else {
    color.set('#eee8cf');
    color.lerp(new THREE.Color('#fff5dc'), Math.max(0, noise) * 0.36);
    color.lerp(new THREE.Color('#ddd5b8'), Math.max(0, -noise) * 0.14);
  }
  color.multiplyScalar(0.98 + noise * 0.04);
  return color;
}

export function isSouthernReefsWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  return inBounds && southernReefsHeight(x, z, { movementSurface: true }) > -0.45;
}

export const southernReefsRegion = {
  id: SOUTHERN_REEFS,
  aliases: ['southern-reefs'],
  terrain: {
    height: southernReefsHeight,
    movementHeight: (x, z) => southernReefsHeight(x, z, { movementSurface: true }),
    biomeAt: southernReefsBiomeAt,
    color: southernReefsColor,
    isWalkable: isSouthernReefsWalkable,
  },
};
