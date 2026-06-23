'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getPostOfficeBayBasaltBlocks, getPostOfficeBayOpuntiaHazards, makeFloreanaScatter } from '../../world/floreanaCoveLayout';
import { getRuntimeObstacles, obstacleRenderPosition } from '../../world/obstacles';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { StaticGLB } from '../assets/StaticGLB';
import { POST_OFFICE_BAY_TRAIL, terrainHeight } from '../../world/terrain';
import { getModelAsset } from '../../modelAssets';
import { getEcology } from '../../world/ecology';
import { catalogToInspectable } from '../../world/inspectables';
import { EcologyRenderer } from './ecology/EcologyRenderer';
import { InstancedGLBLayer } from './ecology/InstancedGLBLayer';
import { applyFoliageMotion, updateFoliageUniforms } from './ecology/foliageMotion';

const dummy = new THREE.Object3D();
const GRASS_MOTION = { wind: 1.25, bend: 0.45, bendRadius: 1.25 };
const SHRUB_MOTION = { wind: 1.25, bend: 0.28, bendRadius: 1.35 };
const SMALL_SHRUB_MOTION = { wind: 1.55, bend: 0.32, bendRadius: 1.25 };
const FLAT_CACTUS_MOTION = { wind: 0.35, bend: 0.35 };
const OPUNTIA_MOTION = { wind: 0.32, bend: 0.32 };
const COTTON_MOTION = { wind: 1.8, bend: 0.35, bendRadius: 1.45 };
const TREE_MOTION = { wind: 0.85, bend: 0.65 };

function InstancedLayer({
  items,
  geometry,
  material,
  transform,
  animate = false,
  castShadow = false,
  receiveShadow = true,
  inspectableType = null,
  sourceId = 'world-detail',
  sourceLabel = 'World detail',
  sourceKind = 'world-detail',
}) {
  const ref = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const renderUserData = useMemo(() => ({
    renderSource: sourceId,
    renderLabel: sourceLabel || sourceId,
    renderKind: sourceKind,
    renderPath: null,
  }), [sourceId, sourceKind, sourceLabel]);

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
    ref.current.computeBoundingSphere?.();
    ref.current.computeBoundingBox?.();
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

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={renderUserData}
      onClick={inspectableType ? event => {
        event.stopPropagation();
        const item = items[event.instanceId] || null;
        setInspectedObject(catalogToInspectable(inspectableType, event.point, { sourceId: item?.id || inspectableType }));
      } : undefined}
    />
  );
}

function FoliageMotionDriver() {
  useFrame(({ clock }, delta) => {
    const pose = getRuntimePlayerPose();
    updateFoliageUniforms(clock.elapsedTime, pose?.position, delta);
  });
  return null;
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
      {obstacles.filter(obstacle => obstacle.path).map(obstacle => (
        <StaticGLB
          key={obstacle.id}
          path={obstacle.path}
          position={obstacleRenderPosition(obstacle)}
          rotation={[0, obstacle.yaw, 0]}
          scale={obstacle.scale}
          tint={obstacle.kind === 'tree' ? '#5d5142' : '#536056'}
          tintStrength={obstacle.kind === 'tree' ? 0.08 : 0.18}
          castShadow={obstacle.castShadow === true}
          receiveShadow={obstacle.receiveShadow === true}
          maxVisibleDistance={obstacle.maxVisibleDistance ?? 105}
          sourceId={`obstacle:${currentZoneId}:${obstacle.id}`}
          sourceLabel={obstacle.id}
          sourceKind={`obstacle-${obstacle.kind || 'prop'}`}
          motion={obstacle.kind === 'tree' ? TREE_MOTION : null}
        />
      ))}
    </group>
  );
}

function BasaltBlocks() {
  const items = useMemo(() => getPostOfficeBayBasaltBlocks(), []);
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.centerLift, item.z);
    object.rotation.set(item.tone * 0.25, item.yaw, -0.18 + item.tone * 0.36);
    object.scale.set(item.radiusX, item.radiusY, item.radiusZ);
  }, []);
  return (
    <InstancedLayer
      items={items}
      geometry={geometry}
      material={material}
      transform={transform}
      inspectableType="basalt_block"
      sourceId="post-office-bay:basalt-blocks"
      sourceLabel="Post Office Bay basalt blocks"
      sourceKind="world-detail-rocks"
    />
  );
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
    color: item.tone > 0.55 ? '#a8906a' : '#7d6f55',
  })), []);
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.scale * 0.18, item.z);
    object.rotation.set(item.tone, item.yaw, item.tone * 0.6);
    object.scale.set(item.scale * 1.5, item.scale * 0.52, item.scale);
  }, []);
  return (
    <InstancedLayer
      items={items}
      geometry={geometry}
      material={material}
      transform={transform}
      inspectableType="scree"
      sourceId="post-office-bay:scree"
      sourceLabel="Post Office Bay scree"
      sourceKind="world-detail-rocks"
    />
  );
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
    color: item.tone > 0.5 ? '#8a955a' : '#6d7a4b',
  })), []);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.72, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  }), []);
  const transform = useMemo(() => (object, item) => {
    object.position.set(item.x, item.y + item.scale * 0.34, item.z);
    object.rotation.set(0, item.yaw, item.tone * 0.18);
    object.scale.set(item.scale * 1.15, item.scale * 0.68, item.scale);
  }, []);
  return (
    <InstancedLayer
      items={items}
      geometry={geometry}
      material={material}
      transform={transform}
      inspectableType="dry_scrub"
      sourceId="post-office-bay:dry-scrub"
      sourceLabel="Post Office Bay dry scrub"
      sourceKind="world-detail-flora"
    />
  );
}

function OpuntiaLayer() {
  const items = useMemo(() => getPostOfficeBayOpuntiaHazards().map(item => ({
    ...item,
    y: item.y + 0.02,
    scale: item.renderScale,
  })), []);
  return (
    <InstancedGLBLayer
      path="/assets/models/nature/runtime-big-opuntia.glb"
      items={items}
      tint="#6fa046"
      tintStrength={0.08}
      motion={OPUNTIA_MOTION}
      castShadow={false}
      sourceId="post-office-bay:opuntia"
      sourceLabel="Post Office Bay opuntia"
      sourceKind="world-detail-flora"
      inspectableType="opuntia"
    />
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
  const material = useMemo(() => {
    if (!geometry) return null;
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: '#8e8b49',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.98,
      metalness: 0,
      emissive: '#252711',
      emissiveIntensity: 0.16,
    });
    return applyFoliageMotion(grassMaterial, geometry, GRASS_MOTION);
  }, [geometry]);
  const transform = useMemo(() => (object, item) => {
    const width = item.scale * (0.82 + item.tone * 0.42);
    const height = item.scale * (0.58 + item.tone * 0.24);
    object.position.set(item.x, item.y + 0.012, item.z);
    object.rotation.set(0, item.yaw, 0);
    object.scale.set(width, height, width * (0.85 + item.tone * 0.25));
  }, []);
  if (!asset?.enabled) return null;
  if (!geometry || !material) return null;
  return (
    <InstancedLayer
      items={items}
      geometry={geometry}
      material={material}
      transform={transform}
      castShadow={false}
      inspectableType="dry_grass"
      sourceId="post-office-bay:dry-grass"
      sourceLabel="Post Office Bay dry grass"
      sourceKind="world-detail-flora"
    />
  );
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
  const candelabraCactus = useMemo(() => [
    { id: 'candelabra-cactus-1', x: -24.5, z: 30.8, yaw: -0.25, scale: 3.4, tint: '#728d4d' },
    { id: 'candelabra-cactus-2', x: -4.2, z: 34.5, yaw: 0.62, scale: 3.9, tint: '#6f8848' },
    { id: 'candelabra-cactus-3', x: 18.6, z: 31.2, yaw: -0.9, scale: 3.2, tint: '#7c9655' },
  ].map(item => ({ ...item, y: terrainHeight(item.x, item.z) })), []);
  // One layer per species: tone-based shading rides on per-item tints
  // (instanceColor) instead of splitting each model into multiple layers.
  const shrubItems = useMemo(() => shrubs.map(item => ({
    ...item,
    y: item.y + 0.02,
    tint: item.tone > 0.52 ? '#7b8a48' : '#596d3b',
  })), [shrubs]);
  const smallShrubItems = useMemo(() => smallShrubs.map(item => ({
    ...item,
    y: item.y + 0.02,
    tint: item.tone > 0.55 ? '#8a7a48' : '#4f6134',
  })), [smallShrubs]);
  const flatCactusItems = useMemo(() => flatCactus.map(item => ({ ...item, y: item.y + 0.02 })), [flatCactus]);
  const candelabraCactusItems = useMemo(() => candelabraCactus.map(item => ({ ...item, y: item.y + 0.02 })), [candelabraCactus]);

  return (
    <group>
      <InstancedGLBLayer
        path="/assets/models/nature/runtime-plant-shrub.glb"
        items={shrubItems}
        tintStrength={0.34}
        motion={SHRUB_MOTION}
        castShadow={false}
        sourceId="post-office-bay:plant-shrub"
        sourceLabel="Post Office Bay plant shrub"
        sourceKind="world-detail-flora"
        inspectableType="shrub"
      />
      <InstancedGLBLayer
        path="/assets/models/nature/runtime-small-shrub.glb"
        items={smallShrubItems}
        tintStrength={0.36}
        motion={SMALL_SHRUB_MOTION}
        castShadow={false}
        sourceId="post-office-bay:small-shrub"
        sourceLabel="Post Office Bay small shrub"
        sourceKind="world-detail-flora"
        inspectableType="shrub"
      />
      <InstancedGLBLayer
        path="/assets/models/nature/runtime-flat-cactus.glb"
        items={flatCactusItems}
        tintStrength={0.16}
        motion={FLAT_CACTUS_MOTION}
        castShadow={false}
        sourceId="post-office-bay:flat-cactus"
        sourceLabel="Post Office Bay flat cactus"
        sourceKind="world-detail-flora"
        inspectableType="flat_cactus"
      />
      <InstancedGLBLayer
        path="/assets/models/nature/runtime-candelabra-cactus.glb"
        items={candelabraCactusItems}
        tintStrength={0.12}
        motion={FLAT_CACTUS_MOTION}
        castShadow={false}
        sourceId="post-office-bay:candelabra-cactus"
        sourceLabel="Post Office Bay candelabra cactus"
        sourceKind="world-detail-flora"
        inspectableType="candelabra_cactus"
      />
    </group>
  );
}

function GalapagosCottonLayer() {
  const asset = getModelAsset('galapagoscotton');
  const items = useMemo(() => makeFloreanaScatter('galapagos-cotton', 7, 97, {
    minX: -25,
    maxX: 27,
    minZ: 3,
    maxZ: 30,
    scale: [0.22, 0.42],
  }).filter(item => item.z > 8 || item.x > 8), []);
  const cottonItems = useMemo(() => items.map(item => ({
    ...item,
    y: item.y + (asset?.yOffset || 0.02),
    scale: (asset?.scale || 1) * item.scale,
    tint: item.tone > 0.55 ? '#879153' : '#667442',
  })), [asset?.scale, asset?.yOffset, items]);

  if (!asset?.enabled || !asset.path) return null;
  return (
    <InstancedGLBLayer
      path={asset.path}
      items={cottonItems}
      tintStrength={0.18}
      motion={COTTON_MOTION}
      castShadow={false}
      sourceId="post-office-bay:galapagos-cotton"
      sourceLabel="Post Office Bay Galapagos cotton"
      sourceKind="world-detail-flora"
      inspectableType="galapagos_cotton"
    />
  );
}

function TrailHints() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      colorA: { value: new THREE.Color('#c79a55') },
      colorB: { value: new THREE.Color('#e0c37a') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float center = 1.0 - smoothstep(0.18, 0.50, abs(vUv.y - 0.5));
        float endFade = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
        float breakup = noise(vUv * vec2(28.0, 5.0));
        float alpha = center * endFade * (0.18 + breakup * 0.16);
        vec3 color = mix(colorA, colorB, noise(vUv * vec2(9.0, 2.0)));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  }), []);
  const points = useMemo(() => POST_OFFICE_BAY_TRAIL.slice(0, -1).map(([x, z], index) => {
    const [nextX, nextZ] = POST_OFFICE_BAY_TRAIL[index + 1];
    const dx = nextX - x;
    const dz = nextZ - z;
    const length = Math.hypot(dx, dz);
    return [
      x + dx * 0.5,
      z + dz * 0.5,
        Math.max(4.8, length * 0.9),
        -Math.atan2(dz, dx),
      ];
  }), []);
  return (
    <group>
      {points.map(([x, z, length, yaw], index) => (
        <mesh key={index} position={[x, terrainHeight(x, z) + 0.055, z]} rotation={[-Math.PI / 2, 0, yaw]} scale={[length, 1.65, 1]} material={material}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

// Post Office Bay keeps its original hand-tuned scatter (predates the ecology
// registry; migrating it is tracked work). Every other authored zone renders
// through three-game/world/ecology/.
function PostOfficeBayDetails() {
  return (
    <group>
      <ObstacleProps />
      <FoliageMotionDriver />
      <BasaltBlocks />
      <Scree />
      <DryGrassLayer />
      <DryScrub />
      <OpuntiaLayer />
      <GalapagosCottonLayer />
      <AssetVegetationLayer />
      <TrailHints />
    </group>
  );
}

export function WorldDetails({ settings = {} }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const ecology = getEcology(currentZoneId);
  if (ecology) {
    return (
      <group>
        <ObstacleProps />
        <EcologyRenderer ecology={ecology} settings={settings} />
      </group>
    );
  }
  if (currentZoneId !== 'POST_OFFICE_BAY') return null;
  return <PostOfficeBayDetails />;
}
