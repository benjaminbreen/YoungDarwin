// Measures how fast each looping gait clip carries its planted foot, i.e. the
// ground speed at which the clip plays without foot slide at timeScale 1.
//
//   node scripts/measure-gait-strides.mjs [glb ...]
//
// The clips are in place: the hips stay put and the feet cycle under them. A
// foot in stance therefore slides backward in model space at exactly the speed
// the body must travel forward for that foot to stay planted in the world. We
// evaluate the skeleton from the raw animation channels (no renderer), find
// the frames where each toe is within 3 cm of its lowest point, and average
// its horizontal speed there. Output feeds STRIDE_SPEED in gaitProfiles.js.

import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

const DEFAULT_FILES = [
  'public/assets/models/darwin5-locomotion-preview.glb',
  'public/assets/models/darwin5-motion-bank.glb',
];
const GAIT = /^(walk|run|jog|sprint|grassRun|tiredWalk|walkCarry|walkBackwards|runBackwards|jogBackwards|walkStrafe\w+|runStrafe\w+|crouchWalk|crouchRun|injured\w*|holdWalk|holdTool\w+|torch\w+|walkRifle|runRifle|wadeWalk|aimWalk)$/i;

function sampler(channelSampler) {
  const input = channelSampler.getInput().getArray();
  const output = channelSampler.getOutput().getArray();
  const size = channelSampler.getOutput().getElementSize();
  const interpolation = channelSampler.getInterpolation();
  return t => {
    if (t <= input[0]) return Array.from(output.slice(0, size));
    const last = input.length - 1;
    if (t >= input[last]) return Array.from(output.slice(last * size, last * size + size));
    let i = 0;
    while (i < last && input[i + 1] < t) i += 1;
    const span = input[i + 1] - input[i];
    const f = span > 0 ? (t - input[i]) / span : 0;
    const stride = interpolation === 'CUBICSPLINE' ? size * 3 : size;
    const offset = interpolation === 'CUBICSPLINE' ? size : 0;
    const a = output.slice(i * stride + offset, i * stride + offset + size);
    const b = output.slice((i + 1) * stride + offset, (i + 1) * stride + offset + size);
    if (size === 4) {
      return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), f).toArray();
    }
    return Array.from(a, (value, k) => value + (b[k] - value) * f);
  };
}

async function measure(file) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'meshopt.decoder': await MeshoptDecoder.ready.then(() => MeshoptDecoder),
    });
  const document = await io.read(file);
  const root = document.getRoot();
  const nodes = root.listNodes();
  const parentOf = new Map();
  nodes.forEach(node => node.listChildren().forEach(child => parentOf.set(child, node)));
  const toe = side => nodes.find(node => new RegExp(`${side}ToeBase$`, 'i').test(node.getName()));
  const feet = { left: toe('Left'), right: toe('Right') };
  if (!feet.left || !feet.right) return [];
  const chainOf = node => {
    const chain = [];
    for (let n = node; n; n = parentOf.get(n)) chain.unshift(n);
    return chain;
  };
  const chains = { left: chainOf(feet.left), right: chainOf(feet.right) };
  const results = [];
  for (const animation of root.listAnimations()) {
    const name = animation.getName();
    if (!GAIT.test(name)) continue;
    const tracks = new Map();
    let duration = 0;
    animation.listChannels().forEach(channel => {
      const target = channel.getTargetNode();
      if (!target) return;
      const entry = tracks.get(target) || {};
      entry[channel.getTargetPath()] = sampler(channel.getSampler());
      tracks.set(target, entry);
      const input = channel.getSampler().getInput().getArray();
      duration = Math.max(duration, input[input.length - 1]);
    });
    const worldOf = (chain, t) => {
      const matrix = new THREE.Matrix4();
      const local = new THREE.Matrix4();
      chain.forEach(node => {
        const track = tracks.get(node) || {};
        const translation = track.translation ? track.translation(t) : node.getTranslation();
        const rotation = track.rotation ? track.rotation(t) : node.getRotation();
        const scale = track.scale ? track.scale(t) : node.getScale();
        local.compose(new THREE.Vector3(...translation), new THREE.Quaternion(...rotation), new THREE.Vector3(...scale));
        matrix.multiply(local);
      });
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    };
    const steps = 240;
    const dt = duration / steps;
    const frames = Array.from({ length: steps + 1 }, (_, i) => ({
      left: worldOf(chains.left, i * dt),
      right: worldOf(chains.right, i * dt),
    }));
    // Model forward is +Z for these rigs; the hips' own drift (if any) is
    // part of the clip and counts toward travel.
    const speeds = [];
    let forwardSum = 0;
    for (const side of ['left', 'right']) {
      const minY = Math.min(...frames.map(f => f[side].y));
      const maxY = Math.max(...frames.map(f => f[side].y));
      const band = Math.max(0.03, (maxY - minY) * 0.12);
      for (let i = 1; i < frames.length; i += 1) {
        const a = frames[i - 1][side];
        const b = frames[i][side];
        if (a.y > minY + band || b.y > minY + band) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        speeds.push(Math.hypot(dx, dz) / dt);
        forwardSum += -dz / dt;
      }
    }
    if (!speeds.length) continue;
    speeds.sort((x, y) => x - y);
    results.push({
      clip: name,
      duration: Number(duration.toFixed(3)),
      strideSpeed: Number(speeds[Math.floor(speeds.length / 2)].toFixed(2)),
      // Sign check: positive means the planted foot moves toward -Z (backward
      // for a +Z-facing rig), i.e. the clip walks forward.
      forwardSign: Math.sign(forwardSum),
      file: path.basename(file),
    });
  }
  return results;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
const all = [];
for (const file of files) all.push(...await measure(file));
const seen = new Set();
all.filter(row => (seen.has(row.clip) ? false : seen.add(row.clip))).forEach(row => {
  console.log(`${row.clip.padEnd(22)} ${String(row.strideSpeed).padStart(5)} m/s  ${String(row.duration).padStart(6)}s  dir ${row.forwardSign > 0 ? '+' : '-'}  ${row.file}`);
});
