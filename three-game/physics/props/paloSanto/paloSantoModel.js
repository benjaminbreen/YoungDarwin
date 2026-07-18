// Procedural Bursera graveolens. A tree is built from a small physics graph of
// complete curved limbs. Each physical limb carries a merged hierarchy of fine
// visual twigs and terminal compound foliage, so visual detail is independent
// from rigid-body count.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, seededUnit } from '../breakablePlant/plantGeoUtils';

const UP = new THREE.Vector3(0, 1, 0);
const WOOD_DENSITY = 430;
const BARK_TINTS = ['#d8d0ba', '#cbc2aa', '#e0d7c0', '#cfc8b4'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += points[index].distanceTo(points[index - 1]);
  }
  return length;
}

function samplePath(points, t) {
  const target = clamp(t, 0, 1) * pathLength(points);
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = start.distanceTo(end);
    if (travelled + segmentLength >= target || index === points.length - 1) {
      const localT = segmentLength > 1e-6 ? (target - travelled) / segmentLength : 0;
      return {
        point: start.clone().lerp(end, clamp(localT, 0, 1)),
        tangent: end.clone().sub(start).normalize(),
      };
    }
    travelled += segmentLength;
  }
  return {
    point: points[points.length - 1].clone(),
    tangent: points[points.length - 1].clone().sub(points[points.length - 2]).normalize(),
  };
}

function perpendicularBasis(direction) {
  const reference = Math.abs(direction.y) > 0.88
    ? new THREE.Vector3(1, 0, 0)
    : UP;
  const a = new THREE.Vector3().crossVectors(direction, reference).normalize();
  const b = new THREE.Vector3().crossVectors(direction, a).normalize();
  return [a, b];
}

function branchDirection(parentDirection, azimuth, spread, lift = 0.12) {
  const [a, b] = perpendicularBasis(parentDirection);
  const radial = a.multiplyScalar(Math.cos(azimuth)).addScaledVector(b, Math.sin(azimuth));
  return parentDirection.clone().multiplyScalar(Math.cos(spread))
    .addScaledVector(radial, Math.sin(spread))
    .addScaledVector(UP, lift)
    .normalize();
}

function makeCrookedPath({
  start,
  direction,
  length,
  steps,
  phase,
  bend,
  lift,
  rng,
}) {
  const points = [start.clone()];
  const weights = Array.from({ length: steps }, () => 0.78 + rng() * 0.44);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let current = start.clone();
  let currentDirection = direction.clone().normalize();
  for (let index = 0; index < steps; index += 1) {
    const turn = bend * (0.55 + rng() * 0.75);
    const targetDirection = branchDirection(
      currentDirection,
      phase + index * 1.91 + (rng() * 2 - 1) * 0.72,
      turn,
      lift * (0.65 + rng() * 0.7),
    );
    currentDirection.lerp(targetDirection, 0.34 + rng() * 0.16).normalize();
    current = current.clone().addScaledVector(currentDirection, length * weights[index] / weightTotal);
    points.push(current);
  }
  return points;
}

function createTubeGeometry({
  points,
  radiusStart,
  radiusEnd,
  variant = 0,
  radialSegments = 12,
  lengthSegments = null,
  baseFlare = 0,
}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
  const tubularSegments = lengthSegments || clamp(points.length * 6, 18, 42);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const phase = variant * 1.37 + 0.61;
  const length = Math.max(0.1, curve.getLength());
  const point = new THREE.Vector3();

  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const t = ring / tubularSegments;
    curve.getPointAt(t, point);
    const taperT = Math.pow(t, 0.84);
    const taper = THREE.MathUtils.lerp(radiusStart, radiusEnd, taperT);
    const flare = 1 + baseFlare * Math.pow(1 - t, 3.2);
    const organic = 1
      + Math.sin(t * Math.PI * 4.4 + phase) * 0.018
      + Math.sin(t * Math.PI * 10.7 - phase) * 0.009;
    const radius = taper * flare * organic;
    const normal = frames.normals[ring];
    const binormal = frames.binormals[ring];
    for (let side = 0; side < radialSegments; side += 1) {
      const u = side / radialSegments;
      const angle = u * Math.PI * 2 + t * 0.08;
      const furrow = 1 + Math.sin(angle * 5 + phase) * 0.014;
      const radial = normal.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(binormal, Math.sin(angle));
      positions.push(
        point.x + radial.x * radius * furrow,
        point.y + radial.y * radius * furrow,
        point.z + radial.z * radius * furrow,
      );
      const shade = 0.93
        + Math.max(0, Math.cos(angle - 0.55)) * 0.055
        + Math.sin(ring * 0.73 + side * 1.9 + phase) * 0.008;
      colors.push(shade, shade * 0.995, shade * 0.96);
      uvs.push(u, t * Math.max(1.2, length / 0.56));
    }
  }

  for (let ring = 0; ring < tubularSegments; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + side;
      indices.push(a, b, d, b, c, d);
    }
  }

  const baseCenter = positions.length / 3;
  const base = curve.getPointAt(0);
  positions.push(base.x, base.y, base.z);
  colors.push(0.93, 0.925, 0.89);
  uvs.push(0.5, 0);
  const tipCenter = positions.length / 3;
  const tip = curve.getPointAt(1);
  positions.push(tip.x, tip.y, tip.z);
  colors.push(0.96, 0.955, 0.92);
  uvs.push(0.5, length / 0.56);
  const lastRing = tubularSegments * radialSegments;
  for (let side = 0; side < radialSegments; side += 1) {
    const next = (side + 1) % radialSegments;
    indices.push(baseCenter, next, side);
    indices.push(tipCenter, lastRing + side, lastRing + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildPaloSantoLimbGeometry(limb, twigs = []) {
  const geometries = [createTubeGeometry({
    points: limb.points,
    radiusStart: limb.radiusStart,
    radiusEnd: limb.radiusEnd,
    variant: limb.variant,
    radialSegments: limb.role === 'trunk' ? 16 : 14,
    lengthSegments: limb.role === 'trunk' ? 40 : null,
    baseFlare: limb.role === 'trunk' ? 0.42 : 0.05,
  })];
  for (const twig of twigs) {
    geometries.push(createTubeGeometry({
      points: twig.points,
      radiusStart: twig.radiusStart,
      radiusEnd: twig.radiusEnd,
      variant: twig.variant,
      radialSegments: twig.order >= 2 ? 8 : 10,
      lengthSegments: twig.order >= 2 ? 12 : 16,
    }));
  }
  const merged = mergeGeometries(geometries, false);
  geometries.forEach(geometry => geometry.dispose());
  merged.computeBoundingSphere();
  return merged;
}

const branchGeometryCache = new Map();
export function getPaloSantoBranchGeometry(variantIndex = 0) {
  const variant = ((variantIndex | 0) % 4 + 4) % 4;
  if (!branchGeometryCache.has(variant)) {
    const sideways = (variant - 1.5) * 0.018;
    branchGeometryCache.set(variant, createTubeGeometry({
      points: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(sideways, 0.52, -sideways * 0.5),
        new THREE.Vector3(0, 1, 0),
      ],
      radiusStart: 1,
      radiusEnd: 0.48,
      variant,
      radialSegments: 12,
      lengthSegments: 16,
    }));
  }
  return branchGeometryCache.get(variant);
}

function createLeafletGeometry(width, length, curl = 0.015, phase = 0) {
  const lengthSegments = 12;
  const widthSegments = 4;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= lengthSegments; row += 1) {
    const v = row / lengthSegments;
    const outline = Math.pow(Math.sin(v * Math.PI), 0.7);
    for (let column = 0; column <= widthSegments; column += 1) {
      const u = column / widthSegments;
      const across = u * 2 - 1;
      positions.push(
        across * width * outline,
        (v - 0.5) * length,
        Math.sin(v * Math.PI) * (1 - across * across) * curl
          + Math.sin(v * Math.PI * 1.5 + phase) * across * curl * 0.2,
      );
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < lengthSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const a = row * (widthSegments + 1) + column;
      const b = a + 1;
      const c = a + widthSegments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const leafSprayCache = new Map();
export function getPaloSantoLeafSprayGeometry(variantIndex = 0) {
  const variant = ((variantIndex | 0) % 6 + 6) % 6;
  if (leafSprayCache.has(variant)) return leafSprayCache.get(variant);
  const leafGeometries = [];
  const stemGeometries = [];
  const compoundLeaves = variant === 4 ? 2 : 1;
  const pairCount = 2 + (variant % 4);
  const stemLength = 0.38 + pairCount * 0.045;
  for (let spray = 0; spray < compoundLeaves; spray += 1) {
    const leafPhase = variant * 1.17 + spray * 0.91;
    const yaw = spray * 2.25 + variant * 0.19;
    const tilt = (variant % 2 ? 0.18 : -0.06) + spray * 0.15;
    const roll = (variant - 2.5) * 0.035;
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, yaw, roll));
    const stem = new THREE.CylinderGeometry(0.0055, 0.009, stemLength, 7, 2);
    stem.translate(0, stemLength * 0.5, 0);
    stem.applyMatrix4(transform);
    stemGeometries.push(stem);
    for (let pair = 0; pair < pairCount; pair += 1) {
      const progress = pairCount > 1 ? pair / (pairCount - 1) : 0.5;
      const y = 0.09 + progress * (stemLength - 0.18);
      for (const side of [-1, 1]) {
        if (variant === 5 && pair === 0 && side < 0) continue;
        const leaflet = createLeafletGeometry(
          0.034 + progress * 0.009 + (variant % 3) * 0.002,
          0.105 + progress * 0.026 + (variant % 2) * 0.008,
          0.009 + progress * 0.004,
          leafPhase + pair * 0.67 + side,
        );
        leaflet.rotateZ(side * (0.9 - progress * 0.12));
        leaflet.rotateY(side * (0.05 + progress * 0.11 + spray * 0.08));
        leaflet.translate(side * (0.047 + progress * 0.013), y, spray * 0.01);
        leaflet.applyMatrix4(transform);
        leafGeometries.push(leaflet);
      }
    }
    const terminal = createLeafletGeometry(
      0.041 + (variant % 2) * 0.005,
      0.125 + (variant % 3) * 0.008,
      0.012,
      leafPhase + 2.1,
    );
    terminal.translate(0, stemLength + 0.035, 0);
    terminal.applyMatrix4(transform);
    leafGeometries.push(terminal);
  }
  const leaves = mergeGeometries(leafGeometries, false);
  const stems = mergeGeometries(stemGeometries, false);
  leafGeometries.forEach(geometry => geometry.dispose());
  stemGeometries.forEach(geometry => geometry.dispose());
  leaves.computeVertexNormals();
  stems.computeVertexNormals();
  const result = { leaves, stems };
  leafSprayCache.set(variant, result);
  return result;
}

export function buildPaloSantoFoliageGeometry(foliage = []) {
  const groups = { greenLeaves: [], oliveLeaves: [], dryLeaves: [], stems: [] };
  for (const cluster of foliage) {
    const spray = getPaloSantoLeafSprayGeometry(cluster.variant);
    const direction = new THREE.Vector3(...cluster.direction).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(UP, direction);
    const variation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      cluster.pitch || 0,
      cluster.yaw || 0,
      cluster.roll || 0,
    ));
    orientation.multiply(variation);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...cluster.position),
      orientation,
      new THREE.Vector3(1, 1, 1).multiplyScalar(cluster.scale),
    );
    const leaves = spray.leaves.clone().applyMatrix4(matrix);
    const stems = spray.stems.clone().applyMatrix4(matrix);
    groups[cluster.tone === 'dry' ? 'dryLeaves' : cluster.tone === 'olive' ? 'oliveLeaves' : 'greenLeaves'].push(leaves);
    groups.stems.push(stems);
  }
  const merge = geometries => {
    if (!geometries.length) return null;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    merged.computeBoundingSphere();
    return merged;
  };
  return Object.fromEntries(Object.entries(groups).map(([key, geometries]) => [key, merge(geometries)]));
}

function makeBarkTextures() {
  if (typeof document === 'undefined') return { albedo: null, bump: null };
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const albedo = albedoCanvas.getContext('2d');
  const bump = bumpCanvas.getContext('2d');
  albedo.fillStyle = '#c8bea3';
  albedo.fillRect(0, 0, size, size);
  bump.fillStyle = '#898989';
  bump.fillRect(0, 0, size, size);

  for (let index = 0; index < 360; index += 1) {
    const x = seededUnit('palo-bark-patch', index * 7 + 1) * size;
    const y = seededUnit('palo-bark-patch', index * 7 + 2) * size;
    const width = 3 + seededUnit('palo-bark-patch', index * 7 + 3) * 18;
    const height = 10 + seededUnit('palo-bark-patch', index * 7 + 4) * 58;
    const pale = seededUnit('palo-bark-patch', index * 7 + 5) > 0.45;
    const alpha = 0.035 + seededUnit('palo-bark-patch', index * 7 + 6) * 0.14;
    albedo.fillStyle = pale
      ? `rgba(241, 234, 211, ${alpha})`
      : `rgba(91, 78, 57, ${alpha * 0.75})`;
    albedo.beginPath();
    albedo.ellipse(x, y, width, height, (seededUnit('palo-bark-patch', index * 7 + 7) - 0.5) * 0.14, 0, Math.PI * 2);
    albedo.fill();
    bump.fillStyle = pale ? 'rgba(181,181,181,0.14)' : 'rgba(68,68,68,0.12)';
    bump.beginPath();
    bump.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
    bump.fill();
  }

  for (let index = 0; index < 190; index += 1) {
    const x = seededUnit('palo-bark-crack', index * 5 + 1) * size;
    const y = seededUnit('palo-bark-crack', index * 5 + 2) * size;
    const length = 8 + seededUnit('palo-bark-crack', index * 5 + 3) * 68;
    const drift = (seededUnit('palo-bark-crack', index * 5 + 4) - 0.5) * 8;
    const opacity = 0.045 + seededUnit('palo-bark-crack', index * 5 + 5) * 0.1;
    albedo.strokeStyle = `rgba(66, 57, 44, ${opacity})`;
    albedo.lineWidth = 0.55 + (index % 3) * 0.35;
    albedo.beginPath();
    albedo.moveTo(x, y);
    albedo.bezierCurveTo(x + drift, y + length * 0.3, x - drift, y + length * 0.7, x + drift * 0.35, y + length);
    albedo.stroke();
    bump.strokeStyle = 'rgba(38,38,38,0.22)';
    bump.lineWidth = 1;
    bump.beginPath();
    bump.moveTo(x, y);
    bump.lineTo(x + drift * 0.35, y + length);
    bump.stroke();
  }

  const albedoTexture = new THREE.CanvasTexture(albedoCanvas);
  albedoTexture.wrapS = THREE.RepeatWrapping;
  albedoTexture.wrapT = THREE.RepeatWrapping;
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.anisotropy = 8;
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.anisotropy = 8;
  return { albedo: albedoTexture, bump: bumpTexture };
}

let barkTextureCache = null;
function getBarkTextures() {
  if (!barkTextureCache) barkTextureCache = makeBarkTextures();
  return barkTextureCache;
}

const leafTextureCache = new Map();
function getLeafTexture(tone = 'green') {
  if (leafTextureCache.has(tone)) return leafTextureCache.get(tone);
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const palettes = {
    green: ['#6f794a', '#99a066', '#53633e'],
    olive: ['#858052', '#aaa069', '#68613f'],
    dry: ['#937749', '#b2965b', '#705b3a'],
  };
  const palette = palettes[tone] || palettes.green;
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.52, palette[1]);
  gradient.addColorStop(1, palette[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = tone === 'dry' ? 'rgba(224,204,135,0.46)' : 'rgba(208,214,151,0.43)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(size * 0.5, 0);
  context.lineTo(size * 0.5, size);
  context.stroke();
  context.lineWidth = 0.7;
  for (let index = 1; index < 8; index += 1) {
    const y = (index / 8) * size;
    context.beginPath();
    context.moveTo(size * 0.5, y);
    context.lineTo(size * 0.15, y - 10);
    context.moveTo(size * 0.5, y);
    context.lineTo(size * 0.85, y - 10);
    context.stroke();
  }
  for (let index = 0; index < 90; index += 1) {
    const x = seededUnit(`palo-leaf-${tone}`, index * 4 + 1) * size;
    const y = seededUnit(`palo-leaf-${tone}`, index * 4 + 2) * size;
    const radius = 0.4 + seededUnit(`palo-leaf-${tone}`, index * 4 + 3) * 1.5;
    context.fillStyle = `rgba(45, 54, 34, ${0.025 + seededUnit(`palo-leaf-${tone}`, index * 4 + 4) * 0.07})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  leafTextureCache.set(tone, texture);
  return texture;
}

let materialCache = null;
export function getPaloSantoMaterials() {
  if (materialCache) return materialCache;
  const barkTextures = getBarkTextures();
  const materials = {
    bark: BARK_TINTS.map(color => new THREE.MeshStandardMaterial({
      color,
      map: barkTextures.albedo,
      bumpMap: barkTextures.bump,
      bumpScale: 0.055,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
    })),
    leaves: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: getLeafTexture('green'),
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    oliveLeaves: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: getLeafTexture('olive'),
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    dryLeaves: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: getLeafTexture('dry'),
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    leafStems: new THREE.MeshStandardMaterial({
      color: '#6d6d43',
      roughness: 0.92,
      metalness: 0,
    }),
  };
  if (barkTextures.albedo) materialCache = materials;
  return materials;
}

function segmentMass(radiusStart, radiusEnd, length) {
  const averageRadius = (radiusStart + radiusEnd) * 0.5;
  return Math.max(0.18, Math.PI * averageRadius * averageRadius * length * WOOD_DENSITY);
}

function radiusAt(limb, t) {
  return THREE.MathUtils.lerp(limb.radiusStart, limb.radiusEnd, Math.pow(clamp(t, 0, 1), 0.84));
}

// Returns complete physical limbs in tree-local space. Fine twigs and foliage
// remain attached to the nearest physical limb as render-only geometry.
export function buildPaloSanto({ seed, size = 1, leafiness = null }) {
  const rng = makeRng(`palo-santo:${seed}`);
  const treeScale = clamp(size, 0.68, 1.48);
  const seasonalLeaves = clamp(leafiness == null ? 0.16 + rng() * 0.36 : leafiness, 0, 0.78);
  const barkIndex = Math.floor(seededUnit(`palo-santo-bark-tone:${seed}`) * BARK_TINTS.length);
  const segments = [];

  const addLimb = ({ parent = null, points, radiusStart, radiusEnd, generation, role }) => {
    const position = points[0].clone();
    const end = points[points.length - 1].clone();
    const chord = end.clone().sub(position);
    const length = Math.max(0.08, chord.length());
    const direction = chord.clone().normalize();
    const limb = {
      id: `limb-${segments.length}`,
      parentId: parent?.id || null,
      points: points.map(point => point.clone()),
      position,
      end,
      direction,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction),
      length,
      pathLength: pathLength(points),
      radius: radiusStart,
      radiusStart,
      radiusEnd,
      generation,
      role,
      mass: segmentMass(radiusStart, radiusEnd, pathLength(points)),
      variant: Math.floor(rng() * 8),
      barkIndex,
      twigs: [],
      foliage: [],
    };
    segments.push(limb);
    return limb;
  };

  const height = treeScale * (3.35 + rng() * 0.95);
  const trunkNodes = 7;
  const trunkPoints = [];
  const leanAngle = rng() * Math.PI * 2;
  const leanMagnitude = height * (0.025 + rng() * 0.045);
  const crookPhase = rng() * Math.PI * 2;
  for (let index = 0; index < trunkNodes; index += 1) {
    const t = index / (trunkNodes - 1);
    const envelope = Math.sin(t * Math.PI);
    trunkPoints.push(new THREE.Vector3(
      Math.cos(leanAngle) * leanMagnitude * t
        + Math.sin(t * Math.PI * 1.55 + crookPhase) * height * 0.028 * envelope,
      -0.14 * treeScale + height * t,
      Math.sin(leanAngle) * leanMagnitude * t
        + Math.cos(t * Math.PI * 1.37 + crookPhase) * height * 0.024 * envelope,
    ));
  }
  const trunk = addLimb({
    points: trunkPoints,
    radiusStart: treeScale * (0.23 + rng() * 0.055),
    radiusEnd: treeScale * (0.052 + rng() * 0.018),
    generation: 0,
    role: 'trunk',
  });

  const crownBias = rng() * Math.PI * 2;
  const scaffoldCount = 3 + Math.floor(rng() * 3);
  const scaffolds = [];
  for (let index = 0; index < scaffoldCount; index += 1) {
    const distributed = scaffoldCount > 1 ? index / (scaffoldCount - 1) : 0.5;
    const attachT = clamp(0.36 + distributed * 0.36 + (rng() * 2 - 1) * 0.045, 0.34, 0.76);
    const host = samplePath(trunk.points, attachT);
    const azimuth = crownBias + index * 2.39996 + (rng() * 2 - 1) * 0.42;
    const leader = index === 0 && rng() > 0.35;
    const horizontal = leader ? 0.44 + rng() * 0.12 : 0.72 + rng() * 0.22;
    const vertical = leader ? 0.9 + rng() * 0.18 : 0.42 + rng() * 0.32;
    const direction = new THREE.Vector3(
      Math.cos(azimuth) * horizontal,
      vertical,
      Math.sin(azimuth) * horizontal,
    ).addScaledVector(host.tangent, 0.12).normalize();
    const asymmetry = 0.84 + Math.max(0, Math.cos(azimuth - crownBias)) * 0.24 + rng() * 0.14;
    const limbLength = height * (leader ? 0.31 + rng() * 0.08 : 0.28 + rng() * 0.13) * asymmetry;
    const startRadius = radiusAt(trunk, attachT) * (0.48 + rng() * 0.13);
    const start = host.point.clone().addScaledVector(direction, -startRadius * 0.72);
    const points = makeCrookedPath({
      start,
      direction,
      length: limbLength,
      steps: 5 + Math.floor(rng() * 2),
      phase: azimuth,
      bend: 0.1 + rng() * 0.1,
      lift: leader ? 0.13 : 0.08,
      rng,
    });
    scaffolds.push(addLimb({
      parent: trunk,
      points,
      radiusStart: startRadius,
      radiusEnd: treeScale * (0.018 + rng() * 0.012),
      generation: 1,
      role: 'limb',
    }));
  }

  const branches = [];
  for (const scaffold of scaffolds) {
    const branchCount = 2 + Math.floor(rng() * 3);
    for (let index = 0; index < branchCount; index += 1) {
      const attachT = clamp(0.34 + index * (0.5 / Math.max(1, branchCount - 1)) + (rng() * 2 - 1) * 0.06, 0.3, 0.9);
      const host = samplePath(scaffold.points, attachT);
      const azimuth = crownBias + index * 2.17 + scaffold.variant * 0.51 + rng() * 0.7;
      const direction = branchDirection(
        host.tangent,
        azimuth,
        0.48 + rng() * 0.38,
        0.08 + rng() * 0.14,
      );
      const startRadius = radiusAt(scaffold, attachT) * (0.38 + rng() * 0.13);
      const start = host.point.clone().addScaledVector(direction, -startRadius * 0.8);
      const points = makeCrookedPath({
        start,
        direction,
        length: height * (0.13 + rng() * 0.11),
        steps: 4 + Math.floor(rng() * 2),
        phase: azimuth,
        bend: 0.14 + rng() * 0.13,
        lift: 0.08 + rng() * 0.08,
        rng,
      });
      branches.push(addLimb({
        parent: scaffold,
        points,
        radiusStart: startRadius,
        radiusEnd: treeScale * (0.009 + rng() * 0.006),
        generation: 2,
        role: 'branch',
      }));
    }
  }

  const addFoliage = (limb, endpoint, direction, strength = 1) => {
    const chance = clamp(0.025 + seasonalLeaves * 0.9 * strength, 0, 0.68);
    if (rng() >= chance) return;
    const toneRoll = rng();
    const dryThreshold = clamp(0.1 + (0.34 - seasonalLeaves) * 0.28, 0.06, 0.22);
    const tone = toneRoll < dryThreshold ? 'dry' : toneRoll < 0.43 ? 'olive' : 'green';
    limb.foliage.push({
      position: endpoint.clone(),
      direction: direction.clone().normalize(),
      variant: Math.floor(rng() * 6),
      scale: treeScale * (0.34 + rng() * 0.22),
      pitch: (rng() * 2 - 1) * 0.18,
      yaw: rng() * Math.PI * 2,
      roll: (rng() * 2 - 1) * 0.28,
      tone,
    });
  };

  const crownHosts = [trunk, ...scaffolds, ...branches];
  for (const limb of crownHosts) {
    const twigCount = limb.role === 'trunk'
      ? 3 + Math.floor(rng() * 3)
      : limb.role === 'limb'
        ? 5 + Math.floor(rng() * 3)
        : 3 + Math.floor(rng() * 3);
    for (let index = 0; index < twigCount; index += 1) {
      const baseT = limb.role === 'trunk' ? 0.68 : limb.role === 'limb' ? 0.4 : 0.3;
      const attachT = clamp(baseT + (index + rng() * 0.65) / twigCount * (0.97 - baseT), baseT, 0.97);
      const host = samplePath(limb.points, attachT);
      const azimuth = crownBias + limb.variant * 0.61 + index * 2.31 + rng() * 0.75;
      const direction = branchDirection(
        host.tangent,
        azimuth,
        0.48 + rng() * 0.5,
        0.06 + rng() * 0.16,
      );
      const hostRadius = radiusAt(limb, attachT);
      const twigRadius = Math.max(treeScale * 0.0055, hostRadius * (0.15 + rng() * 0.08));
      const twigLength = height * (limb.role === 'trunk' ? 0.075 + rng() * 0.045 : 0.055 + rng() * 0.065);
      const start = host.point.clone().addScaledVector(direction, -twigRadius * 0.95);
      const twigPoints = makeCrookedPath({
        start,
        direction,
        length: twigLength,
        steps: 3 + Math.floor(rng() * 2),
        phase: azimuth,
        bend: 0.18 + rng() * 0.16,
        lift: 0.05 + rng() * 0.09,
        rng,
      });
      const twig = {
        points: twigPoints,
        radiusStart: twigRadius,
        radiusEnd: Math.max(0.0028, twigRadius * (0.2 + rng() * 0.13)),
        variant: Math.floor(rng() * 8),
        order: 1,
      };
      limb.twigs.push(twig);
      const twigTangent = samplePath(twigPoints, 1).tangent;
      addFoliage(limb, twigPoints[twigPoints.length - 1], twigTangent, limb.role === 'branch' ? 1.12 : 0.92);

      const forkCount = rng() < 0.72 ? 1 + (rng() < 0.32 ? 1 : 0) : 0;
      for (let forkIndex = 0; forkIndex < forkCount; forkIndex += 1) {
        const forkT = 0.46 + forkIndex * 0.2 + rng() * 0.12;
        const forkHost = samplePath(twigPoints, forkT);
        const forkDirection = branchDirection(
          forkHost.tangent,
          azimuth + 1.7 + forkIndex * 2.4 + rng(),
          0.48 + rng() * 0.34,
          0.04 + rng() * 0.1,
        );
        const forkRadius = twigRadius * (0.42 + rng() * 0.15);
        const forkStart = forkHost.point.clone().addScaledVector(forkDirection, -forkRadius * 0.9);
        const forkPoints = makeCrookedPath({
          start: forkStart,
          direction: forkDirection,
          length: twigLength * (0.38 + rng() * 0.28),
          steps: 3,
          phase: azimuth + forkIndex,
          bend: 0.19 + rng() * 0.14,
          lift: 0.04 + rng() * 0.08,
          rng,
        });
        limb.twigs.push({
          points: forkPoints,
          radiusStart: forkRadius,
          radiusEnd: Math.max(0.0024, forkRadius * 0.22),
          variant: Math.floor(rng() * 8),
          order: 2,
        });
        const forkTangent = samplePath(forkPoints, 1).tangent;
        addFoliage(limb, forkPoints[forkPoints.length - 1], forkTangent, 0.84);
      }
    }
  }

  return { segments, leafiness: seasonalLeaves, barkIndex, height };
}

export function branchColliderSpec(branch) {
  const colliderRadius = Math.max(0.035, branch.radiusStart * (branch.role === 'trunk' ? 0.78 : 0.62));
  return {
    halfExtents: [colliderRadius, branch.length * 0.48, colliderRadius],
    offset: [0, branch.length * 0.5, 0],
  };
}

export function branchHitPoints(branch) {
  if (branch.role === 'trunk') return 999;
  if (branch.role === 'limb') return 4;
  return 2;
}

export function buildPaloSantoDressing({ seed, size = 1 }) {
  const rng = makeRng(`palo-santo-dressing:${seed}`);
  const barkIndex = Math.floor(seededUnit(`palo-santo-bark-tone:${seed}`) * BARK_TINTS.length);
  const roots = [];
  const count = 4 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + rng() * 0.5;
    const direction = new THREE.Vector3(Math.cos(angle), 0.14 + rng() * 0.1, Math.sin(angle)).normalize();
    roots.push({
      direction,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction),
      length: size * (0.42 + rng() * 0.38),
      radius: size * (0.045 + rng() * 0.025),
      variant: Math.floor(rng() * 4),
      barkIndex,
    });
  }
  return { roots, barkIndex };
}
