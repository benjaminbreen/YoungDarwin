'use client';

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
export function shareTextureSources(gltf) {
  const scene = gltf?.scene;
  if (!scene || shared.has(gltf)) return gltf;
  shared.add(gltf);
  scene.traverse(object => {
    const material = object.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (!entry) continue;
      for (const value of Object.values(entry)) adopt(value);
    }
  });
  return gltf;
}

export function sharedTextureSourceCount() {
  return sources.size;
}
