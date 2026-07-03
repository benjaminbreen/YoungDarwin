import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  terrainColor,
  terrainHeight,
  terrainSurfaceNoise,
  WATER_LEVEL,
} from '../terrain';
import { isAuthoredRegion } from '../regions';
import { getBorderVistas } from './index';
import {
  CARDINAL_VISTA_EDGES,
  OPPOSITE_VISTA_EDGE,
  buildBorderTransition,
  transitionVistaColor,
} from './transitions';

// Geometry for the border aprons that continue each region's terrain past the
// walkable edge. A single logical grid is built per vista and split along a
// wandering seam ring into two meshes:
//   - the near "carry strip" (map edge -> ~continuity.carryEnd), rendered by
//     Terrain with the region's own splat material, so the ground at the seam
//     is pixel-identical to the walkable terrain;
//   - the far vista mesh, rendered by BorderVistas with vertex colors that
//     blend toward the neighboring region's profile.
// Both meshes share the seam ring's positions and normals, so the boundary is
// watertight; the noise-driven wander keeps it from reading as a ruled line.

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

const ATMOSPHERE = new THREE.Color('#b9d7de');
const SHALLOW_CONTINUATION = new THREE.Color('#5f9fae');
const DEEP_CONTINUATION = new THREE.Color('#1f5f90');
const BORDER_COLLAR_DEPTH = 3.8;
const BORDER_COLLAR_DROP = 0.035;
const BORDER_COLLAR_ROWS = 4;
const SEAM_WANDER_AMPLITUDE = 4.5;
// Width of the dithered crossfade band past the seam ring, where the vista
// mesh dissolves in over the still-rendering carry strip.
const SEAM_BLEND_LENGTH = 18;
// How far the carry strip tucks below the vista mesh across the blend band,
// so dither-discarded vista pixels reveal it without z-fighting.
const SEAM_BLEND_DROP = 0.07;
// The detailed water plane in Water.jsx is a fixed 150x150 square; continued
// seabed is only safe underneath it. Beyond it the deep-ocean disc is the
// water surface, and seabed shallower than the disc would poke through.
const DETAILED_WATER_HALF = 73;

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
  const macro = terrainSurfaceNoise(x * 0.42 + seed * 2.7, z * 0.42 - seed * 1.9);
  const shade = 1 + macro * 0.06 * strength;
  color.multiplyScalar(THREE.MathUtils.clamp(shade, 0.9, 1.1));
  if (macro > 0.3) color.offsetHSL(0.01, -0.015, 0.012 * strength);
  return color;
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
  if (!band) return ATMOSPHERE.clone();
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const color = new THREE.Color(band.colors[0]).lerp(new THREE.Color(band.colors[1] || band.colors[0]), bandT);
  color.lerp(ATMOSPHERE, t * 0.42 + sideFade * 0.24);
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

export function edgeLandStrength(regionId, config, edge, u) {
  const [edgeX, edgeZ] = edgePoint(config, edge, u, 0);
  const [innerX, innerZ] = edgePoint(config, edge, u, 5.5);
  const edgeY = terrainHeight(edgeX, edgeZ, regionId);
  const innerY = terrainHeight(innerX, innerZ, regionId);
  return Math.max(
    THREE.MathUtils.smoothstep(edgeY, WATER_LEVEL - 0.26, WATER_LEVEL + 0.32),
    THREE.MathUtils.smoothstep(innerY, WATER_LEVEL - 0.26, WATER_LEVEL + 0.32),
  );
}

function triangleIsLand(a, b, c, landStrengths, minStrength = 0.18) {
  return landStrengths[a] > minStrength
    && landStrengths[b] > minStrength
    && landStrengths[c] > minStrength;
}

function ensureUpwardWinding(geometry) {
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

function neighborGridEligible(regionId, targetRegionId, targetConfig, vista) {
  return CARDINAL_VISTA_EDGES.has(vista.edge)
    && Boolean(targetRegionId)
    && Boolean(targetConfig)
    && isAuthoredRegion(targetRegionId)
    && vista.render !== false;
}

function buildNeighborApronGrid(regionId, config, targetRegionId, targetConfig, vista, transition) {
  if (!neighborGridEligible(regionId, targetRegionId, targetConfig, vista)) return null;
  const cacheKey = `${regionId}|${vista.id}`;
  if (NEIGHBOR_GRID_CACHE.has(cacheKey)) return NEIGHBOR_GRID_CACHE.get(cacheKey);

  const axes = EDGE_AXES[vista.edge];
  const targetEdge = transition?.targetEdge || OPPOSITE_VISTA_EDGE[vista.edge];
  if (!axes || !targetEdge) return null;
  const recipe = transition?.recipe || { shoreFloor: WATER_LEVEL - 0.28, landThreshold: 0.18 };
  const continuity = transition?.continuity || null;

  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const previewDepth = Math.min(vista.apronDepth || 72, 64);
  const targetSampleDepth = Math.min(
    targetEdge === 'north' || targetEdge === 'south' ? targetConfig.depth : targetConfig.width,
    previewDepth + 10,
  );
  const width = axisLength(config, vista.edge) * 1.04;
  const cols = 52;
  const rows = 28;
  const collarRows = collarRowCount(rows);
  const positions = [];
  const nearColors = [];
  const farColors = [];
  const landStrengths = [];
  const blends = [];
  const waterSafe = [];

  // Seam ring where the region-material carry strip hands off to the vista
  // mesh: nominally at continuity.carryEnd, wandering per column so the
  // material switch never draws a straight line.
  const seamTarget = THREE.MathUtils.clamp(continuity?.carryEnd ?? 16, 10, previewDepth * 0.6);
  let seamRow = collarRows + 1;
  for (let row = collarRows + 1; row <= rows - 2; row += 1) {
    seamRow = row;
    if (borderDistanceForRow(row, rows, previewDepth).outsideDistance >= seamTarget) break;
  }
  const seamNominal = borderDistanceForRow(seamRow, rows, previewDepth).outsideDistance;
  // Last row of the carry strip: covers the whole blend band (with margin for
  // the seam wander shrinking the warped row spacing) so the vista mesh always
  // has carry strip beneath it while it dissolves in.
  let overlapEndRow = seamRow + 1;
  for (let row = seamRow + 1; row <= rows; row += 1) {
    overlapEndRow = row;
    if (borderDistanceForRow(row, rows, previewDepth).outsideDistance
      >= seamNominal + SEAM_BLEND_LENGTH * 1.4) break;
  }

  const seamDistanceAt = u => {
    const alongDistance = (u - 0.5) * width;
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
      const seamHold = 1 - heightBlend;
      const farHaze = THREE.MathUtils.smoothstep(outsideT, 0.58, 1.0);

      const alongDistance = (u - 0.5) * width;
      const [x, z] = worldPoint(origin, along, outward, alongDistance, signedDistance);
      const clampedU = THREE.MathUtils.clamp(u, 0, 1);
      const [currentX, currentZ] = clampToRegionEdge(config, x, z);
      const currentY = terrainHeight(currentX, currentZ, regionId);
      const [edgeX, edgeZ] = edgePoint(config, vista.edge, clampedU, 0);
      const edgeY = terrainHeight(edgeX, edgeZ, regionId);
      const [targetEdgeX, targetEdgeZ] = targetPreviewPoint(targetConfig, targetEdge, clampedU, 0);
      const targetEdgeY = terrainHeight(targetEdgeX, targetEdgeZ, targetRegionId);
      const [targetX, targetZ] = targetPreviewPoint(targetConfig, targetEdge, clampedU, targetDistance);
      const targetY = terrainHeight(targetX, targetZ, targetRegionId);
      const currentLandHere = THREE.MathUtils.smoothstep(currentY, WATER_LEVEL - 0.26, WATER_LEVEL + 0.32);
      const currentLand = Math.max(currentLandHere, edgeLandStrength(regionId, config, vista.edge, clampedU));
      const targetLand = THREE.MathUtils.smoothstep(targetY, recipe.shoreFloor, WATER_LEVEL + 0.18);
      const inlandGate = Math.max(currentLand, THREE.MathUtils.smoothstep(outsideT, 0.16, 0.36));
      const sourceCarryLand = currentLand * (1 - THREE.MathUtils.smoothstep(
        outsideDistance,
        carryEnd * 0.58,
        carryEnd,
      ));
      const targetGateEnd = continuity
        ? Math.max(continuity.shorePatchStart + 6, continuity.targetColorFull * 0.72)
        : 1;
      const targetLandGate = continuity
        ? THREE.MathUtils.smoothstep(outsideDistance, continuity.shorePatchStart, targetGateEnd)
        : 1;
      const landStrength = Math.max(sourceCarryLand, targetLand * inlandGate * targetLandGate);
      const seamOffset = edgeY - targetEdgeY;
      const sourceCarryY = currentY
        - BORDER_COLLAR_DROP
        - outsideT * 0.035
        + apronReliefNoise(x, z, (vista.seed || 0) + 211) * 0.045 * (continuity?.seamNoiseStrength ?? 0.35);
      const targetProfileY = targetY
        + seamOffset * seamHold
        + apronReliefNoise(x, z, (vista.seed || 0) + 173) * 0.08 * heightBlend;
      const previewY = THREE.MathUtils.lerp(sourceCarryY, targetProfileY, heightBlend);
      const y = THREE.MathUtils.lerp(currentY - BORDER_COLLAR_DROP, previewY, collarBlend);

      const currentColor = terrainColor(currentX, currentZ, currentY, regionId);
      const targetColor = terrainColor(targetX, targetZ, targetY, targetRegionId);
      const color = transitionVistaColor(transition, currentColor, targetColor, outsideDistance, outsideT, targetY);
      const mottleT = THREE.MathUtils.smoothstep(outsideDistance, 2.0, 18.0);
      applyApronVertexMottle(color, x, z, {
        seed: (vista.seed || 0) + 31,
        strength: 0.16 + mottleT * (continuity?.seamNoiseStrength ?? 0.65),
      });
      if (farHaze > 0) color.lerp(ATMOSPHERE, farHaze * 0.52);

      positions.push(x, y, z);
      // Carry-strip vertex colors barely show (the region splat materials
      // override diffuse per-pixel), so plain terrainColor matches what the
      // walkable mesh's own vertices carry.
      nearColors.push(currentColor.r, currentColor.g, currentColor.b);
      farColors.push(color.r, color.g, color.b);
      landStrengths.push(landStrength);
      blends.push(row <= collarRows
        ? 0
        : THREE.MathUtils.smoothstep(outsideDistance, seamDistance, seamDistance + SEAM_BLEND_LENGTH));
      waterSafe.push(Math.max(Math.abs(x), Math.abs(z)) < DETAILED_WATER_HALF ? 1 : 0);
    }
  }

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

  // Carry strip: land triangles plus seabed under the detailed water plane,
  // out through the blend band. Vista mesh: land triangles from the seam ring
  // outward; its first SEAM_BLEND_LENGTH metres dissolve in over the strip.
  const nearIndices = [];
  const farIndices = [];
  for (let i = 0; i < woundIndices.length; i += 3) {
    const i0 = woundIndices[i];
    const i1 = woundIndices[i + 1];
    const i2 = woundIndices[i + 2];
    const minRow = Math.floor(Math.min(i0, i1, i2) / stride);
    const landTriangle = triangleIsLand(i0, i1, i2, landStrengths, recipe.landThreshold);
    const underDetailedWater = waterSafe[i0] && waterSafe[i1] && waterSafe[i2];
    if (minRow < overlapEndRow && (landTriangle || underDetailedWater)) nearIndices.push(i0, i1, i2);
    if (minRow >= seamRow && landTriangle) farIndices.push(i0, i1, i2);
  }
  if (!nearIndices.length && !farIndices.length) return null;

  // The strip tucks below the vista mesh across the blend band so the dither
  // reveals it cleanly; the shared seam ring itself stays coincident (the
  // vista mesh is fully discarded there).
  const nearPositions = positionArray.slice();
  const vertexCount = positionArray.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    if (Math.floor(v / stride) > seamRow) nearPositions[v * 3 + 1] -= blends[v] * SEAM_BLEND_DROP;
  }

  const grid = {
    positions: positionArray,
    nearPositions,
    normals: normalArray,
    nearColors: new Float32Array(nearColors),
    farColors: new Float32Array(farColors),
    blends: new Float32Array(blends),
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
  if (geometry) geometry.setAttribute('aBorderBlend', new THREE.BufferAttribute(grid.blends, 1));
  return geometry;
}

export function makeNeighborCarryGeometry(regionId, config, targetRegionId, targetConfig, vista, transition) {
  const grid = buildNeighborApronGrid(regionId, config, targetRegionId, targetConfig, vista, transition);
  if (!grid) return null;
  return gridSliceGeometry(grid, grid.nearPositions, grid.nearColors, grid.nearIndices, 'carry-strip');
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
    const farHaze = THREE.MathUtils.smoothstep(t, 0.72, 1.0);
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

      const edgeColor = terrainColor(edgeX, edgeZ, edgeY, regionId);
      const waterColor = SHALLOW_CONTINUATION.clone().lerp(DEEP_CONTINUATION, THREE.MathUtils.clamp(t * 0.8 + edgeWater * 0.25, 0, 1));
      const rawTargetColor = profileColor(vista, distance, t, sideFade);
      const targetColor = rawTargetColor.lerp(waterColor, waterHold * 0.9);
      const color = edgeColor.lerp(targetColor, seamBlend);
      applyApronVertexMottle(color, x, z, {
        seed: vista.seed || 0,
        strength: 0.22 + seamBlend * 0.7,
      });
      if (farHaze > 0) color.lerp(ATMOSPHERE, farHaze * 0.5);

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
  // Fallback aprons have no carry strip beneath them, so they render fully
  // opaque (blend = 1 keeps every pixel through the vista material's dither).
  geometry.setAttribute('aBorderBlend', new THREE.BufferAttribute(
    new Float32Array(positions.length / 3).fill(1),
    1,
  ));
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();
  return geometry;
}
