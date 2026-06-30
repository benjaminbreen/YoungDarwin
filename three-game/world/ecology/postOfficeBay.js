import { coveWaterMask, postOfficePathInfo } from '../regions/postOfficeBay/terrain';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
  standardDryGrassTint,
} from './standardGrass';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function postOfficeDryness({ x, z, biome, tone, path }) {
  const outerEdge = Math.max(Math.abs(x) / 54, Math.max(0, z - 12) / 34);
  return clamp01(
    0.26
    + tone * 0.18
    + (path?.shoulder || 0) * 0.18
    + Math.max(0, outerEdge - 0.42) * 0.5
    + (biome === 'dry-scrub' || biome === 'palo-santo' ? 0.12 : 0),
  );
}

const EDGE_GRASS_CLUSTERS = [
  { x: -49, z: 9, rx: 8.5, rz: 5.5, strength: 1.0 },
  { x: -41, z: 24, rx: 10, rz: 6.5, strength: 0.85 },
  { x: -18, z: 34, rx: 13, rz: 4.8, strength: 0.7 },
  { x: 25, z: 31, rx: 11, rz: 6, strength: 0.82 },
  { x: 37, z: 19, rx: 7.5, rz: 8, strength: 0.78 },
];

function edgeClusterStrength(x, z) {
  let strength = 0;
  for (const cluster of EDGE_GRASS_CLUSTERS) {
    const dx = (x - cluster.x) / cluster.rx;
    const dz = (z - cluster.z) / cluster.rz;
    strength = Math.max(strength, Math.exp(-(dx * dx + dz * dz) * 2.4) * cluster.strength);
  }
  return strength;
}

function acceptPostOfficeGrass({ x, z, path, biome }) {
  if (coveWaterMask(x, z) > 0.18) return false;
  if (biome === 'water') return false;
  if (path && path.distance < path.width * 2.4) return false;
  const farEdge = Math.abs(x) > 28 || z > 23;
  if (!farEdge) return false;
  return edgeClusterStrength(x, z) > 0.18;
}

export function buildPostOfficeBayDryGrassLayer() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: 'POST_OFFICE_BAY',
    idPrefix: 'post-office-bay-dry-grass',
    count: 120,
    seed: 6185,
    bounds: { minX: -58, maxX: 42, minZ: 4, maxZ: 36 },
    pathInfo: postOfficePathInfo,
    rejectBiomes: ['water'],
    pathCenterMax: 0,
    pathTreadMax: 0.02,
    maxGrade: 0.82,
    slopeStep: 0.85,
    scale: [0.42, 0.88],
    windYaw: -0.64,
    attemptsPerItem: 160,
    accept: acceptPostOfficeGrass,
    drynessAt: postOfficeDryness,
    tintAt: standardDryGrassTint,
  });
  return createStandardDryGrassPatchLayer({
    id: 'post-office-bay-path-dry-grass',
    items,
    materialColor: '#f1edc9',
    emissive: '#262714',
    emissiveIntensity: 0.06,
    roughness: 1,
    widthScale: 0.94,
    heightScale: 0.98,
    depthScale: 0.94,
    maxVisibleDistance: 92,
    motion: { wind: 1.0, bend: 0.22, bendRadius: 1.08 },
  });
}
