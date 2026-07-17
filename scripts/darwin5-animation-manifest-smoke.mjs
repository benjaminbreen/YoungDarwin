import fs from 'node:fs';
import {
  DARWIN5_ANIMATION_MANIFEST,
  DARWIN5_REQUIRED_RUNTIME_CLIPS,
  darwin5ClipFallback,
} from '../three-game/components/player/darwin5AnimationManifest.mjs';

const defaultGlbPaths = [
  'public/assets/models/darwin5.glb',
  'public/assets/models/darwin5-motion-bank.glb',
  'public/assets/models/darwin5-action-bank.glb',
  'public/assets/models/darwin5-character-bank.glb',
];
const glbPaths = process.argv.length > 2 ? process.argv.slice(2) : defaultGlbPaths;
const clips = new Set();
const clipOwners = new Map();
const files = glbPaths.map(glbPath => {
  const { json } = parseGlb(fs.readFileSync(glbPath), glbPath);
  const names = (json.animations || []).map(animation => animation.name);
  names.forEach(name => {
    clips.add(name);
    const owners = clipOwners.get(name) || [];
    owners.push(glbPath);
    clipOwners.set(name, owners);
  });
  return { glb: glbPath, bytes: fs.statSync(glbPath).size, animationCount: names.length };
});
const errors = [];
const warnings = [];

if (clips.size !== 156) errors.push(`Expected 156 unique Darwin5 clips across the runtime split; found ${clips.size}.`);
for (const [clip, owners] of clipOwners) {
  if (owners.length > 1) errors.push(`Darwin5 clip ${clip} is duplicated across: ${owners.join(', ')}`);
}

const bootClips = new Set(parseGlb(fs.readFileSync(glbPaths[0]), glbPaths[0]).json.animations?.map(animation => animation.name));
for (const clip of ['idle', 'walk', 'run', 'fallingIdle', 'landing']) {
  if (!bootClips.has(clip)) errors.push(`Boot-critical Darwin5 clip is deferred: ${clip}`);
}

for (const clip of DARWIN5_REQUIRED_RUNTIME_CLIPS) {
  if (!clips.has(clip)) errors.push(`Missing required Darwin5 runtime clip: ${clip}`);
}

for (const [clip, meta] of Object.entries(DARWIN5_ANIMATION_MANIFEST)) {
  if (Number.isFinite(meta.duration) && meta.duration <= 0) {
    errors.push(`${clip} has invalid duration ${meta.duration}`);
  }
  if (Number.isFinite(meta.lockDuration) && meta.lockDuration < 0) {
    errors.push(`${clip} has invalid lockDuration ${meta.lockDuration}`);
  }
  if (meta.loop !== undefined && typeof meta.loop !== 'boolean') {
    errors.push(`${clip} loop must be boolean when set.`);
  }
  if (!clips.has(clip)) {
    const fallback = darwin5ClipFallback(clip);
    if (!fallback || !clips.has(fallback)) {
      warnings.push(`${clip} is in the manifest but neither it nor fallback ${fallback || '<none>'} is present in the runtime split.`);
    }
  }
}

const report = {
  files,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  animationCount: clips.size,
  manifestEntries: Object.keys(DARWIN5_ANIMATION_MANIFEST).length,
  requiredRuntimeClips: DARWIN5_REQUIRED_RUNTIME_CLIPS.length,
  warnings,
  errors,
};

if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function parseGlb(data, glbPath) {
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glbPath} is not a GLB.`);
  let offset = 12;
  let json = null;
  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + byteLength);
    offset += byteLength;
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  }
  if (!json) throw new Error('GLB must contain a JSON chunk.');
  return { json };
}
