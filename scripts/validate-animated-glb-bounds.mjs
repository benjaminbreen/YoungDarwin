#!/usr/bin/env node

// Validate an animated GLB using the same Three.js loader, mixer, and precise
// skinned-mesh bounds used by the runtime. Static accessor bounds and a root
// bone's first translation cannot detect an axis-swapped or collapsed pose.
//
// Usage:
//   node scripts/validate-animated-glb-bounds.mjs model.glb \
//     --clip idle --scale 1.93093 --y-offset 0.00133 \
//     --target-height 1.88 --height-tolerance 0.01 \
//     --ground-tolerance 0.005 --min-vertical-ratio 2.4 \
//     --max-triangles 15000 [--report report.json]

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const argv = process.argv.slice(2);
const inputArg = argv.find(value => !value.startsWith('--'));
if (!inputArg) throw new Error('Pass the GLB to validate.');

function flag(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
}

function numericFlag(name, fallback) {
  const raw = flag(name, fallback);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number.`);
  return value;
}

const input = path.resolve(inputArg);
const clipName = flag('clip', 'idle');
const scale = numericFlag('scale', 1);
const yOffset = numericFlag('y-offset', 0);
const targetHeight = numericFlag('target-height', 0);
const heightTolerance = numericFlag('height-tolerance', 0.01);
const groundTolerance = numericFlag('ground-tolerance', 0.005);
const minVerticalRatio = numericFlag('min-vertical-ratio', 1.5);
const maxTriangles = numericFlag('max-triangles', Number.POSITIVE_INFINITY);
const sampleRate = numericFlag('sample-rate', 30);
const reportArg = flag('report', null);

if (scale <= 0) throw new Error('--scale must be greater than zero.');
if (sampleRate <= 0) throw new Error('--sample-rate must be greater than zero.');

// GLTFLoader only needs image dimensions while parsing this validation scene;
// no texture pixels are uploaded in Node. Supplying a minimal ImageBitmap keeps
// embedded WebP loading deterministic and avoids DOM/canvas dependencies.
globalThis.self = globalThis;
globalThis.ProgressEvent ||= class ProgressEvent {};
globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });

const bytes = fs.readFileSync(input);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});

const clip = gltf.animations.find(animation => animation.name === clipName);
if (!clip) {
  throw new Error(`Missing clip "${clipName}". Found: ${gltf.animations.map(animation => animation.name).join(', ') || 'none'}.`);
}

let skinnedMeshes = 0;
let triangles = 0;
gltf.scene.traverse(object => {
  if (!object.isMesh) return;
  if (object.isSkinnedMesh) skinnedMeshes += 1;
  const geometry = object.geometry;
  triangles += geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute('position')?.count || 0) / 3;
});
if (skinnedMeshes === 0) throw new Error('The GLB has no skinned mesh.');
if (triangles > maxTriangles) {
  throw new Error(`Triangle budget exceeded: ${Math.round(triangles)} > ${maxTriangles}.`);
}

const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(clip).play();
const sampleCount = Math.max(2, Math.ceil(clip.duration * sampleRate) + 1);
const union = new THREE.Box3();
let minimumFrameHeight = Number.POSITIVE_INFINITY;
let maximumFrameHeight = 0;
let minimumFrameMinY = Number.POSITIVE_INFINITY;
let maximumFrameMinY = Number.NEGATIVE_INFINITY;

for (let index = 0; index < sampleCount; index += 1) {
  const time = clip.duration * index / (sampleCount - 1);
  mixer.setTime(time);
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
  if (bounds.isEmpty()) throw new Error(`Empty posed bounds at t=${time.toFixed(3)}s.`);
  union.union(bounds);
  const frameHeight = bounds.max.y - bounds.min.y;
  minimumFrameHeight = Math.min(minimumFrameHeight, frameHeight);
  maximumFrameHeight = Math.max(maximumFrameHeight, frameHeight);
  minimumFrameMinY = Math.min(minimumFrameMinY, bounds.min.y);
  maximumFrameMinY = Math.max(maximumFrameMinY, bounds.min.y);
}

const size = union.getSize(new THREE.Vector3());
const verticalRatio = size.y / Math.max(size.x, size.z, Number.EPSILON);
const posedMinY = yOffset + union.min.y * scale;
const posedMaxY = yOffset + union.max.y * scale;
const posedHeight = posedMaxY - posedMinY;
const posedFrameHeightRange = [minimumFrameHeight * scale, maximumFrameHeight * scale];
const posedFrameMinYRange = [
  yOffset + minimumFrameMinY * scale,
  yOffset + maximumFrameMinY * scale,
];

if (verticalRatio < minVerticalRatio) {
  throw new Error(
    `Animated pose is not Y-up: vertical ratio ${verticalRatio.toFixed(3)} < ${minVerticalRatio}. `
    + `Bounds size [${size.toArray().map(value => value.toFixed(4)).join(', ')}].`,
  );
}
if (targetHeight > 0 && posedFrameHeightRange.some(height => Math.abs(height - targetHeight) > heightTolerance)) {
  throw new Error(
    `A posed frame height in [${posedFrameHeightRange.map(value => value.toFixed(4)).join(', ')}]m `
    + `is outside ${targetHeight.toFixed(4)}m `
    + `± ${heightTolerance.toFixed(4)}m.`,
  );
}
if (posedFrameMinYRange.some(frameMinY => Math.abs(frameMinY) > groundTolerance)) {
  throw new Error(
    `Posed feet range from ${posedFrameMinYRange[0].toFixed(4)}m to `
    + `${posedFrameMinYRange[1].toFixed(4)}m from the model origin; `
    + `tolerance is ± ${groundTolerance.toFixed(4)}m.`,
  );
}

const rounded = values => values.map(value => +value.toFixed(6));
const validation = {
  file: path.relative(process.cwd(), input),
  bytes: bytes.byteLength,
  clip: clip.name,
  duration: +clip.duration.toFixed(6),
  samples: sampleCount,
  skinnedMeshes,
  triangles: Math.round(triangles),
  nativeBounds: {
    min: rounded(union.min.toArray()),
    max: rounded(union.max.toArray()),
    size: rounded(size.toArray()),
    frameHeightRange: rounded([minimumFrameHeight, maximumFrameHeight]),
    verticalRatio: +verticalRatio.toFixed(6),
  },
  manifestTransform: { scale, yOffset },
  posedBounds: {
    minY: +posedMinY.toFixed(6),
    maxY: +posedMaxY.toFixed(6),
    height: +posedHeight.toFixed(6),
    frameMinYRange: rounded(posedFrameMinYRange),
    frameHeightRange: rounded(posedFrameHeightRange),
  },
  checks: {
    targetHeight,
    heightTolerance,
    groundTolerance,
    minVerticalRatio,
    maxTriangles,
  },
};

if (reportArg) {
  const reportPath = path.resolve(reportArg);
  let report = {};
  if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.runtimeValidation = validation;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(validation, null, 2));
