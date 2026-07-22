import { makeZoneScatter, varyScatterTransforms } from '../scatter';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { getSoutheasternCoastRocks } from '../southeasternCoastLayout';
import {
  SOUTHEASTERN_COAST,
  southeasternCoastPathInfo,
  southeasternCoastSaltExposure,
  southeasternCoastScrubStrength,
  southeasternCoastWetShoreMask,
} from '../regions/southeasternCoast/path';
import { buildAmbientWildlifeLayer } from './ambientWildlife';
import { buildDryVolcanicLitterLayer } from './dryVolcanicLitter';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';
const scatter = (layer, count, seed, options) => makeZoneScatter(SOUTHEASTERN_COAST, layer, count, seed, options);

function clearOfPath(x, z, multiplier = 1.45) {
  const path = southeasternCoastPathInfo(x, z);
  return path.distance > path.width * multiplier;
}

function buildFlora() {
  const saltbush = varyScatterTransforms(scatter('southeast-saltbush', 148, 73301, {
    minX: -48, maxX: 31, minZ: -43, maxZ: 43, scale: [0.68, 1.3], maxGrade: 0.78,
    accept: (biome, x, z) => (biome === 'wind-pruned-scrub' || biome === 'salt-scoured-coast')
      && clearOfPath(x, z)
      && southeasternCoastScrubStrength(x, z) > 0.16,
  }), 73301, { width: [0.84, 1.28], height: [0.68, 1.05], depth: [0.86, 1.25], maxLean: 0.045 });
  const croton = varyScatterTransforms(scatter('southeast-croton', 46, 73313, {
    minX: -46, maxX: 19, minZ: -41, maxZ: 41, scale: [0.58, 0.96], maxGrade: 0.72,
    accept: (biome, x, z) => biome === 'wind-pruned-scrub'
      && clearOfPath(x, z, 1.7)
      && southeasternCoastScrubStrength(x, z) > 0.42,
  }), 73313, { width: [0.85, 1.18], height: [0.7, 1.05], depth: [0.86, 1.16], maxLean: 0.035 });
  const cotton = varyScatterTransforms(scatter('southeast-cotton', 28, 73327, {
    minX: -45, maxX: 14, minZ: -40, maxZ: 40, scale: [0.55, 0.88], maxGrade: 0.68,
    accept: (biome, x, z) => biome === 'wind-pruned-scrub'
      && clearOfPath(x, z, 1.75)
      && southeasternCoastScrubStrength(x, z) > 0.5,
  }), 73327, { width: [0.86, 1.16], height: [0.74, 1.08], depth: [0.88, 1.14], maxLean: 0.028 });
  const sesuvium = varyScatterTransforms(scatter('southeast-sesuvium', 48, 73339, {
    minX: 17, maxX: 38, minZ: -42, maxZ: 42, scale: [0.78, 1.6], maxGrade: 0.78,
    accept: (biome, x, z) => (biome === 'salt-scoured-coast' || biome === 'broken-basalt-shelf')
      && clearOfPath(x, z, 1.2)
      && southeasternCoastSaltExposure(x, z) > 0.58,
  }), 73339, { width: [0.88, 1.32], height: [0.42, 0.72], depth: [0.9, 1.3], maxLean: 0.02 });
  return [
    { id: 'southeast-saltbush-a', path: `${NATURE}runtime-saltbush-1.glb`, sink: 0.06, castShadow: false, tint: '#687650', tintStrength: 0.2, motion: { wind: 1.34, bend: 0.36, bendRadius: 1.18 }, items: saltbush.filter((_, i) => i % 2 === 0) },
    { id: 'southeast-saltbush-b', path: `${NATURE}runtime-saltbush-2.glb`, sink: 0.06, castShadow: false, tint: '#5e7049', tintStrength: 0.22, motion: { wind: 1.38, bend: 0.38, bendRadius: 1.16 }, items: saltbush.filter((_, i) => i % 2 === 1) },
    { id: 'southeast-croton', path: `${NATURE}runtime-croton.glb`, sink: 0.07, castShadow: false, tint: '#69764e', tintStrength: 0.2, motion: { wind: 1.2, bend: 0.3, bendRadius: 1.3 }, items: croton },
    { id: 'southeast-galapagos-cotton', path: `${NATURE}runtime-galapagos-cotton.glb`, sink: 0.06, castShadow: false, tint: '#77835a', tintStrength: 0.18, motion: { wind: 1.14, bend: 0.27, bendRadius: 1.34 }, items: cotton },
    { id: 'southeast-spray-line-sesuvium', path: `${NATURE}runtime-sesuvium.glb`, sink: 0.035, castShadow: false, ySquash: 0.24, tint: '#657d49', tintStrength: 0.22, motion: { wind: 0.76, bend: 0.16, bendRadius: 1.0 }, items: sesuvium },
  ];
}

function buildLitter() {
  return [buildDryVolcanicLitterLayer({
    zoneId: SOUTHEASTERN_COAST,
    id: 'southeast-broken-basalt-litter',
    itemIdPrefix: 'southeast-basalt-chip',
    count: 520,
    seed: 73367,
    bounds: { minX: -48, maxX: 38, minZ: -43, maxZ: 43 },
    scale: [0.5, 1.5],
    maxVisibleDistance: 58,
    maxGrade: 0.78,
    variantOptions: [
      { variant: 'basalt-pebble', weight: 0.74, colors: ['#252a27', '#353730', '#49463b'] },
      { variant: 'limestone-chip', weight: 0.08, colors: ['#9b927c', '#7f7b6c'] },
      { variant: 'shell-shard-a', weight: 0.18, colors: ['#b9b09a', '#8e8b7d'] },
    ],
    accept: (biome, x, z) => clearOfPath(x, z, 1.08)
      && (biome === 'broken-basalt-shelf' || biome === 'salt-scoured-coast' || biome === 'open-dry-scrub'),
    wetnessAt: (x, z) => southeasternCoastWetShoreMask(x, z),
  })];
}

export function buildSoutheasternCoastEcology() {
  const rocks = getSoutheasternCoastRocks();
  const surfRocks = rocks.filter(rock => southeasternCoastWetShoreMask(rock.x, rock.z) > 0.16 && rock.radiusY > 0.28);
  return {
    zoneId: SOUTHEASTERN_COAST,
    flora: buildFlora(),
    rocks,
    splashes: { anchors: surfRocks.slice(0, 16), period: (Math.PI * 2) / 0.5984 },
    cliffSurf: getCliffSurfProfile(SOUTHEASTERN_COAST),
    surfaceLitter: buildLitter(),
    ambientWildlife: [
      buildAmbientWildlifeLayer(SOUTHEASTERN_COAST, {
        id: 'southeast-sally-lightfoot-crabs', speciesId: 'crab', count: 6, seed: 73381,
        bounds: { minX: 21, maxX: 38, minZ: -39, maxZ: 39 }, scale: [0.78, 1.12], behavior: 'skitter', maxGrade: 0.82,
        habitatRadiusX: 3.8, habitatRadiusZ: 2.4,
        accept: (biome, x, z) => clearOfPath(x, z, 1.05)
          && southeasternCoastWetShoreMask(x, z) > 0.12
          && (biome === 'wet-basalt-swash' || biome === 'broken-basalt-shelf'),
      }),
      buildAmbientWildlifeLayer(SOUTHEASTERN_COAST, {
        id: 'southeast-lava-lizards', speciesId: 'lavaLizard', count: 4, seed: 73393,
        bounds: { minX: -34, maxX: 18, minZ: -34, maxZ: 34 }, scale: [0.82, 1.06], behavior: 'scurry', maxGrade: 0.68,
        habitatRadiusX: 4.5, habitatRadiusZ: 3,
        accept: (biome, x, z) => clearOfPath(x, z, 1.25)
          && (biome === 'open-dry-scrub' || biome === 'wind-pruned-scrub'),
      }),
    ],
    footprintBiomes: ['coastal-cinder-trail', 'open-dry-scrub', 'wind-pruned-scrub', 'salt-scoured-coast'],
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 28, radiusZ: 17, height: 19, speed: 0.075, phase: 0.4, cx: 23, cz: -4, flapRate: 0.8 },
      { species: 'frigatebird', radiusX: 42, radiusZ: 25, height: 35, speed: -0.044, phase: 2.7, cx: 4, cz: 2, flapRate: 0.3 },
    ]),
  };
}
