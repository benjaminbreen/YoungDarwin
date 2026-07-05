import * as THREE from 'three';

export function createDevilsCrownTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
  });
  material.customProgramCacheKey = () => 'devils-crown-vertex-basalt-coral-v1';
  return material;
}
