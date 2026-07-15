'use client';

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { terrainHeight } from '../../../world/terrain';
import { obstacleBaseY } from '../../../world/obstacles';
import {
  FACETED_BOULDER_PERIMETER_SEGMENTS,
  FACETED_BOULDER_UPPER_RING_COUNT,
  facetedBoulderRingHeightFraction,
  facetedBoulderRingScale,
} from '../../../world/facetedBoulders';
import { rockSampleKey } from '../../../physics/props/rockSampling';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../../world/regions/materials/pbrTerrainTextures';

const UV_DENSITY = 0.72;
const UP = new THREE.Vector3(0, 1, 0);
const EMPTY_BITES = Object.freeze([]);

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function primaryShape(obstacle) {
  return obstacle.shapes?.find(shape => shape.type === 'convex')
    || obstacle.shapes?.find(shape => shape.type === 'ball')
    || obstacle.shapes?.[0]
    || null;
}

function resampleClosedFootprint(points, count = FACETED_BOULDER_PERIMETER_SEGMENTS) {
  if (points.length >= count) return points;
  const lengths = [];
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const length = points[index].distanceTo(points[(index + 1) % points.length]);
    lengths.push(length);
    perimeter += length;
  }
  if (perimeter < 0.001) return points;

  return Array.from({ length: count }, (_, sampleIndex) => {
    let distance = (sampleIndex / count) * perimeter;
    for (let index = 0; index < points.length; index += 1) {
      if (distance <= lengths[index] || index === points.length - 1) {
        const alpha = THREE.MathUtils.clamp(distance / Math.max(0.0001, lengths[index]), 0, 1);
        return points[index].clone().lerp(points[(index + 1) % points.length], alpha);
      }
      distance -= lengths[index];
    }
    return points[0].clone();
  });
}

function makeFootprint(obstacle, seed) {
  const shape = primaryShape(obstacle);
  const scale = typeof obstacle.scale === 'number' ? obstacle.scale : 1;
  const [offsetX = 0, , offsetZ = 0] = shape?.offset || [0, 0, 0];

  if (shape?.type === 'convex' && shape.points?.length >= 6) {
    const authored = shape.points.map(([x, z]) => new THREE.Vector2(
      (x + offsetX) * scale,
      (z + offsetZ) * scale,
    ));
    return resampleClosedFootprint(authored, FACETED_BOULDER_PERIMETER_SEGMENTS).map((point, index) => {
      // Pull only inward, never beyond the authored collider footprint.
      const inset = 0.965 + seededUnit(seed + index * 19) * 0.035;
      return point.multiplyScalar(inset);
    });
  }

  const radius = shape?.radius
    ? shape.radius * scale
    : Math.max(0.55, obstacle.radius || 0.75);
  const segments = FACETED_BOULDER_PERIMETER_SEGMENTS;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const inset = 0.91 + seededUnit(seed + index * 23) * 0.09;
    return new THREE.Vector2(
      offsetX * scale + Math.cos(angle) * radius * inset,
      offsetZ * scale + Math.sin(angle) * radius * inset,
    );
  });
}

function localToWorldXZ(obstacle, point) {
  const cos = Math.cos(obstacle.yaw || 0);
  const sin = Math.sin(obstacle.yaw || 0);
  return {
    x: obstacle.x + point.x * cos + point.y * sin,
    z: obstacle.z - point.x * sin + point.y * cos,
  };
}

function terrainOffsetAt(obstacle, point, baseY) {
  const world = localToWorldXZ(obstacle, point);
  return terrainHeight(world.x, world.z, obstacle.zoneId) - baseY;
}

function scaledRing(footprint, scale, makeY) {
  return footprint.map((point, index) => {
    const scaled = point.clone().multiplyScalar(scale);
    return new THREE.Vector3(scaled.x, makeY(scaled, index), scaled.y);
  });
}

function irregularRing(footprint, scale, seed, makeY, variation = 0.035) {
  return footprint.map((point, index) => {
    const radial = scale * (1 + (seededUnit(seed + index * 37) - 0.5) * variation * 2);
    const scaled = point.clone().multiplyScalar(radial);
    return new THREE.Vector3(scaled.x, makeY(scaled, index), scaled.y);
  });
}

function projectedUV(vertex, normal) {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ay >= ax && ay >= az) return [vertex.x * UV_DENSITY, vertex.z * UV_DENSITY];
  if (ax >= az) return [vertex.z * UV_DENSITY, vertex.y * UV_DENSITY];
  return [vertex.x * UV_DENSITY, vertex.y * UV_DENSITY];
}

function appendTriangle(buffers, a, b, c, desiredNormal, shadeSeed) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
  let second = b;
  let third = c;
  if (normal.dot(desiredNormal) < 0) {
    second = c;
    third = b;
    normal.negate();
  }

  const light = THREE.MathUtils.clamp(
    0.9 + Math.max(0, normal.y) * 0.055 + seededUnit(shadeSeed) * 0.04,
    0.9,
    0.995,
  );
  const weathering = THREE.MathUtils.clamp(
    0.08 + (1 - Math.max(0, normal.y)) * 0.12 + seededUnit(shadeSeed + 7) * 0.06,
    0.06,
    0.25,
  );
  const faceColor = new THREE.Color('#f1eee7')
    .lerp(new THREE.Color('#aa9a82'), weathering)
    .multiplyScalar(light);

  for (const vertex of [a, second, third]) {
    buffers.positions.push(vertex.x, vertex.y, vertex.z);
    buffers.uvs.push(...projectedUV(vertex, normal));
    buffers.colors.push(faceColor.r, faceColor.g, faceColor.b);
  }
}

function appendRingBand(buffers, lower, upper, seed) {
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    const desired = new THREE.Vector3(
      lower[index].x + lower[next].x + upper[index].x + upper[next].x,
      0,
      lower[index].z + lower[next].z + upper[index].z + upper[next].z,
    ).normalize();
    if (seededUnit(seed + index * 43) > 0.5) {
      appendTriangle(buffers, lower[index], lower[next], upper[index], desired, seed + index * 31);
      appendTriangle(buffers, lower[next], upper[next], upper[index], desired, seed + index * 31 + 11);
    } else {
      appendTriangle(buffers, lower[index], lower[next], upper[next], desired, seed + index * 31);
      appendTriangle(buffers, lower[index], upper[next], upper[index], desired, seed + index * 31 + 11);
    }
  }
}

function worldBiteToLocal(obstacle, bite, baseY) {
  const cos = Math.cos(obstacle.yaw || 0);
  const sin = Math.sin(obstacle.yaw || 0);
  const dx = bite.x - obstacle.x;
  const dz = bite.z - obstacle.z;
  const center = new THREE.Vector3(
    dx * cos - dz * sin,
    bite.y - baseY,
    dx * sin + dz * cos,
  );
  const fallbackX = dx / Math.max(0.001, Math.hypot(dx, dz));
  const fallbackZ = dz / Math.max(0.001, Math.hypot(dx, dz));
  const nx = bite.normal?.x ?? bite.nx ?? fallbackX;
  const ny = bite.normal?.y ?? bite.ny ?? 0;
  const nz = bite.normal?.z ?? bite.nz ?? fallbackZ;
  const normal = new THREE.Vector3(
    nx * cos - nz * sin,
    ny,
    nx * sin + nz * cos,
  ).normalize();
  return { center, normal, radius: Math.max(0.12, bite.r || 0.28) };
}

function carveFracturePlanes(geometry, obstacle, bites, baseY) {
  if (!bites?.length) return;
  const position = geometry.attributes.position;
  const colors = geometry.attributes.color;
  const localBites = bites.slice(-12).map(bite => worldBiteToLocal(obstacle, bite, baseY));
  const vertex = new THREE.Vector3();
  const fromCenter = new THREE.Vector3();
  const planePoint = new THREE.Vector3();
  const fracture = new THREE.Color('#74766a');
  const existing = new THREE.Color();

  // Collision uses the authored broad-phase hull, so an impact can land a few
  // centimetres beyond an irregular rendered face. Snap such cuts back to the
  // closest visible facet before applying the fracture plane.
  for (const bite of localBites) {
    let nearestDistance = Infinity;
    const nearest = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      const distance = vertex.distanceTo(bite.center);
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearest.copy(vertex);
    }
    if (nearestDistance > bite.radius * 0.72) {
      bite.center.copy(nearest).addScaledVector(bite.normal, bite.radius * 0.34);
    }
  }

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    let fractureWeight = 0;
    for (const bite of localBites) {
      const distance = vertex.distanceTo(bite.center);
      if (distance >= bite.radius) continue;
      planePoint.copy(bite.center).addScaledVector(bite.normal, -bite.radius * 0.72);
      const outsidePlane = fromCenter.copy(vertex).sub(planePoint).dot(bite.normal);
      if (outsidePlane <= 0) continue;
      vertex.addScaledVector(bite.normal, -outsidePlane);
      fractureWeight = Math.max(fractureWeight, 1 - distance / bite.radius);
    }
    if (fractureWeight <= 0) continue;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    existing.setRGB(colors.getX(index), colors.getY(index), colors.getZ(index));
    existing.lerp(fracture, THREE.MathUtils.clamp(0.45 + fractureWeight, 0, 1));
    colors.setXYZ(index, existing.r, existing.g, existing.b);
  }
  position.needsUpdate = true;
  colors.needsUpdate = true;
}

function makeFacetedBoulderGeometry(obstacle, bites = []) {
  const seed = hashText(obstacle.id || 'faceted-boulder');
  const footprint = makeFootprint(obstacle, seed);
  const baseY = obstacleBaseY(obstacle);
  const top = Math.max(0.65, obstacle.colliderTop || obstacle.height || 1);
  const groundSink = Math.min(0.14, top * 0.045);
  const toeLift = Math.min(0.12, top * 0.04);

  // The perimeter samples the actual heightfield. This creates an irregular
  // buried skirt instead of the flat, floating underside of the source GLBs.
  const ground = scaledRing(footprint, 1, point => (
    terrainOffsetAt(obstacle, new THREE.Vector2(point.x, point.y), baseY) - groundSink
  ));
  const toe = scaledRing(footprint, 0.99, point => (
    terrainOffsetAt(obstacle, new THREE.Vector2(point.x, point.y), baseY) + toeLift
  ));
  const upperRings = Array.from({ length: FACETED_BOULDER_UPPER_RING_COUNT }, (_, level) => {
    const t = (level + 1) / FACETED_BOULDER_UPPER_RING_COUNT;
    const ringScale = facetedBoulderRingScale(t);
    const heightFraction = facetedBoulderRingHeightFraction(t);
    const verticalNoise = THREE.MathUtils.lerp(0.055, 0.022, t);
    return irregularRing(footprint, ringScale, seed + 700 + level * 97, (point, index) => (
      Math.min(
        top * 0.975,
        top * (heightFraction + (seededUnit(seed + 900 + level * 131 + index * 19) - 0.5) * verticalNoise)
        + terrainOffsetAt(obstacle, new THREE.Vector2(point.x, point.y), baseY) * (1 - t) * 0.62,
      )
    ), 0.042);
  });
  const crown = upperRings[upperRings.length - 1];
  const centroid = footprint.reduce((sum, point) => sum.add(point), new THREE.Vector2())
    .multiplyScalar(1 / footprint.length);
  const summit = new THREE.Vector3(centroid.x * 0.2, top, centroid.y * 0.2);

  const buffers = { positions: [], uvs: [], colors: [] };
  appendRingBand(buffers, ground, toe, seed + 301);
  let previousRing = toe;
  upperRings.forEach((ring, level) => {
    appendRingBand(buffers, previousRing, ring, seed + 351 + level * 53);
    previousRing = ring;
  });
  for (let index = 0; index < crown.length; index += 1) {
    appendTriangle(
      buffers,
      crown[index],
      summit,
      crown[(index + 1) % crown.length],
      UP,
      seed + 601 + index * 37,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  carveFracturePlanes(geometry, obstacle, bites, baseY);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeBoulderMaterial() {
  const textures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.galapagosOlivineBasalt);
  for (const texture of [textures.albedo, textures.normal, textures.roughness]) {
    texture.repeat.set(1, 1);
  }
  const material = new THREE.MeshStandardMaterial({
    map: textures.albedo,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughnessMap: textures.roughness,
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  material.userData.pbrTextures = textures;
  return material;
}

function FacetedBoulder({ obstacle, material, currentZoneId, bites }) {
  const geometry = useMemo(() => makeFacetedBoulderGeometry(obstacle, bites), [bites, obstacle]);
  const position = useMemo(() => [
    obstacle.x,
    obstacleBaseY(obstacle),
    obstacle.z,
  ], [obstacle]);
  const userData = useMemo(() => ({
    renderSource: `obstacle:${currentZoneId}:${obstacle.id}`,
    renderLabel: `${obstacle.id} (weathered olivine basalt)`,
    renderKind: 'obstacle-boulder',
    renderPath: null,
  }), [currentZoneId, obstacle.id]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={[0, obstacle.yaw || 0, 0]}
      castShadow
      receiveShadow
      userData={userData}
    />
  );
}

export function FacetedBoulderField({ obstacles, currentZoneId }) {
  const rockDamage = useThreeGameStore(state => state.rockDamage);
  const material = useMemo(() => makeBoulderMaterial(), []);

  useLayoutEffect(() => () => {
    disposePbrTerrainSet(material.userData.pbrTextures);
    material.dispose();
  }, [material]);

  return obstacles.map(obstacle => (
    <FacetedBoulder
      key={obstacle.id}
      obstacle={obstacle}
      material={material}
      currentZoneId={currentZoneId}
      bites={rockDamage[rockSampleKey(currentZoneId, obstacle.id)]?.bites || EMPTY_BITES}
    />
  ));
}
