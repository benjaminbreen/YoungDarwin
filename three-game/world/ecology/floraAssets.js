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

export const MATURE_OPUNTIA_PATH = '/assets/models/nature/runtime-big-opuntia.glb';
export const MATURE_OPUNTIA_PLACEMENT = Object.freeze({
  // The source tree is about 1.18 m high. These scales produce roughly
  // 3.7–6.4 m adults while leaving the 0.75–1.3 scale range to the breakable
  // juvenile simulation.
  scale: [3.1, 5.4],
  scaleExponent: 1.2,
  patchRadius: [7.5, 12],
  maxGrade: 0.58,
  variation: {
    width: [0.92, 1.08],
    height: [0.94, 1.08],
    depth: [0.92, 1.08],
    maxLean: 0.012,
  },
});

export function makeDarwiniothamnusPatchScatter(zoneId, layer, count, seed, options, transformOptions = {}) {
  return varyScatterTransforms(makeZonePatchScatter(zoneId, layer, count, seed, {
    scale: DARWINIOTHAMNUS_SPECIES.placement.scale,
    scaleExponent: DARWINIOTHAMNUS_SPECIES.placement.scaleExponent,
    ...options,
    variantCount: 9,
  }), seed + 1, transformOptions);
}
