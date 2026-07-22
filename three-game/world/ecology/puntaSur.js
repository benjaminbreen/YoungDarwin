import { getPuntaSurRocks } from '../puntaSurLayout';
import {
  PUNTA_SUR,
  puntaSurBasaltExposure,
  puntaSurCoastDistance,
  puntaSurCrownMask,
  puntaSurGullyMask,
  puntaSurPathInfo,
  puntaSurRedEarthMask,
  puntaSurRimMask,
  puntaSurRockRibMask,
  puntaSurShelterMask,
  puntaSurSprayExposure,
} from '../regions/puntaSur/path';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { coastalBirds } from './flyingBirds';
import {
  buildStandardDryPathGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function buildGrass() {
  return buildStandardDryPathGrassPatchItems({
    zoneId: PUNTA_SUR,
    idPrefix: 'punta-sur-wind-grass',
    count: 980,
    seed: 23501,
    bounds: { minX: -45, maxX: 45, minZ: -40, maxZ: 34 },
    pathInfo: puntaSurPathInfo,
    rejectBiomes: [
      'punta-sur-seabed',
      'rainbow-cape-trail',
      'cape-trail-shoulder',
      'spray-darkened-sea-cliff',
      'fractured-southern-rim',
      'rain-cut-basalt-gully',
    ],
    pathCenterMax: 0,
    pathTreadMax: 0,
    maxGrade: 0.88,
    scale: [0.42, 0.98],
    windYaw: -0.18,
    attemptsPerItem: 180,
    pathClearance: 1.68,
    sparseBand: 1.5,
    baseChance: 0.12,
    densityAt: ({ x, z }) => clamp01(
      0.08
      + puntaSurCrownMask(x, z) * 0.16
      + puntaSurShelterMask(x, z) * 0.25
      + puntaSurSprayExposure(x, z) * 0.08
      - puntaSurBasaltExposure(x, z) * 0.16
      - puntaSurRedEarthMask(x, z) * 0.32
      - puntaSurRockRibMask(x, z) * 0.24,
    ),
    accept: ({ x, z }) => puntaSurCoastDistance(x, z) > 11
      && puntaSurGullyMask(x, z) < 0.34
      && hash2(x, z, 59) > puntaSurRedEarthMask(x, z) * 0.7
      && hash2(x, z, 47) > puntaSurRimMask(x, z) * 0.62,
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.34 + tone * 0.16 + puntaSurSprayExposure(x, z) * 0.08
      + (path?.shoulder || 0) * 0.1 - puntaSurShelterMask(x, z) * 0.24,
    ),
    tintAt: (tone, dryness) => dryness > 0.58
      ? (tone > 0.5 ? '#9ca765' : '#77884f')
      : (tone > 0.5 ? '#74965e' : '#557b50'),
  }).map(item => {
    const exposure = puntaSurSprayExposure(item.x, item.z);
    return {
      ...item,
      widthScale: (item.widthScale || 1) * (1.04 + exposure * 0.18),
      heightScale: (item.heightScale || 1) * (0.92 - exposure * 0.2),
      depthScale: (item.depthScale || 1) * (1 + exposure * 0.12),
    };
  });
}

function buildFlora() {
  const items = makeDarwiniothamnusPatchScatter(PUNTA_SUR, 'punta-sur-darwiniothamnus', 66, 23543, {
    minX: -43, maxX: 43, minZ: -37, maxZ: 31, scale: [0.82, 2.5], maxGrade: 0.82,
    patchCount: 7, patchRadius: [3.2, 7.2],
    accept: (biome, x, z) => {
      const path = puntaSurPathInfo(x, z);
      return path.distance > path.width * 1.58
        && puntaSurCoastDistance(x, z) > 14
        && puntaSurGullyMask(x, z) < 0.3
        && puntaSurRimMask(x, z) < 0.18
        && puntaSurRedEarthMask(x, z) < 0.5
        && puntaSurRockRibMask(x, z) < 0.46
        && (biome === 'wind-combed-cape-grass' || biome === 'sheltered-southern-scrub' || biome === 'southern-promontory-scrub');
    },
  }, { width: [0.88, 1.16], height: [0.84, 1.12], maxLean: 0.06 });
  return [{
    id: 'punta-sur-darwiniothamnus',
    label: DARWINIOTHAMNUS_LABEL,
    path: DARWINIOTHAMNUS_PATH,
    variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
    sink: 0.05,
    tint: '#6f8a59',
    tintStrength: 0.14,
    castShadow: false,
    motion: { wind: 1.35, bend: 0.34, bendRadius: 1.52 },
    items,
  }];
}

function buildLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: PUNTA_SUR,
    id: 'punta-sur-cliff-litter',
    itemIdPrefix: 'punta-sur-chip',
    count: 540,
    seed: 23591,
    bounds: { minX: -45, maxX: 45, minZ: -39, maxZ: 35 },
    scale: [0.48, 1.42],
    maxVisibleDistance: 58,
    maxGrade: 1.12,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.52, colors: ['#46504a', '#2c3734', '#1f2928'] },
      { variant: 'oxidized-scoria-chip', weight: 0.4, colors: ['#a26443', '#89513a', '#674638'] },
      { variant: 'shell-shard-a', weight: 0.08, colors: ['#d0d2c2', '#adb8ad'] },
    ],
    accept: (biome, x, z) => {
      const path = puntaSurPathInfo(x, z);
      return puntaSurCoastDistance(x, z) > 6.4
        && path.tread < 0.18
        && (puntaSurRimMask(x, z) > 0.18
          || puntaSurRockRibMask(x, z) > 0.32
          || puntaSurBasaltExposure(x, z) > 0.56
          || puntaSurGullyMask(x, z) > 0.28
          || puntaSurRedEarthMask(x, z) > 0.56
          || path.shoulder > 0.26);
    },
    wetnessAt: (x, z) => puntaSurSprayExposure(x, z) * 0.72,
  })];
}

export function buildPuntaSurEcology() {
  return {
    zoneId: PUNTA_SUR,
    stream: false,
    dryGrassPatches: [createStandardDryGrassPatchLayer({
      id: 'punta-sur-wind-grass-patches',
      items: buildGrass(),
      materialColor: '#dfe8c7',
      emissive: '#1d2919',
      emissiveIntensity: 0.045,
      roughness: 1,
      widthScale: 1.12,
      heightScale: 0.86,
      depthScale: 1.12,
      maxVisibleDistance: 110,
      motion: { wind: 1.58, bend: 0.42, bendRadius: 1.08 },
    })],
    flora: buildFlora(),
    rocks: getPuntaSurRocks(),
    surfaceLitter: buildLitter(),
    cliffSurf: getCliffSurfProfile(PUNTA_SUR),
    props: [],
    footprintBiomes: ['rainbow-cape-trail', 'cape-trail-shoulder', 'rust-red-eroded-earth', 'wind-combed-cape-grass', 'sheltered-southern-scrub', 'southern-promontory-scrub'],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 36, radiusZ: 20, height: 35, speed: 0.06, phase: 0.4, cx: -8, cz: 18, flapRate: 0.3, scale: 1.1 },
      { species: 'booby', path: 'lazyFigureEight', radiusX: 31, radiusZ: 17, height: 27, speed: -0.075, phase: 2.3, cx: 16, cz: 23, flapRate: 0.56, scale: 1.02 },
      { species: 'frigatebird', radiusX: 28, radiusZ: 15, height: 43, speed: 0.048, phase: 4.7, cx: 4, cz: 8, flapRate: 0.24, scale: 0.96 },
      { species: 'booby', radiusX: 24, radiusZ: 14, height: 22, speed: 0.086, phase: 5.8, cx: -20, cz: 25, flapRate: 0.64, scale: 0.94 },
    ]),
  };
}
