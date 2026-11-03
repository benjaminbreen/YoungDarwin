function normalizedPropText(prop = null) {
  return [prop?.type, prop?.visual, prop?.label, prop?.visualAsset]
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

export function materialFromInteractionEvent(event, prop = null) {
  const direct = String(event?.material || '').toLowerCase();
  if (['wood', 'stone', 'metal', 'ceramic'].includes(direct)) return direct;
  const registered = interactionMaterialForProp(prop);
  if (registered) return registered;
  const text = `${event?.propId || ''} ${event?.kind || ''} ${event?.label || ''} ${direct}`.toLowerCase();
  if (/rock|stone|basalt|lava|volcan|boulder/.test(text)) return 'stone';
  if (/iron|metal|brass|tin|candlestick|mug/.test(text)) return 'metal';
  if (/ceramic|glass|bottle|jug|pot|bowl|earthen/.test(text)) return 'ceramic';
  if (/wood|timber|crate|barrel|chest|case|stool|chair|fence|gate|post|cactus|plant|crop/.test(text)) return 'wood';
  return null;
}

// Darwin's hammer, by what it meets. Rock keys are the rockSampling hammer
// materials; gains are matched against each modelled sprite's measured
// density (coral and the plants are sparser, so they sit a little higher).
export const HAMMER_STRIKE_PROFILES = Object.freeze({
  basalt: { family: 'hammerBasalt', gain: 0.072, rate: [0.97, 1.03] },
  scoria: { family: 'hammerScoria', gain: 0.066, rate: [0.95, 1.04] },
  tuff: { family: 'hammerTuff', gain: 0.064, rate: [0.95, 1.03] },
  olivine: { family: 'hammerOlivine', gain: 0.07, rate: [0.97, 1.03] },
  coral_limestone: { family: 'hammerCoral', gain: 0.088, rate: [0.97, 1.05] },
  iron_crust: { family: 'hammerIronCrust', gain: 0.07, rate: [0.97, 1.03] },
  wood: { family: 'hammerWood', gain: 0.066, rate: [0.95, 1.05] },
  succulent: { family: 'hammerSucculent', gain: 0.056, rate: [0.94, 1.06], rustle: 0.035 },
  herb: { family: 'hammerHerb', gain: 0.06, rate: [0.94, 1.08], rustle: 0.07 },
});

export function hammerStrikeMaterial(event, prop = null) {
  if (HAMMER_STRIKE_PROFILES[event?.hammerMaterial]) return event.hammerMaterial;
  const id = String(event?.propId || '').toLowerCase();
  if (/prickly-pear|lava-cactus|mature-cactus|opuntia|cactus/.test(id)) return 'succulent';
  if (/palo-santo|cabin|timber|drying-rack/.test(id)) return 'wood';
  if (/^crop:|delilia|lecocarpus|sicyos/.test(id)) return 'herb';
  const material = materialFromInteractionEvent(event, prop);
  if (material === 'stone') return 'basalt';
  // Metal and ceramic props keep their recorded clank and clink.
  return material;
}

// What the clasp knife is cutting, read from the plant piece's id. Of the
// knife-cuttable plants only Lecocarpus is woody; its twigs take the dry cut.
export function knifeCutMaterial(event) {
  const id = String(event?.propId || event?.sourceId || '').toLowerCase();
  if (/prickly-pear|lava-cactus|mature-cactus|opuntia|cactus/.test(id)) return 'succulent';
  if (/lecocarpus|palo-santo|bark|timber/.test(id)) return 'bark';
  return 'stem';
}

// Which pellet-impact sprite a shotgun-impact surface takes. Hits on animals
// stay silent: the report and the animal's own flight carry that moment.
export function pelletImpactSound(event) {
  const surface = event?.surface;
  if (surface === 'fauna') return null;
  if (surface === 'foliage') return 'foliage';
  if (surface === 'wood' || surface === 'structure') return 'wood';
  if (surface === 'rock') return 'rock';
  const biome = String(event?.biome || '').toLowerCase();
  return /basalt|lava|rock|cliff|boulder|scree|reef/.test(biome) ? 'rock' : 'earth';
}

// The reverberant space a zone puts Darwin in (audioRuntime ACOUSTIC_SPACES).
export function acousticSpaceForZone(zone) {
  const type = String(zone?.type || zone?.biome || '').toLowerCase();
  if (type === 'caveinterior') return 'cave';
  if (type === 'promontory') return 'cliff';
  return null;
}
