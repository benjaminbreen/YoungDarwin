import * as THREE from 'three';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import {
  getRegionTerrainConfig,
  regionSpawnPoint,
  terrainColor,
  terrainHeight,
  terrainSurfaceNoise,
  WATER_LEVEL,
} from '../terrain';
import { getBorderVistas } from './index';
import { bakeDistanceWash } from './vistaHaze';
import {
  CARDINAL_VISTA_EDGES,
  OPPOSITE_VISTA_EDGE,
  buildBorderTransition,
  transitionVistaColor,
} from './transitions';

// Shared-corner handling. Both aprons sweep the corner at full reach so the
// silhouette stays filled from every camera angle; the non-owner sits a few
// centimetres lower, which is what resolves the overlap. Separating them by
// depth rather than by deleting one side's geometry keeps the coverage.
const APRON_SHARED_CORNER_REACH = 1;
const APRON_SHARED_CORNER_DROP = 0.28;

export function apronPreviewDepth(regionId, vista) {
  // Black Beach's west-facing cove is unusually deep: at the generic 64 m
  // cutoff its back shore first rises on the final grid row, leaving a thin
  // crescent that looks like a floating arch from the surf map. Carry this
  // one connected coast far enough inland to show terrain behind the beach.
  const maximum = regionId === 'BLACK_BEACH_SURF' ? 90 : 64;
  return Math.min(vista.apronDepth || 72, maximum);
}

// Geometry for border aprons that continue each region's terrain past the
// walkable edge. One logical grid supplies two coincident material candidates:
// the active region's full PBR material and the low-detail neighbor material.
// Their shaders use complementary, noise-warped coverage masks so texture and
// palette hand off without alpha transparency or a ruled boundary. The
// low-detail candidate begins beyond the inner overlap, while the PBR candidate
// remains available through the full apron so the dev panel can widen or move
// the handoff without opening geometry holes.
// Water is rendered by the shared Water scene component. Aprons continue the
// seabed only; keeping a second, flat water cap here creates a visible polygon
// wherever its fixed colors overlap the animated deep-ocean shader.

export const EDGE_AXES = {
  north: { along: [1, 0], outward: [0, -1] },
  south: { along: [1, 0], outward: [0, 1] },
  east: { along: [0, 1], outward: [1, 0] },
  west: { along: [0, 1], outward: [-1, 0] },
  northeast: { along: [1, 1], outward: [1, -1] },
  northwest: { along: [1, -1], outward: [-1, -1] },
  southeast: { along: [1, -1], outward: [1, 1] },
  southwest: { along: [1, 1], outward: [-1, 1] },
};

const BORDER_COLLAR_DEPTH = 3.8;
const BORDER_COLLAR_DROP = 0.035;
const BORDER_COLLAR_ROWS = 4;
const SEAM_WANDER_AMPLITUDE = 4.5;
// Width used to locate the far start of the coincident PBR/apron handoff.
const SEAM_BLEND_LENGTH = 18;

export function normalize2([x, z]) {
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

export function edgeOrigin(config, edge) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (edge.includes('north') && edge.includes('east')) return [halfW, -halfD];
  if (edge.includes('north') && edge.includes('west')) return [-halfW, -halfD];
  if (edge.includes('south') && edge.includes('east')) return [halfW, halfD];
  if (edge.includes('south') && edge.includes('west')) return [-halfW, halfD];
  if (edge === 'north') return [0, -halfD];
  if (edge === 'south') return [0, halfD];
  if (edge === 'east') return [halfW, 0];
  return [-halfW, 0];
}

export function axisLength(config, edge) {
  if (edge.length > 5) return Math.min(config.width, config.depth) * 1.05;
  return edge === 'north' || edge === 'south' ? config.width : config.depth;
}

export function worldPoint(origin, along, outward, alongDistance, outwardDistance) {
  return [
    origin[0] + along[0] * alongDistance + outward[0] * outwardDistance,
    origin[1] + along[1] * alongDistance + outward[1] * outwardDistance,
  ];
}

function collarRowCount(rows) {
  return Math.min(BORDER_COLLAR_ROWS, Math.max(1, rows - 2));
}

function borderDistanceForRow(row, rows, depth) {
  const collarRows = collarRowCount(rows);
  if (row <= collarRows) {
    const collarT = row / collarRows;
    return {
      signedDistance: -BORDER_COLLAR_DEPTH * (1 - collarT),
      outsideDistance: 0,
      outsideT: 0,
      collarBlend: collarT,
    };
  }
  const t = (row - collarRows) / Math.max(1, rows - collarRows);
  const easedT = t * t * (3 - 2 * t);
  const outsideDistance = easedT * depth;
  return {
    signedDistance: outsideDistance,
    outsideDistance,
    outsideT: t,
    collarBlend: 1,
  };
}

export function clampToRegionEdge(config, x, z) {
  return [
    THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2),
    THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2),
  ];
}

// Area-averaged terrain color. The apron grid samples vertices metres apart,
// far too coarse to point-sample a splat-sharp palette: adjacent vertices land
// in different color zones (white sand vs. basalt) and the triangles between
// them interpolate as hard polygonal shards. Averaging a ring of taps turns
// zone boundaries into gradients; the radius grows with distance the same way
// real distant ground blurs together. Build-time only — results are baked into
// vertex colors and cached, so this costs nothing per frame.
const APRON_COLOR_TAPS = [
  [0, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7],
];
function averagedTerrainColor(x, z, regionId, radius) {
  const sum = new THREE.Color(0, 0, 0);
  for (let i = 0; i < APRON_COLOR_TAPS.length; i += 1) {
    const sx = x + APRON_COLOR_TAPS[i][0] * radius;
    const sz = z + APRON_COLOR_TAPS[i][1] * radius;
    sum.add(terrainColor(sx, sz, terrainHeight(sx, sz, regionId), regionId));
  }
  return sum.multiplyScalar(1 / APRON_COLOR_TAPS.length);
}

// Low-frequency relief for the schematic far terrain. Simplex octaves rather
// than summed sines: the old sine trio repeated visibly as broad regular
// swells across the apron.
function apronReliefNoise(x, z, seed = 0) {
  const broad = terrainSurfaceNoise(x * 0.062 + seed * 1.7, z * 0.062 - seed * 2.1);
  const mid = terrainSurfaceNoise(x * 0.17 - seed * 0.8, z * 0.17 + seed * 0.6);
  return broad * 0.85 + mid * 0.5;
}

// Macro octave only: the apron grid samples vertices every ~2 m, so anything
// finer aliases into per-vertex speckle that reads as faceted scales. Fine
// grain belongs to the per-pixel shader in the vista material.
function applyApronVertexMottle(color, x, z, options = {}) {
  const seed = options.seed || 0;
  const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0, 1);
  if (strength <= 0) return color;
  // 0.16 keeps the mottle wavelength (~6 m) spanning several grid vertices;
  // the old 0.42 put ~one vertex per noise feature, which aliased into the
  // same faceted speckle the comment above warns about.
  const macro = terrainSurfaceNoise(x * 0.16 + seed * 2.7, z * 0.16 - seed * 1.9);
  const shade = 1 + macro * 0.06 * strength;
  color.multiplyScalar(THREE.MathUtils.clamp(shade, 0.9, 1.1));
  if (macro > 0.3) color.offsetHSL(0.01, -0.015, 0.012 * strength);
  return color;
}

function smoothNeighborApronGrid(positions, depths, rows, columns, preserveThroughRow) {
  const stride = columns + 1;
  const vertexCount = (rows + 1) * stride;
  let heights = new Float64Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    heights[index] = positions[index * 3 + 1];
  }

  // Preserve the authored map edge and material handoff exactly. Beyond it,
  // two light build-time passes remove one-cell notches from the low-detail
  // neighbor silhouette while retaining broad hills and coastal shelves.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = heights.slice();
    for (let row = preserveThroughRow + 1; row <= rows; row += 1) {
      for (let col = 0; col <= columns; col += 1) {
        const index = row * stride + col;
        const depth = depths[index];
        const outerBlend = THREE.MathUtils.smoothstep(depth, 0.34, 1);
        if (outerBlend <= 0) continue;
        let sum = heights[index] * 5;
        let weight = 5;
        if (col > 0) {
          sum += heights[index - 1] * 3;
          weight += 3;
        }
        if (col < columns) {
          sum += heights[index + 1] * 3;
          weight += 3;
        }
        if (row > preserveThroughRow + 1) {
          sum += heights[index - stride] * 0.7;
          weight += 0.7;
        }
        if (row < rows) {
          sum += heights[index + stride] * 0.7;
          weight += 0.7;
        }
        next[index] = THREE.MathUtils.lerp(
          heights[index],
          sum / weight,
          THREE.MathUtils.lerp(0.16, 0.42, outerBlend),
        );
      }
    }
    heights = next;
  }

  // Limit only isolated along-ridge jumps in the far half. The clamp is loose
  // enough to preserve real regional relief but prevents a coarse sample from
  // becoming a visible tooth against the sky.
  for (let row = preserveThroughRow + 1; row <= rows; row += 1) {
    for (let col = 1; col <= columns; col += 1) {
      const index = row * stride + col;
      const depth = depths[index];
      if (depth < 0.48) continue;
      const previous = index - 1;
      const maxStep = THREE.MathUtils.lerp(1.8, 0.9, depth);
      heights[index] = THREE.MathUtils.clamp(
        heights[index],
        heights[previous] - maxStep,
        heights[previous] + maxStep,
      );
    }
    for (let col = columns - 1; col >= 0; col -= 1) {
      const index = row * stride + col;
      const depth = depths[index];
      if (depth < 0.48) continue;
      const nextIndex = index + 1;
      const maxStep = THREE.MathUtils.lerp(1.8, 0.9, depth);
      heights[index] = THREE.MathUtils.clamp(
        heights[index],
        heights[nextIndex] - maxStep,
        heights[nextIndex] + maxStep,
      );
    }
  }

  for (let index = 0; index < vertexCount; index += 1) {
    positions[index * 3 + 1] = heights[index];
  }
}

function bandAt(vista, distance) {
  return vista.bands?.find(band => distance >= band.from && distance <= band.to)
    || vista.bands?.[vista.bands.length - 1]
    || vista.bands?.[0]
    || null;
}

export function profileHeight(vista, x, z, distance, t) {
  const band = bandAt(vista, distance);
  if (!band) return -0.9;
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const base = THREE.MathUtils.lerp(band.nearY, band.farY, bandT);
  const relief = apronReliefNoise(x, z, vista.seed || 0) * (0.18 + t * 0.42);
  return base + relief;
}

function profileColor(vista, distance, t, sideFade) {
  const band = bandAt(vista, distance);
  if (!band) return new THREE.Color('#8f9490');
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const color = new THREE.Color(band.colors[0]).lerp(new THREE.Color(band.colors[1] || band.colors[0]), bandT);
  bakeDistanceWash(color, t * 0.42 + sideFade * 0.24);
  return color;
}

function edgeDryRatio(regionId, config, edge) {
  if (!CARDINAL_VISTA_EDGES.has(edge)) return 0;
  const samples = 21;
  let dry = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = samples === 1 ? 0.5 : index / (samples - 1);
    let x = 0;
    let z = 0;
    if (edge === 'north' || edge === 'south') {
      x = -config.width / 2 + t * config.width;
      z = edge === 'north' ? -config.depth / 2 : config.depth / 2;
    } else {
      x = edge === 'west' ? -config.width / 2 : config.width / 2;
      z = -config.depth / 2 + t * config.depth;
    }
    const y = terrainHeight(x, z, regionId);
    if (y > WATER_LEVEL + 0.18) dry += 1;
  }
  return dry / samples;
}

function edgePoint(config, edge, u, inset = 0) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (edge === 'north') return [(u - 0.5) * config.width, -halfD + inset];
  if (edge === 'south') return [(u - 0.5) * config.width, halfD - inset];
  if (edge === 'east') return [halfW - inset, (u - 0.5) * config.depth];
  return [-halfW + inset, (u - 0.5) * config.depth];
}

function targetPreviewPoint(config, targetEdge, u, inwardDistance) {
  return edgePoint(config, targetEdge, u, inwardDistance);
}

function targetPointPreviewCoordinates(config, targetEdge, x, z) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (targetEdge === 'north') return { u: x / config.width + 0.5, inwardDistance: z + halfD };
  if (targetEdge === 'south') return { u: x / config.width + 0.5, inwardDistance: halfD - z };
  if (targetEdge === 'east') return { u: z / config.depth + 0.5, inwardDistance: halfW - x };
  return { u: z / config.depth + 0.5, inwardDistance: x + halfW };
}

// Projects normalized edge/depth coordinates onto the same schematic terrain
// surface used by BorderVistas. `u` may extend slightly beyond 0..1 for an
// apron-owned corner; terrain sampling clamps to the corner while world-space
// placement continues around it.
export function projectApronPreviewPoint(
  regionId,
  config,
  targetRegionId,
  targetConfig,
  vista,
  transition,
  u,
  requestedOutsideDistance,
) {
  const axes = EDGE_AXES[vista.edge];
  const targetEdge = transition?.targetEdge || OPPOSITE_VISTA_EDGE[vista.edge];
  if (!axes || !targetEdge || !targetConfig) return null;

  const previewDepth = apronPreviewDepth(regionId, vista);
  const targetSampleDepth = Math.min(
    targetEdge === 'north' || targetEdge === 'south' ? targetConfig.depth : targetConfig.width,
    previewDepth + 10,
  );
  const outsideDistance = THREE.MathUtils.clamp(requestedOutsideDistance, 0, previewDepth);
  const outsideT = outsideDistance / Math.max(0.001, previewDepth);
  const targetDistance = outsideT * targetSampleDepth;
  const clampedU = THREE.MathUtils.clamp(u, 0, 1);
  const targetU = mapApronSourceUToTargetU(
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista.edge,
    targetEdge,
    clampedU,
  );
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const alongDistance = (u - 0.5) * axisLength(config, vista.edge);
  const [x, z] = worldPoint(origin, along, outward, alongDistance, outsideDistance);
  const [edgeX, edgeZ] = edgePoint(config, vista.edge, clampedU, 0);
  const edgeY = terrainHeight(edgeX, edgeZ, regionId);
  const [targetEdgeX, targetEdgeZ] = targetPreviewPoint(targetConfig, targetEdge, targetU, 0);
  const targetEdgeY = terrainHeight(targetEdgeX, targetEdgeZ, targetRegionId);
  const [targetX, targetZ] = targetPreviewPoint(targetConfig, targetEdge, targetU, targetDistance);
  const targetY = terrainHeight(targetX, targetZ, targetRegionId);
  const continuity = transition?.continuity || null;
  const heightBlend = continuity
    ? THREE.MathUtils.smoothstep(outsideDistance, continuity.ridgeStart, continuity.ridgeFull)
    : THREE.MathUtils.smoothstep(outsideDistance, 0, continuity?.carryEnd ?? 12);
  const topologyHold = apronTopologyHold(
    regionId,
    config,
    targetConfig,
    vista,
    transition,
    clampedU,
    edgeY,
    targetY,
  );
  const effectiveHeightBlend = heightBlend * (1 - topologyHold);
  const sourceCarryY = edgeY
    - BORDER_COLLAR_DROP
    - outsideT * 0.035
    + apronReliefNoise(x, z, (vista.seed || 0) + 211) * 0.045 * (continuity?.seamNoiseStrength ?? 0.35);
  const targetProfileY = targetY
    + (edgeY - targetEdgeY) * (1 - effectiveHeightBlend)
    + apronReliefNoise(x, z, (vista.seed || 0) + 173) * 0.08 * effectiveHeightBlend;

  return {
    x,
    y: THREE.MathUtils.lerp(sourceCarryY, targetProfileY, effectiveHeightBlend),
    z,
    u,
    clampedU,
    targetU,
    outsideDistance,
    outsideT,
    previewDepth,
    targetGroundY: targetY,
    topologyHold,
  };
}

// Projects a point from the neighboring map onto the apron. Target placements
// remain tied to their authored habitats and route clearings; source-side
// continuation uses projectApronPreviewPoint directly with a remapped depth.
export function projectNeighborPreviewPoint(
  regionId,
  config,
  targetRegionId,
  targetConfig,
  vista,
  transition,
  targetX,
  targetZ,
) {
  const targetEdge = transition?.targetEdge || OPPOSITE_VISTA_EDGE[vista.edge];
  if (!targetEdge || !targetConfig) return null;
  const previewDepth = apronPreviewDepth(regionId, vista);
  const targetSampleDepth = Math.min(
    targetEdge === 'north' || targetEdge === 'south' ? targetConfig.depth : targetConfig.width,
    previewDepth + 10,
  );
  const { u, inwardDistance } = targetPointPreviewCoordinates(targetConfig, targetEdge, targetX, targetZ);
  if (u < 0 || u > 1 || inwardDistance < 0 || inwardDistance > targetSampleDepth) return null;
  const sourceU = mapApronTargetUToSourceU(
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista.edge,
    targetEdge,
    u,
  );
  return projectApronPreviewPoint(
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista,
    transition,
    sourceU,
    inwardDistance / Math.max(0.001, targetSampleDepth) * previewDepth,
  );
}

export function edgeLandStrength(regionId, config, edge, u) {
  const clampedU = THREE.MathUtils.clamp(u, 0, 1);
  const [edgeX, edgeZ] = edgePoint(config, edge, clampedU, 0);
  const [innerX, innerZ] = edgePoint(config, edge, clampedU, 5.5);
  const edgeY = terrainHeight(edgeX, edgeZ, regionId);
  const innerY = terrainHeight(innerX, innerZ, regionId);
  return Math.max(
    THREE.MathUtils.smoothstep(edgeY, WATER_LEVEL - 0.26, WATER_LEVEL + 0.32),
    THREE.MathUtils.smoothstep(innerY, WATER_LEVEL - 0.26, WATER_LEVEL + 0.32),
  );
}

const ROUTE_EDGE_U_CACHE = new Map();

function routeEdgeU(regionId, config, edge) {
  const key = `${regionId}:${edge}`;
  if (ROUTE_EDGE_U_CACHE.has(key)) return ROUTE_EDGE_U_CACHE.get(key);
  const spawn = regionSpawnPoint(regionId, edge);
  const along = edge === 'north' || edge === 'south' ? spawn.x : spawn.z;
  const u = THREE.MathUtils.clamp(along / axisLength(config, edge) + 0.5, 0, 1);
  ROUTE_EDGE_U_CACHE.set(key, u);
  return u;
}

function warpGatewayCoordinate(value, fromGateway, toGateway) {
  const u = THREE.MathUtils.clamp(value, 0, 1);
  const from = THREE.MathUtils.clamp(fromGateway, 0.001, 0.999);
  const to = THREE.MathUtils.clamp(toGateway, 0.001, 0.999);
  if (u <= from) return u / from * to;
  return to + (u - from) / (1 - from) * (1 - to);
}

// Region edges often place their authored trail/landing gateways at different
// normalized positions. A monotonic, endpoint-preserving warp aligns those
// gateways while still sampling the full neighboring edge, avoiding the
// unrelated bay/cliff slice that a raw same-u projection can select.
export function mapApronSourceUToTargetU(
  regionId,
  config,
  targetRegionId,
  targetConfig,
  sourceEdge,
  targetEdge,
  sourceU,
) {
  return warpGatewayCoordinate(
    sourceU,
    routeEdgeU(regionId, config, sourceEdge),
    routeEdgeU(targetRegionId, targetConfig, targetEdge),
  );
}

export function mapApronTargetUToSourceU(
  regionId,
  config,
  targetRegionId,
  targetConfig,
  sourceEdge,
  targetEdge,
  targetU,
) {
  return warpGatewayCoordinate(
    targetU,
    routeEdgeU(targetRegionId, targetConfig, targetEdge),
    routeEdgeU(regionId, config, sourceEdge),
  );
}

// Coastal maps rarely have shoreline intersections at identical normalized
// positions on both sides of a route. Preserve the source coast away from the
// authored gateway, while allowing the real neighbor to take over in a broad
// corridor around that gateway. This prevents a target beach or reef shelf
// from becoming a full rectangular land/water patch on the source map.
export function apronTopologyHold(
  regionId,
  config,
  targetConfig,
  vista,
  transition,
  u,
  sourceY,
  targetY,
) {
  const sourceStats = transition?.sourceStats;
  const targetStats = transition?.targetStats;
  const coastal = Math.max(sourceStats?.waterRatio || 0, targetStats?.waterRatio || 0) > 0.08
    || Math.max(sourceStats?.shoreRatio || 0, targetStats?.shoreRatio || 0) > 0.16;
  // Placeholder regions describe a destination category, not authored edge
  // composition. Let one route corridor preview them, but do not repaint the
  // source map's full edge with a provisional terrain profile.
  const placeholderTarget = String(targetConfig?.preset || '').startsWith('placeholder-');
  if (!coastal && !placeholderTarget) return 0;

  const routeU = routeEdgeU(regionId, config, vista.edge);
  const routeDistance = Math.abs(u - routeU) * axisLength(config, vista.edge);
  const routeInfluence = 1 - THREE.MathUtils.smoothstep(routeDistance, 9, 27);
  const sourceLand = sourceY > WATER_LEVEL + 0.04;
  const targetLand = targetY > WATER_LEVEL + 0.04;
  const mismatchStrength = sourceLand === targetLand
    ? (placeholderTarget ? 0.78 : 0.68)
    : 1;
  return THREE.MathUtils.clamp((1 - routeInfluence) * mismatchStrength, 0, 1);
}

export function ensureUpwardWinding(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || !index) return geometry;
  const indices = Array.from(index.array);
  let normalY = 0;
  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < indices.length; i += 3) {
    ax.fromBufferAttribute(position, indices[i]);
    bx.fromBufferAttribute(position, indices[i + 1]);
    cx.fromBufferAttribute(position, indices[i + 2]);
    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    normal.crossVectors(ab, ac);
    normalY += normal.y;
  }

  if (normalY < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
    geometry.setIndex(indices);
  }
  return geometry;
}

const NEIGHBOR_GRID_CACHE = new Map();

// Adjacent cardinal edge at each end of an edge's along axis (u=0 / u=1).
const CORNER_ADJACENT_EDGE = {
  north: ['west', 'east'],
  south: ['west', 'east'],
  east: ['north', 'south'],
  west: ['north', 'south'],
};

function vistaRendersPreview(regionId, edge) {
  const sibling = getBorderVistas(regionId).find(entry => entry.edge === edge);
  return Boolean(sibling
    && CARDINAL_VISTA_EDGES.has(sibling.edge)
    && sibling.toRegionId
    && sibling.render !== false
    && getRegionTerrainConfig(sibling.toRegionId));
}

function edgeIsExplicitBoundary(regionId, edge) {
  return getRegionEdgeHints(regionId).some(hint => hint.edge === edge && hint.kind === 'blocked');
}

// Corner topology is boundary-aware:
// - two open edges share the corner along a diagonal, so neither produces a
//   full rectangular roof;
// - an authored ocean/cliff edge leaves negative space for water or the cliff
//   silhouette;
// - a lone open edge receives a tapered wedge rather than a full-width slab.
export function apronCornerMode(regionId, vista, end) {
  const adjacentEdge = CORNER_ADJACENT_EDGE[vista.edge]?.[end];
  if (!adjacentEdge || edgeIsExplicitBoundary(regionId, adjacentEdge)) return 'none';
  return vistaRendersPreview(regionId, adjacentEdge) ? 'shared' : 'owned';
}

export function apronCornerReach(regionId, vista, end, outsideDistance, previewDepth) {
  if (apronCornerMode(regionId, vista, end) === 'none') return 0;
  return THREE.MathUtils.clamp(outsideDistance, 0, previewDepth);
}

// One deterministic owner fills a shared diagonal corner. Keeping the
// non-owner apron inside its own edge prevents two coarse surfaces from
// intersecting into long edge-on triangles as the camera turns.
export function apronOwnsCorner(regionId, vista, end) {
  const mode = apronCornerMode(regionId, vista, end);
  if (mode === 'none') return false;
  if (mode === 'owned') return true;
  return vista.edge === 'north' || vista.edge === 'south';
}

// Any neighbor with a terrain config qualifies: terrainHeight/terrainColor
// fall back to the procedural placeholder profile for non-authored regions,
// so previews of procedural maps sample real (if simple) terrain rather than
// needing a hand-authored vista profile.
function neighborGridEligible(regionId, targetRegionId, targetConfig, vista) {
  return CARDINAL_VISTA_EDGES.has(vista.edge)
    && Boolean(targetRegionId)
    && Boolean(targetConfig)
    && vista.render !== false;
}

function buildNeighborApronGrid(regionId, config, targetRegionId, targetConfig, vista, transition) {
  if (!neighborGridEligible(regionId, targetRegionId, targetConfig, vista)) return null;
  const cacheKey = `${regionId}|${vista.id}`;
  if (NEIGHBOR_GRID_CACHE.has(cacheKey)) return NEIGHBOR_GRID_CACHE.get(cacheKey);

  const axes = EDGE_AXES[vista.edge];
  const targetEdge = transition?.targetEdge || OPPOSITE_VISTA_EDGE[vista.edge];
  if (!axes || !targetEdge) return null;
  const continuity = transition?.continuity || null;

  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const previewDepth = Math.min(vista.apronDepth || 72, 64);
  const targetSampleDepth = Math.min(
    targetEdge === 'north' || targetEdge === 'south' ? targetConfig.depth : targetConfig.width,
    previewDepth + 10,
  );
  const axisLen = axisLength(config, vista.edge);
  const baseWidth = axisLen * 1.04;
  const maxExtLow = apronOwnsCorner(regionId, vista, 0) ? previewDepth : 0;
  const maxExtHigh = apronOwnsCorner(regionId, vista, 1) ? previewDepth : 0;
  const maximumWidth = baseWidth + maxExtLow + maxExtHigh;
  // Fine enough that the area-averaged vertex colors interpolate as gradients;
  // still only ~4k triangles per vista (more when the apron sweeps corners),
  // built once and cached. Column count scales so vertex density holds.
  const blackBeachApproach = regionId === 'BLACK_BEACH_SURF'
    && targetRegionId === 'BLACK_BEACH';
  const baseColumns = blackBeachApproach ? 96 : 64;
  const cols = Math.min(160, Math.round(baseColumns * (maximumWidth / baseWidth)));
  const rows = blackBeachApproach ? 52 : 34;
  const collarRows = collarRowCount(rows);
  const positions = [];
  const nearColors = [];
  const farColors = [];
  const depths = [];

  // Seam ring where the region-material carry strip hands off to the vista
  // mesh: the surface handoff can precede the longer height-continuity carry,
  // and wanders per column so the material switch never draws a straight line.
  const seamTarget = THREE.MathUtils.clamp(
    continuity?.surfaceCarryEnd ?? continuity?.carryEnd ?? 16,
    8,
    previewDepth * 0.6,
  );
  let seamRow = collarRows + 1;
  for (let row = collarRows + 1; row <= rows - 2; row += 1) {
    seamRow = row;
    if (borderDistanceForRow(row, rows, previewDepth).outsideDistance >= seamTarget) break;
  }
  const seamNominal = borderDistanceForRow(seamRow, rows, previewDepth).outsideDistance;
  // Locate a conservative outer boundary for the inner overlap. The
  // low-detail candidate begins beyond this row; the PBR candidate now remains
  // available through the full apron and yields in the shader instead.
  let overlapEndRow = seamRow + 1;
  for (let row = seamRow + 1; row <= rows; row += 1) {
    overlapEndRow = row;
    if (borderDistanceForRow(row, rows, previewDepth).outsideDistance
      >= seamNominal + SEAM_BLEND_LENGTH * 1.4) break;
  }

  const seamDistanceAt = u => {
    const alongDistance = -baseWidth / 2 + u * baseWidth;
    const wander = terrainSurfaceNoise(
      alongDistance * 0.5 + (vista.seed || 0) * 13.7,
      (vista.seed || 0) * 3.1,
    ) * SEAM_WANDER_AMPLITUDE;
    return THREE.MathUtils.clamp(seamNominal + wander, 8, previewDepth * 0.72);
  };

  for (let row = 0; row <= rows; row += 1) {
    const nominal = borderDistanceForRow(row, rows, previewDepth);
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      let outsideDistance = nominal.outsideDistance;
      let seamDistance = 0;
      if (row > collarRows) {
        seamDistance = seamDistanceAt(u);
        outsideDistance = row <= seamRow
          ? nominal.outsideDistance * (seamDistance / seamNominal)
          : seamDistance + (nominal.outsideDistance - seamNominal)
            * (previewDepth - seamDistance) / Math.max(0.001, previewDepth - seamNominal);
      }
      const signedDistance = row <= collarRows ? nominal.signedDistance : outsideDistance;
      const outsideT = row <= collarRows ? 0 : outsideDistance / previewDepth;
      const { collarBlend } = nominal;
      const targetDistance = outsideT * targetSampleDepth;
      const carryEnd = continuity?.carryEnd ?? 12.0;
      const seamBlend = THREE.MathUtils.smoothstep(outsideDistance, 0.0, carryEnd);
      const heightBlend = continuity
        ? THREE.MathUtils.smoothstep(outsideDistance, continuity.ridgeStart, continuity.ridgeFull)
        : seamBlend;
      // Keep only a faint baked distance wash. Scene fog already supplies
      // aerial perspective; a strong baked wash turns the whole outer grid
      // into a gray plate when the camera looks straight down.
      const farHaze = THREE.MathUtils.smoothstep(outsideT, 0.34, 1.0);

      // A shared corner needs one visual owner so two aprons do not z-fight
      // where they overlap — but zeroing the non-owner's reach outright removes
      // its corner sweep entirely, and on east/west vistas apronOwnsCorner is
      // never true for a shared corner. That cost those views up to two full
      // previewDepths of lateral coverage and opened sea gaps beside the
      // neighbouring land. Keep the geometry and settle it just under the
      // owner instead, keeping the shared corner filled without z-fighting.
      const extLow = apronCornerReach(
        regionId,
        vista,
        0,
        Math.max(0, signedDistance),
        previewDepth,
      ) * (apronOwnsCorner(regionId, vista, 0) ? 1 : APRON_SHARED_CORNER_REACH);
      const extHigh = apronCornerReach(
        regionId,
        vista,
        1,
        Math.max(0, signedDistance),
        previewDepth,
      ) * (apronOwnsCorner(regionId, vista, 1) ? 1 : APRON_SHARED_CORNER_REACH);
      const rowWidth = baseWidth + extLow + extHigh;
      const alongDistance = -baseWidth / 2 - extLow + u * rowWidth;
      const [x, z] = worldPoint(origin, along, outward, alongDistance, signedDistance);
      // Corner overhang columns keep sampling frozen at the edge's end, so the
      // apron sweeps around the corner continuing the corner profile.
      const clampedU = THREE.MathUtils.clamp(alongDistance / axisLen + 0.5, 0, 1);
      const [currentX, currentZ] = clampToRegionEdge(config, x, z);
      const currentY = terrainHeight(currentX, currentZ, regionId);
      const [edgeX, edgeZ] = edgePoint(config, vista.edge, clampedU, 0);
      const edgeY = terrainHeight(edgeX, edgeZ, regionId);
      const targetU = mapApronSourceUToTargetU(
        regionId,
        config,
        targetRegionId,
        targetConfig,
        vista.edge,
        targetEdge,
        clampedU,
      );
      const [targetEdgeX, targetEdgeZ] = targetPreviewPoint(targetConfig, targetEdge, targetU, 0);
      const targetEdgeY = terrainHeight(targetEdgeX, targetEdgeZ, targetRegionId);
      const [targetX, targetZ] = targetPreviewPoint(targetConfig, targetEdge, targetU, targetDistance);
      const targetY = terrainHeight(targetX, targetZ, targetRegionId);
      const seamOffset = edgeY - targetEdgeY;
      const topologyHold = apronTopologyHold(
        regionId,
        config,
        targetConfig,
        vista,
        transition,
        clampedU,
        edgeY,
        targetY,
      );
      const effectiveHeightBlend = heightBlend * (1 - topologyHold);
      const sourceCarryY = currentY
        - BORDER_COLLAR_DROP
        - outsideT * 0.035
        + apronReliefNoise(x, z, (vista.seed || 0) + 211) * 0.045 * (continuity?.seamNoiseStrength ?? 0.35);
      const targetProfileY = targetY
        + seamOffset * (1 - effectiveHeightBlend)
        + apronReliefNoise(x, z, (vista.seed || 0) + 173) * 0.08 * effectiveHeightBlend;
      const previewY = THREE.MathUtils.lerp(sourceCarryY, targetProfileY, effectiveHeightBlend);
      const baseY = THREE.MathUtils.lerp(currentY - BORDER_COLLAR_DROP, previewY, collarBlend);
      // Cardinal aprons widen into their neighboring corners. At an oblique
      // camera angle, the last along-axis column otherwise reads as a vertical
      // rectangular cutoff shared by both the preview and its carry strip.
      // Taper only the off-map portion; the real map-edge collar remains
      // untouched, while adjacent aprons overlap the lowered corner wedge.
      const side = Math.abs(u - 0.5) * 2;
      const sideTaper = THREE.MathUtils.smoothstep(side, 0.62, 1)
        * THREE.MathUtils.smoothstep(outsideDistance, Math.max(6, carryEnd * 0.5), Math.max(18, carryEnd + 8));
      const cornerFloorY = Math.max(WATER_LEVEL - 1.6, baseY - 6.5);
      const cornerY = THREE.MathUtils.lerp(baseY, cornerFloorY, sideTaper);
      // Keep the preview's outer rows at terrain height beneath the overlapping
      // landform. Dropping them below the water plane exposes a blue hairline
      // between near and middle distance at grazing camera angles.
      // Where two aprons share a corner, the non-owner keeps its geometry but
      // settles just beneath the owner so the owner's surface wins the depth
      // test cleanly rather than the two fighting over coplanar triangles.
      const overhang = Math.max(0, Math.abs(alongDistance) - baseWidth / 2);
      const overhangEnd = alongDistance < 0 ? 0 : 1;
      const sharedNonOwner = overhang > 0
        && apronCornerMode(regionId, vista, overhangEnd) === 'shared'
        && !apronOwnsCorner(regionId, vista, overhangEnd);
      const y = cornerY - (sharedNonOwner
        ? APRON_SHARED_CORNER_DROP * THREE.MathUtils.smoothstep(overhang, 0, 9)
        : 0);

      // Blur radius tracks distance: near the seam stay close to the real
      // ground color, far out average whole zones together so the neighbor's
      // beach/basalt patches read as soft gradients instead of shards.
      const currentColor = averagedTerrainColor(
        currentX, currentZ, regionId,
        1.2 + outsideDistance * 0.08,
      );
      const targetColor = averagedTerrainColor(
        targetX, targetZ, targetRegionId,
        Math.min(7.5, 1.6 + targetDistance * 0.14),
      );
      const color = transitionVistaColor(transition, currentColor, targetColor, outsideDistance, outsideT, targetY);
      color.lerp(currentColor, topologyHold);
      const mottleT = THREE.MathUtils.smoothstep(outsideDistance, 2.0, 18.0);
      applyApronVertexMottle(color, x, z, {
        seed: (vista.seed || 0) + 31,
        strength: 0.16 + mottleT * (continuity?.seamNoiseStrength ?? 0.65),
      });
      if (farHaze > 0) bakeDistanceWash(color, farHaze * 0.14);

      positions.push(x, y, z);
      // Carry-strip vertex colors barely show (the region splat materials
      // override diffuse per-pixel), so plain terrainColor matches what the
      // walkable mesh's own vertices carry.
      nearColors.push(currentColor.r, currentColor.g, currentColor.b);
      farColors.push(color.r, color.g, color.b);
      depths.push(outsideT);
    }
  }

  smoothNeighborApronGrid(
    positions,
    depths,
    rows,
    cols,
    seamRow + 1,
  );

  const stride = cols + 1;
  const allIndices = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      allIndices.push(a, b, c, c, b, d);
    }
  }

  // Compute normals once on the full grid so the two meshes shade
  // continuously across the shared seam ring.
  const fullGeometry = new THREE.BufferGeometry();
  const positionArray = new Float32Array(positions);
  fullGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  fullGeometry.setIndex(allIndices);
  ensureUpwardWinding(fullGeometry);
  fullGeometry.computeVertexNormals();
  const normalArray = fullGeometry.getAttribute('normal').array;
  const woundIndices = Array.from(fullGeometry.getIndex().array);
  fullGeometry.dispose();

  // Both terrain meshes are watertight. Continued seabed renders everywhere
  // beneath the shared detailed/deep water surfaces, avoiding terrain holes
  // without introducing a second water material.
  // Carry strip: map edge out through the near field. The low-detail mesh used
  // to start inside the player's elevated-camera footprint, where individual
  // neighbor-color islands read as gray/salmon puddles laid over normal ground.
  // Keep the active region's world-space PBR material in charge beyond the old
  // overlap, then give the vista a short two-row underlap at the far handoff.
  const nearIndices = [];
  const farIndices = [];
  const vistaStartRow = Math.min(
    rows - 1,
    Math.max(seamRow + 1, overlapEndRow + 1),
  );
  // Keep a coincident PBR candidate through the whole visible apron. It is
  // normally discarded well before the outer edge, but retaining the geometry
  // lets the dev lab expose a genuinely wide feather range without opening
  // holes when the texture handoff is pushed late.
  const carryEndRow = rows;
  for (let i = 0; i < woundIndices.length; i += 3) {
    const i0 = woundIndices[i];
    const i1 = woundIndices[i + 1];
    const i2 = woundIndices[i + 2];
    const minRow = Math.floor(Math.min(i0, i1, i2) / stride);
    if (minRow < carryEndRow) nearIndices.push(i0, i1, i2);
    if (minRow >= vistaStartRow) farIndices.push(i0, i1, i2);
  }
  if (!nearIndices.length && !farIndices.length) return null;

  // Both materials occupy the same surface through the overlap. Their shaders
  // use complementary world-noise coverage, so exactly one material owns each
  // fragment while real PBR texture breaks into the low-detail apron.
  // Shader tuning is expressed across the part of the apron that is actually
  // visible. Keeping the original map-edge depth after moving the ownership
  // boundary outward compressed every feather slider into the last few
  // percent of its range and made the controls appear ineffective.
  const farDepths = new Float32Array(depths.length);
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const index = row * stride + col;
      const startDepth = depths[vistaStartRow * stride + col];
      farDepths[index] = THREE.MathUtils.clamp(
        (depths[index] - startDepth) / Math.max(0.001, 1 - startDepth),
        0,
        1,
      );
    }
  }

  const grid = {
    positions: positionArray,
    normals: normalArray,
    nearColors: new Float32Array(nearColors),
    farColors: new Float32Array(farColors),
    depths: farDepths,
    nearIndices,
    farIndices,
  };
  NEIGHBOR_GRID_CACHE.set(cacheKey, grid);
  return grid;
}

function gridSliceGeometry(grid, positions, colors, indices, mode) {
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.mode = mode;
  return geometry;
}

export function makeNeighborPreviewGeometry(regionId, config, targetRegionId, targetConfig, vista, transition) {
  const grid = buildNeighborApronGrid(regionId, config, targetRegionId, targetConfig, vista, transition);
  if (!grid) return null;
  const geometry = gridSliceGeometry(grid, grid.positions, grid.farColors, grid.farIndices, 'neighbor-preview');
  if (geometry) {
    geometry.setAttribute('aApronDepth', new THREE.BufferAttribute(grid.depths, 1));
  }
  return geometry;
}

export function makeNeighborCarryGeometry(regionId, config, targetRegionId, targetConfig, vista, transition) {
  const grid = buildNeighborApronGrid(regionId, config, targetRegionId, targetConfig, vista, transition);
  if (!grid) return null;
  const geometry = gridSliceGeometry(
    grid,
    grid.positions,
    grid.nearColors,
    grid.nearIndices,
    'carry-strip',
  );
  if (geometry) {
    geometry.setAttribute('aApronDepth', new THREE.BufferAttribute(grid.depths, 1));
  }
  return geometry;
}

// Carry strips for every vista edge of a region, rendered by Terrain with the
// region's own material so the seam at the map edge is invisible.
export function makeCarryStripGeometries(regionId) {
  const config = getRegionTerrainConfig(regionId);
  return getBorderVistas(regionId)
    .map(vista => {
      const targetConfig = vista.toRegionId ? getRegionTerrainConfig(vista.toRegionId) : null;
      const transition = buildBorderTransition(regionId, config, vista, targetConfig);
      const geometry = makeNeighborCarryGeometry(regionId, config, vista.toRegionId, targetConfig, vista, transition);
      return geometry ? { id: vista.id, edge: vista.edge, geometry } : null;
    })
    .filter(Boolean);
}

export function makeApronGeometry(regionId, config, vista) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes || vista.render === false) return null;
  // Fallback aprons are for mostly dry/generic transitions only. Mixed coastal
  // routes use makeNeighborPreviewGeometry so the mesh never has to impersonate
  // water, which caused the off-map triangular sheets.
  if (!CARDINAL_VISTA_EDGES.has(vista.edge) || edgeDryRatio(regionId, config, vista.edge) < 0.84) return null;

  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * (vista.apronWidthScale || 1.75);
  const depth = vista.apronDepth || 86;
  const cols = vista.edge.length > 5 ? 24 : 34;
  const rows = 24;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const {
      signedDistance,
      outsideDistance,
      outsideT,
      collarBlend,
    } = borderDistanceForRow(row, rows, depth);
    const t = outsideT;
    const distance = outsideDistance;
    const seamBlend = THREE.MathUtils.smoothstep(outsideDistance, 0.0, depth * 0.38);
    const farHaze = THREE.MathUtils.smoothstep(t, 0.42, 1.0);
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      const side = Math.abs(u - 0.5) * 2;
      const sideFade = THREE.MathUtils.smoothstep(side, 0.72, 1.0);
      const alongDistance = (u - 0.5) * width;
      const [x, z] = worldPoint(origin, along, outward, alongDistance, signedDistance);
      const [edgeX, edgeZ] = clampToRegionEdge(config, x, z);
      const edgeY = terrainHeight(edgeX, edgeZ, regionId);
      const innerX = THREE.MathUtils.clamp(edgeX - outward[0] * 4.5, -config.width / 2, config.width / 2);
      const innerZ = THREE.MathUtils.clamp(edgeZ - outward[1] * 4.5, -config.depth / 2, config.depth / 2);
      const innerY = terrainHeight(innerX, innerZ, regionId);
      const edgeLand = Math.max(
        THREE.MathUtils.smoothstep(edgeY, WATER_LEVEL - 0.34, WATER_LEVEL + 0.42),
        THREE.MathUtils.smoothstep(innerY, WATER_LEVEL - 0.34, WATER_LEVEL + 0.42),
      );
      const edgeWater = 1 - edgeLand;
      const rawTargetY = profileHeight(vista, x, z, distance, t);
      const landHold = edgeLand * (1 - THREE.MathUtils.smoothstep(t, 0.2, 0.7));
      // If the current edge is open water, do not let the connected apron rise
      // into the neighboring terrain profile. Distant land should be handled as
      // a separate vista silhouette; this mesh is only for seam continuation.
      const waterHold = edgeWater;
      const landContinuationY = Math.max(rawTargetY, edgeY - t * 0.72 + apronReliefNoise(x, z, (vista.seed || 0) + 91) * 0.08);
      const waterContinuationY = WATER_LEVEL - 0.28 - t * 0.42 + apronReliefNoise(x, z, (vista.seed || 0) + 37) * 0.045;
      let targetY = THREE.MathUtils.lerp(rawTargetY, landContinuationY, landHold);
      targetY = THREE.MathUtils.lerp(targetY, waterContinuationY, waterHold);
      const sideDrop = sideFade * seamBlend * 0.45;
      const apronY = THREE.MathUtils.lerp(edgeY, targetY, seamBlend) - sideDrop;
      const y = THREE.MathUtils.lerp(edgeY - BORDER_COLLAR_DROP, apronY, collarBlend);

      const edgeColor = averagedTerrainColor(edgeX, edgeZ, regionId, 1.4 + distance * 0.08);
      const waterColor = SHALLOW_CONTINUATION.clone().lerp(DEEP_CONTINUATION, THREE.MathUtils.clamp(t * 0.8 + edgeWater * 0.25, 0, 1));
      const rawTargetColor = profileColor(vista, distance, t, sideFade);
      const targetColor = rawTargetColor.lerp(waterColor, waterHold * 0.9);
      const color = edgeColor.lerp(targetColor, seamBlend);
      applyApronVertexMottle(color, x, z, {
        seed: vista.seed || 0,
        strength: 0.22 + seamBlend * 0.7,
      });
      if (farHaze > 0) bakeDistanceWash(color, farHaze * 0.6);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = cols + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aApronDepth', new THREE.BufferAttribute(
    Float32Array.from({ length: positions.length / 3 }, (_, index) => (
      Math.floor(index / (cols + 1)) / rows
    )),
    1,
  ));
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();
  return geometry;
}
