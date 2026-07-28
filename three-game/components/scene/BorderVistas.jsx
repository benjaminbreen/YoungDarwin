'use client';

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRegionTerrainConfig, terrainHeight } from '../../world/terrain';
import { getEcology } from '../../world/ecology';
import {
  readRegionEcologyResource,
  readRegionNeighborEcologyResource,
} from '../../world/ecology/ecologyResource';
import { getBorderVistas } from '../../world/vistas';
import { buildBorderEcologyLayers, buildBorderGrassLayers } from '../../world/vistas/borderEcology';
import { buildBorderTransition, CARDINAL_VISTA_EDGES } from '../../world/vistas/transitions';
import {
  EDGE_AXES,
  axisLength,
  clampToRegionEdge,
  edgeLandStrength,
  edgeOrigin,
  normalize2,
  profileHeight,
  worldPoint,
} from '../../world/vistas/apronGeometry';
import { readBorderVistaResource } from '../../world/vistas/borderVistaResource';
import {
  centralPeakDev,
  getCentralPeakDevRevision,
  subscribeCentralPeakDev,
} from '../../world/vistas/centralPeakDevRuntime';
import {
  distanceSceneryRuntime,
  getDistanceSceneryRevision,
  subscribeDistanceScenery,
} from '../../world/vistas/distanceSceneryRuntime';
import {
  VISTA_AIR_PARS_GLSL,
  VISTA_AIR_VERTEX_APPLY_GLSL,
  VISTA_AIR_VERTEX_PARS_GLSL,
  VISTA_LAYER_DEBUG_TINT,
  VISTA_SKY_APPLY_GLSL,
  driveVistaAtmosphere,
  vistaAirApplyGlsl,
  vistaAtmosphereUniforms,
} from '../../world/vistas/vistaAtmosphere';
import { useThreeGameStore } from '../../store';
import { InstancedGLBLayer } from './ecology/InstancedGLBLayer';
import { ChartIslandShell } from './ChartIslandShell';

const MARKER_DUMMY = new THREE.Object3D();

// Every live vista material, driven from one useFrame below.
//
// Uniform updates used to run through a useEffect per material with one
// dependency entry per knob. Adding a knob without also adding it to every
// dependency array left a slider that moved but changed nothing, which is
// exactly the failure mode this panel kept hitting. A frame-driven copy from
// the mutable tuning object cannot go stale, and costs a handful of scalar
// writes per frame across at most a dozen materials.
const LIVE_VISTA_MATERIALS = new Set();

// The current layered mode now has one terrain family: the direct neighbor
// apron. Experimental onward rings and diagonal patches were removed from the
// render path after cross-map review showed that both created false land and
// exposed mesh edges.
const VISTA_FAMILY_KEYS = {
  apron: {
    relief: 'neighborApronRelief',
    vertical: 'neighborApronVertical',
    hazeStart: 'neighborApronHazeStart',
    nearHaze: 'neighborApronNearHaze',
    farHaze: 'neighborApronFarHaze',
    softFocus: 'neighborApronSoftFocus',
  },
};

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
  // Seam and outer-edge handoffs are now geometric overlaps/tapers. Keep the
  // terrain fully opaque here so distant ground never resolves into visible
  // screen-door pixels or exposes the water layer through dry land.
  float bvDist = length(vBorderWorldPosition.xz);
  float bvNear = 1.0 - smoothstep(108.0, 178.0, bvDist);
  float bvCoarse = bvNoise(vBorderWorldPosition.xz * 0.035 + vec2(2.0, -7.0));
  float bvFine = bvNoise(vBorderWorldPosition.xz * 0.28 + vec2(11.0, 3.0));
  float bvMottle = (bvCoarse - 0.5) * 0.085 + (bvFine - 0.5) * 0.02;
  float bvSlope = clamp(1.0 - abs(vBorderWorldNormal.y), 0.0, 1.0);

  vec3 bvWarmDust = vec3(1.045, 1.018, 0.95);
  vec3 bvCoolAsh = vec3(0.94, 0.975, 0.985);
  float bvWarmth = smoothstep(0.34, 0.76, bvCoarse);
  vec3 bvTerrainTint = mix(bvCoolAsh, bvWarmDust, bvWarmth);
  float bvGrain = max(0.0, uVistaGrade.w);
  diffuseColor.rgb *= mix(vec3(1.0), bvTerrainTint, 0.14 * bvNear * bvGrain);
  diffuseColor.rgb *= clamp(
    1.0 + bvMottle * bvNear * bvGrain - bvSlope * 0.055,
    0.82,
    1.16
  );
`;

// Maps the aerialPerspective dial (0 = scene fog verbatim, 1 = maximum reach)
// onto a fog-distance multiplier for vista layers. At 1.0 a 142 m belt fogs
// like ~43 m of local terrain, which is what lets a distant ridge read as a
// shape rather than a band of sky colour.
function vistaFogScale(aerialPerspective) {
  return THREE.MathUtils.lerp(1, 0.3, THREE.MathUtils.clamp(aerialPerspective ?? 0, 0, 1));
}

function createBorderVistaMaterial(cheapMaterials, family = 'apron') {
  const keys = VISTA_FAMILY_KEYS[family];
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
  material.userData.vistaFamily = family;
  // Per-pixel grain and a slight additional fog reach keep the connected
  // neighbor apron from reading as a flat vertex-colored sheet.
  material.onBeforeCompile = shader => {
    shader.uniforms.uNeighborApronRelief = { value: centralPeakDev[keys.relief] };
    shader.uniforms.uNeighborApronVertical = { value: centralPeakDev[keys.vertical] };
    shader.uniforms.uNeighborApronHazeStart = { value: centralPeakDev[keys.hazeStart] };
    shader.uniforms.uNeighborApronNearHaze = { value: centralPeakDev[keys.nearHaze] };
    shader.uniforms.uNeighborApronFarHaze = { value: centralPeakDev[keys.farHaze] };
    shader.uniforms.uNeighborApronSoftFocus = { value: centralPeakDev[keys.softFocus] };
    shader.uniforms.uVistaFogScale = { value: vistaFogScale(centralPeakDev.aerialPerspective) };
    // Shared by reference: one write in vistaAtmosphere reaches every material.
    shader.uniforms.uVistaHorizonColor = vistaAtmosphereUniforms.uVistaHorizonColor;
    shader.uniforms.uVistaAir = vistaAtmosphereUniforms.uVistaAir;
    shader.uniforms.uVistaSky = vistaAtmosphereUniforms.uVistaSky;
    shader.uniforms.uVistaGrade = vistaAtmosphereUniforms.uVistaGrade;
    shader.uniforms.uVistaValley = vistaAtmosphereUniforms.uVistaValley;
    shader.uniforms.uVistaLayerTint = {
      value: new THREE.Color(...(VISTA_LAYER_DEBUG_TINT[family] || [1, 1, 1])),
    };
    material.userData.neighborApronUniforms = shader.uniforms;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBorderBlend;
        attribute float aApronDepth;
        uniform float uNeighborApronRelief;
        uniform float uNeighborApronVertical;
        uniform float uNeighborApronSoftFocus;
        uniform float uVistaFogScale;
        varying vec3 vBorderWorldPosition;
        varying vec3 vBorderWorldNormal;
        varying float vBorderBlend;
        varying float vApronDepth;
        ${VISTA_AIR_VERTEX_PARS_GLSL}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vBorderWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vApronDepth = aApronDepth;
        float neighborApronShape = smoothstep(0.06, 0.52, aApronDepth);
        float neighborApronDatum = -0.9;
        float neighborApronDistanceFlatten = 1.0
          - clamp(uNeighborApronSoftFocus, 0.0, 1.5)
          * smoothstep(0.34, 1.0, aApronDepth)
          * 0.16;
        float neighborApronY = neighborApronDatum
          + (transformed.y - neighborApronDatum)
            * uNeighborApronRelief
            * max(0.72, neighborApronDistanceFlatten)
          + uNeighborApronVertical;
        transformed.y = mix(transformed.y, neighborApronY, neighborApronShape);
        vBorderWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vBorderBlend = aBorderBlend;
        ${VISTA_AIR_VERTEX_APPLY_GLSL}`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        #ifdef USE_FOG
        // Scene fog is sufficient in third person. Keep only a slight boost;
        // the former 35% increase made every apron a gray rectangle from the
        // overhead chart camera.
        vFogDepth *= 1.0 + aBorderBlend * 0.08;
        // Aerial perspective. The scene uses fogExp2 at density 0.012, which is
        // tuned for local terrain and reaches 88% opacity by 123 m and 94% by
        // 142 m — so every distant layer was erased into a flat band before its
        // shape could read at all. Real terrain renderers give backdrop layers
        // their own, gentler distance curve rather than the one that governs
        // ground the player is standing on. This compresses the fog distance
        // for vista layers only; scene fog is untouched.
        vFogDepth *= uVistaFogScale;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNeighborApronHazeStart;
        uniform float uNeighborApronNearHaze;
        uniform float uNeighborApronFarHaze;
        uniform float uNeighborApronSoftFocus;
        varying float vApronDepth;
        ${BORDER_VISTA_GRAIN_GLSL}
        ${VISTA_AIR_PARS_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${BORDER_VISTA_GRAIN_APPLY}
        #ifdef USE_FOG
        float neighborApronHazeDepth = smoothstep(
          clamp(uNeighborApronHazeStart, 0.0, 0.94),
          1.0,
          vApronDepth
        );
        float neighborApronHazeCurve = mix(
          1.5,
          0.68,
          clamp(uNeighborApronSoftFocus, 0.0, 1.0)
        );
        float neighborApronFocusDepth = pow(
          max(0.0001, neighborApronHazeDepth),
          neighborApronHazeCurve
        );
        float neighborApronAir = mix(
          max(0.0, uNeighborApronNearHaze),
          max(0.0, uNeighborApronFarHaze),
          neighborApronFocusDepth
        ) * (0.76 + clamp(uNeighborApronSoftFocus, 0.0, 1.5) * 0.18);
        float neighborApronTone = bvNoise(
          vBorderWorldPosition.xz * 0.021 + vec2(17.0, -9.0)
        );
        float neighborApronTonePresence = (1.0 - clamp(neighborApronAir, 0.0, 0.9))
          * mix(0.82, 0.42, vApronDepth);
        vec3 neighborApronCool = vec3(0.965, 0.99, 1.018);
        vec3 neighborApronWarm = vec3(1.035, 1.012, 0.965);
        vec3 neighborApronTint = mix(
          neighborApronCool,
          neighborApronWarm,
          smoothstep(0.26, 0.74, neighborApronTone)
        );
        diffuseColor.rgb *= mix(
          vec3(1.0),
          neighborApronTint,
          0.16 * neighborApronTonePresence
        );
        diffuseColor.rgb *= 1.0
          + (neighborApronTone - 0.5) * 0.035 * neighborApronTonePresence;
        // Unified aerial perspective by true camera distance. Everything above
        // this line is this layer's own near-field grade; this call folds its
        // haze into the curve shared with every other distant layer, so
        // overlapping layers agree without either one erasing the other.
        ${vistaAirApplyGlsl('neighborApronAir')}
        #endif`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        #ifdef USE_FOG
        ${VISTA_SKY_APPLY_GLSL}
        #endif`,
      );
  };
  material.customProgramCacheKey = () => (
    `${cheapMaterials ? 'border-vista-grain-phong-v13' : 'border-vista-grain-standard-v14'}-${family}`
  );
  material.needsUpdate = true;
  LIVE_VISTA_MATERIALS.add(material);
  return material;
}

function disposeVistaMaterial(material) {
  LIVE_VISTA_MATERIALS.delete(material);
  material.dispose();
}

function useDistanceSceneryDev() {
  useSyncExternalStore(
    subscribeCentralPeakDev,
    getCentralPeakDevRevision,
    getCentralPeakDevRevision,
  );
  return centralPeakDev;
}

function useDistanceSceneryMode() {
  useSyncExternalStore(
    subscribeDistanceScenery,
    getDistanceSceneryRevision,
    getDistanceSceneryRevision,
  );
  return distanceSceneryRuntime.mode;
}

// One driver for every distant-scenery uniform: celestial state, the shared
// aerial-perspective block, and each live material's own family knobs. See the
// note on LIVE_VISTA_MATERIALS for why this replaced the per-material effects.
function DistanceSceneryLightingDriver() {
  useFrame(() => {
    driveVistaAtmosphere(centralPeakDev);
    const fogScale = vistaFogScale(centralPeakDev.aerialPerspective);
    for (const material of LIVE_VISTA_MATERIALS) {
      const keys = VISTA_FAMILY_KEYS[material.userData.vistaFamily];
      if (!keys) continue;
      const uniforms = material.userData.neighborApronUniforms;
      // Set only once the program has compiled; onBeforeCompile runs on the
      // first render of a material, not at construction.
      if (!uniforms) continue;
      if (uniforms.uVistaFogScale) uniforms.uVistaFogScale.value = fogScale;
      if (uniforms.uNeighborApronRelief) {
        uniforms.uNeighborApronRelief.value = centralPeakDev[keys.relief];
        uniforms.uNeighborApronVertical.value = centralPeakDev[keys.vertical];
        uniforms.uNeighborApronHazeStart.value = centralPeakDev[keys.hazeStart];
        uniforms.uNeighborApronNearHaze.value = centralPeakDev[keys.nearHaze];
        uniforms.uNeighborApronFarHaze.value = centralPeakDev[keys.farHaze];
        uniforms.uNeighborApronSoftFocus.value = centralPeakDev[keys.softFocus];
      }
    }
  });
  return null;
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

function BorderVista({
  regionId,
  config,
  vista,
  prepared,
  borderEcologyReady = true,
  neighborApronEnabled = true,
}) {
  const cheapMaterials = useThreeGameStore(state => state.cheapMaterials);
  const foliageDrawScale = useThreeGameStore(state => state.foliageDrawScale);
  const tuning = useDistanceSceneryDev();
  const targetConfig = useMemo(() => (
    vista.toRegionId ? getRegionTerrainConfig(vista.toRegionId) : null
  ), [vista.toRegionId]);
  const sourceEcology = useMemo(
    () => (borderEcologyReady ? getEcology(regionId) : null),
    [borderEcologyReady, regionId],
  );
  const targetEcology = useMemo(
    () => (borderEcologyReady ? getEcology(vista.toRegionId) : null),
    [borderEcologyReady, vista.toRegionId],
  );
  const transition = useMemo(() => (
    buildBorderTransition(regionId, config, vista, targetConfig)
  ), [regionId, config, targetConfig, vista]);
  const geometry = prepared?.preview || null;
  const borderEcologyLayers = useMemo(() => (
    borderEcologyReady
      ? buildBorderEcologyLayers({
        regionId,
        config,
        targetRegionId: vista.toRegionId,
        targetConfig,
        vista,
        transition,
        ecology: targetEcology,
        sourceEcology,
        foliageDrawScale,
      })
      : []
  ), [borderEcologyReady, config, foliageDrawScale, regionId, sourceEcology, targetConfig, targetEcology, transition, vista]);
  const borderGrassLayers = useMemo(() => (
    borderEcologyReady
      ? buildBorderGrassLayers({
        regionId,
        config,
        targetRegionId: vista.toRegionId,
        targetConfig,
        vista,
        transition,
        ecology: targetEcology,
        sourceEcology,
        foliageDrawScale,
      })
      : []
  ), [borderEcologyReady, config, foliageDrawScale, regionId, sourceEcology, targetConfig, targetEcology, transition, vista]);
  const material = useMemo(
    () => createBorderVistaMaterial(cheapMaterials, 'apron'),
    [cheapMaterials],
  );
  useEffect(() => () => disposeVistaMaterial(material), [material]);
  if (!geometry) return null;
  const isNeighborPreview = geometry.userData.mode === 'neighbor-preview';
  const neighborVisible = neighborApronEnabled && tuning.neighborApronVisible;
  return (
    <group name={`border-apron-${vista.toRegionId}`} userData={{
      renderSource: `border-vista:${vista.id}`,
      renderLabel: `${vista.toRegionId || vista.id} border vista`,
      renderKind: 'border-vista',
      renderPath: null,
    }}>
      {neighborVisible && (
        <mesh geometry={geometry} material={material} receiveShadow={false} castShadow={false} />
      )}
      {neighborVisible && isNeighborPreview && borderEcologyReady && (
        <>
          {borderEcologyLayers.length > 0 || borderGrassLayers.length > 0 ? (
            <Suspense fallback={null}>
              <group userData={{
                renderSource: `border-ecology:${vista.toRegionId}`,
                renderLabel: `${regionId}–${vista.toRegionId} seam ecology`,
                renderKind: 'border-vista-ecology',
                renderPath: null,
              }}>
                {borderEcologyLayers.map(layer => (
                  <InstancedGLBLayer
                    key={layer.id}
                    path={layer.path}
                    items={layer.items}
                    sink={layer.sink}
                    ySquash={layer.ySquash}
                    tint={layer.tint}
                    tintStrength={layer.tintStrength}
                    variantMode={layer.variantMode}
                    castShadow={false}
                    receiveShadow={false}
                    motion={null}
                    maxVisibleDistance={180}
                    forceCheapMaterials
                    sourceId={`border-ecology:${vista.toRegionId}:${layer.id}`}
                    sourceLabel={layer.label}
                    sourceKind="border-vista-ecology"
                  />
                ))}
                {borderGrassLayers.map(layer => (
                  <InstancedGLBLayer
                    key={layer.id}
                    path={layer.path}
                    items={layer.items}
                    sink={layer.sink}
                    slopeSink={layer.slopeSink}
                    ySquash={layer.ySquash}
                    tint={layer.tint}
                    tintStrength={layer.tintStrength}
                    castShadow={false}
                    receiveShadow={false}
                    motion={null}
                    maxVisibleDistance={180}
                    forceCheapMaterials
                    sourceId={`border-grass:${vista.toRegionId}:${layer.id}`}
                    sourceLabel={layer.label}
                    sourceKind="border-vista-grass"
                  />
                ))}
              </group>
            </Suspense>
          ) : null}
          <TransitionSeamMarkers
            regionId={regionId}
            config={config}
            vista={vista}
            transition={transition}
            kind="rock"
          />
        </>
      )}
      {neighborVisible && !isNeighborPreview && vista.markers?.filter(marker => marker.kind !== 'scrub').map((marker, index) => (
        <VistaMarkers key={`marker-${index}`} config={config} vista={vista} marker={marker} />
      ))}
    </group>
  );
}

export function BorderVistas({ preparationPhase = 6 }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const distanceSceneryMode = useDistanceSceneryMode();
  const transitionDestinationId = useThreeGameStore(state => state.transition?.zoneId || null);
  if (transitionDestinationId === currentZoneId) readRegionEcologyResource(currentZoneId);
  const preparedResource = readBorderVistaResource(currentZoneId);
  const { config, vistas } = useMemo(() => ({
    config: getRegionTerrainConfig(currentZoneId),
    vistas: getBorderVistas(currentZoneId),
  }), [currentZoneId]);

  if (!vistas.length) return null;
  const stagedPreparationPhase = transitionDestinationId === currentZoneId
    ? preparationPhase
    : 6;
  // The destination ecology is sufficient for its terrain and local details.
  // Neighbor definitions are prepared in the same worker only after that
  // critical result has been delivered, and are consumed when border foliage
  // enters at phase five. Suspense keeps this work behind the travel chart.
  if (stagedPreparationPhase >= 5) {
    readRegionNeighborEcologyResource(currentZoneId);
  }
  const earlyVistaCount = Math.ceil(vistas.length * 0.5);
  return (
    <group name="border-terrain-aprons" userData={{
      renderSource: `border-vistas:${currentZoneId}`,
      renderLabel: `${currentZoneId} border vistas`,
      renderKind: 'border-vistas',
      renderPath: null,
    }}>
      <DistanceSceneryLightingDriver />
      <ChartIslandShell regionId={currentZoneId} />
      {vistas.map((vista, index) => (
        <BorderVista
          key={vista.id}
          regionId={currentZoneId}
          config={config}
          vista={vista}
          prepared={preparedResource.entries.find(entry => entry.vistaId === vista.id)}
          borderEcologyReady={stagedPreparationPhase >= (index < earlyVistaCount ? 5 : 6)}
          neighborApronEnabled={distanceSceneryMode !== 'shell'}
        />
      ))}
    </group>
  );
}
