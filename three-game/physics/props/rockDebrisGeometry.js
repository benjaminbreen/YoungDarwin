import * as THREE from 'three';

// Shared procedural geometry for hammer-sampling debris and loose-stone props:
// noise-displaced low-poly rocks with planar fracture cuts and (optionally)
// carved bite scoops. Fracture/bite faces get a fresh-interior vertex color;
// the rest keeps the weathered rind color. Scale is baked into the positions
// so the same vertex array can drive a convex hull collider.

export function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnit(seed, salt = 0) {
  const value = Math.sin((hashString(seed) + salt * 1013) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export const DEBRIS_COLOR_LIFT = new THREE.Color('#d8d1c0');

function paintFaceColors(geo, seed, { isFractureFace, rind, fracture, jitterBase = 0.92, jitterSpan = 0.16 }) {
  const position = geo.attributes.position;
  const faceColor = new THREE.Color();
  const colors = new Float32Array(position.count * 3);
  const face = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < position.count; i += 3) {
    face[0].fromBufferAttribute(position, i);
    face[1].fromBufferAttribute(position, i + 1);
    face[2].fromBufferAttribute(position, i + 2);
    faceColor.copy(isFractureFace(face) ? fracture : rind);
    faceColor.multiplyScalar(jitterBase + seededUnit(seed, 40 + i) * jitterSpan);
    for (let corner = 0; corner < 3; corner += 1) {
      colors[(i + corner) * 3] = faceColor.r;
      colors[(i + corner) * 3 + 1] = faceColor.g;
      colors[(i + corner) * 3 + 2] = faceColor.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function debrisColors({ rindColor, fractureColor, liftColors }) {
  const rind = new THREE.Color(rindColor);
  const fracture = new THREE.Color(fractureColor);
  if (liftColors) {
    rind.lerp(DEBRIS_COLOR_LIFT, 0.42);
    fracture.lerp(DEBRIS_COLOR_LIFT, 0.3);
  }
  return { rind, fracture };
}

export function makeChipGeometry(seed, { rindColor, fractureColor, liftColors = false, scale = [1, 1, 1] }) {
  const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = (hashString(seed) % 997) * 0.13;

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.4 + s) * Math.cos(v.y * 2.9 + s * 1.3) * Math.sin(v.z * 4.1 + s * 0.7);
    v.normalize().multiplyScalar(1 + n * 0.16);
    position.setXYZ(i, v.x, v.y, v.z);
  }

  const cuts = [];
  const cutCount = 2 + Math.floor(seededUnit(seed, 21) * 2);
  for (let c = 0; c < cutCount; c += 1) {
    const theta = Math.acos(2 * seededUnit(seed, 22 + c * 3) - 1);
    const phi = seededUnit(seed, 23 + c * 3) * Math.PI * 2;
    const dir = new THREE.Vector3().setFromSphericalCoords(1, theta, phi);
    const planeDistance = 0.42 + seededUnit(seed, 24 + c * 3) * 0.34;
    cuts.push({ dir, planeDistance });
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      const t = v.dot(dir);
      if (t > planeDistance) {
        v.addScaledVector(dir, planeDistance - t);
        position.setXYZ(i, v.x, v.y, v.z);
      }
    }
  }

  const { rind, fracture } = debrisColors({ rindColor, fractureColor, liftColors });
  paintFaceColors(geo, seed, {
    rind,
    fracture,
    isFractureFace: face => cuts.some(cut => (
      face.every(corner => Math.abs(corner.dot(cut.dir) - cut.planeDistance) < 0.02)
    )),
  });
  geo.scale(scale[0], scale[1], scale[2]);
  geo.computeVertexNormals();
  return geo;
}

export function makeFragmentGeometry(seed, { cutDir, cutDistance = 0.05, radii, rindColor, fractureColor }) {
  const geo = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = (hashString(seed) % 997) * 0.17;
  const dir = new THREE.Vector3(cutDir.x, cutDir.y || 0, cutDir.z).normalize();

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.1 + s) * Math.cos(v.y * 2.7 + s * 1.7) * Math.sin(v.z * 3.6 + s * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + s * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + n * 0.22 + chip);
    const t = v.dot(dir);
    if (t > cutDistance) v.addScaledVector(dir, cutDistance - t);
    position.setXYZ(i, v.x, v.y, v.z);
  }

  const { rind, fracture } = debrisColors({ rindColor, fractureColor, liftColors: true });
  paintFaceColors(geo, seed, {
    rind,
    fracture,
    isFractureFace: face => face.every(corner => Math.abs(corner.dot(dir) - cutDistance) < 0.02),
    jitterBase: 0.94,
    jitterSpan: 0.12,
  });
  geo.scale(radii[0], radii[1], radii[2]);
  geo.computeVertexNormals();
  return geo;
}

// Loose-stone prop rock: craggier than a chip (it is a whole weathered stone,
// not a fresh fragment), with `strikes` hammer bites carved at seeded spots.
export function makeLooseStoneGeometry(seed, {
  strikes = 0,
  rindColor = '#31332d',
  fractureColor = '#4d5457',
  scale = [1, 1, 1],
} = {}) {
  const geo = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = (hashString(seed) % 997) * 0.19;

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.1 + s) * Math.cos(v.y * 2.7 + s * 1.7) * Math.sin(v.z * 3.6 + s * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + s * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + n * 0.2 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }

  // A couple of flat weathered facets so the silhouette isn't a blob.
  for (let c = 0; c < 2; c += 1) {
    const theta = Math.acos(2 * seededUnit(seed, 70 + c * 3) - 1);
    const phi = seededUnit(seed, 71 + c * 3) * Math.PI * 2;
    const dir = new THREE.Vector3().setFromSphericalCoords(1, theta, phi);
    const planeDistance = 0.72 + seededUnit(seed, 72 + c * 3) * 0.2;
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      const t = v.dot(dir);
      if (t > planeDistance) {
        v.addScaledVector(dir, planeDistance - t);
        position.setXYZ(i, v.x, v.y, v.z);
      }
    }
  }

  // Hammer bites: spheres centered just outside the surface, vertices inside
  // projected onto the sphere (a concave scoop that only removes material).
  const bites = [];
  const biteCount = Math.min(6, Math.max(0, strikes));
  for (let b = 0; b < biteCount; b += 1) {
    const theta = Math.acos(2 * seededUnit(seed, 80 + b * 4) - 1);
    const phi = seededUnit(seed, 81 + b * 4) * Math.PI * 2;
    const r = 0.34 + seededUnit(seed, 82 + b * 4) * 0.14;
    const center = new THREE.Vector3().setFromSphericalCoords(1 + r * 0.55, theta, phi);
    bites.push({ center, r });
  }
  const biteWeights = new Float32Array(position.count);
  const dirFromBite = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const originalLength = v.length();
    for (const bite of bites) {
      const distance = v.distanceTo(bite.center);
      if (distance >= bite.r) continue;
      if (distance > 0.0001) dirFromBite.copy(v).sub(bite.center).divideScalar(distance);
      else dirFromBite.copy(v).normalize().negate();
      v.copy(bite.center).addScaledVector(dirFromBite, bite.r);
      if (v.length() > originalLength) v.setLength(originalLength);
      biteWeights[i] = Math.max(biteWeights[i], 1 - distance / bite.r);
    }
    position.setXYZ(i, v.x, v.y, v.z);
  }

  const { rind, fracture } = debrisColors({ rindColor, fractureColor, liftColors: true });
  const faceColor = new THREE.Color();
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 3) {
    const weight = Math.max(biteWeights[i], biteWeights[i + 1], biteWeights[i + 2]);
    faceColor.copy(rind).lerp(fracture, Math.min(1, weight * 1.6));
    faceColor.multiplyScalar(0.92 + seededUnit(seed, 90 + i) * 0.16);
    for (let corner = 0; corner < 3; corner += 1) {
      colors[(i + corner) * 3] = faceColor.r;
      colors[(i + corner) * 3 + 1] = faceColor.g;
      colors[(i + corner) * 3 + 2] = faceColor.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.scale(scale[0], scale[1], scale[2]);
  geo.computeVertexNormals();
  return geo;
}
