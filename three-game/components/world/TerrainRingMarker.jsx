'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createDrapedRingGeometry, projectDrapedGeometry } from '../../world/drapedRingGeometry';

const NO_RAYCAST = () => null;
const PARENT_QUATERNION = new THREE.Quaternion();
const TARGET_COLOR = new THREE.Color();

// Ground ring that follows the terrain under an actor instead of floating as a
// flat disc. Drop-in replacement for a `<ringGeometry>` mesh at an actor's feet.
export function TerrainRingMarker({
  radius = 0.8,
  // Inner edge as a fraction of `radius`, matching ringGeometry's inner/outer.
  innerRadius = 0.88,
  color = '#d9e6ba',
  opacity = 0.42,
  zoneId,
  lift = 0.035,
  segments = 64,
  radialSteps = 1,
  renderOrder = 3,
  visible = true,
}) {
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const projectedAt = useRef({ x: Infinity, z: Infinity, zoneId: null });
  const geometry = useMemo(
    () => createDrapedRingGeometry({ innerRadius, segments, radialSteps }),
    [innerRadius, segments, radialSteps],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.visible) return;
    // Ease between status colours rather than cutting; the orb above does the same.
    if (materialRef.current) {
      TARGET_COLOR.set(color);
      materialRef.current.color.lerp(TARGET_COLOR, 1 - Math.exp(-Math.min(delta, 0.1) * 5));
    }
    // Keep the ring world-aligned: a turning NPC would otherwise sweep its
    // vertices across the slope and force a re-drape every frame.
    mesh.parent.getWorldQuaternion(PARENT_QUATERNION);
    mesh.quaternion.copy(PARENT_QUATERNION).invert();
    mesh.updateWorldMatrix(true, false);
    const world = mesh.matrixWorld.elements;
    const last = projectedAt.current;
    if (last.zoneId === zoneId && Math.hypot(world[12] - last.x, world[14] - last.z) < 0.035) return;
    projectDrapedGeometry(mesh, zoneId, lift);
    last.x = world[12];
    last.z = world[14];
    last.zoneId = zoneId;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      scale={radius}
      renderOrder={renderOrder}
      raycast={NO_RAYCAST}
      frustumCulled={false}
      visible={visible}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}
