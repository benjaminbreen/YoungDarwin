import { makeZoneScatter, seededRandom } from '../scatter';
import { terrainBiomeAt, terrainHeight, terrainSlopeAt, WATER_LEVEL } from '../terrain';
import {
  PUNTA_CORMORANT,
  puntaCormorantLagoonField,
  puntaCormorantStandingWaterMask,
  puntaCormorantSwampMask,
  puntaCormorantTrailDistance,
} from '../regions/puntaCormorant/terrain';

const ZONE = PUNTA_CORMORANT;
const NATURE = '/assets/models/nature/';
const LAGOON_SURFACE_Y = WATER_LEVEL + 0.036;

function dryGround(biome) {
  return ['green-beach', 'salt-scrub', 'tuff-rim', 'olivine-trail', 'wet-basalt'].includes(biome);
}

function lagoonFringe(biome, x, z) {
  const lagoon = puntaCormorantLagoonField(x, z);
  return lagoon > 0.98 && lagoon < 1.68 && biome !== 'brackish-lagoon';
}

function notTrail(x, z, margin = 4.4) {
  return puntaCormorantTrailDistance(x, z) > margin;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildDryGrassPatches(count = 190) {
  const items = [];
  const bounds = { minX: -48, maxX: 48, minZ: 20, maxZ: 45 };
  let attempts = 0;
  while (items.length < count && attempts < count * 70) {
    attempts += 1;
    const i = attempts + 24711;
    const x = bounds.minX + seededRandom(i, 3) * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + seededRandom(i, 9) * (bounds.maxZ - bounds.minZ);
    if (puntaCormorantStandingWaterMask(x, z) > 0.05) continue;
    if (!notTrail(x, z, 4.8)) continue;
    const y = terrainHeight(x, z, ZONE);
    const biome = terrainBiomeAt(x, z, y, ZONE);
    if (!dryGround(biome)) continue;
    const { grade } = terrainSlopeAt(x, z, ZONE, 0.75);
    if (grade > 0.72) continue;
    const shoreOpen = clamp01((z - 18) / 22);
    const density = clamp01(0.28 + shoreOpen * 0.48 + seededRandom(i, 15) * 0.34);
    if (seededRandom(i, 21) > density) continue;

    const tone = seededRandom(i, 17);
    items.push({
      id: `punta-cormorant-dry-grass-${items.length}`,
      x,
      y,
      z,
      grade,
      scale: lerp(0.24, 0.55, seededRandom(i, 43)) * lerp(0.9, 1.18, density),
      yaw: -0.72 + (seededRandom(i, 29) - 0.5) * 0.9,
      tone,
      density,
      dryness: clamp01(0.58 + tone * 0.28),
      color: tone > 0.58 ? '#beb265' : '#9b9652',
    });
  }
  return items;
}

export function buildPuntaCormorantEcology() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ZONE, layer, count, seed, opts);
  const dryGrassPatches = buildDryGrassPatches();
  return {
    zoneId: ZONE,
    stream: false,
    lagoonSurfaces: [
      {
        id: 'punta-cormorant-main-lagoon',
        zoneId: ZONE,
        position: [0, LAGOON_SURFACE_Y, -1],
        bounds: { minX: -51, maxX: 51, minZ: -31, maxZ: 27 },
        geometryResolution: [252, 146],
        colorA: '#244943',
        colorB: '#85a28e',
        mudColor: '#4e4c37',
        algaeColor: '#6f855d',
        waterColor: '#7fa79e',
        opacity: 0.052,
        reflectivity: 0.072,
        waterAlpha: 0.76,
        waterShoreAlpha: 0.32,
        flowSpeed: 0.0014,
        flowScale: 2.9,
        flowDirection: [0.08, 0.04],
        shoreNoise: 0.028,
        maskThreshold: 0.28,
        rippleStrength: 0.52,
        distortionScale: 0.008,
        stepRippleStrength: 0.86,
        stepRippleDisplacement: 0.022,
        stepRippleEventScale: 1.26,
        walkRippleEventScale: 1.02,
        rippleEventScale: 1.1,
        splashRippleEventScale: 1.48,
        stepRippleMaxIntensity: 1.32,
        playerIdleRippleStrength: 0.52,
        overlayLift: 0.012,
        playerVeilLift: 0.032,
        playerVeilScale: [1.34, 0.9],
        textureWidth: 512,
        textureHeight: 512,
      },
    ],
    dryGrassPatches: [
      {
        id: 'punta-cormorant-southern-beach-grass',
        loadTier: 1,
        path: `${NATURE}runtime-animated-dry-grass.glb`,
        items: dryGrassPatches,
        color: '#aaa15d',
        materialColor: '#ffffff',
        emissive: '#2f3117',
        emissiveIntensity: 0.08,
        roughness: 0.99,
        castShadow: false,
        receiveShadow: true,
        baseLift: 0.012,
        sink: 0.025,
        slopeSink: 0.16,
        widthScale: 0.88,
        heightScale: 0.92,
        depthScale: 0.92,
        maxVisibleDistance: 76,
        motion: { wind: 0.78, bend: 0.17, bendRadius: 1.08 },
      },
    ],
    flora: [
      {
        id: 'punta-cormorant-lagoon-saltgrass',
        path: `${NATURE}runtime-saltgrass.glb`,
        sink: 0.13,
        castShadow: false,
        motion: { wind: 0.82, bend: 0.25, bendRadius: 1.08 },
        items: scatter('punta-cormorant-lagoon-saltgrass', 30, 511, {
          minX: -47, maxX: 47, minZ: -25, maxZ: 27, scale: [0.1, 0.2], maxGrade: 0.78,
          accept: (biome, x, z) => lagoonFringe(biome, x, z) && notTrail(x, z, 3.2),
        }),
      },
      {
        id: 'punta-cormorant-low-mangrove-fringe',
        path: `${NATURE}runtime-mangrove-lowpoly.glb`,
        sink: 0.11,
        castShadow: false,
        tint: '#60794b',
        tintStrength: 0.18,
        motion: { wind: 0.24, bend: 0.04, bendRadius: 2.1 },
        items: scatter('punta-cormorant-low-mangrove-fringe', 9, 557, {
          minX: -44, maxX: 44, minZ: -26, maxZ: 14, scale: [0.18, 0.33], maxGrade: 0.86,
          accept: (biome, x, z) => puntaCormorantSwampMask(x, z) > 0.34
            && puntaCormorantStandingWaterMask(x, z) < 0.82
            && notTrail(x, z, 8.5),
        }),
      },
      {
        id: 'punta-cormorant-far-mangrove-clumps',
        path: `${NATURE}runtime-mangrove-tree.glb`,
        sink: 0.14,
        castShadow: false,
        tint: '#5e774a',
        tintStrength: 0.16,
        motion: { wind: 0.22, bend: 0.04, bendRadius: 2.6 },
        items: scatter('punta-cormorant-far-mangroves', 5, 601, {
          minX: -43, maxX: 43, minZ: -27, maxZ: 1, scale: [0.2, 0.34], maxGrade: 0.9,
          accept: (biome, x, z) => lagoonFringe(biome, x, z)
            && puntaCormorantSwampMask(x, z) > 0.3
            && notTrail(x, z, 9),
        }),
      },
      {
        id: 'punta-cormorant-sesuvium-mats',
        path: `${NATURE}runtime-sesuvium.glb`,
        sink: 0.025,
        castShadow: false,
        ySquash: 0.28,
        motion: { wind: 0.34, bend: 0.1, bendRadius: 1.0 },
        items: scatter('punta-cormorant-sesuvium', 10, 631, {
          minX: -44, maxX: 44, minZ: 14, maxZ: 37, scale: [1.3, 2.6], maxGrade: 0.68,
          accept: (biome, x, z) => dryGround(biome) && puntaCormorantTrailDistance(x, z) > 5.4,
        }),
      },
      {
        id: 'punta-cormorant-driftwood-line',
        path: `${NATURE}runtime-driftwood.glb`,
        sink: 0.02,
        tint: '#c8b894',
        tintStrength: 0.42,
        items: scatter('punta-cormorant-driftwood-line', 5, 653, {
          minX: -42, maxX: 36, minZ: 24, maxZ: 39, scale: [0.16, 0.38], maxGrade: 0.7,
          accept: (biome, x, z) => dryGround(biome) && puntaCormorantTrailDistance(x, z) > 4.8,
        }),
      },
    ],
    canopySilhouettes: [
      {
        id: 'punta-cormorant-far-rim-silhouette',
        items: [
          { id: 'punta-cormorant-rim-left', x: -52, z: -28, y: 0.9, scale: 1.9, yaw: 0.35 },
          { id: 'punta-cormorant-rim-center-left', x: -26, z: -39, y: 1.2, scale: 2.4, yaw: -0.18 },
          { id: 'punta-cormorant-rim-center-right', x: 13, z: -40, y: 1.25, scale: 2.6, yaw: 0.22 },
          { id: 'punta-cormorant-rim-right', x: 48, z: -25, y: 1.0, scale: 2.0, yaw: -0.44 },
        ],
      },
    ],
    flyingModels: [
      {
        id: 'punta-cormorant-flying-flamingos',
        loadTier: 1,
        items: [
          {
            id: 'punta-cormorant-flying-flamingo-1',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: -18,
            cz: -17,
            radiusX: 34,
            radiusZ: 13,
            height: 19,
            speed: 0.028,
            phase: 0.4,
            scale: 1.1,
            timeScale: 0.66,
            rollAmount: 0.055,
            floatAmount: 0.62,
          },
          {
            id: 'punta-cormorant-flying-flamingo-2',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 14,
            cz: -22,
            radiusX: 39,
            radiusZ: 15,
            height: 24,
            speed: -0.024,
            phase: 2.1,
            scale: 1.0,
            timeScale: 0.62,
            rollAmount: 0.05,
            floatAmount: 0.78,
          },
          {
            id: 'punta-cormorant-flying-flamingo-3',
            assetId: 'flyingFlamingo',
            clip: 'flamingo_flyA_',
            cx: 2,
            cz: -29,
            radiusX: 44,
            radiusZ: 18,
            height: 28,
            speed: 0.02,
            phase: 4.3,
            scale: 0.92,
            timeScale: 0.58,
            rollAmount: 0.045,
            floatAmount: 0.65,
          },
        ],
      },
    ],
    birds: [
      { species: 'frigatebird', path: 'thermalCircle', radiusX: 24, radiusZ: 14, height: 15, speed: 0.08, phase: 0.4, cx: -14, cz: -10, flapRate: 0.48 },
      { species: 'gull', path: 'lazyFigureEight', radiusX: 35, radiusZ: 18, height: 21, speed: -0.056, phase: 2.9, cx: 22, cz: -18, flapRate: 0.72 },
    ],
    footprintBiomes: ['green-beach', 'wet-mud', 'olivine-trail', 'salt-scrub', 'tuff-rim', 'wet-basalt'],
  };
}
