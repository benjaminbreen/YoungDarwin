import * as THREE from 'three';
import {
  WATER_LEVEL,
  crackNoise,
  elevationNoise,
  terrainFineDetail,
  terrainSurfaceNoise,
} from '../../terrainShared';
import {
  CROWN,
  SEA_STACKS,
  WINDY_PROMONTORY,
  WINDY_PROMONTORY_ENTRY_SPAWNS,
  windyPromontoryBeachWidth,
  windyPromontoryCliffFace,
  windyPromontoryCoastDistance,
  windyPromontoryCrownMask,
  windyPromontoryExposure,
  windyPromontoryLedgeMask,
  windyPromontoryPathInfo,
  windyPromontoryRavineMask,
  windyPromontoryRimMask,
} from './path';

const TERRACE_STEP = 1.45;

function seaStackHeight(x, z) {
  let height = 0;
  for (const stack of SEA_STACKS) {
    const dx = (x - stack.x) / stack.rx;
    const dz = (z - stack.z) / stack.rz;
    const angle = Math.atan2(dz, dx);
    // Joint-bounded outline: buttresses and clefts where blocks have fallen.
    const outline = 1
      + Math.sin(angle * 3 + stack.x) * 0.16
      + Math.sin(angle * 7 - stack.z) * 0.08
      + crackNoise(x * 0.5 + stack.z, z * 0.5) * 0.08;
    const d = Math.hypot(dx, dz) / outline;
    const body = 1 - THREE.MathUtils.smoothstep(d, 0.7, 1.02);
    // The top steps down in tiers, and is broken rather than domed.
    const tiers = 1 - THREE.MathUtils.smoothstep(d, 0.25, 0.62) * 0.22;
    const ragged = Math.max(0, crackNoise(x * 0.6 + stack.x, z * 0.6)) * 1.4;
    // A wave-cut platform round the foot, awash at high water.
    const platform = (1 - THREE.MathUtils.smoothstep(d, 1.0, 1.7)) * 0.7;
    height = Math.max(height, body * (stack.height * tiers + ragged), platform);
  }
  return height;
}

// Thin soil over stepped lava: where the ledges show, the slope breaks into
// low risers and benches instead of rolling evenly.
function terrace(y, amount) {
  const s = y / TERRACE_STEP;
  const stepped = (Math.floor(s) + THREE.MathUtils.smoothstep(s - Math.floor(s), 0.5, 1)) * TERRACE_STEP;
  return THREE.MathUtils.lerp(y, stepped, amount);
}

function landHeight(x, z, movementSurface) {
  const westRise = THREE.MathUtils.smoothstep(x, -48, -16);
  const broad = elevationNoise(x * 0.024 + 3.1, z * 0.026 - 5.4);
  const cross = elevationNoise(x * 0.06 - 8.2, z * 0.055 + 1.7);
  const crown = windyPromontoryCrownMask(x, z) * CROWN.height;
  const ledge = windyPromontoryLedgeMask(x, z);
  const path = windyPromontoryPathInfo(x, z);

  let y = 0.45 + westRise * 5.2 + crown + broad * 0.9 + cross * 0.35;
  // The north edge meets Watkins' southern terraces.
  const northBlend = 1 - THREE.MathUtils.smoothstep(z, -45, -34);
  y = THREE.MathUtils.lerp(y, 4.9 + broad * 0.4, northBlend * 0.85);
  y = terrace(y, ledge * 0.5 * (1 - path.path));
  // The ravine the Watkins path climbs, shallowing to nothing at the seam.
  y -= windyPromontoryRavineMask(x, z) * 2.1 * THREE.MathUtils.smoothstep(z, -45, -37)
    * (1 - THREE.MathUtils.smoothstep(z, -18, -8));
  // A crumbling lip just before the drop.
  y += windyPromontoryRimMask(x, z) * (0.3 + Math.max(0, crackNoise(x * 0.22, z * 0.22)) * 0.5);
  y -= path.tread * 0.1 + path.center * 0.03;
  if (movementSurface) return y;
  // Render-only: scoured ledge texture and tussocky turf.
  const exposure = windyPromontoryExposure(x, z);
  const detail = terrainFineDetail(x * 0.9, z * 0.9) * (0.4 + ledge * 0.5)
    + terrainSurfaceNoise(x * 1.6 + 4, z * 1.6 - 9) * 0.035 * (1 - ledge) * (1 - exposure * 0.5);
  return y + THREE.MathUtils.clamp(detail, -0.08, 0.08);
}

export function windyPromontoryHeight(x, z, { movementSurface = false } = {}) {
  const coast = windyPromontoryCoastDistance(x, z);
  const beachWidth = windyPromontoryBeachWidth(x);
  if (coast < 0) {
    const seabed = -1.3 + coast * 0.42 - Math.max(0, -coast - 6) * 0.12;
    return Math.max(-6.5, seabed + seaStackHeight(x, z));
  }
  const land = landHeight(x, z, movementSurface);
  // The cove beach: a short ramp of sand and cobble at the cliff foot.
  const beach = -0.8 + Math.min(coast, beachWidth) * 0.2;
  const clifftop = THREE.MathUtils.smoothstep(coast - beachWidth, 0, 3.4);
  let y = THREE.MathUtils.lerp(beachWidth > 0.4 ? beach : -1.1, land, clifftop);
  if (!movementSurface) {
    // Bedding in the cliff face: harder flows stand out as ribs.
    const face = windyPromontoryCliffFace(x, z);
    y += face * Math.sin(y * 2.3 + Math.sin(x * 0.2 + z * 0.17) * 0.8) * 0.18;
  }
  return y;
}

export function windyPromontoryBiomeAt(x, z, y = windyPromontoryHeight(x, z)) {
  if (y < WATER_LEVEL - 0.12) return 'promontory-seabed';
  const coast = windyPromontoryCoastDistance(x, z);
  const beachWidth = windyPromontoryBeachWidth(x);
  if (beachWidth > 0.6 && coast < beachWidth && y < 0.6) return 'cove-beach';
  if (windyPromontoryCliffFace(x, z) > 0.4) return 'sea-cliff';
  const path = windyPromontoryPathInfo(x, z);
  if (path.tread > 0.48) return 'trail';
  if (windyPromontoryRimMask(x, z) > 0.45) return 'cliff-rim';
  if (windyPromontoryRavineMask(x, z) > 0.5) return 'ravine';
  if (windyPromontoryLedgeMask(x, z) > 0.55) return 'lava-ledge';
  if (windyPromontoryExposure(x, z) > 0.55) return 'wind-combed-grass';
  return 'shorn-scrub';
}

export function windyPromontoryColor(x, z, y) {
  const biome = windyPromontoryBiomeAt(x, z, y);
  const broad = terrainSurfaceNoise(x * 0.2 + 4, z * 0.2 - 7) * 0.5 + 0.5;
  const color = new THREE.Color('#7a7350');
  color.lerp(new THREE.Color('#8c8458'), broad * 0.3);
  if (biome === 'promontory-seabed') color.set('#1a3a3e');
  if (biome === 'cove-beach') color.set('#8f8670');
  if (biome === 'sea-cliff') color.lerp(new THREE.Color('#2d302c'), 0.78);
  if (biome === 'cliff-rim') color.lerp(new THREE.Color('#57524a'), 0.5);
  if (biome === 'lava-ledge') color.lerp(new THREE.Color('#4d4a43'), 0.55);
  if (biome === 'ravine') color.lerp(new THREE.Color('#5d6a43'), 0.4);
  if (biome === 'wind-combed-grass') color.lerp(new THREE.Color('#9b9460'), 0.3);
  if (biome === 'trail') color.lerp(new THREE.Color('#7d6448'), 0.6);
  color.multiplyScalar(0.92 + broad * 0.1);
  return color;
}

export function isWindyPromontoryWalkable(x, z, config) {
  const margin = 1.35;
  if (Math.abs(x) > config.width * 0.5 - margin || Math.abs(z) > config.depth * 0.5 - margin) return false;
  // Keep walkers off the crumbling last metres above the drop.
  if (windyPromontoryCoastDistance(x, z) - windyPromontoryBeachWidth(x) < 4.4) return false;
  const step = 0.82;
  const left = windyPromontoryHeight(x - step, z, { movementSurface: true });
  const right = windyPromontoryHeight(x + step, z, { movementSurface: true });
  const back = windyPromontoryHeight(x, z - step, { movementSurface: true });
  const forward = windyPromontoryHeight(x, z + step, { movementSurface: true });
  const grade = Math.hypot((right - left) / (step * 2), (forward - back) / (step * 2));
  return grade < 1.08 || windyPromontoryPathInfo(x, z).path > 0.22;
}

const { north, west } = WINDY_PROMONTORY_ENTRY_SPAWNS;

export const windyPromontoryRegion = {
  id: WINDY_PROMONTORY,
  aliases: [],
  terrain: {
    height: windyPromontoryHeight,
    movementHeight: (x, z) => windyPromontoryHeight(x, z, { movementSurface: true }),
    biomeAt: windyPromontoryBiomeAt,
    color: windyPromontoryColor,
    isWalkable: isWindyPromontoryWalkable,
    defaultSpawn: north,
    defaultFacing: [0.1, 0, 1],
    entrySpawns: { north, west },
    entryFacings: {
      north: [0.12, 0, 1],
      west: [1, 0, -0.1],
    },
  },
};
