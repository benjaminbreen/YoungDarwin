import { seededRandom } from '../scatter';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt } from '../terrain';

export const STANDARD_DRY_GRASS_ASSET = '/assets/models/nature/runtime-animated-dry-grass.glb';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  const a = lerp(hash2(ix, iz, salt), hash2(ix + 1, iz, salt), ux);
  const b = lerp(hash2(ix, iz + 1, salt), hash2(ix + 1, iz + 1, salt), ux);
  return lerp(a, b, uz);
}

export function standardDryGrassTint(tone, dryness, pathShoulder = 0) {
  const shade = clamp01(tone * 0.52 + dryness * 0.34 + pathShoulder * 0.14);
  if (dryness > 0.7) return shade > 0.58 ? '#d1c36f' : '#aa9954';
  if (dryness > 0.42) return shade > 0.55 ? '#b8b263' : '#8c9150';
  return shade > 0.48 ? '#879e54' : '#667f42';
}

function defaultDryness({ x, z, biome, tone, path }) {
  const rise = Math.max(Math.abs(x) / 40, Math.abs(z) / 40);
  return clamp01(
    0.18
    + tone * 0.22
    + (path?.shoulder || 0) * 0.26
    + Math.max(0, rise - 0.55) * 0.52
    + (biome === 'dry-meadow-rise' ? 0.16 : 0),
  );
}

export function buildStandardDryGrassPatchItems({
  zoneId,
  idPrefix = 'standard-dry-grass-patch',
  count = 2400,
  seed = 7141,
  bounds = { minX: -37, maxX: 37, minZ: -35, maxZ: 35 },
  pathInfo = null,
  rejectBiomes = ['red-dirt-path'],
  pathCenterMax = 0.08,
  pathTreadMax = 0.18,
  maxGrade = 0.9,
  slopeStep = 0.8,
  scale = [0.74, 1.38],
  windYaw = -0.72,
  attemptsPerItem = 90,
  accept = null,
  drynessAt = defaultDryness,
  tintAt = standardDryGrassTint,
} = {}) {
  if (!zoneId) throw new Error('buildStandardDryGrassPatchItems requires a zoneId.');

  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * attemptsPerItem) {
    attempts += 1;
    const i = attempts + seed * 1000;
    const x = bounds.minX + seededRandom(i, 3) * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + seededRandom(i, 9) * (bounds.maxZ - bounds.minZ);
    const y = terrainHeight(x, z, zoneId);
    const biome = terrainBiomeAt(x, z, y, zoneId);
    if (rejectBiomes.includes(biome)) continue;

    const path = pathInfo ? pathInfo(x, z) : { center: 0, tread: 0, shoulder: 0 };
    if (pathInfo && pathCenterMax != null && path.center > pathCenterMax) continue;
    if (pathInfo && pathTreadMax != null && path.tread > pathTreadMax) continue;

    const { grade } = terrainSlopeAt(x, z, zoneId, slopeStep);
    if (grade > maxGrade) continue;
    if (accept && !accept({ x, z, y, biome, grade, path })) continue;

    const tone = seededRandom(i, 17);
    const clump = seededRandom(i, 23);
    const dryness = clamp01(drynessAt({ x, z, y, biome, grade, path, tone }));
    const shoulderBoost = lerp(0.82, 1.2, path.shoulder || 0);
    const itemScale = lerp(scale[0], scale[1], seededRandom(i, 31))
      * lerp(0.92, 1.22, clump)
      * lerp(1.08, 0.9, dryness)
      * shoulderBoost;
    const yaw = windYaw
      + (seededRandom(i, 37) - 0.5) * 1.15
      + (seededRandom(i, 41) > 0.88 ? (seededRandom(i, 43) - 0.5) * 1.6 : 0);

    items.push({
      id: `${idPrefix}-${items.length}`,
      x,
      y,
      z,
      grade,
      scale: itemScale,
      yaw,
      tone,
      dryness,
      color: tintAt(tone, dryness, path.shoulder || 0),
    });
  }

  return items;
}

export function buildStandardDryPathGrassPatchItems({
  rejectBiomes = ['red-dirt-path', 'path-shoulder'],
  pathClearance = 1.9,
  sparseBand = 1.55,
  baseChance = 0.18,
  pathDistanceWeight = 0.5,
  clumpWeight = 0.26,
  gapWeight = 0.2,
  clumpScale = 0.05,
  gapScale = 0.12,
  clumpOffset = [11, -3],
  gapOffset = [-7, 19],
  hashSalt = 103,
  densityAt = null,
  accept = null,
  ...options
} = {}) {
  const callerAccept = accept;
  return buildStandardDryGrassPatchItems({
    ...options,
    rejectBiomes,
    pathCenterMax: options.pathCenterMax ?? 0,
    pathTreadMax: options.pathTreadMax ?? 0,
    accept: context => {
      const { x, z, path } = context;
      if (!path || path.distance < path.width * pathClearance) return false;
      const farFromPath = clamp01(
        (path.distance - path.width * pathClearance)
        / Math.max(0.001, path.width * sparseBand),
      );
      const clump = valueNoise(x + clumpOffset[0], z + clumpOffset[1], clumpScale, hashSalt + 41);
      const gap = valueNoise(x + gapOffset[0], z + gapOffset[1], gapScale, hashSalt + 67);
      const density = densityAt ? densityAt(context) : 0;
      const keepChance = baseChance
        + farFromPath * pathDistanceWeight
        + clump * clumpWeight
        + density
        - gap * gapWeight;
      if (hash2(x, z, hashSalt) >= clamp01(keepChance)) return false;
      return callerAccept ? callerAccept(context) : true;
    },
  });
}

export function createStandardDryGrassPatchLayer({
  id = 'standard-dry-grass-patches',
  items = [],
  ...overrides
} = {}) {
  return {
    id,
    loadTier: 1,
    path: STANDARD_DRY_GRASS_ASSET,
    items,
    color: '#a99d58',
    materialColor: '#ffffff',
    emissive: '#2f3117',
    emissiveIntensity: 0.07,
    roughness: 0.99,
    castShadow: true,
    receiveShadow: true,
    baseLift: 0.018,
    sink: 0.035,
    slopeSink: 0.2,
    widthScale: 1.2,
    heightScale: 1.18,
    depthScale: 1.12,
    maxVisibleDistance: 92,
    motion: { wind: 1.05, bend: 0.24, bendRadius: 1.2 },
    ...overrides,
  };
}
