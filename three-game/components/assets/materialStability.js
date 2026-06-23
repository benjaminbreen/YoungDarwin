import * as THREE from 'three';

export function stabilizeFoliageMaterial(material, options = {}) {
  if (!material) return material;
  const doubleSide = options.doubleSide === true;
  const forceCutout = options.forceCutout === true;
  const texture = material.map || material.alphaMap || null;

  if (texture) {
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.max(texture.anisotropy || 1, options.anisotropy || 4);
    texture.generateMipmaps = texture.generateMipmaps !== false;
  }

  if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.02);
  if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.86);

  const opacity = material.opacity ?? 1;
  const hasCutout = forceCutout
    || material.alphaTest > 0
    || Boolean(material.alphaMap)
    || (material.transparent && Boolean(material.map) && opacity > 0.96);

  if (hasCutout) {
    material.alphaTest = Math.max(material.alphaTest || 0, options.alphaTest || 0.34);
    material.alphaToCoverage = true;
    material.transparent = false;
    material.depthWrite = true;
  }

  if (doubleSide || hasCutout) material.side = THREE.DoubleSide;
  material.needsUpdate = true;
  return material;
}
