// How a growth form answers a body shouldering through it.
//
// The old push field used one authored `bend` number per ecology layer, so a
// mangrove trunk and a saltbush were the same effect at different strengths:
// a static lean that depended only on where Darwin stood. These profiles split
// that into the two things that actually differ between plants.
//
// `pushAmp` and `maxTipTravel` are both fractions of the plant's OWN height,
// never absolute metres — a sedge and a mangrove must sit at the same ratio
// of drive to saturation limit or the small one is permanently clipped and
// stops responding to how fast you walked into it.
//
// `maxTipTravel` is the realism knob — the fraction of its own height a plant's
// tips may travel before the push saturates. It is estimated per growth form
// (roughly what a walking adult gets out of a real plant of that build) rather
// than authored per layer, so a 4 m palo santo cannot lean like a sedge no
// matter what its layer asked for.
//
// `spring` is the feel knob. It is a three-tap difference over lagged copies of
// Darwin's position that turns the static proximity field into a damped
// oscillator with no per-plant state at all — see `foliageMotion.js`. Weights
// are (lead, mid, trail) and MUST satisfy lead - mid + trail === 1 so that a
// sustained lean settles at exactly the authored deflection; the spread between
// them is what overshoots on contact and whips back on release.

const LEAF_CANOPY_TRAVEL = 2.15;
const LEAF_CANOPY_WHIP = 1.3;

export const FOLIAGE_PUSH_PROFILES = {
  // Blades fold nearly flat and stand back up in a blink.
  grass: {
    label: 'grass, sedge, reed',
    pushAmp: 0.45,
    maxTipTravel: 0.72,
    spring: [1.905, 1.287, 0.382],
    timing: [0.0, 0.1],
    drag: 0.72,
    tipWhip: 0.3,
    recoilRatio: 0.5,
    bendDown: 0.42,
    referenceBend: 0.22,
    contactKind: 'grass',
  },
  // Soft-stemmed forbs: cotton, delilia, vines. Big give, obvious rebound.
  herb: {
    label: 'soft-stemmed herb or vine',
    pushAmp: 0.32,
    maxTipTravel: 0.52,
    spring: [1.937, 1.366, 0.429],
    timing: [0.06, 0.16],
    drag: 0.6,
    tipWhip: 0.45,
    recoilRatio: 0.42,
    bendDown: 0.3,
    referenceBend: 0.3,
    contactKind: 'shrub',
  },
  // The island default: saltbush, scalesia scrub, darwiniothamnus. Parts
  // around you and returns with one clear swing.
  shrub: {
    label: 'leafy shrub',
    pushAmp: 0.22,
    maxTipTravel: 0.36,
    spring: [1.863, 1.311, 0.448],
    timing: [0.12, 0.24],
    drag: 0.46,
    tipWhip: 0.55,
    recoilRatio: 0.33,
    bendDown: 0.18,
    referenceBend: 0.3,
    contactKind: 'shrub',
  },
  // Lignified stems — croton, lecocarpus, maytenus. The base holds; the
  // outer twigs do most of the moving.
  woodyShrub: {
    label: 'woody shrub',
    pushAmp: 0.14,
    maxTipTravel: 0.22,
    spring: [1.846, 1.195, 0.349],
    timing: [0.2, 0.34],
    drag: 0.3,
    tipWhip: 0.8,
    recoilRatio: 0.28,
    bendDown: 0.11,
    referenceBend: 0.28,
    contactKind: 'shrub',
  },
  // A trunk thin enough to feel: it gives a few degrees and the crown swings.
  sapling: {
    label: 'sapling or thin-trunked tree',
    pushAmp: 0.1,
    maxTipTravel: 0.16,
    spring: [1.858, 1.122, 0.264],
    timing: [0.26, 0.4],
    drag: 0.22,
    tipWhip: 1.0,
    recoilRatio: 0.25,
    bendDown: 0.07,
    referenceBend: 0.06,
    contactKind: 'shrub',
  },
  // Mature wood. Shouldering it stirs the canopy and nothing else — which is
  // the honest answer, and still far more feedback than a frozen trunk.
  tree: {
    label: 'mature tree',
    pushAmp: 0.034,
    maxTipTravel: 0.055,
    spring: [1.749, 0.949, 0.2],
    timing: [0.34, 0.48],
    drag: 0.14,
    tipWhip: 1.25,
    recoilRatio: 0.22,
    bendDown: 0.03,
    referenceBend: 0.035,
    contactKind: 'shrub',
  },
  // Opuntia, candelabra, lava cactus: rigid water-filled columns. A token
  // creak so contact registers, nothing more.
  succulent: {
    label: 'cactus or succulent',
    pushAmp: 0.019,
    maxTipTravel: 0.03,
    spring: [1.248, 0.31, 0.062],
    timing: [0.3, 0.42],
    drag: 0.06,
    tipWhip: 0.14,
    recoilRatio: 0.15,
    bendDown: 0.02,
    referenceBend: 0.05,
    contactKind: 'shrub',
  },
};

export const DEFAULT_FOLIAGE_PUSH_PROFILE = 'shrub';

// Most specific first: `lava-cactus` must not fall through to `tree` on the
// strength of some other token in the same path.
const PROFILE_PATTERNS = [
  ['succulent', /opuntia|cact(?:us|i)|prickly.?pear|candelabra|succulent|agave|aloe|jasminocereus/],
  ['grass', /grass|sedge|reed|rush|tussock|meadow|fern|crop|ground.?plant|clover|turf/],
  ['herb', /cotton|delilia|sicyos|vine|creeper|herb|forb|flower|blossom|alternanthera|portulaca|ipomoea|passiflora|tribulus|heliotropium/],
  ['tree', /palo.?santo|mangrove|manzanillo|acacia|bursera|piscidia|\btree\b|\btrunk\b|canopy/],
  ['sapling', /sapling|seedling|young.?tree|\bstem\b/],
  ['woodyShrub', /croton|lecocarpus|maytenus|castela|cordia|waltheria|parkinsonia|woody|\bbrush\b|deadwood|\btwig/],
  ['shrub', /saltbush|scalesia|darwiniothamnus|tiquilia|chamaesyce|shrub|scrub|bush|hedge|thicket/],
];

// Layer ids and asset paths are the only species signal that reliably reaches
// the renderer, so classify off those and let any layer override explicitly
// with `motion.profile`.
export function classifyFoliagePushProfile(descriptor = {}) {
  const text = `${descriptor.id || ''} ${descriptor.path || ''} ${descriptor.label || ''}`.toLowerCase();
  if (!text.trim()) return DEFAULT_FOLIAGE_PUSH_PROFILE;
  for (const [name, pattern] of PROFILE_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return DEFAULT_FOLIAGE_PUSH_PROFILE;
}

// Resolve the runtime push response for one material.
//
// `bend` stays meaningful as a per-layer trim: it is read relative to the
// profile's reference so today's authored values land near 1.0, and a layer
// that deliberately asked for half the usual bend still gets half. Absolute
// realism now comes from the profile, not from the number.
export function resolveFoliagePush(motion = {}, descriptor = {}) {
  const requested = motion.profile ?? descriptor.profile;
  const name = FOLIAGE_PUSH_PROFILES[requested]
    ? requested
    : classifyFoliagePushProfile({
      id: descriptor.id ?? motion.id,
      path: descriptor.path ?? motion.path,
      label: descriptor.label ?? motion.label,
    });
  const profile = FOLIAGE_PUSH_PROFILES[name];
  const authoredBend = Number.isFinite(motion.bend) ? Math.max(0, motion.bend) : profile.referenceBend;
  const trim = Math.min(1.8, Math.max(0.35, authoredBend / profile.referenceBend));

  // Bark and leaves come off the same generated tree; only the leaves should
  // read as a crown that stirs.
  const isLeaf = descriptor.part === 'leaf';
  const travel = profile.maxTipTravel * (isLeaf ? LEAF_CANOPY_TRAVEL : 1);
  const whip = profile.tipWhip * (isLeaf ? LEAF_CANOPY_WHIP : 1);

  return {
    name,
    contactKind: profile.contactKind,
    amp: profile.pushAmp * trim,
    // Authored overrides win — a few layers tune these directly.
    maxBendHeightRatio: Number.isFinite(motion.maxBendHeightRatio) ? motion.maxBendHeightRatio : travel,
    bendDown: Number.isFinite(motion.bendDown) ? motion.bendDown : profile.bendDown,
    spring: profile.spring,
    timing: profile.timing,
    drag: Number.isFinite(motion.pushDrag) ? motion.pushDrag : profile.drag,
    tipWhip: Number.isFinite(motion.tipWhip) ? motion.tipWhip : whip,
    recoilRatio: Number.isFinite(motion.recoilRatio) ? motion.recoilRatio : profile.recoilRatio,
  };
}
