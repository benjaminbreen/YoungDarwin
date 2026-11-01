import { getRegionSpread } from '../../game-core/regionMaps';

// Larger maps without re-authoring them.
//
// A region given `spread` in game-core/regionMaps.js is drawn on a map that
// many times wider and deeper. Its authored module keeps writing landmarks in
// metres at the original scale and passes them through these helpers, which
// move positions apart but leave sizes alone: a tumulus is still a 10 m
// whaleback and a path still a metre and a half wide, there is just more
// ground between them. Things that belong to a landmark (vents on a cone, a
// rock beside a trail) move with their anchor so they keep their distance.
// With spread 1 every helper returns its input unchanged.

export function regionSpread(regionId) {
  return getRegionSpread(regionId);
}

// [x, z, ...rest] -> spread position, rest (widths, heights) untouched.
export function spreadPoint(point, s) {
  const [x, z, ...rest] = point;
  return [x * s, z * s, ...rest];
}

export function spreadPolyline(points, s) {
  return points.map(point => spreadPoint(point, s));
}

// { x, z, ... } -> same object at the spread position.
export function spreadFeature(feature, s) {
  return { ...feature, x: feature.x * s, z: feature.z * s };
}

// A feature that belongs to an anchor keeps its offset from that anchor.
export function spreadNear(feature, anchor, s) {
  return {
    ...feature,
    x: anchor.x * s + (feature.x - anchor.x),
    z: anchor.z * s + (feature.z - anchor.z),
  };
}

// Scatter bounds covering the whole map grow with it.
export function spreadBounds({ minX, maxX, minZ, maxZ }, s) {
  return { minX: minX * s, maxX: maxX * s, minZ: minZ * s, maxZ: maxZ * s };
}

// Scatter bounds hugging one landmark move with it but keep their extent.
export function spreadBoundsNear({ minX, maxX, minZ, maxZ }, anchor, s) {
  const dx = anchor.x * (s - 1);
  const dz = anchor.z * (s - 1);
  return { minX: minX + dx, maxX: maxX + dx, minZ: minZ + dz, maxZ: maxZ + dz };
}

// Map-wide scatter keeps its density: the count grows with area.
export function spreadCount(count, s) {
  return Math.round(count * s * s);
}
