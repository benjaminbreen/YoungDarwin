'use client';

// The three paper specimens — a sealed letter, a folded newspaper, a foxed
// will. All three sat in interiors as the generic placeholder blob.
//
// Deliberately plain geometry: these are read through the examine view and the
// reading UI, so the world model only has to say "a document lies here" from
// across a room. The tell is the silhouette — a sealed fold, a masthead, a
// curled corner — not surface detail.

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const PAPER_VARIANTS = {
  governorsletter: {
    // Folded once and sealed: the sheet a governor hands across a desk.
    width: 0.19,
    depth: 0.135,
    sheets: 2,
    paper: '#e6dcc0',
    ink: '#3a3226',
    curl: 0.035,
    seal: '#8d2f28',
    rules: 5,
    ruleInset: 0.028,
  },
  timesoflondon: {
    // A newspaper is wider, thicker, and carries a masthead band.
    width: 0.34,
    depth: 0.245,
    sheets: 6,
    paper: '#ded4bb',
    ink: '#4a4436',
    curl: 0.02,
    seal: null,
    rules: 9,
    ruleInset: 0.02,
    masthead: true,
  },
  watkinswill: {
    // Weather-stained and curled hard at one corner after years in a hut.
    width: 0.175,
    depth: 0.125,
    sheets: 1,
    paper: '#d9c9a4',
    ink: '#4b3d2a',
    curl: 0.075,
    seal: null,
    rules: 6,
    ruleInset: 0.024,
    foxed: true,
  },
};

const SHEET_THICKNESS = 0.0016;

// A sheet is a plane with a lifted corner rather than a flat card: even a
// couple of millimetres of curl reads as paper instead of a tile.
function sheetGeometry({ width, depth, curl, foxed, seed }) {
  const segments = 8;
  const geometry = new THREE.BoxGeometry(width, SHEET_THICKNESS, depth, segments, 1, segments);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color();
  const stain = new THREE.Color('#a98a5c');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const u = x / width + 0.5;
    const v = z / depth + 0.5;
    // Corner lift, strongest at the far corner, plus a shallow sag elsewhere.
    const corner = Math.pow(Math.max(0, u * 0.6 + v * 0.4), 2.4);
    const wave = Math.sin(u * 3.1 + seed) * Math.sin(v * 2.3 - seed) * 0.18;
    position.setY(i, position.getY(i) + curl * (corner + wave));
    base.set('#ffffff');
    if (foxed) {
      const blotch = Math.sin(u * 9.3 + seed * 2.1) * Math.cos(v * 7.7 - seed);
      base.lerp(stain, THREE.MathUtils.clamp(blotch * 0.5 + 0.28, 0, 1) * 0.55);
    }
    colors[i * 3] = base.r;
    colors[i * 3 + 1] = base.g;
    colors[i * 3 + 2] = base.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 1000) / 1000;
}

export function isPaperSpecimen(specimenId) {
  return Boolean(PAPER_VARIANTS[specimenId]);
}

export function PaperSpecimenShape({ specimen }) {
  const variant = PAPER_VARIANTS[specimen.id] || PAPER_VARIANTS.governorsletter;
  const seed = useMemo(() => hash(specimen.instanceId || specimen.id) * 6.28, [specimen]);

  const parts = useMemo(() => {
    const sheets = Array.from({ length: variant.sheets }, (_, index) => sheetGeometry({
      width: variant.width * (1 - index * 0.012),
      depth: variant.depth * (1 - index * 0.014),
      curl: variant.curl * (1 - index * 0.1),
      foxed: variant.foxed && index === 0,
      seed: seed + index * 0.7,
    }));
    const paper = new THREE.MeshStandardMaterial({
      color: variant.paper,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const ink = new THREE.MeshStandardMaterial({ color: variant.ink, roughness: 0.85, metalness: 0 });
    const wax = variant.seal
      ? new THREE.MeshStandardMaterial({ color: variant.seal, roughness: 0.45, metalness: 0 })
      : null;
    return { sheets, paper, ink, wax };
  }, [seed, variant]);

  useEffect(() => () => {
    parts.sheets.forEach(geometry => geometry.dispose());
    parts.paper.dispose();
    parts.ink.dispose();
    parts.wax?.dispose();
  }, [parts]);

  const lineWidth = variant.width - variant.ruleInset * 2;
  return (
    <group rotation={[0, seed, 0]}>
      {parts.sheets.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          material={parts.paper}
          position={[index * 0.0022, index * SHEET_THICKNESS * 1.3 + 0.004, index * 0.0016]}
          rotation={[0, index * 0.02, 0]}
          castShadow
          receiveShadow
        />
      ))}
      {/* Lines of writing, blocked in rather than lettered. */}
      {Array.from({ length: variant.rules }, (_, index) => {
        const t = (index + 1) / (variant.rules + 1);
        const short = index === variant.rules - 1;
        return (
          <mesh
            key={`rule-${index}`}
            position={[
              short ? -lineWidth * 0.22 : 0,
              variant.sheets * SHEET_THICKNESS * 1.3 + 0.0055,
              (t - 0.5) * variant.depth * 0.82,
            ]}
          >
            <boxGeometry args={[short ? lineWidth * 0.5 : lineWidth, 0.0004, 0.0035]} />
            <primitive object={parts.ink} attach="material" />
          </mesh>
        );
      })}
      {variant.masthead ? (
        <mesh position={[0, variant.sheets * SHEET_THICKNESS * 1.3 + 0.0058, -variant.depth * 0.4]}>
          <boxGeometry args={[lineWidth * 0.78, 0.0005, 0.018]} />
          <primitive object={parts.ink} attach="material" />
        </mesh>
      ) : null}
      {parts.wax ? (
        <mesh
          position={[variant.width * 0.28, variant.sheets * SHEET_THICKNESS * 1.3 + 0.006, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.016, 0.017, 0.004, 14]} />
          <primitive object={parts.wax} attach="material" />
        </mesh>
      ) : null}
    </group>
  );
}
