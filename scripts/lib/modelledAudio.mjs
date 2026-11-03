// Shared physical-modelling primitives for Darwin's modelled Foley: the
// hammer strikes, the knife, pellet impacts and small field handling sounds.
// Each build script describes a sound as layers of these; see
// scripts/build-hammer-audio.mjs for the reasoning behind each layer.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SR = 48000;
export const TAU = Math.PI * 2;

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

export function makeRandom(seed) {
  const next = mulberry32(seed);
  const random = () => next();
  random.range = (min, max) => min + next() * (max - min);
  random.jitter = (value, amount) => value * (1 + (next() * 2 - 1) * amount);
  random.gauss = () => {
    const u = Math.max(1e-9, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * next());
  };
  random.int = (min, max) => Math.floor(min + next() * (max - min + 1));
  return random;
}

// RBJ biquad, run in place over a buffer.
export function biquad(type, freq, q = 0.707, gainDb = 0) {
  const w0 = TAU * Math.min(freq, SR * 0.49) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else {
    b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
  }
  const c = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
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

export function chain(buffer, ...filters) {
  for (const filter of filters) filter(buffer);
  return buffer;
}

export function mixInto(target, source, at = 0, gain = 1) {
  const offset = Math.round(at * SR);
  for (let i = 0; i < source.length; i += 1) {
    const index = offset + i;
    if (index >= 0 && index < target.length) target[index] += source[i] * gain;
  }
}

// A decaying sinusoid with a raised-cosine onset, so even the sharpest mode
// starts without a digital click; `glide` bends the pitch as the contact
// stiffens or the struck body settles.
export function mode(target, at, { freq, amp, tau, attack = 0.0004, glide = 0, phase = 0 }) {
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

// Noise shaped by an attack/decay envelope and a filter chain. `grit`
// gates the noise randomly so a crush reads as many small failures rather
// than a smooth hiss.
export function noiseBurst(target, at, random, {
  amp,
  attack = 0.0005,
  tau,
  length = tau * 6,
  filters = [],
  grit = 0,
  gritRate = 900,
  pink = false,
}) {
  const samples = Math.ceil(length * SR);
  const burst = new Float32Array(samples);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let gate = 1;
  for (let i = 0; i < samples; i += 1) {
    let n = random() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + n * 0.099046;
      b1 = 0.963 * b1 + n * 0.2965164;
      b2 = 0.57 * b2 + n * 1.0526913;
      n = (b0 + b1 + b2 + n * 0.1848) * 0.22;
    }
    if (grit > 0 && random() < gritRate / SR) gate = random() < grit ? random() * 0.25 : 0.6 + random() * 0.6;
    const t = i / SR;
    const env = (1 - Math.exp(-t / Math.max(attack, 1 / SR))) * Math.exp(-t / tau);
    burst[i] = n * env * (grit > 0 ? gate : 1);
  }
  chain(burst, ...filters);
  mixInto(target, burst, at, amp);
}

// The steel face meeting the surface: a half-sine force pulse whose width is
// the contact time. Its spectrum falls away above ~1/width, which is what
// separates the ringing clack of basalt from the dull tap of tuff.
export function contact(target, at, { width, amp, brightHz = null }) {
  const samples = Math.max(2, Math.round(width * SR));
  const pulse = new Float32Array(samples + 256);
  for (let i = 0; i < samples; i += 1) {
    const s = Math.sin(Math.PI * i / samples);
    // Differentiated force: the radiated pressure of a struck plate.
    pulse[i] = Math.cos(Math.PI * i / samples) * s;
  }
  if (brightHz) biquad('peaking', brightHz, 1.2, 4)(pulse);
  mixInto(target, pulse, at, amp);
}

// The geological hammer's head: a free-free steel bar (partial ratios of
// the Euler-Bernoulli bar) plus the head-on-haft rocking mode.
export function hammerHead(target, at, random, { amp, tau = 0.07, base = 3350 }) {
  if (amp <= 0) return;
  const f1 = random.jitter(base, 0.035);
  const ratios = [1, 2.756, 5.404];
  const weights = [1, 0.42, 0.16];
  const decays = [1, 0.48, 0.24];
  ratios.forEach((ratio, index) => {
    const detune = 1 + random.gauss() * 0.004;
    mode(target, at, {
      freq: f1 * ratio * detune,
      amp: amp * weights[index],
      tau: tau * decays[index],
      attack: 0.0003,
    });
    // A slightly split degenerate partner gives the head its shimmer.
    mode(target, at, {
      freq: f1 * ratio * detune * 1.0045,
      amp: amp * weights[index] * 0.38,
      tau: tau * decays[index] * 0.9,
      attack: 0.0003,
      phase: random() * TAU,
    });
  });
  mode(target, at, { freq: random.jitter(1180, 0.06), amp: amp * 0.5, tau: tau * 0.32, attack: 0.0006 });
}

// A real boulder has a dense field of modes, not a few clean tones; each
// listed resonance is a small cluster of detuned neighbours so the body reads
// as stone rather than as a tuned bar. Low modes (mass, not texture) stay single.
export function body(target, at, random, { modes, amp }) {
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

// Stochastic grit: a Poisson stream whose density decays over the event.
// Each grain is a tiny damped ping, pitched by grain size.
export function grains(target, at, random, {
  duration,
  rate,
  rateTau,
  freq: [fMin, fMax],
  tau: [tMin, tMax],
  amp,
  ampTau = rateTau,
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
      amp: amp * (0.25 + size * 0.75) * Math.exp(-t / ampTau) * random.range(0.5, 1),
      tau: tMin + (tMax - tMin) * size,
      attack: 0.0002,
      phase: random() * TAU,
    });
  }
}

// A loosened fragment flung clear, landing and bouncing to rest: intervals
// and strengths shrink geometrically, as a hard chip's do on stone.
export function chip(target, at, random, {
  freq: [fMin, fMax],
  tau = 0.006,
  amp,
  bounces = 4,
  firstGap = 0.09,
  restitution = 0.55,
  thud = 0,
}) {
  const freq = random.range(fMin, fMax);
  let t = at;
  let gap = random.jitter(firstGap, 0.25);
  let strength = amp;
  for (let bounce = 0; bounce < bounces && t < 2; bounce += 1) {
    mode(target, t, { freq: random.jitter(freq, 0.08), amp: strength, tau, attack: 0.0002, phase: random() * TAU });
    mode(target, t, { freq: random.jitter(freq * 1.73, 0.08), amp: strength * 0.45, tau: tau * 0.6, attack: 0.0002 });
    if (thud > 0) mode(target, t, { freq: random.range(260, 420), amp: strength * thud, tau: 0.012, attack: 0.0008 });
    t += gap;
    gap *= restitution * random.range(0.85, 1.1);
    strength *= restitution * random.range(0.75, 1);
  }
}

// Outdoors there is no room, only the ground: one close, darker reflection.
export function groundReflection(buffer, { delay = 0.0042, gain = 0.28, lowpassHz = 2600 }) {
  const reflected = new Float32Array(buffer.length);
  const offset = Math.round(delay * SR);
  for (let i = offset; i < buffer.length; i += 1) reflected[i] = buffer[i - offset];
  chain(reflected, biquad('lowpass', lowpassHz, 0.6));
  for (let i = 0; i < buffer.length; i += 1) buffer[i] += reflected[i] * gain;
}

export function finish(buffer, { peakDb, drive = 1.2, highpassHz = 45 }) {
  chain(buffer, biquad('highpass', highpassHz, 0.6), biquad('lowpass', 17500, 0.6));
  // Gentle tanh saturation densifies the transient the way a close mic and
  // preamp would, without audible distortion at these levels.
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

export function encodeWav(samples) {
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

// Renders `variants` seeded takes of one sound into a single sprite file.
export function writeSprite(outputDir, fileName, { slot, variants, peakDb, render, drive, highpassHz }, seedBase) {
  mkdirSync(outputDir, { recursive: true });
  const slotSamples = Math.round(slot * SR);
  const sprite = new Float32Array(slotSamples * variants);
  for (let variant = 0; variant < variants; variant += 1) {
    const random = makeRandom(seedBase + variant * 131);
    const buffer = new Float32Array(slotSamples);
    render(buffer, random, variant);
    finish(buffer, { peakDb, drive, highpassHz });
    sprite.set(buffer, variant * slotSamples);
  }
  writeFileSync(path.join(outputDir, fileName), encodeWav(sprite));
  return `${fileName}: ${variants} x ${slot}s`;
}
