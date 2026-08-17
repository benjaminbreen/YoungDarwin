// Stamp a content hash onto the name of every image that more than one runtime
// GLB embeds.
//
// Authored packs are exported one piece per file, and each piece carries its
// own copy of the kit's shared maps: the three Lawson chairs each embed the
// same 2048² fine-wood set, the five Beagle cabin props each embed the same
// varnished oak. GLTFLoader's texture cache lives on the parser, so it spans a
// single file — the second piece decodes the same bytes into a new Texture with
// a new Source, and three keys GPU textures by Source, so the image uploads
// again.
//
// three-game/components/assets/sharedTextureSources.js collapses those at load
// time, but it needs a key that means "these are the same image". Hence this
// pass. Only files carrying a cross-file duplicate are rewritten, and only
// `images[].name` and the `textures[].name` that shadow it change: the JSON
// chunk is rebuilt and the BIN chunk copied verbatim, so meshopt payloads and
// bufferView offsets cannot move.
//
//   node scripts/name-duplicate-glb-textures.mjs [--dry-run] [root]

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ROOT = args.find(argument => !argument.startsWith('--')) || 'public/assets/models';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const GLB_MAGIC = 0x46546c67;
const HASHED = /-[0-9a-f]{8}$/;

function glbFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...glbFiles(full));
    else if (entry.toLowerCase().endsWith('.glb')) found.push(full);
  }
  return found;
}

function readGlb(file) {
  const buffer = readFileSync(file);
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) return null;
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === JSON_CHUNK) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    else if (type === BIN_CHUNK) bin = buffer.subarray(start, start + length);
    offset = start + length;
  }
  return json ? { json, bin } : null;
}

// Chunks are 4-byte aligned; the spec pads JSON with spaces and BIN with zeros.
function chunk(data, type, pad) {
  const padding = (4 - (data.length % 4)) % 4;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(data.length + padding, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, data, Buffer.alloc(padding, pad)]);
}

function writeGlb(file, json, bin) {
  const chunks = [chunk(Buffer.from(JSON.stringify(json), 'utf8'), JSON_CHUNK, 0x20)];
  if (bin) chunks.push(chunk(bin, BIN_CHUNK, 0x00));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  writeFileSync(file, Buffer.concat([header, body]));
}

function imageBytes(glb, image) {
  if (image.bufferView === undefined || !glb.bin) return null;
  const view = glb.json.bufferViews[image.bufferView];
  const start = view.byteOffset || 0;
  return glb.bin.subarray(start, start + view.byteLength);
}

const files = glbFiles(ROOT).sort();
const loaded = new Map();
const filesByHash = new Map();

for (const file of files) {
  const glb = readGlb(file);
  if (!glb) {
    console.log(`skipped (not a GLB): ${file}`);
    continue;
  }
  loaded.set(file, glb);
  for (const image of glb.json.images || []) {
    const bytes = imageBytes(glb, image);
    if (!bytes) continue;
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    if (!filesByHash.has(hash)) filesByHash.set(hash, new Set());
    filesByHash.get(hash).add(file);
  }
}

const duplicated = new Set([...filesByHash].filter(([, owners]) => owners.size > 1).map(([hash]) => hash));
let changedFiles = 0;
let changedImages = 0;

for (const [file, glb] of loaded) {
  const renamed = new Map();
  (glb.json.images || []).forEach((image, index) => {
    const bytes = imageBytes(glb, image);
    if (!bytes) return;
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    if (!duplicated.has(hash)) return;
    const base = (image.name || `image-${index}`).replace(HASHED, '');
    const name = `${base}-${hash}`;
    if (image.name === name) return;
    image.name = name;
    renamed.set(index, name);
  });

  // `texture.name = textureDef.name || sourceDef.name` in GLTFLoader, so a
  // named texture hides the image name we just stamped. Align it.
  for (const texture of glb.json.textures || []) {
    const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source;
    const name = renamed.get(source);
    if (name !== undefined && texture.name !== name) texture.name = name;
  }

  if (!renamed.size) continue;
  changedFiles += 1;
  changedImages += renamed.size;
  console.log(`${dryRun ? 'would stamp' : 'stamped'} ${renamed.size} image(s): ${file}`);
  for (const name of renamed.values()) console.log(`    ${name}`);
  if (!dryRun) writeGlb(file, glb.json, glb.bin);
}

console.log(
  `\n${duplicated.size} images appear in more than one file.`
  + ` ${changedImages} image name(s) across ${changedFiles} GLB(s)${dryRun ? ' would change' : ' changed'}.`,
);
