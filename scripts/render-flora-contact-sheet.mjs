#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const natureDir = path.join(root, 'public/assets/models/nature');
const outDir = path.join(root, 'test-results/flora-sheets');
const tilesDir = path.join(outDir, 'tiles');
const manifestPath = path.join(outDir, 'flora-assets.json');
const blender = '/Applications/Blender.app/Contents/MacOS/Blender';

const LABELS = {
  'runtime-animated-dry-grass.glb': 'Dry grass patch',
  'runtime-big-opuntia.glb': 'Large Opuntia study',
  'runtime-candelabra-cactus.glb': 'Candelabra cactus',
  'runtime-croton.glb': 'Chala / Croton scouleri',
  'runtime-darwiniothamnus.glb': "Darwin's shrub / Darwiniothamnus (9 forms)",
  'runtime-drybrush.glb': 'Dry brush and wrack field',
  'runtime-flat-cactus.glb': 'Flat cactus study',
  'runtime-galapagos-bushes.glb': 'Galapagos bush collection',
  'runtime-galapagos-cotton.glb': 'Galapagos cotton',
  'runtime-galapagos-fern.glb': 'Galapagos fern',
  'runtime-grass-patch-1.glb': 'Grass patch 1',
  'runtime-grass-patch-2.glb': 'Grass patch 2',
  'runtime-grass-patch-3.glb': 'Grass patch 3',
  'runtime-ground-plants.glb': 'Ground plant collection',
  'runtime-jasminocereus-1.glb': 'Jasminocereus study 1',
  'runtime-jasminocereus-2.glb': 'Jasminocereus study 2',
  'runtime-mangrove-lowpoly.glb': 'Low-poly mangrove',
  'runtime-mangrove-tree.glb': 'Mangrove tree',
  'runtime-manzanillo.glb': 'Manzanillo',
  'runtime-opuntia.glb': 'Opuntia / prickly pear',
  'runtime-palo-santo.glb': 'Bitterbush proxy / Castela galapageia',
  'runtime-plant-shrub.glb': 'Rocky clearing shrub',
  'runtime-purple-shrub.glb': 'Purple highland shrub',
  'runtime-saltbush-1.glb': 'Monte salado study 1',
  'runtime-saltbush-2.glb': 'Monte salado study 2',
  'runtime-saltbush-3.glb': 'Monte salado study 3',
  'runtime-saltgrass.glb': 'Saltgrass',
  'runtime-scalesia-pedunculata-tree.glb': 'Scalesia pedunculata tree',
  'runtime-scalesia-pedunculata.glb': 'Scalesia pedunculata shrub',
  'runtime-scalesia.glb': 'Scalesia villosa',
  'runtime-sesuvium-edmonstonei.glb': 'Sesuvium edmonstonei',
  'runtime-sesuvium.glb': 'Sea purslane / Sesuvium',
  'runtime-small-shrub.glb': 'Rocky clearing small shrub',
};

const manifest = Object.entries(LABELS).map(([filename, label]) => ({
  filename,
  label,
  path: path.join(natureDir, filename),
}));

const missing = manifest.filter(entry => !fs.existsSync(entry.path));
if (missing.length) {
  throw new Error(`Missing flora assets:\n${missing.map(entry => entry.path).join('\n')}`);
}
if (!fs.existsSync(blender)) throw new Error(`Blender not found at ${blender}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(tilesDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

execFileSync(blender, [
  '--background',
  '--factory-startup',
  '--disable-autoexec',
  '--python', path.join(root, 'scripts/blender_flora_contact_sheet.py'),
  '--',
  '--manifest', manifestPath,
  '--out', tilesDir,
  '--size', '480',
], { cwd: root, stdio: 'inherit' });

const results = JSON.parse(fs.readFileSync(path.join(tilesDir, 'render-results.json'), 'utf8'));
const rendered = results.filter(entry => entry.tile && fs.existsSync(entry.tile));
const failures = results.filter(entry => entry.error);
if (!rendered.length) throw new Error('No flora review tiles rendered.');

const sheetPath = path.join(outDir, 'flora-contact-sheet.png');
const montageArgs = ['montage'];
for (const entry of rendered) {
  montageArgs.push('(', entry.tile, '-set', 'label', entry.label, ')');
}
montageArgs.push(
  '-background', '#131a20',
  '-fill', '#e3d3aa',
  '-stroke', 'none',
  '-font', 'Georgia',
  '-pointsize', '18',
  '-gravity', 'north',
  '-geometry', '480x530+12+12',
  '-tile', '4x',
  sheetPath,
);
execFileSync('/opt/homebrew/bin/magick', montageArgs, { cwd: root, stdio: 'inherit' });

console.log(`\nFlora contact sheet: ${path.relative(root, sheetPath)}`);
console.log(`Rendered ${rendered.length}/${manifest.length} assets.`);
if (failures.length) {
  console.warn(`Failed assets:\n${failures.map(entry => `${entry.label}: ${entry.error}`).join('\n')}`);
  process.exitCode = 1;
}
