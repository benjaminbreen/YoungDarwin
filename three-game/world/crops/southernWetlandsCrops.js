import { SOUTHERN_WETLANDS, WETLANDS_GARDENS, wetlandsTrailInfluence } from '../regions/southernWetlands/terrain';
import { buildAuthoredCropFields } from './penalColonyCrops';

let cache = null;

// Sweet potato and maize on the rancho's ridged plots in the Wetlands Forest.
export function buildSouthernWetlandsCropFields() {
  if (cache) return cache;
  cache = buildAuthoredCropFields({
    zoneId: SOUTHERN_WETLANDS,
    plots: WETLANDS_GARDENS,
    layerIdPrefix: 'southern-wetlands-crops',
    itemIdPrefix: 'southern-wetlands-crop',
    excludeAt: (x, z) => wetlandsTrailInfluence(x, z, 1.0, 2.6) > 0.5,
  });
  return cache;
}
