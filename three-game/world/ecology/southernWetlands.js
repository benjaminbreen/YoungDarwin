import { makeZoneScatter, nearAnyCluster, seededRandom } from '../scatter';
import { terrainHeight, terrainSlopeAt } from '../terrain';
import { WATER_LEVEL } from '../terrainShared';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import {
  FARM_PLOT,
  wetlandsFarmMask,
  wetlandsFernBenchMask,
  wetlandsForestWallMask,
  wetlandsLagoonApron,
  wetlandsLagoonField,
  wetlandsPoolMask,
  wetlandsTrailInfluence,
} from '../regions/southernWetlands/terrain';

// Wetlands Forest (S_WETLANDS) ecology. Canopy is the single-tree
// runtime-scalesia-pedunculata-tree GLB (never the multi-tree collection, and
// never CanopySilhouetteLayer spheres or ez-tree scalesia); mangroves own the
// southern lowland; one swamp-tuned StandingWaterSurface carries the heron
// lagoon.

const S_WETLANDS = 'S_WETLANDS';
const NATURE = '/assets/models/nature/';
const LAGOON_SURFACE_Y = WATER_LEVEL + 0.035;

const understoryClusters = [
  [-24, -22], [-10, -30], [8, -20], [-30, -8], [-14, 6], [12, 2],
  [-34, 12], [22, 12], [4, 28], [30, 26], [-40, 30],
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function notOnTrail(x, z, margin = 4.6) {
  return wetlandsTrailInfluence(x, z, 1.2, margin) < 0.32;
}

function trailEdge(x, z) {
  const trail = wetlandsTrailInfluence(x, z, 1.2, 8.5);
  return trail > 0.18 && trail < 0.72;
}

function openWater(x, z) {
  return wetlandsLagoonField(x, z) > 0.34;
}

function dryLand(x, z) {
  return wetlandsLagoonField(x, z) < 0.2 && wetlandsPoolMask(x, z) < 0.45;
}

function onFarm(x, z) {
  return wetlandsFarmMask(x, z) > 0.3;
}

function uplandForestAccept(biome, x, z) {
  return (biome === 'upland-forest' || biome === 'forest-floor')
    && notOnTrail(x, z, 6.4)
    && dryLand(x, z)
    && !onFarm(x, z);
}

function lowlandWallAccept(biome, x, z) {
  return wetlandsForestWallMask(x, z) > 0.42
    && z > 12
    && !openWater(x, z)
    && notOnTrail(x, z, 6.8)
    && !onFarm(x, z);
}

function fernAccept(biome, x, z) {
  return wetlandsFernBenchMask(x, z) > 0.26
    && !openWater(x, z)
    && biome !== 'mud-trail'
    && nearAnyCluster(understoryClusters, x, z, 20);
}

function itemAt(id, x, z, scale, yaw = 0, extra = {}) {
  const y = terrainHeight(x, z, S_WETLANDS);
  const { grade } = terrainSlopeAt(x, z, S_WETLANDS);
  return { id, x, y, z, grade, scale, yaw, tone: seededRandom(Math.floor(x * 11 + z * 17), 5), ...extra };
}

// Hero scalesia framing the spawn (trail descent from the creek notch) and
// the farm terrace overlook.
function buildScalesiaHeroes() {
  return [
    itemAt('scalesia-notch-east', 23.5, -35.5, 1.12, -0.4),
    itemAt('scalesia-notch-west', 3.5, -41.0, 1.02, 0.55),
    itemAt('scalesia-descent-left', -1.6, -28.4, 1.16, 0.2),
    itemAt('scalesia-descent-right', 17.8, -24.6, 0.94, -0.7),
    itemAt('scalesia-farm-north', -21.4, -12.8, 1.18, 0.85),
    itemAt('scalesia-farm-west', -28.6, -1.2, 1.08, -0.3),
    itemAt('scalesia-fork-south', -3.8, 12.4, 0.98, 0.45),
    itemAt('scalesia-upland-deep-1', -34.2, -24.6, 1.15, 0.1),
    itemAt('scalesia-upland-deep-2', -22.8, -33.4, 1.1, -0.9),
  ];
}

function buildMangroveHeroes() {
  return [
    itemAt('mangrove-lagoon-west', -30.4, 30.6, 0.46, 0.3),
    itemAt('mangrove-lagoon-north', -14.2, 21.2, 0.42, -0.6),
    itemAt('mangrove-lagoon-spit', -3.6, 32.8, 0.48, 0.9),
    itemAt('mangrove-lagoon-east', 8.4, 36.2, 0.44, -0.35),
    itemAt('mangrove-pool-se', 26.2, 38.4, 0.4, 0.6),
    itemAt('mangrove-pool-east', 37.8, 8.6, 0.38, -0.8),
  ];
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(S_WETLANDS, layer, count, seed, opts);

  const uplandScalesia = scatter('wetlands-scalesia-upland', 26, 811, {
    minX: -52, maxX: 46, minZ: -46, maxZ: 20, scale: [0.78, 1.18], maxGrade: 0.56,
    accept: uplandForestAccept,
  });
  const mangroveWall = scatter('wetlands-mangrove-wall', 40, 823, {
    minX: -52, maxX: 52, minZ: 8, maxZ: 47, scale: [0.85, 1.28], maxGrade: 0.66,
    accept: (biome, x, z) => lowlandWallAccept(biome, x, z)
      || (z > 38 && !openWater(x, z) && notOnTrail(x, z, 6.0)),
  });
  const mangroveMid = scatter('wetlands-mangrove-mid', 10, 829, {
    minX: -44, maxX: 46, minZ: 14, maxZ: 44, scale: [0.34, 0.5], maxGrade: 0.5,
    accept: (biome, x, z) => (wetlandsLagoonApron(x, z) > 0.25 || wetlandsPoolMask(x, z) > 0.3)
      && !openWater(x, z)
      && notOnTrail(x, z, 5.2),
  });
  const ferns = scatter('wetlands-fern-bank', 58, 841, {
    minX: -46, maxX: 46, minZ: -40, maxZ: 44, scale: [0.86, 1.45], maxGrade: 0.6,
    accept: fernAccept,
  });
  const croton = scatter('wetlands-croton', 34, 853, {
    minX: -48, maxX: 48, minZ: -42, maxZ: 42, scale: [0.42, 0.82], maxGrade: 0.64,
    accept: (biome, x, z) => (biome === 'wet-meadow' || biome === 'fern-bank' || biome === 'forest-floor' || biome === 'upland-forest')
      && notOnTrail(x, z, 4.7)
      && dryLand(x, z)
      && nearAnyCluster(understoryClusters, x, z, 18),
  });
  const darwiniothamnus = makeDarwiniothamnusPatchScatter(S_WETLANDS, 'wetlands-darwiniothamnus', 40, 861, {
    minX: -44, maxX: 44, minZ: -40, maxZ: 40, scale: [0.8, 2.45], maxGrade: 0.6,
    patchCount: 5, patchRadius: [2.8, 5.6],
    accept: (biome, x, z) => (biome === 'wet-meadow' || biome === 'fern-bank')
      && dryLand(x, z)
      && notOnTrail(x, z, 4.2)
      && !onFarm(x, z),
  }, { width: [0.88, 1.14], height: [0.88, 1.12], maxLean: 0.04 });
  const justicia = scatter('wetlands-justicia', 14, 877, {
    minX: -42, maxX: 42, minZ: -38, maxZ: 40, scale: [0.78, 1.25], maxGrade: 0.58,
    accept: (biome, x, z) => trailEdge(x, z)
      && dryLand(x, z)
      && seededRandom(Math.floor(x * 19 + z * 23), 7) > 0.44,
  });
  const manzanillo = scatter('wetlands-manzanillo', 12, 883, {
    minX: -48, maxX: 44, minZ: -44, maxZ: 24, scale: [0.82, 1.35], maxGrade: 0.55,
    accept: (biome, x, z) => (biome === 'upland-forest' || biome === 'wet-meadow')
      && wetlandsForestWallMask(x, z) > 0.2
      && wetlandsForestWallMask(x, z) < 0.6
      && notOnTrail(x, z, 6.2)
      && dryLand(x, z)
      && !onFarm(x, z),
  });

  return [
    {
      id: 'wetlands-scalesia-heroes',
      path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`,
      loadTier: 0,
      prefetch: true,
      sink: 0.16,
      tint: '#5f8149',
      tintStrength: 0.12,
      motion: { wind: 0.48, bend: 0.12, bendRadius: 3.4 },
      castShadow: false,
      items: buildScalesiaHeroes(),
    },
    {
      id: 'wetlands-scalesia-upland',
      path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`,
      loadTier: 1,
      sink: 0.16,
      tint: '#557a45',
      tintStrength: 0.16,
      motion: { wind: 0.44, bend: 0.11, bendRadius: 3.6 },
      castShadow: false,
      items: uplandScalesia,
    },
    {
      id: 'wetlands-mangrove-heroes',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      loadTier: 1,
      sink: 0.14,
      tint: '#54704c',
      tintStrength: 0.1,
      motion: { wind: 0.26, bend: 0.035, bendRadius: 3.6 },
      castShadow: false,
      items: buildMangroveHeroes(),
    },
    {
      id: 'wetlands-mangrove-mid',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      loadTier: 2,
      sink: 0.14,
      tint: '#4d6846',
      tintStrength: 0.14,
      motion: { wind: 0.24, bend: 0.03, bendRadius: 3.8 },
      castShadow: false,
      items: mangroveMid,
    },
    {
      id: 'wetlands-mangrove-wall',
      path: `${NATURE}runtime-mangrove-lowpoly.glb`,
      loadTier: 3,
      sink: 0.1,
      tint: '#36503a',
      tintStrength: 0.34,
      motion: { wind: 0.2, bend: 0.025, bendRadius: 4.5 },
      castShadow: false,
      items: mangroveWall,
    },
    {
      id: 'wetlands-fern-bank',
      path: `${NATURE}runtime-galapagos-fern.glb`,
      loadTier: 1,
      sink: 0.03,
      tint: '#4c7a41',
      tintStrength: 0.22,
      motion: { wind: 1.05, bend: 0.34, bendRadius: 1.35 },
      castShadow: false,
      items: ferns,
    },
    {
      id: 'wetlands-croton',
      path: `${NATURE}runtime-croton.glb`,
      loadTier: 2,
      sink: 0.06,
      tint: '#5c7c49',
      tintStrength: 0.28,
      motion: { wind: 1.18, bend: 0.34, bendRadius: 1.35 },
      castShadow: false,
      items: croton,
    },
    {
      id: 'wetlands-darwiniothamnus',
      label: DARWINIOTHAMNUS_LABEL,
      path: DARWINIOTHAMNUS_PATH,
      variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
      loadTier: 2,
      sink: 0.05,
      tint: '#61854d',
      tintStrength: 0.2,
      motion: { wind: 0.95, bend: 0.22, bendRadius: 1.45 },
      castShadow: false,
      items: darwiniothamnus,
    },
    {
      id: 'wetlands-justicia',
      label: 'Galápagos justicia / Justicia galapagana',
      path: `${NATURE}runtime-purple-shrub.glb`,
      loadTier: 2,
      sink: 0.04,
      tint: '#697b4c',
      tintStrength: 0.16,
      motion: { wind: 1.05, bend: 0.3, bendRadius: 1.3 },
      castShadow: false,
      items: justicia,
    },
    {
      id: 'wetlands-manzanillo',
      path: `${NATURE}runtime-manzanillo.glb`,
      loadTier: 2,
      sink: 0.1,
      tint: '#647e57',
      tintStrength: 0.3,
      motion: { wind: 0.62, bend: 0.16, bendRadius: 2.1 },
      castShadow: false,
      items: manzanillo,
    },
  ];
}

// Verdant meadow grass: greener tint ramp than the standard dry-grass litter.
function wetlandsGrassTint(tone, dryness) {
  const shade = clamp01(tone * 0.5 + dryness * 0.3);
  if (dryness > 0.62) return shade > 0.55 ? '#a8a862' : '#8a9150';
  if (dryness > 0.34) return shade > 0.52 ? '#87a35c' : '#6f8a4a';
  return shade > 0.48 ? '#6f9152' : '#587a42';
}

function buildGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: S_WETLANDS,
    idPrefix: 'wetlands-meadow-grass',
    count: 460,
    seed: 8231,
    bounds: { minX: -50, maxX: 50, minZ: -44, maxZ: 44 },
    rejectBiomes: ['wetland-lagoon', 'wet-mud', 'mud-trail'],
    maxGrade: 0.7,
    scale: [0.72, 1.3],
    drynessAt: ({ x, z, tone }) => clamp01(
      0.14
      + tone * 0.2
      + wetlandsForestWallMask(x, z) * -0.1
      + Math.max(0, wetlandsLagoonField(x, z) - 0.08) * -0.6,
    ),
    tintAt: wetlandsGrassTint,
    accept: ({ x, z }) => dryLand(x, z)
      && wetlandsTrailInfluence(x, z, 1.1, 3.4) < 0.5
      && wetlandsFarmMask(x, z) < 0.75,
  });
  return createStandardDryGrassPatchLayer({
    id: 'wetlands-meadow-grass-patches',
    items,
    materialColor: '#d9e4b4',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 1,
    castShadow: false,
    widthScale: 1.04,
    heightScale: 1.06,
    depthScale: 1.02,
    maxVisibleDistance: 96,
    bladeTextureStrength: 0.24,
    motion: { wind: 0.9, bend: 0.2, bendRadius: 1.1 },
  });
}

// Crumbled stone wall along the farm plot's northeast side (the red-cloth
// discovery site) plus rootfall at the lagoon margin. Decorative props only:
// knee-high ruins, no collision.
function buildProps() {
  const wallZ = FARM_PLOT.z - FARM_PLOT.halfZ - 0.6;
  const wallRocks = [0, 1, 2, 3, 4, 5].map(index => ({
    id: `wetlands-farm-wall-${index}`,
    path: `${NATURE}Rock_Medium_${(index % 3) + 1}.glb`,
    position: [
      FARM_PLOT.x - FARM_PLOT.halfX + 1.4 + index * 2.45,
      -0.16 - (index % 2) * 0.08,
      wallZ + (index % 3 - 1) * 0.5,
    ],
    terrainY: true,
    rotation: [0, 0.35 + index * 0.72, (index % 2) * 0.08],
    scale: 0.34 + seededRandom(index, 3) * 0.14,
    loadTier: 1,
  }));
  const rootfall = [
    {
      id: 'wetlands-lagoon-rootfall-1',
      path: `${NATURE}runtime-driftwood.glb`,
      position: [-22.6, 0.04, 24.8],
      terrainY: true,
      rotation: [0, 1.15, 0],
      scale: 1.12,
      loadTier: 2,
    },
    {
      id: 'wetlands-lagoon-rootfall-2',
      path: `${NATURE}runtime-driftwood.glb`,
      position: [5.4, 0.04, 30.2],
      terrainY: true,
      rotation: [0, -0.6, 0],
      scale: 0.96,
      loadTier: 2,
    },
  ];
  return [...wallRocks, ...rootfall];
}

export function buildSouthernWetlandsEcology() {
  return {
    zoneId: S_WETLANDS,
    stream: true,
    streamSchedule: [650, 1700, 3300],
    flora: buildFlora(),
    dryGrassPatches: [buildGrass()],
    props: buildProps(),
    footprintBiomes: ['mud-trail', 'wet-mud', 'fern-bank', 'farm-clearing'],
    lagoonSurfaces: [
      {
        id: 'wetlands-heron-lagoon',
        zoneId: S_WETLANDS,
        position: [0, LAGOON_SURFACE_Y, 0],
        bounds: { minX: -38, maxX: 14, minZ: 18, maxZ: 48 },
        geometryResolution: [180, 96],
        // Swamp water: dark bed-driven color, algae-heavy overlay, reflection
        // as garnish only (each surface costs two scene re-renders, so this
        // region gets exactly one, at 256px).
        colorA: '#22332a',
        colorB: '#4a5a3c',
        mudColor: '#4a4232',
        algaeColor: '#5f7345',
        waterColor: '#465c4a',
        opacity: 0.11,
        reflectivity: 0.028,
        waterAlpha: 0.9,
        waterShoreAlpha: 0.26,
        shoreBrighten: 0.3,
        windRippleStrength: 0.42,
        flowSpeed: 0.001,
        flowScale: 2.6,
        flowDirection: [0.08, 0.05],
        shoreNoise: 0.04,
        maskThreshold: 0.3,
        rippleStrength: 0.5,
        distortionScale: 0.006,
        stepRippleStrength: 0.92,
        stepRippleDisplacement: 0.024,
        stepRippleEventScale: 1.3,
        walkRippleEventScale: 1.08,
        rippleEventScale: 1.16,
        splashRippleEventScale: 1.6,
        stepRippleMaxIntensity: 1.4,
        playerIdleRippleStrength: 0.55,
        overlayLift: 0.014,
        playerVeilLift: 0.034,
        playerVeilScale: [1.34, 0.9],
        textureWidth: 256,
        textureHeight: 256,
      },
    ],
    flyingModels: [
      flamingoFlyoverLayer('wetlands-flamingo-flyover', [
        { cx: -12, cz: 32, radiusX: 30, radiusZ: 12, height: 40, speed: 0.02, phase: 1.2, scale: 0.76, timeScale: 0.58 },
        { cx: 6, cz: 24, radiusX: 26, radiusZ: 10, height: 46, speed: -0.017, phase: 3.8, scale: 0.7, timeScale: 0.55 },
      ], { loadTier: 2 }),
    ],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 20, radiusZ: 10, height: 22, speed: -0.05, phase: 0.8, cx: -8, cz: 26, flapRate: 0.76 },
      { species: 'frigatebird', radiusX: 24, radiusZ: 13, height: 28, speed: 0.055, phase: 2.9, cx: 14, cz: -6, flapRate: 0.42 },
    ]),
  };
}
