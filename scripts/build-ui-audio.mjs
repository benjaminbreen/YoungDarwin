#!/usr/bin/env node

// Modelled sounds for the expedition's paper interface: the field book and
// reader opening and closing, pages turning, loose folios, the chart
// unrolling, pencil and steel nib on paper, the Beagle's bell carried across
// the bay at dusk, and a heartbeat under exhaustion. Built from the same
// layers as the hammer (scripts/lib/modelledAudio.mjs) with fixed seeds, so
// a rebuild reproduces the committed sprites exactly.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  biquad,
  chain,
  contact,
  encodeWav,
  makeRandom,
  mixInto,
  mode,
  noiseBurst,
  writeSprite,
} from './lib/modelledAudio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public/assets/audio/interface');

// Rag paper flexing: crisp gated crackles, denser where `density` is high.
function crackle(buffer, at, random, { amp, duration, count, low = 2200, high = 6500, shape = () => 1 }) {
  for (let i = 0; i < count; i += 1) {
    const fraction = random();
    noiseBurst(buffer, at + fraction * duration, random, {
      amp: amp * random.range(0.35, 1) * shape(fraction),
      attack: 0.0015,
      tau: random.range(0.004, 0.014),
      length: 0.06,
      grit: 0.55,
      gritRate: 2600,
      filters: [biquad('bandpass', random.range(low, high), 1.2)],
    });
  }
}

// A sheet moving through air: a soft band of pink noise that swells and
// glides, the "whuff" under a page turn or a folio being laid down.
function air(buffer, at, random, { amp, duration, from, to, q = 0.9 }) {
  const steps = 8;
  for (let step = 0; step < steps; step += 1) {
    const fraction = step / (steps - 1);
    noiseBurst(buffer, at + fraction * duration, random, {
      amp: amp * Math.sin(Math.PI * (0.1 + fraction * 0.85)) ** 1.4,
      attack: duration / steps * 0.7,
      tau: duration / steps,
      length: duration / steps * 5,
      pink: true,
      filters: [biquad('bandpass', from * (to / from) ** fraction, q)],
    });
  }
}

// Something soft settling on a desk: a damped low mode plus a muffled
// noise pat.
function settle(buffer, at, random, { amp, freq = 140, tau = 0.03 }) {
  mode(buffer, at, { freq: random.jitter(freq, 0.08), amp, tau, attack: 0.002 });
  noiseBurst(buffer, at, random, {
    amp: amp * 0.8, attack: 0.001, tau: tau * 0.6, length: 0.12,
    filters: [biquad('lowpass', 900, 0.7)],
  });
}

// One graphite or steel stroke: a narrow band of gritty friction whose level
// follows the hand's speed, so a stroke swells and lifts.
function stroke(buffer, at, random, { amp, duration, band, q, grit, gritRate, ticks = 0 }) {
  const samples = Math.ceil(duration * SR);
  const burst = new Float32Array(samples);
  let gate = 1;
  const wobble = random.range(9, 16);
  for (let i = 0; i < samples; i += 1) {
    const t = i / SR;
    const fraction = t / duration;
    if (random() < gritRate / SR) gate = random() < grit ? random() * 0.2 : 0.55 + random() * 0.7;
    const speed = Math.sin(Math.PI * fraction) ** 0.7 * (0.75 + 0.25 * Math.sin(Math.PI * 2 * wobble * t));
    burst[i] = (random() * 2 - 1) * speed * gate;
  }
  chain(burst, biquad('bandpass', band, q), biquad('peaking', band * 1.6, 1.5, 3));
  mixInto(buffer, burst, at, amp);
  for (let tick = 0; tick < ticks; tick += 1) {
    contact(buffer, at + random.range(0.1, 0.9) * duration, { width: 0.00008, amp: amp * 0.5, brightHz: 6000 });
  }
}

// A run of strokes: a word or two written quickly.
function writing(buffer, at, random, { strokes, amp, band, ...strokeOptions }) {
  let t = at;
  for (let i = 0; i < strokes; i += 1) {
    const duration = random.range(0.05, 0.13);
    stroke(buffer, t, random, {
      ...strokeOptions,
      amp: amp * random.range(0.6, 1),
      duration,
      band: random.jitter(band, 0.12),
    });
    // Lifting between letters, longer between words.
    t += duration + (random() < 0.25 ? random.range(0.06, 0.12) : random.range(0.008, 0.03));
  }
  return t;
}

// A small brass clasp or catch: two bright damped partials and a click.
function clasp(buffer, at, random, { amp }) {
  contact(buffer, at, { width: 0.00012, amp: amp * 0.6, brightHz: 4500 });
  mode(buffer, at, { freq: random.jitter(3150, 0.04), amp, tau: 0.018 });
  mode(buffer, at, { freq: random.jitter(5230, 0.04), amp: amp * 0.55, tau: 0.011 });
  mode(buffer, at + 0.012, { freq: random.jitter(2470, 0.05), amp: amp * 0.3, tau: 0.014 });
}

const SPRITES = {
  // The field book or a reader's cover opening: the leather hinge creaks,
  // the spine crackles, and the first leaves fall open.
  'book-open.wav': {
    slot: 0.9,
    variants: 4,
    peakDb: -7,
    render(buffer, random) {
      noiseBurst(buffer, 0.01, random, {
        amp: 0.35, attack: 0.03, tau: 0.08, length: 0.3, grit: 0.7, gritRate: 340,
        filters: [biquad('bandpass', random.range(520, 760), 2.2)],
      });
      crackle(buffer, 0.05, random, { amp: 0.16, duration: 0.16, count: 14, low: 1600, high: 4200 });
      air(buffer, 0.14, random, { amp: 0.42, duration: 0.24, from: 520, to: 1600 });
      settle(buffer, 0.38, random, { amp: 0.32, freq: 120, tau: 0.04 });
      crackle(buffer, 0.38, random, { amp: 0.06, duration: 0.12, count: 6 });
    },
    highpassHz: 70,
  },
  // Closing it: a breath of air pushed out, then the boards meeting.
  'book-close.wav': {
    slot: 0.6,
    variants: 4,
    peakDb: -7,
    render(buffer, random) {
      air(buffer, 0.01, random, { amp: 0.3, duration: 0.14, from: 1400, to: 500 });
      settle(buffer, 0.15, random, { amp: 0.6, freq: random.range(95, 120), tau: 0.05 });
      noiseBurst(buffer, 0.15, random, {
        amp: 0.2, attack: 0.0008, tau: 0.012, length: 0.06,
        filters: [biquad('bandpass', 1800, 0.9)],
      });
    },
    highpassHz: 55,
  },
  // A rag-paper leaf turned: lift, riffle of the edge, and a light flap as
  // it lands.
  'page-turn.wav': {
    slot: 0.6,
    variants: 6,
    peakDb: -9,
    render(buffer, random) {
      crackle(buffer, 0.01, random, { amp: 0.12, duration: 0.06, count: 6, low: 3000, high: 7000 });
      air(buffer, 0.04, random, { amp: 0.36, duration: random.range(0.2, 0.28), from: 900, to: 3400, q: 1.1 });
      crackle(buffer, 0.08, random, {
        amp: 0.14, duration: 0.2, count: 18, shape: fraction => Math.sin(Math.PI * fraction),
      });
      settle(buffer, 0.31, random, { amp: 0.07, freq: 220, tau: 0.018 });
    },
    highpassHz: 160,
  },
  // A loose folio or card lifted into view.
  'paper-open.wav': {
    slot: 0.5,
    variants: 4,
    peakDb: -10,
    render(buffer, random) {
      crackle(buffer, 0.01, random, { amp: 0.14, duration: 0.08, count: 9 });
      air(buffer, 0.03, random, { amp: 0.3, duration: 0.18, from: 1200, to: 2800 });
    },
    highpassHz: 180,
  },
  // Laid back down: a slide across the desk and a soft pat.
  'paper-close.wav': {
    slot: 0.4,
    variants: 4,
    peakDb: -10,
    render(buffer, random) {
      air(buffer, 0.01, random, { amp: 0.28, duration: 0.13, from: 2600, to: 900 });
      settle(buffer, 0.13, random, { amp: 0.16, freq: 180, tau: 0.02 });
    },
    highpassHz: 150,
  },
  // The chart's brass clasp, then the heavy sheet unrolling: dense crackle
  // that thins as the roll runs out, ending flat on the table.
  'map-unroll.wav': {
    slot: 1.1,
    variants: 4,
    peakDb: -7,
    render(buffer, random) {
      clasp(buffer, 0.01, random, { amp: 0.4 });
      crackle(buffer, 0.06, random, {
        amp: 0.2, duration: 0.6, count: 46, low: 1500, high: 5200, shape: fraction => 1 - fraction * 0.75,
      });
      air(buffer, 0.08, random, { amp: 0.38, duration: 0.55, from: 400, to: 1300, q: 0.7 });
      settle(buffer, 0.66, random, { amp: 0.26, freq: 110, tau: 0.045 });
    },
    highpassHz: 70,
  },
  // Rolled back up, the clasp catching at the end.
  'map-roll.wav': {
    slot: 0.7,
    variants: 4,
    peakDb: -8,
    render(buffer, random) {
      crackle(buffer, 0.01, random, {
        amp: 0.18, duration: 0.42, count: 30, low: 1500, high: 5200, shape: fraction => 0.3 + fraction * 0.7,
      });
      air(buffer, 0.02, random, { amp: 0.3, duration: 0.38, from: 1300, to: 500, q: 0.7 });
      clasp(buffer, 0.46, random, { amp: 0.36 });
    },
    highpassHz: 80,
  },
  // Graphite on rag paper: a quick run of soft, grainy strokes, a few words
  // added to the field book.
  'pencil.wav': {
    slot: 0.9,
    variants: 6,
    peakDb: -10,
    render(buffer, random) {
      const end = writing(buffer, 0.02, random, {
        strokes: 5 + Math.floor(random() * 3), amp: 0.5, band: 3600, q: 1.3, grit: 0.45, gritRate: 1800,
      });
      // The paper's body under the hand.
      noiseBurst(buffer, 0.02, random, {
        amp: 0.05, attack: 0.04, tau: 0.25, length: Math.min(0.85, end), pink: true,
        filters: [biquad('lowpass', 500, 0.7)],
      });
    },
    highpassHz: 300,
  },
  // A steel nib: the dip and tap on the inkwell's glass lip, then finer,
  // scratchier strokes that catch the paper's tooth.
  'nib.wav': {
    slot: 1.4,
    variants: 4,
    peakDb: -10,
    render(buffer, random) {
      mode(buffer, 0.02, { freq: random.jitter(2650, 0.03), amp: 0.22, tau: 0.03 });
      mode(buffer, 0.02, { freq: random.jitter(4180, 0.03), amp: 0.12, tau: 0.02 });
      contact(buffer, 0.02, { width: 0.0001, amp: 0.15, brightHz: 5000 });
      writing(buffer, 0.2, random, {
        strokes: 7 + Math.floor(random() * 3), amp: 0.42, band: 5600, q: 2.4, grit: 0.6, gritRate: 3200, ticks: 1,
      });
    },
    highpassHz: 500,
  },
};

// The Beagle's bell striking the end of the first dog watch, carried across
// the bay: bronze partials (hum, prime, minor-third tierce, quint, nominal)
// with slow, beating decays, softened by distance and a late reflection off
// the water. Strikes come in the watch's pairs.
function bellStrike(buffer, at, random, amp) {
  const fundamental = random.jitter(520, 0.01);
  [
    [0.5, 0.5, 2.6],
    [1, 0.8, 1.9],
    [1.19, 0.6, 1.4],
    [1.5, 0.3, 1.1],
    [2, 0.55, 0.9],
    [2.51, 0.2, 0.6],
    [3.01, 0.12, 0.4],
  ].forEach(([ratio, weight, tau]) => {
    // Each partial is a slightly split pair, which gives the bell its waver.
    mode(buffer, at, { freq: fundamental * ratio, amp: amp * weight * 0.6, tau, attack: 0.001 });
    mode(buffer, at, { freq: fundamental * ratio * 1.0025, amp: amp * weight * 0.4, tau, attack: 0.001 });
  });
  contact(buffer, at, { width: 0.0005, amp: amp * 0.4 });
}

function buildShipBell() {
  const slot = 5;
  const variants = 2;
  const sprite = new Float32Array(Math.round(slot * SR) * variants);
  for (let variant = 0; variant < variants; variant += 1) {
    const random = makeRandom(0xbe11d0c0 + variant * 131);
    const buffer = new Float32Array(Math.round(slot * SR));
    [0, 0.42, 1.25, 1.67].forEach(at => bellStrike(buffer, 0.02 + at + random.range(-0.015, 0.015), random, 0.25));
    chain(buffer, biquad('lowpass', 2300, 0.6), biquad('highpass', 140, 0.6));
    const echo = new Float32Array(buffer.length);
    const offset = Math.round(0.19 * SR);
    for (let i = offset; i < buffer.length; i += 1) echo[i] = buffer[i - offset] * 0.22;
    chain(echo, biquad('lowpass', 1300, 0.6));
    let peak = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] += echo[i];
      peak = Math.max(peak, Math.abs(buffer[i]));
    }
    const target = 10 ** (-8 / 20);
    const fade = Math.round(0.4 * SR);
    for (let i = 0; i < buffer.length; i += 1) {
      const tail = buffer.length - i;
      buffer[i] = buffer[i] / peak * target * (tail < fade ? tail / fade : 1);
    }
    sprite.set(buffer, variant * buffer.length);
  }
  writeFileSync(path.join(outputDir, 'ship-bell.wav'), encodeWav(sprite));
  console.log(`ship-bell.wav: ${variants} x ${slot}s`);
}

// Darwin's own pulse when he is spent: a seamless loop of lub-dub at about
// 100 beats a minute. The runtime speeds it up and fades it in with the
// exhaustion look. It carries a little energy around 120-180 Hz so laptop
// speakers still hear the thump.
function buildHeartbeatLoop() {
  const beats = 8;
  const period = 0.6;
  const loopSeconds = beats * period;
  const random = makeRandom(0x4ea27b00);
  const buffer = new Float32Array(Math.round(loopSeconds * SR));
  const thump = (at, amp, freq) => {
    mode(buffer, at, { freq, amp, tau: 0.045, attack: 0.006, glide: 0.2 });
    mode(buffer, at, { freq: freq * 2.6, amp: amp * 0.35, tau: 0.025, attack: 0.004 });
    noiseBurst(buffer, at, random, {
      amp: amp * 0.25, attack: 0.004, tau: 0.02, length: 0.1,
      filters: [biquad('lowpass', 260, 0.7)],
    });
  };
  for (let beat = 0; beat < beats; beat += 1) {
    const at = beat * period + random.range(-0.006, 0.006);
    thump(at, random.range(0.85, 1), random.jitter(58, 0.03));
    thump(at + 0.19, random.range(0.5, 0.6), random.jitter(72, 0.03));
  }
  chain(buffer, biquad('lowpass', 420, 0.6), biquad('highpass', 32, 0.6));
  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const target = 10 ** (-6 / 20);
  for (let i = 0; i < buffer.length; i += 1) buffer[i] = buffer[i] / peak * target;
  writeFileSync(path.join(outputDir, 'heartbeat-loop.wav'), encodeWav(buffer));
  console.log(`heartbeat-loop.wav: ${loopSeconds.toFixed(1)}s loop`);
}

Object.entries(SPRITES).forEach(([fileName, sound], index) => {
  console.log(writeSprite(outputDir, fileName, sound, 0x01ce0000 + index * 7919));
});
buildShipBell();
buildHeartbeatLoop();
console.log('Built interface audio');
