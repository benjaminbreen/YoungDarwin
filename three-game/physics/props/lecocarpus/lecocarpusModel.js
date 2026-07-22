// Procedural Lecocarpus pinnatifidus informed by Darwin's Floreana specimen,
// Hooker's account of its strongly variable pinnatifid leaves, and modern CDF
// descriptions of the yellow heads and uniquely winged fruit. The precise
// architecture of any one 1835 shrub remains an inference.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../breakablePlant/plantGeoUtils';

const UP = new THREE.Vector3(0, 1, 0);
const LEAF_COLORS = ['#63743e', '#718148', '#7d894d', '#596b3b'];

function geometryBetween(start, end, radiusStart, radiusEnd = radiusStart, radialSegments = 7) {
  const direction = end.clone().sub(start);
  const length = Math.max(0.001, direction.length());
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, radialSegments, 1, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  return geometry;
}

function mergeAndDispose(geometries) {
  const usable = geometries.filter(Boolean);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const merged = mergeGeometries(usable, false);
  usable.forEach(geometry => geometry.dispose());
  return merged;
}

function createPinnatifidLeaf({ width, length, tone, lobeDepth }) {
  // A fan around the midrib lets the outline carry six paired lobes without a
  // texture alpha edge. The end lobe stays broad and blunt, matching the
  // variation Hooker called out in Darwin's material.
  const outline = [];
  const pairs = 7;
  for (let index = 0; index <= pairs * 2; index += 1) {
    const t = index / (pairs * 2);
    const envelope = Math.pow(Math.sin(Math.PI * Math.min(0.98, t)), 0.62) * (1 - t * 0.28);
    const cut = index % 2 ? 1 : lobeDepth;
    outline.push([-width * 0.5 * Math.max(0.12, envelope * cut), t]);
  }
  for (let index = pairs * 2; index >= 0; index -= 1) {
    const t = index / (pairs * 2);
    const envelope = Math.pow(Math.sin(Math.PI * Math.min(0.98, t)), 0.62) * (1 - t * 0.28);
    const cut = index % 2 ? 1 : lobeDepth;
    outline.push([width * 0.5 * Math.max(0.12, envelope * cut), t]);
  }
  const positions = [0, length * 0.018, length * 0.47];
  const colors = [];
  const color = new THREE.Color(LEAF_COLORS[Math.floor(tone * LEAF_COLORS.length) % LEAF_COLORS.length]);
  const addColor = light => colors.push(color.r * light, color.g * light, color.b * light);
  addColor(1.08);
  outline.forEach(([x, t], index) => {
    const dome = Math.sin(Math.PI * t) * (1 - Math.min(1, Math.abs(x) / (width * 0.5))) * length * 0.03;
    positions.push(x, dome + Math.sin(index * 1.83 + tone * 8) * length * 0.004, t * length);
    addColor(0.86 + (index % 3) * 0.035);
  });
  const indices = [];
  for (let index = 0; index < outline.length; index += 1) {
    indices.push(0, index + 1, 1 + ((index + 1) % outline.length));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function transformBlade(geometry, position, segmentQuaternion, yaw, tilt) {
  const worldPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ'));
  geometry.applyQuaternion(segmentQuaternion.clone().invert().multiply(worldPose));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function addFlowerHead(origin, yaw, scale, petals, disks) {
  const petalCount = 13;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = yaw + (index / petalCount) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(1, 6, 4);
    petal.scale(scale * 0.016, scale * 0.0032, scale * 0.0062);
    petal.translate(scale * 0.013, 0, 0);
    petal.rotateY(angle);
    petal.translate(origin.x, origin.y, origin.z);
    petals.push(petal);
  }
  const disk = new THREE.SphereGeometry(1, 10, 6);
  disk.scale(scale * 0.015, scale * 0.006, scale * 0.015);
  disk.translate(origin.x, origin.y + scale * 0.0015, origin.z);
  disks.push(disk);
}

function addWingedFruit(origin, yaw, scale, fruits, wings) {
  const center = new THREE.SphereGeometry(scale * 0.011, 8, 5);
  center.scale(1, 0.45, 1);
  center.translate(origin.x, origin.y, origin.z);
  fruits.push(center);
  for (let index = 0; index < 8; index += 1) {
    const angle = yaw + (index / 8) * Math.PI * 2;
    const wing = new THREE.PlaneGeometry(scale * 0.008, scale * 0.021, 1, 1);
    wing.rotateX(-Math.PI / 2);
    wing.rotateY(angle);
    wing.translate(
      origin.x + Math.cos(angle) * scale * 0.014,
      origin.y + scale * 0.002,
      origin.z + Math.sin(angle) * scale * 0.014,
    );
    wings.push(wing);
  }
}

function leavesForSegment(generation, rng, size) {
  const count = generation === 0 ? 3 : generation === 1 ? 4 : 3;
  return Array.from({ length: count }, (_, index) => ({
    t: 0.2 + (index / Math.max(1, count - 1)) * 0.6,
    yaw: rng() * Math.PI * 2 + index * 2.18,
    width: size * (generation === 0 ? 0.05 : generation === 1 ? 0.058 : 0.047) * (0.88 + rng() * 0.2),
    length: size * (generation === 0 ? 0.068 : generation === 1 ? 0.078 : 0.062) * (0.9 + rng() * 0.18),
    petiole: size * (0.014 + rng() * 0.009),
    lobeDepth: 0.28 + rng() * 0.2,
    tone: rng(),
  }));
}

export function buildLecocarpus({ seed, size = 1, flowering = 0.82 }) {
  const rng = makeRng(`lecocarpus:${seed}`);
  const segments = [];
  const addSegment = ({ id, parentId = null, generation, position, direction, length, radius, terminal = false }) => {
    const normalized = direction.clone().normalize();
    const segment = {
      id,
      parentId,
      generation,
      position: position.clone(),
      direction: normalized,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, normalized),
      length,
      radius,
      leaves: leavesForSegment(generation, rng, size),
      terminal,
      flowerState: terminal && rng() < flowering ? (rng() < 0.22 ? 'fruit' : 'flower') : null,
      variant: Math.floor(rng() * 12),
      tone: rng(),
    };
    segment.mass = Math.max(0.055, length * radius * radius * 190 + segment.leaves.length * 0.02);
    segments.push(segment);
    return segment;
  };

  const root = new THREE.Vector3((rng() - 0.5) * 0.018, 0.026 * size, (rng() - 0.5) * 0.018);
  const trunk = addSegment({
    id: 'trunk',
    generation: 0,
    position: root,
    direction: new THREE.Vector3((rng() - 0.5) * 0.1, 1, (rng() - 0.5) * 0.1),
    length: size * (0.18 + rng() * 0.035),
    radius: size * 0.014,
  });
  const fork = root.clone().addScaledVector(trunk.direction, trunk.length * 0.93);
  const phase = rng() * Math.PI * 2;
  for (let branchIndex = 0; branchIndex < 3; branchIndex += 1) {
    const yaw = phase + branchIndex * Math.PI * 2 / 3 + (rng() - 0.5) * 0.26;
    const primary = addSegment({
      id: `branch-${branchIndex}`,
      parentId: trunk.id,
      generation: 1,
      position: fork,
      direction: new THREE.Vector3(Math.cos(yaw) * (0.42 + rng() * 0.1), 0.82, Math.sin(yaw) * (0.42 + rng() * 0.1)),
      length: size * (0.31 + rng() * 0.07),
      radius: size * (0.009 + rng() * 0.0015),
    });
    const branchEnd = primary.position.clone().addScaledVector(primary.direction, primary.length * 0.94);
    for (let tipIndex = 0; tipIndex < 2; tipIndex += 1) {
      const tipYaw = yaw + (tipIndex ? 1 : -1) * (0.38 + rng() * 0.28);
      addSegment({
        id: `tip-${branchIndex}-${tipIndex}`,
        parentId: primary.id,
        generation: 2,
        position: branchEnd,
        direction: new THREE.Vector3(Math.cos(tipYaw) * (0.24 + rng() * 0.09), 0.93, Math.sin(tipYaw) * (0.24 + rng() * 0.09)),
        length: size * (0.2 + rng() * 0.055),
        radius: size * (0.0052 + rng() * 0.001),
        terminal: true,
      });
    }
  }
  return { segments };
}

export function buildLecocarpusSegmentGeometry(segment) {
  const rng = makeRng(`lecocarpus-visual:${segment.id}:${segment.variant}`);
  const stems = [geometryBetween(
    new THREE.Vector3(),
    new THREE.Vector3(0, segment.length, 0),
    segment.radius * 1.08,
    segment.radius * 0.72,
    8,
  )];
  const leaves = [];
  const veins = [];
  const petals = [];
  const disks = [];
  const fruits = [];
  const wings = [];

  segment.leaves.forEach(leaf => {
    const node = new THREE.Vector3(0, segment.length * leaf.t, 0);
    const worldOut = new THREE.Vector3(Math.cos(leaf.yaw), 0.13, Math.sin(leaf.yaw)).normalize();
    const localOut = worldOut.clone().applyQuaternion(segment.quaternion.clone().invert());
    const petioleEnd = node.clone().addScaledVector(localOut, leaf.petiole);
    stems.push(geometryBetween(node, petioleEnd, segment.radius * 0.3, segment.radius * 0.12, 5));
    const blade = createPinnatifidLeaf(leaf);
    transformBlade(blade, petioleEnd, segment.quaternion, leaf.yaw - Math.PI / 2, -0.05 + rng() * 0.1);
    leaves.push(blade);
    veins.push(geometryBetween(petioleEnd, petioleEnd.clone().addScaledVector(localOut, leaf.length * 0.82), 0.0012, 0.0004, 5));
  });

  if (segment.terminal && segment.flowerState) {
    const peduncleStart = new THREE.Vector3(0, segment.length * 0.88, 0);
    const peduncleEnd = new THREE.Vector3(0, segment.length + 0.11, 0);
    stems.push(geometryBetween(peduncleStart, peduncleEnd, segment.radius * 0.34, segment.radius * 0.18, 6));
    if (segment.flowerState === 'fruit') {
      addWingedFruit(peduncleEnd, segment.variant * 0.7, Math.max(0.82, segment.length / 0.23), fruits, wings);
    } else {
      addFlowerHead(peduncleEnd, segment.variant * 0.61, Math.max(0.86, segment.length / 0.23), petals, disks);
    }
  }

  return {
    stems: mergeAndDispose(stems),
    leaves: mergeAndDispose(leaves),
    veins: mergeAndDispose(veins),
    petals: mergeAndDispose(petals),
    disks: mergeAndDispose(disks),
    fruits: mergeAndDispose(fruits),
    wings: mergeAndDispose(wings),
  };
}

let materialsCache = null;
export function getLecocarpusMaterials() {
  if (materialsCache) return materialsCache;
  materialsCache = {
    stem: new THREE.MeshStandardMaterial({ color: '#746247', roughness: 0.82, metalness: 0 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: '#8b9658', roughness: 0.67, clearcoat: 0.06, clearcoatRoughness: 0.78, vertexColors: true, side: THREE.DoubleSide }),
    vein: new THREE.MeshStandardMaterial({ color: '#abb376', roughness: 0.78, metalness: 0 }),
    petal: new THREE.MeshPhysicalMaterial({ color: '#e4b933', roughness: 0.52, clearcoat: 0.16, clearcoatRoughness: 0.62 }),
    disk: new THREE.MeshStandardMaterial({ color: '#79572c', roughness: 0.74, metalness: 0 }),
    fruit: new THREE.MeshStandardMaterial({ color: '#715739', roughness: 0.84, metalness: 0 }),
    wing: new THREE.MeshPhysicalMaterial({ color: '#c8a96a', roughness: 0.62, transmission: 0.08, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    litter: new THREE.MeshStandardMaterial({ color: '#604d38', roughness: 0.97, metalness: 0, flatShading: true }),
  };
  return materialsCache;
}

export function lecocarpusColliderSpec(segment) {
  return {
    halfExtents: [Math.max(0.026, segment.radius * 1.7), segment.length * 0.47, Math.max(0.026, segment.radius * 1.7)],
    offset: [0, segment.length * 0.5, 0],
  };
}

export function buildLecocarpusDressing({ seed, size = 1 }) {
  const rng = makeRng(`lecocarpus-dressing:${seed}`);
  return Array.from({ length: 4 + Math.floor(rng() * 3) }, (_, index) => {
    const angle = rng() * Math.PI * 2;
    const distance = size * (0.14 + rng() * 0.48);
    return { id: index, x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, yaw: angle + rng(), scale: size * (0.022 + rng() * 0.04), stretch: [0.6 + rng() * 0.8, 0.24 + rng() * 0.22, 0.7 + rng()] };
  });
}
