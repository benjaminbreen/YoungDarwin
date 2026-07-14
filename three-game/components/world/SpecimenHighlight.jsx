'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFaunaFrameTask } from '../../fauna/useFaunaFrameTask';
import { inferSpecimenRarity } from '../../world/inspectables';
import { terrainHeight } from '../../world/terrain';

const NO_RAYCAST = () => null;
const TAU = Math.PI * 2;
const MARKER_FADE_NEAR = 8;
const MARKER_FADE_FAR = 18;
const GLOW_FADE_NEAR = 5;
const GLOW_FADE_FAR = 11.5;
const PROJECTION_MATRIX = new THREE.Matrix4();
const PROJECTION_INVERSE = new THREE.Matrix4();
const PROJECTION_POINT = new THREE.Vector3();
const SCHEDULER_POSITION = new THREE.Vector3();

const VISUAL_TIER_BY_RARITY = Object.freeze({
  abundant: 'common',
  common: 'common',
  uncommon: 'scarce',
  scarce: 'scarce',
  rare: 'rare',
  endemic: 'rare',
  historical: 'rare',
});

// Three deliberately simple visual tiers. The source rarity remains available
// to the field-note UI, but the world language stays immediately readable.
const TIER_STYLES = Object.freeze({
  common: {
    color: '#d9e6ba',
    shell: '#e7eed5',
    ringGain: 1,
    diamondGlow: 0.48,
  },
  scarce: {
    color: '#71c68e',
    shell: '#c8e7d1',
    ringGain: 1.08,
    diamondGlow: 0.62,
  },
  rare: {
    color: '#aa72df',
    shell: '#ddc9f0',
    ringGain: 1.34,
    diamondGlow: 0.96,
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

function createTerrainGlowGeometry(radialSegments = 96, radialSteps = 5) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const innerRadius = 0.44;

  for (let ring = 0; ring <= radialSteps; ring += 1) {
    const radius = THREE.MathUtils.lerp(innerRadius, 1, ring / radialSteps);
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * TAU;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, 0, z);
      uvs.push(0.5 + x * 0.5, 0.5 + z * 0.5);
    }
  }

  for (let ring = 0; ring < radialSteps; ring += 1) {
    const current = ring * radialSegments;
    const next = (ring + 1) * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const following = (segment + 1) % radialSegments;
      // Winding faces upward so the terrain glow is visible from gameplay.
      indices.push(
        current + segment,
        current + following,
        next + segment,
        current + following,
        next + following,
        next + segment,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  return geometry;
}

function projectGlowGeometry(mesh, zoneId) {
  const position = mesh?.geometry?.attributes?.position;
  if (!mesh || !position) return;
  mesh.updateWorldMatrix(true, false);
  PROJECTION_MATRIX.copy(mesh.matrixWorld);
  PROJECTION_INVERSE.copy(mesh.matrixWorld).invert();

  for (let index = 0; index < position.count; index += 1) {
    PROJECTION_POINT
      .set(position.getX(index), 0, position.getZ(index))
      .applyMatrix4(PROJECTION_MATRIX);
    PROJECTION_POINT.y = terrainHeight(PROJECTION_POINT.x, PROJECTION_POINT.z, zoneId) + 0.035;
    PROJECTION_POINT.applyMatrix4(PROJECTION_INVERSE);
    position.setY(index, PROJECTION_POINT.y);
  }
  position.needsUpdate = true;
}

function distanceVisibility(distance, near, far) {
  return 1 - THREE.MathUtils.smoothstep(distance, near, far);
}

export function SpecimenHighlight({ specimen, zoneId, markerY, footprintRadius, nearby, selected }) {
  const actorId = specimen.instanceId || specimen.id;
  const diamondRef = useRef(null);
  const diamondMaterialRef = useRef(null);
  const glowMeshRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const markerVisibilityRef = useRef(0);
  const glowVisibilityRef = useRef(0);
  const lastUpdateAtRef = useRef(null);
  const projectedAtRef = useRef({ x: Infinity, z: Infinity, zoneId: null });

  const rarity = inferSpecimenRarity(specimen);
  const visualTier = VISUAL_TIER_BY_RARITY[rarity] || 'common';
  const style = TIER_STYLES[visualTier];
  const phase = useMemo(() => phaseForSpecimen(specimen), [specimen]);
  const glowRadius = THREE.MathUtils.clamp(footprintRadius * 1.5, 0.46, 1.55);
  const markerScale = THREE.MathUtils.clamp(0.69 + footprintRadius * 0.14, 0.72, 0.92);
  const glowGeometry = useMemo(() => createTerrainGlowGeometry(), []);
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
      const markerTarget = forceVisible
        ? 1
        : distanceVisibility(distance, MARKER_FADE_NEAR, MARKER_FADE_FAR);
      const glowTarget = forceVisible
        ? 1
        : distanceVisibility(distance, GLOW_FADE_NEAR, GLOW_FADE_FAR);

      markerVisibilityRef.current = THREE.MathUtils.damp(
        markerVisibilityRef.current,
        markerTarget,
        markerTarget > markerVisibilityRef.current ? 1.8 : 2.5,
        delta,
      );
      glowVisibilityRef.current = THREE.MathUtils.damp(
        glowVisibilityRef.current,
        glowTarget,
        glowTarget > glowVisibilityRef.current ? 1.6 : 2.8,
        delta,
      );

      const markerVisibility = markerVisibilityRef.current;
      const glowVisibility = glowVisibilityRef.current;
      if (diamondRef.current) {
        diamondRef.current.visible = markerVisibility > 0.002;
        diamondRef.current.rotation.y = realElapsed * 0.14 + phase;
        diamondRef.current.rotation.x = 0.08;
        diamondRef.current.rotation.z = 0;
        diamondRef.current.position.y = markerY + Math.sin(realElapsed * 0.9 + phase) * 0.038;
      }
      if (diamondMaterialRef.current) {
        diamondMaterialRef.current.opacity = markerVisibility * 0.74;
        diamondMaterialRef.current.emissiveIntensity = style.diamondGlow
          * (0.68 + markerVisibility * 0.32);
      }
      if (glowMeshRef.current) glowMeshRef.current.visible = glowVisibility > 0.002;
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
          projectGlowGeometry(glowMeshRef.current, zoneId);
          projectedAtRef.current = { x: world[12], z: world[14], zoneId };
        }
      }
    },
  });

  return (
    <group
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
        <mesh renderOrder={5} raycast={NO_RAYCAST}>
          <octahedronGeometry args={[0.145, 0]} />
          <meshPhysicalMaterial
            ref={diamondMaterialRef}
            color={style.shell}
            emissive={style.color}
            emissiveIntensity={style.diamondGlow}
            roughness={0.16}
            metalness={0.06}
            clearcoat={1}
            clearcoatRoughness={0.06}
            envMapIntensity={1.8}
            transmission={0.06}
            thickness={0.16}
            ior={1.38}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
