import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { getCerroPajasRocks } from '../cerroPajasLayout';
import {
  CERRO_PAJAS,
  CERRO_PAJAS_JUNCTION,
  cerroPajasConeInfo,
  cerroPajasMoisture,
  cerroPajasPathInfo,
  cerroPajasRockExposure,
  cerroPajasStrawGrass,
} from '../regions/cerroPajas/path';
import { terrainSurfaceNoise } from '../terrainShared';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import {
  DARWINIOTHAMNUS_LABEL,
  DARWINIOTHAMNUS_PATH,
  DARWINIOTHAMNUS_VARIANT_MODE,
  makeDarwiniothamnusPatchScatter,
} from './floraAssets';
import {
  buildStandardDryGrassPatchItems,
  createStandardDryGrassPatchLayer,
} from './standardGrass';

const NATURE = '/assets/models/nature/';

// Cerro Pajas ecology. The upper cone is open straw grass so the crater rim
// and crown outcrop stay legible; misty Scalesia, ferns, and shrubs crowd the
// lee (south and west) flanks below it; the crater floor holds damp sedge.

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clearOfTrail(biome, x, z, multiplier = 1.6) {
  const path = cerroPajasPathInfo(x, z);
  return path.distance > path.width * multiplier && biome !== 'summit-cinder-path';
}

function clearJunction(x, z, radius = 8) {
  return Math.hypot(x - CERRO_PAJAS_JUNCTION.x, z - CERRO_PAJAS_JUNCTION.z) > radius;
}

// Keep the sightline from the north trailhead to the crown free of trees.
function belowSummit(x, z, margin = 4) {
  const cone = cerroPajasConeInfo(x, z);
  return cone.radius > cone.rimRadius + margin;
}

function tint(items, light, dark) {
  return items.map(item => ({ ...item, tint: item.tone > 0.5 ? light : dark }));
}

function buildGrass() {
  const items = buildStandardDryGrassPatchItems({
    zoneId: CERRO_PAJAS,
    idPrefix: 'cerro-pajas-grass',
    count: 1320,
    seed: 81419,
    bounds: { minX: -50, maxX: 50, minZ: -46, maxZ: 46 },
    pathInfo: cerroPajasPathInfo,
    rejectBiomes: ['summit-cinder-path', 'weathered-tuff-crown'],
    pathCenterMax: 0.04,
    pathTreadMax: 0.2,
    maxGrade: 0.9,
    slopeStep: 0.82,
    scale: [0.5, 1.16],
    windYaw: -0.92,
    attemptsPerItem: 150,
    accept: ({ x, z, path }) => {
      if (cerroPajasRockExposure(x, z) > 0.7) return false;
      if (path.distance < path.width * 1.12) return false;
      return clearJunction(x, z, 4.5);
    },
    // Wind-cured straw on the exposed summit, greener in the misty lee.
    drynessAt: ({ x, z, tone, path }) => clamp01(
      0.42 + cerroPajasStrawGrass(x, z) * 0.46 + tone * 0.12
        + (path?.shoulder || 0) * 0.1 - cerroPajasMoisture(x, z) * 0.42,
    ),
    tintAt: (tone, dryness) => {
      if (dryness > 0.64) return tone > 0.5 ? '#c4b16a' : '#a39355';
      if (dryness > 0.38) return tone > 0.5 ? '#97a55c' : '#77894d';
      return tone > 0.5 ? '#6f9550' : '#507443';
    },
  });

  return createStandardDryGrassPatchLayer({
    id: 'cerro-pajas-summit-grass',
    items,
    materialColor: '#f0edd4',
    emissive: '#1f2918',
    emissiveIntensity: 0.04,
    widthScale: 1.04,
    heightScale: 1.16,
    depthScale: 1.02,
    maxVisibleDistance: 104,
    motion: { wind: 1.14, bend: 0.26, bendRadius: 1.18 },
  });
}

function buildFlora() {
  const scatter = (layer, count, seed, options) => makeZoneScatter(CERRO_PAJAS, layer, count, seed, options);

  // Scalesia stands on the lee flanks, below the open summit grass.
  const scalesia = varyScatterTransforms(scatter('cerro-pajas-scalesia', 26, 811, {
    minX: -50, maxX: 50, minZ: -30, maxZ: 46, scale: [0.66, 1.08], maxGrade: 0.64,
    accept: (biome, x, z) => clearOfTrail(biome, x, z, 2.6)
      && clearJunction(x, z, 13)
      && belowSummit(x, z, 9)
      && cerroPajasMoisture(x, z) > 0.46
      && terrainSurfaceNoise(x * 0.06 + 2, z * 0.06 - 8) > -0.15,
  }), 811, { width: [0.88, 1.12], height: [0.88, 1.14], maxLean: 0.03 });

  const ferns = varyScatterTransforms(scatter('cerro-pajas-ferns', 120, 829, {
    minX: -50, maxX: 50, minZ: -40, maxZ: 46, scale: [0.82, 1.6], maxGrade: 0.78,
    accept: (biome, x, z) => clearOfTrail(biome, x, z, 1.5)
      && (cerroPajasMoisture(x, z) > 0.5 || cerroPajasConeInfo(x, z).crater > 0.45)
      && cerroPajasRockExposure(x, z) < 0.6,
  }), 829, { width: [0.9, 1.16], height: [0.86, 1.12], maxLean: 0.05 });

  const croton = varyScatterTransforms(scatter('cerro-pajas-croton', 46, 847, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 46, scale: [0.58, 1.0], maxGrade: 0.74,
    accept: (biome, x, z) => clearOfTrail(biome, x, z, 1.8)
      && clearJunction(x, z, 9)
      && belowSummit(x, z, 5)
      && cerroPajasMoisture(x, z) > 0.3,
  }), 847, { width: [0.88, 1.14], height: [0.9, 1.12], maxLean: 0.04 });

  const darwiniothamnus = makeDarwiniothamnusPatchScatter(
    CERRO_PAJAS,
    'cerro-pajas-darwiniothamnus',
    44,
    863,
    {
      minX: -50, maxX: 50, minZ: -44, maxZ: 46, scale: [0.78, 2.1], maxGrade: 0.74,
      patchCount: 5, patchRadius: [3.0, 5.8],
      accept: (biome, x, z) => clearOfTrail(biome, x, z, 1.8)
        && clearJunction(x, z, 9)
        && belowSummit(x, z, 2)
        && cerroPajasMoisture(x, z) < 0.62,
    },
    { width: [0.88, 1.15], height: [0.88, 1.12], maxLean: 0.04 },
  );

  const bushes = varyScatterTransforms(scatter('cerro-pajas-bush-hummocks', 30, 881, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 46, scale: [0.013, 0.024], maxGrade: 0.7,
    accept: (biome, x, z) => clearOfTrail(biome, x, z, 2)
      && clearJunction(x, z, 10)
      && belowSummit(x, z, 6)
      && cerroPajasMoisture(x, z) > 0.36,
  }), 881, { width: [0.88, 1.16], height: [0.84, 1.1], maxLean: 0.025 });

  const groundPlants = varyScatterTransforms(scatter('cerro-pajas-ground-plants', 90, 899, {
    minX: -50, maxX: 50, minZ: -44, maxZ: 46, scale: [0.055, 0.13], maxGrade: 0.78,
    accept: (biome, x, z) => clearOfTrail(biome, x, z, 1.4)
      && cerroPajasMoisture(x, z) > 0.44,
  }), 899, { width: [0.9, 1.14], height: [0.84, 1.08], maxLean: 0.05 });

  // Damp sedge on the crater floor.
  const sedges = varyScatterTransforms(scatter('cerro-pajas-crater-sedges', 70, 917, {
    minX: -20, maxX: 8, minZ: -24, maxZ: 4, scale: [0.09, 0.22], maxGrade: 0.6,
    accept: (biome, x, z) => cerroPajasConeInfo(x, z).crater > 0.55
      && clearOfTrail(biome, x, z, 1.3),
  }), 917, { width: [0.72, 1.12], height: [0.72, 1.2], depth: [0.76, 1.14], maxLean: 0.05 });

  return [
    { id: 'cerro-pajas-scalesia', path: `${NATURE}runtime-scalesia-pedunculata-tree.glb`, sink: 0.14, tintStrength: 0.12, castShadow: true, motion: { wind: 0.52, bend: 0.12, bendRadius: 3.2 }, items: tint(scalesia, '#6f9150', '#4c6e43') },
    { id: 'cerro-pajas-ferns', path: `${NATURE}runtime-galapagos-fern.glb`, sink: 0.075, tintStrength: 0.18, castShadow: false, motion: { wind: 0.5, bend: 0.12, bendRadius: 1.18 }, items: tint(ferns, '#62844f', '#3f6544') },
    { id: 'cerro-pajas-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.06, tintStrength: 0.2, castShadow: false, motion: { wind: 1.02, bend: 0.28, bendRadius: 1.38 }, items: tint(croton, '#78945a', '#557448') },
    { id: 'cerro-pajas-darwiniothamnus', label: DARWINIOTHAMNUS_LABEL, path: DARWINIOTHAMNUS_PATH, variantMode: DARWINIOTHAMNUS_VARIANT_MODE, sink: 0.055, tintStrength: 0.16, castShadow: false, motion: { wind: 0.9, bend: 0.22, bendRadius: 1.62 }, items: tint(darwiniothamnus, '#829b5d', '#5e7c4c') },
    { id: 'cerro-pajas-bush-hummocks', path: `${NATURE}runtime-galapagos-bushes.glb`, sink: 0.07, tintStrength: 0.18, castShadow: false, motion: { wind: 0.74, bend: 0.18, bendRadius: 1.8 }, items: tint(bushes, '#839b5e', '#58774c') },
    { id: 'cerro-pajas-ground-plants', path: `${NATURE}runtime-ground-plants.glb`, sink: 0.05, ySquash: 0.52, tintStrength: 0.26, castShadow: false, motion: { wind: 1.12, bend: 0.32, bendRadius: 1.16 }, items: tint(groundPlants, '#688b53', '#456946') },
    { id: 'cerro-pajas-crater-sedges', path: `${NATURE}runtime-saltgrass.glb`, sink: 0.095, tintStrength: 0.24, castShadow: false, motion: { wind: 1.2, bend: 0.42, bendRadius: 1.05 }, items: tint(sedges, '#6f8f50', '#4d6f43') },
  ];
}

function buildSurfaceLitter() {
  return [
    buildDryVolcanicLitterLayer({
      zoneId: CERRO_PAJAS,
      id: 'cerro-pajas-tuff-chips',
      itemIdPrefix: 'cerro-pajas-chip',
      count: 420,
      seed: 937,
      bounds: { minX: -48, maxX: 44, minZ: -42, maxZ: 30 },
      scale: [0.4, 1.3],
      colors: ['#8a7b62', '#74684f', '#5c5446'],
      accept: (biome, x, z) => {
        const path = cerroPajasPathInfo(x, z);
        const cone = cerroPajasConeInfo(x, z);
        return path.tread < 0.18
          && (cerroPajasRockExposure(x, z) > 0.4 || cone.rim > 0.55 || path.shoulder > 0.3);
      },
    }),
  ];
}

export function buildCerroPajasEcology() {
  return {
    zoneId: CERRO_PAJAS,
    stream: false,
    dryGrassPatches: [buildGrass()],
    flora: buildFlora(),
    proceduralFlora: [],
    rocks: getCerroPajasRocks(),
    surfaceLitter: buildSurfaceLitter(),
    props: [],
    footprintBiomes: [
      'summit-cinder-path',
      'summit-path-shoulder',
      'crater-sedge-meadow',
      'misty-scalesia-slope',
      'highland-pasture-grass',
    ],
    birds: [
      { species: 'gull', path: 'thermalCircle', radiusX: 30, radiusZ: 22, height: 30, speed: -0.04, phase: 1.1, cx: -8, cz: -10, flapRate: 0.55 },
      { species: 'coastal-small', path: 'lazyFigureEight', radiusX: 14, radiusZ: 9, height: 9, speed: 0.1, phase: 2.2, cx: -24, cz: 18, flapRate: 0.9 },
    ],
  };
}
