import { grassTestPathInfo } from '../regions/grassTest/path';
import { buildStandardDryGrassPatchItems, createStandardDryGrassPatchLayer } from './standardGrass';

const GRASS_TEST = 'GRASS_TEST';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, z, salt = 0) {
  return fract(Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123);
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

function coastalDryness({ x, z, tone, path }) {
  const rise = Math.max(Math.abs(x) / 38, Math.abs(z) / 38);
  const windBurn = Math.sin(x * 0.08 - z * 0.05) * 0.08 + Math.sin(x * 0.035 + z * 0.09) * 0.07;
  return clamp01(
    0.26
    + tone * 0.2
    + (path?.shoulder || 0) * 0.16
    + Math.max(0, rise - 0.48) * 0.32
    + windBurn,
  );
}

function coastalTint(tone, dryness, pathShoulder = 0) {
  const warm = clamp01(dryness * 0.7 + tone * 0.16 + pathShoulder * 0.1);
  if (warm > 0.72) return tone > 0.44 ? '#b7aa5e' : '#8b7e47';
  if (warm > 0.48) return tone > 0.5 ? '#9da75b' : '#718148';
  return tone > 0.52 ? '#78914e' : '#5b7440';
}

function acceptTallCoastalGrass({ x, z, path }) {
  if (!path) return true;
  const clearDistance = path.width * 1.82;
  const sparseDistance = path.width * 2.65;
  if (path.distance < clearDistance) return false;
  const shoulderFade = clamp01((path.distance - clearDistance) / Math.max(0.001, sparseDistance - clearDistance));
  const broadClump = valueNoise(x + 19, z - 7, 0.055, 83);
  const fineGap = valueNoise(x - 5, z + 13, 0.13, 127);
  const keepChance = 0.32 + shoulderFade * 0.5 + broadClump * 0.24 - fineGap * 0.16;
  return hash2(x, z, 211) < clamp01(keepChance);
}

function buildCoastalGrassItems(count = 1550) {
  return buildStandardDryGrassPatchItems({
    zoneId: GRASS_TEST,
    idPrefix: 'grass-test-coastal-grass',
    count,
    seed: 8207,
    bounds: { minX: -36.8, maxX: 36.8, minZ: -36.8, maxZ: 36.8 },
    pathInfo: grassTestPathInfo,
    rejectBiomes: ['dirt-path', 'path-shoulder'],
    pathCenterMax: 0,
    pathTreadMax: 0.02,
    maxGrade: 0.86,
    slopeStep: 0.78,
    scale: [0.62, 1.18],
    windYaw: -0.68,
    attemptsPerItem: 180,
    accept: acceptTallCoastalGrass,
    drynessAt: coastalDryness,
    tintAt: coastalTint,
  });
}

export function buildGrassTestEcology() {
  const coastalGrassItems = buildCoastalGrassItems();
  return {
    zoneId: GRASS_TEST,
    stream: false,
    dryGrassPatches: [
      createStandardDryGrassPatchLayer({
        id: 'grass-test-coastal-dry-grass',
        items: coastalGrassItems,
        materialColor: '#f3efce',
        emissive: '#292b16',
        emissiveIntensity: 0.06,
        roughness: 1,
        widthScale: 1.08,
        heightScale: 1.14,
        depthScale: 1.04,
        maxVisibleDistance: 104,
        motion: { wind: 1.08, bend: 0.23, bendRadius: 1.18 },
      }),
    ],
    footprintBiomes: ['grass-meadow', 'lush-hollow', 'meadow-rise', 'path-shoulder'],
    flora: [],
    rocks: [],
    props: [],
    birds: [
      { radius: 17, height: 13, speed: 0.12, phase: 0.8, cx: -6, cz: -4 },
      { radius: 23, height: 18, speed: -0.075, phase: 3.4, cx: 12, cz: 8 },
    ],
  };
}
