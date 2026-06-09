import fs from 'node:fs';

function align4(value) {
  return (value + 3) & ~3;
}

function padBuffer(buffer, padByte) {
  const padded = Buffer.alloc(align4(buffer.length), padByte);
  buffer.copy(padded);
  return padded;
}

function readGlb(file) {
  const data = fs.readFileSync(file);
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${file} is not a GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8'));
    if (type === 'BIN\0') bin = chunk;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error(`${file} is missing JSON or BIN chunks`);
  return { json, bin };
}

function collectMeshAccessors(json) {
  const used = new Set();
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.indices != null) used.add(primitive.indices);
      for (const accessorIndex of Object.values(primitive.attributes || {})) used.add(accessorIndex);
    }
  }
  return used;
}

function accessorElementBytes(accessor) {
  const componentBytes = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  }[accessor.componentType];
  const components = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
  }[accessor.type];
  if (!componentBytes || !components) throw new Error(`Unsupported accessor format ${accessor.componentType} ${accessor.type}`);
  return componentBytes * components;
}

function stripGlb(input, output) {
  const { json, bin } = readGlb(input);
  const usedAccessors = collectMeshAccessors(json);
  const accessorMap = new Map();
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let byteOffset = 0;

  for (const accessorIndex of usedAccessors) {
    const sourceAccessor = json.accessors[accessorIndex];
    const sourceView = json.bufferViews[sourceAccessor.bufferView];
    const elementBytes = accessorElementBytes(sourceAccessor);
    const stride = sourceView.byteStride || elementBytes;
    const accessorOffset = sourceAccessor.byteOffset || 0;
    const sourceOffset = (sourceView.byteOffset || 0) + accessorOffset;
    const sourceLength = sourceAccessor.count > 0 ? (sourceAccessor.count - 1) * stride + elementBytes : 0;
    const chunk = Buffer.from(bin.subarray(sourceOffset, sourceOffset + sourceLength));
    const paddedLength = align4(chunk.length);
    accessorMap.set(accessorIndex, accessors.length);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: chunk.length,
      ...(stride !== elementBytes ? { byteStride: stride } : {}),
      ...(sourceView.target ? { target: sourceView.target } : {}),
    });
    accessors.push({
      ...sourceAccessor,
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
    });
    chunks.push(chunk, Buffer.alloc(paddedLength - chunk.length));
    byteOffset += paddedLength;
  }

  const meshes = (json.meshes || []).map(mesh => ({
    ...mesh,
    primitives: (mesh.primitives || []).map(primitive => {
      const { targets, ...rest } = primitive;
      return {
        ...rest,
        indices: primitive.indices == null ? undefined : accessorMap.get(primitive.indices),
        attributes: Object.fromEntries(
          Object.entries(primitive.attributes || {}).map(([name, accessorIndex]) => [name, accessorMap.get(accessorIndex)]),
        ),
        material: 0,
      };
    }),
    weights: undefined,
  }));

  const outJson = {
    asset: json.asset,
    scene: json.scene || 0,
    scenes: json.scenes,
    nodes: json.nodes,
    meshes,
    materials: [{
      name: 'dry_grass_runtime',
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [0.58, 0.55, 0.29, 1],
        metallicFactor: 0,
        roughnessFactor: 0.96,
      },
    }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(outJson)), 0x20);
  const binChunk = Buffer.concat(chunks);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write('JSON', 4, 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.write('BIN\0', 4, 4, 'ascii');
  fs.writeFileSync(output, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/strip-glb-textures.mjs input.glb output.glb');
  process.exit(1);
}

stripGlb(input, output);
