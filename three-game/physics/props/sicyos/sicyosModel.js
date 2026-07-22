// Evidence-led procedural reconstruction of Sicyos villosus Hook.f. Darwin's
// dried specimen and Hooker's description constrain the broad cordate leaves,
// glandular hairs, divided tendrils, yellow male-flower panicles, and bristly
// elliptic fruit. Living colour, posture, and colony architecture are inferred
// conservatively from those characters and related cucurbits.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, pushSpike, seededUnit } from '../breakablePlant/plantGeoUtils';

const UP = new THREE.Vector3(0, 1, 0);
const LEAF_TINTS = ['#496f3b', '#557c42', '#628849', '#3f6539'];

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

function createCordateLeafGeometry({ width, length, curl, tone }) {
  // Petiole joins at the basal notch (-Z); the pointed tip is +Z. A raised
  // midrib and alternating edge curl keep the leaf from reading as a flat card.
  const outline = [
    [0, -0.39], [-0.2, -0.49], [-0.42, -0.37], [-0.52, -0.12],
    [-0.48, 0.13], [-0.33, 0.34], [-0.15, 0.5], [0, 0.62],
    [0.15, 0.5], [0.33, 0.34], [0.48, 0.13], [0.52, -0.12],
    [0.42, -0.37], [0.2, -0.49],
  ];
  const positions = [0, 0.014, 0.04 * length];
  const colors = [];
  const baseColor = new THREE.Color(LEAF_TINTS[Math.floor(tone * LEAF_TINTS.length) % LEAF_TINTS.length]);
  const pushColor = (light = 1) => colors.push(baseColor.r * light, baseColor.g * light, baseColor.b * light);
  pushColor(1.08);
  for (let index = 0; index < outline.length; index += 1) {
    const [nx, nz] = outline[index];
    const edgeWave = Math.sin(index * 2.43 + tone * 9) * curl;
    const dome = (1 - Math.min(1, Math.hypot(nx / 0.54, nz / 0.64))) * 0.035;
    positions.push(nx * width, dome + edgeWave, nz * length);
    pushColor(0.86 + (index % 3) * 0.045);
  }
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

function transformLeafGeometry(geometry, position, segmentQuaternion, yaw = 0, tilt = 0) {
  // Leaves phototropically present their blades upward rather than remaining
  // perpendicular to a ground-running stem. Express that world-level pose in
  // segment-local space so the parent rigid body's rotation cancels cleanly.
  const worldPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ'));
  const localPose = segmentQuaternion.clone().invert().multiply(worldPose);
  geometry.applyQuaternion(localPose);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function createTendrilGeometry(origin, yaw, handedness, scale) {
  const points = [origin.clone()];
  for (let index = 1; index <= 18; index += 1) {
    const t = index / 18;
    const angle = handedness * t * Math.PI * 4.4;
    const radius = scale * (0.075 - t * 0.035);
    points.push(new THREE.Vector3(
      origin.x + Math.cos(yaw) * scale * t * 0.24 + Math.cos(angle) * radius,
      origin.y + scale * (0.025 + t * 0.08),
      origin.z + Math.sin(yaw) * scale * t * 0.24 + Math.sin(angle) * radius,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
  return new THREE.TubeGeometry(curve, 22, 0.0042 * scale, 5, false);
}

function createFlowerPanicle(origin, yaw, scale, rng) {
  const stems = [];
  const petals = [];
  const centers = [];
  const stalkEnd = origin.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.1, 0.16, Math.sin(yaw) * 0.1).multiplyScalar(scale));
  stems.push(geometryBetween(origin, stalkEnd, 0.0045 * scale, 0.003 * scale, 5));
  const armCount = 3;
  for (let arm = 0; arm < armCount; arm += 1) {
    const armYaw = yaw + (arm - 1) * 0.62 + (rng() - 0.5) * 0.18;
    const armEnd = stalkEnd.clone().add(new THREE.Vector3(
      Math.cos(armYaw) * 0.11 * scale,
      (0.025 + arm * 0.018) * scale,
      Math.sin(armYaw) * 0.11 * scale,
    ));
    stems.push(geometryBetween(stalkEnd, armEnd, 0.003 * scale, 0.0018 * scale, 5));
    for (let flower = 0; flower < 2; flower += 1) {
      const center = stalkEnd.clone().lerp(armEnd, 0.62 + flower * 0.36);
      const flowerScale = scale * (0.018 + rng() * 0.004);
      for (let petal = 0; petal < 5; petal += 1) {
        const petalGeometry = new THREE.SphereGeometry(1, 6, 4);
        petalGeometry.scale(flowerScale * 0.8, flowerScale * 0.22, flowerScale * 0.32);
        petalGeometry.translate(flowerScale * 0.66, 0, 0);
        petalGeometry.rotateY((petal / 5) * Math.PI * 2 + armYaw);
        petalGeometry.translate(center.x, center.y, center.z);
        petals.push(petalGeometry);
      }
      const centerGeometry = new THREE.SphereGeometry(flowerScale * 0.32, 6, 4);
      centerGeometry.translate(center.x, center.y + flowerScale * 0.1, center.z);
      centers.push(centerGeometry);
    }
  }
  return { stems, petals, centers };
}

function createBristlyFruit(origin, yaw, scale, salt) {
  const fruit = new THREE.SphereGeometry(1, 8, 7);
  fruit.scale(0.017 * scale, 0.029 * scale, 0.017 * scale);
  fruit.rotateZ(0.35);
  fruit.translate(origin.x, origin.y, origin.z);
  const positions = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2 + yaw;
    const vertical = -0.75 + (index % 4) * 0.5;
    const normal = new THREE.Vector3(Math.cos(angle), vertical, Math.sin(angle)).normalize();
    const base = origin.clone().add(new THREE.Vector3(
      normal.x * 0.014 * scale,
      normal.y * 0.022 * scale,
      normal.z * 0.014 * scale,
    ));
    const hooked = normal.clone().add(new THREE.Vector3(
      Math.sin(angle) * (seededUnit(salt, index) - 0.5) * 0.35,
      0.12,
      -Math.cos(angle) * (seededUnit(salt, index + 20) - 0.5) * 0.35,
    )).normalize();
    pushSpike(positions, base, hooked, 0.0012 * scale, 0.018 * scale);
  }
  const bristles = new THREE.BufferGeometry();
  bristles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bristles.computeVertexNormals();
  return { fruit, bristles };
}

function branchDirection(yaw, generation, rng) {
  const lift = generation === 0 ? 0.15 : generation >= 3 ? 0.42 + rng() * 0.24 : 0.16 + rng() * 0.2;
  return new THREE.Vector3(Math.cos(yaw), lift, Math.sin(yaw)).normalize();
}

export function buildSicyos({ seed, size = 1, flowering = 0.7 }) {
  const rng = makeRng(`sicyos:${seed}`);
  const segments = [];
  const runnerCount = 3 + Math.floor(rng() * 2);

  const addRunner = runnerIndex => {
    let parent = null;
    let position = new THREE.Vector3(
      (rng() - 0.5) * 0.12 * size,
      0.025 * size,
      (rng() - 0.5) * 0.12 * size,
    );
    let yaw = (runnerIndex / runnerCount) * Math.PI * 2 + (rng() - 0.5) * 0.52;
    const count = 3 + Math.floor(rng() * 2);
    for (let generation = 0; generation < count; generation += 1) {
      yaw += (rng() - 0.5) * (generation > 1 ? 0.72 : 0.42);
      const direction = branchDirection(yaw, generation, rng);
      const length = size * (0.46 + rng() * 0.28) * (1 - generation * 0.045);
      const radius = size * (0.016 - generation * 0.0018);
      const id = `runner-${runnerIndex}-segment-${generation}`;
      const leafCount = generation === 0 ? 1 : 1 + (rng() > 0.46 ? 1 : 0);
      const leaves = Array.from({ length: leafCount }, (_, leafIndex) => ({
        t: leafCount === 1 ? 0.68 : 0.42 + leafIndex * 0.38,
        side: (leafIndex + generation + runnerIndex) % 2 ? 1 : -1,
        width: size * (0.16 + rng() * 0.055) * (generation === 0 ? 0.84 : 1),
        length: size * (0.17 + rng() * 0.06) * (generation === 0 ? 0.84 : 1),
        yaw: yaw + ((leafIndex + generation) % 2 ? 1 : -1) * (0.82 + rng() * 0.34),
        tone: rng(),
        curl: 0.005 + rng() * 0.008,
      }));
      const floweringChance = flowering * (generation >= count - 2 ? 0.8 : 0.18);
      const segment = {
        id,
        parentId: parent?.id || null,
        runnerIndex,
        generation,
        position: position.clone(),
        direction,
        quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction),
        length,
        radius,
        leaves,
        tendril: generation > 0 && rng() > 0.32,
        flowerPanicle: rng() < floweringChance,
        fruitCount: generation >= count - 2 && rng() < flowering * 0.42 ? 1 + (rng() > 0.78 ? 1 : 0) : 0,
        variant: Math.floor(rng() * 8),
        tone: rng(),
        mass: Math.max(0.06, length * radius * radius * 95 + leaves.length * 0.035),
      };
      segments.push(segment);
      position = position.clone().addScaledVector(direction, length * 0.94);
      parent = segment;
    }
  };

  for (let runner = 0; runner < runnerCount; runner += 1) addRunner(runner);
  return { segments };
}

export function buildSicyosSegmentGeometry(segment) {
  const rng = makeRng(`sicyos-visual:${segment.id}:${segment.variant}`);
  const stems = [];
  const leaves = [];
  const veins = [];
  const tendrils = [];
  const hairs = [];
  const petals = [];
  const centers = [];
  const fruits = [];
  const fruitBristles = [];
  const stemStart = new THREE.Vector3(0, 0, 0);
  const stemEnd = new THREE.Vector3(0, segment.length, 0);
  stems.push(geometryBetween(stemStart, stemEnd, segment.radius * 1.08, segment.radius * 0.76, 8));

  for (let leafIndex = 0; leafIndex < segment.leaves.length; leafIndex += 1) {
    const leaf = segment.leaves[leafIndex];
    const node = new THREE.Vector3(0, segment.length * leaf.t, 0);
    const outward = new THREE.Vector3(Math.cos(leaf.yaw), 0.18, Math.sin(leaf.yaw)).normalize();
    const petioleEnd = node.clone().addScaledVector(outward, leaf.width * (0.72 + rng() * 0.16));
    stems.push(geometryBetween(node, petioleEnd, segment.radius * 0.42, segment.radius * 0.2, 6));

    const leafGeometry = createCordateLeafGeometry(leaf);
    transformLeafGeometry(
      leafGeometry,
      petioleEnd,
      segment.quaternion,
      leaf.yaw - Math.PI / 2,
      -0.035 + rng() * 0.07,
    );
    leaves.push(leafGeometry);

    const midribEnd = petioleEnd.clone().add(new THREE.Vector3(
      Math.cos(leaf.yaw) * leaf.length * 0.58,
      0.008,
      Math.sin(leaf.yaw) * leaf.length * 0.58,
    ));
    veins.push(geometryBetween(petioleEnd, midribEnd, 0.0025 * segment.length, 0.0008 * segment.length, 5));

    if (leafIndex === segment.leaves.length - 1 && segment.tendril) {
      const tendrilOrigin = node.clone().addScaledVector(outward, segment.radius * 1.8);
      tendrils.push(createTendrilGeometry(tendrilOrigin, leaf.yaw + 0.35, leaf.side, segment.length));
      tendrils.push(createTendrilGeometry(tendrilOrigin, leaf.yaw - 0.4, -leaf.side, segment.length * 0.8));
    }
  }

  // Sparse silhouette hairs imply the documented glandular pubescence; most
  // of the effect comes from roughness and rim lighting rather than geometry.
  const hairPositions = [];
  const hairCount = 7;
  for (let index = 0; index < hairCount; index += 1) {
    const t = (index + 0.6) / hairCount;
    const angle = index * 2.39 + segment.variant;
    const origin = new THREE.Vector3(
      Math.cos(angle) * segment.radius * 0.78,
      segment.length * t,
      Math.sin(angle) * segment.radius * 0.78,
    );
    pushSpike(hairPositions, origin, new THREE.Vector3(Math.cos(angle), 0.28, Math.sin(angle)), 0.00065, 0.012);
  }
  const hairGeometry = new THREE.BufferGeometry();
  hairGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hairPositions, 3));
  hairGeometry.computeVertexNormals();
  hairs.push(hairGeometry);

  if (segment.flowerPanicle) {
    const panicle = createFlowerPanicle(
      new THREE.Vector3(0, segment.length * 0.78, 0),
      segment.variant * 0.91,
      Math.max(0.78, segment.length),
      rng,
    );
    stems.push(...panicle.stems);
    petals.push(...panicle.petals);
    centers.push(...panicle.centers);
  }

  for (let fruitIndex = 0; fruitIndex < segment.fruitCount; fruitIndex += 1) {
    const yaw = segment.variant + fruitIndex * 2.1;
    const origin = new THREE.Vector3(
      Math.cos(yaw) * 0.075,
      segment.length * (0.72 + fruitIndex * 0.12),
      Math.sin(yaw) * 0.075,
    );
    stems.push(geometryBetween(new THREE.Vector3(0, origin.y - 0.025, 0), origin, 0.0025, 0.0015, 5));
    const fruit = createBristlyFruit(origin, yaw, Math.max(0.9, segment.length), segment.id);
    fruits.push(fruit.fruit);
    fruitBristles.push(fruit.bristles);
  }

  return {
    stems: mergeAndDispose(stems),
    leaves: mergeAndDispose(leaves),
    veins: mergeAndDispose(veins),
    tendrils: mergeAndDispose(tendrils),
    hairs: mergeAndDispose(hairs),
    petals: mergeAndDispose(petals),
    centers: mergeAndDispose(centers),
    fruits: mergeAndDispose(fruits),
    fruitBristles: mergeAndDispose(fruitBristles),
  };
}

let materialsCache = null;
export function getSicyosMaterials() {
  if (materialsCache) return materialsCache;
  materialsCache = {
    stem: new THREE.MeshStandardMaterial({ color: '#527449', roughness: 0.78, metalness: 0 }),
    leaf: new THREE.MeshStandardMaterial({
      color: '#75975a',
      roughness: 0.72,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
      emissive: '#14250f',
      emissiveIntensity: 0.055,
    }),
    vein: new THREE.MeshStandardMaterial({ color: '#91a96b', roughness: 0.76, metalness: 0 }),
    tendril: new THREE.MeshStandardMaterial({ color: '#789456', roughness: 0.66, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: '#d1c596', roughness: 0.52, metalness: 0 }),
    petal: new THREE.MeshStandardMaterial({ color: '#e5b83e', roughness: 0.58, metalness: 0 }),
    flowerCenter: new THREE.MeshStandardMaterial({ color: '#7f6422', roughness: 0.72, metalness: 0 }),
    fruit: new THREE.MeshStandardMaterial({ color: '#6d7d35', roughness: 0.64, metalness: 0 }),
    fruitBristle: new THREE.MeshStandardMaterial({ color: '#c6b175', roughness: 0.5, metalness: 0 }),
    litter: new THREE.MeshStandardMaterial({ color: '#574936', roughness: 0.96, metalness: 0, flatShading: true }),
  };
  return materialsCache;
}

export function sicyosColliderSpec(segment) {
  return {
    halfExtents: [Math.max(0.025, segment.radius * 1.4), segment.length * 0.47, Math.max(0.025, segment.radius * 1.4)],
    offset: [0, segment.length * 0.5, 0],
  };
}

export function buildSicyosDressing({ seed, size = 1 }) {
  const rng = makeRng(`sicyos-dressing:${seed}`);
  return Array.from({ length: 5 + Math.floor(rng() * 3) }, (_, index) => {
    const angle = rng() * Math.PI * 2;
    const distance = size * (0.15 + rng() * 0.9);
    return {
      id: index,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      yaw: angle + rng(),
      scale: size * (0.035 + rng() * 0.065),
      stretch: [0.55 + rng(), 0.3 + rng() * 0.35, 0.7 + rng() * 1.4],
    };
  });
}
