import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import {
  COASTAL_SCRUBLAND,
  coastalScrubBasaltExposure,
  coastalScrubPathInfo,
  coastalScrubSaltExposure,
  coastalScrubSeepMask,
  coastalScrubThicketStrength,
} from '../regions/coastalScrubland/path';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { coastalBirds } from './flyingBirds';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';
const LAVA_CACTUS_CLEARINGS = [
  [-18, 8],
  [9, -14],
  [27, 17],
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function clearsTrailAndCactus(biome, x, z, clearance = 1.65) {
  const path = coastalScrubPathInfo(x, z);
  return path.distance > path.width * clearance
    && biome !== 'coastal-cinder-trail'
    && biome !== 'coastal-trail-shoulder'
    && LAVA_CACTUS_CLEARINGS.every(([cx, cz]) => Math.hypot(x - cx, z - cz) > 4.2);
}

function buildGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: COASTAL_SCRUBLAND,
    idPrefix: 'coastal-scrub-grass',
    count: 1080,
    seed: 17321,
    bounds: { minX: -50, maxX: 50, minZ: -47, maxZ: 47 },
    pathInfo: coastalScrubPathInfo,
    rejectBiomes: ['coastal-cinder-trail', 'coastal-trail-shoulder', 'coastal-basalt-shoulder'],
    pathClearance: 1.42,
    sparseBand: 1.52,
    baseChance: 0.1,
    pathDistanceWeight: 0.3,
    clumpWeight: 0.38,
    gapWeight: 0.28,
    maxGrade: 0.9,
    scale: [0.42, 0.94],
    windYaw: -0.35,
    attemptsPerItem: 170,
    densityAt: ({ x, z }) => coastalScrubSeepMask(x, z) * 0.18
      + coastalScrubThicketStrength(x, z) * 0.08
      - coastalScrubSaltExposure(x, z) * 0.12,
    accept: ({ x, z }) => coastalScrubBasaltExposure(x, z) < 0.76
      && hash2(x, z, 91) > coastalScrubSaltExposure(x, z) * 0.18,
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.48
      + tone * 0.2
      + coastalScrubSaltExposure(x, z) * 0.2
      + (path?.shoulder || 0) * 0.12
      - coastalScrubSeepMask(x, z) * 0.25,
    ),
  });

  return createStandardDryGrassPatchLayer({
    id: 'coastal-scrub-wind-grass-patches',
    items,
    materialColor: '#efe8c8',
    emissive: '#292a18',
    emissiveIntensity: 0.045,
    roughness: 1,
    widthScale: 1.08,
    heightScale: 0.88,
    depthScale: 1.12,
    maxVisibleDistance: 96,
    motion: { wind: 1.28, bend: 0.31, bendRadius: 1.08 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(
    COASTAL_SCRUBLAND,
    layer,
    count,
    seed,
    options,
  );
  const saltbush = varyScatterTransforms(scatter('coastal-scrub-saltbush', 112, 17363, {
    minX: -49, maxX: 49, minZ: -45, maxZ: 46, scale: [0.62, 1.2], maxGrade: 0.88,
    accept: (biome, x, z) => clearsTrailAndCactus(biome, x, z)
      && coastalScrubBasaltExposure(x, z) < 0.8
      && coastalScrubThicketStrength(x, z) > 0.22
      && hash2(x, z, 19) < 0.54 + coastalScrubThicketStrength(x, z) * 0.36,
  }), 17363, { width: [0.9, 1.14], height: [0.82, 1.06], depth: [0.92, 1.16], maxLean: 0.06 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#8c9561' : '#68754d' }));

  const croton = varyScatterTransforms(scatter('coastal-scrub-croton', 42, 17389, {
    minX: -46, maxX: 43, minZ: -43, maxZ: 44, scale: [0.48, 0.84], maxGrade: 0.82,
    accept: (biome, x, z) => clearsTrailAndCactus(biome, x, z)
      && coastalScrubThicketStrength(x, z) > 0.34
      && coastalScrubSaltExposure(x, z) < 0.68,
  }), 17389, { width: [0.9, 1.12], height: [0.86, 1.08], maxLean: 0.05 })
    .map(item => ({ ...item, tint: item.tone > 0.5 ? '#849356' : '#5f7043' }));

  const cotton = varyScatterTransforms(scatter('coastal-scrub-cotton', 22, 17417, {
    minX: -42, maxX: 42, minZ: -40, maxZ: 43, scale: [0.56, 0.92], maxGrade: 0.78,
    accept: (biome, x, z) => clearsTrailAndCactus(biome, x, z, 1.5)
      && coastalScrubSeepMask(x, z) > 0.3
      && coastalScrubBasaltExposure(x, z) < 0.68,
  }), 17417, { width: [0.9, 1.12], height: [0.9, 1.12], maxLean: 0.045 });

  return [
    { id: 'coastal-scrub-saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.055, tintStrength: 0.24, castShadow: false, motion: { wind: 1.3, bend: 0.34, bendRadius: 1.2 }, items: saltbush.filter((_, index) => index % 2 === 0) },
    { id: 'coastal-scrub-saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.055, tintStrength: 0.24, castShadow: false, motion: { wind: 1.3, bend: 0.34, bendRadius: 1.2 }, items: saltbush.filter((_, index) => index % 2 === 1) },
    { id: 'coastal-scrub-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.22, castShadow: false, motion: { wind: 1.18, bend: 0.3, bendRadius: 1.28 }, items: croton },
    { id: 'coastal-scrub-cotton', path: `${NATURE}runtime-galapagos-cotton.glb`, sink: 0.06, tint: '#778b57', tintStrength: 0.16, castShadow: false, motion: { wind: 1.02, bend: 0.22, bendRadius: 1.36 }, items: cotton },
  ];
}

function buildSurfaceLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: COASTAL_SCRUBLAND,
    id: 'coastal-scrub-volcanic-litter',
    itemIdPrefix: 'coastal-scrub-chip',
    count: 480,
    seed: 17471,
    bounds: { minX: -50, maxX: 50, minZ: -46, maxZ: 46 },
    scale: [0.48, 1.34],
    maxVisibleDistance: 52,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.78, colors: ['#514d43', '#383a35', '#292b28'] },
      { variant: 'oxidized-scoria-chip', weight: 0.22, colors: ['#94563d', '#764536'] },
    ],
    accept: (biome, x, z) => {
      const path = coastalScrubPathInfo(x, z);
      return path.tread < 0.18 && (
        coastalScrubBasaltExposure(x, z) > 0.52
        || coastalScrubSeepMask(x, z) > 0.3
        || path.shoulder > 0.28
      );
    },
  })];
}

export function buildCoastalScrublandEcology() {
  return {
    zoneId: COASTAL_SCRUBLAND,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora: buildFlora(),
    rocks: [],
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: [
      'coastal-cinder-trail',
      'coastal-trail-shoulder',
      'dry-seep-basin',
      'open-coastal-scrub',
      'salt-scoured-scrub',
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 34, radiusZ: 18, height: 30, speed: 0.054, phase: 0.8, cx: 18, cz: -18, flapRate: 0.36 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 28, radiusZ: 16, height: 25, speed: -0.061, phase: 3.2, cx: 25, cz: 20, flapRate: 0.72 },
    ]),
  };
}
