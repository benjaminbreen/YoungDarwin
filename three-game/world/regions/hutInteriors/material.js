import * as THREE from 'three';

// The hut scenes draw their own floors and the exterior apron runs right up
// to the walls, so the region's terrain mesh writes nothing to the screen.
// It still exists for the registry contract and for pointer picking.
export function createHutInteriorTerrainMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#000000',
    colorWrite: false,
    depthWrite: false,
  });
}
