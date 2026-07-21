'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldTime } from '../../world/worldTime';

const NO_RAYCAST_MATERIAL = {
  transparent: true,
  opacity: 0,
  depthWrite: false,
};

// --- Butterflies (Galápagos sulphur, gulf fritillary) ------------------------
// Close-up models built like the bee: solid low-poly shells merged by
// material. Each butterfly has a fuzzy thorax, tapered abdomen, eyed head with
// clubbed antennae, thin tucked legs, and four wings — authored forewing and
// hindwing silhouettes per side with canvas-painted patterns. The hindwings
// beat a few degrees behind the forewings, which is most of what makes the
// flap read as butterfly rather than machine.

// Normalize a wing Shape (hinge at origin, span +x, leading edge -y) into a
// flat XZ geometry with 0..1 UVs: u = hinge->tip, v = leading->trailing edge.
function finishSpecimenWing(shape, spanScale, chordScale) {
  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(
      i,
      (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x),
      (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y),
    );
  }
  uv.needsUpdate = true;
  geo.scale(spanScale, chordScale, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function sulphurForewingShape() {
  // Triangular pierid forewing: straight-ish leading edge to a soft apex,
  // gently convex outer margin, round tornus.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.12);
  shape.quadraticCurveTo(0.5, -0.32, 0.95, -0.40);
  shape.quadraticCurveTo(1.05, -0.30, 0.90, -0.06);
  shape.quadraticCurveTo(0.62, 0.18, 0.18, 0.24);
  shape.quadraticCurveTo(0.02, 0.16, 0, -0.12);
  return shape;
}

function sulphurHindwingShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.10);
  shape.quadraticCurveTo(0.45, -0.22, 0.78, -0.10);
  shape.quadraticCurveTo(1.0, 0.06, 0.82, 0.30);
  shape.quadraticCurveTo(0.5, 0.50, 0.16, 0.42);
  shape.quadraticCurveTo(0, 0.28, 0, -0.10);
  return shape;
}

function fritillaryForewingShape() {
  // Long, narrow, raked forward with a slightly hooked outer margin.
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.10);
  shape.quadraticCurveTo(0.55, -0.36, 1.0, -0.52);
  shape.quadraticCurveTo(1.08, -0.40, 0.86, -0.14);
  shape.quadraticCurveTo(0.5, 0.12, 0.14, 0.18);
  shape.quadraticCurveTo(0.02, 0.10, 0, -0.10);
  return shape;
}

function fritillaryHindwingShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.10);
  shape.quadraticCurveTo(0.42, -0.20, 0.74, -0.08);
  shape.quadraticCurveTo(0.96, 0.08, 0.78, 0.30);
  shape.quadraticCurveTo(0.46, 0.46, 0.14, 0.38);
  shape.quadraticCurveTo(0, 0.26, 0, -0.10);
  return shape;
}

// Canvas painting note: texture v=0 (the leading edge) samples the BOTTOM row
// of the canvas, so features are placed through yFromV.
function makeWingCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d'), yFromV: v => (1 - v) * size };
}

function veinFan(ctx, size, yFromV, style, width, count) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i += 1) {
    const spread = i / (count - 1);
    ctx.beginPath();
    ctx.moveTo(2, yFromV(0.42));
    ctx.quadraticCurveTo(
      size * 0.55,
      yFromV(0.06 + spread * 0.82),
      size * 0.99,
      yFromV(0.02 + spread * 0.94),
    );
    ctx.stroke();
  }
}

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

// Warm yellow field, faint fanned veins, a dusky apex wedge and margin
// flecks, and the rusty discal spot of the female cloudless sulphur.
function sulphurSpecimenTextures() {
  if (typeof document === 'undefined') return { fore: null, hind: null };
  const size = 256;
  const { canvas, ctx, yFromV } = makeWingCanvas(size);
  const base = ctx.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#fdf19a');
  base.addColorStop(0.5, '#f7da52');
  base.addColorStop(1, '#eec23a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  veinFan(ctx, size, yFromV, 'rgba(160, 120, 30, 0.22)', 2, 7);
  // Dusky apex: a crescent hugging the leading edge out to the tip.
  ctx.fillStyle = 'rgba(96, 64, 22, 0.68)';
  ctx.beginPath();
  ctx.moveTo(size * 0.60, yFromV(0));
  ctx.lineTo(size * 0.995, yFromV(0));
  ctx.quadraticCurveTo(size * 0.98, yFromV(0.4), size * 0.86, yFromV(0.28));
  ctx.quadraticCurveTo(size * 0.72, yFromV(0.1), size * 0.60, yFromV(0));
  ctx.fill();
  // Brown flecks stepping down the outer margin.
  ctx.fillStyle = 'rgba(110, 74, 26, 0.6)';
  for (const [u, v] of [[0.9, 0.42], [0.84, 0.58], [0.76, 0.72], [0.64, 0.84]]) {
    ctx.beginPath();
    ctx.ellipse(size * u, yFromV(v), size * 0.018, size * 0.013, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Discal spot.
  ctx.fillStyle = '#ad6a22';
  ctx.beginPath();
  ctx.ellipse(size * 0.46, yFromV(0.34), size * 0.028, size * 0.02, 0.25, 0, Math.PI * 2);
  ctx.fill();

  const hindCanvas = makeWingCanvas(size);
  const hindBase = hindCanvas.ctx.createLinearGradient(0, 0, size, 0);
  hindBase.addColorStop(0, '#fbeda0');
  hindBase.addColorStop(0.6, '#f3d75e');
  hindBase.addColorStop(1, '#e8c145');
  hindCanvas.ctx.fillStyle = hindBase;
  hindCanvas.ctx.fillRect(0, 0, size, size);
  veinFan(hindCanvas.ctx, size, hindCanvas.yFromV, 'rgba(160, 120, 30, 0.16)', 2, 6);
  hindCanvas.ctx.fillStyle = 'rgba(150, 96, 34, 0.4)';
  for (const [u, v] of [[0.86, 0.5], [0.78, 0.68], [0.62, 0.82]]) {
    hindCanvas.ctx.beginPath();
    hindCanvas.ctx.ellipse(size * u, hindCanvas.yFromV(v), size * 0.014, size * 0.011, 0, 0, Math.PI * 2);
    hindCanvas.ctx.fill();
  }
  return { fore: toTexture(canvas), hind: toTexture(hindCanvas.canvas) };
}

// Flame orange, bold black veining, white black-ringed forewing spots, a dark
// spotted margin, and molten silver spangles on the hindwing (duplicated to
// an emissive map so they gleam and catch bloom, matching the ambient flock).
function fritillarySpecimenTextures() {
  if (typeof document === 'undefined') return { fore: null, hind: null, hindEmissive: null };
  const size = 256;
  const { canvas, ctx, yFromV } = makeWingCanvas(size);
  const base = ctx.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#f08a28');
  base.addColorStop(0.55, '#e56f16');
  base.addColorStop(1, '#c95710');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  veinFan(ctx, size, yFromV, 'rgba(30, 16, 6, 0.7)', 3, 7);
  // Dark outer margin toward the tip.
  const margin = ctx.createLinearGradient(size * 0.78, 0, size, 0);
  margin.addColorStop(0, 'rgba(32, 18, 6, 0)');
  margin.addColorStop(1, 'rgba(24, 14, 5, 0.9)');
  ctx.fillStyle = margin;
  ctx.fillRect(size * 0.78, 0, size * 0.22, size);
  // Black cell dashes.
  ctx.fillStyle = 'rgba(28, 15, 5, 0.85)';
  for (const [u, v, r] of [[0.3, 0.3, 0.02], [0.46, 0.46, 0.022], [0.26, 0.56, 0.018], [0.56, 0.6, 0.018]]) {
    ctx.beginPath();
    ctx.ellipse(size * u, yFromV(v), size * r * 1.6, size * r, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Signature white spots ringed in black along the leading half.
  for (const [u, v] of [[0.5, 0.18], [0.62, 0.28], [0.4, 0.14]]) {
    ctx.strokeStyle = 'rgba(24, 13, 5, 0.95)';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#f5ede0';
    ctx.beginPath();
    ctx.ellipse(size * u, yFromV(v), size * 0.022, size * 0.017, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const hind = makeWingCanvas(size);
  const hindBase = hind.ctx.createLinearGradient(0, 0, size, 0);
  hindBase.addColorStop(0, '#ec8224');
  hindBase.addColorStop(0.6, '#e06a14');
  hindBase.addColorStop(1, '#c4530e');
  hind.ctx.fillStyle = hindBase;
  hind.ctx.fillRect(0, 0, size, size);
  veinFan(hind.ctx, size, hind.yFromV, 'rgba(30, 16, 6, 0.55)', 2.5, 6);
  // Wide black margin band carrying a row of orange lunules.
  const hindMargin = hind.ctx.createLinearGradient(size * 0.7, 0, size * 0.95, 0);
  hindMargin.addColorStop(0, 'rgba(26, 15, 5, 0)');
  hindMargin.addColorStop(1, 'rgba(22, 12, 4, 0.92)');
  hind.ctx.fillStyle = hindMargin;
  hind.ctx.fillRect(size * 0.7, 0, size * 0.3, size);
  hind.ctx.fillStyle = 'rgba(226, 120, 40, 0.9)';
  for (let i = 0; i < 4; i += 1) {
    hind.ctx.beginPath();
    hind.ctx.arc(size * 0.9, hind.yFromV(0.2 + i * 0.2), size * 0.016, 0, Math.PI * 2);
    hind.ctx.fill();
  }
  // Silver spangles: pale cores with a dark keyline, mirrored to emissive.
  const emissive = makeWingCanvas(size);
  emissive.ctx.fillStyle = '#000000';
  emissive.ctx.fillRect(0, 0, size, size);
  const spangles = [
    [0.2, 0.5, 0.045, 0.03], [0.36, 0.62, 0.05, 0.032], [0.54, 0.56, 0.045, 0.03],
    [0.28, 0.34, 0.038, 0.025], [0.46, 0.38, 0.04, 0.026], [0.62, 0.36, 0.034, 0.023],
  ];
  for (const [u, v, rx, ry] of spangles) {
    hind.ctx.strokeStyle = 'rgba(30, 18, 6, 0.85)';
    hind.ctx.lineWidth = 3;
    hind.ctx.fillStyle = '#e9eff5';
    hind.ctx.beginPath();
    hind.ctx.ellipse(size * u, hind.yFromV(v), size * rx, size * ry, -0.25, 0, Math.PI * 2);
    hind.ctx.fill();
    hind.ctx.stroke();
    emissive.ctx.fillStyle = '#cfd9e4';
    emissive.ctx.beginPath();
    emissive.ctx.ellipse(size * u, emissive.yFromV(v), size * rx * 0.8, size * ry * 0.8, -0.25, 0, Math.PI * 2);
    emissive.ctx.fill();
  }
  return { fore: toTexture(canvas), hind: toTexture(hind.canvas), hindEmissive: toTexture(emissive.canvas) };
}

// Slender lepidopteran body along +z: furred thorax, tapered abdomen trailing
// to a point, small round head.
function buildButterflyBodyGeometry() {
  const thorax = new THREE.SphereGeometry(1, 12, 10);
  roughenGeometry(thorax, 0.12);
  thorax.scale(0.0042, 0.0042, 0.0062);
  thorax.translate(0, 0.0004, 0.006);
  const profile = [
    [0.0008, 0],
    [0.0032, 0.004],
    [0.0038, 0.011],
    [0.0028, 0.02],
    [0.0008, 0.028],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const abdomen = new THREE.LatheGeometry(profile, 14);
  abdomen.rotateX(-Math.PI / 2);
  abdomen.translate(0, -0.0004, 0.0015);
  const head = new THREE.SphereGeometry(1, 10, 8);
  head.scale(0.0028, 0.0028, 0.0026);
  head.translate(0, 0.0008, 0.0122);
  const geo = mergeGeometries([thorax, abdomen, head], false);
  thorax.dispose();
  abdomen.dispose();
  head.dispose();
  return geo;
}

function buildButterflyEyesGeometry() {
  const parts = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1, 8, 6);
    eye.scale(0.0013, 0.0016, 0.0013);
    eye.translate(side * 0.0021, 0.001, 0.0132);
    parts.push(eye);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return geo;
}

// Thin legs plus clubbed antennae. Nymphalids (the fritillary) walk on four
// legs; the sulphur shows all six.
function buildButterflyLimbsGeometry(fourLegged) {
  const parts = [];
  const dir = new THREE.Vector3();
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const segment = (start, pitch, splay, len, r1, r2) => {
    const geo = new THREE.CylinderGeometry(r1, r2, len, 4, 1);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(pitch);
    geo.rotateZ(splay);
    geo.translate(start.x, start.y, start.z);
    parts.push(geo);
    dir.set(0, -1, 0).applyAxisAngle(X_AXIS, pitch).applyAxisAngle(Z_AXIS, splay);
    return start.clone().addScaledVector(dir, len);
  };
  for (const side of [-1, 1]) {
    if (!fourLegged) {
      const f = segment(new THREE.Vector3(side * 0.0022, -0.002, 0.0092), -0.4, side * 0.7, 0.005, 0.0006, 0.0005);
      segment(f, 0.1, side * 0.2, 0.005, 0.0004, 0.0003);
    }
    const m = segment(new THREE.Vector3(side * 0.0028, -0.0025, 0.006), 0.15, side * 0.85, 0.0055, 0.0006, 0.0005);
    segment(m, 0.45, side * 0.25, 0.0055, 0.0004, 0.0003);
    const h = segment(new THREE.Vector3(side * 0.0026, -0.0028, 0.0032), 0.7, side * 0.65, 0.006, 0.0006, 0.0005);
    segment(h, 1.0, side * 0.2, 0.006, 0.0004, 0.0003);
    // Antenna: one long thin shaft angled up-forward, tipped with a club.
    const a = segment(new THREE.Vector3(side * 0.0014, 0.0028, 0.0135), -2.05, side * 0.45, 0.013, 0.00045, 0.00035);
    const club = new THREE.SphereGeometry(1, 6, 5);
    club.scale(0.0008, 0.0008, 0.0013);
    club.translate(a.x, a.y, a.z);
    parts.push(club);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return geo;
}

const BUTTERFLY_SPECIMEN_LOOKS = {
  sulphur: {
    bodyColor: '#4a3d24',
    flapFreq: 6.1,
    foreSpan: 0.034,
    foreChord: 0.030,
    hindSpan: 0.026,
    hindChord: 0.028,
    fourLegged: false,
    foreShape: sulphurForewingShape,
    hindShape: sulphurHindwingShape,
    textures: sulphurSpecimenTextures,
  },
  fritillary: {
    bodyColor: '#552f12',
    flapFreq: 7.2,
    foreSpan: 0.038,
    foreChord: 0.026,
    hindSpan: 0.026,
    hindChord: 0.028,
    fourLegged: true,
    foreShape: fritillaryForewingShape,
    hindShape: fritillaryHindwingShape,
    textures: fritillarySpecimenTextures,
  },
};

function useButterflySpecimenAssets(species) {
  const assets = useMemo(() => {
    const look = BUTTERFLY_SPECIMEN_LOOKS[species];
    const bodyGeo = buildButterflyBodyGeometry();
    const eyesGeo = buildButterflyEyesGeometry();
    const limbsGeo = buildButterflyLimbsGeometry(look.fourLegged);
    const foreGeo = finishSpecimenWing(look.foreShape(), look.foreSpan, look.foreChord);
    const hindGeo = finishSpecimenWing(look.hindShape(), look.hindSpan, look.hindChord);
    const textures = look.textures();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: look.bodyColor,
      roughness: 0.9,
      metalness: 0,
    });
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: '#1c150e',
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    });
    const limbMat = new THREE.MeshStandardMaterial({
      color: '#241a10',
      roughness: 0.85,
      metalness: 0,
    });
    // Scale wings read matte; a whisper of emissive keeps the pattern legible
    // when the wing tilts away from the sun.
    const foreMat = new THREE.MeshStandardMaterial({
      map: textures.fore || undefined,
      color: '#ffffff',
      roughness: 0.82,
      metalness: 0,
      emissive: species === 'fritillary' ? '#5c2c08' : '#57470f',
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    const hindMat = new THREE.MeshStandardMaterial({
      map: textures.hind || undefined,
      color: '#ffffff',
      roughness: 0.82,
      metalness: 0,
      emissiveMap: textures.hindEmissive || null,
      emissive: textures.hindEmissive ? '#b8c6d6' : (species === 'fritillary' ? '#5c2c08' : '#57470f'),
      emissiveIntensity: textures.hindEmissive ? 0.85 : 0.22,
      side: THREE.DoubleSide,
    });
    return { look, bodyGeo, eyesGeo, limbsGeo, foreGeo, hindGeo, textures, bodyMat, eyeMat, limbMat, foreMat, hindMat };
  }, [species]);
  useEffect(() => () => {
    assets.bodyGeo.dispose();
    assets.eyesGeo.dispose();
    assets.limbsGeo.dispose();
    assets.foreGeo.dispose();
    assets.hindGeo.dispose();
    assets.textures.fore?.dispose?.();
    assets.textures.hind?.dispose?.();
    assets.textures.hindEmissive?.dispose?.();
    assets.bodyMat.dispose();
    assets.eyeMat.dispose();
    assets.limbMat.dispose();
    assets.foreMat.dispose();
    assets.hindMat.dispose();
  }, [assets]);
  return assets;
}

function ButterflyShape({ fritillary = false }) {
  const assets = useButterflySpecimenAssets(fritillary ? 'fritillary' : 'sulphur');
  const bodyRef = useRef(null);
  const foreRefs = useRef([null, null]);
  const hindRefs = useRef([null, null]);
  useFrame(() => {
    const t = worldTime.elapsed;
    const freq = assets.look.flapFreq;
    // Occasional glide: the flap flattens out for a beat or two, wings held
    // in a shallow V, then resumes — the sail-and-flutter rhythm of the real
    // animals. Hindwings trail the forewings by a fixed phase lag.
    const glide = Math.pow(Math.max(0, Math.sin(t * 0.31 + (fritillary ? 2.1 : 0))), 8);
    const amp = THREE.MathUtils.lerp(0.88, 0.14, glide);
    const rest = THREE.MathUtils.lerp(0.26, 0.42, glide);
    const flap = rest + Math.sin(t * freq) * amp;
    const hindFlap = rest + Math.sin(t * freq - 0.45) * amp * 0.9;
    for (let i = 0; i < 2; i += 1) {
      if (foreRefs.current[i]) foreRefs.current[i].rotation.z = flap;
      if (hindRefs.current[i]) hindRefs.current[i].rotation.z = hindFlap;
    }
    if (bodyRef.current) {
      // Each downstroke pumps the body up a touch and rocks it nose-down.
      bodyRef.current.position.y = Math.sin(t * freq - 1.1) * 0.0016;
      bodyRef.current.rotation.x = -0.08 + Math.sin(t * freq - 0.6) * 0.05;
    }
  });
  return (
    <group ref={bodyRef}>
      <mesh geometry={assets.bodyGeo} material={assets.bodyMat} castShadow />
      <mesh geometry={assets.eyesGeo} material={assets.eyeMat} />
      <mesh geometry={assets.limbsGeo} material={assets.limbMat} />
      {[-1, 1].map((side, i) => (
        // One wing geometry pair serves both sides via the mirrored parent.
        <group key={side} position={[side * 0.0022, 0.0038, 0.0075]} scale={[side, 1, 1]}>
          <mesh
            ref={el => { foreRefs.current[i] = el; }}
            geometry={assets.foreGeo}
            material={assets.foreMat}
            rotation-y={-0.14}
            castShadow
          />
          <mesh
            ref={el => { hindRefs.current[i] = el; }}
            geometry={assets.hindGeo}
            material={assets.hindMat}
            position={[0, -0.0005, -0.0042]}
            rotation-y={0.38}
            castShadow
          />
        </group>
      ))}
      <mesh scale={[0.11, 0.08, 0.11]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial {...NO_RAYCAST_MATERIAL} />
      </mesh>
    </group>
  );
}

// --- Carpenter bee (Xylocopa darwini, female) --------------------------------
// Hand-authored close-up model for the examine view. The reference animal is
// matte blue-black all over: plump banded abdomen, densely furred thorax, a
// small head with big compound eyes and elbowed antennae, six tucked hairy
// legs, and two wing pairs whose smoky membranes carry all of the blue-violet
// iridescence. Solid low-poly shells merged by material — the whole bee is
// eight draw calls.

// Position-hashed noise so duplicated seam vertices displace identically.
function hashUnit(x, y, z) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function roughenGeometry(geometry, amount) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + (hashUnit(v.x, v.y, v.z) - 0.5) * amount;
    pos.setXYZ(i, v.x * n, v.y * n, v.z * n);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Abdomen: a plump lathed teardrop, front at z=0 running back to z=-0.042.
function buildAbdomenGeometry() {
  const profile = [
    [0.0012, 0],
    [0.0088, 0.0035],
    [0.0126, 0.010],
    [0.0142, 0.018],
    [0.0137, 0.026],
    [0.0116, 0.032],
    [0.0076, 0.0375],
    [0.0016, 0.0415],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 26);
  geo.rotateX(-Math.PI / 2); // profile axis +Y -> -Z, so the tip is the rear
  geo.translate(0, 0.0005, 0.001);
  return geo;
}

// Tergite banding lives in a tiny canvas: the lathe's v coordinate runs
// front-to-rear along the profile, so bands are horizontal stripes.
function abdomenBandTexture() {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, size, size);
  // Five segment seams, closer together toward the rear, each a dark groove
  // with a faint sheen line trailing it.
  const seams = [0.24, 0.42, 0.58, 0.72, 0.84];
  for (const v of seams) {
    const y = v * size;
    ctx.fillStyle = 'rgba(3, 3, 7, 0.9)';
    ctx.fillRect(0, y - 1.4, size, 2.8);
    ctx.fillStyle = 'rgba(46, 50, 72, 0.35)';
    ctx.fillRect(0, y + 1.6, size, 1.2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Head + thorax share one matte "fur" material; eyes get their own gloss.
function buildForebodyGeometry() {
  const thorax = new THREE.SphereGeometry(1, 16, 12);
  roughenGeometry(thorax, 0.09); // velvety pile silhouette, not a smooth ball
  thorax.scale(0.0128, 0.0122, 0.0132);
  thorax.translate(0, 0.0012, 0.0125);
  const head = new THREE.SphereGeometry(1, 14, 10);
  head.scale(0.0084, 0.0080, 0.0068);
  head.translate(0, 0.0002, 0.0302);
  const geo = mergeGeometries([thorax, head], false);
  thorax.dispose();
  head.dispose();
  return geo;
}

function buildEyesGeometry() {
  const parts = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(1, 10, 8);
    eye.scale(0.0028, 0.0044, 0.0032);
    eye.rotateY(side * 0.35);
    eye.translate(side * 0.0054, 0.0008, 0.0322);
    parts.push(eye);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return geo;
}

// Legs and antennae: chains of short tapered cylinders. Each segment hangs
// from `start` along -Y rotated by pitch (about X) then splay (about Z), and
// returns its endpoint so the next segment can continue the chain.
function buildLimbsGeometry() {
  const parts = [];
  const dir = new THREE.Vector3();
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const segment = (start, pitch, splay, len, r1, r2) => {
    const geo = new THREE.CylinderGeometry(r1, r2, len, 5, 1);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(pitch);
    geo.rotateZ(splay);
    geo.translate(start.x, start.y, start.z);
    parts.push(geo);
    dir.set(0, -1, 0).applyAxisAngle(X_AXIS, pitch).applyAxisAngle(Z_AXIS, splay);
    return start.clone().addScaledVector(dir, len);
  };

  for (const side of [-1, 1]) {
    // Front pair: reach forward under the head.
    let p = segment(new THREE.Vector3(side * 0.007, -0.003, 0.020), -0.55, side * 0.85, 0.009, 0.0013, 0.0011);
    p = segment(p, -0.25, side * 0.30, 0.009, 0.0010, 0.0008);
    segment(p, 0.15, side * 0.10, 0.006, 0.0007, 0.0004);
    // Mid pair: splayed out and down.
    p = segment(new THREE.Vector3(side * 0.009, -0.004, 0.012), 0.1, side * 1.0, 0.010, 0.0014, 0.0011);
    p = segment(p, 0.3, side * 0.35, 0.010, 0.0011, 0.0008);
    segment(p, 0.5, side * 0.12, 0.007, 0.0007, 0.0004);
    // Hind pair: the big hairy pollen legs, trailing back along the abdomen.
    p = segment(new THREE.Vector3(side * 0.008, -0.005, 0.004), 0.75, side * 0.75, 0.012, 0.0017, 0.0015);
    p = segment(p, 1.0, side * 0.28, 0.012, 0.0016, 0.0010); // broad tibia
    segment(p, 1.25, side * 0.10, 0.008, 0.0008, 0.0004);
    // Antenna: short scape angled up-forward, then the elbowed flagellum
    // drooping ahead of the face.
    p = segment(new THREE.Vector3(side * 0.0028, 0.0062, 0.0330), -2.25, side * 0.28, 0.005, 0.0007, 0.0006);
    segment(p, -1.55, side * 0.18, 0.0095, 0.0005, 0.0003);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  // Hashed roughening breaks the clean cylinder silhouette into bristle.
  return roughenGeometry(geo, 0.05);
}

// Wing silhouette in XY (hinge at origin, span +x, leading edge at -y), then
// laid flat into XZ with the body's +z forward. Long, round-tipped, slightly
// narrower at the base — a carpenter bee wing, not an ellipse.
function buildWingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.11);
  shape.quadraticCurveTo(0.42, -0.21, 0.80, -0.13);
  shape.quadraticCurveTo(1.06, -0.03, 0.94, 0.10);
  shape.quadraticCurveTo(0.58, 0.25, 0.14, 0.17);
  shape.quadraticCurveTo(0.01, 0.11, 0, -0.11);
  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(
      i,
      (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x),
      (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y),
    );
  }
  uv.needsUpdate = true;
  geo.scale(0.038, 0.030, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Smoky membrane with the blue-violet gradient of the reference photo — dark
// violet at the hinge shading through cobalt to a paler steel-blue tip — and
// dark veins fanning from the base, densest along the leading edge.
function beeWingTexture() {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#241a3e');
  base.addColorStop(0.35, '#2c3f8f');
  base.addColorStop(0.75, '#4a6ac0');
  base.addColorStop(1, '#7d97d4');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(10, 8, 24, 0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(1, size * 0.42);
    ctx.quadraticCurveTo(size * 0.5, size * (0.06 + i * 0.15), size * 0.99, size * (0.02 + i * 0.18));
    ctx.stroke();
  }
  // Cross-veins closing the cells near the leading edge.
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(10, 8, 24, 0.4)';
  for (const [x1, y1, x2, y2] of [[0.3, 0.14, 0.32, 0.3], [0.5, 0.1, 0.53, 0.3], [0.68, 0.12, 0.7, 0.32]]) {
    ctx.beginPath();
    ctx.moveTo(size * x1, size * y1);
    ctx.lineTo(size * x2, size * y2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function useCarpenterBeeAssets() {
  const assets = useMemo(() => {
    const abdomenGeo = buildAbdomenGeometry();
    const forebodyGeo = buildForebodyGeometry();
    const eyesGeo = buildEyesGeometry();
    const limbsGeo = buildLimbsGeometry();
    const wingGeo = buildWingGeometry();
    const bandTexture = abdomenBandTexture();
    const wingTexture = beeWingTexture();
    // The body reads matte black with a lacquered sheen; the blue belongs to
    // the wings. Emissive stays near zero so the bee sits in the scene light.
    const abdomenMat = new THREE.MeshPhysicalMaterial({
      color: '#101018',
      map: bandTexture || undefined,
      roughness: 0.42,
      metalness: 0.15,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35,
    });
    const furMat = new THREE.MeshStandardMaterial({
      color: '#0c0c11',
      roughness: 0.92,
      metalness: 0.05,
    });
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: '#17130f',
      roughness: 0.18,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const limbMat = new THREE.MeshStandardMaterial({
      color: '#0a0a0e',
      roughness: 0.85,
      metalness: 0.05,
    });
    const wingMat = new THREE.MeshPhysicalMaterial({
      map: wingTexture || undefined,
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
      roughness: 0.22,
      metalness: 0.35,
      iridescence: 0.85,
      iridescenceIOR: 1.6,
      emissive: '#22366e',
      emissiveIntensity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return {
      abdomenGeo, forebodyGeo, eyesGeo, limbsGeo, wingGeo,
      bandTexture, wingTexture,
      abdomenMat, furMat, eyeMat, limbMat, wingMat,
    };
  }, []);
  useEffect(() => () => {
    assets.abdomenGeo.dispose();
    assets.forebodyGeo.dispose();
    assets.eyesGeo.dispose();
    assets.limbsGeo.dispose();
    assets.wingGeo.dispose();
    assets.bandTexture?.dispose?.();
    assets.wingTexture?.dispose?.();
    assets.abdomenMat.dispose();
    assets.furMat.dispose();
    assets.eyeMat.dispose();
    assets.limbMat.dispose();
    assets.wingMat.dispose();
  }, [assets]);
  return assets;
}

function CarpenterBeeShape() {
  const assets = useCarpenterBeeAssets();
  const bodyRef = useRef(null);
  const leftWings = useRef(null);
  const rightWings = useRef(null);
  useFrame(() => {
    const t = worldTime.elapsed;
    // Fast strobing beat with a raised rest angle, plus a light hover tremor
    // through the whole body so the bee never hangs dead-still.
    const flap = 0.32 + Math.sin(t * 74) * 0.5;
    if (leftWings.current) leftWings.current.rotation.z = flap;
    if (rightWings.current) rightWings.current.rotation.z = flap;
    if (bodyRef.current) {
      bodyRef.current.rotation.x = 0.06 + Math.sin(t * 3.1) * 0.035;
      bodyRef.current.position.y = Math.sin(t * 5.3) * 0.0012;
    }
  });
  return (
    <group ref={bodyRef}>
      <mesh geometry={assets.abdomenGeo} material={assets.abdomenMat} castShadow />
      <mesh geometry={assets.forebodyGeo} material={assets.furMat} castShadow />
      <mesh geometry={assets.eyesGeo} material={assets.eyeMat} />
      <mesh geometry={assets.limbsGeo} material={assets.limbMat} castShadow />
      {[-1, 1].map(side => (
        // Left side mirrors the right through the group scale, so one wing
        // geometry and one flap value serve both sides.
        <group key={side} position={[side * 0.004, 0.0108, 0.0135]} scale={[side, 1, 1]}>
          <group ref={side < 0 ? leftWings : rightWings}>
            <mesh geometry={assets.wingGeo} material={assets.wingMat} rotation-y={-0.18} />
            <mesh
              geometry={assets.wingGeo}
              material={assets.wingMat}
              position={[0, -0.0006, -0.003]}
              rotation-y={0.34}
              scale={[0.62, 1, 0.62]}
            />
          </group>
        </group>
      ))}
      <mesh scale={[0.11, 0.09, 0.13]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial {...NO_RAYCAST_MATERIAL} />
      </mesh>
    </group>
  );
}

export function PollinatorSpecimenShape({ specimen }) {
  if (specimen.id === 'galapagoscarpenterbee') return <CarpenterBeeShape />;
  return <ButterflyShape fritillary={specimen.id === 'galapagosgulffritillary'} />;
}
