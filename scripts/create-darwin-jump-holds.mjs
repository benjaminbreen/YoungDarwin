import fs from 'node:fs';

const glbPath = process.argv[2] || 'public/assets/models/darwin-final-animated.glb';
const buffer = fs.readFileSync(glbPath);
const { json, bin } = parseGlb(buffer);

const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const holds = [
  { source: 'standingJump', target: 'standingJumpHold', sampleRatio: 0.30 },
  { source: 'runningJump', target: 'runningJumpHold', sampleRatio: 0.42 },
];
const created = [];
const pendingBuffers = [];

for (const hold of holds) {
  const source = (json.animations || []).find(animation => animation.name === hold.source);
  if (!source) throw new Error(`Missing source animation ${hold.source}`);
  const duration = animationDuration(source);
  const sampleTime = duration * hold.sampleRatio;
  const existingIndex = json.animations.findIndex(animation => animation.name === hold.target);
  if (existingIndex >= 0) json.animations.splice(existingIndex, 1);

  const inputAccessor = appendAccessor(new Float32Array([0, 1]), 'SCALAR');
  const animation = {
    name: hold.target,
    samplers: [],
    channels: [],
  };

  for (const channel of source.channels || []) {
    const sourceSampler = source.samplers[channel.sampler];
    const outputAccessor = json.accessors[sourceSampler.output];
    const values = accessorRows(outputAccessor);
    const times = accessorRows(json.accessors[sourceSampler.input]).map(row => row[0]);
    const sampled = sampleRows(times, values, sampleTime, channel.target.path);
    const typed = new Float32Array([...sampled, ...sampled]);
    const holdOutput = appendAccessor(typed, outputAccessor.type);
    const samplerIndex = animation.samplers.length;
    animation.samplers.push({
      input: inputAccessor,
      output: holdOutput,
      interpolation: 'STEP',
    });
    animation.channels.push({
      sampler: samplerIndex,
      target: { ...channel.target },
    });
  }

  json.animations.push(animation);
  created.push({
    clip: hold.target,
    source: hold.source,
    sampleTime: Number(sampleTime.toFixed(3)),
    duration: Number(duration.toFixed(3)),
  });
}

fs.writeFileSync(glbPath, encodeGlb(json, bin));
console.log(JSON.stringify({ glb: glbPath, created }, null, 2));

function parseGlb(data) {
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glbPath} is not a GLB.`);
  let offset = 12;
  let parsedJson = null;
  let parsedBin = null;
  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = Buffer.from(data.subarray(offset, offset + byteLength));
    offset += byteLength;
    if (type === 0x4e4f534a) parsedJson = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) parsedBin = chunk;
  }
  if (!parsedJson || !parsedBin) throw new Error('GLB must contain JSON and BIN chunks.');
  return { json: parsedJson, bin: parsedBin };
}

function accessorRows(accessor) {
  if (accessor.componentType !== 5126) throw new Error(`Only FLOAT accessors are supported, saw ${accessor.componentType}`);
  const bufferView = json.bufferViews[accessor.bufferView];
  const components = typeCount[accessor.type];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride || componentSize[accessor.componentType] * components;
  const rows = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    for (let component = 0; component < components; component += 1) {
      row.push(bin.readFloatLE(byteOffset + index * stride + component * 4));
    }
    rows.push(row);
  }
  return rows;
}

function sampleRows(times, values, time, path) {
  if (!times.length || !values.length) throw new Error('Cannot sample empty animation track.');
  if (time <= times[0]) return values[0].slice();
  const last = times.length - 1;
  if (time >= times[last]) return values[last].slice();
  let upper = 1;
  while (upper < times.length && times[upper] < time) upper += 1;
  const lower = Math.max(0, upper - 1);
  const span = Math.max(0.00001, times[upper] - times[lower]);
  const t = (time - times[lower]) / span;
  if (path === 'rotation') return normalizeQuaternion(values[lower].map((value, index) => value + (values[upper][index] - value) * t));
  return values[lower].map((value, index) => value + (values[upper][index] - value) * t);
}

function normalizeQuaternion(values) {
  const length = Math.hypot(values[0], values[1], values[2], values[3]) || 1;
  return values.map(value => value / length);
}

function animationDuration(animation) {
  let duration = 0;
  for (const sampler of animation.samplers || []) {
    const input = accessorRows(json.accessors[sampler.input]);
    duration = Math.max(duration, input.at(-1)?.[0] || 0);
  }
  return duration;
}

function appendAccessor(typedArray, type) {
  const componentCount = typeCount[type];
  if (!componentCount) throw new Error(`Unsupported accessor type ${type}`);
  if (typedArray.length % componentCount !== 0) throw new Error(`Typed array length ${typedArray.length} is not divisible by ${componentCount}`);
  const byteOffset = bin.length + pendingByteLength();
  const byteBuffer = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  pendingBuffers.push(padBuffer(byteBuffer, 0x00));
  const bufferViewIndex = json.bufferViews.length;
  json.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: byteBuffer.length,
  });
  const accessorIndex = json.accessors.length;
  const accessor = {
    bufferView: bufferViewIndex,
    componentType: 5126,
    count: typedArray.length / componentCount,
    type,
  };
  refreshMinMax(accessor, typedArray, componentCount);
  json.accessors.push(accessor);
  return accessorIndex;
}

function pendingByteLength() {
  return pendingBuffers.reduce((sum, item) => sum + item.length, 0);
}

function refreshMinMax(accessor, typedArray, componentCount) {
  const min = new Array(componentCount).fill(Infinity);
  const max = new Array(componentCount).fill(-Infinity);
  for (let index = 0; index < typedArray.length / componentCount; index += 1) {
    for (let component = 0; component < componentCount; component += 1) {
      const value = typedArray[index * componentCount + component];
      min[component] = Math.min(min[component], value);
      max[component] = Math.max(max[component], value);
    }
  }
  accessor.min = min;
  accessor.max = max;
}

function encodeGlb(nextJson, originalBin) {
  const nextBin = Buffer.concat([originalBin, ...pendingBuffers]);
  json.buffers[0].byteLength = nextBin.length;
  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(nextJson)), 0x20);
  const binChunk = padBuffer(nextBin, 0x00);
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
