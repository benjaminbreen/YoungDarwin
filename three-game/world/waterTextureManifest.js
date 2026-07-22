export const WATER_BAKE_SIZE = 150;
export const WATER_BAKE_RESOLUTIONS = Object.freeze([256, 384, 512]);
export const WATER_RIPPLE_NORMAL_SIZE = 256;
export const WATER_CONTACT_RESOLUTION = 256;
const HIDDEN_WATER_REGION_TYPES = new Set([
  'interior',
  'office',
  'governorslibrary',
  'governorshouse',
  'cave',
]);

export function waterBakeResolutionForQuality(quality) {
  if (quality === 'cinematic') return 512;
  if (quality === 'polished') return 384;
  return 256;
}

export function waterContactResolutionForQuality(quality) {
  return quality === 'cinematic' ? WATER_CONTACT_RESOLUTION : 1;
}

export function waterBakeAssetStem(zoneId) {
  return String(zoneId || 'POST_OFFICE_BAY').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function regionTypeRendersDetailedWater(regionType) {
  return !HIDDEN_WATER_REGION_TYPES.has(regionType);
}
