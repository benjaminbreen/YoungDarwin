'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

// A cheap fake contact shadow: a single soft radial blob laid flat on the
// ground beneath a model. One transparent quad, no depth write, sharing one
// texture/geometry/material across every instance — so it costs almost nothing
// and complements the throttled real shadow map by re-grounding objects whose
// cast shadow is faint, distant, or briefly stale.

const CONTACT_SHADOW_OPACITY = 0.3; // intentionally subtle; tune here

let _texture = null;
let _geometry = null;
let _material = null;

function getResources() {
  if (typeof document === 'undefined') return null;
  if (!_texture) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    _texture = new THREE.CanvasTexture(canvas);
    _texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (!_geometry) _geometry = new THREE.PlaneGeometry(1, 1);
  if (!_material) {
    _material = new THREE.MeshBasicMaterial({
      color: '#160f06',
      alphaMap: _texture,
      transparent: true,
      opacity: CONTACT_SHADOW_OPACITY,
      depthWrite: false,
    });
  }
  return { geometry: _geometry, material: _material };
}

// `radius` is the blob's ground footprint; `y` keeps it just above the terrain
// (matching the game's other ground decals). `strength` scales opacity 0..1.
export function ContactShadow({ radius = 1, y = 0.03, strength = 1 }) {
  const res = useMemo(() => getResources(), []);
  const material = useMemo(() => {
    if (!res) return null;
    if (strength === 1) return res.material;
    const m = res.material.clone();
    m.opacity = CONTACT_SHADOW_OPACITY * strength;
    return m;
  }, [res, strength]);
  if (!res || !material) return null;
  return (
    <mesh
      geometry={res.geometry}
      material={material}
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[radius * 2, radius * 2, 1]}
      renderOrder={1}
    />
  );
}
