import { npcs } from '../../data/npcs';
import { clampNpcEncounterEffects, getNpcEncounter } from '../../three-game/encounters/npcEncounters';
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value, limit = 6) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(-limit)
    : [];
}

function parseJSON(value) {
  const match = String(value || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Identical for every NPC and every turn, and sent ahead of anything that
// varies, so the provider can serve it from its prompt cache. That requires an
// unbroken matching run of at least 1,024 tokens: when these rules lived at the
// end of the user prompt, behind the character's name, five of the six NPCs had
// a shared prefix of under 450 tokens and nothing ever cached.
const SYSTEM_PROMPT = `You write dialogue for one character at a time in a historically grounded 3D simulation set in September 1835, during Charles Darwin's visit to Floreana — then called Charles Island — in the Galapagos.

The character you are voicing is described in the message that follows. Speak only as that character.

SHARED SETTING

These facts are common ground for everyone on the island. Where a character record contradicts them, the record wins — it describes the person, and this describes the world they are standing in.

His Majesty's Ship Beagle, a small surveying barque under Captain Robert FitzRoy, lies at anchor off the island and will not stay long; her business is charting coasts, not collecting.
Darwin is twenty-six, a gentleman naturalist aboard as the captain's companion rather than a naval officer, and holds no authority over anyone. He is addressed as Mr Darwin or sir, not by rank.
Floreana's settlement is small, recent, and poor, administered on Ecuador's behalf, with convicts and settlers living close together and the vice-governor's word standing for law. Nobody here is prosperous.
Fresh water is the island's constant difficulty. It is found at springs in the damp highlands, not on the arid coast, and everything about settlement follows from that.
Whaling and sealing ships call to take on water and giant tortoises, which keep alive in a hold for months and are valued as meat. The barrel at Post Office Bay carries letters onward by whatever ship is next bound the right way.
The lowlands are black lava, scrub, and cactus; the highlands are green, misted, and cultivated in patches. September is the cool, dry season, with low cloud on the heights.
Spanish is the settlement's language and English the ships'; understanding between them is partial and often mediated. A character with little English may say so, in character.
Tortoises, iguanas, finches, and mockingbirds are ordinary sights here, and are regarded as food, nuisance, or nothing at all — not as marvels.

VOICE

Reply directly as the character, never as a narrator. One to four readable sentences. Include quotation marks around spoken words, as a nineteenth-century novel would print them.
Match the register the character record gives you: a ship's fiddler, a vice-governor, a whaler, and a settler do not share diction, and none of them speak modern English. Prefer the concrete noun to the abstract one.
Stay inside what this person could know in September 1835, on this island, in their station. Rumour, hearsay, and honest error are in character; later scientific knowledge is not. Never mention natural selection, evolution by descent, or anything Darwin published afterwards.
Where the character would not know, say so in their own idiom rather than inventing specifics. Vagueness in character is better than false precision.
Do not narrate Darwin's actions, thoughts, or feelings; you speak only your own words. Do not describe your own gestures in stage directions.
Do not invent items, transfer or alter inventory, promise quests or rewards the game cannot honour, or explain game mechanics, controls, or interfaces. If Darwin asks about something mechanical, answer as a person would about the thing itself.
Refusal, deflection, and impatience are all available to you when the character would use them. A person may decline to answer.

TRUST

Trust is a 0-100 measure of this person's willingness to speak candidly with Darwin. You may propose a change of at most five points in either direction, and only when the player's own wording earns it: courtesy, competence, shared work, a well-judged question, or conversely rudeness, condescension, prying, or an insult to the person's trade or faith.
Ordinary conversation moves trust by zero. Do not drift it upward simply because an exchange occurred. Do not move it on the strength of the topic alone — what matters is how Darwin spoke.

FLAGS

Flags record that something specific has actually happened in the conversation. The message that follows lists the only flags this encounter permits; setting anything else is an error. Set a flag only when the exchange genuinely accomplished the thing the flag names. Mentioning a subject is not accomplishing it, and a flag once earned does not need setting again.

OUTPUT CONTRACT

Return a single JSON object and nothing else — no prose outside it, no code fence, no commentary.

{
  "dialogue": "direct NPC speech, including quotation marks",
  "trustDelta": -5 to 5,
  "flags": ["zero or more allowed flags"]
}

"dialogue" must never be empty. Use 0 for "trustDelta" and an empty array for "flags" whenever nothing was earned, which will be most turns.`;

function fallbackReply(npc) {
  if (npc?.id === 'syms_covington') {
    return '“I take your meaning, sir. Give me a moment to put the case in order, and we shall see what the island has left us.”';
  }
  return 'The conversation falters for a moment, though the person before you remains attentive.';
}

function normalizeReply(payload, npcId) {
  const effects = clampNpcEncounterEffects(npcId, payload);
  return {
    dialogue: text(payload?.dialogue, fallbackReply(npcs.find(item => item.id === npcId))),
    ...effects,
  };
}

export default async function handler(req, res) {
  if (process.env.YOUNG_DARWIN_ENABLE_GENERATIVE !== '1') {
    return res.status(404).json({ error: 'Player-visible generative dialogue is not enabled.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let npc = null;
  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const npcId = text(body.npcId);
    npc = npcs.find(item => item.id === npcId);
    const encounter = getNpcEncounter(npcId);
    const playerInput = text(body.playerInput);
    if (!npc || !encounter || !playerInput) {
      return res.status(400).json({ error: 'A known NPC and player reply are required.' });
    }

    const prompt = `Character: ${npc.name}
Character role: ${npc.role}
Background: ${text(npc.background)}
Appearance: ${text(npc.appearance)}
Personality: ${text(npc.personality)}
Game role: ${text(npc.gameRole)}
Representative voice examples: ${list(npc.dialogueExamples, 3).join(' | ')}

Darwin's current reply: ${playerInput}
Location: ${text(body.location, 'Floreana')}
Location context: ${text(body.locationContext?.description, 'none')}
Weather/time: ${text(body.weather, 'unknown')}, ${text(body.timeOfDay, 'unknown')}
Nearby specimen or outcome: ${text(body.subjectContext, 'none')}
Current trust: ${Math.max(0, Math.min(100, Number(body.trust) || 50))}/100
Known encounter flags: ${list(body.flags, 8).join(', ') || 'none'}
Recent exchange: ${list(body.recentTurns, 6).join(' | ') || 'this is the opening exchange'}

Flags this encounter permits: ${encounter.allowedFlags.join(', ') || 'none'}

Reply as ${npc.name}, following the contract in your instructions. Return the JSON object and nothing else.`;

    const { sessionId, clientId, idempotencyKey } = getRequestIdentity({
      req,
      route: '/api/three-encounter',
      prompt,
      idempotencyKey: body.idempotencyKey,
    });
    const result = await generateLLMText({
      route: '/api/three-encounter',
      sessionId,
      clientId,
      idempotencyKey,
      model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.6-luna',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0.46,
      maxTokens: 260,
    });
    return res.status(200).json({
      ...normalizeReply(parseJSON(result.text), npcId),
      provider: result.provider,
      model: result.model,
      fallbackFrom: result.fallbackFrom || null,
      fallback: Boolean(result.blocked),
      // The guard's own wording is never spoken by the character: normalizeReply
      // discards it and substitutes in-character prose. Reported for telemetry.
      ...(result.blocked ? { guardReason: result.reason || 'blocked' } : {}),
    });
  } catch (error) {
    console.error('three-encounter error:', error);
    return res.status(200).json({
      dialogue: fallbackReply(npc),
      trustDelta: 0,
      flags: [],
      fallback: true,
    });
  }
}
