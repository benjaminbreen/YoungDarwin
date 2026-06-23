import fs from 'node:fs';

const glbPath = process.argv[2] || 'public/assets/models/darwin-final-animated.glb';

const REQUIRED_RUNTIME_CLIPS = [
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
  'climbingUpWall',
  'climbingDownWall',
  'sprintToWallClimb',
  'wallRun',
  'vault',
  'runningSlide',
  'runningTurn180',
  'walkingTurn180',
  'crouchIdle',
  'crouchWalk',
  'crouchRun',
  'standToCrouch',
  'crouchToStand',
  'standToSit',
  'sitIdle',
  'lyingDown',
  'walkBackwards',
  'walkUpStairs',
  'runUpStairs',
  'tiredWalk',
  'stumble',
  'jumpFromWall',
  'swimToEdge',
  'fallingIntoPool',
  'gather',
  'pickUp',
  'kneelInspect',
  'lookAround',
  'lookAroundShort',
  'point',
  'write',
  'pray',
  'fireRifle',
  'changeItem',
  'hitReaction',
  'bigHitFall',
  'shoulderHitAndFall',
  'gettingUp',
  'teeter',
  'trip',
];

const FALLBACKS = {
  fallingIntoPool: 'fallingToRoll',
  dodgeRoll: 'fallingToRoll',
  standToRoll: 'fallingToRoll',
  rifleEquip: 'changeItem',
  rifleUnequip: 'changeItem',
  rifleKneelIdle: 'crouchRifle',
  rifleCrouchWalk: 'crouchRifle',
  rifleKneelToStand: 'coverToStand',
  rifleCrouchWalkToIdle: 'standToCover',
};

const names = new Set(readAnimationNames(glbPath));
const missing = [];
const coveredByFallback = [];

for (const clip of REQUIRED_RUNTIME_CLIPS) {
  if (names.has(clip)) continue;
  const fallback = FALLBACKS[clip];
  if (fallback && names.has(fallback)) {
    coveredByFallback.push({ clip, fallback });
  } else {
    missing.push({ clip, fallback: fallback || null });
  }
}

const report = {
  glb: glbPath,
  animations: names.size,
  requiredRuntimeClips: REQUIRED_RUNTIME_CLIPS.length,
  coveredByFallback,
  missing,
};

if (missing.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function readAnimationNames(path) {
  const buffer = fs.readFileSync(path);
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${path} is not a GLB.`);
  let offset = 12;
  while (offset < buffer.length) {
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = buffer.subarray(offset, offset + byteLength);
    offset += byteLength;
    if (type === 0x4e4f534a) {
      const json = JSON.parse(chunk.toString('utf8'));
      return (json.animations || []).map(animation => animation.name);
    }
  }
  throw new Error(`${path} has no GLB JSON chunk.`);
}
