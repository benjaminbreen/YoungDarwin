// Build the compact texture set used by island travel and the two heaviest
// authored regions. Sources remain lossless PNGs; runtime albedos/charts are
// WebP because these images do not need an alpha channel.

import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const root = process.cwd();
const terrainDir = path.join(root, 'public/assets/textures/world/floreana-pbr');
const terrainStems = [
  'dark-basalt-gravel',
  'dry-grass-litter',
  'grass',
  'loam',
  'olivine-beach',
  'red-cinder-dirt',
  'sandy-tuff',
];
const jobs = terrainStems.map(stem => ({
  input: path.join(terrainDir, `${stem}_albedo.png`),
  output: path.join(terrainDir, `${stem}_albedo.webp`),
  quality: 82,
}));
jobs.push({
  input: path.join(root, 'public/maps/floreana-island-map-new.png'),
  output: path.join(root, 'public/maps/floreana-island-map-new.webp'),
  quality: 88,
});

for (const job of jobs) {
  const temporary = `${job.output}.building.webp`;
  await sharp(job.input)
    .webp({ quality: job.quality, smartSubsample: true })
    .toFile(temporary);
  await fs.rename(temporary, job.output);
  const stat = await fs.stat(job.output);
  console.log(`${path.relative(root, job.output)} ${Math.round(stat.size / 1024)} KiB`);
}
