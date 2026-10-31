// Small resident populations around the authored animals of a landing.
//
// One finch per landing could never show a flock going up together, two
// lizards answering each other's push-ups, or several birds gleaning one
// tortoise, and it made the measurement survey's "several animals at each
// place" impossible. Each entry here scatters a few more of a species around
// the authored animal's ground (same habitat radius), as ambient wildlife:
// they are SpecimenActors like any other, examinable, measurable, and run by
// the same behaviour brains.
//
// Counts are modest on purpose: every actor is a live rig and a brain.

import { isWalkableTerrain } from '../terrain';
import { buildAmbientWildlifeLayer } from './ambientWildlife';

// zoneId -> [{ speciesId, count, center: [x, z], spread: [rx, rz], habitat: [rx, rz] }]
export const FAUNA_POPULATIONS = {
  POST_OFFICE_BAY: [
    { speciesId: 'lavalizard', count: 3, center: [44, 17], spread: [5, 4], habitat: [3.4, 2.6] },
    { speciesId: 'lavalizard', count: 2, center: [-51, 17], spread: [4, 4], habitat: [3.4, 2.6] },
  ],
  LAVA_FLATS: [
    { speciesId: 'lavalizard', count: 4, center: [7.6, -7.2], spread: [6, 5], habitat: [3.4, 2.6] },
  ],
  NORTHERN_HIGHLANDS: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [13, 18], spread: [5, 4], habitat: [5.2, 3.2] },
    { speciesId: 'largegroundfinch', count: 2, center: [-14, -8], spread: [5, 4], habitat: [6.2, 4.2] },
    { speciesId: 'mediumgroundfinch', count: 2, center: [-13, 35], spread: [4, 3], habitat: [5.2, 3.2] },
    { speciesId: 'floreanagianttortoise', count: 1, center: [-9, 38], spread: [3, 3], habitat: [7.2, 4.8] },
  ],
  C_HIGH: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [14.5, 15], spread: [5, 4], habitat: [5.2, 3.2] },
    { speciesId: 'mediumgroundfinch', count: 2, center: [-8.5, -12], spread: [4, 3], habitat: [5.2, 3.2] },
    { speciesId: 'largegroundfinch', count: 1, center: [-30, 9], spread: [4, 4], habitat: [6.2, 4.2] },
  ],
  ASILO_SPRING: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [2.5, 17], spread: [5, 4], habitat: [5.2, 3.2] },
    { speciesId: 'mediumgroundfinch', count: 2, center: [-16, 5.5], spread: [4, 3], habitat: [5.2, 3.2] },
  ],
  E_MID: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [-17.8, 6.4], spread: [5, 4], habitat: [5.2, 3.2] },
    { speciesId: 'lavalizard', count: 3, center: [11.2, -4.8], spread: [5, 4], habitat: [3.4, 2.6] },
  ],
  POST_SCRUB_RISE: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [-8, 23], spread: [5, 4], habitat: [5.2, 3.2] },
    { speciesId: 'lavalizard', count: 3, center: [17, 1], spread: [5, 4], habitat: [3.4, 2.6] },
  ],
  COASTAL_SCRUBLAND: [
    { speciesId: 'floreanamockingbird', count: 3, center: [17, -3], spread: [6, 5], habitat: [6.4, 4.4] },
  ],
  W_HIGH: [
    { speciesId: 'floreanamockingbird', count: 2, center: [8.8, -15.5], spread: [5, 4], habitat: [6.4, 4.4] },
  ],
  PENAL_COLONY: [
    { speciesId: 'mediumgroundfinch', count: 3, center: [-2, 2], spread: [7, 5], habitat: [5.2, 3.2] },
    { speciesId: 'floreanamockingbird', count: 2, center: [-6, 10], spread: [6, 5], habitat: [6.4, 4.4] },
  ],
  WATKINS_CREEK: [
    { speciesId: 'mediumgroundfinch', count: 2, center: [19, -10.5], spread: [4, 4], habitat: [5.2, 3.2] },
    { speciesId: 'mediumgroundfinch', count: 2, center: [-27, 10.5], spread: [4, 3], habitat: [5.2, 3.2] },
  ],
  EL_MIRADOR: [
    { speciesId: 'largegroundfinch', count: 2, center: [17.5, 20.5], spread: [5, 4], habitat: [6.2, 4.2] },
  ],
};

function seedFor(zoneId, index) {
  let hash = 0;
  const text = `${zoneId}:${index}`;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return 50000 + (hash % 40000);
}

export function buildFaunaPopulationLayers(zoneId) {
  const entries = FAUNA_POPULATIONS[zoneId];
  if (!entries) return [];
  return entries.map((entry, index) => buildAmbientWildlifeLayer(zoneId, {
    id: `population-${entry.speciesId}-${index}`,
    speciesId: entry.speciesId,
    count: entry.count,
    seed: seedFor(zoneId, index),
    bounds: {
      minX: entry.center[0] - entry.spread[0],
      maxX: entry.center[0] + entry.spread[0],
      minZ: entry.center[1] - entry.spread[1],
      maxZ: entry.center[1] + entry.spread[1],
    },
    scale: [0.94, 1.06],
    maxGrade: 0.6,
    accept: (biome, x, z) => isWalkableTerrain(x, z, zoneId),
    habitatRadiusX: entry.habitat[0],
    habitatRadiusZ: entry.habitat[1],
  })).filter(layer => layer.items.length);
}

export function applyFaunaPopulations(zoneId, ecology) {
  const layers = buildFaunaPopulationLayers(zoneId);
  if (!layers.length || !ecology) return ecology;
  return {
    ...ecology,
    ambientWildlife: [...(ecology.ambientWildlife || []), ...layers],
  };
}
