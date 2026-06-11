'use client';

import React, { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useThreeGameStore } from '../../../store';
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

// Generic renderer for a zone ecology definition (see
// three-game/world/ecology/). Everything repeated is instanced; one-off props
// fall back to StaticGLB.

// Drives the shared wind/bend uniforms for every foliage material at once.
function FoliageMotionDriver() {
  useFrame(({ clock }, delta) => {
    const pose = useThreeGameStore.getState().playerPose;
    updateFoliageUniforms(clock.elapsedTime, pose?.position, delta);
  });
  return null;
}

// Zones the player can travel to from anywhere on the island. Once the
// current zone has settled, warm the GLB cache for the others so arriving
// there doesn't stall on network fetches.
const PREFETCH_ZONES = ['N_SHORE', 'NW_REEF'];

function useNeighborZonePrefetch(currentEcology) {
  useEffect(() => {
    const handle = setTimeout(() => {
      PREFETCH_ZONES.forEach(zoneId => {
        if (zoneId === currentEcology?.zoneId) return;
        const other = getEcology(zoneId);
        if (!other) return;
        other.flora?.forEach(layer => layer.path && useGLTF.preload(layer.path));
        other.props?.forEach(prop => prop.path && useGLTF.preload(prop.path));
      });
    }, 5000); // let the current zone finish loading first
    return () => clearTimeout(handle);
  }, [currentEcology]);
}

export function EcologyRenderer({ ecology }) {
  useNeighborZonePrefetch(ecology);
  if (!ecology) return null;
  return (
    <group>
      <FoliageMotionDriver />
      {ecology.rocks?.length > 0 && <RockField rocks={ecology.rocks} />}
      {ecology.flora?.map(layer => (
        <InstancedGLBLayer
          key={layer.id}
          path={layer.path}
          items={layer.items}
          sink={layer.sink || 0}
          ySquash={layer.ySquash || 1}
          tint={layer.tint || null}
          tintStrength={layer.tintStrength || 0}
          motion={layer.motion || null}
          castShadow={layer.castShadow !== false}
          inspectableType={inspectableTypeForEcologyLayer(layer.id)}
        />
      ))}
      {ecology.generatedTrees?.map(layer => (
        <InstancedEzTreeLayer
          key={layer.id}
          items={layer.items}
          variants={layer.variants}
          sink={layer.sink || 0}
          motion={layer.motion || null}
          castShadow={layer.castShadow !== false}
          receiveShadow={layer.receiveShadow !== false}
          inspectableType={inspectableTypeForEcologyLayer(layer.id)}
        />
      ))}
      {ecology.props?.map(prop => (
        <StaticGLB
          key={prop.id}
          path={prop.path}
          position={prop.position}
          rotation={prop.rotation}
          scale={prop.scale}
          inspectableType={prop.id?.startsWith('crab-') ? 'crab_prop' : null}
        />
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
