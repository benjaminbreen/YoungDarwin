#!/usr/bin/env node

// Modelled loops for sounds that belong to particular spots, heard from
// where they are as Darwin moves (IslandSoundscape's place probe):
//
// - leaves: a tree canopy in the wind, leaf-flutter clusters riding gusts;
// - crickets: field crickets chirping in grass and scrub after dark, three
//   individuals at different distances and rates;
// - edge wind: wind over a cliff rim or ridge, low buffeting with a thin
//   whistle that rises with each gust;
// - tide pool: snapping-shrimp crackle, small drips and trickles, and the
//   slow slosh of the swell reaching in.
//
// Fixed seeds; loops are built long and crossfaded tail into head.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  TAU,
  biquad,
  chain,
  encodeWav,
  makeRandom,
  mode,
  noiseBurst,
} from './lib/modelledAudio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public/assets/audio/places');

function writeLoop(fileName, { seconds, overlap = 1.5, peakDb, seed, render }) {
  const random = makeRandom(seed);
  const buffer = new Float32Array(Math.round((seconds + overlap) * SR));
  render(buffer, random, seconds + overlap);
  const loopSamples = Math.round(seconds * SR);
  const fade = Math.round(overlap * SR);
  const out = buffer.slice(0, loopSamples);
  for (let i = 0; i < fade; i += 1) {
    const w = i / fade;
    out[i] = out[i] * Math.sqrt(w) + buffer[loopSamples + i] * Math.sqrt(1 - w);
  }
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const target = 10 ** (peakDb / 20);
  for (let i = 0; i < out.length; i += 1) out[i] = out[i] / peak * target;
  writeFileSync(path.join(outputDir, fileName), encodeWav(out));
  console.log(`${fileName}: ${seconds}s loop`);
}

// A slowly wandering gust strength in [floor, 1], sampled per sample.
function gustCurve(random, length, { floor = 0.2, rate = 0.35 }) {
  const curve = new Float32Array(length);
  let value = 0.5;
  let target = 0.5;
  let nextChange = 0;
  const step = 1 / SR;
  for (let i = 0; i < length; i += 1) {
    if (i >= nextChange) {
      target = floor + (1 - floor) * random() ** 1.3;
      nextChange = i + Math.round(random.range(0.8, 3.2) * SR);
    }
    value += (target - value) * rate * step * 2;
    curve[i] = value;
  }
  return curve;
}

function pinkNoise(random, length) {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  return out;
}

// One leaf fluttering: a few tiny clicks of bandpassed noise, quickening
// and fading.
function leafFlutter(buffer, at, random, amp) {
  const count = 3 + Math.floor(random() * 6);
  const centre = random.range(2200, 6500);
  let t = at;
  let strength = amp;
  for (let i = 0; i < count; i += 1) {
    noiseBurst(buffer, t, random, {
      amp: strength, attack: 0.0004, tau: random.range(0.0012, 0.003), length: 0.012,
      filters: [biquad('bandpass', random.jitter(centre, 0.12), 1.4)],
    });
    t += random.range(0.012, 0.03);
    strength *= random.range(0.7, 0.95);
  }
}

function leaves(buffer, random, seconds) {
  const gust = gustCurve(random, buffer.length, { floor: 0.15, rate: 0.5 });
  const wash = pinkNoise(random, buffer.length);
  chain(wash, biquad('highpass', 700, 0.6), biquad('lowpass', 5500, 0.6));
  for (let i = 0; i < buffer.length; i += 1) buffer[i] += wash[i] * 0.22 * gust[i] ** 1.6;
  let t = 0;
  while (t < seconds - 0.05) {
    const g = gust[Math.min(buffer.length - 1, Math.round(t * SR))];
    t += -Math.log(Math.max(1e-6, random())) / (30 + 900 * g * g);
    leafFlutter(buffer, t, random, random.range(0.04, 0.12) * (0.4 + g));
  }
}

// A field cricket's chirp: three or four pulses of a pure carrier.
function chirp(buffer, at, random, { carrier, amp, pulses }) {
  let t = at;
  for (let i = 0; i < pulses; i += 1) {
    const length = random.range(0.012, 0.017);
    const start = Math.round(t * SR);
    const samples = Math.min(buffer.length - start, Math.round(length * SR));
    for (let j = 0; j < samples; j += 1) {
      const envelope = Math.sin(Math.PI * j / samples) ** 0.6;
      // Each pulse falls slightly in pitch as the file teeth are swept.
      const f = carrier * (1.015 - 0.03 * j / samples);
      buffer[start + j] += amp * envelope * (Math.sin(TAU * f * j / SR) + 0.08 * Math.sin(TAU * 2 * f * j / SR));
    }
    t += length + random.range(0.017, 0.024);
  }
}

function crickets(buffer, random, seconds) {
  const individuals = [
    { carrier: 4700, amp: 0.5, rate: 2.3, pulses: 4 },
    { carrier: 4450, amp: 0.28, rate: 1.9, pulses: 3 },
    { carrier: 5050, amp: 0.15, rate: 2.7, pulses: 4 },
  ];
  for (const cricket of individuals) {
    let t = random.range(0, 0.5);
    while (t < seconds - 0.2) {
      // A singer pauses now and then.
      if (random() < 0.03) {
        t += random.range(1.5, 4);
        continue;
      }
      chirp(buffer, t, random, {
        carrier: random.jitter(cricket.carrier, 0.004),
        amp: cricket.amp * random.range(0.85, 1),
        pulses: cricket.pulses - (random() < 0.15 ? 1 : 0),
      });
      t += (1 / cricket.rate) * random.range(0.92, 1.08);
    }
  }
  // The night air: a very faint wash under them.
  const air = pinkNoise(random, buffer.length);
  chain(air, biquad('highpass', 300, 0.6), biquad('lowpass', 2500, 0.6));
  for (let i = 0; i < buffer.length; i += 1) buffer[i] += air[i] * 0.012;
}

function edgeWind(buffer, random) {
  const gust = gustCurve(random, buffer.length, { floor: 0.25, rate: 0.6 });
  const body = pinkNoise(random, buffer.length);
  chain(body, biquad('lowpass', 260, 0.7), biquad('highpass', 35, 0.7));
  const hiss = pinkNoise(random, buffer.length);
  chain(hiss, biquad('highpass', 1800, 0.6), biquad('lowpass', 7000, 0.6));
  // The whistle: a narrow band whose centre follows the gust, filtered in
  // short blocks so it can glide.
  const whistle = new Float32Array(buffer.length);
  const raw = pinkNoise(random, buffer.length);
  const block = 512;
  let state = [0, 0, 0, 0];
  for (let start = 0; start < buffer.length; start += block) {
    const g = gust[start];
    const centre = 620 + g * 520;
    const w0 = TAU * centre / SR;
    const alpha = Math.sin(w0) / (2 * 18);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = -2 * Math.cos(w0) / a0;
    const a2 = (1 - alpha) / a0;
    let [x1, x2, y1, y2] = state;
    for (let i = start; i < Math.min(buffer.length, start + block); i += 1) {
      const x = raw[i];
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      whistle[i] = y;
    }
    state = [x1, x2, y1, y2];
  }
  for (let i = 0; i < buffer.length; i += 1) {
    const g = gust[i];
    // Buffeting: the low body pulses irregularly as the gust tears at the
    // rim.
    const buffet = 0.7 + 0.3 * Math.sin(TAU * 1.7 * i / SR + Math.sin(TAU * 0.31 * i / SR) * 3);
    buffer[i] += body[i] * 0.55 * g * buffet + hiss[i] * 0.14 * g ** 1.5 + whistle[i] * 5 * Math.max(0, g - 0.3) ** 1.2;
  }
}

// A small bubble at the Minnaert frequency, rising a little as it frees.
function bubble(buffer, at, { radiusMm, amp }) {
  mode(buffer, at, {
    freq: 3300 / radiusMm, amp, tau: 0.0045 * radiusMm ** 0.9, attack: 0.0006, glide: 0.25,
  });
}

function tidePool(buffer, random, seconds) {
  // Snapping shrimp: dense, dry, broadband crackle.
  let t = 0;
  while (t < seconds - 0.01) {
    t += -Math.log(Math.max(1e-6, random())) / 38;
    noiseBurst(buffer, t, random, {
      amp: random.range(0.03, 0.14) * random() ** 1.5, attack: 0.0001, tau: random.range(0.0003, 0.0008), length: 0.004,
      filters: [biquad('highpass', 2200, 0.7)],
    });
  }
  // The swell reaching in twice a loop: a slosh, then trickles and drips as
  // it drains back out of the rock.
  const swell = seconds / 2;
  for (let k = 0; k < 2; k += 1) {
    const at = k * swell + random.range(0.4, 1);
    noiseBurst(buffer, at, random, {
      amp: 0.35, attack: 0.5, tau: 0.7, length: 3,
      filters: [biquad('lowpass', 900, 0.6), biquad('highpass', 120, 0.6)],
    });
    for (let i = 0; i < 70; i += 1) {
      bubble(buffer, at + random.range(0.8, swell - 0.5) * random() ** 0.6, {
        radiusMm: random.range(1.2, 6), amp: random.range(0.02, 0.07),
      });
    }
  }
  // Drips from the overhanging rock, irregular through the whole loop.
  t = 0;
  while (t < seconds - 0.1) {
    t += random.range(0.6, 2.2);
    bubble(buffer, t, { radiusMm: random.range(2, 4), amp: random.range(0.08, 0.14) });
  }
}

mkdirSync(outputDir, { recursive: true });
writeLoop('leaves-loop.wav', { seconds: 20, overlap: 2, peakDb: -9, seed: 0x1eaf0001, render: leaves });
writeLoop('crickets-loop.wav', { seconds: 16, overlap: 1, peakDb: -10, seed: 0xc41c0002, render: crickets });
writeLoop('edge-wind-loop.wav', { seconds: 18, overlap: 2, peakDb: -8, seed: 0xed9e0003, render: edgeWind });
writeLoop('tide-pool-loop.wav', { seconds: 12, overlap: 1.5, peakDb: -10, seed: 0x71de0004, render: tidePool });
console.log('Built place ambience');
