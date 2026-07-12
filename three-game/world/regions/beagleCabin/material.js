import * as THREE from 'three';

export function createBeagleCabinTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#32251a',
    roughness: 0.94,
    metalness: 0,
  });
}
