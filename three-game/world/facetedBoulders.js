const clamp01 = value => Math.min(1, Math.max(0, value));

export const FACETED_BOULDER_PERIMETER_SEGMENTS = 32;
export const FACETED_BOULDER_UPPER_RING_COUNT = 10;

const EDGE_RING_SCALE = 0.995;
const EDGE_RING_HEIGHT = 0.085;
const RING_SCALE_DROP = 0.36;
const RING_SCALE_EXPONENT = 1.58;
const RING_HEIGHT_RISE = 0.855;
const AVERAGE_FOOTPRINT_INSET = 0.9825;

export function usesFacetedBoulderSurface(obstacle) {
  return obstacle?.zoneId === 'POST_OFFICE_BAY' && obstacle?.kind === 'boulder';
}

export function facetedBoulderRingScale(t) {
  return EDGE_RING_SCALE - Math.pow(clamp01(t), RING_SCALE_EXPONENT) * RING_SCALE_DROP;
}

export function facetedBoulderRingHeightFraction(t) {
  return EDGE_RING_HEIGHT + clamp01(t) * RING_HEIGHT_RISE;
}

// The render mesh pulls its authored footprint inward by 0–3.5% to break up
// the outline. Use the mean inset here so traversal follows the visible crown
// rather than the larger broad-phase collision hull.
export function facetedBoulderSurfaceFraction(radialFraction) {
  const radius = clamp01(radialFraction / AVERAGE_FOOTPRINT_INSET);
  const crownRadius = facetedBoulderRingScale(1);
  const crownHeight = facetedBoulderRingHeightFraction(1);

  if (radius <= crownRadius) {
    const acrossCrown = radius / Math.max(0.0001, crownRadius);
    return 1 + (crownHeight - 1) * acrossCrown;
  }

  if (radius <= EDGE_RING_SCALE) {
    const inverseScale = clamp01((EDGE_RING_SCALE - radius) / RING_SCALE_DROP);
    const t = Math.pow(inverseScale, 1 / RING_SCALE_EXPONENT);
    return facetedBoulderRingHeightFraction(t);
  }

  const acrossToe = clamp01((radius - EDGE_RING_SCALE) / Math.max(0.0001, 1 - EDGE_RING_SCALE));
  return EDGE_RING_HEIGHT + (0.04 - EDGE_RING_HEIGHT) * acrossToe;
}

function cross2(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function convexBoundaryRadius(point, points, scale) {
  const pointRadius = Math.hypot(point.x, point.y);
  if (pointRadius < 0.0001) return Infinity;
  const directionX = point.x / pointRadius;
  const directionY = point.y / pointRadius;
  let boundaryRadius = Infinity;

  for (let index = 0; index < points.length; index += 1) {
    const [startXRaw, startYRaw] = points[index];
    const [endXRaw, endYRaw] = points[(index + 1) % points.length];
    const startX = startXRaw * scale;
    const startY = startYRaw * scale;
    const edgeX = endXRaw * scale - startX;
    const edgeY = endYRaw * scale - startY;
    const denominator = cross2(directionX, directionY, edgeX, edgeY);
    if (Math.abs(denominator) < 0.000001) continue;
    const rayDistance = cross2(startX, startY, edgeX, edgeY) / denominator;
    const edgeFraction = cross2(startX, startY, directionX, directionY) / denominator;
    if (rayDistance < 0 || edgeFraction < -0.0001 || edgeFraction > 1.0001) continue;
    boundaryRadius = Math.min(boundaryRadius, rayDistance);
  }

  return boundaryRadius;
}

export function facetedBoulderRadialFraction(point, shape, scale = 1) {
  const pointRadius = Math.hypot(point.x, point.y);
  if (pointRadius < 0.0001) return 0;

  if (shape?.type === 'convex' && shape.points?.length >= 3) {
    const boundaryRadius = convexBoundaryRadius(point, shape.points, scale);
    if (Number.isFinite(boundaryRadius) && boundaryRadius > 0.0001) {
      return pointRadius / boundaryRadius;
    }
  }

  const radius = Math.max(0.0001, (shape?.radius || 0.5) * scale);
  return pointRadius / radius;
}

export function facetedBoulderSupportY(obstacle, shape, point, baseY) {
  const radialFraction = facetedBoulderRadialFraction(point, shape, obstacle.scale || 1);
  const top = Math.max(0.05, obstacle.colliderTop || obstacle.height || 1);
  return baseY + top * facetedBoulderSurfaceFraction(radialFraction);
}
