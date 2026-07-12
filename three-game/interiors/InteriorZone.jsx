'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { StaticGLB } from '../components/assets/StaticGLB';
import { getModelAsset } from '../modelAssets';
import { useThreeGameStore } from '../store';
import { InteriorInteractionSensors } from './InteriorInteractionSensors';
import { InteriorLightingRig } from './InteriorLightingRig';
import { getInteriorDefinition } from './interiorRegistry';
import { ReadableBookActor } from './ReadableBookActor';

function CutawayDriver({ groupRef, enabled }) {
  const lastEnabledRef = useRef(null);
  useFrame(() => {
    if (lastEnabledRef.current === enabled || !groupRef.current) return;
    lastEnabledRef.current = enabled;
    groupRef.current.traverse(object => {
      if (!object.name?.toLowerCase().includes('ceiling')) return;
      object.visible = !enabled;
    });
  });
  return null;
}

function InteriorBackground({ color }) {
  const scene = useThree(state => state.scene);
  useEffect(() => {
    const previous = scene.background;
    scene.background = new THREE.Color(color);
    return () => { scene.background = previous; };
  }, [color, scene]);
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
      <InteriorBackground color={definition.scene.background || '#0b1216'} />
      <InteriorLightingRig definition={definition} groupRef={groupRef} />
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
          groupRef={groupRef}
          sourceId={`interior-shell:${zoneId}`}
          sourceLabel={definition.label}
          sourceKind="interior-shell"
        />
      )}
      <CutawayDriver groupRef={groupRef} enabled={Boolean(definition.camera.cutawayTop && viewMode === 'top')} />
      {(blueprint.books || []).map(placement => <ReadableBookActor key={placement.id} placement={placement} />)}
      <InteriorInteractionSensors zoneId={zoneId} />
    </group>
  );
}
