import { baseSpecimens } from '../../data/specimens';
import { npcs } from '../../data/npcs';
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

const SYSTEM_PROMPT = `You narrate a compact 3D educational game about Charles Darwin exploring Floreana in September 1835.
Write vivid, concrete field narration in second person. Keep it historically grounded and concise.
Do not mention Darwin's later theory of evolution or use anachronistic certainty.
When useful, add one brief educational note about observation, habitat, specimen condition, or field methods.`;

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const {
      eventType = 'observation',
      location = 'Post Office Bay',
      specimenId,
      toolId,
      outcome,
      stats = {},
      journalContext = '',
      npcId,
    } = body;

    const prompt = `Event: ${eventType}
Location: ${location}
Specimen: ${specimenContext(specimenId)}
NPC: ${npcContext(npcId)}
Tool: ${toolId || 'none'}
Outcome: ${outcome || 'none'}
Stats: health ${stats.health ?? 100}, fatigue ${stats.fatigue ?? 0}, curiosity ${stats.curiosity ?? 10}
Journal context: ${journalContext || 'none'}

Return JSON only with:
{
  "narration": "2-4 sentences",
  "educationalNote": "1 sentence",
  "weather": "one short weather word",
  "sounds": ["sound 1", "sound 2"]
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
      model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gemini-flash-lite',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0.35,
      maxTokens: 260,
    });

    const text = result.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return res.status(200).json(JSON.parse(match[0]));
      } catch {
        // Fall through to plain-text fallback.
      }
    }

    return res.status(200).json({
      narration: text.trim() || 'You pause on the lava shore, taking in the bright water and hard black rock.',
      educationalNote: 'Careful field notes are often as valuable as the specimen itself.',
      weather: 'sunny',
      sounds: ['surf', 'wind'],
    });
  } catch (error) {
    console.error('three-narrate error:', error);
    return res.status(200).json({
      narration: 'You steady your field bag and continue the work without waiting for comment.',
      educationalNote: 'A naturalist can still record location, method, and condition when narration is unavailable.',
      weather: 'sunny',
      sounds: ['surf', 'distant birds'],
      fallback: true,
    });
  }
}
