function normalizedPropText(prop = {}) {
  return [prop.type, prop.visual, prop.label, prop.visualAsset]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function interactionMaterialForProp(prop = {}) {
  const text = normalizedPropText(prop);
  if (/stone|rock|basalt|shell|tooth/.test(text)) return 'stone';
  if (/mug|candlestick|chart.weight|brass|tin|iron|metal/.test(text)) return 'metal';
  if (/terracotta|earthenware|jug|bottle|glass|ceramic|bowl|pot/.test(text)) return 'ceramic';
  if (/book|diary|ledger|chart|paper/.test(text)) return null;
  if (/barrel|crate|wood|board|chair|stool|chest|bucket|wheelbarrow|trough|post|bags/.test(text)) return 'wood';
  return null;
}
