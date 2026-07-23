import * as THREE from 'three';
import {
  FLOREANA_MAP_PLACEMENTS,
  FLOREANA_OPPOSITE_DIRECTIONS,
  FLOREANA_ROUTE_EDGES,
} from '../../../game-core/floreanaGeography';
import { getRegionMap } from '../../../game-core/regionMaps';
import { terrainSurfaceNoise } from '../terrain';
import { WATER_LEVEL } from '../terrainShared';
import {
  EDGE_AXES,
  axisLength,
  edgeOrigin,
  ensureUpwardWinding,
  normalize2,
  projectApronPreviewPoint,
  worldPoint,
} from './apronGeometry';
import { surfaceProfileForRegion } from './index';

const EDGE_TO_DIRECTION = Object.freeze({
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
});
const LAND_ROUTE_KINDS = new Set(['land', 'creek']);
const NON_LANDFORM_TYPES = new Set([
  'beagle',
  'interior',
  'ocean',
  'office',
  'reef',
  'shipInterior',
]);
const ATMOSPHERE = new THREE.Color('#a9b8ae');

const MACRO_HEIGHT_BY_TYPE = Object.freeze({
  bay: 1.5,
  beach: 2,
  camp: 7,
  clearing: 9,
  cliff: 8,
  coastallava: 3.5,
  coastalTrail: 4,
  forest: 17,
  grassland: 8,
  highland: 20,
  hut: 4,
  lavafield: 6,
  promontory: 7,
  scrubland: 8,
  settlement: 10,
  wetland: 5,
});

function placementFor(regionId) {
  return FLOREANA_MAP_PLACEMENTS.find(entry => entry.id === regionId) || null;
}

function routeStep(regionId, direction) {
  for (const [sourceId, sourceDirection, targetId, kind] of FLOREANA_ROUTE_EDGES) {
    if (sourceId === regionId && sourceDirection === direction) {
      return { regionId: targetId, kind };
    }
    if (targetId === regionId && FLOREANA_OPPOSITE_DIRECTIONS[sourceDirection] === direction) {
      return { regionId: sourceId, kind };
    }
  }
  return null;
}

function macroHeight(regionId) {
  const placement = placementFor(regionId);
  if (placement?.kind === 'summit' || regionId === 'C_HIGH') return 32;
  const region = getRegionMap(regionId);
  return MACRO_HEIGHT_BY_TYPE[region?.type] ?? 7;
}

export function distantLandformRoute(regionId, edge, expectedFirstRegionId = null, maxRegions = 4) {
  const direction = EDGE_TO_DIRECTION[edge];
  if (!direction) return [];
  const route = [];
  const visited = new Set([regionId]);
  let cursor = regionId;
  for (let stepIndex = 0; stepIndex < maxRegions; stepIndex += 1) {
    const step = routeStep(cursor, direction);
    if (!step || !LAND_ROUTE_KINDS.has(step.kind) || visited.has(step.regionId)) break;
    if (stepIndex === 0 && expectedFirstRegionId && step.regionId !== expectedFirstRegionId) break;
    const region = getRegionMap(step.regionId);
    if (!region || NON_LANDFORM_TYPES.has(region.type)) break;
    route.push({
      regionId: step.regionId,
      kind: step.kind,
      type: region.type,
      macroHeight: macroHeight(step.regionId),
    });
    visited.add(step.regionId);
    cursor = step.regionId;
    if (step.regionId === 'C_HIGH' || placementFor(step.regionId)?.kind === 'summit') break;
  }
  return route;
}

function routeValue(route, t, valueAt) {
  if (route.length === 1) return valueAt(route[0]);
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (route.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(route.length - 1, low + 1);
  const blend = THREE.MathUtils.smoothstep(scaled - low, 0, 1);
  return THREE.MathUtils.lerp(valueAt(route[low]), valueAt(route[high]), blend);
}

function routeColor(route, t) {
  if (route.length === 1) {
    const profile = surfaceProfileForRegion(route[0].regionId);
    return new THREE.Color(profile.midColor).lerp(new THREE.Color(profile.farColor), 0.38);
  }
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (route.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(route.length - 1, low + 1);
  const blend = THREE.MathUtils.smoothstep(scaled - low, 0, 1);
  const lowProfile = surfaceProfileForRegion(route[low].regionId);
  const highProfile = surfaceProfileForRegion(route[high].regionId);
  return new THREE.Color(lowProfile.midColor)
    .lerp(new THREE.Color(highProfile.midColor), blend)
    .lerp(new THREE.Color(highProfile.farColor), 0.28 + t * 0.2);
}

function summitProjection(regionId, edge, farDistance) {
  const source = placementFor(regionId);
  const summit = placementFor('C_HIGH');
  const axes = EDGE_AXES[edge];
  if (!source || !summit || !axes) return null;
  const chartX = summit.at[0] - source.at[0];
  const chartZ = summit.at[1] - source.at[1];
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const outwardShare = chartX * outward[0] + chartZ * outward[1];
  if (outwardShare <= 0.015) return null;
  const alongShare = chartX * along[0] + chartZ * along[1];
  return {
    distance: farDistance * 0.76,
    along: THREE.MathUtils.clamp(
      farDistance * 0.76 * alongShare / outwardShare,
      -farDistance * 0.48,
      farDistance * 0.48,
    ),
  };
}

// The detailed neighbor apron is deliberately short. This second, low-poly
// layer starts beneath its outer rows and follows successive land routes so a
// coastal map reads as part of one island rather than a tile floating on the
// open-ocean disc. It has no collision, ecology, or close-range texture work.
export function makeDistantLandformGeometry(
  regionId,
  config,
  vista,
  targetConfig,
  transition,
) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes || vista.render === false || !targetConfig) return null;
  const route = distantLandformRoute(regionId, vista.edge, vista.toRegionId);
  if (!route.length) return null;
  // Short aprons already describe low coastal chains. Promoting those routes
  // into mountain-scale backdrops makes neighboring cardinal sectors overlap
  // at corners (and can put a false ridge over an otherwise open sea view).
  // Reserve this layer for routes that genuinely climb toward the island's
  // forest/highland mass or summit.
  if (!route.some(entry => entry.macroHeight >= 14)) return null;

  const previewDepth = Math.min(vista.apronDepth || 72, 64);
  const nearDistance = Math.max(42, previewDepth - 11);
  const farDistance = 238;
  const axisLen = axisLength(config, vista.edge);
  const nearWidth = axisLen * 1.08;
  // Cover a full gameplay-camera sector at the far rim. The first version
  // flared only ~65 degrees, so turning slightly off-axis exposed the ocean
  // disc beside an otherwise convincing inland ridge.
  const farWidth = axisLen + farDistance * 1.9;
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const rows = 20;
  const cols = 44;
  const positions = [];
  const colors = [];
  const indices = [];
  const blends = [];
  const previousRowHeights = new Array(cols + 1).fill(null);
  const firstMacroHeight = route[0].macroHeight;
  const includesSummit = route.some(entry => entry.regionId === 'C_HIGH');
  const summit = includesSummit ? summitProjection(regionId, vista.edge, farDistance) : null;

  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const distanceT = THREE.MathUtils.smoothstep(t, 0, 1);
    const outsideDistance = THREE.MathUtils.lerp(nearDistance, farDistance, distanceT);
    const width = THREE.MathUtils.lerp(nearWidth, farWidth, Math.pow(distanceT, 0.82));
    const routeT = THREE.MathUtils.smoothstep(t, 0.08, 0.96);
    const regionalRise = routeValue(route, routeT, entry => entry.macroHeight) - firstMacroHeight;
    // Keep the island mass legible without letting the schematic backdrop
    // compete with the authored near terrain or crowd the top of the frame.
    const horizonShoulder = THREE.MathUtils.smoothstep(t, 0.18, 1) * 2.1;

    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      const side = Math.abs(u - 0.5) * 2;
      const alongDistance = (u - 0.5) * width;
      const [x, z] = worldPoint(origin, along, outward, alongDistance, outsideDistance);
      const sourceU = THREE.MathUtils.clamp(alongDistance / axisLen + 0.5, 0, 1);
      const overlap = projectApronPreviewPoint(
        regionId,
        config,
        vista.toRegionId,
        targetConfig,
        vista,
        transition,
        sourceU,
        nearDistance,
      );
      if (!overlap) return null;

      const broad = terrainSurfaceNoise(
        x * 0.018 + (vista.seed || 0) * 1.7,
        z * 0.018 - (vista.seed || 0) * 1.3,
      );
      const middle = terrainSurfaceNoise(
        x * 0.048 - (vista.seed || 0) * 0.8,
        z * 0.048 + (vista.seed || 0) * 0.6,
      );
      const nearRidge = Math.exp(-Math.pow((outsideDistance - 112) / 31, 2))
        * (1.45 + Math.max(-0.5, broad) * 1.6);
      const farRidge = Math.exp(-Math.pow((outsideDistance - 176) / 48, 2))
        * (1.9 + Math.max(-0.45, middle) * 2.0);
      const sideEnvelope = 1 - THREE.MathUtils.smoothstep(side, 0.62, 1);
      const sideSink = THREE.MathUtils.smoothstep(side, 0.76, 1)
        * THREE.MathUtils.smoothstep(t, 0.12, 0.68)
        * 2.8;
      let summitLift = 0;
      if (summit) {
        const alongDelta = (alongDistance - summit.along) / 50;
        const distanceDelta = (outsideDistance - summit.distance) / 60;
        summitLift = Math.exp(-(alongDelta * alongDelta + distanceDelta * distanceDelta) * 0.5) * 7.5;
      }
      const relief = (broad * 1.6 + middle * 0.8) * THREE.MathUtils.smoothstep(t, 0.08, 0.7);
      const distantRelief = regionalRise * 0.56
        + horizonShoulder
        + nearRidge
        + farRidge
        + summitLift
        + relief;
      const targetY = overlap.y + distantRelief * sideEnvelope - sideSink;
      const rawY = THREE.MathUtils.lerp(overlap.y - 0.08, targetY, THREE.MathUtils.smoothstep(t, 0.02, 0.3));
      // A distant backdrop should read as one receding mass. Descending rows
      // can expose the sky/water pass between a nearer and farther ridge at a
      // grazing camera angle, producing the false blue or white strips seen in
      // play. Permit only a negligible falloff as distance increases.
      const previousY = previousRowHeights[col];
      const y = previousY == null ? rawY : Math.max(rawY, previousY - 0.025);
      previousRowHeights[col] = y;

      const color = routeColor(route, routeT);
      const shade = THREE.MathUtils.clamp(1 + broad * 0.075 + middle * 0.035 - sideSink * 0.012, 0.84, 1.12);
      color.multiplyScalar(shade);
      color.lerp(ATMOSPHERE, THREE.MathUtils.smoothstep(t, 0.34, 1) * 0.55);
      color.lerp(ATMOSPHERE, (1 - sideEnvelope) * 0.34);

      // Relief sinks and its color approaches the atmospheric palette at the
      // side boundaries, avoiding an exposed ruled triangle while the
      // world-anchored material remains opaque for correct water occlusion.
      const sideFade = THREE.MathUtils.smoothstep(side, 0.56, 1);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      blends.push(1 - sideFade);
    }
  }

  const stride = cols + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  // The ridge is a terrain sheet, not a closed volume. At very low inland
  // viewing angles, valleys in that sheet can otherwise reveal narrow bands
  // of sky or the ocean behind it. Close only the far rim with an atmospheric
  // curtain; the authored apron still owns the near join and side taper.
  const farRowStart = rows * stride;
  const curtainStart = positions.length / 3;
  for (let col = 0; col <= cols; col += 1) {
    const sourceIndex = farRowStart + col;
    const positionIndex = sourceIndex * 3;
    positions.push(
      positions[positionIndex],
      WATER_LEVEL - 6,
      positions[positionIndex + 2],
    );
    const colorIndex = sourceIndex * 3;
    const curtainColor = new THREE.Color(
      colors[colorIndex],
      colors[colorIndex + 1],
      colors[colorIndex + 2],
    ).lerp(ATMOSPHERE, 0.12);
    colors.push(curtainColor.r, curtainColor.g, curtainColor.b);
    blends.push(blends[sourceIndex]);
  }
  for (let col = 0; col < cols; col += 1) {
    const topA = farRowStart + col;
    const topB = topA + 1;
    const bottomA = curtainStart + col;
    const bottomB = bottomA + 1;
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aBorderBlend', new THREE.Float32BufferAttribute(blends, 1));
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();
  geometry.userData.mode = 'distant-landform';
  geometry.userData.route = route.map(entry => entry.regionId);
  return geometry;
}
