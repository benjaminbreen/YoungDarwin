// Copy for the two-hour halt in the field.
//
// Rest now spends the expedition's scarcest resource — two of the forty-odd
// working hours a three-day survey has — so it is worth a line rather than a
// silent change to a bar. Built the same way as travelFlavor: one fragment for
// the ground Darwin lay down on, one for the hour, assembled at read time. That
// keeps 39 regions x 6 hours legible without authoring 234 sentences.
//
// A handful of places have enough character to override the terrain fragment;
// everywhere else the region type carries it.

// Ordered latest-first so the lookup is a single scan. `from` is inclusive.
// Floreana sits on the equator: first light near 6, full dark near 19.
const PERIODS = [
  {
    id: 'night',
    from: 19.5,
    label: 'Night halt',
    clause: 'There is nothing to be done in the dark but wait for it to end.',
  },
  {
    id: 'dusk',
    from: 17.5,
    label: 'Dusk halt',
    clause: 'The light is going fast, as it does on the line, and takes the colour with it.',
  },
  {
    id: 'afternoon',
    from: 14.5,
    label: 'Afternoon halt',
    clause: 'The heat is off the worst of it and the shadows have started to lengthen.',
  },
  {
    id: 'midday',
    from: 10.5,
    label: 'Midday halt',
    clause: 'The sun stands almost overhead and there is no shadow worth lying in.',
  },
  {
    id: 'morning',
    from: 6.5,
    label: 'Morning halt',
    clause: 'The day is still cool enough to be pleasant, and will not stay so.',
  },
  { id: 'dawn', from: 0, label: 'First-light halt', clause: 'The light is coming up grey and the ground has not yet warmed.' },
];

// Keyed on the authored region `type`. Present tense, no metaphors: this is a
// naturalist noting where he stopped, not a travel writer.
const TERRAIN = {
  bay: 'You sit down on the warm sand above the tide line with your back to a barrel.',
  beach: 'You sit down on dry sand above the wrack line and let the surf do the talking.',
  beagle: 'You take a turn below and lie down in the cabin with the timbers working around you.',
  reef: 'You haul out onto dry rock above the shallows and let the salt dry on your arms.',
  ocean: 'There is nowhere here to lie down properly, so you rest sitting, wet through.',
  coastallava: 'You find a slab of lava flat enough to sit on. It holds the heat long after the sun has moved.',
  coastalTrail: 'You stop where the trail runs above the water and sit with your boots over the edge.',
  lavafield: 'You clear a patch of clinker with your heel and sit on the broken rock.',
  scrubland: 'You get into what shade the scrub offers, which is little, and sit with your hat over your face.',
  clearing: 'You sit on a loose block at the edge of the clearing with the ground open in front of you.',
  grassland: 'You lie down in the dry grass and let it close over you.',
  highland: 'You sit on the turf with the whole coast laid out below and the wind steady off it.',
  forest: 'You sit against a trunk in the green light and listen to water moving somewhere out of sight.',
  wetland: 'You find dry ground at the margin and sit where the mud stops and the footing begins.',
  cliff: 'You sit back from the edge with the birds working the updraught below you.',
  promontory: 'You get down out of the wind behind the rock and stay there.',
  settlement: 'You sit on a stump at the edge of the clearing, aware of being watched.',
  camp: 'You sit down by the cold ashes of somebody else’s fire.',
  hut: 'You sit in the doorway of the hut, half in shade and half out of it.',
  cave: 'You sit just inside the mouth of the cave where the air is cool and the light still reaches.',
};

// Places specific enough to earn their own line.
const ZONE_REST = {
  POST_OFFICE_BAY: 'You sit down in the sand beside the mail barrel, among the boards left by ships that have already gone.',
  PENAL_COLONY: 'You sit at the edge of the clearing. The work does not stop because you have stopped.',
  WATKINS: 'You sit down in the ruin of Watkins’s camp, where somebody kept himself alive for years on very little.',
  DEVILS_CROWN: 'You rest on the rim of the drowned crater with deep water on both sides of you.',
  PUNTA_CORMORANT: 'You sit on the green sand above the lagoon and watch the flamingos work the shallows.',
  EL_MIRADOR: 'You sit at the lookout. From here the island is small enough to take in at one go.',
  S_HUT: 'You sit against the wall of the hut, out of the wind, in sand that somebody swept once.',
  MANGROVES: 'You find a root dry enough to sit on and let the mosquitoes find you.',
  LAVA_FLATS: 'You sit on black rock that has been storing the sun since morning, and stand up sooner than you meant to.',
};

const FALLBACK_TERRAIN = 'You find level ground, sit down, and let the pack off your shoulders.';

export function restPeriod(timeOfDay) {
  const hour = ((Number(timeOfDay) || 0) % 24 + 24) % 24;
  return PERIODS.find(period => hour >= period.from) || PERIODS[PERIODS.length - 1];
}

// `provisioned` is the store's own test: biscuit and water both in hand. An
// unprovisioned halt still passes two hours, which is the point of saying so.
export function restFlavor({ zoneId, zoneType, timeOfDay, provisioned = true } = {}) {
  const period = restPeriod(timeOfDay);
  const place = ZONE_REST[zoneId] || TERRAIN[zoneType] || FALLBACK_TERRAIN;
  const provision = provisioned
    ? 'Biscuit and water, and Syms reorders the case while you are down.'
    : 'There is nothing left to eat or drink, and two hours of lying still does not make up for it.';
  return {
    periodId: period.id,
    title: period.label,
    line: `${place} ${period.clause}`,
    provision,
  };
}

export default restFlavor;
