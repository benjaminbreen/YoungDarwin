'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getRuntimePlayerPose } from '../../../store';
import { getEcology } from '../../../world/ecology';
import { updateFoliageUniforms } from './foliageMotion';
import { InstancedGLBLayer } from './InstancedGLBLayer';
import { InstancedEzTreeLayer } from './InstancedEzTreeLayer';
import { RockField } from './RockField';
import { Footprints } from './Footprints';
import { RockSplashes } from './RockSplashes';
import { BirdFlock } from './BirdFlock';
import { ReefSwimmers } from './ReefSwimmers';
import { StaticGLB } from '../../assets/StaticGLB';
import { inspectableTypeForEcologyLayer } from '../../../world/inspectables';
import { terrainHeight } from '../../../world/terrain';
import { CanopySilhouetteLayer } from './CanopySilhouetteLayer';
import { GroundCoverField } from './GroundCoverField';
import { DenseGrassField } from './DenseGrassField';
import { HybridGrassTuftField } from './HybridGrassTuftField';
import { StylizedMeadowField } from './StylizedMeadowField';
import { DryGrassPatchField } from './DryGrassPatchField';

// Generic renderer for a zone ecology definition (see
// three-game/world/ecology/). Everything repeated is instanced; one-off props
// fall back to StaticGLB.

// Drives the shared wind/bend uniforms for every foliage material at once.
function FoliageMotionDriver() {
  useFrame(({ clock }, delta) => {
    const pose = getRuntimePlayerPose();
    updateFoliageUniforms(clock.elapsedTime, pose?.position, delta);
  });
  return null;
}

// Zones the player can travel to from anywhere on the island. Once the
// current zone has settled, warm the GLB cache for the others so arriving
// there doesn't stall on network fetches.
const PREFETCH_ZONES = ['N_SHORE', 'NW_REEF', 'MANGROVES'];
const EMPTY_LAYER_PLAN = {
  flora: [],
  groundCover: [],
  denseGrass: [],
  hybridGrassTufts: [],
  stylizedMeadows: [],
  dryGrassPatches: [],
  lagoonSurfaces: [],
  generatedTrees: [],
  props: [],
  rocks: [],
  canopySilhouettes: [],
};
const EMPTY_PROP_PLAN = { instancedGroups: [], staticProps: [] };

function drawDistanceFor(item, fallback = 95) {
  const value = item.maxVisibleDistance ?? item.drawDistance;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// A prop can be instanced only if it has no per-object behaviour that the
// instanced path can't express: interactive (crab) props, bobbing props, props
// tilted off the Y axis, or non-uniform scales all stay as individual StaticGLBs.
function propIsInstanceable(prop) {
  if (!prop.path || prop.id?.startsWith('crab-') || prop.bob) return false;
  if (typeof prop.scale !== 'number') return false;
  const rot = prop.rotation || [0, 0, 0];
  return Math.abs(rot[0] || 0) < 1e-3 && Math.abs(rot[2] || 0) < 1e-3;
}

// Map a prop onto the flora-style item shape InstancedGLBLayer consumes,
// resolving `terrainY` up front (the instanced layer doesn't know about it).
function propToItem(prop, zoneId) {
  const [px, py = 0, pz] = prop.position;
  return {
    id: prop.id,
    x: px,
    y: prop.terrainY ? terrainHeight(px, pz, zoneId) + (py || 0) : py,
    z: pz,
    yaw: (prop.rotation && prop.rotation[1]) || 0,
    scale: prop.scale,
    grade: 0,
  };
}

// Split props into instanced groups (≥2 sharing a GLB path) and individual
// StaticGLBs (one-offs + anything not instanceable). Repeated trail markers /
// driftwood collapse from N draw calls to ~1-2 per shared GLB.
function planProps(props, zoneId) {
  const byPath = new Map();
  const staticProps = [];
  props.forEach(prop => {
    if (!propIsInstanceable(prop)) {
      staticProps.push(prop);
      return;
    }
    const bucket = byPath.get(prop.path);
    if (bucket) bucket.push(prop);
    else byPath.set(prop.path, [prop]);
  });
  const instancedGroups = [];
  byPath.forEach((group, path) => {
    if (group.length < 2) {
      staticProps.push(...group);
      return;
    }
    instancedGroups.push({
      path,
      items: group.map(prop => propToItem(prop, zoneId)),
      castShadow: group.some(prop => prop.castShadow === true),
      receiveShadow: group.some(prop => prop.receiveShadow === true),
      maxVisibleDistance: Math.max(...group.map(prop => drawDistanceFor(prop, 85))),
    });
  });
  return { instancedGroups, staticProps };
}

function LagoonSurface({ surface }) {
  const material = React.useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(surface.colorA || '#31584a') },
      uColorB: { value: new THREE.Color(surface.colorB || '#85a16d') },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 p = vUv * vec2(2.0, 1.0);
        float ripple = sin((p.x * 6.0 + p.y * 10.0) + uTime * 0.65) * 0.5 + 0.5;
        float matte = noise(p * 5.0 + vec2(uTime * 0.025, -uTime * 0.015));
        float edge = smoothstep(0.02, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 0.98, vUv.x))
          * smoothstep(0.03, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 0.98, vUv.y));
        vec3 color = mix(uColorA, uColorB, matte * 0.56 + ripple * 0.12);
        gl_FragColor = vec4(color, edge * 0.34);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  }), [surface.colorA, surface.colorB]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={surface.position || [0, -0.875, 0]}
      rotation={[-Math.PI / 2, 0, surface.rotation || 0]}
      scale={[surface.scale?.[0] || 24, surface.scale?.[1] || 12, 1]}
      material={material}
      userData={{ noReflect: true }}
    >
      <circleGeometry args={[1, 96]} />
    </mesh>
  );
}

function OptionalSplatBackdrop({ backdrop, enabled }) {
  // Hook point for a future GaussianSplats3D/Drei implementation. The first
  // Cormorant Bay pass must stay beautiful without this asset or dependency.
  if (!enabled || !backdrop?.path) return null;
  return null;
}

function useNeighborZonePrefetch(currentEcology) {
  useEffect(() => {
    const handle = setTimeout(() => {
      PREFETCH_ZONES.forEach(zoneId => {
        if (zoneId === currentEcology?.zoneId) return;
        const other = getEcology(zoneId);
        if (!other) return;
        other.flora?.forEach(layer => {
          if (layer.path && layer.prefetch !== false && (!other.stream || layer.prefetch === true)) useGLTF.preload(layer.path);
        });
        other.props?.forEach(prop => {
          if (prop.path && prop.prefetch !== false && (!other.stream || prop.prefetch === true)) useGLTF.preload(prop.path);
        });
      });
    }, 5000); // let the current zone finish loading first
    return () => clearTimeout(handle);
  }, [currentEcology]);
}

export function EcologyRenderer({ ecology, settings = {} }) {
  useNeighborZonePrefetch(ecology);
  const [streamTier, setStreamTier] = useState(0);

  useEffect(() => {
    setStreamTier(0);
    if (!ecology?.stream) return undefined;
    const schedule = ecology.streamSchedule || [700, 1800, 3200];
    const handles = schedule.map((delay, index) => setTimeout(() => {
      setStreamTier(index + 1);
    }, delay));
    return () => handles.forEach(handle => clearTimeout(handle));
  }, [ecology]);

  const visibleLayers = useMemo(() => {
    if (!ecology) return EMPTY_LAYER_PLAN;
    const tierVisible = item => !ecology.stream || (item.loadTier ?? 1) <= streamTier;
    return {
      flora: (ecology.flora || []).filter(tierVisible),
      groundCover: (ecology.groundCover || []).filter(tierVisible),
      denseGrass: (ecology.denseGrass || []).filter(tierVisible),
      hybridGrassTufts: (ecology.hybridGrassTufts || []).filter(tierVisible),
      stylizedMeadows: (ecology.stylizedMeadows || []).filter(tierVisible),
      dryGrassPatches: (ecology.dryGrassPatches || []).filter(tierVisible),
      lagoonSurfaces: (ecology.lagoonSurfaces || []).filter(tierVisible),
      generatedTrees: (ecology.generatedTrees || []).filter(tierVisible),
      props: (ecology.props || []).filter(tierVisible),
      rocks: (ecology.rocks || []).filter(tierVisible),
      canopySilhouettes: (ecology.canopySilhouettes || []).filter(tierVisible),
    };
  }, [ecology, streamTier]);
  const propPlan = useMemo(() => (
    ecology ? planProps(visibleLayers.props, ecology.zoneId) : EMPTY_PROP_PLAN
  ), [ecology, visibleLayers.props]);

  if (!ecology) return null;
  const {
    flora,
    groundCover,
    denseGrass,
    hybridGrassTufts,
    stylizedMeadows,
    dryGrassPatches,
    lagoonSurfaces,
    generatedTrees,
    rocks,
    canopySilhouettes,
  } = visibleLayers;
  const { instancedGroups: instancedProps, staticProps } = propPlan;
  return (
    <group>
      <FoliageMotionDriver />
      {rocks.length > 0 && (
        <RockField
          rocks={rocks}
          sourceId={`ecology:${ecology.zoneId}:rocks`}
          sourceLabel={`${ecology.zoneId} rocks`}
        />
      )}
      {canopySilhouettes.map(layer => (
        <CanopySilhouetteLayer
          key={layer.id}
          items={layer.items}
          sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
          sourceLabel={layer.id}
        />
      ))}
      <OptionalSplatBackdrop backdrop={ecology.splatBackdrop} enabled={settings.splatBackdrop !== false} />
      {lagoonSurfaces.map(surface => (
        <LagoonSurface key={surface.id} surface={surface} />
      ))}
      {groundCover.map(layer => (
        <GroundCoverField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {denseGrass.map(layer => (
        <DenseGrassField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {hybridGrassTufts.map(layer => (
        <HybridGrassTuftField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {stylizedMeadows.map(layer => (
        <StylizedMeadowField key={layer.id} layer={layer} zoneId={layer.zoneId || ecology.zoneId} />
      ))}
      {dryGrassPatches.map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <DryGrassPatchField
            layer={layer}
            castShadow={layer.castShadow === true}
            receiveShadow={layer.receiveShadow !== false}
            inspectableType={inspectableTypeForEcologyLayer(layer.id) || 'dry_grass'}
          />
        </Suspense>
      ))}
      {flora.map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <InstancedGLBLayer
            path={layer.path}
            items={layer.items}
            sink={layer.sink || 0}
            ySquash={layer.ySquash || 1}
            tint={layer.tint || null}
            tintStrength={layer.tintStrength || 0}
            motion={layer.motion || null}
            castShadow={layer.castShadow === true}
            receiveShadow={layer.receiveShadow !== false}
            maxVisibleDistance={drawDistanceFor(layer)}
            sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
            sourceLabel={layer.id}
            sourceKind="ecology-flora"
            inspectableType={inspectableTypeForEcologyLayer(layer.id)}
          />
        </Suspense>
      ))}
      {generatedTrees.map(layer => (
        <Suspense key={layer.id} fallback={null}>
          <InstancedEzTreeLayer
            items={layer.items}
            variants={layer.variants}
            sink={layer.sink || 0}
            motion={layer.motion || null}
            castShadow={layer.castShadow === true}
            receiveShadow={layer.receiveShadow !== false}
            maxVisibleDistance={drawDistanceFor(layer, 115)}
            sourceId={`ecology:${ecology.zoneId}:${layer.id}`}
            sourceLabel={layer.id}
            sourceKind="ecology-generated-trees"
            inspectableType={inspectableTypeForEcologyLayer(layer.id)}
          />
        </Suspense>
      ))}
      {instancedProps.map(group => (
        <Suspense key={`prop-layer:${group.path}`} fallback={null}>
          <InstancedGLBLayer
            path={group.path}
            items={group.items}
            castShadow={group.castShadow}
            receiveShadow={group.receiveShadow}
            maxVisibleDistance={group.maxVisibleDistance}
            sourceId={`ecology:${ecology.zoneId}:props:${group.path.split('/').pop()}`}
            sourceLabel={group.path.split('/').pop()}
            sourceKind="ecology-prop"
          />
        </Suspense>
      ))}
      {staticProps.map(prop => (
        <Suspense key={prop.id} fallback={null}>
          <StaticGLB
            path={prop.path}
            position={prop.terrainY
              ? [
                prop.position[0],
                terrainHeight(prop.position[0], prop.position[2], ecology.zoneId) + (prop.position[1] || 0),
                prop.position[2],
              ]
              : prop.position}
            rotation={prop.rotation}
            scale={prop.scale}
            castShadow={prop.castShadow === true}
            receiveShadow={prop.receiveShadow === true}
            maxVisibleDistance={drawDistanceFor(prop, 85)}
            sourceId={`ecology:${ecology.zoneId}:${prop.id}`}
            sourceLabel={prop.id}
            sourceKind="ecology-prop"
            inspectableType={prop.id?.startsWith('crab-') ? 'crab_prop' : null}
          />
        </Suspense>
      ))}
      {ecology.splashes?.anchors?.length > 0 && (
        <RockSplashes anchors={ecology.splashes.anchors} period={ecology.splashes.period} />
      )}
      {ecology.birds?.length > 0 && <BirdFlock birds={ecology.birds} />}
      {ecology.swimmers && <ReefSwimmers swimmers={ecology.swimmers} />}
      {ecology.footprintBiomes?.length > 0 && (
        <Footprints zoneId={ecology.zoneId} biomes={ecology.footprintBiomes} />
      )}
    </group>
  );
}
