#!/usr/bin/env node

// Modelled sounds for the island's animals where synthesis beats a recording:
// the non-vocal sounds (a marine iguana sneezing salt, lizard claws, a racer
// through litter, locust wings, a tortoise's hiss, tread and grazing, a
// turtle breathing at the surface, parrotfish on coral, a frigatebird's bill,
// a finch cracking a seed) and the water places the terrain probe finds
// (the sea lapping in rock crevices, the swell booming in a sea cave). Vocal
// calls, the spring trickle and the cave surge come from CC0 field recordings
// instead (scripts/build-fauna-voices-audio.mjs). Fixed seeds: a rebuild reproduces
// the committed files exactly.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  TAU,
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
const outputDir = path.join(repoRoot, 'public/assets/audio/fauna');

// One air bubble ringing as it forms and rises: a damped sine at its
// Minnaert frequency (~3.3 kHz for a 1 mm radius), gliding upward as the
// bubble nears the surface. Thousands of these are what running water is.
function bubble(buffer, at, { radiusMm, amp, rise = 0.25 }) {
  const freq = 3300 / radiusMm;
  const tau = 0.0045 * radiusMm ** 0.9;
  const start = Math.round(at * SR);
  const length = Math.min(buffer.length - start, Math.ceil(tau * 6 * SR));
  let theta = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SR;
    const f = freq * (1 + rise * (1 - Math.exp(-t / (tau * 1.4))));
    theta += TAU * f / SR;
    const onset = Math.min(1, i / 24);
    buffer[start + i] += Math.sin(theta) * amp * onset * Math.exp(-t / tau);
  }
}

// Sharp keratin ticks: claws on lava, a bill tip on a seed.
function tick(buffer, at, random, { amp, bright = 5200, body = 0 }) {
  contact(buffer, at, { width: random.range(0.00005, 0.00012), amp, brightHz: bright });
  noiseBurst(buffer, at, random, {
    amp: amp * 0.5, attack: 0.0002, tau: random.range(0.002, 0.005), length: 0.02,
    filters: [biquad('bandpass', random.jitter(bright, 0.2), 1.4)],
  });
  if (body) mode(buffer, at, { freq: random.jitter(body, 0.15), amp: amp * 0.3, tau: 0.006 });
}

// Dry leaf litter disturbed: gated crackles in a band.
function litter(buffer, at, random, { amp, duration, count, low = 1400, high = 5200 }) {
  for (let i = 0; i < count; i += 1) {
    noiseBurst(buffer, at + random() * duration, random, {
      amp: amp * random.range(0.3, 1), attack: 0.001, tau: random.range(0.004, 0.016), length: 0.06,
      grit: 0.6, gritRate: 2400,
      filters: [biquad('bandpass', random.range(low, high), 1.1)],
    });
  }
}

// A syrinx whistle: a pitch contour with a little breath riding on it and a
// faint second harmonic, roughened by fast amplitude flutter.
function whistle(buffer, at, random, { start, peak, end, length, amp, breath = 0.25, flutter = 0.3 }) {
  const offset = Math.round(at * SR);
  const samples = Math.min(buffer.length - offset, Math.round(length * SR));
  const breathNoise = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) breathNoise[i] = random() * 2 - 1;
  chain(breathNoise, biquad('highpass', 1200, 0.7), biquad('lowpass', 6000, 0.7));
  const flutterRate = random.range(28, 46);
  let theta = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples;
    // Up quickly to the peak, then a long fall.
    const f = t < 0.12
      ? start + (peak - start) * Math.sin((t / 0.12) * Math.PI / 2)
      : peak + (end - peak) * ((t - 0.12) / 0.88) ** 0.8;
    theta += TAU * f / SR;
    const envelope = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - 0.35 * t);
    const rough = 1 - flutter * (0.5 + 0.5 * Math.sin(TAU * flutterRate * i / SR + random() * 0.3));
    const tone = Math.sin(theta) + 0.12 * Math.sin(2 * theta + 0.4);
    buffer[offset + i] += amp * envelope * (rough * tone + breath * breathNoise[i] * (0.6 + 0.4 * Math.sin(theta)));
  }
}

const SPRITES = {
  // A marine iguana clearing salt from its nasal glands: a sharp nasal
  // "pfft" with a fine spray, sometimes doubled.
  'iguana-sneeze.wav': {
    slot: 0.7,
    variants: 6,
    peakDb: -8,
    render(buffer, random) {
      const sneeze = at => {
        noiseBurst(buffer, at, random, {
          amp: 0.7, attack: 0.004, tau: random.range(0.035, 0.06), length: 0.25,
          filters: [biquad('bandpass', random.range(2200, 3200), 1.6), biquad('peaking', 5200, 1.2, 5)],
        });
        noiseBurst(buffer, at + 0.004, random, {
          amp: 0.25, attack: 0.002, tau: 0.03, length: 0.12, grit: 0.7, gritRate: 3500,
          filters: [biquad('highpass', 5000, 0.7)],
        });
        mode(buffer, at, { freq: random.range(260, 340), amp: 0.08, tau: 0.02, attack: 0.003 });
      };
      sneeze(0.02);
      if (random() < 0.45) sneeze(random.range(0.24, 0.34));
    },
    highpassHz: 400,
  },
  // A lava lizard dashing: a quick run of claw ticks on rock with a little
  // grit kicked aside.
  'lizard-scurry.wav': {
    slot: 0.5,
    variants: 6,
    peakDb: -12,
    render(buffer, random, variant) {
      const onLitter = variant % 2 === 1;
      const steps = 8 + Math.floor(random() * 7);
      let t = 0.01;
      for (let i = 0; i < steps; i += 1) {
        const fade = 1 - i / steps * 0.7;
        tick(buffer, t, random, { amp: 0.4 * fade * random.range(0.6, 1), bright: onLitter ? 3600 : 6200, body: onLitter ? 0 : 1900 });
        t += random.range(0.018, 0.034) * (1 + i / steps * 0.6);
      }
      if (onLitter) litter(buffer, 0.01, random, { amp: 0.18, duration: t, count: 22 });
      else litter(buffer, 0.01, random, { amp: 0.08, duration: t, count: 8, low: 3000, high: 7000 });
    },
    highpassHz: 900,
  },
  // A Galápagos racer moving off through dry litter: a long, soft, swelling
  // hiss of scales with leaves crackling under its weight.
  'racer-slither.wav': {
    slot: 1.4,
    variants: 4,
    peakDb: -14,
    render(buffer, random) {
      const duration = random.range(0.8, 1.1);
      const steps = 14;
      for (let i = 0; i < steps; i += 1) {
        const f = i / (steps - 1);
        noiseBurst(buffer, 0.02 + f * duration, random, {
          amp: 0.22 * Math.sin(Math.PI * f) ** 0.8, attack: duration / steps, tau: duration / steps, length: duration / steps * 4,
          pink: true,
          filters: [biquad('bandpass', random.range(2000, 3400), 0.9)],
        });
      }
      litter(buffer, 0.05, random, { amp: 0.14, duration: duration * 0.9, count: 26, low: 1200, high: 4200 });
    },
    highpassHz: 500,
  },
  // A painted locust breaking cover: the stiff hindwings clatter for a
  // moment, then the flight whirs off.
  'locust-flight.wav': {
    slot: 0.8,
    variants: 6,
    peakDb: -12,
    render(buffer, random) {
      const rate = random.range(16, 22);
      const length = random.range(0.35, 0.6);
      for (let t = 0; t < length; t += 1 / rate) {
        const fade = Math.exp(-t / (length * 0.6));
        noiseBurst(buffer, 0.01 + t + random.range(-0.003, 0.003), random, {
          amp: 0.45 * fade, attack: 0.0008, tau: 0.008, length: 0.03, grit: 0.5, gritRate: 3000,
          filters: [biquad('bandpass', random.range(2600, 5400), 1.6)],
        });
      }
      // The whir as it settles into flight.
      noiseBurst(buffer, 0.05, random, {
        amp: 0.06, attack: 0.04, tau: 0.18, length: 0.6,
        filters: [biquad('bandpass', random.range(3800, 4800), 3)],
      });
    },
    highpassHz: 1200,
  },
  // A giant tortoise pulling into its shell: a forced exhalation (the
  // lungs emptied to make room) with the shell grating down on the ground.
  'tortoise-hiss.wav': {
    slot: 1.6,
    variants: 4,
    peakDb: -8,
    render(buffer, random) {
      noiseBurst(buffer, 0.03, random, {
        amp: 0.6, attack: 0.03, tau: random.range(0.35, 0.55), length: 1.3, pink: true,
        filters: [biquad('lowpass', 6500, 0.7), biquad('peaking', random.range(1400, 2200), 1, 6), biquad('highpass', 400, 0.7)],
      });
      noiseBurst(buffer, 0.04, random, {
        amp: 0.16, attack: 0.02, tau: 0.25, length: 0.8, grit: 0.45, gritRate: 160,
        filters: [biquad('bandpass', random.range(380, 520), 2)],
      });
      // Plastron meeting ground.
      mode(buffer, random.range(0.1, 0.16), { freq: random.range(70, 95), amp: 0.16, tau: 0.06, attack: 0.008 });
      litter(buffer, 0.1, random, { amp: 0.08, duration: 0.12, count: 6, low: 700, high: 2400 });
    },
    highpassHz: 50,
  },
  // A heavy, slow footfall: elephantine pad on soil and grit, and the
  // plastron edge dragging.
  'tortoise-step.wav': {
    slot: 0.6,
    variants: 6,
    peakDb: -12,
    render(buffer, random) {
      mode(buffer, 0.01, { freq: random.range(55, 75), amp: 0.7, tau: 0.05, attack: 0.012 });
      noiseBurst(buffer, 0.012, random, {
        amp: 0.3, attack: 0.006, tau: 0.04, length: 0.18,
        filters: [biquad('lowpass', 900, 0.7)],
      });
      litter(buffer, 0.02, random, { amp: 0.12, duration: 0.08, count: 8, low: 900, high: 3200 });
      if (random() < 0.5) {
        noiseBurst(buffer, random.range(0.12, 0.2), random, {
          amp: 0.07, attack: 0.04, tau: 0.08, length: 0.3, grit: 0.4, gritRate: 220,
          filters: [biquad('bandpass', random.range(600, 900), 1.6)],
        });
      }
    },
    highpassHz: 35,
  },
  // Grazing: a tug and tear of stems, then two slow, crunchy chews.
  'tortoise-graze.wav': {
    slot: 1.1,
    variants: 4,
    peakDb: -14,
    render(buffer, random) {
      noiseBurst(buffer, 0.02, random, {
        amp: 0.5, attack: 0.015, tau: 0.06, length: 0.2, grit: 0.75, gritRate: 900,
        filters: [biquad('bandpass', random.range(1800, 2600), 1)],
      });
      litter(buffer, 0.02, random, { amp: 0.12, duration: 0.1, count: 7 });
      [0.42, 0.74].forEach(at => {
        const chew = at + random.range(-0.03, 0.03);
        noiseBurst(buffer, chew, random, {
          amp: 0.3, attack: 0.02, tau: 0.05, length: 0.16, grit: 0.7, gritRate: 600,
          filters: [biquad('bandpass', random.range(900, 1500), 1.2)],
        });
        mode(buffer, chew, { freq: random.range(120, 160), amp: 0.12, tau: 0.03, attack: 0.01 });
      });
    },
    highpassHz: 90,
  },
  // A green turtle surfacing: the head breaks the water, a sharp explosive
  // exhalation, then a quick deep inhalation.
  'turtle-breath.wav': {
    slot: 1.4,
    variants: 4,
    peakDb: -10,
    render(buffer, random) {
      for (let i = 0; i < 18; i += 1) {
        bubble(buffer, 0.01 + random() * 0.08, { radiusMm: random.range(1.5, 6), amp: random.range(0.03, 0.08) });
      }
      noiseBurst(buffer, 0.1, random, {
        amp: 0.7, attack: 0.006, tau: random.range(0.06, 0.09), length: 0.35,
        filters: [biquad('bandpass', random.range(1100, 1600), 1.1), biquad('peaking', 3200, 1, 4)],
      });
      noiseBurst(buffer, 0.1, random, {
        amp: 0.12, attack: 0.003, tau: 0.04, length: 0.12, grit: 0.7, gritRate: 3000,
        filters: [biquad('highpass', 4500, 0.7)],
      });
      noiseBurst(buffer, random.range(0.42, 0.5), random, {
        amp: 0.32, attack: 0.08, tau: 0.12, length: 0.45,
        filters: [biquad('bandpass', random.range(700, 1000), 1.2)],
      });
    },
    highpassHz: 160,
  },
  // Parrotfish biting coral, as heard with the ears underwater: hard
  // scraping clicks, dulled and close.
  'parrotfish-crunch.wav': {
    slot: 0.5,
    variants: 6,
    peakDb: -12,
    render(buffer, random) {
      const bites = 2 + Math.floor(random() * 3);
      let t = 0.01;
      for (let i = 0; i < bites; i += 1) {
        tick(buffer, t, random, { amp: 0.5, bright: random.range(1600, 2400), body: 700 });
        noiseBurst(buffer, t, random, {
          amp: 0.3, attack: 0.001, tau: 0.02, length: 0.07, grit: 0.7, gritRate: 2000,
          filters: [biquad('bandpass', random.range(900, 1800), 1.2)],
        });
        t += random.range(0.07, 0.12);
      }
      chain(buffer, biquad('lowpass', 2600, 0.7));
    },
    highpassHz: 120,
  },
  // A frigatebird's bill clattered in display or squabble: hollow, woody
  // rattling.
  'frigate-clatter.wav': {
    slot: 1,
    variants: 4,
    peakDb: -12,
    render(buffer, random) {
      const rate = random.range(13, 19);
      const length = random.range(0.4, 0.7);
      for (let t = 0; t < length; t += 1 / rate) {
        const at = 0.01 + t + random.range(-0.004, 0.004);
        const amp = 0.5 * Math.sin(Math.PI * Math.min(1, t / length)) ** 0.4;
        contact(buffer, at, { width: 0.0003, amp: amp * 0.6 });
        mode(buffer, at, { freq: random.jitter(1150, 0.06), amp: amp * 0.5, tau: 0.012 });
        mode(buffer, at, { freq: random.jitter(2650, 0.06), amp: amp * 0.25, tau: 0.007 });
      }
    },
    highpassHz: 300,
  },
  // A finch cracking a seed: one tiny, hard click, sometimes the husk
  // flicked aside.
  'finch-crack.wav': {
    slot: 0.2,
    variants: 6,
    peakDb: -16,
    render(buffer, random) {
      tick(buffer, 0.008, random, { amp: 0.6, bright: random.range(4200, 6400), body: random.range(2400, 3200) });
      if (random() < 0.5) tick(buffer, random.range(0.05, 0.09), random, { amp: 0.15, bright: 7000 });
    },
    highpassHz: 1500,
  },
  // A male blue-footed booby's whistle: a thin, wheezing fall, often given
  // twice. (No usable recording; the female's honk is left to the colony.)
  'booby-whistle.wav': {
    slot: 1.8,
    variants: 5,
    peakDb: -14,
    render(buffer, random) {
      const count = random() < 0.55 ? 2 : 1;
      let t = 0.02;
      for (let i = 0; i < count; i += 1) {
        const peak = random.range(2500, 3100);
        const length = random.range(0.5, 0.75);
        whistle(buffer, t, random, {
          start: peak * 0.82, peak, end: peak * random.range(0.5, 0.6), length,
          amp: i ? 0.8 : 1, breath: random.range(0.1, 0.18), flutter: random.range(0.2, 0.4),
        });
        t += length + random.range(0.12, 0.25);
      }
    },
    highpassHz: 700,
  },
};

// Seamless loops are built long, then the tail is crossfaded into the head.
function writeLoop(fileName, { seconds, overlap = 1, peakDb, seed, render }) {
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

// The sea working in rock crevices at the water's edge: each swell sucks
// and gurgles in, slaps softly, and drains back with a trickle.
function rockLap(buffer, random, seconds) {
  // The water is never still against rock: a low wash and a sparse trickle
  // run under every swell, rising and falling with it.
  const wash = new Float32Array(buffer.length);
  noiseBurst(wash, 0, random, {
    amp: 0.05, attack: 0.001, tau: 1e6, length: seconds, pink: true,
    filters: [biquad('lowpass', 1100, 0.6), biquad('highpass', 90, 0.6)],
  });
  for (let i = 0; i < wash.length; i += 1) {
    const t = i / SR;
    wash[i] *= 0.55 + 0.45 * Math.sin(TAU * t / 4.6 + 0.4) * Math.sin(TAU * t / 7.3 + 1.1);
  }
  mixInto(buffer, wash, 0, 1);
  for (let i = 0; i < seconds * 22; i += 1) {
    bubble(buffer, random() * (seconds - 0.05), { radiusMm: random.range(0.8, 3.5), amp: random.range(0.006, 0.02) });
  }
  let t = random.range(0.1, 0.6);
  while (t < seconds - 0.4) {
    const strength = random.range(0.5, 1);
    // Rush in.
    noiseBurst(buffer, t, random, {
      amp: 0.14 * strength, attack: 0.35, tau: 0.45, length: 1.8, pink: true,
      filters: [biquad('bandpass', random.range(500, 900), 0.7), biquad('lowpass', 3000, 0.7)],
    });
    // Slap into the crevice.
    const slap = t + random.range(0.4, 0.6);
    noiseBurst(buffer, slap, random, {
      amp: 0.3 * strength, attack: 0.004, tau: 0.05, length: 0.25,
      filters: [biquad('bandpass', random.range(700, 1400), 0.9)],
    });
    mode(buffer, slap, { freq: random.range(70, 110), amp: 0.18 * strength, tau: 0.06, attack: 0.01 });
    // Gurgling fill and drain.
    for (let i = 0; i < 40 * strength; i += 1) {
      bubble(buffer, slap + random.range(0, 1.4), {
        radiusMm: random.range(2, 9), amp: random.range(0.03, 0.09) * strength, rise: random.range(0.2, 0.7),
      });
    }
    // Trickle back through the stones.
    for (let i = 0; i < 70; i += 1) {
      bubble(buffer, slap + random.range(1, 2.8), { radiusMm: random.range(0.8, 3), amp: random.range(0.01, 0.03) });
    }
    t += random.range(3.2, 6.5);
  }
  chain(buffer, biquad('highpass', 45, 0.7), biquad('lowpass', 8000, 0.6));
}

// The swell booming in a sea cave or lava tube mouth: a deep compression
// thump, the air forced out, and the long wash and drip that follow.
const SEA_CAVE = {
  slot: 4.5,
  variants: 4,
  peakDb: -6,
  render(buffer, random) {
    const at = 0.05;
    mode(buffer, at, { freq: random.range(38, 52), amp: 0.9, tau: 0.35, attack: 0.04 });
    mode(buffer, at, { freq: random.range(78, 96), amp: 0.35, tau: 0.22, attack: 0.03 });
    noiseBurst(buffer, at, random, {
      amp: 0.5, attack: 0.03, tau: 0.25, length: 1.4, pink: true,
      filters: [biquad('lowpass', 420, 0.7)],
    });
    // Spray and air forced out of the mouth.
    noiseBurst(buffer, at + 0.12, random, {
      amp: 0.14, attack: 0.05, tau: 0.35, length: 1.6,
      filters: [biquad('bandpass', random.range(1800, 2600), 0.7)],
    });
    // The water running back.
    noiseBurst(buffer, at + 0.6, random, {
      amp: 0.12, attack: 0.4, tau: 1.1, length: 3.6, pink: true,
      filters: [biquad('bandpass', random.range(500, 800), 0.6)],
    });
    for (let i = 0; i < 90; i += 1) {
      bubble(buffer, at + random.range(0.8, 4), { radiusMm: random.range(1.5, 8), amp: random.range(0.01, 0.04) });
    }
  },
  highpassHz: 28,
  drive: 1.4,
};

Object.entries(SPRITES).forEach(([fileName, sound], index) => {
  console.log(writeSprite(outputDir, fileName, sound, 0x0fa0a000 + index * 7919));
});
console.log(writeSprite(outputDir, 'sea-cave-boom.wav', SEA_CAVE, 0x5eac0000));
writeLoop('rock-lap-loop.wav', { seconds: 16, overlap: 2, peakDb: -8, seed: 0x10cc1a9, render: rockLap });
console.log('Built fauna audio');
