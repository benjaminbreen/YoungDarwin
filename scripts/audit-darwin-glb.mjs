import fs from 'node:fs';

const glbPath = process.argv[2] || 'public/assets/models/darwin-final-animated.glb';
const buffer = fs.readFileSync(glbPath);
const { json, bin } = parseGlb(buffer);

const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const requiredClips = [
  'idle',
  'walk',
  'run',
  'startWalking',
  'stopWalking',
  'runToStop',
  'standingJump',
  'standingJumpHold',
  'runningJump',
  'runningJumpHold',
  'jumpLoop',
  'fallingToLanding',
  'landing',
  'runningLanding',
  'hardLanding',
  'sprintToWallClimb',
  'climbingUpWall',
  'crouchIdle',
  'crouchWalk',
  'crouchToStand',
  'standToCrouch',
  'gather',
  'pickUp',
  'kneelInspect',
  'lookAround',
  'point',
  'injuredIdle',
  'injuredWalk',
  'injuredRun',
  'injuredStandingJump',
  'injuredRunJump',
  'shoulderHitAndFall',
  'gettingUp',
];

const errors = [];
const warnings = [];
const animations = new Map((json.animations || []).map(animation => [animation.name, animation]));
const standingLocomotionClips = new Set(['walk', 'run', 'jog', 'walkCarry', 'walkRifle', 'walkStrafeLeft', 'walkStrafeRight']);
const armatureIndex = json.nodes.findIndex(node => node.name === 'Armature');
const hipsIndex = json.nodes.findIndex(node => normalizeName(node.name) === 'mixamorighips');

if (armatureIndex < 0) errors.push('Missing Armature node.');
if (hipsIndex < 0) errors.push('Missing mixamorig:Hips node.');

const rootY = json.nodes[armatureIndex]?.translation?.[1] || 0;
if (Math.abs(rootY) > 0.05) errors.push(`Armature root Y is ${rootY.toFixed(4)}, expected near 0.`);

const missing = requiredClips.filter(name => !animations.has(name));
if (missing.length) errors.push(`Missing required Darwin clips: ${missing.join(', ')}`);

for (const holdName of ['standingJumpHold', 'runningJumpHold']) {
  const animation = animations.get(holdName);
  if (!animation) continue;
  const duration = animationDuration(animation);
  if (Math.abs(duration - 1) > 0.001) errors.push(`${holdName} duration is ${duration.toFixed(3)}, expected 1.000.`);
  for (const channel of animation.channels || []) {
    const sampler = animation.samplers[channel.sampler];
    const accessor = json.accessors[sampler.output];
    if (accessor.componentType !== 5126) continue;
    const values = accessorView(accessor);
    if (accessor.count < 2) {
      errors.push(`${holdName} ${channel.target.path} track has fewer than 2 keys.`);
      continue;
    }
    const components = typeCount[accessor.type];
    for (let component = 0; component < components; component += 1) {
      const delta = Math.abs(values.get(0, component) - values.get(accessor.count - 1, component));
      if (delta > 0.0001) {
        errors.push(`${holdName} ${channel.target.path} track is not a stable hold; component ${component} drifts ${delta.toFixed(5)}.`);
        break;
      }
    }
  }
}

if (hipsIndex >= 0) {
  const hipsRestZ = json.nodes[hipsIndex].translation?.[2] ?? -0.75;
  for (const animation of json.animations || []) {
    for (const channel of animation.channels || []) {
      if (channel.target.node !== hipsIndex || channel.target.path !== 'translation') continue;
      const sampler = animation.samplers[channel.sampler];
      const accessor = json.accessors[sampler.output];
      if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') continue;
      const values = accessorView(accessor);
      const firstZ = values.get(0, 2);
      const delta = firstZ - hipsRestZ;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < accessor.count; index += 1) {
        const z = values.get(index, 2);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      const rangeFromRest = Math.max(Math.abs(minZ - hipsRestZ), Math.abs(maxZ - hipsRestZ));
      if (standingLocomotionClips.has(animation.name) && Math.abs(delta) > 0.18) {
        errors.push(`${animation.name} hips z starts ${delta.toFixed(3)} from rest; standing locomotion must stay grounded.`);
      } else if (standingLocomotionClips.has(animation.name) && rangeFromRest > 0.35) {
        errors.push(`${animation.name} hips z ranges ${rangeFromRest.toFixed(3)} from rest; standing locomotion likely contains vertical source drift.`);
      } else if (Math.abs(delta) > 1.25) {
        errors.push(`${animation.name} hips z starts ${delta.toFixed(3)} from rest; likely source-frame offset.`);
      } else if (Math.abs(delta) > 0.75) {
        warnings.push(`${animation.name} hips z starts ${delta.toFixed(3)} from rest.`);
      }
    }
  }
}

const report = {
  glb: glbPath,
  animations: json.animations?.length || 0,
  armatureRootY: Number(rootY.toFixed(5)),
  requiredClips: requiredClips.length,
  warnings,
  errors,
};

if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseGlb(data) {
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glbPath} is not a GLB.`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + byteLength);
    offset += byteLength;
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
  }
  if (!json || !bin) throw new Error('GLB must contain JSON and BIN chunks.');
  return { json, bin };
}

function animationDuration(animation) {
  let duration = 0;
  for (const sampler of animation.samplers || []) {
    const accessor = json.accessors[sampler.input];
    if (accessor.componentType !== 5126 || accessor.type !== 'SCALAR') continue;
    const values = accessorView(accessor);
    duration = Math.max(duration, values.get(accessor.count - 1, 0));
  }
  return duration;
}

function accessorView(accessor) {
  const bufferView = json.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride || componentSize[accessor.componentType] * typeCount[accessor.type];
  return {
    get(index, component) {
      return bin.readFloatLE(byteOffset + index * stride + component * 4);
    },
  };
}
