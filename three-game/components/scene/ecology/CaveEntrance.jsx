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
  const farMouthGeometry = useMemo(() => makeIrregularCaveMouthGeometry(6.65, 2.72, 2.4), []);
  const thresholdGeometry = useMemo(() => new THREE.PlaneGeometry(9.6, 10.2, 1, 1), []);
  const farMouthMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#010201',
    side: THREE.FrontSide,
  }), []);
  const thresholdMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uThresholdColor: { value: new THREE.Color('#15130f') },
    },
    vertexShader: /* glsl */`
      varying vec2 vThresholdUv;
      void main() {
        vThresholdUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uThresholdColor;
      varying vec2 vThresholdUv;
      void main() {
        vec2 centeredUv = (vThresholdUv - 0.5) * 2.0;
        float radialDistance = length(centeredUv);
        float irregularEdge = sin(centeredUv.x * 7.0 + centeredUv.y * 5.0) * 0.035;
        float thresholdAlpha = (1.0 - smoothstep(0.54 + irregularEdge, 1.0 + irregularEdge, radialDistance)) * 0.72;
        gl_FragColor = vec4(uThresholdColor, thresholdAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  }), []);
  useLayoutEffect(() => () => {
    farMouthGeometry.dispose();
    thresholdGeometry.dispose();
    farMouthMaterial.dispose();
    thresholdMaterial.dispose();
  }, [farMouthGeometry, farMouthMaterial, thresholdGeometry, thresholdMaterial]);

  const sourceId = `ecology:${zoneId}:${feature.id}`;
  return (
    <group>
      <mesh
        geometry={thresholdGeometry}
        material={thresholdMaterial}
        position={[feature.x, thresholdY + 0.038, feature.z + 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
        userData={{ renderSource: `${sourceId}:threshold-soil`, renderLabel: 'dark cave threshold soil', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={farMouthGeometry}
        material={farMouthMaterial}
        position={[feature.x + 0.08, baseY - 0.08, feature.z - 4.08]}
        renderOrder={1}
        userData={{ renderSource: `${sourceId}:far-darkness`, renderLabel: 'deep cave darkness', renderKind: 'cave-entrance' }}
      />
      <CampAsh feature={feature} zoneId={zoneId} />
    </group>
  );
}
