'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { StaticGLB } from '../components/assets/StaticGLB';
import { getModelAsset } from '../modelAssets';
import { useThreeGameStore } from '../store';
import { skyState } from '../world/celestial';
import { weatherEnv } from '../world/weatherEnvRuntime';
import { InteriorExteriorApron } from './InteriorExteriorApron';
import { InteriorInteractionSensors } from './InteriorInteractionSensors';
import { InteriorLightingRig } from './InteriorLightingRig';
import { getInteriorDefinition } from './interiorRegistry';
import { ReadableBookActor } from './ReadableBookActor';

function CutawayDriver({ groupRef, enabled }) {
  const lastEnabledRef = useRef(null);
  const lastObjectCountRef = useRef(0);
  const scanElapsedRef = useRef(Infinity);
  useFrame((_, delta) => {
    scanElapsedRef.current += delta;
    const root = groupRef.current;
    if (!root) return;

    const enabledChanged = lastEnabledRef.current !== enabled;
    if (!enabledChanged && scanElapsedRef.current < 0.25) return;
    scanElapsedRef.current = 0;

    let objectCount = 0;
    root.traverse(() => { objectCount += 1; });
    if (!enabledChanged && lastObjectCountRef.current === objectCount) return;

    lastEnabledRef.current = enabled;
    lastObjectCountRef.current = objectCount;
    root.traverse(object => {
      if (!object.name?.toLowerCase().includes('ceiling')) return;
      object.visible = !enabled;
    });
  });
  return null;
}

function InteriorBackground({ color, lighting }) {
  const scene = useThree(state => state.scene);
  const nightColor = useMemo(() => new THREE.Color(lighting?.backgroundNight || color), [color, lighting?.backgroundNight]);
  const dayColor = useMemo(() => new THREE.Color(lighting?.backgroundDay || color), [color, lighting?.backgroundDay]);
  const goldenColor = useMemo(() => new THREE.Color(lighting?.backgroundGolden || lighting?.backgroundDay || color), [color, lighting?.backgroundDay, lighting?.backgroundGolden]);
  const mistColor = useMemo(() => new THREE.Color(lighting?.backgroundMist || lighting?.backgroundDay || color), [color, lighting?.backgroundDay, lighting?.backgroundMist]);
  const currentColor = useRef(new THREE.Color(color));
  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  useEffect(() => {
    const previous = scene.background;
    scene.background = new THREE.Color(color);
    return () => { scene.background = previous; };
  }, [color, scene]);
  useFrame((_, delta) => {
    if (!lighting?.backgroundDay || !scene.background?.isColor) return;
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const mistStrength = THREE.MathUtils.clamp(
      weatherEnv.overcast * 0.28 + weatherEnv.mistAmount * 0.5 + weatherEnv.rainIntensity * 0.16,
      0,
      0.72,
    );
    targetColor.copy(nightColor)
      .lerp(dayColor, celestial.daylight)
      .lerp(goldenColor, celestial.golden * (lighting.backgroundGoldenStrength ?? 0.38))
      .lerp(mistColor, mistStrength);
    currentColor.current.lerp(targetColor, 1 - Math.exp(-(lighting.backgroundResponse ?? 2.4) * Math.min(delta, 0.05)));
    scene.background.copy(currentColor.current);
    if (scene.fog?.color) scene.fog.color.copy(currentColor.current);
  });
  return null;
}

export function InteriorZone() {
  const zoneId = useThreeGameStore(state => state.currentZoneId);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const definition = getInteriorDefinition(zoneId);
  const groupRef = useRef(null);
  if (!definition) return null;
  const asset = getModelAsset(definition.shellAssetId);
  const assetPath = asset?.path && asset?.cacheKey
    ? `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}`
    : asset?.path;
  const blueprint = definition.blueprint;
  return (
    <group userData={{ renderSource: `interior:${zoneId}`, renderLabel: definition.label, renderKind: 'interior' }}>
      <InteriorBackground color={definition.scene.background || '#0b1216'} lighting={definition.lighting} />
      <InteriorLightingRig definition={definition} groupRef={groupRef} />
      {definition.exteriorApron && <InteriorExteriorApron apron={definition.exteriorApron} />}
      <group ref={groupRef}>
        {assetPath && (
          <StaticGLB
            path={assetPath}
            position={[0, 0, 0]}
            rotation={asset.rotation || [0, 0, 0]}
            scale={asset.scale || 1}
            doubleSide
            castShadow
            receiveShadow
            preserveMaterials
            frustumCulled={false}
            sourceId={`interior-shell:${zoneId}`}
            sourceLabel={definition.label}
            sourceKind="interior-shell"
          />
        )}
        {(blueprint.fixedModels || []).map(placement => {
          const fixedAsset = getModelAsset(placement.assetId);
          if (!fixedAsset?.path || fixedAsset.enabled === false) return null;
          const fixedPath = fixedAsset.cacheKey
            ? `${fixedAsset.path}?v=${encodeURIComponent(fixedAsset.cacheKey)}`
            : fixedAsset.path;
          return (
            <group
              key={placement.id}
              name={placement.ceilingMounted ? `Interior_CeilingFixture_${placement.id}` : placement.id}
            >
              <StaticGLB
                path={fixedPath}
                position={placement.position || [0, 0, 0]}
                rotation={placement.rotation || fixedAsset.rotation || [0, 0, 0]}
                scale={placement.scale || fixedAsset.scale || 1}
                castShadow
                receiveShadow
                preserveMaterials={fixedAsset.preserveMaterials === true}
                frustumCulled={false}
                sourceId={`interior-fixed-model:${placement.id}`}
                sourceLabel={placement.label || placement.id}
                sourceKind="interior-fixed-model"
              />
            </group>
          );
        })}
      </group>
      <CutawayDriver groupRef={groupRef} enabled={Boolean(definition.camera.cutawayTop && viewMode === 'top')} />
      {(blueprint.books || []).map(placement => <ReadableBookActor key={placement.id} placement={placement} />)}
      <InteriorInteractionSensors zoneId={zoneId} />
    </group>
  );
}
