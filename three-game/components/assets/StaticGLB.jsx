'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';
import { applyFoliageMotion } from '../scene/ecology/foliageMotion';
import { ContactShadow } from '../scene/ContactShadow';
import { stabilizeFoliageMaterial } from './materialStability';
import { createCameraCullState, shouldRunCameraCull } from '../scene/cameraCull';

const scratchWorldPosition = new THREE.Vector3();

function makeGoatCoatTexture(base = '#c8b99b', patch = '#5a4735', seed = 1) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const noise = Math.sin(seed * 12.9898) * 43758.5453;
  const offset = noise - Math.floor(noise);
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = patch;
  for (let i = 0; i < 5; i += 1) {
    const x = ((offset * 97 + i * 31) % 128);
    const y = ((offset * 53 + i * 23) % 128);
    const rx = 14 + ((i * 7 + seed) % 18);
    const ry = 10 + ((i * 5 + seed) % 16);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, offset * Math.PI + i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < 128; y += 4) {
    ctx.fillRect(0, y, 128, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.2);
  return texture;
}

function prepareScene(scene, options = {}) {
  const tint = options.tint ? new THREE.Color(options.tint) : null;
  const proceduralMap = options.textureStyle === 'goatCoat'
    ? makeGoatCoatTexture(options.tint || '#c8b99b', options.patchTint || '#5a4735', options.textureSeed || 1)
    : null;
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = options.frustumCulled !== false;
    object.castShadow = Boolean(options.castShadow);
    object.receiveShadow = Boolean(options.receiveShadow);
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map(material => (material ? material.clone() : new THREE.MeshStandardMaterial()));
    materials.forEach(material => {
      if (!material) return;
      material.side = options.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.04);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.76);
      if (proceduralMap) {
        material.map = proceduralMap;
        if (material.color) material.color.set('#ffffff');
      } else if (material.color && tint) {
        if (options.forceTint) material.color.copy(tint);
        else material.color.lerp(tint, options.tintStrength ?? 0.18);
      }
      stabilizeFoliageMaterial(material, { doubleSide: options.doubleSide });
      if (options.motion) applyFoliageMotion(material, object.geometry, options.motion);
      material.needsUpdate = true;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
}

function StaticGLBPrimitive({
  path,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  tint = null,
  tintStrength = 0.18,
  patchTint = null,
  textureSeed = 1,
  textureStyle = null,
  doubleSide = false,
  forceTint = false,
  castShadow = false,
  receiveShadow = false,
  frustumCulled = true,
  motion = null,
  contactShadow = null,
  inspectableType = null,
  sourceId = null,
  sourceLabel = null,
  sourceKind = 'static-glb',
  inspectableOverrides = null,
  groupRef = null,
}) {
  const localGroupRef = useRef(null);
  const group = groupRef || localGroupRef;
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const { scene } = useGLTF(path);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId || `glb:${path}`,
    renderLabel: sourceLabel || sourceId || path.split('/').pop() || path,
    renderKind: sourceKind,
    renderPath: path,
  }), [path, sourceId, sourceKind, sourceLabel]);

  useEffect(() => {
    prepareScene(clone, { tint, tintStrength, patchTint, textureSeed, textureStyle, doubleSide, forceTint, castShadow, receiveShadow, frustumCulled, motion });
  }, [clone, tint, tintStrength, patchTint, textureSeed, textureStyle, doubleSide, forceTint, castShadow, receiveShadow, frustumCulled, motion]);

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={scale}
      userData={renderUserData}
      onClick={inspectableType ? event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable(inspectableType, event.point, {
          sourceId: sourceId || path,
          ...(inspectableOverrides || {}),
        }));
      } : undefined}
    >
      <primitive object={clone} />
      {contactShadow ? (
        // Divide by scale so the requested radius is the world-space footprint
        // regardless of the prop's group scale.
        <ContactShadow radius={contactShadow / (Array.isArray(scale) ? (scale[0] || 1) : (scale || 1))} />
      ) : null}
    </group>
  );
}

function StaticGLBFrameDriver({ group, position, bob, maxVisibleDistanceSq }) {
  const cullStateRef = useRef(createCameraCullState());
  useFrame(({ clock, camera }) => {
    const node = group.current;
    if (!node) return;
    if (maxVisibleDistanceSq !== null) {
      if (shouldRunCameraCull(camera, cullStateRef.current)) {
        node.getWorldPosition(scratchWorldPosition);
        node.visible = scratchWorldPosition.distanceToSquared(camera.position) <= maxVisibleDistanceSq;
      }
      if (!node.visible) return;
    }
    if (bob) node.position.y = position[1] + Math.sin(clock.elapsedTime * 1.7 + position[0]) * bob;
  });
  return null;
}

function StaticGLBActivePrimitive(props) {
  const {
    position,
    bob = 0,
    maxVisibleDistance = null,
    groupRef = null,
  } = props;
  const localGroup = useRef(null);
  const group = groupRef || localGroup;
  const maxVisibleDistanceSq = Number.isFinite(maxVisibleDistance) && maxVisibleDistance > 0
    ? maxVisibleDistance * maxVisibleDistance
    : null;
  return (
    <>
      <StaticGLBPrimitive {...props} groupRef={group} />
      <StaticGLBFrameDriver
        group={group}
        position={position}
        bob={bob}
        maxVisibleDistanceSq={maxVisibleDistanceSq}
      />
    </>
  );
}

export function StaticGLB(props) {
  const needsFrame = Boolean(props.bob)
    || (Number.isFinite(props.maxVisibleDistance) && props.maxVisibleDistance > 0);
  return (
    <Suspense fallback={null}>
      {needsFrame ? <StaticGLBActivePrimitive {...props} /> : <StaticGLBPrimitive {...props} />}
    </Suspense>
  );
}
