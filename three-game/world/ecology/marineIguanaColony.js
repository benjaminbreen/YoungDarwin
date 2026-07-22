import { makeZonePatchScatter, makeZoneScatter, varyScatterTransforms } from '../scatter';
import { WATER_LEVEL } from '../terrain';
import { getMarineIguanaColonyRocks } from '../marineIguanaColonyLayout';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import {
  MARINE_IGUANA_COLONY,
  marineIguanaColonyBasaltShelfMask,
  marineIguanaColonyBeachMask,
  marineIguanaColonyGuanoMask,
  marineIguanaColonyPathInfo,
  marineIguanaColonyPoolMask,
  marineIguanaColonyRubbleMask,
  marineIguanaColonyTerraceMask,
  marineIguanaColonyWetShoreMask,
} from '../regions/marineIguanaColony/path';
import { marineIguanaColonyHeight } from '../regions/marineIguanaColony/terrain';
import { buildAmbientWildlifeLayer } from './ambientWildlife';
import { BEACH_FIND_VARIANTS, buildBeachFindLayer } from './beachFinds';
import { buildColonyGroundClutterLayer } from './colonyGroundClutter';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';
const POOL_SURFACE_Y = WATER_LEVEL + 0.028;

const COLONY_FIND_VARIANTS = {
  turretShell: { ...BEACH_FIND_VARIANTS.turretShell, weight: 0.32, scale: [2.2, 3.2] },
  junoniaShell: { ...BEACH_FIND_VARIANTS.junoniaShell, weight: 0.2, scale: [2.0, 2.9] },
  starfish: { ...BEACH_FIND_VARIANTS.starfish, weight: 0.18, scale: [0.0034, 0.0048] },
  lowPolyStarfish: { ...BEACH_FIND_VARIANTS.lowPolyStarfish, weight: 0.3, scale: [0.38, 0.56] },
};

function clearOfPath(x, z, multiplier = 1.35) {
  const path = marineIguanaColonyPathInfo(x, z);
  return path.distance > path.width * multiplier;
}

function buildSparseFlora() {
  const scatter = (layer, count, seed, opts) => makeZoneScatter(MARINE_IGUANA_COLONY, layer, count, seed, opts);
  const sesuvium = varyScatterTransforms(scatter('marine-colony-sesuvium', 24, 41371, {
    minX: -27, maxX: -4, minZ: -40, maxZ: 42, scale: [0.7, 1.45], maxGrade: 0.72,
    accept: (biome, x, z) => clearOfPath(x, z)
      && marineIguanaColonyBeachMask(x, z) > 0.22
      && marineIguanaColonyBasaltShelfMask(x, z) < 0.42
      && (biome === 'white-shell-beach' || biome === 'wet-basalt-swash'),
  }), 41371, { width: [0.8, 1.28], height: [0.18, 0.34], depth: [0.84, 1.35], maxLean: 0.025 });
  const croton = varyScatterTransforms(scatter('marine-colony-inland-croton', 16, 41383, {
    minX: 4, maxX: 48, minZ: -41, maxZ: 41, scale: [0.48, 0.82], maxGrade: 0.66,
    accept: (biome, x, z) => clearOfPath(x, z, 1.8)
      && marineIguanaColonyRubbleMask(x, z) < 0.54
      && biome === 'wind-rounded-cinder',
  }), 41383, { width: [0.78, 1.15], height: [0.74, 1.05], depth: [0.82, 1.18], maxLean: 0.04 });
  return [
    {
      id: 'marine-colony-salt-pruned-sesuvium',
      path: `${NATURE}runtime-sesuvium.glb`,
      sink: 0.03,
      castShadow: false,
      ySquash: 0.18,
      tint: '#576f42',
      tintStrength: 0.34,
      motion: { wind: 0.55, bend: 0.12, bendRadius: 1.0 },
      items: sesuvium,
    },
    {
      id: 'marine-colony-inland-croton',
      path: `${NATURE}runtime-croton.glb`,
      sink: 0.07,
      castShadow: false,
      tint: '#6b714a',
      tintStrength: 0.32,
      motion: { wind: 0.98, bend: 0.24, bendRadius: 1.28 },
      items: croton,
    },
  ];
}

function buildColonyClutter() {
  return [
    buildColonyGroundClutterLayer({
      zoneId: MARINE_IGUANA_COLONY,
      id: 'marine-colony-shell-coral-aprons',
      count: 520,
      seed: 41401,
      bounds: { minX: -30, maxX: -5, minZ: -41, maxZ: 42 },
      patchCount: 9,
      patchRadius: [3.8, 8.2],
      minPatchSeparation: 4.8,
      minItemSeparation: 0.13,
      scale: [0.24, 0.72],
      maxGrade: 0.9,
      variants: [
        { variant: 'shell-cap', weight: 0.23, colors: ['#eee6d3', '#ded4be', '#cfc4ab'], size: [0.72, 1.16] },
        { variant: 'shell-shard-a', weight: 0.25, colors: ['#e3dac7', '#c9c0ad', '#f0e5ce'] },
        { variant: 'shell-shard-b', weight: 0.18, colors: ['#d4cbb8', '#b9b3a6', '#e6d7bd'] },
        { variant: 'coral-chip', weight: 0.24, colors: ['#c98c79', '#d4a18a', '#b7776d'] },
        { variant: 'limestone-chip', weight: 0.1, colors: ['#e1d6bd', '#cfc7b2'] },
      ],
      accept: (biome, x, z) => clearOfPath(x, z, 1.14)
        && marineIguanaColonyBeachMask(x, z) > 0.24
        && (biome === 'white-shell-beach' || biome === 'wet-basalt-swash'),
      suitability: (_biome, x, z) => 0.38 + marineIguanaColonyBeachMask(x, z) * 0.62,
      wetnessAt: (x, z) => marineIguanaColonyWetShoreMask(x, z) * 0.68,
    }),
    buildColonyGroundClutterLayer({
      zoneId: MARINE_IGUANA_COLONY,
      id: 'marine-colony-basalt-guano-scales',
      count: 610,
      seed: 41417,
      bounds: { minX: -29, maxX: 42, minZ: -41, maxZ: 42 },
      patchCount: 11,
      patchRadius: [3.2, 7.0],
      minPatchSeparation: 4.6,
      minItemSeparation: 0.15,
      scale: [0.26, 0.82],
      maxGrade: 1.18,
      variants: [
        { variant: 'basalt-pebble', weight: 0.52, colors: ['#171b19', '#262824', '#3b3832'], heightScale: [0.58, 1.0] },
        { variant: 'weathered-basalt-chip', weight: 0.19, colors: ['#4d473e', '#62594c', '#383a35'] },
        { variant: 'oxidized-scoria-chip', weight: 0.1, colors: ['#684435', '#7a4b36', '#4e3932'] },
        { variant: 'limestone-chip', weight: 0.19, colors: ['#d6d0b9', '#bbb7a6', '#ece4cc'], size: [0.62, 1.0] },
      ],
      accept: (biome, x, z) => clearOfPath(x, z, 1.18)
        && (marineIguanaColonyBasaltShelfMask(x, z) > 0.24 || marineIguanaColonyRubbleMask(x, z) > 0.4)
        && biome !== 'basalt-tidepool',
      suitability: (_biome, x, z) => Math.min(1, 0.28
        + marineIguanaColonyTerraceMask(x, z) * 0.46
        + marineIguanaColonyGuanoMask(x, z) * 0.38
        + marineIguanaColonyRubbleMask(x, z) * 0.28),
      wetnessAt: (x, z) => marineIguanaColonyWetShoreMask(x, z) * 0.84,
    }),
  ];
}

function buildColonyIguanas() {
  const primaryGroup = [
    [-13.6, -2.2, 1.58], [-12.2, -1.5, 1.48], [-10.8, -2.1, 1.66],
    [-14.3, -0.6, 1.42], [-12.7, 0.0, 1.7], [-11.0, -0.4, 1.5],
    [-9.5, -0.9, 1.62], [-13.7, 1.3, 1.5], [-11.8, 1.4, 1.76],
    [-10.0, 0.9, 1.46], [-8.7, 0.4, 1.58],
  ].map(([x, z, scale], index) => ({
    id: `marine-colony-primary-knot-${index}`,
    instanceId: `marine-colony-primary-knot-${index}`,
    speciesId: 'marineIguana',
    position: [x, marineIguanaColonyHeight(x, z), z],
    behavior: 'bask',
    role: 'ambient',
    sceneScale: scale,
    habitatRadiusX: 1.25,
    habitatRadiusZ: 0.9,
  }));
  const secondaryGroup = makeZonePatchScatter(MARINE_IGUANA_COLONY, 'marine-colony-secondary-iguanas', 8, 41431, {
    minX: -27,
    maxX: -7,
    minZ: -32,
    maxZ: -16,
    scale: [0.94, 1.2],
    maxGrade: 0.72,
    patchCount: 2,
    patchRadius: [3.0, 5.2],
    minPatchSeparation: 5.5,
    minItemSeparation: 1.25,
    accept: (biome, x, z, y) => y > -0.18
      && clearOfPath(x, z, 1.0)
      && marineIguanaColonyTerraceMask(x, z) > 0.28
      && (biome === 'colony-basking-terrace' || biome === 'guano-streaked-basalt' || biome === 'black-basalt-shelf'),
    suitability: (_biome, x, z) => Math.min(1, 0.42
      + marineIguanaColonyTerraceMask(x, z) * 0.36
      + marineIguanaColonyGuanoMask(x, z) * 0.26),
  }).map(item => ({
    id: item.id,
    instanceId: item.id,
    speciesId: 'marineIguana',
    position: [item.x, item.y, item.z],
    behavior: 'bask',
    role: 'ambient',
    sceneScale: item.scale,
    habitatRadiusX: 2.5,
    habitatRadiusZ: 1.8,
  }));
  return {
    id: 'marine-colony-ambient-iguanas',
    zoneId: MARINE_IGUANA_COLONY,
    loadTier: 1,
    items: [...primaryGroup, ...secondaryGroup],
  };
}

function buildBarnacleProps(rocks) {
  return rocks
    .filter(rock => rock.radiusX > 0.54 && marineIguanaColonyWetShoreMask(rock.x, rock.z) > 0.24)
    .slice(0, 12)
    .map((rock, index) => ({
      id: `marine-colony-barnacles-${index}`,
      path: `${NATURE}runtime-barnacle-cluster.glb`,
      position: [rock.x, rock.y + Math.max(0.08, rock.radiusY * 0.72), rock.z],
      rotation: [0, rock.yaw + index * 0.49, 0],
      scale: 0.09 + Math.min(0.08, rock.radiusX * 0.038),
      maxVisibleDistance: 44,
      loadTier: 2,
    }));
}

export function buildMarineIguanaColonyEcology() {
  const rocks = getMarineIguanaColonyRocks();
  const surfRocks = rocks.filter(rock => marineIguanaColonyWetShoreMask(rock.x, rock.z) > 0.18 && rock.radiusY > 0.3);
  return {
    zoneId: MARINE_IGUANA_COLONY,
    stream: true,
    streamSchedule: [120, 740, 1480],
    lagoonSurfaces: [{
      id: 'marine-colony-tidepools',
      zoneId: MARINE_IGUANA_COLONY,
      position: [0, POOL_SURFACE_Y, 0],
      bounds: { minX: -33, maxX: -20, minZ: -38, maxZ: 40 },
      geometryResolution: [88, 176],
      colorA: '#0a5b62',
      colorB: '#42b8a8',
      mudColor: '#252a26',
      algaeColor: '#426a3b',
      waterColor: '#2b9d98',
      opacity: 0.09,
      reflectivity: 0.1,
      waterAlpha: 0.84,
      waterShoreAlpha: 0.36,
      flowSpeed: 0.0022,
      flowScale: 2.4,
      flowDirection: [0.05, 0.22],
      shoreNoise: 0.04,
      maskThreshold: 0.34,
      rippleStrength: 0.64,
      distortionScale: 0.016,
      overlayLift: 0.014,
      textureWidth: 256,
      textureHeight: 512,
    }],
    flora: buildSparseFlora(),
    rocks,
    splashes: { anchors: surfRocks.slice(0, 14), period: (Math.PI * 2) / 0.5984 },
    cliffSurf: getCliffSurfProfile(MARINE_IGUANA_COLONY),
    surfaceLitter: buildColonyClutter(),
    collectibleBeachFinds: [buildBeachFindLayer(MARINE_IGUANA_COLONY, {
      id: 'marine-colony-beach-finds',
      count: 14,
      seed: 41443,
      bounds: { minX: -30, maxX: -7, minZ: -39, maxZ: 40 },
      maxGrade: 0.62,
      maxVisibleDistance: 62,
      variants: COLONY_FIND_VARIANTS,
      accept: (biome, x, z) => clearOfPath(x, z, 1.08)
        && marineIguanaColonyPoolMask(x, z) < 0.5
        && marineIguanaColonyBeachMask(x, z) > 0.26
        && (biome === 'white-shell-beach' || biome === 'wet-basalt-swash'),
    })],
    ambientWildlife: [
      buildColonyIguanas(),
      buildAmbientWildlifeLayer(MARINE_IGUANA_COLONY, {
        id: 'marine-colony-sally-lightfoot-crabs',
        speciesId: 'crab',
        count: 7,
        seed: 41459,
        bounds: { minX: -30, maxX: -8, minZ: -38, maxZ: 39 },
        scale: [0.78, 1.12],
        behavior: 'skitter',
        maxGrade: 0.8,
        habitatRadiusX: 4.2,
        habitatRadiusZ: 2.8,
        accept: (biome, x, z) => clearOfPath(x, z, 1.12)
          && marineIguanaColonyWetShoreMask(x, z) > 0.18
          && (biome === 'wet-basalt-swash' || biome === 'black-basalt-shelf' || biome === 'white-shell-beach'),
      }),
    ],
    props: buildBarnacleProps(rocks),
    footprintBiomes: ['white-shell-beach', 'colony-trail', 'wind-rounded-cinder'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 25, radiusZ: 18, height: 18, speed: 0.088, phase: 0.3, cx: -20, cz: 2, flapRate: 0.74, scale: 0.94 },
      { species: 'frigatebird', radiusX: 42, radiusZ: 24, height: 36, speed: -0.046, phase: 2.8, cx: -2, cz: 4, flapRate: 0.28, scale: 1.03 },
    ]),
  };
}
