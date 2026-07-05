import * as THREE from 'three';

const STRIDE_TIME_SCALE = {
  darwin: { walk: 1.03, run: 1.02, jog: 1.03 },
  darwinCandidate2: { walk: 1.04, run: 1.02, jog: 1.03 },
  darwin4: { walk: 1.04, run: 1.02, jog: 1.03 },
  darwin5: {
    walk: 1.1,
    run: 1.05,
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
