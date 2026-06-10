'use client';

import React from 'react';
import { useFrame } from '@react-three/fiber';
import { useThreeGameStore } from '../../../store';
import { updateFoliageUniforms } from './foliageMotion';
import { InstancedGLBLayer } from './InstancedGLBLayer';
import { RockField } from './RockField';
import { Footprints } from './Footprints';
import { RockSplashes } from './RockSplashes';
import { BirdFlock } from './BirdFlock';
import { Skyline } from './Skyline';
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

export function EcologyRenderer({ ecology }) {
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
      {ecology.skyline && <Skyline cones={ecology.skyline.cones} color={ecology.skyline.color} />}
      {ecology.footprintBiomes?.length > 0 && (
        <Footprints zoneId={ecology.zoneId} biomes={ecology.footprintBiomes} />
      )}
    </group>
  );
}
