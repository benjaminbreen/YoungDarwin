export function visualRockTop(rock, {
  centerLift = 0,
  topScale = 2,
  sinkScale = 2,
  minTop = 0.18,
} = {}) {
  return Math.max(minTop, centerLift + (rock.radiusY || 0) * topScale - (rock.sink || 0) * sinkScale);
}

export function ballColliderForVisualRock(radius, top) {
  return {
    type: 'ball',
    radius,
    offset: [0, top - radius, 0],
  };
}
