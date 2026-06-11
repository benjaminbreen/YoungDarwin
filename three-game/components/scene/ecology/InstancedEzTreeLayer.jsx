'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import * as THREE from 'three';
import { applyFoliageMotion } from './foliageMotion';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';

const dummy = new THREE.Object3D();

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

function cloneMaterial(material, geometry, variant, motion, isLeaf) {
  const cloned = material.clone();
  if (isLeaf) {
    cloned.color = new THREE.Color(variant.leafColor || '#899260');
    cloned.alphaTest = variant.alphaTest ?? 0.42;
    cloned.side = THREE.DoubleSide;
    // Alpha-tested opaque, not transparent: foliage in the transparent pass
    // costs heavy overdraw and sorting against the water.
    cloned.transparent = false;
    cloned.depthWrite = true;
    if (cloned.emissive) cloned.emissive = new THREE.Color(variant.leafColor || '#899260').multiplyScalar(0.08);
  } else {
    cloned.map = null;
    cloned.alphaMap = null;
    cloned.color = new THREE.Color(variant.barkColor || '#7b684f');
    cloned.roughness = 0.9;
  }
  if (motion) applyFoliageMotion(cloned, geometry, motion);
  return cloned;
}

function buildVariantPrimitives(ezTree, variant, variantIndex, motion) {
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
    const finalMaterial = cloneMaterial(material, geometry, variant, motion, isLeaf);
    primitives.push({ geometry, material: finalMaterial });
  });
  return primitives;
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
  castShadow = true,
  receiveShadow = true,
  motion = null,
  inspectableType = null,
}) {
  const [ezTree, setEzTree] = useState(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);

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
      built.push(buildVariantPrimitives(ezTree, variants[built.length], built.length, motion));
      if (built.length < variants.length) schedule(step);
      else setVariantPrimitives(built);
    };
    schedule(step);
    return () => {
      cancelled = true;
    };
  }, [ezTree, items.length, variants, motion]);

  useLayoutEffect(() => () => {
    disposePrimitives(variantPrimitives);
  }, [variantPrimitives]);

  if (!variantPrimitives.length) return null;

  return (
    <group>
      {variantPrimitives.map((primitives, variantIndex) => {
        const variantItems = items.filter((_, itemIndex) => itemIndex % variantPrimitives.length === variantIndex);
        return primitives.map(({ geometry, material }, primitiveIndex) => (
          <instancedMesh
            key={`${variantIndex}-${primitiveIndex}`}
            args={[geometry, material, variantItems.length]}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
            frustumCulled={false}
            userData={{ noReflect: true }}
            onClick={inspectableType ? event => {
              event.stopPropagation();
              const item = variantItems[event.instanceId] || null;
              setInspectedObject(catalogToInspectable(inspectableType, event.point, { sourceId: item?.id || inspectableType }));
            } : undefined}
            ref={mesh => {
              if (!mesh) return;
              variantItems.forEach((item, index) => {
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
            }}
          />
        ));
      })}
    </group>
  );
}
