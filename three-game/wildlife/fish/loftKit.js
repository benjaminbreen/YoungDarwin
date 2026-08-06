// Shared lofting plumbing for the hand-authored fish. Extracted from the
// parrotfish so the hammerhead builds from the same primitives rather than a
// second copy of them.
//
// The one idea worth knowing: everything here is a closed tube. A body is a
// tube through a run of stations; a fin is a very flat tube whose section
// walks the chord out and back. That keeps every part a solid shell — no alpha
// planes, no visible backfaces when the animal turns.

import * as THREE from 'three';

// `section(u, angle)` returns a point on the closed cross-section at station u.
// Both ends cap: an open loft shows sky pinholes through the end rings.
export function tubeLoft({ steps, radial, section, uv, capStart = true, capEnd = true }) {
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

// Linear interpolation through a run of {t, z, hw, hh, yc} body stations.
export function lerpStations(stations, t) {
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

// Superellipse exponent: >2 fills out the flank so the section reads as a slab
// with rounded edges instead of an ellipse.
export function superFactor(sa, ca, n) {
  if (n === 2) return 1;
  const d = Math.pow(Math.pow(Math.abs(sa), n) + Math.pow(Math.abs(ca), n), -1 / n);
  return d * Math.hypot(sa, ca);
}

// A fin. Thickness tapers to nothing at the leading and trailing edges, so the
// blade is a solid shell rather than a plane.
export function bladeGeometry({
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

export function placement({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

const _paintColor = new THREE.Color();
const _mixA = new THREE.Color();
const _mixB = new THREE.Color();

// Per-vertex colour from a callback over the local position.
export function paint(geometry, fn) {
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

// Colour ramp over [[stop, '#hex'], ...].
export function ramp(out, stops, t) {
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

// Scratch colour for callers mixing inside a paint() callback.
export const mixColor = _mixA;
