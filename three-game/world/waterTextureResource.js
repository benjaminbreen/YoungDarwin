import * as THREE from 'three';
import {
  WATER_RIPPLE_NORMAL_SIZE,
  waterBakeAssetStem,
} from './waterTextureManifest';

const ASSET_ROOT = '/assets/textures/world/water-bakes';
const resourceCache = new Map();
const textureLoadCache = new Map();
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

function loadTexture(url, kind) {
  const key = `${kind}:${url}`;
  const cached = textureLoadCache.get(key);
  if (cached) return cached;
  const promise = loadTextureUncached(url, kind).catch(error => {
    textureLoadCache.delete(key);
    throw error;
  });
  textureLoadCache.set(key, promise);
  return promise;
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
  if (cached) return cached;

  const stem = waterBakeAssetStem(zoneId);
  const rippleUrl = `${ASSET_ROOT}/ripple-normal-${WATER_RIPPLE_NORMAL_SIZE}.png`;
  const entry = { status: 'pending', promise: null, value: null, error: null };
  entry.promise = Promise.all([
    openOceanOnly
      ? Promise.resolve(placeholderTexture())
      : loadTexture(`${ASSET_ROOT}/${stem}-seafloor-${bakeRes}.png`, 'packed'),
    openOceanOnly
      ? Promise.resolve(placeholderTexture())
      : loadTexture(`${ASSET_ROOT}/${stem}-standing-water-${bakeRes}.png`, 'packed'),
    loadTexture(rippleUrl, 'ripple'),
    openOceanOnly || contactRes <= 1
      ? Promise.resolve(contactPlaceholderTexture())
      : loadTexture(`${ASSET_ROOT}/${stem}-water-contact-${contactRes}.png`, 'packed'),
  ]).then(([seafloor, standingWaterMask, rippleNormal, waterContact]) => {
    entry.status = 'ready';
    entry.value = { seafloor, standingWaterMask, rippleNormal, waterContact };
    return entry.value;
  }).catch(error => {
    entry.status = 'error';
    entry.error = error;
    throw error;
  });
  resourceCache.set(key, entry);
  return entry;
}

export function waterTextureResourceIsReady(zoneId, bakeRes, { openOceanOnly = false, contactRes = 1 } = {}) {
  const key = openOceanOnly ? 'open-ocean' : `${zoneId}:${bakeRes}:${contactRes}`;
  return resourceCache.get(key)?.status === 'ready';
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
