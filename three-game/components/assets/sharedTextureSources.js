'use client';

import { CONSTRAINED_TEXTURE_MAX_DIM, isConstrainedMemoryDevice } from '../../world/constrainedDevice';

// Point every repeat copy of an embedded image at the first Source seen for it.
//
// Authored packs ship one GLB per piece, and each piece embeds its own copy of
// the kit's shared maps. GLTFLoader's texture cache lives on the parser, so it
// spans a single file: the second piece decodes the same bytes into a new
// Texture with a new Source, and three keys its GPU textures by Source, so the
// image uploads again. Measured over public/assets/models with
// scripts/name-duplicate-glb-textures.mjs, 27 images repeat across 32 files —
// about 107MB of decoded RGBA in the Lawson house props and 64MB in the Beagle
// cabin set, none of it visible.
//
// The key is the image name, which that script stamps with a content hash.
// Sharing a Source between two different images would show the wrong art, so
// anything without the suffix is left alone.
//
// Safe to do late: three caches GL textures per (Source, sampler parameters)
// and refcounts them, so two copies collapse only where their sampler settings
// already agree, and disposing one piece cannot pull the image out from under
// another.

const HASHED_NAME = /-[0-9a-f]{8}$/;

// Weak on purpose. gltfCachePolicy evicts parsed GLBs past a 24-path window,
// and a strong reference here would keep every deduplicated image's decoded
// bitmap resident for the rest of the session.
const sources = new Map();
const shared = new WeakSet();
const constrainedSources = new WeakSet();

// On memory-ceiling devices, cap every GLB-embedded texture's decoded size.
// A 2048 RGBA image is ~21MB with mips; a zone's models carry dozens. The
// swap is async (createImageBitmap resize) and re-fires the texture upload,
// which the warm-gate passes absorb offscreen.
export function constrainSourceResolution(texture, maxDim = CONSTRAINED_TEXTURE_MAX_DIM) {
  const source = texture?.source;
  const image = source?.data;
  if (!source || constrainedSources.has(source)) return;
  const isResizable = (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
    || (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement);
  if (!isResizable || typeof createImageBitmap !== 'function') return;
  const largest = Math.max(image.width || 0, image.height || 0);
  if (largest <= maxDim) return;
  constrainedSources.add(source);
  const scale = maxDim / largest;
  createImageBitmap(image, {
    resizeWidth: Math.max(1, Math.round(image.width * scale)),
    resizeHeight: Math.max(1, Math.round(image.height * scale)),
    resizeQuality: 'high',
  }).then(resized => {
    if (source.data === image) {
      source.data = resized;
      image.close?.();
      texture.needsUpdate = true;
    } else {
      resized.close?.();
    }
  }).catch(() => {});
}

function adopt(texture) {
  if (!texture?.isTexture || texture.isRenderTargetTexture) return;
  const name = texture.name || '';
  if (!HASHED_NAME.test(name)) return;
  const first = sources.get(name)?.deref();
  if (!first) {
    sources.set(name, new WeakRef(texture.source));
    return;
  }
  if (first === texture.source) return;
  texture.source = first;
  texture.needsUpdate = true;
}

// Runs once per parsed GLTF. Called from useTrackedGLTF during render rather
// than an effect, so the first consumer of the scene already sees the shared
// sources instead of uploading its own copy on the way past.
export function shareTextureSources(gltf, constrainedMaxDim = CONSTRAINED_TEXTURE_MAX_DIM) {
  const scene = gltf?.scene;
  if (!scene || shared.has(gltf)) return gltf;
  shared.add(gltf);
  const constrain = isConstrainedMemoryDevice();
  scene.traverse(object => {
    const material = object.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (!entry) continue;
      for (const value of Object.values(entry)) {
        adopt(value);
        if (constrain && value?.isTexture) constrainSourceResolution(value, constrainedMaxDim);
      }
    }
  });
  return gltf;
}

export function sharedTextureSourceCount() {
  return sources.size;
}
