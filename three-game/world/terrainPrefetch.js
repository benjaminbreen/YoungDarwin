import { FLOREANA_PBR_TEXTURES } from './regions/materials/pbrTerrainTextures';

// Warm color while the player is approaching an edge or considering a map
// destination. Packed NRH PNGs are intentionally left to the terrain loader:
// decoding them through throwaway Image elements here duplicated expensive
// decode work immediately before the destination material mounted.
const REGION_TERRAIN_TEXTURES = {
  POST_OFFICE_BAY: [
    FLOREANA_PBR_TEXTURES.sandyTuff,
    FLOREANA_PBR_TEXTURES.galapagosSand,
    FLOREANA_PBR_TEXTURES.whiteSandBeach,
    FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    FLOREANA_PBR_TEXTURES.redCinderDirt,
  ],
  POST_SCRUB_RISE: [
    FLOREANA_PBR_TEXTURES.coastalScrub,
    FLOREANA_PBR_TEXTURES.dryGrassLitter,
    FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    FLOREANA_PBR_TEXTURES.redCinderDirt,
  ],
  LAVA_FLATS: [
    FLOREANA_PBR_TEXTURES.darkBasaltGravel,
    FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    FLOREANA_PBR_TEXTURES.oxidizedScoriaceousBasalt,
  ],
  NORTHERN_HIGHLANDS: [
    FLOREANA_PBR_TEXTURES.coastalScrub,
    FLOREANA_PBR_TEXTURES.grass,
    FLOREANA_PBR_TEXTURES.weatheredHighlandBasalt,
    FLOREANA_PBR_TEXTURES.loam,
  ],
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
    for (const path of [textureSet?.albedo]) {
      if (!path || prefetchedPaths.has(path)) continue;
      prefetchedPaths.add(path);
      const image = new window.Image();
      image.decoding = 'async';
      image.src = path;
    }
  }
}
