'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

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
    object.castShadow = true;
    object.receiveShadow = Boolean(options.receiveShadow ?? true);
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map(material => (material ? material.clone() : new THREE.MeshStandardMaterial()));
    materials.forEach(material => {
      if (!material) return;
      material.side = THREE.FrontSide;
      if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.04);
      if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.76);
      if (proceduralMap) {
        material.map = proceduralMap;
        if (material.color) material.color.set('#ffffff');
      } else if (material.color && tint) {
        material.color.lerp(tint, options.tintStrength ?? 0.18);
      }
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
  bob = 0,
}) {
  const group = useRef(null);
  const { scene } = useGLTF(path);
  const clone = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    prepareScene(clone, { tint, tintStrength, patchTint, textureSeed, textureStyle });
  }, [clone, tint, tintStrength, patchTint, textureSeed, textureStyle]);

  useFrame(({ clock }) => {
    if (!group.current || !bob) return;
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 1.7 + position[0]) * bob;
  });

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <primitive object={clone} />
    </group>
  );
}

export function StaticGLB(props) {
  return (
    <Suspense fallback={null}>
      <StaticGLBPrimitive {...props} />
    </Suspense>
  );
}
