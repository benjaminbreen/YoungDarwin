#!/usr/bin/env node

// Modelled Foley for Darwin's other field tools and handling: the clasp
// knife's swish and cuts, shotgun pellets striking the world, stowing a
// specimen, a hammer chip striking his coat, and his coat in the wind. Built
// from the same layers as the hammer (scripts/lib/modelledAudio.mjs), with
// fixed seeds so a rebuild reproduces the committed sprites exactly.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  TAU,
  biquad,
  body,
  chain,
  contact,
  encodeWav,
  grains,
  groundReflection,
  makeRandom,
  mode,
  noiseBurst,
  writeSprite,
} from './lib/modelledAudio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.join(repoRoot, 'public/assets/audio');
const LEAD = 0.004;

// A short pass of air whose band glides with the blade's speed.
function sweep(buffer, at, random, { amp, duration, from, peak, to, q = 2.2, steps = 9 }) {
  for (let step = 0; step < steps; step += 1) {
    const fraction = step / (steps - 1);
    const freq = fraction < 0.5
      ? from * (peak / from) ** (fraction * 2)
      : peak * (to / peak) ** ((fraction - 0.5) * 2);
    const bell = Math.sin(Math.PI * fraction) ** 1.5;
    noiseBurst(buffer, at + fraction * duration, random, {
      amp: amp * (0.25 + bell),
      attack: duration / steps * 0.6,
      tau: duration / steps * 0.9,
      length: duration / steps * 5,
      filters: [biquad('bandpass', random.jitter(freq, 0.04), q)],
    });
  }
}

// Paper folded and creased: short crisp crackles, each a gated band.
function paperCrinkle(buffer, at, random, { amp, duration, count }) {
  for (let i = 0; i < count; i += 1) {
    noiseBurst(buffer, at + random.range(0, duration), random, {
      amp: amp * random.range(0.5, 1),
      attack: 0.002,
      tau: random.range(0.006, 0.018),
      length: 0.08,
      grit: 0.6,
      gritRate: 2200,
      filters: [biquad('bandpass', random.range(2600, 7000), 1.1)],
    });
  }
}

const SPRITES = {
  knife: {
    // The clasp knife's blade cutting air: thinner and quicker than the
    // hammer's pass. Its peak sits ~0.115 s into the slot.
    swish: {
      slot: 0.5,
      variants: 4,
      peakDb: -6,
      render(buffer, random) {
        sweep(buffer, 0.06, random, {
          amp: 0.5, duration: 0.11, from: random.range(1800, 2300), peak: random.range(4200, 5200), to: 2600, q: 3.2,
        });
        mode(buffer, 0.11, { freq: random.range(7400, 8600), amp: 0.025, tau: 0.03, attack: 0.02 });
      },
      highpassHz: 900,
    },
    // Into a cactus pad: the cuticle ticks, the blade slides wet through
    // the flesh, and the pad's water gives a small squelch.
    'cut-succulent': {
      slot: 0.45,
      variants: 6,
      peakDb: -5,
      render(buffer, random) {
        mode(buffer, LEAD, { freq: random.range(3400, 4800), amp: 0.2, tau: 0.0018, attack: 0.0002 });
        contact(buffer, LEAD, { width: 0.0012, amp: 0.3 });
        noiseBurst(buffer, LEAD + 0.004, random, {
          amp: 0.45,
          attack: 0.006,
          tau: 0.04,
          length: 0.2,
          grit: 0.35,
          gritRate: 1600,
          filters: [biquad('bandpass', random.range(1900, 3200), 1.3)],
        });
        for (let step = 0; step < 4; step += 1) {
          noiseBurst(buffer, LEAD + 0.03 + step * 0.012, random, {
            amp: 0.16,
            attack: 0.003,
            tau: 0.014,
            length: 0.06,
            filters: [biquad('bandpass', 1500 * (0.55 ** (step / 3)), 3)],
          });
        }
        mode(buffer, LEAD, { freq: random.range(140, 200), amp: 0.25, tau: 0.02, attack: 0.002 });
        grains(buffer, LEAD + 0.01, random, {
          duration: 0.08, rate: 600, rateTau: 0.03, freq: [900, 2600], tau: [0.001, 0.0025], amp: 0.06,
        });
      },
    },
    // Through a green stem or vine: a quick edge snick, the stem snapping,
    // then its fibres and leaves.
    'cut-stem': {
      slot: 0.4,
      variants: 6,
      peakDb: -6,
      render(buffer, random) {
        noiseBurst(buffer, LEAD, random, {
          amp: 0.4, attack: 0.001, tau: 0.007, length: 0.04,
          filters: [biquad('bandpass', random.range(4200, 6800), 1.6)],
        });
        const snap = LEAD + random.range(0.008, 0.02);
        mode(buffer, snap, { freq: random.range(1500, 2500), amp: 0.3, tau: 0.003, attack: 0.0002 });
        mode(buffer, snap, { freq: random.range(3200, 4200), amp: 0.14, tau: 0.002, attack: 0.0002 });
        grains(buffer, snap, random, {
          duration: 0.05, rate: 900, rateTau: 0.015, freq: [1000, 3200], tau: [0.0008, 0.002], amp: 0.08,
        });
        noiseBurst(buffer, snap + 0.01, random, {
          amp: 0.1, attack: 0.012, tau: 0.06, length: 0.3, grit: 0.3, gritRate: 400,
          filters: [biquad('highpass', 2600, 0.6), biquad('lowpass', 8000, 0.6)],
        });
      },
    },
    // Through a dry woody twig (Lecocarpus): a stick-slip rasp and a flicked chip.
    'cut-bark': {
      slot: 0.45,
      variants: 6,
      peakDb: -5,
      render(buffer, random) {
        const rasp = random.range(0.05, 0.08);
        noiseBurst(buffer, LEAD, random, {
          amp: 0.5, attack: 0.008, tau: rasp * 0.6, length: rasp * 2.5, grit: 0.7, gritRate: random.range(500, 900),
          filters: [biquad('bandpass', random.range(2400, 3600), 1.4), biquad('peaking', 1200, 1.5, 4)],
        });
        body(buffer, LEAD, random, {
          amp: 0.3,
          modes: [
            { freq: random.range(700, 1000), amp: 1, tau: 0.012 },
            { freq: random.range(1600, 2100), amp: 0.5, tau: 0.007 },
          ],
        });
        mode(buffer, LEAD + rasp + random.range(0.06, 0.12), {
          freq: random.range(900, 1400), amp: 0.14, tau: 0.006, attack: 0.0004,
        });
        groundReflection(buffer, { gain: 0.18 });
      },
    },
  },
  pellets: {
    // A pattern of pellets arrives spread over a few tens of milliseconds.
    // Hard rock: sharp ticks and stone dust; two of six carry a ricochet.
    rock: {
      slot: 0.5,
      variants: 6,
      peakDb: -6,
      render(buffer, random, variant) {
        const count = random.int(5, 9);
        for (let i = 0; i < count; i += 1) {
          const at = LEAD + random.range(0, 0.045) * (i / count + 0.3);
          const amp = random.range(0.35, 1);
          contact(buffer, at, { width: 0.00012, amp: amp * 0.6 });
          mode(buffer, at, { freq: random.range(2800, 6200), amp: amp * 0.3, tau: 0.003, attack: 0.0002 });
          noiseBurst(buffer, at, random, {
            amp: amp * 0.25, tau: 0.003, length: 0.02, filters: [biquad('bandpass', random.range(2600, 4200), 1)],
          });
        }
        grains(buffer, LEAD + 0.01, random, {
          duration: 0.25, rate: 500, rateTau: 0.07, freq: [2400, 6400], tau: [0.001, 0.003], amp: 0.06,
        });
        if (variant % 3 === 1) {
          // Ricochet: a pellet glancing off, its whine falling as it leaves.
          const start = LEAD + random.range(0.008, 0.02);
          const length = Math.round(random.range(0.2, 0.3) * SR);
          const f0 = random.range(3200, 4200);
          const f1 = f0 * random.range(0.45, 0.6);
          let theta = 0;
          const offset = Math.round(start * SR);
          for (let i = 0; i < length && offset + i < buffer.length; i += 1) {
            const t = i / length;
            const f = f0 * (f1 / f0) ** t * (1 + Math.sin(TAU * 31 * i / SR) * 0.012);
            theta += TAU * f / SR;
            const env = Math.min(1, i / (0.006 * SR)) * (1 - t) ** 1.6;
            buffer[offset + i] += Math.sin(theta) * 0.13 * env;
          }
        }
        groundReflection(buffer, { gain: 0.22 });
      },
    },
    // Into soil, ash or sand: soft thuds, a spray of earth, soil falling.
    earth: {
      slot: 0.5,
      variants: 6,
      peakDb: -7,
      render(buffer, random) {
        const count = random.int(5, 9);
        for (let i = 0; i < count; i += 1) {
          const at = LEAD + random.range(0, 0.05);
          const amp = random.range(0.4, 1);
          mode(buffer, at, { freq: random.range(150, 300), amp: amp * 0.35, tau: 0.014, attack: 0.0015 });
          noiseBurst(buffer, at, random, {
            amp: amp * 0.22, attack: 0.002, tau: 0.02, length: 0.1, filters: [biquad('lowpass', 2400, 0.7)],
          });
        }
        grains(buffer, LEAD + 0.04, random, {
          duration: 0.35, rate: 700, rateTau: 0.1, freq: [1000, 3400], tau: [0.0008, 0.002], amp: 0.04,
        });
        groundReflection(buffer, { gain: 0.28, lowpassHz: 1600 });
      },
    },
    // Through leaves and pads: ripping leaf, ticked twigs, debris settling.
    foliage: {
      slot: 0.55,
      variants: 6,
      peakDb: -7,
      render(buffer, random) {
        const count = random.int(5, 8);
        for (let i = 0; i < count; i += 1) {
          const at = LEAD + random.range(0, 0.05);
          noiseBurst(buffer, at, random, {
            amp: random.range(0.25, 0.5), attack: 0.001, tau: random.range(0.008, 0.018), length: 0.08,
            grit: 0.5, gritRate: 2400, filters: [biquad('bandpass', random.range(2200, 6000), 1.2)],
          });
          if (random() < 0.5) mode(buffer, at, { freq: random.range(1800, 3000), amp: 0.12, tau: 0.002, attack: 0.0002 });
        }
        noiseBurst(buffer, LEAD + 0.05, random, {
          amp: 0.1, attack: 0.03, tau: 0.12, length: 0.45, grit: 0.4, gritRate: 300,
          filters: [biquad('highpass', 1800, 0.6), biquad('lowpass', 7000, 0.6)],
        });
      },
    },
    // Into timber: dull thunks and a crackle of splinters.
    wood: {
      slot: 0.45,
      variants: 6,
      peakDb: -6,
      render(buffer, random) {
        const count = random.int(5, 8);
        for (let i = 0; i < count; i += 1) {
          const at = LEAD + random.range(0, 0.045);
          const amp = random.range(0.4, 1);
          contact(buffer, at, { width: 0.0003, amp: amp * 0.4 });
          mode(buffer, at, { freq: random.range(480, 900), amp: amp * 0.35, tau: 0.01 });
          mode(buffer, at, { freq: random.range(1400, 2200), amp: amp * 0.15, tau: 0.005 });
        }
        grains(buffer, LEAD + 0.004, random, {
          duration: 0.08, rate: 900, rateTau: 0.025, freq: [1500, 4200], tau: [0.0008, 0.002], amp: 0.08,
        });
        groundReflection(buffer, { gain: 0.2 });
      },
    },
  },
  field: {
    // A rock sample wrapped in paper ("Syms folds the paper tight") and set
    // into its compartment in the wooden specimen case.
    'stow-rock': {
      slot: 0.9,
      variants: 6,
      peakDb: -7,
      render(buffer, random) {
        paperCrinkle(buffer, LEAD, random, { amp: 0.35, duration: 0.32, count: random.int(7, 11) });
        noiseBurst(buffer, LEAD + 0.05, random, {
          amp: 0.12, attack: 0.04, tau: 0.1, length: 0.35, filters: [biquad('bandpass', 1800, 0.8)],
        });
        const set = LEAD + random.range(0.42, 0.5);
        body(buffer, set, random, {
          amp: 0.5,
          modes: [
            { freq: random.range(480, 720), amp: 1, tau: 0.014 },
            { freq: random.range(1100, 1500), amp: 0.5, tau: 0.008 },
            { freq: random.range(190, 240), amp: 0.5, tau: 0.02, attack: 0.002 },
          ],
        });
        mode(buffer, set + 0.002, { freq: random.range(2800, 3600), amp: 0.14, tau: 0.003, attack: 0.0002 });
        mode(buffer, set + random.range(0.05, 0.08), { freq: random.range(2400, 3200), amp: 0.06, tau: 0.003, attack: 0.0002 });
      },
    },
    // A plant laid between drying papers: two soft page flaps and a press.
    'stow-plant': {
      slot: 0.8,
      variants: 4,
      peakDb: -9,
      render(buffer, random) {
        for (let flap = 0; flap < 2; flap += 1) {
          noiseBurst(buffer, LEAD + flap * random.range(0.16, 0.22), random, {
            amp: 0.35, attack: 0.025, tau: 0.05, length: 0.25, filters: [biquad('bandpass', random.range(900, 1600), 0.7)],
          });
        }
        paperCrinkle(buffer, LEAD + 0.1, random, { amp: 0.16, duration: 0.3, count: random.int(3, 5) });
        noiseBurst(buffer, LEAD + random.range(0.5, 0.56), random, {
          amp: 0.22, attack: 0.006, tau: 0.03, length: 0.15, filters: [biquad('lowpass', 900, 0.7)],
        });
      },
    },
    // A hammer chip snapping back into Darwin's wool coat, then dropping.
    'shard-coat': {
      slot: 0.4,
      variants: 4,
      peakDb: -6,
      render(buffer, random) {
        contact(buffer, LEAD, { width: 0.0016, amp: 0.6 });
        mode(buffer, LEAD, { freq: random.range(260, 340), amp: 0.45, tau: 0.01, attack: 0.001 });
        noiseBurst(buffer, LEAD, random, {
          amp: 0.35, attack: 0.002, tau: 0.012, length: 0.06, filters: [biquad('lowpass', 2800, 0.7)],
        });
        const drop = LEAD + random.range(0.18, 0.25);
        mode(buffer, drop, { freq: random.range(3200, 4800), amp: 0.16, tau: 0.004, attack: 0.0002 });
        mode(buffer, drop + random.range(0.05, 0.07), { freq: random.range(3200, 4800), amp: 0.06, tau: 0.003, attack: 0.0002 });
      },
    },
  },
};

const DIRS = { knife: 'knife', pellets: 'pellets', field: 'field-handling' };
let seed = 0x0f1e1d00;
for (const [group, sprites] of Object.entries(SPRITES)) {
  for (const [name, sprite] of Object.entries(sprites)) {
    seed += 7919;
    const fileName = group === 'pellets' ? `pellets-${name}.wav` : `${name}.wav`;
    console.log(writeSprite(path.join(audioRoot, DIRS[group]), fileName, sprite, seed));
  }
}

// Darwin's coat in the wind: a loop, so it has no fade. Cloth flaps cluster
// into gusts over a soft continuous rustle; the last second is crossfaded
// into the first so the loop has no seam.
function buildCoatFlapLoop() {
  const loopSeconds = 8;
  const overlap = 1;
  const random = makeRandom(0xc0a7f1a9);
  const buffer = new Float32Array(Math.round((loopSeconds + overlap) * SR));
  noiseBurst(buffer, 0, random, {
    amp: 0.08, attack: 0.001, tau: 1e6, length: loopSeconds + overlap, pink: true,
    filters: [biquad('highpass', 220, 0.6), biquad('lowpass', 2600, 0.6)],
  });
  let t = 0;
  while (t < loopSeconds + overlap - 0.1) {
    const gust = 0.5 + 0.5 * Math.sin(TAU * t / 2.7 + 0.6) * Math.sin(TAU * t / 4.1);
    const rate = 2 + gust * 9;
    t += -Math.log(Math.max(1e-6, random())) / rate;
    const amp = random.range(0.2, 0.5) * (0.35 + gust);
    noiseBurst(buffer, t, random, {
      amp, attack: 0.004, tau: random.range(0.018, 0.04), length: 0.2,
      filters: [biquad('bandpass', random.range(500, 1400), 0.8), biquad('lowpass', 3200, 0.7)],
    });
    mode(buffer, t, { freq: random.range(90, 160), amp: amp * 0.25, tau: 0.03, attack: 0.004 });
  }
  chain(buffer, biquad('highpass', 70, 0.6));
  const loopSamples = loopSeconds * SR;
  const fade = overlap * SR;
  const out = buffer.slice(0, loopSamples);
  for (let i = 0; i < fade; i += 1) {
    const w = i / fade;
    out[i] = out[i] * w + buffer[loopSamples + i] * (1 - w);
  }
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const target = 10 ** (-8 / 20);
  for (let i = 0; i < out.length; i += 1) out[i] = out[i] / peak * target;
  writeFileSync(path.join(audioRoot, 'darwin-body/coat-flap-loop.wav'), encodeWav(out));
  console.log(`coat-flap-loop.wav: ${loopSeconds}s loop`);
}

buildCoatFlapLoop();
console.log('Built field Foley audio');
