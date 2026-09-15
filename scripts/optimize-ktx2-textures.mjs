// Bake standalone world textures to KTX2 (Basis Universal) alongside their
// WebP originals.
//
// Why, measured at Post Office Bay:
//   - Boot spends ~600ms in texSubImage2D. A .ktx2 uploads through
//     compressedTexImage2D with no decode, carries its own mips, and moves a
//     quarter of the bytes.
//   - A 1024 RGBA8 set member costs 5.6MB of GPU memory with mips; the same
//     texture as ASTC 4x4 / BC7 costs 1.4MB. That ratio is what the iOS
//     memory ceiling cares about.
//
// Codec choice is not a preference, it is a measurement. Packed maps (_nrh,
// _normal) carry normal-x, roughness and height in separate channels, so any
// codec that subsamples chroma destroys them — lossy WebP at q100 scores
// 18.7dB on the red channel. UASTC is a real 4-channel block format and scores
// 27.2dB at 2.5x smaller than lossless WebP. ETC1S would be 6x smaller but
// scores 16.3dB on the same file, so it is for albedo only.
//
// KTX2 cannot flip at runtime the way an ImageBitmap can, so the flip happens
// here. Everything the renderer reads must therefore go through the KTX2
// loader path, never a mixed one.
//
// Usage:
//   node scripts/optimize-ktx2-textures.mjs --dry       # list candidates
//   node scripts/optimize-ktx2-textures.mjs             # bake the set
//   node scripts/optimize-ktx2-textures.mjs path.webp   # bake one file
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

// UASTC effort above 2 measured +0.3dB for the same bytes. Not worth the time.
const UASTC_QUALITY = 2;
// ETC1S 192 -> 28.6dB on albedo; 128 saves 25% more bytes for 1.4dB less.
const ETC1S_QUALITY = 192;

const PACKED_SUFFIXES = ['_nrh', '_normal', '_orm', '-nrh', '-normal'];

const dry = process.argv.includes('--dry');
const only = process.argv.slice(2).filter(value => !value.startsWith('--'));

// The first pass covers exactly one zone's terrain set. Widening this is a
// separate decision that wants its own screenshot pass.
const DEFAULT_TARGETS = [
  'public/assets/textures/world/floreana-pbr/post-office-bay/galapagos-sand_albedo-lossless-v1.webp',
  'public/assets/textures/world/floreana-pbr/post-office-bay/galapagos-sand_nrh-512-lossless-v1.webp',
  'public/assets/textures/world/floreana-pbr/post-office-bay/sandy-tuff_nrh-512-lossless-v1.webp',
  'public/assets/textures/world/floreana-pbr/sandy-tuff_albedo.webp',
  'public/assets/textures/world/floreana-pbr/dark-basalt-gravel_albedo.webp',
  'public/assets/textures/world/floreana-pbr/dark-basalt-gravel_nrh.webp',
  'public/assets/textures/world/floreana-pbr/red-cinder-dirt_albedo.webp',
  'public/assets/textures/world/floreana-pbr/red-cinder-dirt_nrh.webp',
];

function isPackedMap(file) {
  const base = path.basename(file).toLowerCase();
  return PACKED_SUFFIXES.some(suffix => base.includes(suffix));
}

export function ktx2PathFor(sourcePath) {
  return sourcePath.replace(/\.(webp|png|jpe?g)$/i, '.ktx2');
}

async function decodeToRGBA(buffer) {
  const { data, info } = await sharp(Buffer.from(buffer))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

async function bake(file) {
  const source = await fs.readFile(file);
  const packed = isPackedMap(file);
  const { width, height } = await sharp(source).metadata();
  if (width % 4 || height % 4) {
    // Block formats are 4x4. A non-multiple size would be padded silently and
    // the padding would show up as an edge seam on a tiling texture.
    throw new Error(`${file}: ${width}x${height} is not a multiple of 4`);
  }

  const encoded = await encodeToKTX2(new Uint8Array(source), {
    isUASTC: packed,
    uastcLDRQualityLevel: UASTC_QUALITY,
    qualityLevel: ETC1S_QUALITY,
    compressionLevel: 2,
    needSupercompression: packed,
    generateMipmap: true,
    // three reads KTX2 bottom-up; the WebP path flipped at decode time.
    isYFlip: true,
    imageDecoder: decodeToRGBA,
  });

  const out = ktx2PathFor(file);
  const before = source.byteLength;
  const after = encoded.byteLength;
  const note = `${packed ? 'UASTC' : 'ETC1S'} ${width}x${height}  ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`;
  if (dry) {
    console.log(`  would bake  ${path.relative('public/assets/textures', file)}  ${note}`);
    return { before, after };
  }
  await fs.writeFile(out, encoded);
  console.log(`  baked  ${path.relative('public/assets/textures', out)}  ${note}`);
  return { before, after };
}

// The runtime must never probe for a .ktx2 that may not exist — a 404 per
// texture is worse than the upload it saves. The bake writes the manifest so
// the two can only disagree by someone editing one of them by hand.
const MANIFEST_PATH = 'three-game/world/regions/materials/ktx2TextureManifest.js';

async function writeManifest(files) {
  const urls = files
    .map(file => '/' + path.relative('public', file).replace(/\.(webp|png|jpe?g)$/i, ''))
    .sort();
  const lines = [
    '// Generated by scripts/optimize-ktx2-textures.mjs — do not edit by hand.',
    '// Source URLs that have a baked KTX2 sibling. The terrain loader checks',
    '// this before reaching for the compressed file, so it never probes a 404.',
    'export const KTX2_BAKED_TEXTURES = new Set([',
    ...urls.map(url => "  '" + url + "',"),
    ']);',
    '',
    'export function ktx2UrlFor(url) {',
    "  const base = String(url || '').replace(/\\.(webp|png|jpe?g)$/i, '');",
    "  return KTX2_BAKED_TEXTURES.has(base) ? base + '.ktx2' : null;",
    '}',
    '',
  ];
  await fs.writeFile(MANIFEST_PATH, lines.join('\n'));
  console.log('manifest: ' + MANIFEST_PATH + ' (' + urls.length + ' entries)');
}

const targets = only.length ? only : DEFAULT_TARGETS;
let before = 0;
let after = 0;
for (const file of targets) {
  const result = await bake(file);
  before += result.before;
  after += result.after;
}
console.log(`\n${targets.length} texture(s): ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB`);
if (!dry) await writeManifest(DEFAULT_TARGETS);
