'use client';

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { rockRenderTransform, rockVisualBounds } from '../../../world/proceduralRocks';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../../world/regions/materials/pbrTerrainTextures';
import { ContactShadowField } from '../ContactShadow';

// Instanced craggy rocks. Rock items come from a zone layout module (which
// also feeds the physics obstacle list) — this component is display only.

const dummy = new THREE.Object3D();
const rockTint = new THREE.Color();
const rockTintLift = new THREE.Color('#d8d1c0');
const rockFractureTint = new THREE.Color();
const rockFractureBase = new THREE.Color('#565d61');
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const ROCK_MATERIAL_PROFILES = {
  darkBasaltGravel: {
    textureKey: 'darkBasaltGravel',
    normalScale: 0.42,
    roughness: 0.9,
  },
  weatheredHighlandBasalt: {
    textureKey: 'weatheredHighlandBasalt',
    normalScale: 0.48,
    roughness: 0.94,
  },
  oxidizedScoriaceousBasalt: {
    textureKey: 'oxidizedScoriaceousBasalt',
    normalScale: 0.58,
    roughness: 0.96,
  },
};

function rockMaterialKey(rock) {
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

function makeCraggyRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.6 + seed * 0.6);
    const chip = Math.sin(v.x * 9.2 + v.z * 7.7 + seed * 3.1) * 0.06;
    v.normalize().multiplyScalar(1 + n * 0.22 + chip);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function configureRockTexture(texture, repeat = 2.6) {
  if (!texture) return;
  texture.repeat.set(repeat, repeat);
}

function createProceduralRockMaterial(materialKey) {
  const profile = ROCK_MATERIAL_PROFILES[materialKey] || ROCK_MATERIAL_PROFILES.darkBasaltGravel;
  const basalt = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES[profile.textureKey]);
  configureRockTexture(basalt.albedo, 2.2);
  configureRockTexture(basalt.normal, 2.2);
  configureRockTexture(basalt.roughness, 2.2);
  const material = new THREE.MeshStandardMaterial({
    map: basalt.albedo,
    normalMap: basalt.normal,
    normalScale: new THREE.Vector2(profile.normalScale, profile.normalScale),
    roughnessMap: basalt.roughness,
    vertexColors: true,
    color: '#ffffff',
    roughness: profile.roughness,
    metalness: 0,
    flatShading: true,
  });
  material.userData.pbrTextures = basalt;
  return material;
}

function disposeProceduralRockMaterial(material) {
  disposePbrTerrainSet(material?.userData?.pbrTextures);
  material?.dispose();
}

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
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
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
  }, [items]);
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

export function RockField({ rocks, sourceId = 'ecology-rocks', sourceLabel = 'Ecology rocks', sourceKind = 'ecology-rocks' }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const rockDamage = useThreeGameStore(state => state.rockDamage);
  const { brokenIds, damagedById } = useMemo(
    () => matchRockDamage(rocks, rockDamage, currentZoneId),
    [rocks, rockDamage, currentZoneId],
  );
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
      const geometryIndex = index % 3;
      const materialKey = rockMaterialKey(rock);
      const castShadow = rockCastsRealShadow(rock);
      const key = `${geometryIndex}:${materialKey}:${castShadow ? 'shadow' : 'contact'}`;
      const bucket = grouped.get(key);
      if (bucket) bucket.items.push(rock);
      else grouped.set(key, { items: [rock], geometryIndex, materialKey, castShadow });
    });
    return Array.from(grouped.values());
  }, [rocks, brokenIds, damagedById]);
  const damagedRocks = useMemo(() => (
    damagedById.size
      ? rocks
        .map((rock, index) => ({ rock, variant: index % 3, damage: damagedById.get(rock.id) }))
        .filter(entry => entry.damage)
      : []
  ), [rocks, damagedById]);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);
  const geometries = useMemo(
    () => [makeCraggyRockGeometry(1.7), makeCraggyRockGeometry(4.2), makeCraggyRockGeometry(8.9)],
    [],
  );
  const usedMaterialKeys = useMemo(() => Array.from(new Set(
    rocks.map(rockMaterialKey),
  )).sort(), [rocks]);
  const materialKeySignature = usedMaterialKeys.join('|');
  const materials = useMemo(() => Object.fromEntries(
    usedMaterialKeys.map(materialKey => [materialKey, createProceduralRockMaterial(materialKey)]),
  // The signature is the stable semantic dependency; the array is recreated
  // only when the ecology source itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [materialKeySignature]);
  useLayoutEffect(() => () => {
    geometries.forEach(g => g.dispose());
    Object.values(materials).forEach(disposeProceduralRockMaterial);
  }, [geometries, materials]);
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
