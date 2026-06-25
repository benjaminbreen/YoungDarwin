import { getModelAsset } from '../../modelAssets';

export function modelAssetProp(assetId, { yaw = 0, fallbackPath = null } = {}) {
  const asset = getModelAsset(assetId) || {};
  const rotation = asset.rotation || [0, 0, 0];
  return {
    path: asset.path || fallbackPath,
    rotation: [rotation[0] || 0, yaw + (rotation[1] || 0), rotation[2] || 0],
    scale: asset.scale || 1,
    yOffset: asset.yOffset || 0,
  };
}
