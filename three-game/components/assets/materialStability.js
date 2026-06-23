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

// Downgrade a (matte, non-metal) MeshStandardMaterial to a MeshPhongMaterial.
// The world's vegetation/terrain are forced matte (metalness ~0, roughness high),
// so the full Cook-Torrance specular + IBL that MeshStandardMaterial runs per
// fragment produces almost nothing visible — it's pure fillrate waste. Phong with
// no specular gives the same matte diffuse look per fragment at a fraction of the
// shader cost. Both the foliage-wind and terrain-caustics onBeforeCompile hooks
// patch only core chunks (<common>, <project_vertex>, <begin_vertex>,
// <opaque_fragment>) that exist identically in Phong, so they survive the swap.
// Returns a NEW material; callers own disposal.
export function toMattePhong(src) {
  if (!src || src.isMeshPhongMaterial || src.isShaderMaterial || src.isRawShaderMaterial) return src;
  const m = new THREE.MeshPhongMaterial();
  m.shininess = 0;
  m.specular.setRGB(0, 0, 0); // matte: no highlight
  if (src.color) m.color.copy(src.color);
  if (src.emissive) m.emissive.copy(src.emissive);
  m.emissiveIntensity = src.emissiveIntensity ?? 1;
  m.map = src.map || null;
  m.emissiveMap = src.emissiveMap || null;
  m.alphaMap = src.alphaMap || null;
  m.aoMap = src.aoMap || null;
  m.aoMapIntensity = src.aoMapIntensity ?? 1;
  m.lightMap = src.lightMap || null;
  m.lightMapIntensity = src.lightMapIntensity ?? 1;
  if (src.normalMap) {
    m.normalMap = src.normalMap;
    if (src.normalScale) m.normalScale.copy(src.normalScale);
  }
  if (src.bumpMap) {
    m.bumpMap = src.bumpMap;
    m.bumpScale = src.bumpScale ?? 1;
  }
  m.vertexColors = src.vertexColors;
  m.flatShading = src.flatShading;
  m.transparent = src.transparent;
  m.opacity = src.opacity ?? 1;
  m.alphaTest = src.alphaTest ?? 0;
  m.alphaToCoverage = src.alphaToCoverage;
  m.depthWrite = src.depthWrite;
  m.depthTest = src.depthTest;
  m.side = src.side;
  m.toneMapped = src.toneMapped;
  m.fog = src.fog;
  m.dithering = src.dithering;
  m.blending = src.blending;
  m.premultipliedAlpha = src.premultipliedAlpha;
  m.wireframe = src.wireframe;
  m.name = src.name;
  if (src.userData) m.userData = { ...src.userData };
  m.needsUpdate = true;
  return m;
}
