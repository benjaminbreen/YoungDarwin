'use client';

import { useEffect, useState } from 'react';
import { sampleRegionMap } from '../../world/terrain';
import { getEcology } from '../../world/ecology';
import { getRuntimeObstacles } from '../../world/obstacles';

// Bakes a top-down hillshaded view of the zone's real heightfield into a
// data-URL once per zone. It keeps the authored terrain colors, with just
// enough relief and contour information to make navigation readable.

// A sample costs about 7µs, so resolution is bought in whole seconds of CPU.
// 384 covers the docked panel at 2x without the second-and-a-half 512 wanted.
const BAKE_RESOLUTION = 384;
const DRAFT_RESOLUTION = 192;
const CONTOUR_INTERVAL = 0.85;
const MAJOR_CONTOUR_INTERVAL = 2.55;
const SURVEY_MINOR_CONTOUR = 0.7;
const SURVEY_MAJOR_CONTOUR = 2.1;
// Height at which a sample counts as sea. The land and water branches both need
// it to agree, or the inked coastline lands on the wrong pixel.
const WATERLINE = -0.88;
const CHART_CACHE_VERSION = 'v18';

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

// Sampling the heightfield costs about 7µs a point, so a full field is well
// over a second of main thread. It is handed out in chunks instead — see
// subscribeToChartBake.
function createChartField(zone, n) {
  // Sample the zone's true footprint; non-square zones must not tile or
  // stretch past their bounds.
  const width = zone.terrainWidth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : 100);
  const depth = zone.terrainDepth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : width);
  const total = n * n;
  let cursor = 0;
  return {
    zone,
    width,
    depth,
    n,
    step: Math.max(width, depth) / n,
    heights: new Float32Array(total),
    samples: new Array(total),
    get done() {
      return cursor >= total;
    },
    sampleChunk(count) {
      const end = Math.min(total, cursor + count);
      while (cursor < end) {
        const i = cursor % n;
        const j = (cursor - i) / n;
        const x = (i / (n - 1) - 0.5) * width;
        const z = (j / (n - 1) - 0.5) * depth;
        const sample = sampleRegionMap(zone.id, x, z);
        this.samples[cursor] = sample;
        this.heights[cursor] = sample.height;
        cursor += 1;
      }
      return cursor >= total;
    },
  };
}

// Target brightness for each ground type, low ground to high. World colours are
// lit for standing in, not for looking down at from a page: Northwest Reef's
// basalt is #3b372f, which on a 200px chart is a hole. Each pixel keeps its
// hue and gets rescaled into the band its ground type belongs in.
// Wide bands, with real darks at the bottom. The island chart earns its
// richness from range — rust to umber inside one hillside — and a narrow band
// is what made the local sheet read as uniform beige.
const CHART_VALUE_BANDS = {
  sand: [138, 210],
  scrub: [96, 172],
  trees: [62, 136],
  green: [64, 140],
  rock: [74, 152],
  dry: [110, 192],
};
// A single tone glazed over every ground type is what makes a painted chart
// read as one sheet rather than a biome key. Saturation is applied after it, so
// the glaze harmonises the hues without also flattening them.
const CHART_GLAZE = { r: 150, g: 130, b: 96, amount: 0.07 };
const CHART_SEA_GLAZE = { r: 60, g: 176, b: 196, amount: 0.06 };

// Lifted from WATER_DAY in components/scene/Water.jsx. The chart sea should be
// the same water the player is standing next to, not a separate blue.
const SEA_SHALLOW = { r: 174, g: 214, b: 226 };
const SEA_LAGOON = { r: 60, g: 176, b: 196 };
const SEA_DEEP = { r: 36, g: 118, b: 168 };
const SEA_OPEN = { r: 18, g: 92, b: 146 };
const SEA_FOAM = { r: 233, g: 244, b: 240 };
const CHART_SATURATION = 1.34;
// Ceiling on how far a channel may sit from the pixel's own brightness. Baked
// path splats and red soil arrive at chart scale as neon orange; this pulls
// only those back toward the ground they cross, and leaves everything already
// within the ceiling — sand, scrub, rock — untouched.
const CHART_MAX_CHROMA = 0.42;
// A second, tighter ceiling on red specifically. Chroma alone leaves a path
// splat as a salmon ribbon — the same hue as the unrecorded-specimen markers.
// Greens, teals and rock sit far below this, so only the warm splats move.
const CHART_MAX_REDNESS = 0.25;

// An over-chromatic pixel is pulled toward `tone` at its own brightness, not
// toward grey: grey at beach luminance reads mauve next to warm sand, which is
// how a tempered path splat ends up looking like a bruise.
function temperChroma(r, g, b, tone) {
  const luminance = r * 0.299 + g * 0.587 + b * 0.114;
  if (luminance <= 1) return [r, g, b];
  const spread = Math.max(Math.abs(r - luminance), Math.abs(g - luminance), Math.abs(b - luminance));
  const redness = (r - (g + b) * 0.5) / luminance;
  const pull = Math.min(
    spread > luminance * CHART_MAX_CHROMA ? (luminance * CHART_MAX_CHROMA) / spread : 1,
    redness > CHART_MAX_REDNESS ? CHART_MAX_REDNESS / redness : 1,
  );
  if (pull >= 1) return [r, g, b];
  const scale = luminance / tone.luminance;
  return [
    tone.r * scale + (r - tone.r * scale) * pull,
    tone.g * scale + (g - tone.g * scale) * pull,
    tone.b * scale + (b - tone.b * scale) * pull,
  ];
}

function toneOf(r, g, b) {
  return { r, g, b, luminance: r * 0.299 + g * 0.587 + b * 0.114 };
}

const CHART_LAND_TONE = toneOf(CHART_GLAZE.r, CHART_GLAZE.g, CHART_GLAZE.b);

// Height ranges vary by two orders of magnitude across the island — a reef flat
// covers 2m where the highlands cover 60. An absolute ramp leaves the flat
// zones in the bottom fifth of it, which is the whole reason they baked out
// grey. Normalise to what the zone actually spans.
function landHeightRange(heights) {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    if (h <= WATERLINE) continue;
    if (h < low) low = h;
    if (h > high) high = h;
  }
  if (!Number.isFinite(low)) return { low: 0, span: 1 };
  // Floor the span so a genuinely flat zone amplifies its own noise into relief.
  return { low, span: Math.max(1.5, high - low) };
}

// Vegetation on the chart is stamped from the ecology the scene actually
// placed, so a grove on the map is a grove underfoot. Ground cover is dropped:
// at this resolution a saltgrass tuft is a fraction of a pixel, and thousands
// of them only fog the sheet.
const PLANT_CLASSES = [
  {
    id: 'grass',
    match: /grass|sesuvium|sedge|reed|tuft|clover|carpet|moss|lichen|weed|herb/,
    skip: true,
  },
  {
    id: 'tree',
    match: /tree|scalesia|palo-santo|palosanto|mangrove|manzanillo|acacia|muyuyo|matazarno/,
    radius: 3.8,
    blobs: 5,
    ink: 'rgba(44,80,44,ALPHA)',
    alpha: 0.54,
  },
  {
    id: 'cactus',
    match: /cactus|opuntia|prickly|candelabra|lava-cactus/,
    radius: 2.3,
    blobs: 3,
    ink: 'rgba(84,106,74,ALPHA)',
    alpha: 0.46,
  },
  {
    id: 'bush',
    match: /bush|shrub|scrub|croton|cotton|saltbush|thorn|vine|fern|flower|daisy|lantana/,
    radius: 2.4,
    blobs: 4,
    ink: 'rgba(68,98,54,ALPHA)',
    alpha: 0.42,
  },
];
const PLANT_FALLBACK = PLANT_CLASSES[3];
// Keeps the paint pass bounded on a region that scatters thousands of one
// species; anything over this is strided rather than truncated, so the wash
// still covers the whole layer.
const PLANT_STAMPS_PER_LAYER = 700;

function plantClassFor(layer) {
  const key = `${layer.id || ''} ${layer.path || ''}`.toLowerCase();
  return PLANT_CLASSES.find(entry => entry.match.test(key)) || PLANT_FALLBACK;
}

// Broad cover, painted from the sampled biome grid. Authored flora is sparse —
// Eastern Cliffs places 101 plants across the whole map — so the stamps alone
// cannot say "this hillside is scrub". This lays the mass; the stamps above put
// the real plants on top of it.
const BIOME_WASH = {
  trees: { ink: 'rgba(54,90,48,ALPHA)', alpha: 0.17, spread: 5.4 },
  green: { ink: 'rgba(70,104,58,ALPHA)', alpha: 0.135, spread: 5 },
  scrub: { ink: 'rgba(102,118,64,ALPHA)', alpha: 0.095, spread: 4.6 },
};
const BIOME_WASH_STRIDE = 7;

function drawBiomeWash(ctx, samples, heights, n) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'blur(1.1px)';
  let stamp = 0;
  for (let j = BIOME_WASH_STRIDE >> 1; j < n; j += BIOME_WASH_STRIDE) {
    for (let i = BIOME_WASH_STRIDE >> 1; i < n; i += BIOME_WASH_STRIDE) {
      const idx = j * n + i;
      if (heights[idx] <= WATERLINE) continue;
      const wash = BIOME_WASH[biomeKind(samples[idx].biome)];
      if (!wash) continue;
      stamp += 1;
      // Jitter keeps the stride off the grid it was sampled on; without it the
      // wash reads as rows of dots.
      const jx = (seededUnit(stamp, 1, 3) - 0.5) * BIOME_WASH_STRIDE;
      const jy = (seededUnit(stamp, 2, 9) - 0.5) * BIOME_WASH_STRIDE;
      const alpha = wash.alpha * (0.6 + seededUnit(stamp, 3, 11) * 0.8);
      drawEllipseGradient(
        ctx,
        i + jx,
        j + jy,
        wash.spread * (0.75 + seededUnit(stamp, 4, 13) * 0.7),
        wash.spread * (0.6 + seededUnit(stamp, 5, 17) * 0.6),
        seededUnit(stamp, 6, 19) * Math.PI,
        wash.ink.replace('ALPHA', alpha.toFixed(3)),
        wash.ink.replace('ALPHA', '0'),
      );
    }
  }
  ctx.filter = 'none';
  ctx.restore();
}

// Boulders come from the shared obstacle source, so a rock drawn on the chart
// is a rock the player cannot walk through. Small ones are skipped: a chart
// marks landmarks, and a knee-high stone is not one.
const CHART_BOULDER_MIN_RADIUS = 0.9;

function drawBoulders(ctx, zone, n, width, depth) {
  let obstacles;
  try {
    obstacles = getRuntimeObstacles(zone.id);
  } catch {
    return;
  }
  if (!Array.isArray(obstacles) || !obstacles.length) return;
  const perMetre = n / Math.max(width, depth);
  ctx.save();
  for (const obstacle of obstacles) {
    const radius = Number(obstacle?.radius) || 0;
    if (radius < CHART_BOULDER_MIN_RADIUS) continue;
    if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.z)) continue;
    const px = (obstacle.x / width + 0.5) * (n - 1);
    const py = (obstacle.z / depth + 0.5) * (n - 1);
    if (px < -8 || px > n + 8 || py < -8 || py > n + 8) continue;
    const size = radius * perMetre;
    // Body, then a crescent of shadow away from the chart's upper-left light,
    // which is what makes a blob read as a standing rock rather than a stain.
    drawEllipseGradient(
      ctx,
      px,
      py,
      size * 1.05,
      size * 0.86,
      seededUnit(Math.round(obstacle.x * 7), Math.round(obstacle.z * 7), 3) * Math.PI,
      'rgba(94,84,70,0.66)',
      'rgba(96,86,72,0)',
    );
    drawEllipseGradient(
      ctx,
      px + size * 0.36,
      py + size * 0.32,
      size * 0.68,
      size * 0.56,
      0,
      'rgba(48,40,30,0.56)',
      'rgba(52,44,34,0)',
    );
    drawEllipseGradient(
      ctx,
      px - size * 0.26,
      py - size * 0.24,
      size * 0.44,
      size * 0.36,
      0,
      'rgba(220,209,186,0.42)',
      'rgba(214,203,180,0)',
    );
  }
  ctx.restore();
}

function drawEcologyWash(ctx, zone, n, width, depth) {
  const ecology = getEcology(zone.id);
  const flora = ecology?.flora;
  if (!Array.isArray(flora) || !flora.length) return;
  // Metres to chart pixels. Blob radii below are in metres so a species keeps
  // its real footprint whatever the zone's size or the bake resolution.
  const perMetre = n / Math.max(width, depth);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'blur(0.6px)';
  for (const layer of flora) {
    const plant = plantClassFor(layer);
    if (plant.skip) continue;
    const items = layer.items;
    if (!Array.isArray(items) || !items.length) continue;
    const stride = Math.max(1, Math.ceil(items.length / PLANT_STAMPS_PER_LAYER));
    for (let index = 0; index < items.length; index += stride) {
      const item = items[index];
      const wx = Number.isFinite(item?.x) ? item.x : null;
      const wz = Number.isFinite(item?.z) ? item.z : null;
      if (wx === null || wz === null) continue;
      const px = (wx / width + 0.5) * (n - 1);
      const py = (wz / depth + 0.5) * (n - 1);
      if (px < -12 || px > n + 12 || py < -12 || py > n + 12) continue;
      const spread = plant.radius * (0.7 + (Number.isFinite(item.scale) ? item.scale : 1) * 0.55) * perMetre;
      if (spread < 0.35) continue;
      for (let blob = 0; blob < plant.blobs; blob += 1) {
        const jitterX = (seededUnit(index + 11, blob, 3) - 0.5) * spread * 1.5;
        const jitterY = (seededUnit(index + 29, blob, 7) - 0.5) * spread * 1.5;
        const alpha = plant.alpha * (0.7 + seededUnit(index + 5, blob, 13) * 0.6);
        drawEllipseGradient(
          ctx,
          px + jitterX,
          py + jitterY,
          spread * (0.7 + seededUnit(index + 3, blob, 17) * 0.6),
          spread * (0.55 + seededUnit(index + 19, blob, 23) * 0.5),
          seededUnit(index + 31, blob, 29) * Math.PI,
          plant.ink.replace('ALPHA', alpha.toFixed(3)),
          plant.ink.replace('ALPHA', '0'),
        );
      }
      // Pigment rim on the shaded side. Without it a canopy is a blur; with it
      // the wash reads as laid-down paint.
      if (spread > 1.1) {
        drawEllipseGradient(
          ctx,
          px + spread * 0.34,
          py + spread * 0.3,
          spread * 0.62,
          spread * 0.5,
          0,
          plant.ink.replace('ALPHA', (plant.alpha * 1.15).toFixed(3)),
          plant.ink.replace('ALPHA', '0'),
        );
      }
    }
  }
  ctx.filter = 'none';
  ctx.restore();
}

// Distance from every water sample to the nearest land, in pixels. Two chamfer
// passes over the grid — cheap enough to sit inside the paint step, and the
// only thing the engraved sea lines need.
function coastDistanceField(samples, heights, n) {
  const total = n * n;
  const distance = new Float32Array(total);
  let sawLand = false;
  for (let idx = 0; idx < total; idx += 1) {
    const wet = samples[idx].biome === 'water' || heights[idx] < WATERLINE;
    if (!wet) sawLand = true;
    distance[idx] = wet ? Infinity : 0;
  }
  if (!sawLand) return null;
  const DIAGONAL = Math.SQRT2;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = j * n + i;
      let value = distance[idx];
      if (value === 0) continue;
      if (i > 0) value = Math.min(value, distance[idx - 1] + 1);
      if (j > 0) value = Math.min(value, distance[idx - n] + 1);
      if (i > 0 && j > 0) value = Math.min(value, distance[idx - n - 1] + DIAGONAL);
      if (i < n - 1 && j > 0) value = Math.min(value, distance[idx - n + 1] + DIAGONAL);
      distance[idx] = value;
    }
  }
  for (let j = n - 1; j >= 0; j -= 1) {
    for (let i = n - 1; i >= 0; i -= 1) {
      const idx = j * n + i;
      let value = distance[idx];
      if (value === 0) continue;
      if (i < n - 1) value = Math.min(value, distance[idx + 1] + 1);
      if (j < n - 1) value = Math.min(value, distance[idx + n] + 1);
      if (i < n - 1 && j < n - 1) value = Math.min(value, distance[idx + n + 1] + DIAGONAL);
      if (i > 0 && j < n - 1) value = Math.min(value, distance[idx + n - 1] + DIAGONAL);
      distance[idx] = value;
    }
  }
  return distance;
}

// The engraved sea of an old chart: a few lines running parallel to the shore,
// spaced wider and drawn fainter the further out they go. Offsets are in
// metres so the rhythm is the same on a cove and on an open coast.
const SEA_LINES = [
  { at: 1.6, strength: 0.34 },
  { at: 4.2, strength: 0.27 },
  { at: 7.8, strength: 0.2 },
  { at: 12.6, strength: 0.14 },
  { at: 18.6, strength: 0.09 },
];
const SEA_LINE_HALF_WIDTH = 0.44;

function paintChartField(field, variant) {
  const { n, step, samples, heights } = field;
  if (variant === 'survey') return bakeSurveyChartPixels(samples, heights, n, step);

  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(n, n);
  const data = image.data;
  // A contour is the line between two samples that straddle a band. Once a
  // sample is wide enough that most of a slope straddles one, every slope inks
  // over solid — so the draft pass draws no contours at all.
  const drawContours = step < CONTOUR_INTERVAL * 0.5;
  const drawMajorContours = step < MAJOR_CONTOUR_INTERVAL * 0.5;
  const relief = landHeightRange(heights);
  const coast = coastDistanceField(samples, heights, n);

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const idx = j * n + i;
      const sample = samples[idx];
      const h = heights[idx];
      const hr = heights[j * n + Math.min(n - 1, i + 1)];
      const hd = heights[Math.min(n - 1, j + 1) * n + i];
      const hl = heights[j * n + Math.max(0, i - 1)];
      const hu = heights[Math.max(0, j - 1) * n + i];
      const wet = h < WATERLINE;
      const coastEdge = wet !== (hr < WATERLINE) || wet !== (hd < WATERLINE);
      let r;
      let g;
      let b;
      if (sample.biome === 'water' || wet) {
        // Same four stops the gameplay ocean uses (WATER_DAY in Water.jsx), so
        // the chart's lagoon is the lagoon the player is looking at.
        const depth = Math.max(0, Math.min(1, (WATERLINE - h) / 3.2));
        const stop = depth < 0.2
          ? [SEA_SHALLOW, SEA_LAGOON, depth / 0.2]
          : depth < 0.58
            ? [SEA_LAGOON, SEA_DEEP, (depth - 0.2) / 0.38]
            : [SEA_DEEP, SEA_OPEN, (depth - 0.58) / 0.42];
        r = mixChannel(stop[0].r, stop[1].r, stop[2]);
        g = mixChannel(stop[0].g, stop[1].g, stop[2]);
        b = mixChannel(stop[0].b, stop[1].b, stop[2]);
        if (sample.biome !== 'water') {
          // Shallow shelves and coral gardens should still read through the
          // water instead of collapsing into one flat blue field.
          const seabed = Math.max(0, 1 - depth) * 0.46;
          r = mixChannel(r, sample.color.r * 255, seabed);
          g = mixChannel(g, sample.color.g * 255, seabed);
          b = mixChannel(b, sample.color.b * 255, seabed);
        }
        // Plate tone on the open water. The shallows already have seabed and
        // surf to break them up; without this the deep field is one flat blue
        // slab, which no printed chart ever was.
        const mottle = (softPatch(i, j, 27, 11) - 0.5) * 1.15
          + (softPatch(i, j, 68, 4) - 0.5) * 0.85
          + (softPatch(i, j, 11, 26) - 0.5) * 0.3;
        const tone = mottle * (0.3 + depth * 1.05);
        r += tone * 13;
        g += tone * 15;
        b += tone * 9;
        r = mixChannel(r, CHART_SEA_GLAZE.r, CHART_SEA_GLAZE.amount);
        g = mixChannel(g, CHART_SEA_GLAZE.g, CHART_SEA_GLAZE.amount);
        b = mixChannel(b, CHART_SEA_GLAZE.b, CHART_SEA_GLAZE.amount);
        // No chroma ceiling out here: the sea ramp is authored, so it cannot
        // drift neon the way a baked path splat can, and clamping it would take
        // the lagoon straight back to steel.
        const seaGrey = r * 0.299 + g * 0.587 + b * 0.114;
        r = seaGrey + (r - seaGrey) * CHART_SATURATION;
        g = seaGrey + (g - seaGrey) * CHART_SATURATION;
        b = seaGrey + (b - seaGrey) * CHART_SATURATION;
        // Surf: the pale band a chart draws where water meets land, brightest
        // right at the beach and gone a couple of metres out.
        const surf = Math.max(0, 1 - (WATERLINE - h) / 0.55);
        if (surf > 0) {
          const foam = surf * surf * (0.62 + softPatch(i, j, 9, 21) * 0.38);
          r = mixChannel(r, SEA_FOAM.r, foam * 0.72);
          g = mixChannel(g, SEA_FOAM.g, foam * 0.72);
          b = mixChannel(b, SEA_FOAM.b, foam * 0.6);
        }
        if (coast) {
          // Warp the distance before banding it: a true offset curve reads as
          // machined, and an engraver's hand does not.
          const wobble = (softPatch(i, j, 21, 6) - 0.5) * 2.6 + (softPatch(i, j, 7, 15) - 0.5) * 1.1;
          const fromShore = (coast[idx] + wobble) * step;
          for (const line of SEA_LINES) {
            const offset = Math.abs(fromShore - line.at);
            if (offset > SEA_LINE_HALF_WIDTH) continue;
            const ink = line.strength * (1 - offset / SEA_LINE_HALF_WIDTH) * (1 - surf);
            r = mixChannel(r, 244, ink);
            g = mixChannel(g, 251, ink);
            b = mixChannel(b, 252, ink * 0.86);
            break;
          }
        }
      } else {
        const dhdx = (hr - hl) / (step * 2);
        const dhdz = (hd - hu) / (step * 2);
        // Central differences: a forward difference biases the light half a
        // sample downhill, which at this resolution reads as directional noise.
        const shade = shadeFromNormal(dhdx, dhdz);
        const altitude = Math.max(0, Math.min(1, (h - relief.low) / relief.span));
        r = sample.color.r * 255;
        g = sample.color.g * 255;
        b = sample.color.b * 255;
        // Rescale luminance into this ground type's band, keeping the hue the
        // world gave it, then push saturation so neighbouring biomes separate.
        const band = CHART_VALUE_BANDS[biomeKind(sample.biome)] || CHART_VALUE_BANDS.dry;
        const luminance = Math.max(6, r * 0.299 + g * 0.587 + b * 0.114);
        const target = band[0] + (band[1] - band[0]) * altitude;
        const rescale = target / luminance;
        r *= rescale;
        g *= rescale;
        b *= rescale;
        r = mixChannel(r, CHART_GLAZE.r, CHART_GLAZE.amount);
        g = mixChannel(g, CHART_GLAZE.g, CHART_GLAZE.amount);
        b = mixChannel(b, CHART_GLAZE.b, CHART_GLAZE.amount);
        const grey = r * 0.299 + g * 0.587 + b * 0.114;
        r = grey + (r - grey) * CHART_SATURATION;
        g = grey + (g - grey) * CHART_SATURATION;
        b = grey + (b - grey) * CHART_SATURATION;
        [r, g, b] = temperChroma(r, g, b, CHART_LAND_TONE);
        // Relief last, over a colour that now has room to move both ways.
        r *= shade;
        g *= shade;
        b *= shade;
        // Sun-bleached warmth on the high ground. Light, because the glaze has
        // already warmed everything — stacked, the two turn sand to mustard.
        r = mixChannel(r, 236, altitude * 0.06);
        g = mixChannel(g, 216, altitude * 0.05);
        b = mixChannel(b, 182, altitude * 0.04);
        // Hachure: steep ground darkens on top of the hillshade, which is what
        // separates a cliff from a slope facing away from the sun.
        const grade = Math.hypot(dhdx, dhdz);
        const steep = Math.min(1, Math.max(0, grade - 0.35) * 0.6);
        if (steep > 0) {
          r *= 1 - steep * 0.3;
          g *= 1 - steep * 0.32;
          b *= 1 - steep * 0.34;
        }
        // Pigment grain, so flat ground reads as painted rather than as a fill.
        // Neutral: tinting it warm turns pale sand to mustard.
        const grain = (softPatch(i, j, 7, 4) - 0.5) * 7 + (softPatch(i, j, 23, 8) - 0.5) * 9;
        r += grain;
        g += grain;
        b += grain * 0.9;
        // Broad tonal wander across a hillside, and a slow warm/cool drift with
        // it. This is most of what separates the island chart's soil from a
        // flat fill: the ground changes value and hue as it goes.
        const wander = (softPatch(i, j, 62, 31) - 0.5) * 2 + (softPatch(i, j, 148, 43) - 0.5) * 1.4;
        r += wander * 17;
        g += wander * 13;
        b += wander * 7;
        const drift = softPatch(i, j, 96, 57) - 0.5;
        r += drift * 13;
        b -= drift * 11;
        // Contour lines at fixed height intervals, minor under major.
        if (drawContours) {
          const minorBand = Math.floor(h / CONTOUR_INTERVAL);
          if (minorBand !== Math.floor(hr / CONTOUR_INTERVAL) || minorBand !== Math.floor(hd / CONTOUR_INTERVAL)) {
            r *= 0.9;
            g *= 0.89;
            b *= 0.86;
          }
        }
        if (drawMajorContours) {
          const majorBand = Math.floor(h / MAJOR_CONTOUR_INTERVAL);
          if (majorBand !== Math.floor(hr / MAJOR_CONTOUR_INTERVAL) || majorBand !== Math.floor(hd / MAJOR_CONTOUR_INTERVAL)) {
            r *= 0.74;
            g *= 0.72;
            b *= 0.68;
          }
        }
        // Wet sand: a narrow damp band above the waterline, not a coast line.
        if (h < WATERLINE + 0.33) {
          r *= 0.93;
          g *= 0.95;
          b *= 0.96;
        }
      }
      // Ink the shoreline itself on both sides of the crossing, so the line
      // survives being downsampled into the panel.
      if (coastEdge) {
        r *= 0.48;
        g *= 0.5;
        b *= 0.52;
      }
      data[idx * 4] = clampByte(r);
      data[idx * 4 + 1] = clampByte(g);
      data[idx * 4 + 2] = clampByte(b);
      data[idx * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  drawBiomeWash(ctx, samples, heights, n);
  drawEcologyWash(ctx, field.zone, n, field.width, field.depth);
  drawBoulders(ctx, field.zone, n, field.width, field.depth);
  return canvas.toDataURL('image/png');
}

export function bakeTerrainChart(zone, variant = 'terrain', resolution = BAKE_RESOLUTION) {
  if (typeof document === 'undefined') return null;
  const field = createChartField(zone, resolution);
  while (!field.sampleChunk(Number.MAX_SAFE_INTEGER)) { /* sample it all */ }
  return paintChartField(field, variant);
}

const chartCache = new Map();
const chartBakes = new Map();

// Coarse pass first: a soft chart on screen within a few hundred milliseconds
// beats a correct one that arrives after the player has walked off the beach.
// The sharp pass then replaces it in place.
const BAKE_PASSES = [DRAFT_RESOLUTION, BAKE_RESOLUTION];
// Small enough that a chunk cannot overrun a frame on its own; the slice
// budget then decides how many chunks a visit gets.
const CHUNK_SAMPLES = 128;
const MIN_SLICE_MS = 4;
const MAX_SLICE_MS = 10;
// Long enough that the sharpening pass is not competing with a zone load.
const SHARPEN_DELAY_MS = 1400;

// A running frame loop leaves almost no genuine idle time, so waiting for it
// means the sharp pass never lands. The short timeout forces a slice roughly
// every frame instead, and each one takes a frame-safe minimum.
const scheduleSlice = typeof requestIdleCallback === 'function'
  ? callback => requestIdleCallback(
    deadline => callback(Math.min(MAX_SLICE_MS, Math.max(MIN_SLICE_MS, deadline.timeRemaining()))),
    { timeout: 12 },
  )
  : callback => setTimeout(() => callback(MIN_SLICE_MS), 12);

// Bakes one chart in idle slices and fans each finished pass out to every
// mounted chart on that key. Returns an unsubscribe; the bake itself keeps
// running, so re-entering a zone does not restart it.
function subscribeToChartBake(key, zone, variant, onReady) {
  let bake = chartBakes.get(key);
  if (!bake) {
    bake = { listeners: new Set() };
    chartBakes.set(key, bake);
    let pass = 0;
    let field = createChartField(zone, BAKE_PASSES[0]);
    const pump = budgetMs => {
      const until = performance.now() + budgetMs;
      let done = false;
      do {
        done = field.sampleChunk(CHUNK_SAMPLES);
      } while (!done && performance.now() < until);
      if (!done) {
        scheduleSlice(pump);
        return;
      }
      const url = paintChartField(field, variant);
      chartCache.set(key, url);
      bake.listeners.forEach(listener => listener(url));
      pass += 1;
      if (pass >= BAKE_PASSES.length) {
        chartBakes.delete(key);
        return;
      }
      field = createChartField(zone, BAKE_PASSES[pass]);
      setTimeout(() => scheduleSlice(pump), SHARPEN_DELAY_MS);
    };
    scheduleSlice(pump);
  }
  bake.listeners.add(onReady);
  return () => {
    bake.listeners.delete(onReady);
  };
}

export function useTerrainChart(zone, variant = 'terrain') {
  const zoneId = zone?.id || null;
  const key = zoneId ? `${CHART_CACHE_VERSION}:${zoneId}:${variant}` : null;
  const [chartUrl, setChartUrl] = useState(() => (key ? chartCache.get(key) || null : null));

  useEffect(() => {
    if (!key || typeof document === 'undefined') {
      setChartUrl(null);
      return undefined;
    }
    const cached = chartCache.get(key);
    setChartUrl(cached || null);
    // A cached draft is not the end of it — stay subscribed until the sharp
    // pass lands.
    if (cached && !chartBakes.has(key)) return undefined;
    return subscribeToChartBake(key, zone, variant, setChartUrl);
  }, [key, variant, zone]);

  return chartUrl;
}
