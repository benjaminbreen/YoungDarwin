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

// Where a lava tube's roof has fallen in: a ragged hole in the grass with
// roots over the lip, a stake driven at the trail side and a knotted rope
// going down into the dark. The pit itself is cut by the terrain; this is
// the darkness at its foot and the means of getting down.
function TubeSinkhole({ feature, zoneId }) {
  const sourceId = `ecology:${zoneId}:${feature.id}`;
  const rimY = terrainHeight(feature.promptX, feature.promptZ, zoneId);
  const floorY = terrainHeight(feature.x, feature.z, zoneId);
  const assets = useMemo(() => {
    const dark = new THREE.MeshBasicMaterial({ color: '#030302' });
    const root = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.95, metalness: 0 });
    const rope = new THREE.MeshStandardMaterial({ color: '#8a7350', roughness: 0.9, metalness: 0 });
    const stake = new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.92, metalness: 0 });
    const disc = new THREE.CircleGeometry(feature.r * 0.9, 24);
    const rootGeometry = new THREE.CylinderGeometry(0.025, 0.05, 1, 5);
    const stakeGeometry = new THREE.CylinderGeometry(0.05, 0.065, 0.9, 6);
    const ropeGeometry = new THREE.CylinderGeometry(0.022, 0.022, 1, 5);
    const knotGeometry = new THREE.SphereGeometry(0.045, 6, 4);
    return { dark, root, rope, stake, disc, rootGeometry, stakeGeometry, ropeGeometry, knotGeometry };
  }, [feature.r]);
  useLayoutEffect(() => () => {
    Object.values(assets).forEach(asset => asset.dispose());
  }, [assets]);

  // The rope is staked on the trail side and drops down that wall.
  const towardPrompt = Math.atan2(feature.promptZ - feature.z, feature.promptX - feature.x);
  const stakeX = feature.x + Math.cos(towardPrompt) * (feature.r + 0.55);
  const stakeZ = feature.z + Math.sin(towardPrompt) * (feature.r + 0.55);
  const stakeY = terrainHeight(stakeX, stakeZ, zoneId);
  const lipX = feature.x + Math.cos(towardPrompt) * (feature.r * 0.86);
  const lipZ = feature.z + Math.sin(towardPrompt) * (feature.r * 0.86);
  const footX = feature.x + Math.cos(towardPrompt) * (feature.r * 0.62);
  const footZ = feature.z + Math.sin(towardPrompt) * (feature.r * 0.62);
  const ropeTop = new THREE.Vector3(stakeX, stakeY + 0.32, stakeZ);
  const ropeLip = new THREE.Vector3(lipX, rimY + 0.06, lipZ);
  const ropeFoot = new THREE.Vector3(footX, floorY + 0.15, footZ);
  const segments = [[ropeTop, ropeLip], [ropeLip, ropeFoot]].map(([from, to]) => {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return { mid, length, quaternion };
  });
  const knots = [0.2, 0.38, 0.56, 0.74].map(t => ropeLip.clone().lerp(ropeFoot, t));

  // Roots that have found the hole and hang into it.
  const roots = [0.4, 1.3, 2.2, 3.4, 4.3, 5.5].map((angle, index) => {
    const length = 1.2 + ((index * 37) % 10) * 0.16;
    const x = feature.x + Math.cos(angle) * feature.r * 0.97;
    const z = feature.z + Math.sin(angle) * feature.r * 0.97;
    // Hung from the lip, read just outside the ragged edge.
    const lipY = terrainHeight(feature.x + Math.cos(angle) * feature.r * 1.2, feature.z + Math.sin(angle) * feature.r * 1.2, zoneId);
    const y = lipY - length * 0.5 + 0.05;
    return { x, y, z, length, tilt: 0.12 + (index % 3) * 0.06, angle };
  });

  return (
    <group>
      <mesh
        geometry={assets.disc}
        material={assets.dark}
        position={[feature.x, floorY + 0.06, feature.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ renderSource: `${sourceId}:darkness`, renderLabel: 'the dark at the foot of the sinkhole', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={assets.stakeGeometry}
        material={assets.stake}
        position={[stakeX, stakeY + 0.22, stakeZ]}
        rotation={[0.12, 0, -0.1]}
        castShadow
        userData={{ renderSource: `${sourceId}:stake`, renderLabel: 'a stake driven at the lip', renderKind: 'cave-entrance' }}
      />
      {segments.map((segment, index) => (
        <mesh
          key={index}
          geometry={assets.ropeGeometry}
          material={assets.rope}
          position={segment.mid}
          quaternion={segment.quaternion}
          scale={[1, segment.length, 1]}
          castShadow
          userData={{ renderSource: `${sourceId}:rope-${index}`, renderLabel: 'a knotted rope going down', renderKind: 'cave-entrance' }}
        />
      ))}
      {knots.map((knot, index) => (
        <mesh key={index} geometry={assets.knotGeometry} material={assets.rope} position={knot} />
      ))}
      {roots.map((root, index) => (
        <mesh
          key={index}
          geometry={assets.rootGeometry}
          material={assets.root}
          position={[root.x, root.y, root.z]}
          rotation={[Math.sin(root.angle) * root.tilt, 0, -Math.cos(root.angle) * root.tilt]}
          scale={[1, root.length, 1]}
          castShadow
          userData={{ renderSource: `${sourceId}:root-${index}`, renderLabel: 'roots hanging into the sinkhole', renderKind: 'cave-entrance' }}
        />
      ))}
    </group>
  );
}

// A mouth in a cliff. Authored facing +z; `yaw` turns it about its centre.
// Rocky Clearing's mouth has a cold camp in front of it (`campAsh`).
export function CaveEntrance({ feature, zoneId }) {
  if (feature.kind === 'sinkhole') return <TubeSinkhole feature={feature} zoneId={zoneId} />;
  return <CliffMouth feature={feature} zoneId={zoneId} />;
}

function CliffMouth({ feature, zoneId }) {
  const baseY = terrainHeight(feature.x, feature.z, zoneId);
  const thresholdY = terrainHeight(feature.promptX, feature.promptZ, zoneId);
  const yaw = feature.yaw || 0;
  const mouthWidth = feature.mouthWidth || 6.65;
  const mouthHeight = feature.mouthHeight || 2.72;
  const mouthDepth = feature.mouthDepth ?? 4.08;
  const [thresholdWidth, thresholdDepth] = feature.thresholdSize || [9.6, 10.2];
  const farMouthGeometry = useMemo(() => makeIrregularCaveMouthGeometry(mouthWidth, mouthHeight, 2.4), [mouthHeight, mouthWidth]);
  const thresholdGeometry = useMemo(() => new THREE.PlaneGeometry(thresholdWidth, thresholdDepth, 1, 1), [thresholdDepth, thresholdWidth]);
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
      <group position={[feature.x, 0, feature.z]} rotation={[0, yaw, 0]}>
      <mesh
        geometry={thresholdGeometry}
        material={thresholdMaterial}
        position={[0, thresholdY + 0.038, 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
        userData={{ renderSource: `${sourceId}:threshold-soil`, renderLabel: 'dark cave threshold soil', renderKind: 'cave-entrance' }}
      />
      <mesh
        geometry={farMouthGeometry}
        material={farMouthMaterial}
        position={[0.08, baseY - 0.08, -mouthDepth]}
        renderOrder={1}
        userData={{ renderSource: `${sourceId}:far-darkness`, renderLabel: 'deep cave darkness', renderKind: 'cave-entrance' }}
      />
      </group>
      {feature.campAsh !== false && <CampAsh feature={feature} zoneId={zoneId} />}
    </group>
  );
}
