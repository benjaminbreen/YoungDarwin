#!/usr/bin/env node

// Modelled sounds for how Darwin moves over the ground, layered at runtime
// over the recorded footfalls: the three kinds of jump (a standing hop, a
// running leap, a drop from height) at both ends, the slide of a boot over
// grit, sand or stone when he lands or launches at speed, and the crunch of
// loose grit and pebbles under a boot on lava and basalt.
//
// Hobnailed boots, a wool coat and a satchel with brass fittings: the body
// layers carry those in every jump. Fixed seeds; new sprites go at the end so
// a rebuild leaves the earlier ones exactly as they were.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  biquad,
  chip,
  contact,
  grains,
  groundReflection,
  mode,
  noiseBurst,
  writeSprite,
} from './lib/modelledAudio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public/assets/audio/motion');
const LEAD = 0.004;

// One boot meeting the ground through the heel: the contact, the weight
// arriving, and a short scuff of the sole.
function boot(buffer, at, random, { weight = 1, low = [85, 110], scuff = 0.5 }) {
  contact(buffer, at, { width: random.range(0.0016, 0.0024), amp: 0.6 * weight });
  mode(buffer, at + 0.001, { freq: random.range(low[0], low[1]), amp: 0.7 * weight, tau: 0.035, attack: 0.002 });
  if (scuff > 0) {
    noiseBurst(buffer, at + 0.003, random, {
      amp: 0.14 * scuff * weight, attack: 0.004, tau: 0.025, length: 0.1, grit: 0.5, gritRate: 800,
      filters: [biquad('bandpass', random.range(2000, 2900), 0.8)],
    });
  }
}

// Wool and canvas moving fast through air.
function coatSwish(buffer, at, random, { amp, attack = 0.05, tau = 0.09, centre = [650, 950] }) {
  noiseBurst(buffer, at, random, {
    amp, attack, tau, length: tau * 5,
    filters: [biquad('bandpass', random.range(centre[0], centre[1]), 0.55), biquad('lowpass', 3200, 0.7)],
  });
}

// The satchel arriving against his hip, the brass buckle chinking.
function satchel(buffer, at, random, { amp, chinks = 1 }) {
  contact(buffer, at, { width: 0.006, amp: amp });
  mode(buffer, at, { freq: random.range(130, 165), amp: amp * 0.9, tau: 0.03, attack: 0.003 });
  for (let i = 0; i < chinks; i += 1) {
    const chinkAt = at + random.range(0.003, 0.04);
    mode(buffer, chinkAt, { freq: random.range(3600, 5200), amp: amp * 0.2, tau: 0.02, attack: 0.0002 });
    mode(buffer, chinkAt, { freq: random.range(6800, 8200), amp: amp * 0.1, tau: 0.01, attack: 0.0002 });
  }
}

const SPRITES = {
  // A standing hop: a crouch (coat bunching), both boots driving off within
  // a few milliseconds, the coat swinging up.
  'jump-takeoff-stand': {
    slot: 0.55,
    variants: 6,
    peakDb: -4,
    render(buffer, random) {
      coatSwish(buffer, LEAD, random, { amp: 0.16, attack: 0.04, tau: 0.04, centre: [900, 1300] });
      const push = LEAD + random.range(0.06, 0.08);
      boot(buffer, push, random, { weight: 0.75, scuff: 0.3 });
      boot(buffer, push + random.range(0.004, 0.012), random, { weight: 0.6, scuff: 0.25 });
      coatSwish(buffer, push + 0.02, random, { amp: 0.36, attack: 0.05, tau: 0.08 });
      satchel(buffer, push + random.range(0.13, 0.17), random, { amp: 0.12 });
      groundReflection(buffer, { gain: 0.18 });
    },
  },
  // A running leap: one boot planted hard and driven back (the sole
  // scraping), then a long rush of coat as he flies.
  'jump-takeoff-run': {
    slot: 0.7,
    variants: 6,
    peakDb: -3,
    render(buffer, random) {
      boot(buffer, LEAD, random, { weight: 1, low: [95, 125], scuff: 1.2 });
      noiseBurst(buffer, LEAD + 0.012, random, {
        amp: 0.2, attack: 0.008, tau: 0.04, length: 0.12, grit: 0.7, gritRate: 1100,
        filters: [biquad('bandpass', random.range(1700, 2400), 0.9)],
      });
      coatSwish(buffer, LEAD + 0.02, random, { amp: 0.5, attack: 0.035, tau: 0.13, centre: [550, 800] });
      // The coat-tails flapping behind him.
      for (let i = 0; i < 3; i += 1) {
        contact(buffer, LEAD + 0.14 + i * random.range(0.05, 0.07), { width: 0.005, amp: 0.07 * (1 - i * 0.25) });
      }
      satchel(buffer, LEAD + random.range(0.1, 0.14), random, { amp: 0.18, chinks: 2 });
      groundReflection(buffer, { gain: 0.16 });
    },
  },
  // Landing a standing hop: both feet together, knees taking it, compact.
  'jump-land-stand': {
    slot: 0.6,
    variants: 6,
    peakDb: -3,
    render(buffer, random) {
      boot(buffer, LEAD, random, { weight: 0.95, low: [75, 95], scuff: 0.35 });
      boot(buffer, LEAD + random.range(0.003, 0.01), random, { weight: 0.8, low: [75, 95], scuff: 0.3 });
      mode(buffer, LEAD + 0.008, { freq: random.range(55, 66), amp: 0.45, tau: 0.06, attack: 0.008 });
      coatSwish(buffer, LEAD + 0.015, random, { amp: 0.2, attack: 0.01, tau: 0.05 });
      satchel(buffer, LEAD + random.range(0.05, 0.08), random, { amp: 0.18 });
      groundReflection(buffer, { gain: 0.22 });
    },
  },
  // Landing a running leap: the lead heel, the trailing foot a beat later,
  // and a lighter run-out step as he carries on; the coat flops round.
  'jump-land-run': {
    slot: 0.8,
    variants: 6,
    peakDb: -2,
    render(buffer, random) {
      boot(buffer, LEAD, random, { weight: 1.1, low: [80, 100], scuff: 1 });
      const second = LEAD + random.range(0.1, 0.14);
      boot(buffer, second, random, { weight: 0.85, scuff: 0.9 });
      boot(buffer, second + random.range(0.2, 0.25), random, { weight: 0.45, scuff: 0.5 });
      mode(buffer, LEAD + 0.006, { freq: random.range(58, 70), amp: 0.5, tau: 0.05, attack: 0.006 });
      coatSwish(buffer, LEAD + 0.02, random, { amp: 0.3, attack: 0.012, tau: 0.08 });
      satchel(buffer, LEAD + random.range(0.04, 0.07), random, { amp: 0.24, chinks: 2 });
      groundReflection(buffer, { gain: 0.2 });
    },
  },
  // Dropping from a height: both boots at once, his whole weight to the
  // ground through bent knees (a deep body thud), a hand put down, the coat
  // and satchel coming down after him, a breath forced out.
  'jump-land-drop': {
    slot: 1,
    variants: 6,
    peakDb: -1,
    drive: 1.35,
    render(buffer, random) {
      boot(buffer, LEAD, random, { weight: 1.25, low: [70, 88], scuff: 0.9 });
      boot(buffer, LEAD + random.range(0.002, 0.008), random, { weight: 1.1, low: [70, 88], scuff: 0.8 });
      mode(buffer, LEAD + 0.004, { freq: random.range(44, 54), amp: 1.1, tau: 0.09, attack: 0.006 });
      noiseBurst(buffer, LEAD, random, { amp: 0.55, attack: 0.002, tau: 0.03, length: 0.14, filters: [biquad('lowpass', 320, 0.7)] });
      if (random() < 0.6) {
        const hand = LEAD + random.range(0.09, 0.14);
        contact(buffer, hand, { width: 0.004, amp: 0.22 });
        noiseBurst(buffer, hand, random, { amp: 0.12, attack: 0.002, tau: 0.02, length: 0.08, filters: [biquad('bandpass', 1300, 0.8)] });
      }
      coatSwish(buffer, LEAD + 0.03, random, { amp: 0.34, attack: 0.012, tau: 0.1, centre: [500, 750] });
      satchel(buffer, LEAD + random.range(0.07, 0.11), random, { amp: 0.32, chinks: 3 });
      // The breath driven out of him: low, unvoiced, short.
      noiseBurst(buffer, LEAD + random.range(0.05, 0.08), random, {
        amp: 0.09, attack: 0.025, tau: 0.09, length: 0.4,
        filters: [biquad('bandpass', random.range(500, 700), 1.4), biquad('peaking', 1500, 1.5, 4), biquad('lowpass', 2600, 0.7)],
      });
      groundReflection(buffer, { gain: 0.28 });
    },
  },
  // A boot sliding through loose grit and cinder: stick-slip scraping and a
  // spray of fine stones.
  'skid-grit': {
    slot: 0.55,
    variants: 6,
    peakDb: -6,
    highpassHz: 280,
    render(buffer, random) {
      const length = random.range(0.18, 0.3);
      noiseBurst(buffer, LEAD, random, {
        amp: 0.5, attack: 0.012, tau: length * 0.45, length: length * 1.6, grit: 0.85, gritRate: random.range(900, 1400),
        filters: [biquad('bandpass', random.range(2100, 2900), 0.75), biquad('lowpass', 8000, 0.7)],
      });
      grains(buffer, LEAD + 0.01, random, {
        duration: length * 1.3, rate: 900, rateTau: length * 0.6, freq: [1800, 8000], tau: [0.0006, 0.002], amp: 0.12,
      });
      const pebbles = 1 + Math.floor(random() * 2);
      for (let i = 0; i < pebbles; i += 1) {
        chip(buffer, LEAD + random.range(0.04, length), random, {
          freq: [1900, 3600], amp: random.range(0.08, 0.14), bounces: 3, firstGap: 0.06,
        });
      }
    },
  },
  // A boot sliding in dry sand: a soft hiss with fine grain.
  'skid-sand': {
    slot: 0.55,
    variants: 6,
    peakDb: -8,
    highpassHz: 450,
    render(buffer, random) {
      const length = random.range(0.18, 0.3);
      noiseBurst(buffer, LEAD, random, {
        amp: 0.45, attack: 0.02, tau: length * 0.5, length: length * 1.6, grit: 0.3, gritRate: 600,
        filters: [biquad('bandpass', random.range(3000, 4200), 0.6), biquad('lowpass', 7500, 0.7)],
      });
      grains(buffer, LEAD + 0.01, random, {
        duration: length, rate: 700, rateTau: length * 0.5, freq: [5000, 11000], tau: [0.0004, 0.001], amp: 0.05,
      });
    },
  },
  // Hobnails skating on bare stone: a juddering scrape with the nails
  // ringing, and grit ground between them.
  'skid-rock': {
    slot: 0.45,
    variants: 6,
    peakDb: -7,
    highpassHz: 380,
    render(buffer, random) {
      const length = random.range(0.1, 0.18);
      noiseBurst(buffer, LEAD, random, {
        amp: 0.45, attack: 0.004, tau: length * 0.5, length: length * 1.5, grit: 0.95, gritRate: random.range(220, 380),
        filters: [biquad('bandpass', random.range(1600, 2200), 1.1)],
      });
      for (let i = 0; i < 3; i += 1) {
        mode(buffer, LEAD + random.range(0, length), { freq: random.range(3800, 6400), amp: 0.012, tau: 0.01, attack: 0.002 });
      }
      grains(buffer, LEAD, random, {
        duration: length, rate: 600, rateTau: length * 0.5, freq: [2800, 9000], tau: [0.0006, 0.0018], amp: 0.08,
      });
    },
  },
  // Under each boot on lava and basalt: fine grit and cinder crushed at the
  // heel and again at the toe, the nails scratching, and now and then a
  // pebble kicked clicking away.
  'rock-grit-step': {
    slot: 0.42,
    variants: 10,
    peakDb: -12,
    highpassHz: 900,
    render(buffer, random) {
      grains(buffer, LEAD, random, {
        duration: 0.09, rate: random.range(800, 1300), rateTau: 0.03, freq: [2500, 9500], tau: [0.0005, 0.0018], amp: 0.14,
      });
      const toe = LEAD + random.range(0.1, 0.16);
      grains(buffer, toe, random, {
        duration: 0.07, rate: random.range(500, 900), rateTau: 0.025, freq: [3000, 10000], tau: [0.0004, 0.0014], amp: 0.1,
      });
      noiseBurst(buffer, toe - 0.01, random, {
        amp: 0.12, attack: 0.006, tau: 0.03, length: 0.1, grit: 0.8, gritRate: random.range(500, 900),
        filters: [biquad('bandpass', random.range(3000, 4500), 0.9)],
      });
      if (random() < 0.45) {
        chip(buffer, LEAD + random.range(0.03, 0.12), random, {
          freq: [2300, 4300], amp: random.range(0.08, 0.14), bounces: 2 + Math.floor(random() * 2), firstGap: 0.05,
        });
      }
    },
  },
};

Object.entries(SPRITES).forEach(([fileName, sound], index) => {
  console.log(writeSprite(outputDir, `${fileName}.wav`, sound, 0x3077a000 + index * 7919));
});
console.log('Built motion audio');
