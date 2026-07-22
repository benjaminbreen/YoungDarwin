import {
  makeZoneScatter,
  nearAnyCluster,
  varyScatterTransforms,
} from '../scatter';
import { WATER_LEVEL } from '../terrain';
import { getSouthernIntertidalRocks } from '../southernIntertidalLayout';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import {
  SOUTHERN_INTERTIDAL,
  intertidalBackshoreMask,
  intertidalBasaltShelfMask,
  intertidalPathInfo,
  intertidalPoolMask,
  intertidalSaltExposure,
  intertidalScrubBandStrength,
  intertidalShellSandMask,
  intertidalTidalChannelMask,
  intertidalWrackBandMask,
  southernIntertidalSouthCoastZ,
} from '../regions/southernIntertidal/path';
import { buildAmbientWildlifeLayer } from './ambientWildlife';
import { BEACH_FIND_VARIANTS, buildBeachFindLayer } from './beachFinds';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { coastalBirds } from './flyingBirds';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';
const POOL_SURFACE_Y = WATER_LEVEL + 0.035;
const SCRUB_CLUSTERS = [
  [-44, -34], [-31, -31], [-18, -36], [-9, -34], [11, -34], [21, -35], [34, -31], [45, -34],
];

const INTERTIDAL_FIND_VARIANTS = {
  turretShell: { ...BEACH_FIND_VARIANTS.turretShell, weight: 0.2, scale: [2.7, 3.7] },
  junoniaShell: { ...BEACH_FIND_VARIANTS.junoniaShell, weight: 0.12, scale: [2.4, 3.45] },
  starfish: { ...BEACH_FIND_VARIANTS.starfish, weight: 0.35, scale: [0.0036, 0.0054] },
  lowPolyStarfish: { ...BEACH_FIND_VARIANTS.lowPolyStarfish, weight: 0.33, scale: [0.42, 0.62] },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clearOfPath(x, z, multiplier = 1.5) {
  const path = intertidalPathInfo(x, z);
  return path.distance > path.width * multiplier;
}

function intertidalGrassPathInfo(x, z) {
  return intertidalPathInfo(x, z);
}

function buildBackshoreGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: SOUTHERN_INTERTIDAL,
    idPrefix: 'southern-intertidal-salt-grass',
    count: 920,
    seed: 28701,
    bounds: { minX: -51, maxX: 51, minZ: -47, maxZ: -18 },
    pathInfo: intertidalGrassPathInfo,
    rejectBiomes: ['intertidal-causeway', 'tidal-channel', 'tidepool', 'wet-basalt'],
    pathCenterMax: 0,
    pathTreadMax: 0,
    maxGrade: 0.78,
    scale: [0.42, 0.92],
    windYaw: -0.36,
    attemptsPerItem: 170,
    pathClearance: 1.8,
    sparseBand: 1.4,
    baseChance: 0.13,
    densityAt: ({ x, z }) => clamp01(
      intertidalBackshoreMask(x, z) * 0.14
      + intertidalScrubBandStrength(x, z) * 0.24,
    ),
    accept: ({ biome, x, z }) => (
      (biome === 'backshore-scrub' || biome === 'wrack-line' || biome === 'white-sand')
      && intertidalBackshoreMask(x, z) > 0.42
      && clearOfPath(x, z, 1.42)
    ),
    drynessAt: ({ x, z, tone }) => clamp01(0.25 + tone * 0.2 + (1 - intertidalSaltExposure(x, z)) * 0.16),
    tintAt: (tone, dryness) => dryness > 0.48
      ? (tone > 0.5 ? '#89a05b' : '#6d844a')
      : (tone > 0.5 ? '#659750' : '#477a43'),
  });
  return createStandardDryGrassPatchLayer({
    id: 'southern-intertidal-salt-grass-patches',
    items,
    materialColor: '#dce8c7',
    emissive: '#162316',
    emissiveIntensity: 0.025,
    roughness: 1,
    widthScale: 1.1,
    heightScale: 0.86,
    depthScale: 1.06,
    maxVisibleDistance: 98,
    bladeTextureStrength: 0.25,
    motion: { wind: 1.06, bend: 0.28, bendRadius: 1.08 },
  });
}

function buildFlora(rocks) {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(SOUTHERN_INTERTIDAL, layer, count, seed, opts);
  const saltbush = varyScatterTransforms(scatter('southern-intertidal-saltbush', 136, 28731, {
    minX: -52, maxX: 52, minZ: -46, maxZ: -17, scale: [0.78, 1.42], maxGrade: 0.8,
    accept: (biome, x, z) => biome === 'backshore-scrub'
      && intertidalScrubBandStrength(x, z) > 0.2
      && clearOfPath(x, z, 1.72)
      && nearAnyCluster(SCRUB_CLUSTERS, x, z, 16),
  }), 28731, { width: [0.88, 1.36], height: [0.78, 1.2], depth: [0.9, 1.32], maxLean: 0.035 });
  return [
    {
      id: 'southern-intertidal-saltbush-a',
      label: 'Monte salado / Cryptocarpus pyriformis',
      path: `${NATURE}runtime-saltbush-1.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#607c4c',
      tintStrength: 0.17,
      motion: { wind: 0.78, bend: 0.18, bendRadius: 1.3 },
      items: saltbush.filter((_, index) => index % 2 === 0),
    },
    {
      id: 'southern-intertidal-saltbush-b',
      label: 'Monte salado / Cryptocarpus pyriformis',
      path: `${NATURE}runtime-saltbush-2.glb`,
      sink: 0.06,
      castShadow: false,
      tint: '#547345',
      tintStrength: 0.2,
      motion: { wind: 0.74, bend: 0.17, bendRadius: 1.32 },
      items: saltbush.filter((_, index) => index % 2 === 1),
    },
    {
      id: 'southern-intertidal-croton-screen',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.08,
      castShadow: false,
      tint: '#60744a',
      tintStrength: 0.14,
      motion: { wind: 0.64, bend: 0.11, bendRadius: 1.65 },
      items: varyScatterTransforms(scatter('southern-intertidal-croton', 38, 28747, {
        minX: -49, maxX: 49, minZ: -44, maxZ: -21, scale: [0.58, 0.98], maxGrade: 0.72,
        accept: (biome, x, z) => biome === 'backshore-scrub'
          && intertidalScrubBandStrength(x, z) > 0.3
          && clearOfPath(x, z, 1.9),
      }), 28747, { width: [0.84, 1.16], height: [0.82, 1.18], depth: [0.86, 1.16], maxLean: 0.026 }),
    },
    {
      id: 'southern-intertidal-wrack-sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.035,
      castShadow: false,
      ySquash: 0.24,
      tint: '#658449',
      tintStrength: 0.16,
      motion: { wind: 0.46, bend: 0.12, bendRadius: 1.0 },
      items: varyScatterTransforms(scatter('southern-intertidal-sesuvium', 42, 28759, {
        minX: -48, maxX: 48, minZ: -30, maxZ: -10, scale: [0.9, 1.8], maxGrade: 0.7,
        accept: (biome, x, z) => (biome === 'wrack-line' || biome === 'white-sand')
          && intertidalWrackBandMask(x, z) > 0.3
          && clearOfPath(x, z, 1.48),
      }), 28759, { width: [0.8, 1.24], height: [0.76, 1.08], depth: [0.8, 1.22], maxLean: 0.02 }),
    },
    {
      id: 'southern-intertidal-algae-carpets',
      label: 'Intertidal algal mat',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.02,
      castShadow: false,
      ySquash: 0.11,
      tint: '#315f2f',
      tintStrength: 0.58,
      items: rocks
        .filter(rock => rock.id.startsWith('algae-'))
        .flatMap((rock, rockIndex) => [
          {
            id: `southern-intertidal-algae-mat-${rockIndex}-a`,
            x: rock.x - rock.radiusX * 0.18,
            y: rock.y + rock.radiusY * 0.88,
            z: rock.z,
            yaw: rock.yaw + 0.34,
            scale: Math.max(0.82, rock.radiusX * 0.66),
            widthScale: 1.42,
            depthScale: 0.86,
            heightScale: 0.72,
          },
          {
            id: `southern-intertidal-algae-mat-${rockIndex}-b`,
            x: rock.x + rock.radiusX * 0.28,
            y: rock.y + rock.radiusY * 0.84,
            z: rock.z + rock.radiusZ * 0.16,
            yaw: rock.yaw - 0.52,
            scale: Math.max(0.64, rock.radiusX * 0.48),
            widthScale: 1.3,
            depthScale: 0.92,
            heightScale: 0.68,
          },
        ]),
    },
    {
      id: 'southern-intertidal-mangrove-fringe',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      sink: 0.14,
      castShadow: false,
      tint: '#557d4b',
      tintStrength: 0.15,
      motion: { wind: 0.3, bend: 0.05, bendRadius: 2.4 },
      items: scatter('southern-intertidal-mangroves', 10, 28771, {
        minX: -47, maxX: 47, minZ: -47, maxZ: -31, scale: [0.2, 0.34], maxGrade: 0.76,
        accept: (biome, x, z) => biome === 'backshore-scrub'
          && Math.abs(x) > 13
          && clearOfPath(x, z, 2.35),
      }),
    },
    {
      id: 'southern-intertidal-driftwood-line',
      path: `${NATURE}runtime-driftwood.glb`,
      sink: 0.025,
      tint: '#c1ad85',
      tintStrength: 0.36,
      items: scatter('southern-intertidal-driftwood', 8, 28783, {
        minX: -46, maxX: 46, minZ: -27, maxZ: -10, scale: [0.18, 0.4], maxGrade: 0.64,
        accept: (biome, x, z) => intertidalWrackBandMask(x, z) > 0.42
          && (biome === 'wrack-line' || biome === 'white-sand')
          && clearOfPath(x, z, 1.42),
      }),
    },
  ];
}

function buildLitter() {
  return [
    buildDryVolcanicLitterLayer({
      zoneId: SOUTHERN_INTERTIDAL,
      id: 'southern-intertidal-pool-rim-litter',
      itemIdPrefix: 'southern-intertidal-pool-rim',
      count: 430,
      seed: 28801,
      bounds: { minX: -47, maxX: 47, minZ: -17, maxZ: 29 },
      scale: [0.5, 1.42],
      maxVisibleDistance: 58,
      maxGrade: 0.78,
      variantOptions: [
        { variant: 'shell-cap', weight: 0.3, colors: ['#e4dcc6', '#d5c8aa', '#eee0bd'] },
        { variant: 'shell-shard-a', weight: 0.28, colors: ['#d9d2bc', '#c8c1aa', '#aeb4a5'] },
        { variant: 'shell-shard-b', weight: 0.16, colors: ['#d0c2a5', '#b8ad95', '#e1d3b7'] },
        { variant: 'coral-chip', weight: 0.2, colors: ['#c98570', '#d19a7d', '#b8756d'] },
        { variant: 'basalt-pebble', weight: 0.06, colors: ['#303b37', '#454a40'] },
      ],
      accept: (biome, x, z) => {
        const pool = intertidalPoolMask(x, z);
        const channel = intertidalTidalChannelMask(x, z);
        const atWaterEdge = (pool > 0.07 && pool < 0.44) || (channel > 0.06 && channel < 0.34);
        return atWaterEdge
          && intertidalPathInfo(x, z).tread < 0.16
          && (biome === 'wet-sand' || biome === 'white-sand' || biome === 'wrack-line');
      },
      wetnessAt: (x, z) => clamp01(intertidalSaltExposure(x, z) * 1.12),
    }),
    buildDryVolcanicLitterLayer({
      zoneId: SOUTHERN_INTERTIDAL,
      id: 'southern-intertidal-wrack-shell-line',
      itemIdPrefix: 'southern-intertidal-wrack-find',
      count: 250,
      seed: 28807,
      bounds: { minX: -49, maxX: 49, minZ: -29, maxZ: -7 },
      scale: [0.42, 1.16],
      maxVisibleDistance: 52,
      maxGrade: 0.7,
      variantOptions: [
        { variant: 'shell-shard-a', weight: 0.34, colors: ['#ded4ba', '#c9bea3'] },
        { variant: 'shell-cap', weight: 0.2, colors: ['#e8dec4', '#cfc1a1'] },
        { variant: 'limestone-chip', weight: 0.24, colors: ['#d2c8ac', '#b8af98'] },
        { variant: 'coral-chip', weight: 0.14, colors: ['#c98f79', '#b77768'] },
        { variant: 'basalt-pebble', weight: 0.08, colors: ['#47483f', '#343b37'] },
      ],
      accept: (biome, x, z) => intertidalWrackBandMask(x, z) > 0.26
        && intertidalPathInfo(x, z).tread < 0.14
        && (biome === 'wrack-line' || biome === 'white-sand' || biome === 'wet-sand'),
      wetnessAt: (x, z) => intertidalSaltExposure(x, z) * 0.48,
    }),
    buildDryVolcanicLitterLayer({
      zoneId: SOUTHERN_INTERTIDAL,
      id: 'southern-intertidal-basalt-crevice-litter',
      itemIdPrefix: 'southern-intertidal-basalt-crevice',
      count: 180,
      seed: 28813,
      bounds: { minX: -49, maxX: 49, minZ: -16, maxZ: 34 },
      scale: [0.34, 0.92],
      maxVisibleDistance: 48,
      maxGrade: 1.05,
      variantOptions: [
        { variant: 'basalt-pebble', weight: 0.58, colors: ['#222e2b', '#35403a', '#4a4d43'] },
        { variant: 'coral-chip', weight: 0.18, colors: ['#ad7466', '#c28b77'] },
        { variant: 'shell-shard-b', weight: 0.14, colors: ['#c8bea5', '#aeb4a5'] },
        { variant: 'limestone-chip', weight: 0.1, colors: ['#bdb59f', '#d3c9af'] },
      ],
      accept: (biome, x, z) => intertidalBasaltShelfMask(x, z) > 0.34
        && intertidalPathInfo(x, z).tread < 0.12
        && (biome === 'wet-basalt' || biome === 'dry-basalt'),
      wetnessAt: (x, z) => intertidalSaltExposure(x, z),
    }),
  ];
}

function buildBarnacleProps(rocks) {
  return rocks
    .filter(rock => rock.radiusX > 0.48 && intertidalSaltExposure(rock.x, rock.z) > 0.48)
    .slice(0, 14)
    .map((rock, index) => ({
      id: `southern-intertidal-barnacle-colony-${index}`,
      path: `${NATURE}runtime-barnacle-cluster.glb`,
      position: [rock.x, rock.y + Math.max(0.1, rock.radiusY * 0.76), rock.z],
      rotation: [0, rock.yaw + index * 0.43, 0],
      scale: 0.1 + Math.min(0.09, rock.radiusX * 0.045),
      maxVisibleDistance: 46,
      loadTier: 2,
    }));
}

export function buildSouthernIntertidalEcology() {
  const rocks = getSouthernIntertidalRocks();
  const surfRocks = rocks.filter(rock => rock.z > 24 && rock.radiusY > 0.28);
  return {
    zoneId: SOUTHERN_INTERTIDAL,
    stream: true,
    streamSchedule: [120, 760, 1500],
    lagoonSurfaces: [{
      id: 'southern-intertidal-tidepool-water',
      zoneId: SOUTHERN_INTERTIDAL,
      position: [0, POOL_SURFACE_Y, 0],
      bounds: { minX: -38, maxX: 39, minZ: -10, maxZ: 22 },
      geometryResolution: [224, 112],
      colorA: '#056d78',
      colorB: '#4fd8c9',
      mudColor: '#343c35',
      algaeColor: '#52784c',
      waterColor: '#30b6b2',
      opacity: 0.092,
      reflectivity: 0.085,
      waterAlpha: 0.86,
      waterShoreAlpha: 0.38,
      flowSpeed: 0.0028,
      flowScale: 2.15,
      flowDirection: [0.24, 0.08],
      shoreNoise: 0.045,
      maskThreshold: 0.32,
      rippleStrength: 0.72,
      distortionScale: 0.018,
      stepRippleStrength: 1.02,
      stepRippleDisplacement: 0.03,
      stepRippleEventScale: 1.36,
      walkRippleEventScale: 1.14,
      rippleEventScale: 1.24,
      splashRippleEventScale: 1.72,
      stepRippleMaxIntensity: 1.5,
      playerIdleRippleStrength: 0.66,
      overlayLift: 0.015,
      playerVeilLift: 0.034,
      playerVeilScale: [1.36, 0.92],
      textureWidth: 512,
      textureHeight: 512,
    }],
    dryGrassPatches: [buildBackshoreGrass()],
    flora: buildFlora(rocks),
    rocks,
    splashes: { anchors: surfRocks.slice(0, 12), period: (Math.PI * 2) / 0.5984 },
    cliffSurf: getCliffSurfProfile(SOUTHERN_INTERTIDAL),
    surfaceLitter: buildLitter(),
    collectibleBeachFinds: [buildBeachFindLayer(SOUTHERN_INTERTIDAL, {
      id: 'southern-intertidal-beach-finds',
      count: 22,
      seed: 28831,
      bounds: { minX: -47, maxX: 47, minZ: -18, maxZ: 31 },
      maxGrade: 0.48,
      maxVisibleDistance: 68,
      variants: INTERTIDAL_FIND_VARIANTS,
      accept: (_biome, x, z) => {
        const pool = intertidalPoolMask(x, z);
        const channel = intertidalTidalChannelMask(x, z);
        const coastDistance = southernIntertidalSouthCoastZ(x) - z;
        const poolRim = pool > 0.06 && pool < 0.42;
        const outerStrand = coastDistance > 2.2 && coastDistance < 16;
        return clearOfPath(x, z, 1.12)
          && channel < 0.38
          && (poolRim || outerStrand || intertidalShellSandMask(x, z) > 0.38);
      },
    })],
    ambientWildlife: [buildAmbientWildlifeLayer(SOUTHERN_INTERTIDAL, {
      id: 'southern-intertidal-ambient-crabs',
      speciesId: 'crab',
      count: 7,
      seed: 28847,
      bounds: { minX: -43, maxX: 43, minZ: -11, maxZ: 28 },
      scale: [0.72, 1.06],
      behavior: 'skitter',
      maxGrade: 0.72,
      habitatRadiusX: 4.8,
      habitatRadiusZ: 3.5,
      accept: (biome, x, z) => clearOfPath(x, z, 1.18)
        && (biome === 'wet-basalt' || biome === 'wet-sand' || biome === 'tidepool'),
    })],
    props: buildBarnacleProps(rocks),
    footprintBiomes: ['intertidal-causeway', 'wet-sand', 'white-sand', 'wrack-line', 'backshore-scrub'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 26, radiusZ: 16, height: 17, speed: 0.09, phase: 0.4, cx: -11, cz: 16, flapRate: 0.72, scale: 0.92 },
      { species: 'frigatebird', radiusX: 37, radiusZ: 22, height: 37, speed: -0.048, phase: 2.6, cx: 8, cz: 24, flapRate: 0.27, scale: 1.04 },
      { species: 'booby', radiusX: 31, radiusZ: 17, height: 25, speed: 0.066, phase: 4.9, cx: 23, cz: 28, flapRate: 0.54, scale: 0.96 },
    ]),
  };
}
