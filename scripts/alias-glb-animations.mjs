import fs from 'node:fs';

const [glbPath, aliasJson] = process.argv.slice(2);
if (!glbPath || !aliasJson) {
  console.error('Usage: node scripts/alias-glb-animations.mjs <model.glb> \'{"newName":"sourceName"}\'');
  process.exit(1);
}

const aliases = JSON.parse(aliasJson);
const buffer = fs.readFileSync(glbPath);
const chunks = parseGlb(buffer);
const json = JSON.parse(chunks.json.toString('utf8'));
json.animations ||= [];

const byName = new Map(json.animations.map(animation => [animation.name, animation]));
const created = [];
for (const [newName, sourceName] of Object.entries(aliases)) {
  if (byName.has(newName)) continue;
  const source = byName.get(sourceName);
  if (!source) {
    console.error(`Missing source animation "${sourceName}" for alias "${newName}".`);
    process.exit(1);
  }
  const copy = JSON.parse(JSON.stringify(source));
  copy.name = newName;
  json.animations.push(copy);
  byName.set(newName, copy);
  created.push({ name: newName, source: sourceName });
}

chunks.json = Buffer.from(JSON.stringify(json));
fs.writeFileSync(glbPath, writeGlb(chunks));
console.log(JSON.stringify({ glb: glbPath, created }, null, 2));

function parseGlb(data) {
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glbPath} is not a GLB.`);
  const version = data.readUInt32LE(4);
  const chunks = { version, json: null, bin: null };
  let offset = 12;
  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + byteLength);
    offset += byteLength;
    if (type === 0x4e4f534a) chunks.json = chunk;
    if (type === 0x004e4942) chunks.bin = chunk;
  }
  if (!chunks.json || !chunks.bin) throw new Error('GLB must contain JSON and BIN chunks.');
  return chunks;
}

function writeGlb({ version, json, bin }) {
  const jsonChunk = padChunk(json, 0x20);
  const binChunk = padChunk(bin, 0x00);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(totalLength);
  out.write('glTF', 0, 4, 'utf8');
  out.writeUInt32LE(version, 4);
  out.writeUInt32LE(totalLength, 8);
  let offset = 12;
  out.writeUInt32LE(jsonChunk.length, offset);
  out.writeUInt32LE(0x4e4f534a, offset + 4);
  jsonChunk.copy(out, offset + 8);
  offset += 8 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, offset);
  out.writeUInt32LE(0x004e4942, offset + 4);
  binChunk.copy(out, offset + 8);
  return out;
}

function padChunk(chunk, padByte) {
  const padding = (4 - (chunk.length % 4)) % 4;
  if (!padding) return chunk;
  return Buffer.concat([chunk, Buffer.alloc(padding, padByte)]);
}
