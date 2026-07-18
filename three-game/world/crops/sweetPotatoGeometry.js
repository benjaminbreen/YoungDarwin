import * as THREE from 'three';

// A sweet-potato plant is a mat of branching runners rather than a bundle of
// grass blades. This builder keeps that silhouette while remaining a single
// instanced draw: rounded six-sided stems, petioles, and gently cupped cordate
// (heart-shaped) leaves with a raised central vein.

function color(hex, multiplier = 1) {
  const value = new THREE.Color(hex).multiplyScalar(multiplier);
  return [value.r, value.g, value.b];
}

function mixColor(a, b, t) {
  return a.map((value, index) => value + (b[index] - value) * t);
}

function pushVertex(buffers, position, vertexColor, damageThreshold, leafAnchor) {
  buffers.positions.push(...position);
  buffers.colors.push(...vertexColor);
  buffers.damageThresholds.push(damageThreshold);
  buffers.leafAnchors.push(...leafAnchor);
}

function pushTriangle(buffers, a, b, c, colors, damageThreshold, leafAnchor) {
  pushVertex(buffers, a, colors[0], damageThreshold, leafAnchor);
  pushVertex(buffers, b, colors[1], damageThreshold, leafAnchor);
  pushVertex(buffers, c, colors[2], damageThreshold, leafAnchor);
}

function pushQuad(buffers, a, b, c, d, colorA, colorB, damageThreshold, leafAnchor) {
  pushTriangle(buffers, a, b, c, [colorA, colorA, colorB], damageThreshold, leafAnchor);
  pushTriangle(buffers, a, c, d, [colorA, colorB, colorB], damageThreshold, leafAnchor);
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map(value => value / length);
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function pushTube(
  buffers,
  from,
  to,
  radiusFrom,
  radiusTo,
  colorFrom,
  colorTo,
  damageThreshold = 1.2,
  leafAnchor = from,
  sides = 6,
) {
  const axis = normalize3([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  const helper = Math.abs(axis[1]) < 0.86 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize3(cross3(axis, helper));
  const bitangent = normalize3(cross3(axis, tangent));
  for (let index = 0; index < sides; index += 1) {
    const angleA = index / sides * Math.PI * 2;
    const angleB = (index + 1) / sides * Math.PI * 2;
    const ringPoint = (center, radius, angle) => [
      center[0] + (tangent[0] * Math.cos(angle) + bitangent[0] * Math.sin(angle)) * radius,
      center[1] + (tangent[1] * Math.cos(angle) + bitangent[1] * Math.sin(angle)) * radius,
      center[2] + (tangent[2] * Math.cos(angle) + bitangent[2] * Math.sin(angle)) * radius,
    ];
    pushQuad(
      buffers,
      ringPoint(from, radiusFrom, angleA),
      ringPoint(from, radiusFrom, angleB),
      ringPoint(to, radiusTo, angleB),
      ringPoint(to, radiusTo, angleA),
      colorFrom,
      colorTo,
      damageThreshold,
      leafAnchor,
    );
  }
}

const HEART_OUTLINE = [
  [1, 0],
  [0.86, 0.42],
  [0.67, 0.78],
  [0.44, 1],
  [0.23, 0.91],
  [0.08, 0.57],
  [0.15, 0.13],
  [0.025, 0],
  [0.15, -0.13],
  [0.08, -0.57],
  [0.23, -0.91],
  [0.44, -1],
  [0.67, -0.78],
  [0.86, -0.42],
];

function leafPoint(base, dir, length, halfWidth, lift, uv) {
  const side = [-dir[1], dir[0]];
  const [u, v] = uv;
  const arch = Math.sin(Math.PI * u) * lift * (0.82 + (1 - Math.abs(v)) * 0.18);
  const cup = Math.abs(v) * 0.012 * Math.sin(Math.PI * u);
  const tipDroop = Math.max(0, u - 0.82) * 0.055;
  return [
    base[0] + dir[0] * length * u + side[0] * halfWidth * v,
    base[1] + arch + cup - tipDroop,
    base[2] + dir[1] * length * u + side[1] * halfWidth * v,
  ];
}

function pushHeartLeaf(buffers, {
  base,
  dir,
  length,
  halfWidth,
  lift,
  leafIndex,
  anchor,
}) {
  const dark = color('#285d2c', 0.96 + (leafIndex % 3) * 0.035);
  const mid = color('#3f7c36', 0.98 + (leafIndex % 4) * 0.025);
  const crown = color('#559144', 0.97 + (leafIndex % 2) * 0.05);
  const vein = color('#72a457', 0.92);
  // Every leaf has its own failure threshold. A pellet strike can tear some
  // leaves away while leaving a recognisable, battered vine rather than
  // uniformly scaling the entire plant down.
  const threshold = 0.24 + ((leafIndex * 37) % 71) / 100;
  const center = leafPoint(base, dir, length, halfWidth, lift, [0.46, 0]);
  const perimeter = HEART_OUTLINE.map(point => leafPoint(base, dir, length, halfWidth, lift, point));
  for (let index = 0; index < perimeter.length; index += 1) {
    const next = (index + 1) % perimeter.length;
    const edgeColorA = mixColor(dark, mid, HEART_OUTLINE[index][0]);
    const edgeColorB = mixColor(dark, mid, HEART_OUTLINE[next][0]);
    pushTriangle(
      buffers,
      center,
      perimeter[index],
      perimeter[next],
      [crown, edgeColorA, edgeColorB],
      threshold,
      anchor,
    );
  }

  // A narrow raised midrib catches grazing light and prevents the leaves from
  // reading as unshaded green cards at normal play distance.
  const side = [-dir[1], dir[0]];
  const veinStart = leafPoint(base, dir, length, halfWidth, lift, [0.11, 0]);
  const veinEnd = leafPoint(base, dir, length, halfWidth, lift, [0.9, 0]);
  const veinHalf = Math.max(0.003, halfWidth * 0.032);
  veinStart[1] += 0.006;
  veinEnd[1] += 0.006;
  pushQuad(
    buffers,
    [veinStart[0] - side[0] * veinHalf, veinStart[1], veinStart[2] - side[1] * veinHalf],
    [veinStart[0] + side[0] * veinHalf, veinStart[1], veinStart[2] + side[1] * veinHalf],
    [veinEnd[0] + side[0] * veinHalf * 0.35, veinEnd[1], veinEnd[2] + side[1] * veinHalf * 0.35],
    [veinEnd[0] - side[0] * veinHalf * 0.35, veinEnd[1], veinEnd[2] - side[1] * veinHalf * 0.35],
    vein,
    mid,
    threshold,
    anchor,
  );
}

function curvePoint(angle, length, curve, t) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sx = -dz;
  const sz = dx;
  return [
    dx * length * t + sx * curve * Math.sin(Math.PI * t),
    0.032 + Math.sin(Math.PI * t) * 0.018,
    dz * length * t + sz * curve * Math.sin(Math.PI * t),
  ];
}

export function buildSweetPotatoGeometry(height = 0.34) {
  const buffers = {
    positions: [],
    colors: [],
    damageThresholds: [],
    leafAnchors: [],
  };
  const runnerLow = color('#694563');
  const runnerHigh = color('#4d713b');
  const petioleLow = color('#5f4964');
  const petioleHigh = color('#4d7e3b');
  let leafIndex = 0;

  // Three curved ground runners establish the creeping, interlaced habit.
  const runners = [
    { angle: 0.28, length: 0.64, curve: 0.07 },
    { angle: 2.34, length: 0.58, curve: -0.06 },
    { angle: 4.33, length: 0.62, curve: 0.055 },
  ];
  for (let runnerIndex = 0; runnerIndex < runners.length; runnerIndex += 1) {
    const runner = runners[runnerIndex];
    let previous = curvePoint(runner.angle, runner.length, runner.curve, 0);
    for (let segment = 1; segment <= 5; segment += 1) {
      const current = curvePoint(runner.angle, runner.length, runner.curve, segment / 5);
      pushTube(buffers, previous, current, 0.011, 0.008, runnerLow, runnerHigh);
      previous = current;
    }

    for (let nodeIndex = 0; nodeIndex < 3; nodeIndex += 1) {
      const t = 0.25 + nodeIndex * 0.27;
      const node = curvePoint(runner.angle, runner.length, runner.curve, t);
      const leafAngle = runner.angle + (nodeIndex % 2 === 0 ? 0.76 : -0.83) + runnerIndex * 0.09;
      const dir = [Math.cos(leafAngle), Math.sin(leafAngle)];
      const petioleLength = 0.095 + (nodeIndex % 2) * 0.025;
      const base = [
        node[0] + dir[0] * petioleLength,
        node[1] + 0.075 + nodeIndex * 0.008,
        node[2] + dir[1] * petioleLength,
      ];
      const threshold = 0.24 + ((leafIndex * 37) % 71) / 100;
      pushTube(buffers, node, base, 0.008, 0.005, petioleLow, petioleHigh, threshold, node);
      pushHeartLeaf(buffers, {
        base,
        dir,
        length: 0.22 + (leafIndex % 3) * 0.025,
        halfWidth: 0.105 + (leafIndex % 2) * 0.012,
        lift: height * (0.18 + (nodeIndex % 2) * 0.035),
        leafIndex,
        anchor: node,
      });
      leafIndex += 1;
    }
  }

  // The crown is taller and denser, breaking up the repeated rows when seen
  // from shoulder height while keeping the runners visible at the edges.
  for (let crownIndex = 0; crownIndex < 4; crownIndex += 1) {
    const angle = 0.82 + crownIndex * 1.57;
    const dir = [Math.cos(angle), Math.sin(angle)];
    const node = [dir[0] * 0.035, 0.035, dir[1] * 0.035];
    const base = [
      dir[0] * (0.12 + (crownIndex % 2) * 0.015),
      0.14 + (crownIndex % 2) * 0.035,
      dir[1] * (0.12 + (crownIndex % 2) * 0.015),
    ];
    const threshold = 0.24 + ((leafIndex * 37) % 71) / 100;
    pushTube(buffers, node, base, 0.009, 0.005, petioleLow, petioleHigh, threshold, node);
    pushHeartLeaf(buffers, {
      base,
      dir,
      length: 0.24 + (crownIndex % 2) * 0.03,
      halfWidth: 0.115 + (crownIndex % 2) * 0.012,
      lift: height * 0.24,
      leafIndex,
      anchor: node,
    });
    leafIndex += 1;
  }

  return buffers;
}

export const SWEET_POTATO_HEART_LEAF_COUNT = 13;

