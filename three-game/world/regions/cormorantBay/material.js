import { createCormorantBayTest3TerrainMaterial } from '../cormorantBayTest3/material';

export function createCormorantBayTerrainMaterial() {
  const material = createCormorantBayTest3TerrainMaterial();
  material.customProgramCacheKey = () => 'cormorant-bay-v1';
  return material;
}
