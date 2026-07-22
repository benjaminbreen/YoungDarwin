import {
  EL_MIRADOR,
  elMiradorBasaltExposure,
  elMiradorCoastDistance,
  elMiradorGullyMask,
  elMiradorPathInfo,
  elMiradorRimMask,
  elMiradorShelterMask,
  elMiradorSummitMask,
  elMiradorWindExposure,
} from '../regions/elMirador/path';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { buildStandardDryPathGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';
import { coastalBirds, flamingoFlyoverLayer } from './flyingBirds';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
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

function elMiradorDryness({ x, z, y, tone, path }) {
  const elevationBurn = clamp01((y - 4.2) / 4.4);
  const windLine = Math.sin(x * 0.07 - z * 0.11) * 0.08 + Math.sin(x * 0.17 + z * 0.04) * 0.04;
  return clamp01(
    0.28
    + tone * 0.18
    + elevationBurn * 0.18
    + elMiradorWindExposure(x, z) * 0.28
    + (path?.shoulder || 0) * 0.1
    + windLine
    - elMiradorShelterMask(x, z) * 0.2,
  );
}

function elMiradorTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.78 + tone * 0.16 + pathShoulder * 0.08);
  if (warm > 0.74) return tone > 0.48 ? '#beb568' : '#97894d';
  if (warm > 0.48) return tone > 0.5 ? '#9ca85d' : '#728249';
  return tone > 0.55 ? '#789251' : '#5d7642';
}

function buildElMiradorGrass() {
  const items = buildStandardDryPathGrassPatchItems({
    zoneId: EL_MIRADOR,
    idPrefix: 'el-mirador-wind-grass',
    count: 1480,
    seed: 10417,
    bounds: { minX: -47, maxX: 47, minZ: -43, maxZ: 43 },
    pathInfo: elMiradorPathInfo,
    rejectBiomes: [
      'open-water-bed',
      'red-dirt-path',
      'path-shoulder',
      'mirador-basalt-cliff',
      'wind-scoured-overlook-rim',
      'eroded-highland-gully',
    ],
    pathCenterMax: 0,
    pathTreadMax: 0,
    maxGrade: 0.9,
    slopeStep: 0.8,
    scale: [0.46, 1.04],
    windYaw: -0.62,
    attemptsPerItem: 180,
    pathClearance: 1.7,
    sparseBand: 1.55,
    baseChance: 0.12,
    densityAt: ({ x, z, y }) => clamp01(
      0.04
      + elMiradorShelterMask(x, z) * 0.26
      + elMiradorSummitMask(x, z) * 0.12
      + clamp01((y - 4.2) / 5.2) * 0.1
      - elMiradorBasaltExposure(x, z) * 0.16,
    ),
    accept: ({ x, z }) => elMiradorCoastDistance(x, z) > 12
      && elMiradorGullyMask(x, z) < 0.38
      && hash2(x, z, 41) > elMiradorRimMask(x, z) * 0.62,
    drynessAt: elMiradorDryness,
    tintAt: elMiradorTint,
  });
  return items.map(item => {
    const exposure = elMiradorWindExposure(item.x, item.z);
    const shelter = elMiradorShelterMask(item.x, item.z);
    return {
      ...item,
      widthScale: (item.widthScale || 1) * (1.02 + exposure * 0.18),
      heightScale: (item.heightScale || 1) * (0.9 - exposure * 0.2 + shelter * 0.12),
      depthScale: (item.depthScale || 1) * (1 + exposure * 0.1),
    };
  });
}

function buildElMiradorLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: EL_MIRADOR,
    id: 'el-mirador-volcanic-litter',
    itemIdPrefix: 'el-mirador-chip',
    count: 540,
    seed: 11921,
    bounds: { minX: -47, maxX: 47, minZ: -42, maxZ: 42 },
    scale: [0.48, 1.35],
    maxVisibleDistance: 48,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.72, colors: ['#554f43', '#3b3b35', '#292b27'] },
      { variant: 'oxidized-scoria-chip', weight: 0.28, colors: ['#a65d3e', '#824733'] },
    ],
    accept: (biome, x, z) => {
      const path = elMiradorPathInfo(x, z);
      return path.tread < 0.18 && (
          biome === 'stony-highland-slope'
          || biome === 'mirador-basalt-cliff'
          || biome === 'wind-scoured-overlook-rim'
          || biome === 'eroded-highland-gully'
          || path.shoulder > 0.3
        )
        && elMiradorCoastDistance(x, z) > 6.8;
    },
  })];
}

function buildElMiradorFlora() {
  const darwiniothamnus = makeDarwiniothamnusPatchScatter(EL_MIRADOR, 'el-mirador-darwiniothamnus', 63, 11963, {
    minX: -45, maxX: 45, minZ: -39, maxZ: 41, scale: [0.8, 2.45], maxGrade: 0.9,
    patchCount: 7, patchRadius: [3.2, 6.8],
    accept: (biome, x, z, y) => {
      const path = elMiradorPathInfo(x, z);
      return y > 4.1
        && path.distance > path.width * 1.55
        && elMiradorRimMask(x, z) < 0.22
        && elMiradorGullyMask(x, z) < 0.42
        && (
          biome === 'dry-highland-grass'
          || biome === 'sheltered-highland-grass'
          || biome === 'stony-highland-slope'
        );
    },
  }, { width: [0.88, 1.15], height: [0.88, 1.12], maxLean: 0.045 });
  return [{
    id: 'el-mirador-darwiniothamnus',
    label: DARWINIOTHAMNUS_LABEL,
    path: DARWINIOTHAMNUS_PATH,
    variantMode: DARWINIOTHAMNUS_VARIANT_MODE,
    sink: 0.05,
    tint: '#83945b',
    tintStrength: 0.14,
    motion: { wind: 1.02, bend: 0.28, bendRadius: 1.65 },
    castShadow: false,
    items: darwiniothamnus,
  }];
}

export function buildElMiradorEcology() {
  return {
    zoneId: EL_MIRADOR,
    stream: false,
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'el-mirador-wind-grass-patches',
        items: buildElMiradorGrass(),
        materialColor: '#f0edcf',
        emissive: '#282b16',
        emissiveIntensity: 0.055,
        roughness: 1,
        widthScale: 1.1,
        heightScale: 0.92,
        depthScale: 1.08,
        maxVisibleDistance: 108,
        motion: { wind: 1.38, bend: 0.34, bendRadius: 1.12 },
      }),
    ],
    // Cliff-scale relief belongs to the shared movement heightfield. Avoid a
    // separate visual rock field whose silhouettes would lack collision.
    rocks: [],
    surfaceLitter: buildElMiradorLitter(),
    cliffSurf: getCliffSurfProfile(EL_MIRADOR),
    flora: buildElMiradorFlora(),
    props: [],
    footprintBiomes: [
      'red-dirt-path',
      'path-shoulder',
      'dry-highland-grass',
      'sheltered-highland-grass',
      'mirador-summit-grass',
      'stony-highland-slope',
    ],
    flyingModels: [
      flamingoFlyoverLayer('el-mirador-distant-flamingos', [
        { cx: -22, cz: -26, radiusX: 46, radiusZ: 14, height: 50, speed: 0.017, phase: 1.6, scale: 0.66, timeScale: 0.54 },
        { cx: 20, cz: -22, radiusX: 42, radiusZ: 13, height: 55, speed: -0.015, phase: 4.1, scale: 0.62, timeScale: 0.52 },
      ]),
    ],
    birds: coastalBirds([
      { species: 'frigatebird', radiusX: 30, radiusZ: 18, height: 31, speed: 0.062, phase: 0.6, cx: -10, cz: -12, flapRate: 0.38 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 34, radiusZ: 20, height: 34, speed: -0.052, phase: 3.1, cx: 18, cz: 20, flapRate: 0.74 },
    ]),
  };
}
