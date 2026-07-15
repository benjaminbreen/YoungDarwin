import { FLOREANA_PBR_TEXTURES } from './regions/materials/pbrTerrainTextures';

// The two most expensive authored destinations use a deliberately small
// albedo-only surface palette. Warm those exact HTTP resources while the player
// is approaching an edge so material creation usually hits the browser cache.
const REGION_TERRAIN_TEXTURES = {
  N_SHORE: [
    FLOREANA_PBR_TEXTURES.sandyTuff,
    FLOREANA_PBR_TEXTURES.olivineBeach,
    FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    FLOREANA_PBR_TEXTURES.dryGrassLitter,
    FLOREANA_PBR_TEXTURES.redCinderDirt,
  ],
  PENAL_COLONY: [
    FLOREANA_PBR_TEXTURES.grass,
    FLOREANA_PBR_TEXTURES.loam,
    FLOREANA_PBR_TEXTURES.redCinderDirt,
    FLOREANA_PBR_TEXTURES.dryGrassLitter,
  ],
};

const prefetchedPaths = new Set();

export function prefetchRegionTerrainTextures(regionId) {
  if (typeof window === 'undefined' || typeof window.Image !== 'function') return;
  for (const textureSet of REGION_TERRAIN_TEXTURES[regionId] || []) {
    const path = textureSet?.albedo;
    if (!path || prefetchedPaths.has(path)) continue;
    prefetchedPaths.add(path);
    const image = new window.Image();
    image.decoding = 'async';
    image.src = path;
  }
}
