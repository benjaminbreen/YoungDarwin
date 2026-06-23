import { makeZoneScatter } from '../scatter';
import { cormorantLagoonField, cormorantTrailDistance } from '../regions/cormorantBayTest2/terrain';

const ZONE = 'CORMORANT_BAY_TEST_2';
const NATURE = '/assets/models/nature/';

function dryGround(biome) {
  return ['green-beach', 'salt-scrub', 'tuff-rim', 'olivine-trail'].includes(biome);
}

function meadowDensity({ biome, x, z, tone }) {
  if (!['green-beach', 'salt-scrub'].includes(biome)) return 0;
  const lagoon = cormorantLagoonField(x, z);
  const trail = cormorantTrailDistance(x, z);
  if (lagoon < 1.42 || trail < 4.8) return 0;
  const lagoonBand = Math.max(0, Math.min(1, (lagoon - 1.45) / 0.9));
  const dryBand = Math.max(0.2, Math.min(1, (z - 6) / 18));
  return Math.max(0, Math.min(1, (0.52 + tone * 0.42) * lagoonBand * dryBand));
}

function lagoonEdge(biome, x, z) {
  const lagoon = cormorantLagoonField(x, z);
  return lagoon > 1.0 && lagoon < 1.55 && biome !== 'brackish-lagoon' && biome !== 'deep-lagoon';
}

function notTrail(x, z, margin = 4.4) {
  return cormorantTrailDistance(x, z) > margin;
}

export function buildCormorantBayTest2Ecology() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ZONE, layer, count, seed, opts);
  return {
    zoneId: ZONE,
    stream: false,
    lagoonSurfaces: [
      {
        id: 'test-2-brackish-lagoon',
        position: [1, -0.875, 2],
        scale: [34, 15],
        rotation: -0.08,
        colorA: '#31584a',
        colorB: '#85a16d',
      },
    ],
    denseGrass: [
      {
        id: 'cormorant-test-2-near-meadow',
        count: 125000,
        seed: 8311,
        bounds: { minX: -42, maxX: 42, minZ: 9, maxZ: 38 },
        height: [0.28, 1.12],
        width: [0.014, 0.042],
        coverage: 0.82,
        minCoverage: 0.26,
        patchScale: 0.044,
        tuftScale: 0.15,
        clusterScale: 0.034,
        clusterStrength: 0.62,
        heightClusterScale: 0.015,
        directionScale: 0.055,
        windDirectionBias: 0.82,
        yawJitter: 0.28,
        maxGrade: 0.84,
        baseLift: 0.018,
        tipBend: 0.78,
        prelean: 0.62,
        windAmp: 0.3,
        windFrequencyScale: 0.66,
        windCrossAmp: 0.055,
        windGustStrength: 0.9,
        bendAmp: 0.92,
        bendRadius: 1.25,
        contactRadius: 0.72,
        interactionBoost: 0.68,
        recoveryRate: 0.24,
        fadeFarStart: 12,
        fadeFarEnd: 20,
        dryness: 0.38,
        dryPatchStrength: 0.44,
        colorVariance: 0.34,
        deepColor: '#4b512b',
        rootColor: '#74763c',
        midColor: '#9b934b',
        tipColor: '#c8b969',
        dryColor: '#9d8244',
        dryTipColor: '#d0b76e',
      },
    ],
    hybridGrassTufts: [
      {
        id: 'cormorant-test-2-mid-meadow-cards',
        count: 18500,
        seed: 8429,
        bounds: { minX: -46, maxX: 46, minZ: 2, maxZ: 41 },
        coverage: 0.68,
        clusterScale: 0.048,
        directionScale: 0.038,
        windYaw: -0.92,
        windDirectionBias: 0.9,
        windAmp: 0.1,
        height: [0.42, 0.92],
        width: [0.7, 1.35],
        cardsPerTuft: 2,
        maxGrade: 0.8,
        baseLift: 0.012,
        fadeNear: 4,
        fadeFar: 46,
        alphaTest: 0.48,
        basalMatAlpha: 0.12,
        basalDarkColor: '#536036',
        basalDryColor: '#8b8150',
        greenColor: '#7c8248',
        dryColor: '#aa995f',
        darkColor: '#5d663c',
        densityAt: meadowDensity,
      },
    ],
    flora: [
      {
        id: 'test-2-lagoon-saltgrass',
        path: `${NATURE}runtime-saltgrass.glb`,
        sink: 0.13,
        castShadow: false,
        motion: { wind: 1.0, bend: 0.34, bendRadius: 1.1 },
        items: scatter('test-2-lagoon-saltgrass', 20, 221, {
          minX: -42, maxX: 42, minZ: -16, maxZ: 26, scale: [0.1, 0.2], maxGrade: 0.8,
          accept: (biome, x, z) => lagoonEdge(biome, x, z) && notTrail(x, z, 3.3),
        }),
      },
      {
        id: 'test-2-sesuvium-mats',
        path: `${NATURE}runtime-sesuvium.glb`,
        sink: 0.025,
        castShadow: false,
        ySquash: 0.28,
        motion: { wind: 0.45, bend: 0.14, bendRadius: 1.0 },
        items: scatter('test-2-sesuvium', 7, 233, {
          minX: -40, maxX: 34, minZ: 5, maxZ: 34, scale: [1.7, 2.8], maxGrade: 0.7,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5.2,
        }),
      },
      {
        id: 'test-2-lagoon-mangroves',
        path: `${NATURE}runtime-mangrove-tree.glb`,
        sink: 0.12,
        castShadow: false,
        tint: '#66834f',
        tintStrength: 0.14,
        motion: { wind: 0.32, bend: 0.055, bendRadius: 2.4 },
        items: scatter('test-2-mangrove-fringe', 5, 303, {
          minX: -38, maxX: 36, minZ: -13, maxZ: 12, scale: [0.22, 0.36], maxGrade: 0.9,
          accept: (biome, x, z) => lagoonEdge(biome, x, z)
            && notTrail(x, z, 8.5)
            && cormorantLagoonField(x, z) > 1.12
            && cormorantLagoonField(x, z) < 1.64,
        }),
      },
      {
        id: 'test-2-driftwood-shell-line',
        path: `${NATURE}runtime-driftwood.glb`,
        sink: 0.02,
        tint: '#c7b998',
        tintStrength: 0.44,
        items: scatter('test-2-driftwood-shell-line', 5, 267, {
          minX: -44, maxX: 28, minZ: 8, maxZ: 29, scale: [0.18, 0.42], maxGrade: 0.72,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5,
        }),
      },
    ],
    canopySilhouettes: [
      {
        id: 'test-2-lagoon-scrub-silhouette',
        items: [
          { id: 'test-2-scrub-back-left', x: -48, z: -25, y: 0.6, scale: 1.7, yaw: 0.4 },
          { id: 'test-2-scrub-back-center', x: -25, z: -36, y: 0.9, scale: 2.1, yaw: -0.3 },
          { id: 'test-2-scrub-back-right', x: 28, z: -34, y: 0.85, scale: 2.2, yaw: 0.8 },
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
