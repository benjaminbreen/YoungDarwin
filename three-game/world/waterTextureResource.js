import * as THREE from 'three';
import {
  WATER_RIPPLE_NORMAL_SIZE,
  waterBakeAssetStem,
} from './waterTextureManifest';

const ASSET_ROOT = '/assets/textures/world/water-bakes';
const resourceCache = new Map();
const textureRecords = new Map();
const WATER_RESOURCE_CACHE_LIMIT = 6;
let placeholder = null;
let contactPlaceholder = null;

function configureTexture(texture, kind) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.magFilter = THREE.LinearFilter;
  if (kind === 'ripple') {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
  } else {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
  }
  texture.needsUpdate = true;
  return texture;
}

async function loadTextureUncached(url, kind) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  return configureTexture(texture, kind);
}

function retainTexture(url, kind) {
  const key = `${kind}:${url}`;
  let record = textureRecords.get(key);
  if (!record) {
    record = { refs: 0, texture: null, promise: null };
    record.promise = loadTextureUncached(url, kind).then(texture => {
      record.texture = texture;
      return texture;
    }).catch(error => {
      if (textureRecords.get(key) === record) textureRecords.delete(key);
      throw error;
    });
    textureRecords.set(key, record);
  }
  record.refs += 1;
  return { key, promise: record.promise };
}

function releaseTexture(key) {
  const record = textureRecords.get(key);
  if (!record) return;
  record.refs = Math.max(0, record.refs - 1);
  if (record.refs > 0) return;
  textureRecords.delete(key);
  if (record.texture) {
    record.texture.dispose();
  } else {
    record.promise.then(texture => texture.dispose()).catch(() => {});
  }
}

function releaseEntryTextures(entry) {
  if (entry.resourcesReleased) return;
  entry.resourcesReleased = true;
  entry.textureKeys.forEach(releaseTexture);
}

function touchResource(key, entry) {
  resourceCache.delete(key);
  resourceCache.set(key, entry);
  return entry;
}

function pruneResourceCache(protectedKey = null) {
  while (resourceCache.size > WATER_RESOURCE_CACHE_LIMIT) {
    const candidate = Array.from(resourceCache.entries()).find(([key, entry]) => (
      key !== protectedKey && entry.status !== 'pending'
    ));
    if (!candidate) return;
    const [key, entry] = candidate;
    resourceCache.delete(key);
    releaseEntryTextures(entry);
  }
}

function placeholderTexture() {
  if (placeholder) return placeholder;
  placeholder = configureTexture(new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    THREE.RGBAFormat,
  ), 'packed');
  return placeholder;
}

function contactPlaceholderTexture() {
  if (contactPlaceholder) return contactPlaceholder;
  contactPlaceholder = new THREE.DataTexture(
    new Uint8Array([128, 128, 128, 0]),
    1,
    1,
    THREE.RGBAFormat,
  );
  contactPlaceholder.colorSpace = THREE.NoColorSpace;
  contactPlaceholder.minFilter = THREE.NearestFilter;
  contactPlaceholder.magFilter = THREE.NearestFilter;
  contactPlaceholder.needsUpdate = true;
  return contactPlaceholder;
}

function startWaterTextureResource(zoneId, bakeRes, openOceanOnly, contactRes) {
  const key = openOceanOnly ? 'open-ocean' : `${zoneId}:${bakeRes}:${contactRes}`;
  const cached = resourceCache.get(key);
  if (cached) return touchResource(key, cached);

  const stem = waterBakeAssetStem(zoneId);
  const rippleUrl = `${ASSET_ROOT}/ripple-normal-${WATER_RIPPLE_NORMAL_SIZE}.png`;
  const retained = [];
  const loadRetained = (url, kind) => {
    const resource = retainTexture(url, kind);
    retained.push(resource);
    return resource.promise;
  };
  const entry = {
    status: 'pending',
    promise: null,
    value: null,
    error: null,
    textureKeys: retained.map(resource => resource.key),
    resourcesReleased: false,
  };
  entry.promise = Promise.all([
    openOceanOnly
      ? Promise.resolve(placeholderTexture())
      : loadRetained(`${ASSET_ROOT}/${stem}-seafloor-${bakeRes}.png`, 'packed'),
    openOceanOnly
      ? Promise.resolve(placeholderTexture())
      : loadRetained(`${ASSET_ROOT}/${stem}-standing-water-${bakeRes}.png`, 'packed'),
    loadRetained(rippleUrl, 'ripple'),
    openOceanOnly || contactRes <= 1
      ? Promise.resolve(contactPlaceholderTexture())
      : loadRetained(`${ASSET_ROOT}/${stem}-water-contact-${contactRes}.png`, 'packed'),
  ]).then(([seafloor, standingWaterMask, rippleNormal, waterContact]) => {
    entry.status = 'ready';
    entry.value = { seafloor, standingWaterMask, rippleNormal, waterContact };
    entry.textureKeys = retained.map(resource => resource.key);
    touchResource(key, entry);
    pruneResourceCache(key);
    return entry.value;
  }).catch(error => {
    entry.status = 'error';
    entry.error = error;
    entry.textureKeys = retained.map(resource => resource.key);
    releaseEntryTextures(entry);
    throw error;
  });
  entry.textureKeys = retained.map(resource => resource.key);
  resourceCache.set(key, entry);
  pruneResourceCache(key);
  return entry;
}

export function waterTextureResourceIsReady(zoneId, bakeRes, { openOceanOnly = false, contactRes = 1 } = {}) {
  const key = openOceanOnly ? 'open-ocean' : `${zoneId}:${bakeRes}:${contactRes}`;
  const entry = resourceCache.get(key);
  if (!entry) return false;
  touchResource(key, entry);
  return entry.status === 'ready';
}

export function prepareWaterTextureResource(zoneId, bakeRes, { openOceanOnly = false, contactRes = 1 } = {}) {
  const entry = startWaterTextureResource(zoneId, bakeRes, openOceanOnly, contactRes);
  return entry.status === 'ready' ? Promise.resolve(entry.value) : entry.promise;
}

export function readWaterTextureResource(zoneId, bakeRes, options) {
  const entry = startWaterTextureResource(
    zoneId,
    bakeRes,
    options?.openOceanOnly,
    options?.contactRes || 1,
  );
  if (entry.status === 'ready') return entry.value;
  if (entry.status === 'error') throw entry.error;
  throw entry.promise;
}
