'use client';

import { useEffect, useState } from 'react';
import { sampleRegionMap } from '../../world/terrain';

// Bakes a top-down hillshaded chart of the zone's real heightfield into a
// data-URL once per zone. The result looks like a surveyor's relief map (the
// mockup's "live terrain" panel) but costs nothing per frame.

const BAKE_RESOLUTION = 168;
const CONTOUR_INTERVAL = 0.85;

// Light from the upper-left of the chart, matching a classic relief map.
const LIGHT = { x: -0.55, y: 0.72, z: -0.42 };
const LIGHT_LEN = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);

function shadeFromNormal(dhdx, dhdz) {
  const nx = -dhdx;
  const ny = 1;
  const nz = -dhdz;
  const len = Math.hypot(nx, ny, nz) * LIGHT_LEN;
  const dot = (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / len;
  return 0.72 + Math.max(-0.45, Math.min(0.45, dot)) * 0.62;
}

export function bakeTerrainChart(zone) {
  if (typeof document === 'undefined') return null;
  // Sample the zone's true footprint; non-square zones must not tile or
  // stretch past their bounds.
  const size = zone.terrainSize || (zone.bounds ? zone.bounds * 2 : 100);
  const n = BAKE_RESOLUTION;
  const step = size / n;
  const heights = new Float32Array(n * n);
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(n, n);
  const data = image.data;

  const samples = new Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1) - 0.5) * size;
      const z = (j / (n - 1) - 0.5) * size;
      const sample = sampleRegionMap(zone.id, x, z);
      samples[j * n + i] = sample;
      heights[j * n + i] = sample.height;
    }
  }

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = j * n + i;
      const sample = samples[idx];
      const h = heights[idx];
      const hr = heights[j * n + Math.min(n - 1, i + 1)];
      const hd = heights[Math.min(n - 1, j + 1) * n + i];
      let r;
      let g;
      let b;
      if (sample.biome === 'water' || h < -0.88) {
        // Depth-graded water: shallows glow turquoise, depths go slate-teal.
        const depth = Math.max(0, Math.min(1, (-0.88 - h) / 3.2));
        r = 116 - 70 * depth;
        g = 185 - 90 * depth;
        b = 201 - 75 * depth;
      } else {
        const shade = shadeFromNormal((hr - h) / step, (hd - h) / step);
        r = sample.color.r * 255 * shade;
        g = sample.color.g * 255 * shade;
        b = sample.color.b * 255 * shade;
        // Pull land tones toward warm parchment so the chart reads as an
        // engraved survey rather than a satellite photo.
        r = r * 0.82 + 214 * 0.18;
        g = g * 0.82 + 188 * 0.18;
        b = b * 0.82 + 142 * 0.18;
        // Contour lines at fixed height intervals.
        const band = Math.floor(h / CONTOUR_INTERVAL);
        if (band !== Math.floor(hr / CONTOUR_INTERVAL) || band !== Math.floor(hd / CONTOUR_INTERVAL)) {
          r *= 0.74;
          g *= 0.72;
          b *= 0.68;
        }
        // Darken the waterline so the coast reads as an inked edge.
        if (h < -0.55) {
          r *= 0.8;
          g *= 0.84;
          b *= 0.86;
        }
      }
      data[idx * 4] = Math.max(0, Math.min(255, r));
      data[idx * 4 + 1] = Math.max(0, Math.min(255, g));
      data[idx * 4 + 2] = Math.max(0, Math.min(255, b));
      data[idx * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

const chartCache = new Map();

export function useTerrainChart(zone) {
  const [chartUrl, setChartUrl] = useState(null);

  useEffect(() => {
    if (!zone?.id) return null;
    if (!chartCache.has(zone.id)) chartCache.set(zone.id, bakeTerrainChart(zone));
    setChartUrl(chartCache.get(zone.id));
    return undefined;
  }, [zone?.id]);

  return chartUrl;
}
