'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  getRegionTerrainConfig,
  terrainColor,
  terrainHeight,
  WATER_LEVEL,
} from '../../world/terrain';
import { isAuthoredRegion } from '../../world/regions';
import { getBorderVistas } from '../../world/vistas';
import { useThreeGameStore } from '../../store';

const EDGE_AXES = {
  north: { along: [1, 0], outward: [0, -1] },
  south: { along: [1, 0], outward: [0, 1] },
  east: { along: [0, 1], outward: [1, 0] },
  west: { along: [0, 1], outward: [-1, 0] },
  northeast: { along: [1, 1], outward: [1, -1] },
  northwest: { along: [1, -1], outward: [-1, -1] },
  southeast: { along: [1, -1], outward: [1, 1] },
  southwest: { along: [1, 1], outward: [-1, 1] },
};

const CARDINAL_EDGES = new Set(['north', 'south', 'east', 'west']);
const OPPOSITE_EDGE = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const ATMOSPHERE = new THREE.Color('#b9d7de');
const SHALLOW_CONTINUATION = new THREE.Color('#5f9fae');
const DEEP_CONTINUATION = new THREE.Color('#1f5f90');
const BORDER_COLLAR_DEPTH = 3.8;
const BORDER_COLLAR_DROP = 0.035;
const BORDER_COLLAR_ROWS = 4;

const BORDER_VISTA_GRAIN_GLSL = /* glsl */`
  varying vec3 vBorderWorldPosition;
  varying vec3 vBorderWorldNormal;

  float bvHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float bvNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(bvHash(i), bvHash(i + vec2(1.0, 0.0)), u.x),
      mix(bvHash(i + vec2(0.0, 1.0)), bvHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float bvFbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += bvNoise(p) * amp;
      p = mat2(1.58, -0.92, 0.92, 1.58) * p + vec2(4.7, -2.9);
      amp *= 0.52;
    }
    return value;
  }
`;

const BORDER_VISTA_GRAIN_APPLY = /* glsl */`
  float bvDist = length(vBorderWorldPosition.xz);
  float bvNear = 1.0 - smoothstep(84.0, 142.0, bvDist);
  float bvCoarse = bvFbm(vBorderWorldPosition.xz * 0.038 + vec2(2.0, -7.0));
  float bvMedium = bvFbm(vBorderWorldPosition.xz * 0.145 + vec2(11.0, 3.0));
  float bvFine = bvNoise(vBorderWorldPosition.xz * 0.92);
  float bvMottle = (bvCoarse - 0.5) * 0.18 + (bvMedium - 0.5) * 0.11 + (bvFine - 0.5) * 0.035;
  float bvSlope = clamp(1.0 - abs(vBorderWorldNormal.y), 0.0, 1.0);
  float bvStreak = smoothstep(0.70, 0.96, bvFbm(vec2(
    vBorderWorldPosition.x * 0.085 + vBorderWorldPosition.z * 0.035,
    vBorderWorldPosition.z * 0.22 - vBorderWorldPosition.x * 0.018
  )));
  float bvVein = abs(sin(vBorderWorldPosition.x * 0.12 + vBorderWorldPosition.z * 0.045 + bvCoarse * 4.4));
  float bvCrack = smoothstep(0.985, 0.999, bvVein) * (1.0 - smoothstep(0.55, 0.86, bvFine));

  vec3 bvWarmDust = vec3(1.055, 1.025, 0.925);
  vec3 bvCoolAsh = vec3(0.90, 0.94, 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bvWarmDust, max(0.0, bvCoarse - 0.52) * 0.22 * bvNear);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bvCoolAsh, max(0.0, 0.48 - bvCoarse) * 0.14 * bvNear);
  diffuseColor.rgb *= clamp(1.0 + bvMottle * bvNear - bvSlope * 0.10 - bvStreak * 0.045 * bvNear - bvCrack * 0.16 * bvNear, 0.72, 1.22);
`;

function normalize2([x, z]) {
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

function edgeOrigin(config, edge) {
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

function axisLength(config, edge) {
  if (edge.length > 5) return Math.min(config.width, config.depth) * 1.05;
  return edge === 'north' || edge === 'south' ? config.width : config.depth;
}

function worldPoint(origin, along, outward, alongDistance, outwardDistance) {
  return [
    origin[0] + along[0] * alongDistance + outward[0] * outwardDistance,
    origin[1] + along[1] * alongDistance + outward[1] * outwardDistance,
  ];
}

function borderDistanceForRow(row, rows, depth) {
  const collarRows = Math.min(BORDER_COLLAR_ROWS, Math.max(1, rows - 2));
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

function clampToRegionEdge(config, x, z) {
  return [
    THREE.MathUtils.clamp(x, -config.width / 2, config.width / 2),
    THREE.MathUtils.clamp(z, -config.depth / 2, config.depth / 2),
  ];
}

function smoothNoise(x, z, seed = 0) {
  return Math.sin(x * 0.071 + seed * 1.7) * 0.55
    + Math.sin(z * 0.083 - seed * 2.1) * 0.45
    + Math.sin((x + z) * 0.034 + seed) * 0.35;
}

function bandAt(vista, distance) {
  return vista.bands?.find(band => distance >= band.from && distance <= band.to)
    || vista.bands?.[vista.bands.length - 1]
    || vista.bands?.[0]
    || null;
}

function profileHeight(vista, x, z, distance, t) {
  const band = bandAt(vista, distance);
  if (!band) return -0.9;
  const bandT = THREE.MathUtils.clamp((distance - band.from) / Math.max(0.001, band.to - band.from), 0, 1);
  const base = THREE.MathUtils.lerp(band.nearY, band.farY, bandT);
  const relief = smoothNoise(x, z, vista.seed || 0) * (0.18 + t * 0.42);
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
  if (!['north', 'south', 'east', 'west'].includes(edge)) return 0;
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

function edgeLandStrength(regionId, config, edge, u) {
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

function createBorderVistaMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    fog: true,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBorderWorldPosition;
        varying vec3 vBorderWorldNormal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vBorderWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBorderWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${BORDER_VISTA_GRAIN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${BORDER_VISTA_GRAIN_APPLY}`,
      );
  };
  material.customProgramCacheKey = () => 'border-vista-grain-v1';
  material.needsUpdate = true;
  return material;
}

function makeNeighborPreviewGeometry(regionId, config, targetRegionId, targetConfig, vista) {
  if (!CARDINAL_EDGES.has(vista.edge)
    || !targetRegionId
    || !targetConfig
    || !isAuthoredRegion(targetRegionId)
    || vista.render === false) return null;
  const axes = EDGE_AXES[vista.edge];
  const targetEdge = OPPOSITE_EDGE[vista.edge];
  if (!axes || !targetEdge) return null;

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
  const positions = [];
  const colors = [];
  const landStrengths = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const {
      signedDistance,
      outsideDistance,
      outsideT,
      collarBlend,
    } = borderDistanceForRow(row, rows, previewDepth);
    const targetDistance = outsideT * targetSampleDepth;
    const seamBlend = THREE.MathUtils.smoothstep(outsideDistance, 0.0, 12.0);
    const toneBlend = THREE.MathUtils.smoothstep(outsideDistance, 6.0, 34.0);
    const seamHold = 1 - seamBlend;
    const farHaze = THREE.MathUtils.smoothstep(outsideT, 0.58, 1.0);
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
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
      const targetLand = THREE.MathUtils.smoothstep(targetY, WATER_LEVEL - 0.2, WATER_LEVEL + 0.18);
      const inlandGate = Math.max(currentLand, THREE.MathUtils.smoothstep(outsideT, 0.16, 0.36));
      const seamLand = currentLand * (1 - THREE.MathUtils.smoothstep(outsideDistance, 0.6, 4.5));
      const landStrength = Math.max(seamLand, targetLand * inlandGate);
      const seamOffset = edgeY - targetEdgeY;
      const previewY = targetY + seamOffset * seamHold + smoothNoise(x, z, (vista.seed || 0) + 173) * 0.08 * seamBlend;
      const y = THREE.MathUtils.lerp(currentY - BORDER_COLLAR_DROP, previewY, collarBlend);

      const currentColor = terrainColor(currentX, currentZ, currentY, regionId);
      const targetColor = terrainColor(targetX, targetZ, targetY, targetRegionId);
      const color = currentColor.lerp(targetColor, toneBlend);
      if (farHaze > 0) color.lerp(ATMOSPHERE, farHaze * 0.52);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      landStrengths.push(landStrength);
    }
  }

  const stride = cols + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      if (triangleIsLand(a, b, c, landStrengths)) indices.push(a, b, c);
      if (triangleIsLand(c, b, d, landStrengths)) indices.push(c, b, d);
    }
  }

  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();
  geometry.userData.mode = 'neighbor-preview';
  return geometry;
}

function makeApronGeometry(regionId, config, vista) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes || vista.render === false) return null;
  // Fallback aprons are for mostly dry/generic transitions only. Mixed coastal
  // routes use makeNeighborPreviewGeometry so the mesh never has to impersonate
  // water, which caused the off-map triangular sheets.
  if (!CARDINAL_EDGES.has(vista.edge) || edgeDryRatio(regionId, config, vista.edge) < 0.84) return null;

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
      const landContinuationY = Math.max(rawTargetY, edgeY - t * 0.72 + smoothNoise(x, z, (vista.seed || 0) + 91) * 0.08);
      const waterContinuationY = WATER_LEVEL - 0.28 - t * 0.42 + smoothNoise(x, z, (vista.seed || 0) + 37) * 0.045;
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
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

function seededUnit(seed, index, salt = 0) {
  const n = Math.sin((seed + index * 19.19 + salt * 7.7) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function markerItems(config, vista, marker) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes) return [];
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * (vista.apronWidthScale || 1.75) * 0.72;
  const [near, far] = marker.at;
  return Array.from({ length: marker.count }, (_, index) => {
    const u = seededUnit(marker.seed, index, 1) - 0.5;
    const distance = near + seededUnit(marker.seed, index, 2) * (far - near);
    const [x, z] = worldPoint(origin, along, outward, u * width, distance);
    const y = profileHeight(vista, x, z, distance, distance / (vista.apronDepth || 86));
    const scale = marker.scale[0] + seededUnit(marker.seed, index, 3) * (marker.scale[1] - marker.scale[0]);
    return {
      id: `${marker.kind}-${index}`,
      position: [x, y + (marker.kind === 'rock' ? 0.06 : 0.28), z],
      scale,
      yaw: seededUnit(marker.seed, index, 5) * Math.PI * 2,
    };
  });
}

function VistaMarkers({ config, vista, marker }) {
  const items = useMemo(() => markerItems(config, vista, marker), [config, vista, marker]);
  const geometry = useMemo(() => {
    const result = marker.kind === 'rock'
      ? new THREE.DodecahedronGeometry(1, 0)
      : new THREE.ConeGeometry(0.5, 1.2, 5);
    result.clearGroups();
    return result;
  }, [marker.kind]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: marker.color,
    roughness: 0.96,
    metalness: 0,
    fog: true,
  }), [marker.color]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  if (!items.length) return null;
  return (
    <group userData={{
      renderSource: `border-vista:${vista.id}:${marker.kind}`,
      renderLabel: `${vista.toRegionId || vista.id} ${marker.kind} markers`,
      renderKind: 'border-vista-marker',
      renderPath: null,
    }}>
      {items.map(item => (
        <mesh
          key={item.id}
          position={item.position}
          rotation={[0, item.yaw, 0]}
          scale={[item.scale, item.scale * (marker.kind === 'rock' ? 0.42 : 0.82), item.scale]}
          material={material}
          geometry={geometry}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}

function BorderVista({ regionId, config, vista }) {
  const targetConfig = useMemo(() => (
    vista.toRegionId ? getRegionTerrainConfig(vista.toRegionId) : null
  ), [vista.toRegionId]);
  const geometry = useMemo(() => (
    makeNeighborPreviewGeometry(regionId, config, vista.toRegionId, targetConfig, vista)
      || makeApronGeometry(regionId, config, vista)
  ), [regionId, config, targetConfig, vista]);
  const material = useMemo(() => createBorderVistaMaterial(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  const isNeighborPreview = geometry.userData.mode === 'neighbor-preview';
  return (
    <group name={`border-apron-${vista.toRegionId}`} userData={{
      renderSource: `border-vista:${vista.id}`,
      renderLabel: `${vista.toRegionId || vista.id} border vista`,
      renderKind: 'border-vista',
      renderPath: null,
    }}>
      <mesh geometry={geometry} material={material} receiveShadow={false} castShadow={false} />
      {!isNeighborPreview && vista.markers?.map((marker, index) => (
        <VistaMarkers key={`marker-${index}`} config={config} vista={vista} marker={marker} />
      ))}
    </group>
  );
}

export function BorderVistas() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { config, vistas } = useMemo(() => ({
    config: getRegionTerrainConfig(currentZoneId),
    vistas: getBorderVistas(currentZoneId),
  }), [currentZoneId]);

  if (!vistas.length) return null;
  return (
    <group name="border-terrain-aprons" userData={{
      renderSource: `border-vistas:${currentZoneId}`,
      renderLabel: `${currentZoneId} border vistas`,
      renderKind: 'border-vistas',
      renderPath: null,
    }}>
      {vistas.map(vista => (
        <BorderVista key={vista.id} regionId={currentZoneId} config={config} vista={vista} />
      ))}
    </group>
  );
}
