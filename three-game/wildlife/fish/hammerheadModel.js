// Scalloped hammerhead (Sphyrna lewini): lofted body, a modelled cephalofoil,
// and a thunniform swim rig on the same instanced plumbing as the parrotfish.
//
// Authoring frame matches the other fish: head at -z, centreline at y=0, and
// here about 2.6 m from snout to the tip of the upper caudal lobe — a young
// adult, the size that actually schools over a drop-off.
//
// Two things carry the identification and everything else is supporting cast:
//
//   the cephalofoil   a flattened wing, eyes on the outer tips, and the front
//                     margin scalloped — a broad central notch with a pair of
//                     lateral ones. That scalloping is the whole species name.
//   the first dorsal  very tall and falcate, set well forward. A hammerhead
//                     read at distance is a hammer and a sail, nothing else.
//
// The swim wave is the opposite shape to the parrotfish's: a shark is stiff
// through the front two thirds and does its work in the peduncle and tail, so
// the wave mask starts late and the tail sweep is large.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createInstancedCreature, seededUnit } from './instancedCreature';
import {
  bladeGeometry,
  lerpStations,
  mixColor,
  paint,
  placement,
  ramp,
  superFactor,
  tubeLoft,
} from './loftKit';

export { seededUnit };

// --- Part ids (aPart attribute) --------------------------------------------
const PART_BODY = 0; // trunk, head, cephalofoil: travelling wave only
const PART_RIGID = 1; // pectorals and pelvics: held out as wings, no flutter
const PART_CAUDAL = 2; // the tail, with its own delayed sweep
const PART_MEDIAN = 3; // dorsals and anal: body wave plus a little flex

export const HAMMERHEAD_SWIM = Object.freeze({
  // Metres in the authoring frame. A 2.6 m shark swinging its tail 12 cm each
  // way is already a strong cruise; more reads as a panicking eel.
  bodyAmp: 0.052,
  tailAmp: 0.115,
  headAmp: 0.011, // the cephalofoil yaws slightly against the body
  finFlex: 0.009,
  waveK: 2.05, // radians of phase from the wave's start to the tail root
  rollAmp: 0.055, // the whole animal rocks a few degrees on the beat
  hoverRate: 1.55,
  burstRate: 5.2,
});

const PALETTE = Object.freeze({
  // Counter-shading is the whole read at depth: a dark bronze-grey back over
  // an almost white belly, with the boundary high on the flank and abrupt.
  dorsal: '#414a48',
  upperFlank: '#5a6560',
  flank: '#7e8a80',
  lowerFlank: '#c9ccbd',
  belly: '#f2efe4',
  headTop: '#3a4342',
  foilEdge: '#4d5754',
  foilUnder: '#eae7da',
  eye: '#15181a',
  eyeRing: '#c9c2ae',
  gill: '#48524e',
  finDusk: '#3f4744', // pectoral undersides tip out almost black
  finEdge: '#6d7671',
});

// --- Body -------------------------------------------------------------------
// Fusiform and near-circular in section, widest just behind the pectorals,
// drawn down to a slender keeled peduncle. hw/hh stay close together: a shark
// is a torpedo, not the parrotfish's slab.
const BODY_STATIONS = [
  { t: 0.00, z: -1.150, hw: 0.066, hh: 0.034, yc: 0.000 }, // behind the foil
  { t: 0.06, z: -1.055, hw: 0.078, hh: 0.060, yc: -0.002 },
  { t: 0.14, z: -0.930, hw: 0.094, hh: 0.084, yc: -0.004 },
  { t: 0.26, z: -0.740, hw: 0.106, hh: 0.102, yc: -0.006 },
  { t: 0.38, z: -0.545, hw: 0.108, hh: 0.108, yc: -0.006 },
  { t: 0.52, z: -0.320, hw: 0.100, hh: 0.102, yc: -0.004 },
  { t: 0.66, z: -0.090, hw: 0.082, hh: 0.086, yc: -0.001 },
  { t: 0.78, z: 0.110, hw: 0.062, hh: 0.070, yc: 0.002 },
  // The peduncle is genuinely thin — the tail looks powerful because the stalk
  // it comes off is not.
  { t: 0.88, z: 0.290, hw: 0.036, hh: 0.043, yc: 0.006 },
  { t: 0.95, z: 0.420, hw: 0.022, hh: 0.027, yc: 0.010 },
  { t: 1.00, z: 0.510, hw: 0.017, hh: 0.021, yc: 0.014 },
];

const BODY_FRONT_Z = -1.150;
const BODY_BACK_Z = 0.510;
const TAIL_ROOT_Z = 0.510;
// The wave only starts behind the pectorals — everything forward of this is
// held rigid, which is what makes the animal read as a shark and not an eel.
const WAVE_START_Z = -0.560;
const BODY_SUPER_N = 2.15;

function bodyT(z) {
  return THREE.MathUtils.clamp((z - BODY_FRONT_Z) / (BODY_BACK_Z - BODY_FRONT_Z), 0, 1);
}

function bodyGeometry() {
  return tubeLoft({
    steps: 30,
    radial: 16,
    section: (u, a) => {
      const s = lerpStations(BODY_STATIONS, u);
      const sa = Math.sin(a);
      const ca = -Math.cos(a);
      const f = superFactor(sa, ca, BODY_SUPER_N);
      let y = ca * s.hh * f;
      // Flatter beneath: sharks are keeled below and rounded above.
      if (y < 0) y *= 0.9;
      // Lateral keels on the peduncle — a hard edge that catches the light
      // where the body narrows into the tail.
      const keel = THREE.MathUtils.smoothstep(u, 0.86, 1) * 0.012 * (1 - Math.abs(ca));
      return [sa * (s.hw * f + keel), y + s.yc, s.z];
    },
    uv: (u, around) => [around * 2, 0.03 + u * 0.68],
  });
}

// --- Cephalofoil ------------------------------------------------------------
// A flattened wing spanning about a quarter of the body length, swept slightly
// back, with the scalloped leading edge. Built as its own loft so the notches
// live in the geometry rather than in a texture.

// Half-span, tip to centreline. Real S. lewini heads run about a quarter of
// total length across; wider than that and it reads as a winghead shark.
const FOIL_SPAN = 0.300;
const FOIL_Z = -1.150; // where it meets the trunk

// Leading-edge profile across the half-span. The median indentation sits at
// x=0 and the lateral ones about two thirds out; between them the margin
// bulges forward. Returns how far forward of FOIL_Z the front edge reaches.
function foilLeadingEdge(across) {
  // The margin runs nearly straight across, falling away only near the tips.
  // Let it taper like a swept wing and the head stops reading as a hammer and
  // starts reading as a delta — which is exactly what the first pass did.
  const base = 0.108 - Math.pow(across, 3) * 0.030;
  const medianNotch = 0.026 * Math.exp(-Math.pow(across / 0.15, 2));
  const lateralNotch = 0.016 * Math.exp(-Math.pow((across - 0.60) / 0.12, 2));
  return base - medianNotch - lateralNotch;
}

function foilGeometry() {
  // One wing, mirrored. u runs centreline (0) to tip (1).
  const wing = side => tubeLoft({
    steps: 22,
    radial: 14,
    section: (u, a) => {
      const across = u;
      const x = side * FOIL_SPAN * across;
      const front = FOIL_Z - foilLeadingEdge(across);
      // Trailing edge rakes aft only slightly, so the tips keep real chord.
      const back = FOIL_Z + 0.056 + across * across * 0.014;
      const v = (1 - Math.cos(a)) * 0.5;
      const z = front + (back - front) * v;
      // Thin plate, thickest along the mid-chord, thinning toward the tip.
      const thickness = (0.030 - across * 0.011) * Math.pow(Math.sin(Math.PI * v), 0.55);
      const sign = Math.sin(a) >= 0 ? 1 : -1;
      // Slight downward droop at the tips, as on a live animal.
      const droop = -0.030 * Math.pow(across, 2.4);
      return [x, droop + thickness * sign, z];
    },
    uv: (u, around) => [0.15 + around * 0.7, 0.9 + u * 0.06],
  });
  return mergeGeometries([wing(1), wing(-1)], false);
}

// Eyes ride on the outer tips of the foil, looking out sideways.
function eyeGeometry() {
  const parts = [];
  for (const side of [-1, 1]) {
    const ball = new THREE.SphereGeometry(0.030, 14, 10);
    ball.applyMatrix4(placement({
      position: [side * (FOIL_SPAN - 0.012), -0.028, FOIL_Z - 0.024],
      scale: [0.8, 1, 1],
    }));
    paint(ball, (out, x) => {
      out.set(PALETTE.eye);
      // Pale rim where the eye meets the foil, so it does not read as a hole.
      const inward = 1 - THREE.MathUtils.clamp(
        (Math.abs(x) - (FOIL_SPAN - 0.048)) / 0.048,
        0,
        1,
      );
      out.lerp(mixColor.set(PALETTE.eyeRing), inward * 0.5);
    });
    parts.push(ball);
  }
  return mergeGeometries(parts, false);
}

// --- Painting ---------------------------------------------------------------

function paintBody(geometry) {
  const flankStops = [
    [0.00, PALETTE.belly],
    [0.30, PALETTE.lowerFlank],
    // The counter-shading line is abrupt: two stops close together, not a
    // gradient across the whole flank.
    [0.46, PALETTE.flank],
    [0.62, PALETTE.upperFlank],
    [1.00, PALETTE.dorsal],
  ];
  return paint(geometry, (out, x, y, z) => {
    const s = lerpStations(BODY_STATIONS, bodyT(z));
    const vertical = THREE.MathUtils.clamp(0.5 + (y - s.yc) / Math.max(0.001, s.hh * 2), 0, 1);
    ramp(out, flankStops, vertical);
    // Five gill slits ahead of the pectorals, painted as darker creases.
    for (let i = 0; i < 5; i += 1) {
      const slitZ = -0.985 + i * 0.058;
      const slit = 1 - THREE.MathUtils.smoothstep(Math.abs(z - slitZ) / 0.010, 0.25, 1);
      const height = 1 - THREE.MathUtils.smoothstep(Math.abs(vertical - 0.42) / 0.26, 0.4, 1);
      out.lerp(mixColor.set(PALETTE.gill), slit * height * 0.55);
    }
    // Peduncle darkens into the tail.
    out.lerp(mixColor.set(PALETTE.headTop), THREE.MathUtils.smoothstep(z, 0.36, 0.51) * 0.3);
  });
}

function paintFoil(geometry) {
  return paint(geometry, (out, x, y, z) => {
    // Same counter-shading as the body, but the wing is thin so the boundary
    // is nearly a hard line at its edge.
    const up = THREE.MathUtils.clamp(0.5 + y / 0.05, 0, 1);
    out.copy(mixColor.set(PALETTE.foilUnder)).lerp(new THREE.Color(PALETTE.headTop), up);
    // The leading edge takes the light: a pale worn margin along the front.
    const across = Math.abs(x) / FOIL_SPAN;
    const front = FOIL_Z - foilLeadingEdge(across);
    const edge = 1 - THREE.MathUtils.smoothstep((z - front) / 0.026, 0, 1);
    out.lerp(mixColor.set(PALETTE.foilEdge), edge * 0.4);
  });
}

// --- Fins -------------------------------------------------------------------

// bladeGeometry authors a fin along +x with its chord in z, so a vertical fin
// is a quarter turn about z. Getting this wrong points the dorsal out sideways
// like a second pair of pectorals, which is exactly what it looks like.
const UPRIGHT = Math.PI / 2;

function buildFins() {
  const parts = [];

  // First dorsal: tall, falcate, set forward over the pectorals. The rear
  // margin is concave, which is what makes it a sickle and not a triangle.
  const dorsal1 = bladeGeometry({
    steps: 14,
    radial: 12,
    span: 0.335,
    chordAt: u => {
      const lead = -0.560 + u * 0.300;
      const trail = -0.180 + u * 0.108 - Math.pow(u, 1.5) * 0.052;
      return [lead, Math.max(lead + 0.018, trail)];
    },
    thickness: u => 0.017 * (1 - u * 0.62),
    // Leans a touch to one side at the tip, like a real fin under load.
    camber: u => u * u * 0.012,
    matrix: placement({ position: [0, 0.116, 0], rotation: [0, 0, UPRIGHT] }),
  });
  parts.push(dorsal1);

  // Second dorsal: small, low, well aft, with a long trailing filament.
  const dorsal2 = bladeGeometry({
    steps: 8,
    radial: 10,
    span: 0.072,
    chordAt: u => [0.205 + u * 0.030, 0.318 + u * 0.096],
    thickness: u => 0.008 * (1 - u * 0.5),
    matrix: placement({ position: [0, 0.052, 0], rotation: [0, 0, UPRIGHT] }),
  });
  parts.push(dorsal2);

  // Anal fin, mirroring the second dorsal below.
  const anal = bladeGeometry({
    steps: 8,
    radial: 10,
    span: 0.062,
    chordAt: u => [0.225 + u * 0.028, 0.330 + u * 0.082],
    thickness: u => 0.007 * (1 - u * 0.5),
    matrix: placement({ position: [0, -0.050, 0], rotation: [0, 0, -UPRIGHT] }),
  });
  parts.push(anal);

  return parts;
}

function buildRigidFins() {
  const parts = [];
  // Pectorals: long, narrow, swept back and held out as wings. A hammerhead
  // does not row with these — they are the trim surface for a body that has a
  // wing on the front of it.
  for (const side of [-1, 1]) {
    const blade = bladeGeometry({
      steps: 12,
      radial: 12,
      span: 0.330,
      chordAt: u => {
        const lead = -0.720 + u * 0.330;
        const trail = -0.500 + u * 0.284 - Math.pow(u, 1.6) * 0.058;
        return [lead, Math.max(lead + 0.014, trail)];
      },
      thickness: u => 0.016 * (1 - u * 0.66),
      camber: u => -0.030 * u * u,
      matrix: placement({
        // Angled down about 15 degrees. Held level they read as aeroplane
        // wings; a shark carries them as depressors.
        position: [side * 0.086, -0.062, 0],
        rotation: [0, 0, side * -0.26],
        scale: [side, 1, 1],
      }),
    });
    parts.push(blade);
  }
  // Pelvics: small, low, level with the first dorsal's trailing edge.
  for (const side of [-1, 1]) {
    const blade = bladeGeometry({
      steps: 8,
      radial: 10,
      span: 0.098,
      chordAt: u => [0.020 + u * 0.040, 0.116 + u * 0.026],
      thickness: u => 0.008 * (1 - u * 0.5),
      matrix: placement({
        // Out and well down, the way a shark's pelvics hang below the belly.
        position: [side * 0.040, -0.062, 0],
        rotation: [0, 0, side * -0.95],
        scale: [side, 1, 1],
      }),
    });
    parts.push(blade);
  }
  return parts;
}

// Heterocercal tail: a long upper lobe carrying the spine, with a subterminal
// notch near its tip, and a short lower lobe. Built as two blades so the fork
// is real geometry rather than a lofted funnel.
function buildCaudal() {
  const upper = bladeGeometry({
    steps: 16,
    radial: 12,
    span: 0.610,
    chordAt: u => {
      // Sweeps hard aft as it climbs; the trailing edge carries the notch.
      const lead = 0.510 + u * 0.300;
      const notch = 0.052 * Math.exp(-Math.pow((u - 0.80) / 0.11, 2));
      const trail = 0.760 + u * 0.230 - Math.pow(u, 2.6) * 0.150 - notch;
      return [lead, Math.max(lead + 0.012, trail)];
    },
    thickness: u => 0.019 * (1 - u * 0.7),
    matrix: placement({
      position: [0, 0.014, 0],
      // Upright, then raked back about 25 degrees — a shark's upper lobe
      // leans aft rather than standing square like a tuna's.
      rotation: [0, 0, UPRIGHT - 0.44],
    }),
  });
  const lower = bladeGeometry({
    steps: 10,
    radial: 10,
    span: 0.200,
    chordAt: u => {
      const lead = 0.510 + u * 0.048;
      const trail = 0.652 + u * 0.020 - Math.pow(u, 1.8) * 0.078;
      return [lead, Math.max(lead + 0.010, trail)];
    },
    thickness: u => 0.013 * (1 - u * 0.6),
    matrix: placement({
      position: [0, 0.014, 0],
      rotation: [0, 0, -UPRIGHT + 0.22],
    }),
  });
  return [upper, lower];
}

function paintFin(geometry, { duskAt = 0.6 } = {}) {
  return paint(geometry, (out, x, y, z) => {
    const up = THREE.MathUtils.clamp(0.5 + y / 0.09, 0, 1);
    out.copy(mixColor.set(PALETTE.foilUnder)).lerp(new THREE.Color(PALETTE.upperFlank), up);
    // Every hammerhead fin darkens toward its tip; on the pectorals the
    // underside tip is nearly black and it is a field mark.
    const reach = THREE.MathUtils.clamp(Math.hypot(x, y) / duskAt, 0, 1);
    out.lerp(mixColor.set(PALETTE.finDusk), Math.pow(reach, 1.8) * 0.75);
    out.lerp(mixColor.set(PALETTE.finEdge), THREE.MathUtils.smoothstep(reach, 0.9, 1) * 0.2);
  });
}

// --- Attribute decoration ---------------------------------------------------
// aWave: how much of the travelling wave a vertex sees. aSpan doubles as the
// head-yaw mask on the body and root-to-tip span on the fins.

function decorate(geometry, part, spanFor) {
  const position = geometry.getAttribute('position');
  const count = position.count;
  const wave = new Float32Array(count);
  const span = new Float32Array(count);
  const parts = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    parts[i] = part;
    wave[i] = part === PART_CAUDAL
      ? 1
      : THREE.MathUtils.clamp((z - WAVE_START_Z) / (TAIL_ROOT_Z - WAVE_START_Z), 0, 1);
    span[i] = spanFor(x, y, z);
  }
  geometry.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
  geometry.setAttribute('aSpan', new THREE.BufferAttribute(span, 1));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(parts, 1));
  return geometry;
}

// 1 out at the cephalofoil tips, 0 by the pectorals: the hammer swings a
// little against the trunk, which is most of what sells the head as a wing
// being steered rather than a shape stuck on the front.
function headMask(z) {
  return THREE.MathUtils.clamp((BODY_FRONT_Z + 0.10 - z) / 0.24, 0, 1);
}

// --- Assembly ---------------------------------------------------------------

let cachedGeometry = null;

function buildHammerheadGeometry() {
  const body = decorate(paintBody(bodyGeometry()), PART_BODY, (x, y, z) => headMask(z));
  const foil = decorate(paintFoil(foilGeometry()), PART_BODY, (x, y, z) => headMask(z));
  const eyes = decorate(paint(eyeGeometry(), () => {}), PART_BODY, (x, y, z) => headMask(z));
  const median = decorate(
    mergeGeometries(buildFins().map(fin => paintFin(fin, { duskAt: 0.42 })), false),
    PART_MEDIAN,
    (x, y) => THREE.MathUtils.clamp(Math.abs(y) / 0.34, 0, 1),
  );
  const rigid = decorate(
    mergeGeometries(buildRigidFins().map(fin => paintFin(fin, { duskAt: 0.44 })), false),
    PART_RIGID,
    (x, y) => THREE.MathUtils.clamp(Math.hypot(x, y) / 0.44, 0, 1),
  );
  const caudal = decorate(
    mergeGeometries(buildCaudal().map(fin => paintFin(fin, { duskAt: 0.62 })), false),
    PART_CAUDAL,
    (x, y, z) => THREE.MathUtils.clamp((z - TAIL_ROOT_Z) / 0.62, 0, 1),
  );

  const parts = [body, foil, eyes, median, rigid, caudal];
  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function getHammerheadGeometry() {
  if (!cachedGeometry) cachedGeometry = buildHammerheadGeometry();
  return cachedGeometry;
}

// --- Skin texture -----------------------------------------------------------
// Placoid denticles read as a fine directional grain, not as scales. One
// shared 256px map, near-white so it only modulates the vertex colours.

let skinTexture;
function getSkinTexture() {
  if (skinTexture !== undefined) return skinTexture;
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Short aft-raked strokes in offset rows.
  ctx.lineWidth = 1;
  for (let row = 0; row < 64; row += 1) {
    for (let col = 0; col < 40; col += 1) {
      const x = (col + (row % 2 ? 0.5 : 0)) * (size / 40);
      const y = row * (size / 64);
      ctx.strokeStyle = row % 3 === 0 ? 'rgba(120,128,124,0.16)' : 'rgba(150,158,152,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2.6, y + 3.2);
      ctx.stroke();
    }
  }
  // Flat strip so the fins pick up no grain, with a margin against mip bleed.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size * 0.19);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  skinTexture = texture;
  return texture;
}

// --- Swim shader ------------------------------------------------------------

function n(value) {
  return Number(value).toFixed(5);
}

const SWIM_CACHE_KEY = 'hammerhead-swim-v1';

function swimCommon() {
  return `
    attribute float aWave;
    attribute float aSpan;
    attribute float aPart;
    attribute float aPhase;
    attribute float aEnergy;
    attribute float aDead;
    attribute vec3 aTint;
    varying vec3 vSharkTint;
  `;
}

function swimVertex(cfg) {
  return `
  vec3 sharkPos = position;
  float sharkLive = 1.0 - aDead;
  float sharkDrive = 0.55 + 0.45 * aEnergy;
  float sharkWave = aWave * aWave;   // squared: nothing moves until the peduncle
  if (aPart > 0.5 && aPart < 1.5) {
    // Pectorals and pelvics ride the body's lateral shear at their root but do
    // not beat: they are wings held in trim.
    sharkPos.x += ${n(cfg.bodyAmp)} * sharkWave * sharkDrive * sharkLive
      * sin(aPhase - aWave * ${n(cfg.waveK)});
  } else if (aPart > 1.5 && aPart < 2.5) {
    sharkPos.x += (${n(cfg.bodyAmp)} * sharkWave + ${n(cfg.tailAmp)} * aSpan)
      * sharkDrive * sharkLive * sin(aPhase - ${n(cfg.waveK)} - 0.70);
  } else {
    sharkPos.x += ${n(cfg.bodyAmp)} * sharkWave * sharkDrive * sharkLive
      * sin(aPhase - aWave * ${n(cfg.waveK)});
    if (aPart < 0.5) {
      // The hammer leads the turn, swinging against the trunk.
      sharkPos.x -= ${n(cfg.headAmp)} * aSpan * sharkDrive * sharkLive * sin(aPhase + 2.1);
    } else {
      sharkPos.x += ${n(cfg.finFlex)} * aSpan * sharkLive
        * sin(aPhase * 1.4 - aWave * ${n(cfg.waveK)} + 0.6);
    }
  }
  // Whole-body roll on the beat, about the long axis.
  float sharkRoll = ${n(cfg.rollAmp)} * sharkDrive * sharkLive * sin(aPhase - 0.4);
  float sharkC = cos(sharkRoll);
  float sharkS = sin(sharkRoll);
  sharkPos.xy = vec2(sharkPos.x * sharkC - sharkPos.y * sharkS, sharkPos.x * sharkS + sharkPos.y * sharkC);
  `;
}

// The wave is a lateral shear plus a rigid roll, so the roll is the only part
// the normals need; the shear error is a fraction of a degree at these
// amplitudes.
function applySwimShader(material, cfg) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${swimCommon()}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n${swimVertex(cfg)}\n`
        + '  objectNormal.xy = vec2(objectNormal.x * sharkC - objectNormal.y * sharkS,'
        + ' objectNormal.x * sharkS + objectNormal.y * sharkC);\n'
        + '  vSharkTint = aTint;',
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = sharkPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSharkTint;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= vSharkTint;',
      );
  };
  material.customProgramCacheKey = () => SWIM_CACHE_KEY;
  return material;
}

let cachedMaterial = null;

export function getHammerheadMaterial() {
  if (cachedMaterial) return cachedMaterial;
  const map = getSkinTexture();
  const material = new THREE.MeshStandardMaterial({
    ...(map ? { map } : {}),
    vertexColors: true,
    color: '#ffffff',
    // Shark skin is matte compared with a wet reef fish — denticles scatter.
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide, // fin blades are thin enough to show backfaces
  });
  applySwimShader(material, HAMMERHEAD_SWIM);
  if (map) cachedMaterial = material;
  return material;
}

// --- Instanced mesh ---------------------------------------------------------

export function createHammerheadMesh({ count = 1, seed = 'hammerhead' } = {}) {
  return createInstancedCreature({
    geometry: getHammerheadGeometry(),
    material: getHammerheadMaterial(),
    count,
    seed,
    hoverRate: HAMMERHEAD_SWIM.hoverRate,
    burstRate: HAMMERHEAD_SWIM.burstRate,
  });
}
