'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { terrainHeight } from '../../world/terrain';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ModelAsset } from '../assets/ModelAsset';

function ProceduralCrewFigure({ motion = 0 }) {
  const coat = useMemo(() => addRimLight(toonMaterial('#25323a'), { intensity: 0.18 }), []);
  const skin = useMemo(() => toonMaterial('#c89262'), []);
  const hat = useMemo(() => toonMaterial('#5b4630'), []);
  const bag = useMemo(() => toonMaterial('#9a6a36'), []);

  return (
    <group rotation={[0, Math.PI * 0.86 + motion * 0.08, 0]}>
      <mesh castShadow position={[0, 1.48, 0]} material={skin}>
        <sphereGeometry args={[0.23, 16, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.76, 0]} material={hat}>
        <cylinderGeometry args={[0.28, 0.36, 0.12, 18]} />
      </mesh>
      <mesh castShadow position={[0, 0.98, 0]} material={coat}>
        <capsuleGeometry args={[0.26, 0.7, 5, 10]} />
      </mesh>
      <mesh castShadow position={[-0.23, 0.42, 0]} rotation={[motion, 0, 0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.23, 0.42, 0]} rotation={[-motion, 0, -0.08]} material={coat}>
        <capsuleGeometry args={[0.065, 0.58, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.36, 0.96, -0.08]} rotation={[0, -0.12, -0.18]} material={bag}>
        <boxGeometry args={[0.28, 0.38, 0.13]} />
      </mesh>
    </group>
  );
}

export function SymsCovington() {
  const group = useRef(null);
  const animationRef = useRef('idle');
  const x = 2.9;
  const z = -6.9;
  const y = terrainHeight(x, z) + 0.04;

  useFrame(({ clock }) => {
    if (!group.current) return;
    const time = clock.elapsedTime;
    group.current.position.y = y + Math.sin(time * 1.4) * 0.015;
    const cycle = time % 30;
    if (cycle > 25) animationRef.current = 'kneelInspect';
    else if (cycle > 20) animationRef.current = 'write';
    else if (cycle > 16) animationRef.current = 'gather';
    else if (cycle > 12) animationRef.current = 'lookAroundShort';
    else if (cycle > 9) animationRef.current = 'point';
    else animationRef.current = 'idle';
  });

  return (
    <group ref={group} position={[x, y, z]} rotation={[0, Math.PI * 0.82, 0]}>
      <ModelAsset id="syms" animationSelector={() => animationRef.current} fallback={<ProceduralCrewFigure motion={0.16} />} />
      <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.72, 0.82, 36]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.42} />
      </mesh>
      <mesh position={[0, 2.22, 0]}>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 2.43, 0]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color="#d9e6ba" transparent opacity={0.68} />
      </mesh>
    </group>
  );
}
