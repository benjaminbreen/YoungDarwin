'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

// Deterministic RNG so the painted plumage is identical every mount.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catmullRom(values, t) {
  const n = values.length;
  const f = THREE.MathUtils.clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const u = f - i;
  const v0 = values[Math.max(0, i - 1)];
  const v1 = values[i];
  const v2 = values[i + 1];
  const v3 = values[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * v1
    + (-v0 + v2) * u
    + (2 * v0 - 5 * v1 + 4 * v2 - v3) * u * u
    + (-v0 + 3 * v1 - 3 * v2 + v3) * u * u * u);
}

// Lofts a smooth closed body from elliptical cross sections. Each station is
// { z, y, hw, up, down }: hw is half-width, up/down the radii above and below
// the section centre — bird bodies are deeper below the spine than above it,
// which stacked spheres can never get right. Stations are Catmull-Rom
// resampled so the profile is one continuous curve, not bulges at joints.
// Both ends are capped — an open loft reads as a bright pinhole of sky
// wherever the end ring faces the camera.
// UVs: u wraps the circumference starting at the spine (u=0 top), v runs
// tail→head, so a single texture can paint dark back / pale belly correctly.
function makeLoftGeometry(stations, { radialSegments = 26, lengthSegments = 44 } = {}) {
  const zs = stations.map(s => s.z);
  const ys = stations.map(s => s.y);
  const hws = stations.map(s => s.hw);
  const ups = stations.map(s => s.up);
  const downs = stations.map(s => s.down);

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= lengthSegments; j += 1) {
    const t = j / lengthSegments;
    const z = catmullRom(zs, t);
    const cy = catmullRom(ys, t);
    const hw = Math.max(0.003, catmullRom(hws, t));
    const up = Math.max(0.003, catmullRom(ups, t));
    const down = Math.max(0.003, catmullRom(downs, t));
    for (let i = 0; i <= radialSegments; i += 1) {
      const a = (i / radialSegments) * Math.PI * 2;
      const c = Math.cos(a);
      positions.push(Math.sin(a) * hw, cy + c * (c > 0 ? up : down), z);
      uvs.push(i / radialSegments, t);
    }
  }
  const ring = radialSegments + 1;
  for (let j = 0; j < lengthSegments; j += 1) {
    for (let i = 0; i < radialSegments; i += 1) {
      const a = j * ring + i;
      const b = a + ring;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // End caps: centre-point fans over the first and last rings.
  for (const end of [0, lengthSegments]) {
    const t = end / lengthSegments;
    const centerIndex = positions.length / 3;
    positions.push(0, catmullRom(ys, t), catmullRom(zs, t));
    uvs.push(0.5, t);
    const ringStart = end * ring;
    for (let i = 0; i < radialSegments; i += 1) {
      if (end === 0) indices.push(centerIndex, ringStart + i, ringStart + i + 1);
      else indices.push(centerIndex, ringStart + i + 1, ringStart + i);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Weld the UV-seam normals so no lighting crease runs along the spine.
  const normals = geometry.attributes.normal;
  for (let j = 0; j <= lengthSegments; j += 1) {
    const a = j * ring;
    const b = a + radialSegments;
    const nx = (normals.getX(a) + normals.getX(b)) * 0.5;
    const ny = (normals.getY(a) + normals.getY(b)) * 0.5;
    const nz = (normals.getZ(a) + normals.getZ(b)) * 0.5;
    normals.setXYZ(a, nx, ny, nz);
    normals.setXYZ(b, nx, ny, nz);
  }
  return geometry;
}

// A wing with real substance: two cambered sheets (top and underside) joined
// at the leading and trailing edges, with an airfoil-ish thickness that is
// deepest behind the leading edge and feathers out to nothing at the tips.
// The planform — rounded tip, swept leading edge — lives in the mesh, so the
// silhouette is a wing from every angle. Alpha-tested outlines were tried and
// abandoned: mipmapped alpha erodes to bent wires at glancing angles.
// Spans +x from the joint, leading edge toward +z.
// `scallops` cuts feather tips into the trailing edge of the mesh itself;
// `arch` bows the span so the wing vaults instead of sticking out straight.
// UV: u along span. With `splitUV` the top sheet maps to the upper half of
// the texture and the underside to the lower half (trailing edge at v=0.5,
// leading edges at v=1 and v=0), so the underwing can be painted pale —
// otherwise v = 1 at the leading edge on both sheets.
function makeWingShellGeometry({
  span, rootChord, tipChord, sweep,
  camber = 0.02, thickness = 0.016, spanSegments = 14, chordSegments = 9,
  arch = 0.016, scallops = 0, scallopDepth = 0, splitUV = false,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const row = chordSegments + 1;
  const sheetVerts = (spanSegments + 1) * row;

  for (const sheet of [1, -1]) {
    for (let i = 0; i <= spanSegments; i += 1) {
      const t = i / spanSegments;
      // Elliptic rounding pulls the chord in over the outer quarter-span.
      const tipT = Math.max(0, (t - 0.7) / 0.3);
      const tipRound = Math.sqrt(Math.max(0, 1 - tipT * tipT));
      const chord = THREE.MathUtils.lerp(rootChord, tipChord, t) * (0.2 + 0.8 * tipRound);
      const lead = 0.05 - sweep * Math.pow(t, 1.6);
      const spanY = arch * Math.sin(t * Math.PI) - 0.014 * t * t;
      for (let j = 0; j <= chordSegments; j += 1) {
        const c = j / chordSegments;
        const camberY = camber * Math.sin(Math.PI * c) * (1 - 0.45 * t);
        // Airfoil mass concentrated just behind the leading edge, split as a
        // domed top and a flatter underside — the muscle-and-covert bulk of a
        // real wing, not a symmetric blade.
        const th = thickness
          * (1 - 0.55 * t)
          * THREE.MathUtils.smoothstep(c, 0, 0.1)
          * Math.pow(1 - c, 2);
        // Trailing-edge scallops put individual feather tips into the
        // silhouette itself, where they survive fog and distance that wash
        // out painted detail.
        const scallop = scallops > 0
          ? scallopDepth * Math.max(0, Math.sin(Math.PI * ((t * scallops) % 1)))
            * THREE.MathUtils.smoothstep(c, 0.55, 1)
          : 0;
        positions.push(t * span, spanY + camberY + (sheet > 0 ? th * 0.72 : -th * 0.28), lead - c * chord - scallop);
        uvs.push(t, splitUV ? (sheet > 0 ? 1 - 0.5 * c : 0.5 * c) : 1 - c);
      }
    }
  }
  for (let i = 0; i < spanSegments; i += 1) {
    for (let j = 0; j < chordSegments; j += 1) {
      const a = i * row + j;
      const b = a + row;
      // Top sheet: normals up.
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      // Bottom sheet: reversed winding, normals down.
      const a2 = a + sheetVerts;
      const b2 = b + sheetVerts;
      indices.push(a2, a2 + 1, b2, a2 + 1, b2 + 1, b2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Tail fan, same two-sheet construction as the wings: a widening strip
// running -z from the pivot, rounded at the corners, with a hint of
// thickness so it never collapses to a spike edge-on.
// u runs across the fan, v root→tip.
function makeTailGeometry({
  length = 0.27, rootHalfWidth = 0.05, tipHalfWidth = 0.105,
  thickness = 0.012, segments = 10, across = 8,
  scallops = 0, scallopDepth = 0,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const row = across + 1;
  const sheetVerts = (segments + 1) * row;

  for (const sheet of [1, -1]) {
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const hw = THREE.MathUtils.lerp(rootHalfWidth, tipHalfWidth, t);
      for (let j = 0; j <= across; j += 1) {
        const c = j / across;
        // Rounded fan end: the outermost feathers fall slightly short.
        const lenScale = 0.85 + 0.15 * Math.sin(c * Math.PI);
        const cup = -Math.sin(c * Math.PI) * 0.008 - t * 0.01;
        const th = thickness * (1 - t * 0.85) * Math.sin(c * Math.PI);
        // Individual feather tips scalloped into the fan-end silhouette.
        const scallop = scallops > 0
          ? scallopDepth * Math.max(0, Math.sin(Math.PI * ((c * scallops) % 1)))
          : 0;
        positions.push((c - 0.5) * 2 * hw, cup + sheet * th * 0.5, -t * (length * lenScale + scallop));
        uvs.push(c, 1 - t);
      }
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
      const a2 = a + sheetVerts;
      const b2 = b + sheetVerts;
      indices.push(a2, b2, a2 + 1, a2 + 1, b2, b2 + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Painted plumage — clean, stylized, warm. Big readable zones with a few
// crisp accents (one cream wing-bar, dark feather tips) instead of noisy
// per-feather outlines: outlines around everything read as brickwork.
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Body/head map. x = circumference (spine at both edges, belly centre),
// y = length (bottom = tail end, top = front).
function paintBodyTexture({
  back, backWarm, flank, belly, rng,
  streakStrength = 0.3, scallopStrength = 0.09, mottleStrength = 0, size = 512,
  eyeBands = false,
}) {
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, back);
  g.addColorStop(0.17, back);
  g.addColorStop(0.31, backWarm);
  g.addColorStop(0.43, flank);
  g.addColorStop(0.5, belly);
  g.addColorStop(0.57, flank);
  g.addColorStop(0.69, backWarm);
  g.addColorStop(0.83, back);
  g.addColorStop(1, back);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Lengthwise tint: cooler toward the front (nape at canvas top), warmer
  // toward the rump.
  const lg = ctx.createLinearGradient(0, 0, 0, size);
  lg.addColorStop(0, 'rgba(38, 29, 20, 0.2)');
  lg.addColorStop(0.35, 'rgba(38, 29, 20, 0)');
  lg.addColorStop(0.8, 'rgba(150, 112, 66, 0)');
  lg.addColorStop(1, 'rgba(150, 112, 66, 0.16)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, size, size);

  // Face accents for the head map: a soft pale brow band above the eye line
  // and a slightly darker cheek smudge below it, mirrored on both sides of
  // the circumference. Subtle — it should read at a glance, not as makeup.
  if (eyeBands) {
    for (const centre of [0.16, 0.84]) {
      const brow = ctx.createLinearGradient((centre - 0.05) * size, 0, (centre + 0.05) * size, 0);
      brow.addColorStop(0, 'rgba(222, 197, 158, 0)');
      brow.addColorStop(0.5, 'rgba(222, 197, 158, 0.2)');
      brow.addColorStop(1, 'rgba(222, 197, 158, 0)');
      ctx.fillStyle = brow;
      ctx.fillRect((centre - 0.05) * size, 0, 0.1 * size, size);
    }
    for (const centre of [0.1, 0.9]) {
      const line = ctx.createLinearGradient((centre - 0.035) * size, 0, (centre + 0.035) * size, 0);
      line.addColorStop(0, 'rgba(40, 30, 20, 0)');
      line.addColorStop(0.5, 'rgba(40, 30, 20, 0.16)');
      line.addColorStop(1, 'rgba(40, 30, 20, 0)');
      ctx.fillStyle = line;
      ctx.fillRect((centre - 0.035) * size, 0, 0.07 * size, size);
    }
  }

  // Feather scallops: staggered rows of faint arcs, strongest on the back,
  // gone on the belly — plumage grain, kept well under the value shifts.
  const rowStep = 12;
  for (let row = 0; row < size / rowStep + 1; row += 1) {
    const y = row * rowStep + rng() * 3;
    const offset = (row % 2) * 8;
    for (let x = offset; x < size + 16; x += 16) {
      const dx = Math.min(Math.abs(x / size - 0.5), 0.5);
      const zone = THREE.MathUtils.smoothstep(dx, 0.1, 0.42);
      const alpha = scallopStrength * (0.2 + zone * 0.8) * (0.7 + rng() * 0.5);
      const r = 6 + rng() * 2.5;
      ctx.strokeStyle = `rgba(32, 23, 15, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 0.14, Math.PI * 0.86);
      ctx.stroke();
    }
  }

  // Pale feather edgings on the mantle — scaly highlights against the dark
  // back, the signature of a female ground finch's upperparts.
  if (mottleStrength > 0) {
    for (let row = 0; row < size / 13; row += 1) {
      const y = row * 13 + rng() * 3 + 6;
      const offset = (row % 2) * 7;
      for (let x = offset; x < size + 14; x += 14) {
        const dx = Math.min(Math.abs(x / size - 0.5), 0.5);
        const zone = THREE.MathUtils.smoothstep(dx, 0.28, 0.44);
        if (zone <= 0.01) continue;
        ctx.strokeStyle = `rgba(206, 192, 158, ${0.14 * zone * (0.6 + rng() * 0.6) * mottleStrength})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x, y, 5 + rng() * 2, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
    // Soft mottling over breast and flanks: dark elongated dabs, each with a
    // pale companion below — dappled, not spotted. Densest mid-flank, absent
    // along the spine and the belly midline.
    for (let i = 0; i < 170; i += 1) {
      const xNorm = 0.5 + (rng() - 0.5) * 0.62;
      const dx = Math.abs(xNorm - 0.5);
      if (dx < 0.05 || dx > 0.34) continue;
      const fade = THREE.MathUtils.smoothstep(dx, 0.05, 0.13) * (1 - THREE.MathUtils.smoothstep(dx, 0.26, 0.34));
      const x = xNorm * size;
      const y = size * (0.12 + rng() * 0.82);
      const r = 3.5 + rng() * 4;
      ctx.fillStyle = `rgba(58, 48, 36, ${0.2 * fade * mottleStrength * (0.6 + rng() * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.7, r * 1.25, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(216, 202, 170, ${0.13 * fade * mottleStrength * (0.6 + rng() * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(x + 1, y + r * 1.3, r * 0.6, r * 0.9, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shaft streaks on breast and flanks only: tapered strokes aligned with
  // the body axis, fading toward the belly midline.
  for (let i = 0; i < 190; i += 1) {
    const xNorm = 0.5 + (rng() - 0.5) * 0.6;
    const dx = Math.abs(xNorm - 0.5);
    if (dx < 0.07 || dx > 0.33) continue;
    const fade = THREE.MathUtils.smoothstep(dx, 0.07, 0.16) * (1 - THREE.MathUtils.smoothstep(dx, 0.24, 0.33));
    const x = xNorm * size;
    const y = size * (0.2 + rng() * 0.7);
    const len = 8 + rng() * 11;
    const w = 1 + rng() * 1.4;
    const grad = ctx.createLinearGradient(x, y, x, y + len);
    grad.addColorStop(0, `rgba(52, 38, 24, ${streakStrength * fade})`);
    grad.addColorStop(1, 'rgba(52, 38, 24, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 2, y + len * 0.6, x, y + len);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 2, y + len * 0.6, x + w, y);
    ctx.closePath();
    ctx.fill();
  }

  // A whisper of tonal noise — stylized means clean, not sterile.
  for (let i = 0; i < 320; i += 1) {
    const light = rng() > 0.5;
    ctx.fillStyle = light
      ? `rgba(228, 203, 160, ${0.015 + rng() * 0.025})`
      : `rgba(34, 25, 16, ${0.015 + rng() * 0.025})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  return canvasTexture(canvas);
}

// Inner wing (arm) base layer — the secondaries. Split layout matching the
// shell's splitUV: top surface in the upper half of the canvas (leading edge
// at y=0, trailing edge at the midline), underside in the lower half
// (trailing edge at the midline, leading edge at the bottom). The underside
// is painted pale buff — the single strongest "bird, not bat" cue whenever
// the wing shows its underface.
function paintArmWingTexture(rng) {
  const w = 512;
  const h = 512;
  const mid = 256;
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const feathers = 7;

  // --- Top surface ---
  const top = ctx.createLinearGradient(0, 0, 0, mid);
  top.addColorStop(0, '#6b5e49');
  top.addColorStop(0.35, '#584c3a');
  top.addColorStop(1, '#463c2e');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, mid);

  // Secondary feather separations, one per mesh scallop boundary, with a
  // pale shaft down each feather's centre.
  for (let i = 1; i < feathers; i += 1) {
    const x = (i / feathers) * w;
    ctx.strokeStyle = 'rgba(30, 22, 15, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 54);
    ctx.lineTo(x + 10, mid);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214, 184, 142, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 3.5, 58);
    ctx.lineTo(x + 13.5, mid);
    ctx.stroke();
  }
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w;
    ctx.strokeStyle = 'rgba(206, 176, 134, 0.14)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 74);
    ctx.lineTo(x + 5, mid - 10);
    ctx.stroke();
  }
  // Dark trailing band, its inner edge scalloped at feather centres so it
  // tracks the mesh scallops.
  ctx.fillStyle = '#362a20';
  ctx.fillRect(0, mid - 20, w, 20);
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w + 5;
    ctx.beginPath();
    ctx.arc(x, mid - 20, 17, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  // Curvature shading: lit leading edge, shaded trailing edge.
  const shade = ctx.createLinearGradient(0, 0, 0, mid);
  shade.addColorStop(0, 'rgba(238, 214, 170, 0.12)');
  shade.addColorStop(0.4, 'rgba(22, 16, 10, 0)');
  shade.addColorStop(1, 'rgba(22, 16, 10, 0.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, mid);

  // --- Underside: pale buff, dark trailing band, soft covert shadow. ---
  const under = ctx.createLinearGradient(0, mid, 0, h);
  under.addColorStop(0, '#a99878');
  under.addColorStop(0.25, '#c4b696');
  under.addColorStop(1, '#d4c8a9');
  ctx.fillStyle = under;
  ctx.fillRect(0, mid, w, mid);
  ctx.fillStyle = '#453729';
  ctx.fillRect(0, mid, w, 18);
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w + 5;
    ctx.beginPath();
    ctx.arc(x, mid + 18, 15, 0, Math.PI);
    ctx.fill();
  }
  for (let i = 1; i < feathers; i += 1) {
    const x = (i / feathers) * w;
    ctx.strokeStyle = 'rgba(90, 72, 52, 0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 10, mid + 18);
    ctx.lineTo(x, h - 46);
    ctx.stroke();
  }
  // Underwing-covert shadow along the leading edge.
  const lift = ctx.createLinearGradient(0, h - 60, 0, h);
  lift.addColorStop(0, 'rgba(120, 96, 68, 0)');
  lift.addColorStop(1, 'rgba(120, 96, 68, 0.45)');
  ctx.fillStyle = lift;
  ctx.fillRect(0, h - 60, w, 60);
  void rng;
  return canvasTexture(canvas);
}

// Outer wing (hand) base shell: darker primary field on top, silvery-buff
// underside. Same split layout as the arm.
function paintHandWingTexture(rng) {
  const w = 512;
  const h = 512;
  const mid = 256;
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const feathers = 5;

  const top = ctx.createLinearGradient(0, 0, 0, mid);
  top.addColorStop(0, '#584c3a');
  top.addColorStop(0.3, '#453b2d');
  top.addColorStop(1, '#352d23');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, mid);

  for (let i = 1; i < feathers; i += 1) {
    const x = (i / feathers) * w;
    ctx.strokeStyle = 'rgba(24, 18, 12, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 14, mid);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(196, 166, 126, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 3.5, 44);
    ctx.lineTo(x + 17.5, mid);
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2219';
  ctx.fillRect(0, mid - 18, w, 18);
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w + 7;
    ctx.beginPath();
    ctx.arc(x, mid - 18, 16, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  const shade = ctx.createLinearGradient(0, 0, 0, mid);
  shade.addColorStop(0, 'rgba(226, 200, 158, 0.09)');
  shade.addColorStop(0.4, 'rgba(20, 14, 9, 0)');
  shade.addColorStop(1, 'rgba(20, 14, 9, 0.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, mid);

  const under = ctx.createLinearGradient(0, mid, 0, h);
  under.addColorStop(0, '#94856a');
  under.addColorStop(0.3, '#b7a888');
  under.addColorStop(1, '#c8bb9c');
  ctx.fillStyle = under;
  ctx.fillRect(0, mid, w, mid);
  ctx.fillStyle = '#382d22';
  ctx.fillRect(0, mid, w, 16);
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w + 7;
    ctx.beginPath();
    ctx.arc(x, mid + 16, 14, 0, Math.PI);
    ctx.fill();
  }
  for (let i = 1; i < feathers; i += 1) {
    const x = (i / feathers) * w;
    ctx.strokeStyle = 'rgba(80, 64, 46, 0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 14, mid + 16);
    ctx.lineTo(x, h - 40);
    ctx.stroke();
  }
  const lift = ctx.createLinearGradient(0, h - 54, 0, h);
  lift.addColorStop(0, 'rgba(110, 88, 62, 0)');
  lift.addColorStop(1, 'rgba(110, 88, 62, 0.4)');
  ctx.fillStyle = lift;
  ctx.fillRect(0, h - 54, w, 54);
  void rng;
  return canvasTexture(canvas);
}

// Covert overlay for the inner wing: warm rufous field, scallop rows, and
// the cream greater-covert bar as its trailing edge — the wing-bar lives on
// this layer's physical edge, so it reads as a real feather step, and its
// painted scallops line up with the overlay's mesh scallops.
function paintCovertTexture(rng) {
  const s = 256;
  const canvas = makeCanvas(s, s);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#7b6c52');
  g.addColorStop(0.5, '#6d5f47');
  g.addColorStop(1, '#61533e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // Lesser/median covert scallop rows, staggered.
  for (const [row, y] of [40, 78, 116].entries()) {
    for (let x = (row % 2) * 11; x < s + 22; x += 22) {
      ctx.strokeStyle = 'rgba(40, 30, 20, 0.26)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 11, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
  }
  // A soft rufous shadow where the cream bar seats under the coverts.
  const seat = ctx.createLinearGradient(0, s - 46, 0, s - 30);
  seat.addColorStop(0, 'rgba(120, 78, 44, 0)');
  seat.addColorStop(1, 'rgba(120, 78, 44, 0.3)');
  ctx.fillStyle = seat;
  ctx.fillRect(0, s - 46, s, 16);
  // Cream bar with a scalloped top seam, one bump per mesh scallop.
  ctx.fillStyle = '#e9dcba';
  ctx.fillRect(0, s - 30, s, 30);
  for (let i = 0; i < 8; i += 1) {
    const x = (i + 0.5) * (s / 8);
    ctx.beginPath();
    ctx.arc(x, s - 30, 14, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(58, 44, 28, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  const shade = ctx.createLinearGradient(0, 0, 0, s);
  shade.addColorStop(0, 'rgba(238, 214, 170, 0.1)');
  shade.addColorStop(1, 'rgba(24, 17, 11, 0.08)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, s, s);
  void rng;
  return canvasTexture(canvas);
}

// One primary feather: warm vane, pale outer edge and shaft, dusky tip.
// u runs root→tip, v=1 is the leading edge.
function paintPrimaryFeatherTexture() {
  const w = 128;
  const h = 64;
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#564a37');
  g.addColorStop(0.6, '#463c2d');
  g.addColorStop(0.82, '#372f24');
  g.addColorStop(1, '#262019');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Pale outer-vane edge along the leading side.
  const edge = ctx.createLinearGradient(0, 0, 0, 14);
  edge.addColorStop(0, 'rgba(216, 188, 142, 0.5)');
  edge.addColorStop(1, 'rgba(216, 188, 142, 0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w * 0.86, 14);
  // Shaft.
  ctx.strokeStyle = 'rgba(206, 178, 134, 0.4)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(2, h * 0.3);
  ctx.lineTo(w * 0.86, h * 0.36);
  ctx.stroke();
  // Slightly darker trailing vane.
  const trail = ctx.createLinearGradient(0, h - 18, 0, h);
  trail.addColorStop(0, 'rgba(26, 19, 12, 0)');
  trail.addColorStop(1, 'rgba(26, 19, 12, 0.28)');
  ctx.fillStyle = trail;
  ctx.fillRect(0, h - 18, w, 18);
  // A hair of pale fringe at the very tip, so fanned feathers catch light.
  ctx.fillStyle = 'rgba(214, 190, 148, 0.38)';
  ctx.fillRect(w - 4, 0, 4, h);
  return canvasTexture(canvas);
}

// Tail: root at canvas top, six feathers matching the mesh scallops, dark
// tip band, and pale outer-feather edges — the little tail flash a finch
// shows when it banks.
function paintTailTexture(rng) {
  const w = 256;
  const h = 256;
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const feathers = 6;

  const zones = ctx.createLinearGradient(0, 0, 0, h);
  zones.addColorStop(0, '#584c3a');
  zones.addColorStop(0.25, '#484033');
  zones.addColorStop(1, '#3a3229');
  ctx.fillStyle = zones;
  ctx.fillRect(0, 0, w, h);

  // Pale outer tail-feather edges.
  for (const [x0, x1] of [[26, 0], [w - 26, w]]) {
    const edge = ctx.createLinearGradient(x0, 0, x1, 0);
    edge.addColorStop(0, 'rgba(216, 192, 148, 0)');
    edge.addColorStop(1, 'rgba(216, 192, 148, 0.5)');
    ctx.fillStyle = edge;
    ctx.fillRect(Math.min(x0, x1), 0, 26, h);
  }

  // Separations at the mesh scallop boundaries, fanning from the root.
  for (let i = 1; i < feathers; i += 1) {
    const x = (i / feathers) * w;
    const fan = (i - feathers / 2) * 6;
    ctx.strokeStyle = 'rgba(28, 21, 15, 0.42)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x, 16);
    ctx.lineTo(x + fan, h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 172, 132, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, 20);
    ctx.lineTo(x + fan + 3, h);
    ctx.stroke();
  }

  // Dark tip band, scalloped at feather centres to match the mesh.
  ctx.fillStyle = '#332920';
  ctx.fillRect(0, h - 15, w, 15);
  for (let i = 0; i < feathers; i += 1) {
    const x = ((i + 0.5) / feathers) * w;
    ctx.beginPath();
    ctx.arc(x, h - 15, 16, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(224, 198, 156, 0.06)');
  shade.addColorStop(0.4, 'rgba(20, 14, 9, 0)');
  shade.addColorStop(1, 'rgba(20, 14, 9, 0.2)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  void rng;
  return canvasTexture(canvas);
}

// Beak: orange-horn, per the reference female — darker along the culmen
// ridge (edges of the canvas), warm pale horn on the lower mandible
// (centre), with a dusky tip.
function paintBeakTexture() {
  const canvas = makeCanvas(64, 8);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#b97b3e');
  g.addColorStop(0.34, '#cf9450');
  g.addColorStop(0.5, '#e2b273');
  g.addColorStop(0.66, '#cf9450');
  g.addColorStop(1, '#b97b3e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 8);
  // Dusky tip.
  const tip = ctx.createLinearGradient(0, 0, 0, 4);
  tip.addColorStop(0, 'rgba(90, 56, 26, 0.4)');
  tip.addColorStop(1, 'rgba(90, 56, 26, 0)');
  ctx.fillStyle = tip;
  ctx.fillRect(0, 0, 64, 4);
  return canvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: options.map || null,
    roughness: options.roughness ?? 0.92,
    metalness: 0,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive || '#080604',
    emissiveIntensity: options.emissiveIntensity ?? 0.015,
    // Feathers scatter light; the default env reflection reads as wet plastic.
    envMapIntensity: options.envMapIntensity ?? 0.3,
  });
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

// Primary feather lengths, innermost→outermost: a rounded finch hand, the
// mid-outer feathers longest. The primaries extend well past the hand shell,
// so the wingtip is a stack of separate feathers, not a single sheet.
const PRIMARY_LENGTHS = [0.26, 0.31, 0.36, 0.4, 0.42, 0.4, 0.35];
const PRIMARY_COUNT = PRIMARY_LENGTHS.length;

// Both wings are built identically spanning +x and mirrored with a static
// scale.x = -1 group, so the animation writes one set of Euler angles and the
// mirror keeps them symmetric — no per-side sign bookkeeping. (The mirror
// flips winding, so every material inside stays DoubleSide.)
// Layering, top to bottom: covert overlay, arm/hand base shells with the
// leading-edge muscle lofts riding on them, then the primaries fanning from
// the wrist, each staggered slightly lower than the one inside it so the
// stack reads from behind.
function Wing({ side, shoulderRef, handRef, featherRefs, geometries, materials }) {
  return (
    <group position={[side * 0.05, 0.372, 0.06]} scale={[side, 1, 1]}>
      <group ref={shoulderRef}>
        <mesh geometry={geometries.armWing} material={materials.armWing} castShadow />
        <mesh geometry={geometries.armCovert} material={materials.covert} castShadow position={[0, 0.01, 0.012]} />
        <mesh
          geometry={geometries.armMass}
          material={materials.armMass}
          castShadow
          rotation={[0, Math.PI / 2, 0]}
          position={[0, 0.004, 0.016]}
        />
        <group ref={handRef} position={[0.3, 0.006, -0.005]}>
          <mesh geometry={geometries.handWing} material={materials.handWing} castShadow />
          <mesh
            geometry={geometries.handMass}
            material={materials.armMass}
            castShadow
            rotation={[0, Math.PI / 2 + 0.24, 0]}
            position={[0.004, 0.002, -0.004]}
          />
          {geometries.primaries.map((geometry, i) => (
            <group
              key={`primary-${i}`}
              ref={el => { featherRefs.current[i] = el; }}
              position={[0.04 + i * 0.009, -0.001 - i * 0.0035, -0.03 - i * 0.007]}
            >
              <mesh geometry={geometry} material={materials.primary} castShadow />
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

export function ProceduralFinchPlayer({ motionRef }) {
  const root = useRef(null);
  const body = useRef(null);
  const head = useRef(null);
  const leftShoulder = useRef(null);
  const rightShoulder = useRef(null);
  const leftHand = useRef(null);
  const rightHand = useRef(null);
  const leftFeathers = useRef([]);
  const rightFeathers = useRef([]);
  const tail = useRef(null);
  const legs = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);

  const geometries = useMemo(() => ({
    // Torso: one continuous loft — plump and compact, shallow-bellied. The
    // last stations swell up into the nape so the head grows out of the body
    // instead of sitting on it like a snowman.
    body: makeLoftGeometry([
      { z: -0.28, y: 0.35, hw: 0.012, up: 0.012, down: 0.01 },
      { z: -0.235, y: 0.345, hw: 0.058, up: 0.05, down: 0.048 },
      { z: -0.15, y: 0.335, hw: 0.105, up: 0.09, down: 0.096 },
      { z: -0.04, y: 0.33, hw: 0.135, up: 0.108, down: 0.135 },
      { z: 0.06, y: 0.33, hw: 0.135, up: 0.105, down: 0.145 },
      { z: 0.14, y: 0.35, hw: 0.118, up: 0.092, down: 0.125 },
      { z: 0.21, y: 0.395, hw: 0.098, up: 0.08, down: 0.1 },
      { z: 0.26, y: 0.44, hw: 0.07, up: 0.06, down: 0.075 },
    ]),
    // Head: big and round — nearly the body's width; most of the charm.
    // The rear stations stay wide so the crown is a smooth dome flowing into
    // the nape, not a point that reads as a crest.
    head: makeLoftGeometry([
      { z: -0.09, y: -0.005, hw: 0.03, up: 0.024, down: 0.03 },
      { z: -0.055, y: 0.005, hw: 0.068, up: 0.056, down: 0.062 },
      { z: 0, y: 0.012, hw: 0.088, up: 0.075, down: 0.08 },
      { z: 0.055, y: 0.006, hw: 0.078, up: 0.06, down: 0.075 },
      { z: 0.1, y: -0.012, hw: 0.05, up: 0.034, down: 0.052 },
      { z: 0.12, y: -0.02, hw: 0.03, up: 0.02, down: 0.033 },
    ], { radialSegments: 24, lengthSegments: 30 }),
    // Finch beak: big, deep, conical — the seed-cracking wedge is a third of
    // the face in the reference bird.
    beak: makeLoftGeometry([
      { z: 0, y: -0.004, hw: 0.038, up: 0.042, down: 0.046 },
      { z: 0.028, y: -0.008, hw: 0.03, up: 0.032, down: 0.036 },
      { z: 0.06, y: -0.016, hw: 0.018, up: 0.018, down: 0.022 },
      { z: 0.088, y: -0.024, hw: 0.005, up: 0.005, down: 0.006 },
    ], { radialSegments: 14, lengthSegments: 16 }),
    armWing: makeWingShellGeometry({
      span: 0.33, rootChord: 0.34, tipChord: 0.3, sweep: 0.05,
      camber: 0.05, thickness: 0.05, arch: 0.03,
      scallops: 7, scallopDepth: 0.022, splitUV: true,
    }),
    // Covert overlay: a shorter shell floated just above the arm wing's front
    // half, so the top surface reads as stepped feather layers, not one sheet.
    armCovert: makeWingShellGeometry({
      span: 0.32, rootChord: 0.21, tipChord: 0.13, sweep: 0.05,
      camber: 0.055, thickness: 0.02, arch: 0.03,
      scallops: 8, scallopDepth: 0.014,
    }),
    // The hand shell is short — the wingtip itself belongs to the primaries.
    handWing: makeWingShellGeometry({
      span: 0.3, rootChord: 0.3, tipChord: 0.2, sweep: 0.14,
      camber: 0.03, thickness: 0.028, arch: 0.012,
      scallops: 5, scallopDepth: 0.02, splitUV: true,
    }),
    // Muscle-and-bone lofts hugging the leading edge (shoulder→wrist, plus a
    // slimmer one along the hand). Built along +z and rotated to span +x.
    // This mass is most of the difference between a bat membrane and a bird
    // arm seen from behind.
    armMass: makeLoftGeometry([
      { z: -0.02, y: 0, hw: 0.034, up: 0.03, down: 0.026 },
      { z: 0.09, y: 0.006, hw: 0.03, up: 0.024, down: 0.02 },
      { z: 0.2, y: 0.008, hw: 0.024, up: 0.018, down: 0.015 },
      { z: 0.3, y: 0.006, hw: 0.016, up: 0.012, down: 0.01 },
    ], { radialSegments: 12, lengthSegments: 12 }),
    handMass: makeLoftGeometry([
      { z: -0.01, y: 0, hw: 0.016, up: 0.014, down: 0.012 },
      { z: 0.08, y: 0.002, hw: 0.012, up: 0.01, down: 0.008 },
      { z: 0.17, y: 0, hw: 0.007, up: 0.006, down: 0.005 },
    ], { radialSegments: 10, lengthSegments: 10 }),
    // Individual primary feathers: solid mini-shells that fan from the wrist.
    primaries: PRIMARY_LENGTHS.map(len => makeWingShellGeometry({
      span: len, rootChord: 0.075, tipChord: 0.06, sweep: 0.02,
      camber: 0.01, thickness: 0.008, arch: 0.006,
      spanSegments: 8, chordSegments: 4,
    })),
    tail: makeTailGeometry({
      length: 0.27, rootHalfWidth: 0.05, tipHalfWidth: 0.105,
      scallops: 6, scallopDepth: 0.045,
    }),
  }), []);

  const textures = useMemo(() => {
    const rng = mulberry32(1859);
    return {
      // Dusty gray-brown, heavily mottled — the streaky female medium ground
      // finch. Wider value spread than reads right up close: Floreana's fog
      // compresses values hard, so the zones need room to survive it.
      body: paintBodyTexture({
        back: '#655741', backWarm: '#786a52', flank: '#9e8d6f', belly: '#ded2b6',
        rng, streakStrength: 0.3, scallopStrength: 0.1, mottleStrength: 1,
      }),
      head: paintBodyTexture({
        back: '#574b39', backWarm: '#6a5d48', flank: '#928263', belly: '#d2c6a8',
        rng, streakStrength: 0.16, scallopStrength: 0.06, mottleStrength: 0.45, size: 256, eyeBands: true,
      }),
      armWing: paintArmWingTexture(rng),
      handWing: paintHandWingTexture(rng),
      covert: paintCovertTexture(rng),
      primary: paintPrimaryFeatherTexture(),
      tail: paintTailTexture(rng),
      beak: paintBeakTexture(),
    };
  }, []);

  const materials = useMemo(() => ({
    body: material('#ffffff', { map: textures.body, roughness: 0.95 }),
    head: material('#ffffff', { map: textures.head, roughness: 0.94 }),
    // Wing tops get a touch less roughness than the body: flight feathers
    // have a faint sheen that down never does.
    armWing: material('#ffffff', { map: textures.armWing, side: THREE.DoubleSide, roughness: 0.84 }),
    handWing: material('#ffffff', { map: textures.handWing, side: THREE.DoubleSide, roughness: 0.84 }),
    covert: material('#ffffff', { map: textures.covert, side: THREE.DoubleSide, roughness: 0.86 }),
    primary: material('#ffffff', { map: textures.primary, side: THREE.DoubleSide, roughness: 0.86 }),
    armMass: material('#655843', { side: THREE.DoubleSide, roughness: 0.92 }),
    tail: material('#ffffff', { map: textures.tail, side: THREE.DoubleSide, roughness: 0.85 }),
    beak: material('#ffffff', { map: textures.beak, roughness: 0.45, envMapIntensity: 0.5 }),
    eye: material('#0a0705', { roughness: 0.25, emissive: '#020202', emissiveIntensity: 0.04, envMapIntensity: 0.8 }),
    eyeShine: material('#f4ede0', { roughness: 0.2, emissive: '#c9c0ae', emissiveIntensity: 0.5, envMapIntensity: 0.5 }),
    eyeRing: material('#a89a7c', { side: THREE.DoubleSide, roughness: 0.9 }),
    // Feathered thigh: flat belly-pale so it melts into the underbody.
    thigh: material('#b6a687', { roughness: 0.95 }),
    leg: material('#5a4f42', { roughness: 0.72 }),
  }), [textures]);

  const anim = useRef({
    flapPhase: 0,
    flapAmp: 0,
    wingSpread: 1,
    fan: 0,
    climb: 0,
    descend: 0,
    stepPhase: 0,
    walkAmp: 0,
  });

  useFrame(({ clock }, delta) => {
    const motion = motionRef.current || {};
    const flying = Boolean(motion.flying);
    const phase = motion.flightPhase || (flying ? 'cruise' : null);
    const takeoff = phase === 'takeoff';
    const landing = phase === 'landing';
    const action = motion.action;
    const speed = motion.speed || 0;
    const speedT = THREE.MathUtils.clamp(speed / 3.6, 0, 1.35);
    const flapHeld = Boolean(motion.flightFlap);
    const dive = Boolean(motion.flightDive);
    const descendHeld = Boolean(motion.flightDescend);
    const t = clock.elapsedTime;
    const peck = action === 'animalEat' ? Math.max(0, Math.sin(t * 17.5)) : 0;
    const sleep = action === 'animalSleep' ? 1 : 0;
    const defecate = action === 'animalDefecate' ? Math.sin(Math.min(1, (t * 3.2) % 1) * Math.PI) : 0;
    const groundedMoving = !flying && speed > 0.08 && !sleep;

    // Flap-bounce: fast straight cruising without held flap alternates short
    // wing bursts with brief glides — the undulating flight of a small finch.
    // Banking suppresses the bursts: a turning bird holds its wings set.
    const banking = Math.abs(motion.flightBank || 0) > 0.08;
    // A bird losing altitude sets its wings and rides down — no flapping.
    // flightPitch tracks vertical speed, so this also catches steep sink
    // without the descend key held.
    const sinkingHard = (motion.flightPitch || 0) > 0.09;
    const cruising = flying && !takeoff && !landing && !flapHeld && !banking
      && !descendHeld && !dive && !sinkingHard && speedT > 0.5;
    const burst = cruising && ((t % 2.5) / 2.5) < 0.4;

    // Wingbeat: a continuous phase accumulator (rate changes never pop) with
    // amplitude crossfading between full flaps, the landing flare, and the
    // near-still glide hold. Gliding means wings out, not slow flapping.
    const a = anim.current;

    // Climb (W) and descend (S) pose blends. Climb is a full powered reach;
    // descend is a swept, swift-like tuck — shift-dive deepens the same tuck
    // rather than being its own pose.
    // Climb always outranks descend — holding shift (dive) or S alongside W
    // must never silently cancel the climb flaps.
    const climbTarget = flying && flapHeld && !takeoff && !landing ? 1 : 0;
    const descendTarget = flying && !takeoff && !landing && !flapHeld
      ? (dive ? 1 : descendHeld ? 0.85 : 0)
      : 0;
    a.climb = THREE.MathUtils.damp(a.climb, climbTarget, 6, delta);
    a.descend = THREE.MathUtils.damp(a.descend, descendTarget, 6, delta);

    // Bird beats are slower and rounder than they feel like they should be —
    // the pace of the beat comes from the whole arm, not a wrist buzz.
    const descending = flying && (descendHeld || dive) && !flapHeld;
    // Climb rhythm: a burst of two or three deep beats, then a short
    // wings-set glide, repeating — a bird works its way up, it doesn't buzz.
    const climbBurst = flying && flapHeld && !takeoff && !landing
      && ((t % 1.7) / 1.7) < 0.55;
    const flapRate = takeoff ? 6.2
      : landing ? 3.4
      : flying && flapHeld ? 3.2
      : burst ? 4.2
      : flying ? 1
      : 2.2;
    a.flapPhase += delta * flapRate * Math.PI * 2;
    // Descending stills the wings completely — set, not slow-flapping.
    const ampTarget = takeoff ? 1.15
      : landing ? 0.5
      : descending ? 0
      : flying && flapHeld ? (climbBurst ? 1.12 : 0.06)
      : burst ? 0.85
      : flying ? 0.03
      : 0;
    a.flapAmp = THREE.MathUtils.damp(a.flapAmp, ampTarget, 6.5, delta);
    // Asymmetric stroke: the phase warp makes the downstroke snap through
    // faster than the recovery, which is what sells a powered wingbeat.
    // Climbing deepens the warp — a hard snap against a long, slow reach.
    const strokeWarp = 0.42 + a.climb * 0.15;
    const strokeWave = (p, w = strokeWarp) => Math.sin(p + w * Math.sin(p));
    const flap = strokeWave(a.flapPhase) * a.flapAmp;
    // Wingtips trail the shoulder by a fraction of a beat — most of the
    // difference between a stiff board and a wing.
    const flapOuter = strokeWave(a.flapPhase - 0.62) * a.flapAmp;
    const downstroke = Math.max(0, -flap);
    // Upstroke wrist flexion: birds fold the hand on the recovery stroke to
    // shed area, then snap it open for the downstroke. Bats can't — this is
    // the single strongest bird-vs-bat cue in the whole wingbeat.
    const upstrokeFlex = Math.max(0, strokeWave(a.flapPhase - 0.35)) * a.flapAmp;
    // How settled into a glide the wings are: 1 wings-out and still, 0
    // mid-flap. Drives the gull-wing wrist break and the primary fan.
    const glideBlend = flying && !takeoff && !landing
      ? 1 - THREE.MathUtils.clamp(a.flapAmp * 1.6, 0, 1)
      : 0;

    a.wingSpread = THREE.MathUtils.damp(a.wingSpread, flying ? 1 : 0, 7, delta);
    const spread = a.wingSpread;
    const fold = 1 - spread;

    // Ground locomotion: a quick-stepping walk. The phase accumulates with
    // speed (rate changes never pop) and walkAmp fades the gait in and out so
    // stopping settles the legs instead of freezing them mid-stride.
    const stepRate = (2.1 + Math.min(1.7, speed) * 1.5) * Math.PI * 2;
    if (groundedMoving) a.stepPhase += delta * stepRate;
    a.walkAmp = THREE.MathUtils.damp(a.walkAmp, groundedMoving ? 1 : 0, 10, delta);
    const stride = Math.sin(a.stepPhase) * a.walkAmp;
    const rootBob = flying
      ? downstroke * 0.03 * a.flapAmp
      : groundedMoving
        ? Math.abs(Math.cos(a.stepPhase)) * 0.014 * a.walkAmp
        : Math.sin(t * 3.1) * 0.004;

    if (root.current) {
      root.current.position.y = rootBob;
    }
    // Grounded stance carries the body closer to horizontal (chest gently
    // lifted, weight over the feet); walking leans a touch forward. Flight
    // pitch comes from the controller.
    const groundPitch = -0.12 + a.walkAmp * 0.08;
    if (body.current) {
      // Climbing rears the chest up toward the reach; descending noses over
      // into the tuck. Both ride on top of the controller's velocity pitch.
      const bodyPitch = flying
        ? (motion.flightPitch || 0) * 0.35
          + a.descend * 0.2
          - a.climb * 0.1
          + (takeoff ? -0.2 : 0)
          + (landing ? -0.16 : 0)
          - flap * 0.035
        : groundPitch - peck * 0.16 + sleep * 0.14;
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, bodyPitch, 9, delta);
      // Grounded walking adds a small side-to-side waddle onto the bank.
      const rollTarget = (motion.flightBank || 0) * 0.28 + (!flying ? stride * 0.045 : 0);
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, rollTarget, 7, delta);
      // Breathing: a barely-there swell, slower on the ground.
      const breathe = 1 + Math.sin(t * (flying ? 9 : 5.2)) * 0.005;
      body.current.scale.set(breathe, breathe, 1);
    }

    // Wings: one set of angles, mirrored by the static wing-root groups.
    // Flight pose blends into the folded pose (swept back along the flanks,
    // tips meeting over the rump) via the spread damp.
    const flareUp = landing ? -0.5 : 0;
    // Climbing raises the incidence: the bird leans into the air it's
    // grabbing rather than slicing through it.
    const flyIncidence = (takeoff ? 0.08 : -0.02 + speedT * 0.05) - downstroke * 0.1 + flareUp
      + a.climb * 0.06;
    // Figure-8 stroke: the wings sweep slightly forward through the
    // downstroke and back through the recovery, instead of pumping straight
    // up and down on a hinge.
    const strokeSweep = strokeWave(a.flapPhase - 0.2) * 0.09 * a.flapAmp;
    // Descending sweeps the whole wing back into a swift-like delta.
    const flySweepBack = (landing ? -0.12 : takeoff ? 0.02 : 0.12) + strokeSweep + a.descend * 0.48;
    const baseLift = landing ? 0.3 : (flapHeld || burst || takeoff) ? 0.2 : 0.08;
    // The glide breathes: a slow, barely-there rise and settle of the
    // dihedral, like the bird is constantly trimming against the air.
    const soar = Math.sin(t * 1.1) * 0.02 * glideBlend;
    const flyLift = baseLift + flap * 0.6 + soar - a.descend * 0.09;
    const shoulderX = THREE.MathUtils.lerp(flyIncidence, 0.24, fold);
    const shoulderY = THREE.MathUtils.lerp(flySweepBack, 1.3, fold);
    const shoulderZ = THREE.MathUtils.lerp(flyLift, 0.18, fold);
    // The hand twists through the stroke (leading edge dips on the
    // downstroke) — feathered wings wash, they don't stay flat.
    const handX = (-0.02 + flapOuter * 0.14) * spread;
    // Folded wrist: shoulder sweep + wrist fold ≈ 130° total, which lays the
    // primaries along the flank with the tips just crossing over the rump.
    // In the air the wrist flexes on every upstroke, and folds nearly
    // halfway in a descent tuck.
    const handY = THREE.MathUtils.lerp(-0.04 + upstrokeFlex * 0.4 + a.descend * 0.44, 0.95, fold);
    // Gull-wing glide: arm slightly up (baseLift), wrist broken slightly
    // down — from behind the wing is a shallow arched M, not a bat V.
    const handZ = THREE.MathUtils.lerp(flapOuter * 0.55 - glideBlend * 0.14 - a.descend * 0.1, 0.06, fold);
    for (const shoulder of [leftShoulder.current, rightShoulder.current]) {
      if (shoulder) shoulder.rotation.set(shoulderX, shoulderY, shoulderZ);
    }
    for (const hand of [leftHand.current, rightHand.current]) {
      if (hand) hand.rotation.set(handX, handY, handZ);
    }

    // Primaries: fanned wide in a glide, pulsing open on each downstroke,
    // stacked shut on the ground. Outer feathers lag the inner ones a beat,
    // so the wingtip reads as flexible feathers rather than a paddle.
    // Fingers close on the upstroke with the wrist, spread on the power
    // stroke, and slick down to a narrow point in a descent tuck.
    const fanTarget = (flying ? glideBlend + (1 - glideBlend) * (0.42 + 0.58 * downstroke) : 0)
      * (1 - 0.68 * a.descend);
    a.fan = THREE.MathUtils.damp(a.fan, fanTarget * spread, 9, delta);
    for (const featherSet of [leftFeathers.current, rightFeathers.current]) {
      for (let i = 0; i < featherSet.length; i += 1) {
        const feather = featherSet[i];
        if (!feather) continue;
        const k = i / (PRIMARY_COUNT - 1);
        const fanned = 0.05 + (0.3 + 0.55 * a.fan) * (1 - k);
        feather.rotation.y = THREE.MathUtils.lerp(0.16 + 0.06 * k, fanned, spread);
        // Stroke lag plus, in a descent, a faint airspeed tremble that grows
        // toward the tips — feathers buzzing in the slipstream.
        feather.rotation.z = strokeWave(a.flapPhase - 0.55 - i * 0.07) * 0.1 * a.flapAmp * (0.3 + 0.7 * k) * spread
          + Math.sin(t * 26 + i * 1.7) * 0.016 * a.descend * k;
        feather.rotation.x = flapOuter * 0.08 * k * spread;
      }
    }

    if (tail.current) {
      // Occasional upward tail flick while perched — pure idle charm.
      const flick = !flying && !groundedMoving
        ? Math.pow(Math.max(0, Math.sin(t * 1.35 + 1.2)), 24) * 0.4
        : 0;
      // Climbing spreads and depresses the tail — a broad brake-and-rudder
      // catching air under the climb; descending slims it into a streamer.
      const tailPitch = flying
        ? (landing ? -0.55 : -0.2 + (motion.flightPitch || 0) * -0.45 - a.climb * 0.3 + a.descend * 0.2 - defecate * 0.55)
        : -0.06 - defecate * 0.45 + flick;
      tail.current.rotation.x = THREE.MathUtils.damp(tail.current.rotation.x, tailPitch, 8, delta);
      tail.current.rotation.z = THREE.MathUtils.damp(tail.current.rotation.z, (motion.flightBank || 0) * -0.32, 8, delta);
      const tailSpread = flying
        ? (landing ? 1.45 : 1.1 + a.climb * 0.4 - a.descend * 0.42)
        : 0.95;
      tail.current.scale.x = THREE.MathUtils.damp(tail.current.scale.x, tailSpread, 5, delta);
    }
    if (head.current) {
      const scan = flying ? Math.sin(t * 1.9) * 0.05 : Math.sin(t * 3.7) * 0.12;
      // Head-bob with the steps — one nod per footfall, pigeon-style.
      const stepNod = Math.max(0, Math.sin(a.stepPhase * 2)) * 0.08 * a.walkAmp;
      // The head counter-rotates part of the grounded body pitch so the bird
      // looks ahead, not at the sky, when perched upright. Airborne it lifts
      // into a climb and tucks flat into a descent, leading the movement.
      const headLevel = flying ? -0.04 - a.climb * 0.09 + a.descend * 0.1 : -groundPitch * 0.55;
      head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, -peck * 0.95 + sleep * 0.72 + stepNod + headLevel, 10, delta);
      head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, scan + sleep * 0.45, 8, delta);
      head.current.position.y = THREE.MathUtils.damp(head.current.position.y, 0.465 - sleep * 0.12 - peck * 0.05, 10, delta);
      head.current.position.z = THREE.MathUtils.damp(head.current.position.z, 0.245 - sleep * 0.14 + peck * 0.05 + stepNod * 0.2, 10, delta);
    }
    if (legs.current) {
      // Tucked fully out of sight while cruising, reaching for the ground
      // through the landing flare. Grounded, the legs counter-rotate the
      // body's upright pitch so the tarsi stay vertical under the bird.
      const legPosY = flying ? (landing ? 0.06 : 0.26) : 0.02;
      const legRotX = flying ? (landing ? -0.4 : -1.4) : -groundPitch;
      const legScaleY = flying ? (landing ? 0.85 : 0.3) : 1;
      legs.current.position.y = THREE.MathUtils.damp(legs.current.position.y, legPosY, 7, delta);
      legs.current.rotation.x = THREE.MathUtils.damp(legs.current.rotation.x, legRotX, 8, delta);
      legs.current.scale.y = THREE.MathUtils.damp(legs.current.scale.y, legScaleY, 8, delta);
    }
    // Walk cycle: legs swing in antiphase from the hip; the swing fades with
    // walkAmp so a stop settles into a neutral stance. (The hip sits higher
    // now, so a smaller angle covers the same footfall.)
    if (leftLeg.current) leftLeg.current.rotation.x = stride * 0.42;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride * 0.42;
  });

  return (
    <group ref={root} scale={0.82} position={[0, 0.02, 0]}>
      <group ref={body}>
        <mesh geometry={geometries.body} material={materials.body} castShadow receiveShadow />
        <Wing side={-1} shoulderRef={leftShoulder} handRef={leftHand} featherRefs={leftFeathers} geometries={geometries} materials={materials} />
        <Wing side={1} shoulderRef={rightShoulder} handRef={rightHand} featherRefs={rightFeathers} geometries={geometries} materials={materials} />
        <group ref={tail} position={[0, 0.35, -0.24]}>
          <mesh geometry={geometries.tail} material={materials.tail} castShadow />
        </group>
        <group ref={head} position={[0, 0.465, 0.245]}>
          <mesh geometry={geometries.head} material={materials.head} castShadow receiveShadow />
          <mesh geometry={geometries.beak} material={materials.beak} castShadow position={[0, -0.008, 0.095]} />
          {/* Eyes: large, dark, set high on the head sides, with a fixed
              catchlight — the catchlight is most of the life in the face. */}
          {[-1, 1].map(side => (
            <group key={`eye-${side}`} position={[side * 0.07, 0.028, 0.048]} rotation={[0, side * 0.55, 0]}>
              <mesh rotation={[0, side * (Math.PI / 2), 0]} position={[side * 0.013, 0, 0]}>
                <ringGeometry args={[0.02, 0.026, 24]} />
                <primitive object={materials.eyeRing} attach="material" />
              </mesh>
              <mesh scale={[0.021, 0.021, 0.017]} position={[side * 0.004, 0, 0]}>
                <sphereGeometry args={[1, 16, 12]} />
                <primitive object={materials.eye} attach="material" />
              </mesh>
              <mesh scale={[0.0055, 0.0055, 0.004]} position={[side * 0.02, 0.007, 0.007]}>
                <sphereGeometry args={[1, 8, 6]} />
                <primitive object={materials.eyeShine} attach="material" />
              </mesh>
            </group>
          ))}
        </group>
        <group ref={legs} position={[0, 0.02, 0.04]}>
          {[-1, 1].map(side => (
            /* Hip pivot sits up inside the body so the feathered thigh
               overlaps the belly loft — legs must grow out of the bird, not
               hang under it. Foot offsets compensate to keep ground contact. */
            <group key={`leg-${side}`} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.062, 0.15, 0.01]}>
              {/* Feathered thigh: embedded into the belly, reaching down to
                  meet the bare tarsus. Painted belly-pale so it fades into
                  the underbody instead of reading as a separate dark egg. */}
              <mesh castShadow position={[0, 0.03, 0.004]} scale={[0.038, 0.062, 0.046]}>
                <sphereGeometry args={[1, 14, 10]} />
                <primitive object={materials.thigh} attach="material" />
              </mesh>
              <mesh castShadow rotation={[0.1, 0, side * 0.06]} position={[0, -0.082, 0]}>
                <cylinderGeometry args={[0.011, 0.013, 0.185, 8]} />
                <primitive object={materials.leg} attach="material" />
              </mesh>
              {/* Toes slope from the ankle down to the ground. */}
              {[0, -0.38, 0.38].map((toeAngle, index) => (
                <mesh key={`toe-${index}`} castShadow position={[0, -0.171, 0.028]} rotation={[Math.PI / 2 + 0.22, 0, toeAngle + side * 0.06]}>
                  <cylinderGeometry args={[0.0045, 0.0065, 0.08, 6]} />
                  <primitive object={materials.leg} attach="material" />
                </mesh>
              ))}
              <mesh castShadow position={[0, -0.171, -0.02]} rotation={[-Math.PI / 2 - 0.18, 0, 0]}>
                <cylinderGeometry args={[0.0045, 0.006, 0.05, 6]} />
                <primitive object={materials.leg} attach="material" />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
