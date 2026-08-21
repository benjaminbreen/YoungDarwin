'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFaunaFrameTask } from '../../fauna/useFaunaFrameTask';
import { getSpecimenRarity } from '../../rarity';
import { createDrapedRingGeometry, projectDrapedGeometry } from '../../world/drapedRingGeometry';
import { getRadialGlowTexture } from '../../world/glowTexture';

const NO_RAYCAST = () => null;
const TAU = Math.PI * 2;
const MARKER_FADE_NEAR = 8;
const MARKER_FADE_FAR = 18;
const GLOW_FADE_NEAR = 5;
const GLOW_FADE_FAR = 11.5;
const SCHEDULER_POSITION = new THREE.Vector3();
const HIGHLIGHT_WORLD_ORIGIN = new THREE.Vector3();
const HIGHLIGHT_WORLD_TARGET = new THREE.Vector3();
const HIGHLIGHT_WORLD_SCALE = new THREE.Vector3();
const HIGHLIGHT_PARENT_QUATERNION = new THREE.Quaternion();
const HIGHLIGHT_TARGET_QUATERNION = new THREE.Quaternion();
const HIGHLIGHT_TARGET_EULER = new THREE.Euler(0, 0, 0, 'YXZ');

const VISUAL_TIER_BY_RARITY = Object.freeze({
  common: 'common',
  notable: 'scarce',
  remarkable: 'rare',
  singular: 'ultraRare',
});

// Four deliberately simple visual tiers. The source rarity remains available
// to the field-note UI, but the world language stays immediately readable.
const TIER_STYLES = Object.freeze({
  common: {
    color: '#69c98a',
    shell: '#bce7c9',
    ringGain: 1.04,
    diamondGlow: 0.66,
    shellOpacity: 0.9,
    auraOpacity: 0.045,
  },
  scarce: {
    color: '#6faee8',
    shell: '#c4ddf3',
    ringGain: 1.1,
    diamondGlow: 0.82,
    shellOpacity: 0.91,
    auraOpacity: 0.06,
  },
  rare: {
    color: '#aa72df',
    shell: '#ddc9f0',
    ringGain: 1.34,
    diamondGlow: 1.24,
    shellOpacity: 0.93,
    auraOpacity: 0.095,
  },
  ultraRare: {
    color: '#66e6d4',
    shell: '#d9fff8',
    ringGain: 1.48,
    diamondGlow: 1.56,
    shellOpacity: 0.96,
    auraOpacity: 0.13,
  },
});

const GLOW_VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float radius = length((vUv - 0.5) * 2.0);
    float distanceToRing = abs(radius - 0.82);
    float crispLine = 1.0 - smoothstep(0.038, 0.058, distanceToRing);
    float softEdge = 1.0 - smoothstep(0.06, 0.135, distanceToRing);
    float glow = crispLine * 0.86 + softEdge * 0.14;
    if (glow < 0.002) discard;
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

function phaseForSpecimen(specimen) {
  const id = String(specimen?.instanceId || specimen?.id || 'specimen');
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000 * TAU;
}

function distanceVisibility(distance, near, far) {
  return 1 - THREE.MathUtils.smoothstep(distance, near, far);
}

function setWorldTransform(object, worldPosition, worldQuaternion) {
  const parent = object?.parent;
  if (!object || !parent) return;
  parent.updateWorldMatrix(true, false);
  object.position.copy(parent.worldToLocal(worldPosition));
  parent.getWorldQuaternion(HIGHLIGHT_PARENT_QUATERNION).invert();
  object.quaternion.copy(HIGHLIGHT_PARENT_QUATERNION).multiply(worldQuaternion);
}

export function SpecimenHighlight({
  specimen,
  zoneId,
  markerY,
  footprintRadius,
  nearby,
  selected,
  groundedRef = null,
}) {
  const actorId = specimen.instanceId || specimen.id;
  const highlightRootRef = useRef(null);
  const diamondRef = useRef(null);
  const diamondMaterialRef = useRef(null);
  const diamondAuraMaterialRef = useRef(null);
  const glowMeshRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const markerVisibilityRef = useRef(0);
  const glowVisibilityRef = useRef(0);
  const lastUpdateAtRef = useRef(null);
  const projectedAtRef = useRef({ x: Infinity, z: Infinity, zoneId: null });

  const rarity = getSpecimenRarity(specimen).id;
  const visualTier = VISUAL_TIER_BY_RARITY[rarity] || 'common';
  const style = TIER_STYLES[visualTier];
  const phase = useMemo(() => phaseForSpecimen(specimen), [specimen]);
  const glowRadius = THREE.MathUtils.clamp(footprintRadius * 1.5, 0.46, 1.55);
  const markerScale = THREE.MathUtils.clamp(0.69 + footprintRadius * 0.14, 0.72, 0.92);
  const glowGeometry = useMemo(() => createDrapedRingGeometry({ innerRadius: 0.44 }), []);
  const auraTexture = useMemo(() => getRadialGlowTexture(), []);
  const glowUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(style.color).multiplyScalar(style.ringGain) },
    uOpacity: { value: 0 },
  }), [style.color, style.ringGain]);

  useFaunaFrameTask(`specimen-highlight:${zoneId}:${actorId}`, {
    getPosition: () => {
      if (!diamondRef.current) return null;
      diamondRef.current.getWorldPosition(SCHEDULER_POSITION);
      return SCHEDULER_POSITION;
    },
    shouldRunEveryFrame: () => (
      selected
      || nearby
      || markerVisibilityRef.current > 0.003
      || glowVisibilityRef.current > 0.003
    ),
    update: ({ realElapsed, distanceSquared }) => {
      const previousTime = lastUpdateAtRef.current;
      const delta = previousTime === null
        ? 1 / 60
        : THREE.MathUtils.clamp(realElapsed - previousTime, 0, 0.12);
      lastUpdateAtRef.current = realElapsed;
      const distance = Math.sqrt(Math.max(0, distanceSquared || 0));
      const forceVisible = selected || nearby;
      const grounded = groundedRef?.current !== false;
      const markerTarget = forceVisible
        ? 1
        : distanceVisibility(distance, MARKER_FADE_NEAR, MARKER_FADE_FAR);
      const glowTarget = grounded
        ? (forceVisible ? 1 : distanceVisibility(distance, GLOW_FADE_NEAR, GLOW_FADE_FAR))
        : 0;

      markerVisibilityRef.current = THREE.MathUtils.damp(
        markerVisibilityRef.current,
        markerTarget,
        markerTarget > markerVisibilityRef.current ? 1.8 : 2.5,
        delta,
      );
      glowVisibilityRef.current = grounded
        ? THREE.MathUtils.damp(
          glowVisibilityRef.current,
          glowTarget,
          glowTarget > glowVisibilityRef.current ? 1.6 : 2.8,
          delta,
        )
        : 0;

      const markerVisibility = markerVisibilityRef.current;
      const glowVisibility = glowVisibilityRef.current;
      const root = highlightRootRef.current;
      if (root) {
        root.getWorldPosition(HIGHLIGHT_WORLD_ORIGIN);
        root.getWorldScale(HIGHLIGHT_WORLD_SCALE);
      }
      if (diamondRef.current && root) {
        diamondRef.current.visible = markerVisibility > 0.002;
        const bob = Math.sin(realElapsed * 0.9 + phase) * 0.038;
        HIGHLIGHT_WORLD_TARGET.copy(HIGHLIGHT_WORLD_ORIGIN);
        HIGHLIGHT_WORLD_TARGET.y += (markerY + bob) * HIGHLIGHT_WORLD_SCALE.y;
        HIGHLIGHT_TARGET_EULER.set(0.08, realElapsed * 0.14 + phase, 0, 'YXZ');
        HIGHLIGHT_TARGET_QUATERNION.setFromEuler(HIGHLIGHT_TARGET_EULER);
        setWorldTransform(diamondRef.current, HIGHLIGHT_WORLD_TARGET, HIGHLIGHT_TARGET_QUATERNION);
      }
      if (diamondMaterialRef.current) {
        diamondMaterialRef.current.opacity = markerVisibility * style.shellOpacity;
        diamondMaterialRef.current.emissiveIntensity = style.diamondGlow
          * (0.82 + markerVisibility * 0.18);
      }
      if (diamondAuraMaterialRef.current) {
        diamondAuraMaterialRef.current.opacity = markerVisibility
          * style.auraOpacity
          * (0.96 + Math.sin(realElapsed * 0.72 + phase) * 0.04);
      }
      if (glowMeshRef.current && root) {
        glowMeshRef.current.visible = glowVisibility > 0.002;
        HIGHLIGHT_WORLD_TARGET.copy(HIGHLIGHT_WORLD_ORIGIN);
        HIGHLIGHT_TARGET_QUATERNION.identity();
        setWorldTransform(glowMeshRef.current, HIGHLIGHT_WORLD_TARGET, HIGHLIGHT_TARGET_QUATERNION);
      }
      if (glowMaterialRef.current) {
        glowMaterialRef.current.uniforms.uOpacity.value = glowVisibility
          * (nearby ? 0.46 : 0.38)
          * (0.97 + Math.sin(realElapsed * 0.9 + phase) * 0.03);
      }

      if (glowMeshRef.current && glowVisibility > 0.002) {
        glowMeshRef.current.updateWorldMatrix(true, false);
        const world = glowMeshRef.current.matrixWorld.elements;
        const projectedAt = projectedAtRef.current;
        if (
          projectedAt.zoneId !== zoneId
          || Math.hypot(world[12] - projectedAt.x, world[14] - projectedAt.z) > 0.035
        ) {
          projectDrapedGeometry(glowMeshRef.current, zoneId);
          projectedAtRef.current = { x: world[12], z: world[14], zoneId };
        }
      }
    },
  });

  return (
    <group
      ref={highlightRootRef}
      userData={{
        renderSource: `specimen-highlight:${actorId}`,
        renderLabel: `Specimen highlight: ${visualTier}`,
        renderKind: 'specimen-highlight',
      }}
    >
      <mesh
        ref={glowMeshRef}
        geometry={glowGeometry}
        scale={glowRadius}
        visible={false}
        renderOrder={3}
        raycast={NO_RAYCAST}
        frustumCulled={false}
      >
        <shaderMaterial
          ref={glowMaterialRef}
          uniforms={glowUniforms}
          vertexShader={GLOW_VERTEX_SHADER}
          fragmentShader={GLOW_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          toneMapped={false}
        />
      </mesh>

      <group
        ref={diamondRef}
        position={[0, markerY, 0]}
        scale={markerScale}
        visible={false}
      >
        {auraTexture && (
          <sprite scale={[0.42, 0.42, 1]} renderOrder={4} raycast={NO_RAYCAST}>
            <spriteMaterial
              ref={diamondAuraMaterialRef}
              map={auraTexture}
              color={style.color}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        )}
        <mesh renderOrder={5} raycast={NO_RAYCAST}>
          <octahedronGeometry args={[0.145, 0]} />
          <meshPhysicalMaterial
            ref={diamondMaterialRef}
            color={style.shell}
            emissive={style.color}
            emissiveIntensity={style.diamondGlow}
            roughness={0.22}
            metalness={0.025}
            clearcoat={0.92}
            clearcoatRoughness={0.11}
            envMapIntensity={1.45}
            transmission={0.015}
            thickness={0.08}
            ior={1.42}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
