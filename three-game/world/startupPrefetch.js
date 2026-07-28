'use client';

import { getThreeSpecimens } from '../data';
import { getZoneProps } from '../physics/props/propRegistry';
import { getWildlifeAssetId } from '../wildlife/wildlifeCatalog';
import { getBeagleSightline } from './beagleSightlines';
import {
  preloadGLBPath,
  preloadModelAsset,
} from '../components/scene/ecology/EcologyRenderer';

// Content families four through six (physics props, specimens, the Beagle, and
// Syms) mount after the opening cinematic. Their GLBs were previously not even
// requested until that mount, so the first seconds of play paid network, parse,
// and texture upload all at once. Queue them onto the ecology preload pump
// while the aerial shot runs; the pump is serialized, so this warms the GLTF
// cache without competing with the frames the cinematic still needs.
const BEAGLE_HULL_PATH = '/assets/models/ships/beagle-styrbjorn.glb';

function specimenAssetId(specimen) {
  const wildlifeAssetId = getWildlifeAssetId(specimen);
  if (wildlifeAssetId) return wildlifeAssetId;
  if (specimen.id === 'dry_grass' || specimen.id === 'drygrass' || specimen.id === 'poaceae') {
    return 'dryGrassPatch';
  }
  return specimen.id;
}

export function prefetchStartupContentAssets(zoneId, { includeBeagle = true, includeSyms = true } = {}) {
  if (!zoneId || typeof window === 'undefined') return;

  getZoneProps(zoneId).forEach(prop => {
    if (prop?.visualAsset) preloadModelAsset(prop.visualAsset);
  });

  getThreeSpecimens(zoneId).forEach(specimen => {
    const assetId = specimenAssetId(specimen);
    if (assetId) preloadModelAsset(assetId);
  });

  if (includeBeagle && getBeagleSightline(zoneId)) preloadGLBPath(BEAGLE_HULL_PATH);
  if (includeSyms) preloadModelAsset('syms');
}
