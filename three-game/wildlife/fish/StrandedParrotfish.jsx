'use client';

// A parrotfish that did not make it back over the reef crest on the falling
// tide: same animal as the schools offshore, bent into a slack curve, jaw
// fallen open, colours dried out. Rendered as a beach find so it examines and
// collects through the same path as the shells.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';
import { ContactShadow } from '../../components/scene/ContactShadow';
import { createParrotfishSchoolMesh } from './parrotfishModel';

const _worldPosition = new THREE.Vector3();

export function StrandedParrotfish({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  variant = 'terminal',
  contactShadow = 0.22,
  maxVisibleDistance = 58,
  inspectableType = 'stranded_parrotfish',
  sourceId = 'stranded-parrotfish',
  inspectableOverrides = null,
}) {
  const rig = useMemo(
    () => createParrotfishSchoolMesh({ variant, count: 1, stranded: true }),
    [variant],
  );
  useEffect(() => () => rig.dispose(), [rig]);
  const group = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const maxVisibleSq = maxVisibleDistance > 0 ? maxVisibleDistance * maxVisibleDistance : null;

  useFrame(({ camera }) => {
    const node = group.current;
    if (!node || maxVisibleSq === null) return;
    node.getWorldPosition(_worldPosition);
    node.visible = _worldPosition.distanceToSquared(camera.position) <= maxVisibleSq;
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{
        renderSource: sourceId,
        renderLabel: 'stranded-parrotfish',
        renderKind: 'ecology-collectible-beach-find',
      }}
      onClick={event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable(inspectableType, event.point, {
          sourceId,
          ...(inspectableOverrides || {}),
        }));
      }}
    >
      <primitive object={rig.mesh} />
      {contactShadow ? <ContactShadow radius={contactShadow / (scale || 1)} /> : null}
    </group>
  );
}
