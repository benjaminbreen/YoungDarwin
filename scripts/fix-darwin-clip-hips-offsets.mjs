import fs from 'node:fs';

const glbPath = process.argv[2] || 'public/assets/models/darwin-final-animated.glb';
const clipsToNormalize = new Set(process.argv.slice(3));
if (!clipsToNormalize.size) {
  clipsToNormalize.add('landing');
  clipsToNormalize.add('runningLanding');
  clipsToNormalize.add('climbingDownWall');
}

const buffer = fs.readFileSync(glbPath);
const { json, bin, chunks } = parseGlb(buffer);

const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const hipsIndex = json.nodes.findIndex(node => normalizeName(node.name) === 'mixamorighips');
if (hipsIndex < 0) throw new Error('Darwin GLB has no mixamorig:Hips node.');

const hipsRestZ = json.nodes[hipsIndex].translation?.[2] ?? -0.75;
const corrected = [];

for (const animation of json.animations || []) {
  if (!clipsToNormalize.has(animation.name)) continue;
  for (const channel of animation.channels || []) {
    if (channel.target.node !== hipsIndex || channel.target.path !== 'translation') continue;
    const sampler = animation.samplers[channel.sampler];
    const accessor = json.accessors[sampler.output];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') continue;
    const values = accessorView(accessor);
    const firstZ = values.get(0, 2);
    const offset = firstZ - hipsRestZ;
    if (Math.abs(offset) < 0.001) continue;

    for (let index = 0; index < accessor.count; index += 1) {
      values.set(index, 2, values.get(index, 2) - offset);
    }
    refreshAccessorMinMax(accessor, values);
    corrected.push({
      clip: animation.name,
      keys: accessor.count,
      offset: Number(offset.toFixed(5)),
      firstZBefore: Number(firstZ.toFixed(5)),
      firstZAfter: Number(values.get(0, 2).toFixed(5)),
    });
  }
}

if (!corrected.length) {
  console.log(JSON.stringify({ glb: glbPath, hipsRestZ: Number(hipsRestZ.toFixed(5)), corrected: [] }, null, 2));
  process.exit(0);
}

fs.writeFileSync(glbPath, encodeGlb(json, bin, chunks));
console.log(JSON.stringify({
  glb: glbPath,
  hipsRestZ: Number(hipsRestZ.toFixed(5)),
  corrected,
}, null, 2));

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseGlb(data) {
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glbPath} is not a GLB.`);
  const chunks = [];
  let json = null;
  let bin = null;
  let offset = 12;
  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = Buffer.from(data.subarray(offset, offset + byteLength));
    offset += byteLength;
    chunks.push({ type, chunk });
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
  }
  if (!json || !bin) throw new Error('GLB must contain JSON and BIN chunks.');
  return { json, bin, chunks };
}

function accessorView(accessor) {
  const bufferView = json.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride || componentSize[accessor.componentType] * typeCount[accessor.type];
  return {
    get(index, component) {
      return bin.readFloatLE(byteOffset + index * stride + component * 4);
    },
    set(index, component, value) {
      bin.writeFloatLE(value, byteOffset + index * stride + component * 4);
    },
  };
}

function refreshAccessorMinMax(accessor, values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < accessor.count; index += 1) {
    for (let component = 0; component < 3; component += 1) {
      const value = values.get(index, component);
      min[component] = Math.min(min[component], value);
      max[component] = Math.max(max[component], value);
    }
  }
  accessor.min = min;
  accessor.max = max;
}

function encodeGlb(nextJson, nextBin, originalChunks) {
  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(nextJson)), 0x20);
  const binChunk = padBuffer(nextBin, 0x00);
  const extraChunks = originalChunks.filter(chunk => chunk.type !== 0x4e4f534a && chunk.type !== 0x004e4942);
  if (extraChunks.length) {
    throw new Error('fix-darwin-clip-hips-offsets does not preserve unexpected extra GLB chunks.');
  }
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(totalLength);
  out.write('glTF', 0, 4, 'utf8');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  return out;
}

function padBuffer(input, padByte) {
  const remainder = input.length % 4;
  if (!remainder) return input;
  return Buffer.concat([input, Buffer.alloc(4 - remainder, padByte)]);
}
