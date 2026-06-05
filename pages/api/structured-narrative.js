import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

const SYSTEM_PROMPT = `You are the narrative voice for Young Darwin, a historically grounded 1835 Galapagos field simulation.
Write concise second-person prose for Darwin. Do not foreshadow natural selection or post-1835 theory.
Return only JSON with these keys: visibleText, suggestedActions, mood, weather, sounds, npcState, warnings.
suggestedActions must be an array of short action strings. sounds must be an array of two or three short sound phrases.`;

function fallbackEnvelope(text) {
  return {
    visibleText: text || 'The field situation is clear enough without embellishment. You note the facts and prepare the next action.',
    suggestedActions: ['Observe surroundings', 'Record field notes', 'Check map', 'Consider collection method'],
    mood: 'attentive',
    weather: 'clear',
    sounds: ['surf', 'wind', 'distant birds'],
    npcState: null,
    warnings: [],
  };
}

function parseEnvelope(text) {
  try {
    const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      ...fallbackEnvelope(parsed.visibleText),
      ...parsed,
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 4) : fallbackEnvelope().suggestedActions,
      sounds: Array.isArray(parsed.sounds) ? parsed.sounds.slice(0, 3) : fallbackEnvelope().sounds,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch {
    return fallbackEnvelope(text);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gameState, event, model, idempotencyKey } = req.body || {};
    const userPrompt = `Game state:
${JSON.stringify(gameState || {}, null, 2)}

Canonical game event:
${JSON.stringify(event || {}, null, 2)}

Narrate the result without changing canonical state.`;
    const identity = getRequestIdentity({
      req,
      route: '/api/structured-narrative',
      prompt: userPrompt,
      idempotencyKey: idempotencyKey || event?.id,
    });

    const result = await generateLLMText({
      model: model || process.env.YOUNG_DARWIN_NARRATIVE_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gpt-5.4-nano',
      route: '/api/structured-narrative',
      sessionId: identity.sessionId,
      idempotencyKey: identity.idempotencyKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 700,
      temperature: 0.45,
    });

    return res.status(200).json({
      ...parseEnvelope(result.text),
      provider: result.provider,
      model: result.model,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate structured narrative',
      details: error.message,
      ...fallbackEnvelope(),
    });
  }
}
