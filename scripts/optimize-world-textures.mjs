// Convert the world-texture PNGs that the game actually references to WebP,
// and rewrite the referencing source. Only referenced files: unreferenced
// PNGs in the tree never reach a player, so converting them buys nothing.
//
// Encoding: color maps (albedo/color/diffuse) lossy q90; everything that is
// data — normal, roughness, height, displacement, nrh packs, ao, masks,
// splats — lossless WebP, byte-exact pixels. Water bakes are skipped
// entirely: their names are built at runtime and their mip behavior is
// deliberately fragile.
//
//   node scripts/optimize-world-textures.mjs --dry
//   node scripts/optimize-world-textures.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WORLD_ROOT = 'public/assets/textures/world';
const SOURCE_ROOTS = ['three-game', 'app', 'data'];
const SKIP_DIRS = [`${WORLD_ROOT}/water-bakes`];
const dry = process.argv.includes('--dry');

const LOSSY = /(albedo|_color|diffuse|litter|flecks|ground)[a-z0-9_-]*\.png$/i;

async function walk(directory, out = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

// 1. Every .png basename mentioned in source.
const referenced = new Set();
const sourceFiles = [];
for (const root of SOURCE_ROOTS) {
  for (const file of await walk(root)) {
    if (/\.(js|jsx|ts|tsx|json)$/.test(file)) sourceFiles.push(file);
  }
}
for (const file of sourceFiles) {
  const text = await fs.readFile(file, 'utf8');
  for (const match of text.matchAll(/([A-Za-z0-9._-]+\.png)/g)) referenced.add(match[1]);
}

// 2. World files whose basename is referenced.
const worldFiles = (await walk(WORLD_ROOT)).filter(file => (
  file.endsWith('.png')
  && !SKIP_DIRS.some(skip => file.startsWith(skip))
  && referenced.has(path.basename(file))
));

// Basename collisions would make the source rewrite ambiguous.
const byBase = new Map();
for (const file of worldFiles) {
  const base = path.basename(file);
  if (byBase.has(base)) throw new Error(`basename collision: ${file} vs ${byBase.get(base)}`);
  byBase.set(base, file);
}

let before = 0;
let after = 0;
const renames = [];
for (const file of worldFiles) {
  const stat = await fs.stat(file);
  const lossy = LOSSY.test(file);
  const target = file.replace(/\.png$/, '.webp');
  if (dry) {
    console.log(`${String(stat.size >> 10).padStart(7)}KB  ${lossy ? 'lossy   ' : 'lossless'}  ${path.relative(WORLD_ROOT, file)}`);
    before += stat.size;
    continue;
  }
  const image = sharp(file);
  await (lossy
    ? image.webp({ quality: 90 })
    : image.webp({ lossless: true })
  ).toFile(target);
  const targetStat = await fs.stat(target);
  before += stat.size;
  after += targetStat.size;
  renames.push({ from: path.basename(file), to: path.basename(target) });
  await fs.rm(file);
  console.log(`${String(stat.size >> 10).padStart(7)}KB -> ${String(targetStat.size >> 10).padStart(7)}KB  ${lossy ? 'lossy   ' : 'lossless'}  ${path.relative(WORLD_ROOT, file)}`);
}

if (dry) {
  console.log(`\n${worldFiles.length} referenced files, ${(before / 1048576).toFixed(1)}MB`);
  process.exit(0);
}

// 3. Rewrite references.
let touched = 0;
for (const file of sourceFiles) {
  let text = await fs.readFile(file, 'utf8');
  let changed = false;
  for (const { from, to } of renames) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(file, text);
    touched += 1;
  }
}

console.log(`\n${renames.length} files: ${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB; ${touched} source files rewritten`);
