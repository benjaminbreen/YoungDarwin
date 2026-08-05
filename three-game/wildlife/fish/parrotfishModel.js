// Procedural parrotfish (Scarus/Sparisoma): lofted geometry, painted vertex
// colours, a shared scale-cell map, and the vertex-shader swim rig used by
// both the single collectible specimen and the instanced reef schools.
//
// Authoring frame matches the specimen-shape convention used by the GLBs
// after their manifest flip: head at -z, body centreline at y=0, ~0.40 m from
// beak to tail tip before per-fish scaling.
//
// All motion happens in the vertex shader from one accumulated phase per
// instance, so a school of twenty fish is a single draw call and the CPU only
// writes an instance matrix plus two floats per fish per frame. Parrotfish are
// labriform swimmers — they row with the pectorals and keep the tail in
// reserve for bursts — so the rig makes the pectorals the loud part.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createInstancedCreature, seededUnit } from './instancedCreature';

export { seededUnit };

// --- Part ids (aPart attribute) --------------------------------------------
const PART_BODY = 0; // body, head, beak, eyes: travelling wave + head counter-yaw
const PART_PECTORAL = 1; // rowed about a fixed pivot
const PART_CAUDAL = 2; // body wave plus its own delayed sweep
const PART_MEDIAN = 3; // dorsal / anal / pelvic: body wave plus flutter

// --- Swim tuning ------------------------------------------------------------
// Amplitudes are metres in the authoring frame; angles are radians. Kept
// deliberately small — a cruising parrotfish barely bends, and an over-swung
// body reads as an eel.
export const PARROTFISH_SWIM = Object.freeze({
  bodyAmp: 0.013,
  headAmp: 0.0035,
  tailAmp: 0.019,
  finFlutter: 0.0035,
  waveK: 2.3, // radians of phase from head to tail
  beatRatio: 0.58, // body beats per pectoral stroke
  pectSweep: 0.62, // up/down row
  pectRake: 0.34, // fore/aft feather, a quarter cycle out of phase
  pectCup: 0.011,
  // Phase advance per second at a dead stop and at full burst. The CPU
  // integrates this so changing speed never jumps the animation.
  hoverRate: 3.1,
  burstRate: 9.4,
});

// Pectoral pivot in the authoring frame (mirrored in x by the shader).
const PECT_PIVOT = [0.0335, -0.010, -0.101];

// --- Palettes ---------------------------------------------------------------
// Terminal phase: the gaudy adult male every reef photograph is of. Initial
// phase: the drab red-brown females and juveniles that make up most of a
// school and keep the water from looking like a sweet shop.
export const PARROTFISH_VARIANTS = Object.freeze({
  terminal: {
    dorsal: '#1e746c',
    upperFlank: '#2b9384',
    flank: '#3cb49b',
    lowerFlank: '#74d3bd',
    belly: '#c8ecdf',
    headTop: '#27897a',
    cheek: '#e2896b',
    cheekStreak: '#bd4f74',
    chin: '#efc484',
    beak: '#d7cfb4',
    lip: '#cf7264',
    eyeRing: '#f0b143',
    medianFin: '#37a096',
    finMargin: '#bd7b88',
    pectoral: '#59bfb0',
    pectoralEdge: '#eec95f',
    caudal: '#2f9c8b',
    caudalMargin: '#f0c14a',
    caudalTrail: '#1b5c63',
  },
  initial: {
    dorsal: '#5e3833',
    upperFlank: '#834d43',
    flank: '#9a5e4f',
    lowerFlank: '#c39b83',
    belly: '#e6dbc9',
    headTop: '#6f423b',
    cheek: '#a06058',
    cheekStreak: '#7c3a3c',
    chin: '#d8bda3',
    beak: '#d2c9ad',
    lip: '#b07a6b',
    eyeRing: '#d4a55c',
    medianFin: '#8b564c',
    finMargin: '#b08a76',
    pectoral: '#8d564a',
    pectoralEdge: '#d9ab7f',
    caudal: '#8a5049',
    caudalMargin: '#d3aa84',
    caudalTrail: '#5a352f',
  },
});

// A typo-proof read: any malformed swatch falls back to the terminal palette
// rather than throwing deep inside the loft.
function palette(variantKey) {
  const base = PARROTFISH_VARIANTS.terminal;
  const chosen = PARROTFISH_VARIANTS[variantKey] || base;
  const out = {};
  for (const key of Object.keys(base)) {
    const value = chosen[key];
    out[key] = /^#[0-9a-f]{6}$/i.test(value || '') ? value : base[key];
  }
  return out;
}

const BLEACH = new THREE.Color('#cfc9b4');

export function pickParrotfishVariant(actorId) {
  return seededUnit(actorId, 7) < 0.42 ? 'terminal' : 'initial';
}

// --- Loft plumbing ----------------------------------------------------------
// One tube builder serves the body and every fin: `section(u, angle)` returns a
// point on the closed cross-section, so a fin is just a very flat tube. Both
// ends are capped — open lofts show sky pinholes through the end rings.

function tubeLoft({ steps, radial, section, uv, capStart = true, capEnd = true }) {
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < steps; r += 1) {
    const u = r / (steps - 1);
    for (let c = 0; c < cols; c += 1) {
      const a = (c / radial) * Math.PI * 2;
      const p = section(u, a);
      positions.push(p[0], p[1], p[2]);
      const t = uv(u, c / radial);
      uvs.push(t[0], t[1]);
    }
  }
  for (let r = 0; r < steps - 1; r += 1) {
    for (let c = 0; c < radial; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const capRing = (ringStart, uAt, flip) => {
    const centre = [0, 0, 0];
    for (let c = 0; c < radial; c += 1) {
      const i = (ringStart + c) * 3;
      centre[0] += positions[i];
      centre[1] += positions[i + 1];
      centre[2] += positions[i + 2];
    }
    centre[0] /= radial;
    centre[1] /= radial;
    centre[2] /= radial;
    const centreIndex = positions.length / 3;
    positions.push(centre[0], centre[1], centre[2]);
    const t = uv(uAt, 0.5);
    uvs.push(t[0], t[1]);
    for (let c = 0; c < radial; c += 1) {
      const a = ringStart + c;
      const b = ringStart + c + 1;
      if (flip) indices.push(centreIndex, b, a);
      else indices.push(centreIndex, a, b);
    }
  };
  if (capStart) capRing(0, 0, false);
  if (capEnd) capRing((steps - 1) * cols, 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function lerpStations(stations, t) {
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    if (t <= b.t) {
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return {
        z: a.z + (b.z - a.z) * f,
        hw: a.hw + (b.hw - a.hw) * f,
        hh: a.hh + (b.hh - a.hh) * f,
        yc: a.yc + (b.yc - a.yc) * f,
      };
    }
  }
  return stations[stations.length - 1];
}

// --- Body -------------------------------------------------------------------
// Deep and slab-sided: half-height runs to nearly twice half-width through the
// middle, which is what separates a parrotfish silhouette from a generic
// torpedo fish.
const BODY_STATIONS = [
  { t: 0.00, z: -0.166, hw: 0.009, hh: 0.013, yc: 0.004 },
  { t: 0.07, z: -0.152, hw: 0.022, hh: 0.030, yc: 0.003 },
  { t: 0.16, z: -0.130, hw: 0.032, hh: 0.047, yc: 0.001 },
  { t: 0.28, z: -0.094, hw: 0.039, hh: 0.062, yc: -0.001 },
  { t: 0.42, z: -0.048, hw: 0.040, hh: 0.068, yc: -0.002 },
  { t: 0.56, z: 0.000, hw: 0.036, hh: 0.065, yc: -0.002 },
  { t: 0.70, z: 0.050, hw: 0.027, hh: 0.047, yc: -0.001 },
  { t: 0.83, z: 0.098, hw: 0.016, hh: 0.029, yc: 0.000 },
  { t: 0.93, z: 0.134, hw: 0.010, hh: 0.020, yc: 0.000 },
  { t: 1.00, z: 0.156, hw: 0.007, hh: 0.017, yc: 0.000 },
];

const TAIL_ROOT_Z = 0.156;
const WAVE_START_Z = -0.098; // the wave only builds behind the gill cover

// Superellipse exponent: >2 fills out the flank so the section reads as a
// slab with rounded edges instead of an ellipse.
const BODY_SUPER_N = 2.5;

function superFactor(sa, ca, n) {
  if (n === 2) return 1;
  const d = Math.pow(Math.pow(Math.abs(sa), n) + Math.pow(Math.abs(ca), n), -1 / n);
  return d * Math.hypot(sa, ca);
}

function bodyGeometry() {
  return tubeLoft({
    steps: 26,
    radial: 18,
    section: (u, a) => {
      const s = lerpStations(BODY_STATIONS, u);
      const sa = Math.sin(a);
      const ca = -Math.cos(a);
      const f = superFactor(sa, ca, BODY_SUPER_N);
      // Belly slightly flatter than the back, as on a grazing reef fish.
      let y = ca * s.hh * f;
      if (y < 0) y *= 0.88;
      return [sa * s.hw * f, y + s.yc, s.z];
    },
    uv: (u, around) => [around * 2, 0.03 + u * 0.68],
  });
}

// --- Fin blades -------------------------------------------------------------
// A blade is a flat closed tube: the cross-section walks the chord out and
// back, with thickness tapering to nothing at the leading and trailing edges,
// so every fin is a solid shell rather than an alpha plane.

function bladeGeometry({
  steps = 10,
  radial = 14,
  span,
  chordAt,
  thickness,
  camber = () => 0,
  matrix,
}) {
  const geometry = tubeLoft({
    steps,
    radial,
    section: (u, a) => {
      const v = (1 - Math.cos(a)) * 0.5;
      const [z0, z1] = chordAt(u);
      const z = z0 + (z1 - z0) * v;
      const half = thickness(u) * Math.pow(Math.sin(Math.PI * v), 0.6);
      const sign = Math.sin(a) >= 0 ? 1 : -1;
      return [span * u, camber(u, v) + half * sign, z];
    },
    uv: (u, around) => [0.15 + around * 0.7, 0.88 + u * 0.08],
  });
  if (matrix) geometry.applyMatrix4(matrix);
  return geometry;
}

function placement({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

// --- Attribute decoration ---------------------------------------------------
// aWave: how much of the travelling body wave this vertex sees (0 at the head,
// 1 at the tail root). aSpan: doubles as the head-yaw mask on the body and as
// root-to-tip span on every fin.

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
    if (part === PART_CAUDAL) {
      wave[i] = 1;
    } else {
      wave[i] = THREE.MathUtils.clamp((z - WAVE_START_Z) / (TAIL_ROOT_Z - WAVE_START_Z), 0, 1);
    }
    span[i] = spanFor(x, y, z);
  }
  geometry.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
  geometry.setAttribute('aSpan', new THREE.BufferAttribute(span, 1));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(parts, 1));
  return geometry;
}

// Head mask: 1 at the snout, 0 behind the gills. The head yaws a little out of
// phase with the body, which is most of what separates a swimming fish from a
// bent plank.
function headMask(z) {
  return THREE.MathUtils.clamp((WAVE_START_Z + 0.02 - z) / 0.08, 0, 1);
}

// --- Painting ---------------------------------------------------------------
// Big clean value zones with one or two crisp accents; the scale-cell map adds
// the fine grain on top so the vertex colours can stay broad.

const _paintColor = new THREE.Color();

function paint(geometry, fn) {
  const position = geometry.getAttribute('position');
  const count = position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    fn(_paintColor, position.getX(i), position.getY(i), position.getZ(i));
    colors[i * 3] = _paintColor.r;
    colors[i * 3 + 1] = _paintColor.g;
    colors[i * 3 + 2] = _paintColor.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

const _mixA = new THREE.Color();
const _mixB = new THREE.Color();

function ramp(out, stops, t) {
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (t <= stops[i + 1][0] || i === stops.length - 2) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i + 1];
      const f = THREE.MathUtils.clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1);
      return out.copy(_mixA.set(c0)).lerp(_mixB.set(c1), f);
    }
  }
  return out.set(stops[0][1]);
}

function paintBody(geometry, p) {
  const flankStops = [
    [0.00, p.belly],
    [0.22, p.lowerFlank],
    [0.52, p.flank],
    [0.82, p.upperFlank],
    [1.00, p.dorsal],
  ];
  return paint(geometry, (out, x, y, z) => {
    const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
    const vertical = THREE.MathUtils.clamp(0.5 + (y - s.yc) / Math.max(0.001, s.hh * 2), 0, 1);
    ramp(out, flankStops, vertical);
    const head = headMask(z);
    if (head > 0) {
      // Head wash, then the cheek patch and the streak that runs back from the
      // eye — the two marks that read as "parrotfish" at ten metres.
      out.lerp(_mixA.set(p.headTop), head * 0.55 * THREE.MathUtils.smoothstep(vertical, 0.4, 0.95));
      const cheek = 1 - THREE.MathUtils.smoothstep(
        Math.hypot((z + 0.132) / 0.030, (y - 0.006) / 0.026, Math.abs(x) * 0.6),
        0.55,
        1.25,
      );
      out.lerp(_mixA.set(p.cheek), cheek * 0.85);
      const streak = (1 - THREE.MathUtils.smoothstep(Math.abs(y - 0.020) / 0.010, 0.4, 1))
        * THREE.MathUtils.smoothstep(z, -0.150, -0.128)
        * (1 - THREE.MathUtils.smoothstep(z, -0.120, -0.100));
      out.lerp(_mixA.set(p.cheekStreak), streak * 0.8);
      out.lerp(_mixA.set(p.chin), head * THREE.MathUtils.clamp(1 - vertical * 3.4, 0, 1) * 0.7);
    }
    // Gill-cover edge, painted rather than modelled.
    const gill = 1 - THREE.MathUtils.smoothstep(Math.abs(z + 0.098) / 0.006, 0.3, 1);
    out.multiplyScalar(1 - gill * 0.16);
    // Caudal peduncle darkens into the tail.
    out.lerp(_mixA.set(p.caudalTrail), THREE.MathUtils.smoothstep(z, 0.11, 0.156) * 0.45);
  });
}

// --- Part builders ----------------------------------------------------------

function buildBeak(p, gape) {
  const jawShape = (open, sign) => tubeLoft({
    steps: 7,
    radial: 10,
    section: (u, a) => {
      const z = -0.169 + u * 0.024;
      const w = 0.012 + u * 0.015;
      const h = 0.009 + u * 0.007;
      const sa = Math.sin(a);
      const ca = -Math.cos(a);
      return [sa * w, ca * h * 0.7 + sign * (0.004 + open) + Math.sin(u * 2.2) * 0.001 * sign, z];
    },
    uv: (u, around) => [0.15 + around * 0.7, 0.9 + u * 0.06],
  });
  const upper = jawShape(gape * 0.25, 1);
  const lower = jawShape(-gape * 0.75, -1);
  const geometry = mergeGeometries([upper, lower], false);
  paint(geometry, (out, x, y) => {
    out.set(p.beak);
    // Fleshy lip where the tooth plate meets the face; the plate itself is
    // bone rather than white, or it reads as a pair of tusks.
    out.lerp(_mixA.set(p.lip), THREE.MathUtils.clamp(Math.abs(y) * 30, 0, 1) * 0.85);
  });
  return decorate(geometry, PART_BODY, (x, y, z) => headMask(z));
}

function buildEyes(p) {
  const parts = [];
  for (const side of [-1, 1]) {
    const ball = new THREE.SphereGeometry(0.0092, 14, 10);
    ball.applyMatrix4(placement({ position: [side * 0.0315, 0.0225, -0.1245] }));
    paint(ball, (out, x, y, z) => {
      const forward = -(z + 0.1245) * side;
      out.set('#141310');
      // Amber iris ring around a black pupil, plus the pale eyelid rim.
      out.lerp(_mixA.set(p.eyeRing), THREE.MathUtils.smoothstep(Math.abs(x) - Math.abs(side) * 0.0315, 0.001, 0.006));
      out.lerp(_mixA.set('#f7f2e2'), THREE.MathUtils.clamp(forward * 60, 0, 1) * 0.12);
    });
    parts.push(ball);
    const ring = new THREE.TorusGeometry(0.0106, 0.0022, 6, 16);
    ring.applyMatrix4(placement({
      position: [side * 0.0312, 0.0225, -0.1245],
      rotation: [0, Math.PI / 2, 0],
    }));
    paint(ring, out => out.set(p.headTop).lerp(_mixA.set(p.eyeRing), 0.35));
    parts.push(ring);
  }
  const geometry = mergeGeometries(parts, false);
  return decorate(geometry, PART_BODY, (x, y, z) => headMask(z));
}

function buildPectorals(p, droop) {
  const parts = [];
  for (const side of [-1, 1]) {
    const blade = bladeGeometry({
      span: 0.055,
      chordAt: u => {
        // Rounded paddle: widest a third of the way out, tapering to a point.
        const w = 0.028 * Math.sin(Math.PI * (0.2 + u * 0.7));
        return [-w * 0.85, w * 1.05];
      },
      thickness: u => 0.0026 * (1 - u * 0.55),
      camber: (u, v) => -0.005 * u * u + Math.sin(Math.PI * v) * 0.0015,
      matrix: placement({
        // Swept aft and held nearly flat: a rowing paddle folded along the
        // flank, not a wing held out square.
        position: [side * PECT_PIVOT[0], PECT_PIVOT[1], PECT_PIVOT[2]],
        rotation: [0, -side * 0.26, side * (0.36 + droop)],
        scale: [side, 1, 1],
      }),
    });
    paint(blade, (out, x, y, z) => {
      const along = THREE.MathUtils.clamp(
        (Math.abs(x) - PECT_PIVOT[0]) / 0.055,
        0,
        1,
      );
      out.set(p.pectoral);
      out.lerp(_mixA.set(p.pectoralEdge), THREE.MathUtils.clamp(-(z - PECT_PIVOT[2]) * 45, 0, 1) * 0.75);
      // Tips thin out to a pale wash rather than going transparent.
      out.lerp(_mixA.set('#e2f2ec'), along * along * 0.45);
    });
    parts.push(blade);
  }
  const geometry = mergeGeometries(parts, false);
  // Span is measured from the mirrored pivot, so the stroke's cupping and
  // taper are identical on both sides.
  return decorate(geometry, PART_PECTORAL, (x, y, z) => THREE.MathUtils.clamp(
    Math.hypot(Math.abs(x) - PECT_PIVOT[0], y - PECT_PIVOT[1], z - PECT_PIVOT[2]) / 0.055,
    0,
    1,
  ));
}

function buildMedianFins(p, droop) {
  const parts = [];
  // Dorsal: one continuous low ridge, as in Scaridae — not a spiny sail.
  const dorsal = tubeLoft({
    steps: 16,
    radial: 8,
    section: (u, a) => {
      const z = -0.082 + u * 0.200;
      const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
      const base = s.hh * 0.92 + s.yc;
      const height = 0.030 * Math.sin(Math.PI * Math.pow(u, 0.8)) + 0.005;
      const v = (1 - Math.cos(a)) * 0.5;
      const half = 0.0022 * Math.pow(Math.sin(Math.PI * v), 0.6);
      const sign = Math.sin(a) >= 0 ? 1 : -1;
      return [half * sign, base + height * v - droop * u * 0.01, z];
    },
    uv: (u, around) => [0.15 + around * 0.7, 0.88 + u * 0.08],
  });
  paint(dorsal, (out, x, y, z) => {
    const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
    const up = THREE.MathUtils.clamp((y - s.hh * 0.92 - s.yc) / 0.031, 0, 1);
    out.set(p.medianFin).lerp(_mixA.set(p.finMargin), THREE.MathUtils.smoothstep(up, 0.6, 1) * 0.38);
  });
  parts.push(dorsal);

  const anal = tubeLoft({
    steps: 10,
    radial: 8,
    section: (u, a) => {
      const z = 0.026 + u * 0.086;
      const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
      const base = -s.hh * 0.86 + s.yc;
      const height = 0.024 * Math.sin(Math.PI * Math.pow(u, 0.75)) + 0.004;
      const v = (1 - Math.cos(a)) * 0.5;
      const half = 0.0020 * Math.pow(Math.sin(Math.PI * v), 0.6);
      const sign = Math.sin(a) >= 0 ? 1 : -1;
      return [half * sign, base - height * v - droop * u * 0.008, z];
    },
    uv: (u, around) => [0.15 + around * 0.7, 0.88 + u * 0.08],
  });
  paint(anal, (out, x, y, z) => {
    const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
    const down = THREE.MathUtils.clamp((-s.hh * 0.86 + s.yc - y) / 0.025, 0, 1);
    out.set(p.medianFin).lerp(_mixA.set(p.finMargin), THREE.MathUtils.smoothstep(down, 0.6, 1) * 0.32);
  });
  parts.push(anal);

  for (const side of [-1, 1]) {
    const pelvic = bladeGeometry({
      steps: 7,
      radial: 10,
      span: 0.030,
      chordAt: u => {
        const w = 0.013 * Math.sin(Math.PI * (0.2 + u * 0.7));
        return [-w * 0.8, w];
      },
      thickness: u => 0.0018 * (1 - u * 0.5),
      matrix: placement({
        position: [side * 0.014, -0.044, -0.056],
        rotation: [0, 0, side * (1.02 + droop * 0.6)],
        scale: [side, 1, 1],
      }),
    });
    paint(pelvic, out => out.set(p.medianFin).lerp(_mixA.set(p.finMargin), 0.18));
    parts.push(pelvic);
  }

  const geometry = mergeGeometries(parts, false);
  return decorate(geometry, PART_MEDIAN, (x, y, z) => {
    const s = lerpStations(BODY_STATIONS, THREE.MathUtils.clamp((z + 0.166) / 0.322, 0, 1));
    const above = Math.abs(y) - s.hh * 0.86;
    return THREE.MathUtils.clamp(above / 0.020, 0, 1);
  });
}

// Two lobes, each a flat blade standing on the peduncle. Built as blades
// rather than as one loft: a loft through nested outlines produces a funnel,
// not a fin.
function buildCaudal(p, variantKey, spread) {
  // Terminal males grow the deep lunate tail; initial-phase fish keep a
  // squared-off truncate one.
  const lunate = variantKey === 'terminal' ? 1 : 0.25;
  const lobeHeight = 0.050 + lunate * 0.010;
  const chordTip = 0.040 + lunate * 0.013 + spread * 0.006;
  const lobes = [1, -1].map(side => bladeGeometry({
    steps: 9,
    radial: 12,
    span: lobeHeight,
    // The leading edge rakes back as it climbs, so the fin leaves the peduncle
    // at its own width and forks into two lobes instead of standing up as a
    // slab behind a stalk.
    chordAt: u => [
      0.034 * Math.pow(u, 1.7),
      0.024 + (chordTip - 0.024) * Math.pow(u, 1.15),
    ],
    thickness: u => 0.0026 * (1 - u * 0.45),
    matrix: placement({
      position: [0, 0, TAIL_ROOT_Z],
      rotation: [0, 0, side * Math.PI * 0.5],
    }),
  }));
  const geometry = mergeGeometries(lobes, false);
  paint(geometry, (out, x, y, z) => {
    const out0 = THREE.MathUtils.clamp((z - TAIL_ROOT_Z) / chordTip, 0, 1);
    out.set(p.caudal);
    out.lerp(_mixA.set(p.caudalMargin), THREE.MathUtils.smoothstep(out0, 0.4, 0.9) * 0.55);
    out.lerp(_mixA.set(p.caudalTrail), THREE.MathUtils.smoothstep(out0, 0.85, 1) * 0.7);
  });
  // Distance back from the peduncle drives the tail's own delayed sweep, so
  // the trailing edge whips and the root stays pinned to the body.
  return decorate(geometry, PART_CAUDAL, (x, y, z) => (
    THREE.MathUtils.clamp((z - TAIL_ROOT_Z) / chordTip, 0, 1)
  ));
}

// --- Geometry assembly ------------------------------------------------------

const geometryCache = new Map();

// `stranded` bakes the pose of a fish that has been out of the water for some
// hours: a slack C-curve through the body, jaw fallen open, fins collapsed
// against the flank, and the colour bleached toward dry sand.
function buildParrotfishGeometry(variantKey, stranded) {
  const p = palette(variantKey);
  const gape = stranded ? 0.010 : 0.0015;
  const droop = stranded ? 0.55 : 0;

  const parts = [
    decorate(paintBody(bodyGeometry(), p), PART_BODY, (x, y, z) => headMask(z)),
    buildBeak(p, gape),
    buildEyes(p),
    buildPectorals(p, droop),
    buildMedianFins(p, droop),
    buildCaudal(p, variantKey, stranded ? 0.4 : 0),
  ];
  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  // The stranded C-curve is applied after the merge so body, fins, beak and
  // eyes bend as one piece instead of drifting apart at the seams.
  if (stranded) bendGeometry(geometry, 0.026);
  geometry.computeVertexNormals();
  if (stranded) bleach(geometry);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function bendGeometry(geometry, amount) {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const t = THREE.MathUtils.clamp((position.getZ(i) + 0.166) / 0.322, 0, 1);
    position.setX(i, position.getX(i) + amount * Math.sin(t * Math.PI * 0.9));
  }
  position.needsUpdate = true;
}

// Sun-bleaching is applied to the live colours rather than hand-listed, so the
// stranded fish always reads as the same animal that swims offshore.
function bleach(geometry) {
  const color = geometry.getAttribute('color');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < color.count; i += 1) {
    _paintColor.fromBufferAttribute(color, i);
    const hsl = { h: 0, s: 0, l: 0 };
    _paintColor.getHSL(hsl);
    _paintColor.setHSL(hsl.h, hsl.s * 0.34, Math.min(0.92, hsl.l * 0.85 + 0.20));
    // The side that has been facing the sky dries paler and picks up sand.
    const up = THREE.MathUtils.clamp(0.5 + position.getY(i) * 6, 0, 1);
    _paintColor.lerp(BLEACH, 0.30 + up * 0.26);
    color.setXYZ(i, _paintColor.r, _paintColor.g, _paintColor.b);
  }
  color.needsUpdate = true;
}

export function getParrotfishGeometry(variantKey = 'terminal', stranded = false) {
  const key = `${variantKey}:${stranded ? 'stranded' : 'live'}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = buildParrotfishGeometry(variantKey, stranded);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

// --- Scale-cell map ---------------------------------------------------------
// One shared 256px texture. The lower three quarters carry the scale cells the
// body samples; the top strip is flat so the fins pick up no pattern.

let scaleTexture;
function getScaleTexture() {
  if (scaleTexture !== undefined) return scaleTexture;
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Rows of overlapping scallops, each one edged a touch darker and warmer —
  // the pink scale outlines every parrotfish photograph shows.
  const cellsX = 10;
  const cellsY = 13;
  const w = size / cellsX;
  const h = (size * 0.75) / cellsY;
  ctx.lineWidth = 1.6;
  for (let row = 0; row < cellsY + 1; row += 1) {
    for (let col = -1; col < cellsX + 1; col += 1) {
      const cx = (col + (row % 2 ? 0.5 : 0)) * w;
      const cy = size - row * h;
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.5, cy, w * 0.62, h * 0.78, 0, Math.PI * 0.06, Math.PI * 0.94);
      ctx.strokeStyle = 'rgba(196, 118, 122, 0.42)';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.5, cy - 1.5, w * 0.62, h * 0.78, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.stroke();
    }
  }
  // Flat strip for the fins, with a margin so mipmaps cannot bleed cells into
  // it at distance.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size * 0.19);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  scaleTexture = texture;
  return texture;
}

// --- Swim shader ------------------------------------------------------------

function n(value) {
  return Number(value).toFixed(5);
}

const SWIM_CACHE_KEY = 'parrotfish-swim-v1';

function swimCommon() {
  return `
    attribute float aWave;
    attribute float aSpan;
    attribute float aPart;
    attribute float aPhase;
    attribute float aEnergy;
    attribute float aDead;
    attribute vec3 aTint;
    varying vec3 vFishTint;
    mat3 fishAxisRot(vec3 axis, float angle) {
      float c = cos(angle);
      float s = sin(angle);
      float t = 1.0 - c;
      return mat3(
        t * axis.x * axis.x + c,           t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
        t * axis.x * axis.y - s * axis.z,  t * axis.y * axis.y + c,          t * axis.y * axis.z + s * axis.x,
        t * axis.x * axis.z + s * axis.y,  t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c
      );
    }
  `;
}

function swimVertex(cfg) {
  return `
  vec3 fishPos = position;
  mat3 fishRot = mat3(1.0);
  float fishLive = 1.0 - aDead;
  float fishDrive = 0.40 + 0.60 * aEnergy;
  if (aPart > 0.5 && aPart < 1.5) {
    // Pectoral row. Both fins beat together — labriform swimmers scull, they
    // do not walk — with the fore/aft feather a quarter cycle behind the
    // up/down sweep, which is what makes the stroke read as elliptical.
    float side = sign(fishPos.x);
    vec3 pivot = vec3(side * ${n(PECT_PIVOT[0])}, ${n(PECT_PIVOT[1])}, ${n(PECT_PIVOT[2])});
    float sweep = ${n(cfg.pectSweep)} * fishDrive * sin(aPhase) * fishLive;
    float rake = ${n(cfg.pectRake)} * fishDrive * cos(aPhase) * fishLive;
    vec3 local = fishPos - pivot;
    local.y += ${n(cfg.pectCup)} * aSpan * aSpan * sin(aPhase + 1.15) * fishLive;
    fishRot = fishAxisRot(vec3(0.0, 0.0, 1.0), -side * sweep)
            * fishAxisRot(vec3(0.0, 1.0, 0.0), side * rake);
    fishPos = pivot + fishRot * local;
  } else {
    float beat = aPhase * ${n(cfg.beatRatio)};
    fishPos.x += ${n(cfg.bodyAmp)} * aWave * aWave * fishDrive * fishLive
      * sin(beat - aWave * ${n(cfg.waveK)});
    if (aPart < 0.5) {
      fishPos.x -= ${n(cfg.headAmp)} * aSpan * fishDrive * fishLive * sin(beat + 1.9);
    } else if (aPart < 2.5) {
      fishPos.x += ${n(cfg.tailAmp)} * aSpan * (0.25 + 0.75 * aEnergy) * fishLive
        * sin(beat - ${n(cfg.waveK)} - 0.85);
    } else {
      fishPos.x += ${n(cfg.finFlutter)} * aSpan * fishLive
        * sin(beat * 1.7 - aWave * ${n(cfg.waveK)} + 0.7);
    }
  }
  `;
}

// The body wave is a pure lateral shear, so only the rotated pectorals need
// their normals fixed up; the error on the flank is a fraction of a degree at
// these amplitudes.
function applySwimShader(material, cfg) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${swimCommon()}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n${swimVertex(cfg)}\n  objectNormal = fishRot * objectNormal;\n  vFishTint = aTint;`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = fishPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFishTint;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= vFishTint;',
      );
  };
  material.customProgramCacheKey = () => SWIM_CACHE_KEY;
  return material;
}

const materialCache = new Map();

export function getParrotfishMaterial(stranded = false) {
  const key = stranded ? 'stranded' : 'live';
  const cached = materialCache.get(key);
  if (cached) return cached;
  const map = getScaleTexture();
  const material = new THREE.MeshPhysicalMaterial({
    ...(map ? { map } : {}),
    vertexColors: true,
    color: '#ffffff',
    // Wet fish are glossy; a stranded one has dried matte and picked up sand.
    roughness: stranded ? 0.66 : 0.34,
    metalness: 0,
    ...(stranded ? {} : { iridescence: 0.14, iridescenceIOR: 1.32, iridescenceThicknessRange: [180, 460] }),
    side: THREE.DoubleSide, // fin blades are thin enough to show backfaces at grazing angles
  });
  applySwimShader(material, PARROTFISH_SWIM);
  if (map) materialCache.set(key, material);
  return material;
}

// --- Instanced mesh ---------------------------------------------------------

export function createParrotfishSchoolMesh({
  variant = 'terminal',
  count = 1,
  stranded = false,
} = {}) {
  return createInstancedCreature({
    geometry: getParrotfishGeometry(variant, stranded),
    material: getParrotfishMaterial(stranded),
    count,
    seed: variant,
    dead: stranded,
    castShadow: stranded,
    hoverRate: PARROTFISH_SWIM.hoverRate,
    burstRate: PARROTFISH_SWIM.burstRate,
  });
}
