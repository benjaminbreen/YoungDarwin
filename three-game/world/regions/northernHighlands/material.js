import { NORTHERN_HIGHLANDS_PATH_POINTS } from './path';
import { createNorthernHighlandsPbrMaterial } from './pbrMaterial';

const NORTHERN_HIGHLANDS_SPLAT_BOUNDS = {
  originX: -58,
  originZ: -54,
  width: 116,
  depth: 108,
  size: 768,
};

export function createNorthernHighlandsTerrainMaterial() {
  return createNorthernHighlandsPbrMaterial({
    pathPoints: NORTHERN_HIGHLANDS_PATH_POINTS,
    pathSplatBounds: NORTHERN_HIGHLANDS_SPLAT_BOUNDS,
    pathMinimumWidth: 1.58,
  });
}
