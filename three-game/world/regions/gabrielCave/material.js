import * as THREE from 'three';

// The cave floor is drawn by the rock shell (interiors/cave/CaveShell.jsx);
// this material only exists to satisfy the region registry contract.
export function createGabrielCaveTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#2f2a26',
    roughness: 0.96,
    metalness: 0,
  });
}
