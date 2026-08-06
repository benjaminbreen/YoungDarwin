// Slate-pencil urchin (Eucidaris galapagensis). What identifies this animal at
// a glance is the spine, not the test: a couple of dozen stout batons as thick
// as a pencil and about as long as the shell is wide, worn flat at the tip and
// usually greened with coralline algae along the last centimetre.
//
// Authoring frame: origin at the rock the animal is wedged against, +y up,
// roughly 0.34 m tip to tip before per-instance scaling. That is about twice
// life size, matching the hand-specimen minerals — a life-sized urchin under
// half a metre of water is a dark smudge.
//
// Everything merges into two geometries (test, spines) so one urchin is two
// draw calls no matter how many spines it carries.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TEST_RADIUS = 0.105;
// A live Eucidaris sits low; the aboral surface is a dome, not a ball.
const TEST_FLATTEN = 0.62;
const PRIMARY_COUNT = 30;
const SECONDARY_COUNT = 40;

const PALETTE = Object.freeze({
  // Test: dark maroon with pale bosses where the spines articulate.
  testDark: '#43201d',
  testLight: '#6b3128',
  boss: '#c8b49a',
  // Spines: red-brown at the base, bleaching to worn bone at the tip.
  spineBase: '#8d3f2d',
  spineMid: '#a85b3e',
  spineTip: '#d6c8ae',
  // The algal crust urchin spines pick up in the shallows.
  coralline: '#7f8f66',
});

function makeRng(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

const _v = new THREE.Vector3();
const _color = new THREE.Color();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();

function paint(geometry, fn) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    fn(_color, _v, i);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Spine mounts. A real urchin carries its primaries in ten meridional rows;
// a Fibonacci spiral gets the same even spacing without the rows reading as
// stripes, and the y bias keeps spines off the surface it is wedged against.
function spineDirections(count, rng) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const directions = [];
  for (let i = 0; i < count; i += 1) {
    // Sample the upper 78% of the sphere: nothing points straight down.
    const t = (i + 0.5) / count;
    const y = 1 - t * 1.62;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden + rng() * 0.34;
    directions.push(new THREE.Vector3(
      Math.cos(theta) * ring,
      y + (rng() - 0.5) * 0.1,
      Math.sin(theta) * ring,
    ).normalize());
  }
  return directions;
}

function buildTest(rng, directions) {
  const geometry = new THREE.IcosahedronGeometry(TEST_RADIUS, 3);
  const position = geometry.getAttribute('position');
  const bossStrength = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const normal = _v.clone().normalize();
    // Raise a low boss under each spine: this is what makes the shell read as
    // tuberculate rather than as a painted ball.
    let boss = 0;
    for (const direction of directions) {
      const alignment = normal.dot(direction);
      // Tight: an areole is a ring a few millimetres across, not a hemisphere
      // of the shell. Widen this and the whole test bleaches to bone.
      if (alignment > 0.986) boss = Math.max(boss, (alignment - 0.986) / 0.014);
    }
    bossStrength[i] = boss;
    const lumps = Math.sin(normal.x * 9.1) * Math.cos(normal.z * 7.7) * 0.012;
    _v.copy(normal)
      .multiplyScalar(TEST_RADIUS * (1 + boss * 0.12 + lumps))
      .multiply(new THREE.Vector3(1, TEST_FLATTEN, 1));
    // Wedged into a crevice: the underside sits flat on rock.
    _v.y = Math.max(_v.y, -TEST_RADIUS * TEST_FLATTEN * 0.72);
    position.setXYZ(i, _v.x, _v.y, _v.z);
  }
  geometry.computeVertexNormals();
  paint(geometry, (color, vertex, index) => {
    const height = THREE.MathUtils.clamp(
      (vertex.y / (TEST_RADIUS * TEST_FLATTEN)) * 0.5 + 0.5,
      0,
      1,
    );
    color.set(PALETTE.testDark).lerp(
      new THREE.Color(PALETTE.testLight),
      height * 0.55 + rng() * 0.08,
    );
    if (bossStrength[index] > 0) {
      color.lerp(new THREE.Color(PALETTE.boss), bossStrength[index] * 0.62);
    }
  });
  geometry.computeBoundingSphere();
  return geometry;
}

// One spine, authored along +y from the origin and moved onto its mount by the
// caller. Blunt is the whole point: the tip is a flat worn disc, and the
// silhouette barely tapers.
function buildSpine({ length, baseRadius, tipRadius, rng, coralline }) {
  const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, length, 10, 3, false);
  geometry.translate(0, length * 0.5, 0);
  const position = geometry.getAttribute('position');
  const wobbleA = rng() * Math.PI * 2;
  const wobbleB = rng() * Math.PI * 2;
  const bend = (rng() - 0.5) * 0.34;
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const along = THREE.MathUtils.clamp(_v.y / length, 0, 1);
    // Longitudinal ribbing: Eucidaris spines are faintly fluted, and the
    // flutes are what catch the light through moving water.
    const flute = 1 + Math.sin(Math.atan2(_v.z, _v.x) * 7 + wobbleA) * 0.055;
    const taper = 1 - along * along * 0.12;
    _v.x *= flute * taper;
    _v.z *= flute * taper;
    // A slight sabre curve keeps the crown from looking like a pin cushion.
    _v.x += Math.sin(along * 1.4 + wobbleB) * bend * length * 0.16;
    position.setXYZ(i, _v.x, _v.y, _v.z);
  }
  geometry.computeVertexNormals();
  paint(geometry, (color, vertex) => {
    const along = THREE.MathUtils.clamp(vertex.y / length, 0, 1);
    color.set(PALETTE.spineBase).lerp(new THREE.Color(PALETTE.spineMid), Math.min(1, along * 1.6));
    // Worn tip: the last fifth is bleached bone where the pigment has gone.
    if (along > 0.87) {
      color.lerp(new THREE.Color(PALETTE.spineTip), (along - 0.87) / 0.13 * 0.5);
    }
    if (coralline > 0) {
      const crust = THREE.MathUtils.smoothstep(along, 0.42, 0.88) * coralline;
      color.lerp(new THREE.Color(PALETTE.coralline), crust * 0.7);
    }
  });
  return geometry;
}

// Miliary spines: the low fuzz of short spinelets between the primaries.
function buildSecondary({ length, radius, rng }) {
  const geometry = new THREE.ConeGeometry(radius, length, 5, 1, false);
  geometry.translate(0, length * 0.5, 0);
  paint(geometry, (color, vertex) => {
    const along = THREE.MathUtils.clamp(vertex.y / length, 0, 1);
    color.set(PALETTE.spineBase).lerp(new THREE.Color(PALETTE.spineTip), along * 0.5 + rng() * 0.06);
  });
  return geometry;
}

function orientOnto(geometry, direction, origin) {
  _quat.setFromUnitVectors(_up, direction);
  _matrix.compose(origin, _quat, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(_matrix);
  return geometry;
}

export function buildSeaUrchin(seed = 'seaurchin') {
  const rng = makeRng(seed);
  const directions = spineDirections(PRIMARY_COUNT, rng);
  const test = buildTest(rng, directions);

  const spines = [];
  for (const direction of directions) {
    // Aboral spines are the long ones; the near-horizontal ones that brace the
    // animal in its crevice are shorter and thicker.
    const upright = THREE.MathUtils.clamp(direction.y, 0, 1);
    // Stubby is the diagnosis. A primary is roughly four times as long as it
    // is thick — any slimmer and the animal reads as a diadema, which is a
    // different urchin entirely and the one that actually hurts.
    const length = TEST_RADIUS * (0.74 + upright * 0.34 + rng() * 0.26);
    const baseRadius = TEST_RADIUS * (0.165 - upright * 0.022 + rng() * 0.024);
    const origin = direction.clone().multiplyScalar(TEST_RADIUS * 0.94);
    origin.y *= TEST_FLATTEN;
    spines.push(orientOnto(
      buildSpine({
        length,
        baseRadius,
        tipRadius: baseRadius * (0.88 + rng() * 0.1),
        rng,
        coralline: rng() < 0.45 ? 0.4 + rng() * 0.6 : 0,
      }),
      direction,
      origin,
    ));
  }

  for (let i = 0; i < SECONDARY_COUNT; i += 1) {
    const theta = rng() * Math.PI * 2;
    const y = 0.62 - rng() * 1.28;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const direction = new THREE.Vector3(Math.cos(theta) * ring, y, Math.sin(theta) * ring).normalize();
    const origin = direction.clone().multiplyScalar(TEST_RADIUS * 0.96);
    origin.y *= TEST_FLATTEN;
    spines.push(orientOnto(
      buildSecondary({
        length: TEST_RADIUS * (0.16 + rng() * 0.18),
        radius: TEST_RADIUS * 0.035,
        rng,
      }),
      direction,
      origin,
    ));
  }

  const mergedSpines = mergeGeometries(spines, false);
  spines.forEach(geometry => geometry.dispose());

  // Lift the whole animal so it rests on the ground the actor floats it 0.04
  // above. The lowest spines splay below the test — that is how the animal
  // braces in its crevice — so the lift is measured off them, not the shell.
  mergedSpines.computeBoundingBox();
  const lift = Math.max(
    TEST_RADIUS * TEST_FLATTEN * 0.72,
    -mergedSpines.boundingBox.min.y + 0.005,
  );
  test.translate(0, lift, 0);
  mergedSpines.translate(0, lift, 0);
  mergedSpines.computeBoundingSphere();

  return [
    { geometry: test, material: 'test' },
    { geometry: mergedSpines, material: 'spine' },
  ];
}

let materials = null;

export function getUrchinMaterials() {
  if (!materials) {
    materials = {
      // Wet living tissue, so noticeably glossier than the rock it sits on.
      test: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.46,
        metalness: 0,
      }),
      spine: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.58,
        metalness: 0,
      }),
    };
  }
  return materials;
}
