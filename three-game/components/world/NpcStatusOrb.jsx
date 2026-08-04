'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useCursor } from '@react-three/drei';
import { getRadialGlowTexture } from '../../world/glowTexture';
import { npcStatusStyle } from '../../npcs/npcStatus';

const NO_RAYCAST = () => null;
const CORE_COLOR = new THREE.Color();
const GLOW_COLOR = new THREE.Color();

// Status orb above an NPC's head. Colour is the at-a-glance state; clicking it
// blooms the orb into a plate naming what the NPC is doing.
export function NpcStatusOrb({
  status,
  activity,
  name,
  height = 2.3,
  // The point light is the only part with a scene-wide cost: adding or removing
  // one relights every material. Mount it for the whole life of the NPC.
  castsLight = true,
}) {
  const style = npcStatusStyle(status);
  const groupRef = useRef(null);
  const coreMaterialRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const auraMaterialRef = useRef(null);
  const lightRef = useRef(null);
  const opennessRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const auraTexture = useMemo(() => getRadialGlowTexture(), []);
  const targetCore = useMemo(() => new THREE.Color(style.core), [style.core]);
  const targetGlow = useMemo(() => new THREE.Color(style.glow), [style.glow]);

  // A state change while the plate is open should not leave stale text hanging
  // in the air, but the plate itself can stay — the new line just replaces it.
  useEffect(() => {
    if (!activity) setOpen(false);
  }, [activity]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = performance.now() / 1000;
    const openness = THREE.MathUtils.damp(opennessRef.current, open ? 1 : 0, 7, dt);
    opennessRef.current = openness;
    const emphasis = openness * 0.5 + (hovered ? 0.18 : 0);
    // Slow bob plus a breath, so a resting orb still reads as alive.
    const breath = 0.5 + Math.sin(time * 1.35) * 0.5;

    if (groupRef.current) {
      groupRef.current.position.y = height + Math.sin(time * 0.85) * 0.045;
      const scale = 1 + emphasis * 0.55;
      groupRef.current.scale.setScalar(scale);
    }
    if (coreMaterialRef.current) {
      CORE_COLOR.copy(coreMaterialRef.current.color).lerp(targetCore, 1 - Math.exp(-dt * 6));
      coreMaterialRef.current.color.copy(CORE_COLOR);
    }
    if (glowMaterialRef.current) {
      GLOW_COLOR.copy(glowMaterialRef.current.color).lerp(targetGlow, 1 - Math.exp(-dt * 6));
      glowMaterialRef.current.color.copy(GLOW_COLOR);
      glowMaterialRef.current.opacity = 0.26 + breath * 0.08 + emphasis * 0.2;
    }
    if (auraMaterialRef.current) {
      auraMaterialRef.current.color.copy(GLOW_COLOR);
      auraMaterialRef.current.opacity = 0.3 + breath * 0.1 + emphasis * 0.35;
    }
    if (lightRef.current) {
      lightRef.current.color.copy(GLOW_COLOR);
      lightRef.current.intensity = style.light * (0.82 + breath * 0.18 + emphasis * 0.9);
    }
  });

  return (
    <group ref={groupRef} position={[0, height, 0]}>
      {/* Hit target: generous enough to click from a few metres out, invisible
          so it never adds a silhouette of its own. */}
      <mesh
        onClick={event => {
          event.stopPropagation();
          setOpen(value => !value);
        }}
        onPointerOver={event => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        visible={false}
      >
        <sphereGeometry args={[0.32, 10, 8]} />
      </mesh>

      <mesh raycast={NO_RAYCAST}>
        <sphereGeometry args={[0.062, 16, 12]} />
        <meshBasicMaterial ref={coreMaterialRef} color={style.core} toneMapped={false} />
      </mesh>

      <mesh raycast={NO_RAYCAST}>
        <sphereGeometry args={[0.115, 16, 12]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color={style.glow}
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {auraTexture && (
        <sprite scale={[0.62, 0.62, 1]} renderOrder={4} raycast={NO_RAYCAST}>
          <spriteMaterial
            ref={auraMaterialRef}
            map={auraTexture}
            color={style.glow}
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      )}

      {castsLight && (
        <pointLight ref={lightRef} color={style.glow} intensity={style.light} distance={4.2} decay={2} />
      )}

      {open && activity && (
        <Html position={[0, 0.42, 0]} center distanceFactor={11} zIndexRange={[8, 0]}>
          <div className="pointer-events-none flex min-w-[9rem] flex-col items-center gap-0.5 whitespace-nowrap rounded-sm border border-expedition-brass/70 bg-[rgba(10,16,20,0.86)] px-2.5 py-1.5 text-center font-expedition text-expedition-parchment shadow-lg backdrop-blur-sm">
            {name && (
              <span className="text-[9px] uppercase tracking-[0.16em] text-expedition-brass/90">{name}</span>
            )}
            <span className="text-[11px] tracking-[0.04em]">{activity}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
