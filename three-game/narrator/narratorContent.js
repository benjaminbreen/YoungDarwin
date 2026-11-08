import { getPlayableNarratorProfile } from './playableNarratorProfiles';

const GENERIC_SPECIMEN_NOTE = 'Careful observation before collection often preserves the most useful evidence: behavior, habitat, and locality.';

const SPECIMEN_LINES = {
  floreanagianttortoise: [
    'The tortoise regards you with the slow patience of a creature long accustomed to ships and shore parties, then turns back toward the scrub.',
    'The great saddle-backed tortoise pauses over the dry stems, apparently judging you too hasty a phenomenon to require much study.',
  ],
  marineiguana: [
    'The marine iguana lies black against black rock, lifting its head only enough to make you feel that the interruption has been noticed.',
    'Salt crusts the iguana\'s snout as it warms itself on the basalt. Now and then it sneezes out a little spray of brine.',
  ],
  lavalizard: [
    'The lava lizard darts two steps, stops, and performs a small territorial bob, as if the volcanic shelf required ceremony.',
    'A lizard flickers across the warm stone, vanishing and reappearing by color more than by speed.',
  ],
  crab: [
    'The Sally Lightfoot crab works the wet basalt with ridiculous elegance, all color and sideways suspicion.',
    'A bright crab slips across the intertidal rock, vanishing into a crack before you can take two careful steps.',
  ],
  flightlesscormorant: [
    'The cormorant waddles along the shelf with reduced wings held close, its wings far too small to fly with.',
  ],
  mediumgroundfinch: [
    'A ground finch hops near the scrub, testing seeds with quick turns of the head and showing no proper respect for human classification.',
  ],
  largegroundfinch: [
    'The finch works at a hard seed with a beak so stout that the rest of the bird appears to have been designed around it.',
  ],
  galapagoscotton: [
    'The cotton shrub stands pale against the dry-zone scrub, its soft leaves looking almost domestic in this severe country.',
  ],
  cactus: [
    'The cactus keeps its water behind a persuasive arrangement of spines; you would do well to admire it from a modest distance.',
  ],
  basalt: [
    'The basalt is broken into hard black slabs, sharp-edged and hot underfoot.',
  ],
  flamingo: [
    'The flamingo feeds in the brackish shallows, head upside down, sweeping its bill through the mud.',
  ],
  booby: [
    'The booby watches you with frank island curiosity, not yet convinced that a naturalist is a dangerous thing.',
  ],
  lavagull: [
    'The lava gull works the swash line alone, lifting its wings the moment your boots become too interesting.',
  ],
  frigatebird: [
    'A frigatebird rides the wind overhead, hardly moving its wings.',
  ],
  sealion: [
    'The sea lion keeps its place with the lazy authority of an animal that has already won the beach.',
  ],
  greenturtle: [
    'The turtle moves slowly through the shallows, surfacing now and then to breathe.',
  ],
  parrotfish: [
    'The parrotfish flashes below the surface, scraping at the coral with its beak.',
  ],
};

const SPECIMEN_NOTES = {
  floreanagianttortoise: 'Tortoise shell shape and island locality mattered to Galapagos observers before their full significance was understood.',
  marineiguana: 'Marine iguanas feed on sea algae, so shore notes should include tide, rock surface, and distance from water.',
  lavalizard: 'Small reptiles are best recorded with behavior and substrate, since color can shift with light and heat.',
  crab: 'Intertidal animals should be described with tide level, rock type, and whether they are feeding or sheltering.',
  flightlesscormorant: 'Wing size, gait, and feeding habitat are more useful here than a mere species label.',
  mediumgroundfinch: 'For finches, beak form and feeding material are the observations most worth preserving.',
  largegroundfinch: 'Seed size and beak size belong in the same note; neither fact explains much alone.',
  galapagoscotton: 'Dry-zone plants should be tied to slope, soil, and nearby browsing animals.',
  cactus: 'Spines, pads, flowers, and nearby animal feeding signs all help turn a plant sighting into evidence.',
  basalt: 'Rock samples are most useful when fresh fracture, weathered surface, and exact locality are all recorded.',
  lavagull: 'For shore birds, note whether they were feeding, walking, or flushed into flight before collection.',
};

const ZONE_LINES = {
  POST_OFFICE_BAY: [
    'Post Office Bay: black rock, blue water, dry scrub, and the Beagle at anchor offshore.',
  ],
  N_SHORE: [
    'The Northern Shore is black sand and pale driftwood, with tracks running along the tideline.',
  ],
  NW_REEF: [
    'The reef lies under clear water: pale shelves of coral, and fish moving in the shadows.',
  ],
  W_HIGH: [
    'The highlands are misty and green, much wetter than the shore below.',
  ],
  EL_MIRADOR: [
    'El Mirador is red dirt and long views over the island.',
  ],
  MANGROVES: [
    'The mangroves grow thick along the shore, their roots standing in shallow pools.',
  ],
  PENAL_COLONY: [
    'The settlement: rows of crops, tools left out, and imported plants struggling in the dry soil.',
  ],
};

const DARWIN_THOUGHTS = {
  POST_OFFICE_BAY: [
    'The Beagle rides at anchor offshore.',
    'The mail barrel stands on its post above the beach.',
  ],
  floreanagianttortoise: [
    'The tortoise has not moved for some time.',
  ],
  marineiguana: [
    'The iguana lies flat on the rock, soaking up the sun.',
  ],
  penal: [
    'The garden rows are dry and badly weeded.',
  ],
  mist: [
    'The fog is making it harder to see the shore.',
    'The higher ground is losing its edges in the wet light.',
  ],
};

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(list, key) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[hashText(key) % list.length];
}

function rareThought(key, odds = 5) {
  return hashText(key) % odds === 0;
}

function textList(value) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
}

function joinNarrationParts(parts, limit = 2) {
  const seen = new Set();
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .filter(part => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .join(' ');
}

export function specimenNarration(specimen, context = {}) {
  if (!specimen) return null;
  const key = String(specimen.id || '').toLowerCase();
  const line = pick(SPECIMEN_LINES[key], `${context.zoneId || ''}:${specimen.instanceId || specimen.id}`);
  const fallback = specimen.description
    ? `The ${String(specimen.name || 'specimen').toLowerCase()} draws you close enough for a better look. ${specimen.description}`
    : null;
  return {
    narration: line || fallback,
    educationalNote: SPECIMEN_NOTES[key] || GENERIC_SPECIMEN_NOTE,
  };
}

export function zoneNarration(zone, context = {}) {
  if (!zone) return null;
  const key = `${zone.id}:${context.day || 1}:${Math.floor(Number(context.timeOfDay) || 0)}:${context.source || 'zone'}`;
  const discovery = pick(textList(zone.discoveries), `${key}:discovery`);
  const feature = pick(textList(zone.notableFeatures), `${key}:feature`);
  const legacyNarration = joinNarrationParts([
    zone.loadingNote || zone.description,
    discovery || feature,
  ]);
  const specific = pick(ZONE_LINES[zone.id], `${zone.id}:${context.day || 1}`);
  return {
    narration: legacyNarration || specific || null,
    educationalNote: zone.educationalNote || zone.narration?.educationalNote || null,
  };
}

export function darwinThought(context = {}) {
  const zoneId = context.zone?.id || context.zoneId;
  const specimenId = String(context.specimen?.id || '').toLowerCase();
  const weather = String(context.weather || '').toLowerCase();
  const timeOfDay = Number(context.timeOfDay);
  const hour = Math.floor(timeOfDay || 0);
  const baseKey = `${zoneId || 'zone'}:${weather || 'weather'}:${hour}`;

  if ((weather === 'misty' || weather === 'drizzle') && DARWIN_THOUGHTS.mist) {
    if (rareThought(`${baseKey}:mist`, 3)) return pick(DARWIN_THOUGHTS.mist, `${zoneId}:${weather}`);
    return null;
  }
  if (specimenId && DARWIN_THOUGHTS[specimenId]) {
    const key = `${baseKey}:${specimenId}`;
    if (rareThought(key, 5)) return pick(DARWIN_THOUGHTS[specimenId], key);
  }
  if (zoneId === 'PENAL_COLONY' && rareThought(`${baseKey}:penal`, 5)) return pick(DARWIN_THOUGHTS.penal, `${zoneId}:${timeOfDay || 0}`);
  if (zoneId && DARWIN_THOUGHTS[zoneId]) {
    const morningOrEvening = !Number.isFinite(timeOfDay) || timeOfDay < 9 || timeOfDay > 16.5;
    const key = `${baseKey}:zone`;
    if (morningOrEvening && rareThought(key, 6)) return pick(DARWIN_THOUGHTS[zoneId], key);
  }
  return null;
}

export function localNarratorFallback({ input, nearbySpecimen, playableModeId = 'darwin' } = {}) {
  const narratorProfile = getPlayableNarratorProfile(playableModeId);
  if (narratorProfile.kind === 'animal') {
    return {
      narration: narratorProfile.fallbackNarration,
      educationalNote: '',
      fieldNote: '',
      darwinThought: '',
      actionDisposition: 'unavailable',
      targetType: 'self',
      fallback: true,
      echo: String(input || '').trim(),
    };
  }
  const target = nearbySpecimen?.name ? ` The ${nearbySpecimen.name.toLowerCase()} supplies no evidence of being impressed.` : '';
  return {
    narration: `You enter the command in the field log, but the world remains stubbornly material.${target}`,
    educationalNote: '',
    fieldNote: '',
    actionDisposition: 'unavailable',
    fallback: true,
    echo: String(input || '').trim(),
  };
}
