import * as THREE from 'three';
import {
  WATER_LEVEL,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  cormorantLagoonField,
  cormorantRimMask as prototypeCormorantRimMask,
  cormorantStandingWaterMask,
  cormorantTrailDistance,
} from '../cormorantBayTest3/terrain';

export const CORMORANT_BAY = 'CORMORANT_BAY';

// The two long wavelengths keep the strandline curved without introducing
// mesh-scale teeth. Keep this formula aligned with cbCoastZ() in material.js.
export function cormorantCoastZ(x) {
  return -22
    + Math.sin(x * 0.052 + 0.6) * 3.6
    + Math.sin(x * 0.021 - 1.4) * 2.4;
}

// Cormorant's prototype rim crossed the ocean strandline, then the seabed was
// hard-clamped below it. Fade that rim out across the beach so tuff relief is
// reserved for the inner/east/west margins instead of forming a surf cliff.
export function cormorantRimMask(x, z) {
  const shoreD = z - cormorantCoastZ(x);
  const inlandFade = THREE.MathUtils.smoothstep(shoreD, 19, 34);
  return prototypeCormorantRimMask(x, z) * inlandFade;
}

function cormorantBeachHillocks(x, z, shoreD, movementSurface) {
  const outer = THREE.MathUtils.smoothstep(shoreD, 3.5, 9.5);
  const inner = 1 - THREE.MathUtils.smoothstep(shoreD, 22, 31);
  const duneBand = outer * inner;
  if (duneBand <= 0) return 0;

  // Broad, intersecting noise fields make irregular low hillocks rather than
  // parallel procedural ridges. Movement keeps most of this low-frequency
  // shape, while omitting the small render-only undulation below.
  const broad = elevationNoise(x * 0.052 + 17, z * 0.046 - 11) * 0.17;
  const cross = elevationNoise(x * 0.086 - 6, z * 0.071 + 14) * 0.09;
  const rise = THREE.MathUtils.clamp(0.1 + broad + cross, -0.035, 0.3);
  const smallUndulation = movementSurface
    ? 0
    : Math.sin(x * 0.19 + z * 0.07 + terrainSurfaceNoise(x * 0.3, z * 0.3)) * 0.028;
  return duneBand * (rise + smallUndulation);
}

export function cormorantBayHeight(x, z, { movementSurface = false } = {}) {
  const shoreD = z - cormorantCoastZ(x); // > 0 inland, < 0 seaward.
  const lagoon = cormorantLagoonField(x, z);
  const lagoonBasin = 1 - THREE.MathUtils.smoothstep(lagoon, 0.68, 1.08);
  const lagoonEdge = 1 - THREE.MathUtils.smoothstep(lagoon, 1.0, 1.38);
  const lagoonInland = THREE.MathUtils.smoothstep(shoreD, 9, 18);
  const trail = 1 - THREE.MathUtils.smoothstep(cormorantTrailDistance(x, z), 1.4, 4.8);
  const rim = cormorantRimMask(x, z);

  // A continuous shelf and beach profile replaces the former hard ocean
  // clamp. The dry beach rises about 5.8 cm per metre before easing into the
  // lagoon plain: broad enough to read as a walkable strand, never a wall.
  const beachProfile = WATER_LEVEL - 0.15
    + (shoreD < 0 ? shoreD * 0.045 : shoreD * 0.058);
  const inlandProfile = -0.1
    + elevationNoise(x * 0.032 - 8, z * 0.034 + 2) * 0.36
    + THREE.MathUtils.smoothstep(shoreD, 5, 34) * 0.76;
  const inlandBlend = THREE.MathUtils.smoothstep(shoreD, 18, 34);
  let y = THREE.MathUtils.lerp(beachProfile, inlandProfile, inlandBlend);

  y += cormorantBeachHillocks(x, z, shoreD, movementSurface);
  y += rim * (1.05 + Math.abs(terrainSurfaceNoise(x * 0.25 + 5, z * 0.23 - 3))
    * (movementSurface ? 0.08 : 0.34));
  // Preserve the ocean-facing dune barrier before easing into the brackish
  // basin. The canonical bay is shallow enough for feeding birds rather than
  // a deep hole that bites through the beach from behind.
  y -= lagoonBasin * lagoonInland * 0.98;
  y -= lagoonEdge * lagoonInland * 0.18;
  y -= trail * 0.1;

  const dryDetail = THREE.MathUtils.smoothstep(y, WATER_LEVEL - 0.18, WATER_LEVEL + 0.24);
  y += terrainFineDetail(x, z) * dryDetail * (movementSurface ? 0.035 : 0.12);

  return Math.max(-2.55, y);
}

export function cormorantBayBiomeAt(x, z, y = cormorantBayHeight(x, z)) {
  const shoreD = z - cormorantCoastZ(x);
  const lagoon = cormorantLagoonField(x, z);
  const trail = cormorantTrailDistance(x, z);
  const lagoonInland = THREE.MathUtils.smoothstep(shoreD, 9, 18);

  if (shoreD < -2) {
    return y < WATER_LEVEL - 0.72 ? 'deep-lagoon' : 'shallow-white-sand';
  }
  if (lagoonInland > 0.5 && lagoon < 1.2 && y < WATER_LEVEL - 0.16) return 'brackish-lagoon';
  if (lagoonInland > 0.5 && lagoon < 1.42) return 'wet-mud';
  if (trail < 3.2) return 'olivine-trail';
  if (shoreD < 4.5) return 'wet-white-sand';
  if (shoreD < 21) return 'white-sand';
  if (cormorantRimMask(x, z) > 0.48) return 'tuff-rim';
  return 'salt-scrub';
}

export function cormorantBayColor(x, z, y) {
  const biome = cormorantBayBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color('#7a7d4a');
  if (biome === 'deep-lagoon') color.set('#2a4a43');
  else if (biome === 'shallow-white-sand') color.set('#d7e7d8');
  else if (biome === 'brackish-lagoon') color.set('#496a58');
  else if (biome === 'wet-mud') color.set('#4f4935');
  else if (biome === 'olivine-trail') color.set('#7f7a4b');
  else if (biome === 'wet-white-sand') color.set('#d8d7c4');
  else if (biome === 'white-sand') color.set('#eee5cf');
  else if (biome === 'tuff-rim') color.set('#755c43');
  else color.set('#6f7547');
  color.lerp(new THREE.Color('#253f2c'), Math.max(0, -noise) * 0.14);
  color.lerp(new THREE.Color('#fff1d3'), Math.max(0, noise) * 0.14);
  color.multiplyScalar(0.94 + noise * 0.045);
  return color;
}

export function isCormorantBayWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2
    && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = cormorantBayHeight(x, z, { movementSurface: true });
  if (cormorantLagoonField(x, z) < 1.16 && y < WATER_LEVEL - 0.05) return false;
  return y > WATER_LEVEL - 0.28;
}

export {
  cormorantLagoonField,
  cormorantStandingWaterMask,
  cormorantTrailDistance,
};

export const cormorantBayRegion = {
  id: CORMORANT_BAY,
  aliases: ['cormorant-bay'],
  terrain: {
    height: cormorantBayHeight,
    movementHeight: (x, z) => cormorantBayHeight(x, z, { movementSurface: true }),
    biomeAt: cormorantBayBiomeAt,
    color: cormorantBayColor,
    standingWaterMask: cormorantStandingWaterMask,
    isWalkable: isCormorantBayWalkable,
    defaultSpawn: [-30, 0, 24],
  },
};
