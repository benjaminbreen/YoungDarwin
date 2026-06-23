import { makeZoneScatter } from '../scatter';
import { cormorantLagoonField, cormorantTrailDistance } from '../regions/cormorantBaySplatTest/terrain';

const ZONE = 'CORMORANT_BAY_SPLAT_TEST';
const NATURE = '/assets/models/nature/';

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

export function buildCormorantBaySplatTestEcology() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(ZONE, layer, count, seed, opts);
  return {
    zoneId: ZONE,
    stream: false,
    splatBackdrop: {
      id: 'cormorant-bay-static-reed-scrub-shell',
      path: '/assets/splats/cormorant-bay-backdrop.ksplat',
      bounds: { minX: -55, maxX: 55, minZ: -44, maxZ: 42 },
      fallbackHidden: true,
    },
    lagoonSurfaces: [
      {
        id: 'main-brackish-lagoon',
        position: [1, -0.875, 2],
        scale: [34, 15],
        rotation: -0.08,
        colorA: '#31584a',
        colorB: '#85a16d',
      },
    ],
    denseGrass: [
      {
        id: 'cormorant-olivine-near-meadow',
        count: 150000,
        seed: 7311,
        bounds: { minX: -42, maxX: 42, minZ: 9, maxZ: 38 },
        height: [0.28, 1.12],
        width: [0.014, 0.042],
        coverage: 0.86,
        minCoverage: 0.28,
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
        fadeFarStart: 30,
        fadeFarEnd: 50,
        dryness: 0.38,
        dryPatchStrength: 0.44,
        colorVariance: 0.42,
        deepColor: '#4c512a',
        rootColor: '#77793b',
        midColor: '#a49d52',
        tipColor: '#d8ca78',
        dryColor: '#a88748',
        dryTipColor: '#e2c77a',
      },
    ],
    flora: [
      {
        id: 'lagoon-saltgrass',
        path: `${NATURE}runtime-saltgrass.glb`,
        sink: 0.13,
        castShadow: false,
        motion: { wind: 1.15, bend: 0.42, bendRadius: 1.2 },
        items: scatter('lagoon-saltgrass', 26, 211, {
          minX: -42, maxX: 42, minZ: -16, maxZ: 26, scale: [0.12, 0.22], maxGrade: 0.8,
          accept: (biome, x, z) => lagoonEdge(biome, x, z) && notTrail(x, z, 3.3),
        }),
      },
      {
        id: 'olivine-sesuvium-mats',
        path: `${NATURE}runtime-sesuvium.glb`,
        sink: 0.025,
        castShadow: false,
        ySquash: 0.28,
        motion: { wind: 0.58, bend: 0.18, bendRadius: 1.0 },
        items: scatter('olivine-sesuvium', 8, 223, {
          minX: -40, maxX: 34, minZ: 5, maxZ: 34, scale: [1.8, 3.1], maxGrade: 0.7,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5.2,
        }),
      },
      {
        id: 'cormorant-lagoon-mangroves',
        path: `${NATURE}runtime-mangrove-tree.glb`,
        sink: 0.12,
        castShadow: false,
        tint: '#66834f',
        tintStrength: 0.14,
        motion: { wind: 0.42, bend: 0.08, bendRadius: 2.4 },
        items: scatter('cormorant-mangrove-fringe', 5, 293, {
          minX: -38, maxX: 36, minZ: -13, maxZ: 12, scale: [0.22, 0.36], maxGrade: 0.9,
          accept: (biome, x, z) => lagoonEdge(biome, x, z)
            && notTrail(x, z, 8.5)
            && cormorantLagoonField(x, z) > 1.12
            && cormorantLagoonField(x, z) < 1.64,
        }),
      },
      {
        id: 'driftwood-shell-line',
        path: `${NATURE}runtime-driftwood.glb`,
        sink: 0.02,
        tint: '#c7b998',
        tintStrength: 0.44,
        items: scatter('driftwood-shell-line', 5, 257, {
          minX: -44, maxX: 28, minZ: 8, maxZ: 29, scale: [0.18, 0.42], maxGrade: 0.72,
          accept: (biome, x, z) => dryGround(biome) && cormorantTrailDistance(x, z) > 5,
        }),
      },
    ],
    canopySilhouettes: [
      {
        id: 'lagoon-scrub-silhouette',
        items: [
          { id: 'scrub-back-left', x: -48, z: -25, y: 0.6, scale: 1.7, yaw: 0.4 },
          { id: 'scrub-back-center', x: -25, z: -36, y: 0.9, scale: 2.1, yaw: -0.3 },
          { id: 'scrub-back-right', x: 28, z: -34, y: 0.85, scale: 2.2, yaw: 0.8 },
          { id: 'rim-tuff-right', x: 49, z: -8, y: 1.2, scale: 1.85, yaw: -0.5 },
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
