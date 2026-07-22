import * as THREE from 'three';
import { getBorderVistas } from './index';

const RESOURCE_CACHE_LIMIT = 4;
const GENERATED_BASE = '/assets/generated/border-vistas';
const GENERATED_GEOMETRY_VERSION = 3;
const resources = new Map();
let useCounter = 0;

const ARRAY_TYPES = {
  Float32Array,
  Uint16Array,
  Uint32Array,
};

function generatedPath(regionId) {
  const stem = regionId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `${GENERATED_BASE}/${stem}.bin?v=${GENERATED_GEOMETRY_VERSION}`;
}

function decodeAttribute(record, arrayBuffer, payloadStart) {
  if (!record) return null;
  const ArrayType = ARRAY_TYPES[record.type];
  if (!ArrayType) throw new Error(`Unsupported border-vista array type ${record.type}.`);
  return {
    array: new ArrayType(arrayBuffer, payloadStart + record.offset, record.length),
    itemSize: record.itemSize,
    normalized: record.normalized === true,
  };
}

function decodeGeneratedPayload(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, 4, headerLength)));
  if (header.version !== 1) throw new Error(`Unsupported border-vista buffer version ${header.version}.`);
  const payloadStart = 4 + Math.ceil(headerLength / 4) * 4;
  return {
    regionId: header.regionId,
    entries: header.entries.map(entry => ({
      ...entry,
      preview: entry.preview ? {
        ...entry.preview,
        attributes: Object.fromEntries(Object.entries(entry.preview.attributes || {}).map(([name, attribute]) => (
          [name, decodeAttribute(attribute, arrayBuffer, payloadStart)]
        ))),
        index: decodeAttribute(entry.preview.index, arrayBuffer, payloadStart),
      } : null,
      carry: entry.carry ? {
        ...entry.carry,
        attributes: Object.fromEntries(Object.entries(entry.carry.attributes || {}).map(([name, attribute]) => (
          [name, decodeAttribute(attribute, arrayBuffer, payloadStart)]
        ))),
        index: decodeAttribute(entry.carry.index, arrayBuffer, payloadStart),
      } : null,
      horizon: entry.horizon ? {
        ...entry.horizon,
        attributes: Object.fromEntries(Object.entries(entry.horizon.attributes || {}).map(([name, attribute]) => (
          [name, decodeAttribute(attribute, arrayBuffer, payloadStart)]
        ))),
        index: decodeAttribute(entry.horizon.index, arrayBuffer, payloadStart),
      } : null,
    })),
  };
}

function buildGeometry(payload) {
  if (!payload) return null;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(payload.attributes || {})) {
    geometry.setAttribute(name, new THREE.BufferAttribute(
      attribute.array,
      attribute.itemSize,
      attribute.normalized,
    ));
  }
  if (payload.index) {
    geometry.setIndex(new THREE.BufferAttribute(
      payload.index.array,
      payload.index.itemSize,
      payload.index.normalized,
    ));
  }
  if (payload.boundingBox) {
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3().fromArray(payload.boundingBox.min),
      new THREE.Vector3().fromArray(payload.boundingBox.max),
    );
  }
  if (payload.boundingSphere) {
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3().fromArray(payload.boundingSphere.center),
      payload.boundingSphere.radius,
    );
  }
  geometry.userData.mode = payload.mode || null;
  return geometry;
}

function hydratePayload(payload, backingBuffer = null) {
  return {
    regionId: payload.regionId,
    // Keep the fetched ArrayBuffer alive for the typed-array views owned by the
    // geometries. This costs no duplicate allocation.
    backingBuffer,
    entries: (payload.entries || []).map(entry => ({
      vistaId: entry.vistaId,
      edge: entry.edge,
      preview: buildGeometry(entry.preview),
      carry: buildGeometry(entry.carry),
      horizon: buildGeometry(entry.horizon),
    })),
  };
}

function disposeResource(value) {
  for (const entry of value?.entries || []) {
    entry.preview?.dispose?.();
    entry.carry?.dispose?.();
    entry.horizon?.dispose?.();
  }
}

function pruneResources(protectedRegionId = null) {
  if (resources.size <= RESOURCE_CACHE_LIMIT) return;
  const candidates = [...resources.entries()]
    .filter(([regionId, entry]) => regionId !== protectedRegionId && entry.status === 'ready')
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (resources.size > RESOURCE_CACHE_LIMIT && candidates.length) {
    const [regionId, entry] = candidates.shift();
    disposeResource(entry.value);
    resources.delete(regionId);
  }
}

async function loadGeneratedResource(regionId) {
  const startedAt = performance.now();
  const response = await fetch(generatedPath(regionId), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Generated border vistas returned HTTP ${response.status}.`);
  const responseAt = performance.now();
  const arrayBuffer = await response.arrayBuffer();
  const decodedAt = performance.now();
  const value = hydratePayload(decodeGeneratedPayload(arrayBuffer), arrayBuffer);
  value.preparation = {
    mode: 'generated-fetch',
    durationMs: performance.now() - startedAt,
    responseMs: responseAt - startedAt,
    bodyMs: decodedAt - responseAt,
    hydrateMs: performance.now() - decodedAt,
    bytes: arrayBuffer.byteLength,
  };
  return value;
}

export function prepareBorderVistaResource(regionId) {
  const existing = resources.get(regionId);
  if (existing) {
    existing.lastUsed = ++useCounter;
    return existing.promise;
  }
  const hasVistas = getBorderVistas(regionId).length > 0;
  if (!hasVistas || typeof window === 'undefined') {
    const value = { regionId, entries: [] };
    const entry = {
      status: 'ready',
      value,
      promise: Promise.resolve(value),
      lastUsed: ++useCounter,
    };
    resources.set(regionId, entry);
    return entry.promise;
  }

  const entry = {
    status: 'pending',
    value: null,
    promise: null,
    lastUsed: ++useCounter,
  };
  entry.promise = loadGeneratedResource(regionId)
    .catch(error => {
      // Runtime neighbor-preview generation is intentionally not a fallback:
      // the exact geometry takes seconds for some regions and freezes the DOM
      // chart. Terrain skirts remain underneath, so an empty vista resource is
      // a visually safe degraded result until generated data is restored.
      console.error(`[border-vistas] ${regionId}: ${error.message} Using terrain-skirt fallback.`);
      return { regionId, entries: [] };
    })
    .then(value => {
      entry.status = 'ready';
      entry.value = value;
      entry.lastUsed = ++useCounter;
      pruneResources(regionId);
      return value;
    });
  resources.set(regionId, entry);
  return entry.promise;
}

export function readBorderVistaResource(regionId) {
  const entry = resources.get(regionId);
  if (!entry) {
    const promise = prepareBorderVistaResource(regionId);
    const created = resources.get(regionId);
    if (created?.status === 'ready') return created.value;
    throw promise;
  }
  entry.lastUsed = ++useCounter;
  if (entry.status === 'ready') return entry.value;
  throw entry.promise;
}

export function borderVistaResourceIsReady(regionId) {
  return resources.get(regionId)?.status === 'ready';
}
