import { seededRandom } from '../scatter';
import { terrainHeight, terrainSlopeAt } from '../terrain';
import { EL_MIRADOR, elMiradorPathInfo } from '../regions/elMirador/path';
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

function valueNoise(x, z, scale = 1, salt = 0) {
  const gx = x * scale;
  const gz = z * scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt) * (1 - ux) + hash2(ix + 1, iz, salt) * ux;
  const b = hash2(ix, iz + 1, salt) * (1 - ux) + hash2(ix + 1, iz + 1, salt) * ux;
  return a * (1 - uz) + b * uz;
}

function elMiradorDryness({ x, z, y, tone, path }) {
  const elevationBurn = clamp01((y - 4.2) / 4.4);
  const windLine = Math.sin(x * 0.07 - z * 0.11) * 0.08 + Math.sin(x * 0.17 + z * 0.04) * 0.04;
  return clamp01(0.32 + tone * 0.22 + elevationBurn * 0.24 + (path?.shoulder || 0) * 0.12 + windLine);
}

function elMiradorTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.78 + tone * 0.16 + pathShoulder * 0.08);
  if (warm > 0.74) return tone > 0.48 ? '#beb568' : '#97894d';
  if (warm > 0.48) return tone > 0.5 ? '#9ca85d' : '#728249';
  return tone > 0.55 ? '#789251' : '#5d7642';
}

function buildElMiradorGrass() {
  return buildStandardDryPathGrassPatchItems({
    zoneId: EL_MIRADOR,
    idPrefix: 'el-mirador-dry-grass',
    count: 2200,
    seed: 10417,
    bounds: { minX: -47, maxX: 47, minZ: -43, maxZ: 43 },
    pathInfo: elMiradorPathInfo,
    rejectBiomes: ['red-dirt-path', 'path-shoulder', 'mirador-cliff'],
    pathCenterMax: 0,
    pathTreadMax: 0,
    maxGrade: 1.16,
    slopeStep: 0.8,
    scale: [0.58, 1.28],
    windYaw: -0.62,
    attemptsPerItem: 180,
    pathClearance: 1.9,
    sparseBand: 1.55,
    baseChance: 0.18,
    densityAt: ({ y }) => clamp01((y - 3.8) / 4.8) * 0.18,
    drynessAt: elMiradorDryness,
    tintAt: elMiradorTint,
  });
}

function buildElMiradorRocks() {
  const rocks = [];
  let attempts = 0;
  while (rocks.length < 26 && attempts < 2200) {
    attempts += 1;
    const i = attempts + 11831;
    const x = -48 + seededRandom(i, 3) * 96;
    const z = -42 + seededRandom(i, 9) * 84;
    const path = elMiradorPathInfo(x, z);
    if (path.distance < path.width * 1.65) continue;
    const y = terrainHeight(x, z, EL_MIRADOR);
    const { grade } = terrainSlopeAt(x, z, EL_MIRADOR, 0.9);
    if (grade > 1.2) continue;
    const cliffSide = x > 24 || z > 18;
    const clump = valueNoise(x, z, 0.08, 89);
    if (!cliffSide && clump < 0.46) continue;
    const scale = 0.45 + seededRandom(i, 21) * (cliffSide ? 0.72 : 0.42);
    rocks.push({
      id: `el-mirador-rock-${rocks.length}`,
      x,
      y,
      z,
      radiusX: scale * (1.05 + seededRandom(i, 25) * 0.5),
      radiusY: scale * (0.36 + seededRandom(i, 27) * 0.32),
      radiusZ: scale * (0.82 + seededRandom(i, 29) * 0.55),
      yaw: seededRandom(i, 31) * Math.PI * 2,
      sink: scale * 0.22,
      color: seededRandom(i, 33) > 0.5 ? '#7d7158' : '#5f5647',
    });
  }
  return rocks;
}

function buildElMiradorLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: EL_MIRADOR,
    id: 'el-mirador-volcanic-litter',
    itemIdPrefix: 'el-mirador-chip',
    count: 460,
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
        || biome === 'mirador-cliff'
        || path.shoulder > 0.3
      );
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
        && (biome === 'dry-highland-grass' || biome === 'stony-highland-slope');
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
        id: 'el-mirador-dry-grass-patches',
        items: buildElMiradorGrass(),
        materialColor: '#f0edcf',
        emissive: '#282b16',
        emissiveIntensity: 0.055,
        roughness: 1,
        widthScale: 1.06,
        heightScale: 1.1,
        depthScale: 1.02,
        maxVisibleDistance: 108,
        motion: { wind: 1.12, bend: 0.22, bendRadius: 1.16 },
      }),
    ],
    rocks: buildElMiradorRocks(),
    surfaceLitter: buildElMiradorLitter(),
    flora: buildElMiradorFlora(),
    props: [],
    footprintBiomes: ['red-dirt-path', 'path-shoulder', 'dry-highland-grass', 'stony-highland-slope'],
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
