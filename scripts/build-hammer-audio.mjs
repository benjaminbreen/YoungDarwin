#!/usr/bin/env node

// Darwin's geological hammer, struck against each of Floreana's rocks (and
// the timber and plants it can also meet). There are no source recordings:
// every strike is modelled from the physics of the contact, so each material
// can answer the way its rockSampling profile describes it in prose.
//
// A strike is built from layers that a real recording would contain:
//   contact   the instant of steel meeting the surface; a harder surface
//             makes a shorter, brighter impulse
//   head      the steel head's own free-bar ring, damped by Darwin's grip and
//             by how much the surface gives
//   body      the struck mass's resonant modes, short in porous rock
//   crack     the fracture itself, a sharp band of noise
//   grains    crushed grit breaking and trickling as a stochastic texture
//   chips     the loosened sample and its crumbs landing and bouncing
//   ground    a close, lowpassed reflection off the ground beneath
// Seeds are fixed, so a rebuild reproduces the committed sprites exactly.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  biquad,
  body,
  chip,
  contact,
  grains,
  groundReflection,
  hammerHead,
  mode,
  noiseBurst,
  writeSprite,
} from './lib/modelledAudio.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public/assets/audio/hammer');

// Every strike starts a few milliseconds into its slot, so playback-rate
// jitter and a filtered onset never clip the transient.
const LEAD = 0.004;

const MATERIALS = {
  // "A hard ringing clack against dense basalt ... rings like ship iron."
  basalt: {
    slot: 0.7,
    variants: 8,
    peakDb: -3,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.00012, 0.00018), amp: 0.9, brightHz: 4200 });
      hammerHead(buffer, LEAD, random, { amp: random.range(0.28, 0.36), tau: random.range(0.06, 0.085) });
      body(buffer, LEAD, random, {
        amp: 0.55,
        modes: [
          { freq: 1450, amp: 1, tau: 0.016 },
          { freq: 2280, amp: 0.8, tau: 0.012 },
          { freq: 3170, amp: 0.55, tau: 0.009 },
          { freq: 960, amp: 0.6, tau: 0.02 },
          { freq: 4400, amp: 0.3, tau: 0.006 },
          { freq: 170, amp: 0.45, tau: 0.022, attack: 0.0012 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.5,
        tau: 0.0045,
        filters: [biquad('bandpass', random.range(2600, 3600), 0.9)],
      });
      grains(buffer, LEAD + 0.004, random, {
        duration: 0.14, rate: 700, rateTau: 0.03, freq: [2600, 7800], tau: [0.0012, 0.004], amp: 0.11,
      });
      const chips = random.int(1, 2);
      for (let i = 0; i < chips; i += 1) {
        chip(buffer, LEAD + random.range(0.15, 0.3), random, {
          freq: [3200, 6200], tau: 0.007, amp: random.range(0.08, 0.13), bounces: random.int(3, 5), firstGap: 0.08,
        });
      }
      groundReflection(buffer, { gain: 0.24 });
    },
  },
  // "Bites into the scoria with a gritty, hollow crunch ... lighter than it
  // looks." Vesicles collapse, the cavities resonate, red crumbs patter down.
  scoria: {
    slot: 0.62,
    variants: 8,
    peakDb: -4,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.0005, 0.0008), amp: 0.55 });
      hammerHead(buffer, LEAD, random, { amp: 0.06, tau: 0.035 });
      body(buffer, LEAD, random, {
        amp: 0.5,
        modes: [
          { freq: 520, amp: 1, tau: 0.022, spread: 0.12 },
          { freq: 690, amp: 0.8, tau: 0.018, spread: 0.12 },
          { freq: 410, amp: 0.65, tau: 0.026, spread: 0.12 },
          { freq: 1180, amp: 0.4, tau: 0.01 },
          { freq: 210, amp: 0.35, tau: 0.02, attack: 0.002 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.55,
        attack: 0.0015,
        tau: 0.03,
        length: 0.16,
        grit: 0.45,
        gritRate: 1400,
        filters: [biquad('bandpass', random.range(1300, 1900), 0.7), biquad('peaking', 600, 1.4, 5)],
      });
      grains(buffer, LEAD + 0.002, random, {
        duration: 0.22, rate: 2600, rateTau: 0.045, freq: [900, 4200], tau: [0.0012, 0.0035], amp: 0.12,
      });
      grains(buffer, LEAD + 0.12, random, {
        duration: 0.32, rate: 140, rateTau: 0.12, freq: [1300, 3600], tau: [0.002, 0.005], amp: 0.07,
      });
      chip(buffer, LEAD + random.range(0.18, 0.28), random, {
        freq: [1600, 2600], tau: 0.005, amp: 0.08, bounces: 3, firstGap: 0.06, restitution: 0.45, thud: 0.4,
      });
      groundReflection(buffer, { gain: 0.3, lowpassHz: 2000 });
    },
  },
  // "A dull dusty tap rather than a basalt ring ... more powder than chip."
  tuff: {
    slot: 0.7,
    variants: 8,
    peakDb: -5.5,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.0011, 0.0016), amp: 0.7 });
      body(buffer, LEAD, random, {
        amp: 0.62,
        modes: [
          { freq: 240, amp: 1, tau: 0.026, attack: 0.0015, spread: 0.1 },
          { freq: 380, amp: 0.7, tau: 0.018, spread: 0.1 },
          { freq: 720, amp: 0.45, tau: 0.01 },
          { freq: 1150, amp: 0.2, tau: 0.006 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.28,
        attack: 0.0015,
        tau: 0.012,
        filters: [biquad('lowpass', 1800, 0.7)],
      });
      // Ash powder sifting off the face, then settling.
      noiseBurst(buffer, LEAD + 0.006, random, {
        amp: 0.16,
        attack: 0.022,
        tau: 0.13,
        length: 0.6,
        pink: true,
        grit: 0.3,
        gritRate: 600,
        filters: [biquad('highpass', 700, 0.6), biquad('lowpass', 4200, 0.6)],
      });
      grains(buffer, LEAD + 0.01, random, {
        duration: 0.5, rate: 900, rateTau: 0.14, freq: [1200, 3400], tau: [0.0008, 0.0022], amp: 0.045,
      });
      // The flat flake peeling away and dropping.
      mode(buffer, LEAD + random.range(0.16, 0.26), { freq: random.range(820, 1100), amp: 0.09, tau: 0.007, attack: 0.0006 });
      groundReflection(buffer, { gain: 0.32, lowpassHz: 1600 });
    },
  },
  // "A faint glassy tick follows the hammer strike, as if small crystals
  // shifted inside the stone." A basaltic knock with crystal pings after it.
  olivine: {
    slot: 0.66,
    variants: 8,
    peakDb: -3.5,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.00016, 0.00024), amp: 0.85, brightHz: 3800 });
      hammerHead(buffer, LEAD, random, { amp: random.range(0.18, 0.24), tau: 0.06 });
      body(buffer, LEAD, random, {
        amp: 0.55,
        modes: [
          { freq: 1250, amp: 1, tau: 0.014 },
          { freq: 1980, amp: 0.75, tau: 0.011 },
          { freq: 2900, amp: 0.45, tau: 0.008 },
          { freq: 820, amp: 0.5, tau: 0.016 },
          { freq: 165, amp: 0.4, tau: 0.02, attack: 0.0012 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.4,
        tau: 0.005,
        filters: [biquad('bandpass', random.range(2400, 3200), 0.9)],
      });
      const ticks = random.int(3, 5);
      for (let i = 0; i < ticks; i += 1) {
        const at = LEAD + random.range(0.035, 0.2) * (1 + i * 0.25);
        const freq = random.range(4800, 9400);
        mode(buffer, at, { freq, amp: random.range(0.045, 0.085), tau: random.range(0.018, 0.04), attack: 0.0002 });
        mode(buffer, at, { freq: freq * random.range(1.47, 1.53), amp: 0.025, tau: 0.012, attack: 0.0002 });
      }
      grains(buffer, LEAD + 0.006, random, {
        duration: 0.26, rate: 900, rateTau: 0.06, freq: [3400, 8800], tau: [0.0008, 0.002], amp: 0.06,
      });
      chip(buffer, LEAD + random.range(0.17, 0.27), random, {
        freq: [3600, 6400], tau: 0.008, amp: 0.08, bounces: 4, firstGap: 0.07,
      });
      groundReflection(buffer, { gain: 0.24 });
    },
  },
  // "A chalky click and throws pale dust from the limestone." Brittle, dry,
  // high and short, with the chambered skeleton crumbling bright.
  coral_limestone: {
    slot: 0.56,
    variants: 8,
    peakDb: -4.5,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.00026, 0.00036), amp: 0.8, brightHz: 5200 });
      hammerHead(buffer, LEAD, random, { amp: 0.1, tau: 0.045 });
      body(buffer, LEAD, random, {
        amp: 0.5,
        modes: [
          { freq: 2150, amp: 1, tau: 0.006, spread: 0.1 },
          { freq: 3300, amp: 0.8, tau: 0.0045, spread: 0.1 },
          { freq: 1450, amp: 0.55, tau: 0.008 },
          { freq: 4700, amp: 0.4, tau: 0.003 },
          { freq: 380, amp: 0.25, tau: 0.012, attack: 0.0015 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.5,
        tau: 0.006,
        filters: [biquad('highpass', 1800, 0.7), biquad('lowpass', 9000, 0.7)],
      });
      grains(buffer, LEAD + 0.002, random, {
        duration: 0.12, rate: 3000, rateTau: 0.022, freq: [2800, 9200], tau: [0.0006, 0.0018], amp: 0.1,
      });
      // Chalk dust: a pale, airy hiss that thins out quickly.
      noiseBurst(buffer, LEAD + 0.004, random, {
        amp: 0.07,
        attack: 0.01,
        tau: 0.06,
        length: 0.32,
        pink: true,
        filters: [biquad('highpass', 2600, 0.6), biquad('lowpass', 9500, 0.6)],
      });
      const crumbs = random.int(2, 3);
      for (let i = 0; i < crumbs; i += 1) {
        chip(buffer, LEAD + random.range(0.12, 0.26), random, {
          freq: [2600, 4200], tau: 0.003, amp: random.range(0.04, 0.07), bounces: 2, firstGap: 0.05, restitution: 0.4,
        });
      }
      groundReflection(buffer, { gain: 0.22, lowpassHz: 3200 });
    },
  },
  // "The hammer skims off a rusty skin and taps the darker stone below."
  // A raspy flake shears first; the dense core answers a beat later.
  iron_crust: {
    slot: 0.66,
    variants: 8,
    peakDb: -3.5,
    render(buffer, random) {
      const skim = random.range(0.007, 0.012);
      noiseBurst(buffer, LEAD, random, {
        amp: 0.5,
        attack: 0.003,
        tau: 0.006,
        length: 0.03,
        grit: 0.55,
        gritRate: 2600,
        filters: [biquad('bandpass', random.range(3200, 4600), 1.3), biquad('highpass', 1500, 0.7)],
      });
      contact(buffer, LEAD + skim, { width: random.range(0.00015, 0.0002), amp: 0.85, brightHz: 4000 });
      hammerHead(buffer, LEAD + skim, random, { amp: random.range(0.22, 0.3), tau: 0.065 });
      body(buffer, LEAD + skim, random, {
        amp: 0.5,
        modes: [
          { freq: 1350, amp: 1, tau: 0.013 },
          { freq: 2150, amp: 0.7, tau: 0.01 },
          { freq: 900, amp: 0.55, tau: 0.016 },
          { freq: 160, amp: 0.4, tau: 0.02, attack: 0.0012 },
        ],
      });
      noiseBurst(buffer, LEAD + skim, random, {
        amp: 0.35,
        tau: 0.004,
        filters: [biquad('bandpass', 3000, 0.9)],
      });
      // Rust flakes are thin and stiff: they land with a papery, faintly
      // metallic skitter rather than a stone chip's tick.
      const flakes = random.int(3, 5);
      for (let i = 0; i < flakes; i += 1) {
        const at = LEAD + skim + random.range(0.09, 0.32);
        noiseBurst(buffer, at, random, {
          amp: random.range(0.05, 0.09),
          tau: 0.0025,
          length: 0.02,
          filters: [biquad('bandpass', random.range(3400, 5600), 2.2)],
        });
        mode(buffer, at, { freq: random.range(6200, 8800), amp: random.range(0.02, 0.035), tau: 0.005, attack: 0.0002 });
      }
      grains(buffer, LEAD + skim, random, {
        duration: 0.16, rate: 1000, rateTau: 0.035, freq: [2000, 6400], tau: [0.001, 0.003], amp: 0.07,
      });
      groundReflection(buffer, { gain: 0.24 });
    },
  },
  // A boulder that has taken its last blow: the fracture runs through it,
  // the halves part and drop, and rubble settles. The runtime layers the
  // recorded rock tumble on top for the long tail.
  split: {
    slot: 1.4,
    variants: 3,
    peakDb: -1.5,
    render(buffer, random) {
      contact(buffer, LEAD, { width: 0.00018, amp: 0.8, brightHz: 3800 });
      hammerHead(buffer, LEAD, random, { amp: 0.22, tau: 0.06 });
      noiseBurst(buffer, LEAD + 0.002, random, {
        amp: 0.9,
        attack: 0.0006,
        tau: 0.014,
        length: 0.12,
        grit: 0.3,
        gritRate: 1800,
        filters: [biquad('bandpass', random.range(1400, 2000), 0.55)],
      });
      body(buffer, LEAD, random, {
        amp: 0.7,
        modes: [
          { freq: 82, amp: 1, tau: 0.09, attack: 0.003, glide: -0.12 },
          { freq: 140, amp: 0.7, tau: 0.06, attack: 0.002 },
          { freq: 640, amp: 0.55, tau: 0.03 },
          { freq: 1150, amp: 0.45, tau: 0.02 },
          { freq: 1900, amp: 0.3, tau: 0.012 },
        ],
      });
      grains(buffer, LEAD + 0.004, random, {
        duration: 0.3, rate: 2200, rateTau: 0.07, freq: [500, 2800], tau: [0.0015, 0.005], amp: 0.14,
      });
      // The parted halves and the bigger fragments landing.
      const chunks = random.int(3, 4);
      for (let i = 0; i < chunks; i += 1) {
        const at = LEAD + random.range(0.16, 0.42) + i * 0.06;
        const scale = random.range(0.5, 1) * (i === 0 ? 1 : 0.7);
        mode(buffer, at, { freq: random.range(110, 190), amp: 0.42 * scale, tau: 0.035, attack: 0.002 });
        mode(buffer, at, { freq: random.range(520, 900), amp: 0.28 * scale, tau: 0.016 });
        mode(buffer, at, { freq: random.range(1400, 2300), amp: 0.16 * scale, tau: 0.008 });
        noiseBurst(buffer, at, random, {
          amp: 0.22 * scale, tau: 0.008, filters: [biquad('bandpass', random.range(900, 1600), 0.7)],
        });
      }
      for (let i = 0; i < 5; i += 1) {
        chip(buffer, LEAD + random.range(0.22, 0.6), random, {
          freq: [2200, 5200], tau: 0.006, amp: random.range(0.06, 0.11), bounces: random.int(3, 5), firstGap: 0.08, thud: 0.3,
        });
      }
      grains(buffer, LEAD + 0.35, random, {
        duration: 0.9, rate: 180, rateTau: 0.3, freq: [1200, 4200], tau: [0.0015, 0.004], amp: 0.05,
      });
      groundReflection(buffer, { gain: 0.3, lowpassHz: 1800 });
    },
  },
  // Steel against seasoned timber or a crate side: a short hollow "tok"
  // with a fibrous bite and almost no ring left in the head.
  wood: {
    slot: 0.5,
    variants: 6,
    peakDb: -3.5,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.00035, 0.0005), amp: 0.75 });
      hammerHead(buffer, LEAD, random, { amp: 0.05, tau: 0.03 });
      const f1 = random.range(260, 420);
      body(buffer, LEAD, random, {
        amp: 0.7,
        modes: [
          { freq: f1, amp: 1, tau: 0.045, spread: 0.02 },
          { freq: f1 * 2.31, amp: 0.65, tau: 0.026, spread: 0.03 },
          { freq: f1 * 3.92, amp: 0.4, tau: 0.016, spread: 0.03 },
          { freq: f1 * 5.6, amp: 0.25, tau: 0.009, spread: 0.04 },
          { freq: random.range(150, 210), amp: 0.5, tau: 0.032, attack: 0.0015 },
        ],
      });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.35,
        tau: 0.007,
        filters: [biquad('bandpass', random.range(1300, 2200), 0.8)],
      });
      grains(buffer, LEAD + 0.003, random, {
        duration: 0.05, rate: 900, rateTau: 0.012, freq: [1200, 3600], tau: [0.0008, 0.002], amp: 0.06,
      });
      groundReflection(buffer, { gain: 0.2 });
    },
  },
  // Prickly pear and lava cactus: the cuticle pops, the wet flesh takes the
  // blow with a squelching thwuck, and the fibrous core tears.
  succulent: {
    slot: 0.56,
    variants: 6,
    peakDb: -4,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.0012, 0.0018), amp: 0.5 });
      mode(buffer, LEAD, { freq: random.range(3200, 4200), amp: 0.12, tau: 0.0015, attack: 0.0002 });
      body(buffer, LEAD, random, {
        amp: 0.65,
        modes: [
          { freq: 150, amp: 1, tau: 0.032, attack: 0.002, glide: 0.25 },
          { freq: 260, amp: 0.55, tau: 0.022, attack: 0.0015 },
        ],
      });
      // Squelch: a resonant band sweeping down as the pad's water is pushed
      // aside, built from short overlapping bands.
      const sweepStart = random.range(2100, 2600);
      const sweepEnd = random.range(620, 820);
      for (let step = 0; step < 6; step += 1) {
        const fraction = step / 5;
        noiseBurst(buffer, LEAD + step * 0.007, random, {
          amp: 0.32 * (1 - fraction * 0.5),
          attack: 0.002,
          tau: 0.012,
          length: 0.06,
          filters: [biquad('bandpass', sweepStart * (sweepEnd / sweepStart) ** fraction, 3.2)],
        });
      }
      grains(buffer, LEAD + 0.006, random, {
        duration: 0.11, rate: 1100, rateTau: 0.035, freq: [700, 2400], tau: [0.0012, 0.003], amp: 0.08,
      });
      // A few spines and dry areoles rattling.
      for (let i = 0; i < random.int(2, 4); i += 1) {
        mode(buffer, LEAD + random.range(0.01, 0.09), {
          freq: random.range(5600, 8800), amp: random.range(0.02, 0.04), tau: 0.0025, attack: 0.0002,
        });
      }
      groundReflection(buffer, { gain: 0.2, lowpassHz: 1800 });
    },
  },
  // Leafy herbs, vines and crops: a soft stem thwap, a snap and a swish of
  // leaves. The runtime adds the recorded shrub rustle underneath.
  herb: {
    slot: 0.48,
    variants: 6,
    peakDb: -6,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.0014, 0.002), amp: 0.5 });
      body(buffer, LEAD, random, {
        amp: 0.55,
        modes: [
          { freq: 220, amp: 1, tau: 0.02, attack: 0.002 },
          { freq: 410, amp: 0.4, tau: 0.012 },
        ],
      });
      const snap = LEAD + random.range(0.006, 0.016);
      mode(buffer, snap, { freq: random.range(1800, 2600), amp: 0.18, tau: 0.003, attack: 0.0002 });
      noiseBurst(buffer, snap, random, {
        amp: 0.2, tau: 0.003, filters: [biquad('bandpass', random.range(2200, 3200), 1.2)],
      });
      noiseBurst(buffer, LEAD + 0.004, random, {
        amp: 0.14,
        attack: 0.008,
        tau: 0.05,
        length: 0.3,
        grit: 0.3,
        gritRate: 400,
        filters: [biquad('highpass', 2400, 0.6), biquad('lowpass', 8000, 0.6)],
      });
      groundReflection(buffer, { gain: 0.18, lowpassHz: 1800 });
    },
  },
  // The blow before a boulder splits: under the strike itself, the stone
  // answers with a short crackle of internal fracture and a low grinding
  // groan, so the player hears that the next blow will part it.
  strain: {
    slot: 0.9,
    variants: 4,
    peakDb: -9,
    render(buffer, random) {
      grains(buffer, LEAD, random, {
        duration: 0.6, rate: 260, rateTau: 0.22, freq: [600, 2200], tau: [0.0015, 0.004], amp: 0.22,
      });
      for (let i = 0; i < random.int(3, 5); i += 1) {
        mode(buffer, LEAD + random.range(0.03, 0.42), {
          freq: random.range(190, 380), amp: random.range(0.18, 0.32), tau: 0.012, attack: 0.001,
        });
      }
      noiseBurst(buffer, LEAD + 0.02, random, {
        amp: 0.3,
        attack: 0.06,
        tau: 0.16,
        length: 0.75,
        grit: 0.5,
        gritRate: 300,
        filters: [biquad('lowpass', 1100, 0.7), biquad('highpass', 140, 0.7)],
      });
      groundReflection(buffer, { gain: 0.3, lowpassHz: 1600 });
    },
  },
};

let materialIndex = 0;
for (const [name, material] of Object.entries(MATERIALS)) {
  materialIndex += 1;
  const fileName = `strike-${name.replace(/_/g, '-')}.wav`;
  console.log(writeSprite(outputDir, fileName, material, 0x5eed0000 + materialIndex * 977));
}

console.log(`Built hammer audio in ${path.relative(repoRoot, outputDir)}`);
