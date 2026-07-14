'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainHeight } from '../../world/terrain';
import { getBorderVistas } from '../../world/vistas';
import { buildBorderTransition, CARDINAL_VISTA_EDGES } from '../../world/vistas/transitions';
import {
  EDGE_AXES,
  axisLength,
  clampToRegionEdge,
  edgeLandStrength,
  edgeOrigin,
  makeApronGeometry,
  makeNeighborPreviewGeometry,
  makeVistaWaterGeometry,
  normalize2,
  profileHeight,
  worldPoint,
} from '../../world/vistas/apronGeometry';
import { useThreeGameStore } from '../../store';

const MARKER_DUMMY = new THREE.Object3D();

const BORDER_VISTA_GRAIN_GLSL = /* glsl */`
  varying vec3 vBorderWorldPosition;
  varying vec3 vBorderWorldNormal;
  varying float vBorderBlend;

  float bvHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float bvNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(bvHash(i), bvHash(i + vec2(1.0, 0.0)), u.x),
      mix(bvHash(i + vec2(0.0, 1.0)), bvHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

`;

const BORDER_VISTA_GRAIN_APPLY = /* glsl */`
  // Dithered dissolve across the seam band: the carry strip (real region
  // material) keeps rendering beneath, and this mesh fades in over it. Stays
  // in the opaque pass, so no transparency sorting against the water.
  if (vBorderBlend < 0.999) {
    float bvDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (vBorderBlend < bvDither) discard;
  }
  float bvDist = length(vBorderWorldPosition.xz);
  float bvNear = 1.0 - smoothstep(84.0, 142.0, bvDist);
  float bvCoarse = bvNoise(vBorderWorldPosition.xz * 0.045 + vec2(2.0, -7.0));
  float bvFine = bvNoise(vBorderWorldPosition.xz * 0.42 + vec2(11.0, 3.0));
  float bvMottle = (bvCoarse - 0.5) * 0.10 + (bvFine - 0.5) * 0.035;
  float bvSlope = clamp(1.0 - abs(vBorderWorldNormal.y), 0.0, 1.0);

  vec3 bvWarmDust = vec3(1.055, 1.025, 0.925);
  vec3 bvCoolAsh = vec3(0.90, 0.94, 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bvWarmDust, max(0.0, bvCoarse - 0.54) * 0.10 * bvNear);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * bvCoolAsh, max(0.0, 0.46 - bvCoarse) * 0.08 * bvNear);
  diffuseColor.rgb *= clamp(1.0 + bvMottle * bvNear - bvSlope * 0.055, 0.82, 1.16);
`;

function createBorderVistaMaterial(cheapMaterials) {
  const material = cheapMaterials
    ? new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 0,
      specular: new THREE.Color(0x000000),
      fog: true,
    })
    : new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      fog: true,
    });
  // Both tiers get the shader patch: it carries the seam dither (without it the
  // cheap tier's vista mesh pops fully-opaque over the carry strip), the
  // per-pixel grain, and the extra fog reach. The patched chunks exist
  // identically in Phong and Standard, and the added cost is two noise reads on
  // apron pixels only.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBorderBlend;
        varying vec3 vBorderWorldPosition;
        varying vec3 vBorderWorldNormal;
        varying float vBorderBlend;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vBorderWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBorderWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vBorderBlend = aBorderBlend;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        #ifdef USE_FOG
        // Aerial perspective boost: the apron reads as ~35% farther to the fog
        // than real terrain at the same distance, so the schematic ground past
        // the seam sits in noticeably thicker haze. Ramps in with the seam
        // blend, so the walkable side of the boundary is untouched.
        vFogDepth *= 1.0 + aBorderBlend * 0.35;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${BORDER_VISTA_GRAIN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${BORDER_VISTA_GRAIN_APPLY}`,
      );
  };
  material.customProgramCacheKey = () => (cheapMaterials ? 'border-vista-grain-phong-v3' : 'border-vista-grain-standard-v4');
  material.needsUpdate = true;
  return material;
}

function seededUnit(seed, index, salt = 0) {
  const n = Math.sin((seed + index * 19.19 + salt * 7.7) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function markerItems(config, vista, marker) {
  const axes = EDGE_AXES[vista.edge];
  if (!axes) return [];
  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * (vista.apronWidthScale || 1.75) * 0.72;
  const [near, far] = marker.at;
  return Array.from({ length: marker.count }, (_, index) => {
    const u = seededUnit(marker.seed, index, 1) - 0.5;
    const distance = near + seededUnit(marker.seed, index, 2) * (far - near);
    const [x, z] = worldPoint(origin, along, outward, u * width, distance);
    const y = profileHeight(vista, x, z, distance, distance / (vista.apronDepth || 86));
    const scale = marker.scale[0] + seededUnit(marker.seed, index, 3) * (marker.scale[1] - marker.scale[0]);
    return {
      id: `${marker.kind}-${index}`,
      position: [x, y + (marker.kind === 'rock' ? 0.06 : 0.28), z],
      scale,
      yaw: seededUnit(marker.seed, index, 5) * Math.PI * 2,
    };
  });
}

function transitionDetailColor(transition, kind) {
  const profile = transition?.sourceProfile || transition?.targetProfile || {};
  if (kind === 'rock') return profile.wetColor || profile.nearColor || '#323029';
  return profile.families?.includes('reef-sand')
    ? '#78805d'
    : profile.families?.includes('volcanic')
      ? '#465233'
      : '#59653d';
}

function transitionDetailItems(regionId, config, vista, transition, kind) {
  const axes = EDGE_AXES[vista.edge];
  const continuity = transition?.continuity;
  if (!axes || !continuity || !CARDINAL_VISTA_EDGES.has(vista.edge)) return [];
  const count = kind === 'rock'
    ? continuity.detail?.rockCount || 0
    : continuity.detail?.scrubCount || 0;
  if (!count) return [];

  const along = normalize2(axes.along);
  const outward = normalize2(axes.outward);
  const origin = edgeOrigin(config, vista.edge);
  const width = axisLength(config, vista.edge) * 0.94;
  const seed = (vista.seed || 0) + (kind === 'rock' ? 409 : 251);
  const maxDistance = Math.min(continuity.carryEnd + 4, 22);

  return Array.from({ length: count }, (_, index) => {
    const u = 0.06 + seededUnit(seed, index, 1) * 0.88;
    const edgeLand = edgeLandStrength(regionId, config, vista.edge, u);
    if (edgeLand < 0.52) return null;
    const alongDistance = (u - 0.5) * width;
    const outwardDistance = -1.2 + seededUnit(seed, index, 2) * maxDistance;
    const [x, z] = worldPoint(origin, along, outward, alongDistance, outwardDistance);
    const [sampleX, sampleZ] = clampToRegionEdge(config, x, z);
    const y = terrainHeight(sampleX, sampleZ, regionId);
    const sizeMin = kind === 'rock' ? 0.12 : 0.18;
    const sizeMax = kind === 'rock' ? 0.34 : 0.44;
    const scale = sizeMin + seededUnit(seed, index, 3) * (sizeMax - sizeMin);
    return {
      id: `${kind}-transition-${index}`,
      position: [x, y + (kind === 'rock' ? 0.035 : 0.18), z],
      scale,
      yaw: seededUnit(seed, index, 5) * Math.PI * 2,
    };
  }).filter(Boolean);
}

function VistaMarkers({ config, vista, marker }) {
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const meshRef = useRef(null);
  const items = useMemo(() => markerItems(config, vista, marker), [config, vista, marker]);
  const geometry = useMemo(() => {
    const result = marker.kind === 'rock'
      ? new THREE.DodecahedronGeometry(1, 0)
      : new THREE.ConeGeometry(0.5, 1.2, 5);
    result.clearGroups();
    return result;
  }, [marker.kind]);
  const material = useMemo(() => (
    cheapMaterials
      ? new THREE.MeshPhongMaterial({
        color: marker.color,
        shininess: 0,
        specular: new THREE.Color(0x000000),
        fog: true,
      })
      : new THREE.MeshStandardMaterial({
        color: marker.color,
        roughness: 0.96,
        metalness: 0,
        fog: true,
      })
  ), [cheapMaterials, marker.color]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    items.forEach((item, index) => {
      MARKER_DUMMY.position.fromArray(item.position);
      MARKER_DUMMY.rotation.set(0, item.yaw, 0);
      MARKER_DUMMY.scale.set(item.scale, item.scale * (marker.kind === 'rock' ? 0.42 : 0.82), item.scale);
      MARKER_DUMMY.updateMatrix();
      mesh.setMatrixAt(index, MARKER_DUMMY.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items, marker.kind]);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      castShadow={false}
      receiveShadow={false}
      userData={{
        renderSource: `border-vista:${vista.id}:${marker.kind}`,
        renderLabel: `${vista.toRegionId || vista.id} ${marker.kind} markers`,
        renderKind: 'border-vista-marker',
        renderPath: null,
      }}
    />
  );
}

function TransitionSeamMarkers({ regionId, config, vista, transition, kind }) {
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const meshRef = useRef(null);
  const color = useMemo(() => transitionDetailColor(transition, kind), [kind, transition]);
  const items = useMemo(() => (
    transitionDetailItems(regionId, config, vista, transition, kind)
  ), [regionId, config, vista, transition, kind]);
  const geometry = useMemo(() => {
    const result = kind === 'rock'
      ? new THREE.DodecahedronGeometry(1, 0)
      : new THREE.ConeGeometry(0.5, 1.1, 5);
    result.clearGroups();
    return result;
  }, [kind]);
  const material = useMemo(() => (
    cheapMaterials
      ? new THREE.MeshPhongMaterial({
        color,
        shininess: 0,
        specular: new THREE.Color(0x000000),
        fog: true,
      })
      : new THREE.MeshStandardMaterial({
        color,
        roughness: 0.98,
        metalness: 0,
        fog: true,
      })
  ), [cheapMaterials, color]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    items.forEach((item, index) => {
      MARKER_DUMMY.position.fromArray(item.position);
      MARKER_DUMMY.rotation.set(0, item.yaw, 0);
      MARKER_DUMMY.scale.set(item.scale, item.scale * (kind === 'rock' ? 0.36 : 0.74), item.scale);
      MARKER_DUMMY.updateMatrix();
      mesh.setMatrixAt(index, MARKER_DUMMY.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items, kind]);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      castShadow={false}
      receiveShadow={false}
      userData={{
        renderSource: `border-vista:${vista.id}:transition-${kind}`,
        renderLabel: `${vista.toRegionId || vista.id} transition ${kind}`,
        renderKind: 'border-vista-transition-marker',
        renderPath: null,
      }}
    />
  );
}

function BorderVista({ regionId, config, vista }) {
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const targetConfig = useMemo(() => (
    vista.toRegionId ? getRegionTerrainConfig(vista.toRegionId) : null
  ), [vista.toRegionId]);
  const transition = useMemo(() => (
    buildBorderTransition(regionId, config, vista, targetConfig)
  ), [regionId, config, targetConfig, vista]);
  const geometry = useMemo(() => (
    makeNeighborPreviewGeometry(regionId, config, vista.toRegionId, targetConfig, vista, transition)
      || makeApronGeometry(regionId, config, vista)
  ), [regionId, config, targetConfig, vista, transition]);
  const waterGeometry = useMemo(() => (
    makeVistaWaterGeometry(regionId, config, vista.toRegionId, targetConfig, vista, transition)
  ), [regionId, config, targetConfig, vista, transition]);
  const material = useMemo(() => createBorderVistaMaterial(cheapMaterials), [cheapMaterials]);
  // Unlit + vertex alpha: the sheet is schematic distant water, so it needs no
  // lighting response, and depthWrite off keeps it from occluding spray/foam.
  const waterMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
  }), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => waterGeometry?.dispose(), [waterGeometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => waterMaterial.dispose(), [waterMaterial]);
  if (!geometry) return null;
  const isNeighborPreview = geometry.userData.mode === 'neighbor-preview';
  return (
    <group name={`border-apron-${vista.toRegionId}`} userData={{
      renderSource: `border-vista:${vista.id}`,
      renderLabel: `${vista.toRegionId || vista.id} border vista`,
      renderKind: 'border-vista',
      renderPath: null,
    }}>
      <mesh geometry={geometry} material={material} receiveShadow={false} castShadow={false} />
      {waterGeometry && (
        <mesh
          geometry={waterGeometry}
          material={waterMaterial}
          receiveShadow={false}
          castShadow={false}
          userData={{
            renderSource: `border-vista:${vista.id}:water-sheet`,
            renderLabel: `${vista.toRegionId || vista.id} vista water sheet`,
            renderKind: 'border-vista-water',
            renderPath: null,
          }}
        />
      )}
      {isNeighborPreview && (
        <>
          <TransitionSeamMarkers
            regionId={regionId}
            config={config}
            vista={vista}
            transition={transition}
            kind="scrub"
          />
          <TransitionSeamMarkers
            regionId={regionId}
            config={config}
            vista={vista}
            transition={transition}
            kind="rock"
          />
        </>
      )}
      {!isNeighborPreview && vista.markers?.map((marker, index) => (
        <VistaMarkers key={`marker-${index}`} config={config} vista={vista} marker={marker} />
      ))}
    </group>
  );
}

export function BorderVistas() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { config, vistas } = useMemo(() => ({
    config: getRegionTerrainConfig(currentZoneId),
    vistas: getBorderVistas(currentZoneId),
  }), [currentZoneId]);

  if (!vistas.length) return null;
  return (
    <group name="border-terrain-aprons" userData={{
      renderSource: `border-vistas:${currentZoneId}`,
      renderLabel: `${currentZoneId} border vistas`,
      renderKind: 'border-vistas',
      renderPath: null,
    }}>
      {vistas.map(vista => (
        <BorderVista key={vista.id} regionId={currentZoneId} config={config} vista={vista} />
      ))}
    </group>
  );
}
