'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { hash, ropePoint } from './primitives';

// Things hung on lines — printed sheets over the press, herbs and jerky over
// the hearth — built into one geometry per kind with an `aHang` attribute (the
// drop below the line) that the swaying materials in caveMaterials.js read.

function pushQuad(out, corners, uvs, hangs, normal) {
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    out.position.push(...corners[index]);
    out.uv.push(...uvs[index]);
    out.hang.push(hangs[index]);
    out.normal.push(...normal);
  }
}

function finish(out) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geometry.setAttribute('aHang', new THREE.Float32BufferAttribute(out.hang, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

// lines: [{ a: [x,y,z], b: [x,y,z], sag, count, width, height }]
export function buildSheetGeometry(lines, seed = 1) {
  const out = { position: [], uv: [], hang: [], normal: [] };
  let index = 0;
  for (const line of lines) {
    const { a, b, sag = 0.06, count = 6, width = 0.4, height = 0.28 } = line;
    const along = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
    const side = new THREE.Vector3(-along.z, 0, along.x);
    for (let i = 0; i < count; i += 1) {
      index += 1;
      if (hash(index, seed) < 0.12) continue;
      const t = (i + 0.5 + (hash(index, seed + 1) - 0.5) * 0.3) / count;
      const top = ropePoint(a, b, t, sag);
      const w = width * (0.9 + hash(index, seed + 2) * 0.15);
      const h = height * (0.9 + hash(index, seed + 3) * 0.2);
      const quadrant = Math.floor(hash(index, seed + 4) * 4);
      const u0 = (quadrant % 2) * 0.5;
      const v0 = quadrant < 2 ? 0.5 : 0;
      for (const flank of [-1, 1]) {
        // Each half of the folded sheet hangs a little off vertical.
        const lean = 0.07 + hash(index, seed + 5 + flank) * 0.08;
        const out0 = side.clone().multiplyScalar(flank * lean * h);
        const halfAlong = along.clone().multiplyScalar(w / 2);
        const tl = [top[0] - halfAlong.x, top[1], top[2] - halfAlong.z];
        const tr = [top[0] + halfAlong.x, top[1], top[2] + halfAlong.z];
        const br = [tr[0] + out0.x, tr[1] - h, tr[2] + out0.z];
        const bl = [tl[0] + out0.x, tl[1] - h, tl[2] + out0.z];
        const uvTop = flank > 0 ? v0 + 0.5 : v0 + 0.25;
        const uvBottom = flank > 0 ? v0 + 0.25 : v0;
        const normal = side.clone().multiplyScalar(flank).toArray();
        pushQuad(
          out,
          [tl, tr, br, bl],
          [[u0, uvTop], [u0 + 0.5, uvTop], [u0 + 0.5, uvBottom], [u0, uvBottom]],
          [0, 0, h, h],
          normal,
        );
      }
    }
  }
  return finish(out);
}

// Bunches of herbs or strips of meat on short strings from a line.
export function buildBunchGeometry(lines, seed = 5) {
  const out = { position: [], uv: [], hang: [], normal: [] };
  let index = 0;
  for (const line of lines) {
    const { a, b, sag = 0.08, count = 5, length = 0.3, width = 0.12 } = line;
    for (let i = 0; i < count; i += 1) {
      index += 1;
      const t = (i + 0.5) / count;
      const top = ropePoint(a, b, t, sag);
      const string = 0.04 + hash(index, seed) * 0.06;
      const l = length * (0.75 + hash(index, seed + 1) * 0.5);
      const cards = line.cards ?? 3;
      for (let k = 0; k < cards; k += 1) {
        const angle = (k / cards) * Math.PI + hash(index, seed + 2) * 0.6;
        const dx = Math.cos(angle) * width / 2;
        const dz = Math.sin(angle) * width / 2;
        const y0 = top[1] - string;
        // Bunches flare at the bottom like hung herbs.
        const flare = line.flare ?? 1.4;
        pushQuad(
          out,
          [
            [top[0] - dx * 0.4, y0, top[2] - dz * 0.4],
            [top[0] + dx * 0.4, y0, top[2] + dz * 0.4],
            [top[0] + dx * flare, y0 - l, top[2] + dz * flare],
            [top[0] - dx * flare, y0 - l, top[2] - dz * flare],
          ],
          [[0, 1], [1, 1], [1, 0], [0, 0]],
          [string, string, string + l, string + l],
          [Math.sin(angle), 0, -Math.cos(angle)],
        );
      }
    }
  }
  return finish(out);
}

export function HangingMesh({ build, lines, seed, material, name, castShadow = true }) {
  const geometry = useMemo(() => build(lines, seed), [build, lines, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      name={name}
      geometry={geometry}
      material={material}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      userData={{ noBatch: true }}
    />
  );
}
