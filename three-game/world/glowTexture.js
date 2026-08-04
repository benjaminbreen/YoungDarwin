import * as THREE from 'three';

let radialGlowTexture = null;

// Soft white radial falloff, tinted per-use by the sprite's material colour.
// One shared texture: every aura in the game wants the same gradient.
export function getRadialGlowTexture() {
  if (radialGlowTexture || typeof document === 'undefined') return radialGlowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.24)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  radialGlowTexture = new THREE.CanvasTexture(canvas);
  radialGlowTexture.colorSpace = THREE.NoColorSpace;
  radialGlowTexture.minFilter = THREE.LinearFilter;
  radialGlowTexture.magFilter = THREE.LinearFilter;
  radialGlowTexture.generateMipmaps = false;
  radialGlowTexture.needsUpdate = true;
  return radialGlowTexture;
}
