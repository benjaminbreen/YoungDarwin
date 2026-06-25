'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyFoliageMotion } from './foliageMotion';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { stabilizeFoliageMaterial, toMattePhong } from '../../assets/materialStability';
import { createCameraCullState, shouldRunCameraCull } from '../cameraCull';

const dummy = new THREE.Object3D();

// Leaves carry the alpha-cutout overdraw, so cull them at a fraction of the
// trunk draw distance: far trees keep their silhouette but shed the expensive
// foliage (the gap is covered by aerial haze). Tunable.
const LEAF_LOD_FACTOR = 0.75;

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
    minX = Math.min(minX, item.x - scale);
    maxX = Math.max(maxX, item.x + scale);
    minY = Math.min(minY, (item.y || 0) - scale);
    maxY = Math.max(maxY, (item.y || 0) + scale);
    minZ = Math.min(minZ, item.z - scale);
    maxZ = Math.max(maxZ, item.z + scale);
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

function applyTreeOptions(tree, variant, index) {
  const usingPreset = Boolean(variant.basePreset);
  if (usingPreset && typeof tree.loadPreset === 'function') tree.loadPreset(variant.basePreset);
  const options = tree.options;
  const set = (target, key, value, fallback) => {
    if (value !== undefined) target[key] = value;
    else if (!usingPreset && fallback !== undefined) target[key] = fallback;
  };
  set(options, 'seed', variant.seed, 9000 + index * 97);
  set(options, 'type', variant.type, 'deciduous');
  set(options.bark, 'type', variant.barkType, 'oak');
  set(options.bark, 'tint', variant.barkTint, 0x7d6a4d);
  set(options.bark, 'flatShading', variant.flatShading, true);
  set(options.bark, 'textured', variant.textured, false);
  set(options.branch, 'levels', variant.levels, 2);
  set(options.branch.angle, 1, variant.angle1, 58);
  set(options.branch.angle, 2, variant.angle2, 46);
  set(options.branch.children, 0, variant.children0, 5);
  set(options.branch.children, 1, variant.children1, 3);
  set(options.branch.force.direction, 'x', variant.forceX, 0.18);
  set(options.branch.force.direction, 'y', variant.forceY, 0.7);
  set(options.branch.force.direction, 'z', variant.forceZ, 0.06);
  set(options.branch.force, 'strength', variant.forceStrength, 0.018);
  set(options.branch.gnarliness, 0, variant.gnarliness0, 0.22);
  set(options.branch.gnarliness, 1, variant.gnarliness1, 0.34);
  set(options.branch.gnarliness, 2, variant.gnarliness2, 0.24);
  set(options.branch.length, 0, variant.trunkLength, 4.7);
  set(options.branch.length, 1, variant.branchLength1, 2.6);
  set(options.branch.length, 2, variant.branchLength2, 1.35);
  set(options.branch.radius, 0, variant.trunkRadius, 0.22);
  set(options.branch.radius, 1, variant.branchRadius1, 0.1);
  set(options.branch.radius, 2, variant.branchRadius2, 0.045);
  set(options.branch.sections, 0, variant.sections0, 5);
  set(options.branch.sections, 1, variant.sections1, 4);
  set(options.branch.sections, 2, variant.sections2, 3);
  set(options.branch.segments, 0, variant.segments0, 5);
  set(options.branch.segments, 1, variant.segments1, 4);
  set(options.branch.segments, 2, variant.segments2, 3);
  set(options.branch.start, 1, variant.start1, 0.24);
  set(options.branch.start, 2, variant.start2, 0.18);
  set(options.branch.taper, 0, variant.taper0, 0.78);
  set(options.branch.taper, 1, variant.taper1, 0.7);
  set(options.branch.taper, 2, variant.taper2, 0.7);
  set(options.branch.twist, 0, variant.twist0, 0.12);
  set(options.branch.twist, 1, variant.twist1, 0.18);
  set(options.leaves, 'type', variant.leafType, 'oak');
  set(options.leaves, 'billboard', variant.billboard, 'double');
  set(options.leaves, 'angle', variant.leafAngle, 24);
  set(options.leaves, 'count', variant.leafCount, 42);
  set(options.leaves, 'start', variant.leafStart, 0.12);
  set(options.leaves, 'size', variant.leafSize, 0.46);
  set(options.leaves, 'sizeVariance', variant.leafSizeVariance, 0.45);
  set(options.leaves, 'tint', variant.leafTint, 0x88935e);
  set(options.leaves, 'alphaTest', variant.alphaTest, 0.42);
}

function cloneMaterial(material, geometry, variant, motion, isLeaf, cheap) {
  let cloned = material.clone();
  if (isLeaf) {
    cloned.color = new THREE.Color(variant.leafColor || '#899260');
    cloned.alphaTest = variant.alphaTest ?? 0.42;
    cloned.side = THREE.DoubleSide;
    // Alpha-tested opaque, not transparent: foliage in the transparent pass
    // costs heavy overdraw and sorting against the water.
    cloned.transparent = false;
    cloned.depthWrite = true;
    cloned.alphaToCoverage = true;
    if (cloned.emissive) cloned.emissive = new THREE.Color(variant.leafColor || '#899260').multiplyScalar(0.08);
  } else {
    cloned.map = null;
    cloned.alphaMap = null;
    cloned.color = new THREE.Color(variant.barkColor || '#7b684f');
    cloned.roughness = 0.9;
  }
  if (cheap) cloned = toMattePhong(cloned);
  stabilizeFoliageMaterial(cloned, { doubleSide: isLeaf, forceCutout: isLeaf });
  if (motion) applyFoliageMotion(cloned, geometry, motion);
  return cloned;
}

function buildVariantPrimitives(ezTree, variant, variantIndex, motion, cheap) {
  const tree = new ezTree.Tree();
  applyTreeOptions(tree, variant, variantIndex);
  tree.generate();
  tree.updateMatrixWorld(true);
  const primitives = [];
  tree.traverse(object => {
    if (!object.isMesh || !object.geometry) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const isLeaf = object.name?.toLowerCase().includes('leaves') || object === tree.leavesMesh;
    const material = object.material.clone();
    const finalMaterial = cloneMaterial(material, geometry, variant, motion, isLeaf, cheap);
    primitives.push({ geometry, material: finalMaterial, isLeaf });
  });
  return primitives;
}

// One InstancedMesh for a (variant × primitive), placing its slice of items.
function TreeInstancedMesh({
  geometry, material, items, sink, slopeSink, castShadow, receiveShadow,
  userData, inspectableType, onInspect,
}) {
  const setMesh = useCallback(mesh => {
    if (!mesh) return;
    items.forEach((item, index) => {
      dummy.position.set(
        item.x,
        item.y - sink - (item.grade || 0) * item.scale * slopeSink,
        item.z,
      );
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.computeBoundingBox?.();
  }, [items, sink, slopeSink]);

  return (
    <instancedMesh
      ref={setMesh}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={userData}
      onClick={inspectableType ? event => {
        event.stopPropagation();
        onInspect(items[event.instanceId] || null, event.point);
      } : undefined}
    />
  );
}

function disposePrimitives(variantPrimitives) {
  variantPrimitives.flat().forEach(({ geometry, material }) => {
    geometry.dispose();
    material.dispose();
  });
}

export function InstancedEzTreeLayer({
  items,
  variants,
  sink = 0,
  slopeSink = 0.5,
  castShadow = false,
  receiveShadow = true,
  maxVisibleDistance = null,
  motion = null,
  inspectableType = null,
  sourceId = 'generated-trees',
  sourceLabel = 'Generated trees',
  sourceKind = 'ecology-generated-trees',
}) {
  const groupRef = useRef(null);
  const [ezTree, setEzTree] = useState(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const foliageDrawScale = useThreeGameStore(state => state.foliageDrawScale);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);
  const meshUserData = useMemo(() => ({ noReflect: true, ...renderUserData }), [renderUserData]);

  useEffect(() => {
    let active = true;
    import('@dgreenheck/ez-tree').then(module => {
      if (active) setEzTree(module);
    });
    return () => {
      active = false;
    };
  }, []);

  // Tree generation is CPU-heavy; doing every variant synchronously at mount
  // stalls the region load. Generate one variant per idle slice instead, and
  // only commit once the full set is ready.
  const [variantPrimitives, setVariantPrimitives] = useState([]);
  useEffect(() => {
    if (!ezTree || !items.length || !variants?.length) {
      setVariantPrimitives([]);
      return undefined;
    }
    let cancelled = false;
    const built = [];
    const schedule = typeof requestIdleCallback === 'function'
      ? cb => requestIdleCallback(cb, { timeout: 200 })
      : cb => setTimeout(cb, 0);
    const step = () => {
      if (cancelled) {
        disposePrimitives(built);
        return;
      }
      built.push(buildVariantPrimitives(ezTree, variants[built.length], built.length, motion, cheapMaterials));
      if (built.length < variants.length) schedule(step);
      else setVariantPrimitives(built);
    };
    schedule(step);
    return () => {
      cancelled = true;
    };
  }, [ezTree, items.length, variants, motion, cheapMaterials]);

  useLayoutEffect(() => () => {
    disposePrimitives(variantPrimitives);
  }, [variantPrimitives]);

  const effectiveDistance = Number.isFinite(maxVisibleDistance) && maxVisibleDistance > 0
    ? maxVisibleDistance * foliageDrawScale
    : maxVisibleDistance;
  const cullBounds = useMemo(() => layerCullBounds(items, effectiveDistance), [items, effectiveDistance]);
  const leafCullBounds = useMemo(() => layerCullBounds(
    items,
    Number.isFinite(effectiveDistance) && effectiveDistance > 0 ? effectiveDistance * LEAF_LOD_FACTOR : null,
  ), [items, effectiveDistance]);
  const leafGroupRef = useRef(null);
  const cullStateRef = useRef(createCameraCullState());

  // Partition items across variants once (round-robin) instead of re-filtering
  // for every variant primitive on every render.
  const variantItemBuckets = useMemo(() => {
    const count = variantPrimitives.length;
    if (!count) return [];
    const buckets = Array.from({ length: count }, () => []);
    items.forEach((item, itemIndex) => buckets[itemIndex % count].push(item));
    return buckets;
  }, [items, variantPrimitives.length]);

  const handleInspect = useCallback((item, point) => {
    setInspectedObject(catalogToInspectable(inspectableType, point, { sourceId: item?.id || inspectableType }));
  }, [inspectableType, setInspectedObject]);

  useFrame(({ camera }) => {
    if (!shouldRunCameraCull(camera, cullStateRef.current)) return;

    const group = groupRef.current;
    if (group && cullBounds) {
      group.visible = camera.position.distanceToSquared(cullBounds.center) <= cullBounds.visibleDistanceSq;
    }
    const leafGroup = leafGroupRef.current;
    if (leafGroup && leafCullBounds) {
      leafGroup.visible = camera.position.distanceToSquared(leafCullBounds.center) <= leafCullBounds.visibleDistanceSq;
    }
  });

  if (!variantPrimitives.length) return null;

  const renderMeshes = wantLeaf => variantPrimitives.map((primitives, variantIndex) => {
    const variantItems = variantItemBuckets[variantIndex] || [];
    if (!variantItems.length) return null;
    return primitives.map(({ geometry, material, isLeaf }, primitiveIndex) => (
      isLeaf === wantLeaf ? (
        <TreeInstancedMesh
          key={`${variantIndex}-${primitiveIndex}`}
          geometry={geometry}
          material={material}
          items={variantItems}
          sink={sink}
          slopeSink={slopeSink}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          userData={meshUserData}
          inspectableType={inspectableType}
          onInspect={handleInspect}
        />
      ) : null
    ));
  });

  return (
    <group ref={groupRef} userData={renderUserData}>
      {renderMeshes(false)}
      <group ref={leafGroupRef}>
        {renderMeshes(true)}
      </group>
    </group>
  );
}
