import { makeZoneScatter, seededRandom } from '../scatter';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, WATER_LEVEL } from '../terrain';
import { cormorantLagoonField, cormorantTrailDistance } from '../regions/cormorantBayTest3/terrain';
import {
  cormorantTest3DirectionAt,
  cormorantTest3DrynessAt,
  cormorantTest3GrassDensityAt,
} from '../regions/cormorantBayTest3/meadow';

const ZONE = 'CORMORANT_BAY_TEST_3';
const NATURE = '/assets/models/nature/';
const LAGOON_SURFACE_Y = WATER_LEVEL + 0.035;

function dryGround(biome) {
  return ['green-beach', 'salt-scrub', 'tuff-rim', 'olivine-trail'].includes(biome);
}

function lagoonEdge(biome, x, z) {
  const lagoon = cormorantLagoonField(x, z);
  return lagoon > 1.0 && lagoon < 1.55 && biome !== 'brackish-lagoon' && biome !== 'deep-lagoon';
}

function notTrail(x, z, margin = 4.4) {
  return cormorantTrailDistance(x, z) > margin;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dryGrassColor(density, dryness, tone) {
  const shade = clamp01(tone * 0.62 + density * 0.22 + (1 - dryness) * 0.16);
  if (dryness > 0.72) return shade > 0.62 ? '#c2b465' : '#aa9853';
  if (dryness > 0.46) return shade > 0.54 ? '#a9a65f' : '#8d8d4e';
  return shade > 0.5 ? '#879a55' : '#687d43';
}

function buildDryGrassPatches(count = 560) {
  const items = [];
  const bounds = { minX: -46, maxX: 46, minZ: 2, maxZ: 42 };
  let attempts = 0;
  while (items.length < count && attempts < count * 95) {
    attempts += 1;
    const i = attempts + 9831 * 1000;
    const x = bounds.minX + seededRandom(i, 3) * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + seededRandom(i, 9) * (bounds.maxZ - bounds.minZ);
    const y = terrainHeight(x, z, ZONE);
    const biome = terrainBiomeAt(x, z, y, ZONE);
    if (!dryGround(biome)) continue;
    if (!notTrail(x, z, 4.9)) continue;
    if (cormorantLagoonField(x, z) < 1.12) continue;
    const { grade } = terrainSlopeAt(x, z, ZONE, 0.75);
    if (grade > 0.82) continue;

    const tone = seededRandom(i, 17);
    const density = cormorantTest3GrassDensityAt({ x, z, y, biome, grade, tone });
    if (density < 0.22) continue;
    if (seededRandom(i, 21) > clamp01(density * 0.98 + 0.08)) continue;

    const dryness = cormorantTest3DrynessAt({ x, z, y, biome, grade, tone });
    const direction = cormorantTest3DirectionAt(x, z);
    const directionJitter = (seededRandom(i, 29) - 0.5) * lerp(0.42, 0.82, seededRandom(i, 31));
    const occasionalTurn = seededRandom(i, 37) > 0.86 ? (seededRandom(i, 41) - 0.5) * 1.4 : 0;
    const scale = lerp(0.28, 0.62, seededRandom(i, 43))
      * lerp(0.86, 1.18, density)
      * lerp(1.08, 0.9, dryness);

    items.push({
      id: `cormorant-test-3-dry-grass-${items.length}`,
      x,
      y,
      z,
      grade,
      scale,
      yaw: direction + directionJitter + occasionalTurn,
      tone,
      density,
      dryness,
      color: dryGrassColor(density, dryness, tone),
    });
  }
  return items;
}

export function buildCormorantBayTest3Ecology() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ZONE, layer, count, seed, opts);
  const dryGrassPatches = buildDryGrassPatches();
  return {
    zoneId: ZONE,
    stream: false,
    lagoonSurfaces: [
      {
        id: 'test-3-brackish-lagoon-water2',
        zoneId: ZONE,
        position: [0, LAGOON_SURFACE_Y, 0],
        bounds: { minX: -39, maxX: 39, minZ: -17, maxZ: 19 },
        geometryResolution: [220, 108],
        colorA: '#264d48',
        colorB: '#76a28e',
        mudColor: '#5c5540',
        algaeColor: '#71845a',
        waterColor: '#6f9289',
        opacity: 0.062,
        reflectivity: 0.048,
        waterAlpha: 0.78,
        waterShoreAlpha: 0.34,
        flowSpeed: 0.0022,
        flowScale: 2.4,
        flowDirection: [0.16, 0.11],
        shoreNoise: 0.035,
        maskThreshold: 0.3,
        rippleStrength: 0.62,
        distortionScale: 0.014,
        stepRippleStrength: 0.92,
        stepRippleDisplacement: 0.026,
        stepRippleEventScale: 1.32,
        walkRippleEventScale: 1.1,
        rippleEventScale: 1.18,
        splashRippleEventScale: 1.68,
        stepRippleMaxIntensity: 1.45,
        playerIdleRippleStrength: 0.62,
        overlayLift: 0.014,
        playerVeilLift: 0.034,
        playerVeilScale: [1.34, 0.9],
        textureWidth: 512,
        textureHeight: 512,
      },
    ],
    dryGrassPatches: [
      {
        id: 'cormorant-test-3-yellow-dry-grass-patches',
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
        baseLift: 0.012,
        sink: 0.025,
        slopeSink: 0.18,
        widthScale: 0.92,
        heightScale: 0.96,
        depthScale: 0.96,
        maxVisibleDistance: 82,
        motion: { wind: 0.95, bend: 0.2, bendRadius: 1.12 },
      },
    ],
    flora: [
      {
        id: 'test-3-lagoon-saltgrass',
        path: `${NATURE}runtime-saltgrass.glb`,
        sink: 0.13,
        castShadow: false,
        motion: { wind: 0.9, bend: 0.28, bendRadius: 1.1 },
        items: scatter('test-3-lagoon-saltgrass', 18, 321, {
          minX: -42, maxX: 42, minZ: -16, maxZ: 26, scale: [0.1, 0.19], maxGrade: 0.8,
          accept: (biome, x, z) => lagoonEdge(biome, x, z) && notTrail(x, z, 3.3),
        }),
      },
      {
        id: 'test-3-sesuvium-mats',
        path: `${NATURE}runtime-sesuvium.glb`,
        sink: 0.025,
        castShadow: false,
        ySquash: 0.28,
        motion: { wind: 0.38, bend: 0.12, bendRadius: 1.0 },
        items: scatter('test-3-sesuvium', 7, 333, {
          minX: -40, maxX: 34, minZ: 5, maxZ: 34, scale: [1.6, 2.7], maxGrade: 0.7,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5.2,
        }),
      },
      {
        id: 'test-3-lagoon-mangroves',
        path: `${NATURE}runtime-mangrove-tree.glb`,
        sink: 0.12,
        castShadow: false,
        tint: '#66834f',
        tintStrength: 0.14,
        motion: { wind: 0.28, bend: 0.045, bendRadius: 2.4 },
        items: scatter('test-3-mangrove-fringe', 5, 403, {
          minX: -38, maxX: 36, minZ: -13, maxZ: 12, scale: [0.22, 0.36], maxGrade: 0.9,
          accept: (biome, x, z) => lagoonEdge(biome, x, z)
            && notTrail(x, z, 8.5)
            && cormorantLagoonField(x, z) > 1.12
            && cormorantLagoonField(x, z) < 1.64,
        }),
      },
      {
        id: 'test-3-driftwood-shell-line',
        path: `${NATURE}runtime-driftwood.glb`,
        sink: 0.02,
        tint: '#c7b998',
        tintStrength: 0.44,
        items: scatter('test-3-driftwood-shell-line', 5, 367, {
          minX: -44, maxX: 28, minZ: 8, maxZ: 29, scale: [0.18, 0.42], maxGrade: 0.72,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5,
        }),
      },
    ],
    canopySilhouettes: [
      {
        id: 'test-3-lagoon-scrub-silhouette',
        items: [
          { id: 'test-3-scrub-back-left', x: -48, z: -25, y: 0.6, scale: 1.7, yaw: 0.4 },
          { id: 'test-3-scrub-back-center', x: -25, z: -36, y: 0.9, scale: 2.1, yaw: -0.3 },
          { id: 'test-3-scrub-back-right', x: 28, z: -34, y: 0.85, scale: 2.2, yaw: 0.8 },
        ],
      },
    ],
    flyingModels: [
      {
        id: 'test-3-distant-flying-flamingos',
        loadTier: 1,
        items: [
          {
            id: 'test-3-flying-flamingo-1',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: -18,
            cz: -16,
            radiusX: 28,
            radiusZ: 12,
            height: 18,
            speed: 0.038,
            phase: 0.4,
            scale: 1.2,
            timeScale: 0.62,
            yawOffset: 0,
            rollAmount: 0.06,
            floatAmount: 0.7,
          },
          {
            id: 'test-3-flying-flamingo-2',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 16,
            cz: -22,
            radiusX: 34,
            radiusZ: 15,
            height: 23,
            speed: -0.032,
            phase: 2.1,
            scale: 1.05,
            timeScale: 0.58,
            yawOffset: 0,
            rollAmount: 0.055,
            floatAmount: 0.8,
          },
          {
            id: 'test-3-flying-flamingo-3',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 2,
            cz: -30,
            radiusX: 42,
            radiusZ: 18,
            height: 27,
            speed: 0.026,
            phase: 4.3,
            scale: 0.95,
            timeScale: 0.54,
            yawOffset: 0,
            rollAmount: 0.045,
            floatAmount: 0.65,
          },
        ],
      },
    ],
    birds: [
      { radius: 20, height: 14, speed: 0.1, phase: 0.4, cx: -10, cz: -6 },
      { radius: 31, height: 20, speed: -0.065, phase: 2.9, cx: 19, cz: -16 },
    ],
    footprintBiomes: ['green-beach', 'wet-mud', 'olivine-trail', 'salt-scrub', 'tuff-rim'],
  };
}
