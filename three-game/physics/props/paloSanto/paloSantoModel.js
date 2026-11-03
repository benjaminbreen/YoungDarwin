// Procedural Bursera graveolens. A tree is built from a small physics graph of
// complete curved limbs. Each physical limb carries a merged hierarchy of fine
// visual twigs and terminal compound foliage, so visual detail is independent
// from rigid-body count.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, seededUnit } from '../breakablePlant/plantGeoUtils';
import { applyNatureSurface } from '../../../wildlife/natureTextures';

const UP = new THREE.Vector3(0, 1, 0);
const WOOD_DENSITY = 430;
// Bursera bark is smooth and silvery grey, often chalky with crustose lichen;
// the dry-season woods read almost white against the lava. The shared bark
// map is a warm beige, so the material keeps only a trace of its chroma.
const BARK_TINTS = ['#e2e3de', '#d6d8d3', '#e6e5de', '#cfd2ce'];
const BARK_MAP_CHROMA = 0.12;

function applyPaloBarkTone(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, ${BARK_MAP_CHROMA.toFixed(2)});`,
    );
  };
  material.customProgramCacheKey = () => `palo-bark-tone:${BARK_MAP_CHROMA}`;
  return material;
}

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

// Like makeCrookedPath, but the heading swings smoothly from `from` to `to`:
// palo santo leaders climb steeply off the fork and then lean out.
function makeArcPath({ start, from, to, length, steps, wobble, phase, rng }) {
  const points = [start.clone()];
  let current = start.clone();
  const heading = new THREE.Vector3();
  for (let index = 0; index < steps; index += 1) {
    const t = (index + 0.5) / steps;
    heading.copy(from).lerp(to, Math.pow(t, 0.85)).normalize();
    const [a, b] = perpendicularBasis(heading);
    const angle = phase + index * 2.1 + rng() * 0.8;
    heading.addScaledVector(a, Math.cos(angle) * wobble)
      .addScaledVector(b, Math.sin(angle) * wobble)
      .normalize();
    current = current.clone().addScaledVector(heading, length / steps * (0.85 + rng() * 0.3));
    points.push(current);
  }
  return points;
}

// Cheap smooth noise for bark mottling, evaluated in tree space so lichen
// patches stay put on the bark however a limb's geometry is framed.
function barkNoise(x, y, z) {
  return (
    Math.sin(x * 3.1 + y * 1.7 + 0.4) * Math.sin(z * 2.9 - y * 2.3 + 1.1)
    + Math.sin(x * 7.3 - z * 5.9 + y * 4.1) * 0.5
    + Math.sin(y * 11.7 + x * 9.1 - z * 8.3) * 0.25
  ) / 1.75 * 0.5 + 0.5;
}

const soilShade = [0.62, 0.58, 0.52];
// Vertex colours multiply the desaturated bark map, so values above 1 lift
// pale crustose lichen out of the grey bark.
function barkColor(treePoint, phase, out) {
  const n = barkNoise(treePoint.x, treePoint.y + phase * 0.31, treePoint.z);
  const fine = barkNoise(treePoint.x * 3.3 + 7, treePoint.y * 2.7, treePoint.z * 3.1 - 3);
  let r = 1.02 + (fine - 0.5) * 0.08;
  let g = r;
  let b = r * 0.985;
  const lichen = THREE.MathUtils.smoothstep(n, 0.58, 0.74);
  r = THREE.MathUtils.lerp(r, 1.2, lichen);
  g = THREE.MathUtils.lerp(g, 1.2, lichen);
  b = THREE.MathUtils.lerp(b, 1.14, lichen);
  const greyGreen = THREE.MathUtils.smoothstep(fine, 0.7, 0.84) * (1 - lichen);
  r *= 1 - greyGreen * 0.1;
  b *= 1 - greyGreen * 0.16;
  const weathered = THREE.MathUtils.smoothstep(1 - n, 0.68, 0.86);
  r *= 1 - weathered * 0.16;
  g *= 1 - weathered * 0.15;
  b *= 1 - weathered * 0.13;
  // Rain-splashed soil and shade at the root collar.
  const soil = 1 - THREE.MathUtils.smoothstep(treePoint.y, 0.02, 0.55);
  out[0] = r * THREE.MathUtils.lerp(1, soilShade[0], soil);
  out[1] = g * THREE.MathUtils.lerp(1, soilShade[1], soil);
  out[2] = b * THREE.MathUtils.lerp(1, soilShade[2], soil);
  return out;
}

function createTubeGeometry({
  points,
  radiusStart,
  radiusEnd,
  variant = 0,
  radialSegments = 12,
  lengthSegments = null,
  baseFlare = 0,
  tipRound = 0,
  frame = null,
  rooted = false,
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
  const treePoint = new THREE.Vector3();
  const color = [1, 1, 1];

  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const t = ring / tubularSegments;
    curve.getPointAt(t, point);
    const taperT = Math.pow(t, 0.84);
    const taper = THREE.MathUtils.lerp(radiusStart, radiusEnd, taperT);
    const flare = 1 + baseFlare * Math.pow(1 - t, 3.2);
    const rounding = 1 - tipRound * THREE.MathUtils.smoothstep(t, 0.78, 1);
    const organic = 1
      + Math.sin(t * Math.PI * 4.4 + phase) * 0.018
      + Math.sin(t * Math.PI * 10.7 - phase) * 0.009;
    const radius = taper * flare * rounding * organic;
    const normal = frames.normals[ring];
    const binormal = frames.binormals[ring];
    for (let side = 0; side < radialSegments; side += 1) {
      const u = side / radialSegments;
      const angle = u * Math.PI * 2 + t * 0.08;
      // Buttress lobes at the root collar; otherwise the bark is smooth.
      const lobes = baseFlare > 0 ? Math.sin(angle * 4 + phase) * 0.06 * Math.pow(1 - t, 6) : 0;
      const furrow = 1 + Math.sin(angle * 5 + phase) * 0.014 + lobes;
      const radial = normal.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(binormal, Math.sin(angle));
      positions.push(
        point.x + radial.x * radius * furrow,
        point.y + radial.y * radius * furrow,
        point.z + radial.z * radius * furrow,
      );
      if (rooted) {
        colors.push(soilShade[0] * 1.08, soilShade[1] * 1.08, soilShade[2] * 1.08);
      } else {
        treePoint.set(
          point.x + radial.x * radius,
          point.y + radial.y * radius,
          point.z + radial.z * radius,
        );
        if (frame) treePoint.applyQuaternion(frame.quaternion).add(frame.position);
        barkColor(treePoint, phase, color);
        colors.push(color[0], color[1], color[2]);
      }
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

// `lod` builds the dormant stand-in drawn for every tree except the one the
// player is interacting with. At full detail that stand-in cost ~98k triangles
// per tree (~1M across Post Office Bay). Only one site is ever active, so a
// dormant tree can still be the second-nearest tree a few metres away: the
// reduction is deliberately moderate (roughly a third of the triangles) rather
// than a far-distance impostor.
export function buildPaloSantoLimbGeometry(limb, twigs = [], { lod = false } = {}) {
  const trunk = limb.role === 'trunk';
  const geometries = [createTubeGeometry({
    points: limb.points,
    radiusStart: limb.radiusStart,
    radiusEnd: limb.radiusEnd,
    variant: limb.variant,
    radialSegments: lod ? (trunk ? 10 : 8) : (trunk ? 16 : 14),
    lengthSegments: trunk
      ? (lod ? 20 : 40)
      : (lod ? clamp(limb.points.length * 4, 10, 24) : null),
    baseFlare: trunk ? 0.42 : limb.role === 'limb' ? 0.1 : 0.16,
    tipRound: limb.tipRound || 0,
    frame: limb.frame,
  })];
  for (const twig of twigs) {
    geometries.push(createTubeGeometry({
      points: twig.points,
      radiusStart: twig.radiusStart,
      radiusEnd: twig.radiusEnd,
      variant: twig.variant,
      frame: limb.frame,
      radialSegments: lod ? (twig.order >= 2 ? 5 : 6) : (twig.order >= 2 ? 8 : 10),
      lengthSegments: lod ? (twig.order >= 2 ? 6 : 8) : (twig.order >= 2 ? 12 : 16),
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
      rooted: true,
    }));
  }
  return branchGeometryCache.get(variant);
}

function createLeafletGeometry(width, length, curl = 0.015, phase = 0, lod = false) {
  const lengthSegments = lod ? 6 : 12;
  const widthSegments = lod ? 2 : 4;
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
export function getPaloSantoLeafSprayGeometry(variantIndex = 0, { lod = false } = {}) {
  const variant = ((variantIndex | 0) % 6 + 6) % 6;
  const cacheKey = lod ? `lod:${variant}` : variant;
  if (leafSprayCache.has(cacheKey)) return leafSprayCache.get(cacheKey);
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
    const stem = new THREE.CylinderGeometry(0.0055, 0.009, stemLength, lod ? 4 : 7, lod ? 1 : 2);
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
          lod,
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
      lod,
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
  leafSprayCache.set(cacheKey, result);
  return result;
}

export function buildPaloSantoFoliageGeometry(foliage = [], { lod = false } = {}) {
  const groups = { greenLeaves: [], oliveLeaves: [], dryLeaves: [], stems: [] };
  for (const cluster of foliage) {
    const spray = getPaloSantoLeafSprayGeometry(cluster.variant, { lod });
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
    bark: BARK_TINTS.map(color => applyPaloBarkTone(new THREE.MeshStandardMaterial({
      color,
      map: barkTextures.albedo,
      bumpMap: barkTextures.bump,
      bumpScale: 0.055,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
    }))),
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
    wood: new THREE.MeshStandardMaterial({
      color: '#ece3cf',
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    leafStems: new THREE.MeshStandardMaterial({
      color: '#6d6d43',
      roughness: 0.92,
      metalness: 0,
    }),
  };
  if (barkTextures.albedo) {
    materials.bark.forEach(material => applyNatureSurface(material, 'palo-bark', barkTextures.albedo, { repeat: true }));
    for (const [key, tone] of [['leaves', 'green'], ['oliveLeaves', 'olive'], ['dryLeaves', 'dry']]) {
      applyNatureSurface(materials[key], `palo-leaf-${tone}`, getLeafTexture(tone));
    }
    materialCache = materials;
  }
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

  // Bursera graveolens is deliquescent: a short, slightly crooked bole forks
  // low into a few co-dominant leaders that climb steeply and then lean out,
  // giving the open umbrella crown of the dry-zone woodland. The bole does not
  // run on as a central stake.
  const height = treeScale * (3.8 + rng() * 1.4);
  const boleHeight = height * (0.27 + rng() * 0.13);
  const trunkNodes = 6;
  const trunkPoints = [];
  const leanAngle = rng() * Math.PI * 2;
  const leanMagnitude = boleHeight * (0.05 + rng() * 0.1);
  const crookPhase = rng() * Math.PI * 2;
  for (let index = 0; index < trunkNodes; index += 1) {
    const t = index / (trunkNodes - 1);
    const envelope = Math.sin(t * Math.PI);
    trunkPoints.push(new THREE.Vector3(
      Math.cos(leanAngle) * leanMagnitude * t
        + Math.sin(t * Math.PI * 1.55 + crookPhase) * boleHeight * 0.035 * envelope,
      -0.14 * treeScale + (boleHeight + 0.14 * treeScale) * t,
      Math.sin(leanAngle) * leanMagnitude * t
        + Math.cos(t * Math.PI * 1.37 + crookPhase) * boleHeight * 0.03 * envelope,
    ));
  }
  const trunkRadius = treeScale * (0.17 + rng() * 0.05);
  const trunk = addLimb({
    points: trunkPoints,
    radiusStart: trunkRadius,
    radiusEnd: trunkRadius * (0.74 + rng() * 0.08),
    generation: 0,
    role: 'trunk',
  });
  trunk.tipRound = 0.62;
  const leanDirection = new THREE.Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle));

  const crownBias = rng() * Math.PI * 2;
  const leaderRoll = rng();
  const leaderCount = leaderRoll < 0.18 ? 2 : leaderRoll < 0.72 ? 3 : 4;
  const scaffolds = [];
  for (let index = 0; index < leaderCount; index += 1) {
    // A fourth leader leaves the bole lower down as a side limb.
    const sideLimb = leaderCount === 4 && index === 3;
    const attachT = sideLimb ? 0.6 + rng() * 0.14 : 0.78 + rng() * 0.07;
    const host = samplePath(trunk.points, attachT);
    const azimuth = crownBias + index * (Math.PI * 2 / leaderCount) + (rng() * 2 - 1) * 0.38;
    const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))
      .addScaledVector(leanDirection, 0.25)
      .normalize();
    const climb = sideLimb ? 0.62 + rng() * 0.22 : 0.9 + rng() * 0.32;
    const settle = sideLimb ? 0.2 + rng() * 0.22 : 0.3 + rng() * 0.32;
    const from = outward.clone().multiplyScalar(Math.cos(climb)).addScaledVector(UP, Math.sin(climb)).normalize();
    const to = outward.clone().multiplyScalar(Math.cos(settle)).addScaledVector(UP, Math.sin(settle)).normalize();
    const crownRise = Math.max(height * 0.38, height * (0.86 + rng() * 0.12) - host.point.y);
    const limbLength = crownRise / (0.62 + rng() * 0.1) * (sideLimb ? 0.72 : 1);
    const startRadius = radiusAt(trunk, attachT) * (sideLimb ? 0.55 + rng() * 0.08 : 0.74 + rng() * 0.1);
    // Seat the leader against the outside of the bole so the bark flows
    // up into the fork instead of stepping in where the limbs begin.
    const start = host.point.clone()
      .addScaledVector(outward, Math.max(0, radiusAt(trunk, attachT) - startRadius) * 0.9)
      .addScaledVector(from, -startRadius * 0.8);
    scaffolds.push(addLimb({
      parent: trunk,
      points: makeArcPath({
        start,
        from,
        to,
        length: limbLength,
        steps: 6,
        wobble: 0.1 + rng() * 0.08,
        phase: azimuth,
        rng,
      }),
      radiusStart: startRadius,
      radiusEnd: treeScale * (0.022 + rng() * 0.008),
      generation: 1,
      role: 'limb',
    }));
  }

  const branches = [];
  for (const scaffold of scaffolds) {
    const branchCount = 3 + Math.floor(rng() * 3);
    const firstSide = rng() < 0.5 ? -1 : 1;
    for (let index = 0; index < branchCount; index += 1) {
      const attachT = clamp(0.3 + index * (0.55 / Math.max(1, branchCount - 1)) + (rng() * 2 - 1) * 0.06, 0.26, 0.88);
      const host = samplePath(scaffold.points, attachT);
      // Branches reach away from the crown axis, alternating either side of
      // their leader, and turn their tips back up toward the light.
      const away = new THREE.Vector3(host.point.x, 0, host.point.z);
      if (away.lengthSq() < 1e-4) away.set(host.tangent.x, 0, host.tangent.z);
      away.normalize().applyAxisAngle(UP, (index % 2 ? -firstSide : firstSide) * (0.55 + rng() * 0.6));
      const elevation = 0.3 + rng() * 0.5;
      const from = away.clone().multiplyScalar(Math.cos(elevation)).addScaledVector(UP, Math.sin(elevation))
        .addScaledVector(host.tangent, 0.35)
        .normalize();
      const tipElevation = elevation + 0.2 + rng() * 0.35;
      const to = away.clone().multiplyScalar(Math.cos(tipElevation)).addScaledVector(UP, Math.sin(tipElevation)).normalize();
      const startRadius = radiusAt(scaffold, attachT) * (0.5 + rng() * 0.16);
      const start = host.point.clone().addScaledVector(from, -startRadius * 0.7);
      branches.push(addLimb({
        parent: scaffold,
        points: makeArcPath({
          start,
          from,
          to,
          length: height * (0.17 + rng() * 0.13) * (1 - attachT * 0.35),
          steps: 5,
          wobble: 0.12 + rng() * 0.1,
          phase: crownBias + index * 2.17,
          rng,
        }),
        radiusStart: startRadius,
        radiusEnd: treeScale * (0.015 + rng() * 0.006),
        generation: 2,
        role: 'branch',
      }));
    }
  }

  // Leaves come in tufts at the shoot tips: a few pinnate leaves splayed
  // around the bud, held up rather than drooping.
  const addFoliage = (limb, endpoint, direction, strength = 1) => {
    const chance = clamp(0.03 + seasonalLeaves * 0.95 * strength, 0, 0.74);
    if (rng() >= chance) return;
    const toneRoll = rng();
    const dryThreshold = clamp(0.1 + (0.34 - seasonalLeaves) * 0.28, 0.06, 0.22);
    const tone = toneRoll < dryThreshold ? 'dry' : toneRoll < 0.43 ? 'olive' : 'green';
    const tuft = 1 + Math.floor(rng() * (1 + seasonalLeaves * 2.2));
    const raised = direction.clone().normalize().lerp(UP, 0.45).normalize();
    const spin = rng() * Math.PI * 2;
    for (let leaf = 0; leaf < tuft; leaf += 1) {
      const leafDirection = tuft > 1
        ? branchDirection(raised, spin + leaf * (Math.PI * 2 / tuft), 0.5 + rng() * 0.35, 0)
        : raised;
      limb.foliage.push({
        position: endpoint.clone(),
        direction: leafDirection,
        variant: Math.floor(rng() * 6),
        scale: treeScale * (0.36 + rng() * 0.22),
        pitch: (rng() * 2 - 1) * 0.18,
        yaw: rng() * Math.PI * 2,
        roll: (rng() * 2 - 1) * 0.28,
        tone,
      });
    }
  };

  // Shoots are short, stout and sympodial: each season's growth ends and a
  // couple of new shoots break from just behind the tip, so branch ends read
  // as knobbly clustered fists rather than tapering whips.
  const addShoot = (limb, host, direction, { length, radius, azimuth, strength }) => {
    const start = host.point.clone().addScaledVector(direction, -radius * 0.9);
    const shootPoints = makeCrookedPath({
      start,
      direction,
      length,
      steps: 3,
      phase: azimuth,
      bend: 0.16 + rng() * 0.14,
      lift: 0.12 + rng() * 0.1,
      rng,
    });
    limb.twigs.push({
      points: shootPoints,
      radiusStart: radius,
      radiusEnd: Math.max(0.004, radius * (0.48 + rng() * 0.12)),
      variant: Math.floor(rng() * 8),
      order: 1,
    });
    const shootTip = samplePath(shootPoints, 1);
    addFoliage(limb, shootTip.point, shootTip.tangent, strength);
    const forkCount = rng() < 0.7 ? 1 + (rng() < 0.3 ? 1 : 0) : 0;
    for (let forkIndex = 0; forkIndex < forkCount; forkIndex += 1) {
      const forkHost = samplePath(shootPoints, 0.72 + rng() * 0.16);
      const forkDirection = branchDirection(
        forkHost.tangent,
        azimuth + 1.9 + forkIndex * 2.5 + rng(),
        0.45 + rng() * 0.3,
        0.14 + rng() * 0.12,
      );
      const forkRadius = radius * (0.55 + rng() * 0.12);
      const forkPoints = makeCrookedPath({
        start: forkHost.point.clone().addScaledVector(forkDirection, -forkRadius * 0.9),
        direction: forkDirection,
        length: length * (0.42 + rng() * 0.26),
        steps: 3,
        phase: azimuth + forkIndex,
        bend: 0.16 + rng() * 0.12,
        lift: 0.1 + rng() * 0.08,
        rng,
      });
      limb.twigs.push({
        points: forkPoints,
        radiusStart: forkRadius,
        radiusEnd: Math.max(0.0035, forkRadius * 0.5),
        variant: Math.floor(rng() * 8),
        order: 2,
      });
      const forkTip = samplePath(forkPoints, 1);
      addFoliage(limb, forkTip.point, forkTip.tangent, strength * 0.9);
    }
  };

  for (const limb of [...scaffolds, ...branches]) {
    const leader = limb.role === 'limb';
    const lateralCount = leader ? 3 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2);
    for (let index = 0; index < lateralCount; index += 1) {
      const attachT = clamp(0.45 + (index + rng() * 0.7) / lateralCount * 0.47, 0.45, 0.92);
      const host = samplePath(limb.points, attachT);
      const azimuth = crownBias + limb.variant * 0.61 + index * 2.31 + rng() * 0.75;
      addShoot(limb, host, branchDirection(host.tangent, azimuth, 0.6 + rng() * 0.35, 0.22 + rng() * 0.16), {
        length: height * (0.05 + rng() * 0.05),
        radius: Math.max(treeScale * 0.008, radiusAt(limb, attachT) * (0.42 + rng() * 0.14)),
        azimuth,
        strength: leader ? 0.9 : 1.05,
      });
    }
    const tip = samplePath(limb.points, 0.985);
    const tipCount = 2 + (rng() < 0.45 ? 1 : 0);
    const tipSpin = rng() * Math.PI * 2;
    for (let index = 0; index < tipCount; index += 1) {
      const azimuth = tipSpin + index * (Math.PI * 2 / tipCount) + rng() * 0.5;
      addShoot(limb, tip, branchDirection(tip.tangent, azimuth, 0.3 + rng() * 0.3, 0.2), {
        length: height * (0.045 + rng() * 0.045),
        radius: Math.max(treeScale * 0.008, limb.radiusEnd * (0.82 + rng() * 0.12)),
        azimuth,
        strength: 1.15,
      });
    }
  }

  // Bursera resprouts readily from the bole. A few low shoots, drawn after
  // the crown so they never reshape it, also put a twig within reach of
  // Darwin's hammer: the crown starts above anything he can swing at.
  const sproutCount = 1 + Math.floor(rng() * 2.4);
  const sproutCeiling = Math.min(1.45, boleHeight * 0.82);
  for (let index = 0; index < sproutCount; index += 1) {
    const sproutY = Math.max(0.32, sproutCeiling - rng() * 0.8);
    const attachT = clamp((sproutY + 0.14 * treeScale) / (boleHeight + 0.14 * treeScale), 0.12, 0.85);
    const host = samplePath(trunk.points, attachT);
    const azimuth = crownBias + Math.PI + index * 2.4 + (rng() * 2 - 1) * 0.6;
    const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const elevation = 0.45 + rng() * 0.35;
    const from = outward.clone().multiplyScalar(Math.cos(elevation)).addScaledVector(UP, Math.sin(elevation)).normalize();
    const tipElevation = elevation + 0.3 + rng() * 0.25;
    const to = outward.clone().multiplyScalar(Math.cos(tipElevation)).addScaledVector(UP, Math.sin(tipElevation)).normalize();
    const radius = (0.016 + rng() * 0.01) * Math.sqrt(treeScale);
    const start = host.point.clone()
      .addScaledVector(outward, radiusAt(trunk, attachT) - radius * 1.2);
    const sprout = addLimb({
      parent: trunk,
      points: makeArcPath({
        start,
        from,
        to,
        length: 0.42 + rng() * 0.38,
        steps: 4,
        wobble: 0.14 + rng() * 0.1,
        phase: azimuth,
        rng,
      }),
      radiusStart: radius,
      radiusEnd: radius * 0.5,
      generation: 2,
      role: 'branch',
    });
    sprout.sprout = true;
    const lateral = samplePath(sprout.points, 0.5 + rng() * 0.25);
    addShoot(sprout, lateral, branchDirection(lateral.tangent, azimuth + 1.6, 0.6 + rng() * 0.3, 0.25), {
      length: 0.12 + rng() * 0.1,
      radius: radius * 0.6,
      azimuth: azimuth + 1.6,
      strength: 1.2,
    });
    const tip = samplePath(sprout.points, 0.985);
    for (let shoot = 0; shoot < 2; shoot += 1) {
      const shootAzimuth = azimuth + shoot * Math.PI + rng() * 0.5;
      addShoot(sprout, tip, branchDirection(tip.tangent, shootAzimuth, 0.3 + rng() * 0.3, 0.2), {
        length: 0.1 + rng() * 0.1,
        radius: radius * 0.55,
        azimuth: shootAzimuth,
        strength: 1.25,
      });
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

// Toughness follows thickness: a pencil-thin shoot snaps in two blows, a
// limb as thick as a forearm takes deliberate work.
export function branchHitPoints(branch) {
  if (branch.role === 'trunk') return 999;
  const radius = branch.radiusStart;
  if (radius < 0.035) return 2;
  if (radius < 0.07) return 3;
  if (radius < 0.11) return 5;
  return 7;
}

// Birdshot severs twigs and scars limbs. Damage per blast falls steeply with
// thickness: a shoot goes in one blast, a wrist-thick branch in a few, and a
// main limb shrugs off anything short of a long fusillade.
export function branchShotDamageScale(branch) {
  return clamp((0.04 / Math.max(0.005, branch.radiusStart)) ** 1.5, 0.05, 1.6);
}

// Fresh palo santo wood is pale cream; a snap leaves a ragged face with long
// fibrous splinters pulled out of it. Built with +Y out of the break, at the
// origin, then oriented by the caller.
function createSplinterGeometry(radius, seed) {
  const rng = makeRng(`palo-splinter:${seed}`);
  const positions = [];
  const colors = [];
  const push = (point, shade) => {
    positions.push(point[0], point[1], point[2]);
    colors.push(shade[0], shade[1], shade[2]);
  };
  const face = [];
  const rim = 10;
  for (let index = 0; index < rim; index += 1) {
    const angle = (index / rim) * Math.PI * 2;
    const r = radius * (0.9 + rng() * 0.12);
    face.push([Math.cos(angle) * r, radius * rng() * 0.3, Math.sin(angle) * r]);
  }
  const centre = [0, radius * 0.18, 0];
  const faceShade = [0.8, 0.76, 0.68];
  for (let index = 0; index < rim; index += 1) {
    push(centre, faceShade);
    push(face[(index + 1) % rim], [0.92, 0.89, 0.8]);
    push(face[index], [0.92, 0.89, 0.8]);
  }
  const spikes = 11 + Math.floor(rng() * 7);
  for (let index = 0; index < spikes; index += 1) {
    const angle = rng() * Math.PI * 2;
    const rho = radius * (0.2 + rng() * 0.72);
    const width = radius * (0.07 + rng() * 0.1);
    // Splinters near the bark tear out longest.
    const length = radius * (0.25 + rng() * 0.95) * (0.5 + (rho / radius) * 0.75);
    const radial = [Math.cos(angle), 0, Math.sin(angle)];
    const tangent = [-Math.sin(angle), 0, Math.cos(angle)];
    const base = [radial[0] * rho, radius * 0.1, radial[2] * rho];
    const b0 = [base[0] + tangent[0] * width, base[1], base[2] + tangent[2] * width];
    const b1 = [base[0] - tangent[0] * width, base[1], base[2] - tangent[2] * width];
    const b2 = [base[0] - radial[0] * width * 0.6, base[1], base[2] - radial[2] * width * 0.6];
    const lean = (rng() - 0.3) * 0.35 * length;
    const twist = (rng() - 0.5) * width;
    const tip = [
      base[0] + radial[0] * lean + tangent[0] * twist,
      base[1] + length,
      base[2] + radial[2] * lean + tangent[2] * twist,
    ];
    const root = [0.82, 0.79, 0.72];
    const point = [1, 0.98, 0.93];
    for (const [a, b] of [[b0, b1], [b1, b2], [b2, b0]]) {
      push(a, root);
      push(b, root);
      push(tip, point);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function orientSplinter(geometry, origin, direction) {
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  geometry.translate(origin.x, origin.y, origin.z);
  geometry.computeBoundingSphere();
  return geometry;
}

// The stub a snapped limb leaves on its parent, in the parent's local frame:
// the first couple of diameters of the limb's own path (its buried base plus a
// short collar) ending in a splintered face.
export function buildPaloSantoBreakStub(branch, toParentLocal, parentFrame) {
  const total = Math.max(0.05, branch.pathLength);
  const stubLength = Math.min(total * 0.4, branch.radiusStart * (2.1 + seededUnit(`palo-stub:${branch.id}`) * 0.6));
  const tEnd = stubLength / total;
  const points = [0, 0.34, 0.67, 1].map(step => toParentLocal(samplePath(branch.points, tEnd * step).point));
  const end = samplePath(branch.points, tEnd);
  const bark = createTubeGeometry({
    points,
    radiusStart: branch.radiusStart * 1.02,
    radiusEnd: radiusAt(branch, tEnd) * 0.98,
    variant: branch.variant,
    radialSegments: 10,
    lengthSegments: 4,
    frame: parentFrame,
  });
  const tipLocal = toParentLocal(end.point);
  const ahead = toParentLocal(end.point.clone().add(end.tangent)).sub(tipLocal);
  const wood = orientSplinter(
    createSplinterGeometry(radiusAt(branch, tEnd) * 0.98, `${branch.id}:stub`),
    tipLocal,
    ahead,
  );
  return { bark, wood };
}

// The torn end of the snapped limb itself, at its own origin, splinters
// pointing back toward the tree.
export function buildPaloSantoBreakEnd(branch, toBranchLocal) {
  const origin = toBranchLocal(branch.points[0]);
  const back = origin.clone().sub(toBranchLocal(branch.points[1])).normalize();
  return orientSplinter(createSplinterGeometry(branch.radiusStart, `${branch.id}:end`), origin, back);
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
