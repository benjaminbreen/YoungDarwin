'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { applyFoliageMotion } from './foliageMotion';

const DEFAULT_PATH = '/assets/models/nature/runtime-animated-dry-grass.glb';
const dummy = new THREE.Object3D();
const color = new THREE.Color();

function firstMeshGeometry(scene) {
  let geometry = null;
  scene.traverse(object => {
    if (!geometry && object.isMesh) geometry = object.geometry;
  });
  return geometry;
}

function cloneWithNeutralVertexColors(geometry) {
  if (!geometry) return null;
  const clone = geometry.clone();
  const count = clone.getAttribute('position')?.count || 0;
  if (!count) return clone;
  const white = new Float32Array(count * 3);
  white.fill(1);
  clone.setAttribute('color', new THREE.BufferAttribute(white, 3));
  return clone;
}

function layerCullBounds(items, maxVisibleDistance) {
  if (!Number.isFinite(maxVisibleDistance) || maxVisibleDistance <= 0 || !items.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  items.forEach(item => {
    const scale = item.scale || 1;
    minX = Math.min(minX, item.x - scale * 2);
    maxX = Math.max(maxX, item.x + scale * 2);
    minY = Math.min(minY, (item.y || 0) - scale);
    maxY = Math.max(maxY, (item.y || 0) + scale * 3);
    minZ = Math.min(minZ, item.z - scale * 2);
    maxZ = Math.max(maxZ, item.z + scale * 2);
  });
  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  );
  const radius = Math.hypot(maxX - center.x, maxY - center.y, maxZ - center.z);
  const visibleDistance = maxVisibleDistance + radius;
  return { center, visibleDistanceSq: visibleDistance * visibleDistance };
}

export function DryGrassPatchField({
  layer,
  castShadow = false,
  receiveShadow = true,
  inspectableType = null,
}) {
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const path = layer.path || DEFAULT_PATH;
  const { scene } = useGLTF(path);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);

  const geometry = useMemo(() => cloneWithNeutralVertexColors(firstMeshGeometry(scene)), [scene]);
  const material = useMemo(() => {
    if (!geometry) return null;
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: layer.materialColor || '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: layer.roughness ?? 0.98,
      metalness: 0,
      emissive: layer.emissive || '#2b2e15',
      emissiveIntensity: layer.emissiveIntensity ?? 0.11,
      dithering: true,
    });
    grassMaterial.forceSinglePass = true;
    return applyFoliageMotion(grassMaterial, geometry, layer.motion || { wind: 0.95, bend: 0.22, bendRadius: 1.12 });
  }, [geometry, layer]);

  useLayoutEffect(() => () => {
    geometry?.dispose();
    material?.dispose();
  }, [geometry, material]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const {
      baseLift = 0.012,
      sink = 0,
      slopeSink = 0.2,
      widthScale = 1,
      heightScale = 1,
      depthScale = 1,
    } = layer;

    layer.items.forEach((item, index) => {
      const tone = item.tone ?? 0.5;
      const scale = item.scale || 1;
      const width = scale * widthScale * (0.82 + tone * 0.42);
      const height = scale * heightScale * (0.58 + tone * 0.24);
      const depth = width * depthScale * (0.85 + tone * 0.25);
      dummy.position.set(
        item.x,
        item.y + baseLift - sink - (item.grade || 0) * scale * slopeSink,
        item.z,
      );
      dummy.rotation.set(0, item.yaw || 0, 0);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.set(item.color || layer.color || '#a99d58');
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [layer]);

  const cullBounds = useMemo(
    () => layerCullBounds(layer.items || [], layer.maxVisibleDistance ?? layer.drawDistance),
    [layer],
  );

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group || !cullBounds) return;
    group.visible = camera.position.distanceToSquared(cullBounds.center) <= cullBounds.visibleDistanceSq;
  });

  if (!geometry || !material || !layer.items?.length) return null;
  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, layer.items.length]}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        frustumCulled
        userData={{ noReflect: true }}
        onClick={inspectableType ? event => {
          event.stopPropagation();
          const item = layer.items[event.instanceId] || null;
          setInspectedObject(catalogToInspectable(inspectableType, event.point, { sourceId: item?.id || inspectableType }));
        } : undefined}
      />
    </group>
  );
}

useGLTF.preload(DEFAULT_PATH);
