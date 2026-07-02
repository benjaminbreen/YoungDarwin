import * as THREE from 'three';

const FLOREANA_PBR_BASE = '/assets/textures/world/floreana-pbr';

export const FLOREANA_PBR_TEXTURES = {
  sandyTuff: {
    albedo: `${FLOREANA_PBR_BASE}/sandy-tuff_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/sandy-tuff_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/sandy-tuff_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/sandy-tuff_height.png`,
    displacement: `${FLOREANA_PBR_BASE}/sandy-tuff_displacement.png`,
    scale: 0.24,
    normalStrength: 0.42,
    roughnessMix: 0.72,
    fallbacks: {
      albedo: '#b9b09b',
      normal: [128, 128, 255, 255],
      roughness: [226, 226, 226, 255],
      height: [128, 128, 128, 255],
    },
  },
};

function rgbaFromHex(hex) {
  const color = new THREE.Color(hex);
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ];
}

function fallbackTexture(rgba, colorSpace) {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function loadRepeatingTerrainTexture(path, {
  fallback = [255, 255, 255, 255],
  colorSpace = THREE.NoColorSpace,
  anisotropy = 8,
} = {}) {
  const rgba = typeof fallback === 'string' ? rgbaFromHex(fallback) : fallback;
  const isFallback = typeof window === 'undefined';
  const texture = isFallback
    ? fallbackTexture(rgba, colorSpace)
    : new THREE.TextureLoader().load(path);

  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  return texture;
}

export function loadPbrTerrainSet(textureSet) {
  return {
    albedo: loadRepeatingTerrainTexture(textureSet.albedo, {
      fallback: textureSet.fallbacks?.albedo || '#ffffff',
      colorSpace: THREE.SRGBColorSpace,
    }),
    normal: loadRepeatingTerrainTexture(textureSet.normal, {
      fallback: textureSet.fallbacks?.normal || [128, 128, 255, 255],
      colorSpace: THREE.NoColorSpace,
    }),
    roughness: loadRepeatingTerrainTexture(textureSet.roughness, {
      fallback: textureSet.fallbacks?.roughness || [230, 230, 230, 255],
      colorSpace: THREE.NoColorSpace,
    }),
  };
}
