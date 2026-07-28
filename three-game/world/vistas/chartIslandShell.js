import * as THREE from 'three';
import islandMask from '../../../public/assets/generated/island-shell/mask.json';
import {
  FLOREANA_MAP_PLACEMENTS,
} from '../../../game-core/floreanaGeography';
import {
  getRegionEdgeHints,
  getRegionMap,
} from '../../../game-core/regionMaps';
import {
  getRegionTerrainConfig,
  terrainColor,
  terrainHeight,
  WATER_LEVEL,
} from '../terrain';
import { surfaceProfileForRegion } from './index';

export const CHART_SHELL_ANGULAR_SEGMENTS = 192;
export const CHART_SHELL_RADIAL_SEGMENTS = 52;
export const CHART_SHELL_OUTER_RADIUS = 430;
export const CHART_SHELL_VARIANTS = Object.freeze({
  full: 'full',
  horizon: 'horizon',
});

const geometryCache = new Map();
const colorCache = new Map();
const LAND_ROUTE_KINDS = new Set(['land', 'creek']);
const WATER_ROUTE_KINDS = new Set(['water']);
const SHELL_SEA_COLOR = new THREE.Color('#315f68');
const SHELL_SHORE_COLOR = new THREE.Color('#69684f');
const OPPOSITE_EDGE = Object.freeze({
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min, max, value) {
  const t = clamp01((value - min) / Math.max(0.0001, max - min));
  return t * t * (3 - 2 * t);
}

function maskCell(x, y) {
  const ix = Math.max(0, Math.min(islandMask.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(islandMask.height - 1, Math.round(y)));
  return islandMask.rows[iy]?.[ix] === '#' ? 1 : 0;
}

function sampleLand(u, v) {
  const px = clamp01(u) * (islandMask.width - 1);
  const py = clamp01(v) * (islandMask.height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(islandMask.width - 1, x0 + 1);
  const y1 = Math.min(islandMask.height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const a = THREE.MathUtils.lerp(maskCell(x0, y0), maskCell(x1, y0), tx);
  const b = THREE.MathUtils.lerp(maskCell(x0, y1), maskCell(x1, y1), tx);
  return THREE.MathUtils.lerp(a, b, ty);
}

function softenedLand(u, v) {
  const du = 1 / islandMask.width;
  const dv = 1 / islandMask.height;
  let total = 0;
  let weight = 0;
  for (let oy = -2; oy <= 2; oy += 1) {
    for (let ox = -2; ox <= 2; ox += 1) {
      const sampleWeight = ox === 0 && oy === 0 ? 2 : 1;
      total += sampleLand(u + ox * du * 0.72, v + oy * dv * 0.72) * sampleWeight;
      weight += sampleWeight;
    }
  }
  return total / weight;
}

function correctedLand(u, v) {
  let land = softenedLand(u, v);
  for (const anchor of islandMask.anchors) {
    if (anchor.kind !== 'land' && anchor.kind !== 'summit') continue;
    const dx = (u - anchor.at[0]) * islandMask.chartWidthKm;
    const dz = (v - anchor.at[1]) * islandMask.chartHeightKm;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.24) continue;
    const correction = 1 - smoothstep(0.08, 0.24, distance);
    land = Math.max(land, correction);
  }
  return clamp01(land);
}

function anchorForRegion(regionId) {
  const baked = islandMask.anchors.find(anchor => anchor.id === regionId);
  if (baked) return baked;
  const placement = FLOREANA_MAP_PLACEMENTS.find(entry => entry.id === regionId);
  if (!placement) return null;
  return {
    id: regionId,
    kind: placement.kind,
    at: placement.at,
    eastKm: placement.at[0] * islandMask.chartWidthKm,
    southKm: placement.at[1] * islandMask.chartHeightKm,
  };
}

function chartRayDistance(anchor, xDirection, zDirection) {
  const distances = [];
  if (xDirection > 0.0001) {
    distances.push((islandMask.chartWidthKm - anchor.eastKm) / xDirection);
  } else if (xDirection < -0.0001) {
    distances.push(anchor.eastKm / -xDirection);
  }
  if (zDirection > 0.0001) {
    distances.push((islandMask.chartHeightKm - anchor.southKm) / zDirection);
  } else if (zDirection < -0.0001) {
    distances.push(anchor.southKm / -zDirection);
  }
  return Math.max(0.1, Math.min(...distances.filter(distance => distance > 0)));
}

function routeScore(regionId, xDirection, zDirection) {
  const hints = getRegionEdgeHints(regionId);
  const scoreFor = edge => {
    const hint = hints.find(entry => entry.edge === edge);
    if (!hint) return 0;
    if (hint.kind === 'blocked') return hint.boundaryKind === 'ocean' ? -1 : 1;
    if (LAND_ROUTE_KINDS.has(hint.routeKind)) return 1;
    if (WATER_ROUTE_KINDS.has(hint.routeKind)) return -1;
    return 0;
  };
  const xWeight = Math.abs(xDirection);
  const zWeight = Math.abs(zDirection);
  const xScore = scoreFor(xDirection >= 0 ? 'east' : 'west');
  const zScore = scoreFor(zDirection >= 0 ? 'south' : 'north');
  const totalWeight = xWeight + zWeight || 1;
  return (xScore * xWeight + zScore * zWeight) / totalWeight;
}

function applyNearRouteSemantics(land, score, radialT) {
  const influence = 1 - smoothstep(0.04, 0.28, radialT);
  if (score > 0) return Math.max(land, score * influence);
  if (score < 0) return land * (1 - -score * influence);
  return land;
}

function anchorElevation(anchor) {
  if (anchor.kind === 'summit') return 31;
  const region = getRegionMap(anchor.id);
  if (region?.type === 'forest' || region?.type === 'highland') return 13;
  if (region?.type === 'cliff' || region?.type === 'promontory') return 10;
  if (anchor.kind === 'land') return 6;
  if (anchor.kind === 'anchorage') return 2.5;
  return 0;
}

function macroElevation(eastKm, southKm) {
  let weightedHeight = 0;
  let totalWeight = 0;
  for (const anchor of islandMask.anchors) {
    const height = anchorElevation(anchor);
    if (height <= 0) continue;
    const distance = Math.hypot(eastKm - anchor.eastKm, southKm - anchor.southKm);
    const weight = Math.exp(-(distance * distance) / (2 * 1.05 * 1.05));
    weightedHeight += height * weight;
    totalWeight += weight;
  }
  const base = totalWeight > 0.001 ? weightedHeight / totalWeight : 4;
  const peak = islandMask.anchors.find(anchor => anchor.id === 'C_HIGH');
  const peakDistance = peak
    ? Math.hypot(eastKm - peak.eastKm, southKm - peak.southKm)
    : 99;
  return base + 17 * Math.exp(-(peakDistance * peakDistance) / (2 * 0.82 * 0.82));
}

function colorForAnchor(anchor) {
  if (colorCache.has(anchor.id)) return colorCache.get(anchor.id);
  const profile = surfaceProfileForRegion(anchor.id);
  const result = {
    near: new THREE.Color(profile.nearColor),
    mid: new THREE.Color(profile.midColor),
    far: new THREE.Color(profile.farColor),
  };
  colorCache.set(anchor.id, result);
  return result;
}

function nearestLandAnchor(eastKm, southKm) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const anchor of islandMask.anchors) {
    if (anchor.kind === 'water' || anchor.kind === 'shipInterior') continue;
    const distance = Math.hypot(eastKm - anchor.eastKm, southKm - anchor.southKm);
    if (distance >= nearestDistance) continue;
    nearest = anchor;
    nearestDistance = distance;
  }
  return nearest;
}

function shellColor(eastKm, southKm, landPresence, radialT) {
  if (landPresence < 0.06) return SHELL_SEA_COLOR.clone();
  const anchor = nearestLandAnchor(eastKm, southKm);
  const palette = anchor ? colorForAnchor(anchor) : {
    near: SHELL_SHORE_COLOR,
    mid: SHELL_SHORE_COLOR,
    far: SHELL_SHORE_COLOR,
  };
  const landColor = palette.mid.clone().lerp(palette.far, smoothstep(0.15, 1, radialT) * 0.5);
  return SHELL_SEA_COLOR.clone().lerp(landColor, landPresence);
}

function edgeRadius(config, xDirection, zDirection) {
  const xDistance = Math.abs(xDirection) > 0.0001
    ? config.width * 0.5 / Math.abs(xDirection)
    : Infinity;
  const zDistance = Math.abs(zDirection) > 0.0001
    ? config.depth * 0.5 / Math.abs(zDirection)
    : Infinity;
  return Math.min(xDistance, zDistance);
}

function edgeSample(config, xDirection, zDirection, radius) {
  return {
    x: THREE.MathUtils.clamp(xDirection * radius, -config.width * 0.5, config.width * 0.5),
    z: THREE.MathUtils.clamp(zDirection * radius, -config.depth * 0.5, config.depth * 0.5),
  };
}

function edgeU(config, edge, point) {
  if (edge === 'north' || edge === 'south') {
    return clamp01(point.x / Math.max(0.001, config.width) + 0.5);
  }
  return clamp01(point.z / Math.max(0.001, config.depth) + 0.5);
}

function targetEdgePoint(config, edge, u, inwardDistance) {
  const halfW = config.width * 0.5;
  const halfD = config.depth * 0.5;
  if (edge === 'north') return [-halfW + u * config.width, -halfD + inwardDistance];
  if (edge === 'south') return [-halfW + u * config.width, halfD - inwardDistance];
  if (edge === 'east') return [halfW - inwardDistance, -halfD + u * config.depth];
  return [-halfW + inwardDistance, -halfD + u * config.depth];
}

function neighborEdgeColor(regionId, config, edge, localPoint, localColor) {
  const hint = getRegionEdgeHints(regionId).find(entry => entry.edge === edge);
  if (!hint) return localColor.clone();
  if (
    hint.kind === 'blocked'
    && hint.boundaryKind === 'ocean'
  ) {
    return SHELL_SHORE_COLOR.clone().lerp(SHELL_SEA_COLOR, 0.42);
  }
  if (!hint.toRegionId || !LAND_ROUTE_KINDS.has(hint.routeKind)) {
    return localColor.clone();
  }
  const targetConfig = getRegionTerrainConfig(hint.toRegionId);
  const targetEdge = OPPOSITE_EDGE[edge];
  if (!targetConfig || !targetEdge) return localColor.clone();
  const u = edgeU(config, edge, localPoint);
  const targetSpan = targetEdge === 'north' || targetEdge === 'south'
    ? targetConfig.depth
    : targetConfig.width;
  const inwardDistance = Math.min(34, targetSpan * 0.34);
  const [targetX, targetZ] = targetEdgePoint(
    targetConfig,
    targetEdge,
    u,
    inwardDistance,
  );
  const targetY = terrainHeight(targetX, targetZ, hint.toRegionId);
  const literal = terrainColor(targetX, targetZ, targetY, hint.toRegionId);
  const profile = surfaceProfileForRegion(hint.toRegionId);
  return literal.lerp(new THREE.Color(profile.midColor), 0.36);
}

// The shell's near palette used to come from the active map edge even though
// the apron in front of it was already showing the connected map. Blend the
// two cardinal neighbor palettes by bearing so the shell rises behind the
// apron in the same color family instead of as a separate gray plate.
function neighborApronHandoffColor(
  regionId,
  config,
  xDirection,
  zDirection,
  localPoint,
  localColor,
) {
  const xWeight = Math.abs(xDirection);
  const zWeight = Math.abs(zDirection);
  const xEdge = xDirection >= 0 ? 'east' : 'west';
  const zEdge = zDirection >= 0 ? 'south' : 'north';
  const xColor = neighborEdgeColor(regionId, config, xEdge, localPoint, localColor);
  const zColor = neighborEdgeColor(regionId, config, zEdge, localPoint, localColor);
  const total = xWeight + zWeight || 1;
  return xColor.lerp(zColor, zWeight / total);
}

export function buildChartIslandShellGeometry(
  regionId,
  variant = CHART_SHELL_VARIANTS.full,
) {
  const config = getRegionTerrainConfig(regionId);
  const anchor = anchorForRegion(regionId);
  if (!config || !anchor) return null;
  const horizonOnly = variant === CHART_SHELL_VARIANTS.horizon;

  const positions = [];
  const colors = [];
  const seamColors = [];
  const depths = [];
  const handoffBlends = [];
  const landOccupancy = [];
  const indices = [];
  const stride = CHART_SHELL_ANGULAR_SEGMENTS + 1;

  for (let radialIndex = 0; radialIndex <= CHART_SHELL_RADIAL_SEGMENTS; radialIndex += 1) {
    const radialT = radialIndex / CHART_SHELL_RADIAL_SEGMENTS;
    for (let angularIndex = 0; angularIndex <= CHART_SHELL_ANGULAR_SEGMENTS; angularIndex += 1) {
      const bearing = angularIndex / CHART_SHELL_ANGULAR_SEGMENTS * Math.PI * 2;
      const xDirection = Math.sin(bearing);
      const zDirection = -Math.cos(bearing);
      const innerRadius = edgeRadius(config, xDirection, zDirection);
      const radius = THREE.MathUtils.lerp(innerRadius, CHART_SHELL_OUTER_RADIUS, radialT);
      const handoffRadius = horizonOnly
        ? Math.max(190, innerRadius + 118)
        : Math.max(105, innerRadius + 46);
      const handoffT = clamp01(
        (handoffRadius - innerRadius) / (CHART_SHELL_OUTER_RADIUS - innerRadius),
      );
      const maximumChartDistance = chartRayDistance(anchor, xDirection, zDirection);
      const chartDistance = maximumChartDistance * Math.pow(radialT, 1.14);
      const eastKm = anchor.eastKm + xDirection * chartDistance;
      const southKm = anchor.southKm + zDirection * chartDistance;
      const u = eastKm / islandMask.chartWidthKm;
      const v = southKm / islandMask.chartHeightKm;
      const nearRouteScore = routeScore(regionId, xDirection, zDirection);
      const semanticLand = applyNearRouteSemantics(
        correctedLand(u, v),
        nearRouteScore,
        radialT,
      );
      const landPresence = smoothstep(0.38, 0.62, semanticLand);
      const macro = macroElevation(eastKm, southKm);
      const broadNoise = (
        Math.sin(eastKm * 2.31 + southKm * 1.17)
        + Math.sin(eastKm * 0.91 - southKm * 2.03) * 0.55
      ) * 0.5;
      const seaY = WATER_LEVEL - 3.2 - radialT * 1.4;
      const landY = WATER_LEVEL + 0.4 + macro * 0.5 + broadNoise * (0.65 + radialT * 0.7);
      let y = THREE.MathUtils.lerp(seaY, landY, landPresence);

      const edge = edgeSample(config, xDirection, zDirection, innerRadius);
      const localY = terrainHeight(edge.x, edge.z, regionId) - 0.18;
      if (horizonOnly) {
        // C uses the shell only after the tuned apron has done the near-distance
        // work. Sink the hidden underlap so it cannot form a second visible
        // foreground band, then let it rise into the far horizon.
        const hiddenProgress = smoothstep(0.015, Math.max(0.08, handoffT * 0.34), radialT);
        const hiddenY = THREE.MathUtils.lerp(localY, seaY - 0.8, hiddenProgress);
        const seamBlend = smoothstep(
          Math.max(0.1, handoffT),
          Math.min(0.86, handoffT + 0.25),
          radialT,
        );
        y = THREE.MathUtils.lerp(hiddenY, y, seamBlend);
      } else {
        // B owns the entire off-map continuation. Preserve the authored edge
        // elevation on land/creek exits, but allow water exits to meet the sea
        // before the chart-derived relief takes over.
        const underlapProgress = smoothstep(0, Math.max(0.05, handoffT), radialT);
        const localContinuationY = nearRouteScore < -0.1
          ? THREE.MathUtils.lerp(localY, seaY, underlapProgress)
          : localY - underlapProgress * 0.65;
        const seamBlend = smoothstep(
          Math.max(0.035, handoffT * 0.48),
          Math.min(0.62, handoffT + 0.28),
          radialT,
        );
        y = THREE.MathUtils.lerp(localContinuationY, y, seamBlend);
      }

      const color = shellColor(eastKm, southKm, landPresence, radialT);
      const localColor = terrainColor(edge.x, edge.z, localY, regionId);
      const seamColor = horizonOnly
        ? neighborApronHandoffColor(
          regionId,
          config,
          xDirection,
          zDirection,
          edge,
          localColor,
        )
        : localColor.clone();
      const colorBlendStart = horizonOnly
        ? Math.max(0.1, handoffT)
        : Math.max(0.035, handoffT * 0.48);
      const colorBlendEnd = horizonOnly
        ? Math.min(0.92, handoffT + 0.28)
        : Math.min(0.72, handoffT + 0.28);
      const handoffBlend = clamp01(
        (radialT - colorBlendStart) / Math.max(0.001, colorBlendEnd - colorBlendStart),
      );
      const distanceWash = 1 - radialT * 0.12;
      color.multiplyScalar(distanceWash);
      seamColor.multiplyScalar(distanceWash);

      positions.push(xDirection * radius, y, zDirection * radius);
      colors.push(color.r, color.g, color.b);
      seamColors.push(seamColor.r, seamColor.g, seamColor.b);
      depths.push(radialT);
      handoffBlends.push(handoffBlend);
      landOccupancy.push(landPresence);
    }
  }

  for (let radialIndex = 0; radialIndex < CHART_SHELL_RADIAL_SEGMENTS; radialIndex += 1) {
    for (let angularIndex = 0; angularIndex < CHART_SHELL_ANGULAR_SEGMENTS; angularIndex += 1) {
      const a = radialIndex * stride + angularIndex;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, d, c, a, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aShellSeamColor', new THREE.Float32BufferAttribute(seamColors, 3));
  geometry.setAttribute('aShellDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('aShellHandoff', new THREE.Float32BufferAttribute(handoffBlends, 1));
  geometry.setAttribute('aShellLand', new THREE.Float32BufferAttribute(landOccupancy, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.mode = 'chart-island-shell';
  geometry.userData.variant = horizonOnly
    ? CHART_SHELL_VARIANTS.horizon
    : CHART_SHELL_VARIANTS.full;
  geometry.userData.regionId = regionId;
  geometry.userData.frontSideOnly = true;
  return geometry;
}

export function getChartIslandShellGeometry(
  regionId,
  variant = CHART_SHELL_VARIANTS.full,
) {
  const cacheKey = `${variant}:${regionId}`;
  if (!geometryCache.has(cacheKey)) {
    geometryCache.set(cacheKey, buildChartIslandShellGeometry(regionId, variant));
  }
  return geometryCache.get(cacheKey);
}

export function chartIslandShellStats(regionId, variant = CHART_SHELL_VARIANTS.full) {
  const geometry = getChartIslandShellGeometry(regionId, variant);
  if (!geometry) return null;
  return {
    vertices: geometry.getAttribute('position').count,
    triangles: geometry.index.count / 3,
    bounds: {
      min: geometry.boundingBox.min.toArray(),
      max: geometry.boundingBox.max.toArray(),
    },
    mode: geometry.userData.mode,
    variant: geometry.userData.variant,
    frontSideOnly: geometry.userData.frontSideOnly,
  };
}
