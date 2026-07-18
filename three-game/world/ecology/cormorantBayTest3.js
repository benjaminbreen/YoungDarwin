import {
  makeZoneScatter,
  nearAnyCluster,
  varyScatterTransforms,
} from '../scatter';
import { WATER_LEVEL } from '../terrain';
import { cormorantLagoonField, cormorantTrailDistance } from '../regions/cormorantBayTest3/terrain';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const CORMORANT_BAY_ZONE = 'CORMORANT_BAY';
const TEST_ZONE = 'CORMORANT_BAY_TEST_3';
const NATURE = '/assets/models/nature/';
const LAGOON_SURFACE_Y = WATER_LEVEL + 0.035;
const SALTBUSH_CLUSTERS = [
  [-39, 29], [-28, 18], [-17, 34], [-4, 27], [11, 34], [25, 21], [39, 31],
];

function dryGround(biome) {
  return ['green-beach', 'salt-scrub', 'tuff-rim', 'olivine-trail'].includes(biome);
}

function lagoonEdge(biome, x, z) {
  const lagoon = cormorantLagoonField(x, z);
  return lagoon > 1.0 && lagoon < 1.55 && biome !== 'brackish-lagoon' && biome !== 'deep-lagoon';
}

function notTrail(x, z, margin = 4.4) {
  return cormorantTrailDistance(x, z) > margin;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function cormorantGrassPathInfo(x, z) {
  const distance = cormorantTrailDistance(x, z);
  const width = 2.55;
  return {
    distance,
    width,
    center: 1 - clamp01((distance - 0.8) / 0.9),
    tread: 1 - clamp01((distance - 1.45) / 1.25),
    shoulder: 1 - clamp01(Math.abs(distance - 3.4) / 1.7),
  };
}

function cormorantGrassDryness({ x, z, tone, path }) {
  const lagoon = cormorantLagoonField(x, z);
  const lagoonMoisture = 1 - clamp01((lagoon - 1.3) / 1.9);
  return clamp01(0.16 + tone * 0.2 + (1 - lagoonMoisture) * 0.18 + (path?.shoulder || 0) * 0.08);
}

function cormorantGrassTint(tone, dryness) {
  const warm = clamp01(dryness * 0.72 + tone * 0.16);
  if (warm > 0.6) return tone > 0.52 ? '#98a85e' : '#7f914f';
  if (warm > 0.38) return tone > 0.5 ? '#85a459' : '#668948';
  return tone > 0.48 ? '#729b53' : '#547e43';
}

function buildCormorantGrass(zoneId, idPrefix) {
  return buildStandardDryPathGrassPatchItems({
    zoneId,
    idPrefix: `${idPrefix}-salt-meadow-grass`,
    count: 1800,
    seed: 9831,
    bounds: { minX: -46, maxX: 46, minZ: 2, maxZ: 42 },
    pathInfo: cormorantGrassPathInfo,
    rejectBiomes: [
      'deep-lagoon',
      'shallow-white-sand',
      'brackish-lagoon',
      'wet-mud',
      'wet-white-sand',
      'white-sand',
      'olivine-trail',
    ],
    pathCenterMax: 0,
    pathTreadMax: 0,
    maxGrade: 0.84,
    slopeStep: 0.75,
    scale: [0.5, 1.1],
    windYaw: -0.66,
    attemptsPerItem: 160,
    pathClearance: 1.92,
    sparseBand: 1.45,
    baseChance: 0.24,
    pathDistanceWeight: 0.43,
    clumpWeight: 0.34,
    gapWeight: 0.17,
    clumpScale: 0.055,
    gapScale: 0.115,
    densityAt: ({ x, z }) => {
      const lagoon = cormorantLagoonField(x, z);
      return (1 - clamp01((lagoon - 1.35) / 2.2)) * 0.16;
    },
    accept: ({ biome, x, z }) => (
      ['green-beach', 'salt-scrub', 'tuff-rim'].includes(biome)
      && cormorantLagoonField(x, z) > 1.18
    ),
    drynessAt: cormorantGrassDryness,
    tintAt: cormorantGrassTint,
  });
}

function buildCormorantBayEcologyForZone(zoneId, idPrefix) {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(zoneId, layer, count, seed, opts);
  const dryGrassPatches = buildCormorantGrass(zoneId, idPrefix);
  const saltbush = varyScatterTransforms(scatter(`${idPrefix}-saltbush`, 60, 417, {
    minX: -46,
    maxX: 46,
    minZ: 8,
    maxZ: 43,
    scale: [0.46, 0.82],
    maxGrade: 0.72,
    accept: (biome, x, z) => (biome === 'salt-scrub' || biome === 'tuff-rim')
      && notTrail(x, z, 7.2)
      && cormorantLagoonField(x, z) > 1.62
      && nearAnyCluster(SALTBUSH_CLUSTERS, x, z, 12.5),
  }), 417, {
    width: [0.78, 1.2],
    height: [0.8, 1.18],
    depth: [0.82, 1.16],
    maxLean: 0.035,
  });
  const dryGrassLayer = createStandardDryGrassPatchLayer({
    id: `${idPrefix}-salt-meadow-grass-patches`,
    items: dryGrassPatches,
    materialColor: '#eef0d2',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 1,
    castShadow: false,
    widthScale: 1.04,
    heightScale: 1.02,
    depthScale: 1.02,
    maxVisibleDistance: 102,
    bladeTextureStrength: 0.24,
    motion: { wind: 0.94, bend: 0.2, bendRadius: 1.1 },
  });
  return {
    zoneId,
    stream: false,
    lagoonSurfaces: [
      {
        id: `${idPrefix}-brackish-lagoon-water`,
        zoneId,
        position: [0, LAGOON_SURFACE_Y, 0],
        bounds: { minX: -39, maxX: 39, minZ: -17, maxZ: 19 },
        geometryResolution: [220, 108],
        colorA: '#264d48',
        colorB: '#76a28e',
        mudColor: '#5c5540',
        algaeColor: '#71845a',
        waterColor: '#6f9289',
        opacity: 0.062,
        reflectivity: 0.048,
        waterAlpha: 0.78,
        waterShoreAlpha: 0.34,
        flowSpeed: 0.0022,
        flowScale: 2.4,
        flowDirection: [0.16, 0.11],
        shoreNoise: 0.035,
        maskThreshold: 0.3,
        rippleStrength: 0.62,
        distortionScale: 0.014,
        stepRippleStrength: 0.92,
        stepRippleDisplacement: 0.026,
        stepRippleEventScale: 1.32,
        walkRippleEventScale: 1.1,
        rippleEventScale: 1.18,
        splashRippleEventScale: 1.68,
        stepRippleMaxIntensity: 1.45,
        playerIdleRippleStrength: 0.62,
        overlayLift: 0.014,
        playerVeilLift: 0.034,
        playerVeilScale: [1.34, 0.9],
        textureWidth: 512,
        textureHeight: 512,
      },
    ],
    dryGrassPatches: [dryGrassLayer],
    flora: [
      {
        id: `${idPrefix}-lagoon-saltgrass`,
        path: `${NATURE}runtime-saltgrass.glb`,
        sink: 0.13,
        castShadow: false,
        motion: { wind: 0.9, bend: 0.28, bendRadius: 1.1 },
        items: varyScatterTransforms(scatter(`${idPrefix}-lagoon-saltgrass`, 112, 321, {
          minX: -42, maxX: 42, minZ: -16, maxZ: 28, scale: [0.08, 0.16], maxGrade: 0.8,
          accept: (biome, x, z) => lagoonEdge(biome, x, z) && notTrail(x, z, 3.3),
        }), 321, { width: [0.72, 1.24], height: [0.8, 1.16], depth: [0.76, 1.2], maxLean: 0.025 }),
      },
      {
        id: `${idPrefix}-sesuvium-mats`,
        path: `${NATURE}runtime-sesuvium.glb`,
        sink: 0.025,
        castShadow: false,
        ySquash: 0.28,
        motion: { wind: 0.38, bend: 0.12, bendRadius: 1.0 },
        items: varyScatterTransforms(scatter(`${idPrefix}-sesuvium`, 32, 333, {
          minX: -40, maxX: 38, minZ: 2, maxZ: 35, scale: [1.1, 2.1], maxGrade: 0.7,
          accept: (biome, x, z) => dryGround(biome)
            && cormorantTrailDistance(x, z) > 5.2
            && cormorantLagoonField(x, z) > 1.32,
        }), 333, { width: [0.82, 1.2], height: [0.82, 1.08], depth: [0.8, 1.18], maxLean: 0.018 }),
      },
      {
        id: `${idPrefix}-saltbush-cryptocarpus-a`,
        label: 'Monte salado / Cryptocarpus pyriformis',
        path: `${NATURE}runtime-saltbush-1.glb`,
        sink: 0.055,
        castShadow: false,
        tint: '#74805b',
        tintStrength: 0.22,
        motion: { wind: 0.72, bend: 0.16, bendRadius: 1.28 },
        items: saltbush.filter((_, index) => index % 2 === 0),
      },
      {
        id: `${idPrefix}-saltbush-cryptocarpus-b`,
        label: 'Monte salado / Cryptocarpus pyriformis',
        path: `${NATURE}runtime-saltbush-2.glb`,
        sink: 0.055,
        castShadow: false,
        tint: '#687650',
        tintStrength: 0.18,
        motion: { wind: 0.68, bend: 0.15, bendRadius: 1.3 },
        items: saltbush.filter((_, index) => index % 2 === 1),
      },
      {
        id: `${idPrefix}-lagoon-mangroves`,
        path: `${NATURE}runtime-mangrove-tree.glb`,
        sink: 0.12,
        castShadow: false,
        tint: '#66834f',
        tintStrength: 0.14,
        motion: { wind: 0.28, bend: 0.045, bendRadius: 2.4 },
        items: scatter(`${idPrefix}-mangrove-fringe`, 7, 403, {
          minX: -38, maxX: 36, minZ: -13, maxZ: 12, scale: [0.22, 0.36], maxGrade: 0.9,
          accept: (biome, x, z) => lagoonEdge(biome, x, z)
            && notTrail(x, z, 8.5)
            && cormorantLagoonField(x, z) > 1.12
            && cormorantLagoonField(x, z) < 1.64,
        }),
      },
      {
        id: `${idPrefix}-driftwood-shell-line`,
        path: `${NATURE}runtime-driftwood.glb`,
        sink: 0.02,
        tint: '#c7b998',
        tintStrength: 0.44,
        items: scatter(`${idPrefix}-driftwood-shell-line`, 7, 367, {
          minX: -44, maxX: 28, minZ: 8, maxZ: 29, scale: [0.18, 0.42], maxGrade: 0.72,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5,
        }),
      },
    ],
    flyingModels: [
      {
        id: `${idPrefix}-distant-flying-flamingos`,
        loadTier: 1,
        items: [
          {
            id: `${idPrefix}-flying-flamingo-1`,
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: -18,
            cz: -16,
            radiusX: 28,
            radiusZ: 12,
            height: 18,
            speed: 0.038,
            phase: 0.4,
            scale: 1.2,
            timeScale: 0.62,
            yawOffset: 0,
            rollAmount: 0.06,
            floatAmount: 0.7,
          },
          {
            id: `${idPrefix}-flying-flamingo-2`,
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 16,
            cz: -22,
            radiusX: 34,
            radiusZ: 15,
            height: 23,
            speed: -0.032,
            phase: 2.1,
            scale: 1.05,
            timeScale: 0.58,
            yawOffset: 0,
            rollAmount: 0.055,
            floatAmount: 0.8,
          },
          {
            id: `${idPrefix}-flying-flamingo-3`,
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 2,
            cz: -30,
            radiusX: 42,
            radiusZ: 18,
            height: 27,
            speed: 0.026,
            phase: 4.3,
            scale: 0.95,
            timeScale: 0.54,
            yawOffset: 0,
            rollAmount: 0.045,
            floatAmount: 0.65,
          },
        ],
      },
    ],
    birds: [
      { radius: 20, height: 14, speed: 0.1, phase: 0.4, cx: -10, cz: -6 },
      { radius: 31, height: 20, speed: -0.065, phase: 2.9, cx: 19, cz: -16 },
    ],
    footprintBiomes: ['green-beach', 'wet-mud', 'olivine-trail', 'salt-scrub', 'tuff-rim'],
  };
}

export function buildCormorantBayEcology() {
  return buildCormorantBayEcologyForZone(CORMORANT_BAY_ZONE, 'cormorant-bay');
}

export function buildCormorantBayTest3Ecology() {
  return buildCormorantBayEcologyForZone(TEST_ZONE, 'test-3');
}
