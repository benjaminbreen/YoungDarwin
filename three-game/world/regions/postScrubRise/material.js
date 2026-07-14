import {
  DRY_FLOREANA_TEXTURE_SETS,
  createDryFloreanaTerrainMaterial,
} from '../materials/dryFloreanaTerrain';
import { POST_SCRUB_RISE_PATH_POINTS } from './path';

const POST_SCRUB_RISE_TEXTURE_SET = {
  ...DRY_FLOREANA_TEXTURE_SETS.redDirtHighland,
  shoulderGround: '/assets/textures/world/floreana-pbr/coastal-scrub_albedo.png',
  dryGrassGround: '/assets/textures/world/floreana-pbr/dry-grass-litter_albedo.png',
  paleFlecks: '/assets/textures/world/floreana-pbr/dark-basalt-gravel_albedo.png',
  fallbacks: {
    redDirt: '#8f4828',
    shoulderGround: '#5f6338',
    dryGrassGround: '#8b7d4d',
    paleFlecks: '#2d2c28',
  },
};

const POST_SCRUB_RISE_SPLAT_BOUNDS = {
  originX: -58,
  originZ: -54,
  width: 116,
  depth: 108,
  size: 1024,
};

export function createPostScrubRiseTerrainMaterial() {
  return createDryFloreanaTerrainMaterial({
    pathPoints: POST_SCRUB_RISE_PATH_POINTS,
    pathSplatBounds: POST_SCRUB_RISE_SPLAT_BOUNDS,
    pathMinimumWidth: 1.62,
    textureSet: POST_SCRUB_RISE_TEXTURE_SET,
    cacheKey: 'post-office-scrub-rise-earth-pbr-v2',
    highFadeStart: 6.6,
    highFadeEnd: 9.4,
    roughness: 0.97,
    // Retain the authored brown soil color while restoring the detailed
    // pebble/cinder albedo that the old generic terrain displayed.
    earthFloorStrength: 0.94,
  });
}
