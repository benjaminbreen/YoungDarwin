import { getModelAsset } from '../../modelAssets';
import { makeZonePatchScatter, varyScatterTransforms } from '../scatter';
import { DARWINIOTHAMNUS_SPECIES } from './floraSpecies';

export { DARWINIOTHAMNUS_SPECIES };
export const DARWINIOTHAMNUS_LABEL = DARWINIOTHAMNUS_SPECIES.label;

export const DARWINIOTHAMNUS_PATH = getModelAsset('darwiniothamnusShrub')?.path
  || '/assets/models/nature/runtime-darwiniothamnus.glb';

// Each mesh in the optimized GLB is a complete centered shrub form. The
// instanced ecology renderer assigns one mesh variant to each scatter item.
export const DARWINIOTHAMNUS_VARIANT_MODE = 'mesh';

export function makeDarwiniothamnusPatchScatter(zoneId, layer, count, seed, options, transformOptions = {}) {
  return varyScatterTransforms(makeZonePatchScatter(zoneId, layer, count, seed, {
    scale: DARWINIOTHAMNUS_SPECIES.placement.scale,
    scaleExponent: DARWINIOTHAMNUS_SPECIES.placement.scaleExponent,
    ...options,
    variantCount: 9,
  }), seed + 1, transformOptions);
}
