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

function rockHeight(rock) {
  return rockVisualBounds(rock).height;
}

function rockFootprint(rock) {
  return rockVisualBounds(rock).footprint;
}

function rockCastsRealShadow(rock) {
  return rock.y > -1.25 && rockHeight(rock) > 0.82 && rockFootprint(rock) > 0.58;
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
  texture.needsUpdate = true;
}

function createProceduralRockMaterial() {
  const basalt = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
  configureRockTexture(basalt.albedo, 2.2);
  configureRockTexture(basalt.normal, 3.1);
  configureRockTexture(basalt.roughness, 2.2);
  const material = new THREE.MeshStandardMaterial({
    map: basalt.albedo,
    normalMap: basalt.normal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughnessMap: basalt.roughness,
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.9,
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
      rockTint.set(item.color || '#3c3831').lerp(rockTintLift, 0.34);
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
        setInspectedObject(catalogToInspectable('basalt_block', event.point, { sourceId: item?.id || 'basalt_block' }));
      }}
    />
  );
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
  const buckets = useMemo(() => {
    const byVariant = [0, 1, 2].map(b => rocks.filter((_, i) => i % 3 === b));
    return byVariant.flatMap((items, geometryIndex) => {
      const casters = items.filter(rockCastsRealShadow);
      const contactOnly = items.filter(rock => !rockCastsRealShadow(rock));
      return [
        casters.length ? { items: casters, geometryIndex, castShadow: true } : null,
        contactOnly.length ? { items: contactOnly, geometryIndex, castShadow: false } : null,
      ].filter(Boolean);
    });
  }, [rocks]);
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
  const material = useMemo(() => createProceduralRockMaterial(), []);
  useLayoutEffect(() => () => {
    geometries.forEach(g => g.dispose());
    disposeProceduralRockMaterial(material);
  }, [geometries, material]);
  return (
    <group>
      {buckets.map((bucket, index) => (
        <InstancedRocks
          key={`${bucket.geometryIndex}:${bucket.castShadow ? 'shadow' : 'contact'}:${index}`}
          items={bucket.items}
          geometry={geometries[bucket.geometryIndex]}
          material={material}
          castShadow={bucket.castShadow}
          sourceUserData={renderUserData}
        />
      ))}
      <RockContactShadows rocks={rocks} />
    </group>
  );
}
