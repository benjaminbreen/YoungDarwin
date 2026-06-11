'use client';

import { useEffect, useState } from 'react';
import { sampleRegionMap } from '../../world/terrain';

// Bakes a top-down hillshaded view of the zone's real heightfield into a
// data-URL once per zone. It keeps the authored terrain colors, with just
// enough relief and contour information to make navigation readable.

const BAKE_RESOLUTION = 336;
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

function mixChannel(a, b, t) {
  return a * (1 - t) + b * t;
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
        if (sample.biome !== 'water') {
          // Shallow shelves and coral gardens should still read through the
          // water instead of collapsing into one flat blue field.
          const seabed = Math.max(0, 1 - depth) * 0.46;
          r = mixChannel(r, sample.color.r * 255, seabed);
          g = mixChannel(g, sample.color.g * 255, seabed);
          b = mixChannel(b, sample.color.b * 255, seabed);
        }
      } else {
        const shade = shadeFromNormal((hr - h) / step, (hd - h) / step);
        r = sample.color.r * 255 * shade;
        g = sample.color.g * 255 * shade;
        b = sample.color.b * 255 * shade;
        // A very light warm bias keeps the HUD cohesive without turning the
        // local view into a parchment map.
        r = r * 0.95 + 214 * 0.05;
        g = g * 0.95 + 188 * 0.05;
        b = b * 0.95 + 142 * 0.05;
        // Contour lines at fixed height intervals.
        const band = Math.floor(h / CONTOUR_INTERVAL);
        if (band !== Math.floor(hr / CONTOUR_INTERVAL) || band !== Math.floor(hd / CONTOUR_INTERVAL)) {
          r *= 0.84;
          g *= 0.83;
          b *= 0.8;
        }
        // Darken the waterline so the coast reads as an inked edge.
        if (h < -0.55) {
          r *= 0.86;
          g *= 0.88;
          b *= 0.9;
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
