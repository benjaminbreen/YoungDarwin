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
import {
  WESTERN_LOWLANDS,
  westernLowlandsCampBenchMask,
  westernLowlandsPathInfo,
} from './path';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

export function westernLowlandsCoastX(z) {
  return -42
    + gaussian(0, z, 0, 9, 1, 15) * 8.8
    - gaussian(0, z, 0, -34, 1, 8) * 5.4
    - gaussian(0, z, 0, 37, 1, 7) * 6.2
    + gaussian(0, z, 0, -19, 1, 5) * 3.2
    - gaussian(0, z, 0, 24, 1, 4.5) * 2.8
    + Math.sin(z * 0.115 + 0.7) * 2.8
    + Math.sin(z * 0.29 - 1.2) * 1.15
    + Math.sin(z * 0.57 + 2.4) * 0.45
    + elevationNoise(z * 0.061 + 7, 3.1) * 2.1
    + surfaceNoise(z * 0.14 - 2, 11.7) * 0.72;
}

export function westernLowlandsInlandDistance(x, z) {
  return x - westernLowlandsCoastX(z);
}

function organicEllipseMask(x, z, cx, cz, rx, rz, {
  feather = 0.12,
  seed = 0,
  scallop = 0.08,
  warp = 2.2,
} = {}) {
  // Domain-warp the basin before evaluating its edge. Two angular bands make
  // coves and points at different scales; continuous noise prevents either
  // band from reading as a repeated sine-wave shoreline.
  const warpX = elevationNoise(x * 0.052 + seed * 2.1, z * 0.047 - seed) * warp
    + surfaceNoise(x * 0.1 - seed, z * 0.086 + seed * 1.7) * warp * 0.32;
  const warpZ = elevationNoise(x * 0.046 - seed * 1.3, z * 0.055 + seed * 2.4) * warp * 0.86
    + surfaceNoise(x * 0.082 + seed, z * 0.11 - seed * 0.8) * warp * 0.28;
  const nx = (x + warpX - cx) / rx;
  const nz = (z + warpZ - cz) / rz;
  const angle = Math.atan2(nz, nx);
  const edgeNoise = elevationNoise(x * 0.075 + seed * 3.2, z * 0.071 - seed * 2.8) * 0.13;
  const scallops = Math.sin(angle * 5 + seed + Math.sin(angle * 3 - seed) * 0.48) * scallop
    + Math.sin(angle * 11 - seed * 1.7) * scallop * 0.34;
  const edge = 1 + edgeNoise + scallops;
  const d = Math.hypot(nx, nz);
  return 1 - smoothstep(d, edge - feather, edge + feather);
}

export function westernLowlandsLagoonMask(x, z) {
  const basin = organicEllipseMask(x, z, -18.5, 5, 18.5, 21.5, {
    feather: 0.085, seed: 1.7, scallop: 0.16, warp: 3.6,
  });
  const northPool = organicEllipseMask(x, z, -23, -14, 12.5, 10.5, {
    feather: 0.11, seed: 4.2, scallop: 0.18, warp: 3.0,
  }) * 0.9;
  const southPool = organicEllipseMask(x, z, -24, 21, 11.5, 9.5, {
    feather: 0.105, seed: 6.6, scallop: 0.17, warp: 2.7,
  }) * 0.86;
  const throatCenterZ = 8 + Math.sin((x + 39) * 0.31) * 1.35
    + elevationNoise(x * 0.13 - 4, 8.2) * 1.1;
  const throatHalfWidth = 3.8
    + Math.sin((x + 42) * 0.53) * 0.65
    + elevationNoise(x * 0.2 + 9, 2.7) * 0.55;
  const throatAcross = Math.abs(z - throatCenterZ);
  const throatAlong = 1 - smoothstep(x, -47, -26);
  const tidalThroat = (1 - smoothstep(throatAcross, throatHalfWidth * 0.72, throatHalfWidth))
    * smoothstep(x, -48, -43) * throatAlong;

  const combined = Math.max(basin, northPool, southPool, tidalThroat);
  const centralIsland = organicEllipseMask(x, z, -13.5, 8.5, 5.2, 6.6, {
    feather: 0.16, seed: 8.9, scallop: 0.16, warp: 1.15,
  });
  const southIslet = organicEllipseMask(x, z, -29, 16, 2.8, 3.5, {
    feather: 0.18, seed: 11.3, scallop: 0.17, warp: 0.65,
  }) * 0.82;
  // Land tongues take unequal bites from the basin. Unlike more edge noise,
  // these survive oblique gameplay views as clearly readable coves.
  const northTongue = organicEllipseMask(x, z, -16, -18.5, 7.5, 4.2, {
    feather: 0.12, seed: 13.8, scallop: 0.14, warp: 1.2,
  }) * 0.78;
  const eastTongue = organicEllipseMask(x, z, -3.5, 7, 7.2, 5.3, {
    feather: 0.11, seed: 15.4, scallop: 0.16, warp: 1.4,
  }) * 0.86;
  const southTongue = organicEllipseMask(x, z, -16, 25, 6.5, 3.6, {
    feather: 0.13, seed: 18.1, scallop: 0.15, warp: 1.1,
  }) * 0.72;
  const brokenIsland = Math.max(
    centralIsland * 0.82,
    southIslet,
    northTongue,
    eastTongue,
    southTongue,
  );
  return clamp(combined - brokenIsland, 0, 1);
}

function westernLowlandsHillockField(x, z) {
  const hillocks = [
    [-1, -31, 9.5, 7.2, 1.25],
    [31, -32, 12.5, 8.0, 1.05],
    [44, -20, 9.0, 10.5, 1.35],
    [40, 15, 13.0, 10.0, 1.5],
    [6, 32, 10.5, 8.5, 1.22],
    [43, 38, 9.0, 7.5, 1.08],
    [22, 29, 7.5, 9.5, 0.82],
  ];
  let height = 0;
  for (let index = 0; index < hillocks.length; index += 1) {
    const [cx, cz, rx, rz, amplitude] = hillocks[index];
    const mound = gaussian(x, z, cx, cz, rx, rz);
    const brokenCrown = 0.68
      + elevationNoise(x * 0.095 + index * 3.7, z * 0.088 - index * 2.9) * 0.24
      + Math.abs(crackNoise(x * 0.13 - index, z * 0.12 + index)) * 0.16;
    height += mound * amplitude * brokenCrown;
  }
  // Shallow swales prevent the hillocks from merging into another smooth,
  // continuous ridge and make the lowland read as weathered lava hummocks.
  height -= gaussian(x, z, 18, -25, 10, 4, 1) * 0.4;
  height -= gaussian(x, z, 27, 21, 8, 4, 1) * 0.34;
  height -= gaussian(x, z, 3, 17, 7, 4.5, 1) * 0.28;
  return height;
}

export function westernLowlandsStandingWaterMask(x, z) {
  const lagoon = westernLowlandsLagoonMask(x, z);
  const coast = westernLowlandsInlandDistance(x, z);
  return clamp(lagoon * smoothstep(coast, -1.5, 4.5), 0, 1);
}

export function westernLowlandsMudflatMask(x, z) {
  const lagoon = westernLowlandsLagoonMask(x, z);
  return clamp((1 - Math.abs(lagoon - 0.42) / 0.42) * smoothstep(lagoon, 0.04, 0.42), 0, 1);
}

export function westernLowlandsHeight(x, z, { movementSurface = false } = {}) {
  const inland = westernLowlandsInlandDistance(x, z);
  const lagoon = westernLowlandsLagoonMask(x, z);
  const standingWater = westernLowlandsStandingWaterMask(x, z);
  const path = westernLowlandsPathInfo(x, z);
  const bench = westernLowlandsCampBenchMask(x, z);
  let y;

  if (inland < 0) {
    const offshore = Math.max(0, -inland);
    y = WATER_LEVEL - 0.16 - Math.pow(offshore, 1.12) * 0.082;
    y += surfaceNoise(x * 0.14 + 3, z * 0.16 - 2) * (movementSurface ? 0.025 : 0.07);
  } else {
    y = -0.2 + 1.05 * (1 - Math.exp(-inland * 0.065));
    y += smoothstep(x, 18, 54) * 1.15;
    y += elevationNoise(x * 0.042 + 11, z * 0.047 - 5) * (movementSurface ? 0.31 : 0.5);

    const hillocks = westernLowlandsHillockField(x, z);
    const hummockNoise = elevationNoise(x * 0.115 - 7, z * 0.108 + 13) * 0.5 + 0.5;
    const hummocks = Math.pow(smoothstep(hummockNoise, 0.35, 0.82), 1.35) * 0.62;
    const fracturedShelves = Math.pow(Math.abs(crackNoise(x * 0.082 + 4, z * 0.076 - 9)), 3.2) * 0.32;
    const hillockHabitat = smoothstep(inland, 9, 22)
      * (1 - lagoon * 0.95)
      * (1 - path.shoulder * 0.76)
      * (1 - bench * 0.86);
    y += (hillocks + hummocks + fracturedShelves) * hillockHabitat;
  }

  if (lagoon > 0.01) {
    const throat = gaussian(x, z, -35, 8, 10, 5.5);
    const basinBottom = WATER_LEVEL - 0.23 - lagoon * 0.34 - throat * 0.36
      + surfaceNoise(x * 0.18 - 5, z * 0.2 + 8) * (movementSurface ? 0.025 : 0.065);
    y = lerp(y, basinBottom, clamp(lagoon * 1.08, 0, 1));
  }

  const ribs = Math.max(
    gaussian(x, z, -33, -23, 7, 2.4),
    gaussian(x, z, -29, 26, 8, 2.6),
    gaussian(x, z, -8, -10, 2.5, 9) * 0.78,
    gaussian(x, z, -6, 25, 3, 8) * 0.65,
    gaussian(x, z, 3, -37, 9, 2.3) * 0.72,
    gaussian(x, z, 30, 32, 11, 2.5) * 0.58,
  );
  y += ribs * (movementSurface ? 0.2 : 0.42)
    * (0.48 + Math.abs(crackNoise(x * 0.29 + 2, z * 0.31 - 7)) * 0.9)
    * (1 - path.tread * 0.72);

  // Keep the cabin remains, work yard, and tortoise pen on a deliberately
  // dry basalt bench. The site reads as chosen ground above the tidal reach.
  if (bench > 0.08 && standingWater < 0.08) {
    const benchTarget = 1.18 + (x - 17) * 0.012;
    y = lerp(y, benchTarget, bench * 0.72);
  }

  // Trails are shallow compacted cuts, not raised causeways through the flat.
  if (path.tread > 0 && standingWater < 0.2) {
    const trailTarget = y - (movementSurface ? 0.025 : 0.075) * path.tread;
    y = lerp(y, trailTarget, path.tread * 0.74);
  }

  const dry = smoothstep(y, WATER_LEVEL + 0.04, WATER_LEVEL + 0.58);
  y += terrainFineDetail(x, z) * dry * (movementSurface ? 0.11 : 0.31)
    * (1 - lagoon * 0.82) * (1 - path.tread * 0.78);
  return Math.max(WATER_LEVEL - WADE_DEPTH - 2.2, y);
}

export function westernLowlandsBiomeAt(x, z, y = westernLowlandsHeight(x, z)) {
  const inland = westernLowlandsInlandDistance(x, z);
  const lagoon = westernLowlandsLagoonMask(x, z);
  const path = westernLowlandsPathInfo(x, z);
  const bench = westernLowlandsCampBenchMask(x, z);
  if (y < WATER_LEVEL - WADE_DEPTH + 0.05) return 'deep-water';
  if (inland < 0 && y < WATER_LEVEL) return 'shallow-ocean';
  if (lagoon > 0.48 && y < WATER_LEVEL) return 'tidal-lagoon';
  if (westernLowlandsMudflatMask(x, z) > 0.25 || (lagoon > 0.12 && y < WATER_LEVEL + 0.08)) return 'lagoon-mud';
  if (bench > 0.42) return 'whaler-camp-bench';
  if (path.tread > 0.42) return 'coastal-trail';
  if (inland < 7) return 'wet-basalt';
  if (inland < 18) return 'black-shingle';
  if (lagoon > 0.04) return 'saltgrass-margin';
  return x > 28 ? 'dry-scrub' : 'basalt-lowland';
}

export function westernLowlandsColor(x, z, y) {
  const biome = westernLowlandsBiomeAt(x, z, y);
  const noise = terrainSurfaceNoise(x, z);
  const color = new THREE.Color();
  if (biome === 'deep-water') color.set('#163e50');
  else if (biome === 'shallow-ocean') color.set('#2f7074');
  else if (biome === 'tidal-lagoon') color.set('#496f68');
  else if (biome === 'lagoon-mud') color.set('#403f31');
  else if (biome === 'wet-basalt') color.set('#242720');
  else if (biome === 'black-shingle') color.set('#39382d');
  else if (biome === 'saltgrass-margin') color.set('#666844');
  else if (biome === 'whaler-camp-bench') color.set('#625440');
  else if (biome === 'coastal-trail') color.set('#716147');
  else if (biome === 'dry-scrub') color.set('#777447');
  else color.set('#53543a');
  color.lerp(new THREE.Color('#8b8057'), Math.max(0, noise) * 0.18);
  color.lerp(new THREE.Color('#22251f'), Math.max(0, -noise) * 0.12);
  return color.multiplyScalar(0.94 + noise * 0.06);
}

export function westernLowlandsStandingWaterFlowAt(x, z) {
  const throat = gaussian(x, z, -35, 8, 12, 7);
  return { x: -1, z: 0.08 + Math.sin(z * 0.1) * 0.08, speed: 0.22 + throat * 0.45 };
}

export function isWesternLowlandsWalkable(x, z, config) {
  const inBounds = Math.abs(x) <= config.width * 0.5 - 1.2
    && Math.abs(z) <= config.depth * 0.5 - 1.2;
  if (!inBounds) return false;
  const y = westernLowlandsHeight(x, z, { movementSurface: true });
  return y > WATER_LEVEL - WADE_DEPTH + 0.04;
}

export const westernLowlandsRegion = {
  id: WESTERN_LOWLANDS,
  aliases: ['western-lowlands'],
  terrain: {
    height: westernLowlandsHeight,
    movementHeight: (x, z) => westernLowlandsHeight(x, z, { movementSurface: true }),
    biomeAt: westernLowlandsBiomeAt,
    color: westernLowlandsColor,
    isWalkable: isWesternLowlandsWalkable,
    standingWaterMask: westernLowlandsStandingWaterMask,
    standingWaterFlowAt: westernLowlandsStandingWaterFlowAt,
    defaultSpawn: [23, 0, 25],
    entrySpawns: {
      north: [20, 0, -42],
      east: [46, 0, -12],
      south: [36, 0, 41],
    },
  },
};
