import { ECOLOGY_ZONE_IDS, getEcology } from './index';

const FLORA_LAYER_KEYS = ['flora', 'proceduralFlora', 'dryGrassPatches'];
const NON_FLORA_PATH = /\/runtime-coral-(?:branch|cluster|head)\.glb$/;

function itemScaleRange(items) {
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const scale = Number(item?.scale);
    if (!Number.isFinite(scale)) continue;
    min = Math.min(min, scale);
    max = Math.max(max, scale);
  }
  return Number.isFinite(min) ? [min, max] : null;
}

function catalogIdForPath(path) {
  return `runtime-${path.split('/').pop().replace(/\.glb$/i, '')}`;
}

/**
 * Build the dev-browser inventory from the ecology definitions themselves.
 * This deliberately runs only when the dev panel opens; ecology builders can
 * create sizeable deterministic scatter layouts that should not affect boot.
 */
export function buildEcologyFloraAssetCatalog(zoneIds = ECOLOGY_ZONE_IDS) {
  const byPath = new Map();
  const generatedTrees = [];

  for (const zoneId of zoneIds) {
    const ecology = getEcology(zoneId);
    if (!ecology) continue;

    for (const layer of ecology.generatedTrees || []) {
      if (!Array.isArray(layer.variants) || layer.variants.length === 0) continue;
      generatedTrees.push({
        zoneId,
        layerId: layer.id,
        variants: layer.variants,
        itemCount: layer.items?.length || 0,
      });
    }

    for (const layerKey of FLORA_LAYER_KEYS) {
      for (const layer of ecology[layerKey] || []) {
        if (!layer.path || NON_FLORA_PATH.test(layer.path)) continue;
        const items = layer.items || [];
        // Empty authored placeholders are candidates, not assets used in the
        // current world. They remain available through the candidate list.
        if (items.length === 0) continue;
        let asset = byPath.get(layer.path);
        if (!asset) {
          asset = {
            id: catalogIdForPath(layer.path),
            kind: 'glb',
            source: 'runtime',
            path: layer.path,
            variantMode: layer.variantMode || null,
            zones: [],
            usages: [],
          };
          byPath.set(layer.path, asset);
        }
        if (layer.variantMode) asset.variantMode = layer.variantMode;
        if (!asset.zones.includes(zoneId)) asset.zones.push(zoneId);
        asset.usages.push({
          zoneId,
          layerId: layer.id,
          layerKey,
          itemCount: items.length,
          scaleRange: itemScaleRange(items),
          procedural: layer.procedural === true,
          placementStats: layer.placementStats || null,
        });
      }
    }
  }

  return {
    assets: Array.from(byPath.values()),
    generatedTrees,
  };
}
