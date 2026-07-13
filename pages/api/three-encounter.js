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

    const prompt = `You are roleplaying ${npc.name}, in September 1835, during Charles Darwin's visit to Floreana (Charles Island) in the Galapagos.

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

Reply directly as ${npc.name}, never as a narrator. Keep the reply to one to four readable sentences. Stay historically grounded and in character. Do not claim knowledge acquired after 1835. Do not narrate player actions, invent items, alter inventory, promise unsupported quests, or explain game mechanics. Acknowledge uncertainty naturally where necessary.

You may propose a small social change only when the player's wording clearly earns or loses trust. You may set only these flags: ${encounter.allowedFlags.join(', ')}. Do not set a flag merely because its topic was mentioned.

Return JSON only:
{
  "dialogue": "direct NPC speech, including quotation marks",
  "trustDelta": -5 to 5,
  "flags": ["zero or more allowed flags"]
}`;

    const { sessionId, idempotencyKey } = getRequestIdentity({
      req,
      route: '/api/three-encounter',
      prompt,
      idempotencyKey: body.idempotencyKey,
    });
    const result = await generateLLMText({
      route: '/api/three-encounter',
      sessionId,
      idempotencyKey,
      model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
      systemPrompt: 'You write historically responsible interactive dialogue for a 3D historical simulation. Return valid JSON only.',
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
