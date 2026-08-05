// Procedural giant manta (Mobula birostris): one lofted disc, cephalic lobes,
// a whip tail, and the vertex-shader flight rig that drives them.
//
// Authoring frame matches the other specimen shapes: head at -z, mid-plane at
// y=0, 3.6 m wingspan before per-animal scaling. Real scale matters here — a
// manta reads as majestic mostly because it is enormous and slow, and both of
// those are settings rather than shapes.
//
// The whole animal animates in the vertex shader off one accumulated phase per
// instance, so a manta costs a single draw call however many are cruising.
// The flap is a travelling wave outward along the span with the trailing edge
// lagging the leading edge; without that chordwise lag the wing beats like a
// stiff plank instead of rippling.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createInstancedCreature, seededUnit } from './instancedCreature';

// --- Part ids (aPart attribute) --------------------------------------------
const PART_DISC = 0; // wings and body: spanwise travelling wave
const PART_CEPHALIC = 1; // the two head lobes: slow furl
const PART_TAIL = 2; // whip: trailing wave off the disc

export const MANTA_SPAN = 3.6;
const HALF_SPAN = MANTA_SPAN * 0.5;
const DISC_BACK = 0.92; // trailing edge of the disc on the centreline
const TAIL_LENGTH = 2.15;

// --- Flight tuning ----------------------------------------------------------
// Metres and radians in the authoring frame. Mantas beat roughly a third of a
// hertz; anything faster reads as a stingray in a hurry.
export const MANTA_SWIM = Object.freeze({
  flapAmp: 0.62, // vertical travel at the wingtip
  spanWave: 1.25, // radians of phase from centreline to tip
  chordLag: 0.85, // radians the trailing edge lags the leading edge
  spanPull: 0.16, // tip draws inboard at the extremes of the stroke
  bodyPitch: 0.055, // nose lifts as the wings drive down
  tailAmp: 0.11,
  cephFurl: 0.45,
  hoverRate: 1.9,
  burstRate: 4.2,
});

export const MANTA_VARIANTS = Object.freeze({
  // The common dark morph, and the rarer all-black one that turns up in the
  // eastern Pacific.
  chevron: {
    back: '#141f28',
    backMid: '#24384a',
    shoulder: '#c4d0d1',
    tipTop: '#101a21',
    belly: '#e7eae1',
    bellyShade: '#c2cac4',
    bellyEdge: '#93a0a2',
    spot: '#3d474e',
    gill: '#262e35',
    mouth: '#10161b',
    eye: '#0d1116',
  },
  melanistic: {
    back: '#14181c',
    backMid: '#1e252b',
    shoulder: '#2b343a',
    tipTop: '#0b0e11',
    belly: '#2a3138',
    bellyShade: '#20262b',
    bellyEdge: '#171c20',
    spot: '#c9cfc9',
    gill: '#0e1216',
    mouth: '#080b0e',
    eye: '#0a0d10',
  },
});

export function pickMantaVariant(actorId) {
  return seededUnit(actorId, 13) < 0.17 ? 'melanistic' : 'chevron';
}

function palette(variantKey) {
  return MANTA_VARIANTS[variantKey] || MANTA_VARIANTS.chevron;
}

// --- Disc plan --------------------------------------------------------------
// u is |x| / halfSpan. `lead`/`trail` are the chord limits in z, `thick` the
// half-thickness at the section's fattest point. The centreline sits *behind*
// the shoulders: that notch is the mouth, with the cephalic lobes projecting
// forward on either side of it.
const WING_STATIONS = [
  { u: 0.00, lead: -0.74, trail: 0.92, thick: 0.128 },
  { u: 0.12, lead: -0.88, trail: 0.95, thick: 0.122 },
  { u: 0.26, lead: -0.86, trail: 0.90, thick: 0.104 },
  { u: 0.42, lead: -0.70, trail: 0.80, thick: 0.078 },
  { u: 0.58, lead: -0.46, trail: 0.66, thick: 0.064 },
  { u: 0.72, lead: -0.20, trail: 0.52, thick: 0.040 },
  { u: 0.86, lead: -0.02, trail: 0.42, thick: 0.023 },
  { u: 0.95, lead: 0.14, trail: 0.34, thick: 0.016 },
  { u: 1.00, lead: 0.26, trail: 0.30, thick: 0.010 },
];

function station(u) {
  for (let i = 0; i < WING_STATIONS.length - 1; i += 1) {
    const a = WING_STATIONS[i];
    const b = WING_STATIONS[i + 1];
    if (u <= b.u) {
      const f = (u - a.u) / Math.max(1e-6, b.u - a.u);
      return {
        lead: a.lead + (b.lead - a.lead) * f,
        trail: a.trail + (b.trail - a.trail) * f,
        thick: a.thick + (b.thick - a.thick) * f,
      };
    }
  }
  return WING_STATIONS[WING_STATIONS.length - 1];
}

// Airfoil-ish thickness distribution, fattest around a third of the chord.
// The floor matters: a wing that tapers to literally zero gets noisy normals
// and reads as a torn sheet of foil along the trailing edge.
function chordProfile(c) {
  const airfoil = (Math.pow(Math.max(c, 0), 0.45) * Math.pow(Math.max(1 - c, 0), 0.75)) / 0.352;
  return Math.max(airfoil, 0.16);
}

// Mid-surface. The tips carry a gentle upward dihedral and the trailing edge
// falls away, which is what a gliding manta holds at rest.
function midSurface(u, c) {
  return 0.155 * Math.pow(u, 2.6) - 0.055 * c * Math.pow(u, 1.4);
}

function discGeometry() {
  const steps = 41;
  const radial = 26;
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const wave = [];
  const span = [];
  const indices = [];
  for (let r = 0; r < steps; r += 1) {
    const t = r / (steps - 1);
    const s = t * 2 - 1;
    const u = Math.abs(s);
    const st = station(u);
    for (let col = 0; col < cols; col += 1) {
      const a = (col / radial) * Math.PI * 2;
      const c = (1 - Math.cos(a)) * 0.5;
      const z = st.lead + (st.trail - st.lead) * c;
      const half = st.thick * chordProfile(c);
      // The back is more domed than the belly, and only over the body — the
      // outer wing is a symmetric blade.
      const dome = 1 + 0.38 * Math.pow(Math.max(0, 1 - u / 0.48), 1.5);
      const up = Math.sin(a) >= 0;
      const y = midSurface(u, c) + (up ? half * dome : -half * 0.82);
      positions.push(s * HALF_SPAN, y, z);
      uvs.push(c, t);
      wave.push(u);
      span.push(c);
    }
  }
  for (let r = 0; r < steps - 1; r += 1) {
    for (let col = 0; col < radial; col += 1) {
      const a = r * cols + col;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(wave, 1));
  geometry.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(
    new Float32Array(positions.length / 3).fill(PART_DISC), 1,
  ));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Cephalic lobes ---------------------------------------------------------
// The two forward-projecting paddles that funnel plankton into the mouth. They
// are what makes a manta unmistakable from the front, so they are modelled
// rather than painted.

function cephalicGeometry() {
  const parts = [];
  for (const side of [-1, 1]) {
    const steps = 12;
    const radial = 12;
    const cols = radial + 1;
    const positions = [];
    const uvs = [];
    const wave = [];
    const span = [];
    const indices = [];
    for (let r = 0; r < steps; r += 1) {
      const u = r / (steps - 1);
      const z = -0.80 - u * 0.30;
      // Tapers and rolls inboard toward the tip.
      const width = 0.098 * (1 - Math.pow(u, 1.9) * 0.72);
      const thick = 0.062 * (1 - u * 0.6);
      const cx = side * (0.235 - u * 0.055);
      const cy = -0.02 - u * 0.05;
      for (let col = 0; col < cols; col += 1) {
        const a = (col / radial) * Math.PI * 2;
        positions.push(
          cx + Math.sin(a) * width,
          cy - Math.cos(a) * thick,
          z,
        );
        uvs.push(col / radial, u);
        wave.push(0);
        span.push(u);
      }
    }
    for (let r = 0; r < steps - 1; r += 1) {
      for (let col = 0; col < radial; col += 1) {
        const a = r * cols + col;
        indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(wave, 1));
    geometry.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
    geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(
      new Float32Array(positions.length / 3).fill(PART_CEPHALIC), 1,
    ));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  return mergeGeometries(parts, false);
}

// --- Tail -------------------------------------------------------------------

function tailGeometry() {
  const steps = 16;
  const radial = 8;
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const wave = [];
  const span = [];
  const indices = [];
  for (let r = 0; r < steps; r += 1) {
    const u = r / (steps - 1);
    const z = DISC_BACK - 0.10 + u * TAIL_LENGTH;
    const radius = 0.055 * Math.pow(1 - u, 1.4) + 0.006;
    const droop = -0.10 * Math.pow(u, 1.8);
    for (let col = 0; col < cols; col += 1) {
      const a = (col / radial) * Math.PI * 2;
      positions.push(Math.sin(a) * radius, droop - Math.cos(a) * radius, z);
      uvs.push(col / radial, u);
      wave.push(0);
      span.push(u);
    }
  }
  for (let r = 0; r < steps - 1; r += 1) {
    for (let col = 0; col < radial; col += 1) {
      const a = r * cols + col;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(wave, 1));
  geometry.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(
    new Float32Array(positions.length / 3).fill(PART_TAIL), 1,
  ));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Dorsal fin and eyes ----------------------------------------------------

function fittingsGeometry() {
  const parts = [];
  const steps = 8;
  const radial = 10;
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < steps; r += 1) {
    const u = r / (steps - 1);
    const y = 0.13 + u * 0.17;
    const z0 = 0.60 + u * 0.14;
    const z1 = 0.86 - u * 0.06;
    for (let col = 0; col < cols; col += 1) {
      const a = (col / radial) * Math.PI * 2;
      const c = (1 - Math.cos(a)) * 0.5;
      const half = 0.024 * (1 - u * 0.7) * Math.pow(Math.sin(Math.PI * c), 0.6);
      const sign = Math.sin(a) >= 0 ? 1 : -1;
      positions.push(half * sign, y, z0 + (z1 - z0) * c);
      uvs.push(c, u);
    }
  }
  for (let r = 0; r < steps - 1; r += 1) {
    for (let col = 0; col < radial; col += 1) {
      const a = r * cols + col;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  dorsal.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  dorsal.setIndex(indices);
  dorsal.computeVertexNormals();
  parts.push(dorsal);

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.058, 12, 10);
    eye.applyMatrix4(new THREE.Matrix4().makeTranslation(side * 0.335, -0.012, -0.615));
    parts.push(eye);
  }
  const geometry = mergeGeometries(parts, false);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0.16), 1));
  geometry.setAttribute('aSpan', new THREE.Float32BufferAttribute(new Float32Array(count).fill(0.5), 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(count).fill(PART_DISC), 1));
  return geometry;
}

// --- Painting ---------------------------------------------------------------

const _c = new THREE.Color();
const _mix = new THREE.Color();

function paint(geometry, fn) {
  const position = geometry.getAttribute('position');
  const count = position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    fn(_c, position.getX(i), position.getY(i), position.getZ(i), i);
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function hash2(x, z) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Ventral spotting: every manta carries a unique pattern between the gills,
// which is how researchers tell individuals apart. Seeded per animal.
function bellySpots(x, z, seed) {
  let value = 0;
  for (let i = 0; i < 26; i += 1) {
    const sx = (hash2(i + seed * 7.3, 1.7) - 0.5) * 1.15;
    const sz = -0.42 + hash2(i * 1.7 + seed * 3.1, 5.3) * 1.15;
    const r = 0.045 + hash2(i * 2.9 + seed, 9.1) * 0.075;
    const d = Math.hypot(x - sx, (z - sz) * 1.25) / r;
    value = Math.max(value, 1 - THREE.MathUtils.smoothstep(d, 0.55, 1));
  }
  return value;
}

function paintDisc(geometry, p, seed) {
  return paint(geometry, (out, x, y, z) => {
    const u = Math.abs(x) / HALF_SPAN;
    const st = station(u);
    const c = THREE.MathUtils.clamp((z - st.lead) / Math.max(0.02, st.trail - st.lead), 0, 1);
    const top = y > midSurface(u, c);
    if (top) {
      out.set(p.back).lerp(_mix.set(p.backMid), THREE.MathUtils.smoothstep(u, 0.08, 0.5) * 0.55);
      // The pale shoulder chevron: a broad V opening forward, behind the head.
      // It is the one mark that tells a manta from a shadow at distance.
      const arm = Math.abs(Math.abs(x) * 0.78 - (z + 0.56) * 1.3);
      const chevron = (1 - THREE.MathUtils.smoothstep(arm, 0.18, 0.52))
        * THREE.MathUtils.smoothstep(u, 0.03, 0.14)
        * (1 - THREE.MathUtils.smoothstep(u, 0.46, 0.72));
      out.lerp(_mix.set(p.shoulder), chevron);
      // A hair of light along the leading edge separates wing from water.
      out.lerp(_mix.set(p.backMid), (1 - THREE.MathUtils.smoothstep(c, 0.0, 0.09)) * 0.45);
      out.lerp(_mix.set(p.tipTop), THREE.MathUtils.smoothstep(u, 0.78, 1) * 0.55);
    } else {
      out.set(p.belly);
      out.lerp(_mix.set(p.spot), bellySpots(x, z, seed) * 0.82);
      // Gill slits: five dark bars either side of the midline.
      const bar = Math.abs(x) > 0.10 && Math.abs(x) < 0.46
        ? 1 - THREE.MathUtils.smoothstep(
          Math.abs(((z + 0.30) / 0.145) - Math.round((z + 0.30) / 0.145)),
          0.14,
          0.30,
        )
        : 0;
      const gillBand = THREE.MathUtils.smoothstep(z, -0.42, -0.34)
        * (1 - THREE.MathUtils.smoothstep(z, 0.18, 0.28));
      out.lerp(_mix.set(p.gill), bar * gillBand * 0.85);
      out.lerp(_mix.set(p.bellyShade), THREE.MathUtils.smoothstep(u, 0.3, 0.78) * 0.7);
      out.lerp(_mix.set(p.bellyEdge), THREE.MathUtils.smoothstep(u, 0.8, 1) * 0.8);
    }
    // Mouth: the wide terminal slot in the notch between the lobes.
    const mouth = (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.16, 0.30))
      * (1 - THREE.MathUtils.smoothstep(Math.abs(z + 0.755), 0.02, 0.075));
    out.lerp(_mix.set(p.mouth), mouth * 0.92);
  });
}

// --- Assembly ---------------------------------------------------------------

const geometryCache = new Map();

function buildMantaGeometry(variantKey) {
  const p = palette(variantKey);
  const seed = variantKey === 'melanistic' ? 4.7 : 1.3;
  const disc = paintDisc(discGeometry(), p, seed);
  const cephalic = paint(cephalicGeometry(), (out, x, y) => {
    out.set(p.back).lerp(_mix.set(p.belly), THREE.MathUtils.clamp(-y * 9 - 0.2, 0, 1) * 0.75);
  });
  const tail = paint(tailGeometry(), out => out.set(p.tipTop));
  const fittings = paint(fittingsGeometry(), (out, x, y, z) => {
    if (z < -0.4) out.set(p.eye);
    else out.set(p.back).lerp(_mix.set(p.tipTop), 0.4);
  });
  const parts = [disc, cephalic, tail, fittings];
  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function getMantaGeometry(variantKey = 'chevron') {
  let geometry = geometryCache.get(variantKey);
  if (!geometry) {
    geometry = buildMantaGeometry(variantKey);
    geometryCache.set(variantKey, geometry);
  }
  return geometry;
}

// --- Flight shader ----------------------------------------------------------

function n(value) {
  return Number(value).toFixed(5);
}

const MANTA_CACHE_KEY = 'manta-flight-v1';

function flightCommon() {
  return `
    attribute float aWave;
    attribute float aSpan;
    attribute float aPart;
    attribute float aPhase;
    attribute float aEnergy;
    attribute float aDead;
    attribute vec3 aTint;
    varying vec3 vMantaTint;
  `;
}

function flightVertex(cfg) {
  return `
  vec3 mantaPos = position;
  float mantaLive = 1.0 - aDead;
  float mantaDrive = (0.45 + 0.55 * aEnergy) * mantaLive;
  float mantaSide = sign(position.x);
  // Trailing edge lags the leading edge; this chordwise skew is what turns a
  // flapping plate into a rippling wing.
  float mantaWavePhase = aPhase - aWave * ${n(cfg.spanWave)} - aSpan * ${n(cfg.chordLag)};
  if (aPart < 0.5) {
    float amp = ${n(cfg.flapAmp)} * pow(aWave, 2.05) * mantaDrive;
    mantaPos.y += amp * sin(mantaWavePhase);
    // The tip travels along an arc, not a vertical line: draw it inboard at
    // both extremes of the stroke so the wing never looks stretched.
    mantaPos.x -= mantaSide * ${n(cfg.spanPull)} * pow(aWave, 2.6) * mantaDrive
      * (1.0 - cos(2.0 * mantaWavePhase)) * 0.5;
  } else if (aPart < 1.5) {
    // Cephalic lobes furl and unfurl on their own slow cycle.
    float furl = ${n(cfg.cephFurl)} * (0.5 + 0.5 * sin(aPhase * 0.37)) * mantaDrive;
    float lever = aSpan * aSpan;
    mantaPos.y -= furl * 0.16 * lever;
    mantaPos.x -= mantaSide * furl * 0.09 * lever;
  } else {
    mantaPos.y += ${n(cfg.tailAmp)} * aSpan * mantaDrive * sin(aPhase - 1.15);
    mantaPos.x += ${n(cfg.tailAmp)} * 0.45 * aSpan * mantaDrive * sin(aPhase * 0.71 + 0.4);
  }
  // Whole-body pitch: the nose lifts as the wings drive down.
  mantaPos.y += ${n(cfg.bodyPitch)} * clamp(-position.z, -1.1, 1.1)
    * mantaDrive * sin(aPhase + 0.95);
  `;
}

// Only the pitch and flap displace vertices; both are shallow enough that
// recomputed normals would cost more than the shading error is worth.
function applyFlightShader(material, cfg) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${flightCommon()}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n${flightVertex(cfg)}\n  vMantaTint = aTint;`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = mantaPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMantaTint;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= vMantaTint;',
      );
  };
  material.customProgramCacheKey = () => MANTA_CACHE_KEY;
  return material;
}

let mantaMaterial;
export function getMantaMaterial() {
  if (mantaMaterial) return mantaMaterial;
  mantaMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: '#ffffff',
    // Manta skin is smooth and wet: a broad soft highlight, no grain.
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.65,
    side: THREE.DoubleSide, // wingtips thin to nothing
  });
  applyFlightShader(mantaMaterial, MANTA_SWIM);
  return mantaMaterial;
}

export function createMantaMesh({ variant = 'chevron', count = 1 } = {}) {
  return createInstancedCreature({
    geometry: getMantaGeometry(variant),
    material: getMantaMaterial(),
    count,
    seed: `manta:${variant}`,
    hoverRate: MANTA_SWIM.hoverRate,
    burstRate: MANTA_SWIM.burstRate,
  });
}
