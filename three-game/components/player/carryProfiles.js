const DEFAULT_PLAYER_RADIUS = 0.36;

export function propHorizontalRadius(prop = {}) {
  const scale = prop.scale || 1;
  const collider = prop.collider || {};
  if (collider.shape === 'cuboid') {
    const [halfX = 0.25, , halfZ = 0.25] = collider.halfExtents || [];
    return Math.hypot(halfX * scale, halfZ * scale);
  }
  return Math.max(0.05, (collider.radius || 0.2) * scale);
}

// Convert the old root-relative carry tuning into a small set of semantic
// skeletal grips. Large/long objects span both palms; small objects follow the
// animated right hand while remaining upright instead of inheriting wrist roll.
export function carryGripForProp(prop = {}) {
  const carryable = prop.behaviors?.carryable || {};
  const radius = propHorizontalRadius(prop);
  const scale = (prop.scale || 1) * (carryable.holdScale || 1);
  const authoredMode = carryable.grip;
  const mode = authoredMode || (radius >= 0.235 ? 'twoHand' : 'rightHand');
  const restOffset = Math.max(0.04, (prop.restOffset || 0.18) * (prop.scale || 1));
  const defaultDown = mode === 'twoHand'
    ? -Math.min(0.28, restOffset * 0.74)
    : -Math.min(0.28, restOffset * 0.62);

  return {
    mode,
    offset: carryable.gripOffset || [0, defaultDown, mode === 'twoHand' ? 0.06 : 0.025],
    rotation: carryable.gripRotation || [0, 0, 0],
    scale,
    animationStyle: carryable.animationStyle || (mode === 'rightHand' ? 'freeHand' : 'fixedHands'),
  };
}

export function carryPlacementProfile(prop = {}, playerRadius = DEFAULT_PLAYER_RADIUS) {
  const carryable = prop.behaviors?.carryable || {};
  const radius = propHorizontalRadius(prop);
  return {
    radius,
    clearance: carryable.placeDistance
      || Math.max(0.72, playerRadius + radius + 0.18),
    height: Math.max(0.04, (prop.restOffset || 0.18) * (prop.scale || 1)) + 0.035,
    pitch: carryable.placeRotation?.[0] ?? prop.rotation?.[0] ?? 0,
    yawOffset: carryable.placeRotation?.[1] ?? 0,
    roll: carryable.placeRotation?.[2] ?? prop.rotation?.[2] ?? 0,
  };
}

const PLACEMENT_ANGLES = [0, 0.48, -0.48, 0.92, -0.92, 1.42, -1.42, Math.PI];
const PLACEMENT_DISTANCE_STEPS = [0, 0.34, 0.72];

// Ordered closest-first so E behaves like a gentle put-down in front of
// Darwin, while still finding a free side position in cramped interiors.
export function carryPlacementCandidates({ prop, player, facing, terrainHeight, playerRadius = DEFAULT_PLAYER_RADIUS }) {
  const profile = carryPlacementProfile(prop, playerRadius);
  const forwardLength = Math.hypot(facing?.x || 0, facing?.z || 0) || 1;
  const baseX = (facing?.x || 0) / forwardLength;
  const baseZ = (facing?.z || -1) / forwardLength;
  const playerYaw = Math.atan2(baseX, baseZ);
  const candidates = [];

  for (const distanceStep of PLACEMENT_DISTANCE_STEPS) {
    const distance = profile.clearance + distanceStep;
    for (const angle of PLACEMENT_ANGLES) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dirX = baseX * cos + baseZ * sin;
      const dirZ = baseZ * cos - baseX * sin;
      const x = (player?.x || 0) + dirX * distance;
      const z = (player?.z || 0) + dirZ * distance;
      const floorY = terrainHeight(x, z);
      candidates.push({
        position: { x, y: floorY + profile.height, z },
        rotation: [profile.pitch, playerYaw + profile.yawOffset, profile.roll],
      });
    }
  }

  return candidates;
}
