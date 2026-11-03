'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { rockRenderTransform, rockVisualBounds } from '../../../world/proceduralRocks';
import { createTriplanarRockMaterial } from '../../../world/regions/materials/triplanarRockMaterial';
import { useDeferredDisposal } from '../../assets/useDeferredDisposal';
import { ContactShadowField } from '../ContactShadow';

// Instanced craggy rocks. Rock items come from a zone layout module (which
// also feeds the physics obstacle list) — this component is display only.

const dummy = new THREE.Object3D();
const rockTint = new THREE.Color();
const rockTintLift = new THREE.Color('#d8d1c0');
const rockFractureTint = new THREE.Color();
const rockFractureBase = new THREE.Color('#565d61');
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Two basalt finishes, chosen per rock by materialKey:
//  - glittering: fresh glassy black lava. The dark-basalt-gravel set with its
//    roughness map multiplied in (median ~0.34, so mostly glossy) and albedo
//    all but removed: what you see is sky and sun glinting off the fine normal
//    detail across hard flat facets, shimmering as the camera moves. Every
//    rock looked like this until 2026-10-31 partly by accident (the geometry
//    had no vertex colours, so WebGL multiplied the albedo by black); this
//    keeps it on purpose, with a little albedo so it never goes flat black.
//  - muted: weathered stone. A dense crag with creased smooth normals that
//    reads soft and matte. Needs geometryQuality 'refined' (the default);
//    otherwise it falls back to the faceted crag.
const GLITTERING_BASALT = {
  textureKey: 'darkBasaltGravel',
  normalScale: 0.42,
  roughness: 0.9,
  roughnessMode: 'multiply',
  albedoScale: 0.08,
  finish: 'glittering',
};
const MUTED_BASALT = {
  textureKey: 'weatheredHighlandBasalt',
  normalScale: 0.48,
  roughness: 0.94,
  finish: 'muted',
};

const ROCK_MATERIAL_PROFILES = {
  glitteringBasalt: GLITTERING_BASALT,
  mutedBasalt: MUTED_BASALT,
  // Legacy keys: the default stays the glittering look rocks always had.
  darkBasaltGravel: GLITTERING_BASALT,
  weatheredHighlandBasalt: MUTED_BASALT,
  denseFracturedBasalt: {
    textureKey: 'denseFracturedBasalt',
    textureScale: 0.8,
    normalScale: 0.42,
    roughness: 0.9,
    finish: 'muted',
  },
  oxidizedScoriaceousBasalt: {
    textureKey: 'weatheredScoria',
    textureScale: 2 / 3,
    normalScale: 0.85,
    roughness: 0.96,
    finish: 'muted',
  },
};

export function rockFinishIsSmooth(materialKey, refined) {
  return refined && ROCK_MATERIAL_PROFILES[materialKey]?.finish === 'muted';
}

export function rockMaterialKey(rock) {
  return ROCK_MATERIAL_PROFILES[rock.materialKey] ? rock.materialKey : 'darkBasaltGravel';
}

function rockHeight(rock) {
  return rockVisualBounds(rock).height;
}

function rockFootprint(rock) {
  return rockVisualBounds(rock).footprint;
}

// Thresholds sized so boulder-scale rocks cast real shadows (Post Office Bay
// blocks top out around 0.68 visual height) while pebble scatter stays
// contact-shadow only.
function rockCastsRealShadow(rock) {
  return rock.y > -1.25 && rockHeight(rock) > 0.42 && rockFootprint(rock) > 0.45;
}

function rockContactShadow(rock) {
  return {
    id: rock.id,
    x: rock.x,
    y: rock.y,
    z: rock.z,
    yaw: rock.yaw,
    radiusX: Math.max(0.28, (rock.radiusX || 0.4) * 1.08),
    radiusZ: Math.max(0.24, (rock.radiusZ || 0.34) * 1.02),
  };
}

// The rock material reads vertex colours (carved, damaged rocks paint their
// fresh fracture into them), so every base geometry needs a colour attribute.
// Without one WebGL supplies black and the per-instance tint never shows.
function withWhiteVertexColors(geo) {
  const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Fracture cuts flatten everything beyond a plane, leaving a broad, truly flat
// face. 'smooth' (muted) takes two shallow ones; 'chiseled' (glittering) takes
// a ring of deeper ones, so a dense mesh still reads as split stone with hard
// planes instead of either a blob or a low-poly triangle crag.
function rockFracturePlanes(seed, style) {
  if (style !== 'chiseled') {
    return [
      { normal: new THREE.Vector3(Math.cos(seed), 0.24, Math.sin(seed)).normalize(), limit: 0.96 },
      { normal: new THREE.Vector3(-Math.sin(seed), -0.12, Math.cos(seed)).normalize(), limit: 0.99 },
    ];
  }
  const planes = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    // Golden-angle spread round the rock, tilted toward the top: fresh blocks
    // split along steep joints and a few low-angle beds.
    const azimuth = seed * 1.7 + i * 2.39996;
    const lift = -0.25 + ((i * 0.61803 + seed * 0.37) % 1) * 1.05;
    const wobble = Math.sin(seed * 3.3 + i * 1.9);
    planes.push({
      normal: new THREE.Vector3(Math.cos(azimuth), lift, Math.sin(azimuth)).normalize(),
      limit: 0.84 + wobble * 0.06,
    });
  }
  return planes;
}

function trimRockFractureFaces(geometry, seed, style) {
  const planes = rockFracturePlanes(seed, style);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    for (const plane of planes) {
      const excess = point.dot(plane.normal) - plane.limit;
      if (excess > 0) point.addScaledVector(plane.normal, -excess);
    }
    position.setXYZ(i, point.x, point.y, point.z);
  }
}

// style: false (low-poly flat facets), true / 'smooth' (muted), or 'chiseled'.
const CREASE_ANGLE = { smooth: Math.PI / 10, chiseled: Math.PI / 7 };
function finishRockGeometry(geo, seed, style) {
  const key = style === true ? 'smooth' : style;
  if (key) trimRockFractureFaces(geo, seed, key);
  geo.computeVertexNormals();
  return withWhiteVertexColors(key ? toCreasedNormals(geo, CREASE_ANGLE[key]) : geo);
}

export function makeCraggyRockGeometry(seed, detail = 3, smooth = false) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.6 + seed * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + seed * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + n * 0.22 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return finishRockGeometry(geo, seed, smooth);
}

// Boulder-scale rocks get their own denser geometry: the unit-scale crag noise
// above stretches featureless at 2-3m, which is why the big rocks read as
// smooth blobs. Finer facets, horizontal stratification, and raised ridge
// creases keep them craggy at hero size.
export function makeHeroCraggyRockGeometry(seed, detail = 4, smooth = false) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const lobe = Math.sin(v.x * 2.1 + seed) * Math.cos(v.y * 1.8 + seed * 1.7) * Math.sin(v.z * 2.4 + seed * 0.6);
    const shelf = Math.sin(v.y * 5.2 + seed * 2.3 + Math.sin(v.x * 2.6 + seed) * 1.8);
    const ridge = 1 - Math.abs(Math.sin(v.x * 4.6 + v.y * 3.4 + v.z * 3.9 + seed * 1.3));
    const chip = Math.sin(v.x * 11.4 + v.z * 9.2 + v.y * 7.7 + seed * 3.1) * 0.045;
    v.normalize().multiplyScalar(1 + lobe * 0.16 + shelf * 0.07 + ridge * ridge * 0.14 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return finishRockGeometry(geo, seed, smooth);
}

// Geometry pool indices: 0-2 standard crag variants, 3-4 hero variants in the
// glittering finish (chiseled when refined, low-poly faceted otherwise); the
// same five again at +5 in the smooth (muted) finish.
export const HERO_FOOTPRINT = 1.1;
const SMOOTH_GEOMETRY_OFFSET = 5;

function rockGeometryIndex(rock, index, refined) {
  const base = rockFootprint(rock) >= HERO_FOOTPRINT ? 3 + (index % 2) : index % 3;
  return rockFinishIsSmooth(rockMaterialKey(rock), refined) ? base + SMOOTH_GEOMETRY_OFFSET : base;
}

export function createProceduralRockMaterial(materialKey, dust = null, refined = false) {
  const profile = ROCK_MATERIAL_PROFILES[materialKey] || ROCK_MATERIAL_PROFILES.darkBasaltGravel;
  // Refined geometry carries its own creased normals (hard plane edges, soft
  // elsewhere); only the low-poly fallback needs flat shading for its facets.
  return createTriplanarRockMaterial(refined ? { ...profile, flatShading: false } : profile, dust);
}

const disposeGeometry = geometry => geometry.dispose();
const disposeGeometries = geometries => geometries.forEach(disposeGeometry);
const disposeMaterials = materials => Object.values(materials).forEach(material => material.dispose());

// Carves hammer-strike bites out of a rock's craggy base geometry. Bites are
// world-space spheres centered just outside the struck face; vertices inside a
// bite get projected onto its surface (a concave scoop) and tinted with the
// fresh-fracture color.
function carveDamagedRockGeometry(baseGeometry, item, bites) {
  const geo = baseGeometry.clone();
  const position = geo.attributes.position;
  const transform = rockRenderTransform(item);
  const radii = new THREE.Vector3(item.radiusX || 0.4, item.radiusY || 0.32, item.radiusZ || 0.34);
  const meanRadius = (radii.x + radii.y + radii.z) / 3;
  const localBites = bites.map(bite => ({
    center: new THREE.Vector3(
      bite.x - transform.position[0],
      bite.y - transform.position[1],
      bite.z - transform.position[2],
    ).applyAxisAngle(Y_AXIS, -(item.yaw || 0)).divide(radii),
    r: bite.r / meanRadius,
  }));

  rockTint.set(item.color || '#3c3831').lerp(rockTintLift, 0.42);
  rockFractureTint.copy(rockFractureBase).lerp(rockTintLift, 0.3);
  const colors = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const blended = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const originalLength = v.length();
    let fractureWeight = 0;
    for (const bite of localBites) {
      const distance = v.distanceTo(bite.center);
      if (distance >= bite.r) continue;
      if (distance > 0.0001) dir.copy(v).sub(bite.center).divideScalar(distance);
      else dir.copy(v).normalize().negate();
      v.copy(bite.center).addScaledVector(dir, bite.r);
      // Carving only removes material: never push a vertex outside the
      // rock's original silhouette (small rocks vs. large bites).
      if (v.length() > originalLength) v.setLength(originalLength);
      fractureWeight = Math.max(fractureWeight, 1 - distance / bite.r);
    }
    position.setXYZ(i, v.x, v.y, v.z);
    blended.copy(rockTint).lerp(rockFractureTint, Math.min(1, fractureWeight * 1.6));
    colors[i * 3] = blended.r;
    colors[i * 3 + 1] = blended.g;
    colors[i * 3 + 2] = blended.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function DamagedRock({ item, bites, baseGeometry, material, sourceUserData }) {
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const geometry = useMemo(
    () => carveDamagedRockGeometry(baseGeometry, item, bites),
    [baseGeometry, item, bites],
  );
  useDeferredDisposal(geometry, disposeGeometry);
  const transform = rockRenderTransform(item);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
      castShadow={rockCastsRealShadow(item)}
      receiveShadow
      userData={sourceUserData}
      onClick={event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable(item.inspectableType || 'basalt_block', event.point, {
          sourceId: item.id || item.inspectableType || 'basalt_block',
        }));
      }}
    />
  );
}

function InstancedRocks({ items, geometry, material, castShadow, sourceUserData }) {
  const ref = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, index) => {
      const transform = rockRenderTransform(item);
      dummy.position.fromArray(transform.position);
      dummy.rotation.fromArray(transform.rotation);
      dummy.scale.fromArray(transform.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      rockTint.set(item.color || '#3c3831').lerp(rockTintLift, 0.42);
      mesh.setColorAt(index, rockTint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [items, geometry, material]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      userData={sourceUserData}
      onClick={event => {
        event.stopPropagation();
        const item = items[event.instanceId] || null;
        setInspectedObject(catalogToInspectable(item?.inspectableType || 'basalt_block', event.point, {
          sourceId: item?.id || item?.inspectableType || 'basalt_block',
        }));
      }}
    />
  );
}

// Matches hammer-damage records (which live on physics obstacle keys) to the
// visual rock items by position — the obstacle builder copies x/z verbatim
// from the same layout rocks this component renders.
function matchRockDamage(rocks, rockDamage, zoneId) {
  const entries = Object.values(rockDamage || {}).filter(damage => (
    damage.zoneId === zoneId && (damage.broken || damage.bites?.length)
  ));
  const brokenIds = new Set();
  const damagedById = new Map();
  if (!entries.length) return { brokenIds, damagedById };
  for (const rock of rocks) {
    const entry = entries.find(damage => (
      Math.abs((damage.x ?? Infinity) - rock.x) < 0.05
      && Math.abs((damage.z ?? Infinity) - rock.z) < 0.05
    ));
    if (!entry) continue;
    if (entry.broken) brokenIds.add(rock.id);
    else damagedById.set(rock.id, entry);
  }
  return { brokenIds, damagedById };
}

function RockContactShadows({ rocks }) {
  const contactShadows = useMemo(() => (
    rocks
      .filter(rock => rock.y > -1.25 && rockHeight(rock) > 0.24)
      .sort((a, b) => rockFootprint(b) - rockFootprint(a))
      .slice(0, 56)
      .map(rockContactShadow)
  ), [rocks]);
  if (!contactShadows.length) return null;
  return <ContactShadowField shadows={contactShadows} yOffset={0.026} strength={0.62} />;
}

// excludeIds: rocks drawn elsewhere (loose rocks live as Rapier bodies). They
// are skipped like broken rocks so every other rock keeps its variant index.
export function RockField({ rocks, excludeIds = null, dust = null, sourceId = 'ecology-rocks', sourceLabel = 'Ecology rocks', sourceKind = 'ecology-rocks', geometryQuality = 'refined' }) {
  const refined = geometryQuality === 'refined';
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const rockDamage = useThreeGameStore(state => state.rockDamage);
  const { brokenIds, damagedById } = useMemo(() => {
    const matched = matchRockDamage(rocks, rockDamage, currentZoneId);
    if (!excludeIds?.size) return matched;
    return { ...matched, brokenIds: new Set([...matched.brokenIds, ...excludeIds]) };
  }, [rocks, rockDamage, currentZoneId, excludeIds]);
  const visibleRocks = useMemo(
    () => (brokenIds.size ? rocks.filter(rock => !brokenIds.has(rock.id)) : rocks),
    [rocks, brokenIds],
  );
  const buckets = useMemo(() => {
    // Variant assignment keys off the original array index so damage never
    // changes a rock's silhouette. Material and shadow role are also bucketed,
    // preserving instancing across large weathered-basalt and scoria fields.
    const grouped = new Map();
    rocks.forEach((rock, index) => {
      if (brokenIds.has(rock.id) || damagedById.has(rock.id)) return;
      const geometryIndex = rockGeometryIndex(rock, index, refined);
      const materialKey = rockMaterialKey(rock);
      const castShadow = rockCastsRealShadow(rock);
      const key = `${geometryIndex}:${materialKey}:${castShadow ? 'shadow' : 'contact'}`;
      const bucket = grouped.get(key);
      if (bucket) bucket.items.push(rock);
      else grouped.set(key, { items: [rock], geometryIndex, materialKey, castShadow });
    });
    return Array.from(grouped.values());
  }, [rocks, brokenIds, damagedById, refined]);
  const damagedRocks = useMemo(() => (
    damagedById.size
      ? rocks
        .map((rock, index) => ({ rock, variant: rockGeometryIndex(rock, index, refined), damage: damagedById.get(rock.id) }))
        .filter(entry => entry.damage)
      : []
  ), [rocks, damagedById, refined]);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);
  const usedMaterialKeys = useMemo(() => Array.from(new Set(
    rocks.map(rockMaterialKey),
  )).sort(), [rocks]);
  // The dense smooth pool is only built when a muted rock is actually present.
  const needsSmooth = usedMaterialKeys.some(materialKey => rockFinishIsSmooth(materialKey, refined));
  const geometries = useMemo(
    () => [
      makeCraggyRockGeometry(1.7, refined ? 12 : 3, refined && 'chiseled'),
      makeCraggyRockGeometry(4.2, refined ? 12 : 3, refined && 'chiseled'),
      makeCraggyRockGeometry(8.9, refined ? 12 : 3, refined && 'chiseled'),
      makeHeroCraggyRockGeometry(2.9, refined ? 16 : 4, refined && 'chiseled'),
      makeHeroCraggyRockGeometry(6.1, refined ? 16 : 4, refined && 'chiseled'),
      ...(needsSmooth ? [
        makeCraggyRockGeometry(1.7, 6, true),
        makeCraggyRockGeometry(4.2, 6, true),
        makeCraggyRockGeometry(8.9, 6, true),
        makeHeroCraggyRockGeometry(2.9, 6, true),
        makeHeroCraggyRockGeometry(6.1, 6, true),
      ] : []),
    ],
    [needsSmooth, refined],
  );
  const materialKeySignature = `${refined}|${usedMaterialKeys.join('|')}${dust?.color ? `|dust:${dust.color}:${dust.strength ?? ''}` : ''}`;
  const materials = useMemo(() => Object.fromEntries(
    usedMaterialKeys.map(materialKey => [materialKey, createProceduralRockMaterial(materialKey, dust, refined)]),
  // The signature is the stable semantic dependency; the array is recreated
  // only when the ecology source itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [materialKeySignature]);
  useDeferredDisposal(geometries, disposeGeometries);
  useDeferredDisposal(materials, disposeMaterials);
  return (
    <group>
      {buckets.map((bucket, index) => (
        <InstancedRocks
          key={`${bucket.geometryIndex}:${bucket.castShadow ? 'shadow' : 'contact'}:${index}`}
          items={bucket.items}
          geometry={geometries[bucket.geometryIndex]}
          material={materials[bucket.materialKey]}
          castShadow={bucket.castShadow}
          sourceUserData={renderUserData}
        />
      ))}
      {damagedRocks.map(({ rock, variant, damage }) => (
        <DamagedRock
          key={`damaged:${rock.id}`}
          item={rock}
          bites={damage.bites}
          baseGeometry={geometries[variant]}
          material={materials[rockMaterialKey(rock)]}
          sourceUserData={renderUserData}
        />
      ))}
      <RockContactShadows rocks={visibleRocks} />
    </group>
  );
}
