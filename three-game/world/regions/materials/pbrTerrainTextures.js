import * as THREE from 'three';

const FLOREANA_PBR_BASE = '/assets/textures/world/floreana-pbr';

export const FLOREANA_PBR_TEXTURES = {
  sandyTuff: {
    albedo: `${FLOREANA_PBR_BASE}/sandy-tuff_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/sandy-tuff_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/sandy-tuff_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/sandy-tuff_height.png`,
    displacement: `${FLOREANA_PBR_BASE}/sandy-tuff_displacement.png`,
    nrh: `${FLOREANA_PBR_BASE}/sandy-tuff_nrh.png`,
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
  sandyBeach: {
    albedo: `${FLOREANA_PBR_BASE}/sandy-beach_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/sandy-beach_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/sandy-beach_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/sandy-beach_height.png`,
    scale: 0.23,
    normalStrength: 0.18,
    roughnessMix: 0.72,
    fallbacks: {
      albedo: '#c6b884',
      normal: [128, 128, 255, 255],
      roughness: [224, 224, 224, 255],
      height: [128, 128, 128, 255],
    },
  },
  whiteSand: {
    albedo: `${FLOREANA_PBR_BASE}/white-sand_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/white-sand_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/white-sand_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/white-sand_height.png`,
    scale: 0.22,
    normalStrength: 0.24,
    roughnessMix: 0.78,
    fallbacks: {
      albedo: '#e4d8be',
      normal: [128, 128, 255, 255],
      roughness: [236, 236, 236, 255],
      height: [128, 128, 128, 255],
    },
  },
  // Reusable lightweight shell-sand beach layer. Its warm variation is baked
  // into the albedo and its packed NRH is half-resolution: authored region
  // shaders only need one color lookup and one data lookup per PBR stage.
  whiteSandBeach: {
    albedo: `${FLOREANA_PBR_BASE}/white-sand-beach_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/galapagos-sand_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/galapagos-sand_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/galapagos-sand_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/white-sand-beach_nrh.png`,
    scale: 0.22,
    normalStrength: 0.22,
    roughnessMix: 0.78,
    roughnessMin: 0.88,
    roughnessMax: 0.98,
    fallbacks: {
      albedo: '#e4d8be',
      normal: [128, 128, 255, 255],
      roughness: [236, 236, 236, 255],
      height: [128, 128, 128, 255],
    },
  },
  whiterSand: {
    albedo: `${FLOREANA_PBR_BASE}/whiter-sand_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/whiter-sand_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/whiter-sand_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/whiter-sand_height.png`,
    scale: 0.2,
    normalStrength: 0.18,
    roughnessMix: 0.76,
    fallbacks: {
      albedo: '#eee3cc',
      normal: [128, 128, 255, 255],
      roughness: [236, 236, 236, 255],
      height: [128, 128, 128, 255],
    },
  },
  normalSand: {
    albedo: `${FLOREANA_PBR_BASE}/normal-sand_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/normal-sand_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/normal-sand_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/normal-sand_height.png`,
    scale: 0.22,
    normalStrength: 0.22,
    roughnessMix: 0.76,
    fallbacks: {
      albedo: '#c5a675',
      normal: [128, 128, 255, 255],
      roughness: [232, 232, 232, 255],
      height: [128, 128, 128, 255],
    },
  },
  galapagosSand: {
    albedo: `${FLOREANA_PBR_BASE}/galapagos-sand_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/galapagos-sand_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/galapagos-sand_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/galapagos-sand_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/galapagos-sand_nrh.png`,
    scale: 0.22,
    normalStrength: 0.24,
    roughnessMix: 0.8,
    fallbacks: {
      albedo: '#bca270',
      normal: [128, 128, 255, 255],
      roughness: [232, 232, 232, 255],
      height: [128, 128, 128, 255],
    },
  },
  redCinderDirt: {
    albedo: `${FLOREANA_PBR_BASE}/red-cinder-dirt_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/red-cinder-dirt_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/red-cinder-dirt_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/red-cinder-dirt_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/red-cinder-dirt_nrh.png`,
    scale: 0.24,
    normalStrength: 0.38,
    roughnessMix: 0.78,
    fallbacks: {
      albedo: '#8f4828',
      normal: [128, 128, 255, 255],
      roughness: [232, 232, 232, 255],
      height: [128, 128, 128, 255],
    },
  },
  darkBasaltGravel: {
    albedo: `${FLOREANA_PBR_BASE}/dark-basalt-gravel_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/dark-basalt-gravel_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/dark-basalt-gravel_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/dark-basalt-gravel_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/dark-basalt-gravel_nrh.png`,
    scale: 0.3,
    normalStrength: 0.58,
    roughnessMix: 0.84,
    fallbacks: {
      albedo: '#2d2c28',
      normal: [128, 128, 255, 255],
      roughness: [226, 226, 226, 255],
      height: [128, 128, 128, 255],
    },
  },
  galapagosOlivineBasalt: {
    albedo: `${FLOREANA_PBR_BASE}/galapagos_olivine_basalt_albedo_1024.png`,
    normal: `${FLOREANA_PBR_BASE}/galapagos_olivine_basalt_normal_opengl_1024.png`,
    roughness: `${FLOREANA_PBR_BASE}/galapagos_olivine_basalt_roughness_1024.png`,
    height: null,
    scale: 0.34,
    normalStrength: 0.54,
    roughnessMix: 0.82,
    fallbacks: {
      albedo: '#2c302e',
      normal: [128, 128, 255, 255],
      roughness: [220, 220, 220, 255],
      height: [128, 128, 128, 255],
    },
  },
  weatheredHighlandBasalt: {
    albedo: `${FLOREANA_PBR_BASE}/weathered_highland_basalt_albedo_1024.webp`,
    normal: `${FLOREANA_PBR_BASE}/weathered_highland_basalt_normal_opengl_1024.png`,
    roughness: `${FLOREANA_PBR_BASE}/weathered_highland_basalt_roughness_1024.png`,
    height: `${FLOREANA_PBR_BASE}/weathered_highland_basalt_height_1024.png`,
    nrh: `${FLOREANA_PBR_BASE}/weathered_highland_basalt_nrh_1024.png`,
    scale: 0.3,
    normalStrength: 0.48,
    roughnessMix: 0.88,
    fallbacks: {
      albedo: '#656965',
      normal: [128, 128, 255, 255],
      roughness: [232, 232, 232, 255],
      height: [128, 128, 128, 255],
    },
  },
  oxidizedScoriaceousBasalt: {
    albedo: `${FLOREANA_PBR_BASE}/oxidized_scoriaceous_basalt_albedo_1024.png`,
    normal: `${FLOREANA_PBR_BASE}/oxidized_scoriaceous_basalt_normal_opengl_1024.png`,
    roughness: `${FLOREANA_PBR_BASE}/oxidized_scoriaceous_basalt_roughness_1024.png`,
    height: `${FLOREANA_PBR_BASE}/oxidized_scoriaceous_basalt_height_1024.png`,
    nrh: `${FLOREANA_PBR_BASE}/oxidized_scoriaceous_basalt_nrh_1024.png`,
    scale: 0.42,
    normalStrength: 0.62,
    roughnessMix: 0.92,
    fallbacks: {
      albedo: '#86371f',
      normal: [128, 128, 255, 255],
      roughness: [240, 240, 240, 255],
      height: [128, 128, 128, 255],
    },
  },
  wetBasalt: {
    albedo: `${FLOREANA_PBR_BASE}/wet-basalt_albedo.png`,
    normal: `${FLOREANA_PBR_BASE}/wet-basalt_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/wet-basalt_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/wet-basalt_height.png`,
    scale: 0.22,
    normalStrength: 0.52,
    roughnessMix: 0.9,
    fallbacks: {
      albedo: '#182426',
      normal: [128, 128, 255, 255],
      roughness: [132, 132, 132, 255],
      height: [128, 128, 128, 255],
    },
  },
  coastalGrassShoulder: {
    albedo: `${FLOREANA_PBR_BASE}/coastal-grass-shoulder_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/coastal-grass-shoulder_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/coastal-grass-shoulder_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/coastal-grass-shoulder_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/coastal-grass-shoulder_nrh.png`,
    scale: 0.18,
    normalStrength: 0.32,
    roughnessMix: 0.76,
    fallbacks: {
      albedo: '#6f6a3f',
      normal: [128, 128, 255, 255],
      roughness: [238, 238, 238, 255],
      height: [128, 128, 128, 255],
    },
  },
  dryGrassLitter: {
    albedo: `${FLOREANA_PBR_BASE}/dry-grass-litter_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/dry-grass-litter_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/dry-grass-litter_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/dry-grass-litter_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/dry-grass-litter_nrh.png`,
    scale: 0.19,
    normalStrength: 0.3,
    roughnessMix: 0.74,
    fallbacks: {
      albedo: '#8b7d4d',
      normal: [128, 128, 255, 255],
      roughness: [238, 238, 238, 255],
      height: [128, 128, 128, 255],
    },
  },
  coastalScrub: {
    albedo: `${FLOREANA_PBR_BASE}/coastal-scrub_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/coastal-scrub_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/coastal-scrub_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/coastal-scrub_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/coastal-scrub_nrh.png`,
    scale: 0.16,
    normalStrength: 0.28,
    roughnessMix: 0.68,
    fallbacks: {
      albedo: '#5f6338',
      normal: [128, 128, 255, 255],
      roughness: [235, 235, 235, 255],
      height: [128, 128, 128, 255],
    },
  },
  grass: {
    albedo: `${FLOREANA_PBR_BASE}/grass_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/grass_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/grass_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/grass_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/grass_nrh.png`,
    scale: 0.15,
    normalStrength: 0.25,
    roughnessMix: 0.7,
    fallbacks: {
      albedo: '#4d6a34',
      normal: [128, 128, 255, 255],
      roughness: [230, 230, 230, 255],
      height: [128, 128, 128, 255],
    },
  },
  loam: {
    albedo: `${FLOREANA_PBR_BASE}/loam_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/loam_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/loam_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/loam_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/loam_nrh.png`,
    scale: 0.2,
    normalStrength: 0.34,
    roughnessMix: 0.8,
    fallbacks: {
      albedo: '#403225',
      normal: [128, 128, 255, 255],
      roughness: [220, 220, 220, 255],
      height: [128, 128, 128, 255],
    },
  },
  olivineBeach: {
    albedo: `${FLOREANA_PBR_BASE}/olivine-beach_albedo.webp`,
    normal: `${FLOREANA_PBR_BASE}/olivine-beach_normal.png`,
    roughness: `${FLOREANA_PBR_BASE}/olivine-beach_roughness.png`,
    height: `${FLOREANA_PBR_BASE}/olivine-beach_height.png`,
    nrh: `${FLOREANA_PBR_BASE}/olivine-beach_nrh.png`,
    scale: 0.23,
    normalStrength: 0.3,
    roughnessMix: 0.78,
    roughnessMin: 0.78,
    roughnessMax: 0.94,
    fallbacks: {
      albedo: '#9b9a64',
      normal: [128, 128, 255, 255],
      roughness: [228, 228, 228, 255],
      height: [128, 128, 128, 255],
    },
  },
  mangroveLagoon: {
    albedo: `${FLOREANA_PBR_BASE}/mangrove-lagoon_albedo.png`,
    normal: null,
    roughness: null,
    height: null,
    scale: 0.18,
    normalStrength: 0.16,
    roughnessMix: 0.5,
    fallbacks: {
      albedo: '#263a2b',
      normal: [128, 128, 255, 255],
      roughness: [160, 160, 160, 255],
      height: [128, 128, 128, 255],
    },
  },
  // Compact photographed mud surface for brackish margins. The packed NRH
  // keeps small pebbles and plant litter in normal/height while mapping dark,
  // saturated mud to the smoother end of the authored roughness range.
  brackishMud: {
    albedo: `${FLOREANA_PBR_BASE}/brackish-mud_albedo.webp`,
    normal: null,
    roughness: null,
    height: null,
    nrh: `${FLOREANA_PBR_BASE}/brackish-mud_nrh.png`,
    scale: 0.19,
    normalStrength: 0.22,
    roughnessMix: 0.9,
    roughnessMin: 0.48,
    roughnessMax: 0.82,
    fallbacks: {
      albedo: '#3f3b2f',
      normal: [128, 128, 255, 255],
      roughness: [170, 170, 170, 255],
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

function browserFallbackCanvas(rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})`;
    context.fillRect(0, 0, 1, 1);
  }
  return canvas;
}

function loadBrowserTerrainTexture(path, rgba) {
  const texture = new THREE.Texture(browserFallbackCanvas(rgba));
  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  loader.load(
    path,
    bitmap => {
      texture.image?.close?.();
      texture.image = bitmap;
      // ImageBitmap orientation was resolved during off-main decode.
      texture.flipY = false;
      texture.needsUpdate = true;
    },
    undefined,
    () => {
      // Some older Safari/WebView builds expose ImageBitmapLoader but reject
      // one of its decode options. Preserve the existing TextureLoader path as
      // a compatibility fallback without making it the normal transition path.
      new THREE.TextureLoader().load(path, imageTexture => {
        texture.image = imageTexture.image;
        texture.flipY = imageTexture.flipY;
        texture.needsUpdate = true;
        imageTexture.dispose();
      });
    },
  );
  texture.addEventListener('dispose', () => texture.image?.close?.());
  return texture;
}

export function loadRepeatingTerrainTexture(path, {
  fallback = [255, 255, 255, 255],
  colorSpace = THREE.NoColorSpace,
  anisotropy = 8,
} = {}) {
  const rgba = typeof fallback === 'string' ? rgbaFromHex(fallback) : fallback;
  const isFallback = typeof window === 'undefined' || !path;
  const texture = isFallback
    ? fallbackTexture(rgba, colorSpace)
    : loadBrowserTerrainTexture(path, rgba);

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
    config: textureSet,
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
    height: loadRepeatingTerrainTexture(textureSet.height, {
      fallback: textureSet.fallbacks?.height || [128, 128, 128, 255],
      colorSpace: THREE.NoColorSpace,
    }),
  };
}

// Compact runtime form for multi-layer terrain shaders. R/G retain the source
// tangent normal, B stores roughness, and A stores height for authored blends.
export function loadPackedPbrTerrainSet(textureSet) {
  return {
    config: textureSet,
    albedo: loadRepeatingTerrainTexture(textureSet.albedo, {
      fallback: textureSet.fallbacks?.albedo || '#ffffff',
      colorSpace: THREE.SRGBColorSpace,
    }),
    nrh: loadRepeatingTerrainTexture(textureSet.nrh, {
      fallback: [128, 128, 230, 128],
      colorSpace: THREE.NoColorSpace,
    }),
  };
}

export function loadTerrainAlbedo(textureSet) {
  return loadRepeatingTerrainTexture(textureSet.albedo, {
    fallback: textureSet.fallbacks?.albedo || '#ffffff',
    colorSpace: THREE.SRGBColorSpace,
  });
}

export function disposePbrTerrainSet(textureSet) {
  textureSet?.albedo?.dispose?.();
  textureSet?.normal?.dispose?.();
  textureSet?.roughness?.dispose?.();
  textureSet?.height?.dispose?.();
}

export function disposePackedPbrTerrainSet(textureSet) {
  textureSet?.albedo?.dispose?.();
  textureSet?.nrh?.dispose?.();
}
