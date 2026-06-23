import { seededRandom } from '../scatter';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt } from '../terrain';
import { hybridGrassPathInfo } from '../regions/grassHybridTest/path';

const GRASS_HYBRID_TEST = 'GRASS_HYBRID_TEST';
const NATURE = '/assets/models/nature/';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function grassTint(tone, dryness, pathShoulder) {
  const shade = clamp01(tone * 0.52 + dryness * 0.34 + pathShoulder * 0.14);
  if (dryness > 0.7) return shade > 0.58 ? '#d1c36f' : '#aa9954';
  if (dryness > 0.42) return shade > 0.55 ? '#b8b263' : '#8c9150';
  return shade > 0.48 ? '#879e54' : '#667f42';
}

function buildHybridDryGrassPatches(count = 2400) {
  const items = [];
  const bounds = { minX: -37, maxX: 37, minZ: -35, maxZ: 35 };
  let attempts = 0;

  while (items.length < count && attempts < count * 90) {
    attempts += 1;
    const i = attempts + 7141 * 1000;
    const x = bounds.minX + seededRandom(i, 3) * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + seededRandom(i, 9) * (bounds.maxZ - bounds.minZ);
    const y = terrainHeight(x, z, GRASS_HYBRID_TEST);
    const biome = terrainBiomeAt(x, z, y, GRASS_HYBRID_TEST);
    if (biome === 'red-dirt-path') continue;

    const path = hybridGrassPathInfo(x, z);
    if (path.center > 0.08 || path.tread > 0.18) continue;

    const { grade } = terrainSlopeAt(x, z, GRASS_HYBRID_TEST, 0.8);
    if (grade > 0.9) continue;

    const tone = seededRandom(i, 17);
    const clump = seededRandom(i, 23);
    const rise = Math.max(Math.abs(x) / 40, Math.abs(z) / 40);
    const dryness = clamp01(
      0.18
      + tone * 0.22
      + path.shoulder * 0.26
      + Math.max(0, rise - 0.55) * 0.52
      + (biome === 'dry-meadow-rise' ? 0.16 : 0),
    );
    const shoulderBoost = lerp(0.82, 1.2, path.shoulder);
    const scale = lerp(0.74, 1.38, seededRandom(i, 31))
      * lerp(0.92, 1.22, clump)
      * lerp(1.08, 0.9, dryness)
      * shoulderBoost;
    const windYaw = -0.72;
    const yaw = windYaw
      + (seededRandom(i, 37) - 0.5) * 1.15
      + (seededRandom(i, 41) > 0.88 ? (seededRandom(i, 43) - 0.5) * 1.6 : 0);

    items.push({
      id: `hybrid-test-dry-grass-patch-${items.length}`,
      x,
      y,
      z,
      grade,
      scale,
      yaw,
      tone,
      dryness,
      color: grassTint(tone, dryness, path.shoulder),
    });
  }

  return items;
}

export function buildGrassHybridTestEcology() {
  const dryGrassPatches = buildHybridDryGrassPatches();
  return {
    zoneId: GRASS_HYBRID_TEST,
    stream: false,
    dryGrassPatches: [
      {
        id: 'hybrid-test-dry-grass-patches',
        loadTier: 1,
        path: `${NATURE}runtime-animated-dry-grass.glb`,
        items: dryGrassPatches,
        color: '#a99d58',
        materialColor: '#ffffff',
        emissive: '#2f3117',
        emissiveIntensity: 0.1,
        roughness: 0.99,
        castShadow: false,
        receiveShadow: true,
        baseLift: 0.018,
        sink: 0.035,
        slopeSink: 0.2,
        widthScale: 1.2,
        heightScale: 1.18,
        depthScale: 1.12,
        maxVisibleDistance: 92,
        motion: { wind: 1.05, bend: 0.24, bendRadius: 1.2 },
      },
    ],
    footprintBiomes: ['hybrid-meadow', 'dark-underbrush', 'dry-meadow-rise', 'trampled-grass-edge'],
    flora: [],
    rocks: [],
    props: [],
    birds: [
      { radius: 21, height: 15, speed: 0.1, phase: 1.2, cx: -8, cz: -5 },
      { radius: 26, height: 18, speed: -0.07, phase: 3.9, cx: 13, cz: 6 },
    ],
  };
}
