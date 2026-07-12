import * as THREE from 'three';

export function createLawsonHouseTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#3f2d20',
    roughness: 0.96,
    metalness: 0,
  });
}
