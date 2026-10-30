import * as THREE from 'three';

const STRIDE_TIME_SCALE = {
  darwin5: {
    walk: 1.1,
    run: 1.05,
    sprint: 1.0,
    grassRun: 1.02,
    runBackwards: 1.04,
    jogBackwards: 1.06,
    jog: 1.08,
    holdWalk: 1.08,
    holdToolWalk: 1.08,
    holdToolRun: 1.04,
    torchWalk: 1.08,
    torchRun: 1.04,
    walkRifle: 1.08,
    runRifle: 1.04,
    walkCarry: 1.09,
    tiredWalk: 1.06,
    crouchWalk: 1.04,
    crouchRun: 1.02,
    walkBackwards: 1.02,
    walkStrafeLeft: 1.04,
    walkStrafeRight: 1.04,
    runStrafeLeft: 1.02,
    runStrafeRight: 1.02,
    wadeWalk: 0.96,
  },
};

// Ground speed (m/s) at which each in-place gait clip keeps its planted foot
// still when played at timeScale 1. Measured from the GLB by
// scripts/measure-gait-strides.mjs; re-run it when a clip changes.
//
// These are what make the feet stick. Scaling a clip by speed / walkSpeed
// assumed every clip matched its config speed, but the walk clip strides
// 1.79 m/s against a 4.45 m/s walk, so Darwin skated about half his travel.
const STRIDE_SPEED = {
  darwin5: {
    walk: 1.79,
    tiredWalk: 1.8,
    jog: 3.84,
    run: 3.84,
    grassRun: 5.83,
    sprint: 6.3,
    walkBackwards: 1.21,
    runBackwards: 3.39,
    jogBackwards: 3.15,
    crouchWalk: 1.47,
    crouchRun: 3.86,
  },
};

// Forward gait bands for the free-handed default. Each clip only looks right
// over a limited range of playback rates, so the clip is chosen by speed and
// then played at the stride-matched rate. The overlap is hysteresis, so a
// speed sitting on a boundary does not flicker between cycles.
const FORWARD_GAITS = [
  { clip: 'walk', below: 2.45, above: null },
  { clip: 'jog', below: 5.2, above: 2.2 },
  { clip: 'sprint', below: null, above: 4.9 },
];

export function strideMatchedTimeScale(modelAssetId, clip, speed, { min = 0.6, max = 1.4 } = {}) {
  const strideSpeed = STRIDE_SPEED[modelAssetId]?.[clip];
  if (!strideSpeed) return null;
  return THREE.MathUtils.clamp(speed / strideSpeed, min, max);
}

// Picks the forward cycle for `speed`, staying in `previousClip` while the
// speed is still inside its band.
export function forwardGaitForSpeed(speed, previousClip = null) {
  const current = FORWARD_GAITS.find(gait => gait.clip === previousClip);
  if (current
    && (current.below === null || speed < current.below)
    && (current.above === null || speed > current.above)) {
    return current.clip;
  }
  const index = FORWARD_GAITS.findIndex((gait, i) => {
    const next = FORWARD_GAITS[i + 1];
    return !next || speed < (gait.below + next.above) / 2;
  });
  return FORWARD_GAITS[Math.max(0, index)].clip;
}

const FOOT_CONTACT_PROFILES = {
  walk: { left: 0.12, right: 0.62, width: 0.18 },
  holdWalk: { left: 0.12, right: 0.62, width: 0.18 },
  holdToolWalk: { left: 0.12, right: 0.62, width: 0.18 },
  torchWalk: { left: 0.12, right: 0.62, width: 0.18 },
  walkRifle: { left: 0.12, right: 0.62, width: 0.18 },
  walkCarry: { left: 0.14, right: 0.64, width: 0.2 },
  tiredWalk: { left: 0.13, right: 0.63, width: 0.22 },
  injuredWalk: { left: 0.13, right: 0.63, width: 0.22 },
  injuredWalkSevere: { left: 0.13, right: 0.63, width: 0.24 },
  injuredWalkCritical: { left: 0.13, right: 0.63, width: 0.25 },
  walkBackwards: { left: 0.62, right: 0.12, width: 0.18 },
  walkStrafeLeft: { left: 0.18, right: 0.68, width: 0.2 },
  walkStrafeRight: { left: 0.56, right: 0.06, width: 0.2 },
  run: { left: 0.08, right: 0.58, width: 0.14 },
  sprint: { left: 0.08, right: 0.58, width: 0.13 },
  grassRun: { left: 0.08, right: 0.58, width: 0.15 },
  runBackwards: { left: 0.58, right: 0.08, width: 0.16 },
  jogBackwards: { left: 0.58, right: 0.08, width: 0.17 },
  backwardTurnLeft: { left: 0.62, right: 0.12, width: 0.19 },
  backwardTurnRight: { left: 0.62, right: 0.12, width: 0.19 },
  jog: { left: 0.09, right: 0.59, width: 0.16 },
  runStrafeLeft: { left: 0.16, right: 0.66, width: 0.16 },
  runStrafeRight: { left: 0.54, right: 0.04, width: 0.16 },
  holdToolRun: { left: 0.08, right: 0.58, width: 0.14 },
  torchRun: { left: 0.08, right: 0.58, width: 0.14 },
  runRifle: { left: 0.08, right: 0.58, width: 0.14 },
  wadeWalk: { left: 0.13, right: 0.63, width: 0.21 },
  crouchWalk: { left: 0.16, right: 0.66, width: 0.24 },
  crouchRun: { left: 0.12, right: 0.62, width: 0.2 },
  torchCrouchWalk: { left: 0.16, right: 0.66, width: 0.24 },
  rifleCrouchWalk: { left: 0.16, right: 0.66, width: 0.24 },
};

const FOOT_PROBE_PATTERNS = {
  default: {
    left: [/lefttoebase$/i, /lefttoe_end$/i, /leftfoot$/i],
    right: [/righttoebase$/i, /righttoe_end$/i, /rightfoot$/i],
  },
  tripoTortoiseRigged: {
    left: [/front_left_foot$/i, /rear_left_foot$/i],
    right: [/front_right_foot$/i, /rear_right_foot$/i],
  },
};

const VISUAL_SOLE_OFFSET = {
  default: { left: 0.006, right: 0.006 },
  darwin5: { left: 0.018, right: 0.018 },
  tripoTortoiseRigged: { left: 0.018, right: 0.018 },
};

function normalizeClipName(name = '') {
  return String(name).replace(/\s+/g, '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
}

const FOOT_CONTACT_PROFILE_BY_NORMALIZED = new Map(
  Object.entries(FOOT_CONTACT_PROFILES).map(([name, profile]) => [normalizeClipName(name), profile]),
);

function strideFamilyForClip(clip = '') {
  if (clip.includes('Run') || clip === 'run') return 'run';
  return 'walk';
}

export function calibratedStrideTimeScale(modelAssetId, clip, scale) {
  const table = STRIDE_TIME_SCALE[modelAssetId] || null;
  const multiplier = table?.[clip] || table?.[strideFamilyForClip(clip)] || 1;
  return scale * multiplier;
}

export function getFootContactProfile(modelAssetId, clip) {
  const normalized = normalizeClipName(clip);
  return FOOT_CONTACT_PROFILES[clip] || FOOT_CONTACT_PROFILE_BY_NORMALIZED.get(normalized) || null;
}

export function getFootProbePatterns(modelAssetId) {
  return FOOT_PROBE_PATTERNS[modelAssetId] || FOOT_PROBE_PATTERNS.default;
}

export function getVisualSoleOffset(modelAssetId, side) {
  const profile = VISUAL_SOLE_OFFSET[modelAssetId] || VISUAL_SOLE_OFFSET.default;
  return THREE.MathUtils.clamp(profile?.[side] ?? VISUAL_SOLE_OFFSET.default[side] ?? 0.006, 0, 0.06);
}

export function footPhasePulse(phase, center, width) {
  const distance = Math.abs(((phase - center + 0.5) % 1) - 0.5);
  return THREE.MathUtils.clamp(1 - distance / Math.max(0.001, width), 0, 1);
}
