'use client';

import React, { Suspense } from 'react';
import { StaticGLB } from '../../assets/StaticGLB';

export function CollectibleBeachFindsLayer({ layer }) {
  if (!layer?.items?.length) return null;
  const fallbackDistance = layer.maxVisibleDistance || 58;
  return (
    <group userData={{
      noReflect: true,
      renderSource: `ecology:${layer.zoneId || 'zone'}:${layer.id}`,
      renderLabel: layer.id,
      renderKind: 'ecology-collectible-beach-finds',
    }}>
      {layer.items.map(item => (
        <Suspense key={item.id} fallback={null}>
          <StaticGLB
            path={item.path}
            position={[item.x, item.y, item.z]}
            rotation={item.rotation}
            scale={item.scale}
            castShadow={item.castShadow !== false}
            receiveShadow={item.receiveShadow !== false}
            contactShadow={item.contactShadow}
            maxVisibleDistance={item.maxVisibleDistance || fallbackDistance}
            sourceId={item.id}
            sourceLabel={item.variantId || item.id}
            sourceKind="ecology-collectible-beach-find"
            inspectableType={item.inspectableType}
            inspectableOverrides={{
              sourceId: item.id,
              sourceKind: 'ecology-collectible-beach-find',
              variantId: item.variantId,
            }}
          />
        </Suspense>
      ))}
    </group>
  );
}
