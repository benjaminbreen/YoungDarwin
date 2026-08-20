// Field-kit registry for the Inventory & Tools modal: painted item art,
// museum-card copy (use / best for / note), supplies, and capacity rules.
import { tools as analysisTools, collectionTools } from './tools';

// Ten slots: tight enough that every take is a decision, and a full case
// forces the choice between retiring to the Beagle and releasing something.
export const CASE_CAPACITY = 10;

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
  'magnifier', 'insect_net', 'sketch', 'hammer', 'sample',
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

// `initial` is what the first landing carries and also the most that can be
// carried. `nightly` is what the hold gives up each evening, added to whatever
// came back unused — a frugal day is worth something on the next one.
export const SUPPLY_DEFS = [
  { id: 'provisions', name: 'Provisions', image: null, initial: 4, nightly: 3, description: 'Meals of ship’s biscuit, salt pork, and water. Darwin eats one every six hours in the field; go without and he weakens until the crew carries him back.' },
];

export const INITIAL_SUPPLIES = Object.fromEntries(SUPPLY_DEFS.map(def => [def.id, def.initial]));
export const NIGHTLY_SUPPLY_DRAW = Object.fromEntries(SUPPLY_DEFS.map(def => [def.id, def.nightly]));

// A night aboard: add the ration to what came back, never past what the case
// and pockets hold. `bonus` covers Syms's extra jars, which are carried on his
// person and so raise the ceiling too.
export function drawNightlySupplies(current = {}, bonus = {}) {
  const drawn = {};
  for (const def of SUPPLY_DEFS) {
    const ceiling = def.initial + (bonus[def.id] || 0);
    const held = Math.max(0, Number(current[def.id]) || 0);
    drawn[def.id] = Math.min(ceiling, held + def.nightly);
  }
  return drawn;
}
