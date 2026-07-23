import { baseSpecimens } from '../../data/specimens';
import { npcs } from '../../data/npcs';
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';
import {
  animalDirectQuestionGuidance,
  buildAnimalNarratorPrompt,
  buildAnimalNarratorSystemPrompt,
  getPlayableNarratorProfile,
} from '../../three-game/narrator/playableNarratorProfiles';

const SYSTEM_PROMPT = `You are the narrator for a compact 3D educational game about Charles Darwin exploring Floreana, then called Charles Island, in September 1835.

You respond only when the player types a freeform action into the narrator panel.
Style: concise, concrete, lightly arch, Victorian, and allusive in the manner of a dry, well-informed nineteenth-century narrator. "Slightly arch" means dry restraint and exactness, not whimsy. Never be florid, coy, verbose, cute, or portentous.
Address the player in second person as Darwin: write "you note", "you pause", "you find", not "Darwin notes" or "he observes". Use the name Darwin only when a historical distinction is necessary.
Use the supplied game state. Darwin's fatigue, curiosity, health, time of day, weather, location, nearby people, nearby specimens, and recent field log may shape the narration, but do not list them mechanically.
If the player asks a direct informational question about their role, identity, location, objective, controls, or game state, answer directly in the first sentence. Then, at most, add one short practical next step. Example tone for "am I Darwin": "Yes. You are Charles Darwin, twenty-six, newly landed on Charles Island in the Galapagos. Your specimen case is still nearly empty."
For questions about Darwin's own family, education, voyage, or private history, answer as what he could plausibly know in September 1835, in second person. Use established historical facts where you know them; when the record is uncertain, make that uncertainty part of the natural prose instead of inventing detail or introducing modern scholarship.
For direct questions, prioritize useful information over atmosphere. For actions, describe visible cause and effect before adding any style. Keep animals and objects literal: animals may look, move, retreat, feed, or ignore you; objects simply sit, open, break, hold, or resist.
You may gracefully refuse impossible, anachronistic, unsafe, or out-of-scope actions in-world. Do this with charm, not scolding.
Do not speak direct dialogue for NPCs. If the player tries to converse with a person, say that a direct conversation would require engaging them separately with E when nearby.
Do not claim Darwin understands natural selection in 1835, and do not mention his later theory by name.
Darwin's stray thoughts, when useful, must be present tense, impressionistic, and brief. Do not preface them with "he thinks" or name Darwin. Prefer silence unless the scene strongly suggests one.`;

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
  const fallbackNarration = secondPersonNarration(
    safeString(fallbackText, 'The action enters the field log, though the island supplies no grand consequence.'),
  );
  return {
    narration: safeString(
      secondPersonNarration(normalized.narration),
      fallbackNarration,
    ),
    darwinThought: safeString(normalized.darwinThought),
    actionDisposition: safeString(normalized.actionDisposition, 'observed'),
    targetType: safeString(normalized.targetType, 'unknown'),
    weather: safeString(normalized.weather),
    sounds: clampArray(normalized.sounds, 3),
    ...(typeof normalized.escapeSucceeded === 'boolean' ? { escapeSucceeded: normalized.escapeSucceeded } : {}),
    ...(typeof normalized.resolved === 'boolean' ? { resolved: normalized.resolved } : {}),
    ...(safeString(normalized.consequence) ? { consequence: safeString(normalized.consequence) } : {}),
    ...(Number.isFinite(Number(normalized.healthDelta)) ? { healthDelta: Number(normalized.healthDelta) } : {}),
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

function directQuestionGuidance(input, narratorProfile) {
  if (narratorProfile?.kind === 'animal') {
    return animalDirectQuestionGuidance(input, narratorProfile);
  }
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
    darwinThought: '',
    actionDisposition: 'observed',
    targetType: 'setting',
    weather: '',
    sounds: [],
    source: 'scripted-place',
  };
}

function snareEscapeFallback(input = '') {
  const text = String(input || '').toLowerCase();
  const sensible = /\b(?:cut|knife|blade|untie|loosen|loose|slacken|unhook|free|remove|pry|lever|net|pole|stick|call|ask|syms|assistant|careful|slowly)\b/.test(text);
  const reckless = /\b(?:run|walk|jump|kick|thrash|yank|pull\s+hard|ignore|drag)\b/.test(text);
  if (sensible && !reckless) {
    return {
      narration: 'You give up the hopeless business of dragging the loop and attend to the knot itself. With patient fingers, the snare slackens and comes free.',
      escapeSucceeded: true,
      consequence: 'freed',
      healthDelta: 0,
      actionDisposition: 'observed',
      targetType: 'self',
      weather: '',
      sounds: ['twine slackening'],
      source: 'scripted-snare-escape',
    };
  }
  return {
    narration: 'The snare answers force with force. The loop remains taut, and the island has not yet returned your liberty.',
    escapeSucceeded: false,
    consequence: reckless ? 'worse' : 'still_trapped',
    healthDelta: reckless ? -3 : 0,
    actionDisposition: reckless ? 'unsafe' : 'needs_modal',
    targetType: 'self',
    weather: '',
    sounds: ['taut twine scraping'],
    source: 'scripted-snare-escape',
  };
}

const FIELD_DILEMMA_API = {
  net_snag_attempt: {
    label: 'net snagged on cactus or dry scrub',
    objective: 'free the insect net without tearing the useful mesh',
    situation: 'Darwin has swung or carried the insect net into cactus spines or dry scrub. The mesh is caught under tension.',
    success: 'cut only the caught fibers, use a pocket knife/blade, back the net out along the spines, untangle the mesh carefully, loosen the caught edge, or ask Syms to hold the cactus/mesh steady',
    failure: 'vague intent, yanking, pulling hard, continuing to swing, walking away while attached, or ignoring the snag',
    targetType: 'tool',
  },
  cactus_spine_treatment: {
    label: 'embedded cactus spines',
    objective: 'remove or treat embedded Opuntia spines before movement or tool work worsens them',
    situation: 'Darwin has hit cactus hard enough that several spines are embedded in his hand or leg.',
    success: 'use the pocket knife point, lens, tweezers/needle-like point, water rinse, cloth/bandage, or Syms helping to remove or treat the spines',
    failure: 'vague rest, rubbing, continuing to run, ignoring the spines, or pulling blindly without inspection',
    targetType: 'self',
  },
  hammer_shard_treatment: {
    label: 'hammer shard injury',
    objective: 'deal with a sharp rock chip or grit caused by hammering before continuing fieldwork',
    situation: 'A hard rock chip has snapped back from Darwin’s geological hammer and caught his hand or eye.',
    success: 'stop hammering, rinse with water, blink/flush grit, wrap the hand with cloth, remove a visible shard carefully, use a knife point, or ask Syms to help',
    failure: 'continuing to hammer, rubbing the eye, ignoring bleeding/grit, vague resolve, or striking the rock again immediately',
    targetType: 'self',
  },
};

function fieldDilemmaFallback(eventType, input = '') {
  const config = FIELD_DILEMMA_API[eventType] || FIELD_DILEMMA_API.cactus_spine_treatment;
  const text = String(input || '').toLowerCase();
  const reckless = /\b(?:yank|pull\s+hard|thrash|run|ignore|keep\s+going|continue\s+hammering|hammer\s+again|rub\s+(?:my\s+)?eye|rub\s+it|kick|tear)\b/.test(text);
  const sensible = eventType === 'net_snag_attempt'
    ? /\b(?:knife|blade|cut|trim|untangle|unhook|back\s+(?:it|the\s+net)\s+out|reverse|loosen|free|mesh|fiber|fibre|twine|syms|assistant|hold\s+(?:the\s+)?cactus|careful|slowly)\b/.test(text)
    : eventType === 'hammer_shard_treatment'
      ? /\b(?:wash|rinse|water|blink|eye|shard|splinter|chip|remove|knife|blade|tweezer|wrap|cloth|bandage|hand|syms|assistant|stop\s+hammering|careful|slowly)\b/.test(text)
      : /\b(?:knife|blade|point|needle|tweezer|magnifier|lens|inspect|spine|pull\s+(?:out|them)|remove|wash|rinse|water|cloth|bandage|wrap|syms|assistant|careful|slowly)\b/.test(text);
  if (sensible && !reckless) {
    return {
      narration: eventType === 'net_snag_attempt'
        ? 'You ease the net backward along the spines instead of fighting them. The mesh slips free with its useful shape intact.'
        : eventType === 'hammer_shard_treatment'
          ? 'You stop hammering and treat the small injury before it becomes a large one. The field kit proves more useful than bravado.'
          : 'You inspect the spines and draw them out with small, deliberate motions. The pain remains, but it no longer governs the work.',
      resolved: true,
      consequence: 'resolved',
      healthDelta: 0,
      actionDisposition: 'observed',
      targetType: config.targetType,
      weather: '',
      sounds: ['field kit rustle'],
      source: 'scripted-field-dilemma',
    };
  }
  return {
    narration: reckless
      ? 'The attempted remedy answers haste with more trouble. This is still a practical problem, and it has not been solved.'
      : 'That does not yet address the physical problem. Name the tool, hand, or motion that actually frees or treats it.',
    resolved: false,
    consequence: reckless ? 'worse' : 'still_pending',
    healthDelta: reckless ? -3 : 0,
    actionDisposition: reckless ? 'unsafe' : 'needs_modal',
    targetType: config.targetType,
    weather: '',
    sounds: ['an uncomfortable pause'],
    source: 'scripted-field-dilemma',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let narratorProfile = getPlayableNarratorProfile();
  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const {
      eventType = 'player_action',
      playableModeId = 'darwin',
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
      constraint = null,
    } = body;
    narratorProfile = getPlayableNarratorProfile(playableModeId);
    const animalNarrator = narratorProfile.kind === 'animal';

    if (!animalNarrator && isNarratorIdentityQuestion(playerInput)) {
      return res.status(200).json(narratorIdentityPayload({
        recentNarration,
      }));
    }

    if (!animalNarrator && isPlaceQuestion(playerInput)) {
      return res.status(200).json(placePayload({ location, locationContext }));
    }

    if (eventType === 'snare_escape_attempt') {
      const escapePrompt = `Event: snare_escape_attempt
Player typed escape plan: ${safeString(playerInput, '(empty)')}
Situation: Darwin is caught in his own waxed-twine ground snare and cannot walk. The loop is around his boot or ankle, the trigger peg has sprung, and he has already taken a painful fall.
Current objective: judge whether this plan plausibly frees him.
Location: ${safeString(location)} (${safeString(locationContext.historicalName || locationContext.island)})
Terrain/location type: ${safeString(locationContext.biome || locationContext.type, 'unknown')}
Weather: ${weather || 'unknown'}
Date/time: day ${day || 1}, ${timeOfDay || 'unknown'}
Stats: health ${stats.health ?? 100}, fatigue ${stats.fatigue ?? 0}
Previous escape attempts: ${Number(constraint?.attempts || 0)}
Recent field log: ${clampArray(recentNarration, 5).join(' | ') || 'none'}

Adjudication rules:
- Succeed if the player describes a calm, practical extraction: loosen/untie the loop, cut twine, use a blade or tool, use the net pole/stick as a lever, or call Syms for help.
- Fail if the action is vague, impossible, or does not address the loop/knot.
- Mark consequence "worse" and healthDelta -3 only for reckless struggling such as running, kicking, thrashing, or pulling hard against the loop.
- Do not demand perfect technical detail. Reward clear intent and field practicality.
- Keep the narration concrete and brief; no NPC dialogue.

Return JSON only with:
{
  "narration": "1-2 concise sentences describing the result",
  "escapeSucceeded": true or false,
  "consequence": "freed | still_trapped | worse",
  "healthDelta": 0 or -3,
  "actionDisposition": "observed | impossible | unsafe | needs_modal",
  "targetType": "self",
  "darwinThought": "",
  "sounds": ["optional short sound cue"]
}`;

      const { sessionId, idempotencyKey } = getRequestIdentity({
        req,
        route: '/api/three-narrate',
        prompt: escapePrompt,
        idempotencyKey: body.idempotencyKey,
      });

      const result = await generateLLMText({
        route: '/api/three-narrate',
        sessionId,
        idempotencyKey,
        model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: escapePrompt,
        temperature: 0.18,
        maxTokens: 160,
      });

      const text = result.text || '';
      const parsed = parseNarratorJSON(text);
      const normalized = normalizeNarratorPayload(parsed, text);
      if (typeof normalized.escapeSucceeded !== 'boolean') {
        return res.status(200).json({
          ...snareEscapeFallback(playerInput),
          provider: result.provider,
          model: result.model,
          fallbackFrom: result.fallbackFrom || null,
        });
      }
      return res.status(200).json({
        ...normalized,
        provider: result.provider,
        model: result.model,
        fallbackFrom: result.fallbackFrom || null,
      });
    }

    if (FIELD_DILEMMA_API[eventType]) {
      const config = FIELD_DILEMMA_API[eventType];
      const dilemmaPrompt = `Event: ${eventType}
Player typed remedy: ${safeString(playerInput, '(empty)')}
Situation: ${config.situation}
Current objective: ${safeString(objective, config.objective)}
Location: ${safeString(location)} (${safeString(locationContext.historicalName || locationContext.island)})
Terrain/location type: ${safeString(locationContext.biome || locationContext.type, 'unknown')}
Equipped or affected tool: ${toolId || constraint?.toolId || 'unknown'}
Weather: ${weather || 'unknown'}
Date/time: day ${day || 1}, ${timeOfDay || 'unknown'}
Stats: health ${stats.health ?? 100}, fatigue ${stats.fatigue ?? 0}
Previous attempts: ${Number(constraint?.attempts || 0)}
Nearby people and activity: ${clampArray(nearbyPeople, 4).join(' | ') || 'none'}
Recent field log: ${clampArray(recentNarration, 5).join(' | ') || 'none'}

Adjudication rules:
- Succeed if the player describes a concrete practical remedy: ${config.success}.
- Fail if the action is vague, impossible, does not address the physical problem, or is merely the desired outcome.
- Mark consequence "worse" and healthDelta -3 for reckless actions: ${config.failure}.
- Do not demand perfect technical detail. Reward clear field practicality with actual tools, hands, or Syms.
- Keep the narration concrete and brief; no NPC dialogue.

Return JSON only with:
{
  "narration": "1-2 concise sentences describing the result",
  "resolved": true or false,
  "consequence": "resolved | still_pending | worse",
  "healthDelta": 0 or -3,
  "actionDisposition": "observed | impossible | unsafe | needs_modal",
  "targetType": "${config.targetType}",
  "darwinThought": "",
  "sounds": ["optional short sound cue"]
}`;

      const { sessionId, idempotencyKey } = getRequestIdentity({
        req,
        route: '/api/three-narrate',
        prompt: dilemmaPrompt,
        idempotencyKey: body.idempotencyKey,
      });

      const result = await generateLLMText({
        route: '/api/three-narrate',
        sessionId,
        idempotencyKey,
        model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: dilemmaPrompt,
        temperature: 0.18,
        maxTokens: 160,
      });

      const text = result.text || '';
      const parsed = parseNarratorJSON(text);
      const normalized = normalizeNarratorPayload(parsed, text);
      if (typeof normalized.resolved !== 'boolean') {
        return res.status(200).json({
          ...fieldDilemmaFallback(eventType, playerInput),
          provider: result.provider,
          model: result.model,
          fallbackFrom: result.fallbackFrom || null,
        });
      }
      return res.status(200).json({
        ...normalized,
        provider: result.provider,
        model: result.model,
        fallbackFrom: result.fallbackFrom || null,
      });
    }

    const responseGuidance = directQuestionGuidance(playerInput, narratorProfile);
    const directInfoQuestion = Boolean(responseGuidance);
    const prompt = animalNarrator
      ? buildAnimalNarratorPrompt(narratorProfile, {
          eventType,
          playerInput,
          responseGuidance,
          location,
          locationContext,
          nearbySpecimen: specimenContext(specimenId),
          weather,
          timeOfDay,
          stats,
          recentNarration,
        })
      : `Event: ${eventType}
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
  "darwinThought": "optional brief present-tense impressionistic thought, or empty string",
  "actionDisposition": "observed | impossible | needs_modal | unsafe | ignored",
  "targetType": "specimen | npc | setting | self | tool | none",
  "weather": "optional weather state from: sunny, cloudy, sunshower, overcast, misty, drizzle, rain, storm, or empty string",
  "sounds": ["optional short sound cue 1", "optional short sound cue 2"]
}`;
    const systemPrompt = animalNarrator
      ? buildAnimalNarratorSystemPrompt(narratorProfile)
      : SYSTEM_PROMPT;

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
      systemPrompt,
      userPrompt: prompt,
      temperature: animalNarrator ? 0.38 : 0.24,
      maxTokens: animalNarrator ? 120 : 200,
    });

    const text = result.text || '';
    const parsed = parseNarratorJSON(text);
    const normalized = normalizeNarratorPayload(
      parsed,
      text || (animalNarrator ? narratorProfile.fallbackNarration : ''),
    );
    return res.status(200).json({
      ...normalized,
      ...(animalNarrator ? { darwinThought: '', weather: '' } : {}),
      provider: result.provider,
      model: result.model,
      fallbackFrom: result.fallbackFrom || null,
    });
  } catch (error) {
    console.error('three-narrate error:', error);
    return res.status(200).json({
      narration: narratorProfile.kind === 'animal'
        ? narratorProfile.fallbackNarration
        : 'The narrator is momentarily unavailable; you are left with the more severe but reliable prose of the island itself.',
      darwinThought: '',
      actionDisposition: 'unavailable',
      targetType: 'none',
      weather: '',
      sounds: [],
      fallback: true,
    });
  }
}
