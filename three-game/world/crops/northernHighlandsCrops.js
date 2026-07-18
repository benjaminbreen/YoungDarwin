import {
  NORTHERN_HIGHLANDS,
  NORTHERN_HIGHLANDS_GARDENS,
  northernHighlandsPathInfo,
} from '../regions/northernHighlands/path';
import { buildAuthoredCropFields } from './penalColonyCrops';

let cache = null;

export function buildNorthernHighlandsCropFields() {
  if (cache) return cache;
  cache = buildAuthoredCropFields({
    zoneId: NORTHERN_HIGHLANDS,
    plots: NORTHERN_HIGHLANDS_GARDENS,
    layerIdPrefix: 'northern-highlands-crops',
    itemIdPrefix: 'northern-highlands-crop',
    pathInfo: northernHighlandsPathInfo,
  });
  return cache;
}
