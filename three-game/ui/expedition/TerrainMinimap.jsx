'use client';

import { useEffect, useState } from 'react';
import { sampleRegionMap } from '../../world/terrain';

// Bakes a top-down hillshaded view of the zone's real heightfield into a
// data-URL once per zone. It keeps the authored terrain colors, with just
// enough relief and contour information to make navigation readable.

const BAKE_RESOLUTION = 336;
const CONTOUR_INTERVAL = 0.85;
const SURVEY_MINOR_CONTOUR = 0.7;
const SURVEY_MAJOR_CONTOUR = 2.1;
const CHART_CACHE_VERSION = 'v4';

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

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function paperNoise(i, j) {
  const a = Math.sin((i * 12.9898 + j * 78.233) * 0.92) * 43758.5453;
  return a - Math.floor(a);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function softPatch(i, j, scale, seed = 0) {
  const x = i / scale + seed * 17.31;
  const y = j / scale - seed * 23.17;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = smoothstep(x - ix);
  const ty = smoothstep(y - iy);
  const a = paperNoise(ix, iy);
  const b = paperNoise(ix + 1, iy);
  const c = paperNoise(ix, iy + 1);
  const d = paperNoise(ix + 1, iy + 1);
  return mixChannel(mixChannel(a, b, tx), mixChannel(c, d, tx), ty);
}

function seededUnit(seed, index, salt = 0) {
  const a = Math.sin((seed * 97.13 + index * 37.71 + salt * 19.19) * 12.9898) * 43758.5453;
  return a - Math.floor(a);
}

function biomeKind(biome = '') {
  if (biome === 'water' || biome.includes('pool')) return 'water';
  if (biome.includes('sand') || biome.includes('beach') || biome.includes('flat')) return 'sand';
  if (biome.includes('forest') || biome.includes('mangrove') || biome.includes('scalesia') || biome.includes('palo-santo')) return 'trees';
  if (biome.includes('fern') || biome.includes('humid') || biome.includes('understory') || biome.includes('moss') || biome.includes('wet-hollow')) return 'green';
  if (biome.includes('scrub') || biome.includes('sesuvium') || biome.includes('salt') || biome.includes('clearing')) return 'scrub';
  if (biome.includes('lava') || biome.includes('basalt') || biome.includes('ash') || biome.includes('ridge')) return 'rock';
  return 'dry';
}

function watercolorWash(sample, h, slopeShade, i, j) {
  const grain = (paperNoise(i, j) - 0.5) * 13;
  const bloom = (softPatch(i, j, 48, 3) - 0.5) * 24 + (softPatch(i, j, 96, 5) - 0.5) * 18;
  const kind = biomeKind(sample.biome);
  if (sample.biome === 'water' || h < -0.88) {
    const depth = Math.max(0, Math.min(1, (-0.88 - h) / 3.1));
    const shallows = Math.max(0, 1 - depth);
    const wash = 0.82 + softPatch(i, j, 80, 9) * 0.24 + softPatch(i, j, 148, 2) * 0.12;
    return {
      r: (88 + shallows * 52 - depth * 26) * wash + grain * 0.28 + bloom * 0.2,
      g: (179 + shallows * 44 - depth * 35) * wash + grain * 0.52 + bloom * 0.32,
      b: (213 + shallows * 34 - depth * 20) * wash + grain * 0.82 + bloom * 0.42,
    };
  }
  const altitude = Math.max(0, Math.min(1, (h + 0.45) / 7.2));
  const palettes = {
    sand: { base: { r: 219, g: 193, b: 135 }, high: { r: 187, g: 156, b: 104 } },
    scrub: { base: { r: 197, g: 179, b: 116 }, high: { r: 143, g: 146, b: 86 } },
    trees: { base: { r: 163, g: 171, b: 104 }, high: { r: 102, g: 126, b: 78 } },
    green: { base: { r: 151, g: 168, b: 103 }, high: { r: 91, g: 124, b: 83 } },
    rock: { base: { r: 177, g: 154, b: 111 }, high: { r: 114, g: 102, b: 84 } },
    dry: { base: { r: 204, g: 178, b: 124 }, high: { r: 154, g: 128, b: 92 } },
  };
  const palette = palettes[kind] || palettes.dry;
  let r = mixChannel(palette.base.r, palette.high.r, altitude) * slopeShade + grain + bloom * 0.38;
  let g = mixChannel(palette.base.g, palette.high.g, altitude) * slopeShade + grain * 0.72 + bloom * 0.32;
  let b = mixChannel(palette.base.b, palette.high.b, altitude) * slopeShade + grain * 0.45 + bloom * 0.18;
  if (kind === 'trees' || kind === 'green' || kind === 'scrub') {
    const wash = Math.max(0, softPatch(i, j, kind === 'scrub' ? 54 : 38, 12) - 0.34);
    r = mixChannel(r, kind === 'scrub' ? 148 : 86, wash * 0.42);
    g = mixChannel(g, kind === 'scrub' ? 149 : 129, wash * 0.42);
    b = mixChannel(b, kind === 'scrub' ? 87 : 70, wash * 0.3);
  }
  if (kind === 'sand') {
    const wash = Math.max(0, softPatch(i, j, 62, 14) - 0.26);
    r = mixChannel(r, 230, wash * 0.34);
    g = mixChannel(g, 204, wash * 0.32);
    b = mixChannel(b, 148, wash * 0.2);
  }
  return { r, g, b };
}

function sampleAt(samples, n, x, y) {
  const i = Math.max(0, Math.min(n - 1, Math.round(x)));
  const j = Math.max(0, Math.min(n - 1, Math.round(y)));
  return samples[j * n + i];
}

function heightAt(heights, n, x, y) {
  const i = Math.max(0, Math.min(n - 1, Math.round(x)));
  const j = Math.max(0, Math.min(n - 1, Math.round(y)));
  return heights[j * n + i];
}

function drawEllipseGradient(ctx, x, y, rx, ry, rotation, inner, outer) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.62, inner.replace(/,\s*[\d.]+\)$/, ',0.055)'));
  gradient.addColorStop(1, outer);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx, ry);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPigmentBlooms(ctx, samples, heights, n) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'blur(0.45px)';
  for (let index = 0; index < 240; index += 1) {
    const x = seededUnit(31, index, 1) * n;
    const y = seededUnit(31, index, 2) * n;
    const sample = sampleAt(samples, n, x, y);
    const kind = biomeKind(sample.biome);
    const h = heightAt(heights, n, x, y);
    if (kind === 'water') {
      const depth = Math.max(0, Math.min(1, (-0.88 - h) / 3.1));
      const shallow = 1 - depth;
      const alpha = 0.11 + shallow * 0.09 + seededUnit(31, index, 3) * 0.05;
      drawEllipseGradient(
        ctx,
        x,
        y,
        24 + seededUnit(31, index, 4) * 34,
        13 + seededUnit(31, index, 5) * 24,
        seededUnit(31, index, 6) * Math.PI,
        `rgba(${42 + shallow * 30},${153 + shallow * 34},${192 + shallow * 24},${alpha})`,
        'rgba(42,153,192,0)',
      );
      continue;
    }
    if (h < -0.7) continue;
    if (kind !== 'sand' && kind !== 'trees' && kind !== 'green' && kind !== 'scrub') continue;
    if (seededUnit(31, index, 7) > (kind === 'sand' ? 0.62 : 0.48)) continue;
    const color = kind === 'sand'
      ? 'rgba(219,181,94,0.11)'
      : kind === 'scrub'
        ? 'rgba(118,132,62,0.105)'
        : 'rgba(76,125,60,0.12)';
    drawEllipseGradient(
      ctx,
      x,
      y,
      13 + seededUnit(31, index, 8) * 24,
      9 + seededUnit(31, index, 9) * 18,
      seededUnit(31, index, 10) * Math.PI,
      color,
      'rgba(76,125,60,0)',
    );
  }
  ctx.filter = 'none';
  ctx.restore();
}

function drawVegetationWash(ctx, samples, heights, n) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'blur(0.2px)';
  for (let index = 0; index < 180; index += 1) {
    const x = seededUnit(67, index, 1) * n;
    const y = seededUnit(67, index, 2) * n;
    const sample = sampleAt(samples, n, x, y);
    const kind = biomeKind(sample.biome);
    const h = heightAt(heights, n, x, y);
    if (h < -0.65) continue;
    const density = kind === 'trees' ? 0.72 : kind === 'green' ? 0.48 : kind === 'scrub' ? 0.28 : 0;
    if (!density || seededUnit(67, index, 3) > density) continue;
    const blobs = kind === 'scrub' ? 3 : 6;
    for (let blob = 0; blob < blobs; blob += 1) {
      const ox = (seededUnit(67 + blob, index, 4) - 0.5) * (kind === 'scrub' ? 9 : 13);
      const oy = (seededUnit(67 + blob, index, 5) - 0.5) * (kind === 'scrub' ? 8 : 12);
      const rx = (kind === 'scrub' ? 2.4 : 3.4) + seededUnit(67 + blob, index, 6) * (kind === 'scrub' ? 2.4 : 3.8);
      const ry = (kind === 'scrub' ? 1.7 : 2.8) + seededUnit(67 + blob, index, 7) * (kind === 'scrub' ? 2.0 : 3.4);
      const alpha = kind === 'scrub'
        ? 0.1 + seededUnit(67 + blob, index, 8) * 0.05
        : 0.12 + seededUnit(67 + blob, index, 8) * 0.075;
      const inner = kind === 'scrub'
        ? `rgba(94,111,48,${alpha})`
        : `rgba(${48 + seededUnit(67 + blob, index, 9) * 24},${90 + seededUnit(67 + blob, index, 10) * 42},${45 + seededUnit(67 + blob, index, 11) * 24},${alpha})`;
      drawEllipseGradient(
        ctx,
        x + ox,
        y + oy,
        rx,
        ry,
        seededUnit(67 + blob, index, 12) * Math.PI,
        inner,
        'rgba(50,90,45,0)',
      );
    }
  }
  ctx.filter = 'none';
  ctx.restore();
}

function bakeSurveyChartPixels(samples, heights, n, step) {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(n, n);
  const data = image.data;

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = j * n + i;
      const sample = samples[idx];
      const h = heights[idx];
      const hr = heights[j * n + Math.min(n - 1, i + 1)];
      const hd = heights[Math.min(n - 1, j + 1) * n + i];
      const hl = heights[j * n + Math.max(0, i - 1)];
      const hu = heights[Math.max(0, j - 1) * n + i];
      const dhdx = (hr - hl) / (step * 2);
      const dhdz = (hd - hu) / (step * 2);
      const shade = 0.95 + Math.max(-0.18, Math.min(0.16, shadeFromNormal(dhdx, dhdz) - 1)) * 0.55;
      let { r, g, b } = watercolorWash(sample, h, shade, i, j);

      const minorBand = Math.floor(h / SURVEY_MINOR_CONTOUR);
      const majorBand = Math.floor(h / SURVEY_MAJOR_CONTOUR);
      const minorEdge = minorBand !== Math.floor(hr / SURVEY_MINOR_CONTOUR) || minorBand !== Math.floor(hd / SURVEY_MINOR_CONTOUR);
      const majorEdge = majorBand !== Math.floor(hr / SURVEY_MAJOR_CONTOUR) || majorBand !== Math.floor(hd / SURVEY_MAJOR_CONTOUR);
      const waterEdge = (h < -0.88) !== (hr < -0.88) || (h < -0.88) !== (hd < -0.88);
      const altitudeTint = Math.max(0, Math.min(1, Math.floor((h + 0.8) / SURVEY_MAJOR_CONTOUR) / 4));
      r = mixChannel(r, 174, altitudeTint * 0.08);
      g = mixChannel(g, 124, altitudeTint * 0.06);
      b = mixChannel(b, 78, altitudeTint * 0.045);
      if (minorEdge && h > -0.88) {
        r *= 0.76;
        g *= 0.7;
        b *= 0.62;
      }
      if (majorEdge && h > -0.88) {
        r *= 0.52;
        g *= 0.45;
        b *= 0.38;
      }
      if (waterEdge) {
        r *= 0.42;
        g *= 0.38;
        b *= 0.34;
      }
      data[idx * 4] = clampByte(r);
      data[idx * 4 + 1] = clampByte(g);
      data[idx * 4 + 2] = clampByte(b);
      data[idx * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  drawPigmentBlooms(ctx, samples, heights, n);
  drawVegetationWash(ctx, samples, heights, n);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = 'rgba(70,47,28,0.55)';
  ctx.lineWidth = 0.55;
  for (let j = 12; j < n - 12; j += 14) {
    for (let i = 12; i < n - 12; i += 14) {
      const hx = Math.max(1, Math.min(n - 2, Math.round(i + (paperNoise(i, j) - 0.5) * 7)));
      const hy = Math.max(1, Math.min(n - 2, Math.round(j + (paperNoise(i + 11, j - 5) - 0.5) * 7)));
      const idx = hy * n + hx;
      const h = heights[idx];
      if (h < -0.65) continue;
      const right = heights[hy * n + Math.min(n - 1, hx + 3)];
      const down = heights[Math.min(n - 1, hy + 3) * n + hx];
      const grade = Math.hypot(right - h, down - h);
      if (grade < 0.08) continue;
      const angle = Math.atan2(down - h, right - h) + Math.PI / 2;
      const len = Math.max(3, Math.min(8, grade * 5.5));
      ctx.beginPath();
      ctx.moveTo(hx - Math.cos(angle) * len * 0.5, hy - Math.sin(angle) * len * 0.5);
      ctx.lineTo(hx + Math.cos(angle) * len * 0.5, hy + Math.sin(angle) * len * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const vignette = ctx.createRadialGradient(n * 0.5, n * 0.46, n * 0.22, n * 0.5, n * 0.5, n * 0.72);
  vignette.addColorStop(0, 'rgba(255,247,220,0)');
  vignette.addColorStop(1, 'rgba(88,58,30,0.23)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, n, n);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export function bakeTerrainChart(zone, variant = 'terrain') {
  if (typeof document === 'undefined') return null;
  // Sample the zone's true footprint; non-square zones must not tile or
  // stretch past their bounds.
  const width = zone.terrainWidth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : 100);
  const depth = zone.terrainDepth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : width);
  const n = BAKE_RESOLUTION;
  const step = Math.max(width, depth) / n;
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
      const x = (i / (n - 1) - 0.5) * width;
      const z = (j / (n - 1) - 0.5) * depth;
      const sample = sampleRegionMap(zone.id, x, z);
      samples[j * n + i] = sample;
      heights[j * n + i] = sample.height;
    }
  }

  if (variant === 'survey') return bakeSurveyChartPixels(samples, heights, n, step);

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
      data[idx * 4] = clampByte(r);
      data[idx * 4 + 1] = clampByte(g);
      data[idx * 4 + 2] = clampByte(b);
      data[idx * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

const chartCache = new Map();

export function useTerrainChart(zone, variant = 'terrain') {
  const [chartUrl, setChartUrl] = useState(null);

  useEffect(() => {
    if (!zone?.id) return null;
    const key = `${CHART_CACHE_VERSION}:${zone.id}:${variant}`;
    if (!chartCache.has(key)) chartCache.set(key, bakeTerrainChart(zone, variant));
    setChartUrl(chartCache.get(key));
    return undefined;
  }, [zone?.id, variant]);

  return chartUrl;
}
