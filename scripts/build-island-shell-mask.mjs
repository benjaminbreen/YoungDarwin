// Extract a coarse Floreana land mask from the painted island chart for the
// optional continuous chart-shell distance-scenery mode.
//
// The playable maps are ~118 m vignettes scattered across a 14.5 x 11.6 km
// island and sit roughly 1.6 km apart, so a distant horizon cannot be built by
// tiling neighbouring region heightfields — at that spacing they would be wrong
// by more than an order of magnitude. The painted chart is the only source that
// describes the island at its true scale, so the shell derives its silhouette
// from the chart and anchors elevation with FLOREANA_MAP_PLACEMENTS.
//
// Output: public/assets/generated/island-shell/mask.json plus a review PNG.
// Run with `npm run data:island-shell`.

import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {
  FLOREANA_CHART_ASPECT,
  FLOREANA_CHART_WIDTH_KM,
  FLOREANA_MAP_PLACEMENTS,
} from '../game-core/floreanaGeography.js';

const root = process.cwd();
const sourceImage = path.join(root, 'public/maps/floreana-island-map-new.png');
const outputDirectory = path.join(root, 'public/assets/generated/island-shell');

// Mask resolution. The shell is a horizon backdrop seen from >140 m away, so
// this only needs to resolve headland-scale features, not coves.
const MASK_WIDTH = 192;
const MASK_HEIGHT = Math.round(MASK_WIDTH / FLOREANA_CHART_ASPECT);

// The chart paints the sea in blues and the land in tans, greens and greys.
// Classifying on "blue clearly dominates" is robust to the parchment texture
// and the compass rose without needing a hand-painted mask.
function isSea(r, g, b) {
  const maxLand = Math.max(r, g);
  return b > maxLand + 12 && b > 70;
}

function chartToKm(u, v) {
  const chartHeightKm = FLOREANA_CHART_WIDTH_KM / FLOREANA_CHART_ASPECT;
  return [u * FLOREANA_CHART_WIDTH_KM, v * chartHeightKm];
}

async function main() {
  const image = sharp(sourceImage).resize(MASK_WIDTH, MASK_HEIGHT, { fit: 'fill' });
  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const land = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  for (let index = 0; index < MASK_WIDTH * MASK_HEIGHT; index += 1) {
    const offset = index * info.channels;
    land[index] = isSea(data[offset], data[offset + 1], data[offset + 2]) ? 0 : 1;
  }

  // Drop specks and fill pinholes so the coastline reads as one landmass
  // rather than a stippled edge once it becomes geometry.
  const cleaned = new Uint8Array(land);
  for (let y = 1; y < MASK_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MASK_WIDTH - 1; x += 1) {
      const index = y * MASK_WIDTH + x;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          neighbours += land[index + dy * MASK_WIDTH + dx];
        }
      }
      if (land[index] === 1 && neighbours <= 2) cleaned[index] = 0;
      if (land[index] === 0 && neighbours >= 6) cleaned[index] = 1;
    }
  }

  // The chart is a painted document: its parchment margin sits outside the
  // painted sea and classifies as land. Keep only the landmass connected to the
  // island's central peak, which discards the border and any offshore paper.
  const peakPlacement = FLOREANA_MAP_PLACEMENTS.find(placement => placement.id === 'C_HIGH');
  const seedX = Math.min(MASK_WIDTH - 1, Math.floor(peakPlacement.at[0] * MASK_WIDTH));
  const seedY = Math.min(MASK_HEIGHT - 1, Math.floor(peakPlacement.at[1] * MASK_HEIGHT));
  const island = new Uint8Array(cleaned.length);
  const stack = [seedY * MASK_WIDTH + seedX];
  while (stack.length) {
    const index = stack.pop();
    if (island[index] || !cleaned[index]) continue;
    island[index] = 1;
    const x = index % MASK_WIDTH;
    const y = (index - x) / MASK_WIDTH;
    if (x > 0) stack.push(index - 1);
    if (x < MASK_WIDTH - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - MASK_WIDTH);
    if (y < MASK_HEIGHT - 1) stack.push(index + MASK_WIDTH);
  }
  cleaned.set(island);

  let landCells = 0;
  for (const value of cleaned) landCells += value;
  const chartHeightKm = FLOREANA_CHART_WIDTH_KM / FLOREANA_CHART_ASPECT;
  const cellAreaKm2 = (FLOREANA_CHART_WIDTH_KM / MASK_WIDTH) * (chartHeightKm / MASK_HEIGHT);

  const anchors = FLOREANA_MAP_PLACEMENTS
    .filter(placement => !placement.test)
    .map(placement => {
      const [eastKm, southKm] = chartToKm(placement.at[0], placement.at[1]);
      const cellX = Math.min(MASK_WIDTH - 1, Math.floor(placement.at[0] * MASK_WIDTH));
      const cellY = Math.min(MASK_HEIGHT - 1, Math.floor(placement.at[1] * MASK_HEIGHT));
      return {
        id: placement.id,
        kind: placement.kind,
        at: placement.at,
        eastKm: Number(eastKm.toFixed(3)),
        southKm: Number(southKm.toFixed(3)),
        onLand: cleaned[cellY * MASK_WIDTH + cellX] === 1,
      };
    });

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(
    path.join(outputDirectory, 'mask.json'),
    `${JSON.stringify({
      version: 1,
      width: MASK_WIDTH,
      height: MASK_HEIGHT,
      chartWidthKm: FLOREANA_CHART_WIDTH_KM,
      chartHeightKm: Number(chartHeightKm.toFixed(4)),
      landAreaKm2: Number((landCells * cellAreaKm2).toFixed(2)),
      anchors,
      // Row-major, one character per cell: '#' land, '.' sea. Readable in a
      // diff, which matters because the coastline is authored art downstream.
      rows: Array.from({ length: MASK_HEIGHT }, (unused, y) => (
        Array.from({ length: MASK_WIDTH }, (alsoUnused, x) => (
          cleaned[y * MASK_WIDTH + x] ? '#' : '.'
        )).join('')
      )),
    }, null, 2)}\n`,
  );

  // Review image: land opaque, sea transparent-dark, placement anchors marked.
  const preview = Buffer.alloc(MASK_WIDTH * MASK_HEIGHT * 3);
  for (let index = 0; index < MASK_WIDTH * MASK_HEIGHT; index += 1) {
    const isLand = cleaned[index] === 1;
    preview[index * 3] = isLand ? 196 : 24;
    preview[index * 3 + 1] = isLand ? 170 : 52;
    preview[index * 3 + 2] = isLand ? 120 : 88;
  }
  for (const anchor of anchors) {
    const cellX = Math.min(MASK_WIDTH - 1, Math.floor(anchor.at[0] * MASK_WIDTH));
    const cellY = Math.min(MASK_HEIGHT - 1, Math.floor(anchor.at[1] * MASK_HEIGHT));
    const offset = (cellY * MASK_WIDTH + cellX) * 3;
    preview[offset] = anchor.onLand ? 40 : 235;
    preview[offset + 1] = anchor.onLand ? 190 : 60;
    preview[offset + 2] = anchor.onLand ? 90 : 60;
  }
  await sharp(preview, { raw: { width: MASK_WIDTH, height: MASK_HEIGHT, channels: 3 } })
    .resize(MASK_WIDTH * 4, MASK_HEIGHT * 4, { kernel: 'nearest' })
    .png()
    .toFile(path.join(outputDirectory, 'mask-preview.png'));

  const offLand = anchors.filter(anchor => !anchor.onLand && anchor.kind !== 'water');
  console.log(`[island-shell] mask ${MASK_WIDTH}x${MASK_HEIGHT}, land ${(100 * landCells / cleaned.length).toFixed(1)}% (${(landCells * cellAreaKm2).toFixed(1)} km2)`);
  console.log(`[island-shell] anchors on land: ${anchors.filter(a => a.onLand).length}/${anchors.length}`);
  if (offLand.length) {
    console.log(`[island-shell] non-water placements reading as sea: ${offLand.map(a => a.id).join(', ')}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
