// What it takes to collect a subject: which tools suit it, and whether the
// catch is decided in the world or simply happens.
//
// There is no hidden roll. A tool that does not suit the subject is refused up
// front, with advice naming the tool that does (nothing is spent and nothing
// is written in the journal). With a suitable tool, a still subject (a plant,
// a rock, a barnacle, a bird already shot) is taken. A subject that moves and
// flees has to be caught by the player: the net's hoop has to close over it,
// a hand has to reach it before it bolts, a bird has to be shot and picked up.
// Island tameness (wildlife/wariness.js) is what makes a hand catch possible
// at all: a tame animal lets Darwin within arm's reach, a wary one does not.

import { classifySpecimen } from '../utils/expeditionSystems';
import { getWildlifeBehaviorProfile } from './wildlife/wildlifeCatalog';

// Suitable tools per kind of subject (classifySpecimen), best first.
export const CATCH_TOOLS = Object.freeze({
  insect: ['insect_net'],
  // Darwin caught tame finches and doves by hand and with his hat.
  small_bird: ['hands', 'insect_net', 'shotgun'],
  bird: ['shotgun'],
  seabird: ['shotgun'],
  mammal: ['shotgun'],
  lizard: ['hands'],
  tortoise: ['hands'],
  crustacean: ['hands'],
  marine: ['hands', 'insect_net'],
  animal: ['hands'],
  plant: ['hands', 'pocket_knife'],
  mineral: ['hammer', 'hands'],
  object: ['hands'],
});

// Species that break their kind's rule. Darwin's doves were tame enough to
// knock down or take by hand.
const CATCH_TOOLS_BY_SPECIES = Object.freeze({
  galapagosdove: ['shotgun', 'hands'],
});

// The hand catch. Darwin can lunge at something up to `startReach` away; at
// the moment his hand closes the animal must still be within `closeReach`.
export const HAND_CATCH = Object.freeze({
  startReach: 1.6,
  closeReach: 1.35,
  // Fraction of the gather clip at which the hand closes.
  strikeFraction: 0.42,
});

// Net swings further away than this cannot reach (pole plus one step).
export const NET_START_REACH = 2.3;

const TOOL_NAMES = {
  hands: 'bare hands',
  insect_net: 'insect net',
  shotgun: 'shotgun',
  hammer: 'hammer',
  pocket_knife: 'pocket knife',
  sketch: 'sketchbook',
};

export function toolDisplayName(toolId) {
  return TOOL_NAMES[toolId] || String(toolId || 'tool').replace(/_/g, ' ');
}

export function isLiveQuarry(specimen) {
  if (String(specimen?.ontology || '').toLowerCase() !== 'animal') return false;
  return Boolean(specimen.pollinator || getWildlifeBehaviorProfile(specimen.id));
}

function suitableTools(kind) {
  return CATCH_TOOLS[kind] || null;
}

function slotLabel(toolId, toolbarOrder) {
  const index = (toolbarOrder || []).indexOf(toolId);
  return index >= 0 ? ` (${index + 1})` : '';
}

const PROPER_LEADING_WORD = /^(Floreana|Gal[aá]pagos|American|Sally|Jacko)\b/i;

// "Galápagos Carpenter Bee" -> "Galápagos carpenter bee": lower case for a
// sentence, keeping a leading place or person name.
export function casualName(specimen) {
  const name = String(specimen?.name || 'specimen');
  const lower = name.toLowerCase();
  return PROPER_LEADING_WORD.test(name) ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

const lowerName = casualName;

// Why this tool is wrong, in a line, then what to use instead.
function wrongToolAdvice({ specimen, kind, toolId, bestToolId, toolbarOrder }) {
  const name = lowerName(specimen);
  const take = `Take up the ${toolDisplayName(bestToolId)}${slotLabel(bestToolId, toolbarOrder)}.`;
  if (bestToolId === 'hands') {
    const useHands = `Put the ${toolDisplayName(toolId)} away and use your hands${slotLabel('hands', toolbarOrder)}.`;
    if (toolId === 'insect_net') return `A ${name} slips out from under a net hoop. ${useHands}`;
    if (toolId === 'shotgun') return `Shot would ruin a ${name}. ${useHands}`;
    if (toolId === 'hammer') return `The hammer would only smash the ${name}. ${useHands}`;
    return `The ${toolDisplayName(toolId)} is no use on a ${name}. ${useHands}`;
  }
  if (kind === 'insect' && toolId === 'hands') return `Bare hands crush an insect and rub the colour off its wings. ${take}`;
  if (kind === 'insect') return `The ${toolDisplayName(toolId)} would destroy a ${name}. ${take}`;
  if (bestToolId === 'shotgun' && (toolId === 'hands' || toolId === 'insect_net')) {
    return `A ${name} is too large and too quick to take with ${toolId === 'hands' ? 'your hands' : 'a net'}. ${take}`;
  }
  return `The ${toolDisplayName(toolId)} is the wrong tool for a ${name}. ${take}`;
}

// How a collection attempt on `specimen` with `toolId` goes. Kinds:
//   document  - sketchbook, or a species already in the case
//   take      - a still subject with a suitable tool: collected outright
//   pickup    - an animal already shot, or already in the net: taken outright
//   hand      - a live animal by hand: decided by the grab in the world
//   net       - a live animal by net: decided by the hoop in the world
//   shoot     - a live animal with the gun: it has to be shot first
//   wrongTool - refused, with `advice` and the `bestToolId` to switch to
export function catchPlan({ specimen, toolId = 'hands', downed = false, alreadyCollected = false, toolbarOrder = [] } = {}) {
  if (!specimen) return null;
  if (toolId === 'sketch' || alreadyCollected) return { kind: 'document', toolId };
  if (downed) return { kind: 'pickup', toolId };
  const kind = classifySpecimen(specimen);
  const tools = CATCH_TOOLS_BY_SPECIES[specimen.id] || suitableTools(kind);
  if (tools && !tools.includes(toolId)) {
    const bestToolId = tools.find(id => (toolbarOrder || []).includes(id)) || tools[0];
    const advice = wrongToolAdvice({ specimen, kind, toolId, bestToolId, toolbarOrder });
    // The same reason, for when the game makes the change itself.
    const why = advice.split(/(?<=\.) /)[0];
    return {
      kind: 'wrongTool',
      toolId,
      bestToolId,
      advice,
      switchedLine: bestToolId === 'hands'
        ? `${why} You put the ${toolDisplayName(toolId)} away.`
        : `${why} You take up the ${toolDisplayName(bestToolId)}.`,
      shortLabel: `Needs the ${toolDisplayName(bestToolId)}${slotLabel(bestToolId, toolbarOrder)}`,
    };
  }
  if (!isLiveQuarry(specimen)) return { kind: 'take', toolId };
  if (toolId === 'insect_net') return { kind: 'net', toolId };
  if (toolId === 'shotgun') return { kind: 'shoot', toolId };
  return { kind: 'hand', toolId };
}

// The line shown when a hand grab misses, naming what actually went wrong.
export function handMissReason({ specimen, startDistance, endDistance, playerWasRunning = false }) {
  const name = lowerName(specimen);
  if (playerWasRunning) {
    return `The ${name} saw you coming at a run and was gone before your hand closed. Walk the last few steps.`;
  }
  if (endDistance > startDistance + 0.25) {
    return `The ${name} edged away as you reached. Let it settle, then come in slower.`;
  }
  return `Your hand closed just short of the ${name}. Take one more step before you grab.`;
}

export function tooFarReason({ specimen, toolId, tier = 'tame' }) {
  const name = lowerName(specimen);
  if (tier === 'wary') return `The ${name} will not let you near. Animals of its kind here have learned to fear you.`;
  if (toolId === 'insect_net') return `The ${name} is beyond the net's reach. Get within a couple of paces.`;
  return `The ${name} is out of reach. Walk up slowly; an untroubled animal here lets you come surprisingly close.`;
}

// The line for a successful take, written for how it was actually done.
// `method`: 'hand', 'net', 'shot' (picked up after shooting) or 'take'.
export function catchSuccessLine({ specimen, method, damaged = false }) {
  const name = lowerName(specimen);
  const kind = classifySpecimen(specimen);
  let line;
  if (method === 'hand') {
    if (kind === 'lizard') line = `You pin the ${name} lightly behind the head and lift it, tail lashing, into a bag.`;
    else if (kind === 'small_bird' || kind === 'bird') line = `You cup the ${name} in both hands. It hardly struggles; it had no reason to fear you.`;
    else if (kind === 'crustacean') line = `You take the ${name} from behind, clear of its claws.`;
    else if (kind === 'tortoise') line = `You lift the ${name}; it draws in its head and hisses.`;
    else line = `You close your hand over the ${name} and lift it.`;
  } else if (method === 'net') {
    line = `The hoop closes over the ${name}. You twist the bag shut and work it into a paper.`;
  } else if (method === 'shot') {
    line = `You pick up the ${name} where it fell.`;
  } else {
    line = `You take the ${name} and wrap it for the case.`;
  }
  return damaged ? `${line} It is damaged, and worth less to the naturalists at home; a careful label will have to make up for it.` : line;
}
