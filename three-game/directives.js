// Ordered game objectives.
//
// One active objective at a time, shown in the HUD banner. Each entry is a
// line of text plus a predicate over state the game ALREADY tracks — there is
// no separate progress bookkeeping to keep in sync, and nothing here blocks
// play. Ignore the objective entirely and the expedition proceeds; it exists
// to teach the verbs in order and then to suggest what is worth doing next.
//
// The early entries are plain onboarding (move, use a tool, examine, collect).
// The later ones are the comparative work the game is actually about, and they
// only appear once the player has the whole loop.
//
// Three fields of copy, and they must not overlap:
//   text   - the banner line. An instruction, short enough not to wrap.
//   hint   - how. Keys, and the one rule that is not guessable.
//   detail - why. What the objective is for. Shown only when the banner is
//            expanded, so it can run to two sentences. Plain statements; do
//            not restate the hint.

// Words the final assessment already scores as intellectual honesty
// (see noteRigor in finalAssessment.js). Reused here so "record something you
// could not settle" is satisfied by exactly what the ending rewards.
const HEDGE_PATTERN = /\b(perhaps|possibly|probably|appears?|seems?|uncertain|unclear|cannot determine|may be|might be|not sure)\b/i;

function playerNotes(state) {
  return (state.journal || []).filter(entry => entry?.authorship === 'player');
}

export const POST_OFFICE_BAY_SURVEY_TARGET = 3;

// The opening survey counts work actually recorded at Post Office Bay. Journal
// entries carry the collection locality, so travelling elsewhere and finding a
// species that also occurs at the landing cannot silently finish this goal.
export function postOfficeBaySurveyProgress(state) {
  const recorded = new Set();
  for (const entry of state.journal || []) {
    if (entry?.authorship !== 'field-record' || !entry.specimenId) continue;
    // Failed and partial attempts also write field-record entries; only a
    // successful take or a documentation counts as a record.
    if (entry.condition === 'failed' || entry.condition === 'partial evidence' || entry.condition === 'partial_evidence' || entry.condition === 'released') continue;
    const atPostOfficeBay = entry.location === 'Post Office Bay'
      || entry.location?.id === 'POST_OFFICE_BAY'
      || entry.zoneId === 'POST_OFFICE_BAY';
    if (atPostOfficeBay) recorded.add(entry.specimenId);
  }
  return recorded.size;
}

// The journal's field-record entries carry both the species id and the place
// name. Parsing actor ids instead broke on hand-placed spawns, whose authored
// instanceIds are place-named ("post-office-lava-lizard-west"), so the same
// species at two landings never matched.
function collectedByZone(state) {
  const pairs = [];
  for (const entry of state.journal || []) {
    if (entry?.authorship !== 'field-record') continue;
    if (!entry.specimenId || !entry.location) continue;
    if (entry.condition === 'documented in field' || entry.condition === 'released') continue;
    pairs.push({ zoneId: entry.location, species: entry.specimenId });
  }
  return pairs;
}

export const DIRECTIVES = [
  {
    id: 'explore',
    text: 'Record 3 different Post Office Bay specimens',
    hint: 'Examine nearby specimens, then collect or document three different kinds.',
    detail: 'Three distinct records make a useful first survey of the landing. The full regional record remains available for a more complete search.',
    isDone: state => postOfficeBaySurveyProgress(state) >= POST_OFFICE_BAY_SURVEY_TARGET,
  },
  {
    id: 'tool',
    text: 'Take a tool in hand',
    hint: 'Press 1-6, or click a slot on the toolbelt.',
    detail: 'The tool in your hand sets what you can do with an animal. The net and the gun each give a different result, and the sketchbook takes nothing.',
    isDone: state => Boolean(state.activeToolId) && state.activeToolId !== 'hands',
  },
  {
    id: 'examine',
    text: 'Examine something closely',
    hint: 'Approach a specimen with bare hands and press Enter.',
    detail: 'Examining is what puts an animal in your record, and the written note is what Henslow weighs at the end. A specimen taken unexamined fills the case but says nothing.',
    isDone: state => (state.examinedTypeIds || []).length >= 1,
  },
  {
    id: 'collect',
    text: 'Collect your first specimen',
    hint: 'Equip a tool and press E, or collect from the examine view.',
    detail: 'A collected specimen goes back to England for other naturalists to study. It is also dead and gone from the island. The case holds very little, so choose what is worth taking.',
    isDone: state => (state.collectedSpecimenIds || []).length >= 1,
  },
  {
    id: 'syms',
    text: 'Speak with Syms Covington',
    hint: 'Your assistant is somewhere near the landing.',
    detail: 'Covington shoots and skins faster than you do. Most of what reaches England will have passed through his hands.',
    isDone: state => ((state.npcEncounterState || {}).syms_covington?.flags || []).length > 0,
  },
  {
    id: 'travel',
    text: 'Travel inland to another region',
    hint: 'Walk to the edge of the map, or use the island chart.',
    detail: 'One landing tells you what lives at one landing. The highlands, the lava flats, and the shore hold different animals.',
    isDone: state => (state.visitedZoneIds || []).length >= 2,
  },
  {
    id: 'stow',
    text: 'Return to the Beagle and stow your case',
    hint: 'The case only empties aboard ship — and the day only turns there.',
    detail: 'The field case is small and does not empty itself. Stowing it makes room for the next landing, but you cannot reach those specimens again until England, so write up anything you still want to say about them first.',
    isDone: state => (state.shipCollection || []).length >= 1,
  },
  // From here the objectives stop teaching and start suggesting. These are the
  // comparisons the expedition is actually for.
  {
    id: 'write-up',
    text: 'Write up a specimen in your own words',
    hint: 'A note of your own carries more weight than a record entry.',
    detail: 'The automatic record entry shows you were there. A description in your own words shows what you saw, and it is the part of the journal the final assessment reads.',
    isDone: state => playerNotes(state).some(entry => entry.specimenId),
  },
  {
    id: 'two-landings',
    text: 'Collect the same creature at two different landings',
    hint: 'Several species occur across the island. Whether they differ is the question.',
    detail: 'You need two of the same animal from different places before you can compare them. That comparison is what the survey is for.',
    isDone: state => {
      const bySpecies = new Map();
      for (const { zoneId, species } of collectedByZone(state)) {
        if (!bySpecies.has(species)) bySpecies.set(species, new Set());
        bySpecies.get(species).add(zoneId);
      }
      for (const zones of bySpecies.values()) if (zones.size >= 2) return true;
      return false;
    },
  },
  {
    id: 'uncertain',
    text: 'Record one thing you could not settle',
    hint: 'An honest uncertainty is worth more than a confident error.',
    detail: 'Write down what you could not work out, and say so in the note: perhaps, appears, unclear. The assessment counts a hedge you can defend for more than a guess stated as fact.',
    isDone: state => playerNotes(state).some(entry => HEDGE_PATTERN.test(String(entry.content || ''))),
  },
];

const DIRECTIVE_INDEX = new Map(DIRECTIVES.map((directive, index) => [directive.id, index]));

export function getDirective(directiveId) {
  const index = DIRECTIVE_INDEX.get(directiveId);
  return index === undefined ? null : DIRECTIVES[index];
}

// Position in the list, shown in the expanded banner. Not a completion count:
// objectives can be skipped, so this says where you are, not how many you did.
export function getDirectivePosition(directiveId) {
  const index = DIRECTIVE_INDEX.get(directiveId);
  return index === undefined ? null : { position: index + 1, total: DIRECTIVES.length };
}

export const FIRST_DIRECTIVE_ID = DIRECTIVES[0].id;

// Returns the id of the next unfinished objective at or after `directiveId`,
// or null once the list is exhausted. Skipping is deliberate: a player who
// collects something before being asked to should not then be told to.
export function resolveDirective(state, directiveId = FIRST_DIRECTIVE_ID) {
  const start = DIRECTIVE_INDEX.get(directiveId) ?? 0;
  for (let index = start; index < DIRECTIVES.length; index += 1) {
    if (!DIRECTIVES[index].isDone(state)) return DIRECTIVES[index].id;
  }
  return null;
}
