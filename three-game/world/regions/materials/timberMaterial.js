import * as THREE from 'three';
import { loadRepeatingTerrainTexture } from './pbrTerrainTextures';

// Weathered-timber PBR material for authored wooden structures (the Watkins
// cabin, loose boards). Reuses the HMS Beagle deck's Planks037A texture set so
// all shipwright wood in the game shares one grain. Tint greys the fresh
// plank color toward sun-bleached driftwood.

const WOOD_BASE = '/assets/textures/world/beagle-deck/Planks037A_1K-JPG';

export function createTimberMaterial({
  tint = '#9a9186',
  repeat = [0.85, 0.85],
  offset = [0, 0],
  rotation = 0,
  normalScale = 0.7,
  roughness = 1.0,
} = {}) {
  const map = loadRepeatingTerrainTexture(`${WOOD_BASE}_Color.jpg`, {
    fallback: '#8a7a66',
    colorSpace: THREE.SRGBColorSpace,
  });
  const normalMap = loadRepeatingTerrainTexture(`${WOOD_BASE}_NormalGL.jpg`, {
    fallback: [128, 128, 255, 255],
  });
  const roughnessMap = loadRepeatingTerrainTexture(`${WOOD_BASE}_Roughness.jpg`, {
    fallback: [225, 225, 225, 255],
  });
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.repeat.set(repeat[0], repeat[1]);
    texture.offset.set(offset[0], offset[1]);
    texture.center.set(0.5, 0.5);
    texture.rotation = rotation;
  }
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    color: tint,
    roughness,
    metalness: 0.01,
    normalScale: new THREE.Vector2(normalScale, normalScale),
  });
}
