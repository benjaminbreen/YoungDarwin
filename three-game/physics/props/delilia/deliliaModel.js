// Evidence-led procedural reconstruction of Delilia inelegans Hook.f.
// Hooker's description constrains the annual root, low erect cylindrical
// stem, trichotomous ascending branches, opposite blunt doubly-serrate leaves,
// pubescence, and crowded depressed-globose axillary heads. Living colour and
// the precise posture of fresh material are conservative inferences.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, pushSpike } from '../breakablePlant/plantGeoUtils';

const UP = new THREE.Vector3(0, 1, 0);
const LEAF_TINTS = ['#435b35', '#50683c', '#596f40', '#3e5532'];

function geometryBetween(start, end, radiusStart, radiusEnd = radiusStart, radialSegments = 7) {
  const direction = end.clone().sub(start);
  const length = Math.max(0.001, direction.length());
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, radialSegments, 1, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  geometry.translate(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5,
    (start.z + end.z) * 0.5,
  );
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

function createSerratedLeafGeometry({ width, length, tone, ripple }) {
  // The alternating long/short edge points imply a doubly serrate margin at
  // this small scale. A shallow dome and midrib keep the blade from reading as
  // a perfectly flat card, while the shortened terminal edge stays blunt.
  const outline = [];
  const edgeSteps = 18;
  for (let index = 0; index <= edgeSteps; index += 1) {
    const t = index / edgeSteps;
    let halfWidth = width * 0.5 * (0.12 + Math.pow(Math.sin(Math.PI * t), 0.72) * 0.88) * (1 - t * 0.14);
    if (index > 0 && index < edgeSteps) halfWidth *= index % 2 ? 1 : 0.83;
    outline.push([-halfWidth, t]);
  }
  for (let index = edgeSteps; index >= 0; index -= 1) {
    const t = index / edgeSteps;
    let halfWidth = width * 0.5 * (0.12 + Math.pow(Math.sin(Math.PI * t), 0.72) * 0.88) * (1 - t * 0.14);
    if (index > 0 && index < edgeSteps) halfWidth *= index % 2 ? 1 : 0.83;
    outline.push([halfWidth, t]);
  }

  const positions = [0, 0.018 * length, length * 0.46];
  const colors = [];
  const baseColor = new THREE.Color(LEAF_TINTS[Math.floor(tone * LEAF_TINTS.length) % LEAF_TINTS.length]);
  const addColor = light => colors.push(baseColor.r * light, baseColor.g * light, baseColor.b * light);
  addColor(1.08);
  outline.forEach(([x, t], index) => {
    const across = Math.min(1, Math.abs(x) / Math.max(0.001, width * 0.5));
    const dome = (1 - across) * Math.sin(Math.PI * t) * length * 0.035;
    const edgeWave = Math.sin(index * 1.71 + tone * 7.3) * ripple;
    positions.push(x, dome + edgeWave, t * length);
    addColor(0.84 + (index % 4) * 0.035 + (1 - t) * 0.025);
  });
  const indices = [];
  for (let index = 0; index < outline.length; index += 1) {
    indices.push(0, 1 + index, 1 + ((index + 1) % outline.length));
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
  const localPose = segmentQuaternion.clone().invert().multiply(worldPose);
  geometry.applyQuaternion(localPose);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function createFlowerHead(origin, scale, salt, flowerHeads, flowerTips) {
  // Delilia is a composite: a flattened central disk ringed with many minute,
  // inconspicuous florets rather than one large flower.
  const base = new THREE.SphereGeometry(1, 9, 6);
  base.scale(scale * 0.016, scale * 0.0075, scale * 0.016);
  base.translate(origin.x, origin.y, origin.z);
  flowerHeads.push(base);
  const floretCount = 9;
  for (let index = 0; index < floretCount; index += 1) {
    const angle = (index / floretCount) * Math.PI * 2 + salt;
    const radius = scale * (index % 3 === 0 ? 0.0105 : 0.0082);
    const floret = new THREE.SphereGeometry(scale * 0.0032, 5, 4);
    floret.scale(1, 0.52, 1);
    floret.translate(
      origin.x + Math.cos(angle) * radius,
      origin.y + scale * (0.0066 + (index % 2) * 0.0014),
      origin.z + Math.sin(angle) * radius,
    );
    flowerTips.push(floret);
  }
}

function makeLeafPairs({ generation, rng, size }) {
  const pairCount = generation === 0 ? 1 : 2;
  return Array.from({ length: pairCount }, (_, pairIndex) => {
    const t = generation === 0 ? 0.56 : 0.38 + pairIndex * 0.4;
    const baseSize = size * (generation === 0 ? 0.075 : generation === 1 ? 0.086 : 0.063);
    return {
      t,
      yaw: rng() * Math.PI * 2,
      width: baseSize * (0.46 + rng() * 0.1),
      length: baseSize * (0.94 + rng() * 0.16),
      petiole: size * (0.016 + rng() * 0.009),
      tone: rng(),
      ripple: size * (0.0005 + rng() * 0.0011),
      flowered: generation > 0 && (pairIndex > 0 || rng() > 0.28),
    };
  });
}

export function buildDelilia({ seed, size = 1, flowering = 0.86 }) {
  const rng = makeRng(`delilia:${seed}`);
  const segments = [];
  const addSegment = ({ id, parentId = null, generation, position, direction, length, radius }) => {
    const segment = {
      id,
      parentId,
      generation,
      position: position.clone(),
      direction: direction.clone().normalize(),
      length,
      radius,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
      leafPairs: makeLeafPairs({ generation, rng, size }),
      flowering,
      variant: Math.floor(rng() * 12),
      tone: rng(),
    };
    segment.mass = Math.max(0.025, length * radius * radius * 120 + segment.leafPairs.length * 0.018);
    segments.push(segment);
    return segment;
  };

  const crown = new THREE.Vector3((rng() - 0.5) * 0.009, 0.018 * size, (rng() - 0.5) * 0.009);
  const basal = addSegment({
    id: 'basal-stem',
    generation: 0,
    position: crown,
    direction: new THREE.Vector3((rng() - 0.5) * 0.08, 1, (rng() - 0.5) * 0.08),
    length: size * (0.088 + rng() * 0.018),
    radius: size * 0.0066,
  });
  const fork = crown.clone().addScaledVector(basal.direction, basal.length * 0.92);
  const phase = rng() * Math.PI * 2;

  for (let branchIndex = 0; branchIndex < 3; branchIndex += 1) {
    const yaw = phase + branchIndex * (Math.PI * 2 / 3) + (rng() - 0.5) * 0.16;
    const direction = new THREE.Vector3(Math.cos(yaw) * (0.45 + rng() * 0.08), 0.82, Math.sin(yaw) * (0.45 + rng() * 0.08)).normalize();
    const primary = addSegment({
      id: `primary-${branchIndex}`,
      parentId: basal.id,
      generation: 1,
      position: fork.clone(),
      direction,
      length: size * (0.165 + rng() * 0.035),
      radius: size * (0.0047 + rng() * 0.0007),
    });
    const primaryEnd = primary.position.clone().addScaledVector(primary.direction, primary.length * 0.94);
    const upperYaw = yaw + (rng() - 0.5) * 0.52;
    addSegment({
      id: `upper-${branchIndex}`,
      parentId: primary.id,
      generation: 2,
      position: primaryEnd,
      direction: new THREE.Vector3(Math.cos(upperYaw) * (0.28 + rng() * 0.08), 0.9, Math.sin(upperYaw) * (0.28 + rng() * 0.08)).normalize(),
      length: size * (0.105 + rng() * 0.025),
      radius: size * (0.0032 + rng() * 0.0005),
    });
  }

  return { segments };
}

export function buildDeliliaSegmentGeometry(segment) {
  const rng = makeRng(`delilia-visual:${segment.id}:${segment.variant}`);
  const stems = [];
  const leaves = [];
  const veins = [];
  const hairs = [];
  const flowerHeads = [];
  const flowerTips = [];
  stems.push(geometryBetween(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, segment.length, 0),
    segment.radius * 1.08,
    segment.radius * 0.68,
    8,
  ));

  segment.leafPairs.forEach((pair, pairIndex) => {
    const node = new THREE.Vector3(0, segment.length * pair.t, 0);
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const yaw = pair.yaw + sideIndex * Math.PI + (sideIndex ? -0.025 : 0.025);
      const worldOut = new THREE.Vector3(Math.cos(yaw), 0.08, Math.sin(yaw)).normalize();
      const localOut = worldOut.clone().applyQuaternion(segment.quaternion.clone().invert());
      const petioleEnd = node.clone().addScaledVector(localOut, pair.petiole);
      stems.push(geometryBetween(node, petioleEnd, segment.radius * 0.34, segment.radius * 0.14, 5));

      const leafGeometry = createSerratedLeafGeometry(pair);
      transformBlade(
        leafGeometry,
        petioleEnd,
        segment.quaternion,
        yaw - Math.PI / 2,
        -0.06 + rng() * 0.12,
      );
      leaves.push(leafGeometry);

      const midribEnd = petioleEnd.clone().addScaledVector(localOut, pair.length * 0.82);
      veins.push(geometryBetween(petioleEnd, midribEnd, 0.00115, 0.00042, 5));

      if (pair.flowered && rng() < segment.flowering) {
        const headOrigin = node.clone().addScaledVector(localOut, pair.petiole * 0.46);
        headOrigin.y += segment.length * 0.008;
        stems.push(geometryBetween(node, headOrigin, 0.0011, 0.00055, 5));
        createFlowerHead(headOrigin, Math.max(0.74, segment.length / 0.18), pairIndex + sideIndex * 0.8, flowerHeads, flowerTips);
      }
    }
  });

  const hairPositions = [];
  const hairCount = segment.generation === 0 ? 9 : 12;
  for (let index = 0; index < hairCount; index += 1) {
    const t = (index + 0.45) / hairCount;
    const angle = index * 2.399 + segment.variant;
    const origin = new THREE.Vector3(
      Math.cos(angle) * segment.radius * 0.84,
      segment.length * t,
      Math.sin(angle) * segment.radius * 0.84,
    );
    pushSpike(
      hairPositions,
      origin,
      new THREE.Vector3(Math.cos(angle), 0.16, Math.sin(angle)),
      0.00028,
      0.0045 + rng() * 0.0025,
    );
  }
  const hairGeometry = new THREE.BufferGeometry();
  hairGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hairPositions, 3));
  hairGeometry.computeVertexNormals();
  hairs.push(hairGeometry);

  return {
    stems: mergeAndDispose(stems),
    leaves: mergeAndDispose(leaves),
    veins: mergeAndDispose(veins),
    hairs: mergeAndDispose(hairs),
    flowerHeads: mergeAndDispose(flowerHeads),
    flowerTips: mergeAndDispose(flowerTips),
  };
}

let materialsCache = null;
export function getDeliliaMaterials() {
  if (materialsCache) return materialsCache;
  materialsCache = {
    stem: new THREE.MeshStandardMaterial({ color: '#60734a', roughness: 0.72, metalness: 0 }),
    leaf: new THREE.MeshPhysicalMaterial({
      color: '#718555',
      roughness: 0.64,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.76,
      vertexColors: true,
      side: THREE.DoubleSide,
      emissive: '#15200f',
      emissiveIntensity: 0.035,
    }),
    vein: new THREE.MeshStandardMaterial({ color: '#9aa472', roughness: 0.76, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: '#c9c4a2', roughness: 0.56, metalness: 0 }),
    flowerHead: new THREE.MeshStandardMaterial({ color: '#77713d', roughness: 0.72, metalness: 0 }),
    flowerTip: new THREE.MeshPhysicalMaterial({
      color: '#b09a4b',
      roughness: 0.6,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.68,
    }),
    litter: new THREE.MeshStandardMaterial({ color: '#5d513d', roughness: 0.96, metalness: 0, flatShading: true }),
  };
  return materialsCache;
}

export function deliliaColliderSpec(segment) {
  return {
    halfExtents: [Math.max(0.018, segment.radius * 1.8), segment.length * 0.47, Math.max(0.018, segment.radius * 1.8)],
    offset: [0, segment.length * 0.5, 0],
  };
}

export function buildDeliliaDressing({ seed, size = 1 }) {
  const rng = makeRng(`delilia-dressing:${seed}`);
  return Array.from({ length: 3 + Math.floor(rng() * 2) }, (_, index) => {
    const angle = rng() * Math.PI * 2;
    const distance = size * (0.08 + rng() * 0.28);
    return {
      id: index,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      yaw: angle + rng(),
      scale: size * (0.018 + rng() * 0.026),
      stretch: [0.65 + rng() * 0.7, 0.25 + rng() * 0.2, 0.75 + rng() * 0.75],
    };
  });
}
