'use client';

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from '../../../world/terrain';

function makeIrregularCaveMouthGeometry(width = 8.2, height = 3.7, seed = 0) {
  const half = width * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(-half * 0.98, height * 0.34);
  shape.lineTo(-half * 0.82, height * (0.66 + Math.sin(seed + 0.7) * 0.025));
  shape.lineTo(-half * 0.5, height * 0.9);
  shape.lineTo(-half * 0.12, height * 0.98);
  shape.lineTo(half * 0.2, height * (0.94 + Math.sin(seed + 1.8) * 0.02));
  shape.lineTo(half * 0.58, height * 0.82);
  shape.lineTo(half * 0.86, height * 0.58);
  shape.lineTo(half, height * 0.27);
  shape.lineTo(half, 0);
  shape.lineTo(-half, 0);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.computeVertexNormals();
  return geometry;
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
  const mouthGeometry = useMemo(() => makeIrregularCaveMouthGeometry(8.25, 3.75, 2.4), []);
  const innerMouthGeometry = useMemo(() => makeIrregularCaveMouthGeometry(6.7, 3.12, 5.7), []);
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
  useLayoutEffect(() => () => {
    mouthGeometry.dispose();
    innerMouthGeometry.dispose();
    shadowGeometry.dispose();
    mouthMaterial.dispose();
    innerMouthMaterial.dispose();
    thresholdMaterial.dispose();
  }, [innerMouthGeometry, innerMouthMaterial, mouthGeometry, mouthMaterial, shadowGeometry, thresholdMaterial]);

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
        position={[feature.x, baseY - 0.08, feature.z - 2.82]}
        castShadow={false}
        receiveShadow={false}
        userData={{ renderSource: `${sourceId}:mouth`, renderLabel: 'cave dark mouth', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={innerMouthGeometry}
        material={innerMouthMaterial}
        position={[feature.x + 0.12, baseY + 0.06, feature.z - 2.96]}
        renderOrder={1}
        userData={{ renderSource: `${sourceId}:inner-mouth`, renderLabel: 'cave inner darkness', renderKind: 'cave-entrance' }}
      />
      <CampAsh feature={feature} zoneId={zoneId} />
    </group>
  );
}
