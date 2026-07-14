import { getPostScrubRiseRocks } from '../postScrubRiseLayout';
import { makeZoneScatter, seededRandom } from '../scatter';
import {
  POST_SCRUB_RISE,
  scrubRiseBasaltExposure,
  scrubRisePathInfo,
  scrubRiseThicketStrength,
  scrubRiseWashMask,
} from '../regions/postScrubRise/path';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function offPath(biome, x, z) {
  const path = scrubRisePathInfo(x, z);
  return path.distance > path.width * 1.72
    && biome !== 'scrub-rise-path'
    && biome !== 'scrub-rise-path-shoulder';
}

function grassDryness({ x, z, y, tone, path }) {
  const inland = clamp01((z + 48) / 96);
  const sheltered = scrubRiseThicketStrength(x, z);
  const washMoisture = scrubRiseWashMask(x, z);
  return clamp01(0.4 + tone * 0.2 + inland * 0.08 + (path?.shoulder || 0) * 0.12 - sheltered * 0.1 - washMoisture * 0.08 + Math.max(0, y - 7) * 0.025);
}

function grassTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.72 + tone * 0.16 + pathShoulder * 0.1);
  if (warm > 0.68) return tone > 0.52 ? '#bbb061' : '#95894d';
  if (warm > 0.46) return tone > 0.5 ? '#8f9b58' : '#6e7e49';
  return tone > 0.48 ? '#718a50' : '#526c3f';
}

function buildGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: POST_SCRUB_RISE,
    idPrefix: 'post-scrub-rise-grass',
    count: 1180,
    seed: 24113,
    bounds: { minX: -52, maxX: 52, minZ: -48, maxZ: 48 },
    pathInfo: scrubRisePathInfo,
    rejectBiomes: ['scrub-rise-path', 'scrub-rise-path-shoulder', 'basalt-scrub'],
    pathClearance: 1.3,
    sparseBand: 1.4,
    baseChance: 0.14,
    pathDistanceWeight: 0.38,
    clumpWeight: 0.34,
    gapWeight: 0.2,
    maxGrade: 1.04,
    slopeStep: 0.82,
    scale: [0.42, 1.02],
    windYaw: -0.66,
    attemptsPerItem: 170,
    densityAt: ({ x, z }) => {
      const thicket = scrubRiseThicketStrength(x, z);
      const wash = scrubRiseWashMask(x, z);
      const openPocket = thicket > 0.16 && thicket < 0.56 ? 0.18 : 0;
      return openPocket + wash * 0.08;
    },
    accept: ({ x, z }) => scrubRiseBasaltExposure(x, z) < 0.78
      && (scrubRiseThicketStrength(x, z) < 0.72 || hash2(x, z, 31) < 0.28),
    drynessAt: grassDryness,
    tintAt: grassTint,
  });
  return createStandardDryGrassPatchLayer({
    id: 'post-scrub-rise-olive-grass-patches',
    items,
    materialColor: '#efedcf',
    emissive: '#242916',
    emissiveIntensity: 0.045,
    roughness: 1,
    widthScale: 0.96,
    heightScale: 1.03,
    depthScale: 0.98,
    maxVisibleDistance: 94,
    motion: { wind: 1.04, bend: 0.22, bendRadius: 1.12 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(POST_SCRUB_RISE, layer, count, seed, options);
  const acceptThicket = (minimum, salt = 0) => (biome, x, z) => offPath(biome, x, z)
    && scrubRiseThicketStrength(x, z) > minimum
    && hash2(x, z, salt) < 0.58 + scrubRiseThicketStrength(x, z) * 0.36;

  const saltbush = scatter('scrub-rise-saltbush', 96, 359, {
    minX: -52, maxX: 52, minZ: -47, maxZ: 48, scale: [0.78, 1.38], maxGrade: 0.92,
    accept: acceptThicket(0.24, 29),
  }).map(item => ({ ...item, tint: item.tone > 0.5 ? '#89925d' : '#66724b' }));
  const croton = scatter('scrub-rise-croton', 58, 383, {
    minX: -50, maxX: 50, minZ: -45, maxZ: 47, scale: [0.52, 0.92], maxGrade: 0.9,
    accept: acceptThicket(0.32, 41),
  }).map(item => ({ ...item, tint: item.tone > 0.52 ? '#839252' : '#5f713f' }));
  const paloSanto = scatter('scrub-rise-palo-santo', 26, 401, {
    minX: -48, maxX: 48, minZ: -43, maxZ: 48, scale: [0.44, 0.74], maxGrade: 0.78,
    accept: (biome, x, z) => offPath(biome, x, z)
      && scrubRiseThicketStrength(x, z) > 0.36
      && scrubRiseBasaltExposure(x, z) < 0.78,
  }).map(item => ({ ...item, tint: item.tone > 0.5 ? '#777b54' : '#5a6044' }));
  const cactus = scatter('scrub-rise-candelabra', 6, 431, {
    minX: -46, maxX: 48, minZ: -34, maxZ: 46, scale: [2.5, 3.65], maxGrade: 0.52,
    accept: (biome, x, z) => offPath(biome, x, z)
      && scrubRiseBasaltExposure(x, z) > 0.48
      && scrubRiseThicketStrength(x, z) < 0.7,
  }).map(item => ({ ...item, tint: '#6f8950' }));

  return [
    { id: 'scrub-rise-saltbush-1', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: saltbush.filter((_, index) => index % 2 === 0) },
    { id: 'scrub-rise-saltbush-2', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.05, tintStrength: 0.24, castShadow: false, motion: { wind: 1.08, bend: 0.25, bendRadius: 1.3 }, items: saltbush.filter((_, index) => index % 2 === 1) },
    { id: 'scrub-rise-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.22, castShadow: false, motion: { wind: 1.1, bend: 0.26, bendRadius: 1.3 }, items: croton },
    { id: 'scrub-rise-palo-santo', path: `${NATURE}runtime-palo-santo.glb`, sink: 0.06, tintStrength: 0.22, castShadow: true, motion: { wind: 0.54, bend: 0.1, bendRadius: 1.5 }, items: paloSanto },
    { id: 'scrub-rise-candelabra-cactus', path: `${NATURE}runtime-candelabra-cactus.glb`, sink: 0.04, tintStrength: 0.1, castShadow: true, motion: { wind: 0.24, bend: 0.04, bendRadius: 1.45 }, items: cactus },
  ];
}

function buildSurfaceLitter() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(POST_SCRUB_RISE, layer, count, seed, options);
  const chips = scatter('scrub-rise-basalt-chip', 180, 467, {
    minX: -50, maxX: 50, minZ: -46, maxZ: 47, scale: [0.16, 0.5], maxGrade: 1.1,
    accept: (biome, x, z) => scrubRiseWashMask(x, z) > 0.22
      || scrubRiseBasaltExposure(x, z) > 0.56
      || scrubRisePathInfo(x, z).shoulder > 0.28,
  }).map((item, index) => {
    const i = index + 46700;
    return {
      ...item,
      id: `scrub-rise-chip-${index}`,
      variant: 'basalt-pebble',
      color: seededRandom(i, 5) > 0.62 ? '#514b40' : seededRandom(i, 7) > 0.38 ? '#373732' : '#262824',
      wetness: 0,
      scale: item.scale * (0.64 + seededRandom(i, 11) * 0.5),
      stretchX: 0.66 + seededRandom(i, 13) * 0.82,
      stretchZ: 0.62 + seededRandom(i, 17) * 0.76,
      heightScale: 0.56 + seededRandom(i, 19) * 0.48,
      lift: 0.008,
      pitch: (seededRandom(i, 23) - 0.5) * 0.24,
      roll: (seededRandom(i, 29) - 0.5) * 0.24,
    };
  });
  return [{ id: 'scrub-rise-basalt-litter', maxVisibleDistance: 48, items: chips }];
}

export function buildPostScrubRiseEcology() {
  return {
    zoneId: POST_SCRUB_RISE,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora: buildFlora(),
    rocks: getPostScrubRiseRocks(),
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: ['scrub-rise-path', 'scrub-rise-path-shoulder', 'dry-wash', 'open-dry-grass'],
    birds: [
      { radius: 18, height: 14, speed: 0.105, phase: 0.7, cx: -12, cz: -8 },
      { radius: 14, height: 11, speed: -0.12, phase: 3.4, cx: 21, cz: 24 },
    ],
  };
}
