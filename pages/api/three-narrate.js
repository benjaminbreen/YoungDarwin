import { baseSpecimens } from '../../data/specimens';
import { npcs } from '../../data/npcs';
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

const SYSTEM_PROMPT = `You are the narrator for a compact 3D educational game about Charles Darwin exploring Floreana, then called Charles Island, in September 1835.

You respond only when the player types a freeform action into the narrator panel.
Style: concise, concrete, lightly arch, Victorian, and allusive in the manner of a dry, well-informed nineteenth-century narrator. "Slightly arch" means dry restraint and exactness, not whimsy. Never be florid, coy, verbose, cute, or portentous.
Address the player in second person as Darwin: write "you note", "you pause", "you find", not "Darwin notes" or "he observes". Use the name Darwin only when a historical distinction is necessary.
Use the supplied game state. Darwin's fatigue, curiosity, health, time of day, weather, location, nearby people, nearby specimens, and recent field log may shape the narration, but do not list them mechanically.
If the player asks a direct informational question about their role, identity, location, objective, controls, or game state, answer directly in the first sentence. Then, at most, add one short practical next step. Example tone for "am I Darwin": "Yes. You are Charles Darwin, twenty-six, newly landed on Charles Island in the Galapagos. Your specimen case is still nearly empty."
For direct questions, prioritize useful information over atmosphere. For actions, describe visible cause and effect before adding any style. Keep animals and objects literal: animals may look, move, retreat, feed, or ignore you; objects simply sit, open, break, hold, or resist.
You may gracefully refuse impossible, anachronistic, unsafe, or out-of-scope actions in-world. Do this with charm, not scolding.
Do not speak direct dialogue for NPCs. If the player tries to converse with a person, say that a direct conversation would require engaging them separately.
Do not claim Darwin understands natural selection in 1835, and do not mention his later theory by name.
Darwin's stray thoughts, when useful, must be present tense, impressionistic, and brief. Do not preface them with "he thinks" or name Darwin. Prefer silence unless the scene strongly suggests one.
Return a field note only when the action is actually observation, documentation, surveying, sampling, collection, or another fieldwork act. For jokes, yelling, identity questions, failed actions, or casual remarks, leave fieldNote empty.`;

const IDENTITY_RESPONSES = [
  'Who do you think?',
  'Perhaps your inner voice; perhaps only the island, having found a pen.',
  'A margin with opinions.',
  'The part of the field book that answers back. Best not to encourage it too much.',
];

const THIRD_PERSON_VERBS = {
  asks: 'ask',
  can: 'can',
  continues: 'continue',
  does: 'do',
  examines: 'examine',
  feels: 'feel',
  finds: 'find',
  gives: 'give',
  has: 'have',
  hears: 'hear',
  is: 'are',
  kneels: 'kneel',
  leans: 'lean',
  looks: 'look',
  makes: 'make',
  moves: 'move',
  must: 'must',
  notes: 'note',
  observes: 'observe',
  pauses: 'pause',
  approaches: 'approach',
  collects: 'collect',
  documents: 'document',
  sketches: 'sketch',
  records: 'record',
  sees: 'see',
  sets: 'set',
  steps: 'step',
  studies: 'study',
  surveys: 'survey',
  takes: 'take',
  touches: 'touch',
  tries: 'try',
  turns: 'turn',
  would: 'would',
  writes: 'write',
};

const THIRD_PERSON_VERB_RE = new RegExp(`\\b(Darwin|He|he)\\s+(${Object.keys(THIRD_PERSON_VERBS).join('|')})\\b`, 'g');

function specimenContext(specimenId) {
  const specimen = baseSpecimens.find(item => item.id === specimenId);
  if (!specimen) return 'No specimen selected.';
  return `${specimen.name} (${specimen.latin}). ${specimen.description} Details: ${(specimen.details || []).slice(0, 3).join('; ')}`;
}

function npcContext(npcId) {
  const npc = npcs.find(item => item.id === npcId);
  if (!npc) return 'No NPC selected.';
  return `${npc.name}, ${npc.role}. ${npc.shortDescription}`;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function secondPersonNarration(value) {
  return String(value || '').replace(THIRD_PERSON_VERB_RE, (match, subject, verb, offset, text) => {
    if (subject === 'he' && /[A-Za-z0-9)]$/.test(text.slice(0, offset).trim())) return match;
    const replacement = `you ${THIRD_PERSON_VERBS[verb] || verb}`;
    const atSentenceStart = !text.slice(0, offset).trim() || /[.!?]["')\]]?\s*$/.test(text.slice(0, offset));
    return subject === 'He' || subject === 'Darwin' || atSentenceStart
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
}

function clampArray(value, limit = 3) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit)
    : [];
}

function parseNarratorJSON(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeNarratorPayload(payload, fallbackText = '') {
  const normalized = payload && typeof payload === 'object' ? payload : {};
  const fieldNote = safeString(normalized.fieldNote);
  const fallbackNarration = secondPersonNarration(
    safeString(fallbackText, 'The action enters the field log, though the island supplies no grand consequence.'),
  );
  return {
    narration: safeString(
      secondPersonNarration(normalized.narration),
      fallbackNarration,
    ),
    educationalNote: fieldNote,
    fieldNote,
    darwinThought: safeString(normalized.darwinThought),
    actionDisposition: safeString(normalized.actionDisposition, 'observed'),
    targetType: safeString(normalized.targetType, 'unknown'),
    weather: safeString(normalized.weather),
    sounds: clampArray(normalized.sounds, 3),
    source: 'llm',
  };
}

function isNarratorIdentityQuestion(input) {
  const text = String(input || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(who|what) are you$/.test(text)
    || /^who is (the )?narrator$/.test(text)
    || /^what is (the )?narrator$/.test(text)
    || text === 'identify yourself';
}

function isPlaceQuestion(input) {
  const text = String(input || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^what is this place$/.test(text)
    || /^what place is this$/.test(text)
    || /^where am i$/.test(text)
    || /^where are we$/.test(text)
    || /^describe (this place|where i am|where we are)$/.test(text);
}

function directQuestionGuidance(input) {
  const text = String(input || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:am i|are we|who am i|what am i)(?: charles)?(?: darwin)?$/.test(text) || /^am i darwin$/.test(text)) {
    return 'This is a direct role question. Answer plainly in the first sentence: the player is Charles Darwin, twenty-six, newly landed on Charles Island in the Galapagos. Use only role facts and one practical next step. Leave darwinThought empty.';
  }
  if (/^(?:what should i do(?: next| now)?|what do i do(?: next| now)?|what next|what is my objective)$/.test(text)) {
    return 'This is a direct objective question. Answer with the current practical objective first, then one concrete next action. Use the objective exactly: recommend moving to a visible specimen, inspecting it, documenting it, or collecting it with an appropriate tool. Keep the answer to the task and action only. Leave darwinThought empty.';
  }
  return '';
}

function identityIndex(recentNarration = []) {
  return clampArray(recentNarration, 8).filter(line => (
    /\b(?:who are you|who is the narrator|what is the narrator|identify yourself)\b/i.test(line)
  )).length % IDENTITY_RESPONSES.length;
}

function narratorIdentityPayload({ recentNarration }) {
  return {
    narration: IDENTITY_RESPONSES[identityIndex(recentNarration)],
    educationalNote: '',
    fieldNote: '',
    darwinThought: '',
    actionDisposition: 'observed',
    targetType: 'self',
    weather: '',
    sounds: [],
    source: 'scripted-identity',
  };
}

function placePayload({ location, locationContext }) {
  const place = safeString(location, 'this shore');
  const historical = safeString(locationContext?.historicalName || locationContext?.island);
  const description = safeString(locationContext?.description);
  const detail = clampArray(locationContext?.discoveries, 1)[0]
    || clampArray(locationContext?.notableFeatures, 1)[0];
  const detailText = detail
    ? detail
        .replace(/^you\s+(?:notice|find|see|spot|observe)\s+/i, '')
        .replace(/^the\s+/i, 'the ')
    : '';
  const parts = [
    `This is ${place}${historical ? ` on ${historical}` : ''}.`,
    description,
    detailText ? `You would do well to notice this: ${detailText}` : '',
  ].filter(Boolean);
  return {
    narration: parts.join(' '),
    educationalNote: '',
    fieldNote: '',
    darwinThought: '',
    actionDisposition: 'observed',
    targetType: 'setting',
    weather: '',
    sounds: [],
    source: 'scripted-place',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const {
      eventType = 'player_action',
      playerInput = '',
      objective = '',
      location = 'Post Office Bay',
      locationContext = {},
      specimenId,
      toolId,
      outcome,
      stats = {},
      journalContext = '',
      npcId,
      weather = '',
      timeOfDay = '',
      day = 1,
      recentNarration = [],
      nearbyPeople = [],
      playerPose = {},
    } = body;

    if (isNarratorIdentityQuestion(playerInput)) {
      return res.status(200).json(narratorIdentityPayload({
        recentNarration,
      }));
    }

    if (isPlaceQuestion(playerInput)) {
      return res.status(200).json(placePayload({ location, locationContext }));
    }

    const responseGuidance = directQuestionGuidance(playerInput);
    const directInfoQuestion = Boolean(responseGuidance);
    const prompt = `Event: ${eventType}
Player typed action: ${safeString(playerInput, '(empty)')}
${responseGuidance ? `Response guidance: ${responseGuidance}\n` : ''}Player role: Charles Darwin, age 26, newly landed in the Galapagos during the Beagle voyage in September 1835.
Current objective: ${safeString(objective, 'Collect or document one animal, plant, or mineral sample.')}
Location: ${safeString(location)} (${safeString(locationContext.historicalName || locationContext.island)})
Map cell/region id: ${safeString(locationContext.id || locationContext.localCellId, 'unknown')}
Location type: ${safeString(locationContext.biome || locationContext.type, 'unknown')}
Location description: ${safeString(locationContext.description, 'none')}
Location discoveries: ${clampArray(locationContext.discoveries, 4).join('; ') || 'none'}
Notable nearby features: ${clampArray(locationContext.notableFeatures, 4).join('; ') || 'none'}
Nearby specimen: ${specimenContext(specimenId)}
${directInfoQuestion ? '' : `Nearby NPC: ${npcContext(npcId)}
Nearby people and activity: ${clampArray(nearbyPeople, 4).join(' | ') || 'none'}`}
Equipped tool: ${toolId || 'none'}
Outcome: ${outcome || 'none'}
Weather: ${weather || 'unknown'}
Date/time: day ${day || 1}, ${timeOfDay || 'unknown'}
Stats: health ${stats.health ?? 100}, fatigue ${stats.fatigue ?? 0}, curiosity ${stats.curiosity ?? 10}
Player position/facing: x ${playerPose.x ?? 'unknown'}, z ${playerPose.z ?? 'unknown'}, facing ${playerPose.heading ?? 'unknown'}
Recent field log: ${clampArray(recentNarration, 5).join(' | ') || 'none'}
Journal context: ${safeString(journalContext, 'none')}

Return JSON only with:
{
  "narration": "1-3 concise sentences responding to the typed action",
  "fieldNote": "optional 1 sentence field-method or historical note, or empty string",
  "darwinThought": "optional brief present-tense impressionistic thought, or empty string",
  "actionDisposition": "observed | impossible | needs_modal | unsafe | ignored",
  "targetType": "specimen | npc | setting | self | tool | none",
  "weather": "optional weather state from: sunny, cloudy, sunshower, overcast, misty, drizzle, rain, storm, or empty string",
  "sounds": ["optional short sound cue 1", "optional short sound cue 2"]
}`;

    const { sessionId, idempotencyKey } = getRequestIdentity({
      req,
      route: '/api/three-narrate',
      prompt,
      idempotencyKey: body.idempotencyKey,
    });

    const result = await generateLLMText({
      route: '/api/three-narrate',
      sessionId,
      idempotencyKey,
      model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0.24,
      maxTokens: 200,
    });

    const text = result.text || '';
    const parsed = parseNarratorJSON(text);
    return res.status(200).json({
      ...normalizeNarratorPayload(parsed, text),
      provider: result.provider,
      model: result.model,
      fallbackFrom: result.fallbackFrom || null,
    });
  } catch (error) {
    console.error('three-narrate error:', error);
    return res.status(200).json({
      narration: 'The narrator is momentarily unavailable; you are left with the more severe but reliable prose of the island itself.',
      educationalNote: '',
      fieldNote: '',
      darwinThought: '',
      actionDisposition: 'unavailable',
      targetType: 'none',
      weather: '',
      sounds: [],
      fallback: true,
    });
  }
}
