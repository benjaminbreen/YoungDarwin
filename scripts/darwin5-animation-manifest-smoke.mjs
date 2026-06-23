import fs from 'node:fs';
import {
  DARWIN5_ANIMATION_MANIFEST,
  DARWIN5_REQUIRED_RUNTIME_CLIPS,
  darwin5ClipFallback,
} from '../three-game/components/player/darwin5AnimationManifest.mjs';

const glbPath = process.argv[2] || 'public/assets/models/darwin5.glb';
const { json } = parseGlb(fs.readFileSync(glbPath));
const clips = new Set((json.animations || []).map(animation => animation.name));
const errors = [];
const warnings = [];

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
      warnings.push(`${clip} is in the manifest but neither it nor fallback ${fallback || '<none>'} is present in ${glbPath}.`);
    }
  }
}

const report = {
  glb: glbPath,
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

function parseGlb(data) {
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
