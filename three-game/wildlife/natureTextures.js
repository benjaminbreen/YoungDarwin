import * as THREE from 'three';
import { loadRepeatingTerrainTexture } from '../world/regions/materials/pbrTerrainTextures';

import { NATURE_SURFACES } from './natureTextureCatalog';
export { GENERATED_GRASS_FIBRES } from './natureTextureCatalog';

// Keep the authored canvas albedo visible during loading and on failure. The
// shared loader decodes each file once; every caller owns its texture handles.
export function loadNatureSurface(name, fallbackAlbedo, { repeat = false, fallback = '#777064' } = {}) {
  const config = NATURE_SURFACES[name];
  if (!config) throw new Error(`Unknown nature surface: ${name}`);
  const maps = {
    map: loadRepeatingTerrainTexture(config.albedo, {
      colorSpace: THREE.SRGBColorSpace,
      fallbackImage: fallbackAlbedo?.image,
      fallback,
    }),
    normalMap: loadRepeatingTerrainTexture(config.normal, {
      fallback: [128, 128, 255, 255],
    }),
    roughnessMap: loadRepeatingTerrainTexture(config.roughnessMap, {
      fallback: [240, 240, 240, 255],
    }),
  };
  for (const texture of Object.values(maps)) {
    texture.name = `Nature:${name}`;
    if (!repeat) texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  return maps;
}

// Assign after material conversion so the final owner releases its own map
// handles. Cached procedural plant materials deliberately keep those handles
// across regions; generated tree variants release them with their materials.
export function applyNatureSurface(material, key, fallbackAlbedo, options = {}) {
  if (typeof window === 'undefined') return material;
  const maps = loadNatureSurface(key, fallbackAlbedo, options);
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.bumpMap = null;
  material.normalScale = new THREE.Vector2(0.5, 0.5);
  if (material.isMeshStandardMaterial) {
    material.roughnessMap = maps.roughnessMap;
    material.roughness = 1;
  } else {
    // Matte Phong foliage has no roughness channel.
    maps.roughnessMap.dispose();
    delete maps.roughnessMap;
  }
  material.name = `Nature:${key}`;
  material.userData.natureSurface = key;
  material.addEventListener('dispose', () => Object.values(maps).forEach(texture => texture.dispose()));
  material.needsUpdate = true;
  return material;
}

// Containers hold only resources created by the creature, never shared model
// geometry. Deferred release also protects the loader's async subscriptions
// during React development effect replay.
export function disposeCreatureResources(resources) {
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (typeof value.dispose === 'function') value.dispose();
    else Object.values(value).forEach(visit);
  };
  visit(resources);
}
