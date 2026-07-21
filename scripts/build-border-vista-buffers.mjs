import fs from 'node:fs/promises';
import path from 'node:path';
import { regionMaps } from '../game-core/regionMaps.js';
import { getRegionTerrainConfig } from '../three-game/world/terrain.js';
import { getBorderVistas } from '../three-game/world/vistas/index.js';
import { buildBorderTransition } from '../three-game/world/vistas/transitions.js';
import {
  makeApronGeometry,
  makeNeighborCarryGeometry,
  makeNeighborPreviewGeometry,
} from '../three-game/world/vistas/apronGeometry.js';

const outputDirectory = path.join(
  process.cwd(),
  'public',
  'assets',
  'generated',
  'border-vistas',
);

function fileStem(regionId) {
  return regionId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function align(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function geometryRecord(geometry, binaryChunks, cursor, sharedArrays) {
  if (!geometry) return { value: null, cursor };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const attributes = {};
  let nextCursor = cursor;

  const recordAttribute = attribute => {
    const bytesPerElement = attribute.array.BYTES_PER_ELEMENT || 4;
    const arrayKey = `${attribute.array.byteOffset}:${attribute.array.byteLength}:${attribute.array.constructor.name}`;
    const arrayRecords = sharedArrays.get(attribute.array.buffer) || new Map();
    if (!sharedArrays.has(attribute.array.buffer)) {
      sharedArrays.set(attribute.array.buffer, arrayRecords);
    }
    const existing = arrayRecords.get(arrayKey);
    if (existing) {
      return {
        ...existing,
        itemSize: attribute.itemSize,
        normalized: attribute.normalized === true,
      };
    }
    nextCursor = align(nextCursor, bytesPerElement);
    const byteLength = attribute.array.byteLength;
    const record = {
      type: attribute.array.constructor.name,
      offset: nextCursor,
      byteLength,
      length: attribute.array.length,
      itemSize: attribute.itemSize,
      normalized: attribute.normalized === true,
    };
    binaryChunks.push({
      offset: nextCursor,
      bytes: Buffer.from(
        attribute.array.buffer,
        attribute.array.byteOffset,
        attribute.array.byteLength,
      ),
    });
    arrayRecords.set(arrayKey, record);
    nextCursor += byteLength;
    return record;
  };

  for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
    attributes[name] = recordAttribute(attribute);
  }
  const index = geometry.index ? recordAttribute(geometry.index) : null;
  const value = {
    attributes,
    index,
    mode: geometry.userData?.mode || null,
    boundingBox: geometry.boundingBox ? {
      min: geometry.boundingBox.min.toArray(),
      max: geometry.boundingBox.max.toArray(),
    } : null,
    boundingSphere: geometry.boundingSphere ? {
      center: geometry.boundingSphere.center.toArray(),
      radius: geometry.boundingSphere.radius,
    } : null,
  };
  geometry.dispose();
  return { value, cursor: nextCursor };
}

function buildRegionRecord(regionId) {
  const config = getRegionTerrainConfig(regionId);
  const binaryChunks = [];
  const sharedArrays = new WeakMap();
  let cursor = 0;
  const entries = getBorderVistas(regionId).map(vista => {
    const targetConfig = vista.toRegionId
      ? getRegionTerrainConfig(vista.toRegionId)
      : null;
    const transition = buildBorderTransition(regionId, config, vista, targetConfig);
    const previewGeometry = makeNeighborPreviewGeometry(
      regionId,
      config,
      vista.toRegionId,
      targetConfig,
      vista,
      transition,
    ) || makeApronGeometry(regionId, config, vista);
    const carryGeometry = makeNeighborCarryGeometry(
      regionId,
      config,
      vista.toRegionId,
      targetConfig,
      vista,
      transition,
    );
    const preview = geometryRecord(previewGeometry, binaryChunks, cursor, sharedArrays);
    cursor = preview.cursor;
    const carry = geometryRecord(carryGeometry, binaryChunks, cursor, sharedArrays);
    cursor = carry.cursor;
    return {
      vistaId: vista.id,
      edge: vista.edge,
      preview: preview.value,
      carry: carry.value,
    };
  });
  return {
    header: { version: 1, regionId, entries },
    binaryChunks,
    payloadByteLength: cursor,
  };
}

function encodeRegion(record) {
  const headerBytes = Buffer.from(JSON.stringify(record.header));
  const paddedHeaderLength = align(headerBytes.length, 4);
  const payloadStart = 4 + paddedHeaderLength;
  const output = Buffer.alloc(payloadStart + record.payloadByteLength);
  output.writeUInt32LE(headerBytes.length, 0);
  headerBytes.copy(output, 4);
  for (const chunk of record.binaryChunks) {
    chunk.bytes.copy(output, payloadStart + chunk.offset);
  }
  return output;
}

async function run() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const manifest = { version: 1, regions: {} };
  const regionIds = Object.keys(regionMaps)
    .filter(regionId => getBorderVistas(regionId).length > 0)
    .sort();

  for (const regionId of regionIds) {
    const startedAt = performance.now();
    const bytes = encodeRegion(buildRegionRecord(regionId));
    const filename = `${fileStem(regionId)}.bin`;
    await fs.writeFile(path.join(outputDirectory, filename), bytes);
    manifest.regions[regionId] = { file: filename, bytes: bytes.length };
    console.log(`[border-vistas] ${regionId}: ${(bytes.length / 1024).toFixed(1)} KiB in ${(performance.now() - startedAt).toFixed(0)}ms`);
  }

  await fs.writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
