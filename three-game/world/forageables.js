export const FORAGE_PROMPT_MODE = 'forage';

export const DEFAULT_DRY_GRASS_FORAGE = Object.freeze({
  sourceKind: 'dry-grass-patch',
  label: 'dry grass',
  foodLabel: 'dry grass',
  promptText: 'Eat dry grass',
  consumeMessage: 'The tortoise crops a mouthful of dry grass down to short stubble.',
  edibleBy: ['tortoise'],
  nutrition: 1,
  water: 0,
  pickRadius: 1.65,
  heightTolerance: 1.15,
  eatenVisual: {
    heightScale: 0.24,
    widthScale: 0.78,
    depthScale: 0.82,
    sinkScale: 0.08,
    color: '#7f7547',
  },
});

export function forageKeyForEcologyItem({ zoneId, layerId, itemId }) {
  return `ecology:${zoneId || 'unknown'}:${layerId || 'layer'}:${itemId || 'item'}`;
}

export function mergeForageConfig(defaults, overrides) {
  if (overrides === false) return null;
  return {
    ...defaults,
    ...(overrides || {}),
    eatenVisual: {
      ...(defaults.eatenVisual || {}),
      ...(overrides?.eatenVisual || {}),
    },
  };
}

export function forageableAllowsMode(forageable, modeOrId) {
  const edibleBy = forageable?.edibleBy;
  if (!Array.isArray(edibleBy) || edibleBy.length === 0) return true;
  const modeId = typeof modeOrId === 'string' ? modeOrId : modeOrId?.id;
  const modeKind = typeof modeOrId === 'string'
    ? (modeOrId === 'darwin' ? 'human' : 'animal')
    : modeOrId?.kind;
  return edibleBy.includes('all')
    || (modeId && edibleBy.includes(modeId))
    || (modeKind && edibleBy.includes(modeKind))
    || (modeId && modeId !== 'darwin' && edibleBy.includes('animal'));
}
