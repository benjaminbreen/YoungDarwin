import * as THREE from 'three';
import {
  WATER_LEVEL,
  WADE_DEPTH,
  crackNoise,
  elevationNoise,
  surfaceNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';

export const DEVILS_CROWN = 'DEVILS_CROWN';

const CRATER_CENTER_X = 0;
const CRATER_CENTER_Z = -8;
const CRATER_RADIUS_X = 27;
const CRATER_RADIUS_Z = 18;

function ellipseField(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.sqrt(dx * dx + dz * dz);
}

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

function angularWobble(x, z) {
  const a = Math.atan2((z - CRATER_CENTER_Z) / CRATER_RADIUS_Z, (x - CRATER_CENTER_X) / CRATER_RADIUS_X);
  return 1
    + Math.sin(a * 3.0 + 0.7) * 0.12
    + Math.sin(a * 5.0 - 1.6) * 0.08
    + Math.sin(a * 8.0 + 2.1) * 0.045;
}

export function devilsCrownCraterField(x, z) {
  return ellipseField(
    x,
    z,
    CRATER_CENTER_X,
    CRATER_CENTER_Z,
    CRATER_RADIUS_X * angularWobble(x, z),
    CRATER_RADIUS_Z * angularWobble(x, z),
  );
}

function gapMask(x, z) {
  const southGap = gaussian(x, z, 1, 13.5, 10.5, 5.2);
  const eastGap = gaussian(x, z, 26.5, -3.5, 5.2, 7.8);
  const westBite = gaussian(x, z, -26, -15, 4.6, 7.6);
  return THREE.MathUtils.clamp(Math.max(southGap, eastGap * 0.72, westBite * 0.55), 0, 1);
}

export function devilsCrownRimMask(x, z) {
  const d = devilsCrownCraterField(x, z);
  const band = THREE.MathUtils.smoothstep(d, 0.58, 0.82) * (1 - THREE.MathUtils.smoothstep(d, 1.02, 1.22));
  return THREE.MathUtils.clamp(band * (1 - gapMask(x, z) * 0.9), 0, 1);
}

export function devilsCrownLandMask(x, z) {
  const rim = devilsCrownRimMask(x, z);
  const landing = devilsCrownLandingMask(x, z);
  const northMass = gaussian(x, z, -4, -25, 18, 7.2) * 0.62;
  const eastTooth = gaussian(x, z, 31, -11, 5, 10) * 0.72;
  const westTooth = gaussian(x, z, -30, -18, 4.8, 8.8) * 0.74;
  return THREE.MathUtils.clamp(Math.max(rim, landing, northMass, eastTooth, westTooth), 0, 1);
}

export function devilsCrownLandingMask(x, z) {
  const slab = gaussian(x, z, 0, 38, 9.6, 4.8);
  const west = gaussian(x, z, -10, 35, 4.4, 3.2);
  const east = gaussian(x, z, 10, 36, 4.6, 3.2);
  return THREE.MathUtils.clamp(Math.max(slab, west * 0.7, east * 0.64), 0, 1);
}

export function devilsCrownLagoonMask(x, z) {
  const d = devilsCrownCraterField(x, z);
  const inside = 1 - THREE.MathUtils.smoothstep(d, 0.52, 0.82);
  const southOpening = 1 - gaussian(x, z, 0, 13.5, 9.5, 4.8) * 0.42;
  return THREE.MathUtils.clamp(inside * southOpening, 0, 1);
}

export function devilsCrownSwimChannelMask(x, z) {
  const channel = gaussian(x, z, 0, 25, 9.0, 12.5);
  const narrow = gaussian(x, z, 0, 16, 6.2, 6.0);
  const sideBreak = Math.max(gaussian(x, z, -14, 24, 5, 12), gaussian(x, z, 14, 24, 5, 12));
  return THREE.MathUtils.clamp(Math.max(channel, narrow) * (1 - sideBreak * 0.46), 0, 1);
}

export function devilsCrownCoralMask(x, z) {
  const lagoon = devilsCrownLagoonMask(x, z);
  const rim = devilsCrownRimMask(x, z);
  const outerShelf = THREE.MathUtils.smoothstep(devilsCrownCraterField(x, z), 1.08, 1.2)
    * (1 - THREE.MathUtils.smoothstep(devilsCrownCraterField(x, z), 1.45, 1.8));
  const patches = THREE.MathUtils.smoothstep(elevationNoise(x * 0.14 + 6, z * 0.16 - 9), -0.24, 0.36);
  return THREE.MathUtils.clamp(Math.max(lagoon * 0.7, outerShelf * 0.8) * patches * (1 - rim * 0.65), 0, 1);
}

export function devilsCrownHeight(x, z, { movementSurface = false } = {}) {
  const rim = devilsCrownRimMask(x, z);
  const land = devilsCrownLandMask(x, z);
  const landing = devilsCrownLandingMask(x, z);
  const lagoon = devilsCrownLagoonMask(x, z);
  const channel = devilsCrownSwimChannelMask(x, z);
  const coral = devilsCrownCoralMask(x, z);

  let y = -3.05;

  // Wading shelf around the crater and inside the lagoon.
  const shelf = THREE.MathUtils.clamp(
    Math.max(lagoon * 0.92, THREE.MathUtils.smoothstep(devilsCrownCraterField(x, z), 0.82, 1.74) * 0.7),
    0,
    1,
  );
  y = THREE.MathUtils.lerp(y, -1.58 + surfaceNoise(x * 0.12 + 7, z * 0.12 - 4) * 0.08, shelf);

  // The approach deliberately crosses swim-depth water before the rim.
  const swimFloor = -2.08 + elevationNoise(x * 0.06 - 4, z * 0.08 + 8) * 0.055;
  y = THREE.MathUtils.lerp(y, swimFloor, channel * (1 - landing * 0.86) * 0.95);

  // A small boat/landing slab where Darwin starts, separated from the crater.
  const landingY = -0.02 + landing * 0.42 + elevationNoise(x * 0.16 + 2, z * 0.18 - 3) * 0.09;
  y = THREE.MathUtils.lerp(y, landingY, landing);

  // Broken crater rim: low south approach, higher jagged northern crown.
  const northBias = THREE.MathUtils.smoothstep(-z, 7, 32);
  const ridgeNoise = Math.abs(crackNoise(x * 0.3 + 3, z * 0.34 - 2));
  // Ridge relief is several metres wide, so it belongs to both the rendered
  // and movement surfaces. Keeping it render-only lets Darwin walk through
  // the silhouette of the crater wall.
  const rimTop = -0.18 + rim * (0.92 + northBias * 1.2 + ridgeNoise * 0.54);
  y = THREE.MathUtils.lerp(y, rimTop, rim);

  // Needle-like but still low-poly readable rocks on the exposed rim.
  const pinnacles = Math.max(
    gaussian(x, z, -20, -21, 3.6, 5.8),
    gaussian(x, z, -6, -28, 5.0, 4.3),
    gaussian(x, z, 14, -24, 4.2, 5.2),
    gaussian(x, z, 31, -9, 3.2, 7.6),
  );
  // These are broad landforms rather than surface noise; movement must rise
  // with them instead of passing through their lower half.
  y += pinnacles;

  // Coral heads stay submerged and mostly visual; movement surface is smoother.
  const coralKnob = Math.pow(Math.abs(crackNoise(x * 0.5 - 5, z * 0.48 + 11)), 1.55);
  y += coral * (movementSurface ? 0.06 : 0.22) * coralKnob;
  y -= coral * (movementSurface ? 0.05 : 0.12);

  // Open-ocean falloff at the exposed north/east/west edges.
  const deepN = THREE.MathUtils.smoothstep(-z, 32, 45);
  const deepE = THREE.MathUtils.smoothstep(x, 42, 54);
  const deepW = THREE.MathUtils.smoothstep(-x, 42, 54);
  y -= Math.max(deepN, deepE, deepW) * (1 - land * 0.88) * 1.75;

  const dry = THREE.MathUtils.smoothstep(y, WATER_LEVEL + 0.02, WATER_LEVEL + 0.55);
  // Reserve only a shallow layer of high-frequency relief for rendering. The
  // low-frequency elevation still defines real ground and is shared exactly.
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.08 : 0.16);
  y += elevationNoise(x * 0.045 + 14, z * 0.052 - 7) * Math.max(land, shelf) * 0.12;

  return Math.max(-4.8, y);
}

export function devilsCrownBiomeAt(x, z, y = devilsCrownHeight(x, z)) {
  if (y < -2.35) return 'deep-water';
  if (devilsCrownCoralMask(x, z) > 0.35 && y < WATER_LEVEL - 0.24) return 'coral';
  if (devilsCrownLagoonMask(x, z) > 0.28 && y < WATER_LEVEL) return 'lagoon-sand';
  if (devilsCrownSwimChannelMask(x, z) > 0.26 && y < WATER_LEVEL - WADE_DEPTH * 0.86) return 'swim-channel';
  if (y < WATER_LEVEL) return 'shallow-basalt';
  if (devilsCrownLandingMask(x, z) > 0.36) return 'landing-basalt';
  if (devilsCrownRimMask(x, z) > 0.28 || devilsCrownLandMask(x, z) > 0.38) return 'black-lava';
  return 'wet-basalt';
}

export function devilsCrownColor(x, z, y) {
  const biome = devilsCrownBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'deep-water') color.set('#0b3444');
  else if (biome === 'swim-channel') color.set('#2b8f98');
  else if (biome === 'lagoon-sand') {
    color.set('#b8d5bd');
    color.lerp(new THREE.Color('#62b8ad'), THREE.MathUtils.clamp((WATER_LEVEL - y) / 1.2, 0, 1) * 0.52);
  } else if (biome === 'coral') {
    color.set('#a4746f');
    color.lerp(new THREE.Color('#c47f87'), Math.max(0, noise) * 0.45);
    color.lerp(new THREE.Color('#868f60'), Math.max(0, -noise) * 0.35);
  } else if (biome === 'shallow-basalt') color.set('#254b4a');
  else if (biome === 'landing-basalt') color.set('#272823');
  else if (biome === 'black-lava') {
    color.set('#1c1f1d');
    color.lerp(new THREE.Color('#4a4236'), Math.max(0, noise) * 0.2);
  } else color.set('#18231f');
  if (biome === 'black-lava' || biome === 'landing-basalt') {
    if (Math.abs(crackNoise(x * 0.95 + 2, z * 0.88 - 5)) > 0.9) color.lerp(new THREE.Color('#827866'), 0.12);
  }
  color.multiplyScalar(0.92 + noise * 0.075);
  return color;
}

export function isDevilsCrownWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2 && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = devilsCrownHeight(x, z, { movementSurface: true });
  return y > -0.45 && (devilsCrownLandMask(x, z) > 0.16 || devilsCrownLandingMask(x, z) > 0.22);
}

export const devilsCrownRegion = {
  id: DEVILS_CROWN,
  aliases: [],
  terrain: {
    height: devilsCrownHeight,
    movementHeight: (x, z) => devilsCrownHeight(x, z, { movementSurface: true }),
    biomeAt: devilsCrownBiomeAt,
    color: devilsCrownColor,
    isWalkable: isDevilsCrownWalkable,
  },
};
