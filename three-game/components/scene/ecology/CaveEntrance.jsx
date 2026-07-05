'use client';

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from '../../../world/terrain';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../../world/regions/materials/pbrTerrainTextures';

function configureTexture(texture, repeat = 1.8) {
  if (!texture) return;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
}

function makeCraggyRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const position = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const chip = Math.sin(v.x * 6.1 + seed) * Math.cos(v.y * 4.7 + seed * 1.8) * Math.sin(v.z * 5.6 - seed);
    v.normalize().multiplyScalar(1 + chip * 0.2 + Math.sin(i * 3.17 + seed) * 0.045);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeArchGeometry(width = 8.2, springY = 1.9, topY = 3.85) {
  const half = width * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(-half, springY);
  shape.quadraticCurveTo(0, topY, half, springY);
  shape.lineTo(half, 0);
  shape.lineTo(-half, 0);
  const geometry = new THREE.ShapeGeometry(shape, 32);
  geometry.computeVertexNormals();
  return geometry;
}

function createBasaltMaterial() {
  const basalt = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES.darkBasaltGravel);
  configureTexture(basalt.albedo, 1.8);
  configureTexture(basalt.normal, 2.4);
  configureTexture(basalt.roughness, 1.8);
  const material = new THREE.MeshStandardMaterial({
    map: basalt.albedo,
    normalMap: basalt.normal,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughnessMap: basalt.roughness,
    color: '#6a6253',
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  material.userData.pbrTextures = basalt;
  return material;
}

function disposeBasaltMaterial(material) {
  disposePbrTerrainSet(material?.userData?.pbrTextures);
  material?.dispose();
}

function archStoneLayout(feature) {
  const stones = [];
  const caveX = feature.x;
  const caveZ = feature.z;
  for (let i = 0; i < 5; i += 1) {
    const y = 0.45 + i * 0.58;
    const taper = i / 4;
    stones.push({
      id: `left-${i}`,
      x: caveX - 4.55 - taper * 0.2,
      y,
      z: caveZ - 0.18 + Math.sin(i * 1.7) * 0.18,
      scale: [1.05 - taper * 0.1, 0.72, 0.92],
      rotation: [0.12, 0.2 + i * 0.16, -0.08],
    });
    stones.push({
      id: `right-${i}`,
      x: caveX + 4.55 + taper * 0.18,
      y,
      z: caveZ - 0.1 + Math.cos(i * 1.2) * 0.16,
      scale: [1.0 - taper * 0.08, 0.68, 0.88],
      rotation: [-0.08, -0.25 - i * 0.12, 0.1],
    });
  }
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const angle = Math.PI - t * Math.PI;
    const x = caveX + Math.cos(angle) * 4.15;
    const y = 1.95 + Math.sin(angle) * 1.72;
    const z = caveZ - 0.22 + Math.sin(i * 2.1) * 0.13;
    stones.push({
      id: `arch-${i}`,
      x,
      y,
      z,
      scale: [0.9 + Math.sin(i) * 0.06, 0.66, 0.78],
      rotation: [0.04, -angle + Math.PI * 0.5, (t - 0.5) * 0.35],
    });
  }
  return stones;
}

function CaveStone({ stone, baseY, geometry, material, sourceId }) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[stone.x, baseY + stone.y, stone.z]}
      rotation={stone.rotation}
      scale={stone.scale}
      castShadow
      receiveShadow
      userData={{
        renderSource: `${sourceId}:${stone.id}`,
        renderLabel: `Cave arch basalt ${stone.id}`,
        renderKind: 'cave-entrance-rock',
      }}
    />
  );
}

function CampAsh({ feature, zoneId }) {
  const ashMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#514c42',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }), []);
  const stickMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#19140f',
    roughness: 0.96,
    metalness: 0,
  }), []);
  const ashGeometry = useMemo(() => new THREE.CircleGeometry(0.78, 28), []);
  const stickGeometry = useMemo(() => new THREE.CylinderGeometry(0.035, 0.05, 1.15, 6), []);
  useLayoutEffect(() => () => {
    ashMaterial.dispose();
    stickMaterial.dispose();
    ashGeometry.dispose();
    stickGeometry.dispose();
  }, [ashGeometry, ashMaterial, stickGeometry, stickMaterial]);

  const x = feature.x - 3.0;
  const z = feature.z + 4.85;
  const y = terrainHeight(x, z, zoneId) + 0.036;
  return (
    <group>
      <mesh
        geometry={ashGeometry}
        material={ashMaterial}
        position={[x, y, z]}
        rotation={[-Math.PI / 2, 0, 0.28]}
        receiveShadow
        userData={{ renderSource: 'rocky-clearing:cave-camp-ash', renderLabel: 'recent camp ash', renderKind: 'cave-camp' }}
      />
      {[0.2, 2.35, 4.2].map((yaw, index) => (
        <mesh
          key={yaw}
          geometry={stickGeometry}
          material={stickMaterial}
          position={[x + Math.cos(yaw) * 0.12, y + 0.045, z + Math.sin(yaw) * 0.1]}
          rotation={[Math.PI / 2, 0, yaw + index * 0.18]}
          castShadow
          receiveShadow
          userData={{ renderSource: `rocky-clearing:cave-camp-stick-${index}`, renderLabel: 'charred camp stick', renderKind: 'cave-camp' }}
        />
      ))}
    </group>
  );
}

export function CaveEntrance({ feature, zoneId }) {
  const baseY = terrainHeight(feature.x, feature.z, zoneId);
  const thresholdY = terrainHeight(feature.promptX, feature.promptZ, zoneId);
  const rockGeometry = useMemo(() => makeCraggyRockGeometry(6.4), []);
  const basaltMaterial = useMemo(() => createBasaltMaterial(), []);
  const mouthGeometry = useMemo(() => makeArchGeometry(7.35, 1.52, 3.35), []);
  const innerMouthGeometry = useMemo(() => makeArchGeometry(5.65, 1.18, 2.72), []);
  const shadowGeometry = useMemo(() => new THREE.PlaneGeometry(8.8, 6.2, 1, 1), []);
  const mouthMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#060708',
    emissive: '#020406',
    emissiveIntensity: 0.16,
    roughness: 1,
    metalness: 0,
    side: THREE.FrontSide,
  }), []);
  const innerMouthMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#010101',
    transparent: true,
    opacity: 0.96,
    side: THREE.FrontSide,
  }), []);
  const thresholdMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#090807',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  }), []);
  const stones = useMemo(() => archStoneLayout(feature), [feature]);

  useLayoutEffect(() => () => {
    rockGeometry.dispose();
    mouthGeometry.dispose();
    innerMouthGeometry.dispose();
    shadowGeometry.dispose();
    mouthMaterial.dispose();
    innerMouthMaterial.dispose();
    thresholdMaterial.dispose();
    disposeBasaltMaterial(basaltMaterial);
  }, [basaltMaterial, innerMouthGeometry, innerMouthMaterial, mouthGeometry, mouthMaterial, rockGeometry, shadowGeometry, thresholdMaterial]);

  const sourceId = `ecology:${zoneId}:${feature.id}`;
  return (
    <group>
      <mesh
        geometry={shadowGeometry}
        material={thresholdMaterial}
        position={[feature.x, thresholdY + 0.035, feature.z + 2.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
        userData={{ renderSource: `${sourceId}:threshold-shadow`, renderLabel: 'cave threshold shadow', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={mouthGeometry}
        material={mouthMaterial}
        position={[feature.x, baseY + 0.1, feature.z - 0.55]}
        castShadow={false}
        receiveShadow={false}
        userData={{ renderSource: `${sourceId}:mouth`, renderLabel: 'cave dark mouth', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={innerMouthGeometry}
        material={innerMouthMaterial}
        position={[feature.x, baseY + 0.22, feature.z - 0.72]}
        renderOrder={1}
        userData={{ renderSource: `${sourceId}:inner-mouth`, renderLabel: 'cave inner darkness', renderKind: 'cave-entrance' }}
      />
      {stones.map(stone => (
        <CaveStone
          key={stone.id}
          stone={stone}
          baseY={baseY}
          geometry={rockGeometry}
          material={basaltMaterial}
          sourceId={sourceId}
        />
      ))}
      <pointLight
        position={[feature.x - 1.6, baseY + 1.05, feature.z + 2.7]}
        color="#c58d55"
        intensity={0.36}
        distance={8.5}
        decay={2.2}
      />
      <CampAsh feature={feature} zoneId={zoneId} />
    </group>
  );
}
