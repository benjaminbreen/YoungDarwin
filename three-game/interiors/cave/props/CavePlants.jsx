'use client';

import React from 'react';
import { StaticGLB } from '../../../components/assets/StaticGLB';
import { getModelAsset } from '../../../modelAssets';
import { floorAt } from './anchors';

// Manifest-driven plants (ferns, grass) placed on the cave floor where the
// light reaches. Each placement is { assetId, x, z, yaw, scale, y? }; y
// defaults to the rock floor under the plant.
export function CavePlants({ zoneId, placements }) {
  return placements.map((placement, index) => {
    const asset = getModelAsset(placement.assetId);
    if (!asset?.path || asset.enabled === false) return null;
    const path = asset.cacheKey ? `${asset.path}?v=${encodeURIComponent(asset.cacheKey)}` : asset.path;
    const baseScale = asset.scale || 1;
    const y = (placement.y ?? floorAt(zoneId, placement.x, placement.z)) + (asset.yOffset || 0) * (placement.scale || 1);
    return (
      <StaticGLB
        key={`${placement.assetId}-${index}`}
        path={path}
        position={[placement.x, y, placement.z]}
        rotation={[placement.tilt || 0, placement.yaw || 0, 0]}
        scale={baseScale * (placement.scale || 1)}
        doubleSide={asset.doubleSide}
        castShadow={false}
        receiveShadow
        sourceId={`cave-plant:${zoneId}:${index}`}
        sourceLabel={placement.assetId}
        sourceKind="interior-fixed-model"
      />
    );
  });
}
