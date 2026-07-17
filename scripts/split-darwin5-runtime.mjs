// Split the full Darwin5 authoring GLB into a small boot model and three
// animation-only banks. The boot model keeps locomotion and safety fallbacks;
// banks are streamed in paced stages during the opening aerial sequence.
//
// Usage:
//   node scripts/split-darwin5-runtime.mjs [full-source.glb]

// The first run archives the full source under assets-src/darwin/runtime so
// later runs never try to split an already-split runtime file.

import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  getBounds,
  meshopt,
  partition,
  prune,
  resample,
  unpartition,
} from '@gltf-transform/functions';
import draco3d from 'draco3d';
import { MeshoptEncoder } from 'meshoptimizer';

const runtimeDir = path.resolve('public/assets/models');
const archiveDir = path.resolve('assets-src/darwin/runtime');
const archivePath = path.join(archiveDir, 'darwin5-full.glb');
const runtimePath = path.join(runtimeDir, 'darwin5.glb');
const reportPath = path.join(archiveDir, 'darwin5-runtime-split-report.json');

const outputs = {
  boot: runtimePath,
  motion: path.join(runtimeDir, 'darwin5-motion-bank.glb'),
  action: path.join(runtimeDir, 'darwin5-action-bank.glb'),
  character: path.join(runtimeDir, 'darwin5-character-bank.glb'),
};

// These clips cover the opening pose, ordinary locomotion, and safe fallbacks
// if a slower connection has not finished streaming the optional banks yet.
const BOOT_CLIPS = new Set([
  'idle',
  'walk',
  'run',
  'sprint',
  'jog',
  'tiredWalk',
  'grassRun',
  'startWalking',
  'stopWalking',
  'runToStop',
  'runningTurn180',
  'runningTurnLeft',
  'runningTurnRight',
  'walkStrafeLeft',
  'walkStrafeRight',
  'runStrafeLeft',
  'runStrafeRight',
  'walkBackwards',
  'runBackwards',
  'jogBackwards',
  'backwardTurnLeft',
  'backwardTurnRight',
  'crouchIdle',
  'crouchWalk',
  'crouchRun',
  'standingJump',
  'standingJumpHold',
  'runningJump',
  'runningJumpHold',
  'fallingIdle',
  'fallingToLanding',
  'landing',
  'runningLanding',
  'fallingToRoll',
  'fallingForwardDeath',
]);

const MOTION_CLIP_RE = /jump|fall|land|climb|vault|swim|dive|wade|stumble|trip|slide|teeter|hit|injur|wall|stairs|death/i;
const ACTION_CLIP_RE = /gather|inspect|write|pick|push|swing|tool|hold|rifle|aim|torch|fire|carry|equip|unequip|change|cover/i;

function classifyClip(name) {
  if (BOOT_CLIPS.has(name)) return 'boot';
  if (MOTION_CLIP_RE.test(name)) return 'motion';
  if (ACTION_CLIP_RE.test(name)) return 'action';
  return 'character';
}

function animationDuration(animation) {
  let duration = 0;
  for (const sampler of animation.listSamplers()) {
    const times = sampler.getInput()?.getArray();
    if (times?.length) duration = Math.max(duration, times[times.length - 1]);
  }
  return duration;
}

function animationInventory(document) {
  return document.getRoot().listAnimations().map(animation => ({
    name: animation.getName(),
    duration: animationDuration(animation),
  }));
}

function retainAnimations(document, names) {
  for (const animation of document.getRoot().listAnimations()) {
    if (names.has(animation.getName())) continue;
    // Animation samplers and channels are graph properties in their own right.
    // Disposing only the parent animation leaves their large accessor payloads
    // reachable, defeating the purpose of the runtime split.
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
}

function stripRenderableData(document) {
  const root = document.getRoot();
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const material of root.listMaterials()) material.dispose();
  for (const texture of root.listTextures()) texture.dispose();
}

function sceneBounds(document) {
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  return getBounds(scene);
}

function assertBoundsEqual(before, after) {
  for (const edge of ['min', 'max']) {
    for (const axis of [0, 1, 2]) {
      if (Math.abs(before[edge][axis] - after[edge][axis]) > 0.0005) {
        throw new Error(`Darwin5 ${edge} bound changed on axis ${axis}.`);
      }
    }
  }
}

async function writeAtomic(io, destination, document) {
  const temporary = `${destination}.splitting.glb`;
  try {
    await io.write(temporary, document);
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

await MeshoptEncoder.ready;
await fs.mkdir(archiveDir, { recursive: true });

const requestedSource = process.argv[2] ? path.resolve(process.argv[2]) : null;
let sourcePath = requestedSource || archivePath;
try {
  await fs.access(sourcePath);
} catch {
  sourcePath = runtimePath;
}

if (sourcePath === runtimePath) {
  await fs.copyFile(runtimePath, archivePath);
  sourcePath = archivePath;
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.encoder': MeshoptEncoder,
  });

const sourceStats = await fs.stat(sourcePath);
const sourceDocument = await io.read(sourcePath);
const sourceInventory = animationInventory(sourceDocument);
const sourceBounds = sceneBounds(sourceDocument);
if (sourceInventory.length < 100) {
  throw new Error(`Expected a full Darwin5 source with at least 100 animations; found ${sourceInventory.length}.`);
}

const clipGroups = { boot: new Set(), motion: new Set(), action: new Set(), character: new Set() };
for (const clip of sourceInventory) clipGroups[classifyClip(clip.name)].add(clip.name);

const report = {
  source: path.relative(process.cwd(), sourcePath),
  sourceBytes: sourceStats.size,
  sourceAnimations: sourceInventory.length,
  outputs: {},
};

for (const [group, destination] of Object.entries(outputs)) {
  const document = await io.read(sourcePath);
  retainAnimations(document, clipGroups[group]);
  if (group !== 'boot') stripRenderableData(document);
  // The source packs every animation into one shared buffer view. Reassign
  // retained accessors before pruning so the writer can actually omit bytes
  // belonging to deferred clips.
  await document.transform(
    partition({ animations: true, meshes: group === 'boot' }),
    resample({ tolerance: 1e-4 }),
    prune(),
    unpartition(),
  );
  if (group !== 'boot') {
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  }
  const inventory = animationInventory(document);
  if (inventory.length !== clipGroups[group].size) {
    throw new Error(`${group} bank animation count changed during optimization.`);
  }
  if (group === 'boot') assertBoundsEqual(sourceBounds, sceneBounds(document));
  await writeAtomic(io, destination, document);
  report.outputs[group] = {
    file: path.relative(process.cwd(), destination),
    bytes: (await fs.stat(destination)).size,
    animations: inventory.map(clip => clip.name),
  };
}

const outputNames = new Set(Object.values(report.outputs).flatMap(output => output.animations));
if (outputNames.size !== sourceInventory.length) {
  throw new Error(`Split inventory mismatch: ${sourceInventory.length} source clips -> ${outputNames.size} output clips.`);
}
for (const clip of sourceInventory) {
  if (!outputNames.has(clip.name)) throw new Error(`Split omitted Darwin5 clip ${clip.name}.`);
}

report.outputBytes = Object.values(report.outputs).reduce((total, output) => total + output.bytes, 0);
report.bootBytes = report.outputs.boot.bytes;
report.bootSavingsBytes = sourceStats.size - report.bootBytes;
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
