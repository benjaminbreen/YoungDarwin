'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useCursor } from '@react-three/drei';
import { getRuntimePlayerPose } from '../../store';
import { npcStatusStyle } from '../../npcs/npcStatus';

const NO_RAYCAST = () => null;
const ORB_WORLD_POSITION = new THREE.Vector3();
const CAMERA_QUATERNION = new THREE.Quaternion();
const PARENT_QUATERNION = new THREE.Quaternion();
const BILLBOARD_QUATERNION = new THREE.Quaternion();
// Past this the plate is unreadable anyway, and leaving it open litters the
// skyline while the player walks off.
const AUTO_CLOSE_DISTANCE = 17;
const PING_SECONDS = 0.95;

// Only one plate at a time. Opening a second orb closes the first, so the
// screen never accumulates labels.
let closeActivePlate = null;

const BILLBOARD_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Lantern halo. Three stacked falloffs rather than one: a tight core the bloom
// pass picks up, a body term that keeps the mid-band from going hollow, and a
// wide skirt for light-in-air. No banded term — any ring here reads as a donut.
const GLOW_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float falloff = 1.0 - d;
    // No bright white centre: the crystal in front carries the colour, and a
    // hot core here just washes out against a pale sea or sky.
    float body = pow(falloff, 2.0) * 0.88;
    float skirt = pow(falloff, 0.85) * 0.22;
    float alpha = (body + skirt) * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// Click ping: a thin expanding shockwave ring, thinning as it grows.
const PING_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float width = mix(0.2, 0.04, uProgress);
    float ring = smoothstep(width, 0.0, abs(d - 0.82));
    float alpha = ring * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const PLATE_CSS = `
.npc-plate {
  transform-origin: 50% 120%;
  transition:
    opacity 240ms cubic-bezier(0.2, 0.8, 0.25, 1),
    transform 340ms cubic-bezier(0.18, 0.9, 0.24, 1);
}
.npc-plate[data-shown='false'] { opacity: 0; transform: scale(0.78) translateY(9px); }
.npc-plate[data-shown='true'] { opacity: 1; transform: scale(1) translateY(0); }
.npc-plate-stem {
  transform-origin: 50% 100%;
  transition: transform 300ms cubic-bezier(0.18, 0.9, 0.24, 1) 60ms, opacity 200ms ease;
}
.npc-plate[data-shown='false'] .npc-plate-stem { transform: scaleY(0); opacity: 0; }
.npc-plate[data-shown='true'] .npc-plate-stem { transform: scaleY(1); opacity: 1; }
.npc-plate-line { animation: npc-plate-line-in 320ms cubic-bezier(0.2, 0.8, 0.25, 1) both; }
@keyframes npc-plate-line-in {
  from { opacity: 0; transform: translateY(4px); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@media (prefers-reduced-motion: reduce) {
  .npc-plate, .npc-plate-stem, .npc-plate-line { transition: none; animation: none; }
}
`;

function PlateCorner({ className }) {
  return (
    <span
      className={`pointer-events-none absolute h-2 w-2 border-expedition-brass/85 ${className}`}
      aria-hidden
    />
  );
}

// Status orb above an NPC's head. Colour is the at-a-glance state; clicking it
// pings and unfurls a plate naming what the NPC is doing.
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
  const crystalRef = useRef(null);
  const crystalMaterialRef = useRef(null);
  const glowRef = useRef(null);
  const pingRef = useRef(null);
  const lightRef = useRef(null);
  const opennessRef = useRef(0);
  const pingStartRef = useRef(-Infinity);
  const elapsedRef = useRef(0);
  const ownsPlateRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [plateShown, setPlateShown] = useState(false);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const targetCore = useMemo(() => new THREE.Color(style.core), [style.core]);
  const targetGlow = useMemo(() => new THREE.Color(style.glow), [style.glow]);
  const glowUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(style.glow) },
    uOpacity: { value: 0 },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pingUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(style.glow) },
    uOpacity: { value: 0 },
    uProgress: { value: 0 },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Let the plate mount at its closed transform, then flip the attribute on the
  // next frame so the CSS transition actually runs.
  useEffect(() => {
    if (!open) {
      setPlateShown(false);
      return undefined;
    }
    const handle = requestAnimationFrame(() => setPlateShown(true));
    return () => cancelAnimationFrame(handle);
  }, [open]);

  // Only drop the shared handle if this orb is the one holding it.
  useEffect(() => () => {
    if (ownsPlateRef.current) closeActivePlate = null;
  }, []);

  const close = () => {
    if (ownsPlateRef.current) {
      ownsPlateRef.current = false;
      closeActivePlate = null;
    }
    setOpen(false);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    if (closeActivePlate) closeActivePlate();
    ownsPlateRef.current = true;
    closeActivePlate = close;
    pingStartRef.current = elapsedRef.current;
    setOpen(true);
  };

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    elapsedRef.current = time;
    const openness = THREE.MathUtils.damp(opennessRef.current, open ? 1 : 0, 7, dt);
    opennessRef.current = openness;
    const emphasis = openness * 0.55 + (hovered ? 0.2 : 0);
    // Two detuned sines: a slow breath under a slower drift, so the pulse never
    // lands on an obvious beat.
    const breath = 0.5 + Math.sin(time * 1.25) * 0.34 + Math.sin(time * 0.47 + 1.7) * 0.16;
    const blend = 1 - Math.exp(-dt * 6);

    const group = groupRef.current;
    if (group) {
      group.position.y = height + Math.sin(time * 0.85) * 0.045 + openness * 0.09;
      group.scale.setScalar(1 + emphasis * 0.5);
      group.getWorldPosition(ORB_WORLD_POSITION);
    }

    // One billboard rotation shared by the halo and the ping. Both hang off a
    // group that yaws with the NPC, so the camera rotation has to be expressed
    // in the parent's space or they swing as he turns.
    camera.getWorldQuaternion(CAMERA_QUATERNION);
    if (group) {
      group.getWorldQuaternion(PARENT_QUATERNION).invert();
      BILLBOARD_QUATERNION.copy(PARENT_QUATERNION).multiply(CAMERA_QUATERNION);
    } else {
      BILLBOARD_QUATERNION.copy(CAMERA_QUATERNION);
    }
    if (glowRef.current) glowRef.current.quaternion.copy(BILLBOARD_QUATERNION);

    if (crystalRef.current) {
      // The slow spin is the whole trick: facets catch the sky one at a time,
      // so a solid object reads as a cut stone without any extra shading work.
      crystalRef.current.rotation.y = time * 0.62;
      crystalRef.current.rotation.z = Math.sin(time * 0.38) * 0.08;
    }
    if (crystalMaterialRef.current) {
      const material = crystalMaterialRef.current;
      material.color.lerp(targetCore, blend);
      material.emissive.lerp(targetGlow, blend);
      material.emissiveIntensity = 0.62 + breath * 0.16 + emphasis * 0.75;
    }
    glowUniforms.uColor.value.lerp(targetGlow, blend);
    glowUniforms.uOpacity.value = 0.6 + breath * 0.14 + emphasis * 0.5;

    if (lightRef.current) {
      lightRef.current.color.lerp(targetGlow, blend);
      lightRef.current.intensity = style.light * (0.78 + breath * 0.22 + emphasis * 0.95);
    }

    // Click ping.
    const pingAge = (time - pingStartRef.current) / PING_SECONDS;
    if (pingRef.current) {
      const alive = pingAge >= 0 && pingAge < 1;
      pingRef.current.visible = alive;
      if (alive) {
        const eased = 1 - (1 - pingAge) * (1 - pingAge) * (1 - pingAge);
        pingRef.current.quaternion.copy(BILLBOARD_QUATERNION);
        pingRef.current.scale.setScalar(0.34 + eased * 2.5);
        pingUniforms.uProgress.value = pingAge;
        pingUniforms.uOpacity.value = (1 - pingAge) * (1 - pingAge);
        pingUniforms.uColor.value.copy(targetGlow);
      }
    }

    if (open && group) {
      const player = getRuntimePlayerPose()?.position;
      const away = player && Math.hypot(
        ORB_WORLD_POSITION.x - (player.x || 0),
        ORB_WORLD_POSITION.z - (player.z || 0),
      ) > AUTO_CLOSE_DISTANCE;
      if (away) close();
    }
  });

  return (
    <group ref={groupRef} position={[0, height, 0]}>
      {/* Hit target: generous enough to click from a few metres out, invisible
          so it never adds a silhouette of its own. */}
      <mesh
        onClick={event => {
          event.stopPropagation();
          toggle();
        }}
        onPointerOver={event => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        visible={false}
      >
        <sphereGeometry args={[0.34, 10, 8]} />
      </mesh>

      <mesh ref={glowRef} raycast={NO_RAYCAST} renderOrder={4}>
        <planeGeometry args={[0.95, 0.95]} />
        <shaderMaterial
          uniforms={glowUniforms}
          vertexShader={BILLBOARD_VERTEX}
          fragmentShader={GLOW_FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Solid cut stone rather than a glowing sprite: an opaque body keeps its
          own colour against a pale sea, and the emissive keeps it lit at night. */}
      <mesh ref={crystalRef} raycast={NO_RAYCAST} renderOrder={5} rotation={[0.16, 0, 0]}>
        <octahedronGeometry args={[0.115, 0]} />
        <meshPhysicalMaterial
          ref={crystalMaterialRef}
          color={style.core}
          emissive={style.glow}
          emissiveIntensity={0.62}
          roughness={0.16}
          metalness={0.02}
          clearcoat={0.9}
          clearcoatRoughness={0.09}
          envMapIntensity={1.6}
          flatShading
        />
      </mesh>

      <mesh ref={pingRef} raycast={NO_RAYCAST} renderOrder={4} visible={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={pingUniforms}
          vertexShader={BILLBOARD_VERTEX}
          fragmentShader={PING_FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {castsLight && (
        <pointLight ref={lightRef} color={style.glow} intensity={style.light} distance={4.6} decay={2} />
      )}

      {open && activity && (
        <Html position={[0, 0.34, 0]} center distanceFactor={6.5} zIndexRange={[8, 0]}>
          <style>{PLATE_CSS}</style>
          <div className="npc-plate pointer-events-none relative flex flex-col items-center" data-shown={plateShown}>
            <div className="relative min-w-[9rem] rounded-[3px] border border-expedition-brass/75 bg-[rgba(13,22,38,0.86)] px-3 py-1.5 text-center font-expedition text-expedition-parchment shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <PlateCorner className="-left-px -top-px border-l border-t" />
              <PlateCorner className="-right-px -top-px border-r border-t" />
              <PlateCorner className="-bottom-px -left-px border-b border-l" />
              <PlateCorner className="-bottom-px -right-px border-b border-r" />
              {name && (
                <div className="npc-plate-line text-[9px] uppercase tracking-[0.18em] text-expedition-brass/90">
                  {name}
                </div>
              )}
              <div
                key={activity}
                className="npc-plate-line text-[11.5px] leading-snug tracking-[0.03em]"
                style={{ animationDelay: '70ms' }}
              >
                {activity}
              </div>
            </div>
            <span
              className="npc-plate-stem mt-px h-2.5 w-px bg-gradient-to-b from-expedition-brass/80 to-transparent"
              aria-hidden
            />
          </div>
        </Html>
      )}
    </group>
  );
}
