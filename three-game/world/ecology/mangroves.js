import { makeZoneScatter, nearAnyCluster, seededRandom } from '../scatter';
import { terrainHeight, terrainSlopeAt } from '../terrain';
import { generatedTreePresets } from '../generatedTreePresets';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import {
  MANGROVE_TRAIL,
  mangroveFernBenchMask,
  mangrovePoolMask,
  mangroveRootWallMask,
  mangroveTrailInfluence,
} from '../regions/mangroves/terrain';

const MANGROVES = 'MANGROVES';
const NATURE = '/assets/models/nature/';

const rootClusters = [
  [-30, -31], [-17, -26], [25, -22], [34, -8],
  [-28, 2], [22, 8], [-26, 27], [21, 33], [37, 27],
];
const fernClusters = [
  [-11, -26], [10, -24], [-14, -12], [14, -2], [-18, 12], [9, 17], [-8, 32],
];

function notOnTrail(x, z, margin = 4.6) {
  return mangroveTrailInfluence(x, z, 1.2, margin) < 0.32;
}

function trailEdge(biome, x, z) {
  const trail = mangroveTrailInfluence(x, z, 1.2, 8.5);
  return trail > 0.18 && trail < 0.72 && biome !== 'mud-trail';
}

function playableCorridor(x, z) {
  const trail = mangroveTrailInfluence(x, z, 1.15, 8.6);
  const fern = mangroveFernBenchMask(x, z);
  const pool = mangrovePoolMask(x, z);
  return trail > 0.13 || (fern > 0.33 && pool < 0.62);
}

function rootWallAccept(biome, x, z) {
  return mangroveRootWallMask(x, z) > 0.26
    && notOnTrail(x, z, 5.5)
    && nearAnyCluster(rootClusters, x, z, 18)
    && biome !== 'mud-trail';
}

function backgroundForestAccept(biome, x, z) {
  const edge = Math.max(Math.abs(x) / 50, Math.abs(z) / 46);
  return (edge > 0.56 || mangroveRootWallMask(x, z) > 0.48)
    && !playableCorridor(x, z)
    && notOnTrail(x, z, 9.5)
    && biome !== 'mud-trail'
    && biome !== 'brackish-pool';
}

function fernAccept(biome, x, z) {
  return mangroveFernBenchMask(x, z) > 0.24
    && !['mud-trail', 'brackish-pool'].includes(biome)
    && nearAnyCluster(fernClusters, x, z, 18);
}

function itemAt(id, x, z, scale, yaw = 0, extra = {}) {
  const y = terrainHeight(x, z, MANGROVES);
  const { grade } = terrainSlopeAt(x, z, MANGROVES);
  return { id, x, y, z, grade, scale, yaw, tone: seededRandom(Math.floor(x * 11 + z * 17), 5), ...extra };
}

function buildScalesiaHeroRing() {
  return [
    itemAt('scalesia-camera-screen-right-1', 16.4, 18.2, 0.044, -0.3),
    itemAt('scalesia-camera-screen-right-2', 22.8, 24.6, 0.041, 0.52),
    itemAt('scalesia-camera-screen-center', 18.6, 10.8, 0.038, -0.78),
    itemAt('scalesia-visible-south-left', -9.8, 13.6, 0.046, 0.7),
    itemAt('scalesia-visible-south-right', 10.6, 15.8, 0.044, -0.62),
    itemAt('scalesia-visible-north-left', -8.7, -11.8, 0.048, 0.2),
    itemAt('scalesia-visible-north-right', 9.4, -13.6, 0.045, -0.45),
    itemAt('scalesia-entry-left', -6.4, -7.8, 0.044, 0.3),
    itemAt('scalesia-entry-right', 8.5, -10.2, 0.04, -0.55),
    itemAt('scalesia-center-left', -13.2, -16.5, 0.052, 1.15),
    itemAt('scalesia-center-right', 14.4, -18.4, 0.048, -1.35),
    itemAt('scalesia-mid-left', -12.8, 4.2, 0.045, 0.9),
    itemAt('scalesia-mid-right', 11.2, 5.4, 0.043, -0.3),
  ];
}

function buildMangroveHeroRing() {
  return [
    itemAt('mangrove-camera-screen-right-1', 24.6, 16.8, 0.36, -0.25),
    itemAt('mangrove-camera-screen-right-2', 28.2, 25.4, 0.34, 0.6),
    itemAt('mangrove-visible-south-left', -16.2, 12.6, 0.44, 0.35),
    itemAt('mangrove-visible-south-right', 16.8, 14.8, 0.42, -0.58),
    itemAt('mangrove-root-left', -17.6, 18.5, 0.46, 0.65),
    itemAt('mangrove-root-right', 15.6, 23.8, 0.48, -0.85),
    itemAt('mangrove-wet-left', -20.8, -25.2, 0.42, 0.18),
    itemAt('mangrove-wet-right', 21.4, -6.4, 0.44, -0.72),
  ];
}

function buildGeneratedTrees() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(MANGROVES, layer, count, seed, opts);
  const visibleTunnel = [
    itemAt('generated-south-left', -11.6, 10.8, 0.86, 0.45),
    itemAt('generated-south-right', 12.4, 12.6, 0.82, -0.65),
    itemAt('generated-north-left', -11.2, -9.8, 0.84, 0.18),
    itemAt('generated-north-right', 12.8, -12.4, 0.8, -0.38),
    itemAt('generated-spawn-left', -13.4, 25.4, 0.9, 0.52),
    itemAt('generated-spawn-right', 10.4, 27.6, 0.86, -0.72),
  ];
  const forestWall = scatter('generated-forest-wall', 30, 613, {
    minX: -46, maxX: 46, minZ: -42, maxZ: 44, scale: [0.66, 1.12], maxGrade: 0.62,
    accept: (biome, x, z) => backgroundForestAccept(biome, x, z) || rootWallAccept(biome, x, z),
  });
  return [
    {
      id: 'generated-scalesia-tunnel',
      loadTier: 0,
      variants: generatedTreePresets.scalesia.variants,
      sink: 0.08,
      motion: { wind: 0.28, bend: 0.055, bendRadius: 3.0 },
      castShadow: false,
      items: visibleTunnel,
    },
    {
      id: 'generated-scalesia-wall',
      loadTier: 1,
      variants: generatedTreePresets.scalesia.variants,
      sink: 0.08,
      motion: { wind: 0.24, bend: 0.045, bendRadius: 3.2 },
      castShadow: false,
      items: forestWall,
    },
  ];
}

function buildCanopySilhouettes() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(MANGROVES, layer, count, seed, opts);
  const immediateScreen = [
    itemAt('canopy-screen-left', 8.8, 13.8, 1.85, 0.2),
    itemAt('canopy-screen-center-left', 14.2, 17.6, 1.7, -0.28),
    itemAt('canopy-screen-center', 19.4, 20.8, 1.92, 0.5),
    itemAt('canopy-screen-right', 24.8, 24.4, 1.62, -0.75),
    itemAt('canopy-screen-deep', 27.2, 12.6, 1.48, 0.92),
    itemAt('canopy-spawn-left-wall', -14.8, 20.2, 1.68, -0.2),
  ];
  const wall = scatter('canopy-wall', 34, 641, {
    minX: -48, maxX: 50, minZ: -43, maxZ: 45, scale: [1.05, 1.75], maxGrade: 0.66,
    accept: backgroundForestAccept,
  });
  return [
    {
      id: 'canopy-silhouette-immediate',
      loadTier: 0,
      items: immediateScreen,
    },
    {
      id: 'canopy-silhouette-wall',
      loadTier: 1,
      items: wall,
    },
  ];
}

function buildTrailRoots() {
  const props = [];
  for (let index = 1; index < MANGROVE_TRAIL.length - 1; index += 1) {
    const [x, z] = MANGROVE_TRAIL[index];
    props.push({
      id: `southern-rootfall-${index}`,
      path: `${NATURE}runtime-driftwood.glb`,
      position: [x + (index % 2 ? 2.6 : -2.9), 0.04, z + (index % 3 - 1) * 1.4],
      terrainY: true,
      rotation: [0, 0.45 + index * 0.58, 0],
      scale: 1.05 + index * 0.06,
      loadTier: index < 3 ? 0 : 1,
    });
  }
  return props;
}

function buildFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(MANGROVES, layer, count, seed, opts);

  const heroScalesia = buildScalesiaHeroRing();
  const heroMangroves = buildMangroveHeroRing();
  const backgroundScalesia = scatter('scalesia-cloud-forest-bg', 20, 511, {
    minX: -48, maxX: 48, minZ: -43, maxZ: 44, scale: [0.034, 0.052], maxGrade: 0.52,
    accept: (biome, x, z) => rootWallAccept(biome, x, z) || (mangroveRootWallMask(x, z) > 0.38 && notOnTrail(x, z, 7.2)),
  });
  const fullMangroves = scatter('mangrove-root-canopy', 9, 523, {
    minX: -38, maxX: 38, minZ: -34, maxZ: 38, scale: [0.34, 0.52], maxGrade: 0.48,
    accept: (biome, x, z) => rootWallAccept(biome, x, z) && !nearAnyCluster([[0, 0]], x, z, 9),
  });
  const backgroundMangroves = scatter('mangrove-background-wall', 42, 531, {
    minX: -52, maxX: 52, minZ: -46, maxZ: 46, scale: [0.85, 1.28], maxGrade: 0.64,
    accept: backgroundForestAccept,
  });
  const nearFerns = [
    itemAt('fern-camera-right-1', 6.8, 19.4, 3.2, 0.3),
    itemAt('fern-camera-right-2', 12.8, 21.2, 2.9, -0.46),
    itemAt('fern-camera-right-3', 16.2, 16.8, 2.75, 0.72),
    itemAt('fern-camera-center', 9.6, 15.6, 2.65, -0.28),
    itemAt('fern-spawn-left-1', -6.8, 17.4, 2.15, 0.2),
    itemAt('fern-spawn-left-2', -8.4, 23.6, 1.86, -0.34),
    itemAt('fern-spawn-right-1', 4.6, 18.8, 2.0, 0.82),
    itemAt('fern-spawn-right-2', 7.2, 25.6, 1.72, -0.72),
    itemAt('fern-spawn-front-left', -5.2, 31.2, 1.92, 0.46),
    itemAt('fern-spawn-front-right', 5.8, 33.4, 1.78, -0.58),
  ];
  const ferns = nearFerns.concat(scatter('galapagos-fern-bank', 66, 541, {
    minX: -38, maxX: 38, minZ: -39, maxZ: 41, scale: [0.86, 1.45], maxGrade: 0.6,
    accept: fernAccept,
  }));
  const bushes = scatter('galapagos-bush-clump', 30, 557, {
    minX: -42, maxX: 42, minZ: -38, maxZ: 42, scale: [0.01, 0.019], maxGrade: 0.64,
    accept: (biome, x, z) => (fernAccept(biome, x, z) || trailEdge(biome, x, z)) && mangrovePoolMask(x, z) < 0.58,
  });
  const nearCroton = [
    itemAt('croton-camera-right-1', 7.6, 18.2, 1.15, 0.28),
    itemAt('croton-camera-right-2', 13.8, 19.8, 1.04, -0.52),
    itemAt('croton-camera-right-3', 17.2, 23.2, 0.96, 0.72),
    itemAt('croton-spawn-left', -9.2, 20.6, 0.74, 0.4),
    itemAt('croton-spawn-right', 8.8, 22.4, 0.68, -0.55),
    itemAt('croton-spawn-front-left', -7.6, 29.8, 0.64, 0.7),
    itemAt('croton-spawn-front-right', 7.4, 31.2, 0.62, -0.48),
  ];
  const darwiniothamnus = scatter('darwiniothamnus-understory', 24, 569, {
    minX: -40, maxX: 40, minZ: -38, maxZ: 41, scale: [0.32, 0.58], maxGrade: 0.62,
    accept: (biome, x, z) => (fernAccept(biome, x, z) || trailEdge(biome, x, z))
      && mangrovePoolMask(x, z) < 0.44
      && !playableCorridor(x, z),
  });
  const croton = nearCroton.concat(scatter('croton-understory', 38, 577, {
    minX: -42, maxX: 42, minZ: -40, maxZ: 42, scale: [0.42, 0.82], maxGrade: 0.66,
    accept: (biome, x, z) => (biome === 'fern-bank' || biome === 'humid-leaf-litter' || biome === 'pool-edge')
      && notOnTrail(x, z, 4.7)
      && mangrovePoolMask(x, z) < 0.58
      && nearAnyCluster([...fernClusters, ...rootClusters], x, z, 17),
  }));
  const purpleShrubs = scatter('purple-shrub-understory', 16, 587, {
    minX: -39, maxX: 39, minZ: -36, maxZ: 40, scale: [0.78, 1.25], maxGrade: 0.6,
    accept: (biome, x, z) => trailEdge(biome, x, z)
      && mangrovePoolMask(x, z) < 0.36
      && seededRandom(Math.floor(x * 19 + z * 23), 7) > 0.42,
  });
  const morningGlory = scatter('morning-glory-vines', 22, 599, {
    minX: -43, maxX: 43, minZ: -40, maxZ: 42, scale: [0.45, 0.88], maxGrade: 0.7,
    accept: (biome, x, z) => rootWallAccept(biome, x, z) || (trailEdge(biome, x, z) && mangroveRootWallMask(x, z) > 0.22),
  });

  return [
    {
      id: 'scalesia-foreground-canopy',
      path: `${NATURE}runtime-scalesia-pedunculata.glb`,
      loadTier: 0,
      prefetch: true,
      sink: 0.02,
      tint: '#617b52',
      tintStrength: 0.12,
      motion: { wind: 0.28, bend: 0.035, bendRadius: 4.2 },
      castShadow: false,
      items: heroScalesia,
    },
    {
      id: 'mangrove-root-foreground',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      loadTier: 1,
      sink: 0.14,
      tint: '#58724f',
      tintStrength: 0.08,
      motion: { wind: 0.26, bend: 0.035, bendRadius: 3.6 },
      castShadow: false,
      items: heroMangroves,
    },
    {
      id: 'scalesia-background-canopy',
      path: `${NATURE}runtime-scalesia-pedunculata.glb`,
      loadTier: 2,
      sink: 0.02,
      tint: '#516b45',
      tintStrength: 0.18,
      motion: { wind: 0.24, bend: 0.03, bendRadius: 4.4 },
      castShadow: false,
      items: backgroundScalesia,
    },
    {
      id: 'mangrove-background-wall',
      path: `${NATURE}runtime-mangrove-lowpoly.glb`,
      loadTier: 3,
      sink: 0.1,
      tint: '#384f38',
      tintStrength: 0.34,
      motion: { wind: 0.2, bend: 0.025, bendRadius: 4.5 },
      castShadow: false,
      items: backgroundMangroves,
    },
    {
      id: 'mangrove-root-canopy',
      path: `${NATURE}runtime-mangrove-tree.glb`,
      loadTier: 2,
      sink: 0.14,
      tint: '#506b4a',
      tintStrength: 0.12,
      motion: { wind: 0.24, bend: 0.03, bendRadius: 3.8 },
      castShadow: false,
      items: fullMangroves,
    },
    {
      id: 'galapagos-fern',
      path: `${NATURE}runtime-galapagos-fern.glb`,
      loadTier: 1,
      sink: 0.03,
      tint: '#4f7a42',
      tintStrength: 0.22,
      motion: { wind: 1.05, bend: 0.34, bendRadius: 1.35 },
      castShadow: false,
      items: ferns,
    },
    {
      id: 'croton-understory',
      path: `${NATURE}runtime-croton.glb`,
      loadTier: 1,
      sink: 0.06,
      tint: '#5f7b4a',
      tintStrength: 0.3,
      motion: { wind: 1.18, bend: 0.34, bendRadius: 1.35 },
      castShadow: false,
      items: croton,
    },
    {
      id: 'darwiniothamnus-understory',
      path: `${NATURE}runtime-darwiniothamnus.glb`,
      loadTier: 2,
      sink: 0.05,
      tint: '#63864f',
      tintStrength: 0.22,
      motion: { wind: 0.95, bend: 0.22, bendRadius: 1.45 },
      castShadow: false,
      items: darwiniothamnus,
    },
    {
      id: 'purple-shrub-understory',
      path: `${NATURE}runtime-purple-shrub.glb`,
      loadTier: 2,
      sink: 0.04,
      tint: '#6b7b4c',
      tintStrength: 0.16,
      motion: { wind: 1.05, bend: 0.3, bendRadius: 1.3 },
      castShadow: false,
      items: purpleShrubs,
    },
    {
      id: 'morning-glory-vines',
      path: `${NATURE}runtime-morning-glory.glb`,
      loadTier: 3,
      sink: 0.06,
      tint: '#587747',
      tintStrength: 0.28,
      motion: { wind: 1.05, bend: 0.38, bendRadius: 1.35 },
      castShadow: false,
      items: morningGlory,
    },
    {
      id: 'galapagos-bushes',
      path: `${NATURE}runtime-galapagos-bushes.glb`,
      loadTier: 2,
      sink: 0.04,
      tint: '#536b41',
      tintStrength: 0.24,
      motion: { wind: 0.9, bend: 0.28, bendRadius: 1.5 },
      castShadow: false,
      items: bushes,
    },
  ];
}

export function buildMangroveEcology() {
  return {
    zoneId: MANGROVES,
    stream: true,
    streamSchedule: [650, 1700, 3300],
    canopySilhouettes: buildCanopySilhouettes(),
    flora: buildFlora(),
    generatedTrees: buildGeneratedTrees(),
    props: buildTrailRoots(),
    footprintBiomes: ['mud-trail', 'pool-edge', 'fern-bank'],
    flyingModels: [
      flamingoFlyoverLayer('mangroves-flamingo-overstory', [
        { cx: -18, cz: -20, radiusX: 34, radiusZ: 11, height: 42, speed: 0.02, phase: 0.9, scale: 0.78, timeScale: 0.58 },
        { cx: 18, cz: 8, radiusX: 30, radiusZ: 10, height: 46, speed: -0.018, phase: 3.0, scale: 0.72, timeScale: 0.56 },
      ], { loadTier: 2 }),
    ],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 18, radiusZ: 9, height: 20, speed: -0.048, phase: 1.4, cx: -5, cz: -18, flapRate: 0.74 },
      { species: 'frigatebird', radiusX: 22, radiusZ: 12, height: 25, speed: 0.058, phase: 3.6, cx: 16, cz: 11, flapRate: 0.44 },
      { species: 'gull', radiusX: 14, radiusZ: 8, height: 22, speed: 0.052, phase: 5.1, cx: -16, cz: 18, flapRate: 0.82 },
    ]),
  };
}
