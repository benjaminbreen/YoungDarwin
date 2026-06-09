'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { makeFloreanaScatter } from '../../world/floreanaCoveLayout';
import { getRuntimeObstacles, obstacleRenderPosition } from '../../world/obstacles';
import { useThreeGameStore } from '../../store';
import { StaticGLB } from '../assets/StaticGLB';
import { terrainHeight } from '../../world/terrain';
import { getModelAsset } from '../../modelAssets';
import { addRimLight, toonMaterial } from './materials';

const dummy = new THREE.Object3D();

function InstancedLayer({ items, geometry, material, transform, animate = false, castShadow = true, receiveShadow = true }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    items.forEach((item, index) => {
      transform(dummy, item, index);
      dummy.updateMatrix();
      ref.current.setMatrixAt(index, dummy.matrix);
      if (item.color) {
        const shade = new THREE.Color(item.color || '#ffffff');
        ref.current.setColorAt(index, shade);
      }
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items, transform]);

  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    const time = clock.elapsedTime;
    items.forEach((item, index) => {
      transform(dummy, item, index, time);
      dummy.updateMatrix();
      ref.current.setMatrixAt(index, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />;
}

function ObstacleProps() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const pushableObstacleOffsets = useThreeGameStore(state => state.pushableObstacleOffsets);
  const obstacles = useMemo(
    () => getRuntimeObstacles(currentZoneId, pushableObstacleOffsets),
    [currentZoneId, pushableObstacleOffsets],
  );
  return (
    <group>
      {obstacles.map(obstacle => (
        <StaticGLB
          key={obstacle.id}
          path={obstacle.path}
          position={obstacleRenderPosition(obstacle)}
          rotation={[0, obstacle.yaw, 0]}
          scale={obstacle.scale}
          tint={obstacle.kind === 'tree' ? '#5d5142' : '#536056'}
          tintStrength={obstacle.kind === 'tree' ? 0.08 : 0.18}
        />
      ))}
    </group>
  );
}

function BasaltBlocks() {
  const items = useMemo(() => makeFloreanaScatter('basalt', 46, 4, {
    minX: -29,
    maxX: 28,
    minZ: -24,
    maxZ: 14,
    scale: [0.22, 0.72],
  }).map(item => ({
    ...item,
    color: item.tone > 0.58 ? '#252620' : '#38352f',
  })), []);
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const material = useMemo(() => addRimLight(toonMaterial('#ffffff', { vertexColors: true }), { intensity: 0.12 }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.scale * 0.34, item.z);
    object.rotation.set(item.tone * 0.25, item.yaw, -0.18 + item.tone * 0.36);
    object.scale.set(item.scale * 1.25, item.scale * 0.55, item.scale * 0.9);
  }, []);
  return <InstancedLayer items={items} geometry={geometry} material={material} transform={transform} />;
}

function Scree() {
  const items = useMemo(() => makeFloreanaScatter('scree', 64, 8, {
    minX: -28,
    maxX: 28,
    minZ: 6,
    maxZ: 35,
    scale: [0.08, 0.28],
  }).map(item => ({
    ...item,
    color: item.tone > 0.55 ? '#9f855e' : '#665840',
  })), []);
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(1, 0), []);
  const material = useMemo(() => addRimLight(toonMaterial('#ffffff', { vertexColors: true }), { intensity: 0.09 }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.scale * 0.18, item.z);
    object.rotation.set(item.tone, item.yaw, item.tone * 0.6);
    object.scale.set(item.scale * 1.5, item.scale * 0.52, item.scale);
  }, []);
  return <InstancedLayer items={items} geometry={geometry} material={material} transform={transform} />;
}

function DryScrub() {
  const items = useMemo(() => makeFloreanaScatter('scrub', 28, 13, {
    minX: -4,
    maxX: 30,
    minZ: 1,
    maxZ: 31,
    scale: [0.34, 0.85],
  }).map(item => ({
    ...item,
    color: item.tone > 0.5 ? '#6b7d42' : '#4f6437',
  })), []);
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(0.72, 0), []);
  const material = useMemo(() => addRimLight(toonMaterial('#ffffff', { vertexColors: true }), { intensity: 0.13 }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.scale * 0.34, item.z);
    object.rotation.set(0, item.yaw, item.tone * 0.18);
    object.scale.set(item.scale * 1.15, item.scale * 0.68, item.scale);
  }, []);
  return <InstancedLayer items={items} geometry={geometry} material={material} transform={transform} />;
}

function OpuntiaLayer() {
  const items = useMemo(() => makeFloreanaScatter('opuntia', 8, 23, {
    minX: 8,
    maxX: 30,
    minZ: 3,
    maxZ: 30,
    scale: [0.65, 1.15],
  }).map(item => ({
    ...item,
    color: '#6fa046',
  })), []);
  const trunk = useMemo(() => addRimLight(toonMaterial('#5d8f3f'), { intensity: 0.18 }), []);
  return (
    <group>
      {items.map(item => (
        <group key={item.id} position={[item.x, item.y, item.z]} rotation={[0, item.yaw, 0]} scale={item.scale}>
          <mesh castShadow material={trunk} position={[0, 0.68, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 1.35, 7]} />
          </mesh>
          <mesh castShadow material={trunk} position={[0.32, 1.14, 0.02]} rotation={[0, 0, -0.38]}>
            <sphereGeometry args={[0.29, 8, 8]} />
          </mesh>
          <mesh castShadow material={trunk} position={[-0.26, 0.98, 0.04]} rotation={[0, 0, 0.42]}>
            <sphereGeometry args={[0.24, 8, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DryGrassLayer() {
  const asset = getModelAsset('dryGrassPatch');
  const { scene } = useGLTF(asset?.path || '/assets/models/nature/runtime-animated-dry-grass.glb');
  const geometry = useMemo(() => {
    let found = null;
    scene.traverse(object => {
      if (!found && object.isMesh) found = object.geometry;
    });
    return found;
  }, [scene]);
  const items = useMemo(() => makeFloreanaScatter('dry-grass-patch', 240, 67, {
    minX: -28,
    maxX: 28,
    minZ: -12,
    maxZ: 27,
    scale: [0.24, 0.58],
  }).map(item => ({
    ...item,
    color: item.tone > 0.68 ? '#a79750' : item.tone < 0.28 ? '#6f743b' : '#858b44',
  })), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8e8b49',
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.98,
    metalness: 0,
    emissive: '#252711',
    emissiveIntensity: 0.16,
  }), []);
  const transform = useMemo(() => (object, item) => {
    const width = item.scale * (0.82 + item.tone * 0.42);
    const height = item.scale * (0.58 + item.tone * 0.24);
    object.position.set(item.x, item.y + 0.012, item.z);
    object.rotation.set(0, item.yaw, 0);
    object.scale.set(width, height, width * (0.85 + item.tone * 0.25));
  }, []);
  if (!asset?.enabled) return null;
  if (!geometry) return null;
  return <InstancedLayer items={items} geometry={geometry} material={material} transform={transform} castShadow={false} />;
}

function AssetVegetationLayer() {
  const shrubs = useMemo(() => makeFloreanaScatter('asset-shrub', 16, 37, {
    minX: -22,
    maxX: 28,
    minZ: -2,
    maxZ: 29,
    scale: [0.13, 0.28],
  }).filter(item => item.z > 2 || item.x < -8), []);
  const smallShrubs = useMemo(() => makeFloreanaScatter('asset-small-shrub', 18, 41, {
    minX: -28,
    maxX: 24,
    minZ: -16,
    maxZ: 18,
    scale: [0.08, 0.18],
  }).filter(item => item.z > -10 && item.x < 18), []);
  const flatCactus = useMemo(() => [
    { id: 'flat-cactus-1', x: 13.8, z: 12.4, yaw: 0.4, scale: 0.28, tint: '#769f48' },
    { id: 'flat-cactus-2', x: 23.2, z: 17.8, yaw: -0.8, scale: 0.24, tint: '#6f9642' },
    { id: 'flat-cactus-3', x: -18.8, z: 9.2, yaw: 1.45, scale: 0.2, tint: '#819c51' },
    { id: 'flat-cactus-4', x: 6.8, z: 26.5, yaw: -0.25, scale: 0.22, tint: '#6d8e3e' },
  ].map(item => ({ ...item, y: terrainHeight(item.x, item.z) })), []);

  return (
    <group>
      {shrubs.map(item => (
        <StaticGLB
          key={item.id}
          path="/assets/models/nature/runtime-plant-shrub.glb"
          position={[item.x, item.y + 0.02, item.z]}
          rotation={[0, item.yaw, 0]}
          scale={item.scale}
          tint={item.tone > 0.52 ? '#7b8a48' : '#596d3b'}
          tintStrength={0.34}
        />
      ))}
      {smallShrubs.map(item => (
        <StaticGLB
          key={item.id}
          path="/assets/models/nature/runtime-small-shrub.glb"
          position={[item.x, item.y + 0.02, item.z]}
          rotation={[0, item.yaw, 0]}
          scale={item.scale}
          tint={item.tone > 0.55 ? '#8a7a48' : '#4f6134'}
          tintStrength={0.36}
        />
      ))}
      {flatCactus.map(item => (
        <StaticGLB
          key={item.id}
          path="/assets/models/nature/runtime-flat-cactus.glb"
          position={[item.x, item.y + 0.02, item.z]}
          rotation={[0, item.yaw, 0]}
          scale={item.scale}
          tint={item.tint}
          tintStrength={0.16}
        />
      ))}
    </group>
  );
}

function TrailHints() {
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d6be82',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }), []);
  const points = [
    [-3, 8.5, 5.8, 0.2],
    [1.2, 15.2, 5.5, 0.05],
    [6.2, 21.8, 5, -0.16],
    [12.2, 27.2, 4, -0.28],
  ];
  return (
    <group>
      {points.map(([x, z, length, yaw], index) => (
        <mesh key={index} position={[x, terrainHeight(x, z) + 0.045, z]} rotation={[-Math.PI / 2, 0, yaw]} scale={[length, 0.55, 1]} material={material}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

export function WorldDetails() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  if (currentZoneId !== 'POST_OFFICE_BAY') return null;
  return (
    <group>
      <ObstacleProps />
      <BasaltBlocks />
      <Scree />
      <DryGrassLayer />
      <DryScrub />
      <OpuntiaLayer />
      <AssetVegetationLayer />
      <TrailHints />
    </group>
  );
}
