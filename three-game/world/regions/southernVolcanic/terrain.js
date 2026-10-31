import * as THREE from 'three';
import {
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  SOUTHERN_VOLCANIC,
  SOUTHERN_VOLCANIC_ENTRY_SPAWNS,
  SPATTER_CONE,
  southernVolcanicConeInfo,
  southernVolcanicFlowAngle,
  southernVolcanicFlowMask,
  southernVolcanicKipukaMask,
  southernVolcanicOlivineMask,
  southernVolcanicPathInfo,
  southernVolcanicPressureRidgeMask,
  southernVolcanicScoriaMask,
  southernVolcanicSulphurMask,
  southernVolcanicTumulusInfo,
} from './path';

const MAX_RENDER_SURFACE_DETAIL = 0.08;

// Pāhoehoe toes and ropes: overlapping lobes a few metres across, each with
// fine folds running across the direction of flow. The lobes are structural
// (they change the walking surface); the ropes are render-only.
function lobeRelief(x, z) {
  const flow = southernVolcanicFlowMask(x, z);
  const toes = Math.pow(Math.abs(crackNoise(x * 0.16 + 4, z * 0.15 - 9)), 0.7);
  const plates = elevationNoise(x * 0.052 - 6, z * 0.047 + 13);
  return (toes * 0.24 + plates * 0.14) * (0.45 + flow * 0.55);
}

function ropeRelief(x, z) {
  const angle = southernVolcanicFlowAngle(x, z);
  const along = x * Math.sin(angle) + z * Math.cos(angle);
  const across = x * Math.cos(angle) - z * Math.sin(angle);
  const bend = Math.sin(across * 0.55) * 0.9 + terrainSurfaceNoise(x * 0.3, z * 0.3) * 1.2;
  const ropes = Math.sin((along + bend) * 4.6);
  return ropes * southernVolcanicFlowMask(x, z);
}

export function southernVolcanicHeight(x, z, { movementSurface = false } = {}) {
  // The plain falls gently from the colony slopes in the north toward the
  // Punta Sur headland and the mangroves to the west.
  const fall = THREE.MathUtils.clamp((-z + 52) / 104, 0, 1);
  const westward = THREE.MathUtils.clamp((x + 56) / 112, 0, 1);
  const broad = elevationNoise(x * 0.018 - 3.4, z * 0.02 + 6.1);
  const cross = elevationNoise(x * 0.039 + 9.7, z * 0.043 - 2.2);
  const cone = southernVolcanicConeInfo(x, z);
  const tumulus = southernVolcanicTumulusInfo(x, z);
  const ridge = southernVolcanicPressureRidgeMask(x, z);
  const scoria = southernVolcanicScoriaMask(x, z);
  const olivine = southernVolcanicOlivineMask(x, z);
  const kipuka = southernVolcanicKipukaMask(x, z);
  const path = southernVolcanicPathInfo(x, z);

  let y = 2.2
    + fall * 0.9
    + westward * 0.45
    + broad * 0.46
    + cross * 0.18
    + lobeRelief(x, z)
    + ridge * 0.86
    + tumulus.height
    - tumulus.cleft * 0.55;

  // The cone stands on its own apron; its crater is a shallow bowl.
  y += cone.body * SPATTER_CONE.height + cone.apron * 0.35;
  y -= cone.crater * SPATTER_CONE.craterDepth;
  y += cone.rim * 0.28;
  // Clinkery scoria is heaped and loose rather than plated.
  y += scoria * terrainSurfaceNoise(x * 0.21 + 5, z * 0.21 - 8) * 0.16;
  // The olivine pocket is a scoured hollow where the green sand collects.
  y -= olivine * 0.42;
  // The kīpuka is older and softer, its relief worn down under soil.
  y = THREE.MathUtils.lerp(y, 2.6 + fall * 0.9 + broad * 0.32 + 0.35, kipuka * 0.55);

  y -= path.tread * 0.07;
  y -= path.center * 0.02;

  if (movementSurface) return y;

  const sulphur = southernVolcanicSulphurMask(x, z);
  const seam = 1 - THREE.MathUtils.smoothstep(
    Math.abs(crackNoise(x * 0.25 + 6, z * 0.23 - 3)),
    0.016,
    0.09,
  );
  const ropes = ropeRelief(x, z) * 0.045 * (1 - scoria) * (1 - kipuka) * (1 - path.path);
  const surfaceDetail = terrainFineDetail(x * 0.86, z * 0.86) * (0.46 + scoria * 0.42)
    + ropes
    - seam * (0.034 + scoria * 0.03)
    - sulphur * 0.02;
  return y + THREE.MathUtils.clamp(
    surfaceDetail,
    -MAX_RENDER_SURFACE_DETAIL,
    MAX_RENDER_SURFACE_DETAIL,
  );
}

export function southernVolcanicBiomeAt(x, z) {
  const path = southernVolcanicPathInfo(x, z);
  if (path.tread > 0.48) return 'trail';
  if (southernVolcanicKipukaMask(x, z) > 0.5) return 'dry-scrub';
  if (southernVolcanicSulphurMask(x, z) > 0.45) return 'fumarole';
  if (southernVolcanicOlivineMask(x, z) > 0.45) return 'olivine-sand';
  const cone = southernVolcanicConeInfo(x, z);
  if (cone.body > 0.25) return 'spatter-cone';
  if (southernVolcanicScoriaMask(x, z) > 0.5) return 'ash-slope';
  const tumulus = southernVolcanicTumulusInfo(x, z);
  if (tumulus.dome > 0.3 || southernVolcanicPressureRidgeMask(x, z) > 0.46) return 'lava-shelf';
  return 'black-lava';
}

export function southernVolcanicColor(x, z) {
  const color = new THREE.Color('#2c2b27');
  const flow = southernVolcanicFlowMask(x, z);
  const scoria = southernVolcanicScoriaMask(x, z);
  const sulphur = southernVolcanicSulphurMask(x, z);
  const olivine = southernVolcanicOlivineMask(x, z);
  const kipuka = southernVolcanicKipukaMask(x, z);
  const path = southernVolcanicPathInfo(x, z);
  const macro = terrainSurfaceNoise(x * 0.15 - 2, z * 0.15 + 7) * 0.5 + 0.5;
  color.lerp(new THREE.Color('#4a4740'), (1 - flow) * 0.3 + macro * 0.12);
  color.lerp(new THREE.Color('#6d3c2a'), scoria * 0.42);
  color.lerp(new THREE.Color('#5e6a3a'), olivine * 0.45);
  color.lerp(new THREE.Color('#5c4a34'), kipuka * 0.5);
  color.lerp(new THREE.Color('#a39a4c'), sulphur * 0.5);
  color.lerp(new THREE.Color('#5a4835'), path.path * 0.36);
  color.multiplyScalar(0.9 + macro * 0.1);
  return color;
}

export function isSouthernVolcanicWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  const step = 0.86;
  const left = southernVolcanicHeight(x - step, z, { movementSurface: true });
  const right = southernVolcanicHeight(x + step, z, { movementSurface: true });
  const back = southernVolcanicHeight(x, z - step, { movementSurface: true });
  const forward = southernVolcanicHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.12 || southernVolcanicPathInfo(x, z).path > 0.22;
}

const { north, east, south, west } = SOUTHERN_VOLCANIC_ENTRY_SPAWNS;

export const southernVolcanicRegion = {
  id: SOUTHERN_VOLCANIC,
  aliases: [],
  terrain: {
    height: southernVolcanicHeight,
    movementHeight: (x, z) => southernVolcanicHeight(x, z, { movementSurface: true }),
    biomeAt: southernVolcanicBiomeAt,
    color: southernVolcanicColor,
    isWalkable: isSouthernVolcanicWalkable,
    defaultSpawn: north,
    defaultFacing: [-0.15, 0, 1],
    entrySpawns: { north, east, south, west },
    entryFacings: {
      north: [-0.2, 0, 1],
      east: [-1, 0, 0.05],
      south: [0.08, 0, -1],
      west: [1, 0, -0.18],
    },
  },
};
