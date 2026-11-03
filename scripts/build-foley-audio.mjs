#!/usr/bin/env node

// Modelled foley for Darwin's body and gun. No source recordings.
//
// Rocks: his boots on a boulder, a jump landing on one, walking into one,
// scrambling up one, and a loose stone rocking under his weight. The
// movement-wildlife rock steps are a single hiking-boot recording; these are
// modelled so a rock underfoot is a different sound from stony ground.
//
// Darwin wore hobnailed leather boots, so every contact has two parts: the
// heel and its nails (a short, bright clack and tick against basalt), then
// the sole rolling flat (a duller slap and a scuff of grit). The rock answers
// with short, dense stone modes; his weight adds a low thud through the boot.
//
// Jumps: the push-off (boot and coat) and the landing's body (weight, coat,
// satchel, brass), layered over whatever surface sound the contact makes.
//
// Gun: the body of a black-powder fowling piece's report under the recorded
// crack (movement-wildlife/shotgun-report.wav, cut short): the percussion
// cap, the low powder boom, its rolling tail and echoes off the hills.
//
// Seeds are fixed, so a rebuild reproduces the committed sprites exactly.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'public/assets/audio/foley');
const SR = 48000;
const TAU = Math.PI * 2;

mkdirSync(outputDir, { recursive: true });

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const next = mulberry32(seed);
  const random = () => next();
  random.range = (min, max) => min + next() * (max - min);
  random.jitter = (value, amount) => value * (1 + (next() * 2 - 1) * amount);
  random.gauss = () => {
    const u = Math.max(1e-9, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * next());
  };
  return random;
}

// RBJ biquad, run in place over a buffer.
function biquad(type, freq, q = 0.707, gainDb = 0) {
  const w0 = TAU * Math.min(freq, SR * 0.49) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b;
  let a;
  if (type === 'lowpass') {
    b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'highpass') {
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'bandpass') {
    b = [alpha, 0, -alpha];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  } else {
    b = [1 + alpha * A, -2 * cos, 1 - alpha * A];
    a = [1 + alpha / A, -2 * cos, 1 - alpha / A];
  }
  const c = [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
  return buffer => {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const x = buffer[i];
      const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      buffer[i] = y;
    }
    return buffer;
  };
}

function chain(buffer, ...filters) {
  for (const filter of filters) filter(buffer);
  return buffer;
}

function mixInto(target, source, at = 0, gain = 1) {
  const offset = Math.round(at * SR);
  for (let i = 0; i < source.length; i += 1) {
    const index = offset + i;
    if (index >= 0 && index < target.length) target[index] += source[i] * gain;
  }
}

// A decaying sinusoid with a raised-cosine onset (no digital click).
function mode(target, at, { freq, amp, tau, attack = 0.0004, glide = 0, phase = 0 }) {
  const start = Math.round(at * SR);
  const length = Math.min(target.length - start, Math.ceil(tau * 7 * SR));
  const attackSamples = Math.max(1, Math.round(attack * SR));
  let theta = phase;
  for (let i = 0; i < length; i += 1) {
    const t = i / SR;
    const onset = i < attackSamples ? 0.5 - 0.5 * Math.cos(Math.PI * i / attackSamples) : 1;
    const f = freq * (1 + glide * Math.exp(-t / Math.max(0.002, tau * 0.5)));
    theta += TAU * f / SR;
    target[start + i] += Math.sin(theta) * amp * onset * Math.exp(-t / tau);
  }
}

// Filtered noise under an attack/decay envelope; `grit` gates it randomly so
// a scrape reads as many small catches rather than a smooth hiss.
function noiseBurst(target, at, random, {
  amp,
  attack = 0.0005,
  tau,
  length = tau * 6,
  filters = [],
  grit = 0,
  gritRate = 900,
}) {
  const samples = Math.ceil(length * SR);
  const burst = new Float32Array(samples);
  let gate = 1;
  for (let i = 0; i < samples; i += 1) {
    const n = random() * 2 - 1;
    if (grit > 0 && random() < gritRate / SR) gate = random() < grit ? random() * 0.25 : 0.6 + random() * 0.6;
    const t = i / SR;
    const env = (1 - Math.exp(-t / Math.max(attack, 1 / SR))) * Math.exp(-t / tau);
    burst[i] = n * env * (grit > 0 ? gate : 1);
  }
  chain(burst, ...filters);
  mixInto(target, burst, at, amp);
}

// A half-sine force pulse; its width is the contact time. Leather and cloth
// are wide (dull), a hobnail or stone edge is narrow (bright).
function contact(target, at, { width, amp, brightHz = null }) {
  const samples = Math.max(2, Math.round(width * SR));
  const pulse = new Float32Array(samples + 256);
  for (let i = 0; i < samples; i += 1) {
    pulse[i] = Math.cos(Math.PI * i / samples) * Math.sin(Math.PI * i / samples);
  }
  if (brightHz) biquad('peaking', brightHz, 1.2, 4)(pulse);
  mixInto(target, pulse, at, amp);
}

// Stone answers with a dense cluster of short modes, not clean tones.
function stone(target, at, random, { modes, amp }) {
  for (const spec of modes) {
    const centre = random.jitter(spec.freq, spec.spread ?? 0.06);
    const cluster = spec.freq < 300 ? 1 : (spec.cluster ?? 4);
    for (let i = 0; i < cluster; i += 1) {
      mode(target, at, {
        freq: cluster === 1 ? centre : centre * (1 + random.gauss() * 0.07),
        amp: amp * spec.amp * random.range(0.8, 1.15) / Math.sqrt(cluster),
        tau: random.jitter(spec.tau, 0.25),
        attack: spec.attack ?? 0.0005,
        glide: spec.glide ?? 0,
        phase: random() * TAU,
      });
    }
  }
}

// Grit crushed and scattered under a boot: a Poisson stream of tiny pings.
function grains(target, at, random, {
  duration,
  rate,
  rateTau,
  freq: [fMin, fMax],
  tau: [tMin, tMax],
  amp,
}) {
  let t = 0;
  while (t < duration) {
    const density = rate * Math.exp(-t / rateTau);
    if (density < 2) break;
    t += -Math.log(Math.max(1e-6, random())) / density;
    if (t >= duration) break;
    const size = random() ** 1.6;
    mode(target, at + t, {
      freq: fMin * (fMax / fMin) ** (1 - size) * random.jitter(1, 0.05),
      amp: amp * (0.25 + size * 0.75) * Math.exp(-t / rateTau) * random.range(0.5, 1),
      tau: tMin + (tMax - tMin) * size,
      attack: 0.0002,
      phase: random() * TAU,
    });
  }
}

// A kicked pebble bouncing away across the rock to rest.
function pebble(target, at, random, { freq: [fMin, fMax], amp, bounces = 4, firstGap = 0.08, restitution = 0.55 }) {
  const freq = random.range(fMin, fMax);
  let t = at;
  let gap = random.jitter(firstGap, 0.25);
  let strength = amp;
  for (let bounce = 0; bounce < bounces; bounce += 1) {
    mode(target, t, { freq: random.jitter(freq, 0.08), amp: strength, tau: 0.006, attack: 0.0002, phase: random() * TAU });
    mode(target, t, { freq: random.jitter(freq * 1.73, 0.08), amp: strength * 0.45, tau: 0.0036, attack: 0.0002 });
    t += gap;
    gap *= restitution * random.range(0.85, 1.1);
    strength *= restitution * random.range(0.75, 1);
  }
}

// Outdoors there is no room, only the ground: one close, darker reflection.
function groundReflection(buffer, { delay = 0.0042, gain = 0.24, lowpassHz = 2400 }) {
  const reflected = new Float32Array(buffer.length);
  const offset = Math.round(delay * SR);
  for (let i = offset; i < buffer.length; i += 1) reflected[i] = buffer[i - offset];
  chain(reflected, biquad('lowpass', lowpassHz, 0.6));
  for (let i = 0; i < buffer.length; i += 1) buffer[i] += reflected[i] * gain;
}

function finish(buffer, { peakDb, drive = 1.3, highpassHz = 50 }) {
  chain(buffer, biquad('highpass', highpassHz, 0.6), biquad('lowpass', 16000, 0.6));
  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const pre = drive / Math.max(1e-6, peak);
  for (let i = 0; i < buffer.length; i += 1) buffer[i] = Math.tanh(buffer[i] * pre);
  peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const target = 10 ** (peakDb / 20);
  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < buffer.length; i += 1) {
    const tail = buffer.length - i;
    const fadeGain = tail < fade ? (0.5 - 0.5 * Math.cos(Math.PI * tail / fade)) : 1;
    buffer[i] = buffer[i] / peak * target * fadeGain;
  }
  return buffer;
}

const LEAD = 0.004;

// The basalt's reply to a boot: short, dense, mid-bright.
const BASALT_UNDERFOOT = [
  { freq: 720, amp: 0.8, tau: 0.011 },
  { freq: 1320, amp: 1, tau: 0.008 },
  { freq: 2150, amp: 0.65, tau: 0.006 },
  { freq: 3200, amp: 0.35, tau: 0.004 },
];

// One hobnailed boot planting on rock: heel and nails, then the sole.
function bootPlant(buffer, at, random, { weight = 1, scuff = 1 }) {
  contact(buffer, at, { width: random.range(0.0006, 0.0009), amp: 0.85 * weight, brightHz: 3200 });
  const nails = 2 + Math.floor(random() * 3);
  for (let i = 0; i < nails; i += 1) {
    mode(buffer, at + random.range(0, 0.0035), {
      freq: random.range(4600, 7200), amp: random.range(0.07, 0.14) * weight, tau: random.range(0.0018, 0.003), attack: 0.0001,
    });
  }
  stone(buffer, at, random, { amp: 0.42 * weight, modes: BASALT_UNDERFOOT });
  // His weight arriving through the heel.
  mode(buffer, at + 0.001, { freq: random.range(115, 150), amp: 0.5 * weight, tau: 0.02, attack: 0.0015 });
  const sole = at + random.range(0.032, 0.058);
  contact(buffer, sole, { width: random.range(0.0018, 0.0026), amp: 0.42 * weight });
  mode(buffer, sole, { freq: random.range(95, 125), amp: 0.32 * weight, tau: 0.022, attack: 0.002 });
  stone(buffer, sole, random, { amp: 0.14 * weight, modes: BASALT_UNDERFOOT.slice(0, 2) });
  noiseBurst(buffer, sole - 0.004, random, {
    amp: 0.16 * scuff,
    attack: 0.006,
    tau: 0.028,
    length: 0.12,
    grit: 0.45,
    gritRate: 700,
    filters: [biquad('bandpass', random.range(2200, 3200), 0.8)],
  });
  grains(buffer, at + 0.002, random, {
    duration: 0.14, rate: 320 * scuff, rateTau: 0.045, freq: [3200, 9500], tau: [0.0007, 0.0022], amp: 0.07,
  });
}

const SOUNDS = {
  // An ordinary step onto a boulder: crisp heel clack, nails, sole, grit.
  'boot-on-rock': {
    slot: 0.42,
    variants: 10,
    peakDb: -2,
    render(buffer, random) {
      bootPlant(buffer, LEAD, random, { weight: random.range(0.9, 1.05), scuff: random.range(0.7, 1.2) });
      groundReflection(buffer, {});
    },
  },
  // A jump landing on rock: both boots a beat apart, his whole weight in a
  // low thump, grit sprayed and a pebble or two kicked skittering away.
  'rock-landing': {
    slot: 0.9,
    variants: 6,
    peakDb: -1,
    render(buffer, random) {
      const second = LEAD + random.range(0.014, 0.034);
      bootPlant(buffer, LEAD, random, { weight: 1.15, scuff: 1.3 });
      bootPlant(buffer, second, random, { weight: random.range(0.8, 1), scuff: 1.1 });
      mode(buffer, LEAD + 0.002, { freq: random.range(68, 86), amp: 1.05, tau: 0.055, attack: 0.003 });
      mode(buffer, LEAD + 0.003, { freq: random.range(150, 190), amp: 0.45, tau: 0.03, attack: 0.002 });
      noiseBurst(buffer, LEAD, random, {
        amp: 0.5, attack: 0.002, tau: 0.018, length: 0.1, filters: [biquad('lowpass', 420, 0.7)],
      });
      grains(buffer, LEAD + 0.004, random, {
        duration: 0.4, rate: 1100, rateTau: 0.07, freq: [2400, 9500], tau: [0.0008, 0.0026], amp: 0.075,
      });
      const pebbles = 1 + Math.floor(random() * 3);
      for (let i = 0; i < pebbles; i += 1) {
        pebble(buffer, LEAD + random.range(0.05, 0.16), random, {
          freq: [1900, 3900], amp: random.range(0.14, 0.24), bounces: 3 + Math.floor(random() * 3),
        });
      }
      groundReflection(buffer, { gain: 0.3 });
    },
  },
  // Walking into a rock: shoulder and coat thud against it (wide, dull), a
  // hand slapping out onto the stone, the coat scraping, grit trickling down.
  'rock-bump': {
    slot: 0.8,
    variants: 6,
    peakDb: -2,
    render(buffer, random) {
      const thud = new Float32Array(buffer.length);
      contact(thud, LEAD, { width: random.range(0.0035, 0.005), amp: 0.9 });
      mode(thud, LEAD, { freq: random.range(82, 104), amp: 0.95, tau: 0.045, attack: 0.003 });
      mode(thud, LEAD, { freq: random.range(170, 210), amp: 0.4, tau: 0.026, attack: 0.002 });
      noiseBurst(thud, LEAD, random, { amp: 0.35, attack: 0.002, tau: 0.02, length: 0.12, filters: [biquad('lowpass', 650, 0.7)] });
      chain(thud, biquad('lowpass', 1400, 0.7));
      mixInto(buffer, thud);
      stone(buffer, LEAD, random, { amp: 0.16, modes: BASALT_UNDERFOOT.slice(0, 3) });
      const hand = LEAD + random.range(0.012, 0.035);
      contact(buffer, hand, { width: random.range(0.0009, 0.0013), amp: 0.38 });
      noiseBurst(buffer, hand, random, { amp: 0.2, tau: 0.006, length: 0.04, filters: [biquad('highpass', 1300, 0.7)] });
      stone(buffer, hand, random, { amp: 0.12, modes: BASALT_UNDERFOOT });
      noiseBurst(buffer, LEAD + 0.02, random, {
        amp: 0.2,
        attack: 0.012,
        tau: random.range(0.07, 0.11),
        length: 0.35,
        grit: 0.55,
        gritRate: 500,
        filters: [biquad('bandpass', random.range(1300, 1900), 0.7)],
      });
      grains(buffer, LEAD + 0.06, random, {
        duration: 0.55, rate: 160, rateTau: 0.22, freq: [2600, 7600], tau: [0.0008, 0.002], amp: 0.05,
      });
      if (random() < 0.6) pebble(buffer, LEAD + random.range(0.12, 0.25), random, { freq: [2100, 3600], amp: 0.12, bounces: 3 });
      groundReflection(buffer, { gain: 0.2 });
    },
  },
  // Scrambling up onto a rock: the toe scrapes up the face, then the boot
  // plants hard on top.
  'rock-scramble': {
    slot: 0.6,
    variants: 6,
    peakDb: -2,
    render(buffer, random) {
      noiseBurst(buffer, LEAD, random, {
        amp: 0.24,
        attack: random.range(0.015, 0.03),
        tau: random.range(0.045, 0.07),
        length: 0.2,
        grit: 0.5,
        gritRate: 650,
        filters: [biquad('bandpass', random.range(1900, 2700), 0.9)],
      });
      grains(buffer, LEAD + 0.01, random, {
        duration: 0.12, rate: 260, rateTau: 0.05, freq: [3000, 8000], tau: [0.0008, 0.002], amp: 0.05,
      });
      bootPlant(buffer, LEAD + random.range(0.075, 0.115), random, { weight: 1.1, scuff: 1 });
      groundReflection(buffer, {});
    },
  },
  // A loose stone rocking under him: a hollow rock-on-rock clonk, then it
  // rocks back and forth to rest with a grind of grit between.
  'loose-stone-clonk': {
    slot: 0.75,
    variants: 6,
    peakDb: -2,
    render(buffer, random) {
      const clonkModes = [
        { freq: random.range(160, 210), amp: 0.7, tau: 0.04, attack: 0.001 },
        { freq: random.range(430, 620), amp: 1, tau: 0.03, cluster: 3 },
        { freq: random.range(980, 1300), amp: 0.55, tau: 0.016 },
        { freq: random.range(1900, 2500), amp: 0.25, tau: 0.008 },
      ];
      let t = LEAD;
      let strength = 1;
      let gap = random.range(0.09, 0.15);
      const rocks = 3 + Math.floor(random() * 2);
      for (let i = 0; i < rocks; i += 1) {
        contact(buffer, t, { width: random.range(0.0005, 0.0008), amp: 0.55 * strength });
        stone(buffer, t, random, { amp: 0.6 * strength, modes: clonkModes });
        if (i > 0) {
          noiseBurst(buffer, t - gap * 0.6, random, {
            amp: 0.1 * strength,
            attack: 0.02,
            tau: gap * 0.3,
            length: gap * 0.7,
            grit: 0.7,
            gritRate: 400,
            filters: [biquad('bandpass', random.range(800, 1200), 1)],
          });
        }
        t += gap;
        gap *= random.range(0.6, 0.75);
        strength *= random.range(0.45, 0.6);
      }
      grains(buffer, LEAD + 0.004, random, {
        duration: 0.25, rate: 240, rateTau: 0.08, freq: [2800, 8500], tau: [0.0008, 0.002], amp: 0.05,
      });
      groundReflection(buffer, { gain: 0.26 });
    },
  },
  // Pushing off for a jump: the boot drives into the ground, then the coat
  // and satchel swing up with him.
  'jump-takeoff': {
    slot: 0.55,
    variants: 6,
    peakDb: -3,
    render(buffer, random) {
      contact(buffer, LEAD, { width: random.range(0.0014, 0.002), amp: 0.55 });
      mode(buffer, LEAD, { freq: random.range(85, 110), amp: 0.6, tau: 0.03, attack: 0.002 });
      noiseBurst(buffer, LEAD + 0.004, random, {
        amp: 0.2,
        attack: 0.004,
        tau: 0.03,
        length: 0.12,
        grit: 0.5,
        gritRate: 700,
        filters: [biquad('bandpass', random.range(2000, 2800), 0.8)],
      });
      // Cloth through air: a soft, rising swish.
      noiseBurst(buffer, LEAD + random.range(0.015, 0.03), random, {
        amp: 0.42,
        attack: random.range(0.05, 0.08),
        tau: random.range(0.06, 0.09),
        length: 0.4,
        filters: [biquad('bandpass', random.range(700, 1000), 0.55), biquad('lowpass', 3200, 0.7)],
      });
      const flap = LEAD + random.range(0.11, 0.16);
      contact(buffer, flap, { width: 0.005, amp: 0.14 });
      noiseBurst(buffer, flap, random, { amp: 0.12, tau: 0.02, length: 0.1, filters: [biquad('bandpass', 500, 0.8)] });
      groundReflection(buffer, { gain: 0.18 });
    },
  },
  // The body of a landing: his weight through bent knees, coat flopping,
  // the satchel thumping against his hip, a brass buckle chinking.
  'jump-landing': {
    slot: 0.8,
    variants: 6,
    peakDb: -2,
    render(buffer, random) {
      const second = LEAD + random.range(0.012, 0.03);
      for (const [at, weight] of [[LEAD, 1], [second, random.range(0.7, 0.9)]]) {
        contact(buffer, at, { width: random.range(0.0018, 0.0026), amp: 0.7 * weight });
        mode(buffer, at, { freq: random.range(72, 95), amp: 0.9 * weight, tau: 0.045, attack: 0.002 });
      }
      mode(buffer, LEAD + 0.01, { freq: random.range(52, 64), amp: 0.5, tau: 0.08, attack: 0.008 });
      noiseBurst(buffer, LEAD, random, { amp: 0.4, attack: 0.002, tau: 0.02, length: 0.1, filters: [biquad('lowpass', 380, 0.7)] });
      noiseBurst(buffer, LEAD + 0.02, random, {
        amp: 0.3,
        attack: 0.01,
        tau: random.range(0.05, 0.07),
        length: 0.3,
        filters: [biquad('bandpass', random.range(600, 850), 0.7)],
      });
      const satchel = LEAD + random.range(0.06, 0.1);
      contact(buffer, satchel, { width: 0.006, amp: 0.32 });
      mode(buffer, satchel, { freq: random.range(130, 160), amp: 0.3, tau: 0.03, attack: 0.003 });
      const buckles = 1 + Math.floor(random() * 2);
      for (let i = 0; i < buckles; i += 1) {
        const at = satchel + random.range(0.002, 0.03);
        mode(buffer, at, { freq: random.range(3600, 5200), amp: 0.06, tau: 0.02, attack: 0.0002 });
        mode(buffer, at, { freq: random.range(6800, 8200), amp: 0.03, tau: 0.01, attack: 0.0002 });
      }
      groundReflection(buffer, { gain: 0.22 });
    },
  },
  // Under the recorded crack: the percussion cap, the black-powder boom
  // (lower and broader than a modern cartridge), the long rolling tail and
  // the report coming back off the island's hills.
  'gun-blast': {
    slot: 2.6,
    variants: 4,
    peakDb: -1,
    drive: 1.6,
    render(buffer, random) {
      const dry = new Float32Array(buffer.length);
      contact(dry, LEAD, { width: 0.00015, amp: 0.4 });
      noiseBurst(dry, LEAD, random, { amp: 0.3, tau: 0.0018, length: 0.012, filters: [biquad('highpass', 5000, 0.7)] });
      const blast = LEAD + random.range(0.006, 0.012);
      // The pressure wave: a sharp positive push and a slower suction.
      contact(dry, blast, { width: 0.003, amp: 1 });
      contact(dry, blast + 0.0032, { width: 0.006, amp: -0.5 });
      noiseBurst(dry, blast, random, { amp: 0.85, attack: 0.0002, tau: 0.011, length: 0.1, filters: [biquad('highpass', 700, 0.7)] });
      mode(dry, blast, { freq: random.range(52, 66), amp: 0.9, tau: 0.13, attack: 0.002, glide: 0.4 });
      mode(dry, blast, { freq: random.range(100, 125), amp: 0.5, tau: 0.06, attack: 0.001 });
      noiseBurst(dry, blast, random, { amp: 0.75, attack: 0.001, tau: 0.09, length: 0.6, filters: [biquad('lowpass', 260, 0.7)] });
      noiseBurst(dry, blast + 0.002, random, {
        amp: 0.42, attack: 0.002, tau: 0.05, length: 0.35, filters: [biquad('bandpass', random.range(450, 700), 0.5)],
      });
      noiseBurst(dry, blast + 0.01, random, {
        amp: 0.22,
        attack: 0.03,
        tau: random.range(0.38, 0.5),
        length: 2.2,
        filters: [biquad('lowpass', random.range(700, 950), 0.6), biquad('highpass', 60, 0.6)],
      });
      mixInto(buffer, dry);
      const echoes = [
        [random.range(0.2, 0.3), 0.34, 2200],
        [random.range(0.55, 0.8), 0.2, 1400],
        [random.range(1.1, 1.45), 0.11, 900],
      ];
      for (const [delay, gain, lowpassHz] of echoes) {
        const echo = Float32Array.from(dry);
        chain(echo, biquad('lowpass', lowpassHz, 0.6), biquad('highpass', 90, 0.6));
        mixInto(buffer, echo, delay, gain);
      }
    },
  },
};

function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let soundIndex = 0;
for (const [name, sound] of Object.entries(SOUNDS)) {
  soundIndex += 1;
  const slotSamples = Math.round(sound.slot * SR);
  const sprite = new Float32Array(slotSamples * sound.variants);
  for (let variant = 0; variant < sound.variants; variant += 1) {
    const random = makeRandom(0x70c40000 + soundIndex * 977 + variant * 131);
    const slot = new Float32Array(slotSamples);
    sound.render(slot, random);
    finish(slot, { peakDb: sound.peakDb, drive: sound.drive });
    sprite.set(slot, variant * slotSamples);
  }
  writeFileSync(path.join(outputDir, `${name}.wav`), encodeWav(sprite));
  console.log(`${name}.wav: ${sound.variants} x ${sound.slot}s`);
}

console.log(`Built foley audio in ${path.relative(repoRoot, outputDir)}`);
