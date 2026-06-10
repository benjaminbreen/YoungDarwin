// Field-kit registry for the Inventory & Tools modal: painted item art,
// museum-card copy (use / best for / note), supplies, and capacity rules.
import { tools as analysisTools, collectionTools } from './tools';

export const CASE_CAPACITY = 12;
// Syms carries one spare jar beyond what Darwin packs himself.
export const SYMS_BONUS_JARS = 1;

const ITEM_DETAILS = {
  magnifier: {
    displayName: 'Hand Lens',
    image: '/inventory/hand_lens.png',
    flavor: 'A brass lens for close inspection of specimens and surfaces in the field.',
    use: 'Examine & Inspect',
    bestFor: 'Leaves, shells, insects, mineral surfaces',
    note: 'Hold close to the specimen. Use in good light for best results.',
  },
  insect_net: {
    displayName: 'Butterfly Net',
    image: '/inventory/butterfly_net.png',
    flavor: 'A fine muslin net on a long cane handle for taking insects on the wing.',
    use: 'Capture flying insects',
    bestFor: 'Butterflies, beetles, dragonflies',
    note: 'Sweep with the wind, not against it. A torn wing spoils the specimen.',
  },
  sketch: {
    displayName: 'Field Notebook',
    image: '/inventory/field_notebook.png',
    flavor: 'A pocket field book for locality, behavior, and condition notes.',
    use: 'Document & Sketch',
    bestFor: 'Behavior, habitat, anything too large or rare to take',
    note: 'A good note is better than a ruined specimen. Record locality first.',
  },
  hammer: {
    displayName: 'Geological Hammer',
    image: '/inventory/geological_hammer.png',
    flavor: 'A square-faced hammer and chisel for breaking rock and freeing fossils.',
    use: 'Break & Extract',
    bestFor: 'Rock samples, fossils, embedded minerals',
    note: 'Strike along the grain. Wrap sharp-edged samples before casing them.',
  },
  snare: {
    displayName: 'Twine Snare',
    image: '/inventory/twine.png',
    flavor: 'A looped cord snare, knotted from waxed twine, for wary small creatures.',
    use: 'Snare & Restrain',
    bestFor: 'Lizards, small reptiles, ground birds',
    note: 'Consumes a length of twine per use. Patience matters more than speed.',
  },
  sample: {
    displayName: 'Sample Jar',
    image: '/inventory/sample_jar.png',
    flavor: 'A stoppered glass jar of spirits for soft-bodied or fragile specimens.',
    use: 'Preserve in spirits',
    bestFor: 'Marine life, amphibians, soft tissue samples',
    note: 'Each wet specimen occupies one jar. Syms carries one spare.',
  },
  hands: {
    displayName: 'Bare Hands',
    image: null,
    flavor: 'Sometimes the simplest instrument is the right one.',
    use: 'Pick up & Overturn',
    bestFor: 'Slow creatures, plants, loose stones',
    note: 'Mind the spines, jaws, and the occasional indignant tortoise.',
  },
  shotgun: {
    displayName: 'Shotgun',
    image: '/inventory/shotgun.png',
    flavor: 'A double-barreled fowling piece, the naturalist’s standard for bird specimens.',
    use: 'Collect at distance',
    bestFor: 'Birds in flight, animals that cannot be approached',
    note: 'Fine shot only — a mangled skin is worthless to the Society.',
  },
  compass: {
    displayName: 'Pocket Compass',
    image: '/inventory/compass.png',
    flavor: 'A gimbaled brass compass, its needle steady through every squall.',
    use: 'Orient & Survey',
    bestFor: 'Bearings, locality records, route-finding',
    note: 'Keep it clear of the geological hammer — iron disturbs the needle.',
  },
  pocket_knife: {
    displayName: 'Pocket Knife',
    image: '/inventory/pocket_knife.png',
    flavor: 'A horn-handled folding knife, honed thin from years of use.',
    use: 'Cut & Prepare',
    bestFor: 'Cutting twine, taking plant cuttings, rough dissection',
    note: 'Wipe the blade between specimens to keep samples uncontaminated.',
  },
};

// Field equipment beyond the collection set — present in the kit, selectable
// on the toolbar, but they collect nothing on their own (treated as hands).
const EXTRA_TOOLS = [
  {
    id: 'compass',
    name: 'Pocket Compass',
    description: 'Take bearings and keep locality records honest.',
    action: 'took a bearing near',
    icon: '🧭',
    usage: 'Orientation and survey work; collects nothing on its own.',
  },
  {
    id: 'pocket_knife',
    name: 'Pocket Knife',
    description: 'Cut twine, take cuttings, prepare rough samples.',
    action: 'took a cutting from',
    icon: '🗡️',
    usage: 'Preparation and plant cuttings; pairs with the sample jar.',
  },
];

// Order matches the mockup's equipped-tools list, kit extras after.
const EQUIPPED_ORDER = [
  'magnifier', 'insect_net', 'sketch', 'hammer', 'snare', 'sample',
  'hands', 'shotgun', 'compass', 'pocket_knife',
];

const documentationTool = {
  id: 'sketch',
  name: 'Field Journal',
  description: 'Observe, sketch, and document without taking the specimen.',
  action: 'documented',
  usage: 'Best for cautious observation and educational progress.',
};

const ALL_BASE_ITEMS = [...collectionTools, ...analysisTools, documentationTool, ...EXTRA_TOOLS];

export function getInventoryItem(id) {
  const base = ALL_BASE_ITEMS.find(item => item.id === id);
  if (!base) return null;
  const details = ITEM_DETAILS[id] || {};
  return { ...base, ...details, name: details.displayName || base.name };
}

export const inventoryItems = EQUIPPED_ORDER.map(getInventoryItem).filter(Boolean);

export const SUPPLY_DEFS = [
  { id: 'labels', name: 'Labels', image: '/inventory/labels.png', initial: 12, description: 'Gummed specimen labels. One is spent per specimen cased.' },
  { id: 'pins', name: 'Pins', image: null, initial: 24, description: 'Entomological pins for setting insects. Two per insect.' },
  { id: 'spareJars', name: 'Spare Jars', image: '/inventory/sample_jar.png', initial: 3, description: 'Stoppered jars of spirits for wet specimens.' },
  { id: 'twine', name: 'Twine', image: '/inventory/twine.png', initial: 4, description: 'Waxed twine for snares and bundling. One length per snare set.' },
  { id: 'food', name: 'Food', image: null, initial: 4, description: 'Ship’s biscuit and salt pork. Eaten when resting in the field.' },
  { id: 'water', name: 'Water', image: null, initial: 5, description: 'Fresh water in a canvas-wrapped flask. Drunk when resting.' },
];

export const INITIAL_SUPPLIES = Object.fromEntries(SUPPLY_DEFS.map(def => [def.id, def.initial]));

// Wet specimens occupy a jar of spirits rather than a dry case slot label alone.
export function specimenNeedsJar(specimen, toolId) {
  if (toolId === 'sample') return true;
  return ['Amphibian', 'Fish', 'Marine'].includes(specimen?.order);
}

export function specimenIsInsect(specimen) {
  return specimen?.order === 'Insect';
}
