import {
  FLOREANA_OPPOSITE_DIRECTIONS,
  FLOREANA_ROUTE_EDGES,
} from '../game-core/floreanaGeography';

// Every route is written twice by the geography (A->B and B->A), which is 112
// lines of copy nobody wants to maintain. Each zone instead carries two short
// fragments — one for leaving it, one for arriving — and the sentence is
// assembled from those plus the route's kind and its change in height. The
// fragments must stay direction-neutral: the verb already says climb or
// descend, so "down to the lagoon" reads as a contradiction going the other way.
//
// level: 0 shore and lowland, 1 rise, 2 highland crown.
const ZONE_TRAVEL = {
  BEAGLE: { level: 0, from: "from the Beagle's side", to: "back to the Beagle's side" },
  POST_OFFICE_BAY: { level: 0, from: 'from the mail barrel at Post Office Bay', to: 'to the mail barrel above the strand' },
  ALT_POST_OFFICE_BAY: { level: 0, from: 'from the bay landing', to: 'to the bay landing' },
  NW_REEF: { level: 0, from: 'from the reef shallows', to: 'onto the reef shallows' },
  N_SHORE: { level: 0, from: 'from the northern strand', to: 'onto the northern strand' },
  N_OUTCROP: { level: 0, from: 'from the bare outcrop', to: 'to a bare outcrop in open water' },
  DEVILS_CROWN: { level: 0, from: 'from the drowned crater', to: 'to the ring of the drowned crater' },
  CORMORANT_BAY: { level: 0, from: 'from the flamingo lagoon', to: 'to the lagoon and its olivine sand' },
  PUNTA_CORMORANT: { level: 0, from: 'from the point', to: 'to the green-sand point' },
  LAVA_FLATS: { level: 0, from: 'off the black lava flats', to: 'onto broken black lava' },
  BLACK_BEACH_SURF: { level: 0, from: 'from the surf off Black Beach', to: 'into the surf off Black Beach' },
  BLACK_BEACH: { level: 1, from: 'from the uplands above Black Beach', to: 'onto the uplands above Black Beach' },
  POST_SCRUB_RISE: { level: 1, from: 'off the scrub rise', to: 'into dry scrub on rising ground' },
  NORTHERN_HIGHLANDS: { level: 2, from: 'from the northern highlands', to: 'into the highland scrub' },
  EASTERN_CLIFFS: { level: 1, from: 'off the eastern headland', to: 'onto a bare eastern headland' },
  COASTAL_SCRUBLAND: { level: 1, from: 'out of the coastal scrub', to: 'into low coastal scrub' },
  EL_MIRADOR: { level: 1, from: 'from the lookout', to: 'to the lookout above the coast' },
  E_MID: { level: 1, from: 'out of the rocky clearing', to: 'into a clearing of loose rock' },
  W_LAVA: { level: 1, from: 'across the western lowlands', to: 'into the western lowlands' },
  W_HIGH: { level: 2, from: 'from the western highlands', to: 'into the western highlands' },
  C_HIGH: { level: 2, from: 'from Cerro Pajas', to: 'to the shoulder of Cerro Pajas' },
  ASILO_SPRING: { level: 2, from: 'from the highland spring', to: 'to the highland spring' },
  WATKINS_CREEK: { level: 2, from: 'from the creek fork', to: 'to where the highland creek forks' },
  PENAL_COLONY: { level: 2, from: 'out of the penal colony', to: 'into the penal colony clearing' },
  WATKINS: { level: 1, from: "from Watkins's camp", to: "to Watkins's camp" },
  S_HUT: { level: 0, from: 'from the hut on the beach', to: 'to a hut above the beach' },
  SW_BEACH: { level: 0, from: 'from the iguana colony', to: 'to the marine iguana colony' },
  SW_CLIFFS: { level: 0, from: 'off the southwestern cliffs', to: 'to the southwestern cliffs' },
  MANGROVES: { level: 0, from: 'out of the southern forest', to: 'into the southern forest' },
  S_INTERTIDAL: { level: 0, from: 'off the intertidal flats', to: 'onto the intertidal flats' },
  S_VOLCANIC: { level: 0, from: 'across the basalt plains', to: 'onto the basalt plains' },
  S_WETLANDS: { level: 0, from: 'out of the wetland forest', to: 'into the wetland forest' },
  PUNTA_SUR: { level: 0, from: 'from Punta Sur', to: 'to the surf at Punta Sur' },
  S_REEFS: { level: 0, from: 'from the southern reefs', to: 'to the southern reefs' },
  SE_COAST: { level: 0, from: 'off the southeastern coast', to: 'onto the southeastern coast' },
  SE_PROMONTORY: { level: 0, from: 'off the windy promontory', to: 'onto a wind-scoured promontory' },
  SE_SHALLOW_SURF: { level: 0, from: 'out of the shallow surf', to: 'into the shallow surf' },
};

const COMPASS = { N: 'north', S: 'south', E: 'east', W: 'west' };

const ROUTE_DIRECTIONS = (() => {
  const map = new Map();
  for (const [fromId, direction, toId, kind] of FLOREANA_ROUTE_EDGES) {
    map.set(`${fromId}>${toId}`, { direction, kind });
    map.set(`${toId}>${fromId}`, {
      direction: FLOREANA_OPPOSITE_DIRECTIONS[direction],
      kind,
    });
  }
  return map;
})();

function travelVerb(kind, rise) {
  if (kind === 'water') return 'row';
  if (kind === 'creek') return 'follow the creek';
  if (rise >= 2) return 'climb steadily';
  if (rise > 0) return 'climb';
  if (rise <= -2) return 'drop';
  if (rise < 0) return 'descend';
  return 'walk';
}

// One short sentence describing the walk itself, for the travel interstitial.
// Returns null for any pair the geography does not connect, so callers keep
// their existing fallbacks.
export function travelFlavorLine(fromZoneId, toZoneId) {
  if (!fromZoneId || !toZoneId || fromZoneId === toZoneId) return null;
  const route = ROUTE_DIRECTIONS.get(`${fromZoneId}>${toZoneId}`);
  const origin = ZONE_TRAVEL[fromZoneId];
  const destination = ZONE_TRAVEL[toZoneId];
  if (!route || !origin || !destination) return null;
  const verb = travelVerb(route.kind, destination.level - origin.level);
  const heading = COMPASS[route.direction];
  return `You ${verb}${heading ? ` ${heading}` : ''} ${origin.from} ${destination.to}.`;
}

export default travelFlavorLine;
