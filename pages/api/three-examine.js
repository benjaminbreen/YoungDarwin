import { baseSpecimens } from '../../data/specimens';
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

// Field-inquiry endpoint for the examination screen. Unlike the narrator
// (/api/three-narrate), this voice is Darwin's own close observation of a
// single subject: it answers sensory questions, performs requested procedures
// (measuring, handling, testing), and roleplays a living animal's behavior in
// brief present-tense beats. Facts it surfaces populate the Key Facts panel.

const SYSTEM_PROMPT = `You are the observation voice of a compact 3D educational game about Charles Darwin examining a single specimen or object on Charles Island (Floreana), Galapagos, in September 1835.

The player, as Darwin, has the subject directly before them and asks questions or attempts procedures ("what color is it", "take out my measuring tools and find how long it is", "check under its shell").
Style: second person, present tense, succinct and naturalistic — one to three short sentences. Concrete sensory detail over atmosphere. Never florid, coy, or portentous.
Procedures: if the player attempts a plausible 1835 field procedure (measure with a pocket rule, weigh in the hand, smell, touch, sketch, count, compare), perform it and report the result. Use period instruments only; gently refuse anachronisms in-world.
Living animals: roleplay the animal's actual behavior in the "behavior" field — it may watch, chew, retreat a pace, ignore you, hiss. Keep it literal and unsentimental; animals are not symbols and do not perform for the observer.
Knowledge limits: Darwin in 1835 does not know species-level identifications, evolutionary theory, or modern taxonomy. Never state the Latin binomial or the modern species name. Size estimates and observations carry honest confidence: "high" only for something plainly visible, "moderate" for estimates, "low" for guesses.
Facts: when the exchange genuinely establishes a checkable observation (a measurement, a condition, a color, a behavior pattern, a habitat note), return it in "fact" with a short label (1-3 words) and a compact value. Set "measurement": true only for physical dimensions. Return at most one fact per exchange; return null when the question was casual, repeated, or unanswerable.
Uncertainty: when an honest answer must admit a limit ("without opening it you cannot be sure"), put one short sentence in "uncertainty".
Ground every answer in the supplied subject data. Do not invent anatomy or history the data cannot support; when the data is silent, observe what such a subject would plausibly show and keep confidence low.`;

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clampArray(value, limit = 6) {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit)
    : [];
}

function parseExamineJSON(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeFact(fact) {
  if (!fact || typeof fact !== 'object') return null;
  const label = safeString(fact.label);
  const value = safeString(fact.value);
  if (!label || !value) return null;
  const confidence = ['high', 'moderate', 'low'].includes(String(fact.confidence || '').toLowerCase())
    ? String(fact.confidence).toLowerCase()
    : 'moderate';
  return {
    label: label.slice(0, 28),
    value: value.slice(0, 48),
    confidence,
    measurement: Boolean(fact.measurement),
  };
}

function normalizeExaminePayload(payload, fallbackText = '') {
  const normalized = payload && typeof payload === 'object' ? payload : {};
  return {
    reply: safeString(normalized.reply, safeString(fallbackText, 'You look closely, but the light gives nothing further away.')),
    fact: normalizeFact(normalized.fact),
    behavior: safeString(normalized.behavior),
    uncertainty: safeString(normalized.uncertainty),
    source: 'llm',
  };
}

function subjectContext(examinable) {
  const specimen = examinable?.kind === 'specimen'
    ? baseSpecimens.find(item => item.id === examinable.typeId)
    : null;
  if (specimen) {
    return [
      `Subject: ${specimen.name} (category: ${specimen.ontology}${specimen.order ? `, ${specimen.order}` : ''}).`,
      `Reference description (Darwin cannot cite this; use it only to ground observations): ${specimen.description}`,
      `Reference details: ${(specimen.details || []).join('; ')}`,
      specimen.habitat ? `Habitat: ${specimen.habitat}.` : '',
      specimen.danger ? `Danger rating 0-10: ${specimen.danger}.` : '',
      `Living animal: ${String(specimen.ontology).toLowerCase() === 'animal' ? 'yes' : 'no'}.`,
    ].filter(Boolean).join('\n');
  }
  return [
    `Subject: ${safeString(examinable?.name, 'an unidentified object')} (category: ${safeString(examinable?.category, 'Item')}).`,
    examinable?.description ? `Reference description: ${examinable.description}` : '',
    Array.isArray(examinable?.details) && examinable.details.length ? `Reference details: ${examinable.details.join('; ')}` : '',
    'Living animal: no.',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const {
      playerInput = '',
      examinable = {},
      chat = [],
      knownFacts = [],
      location = 'Post Office Bay',
      weather = '',
      day = 1,
      timeOfDay = '',
    } = body;

    const transcript = clampArray(
      (Array.isArray(chat) ? chat : []).map(entry => (
        entry && entry.text ? `${entry.role === 'you' ? 'Darwin' : 'Observation'}: ${String(entry.text).trim()}` : ''
      )),
      8,
    );

    const prompt = `${subjectContext(examinable)}
Setting: ${safeString(location)}, Charles Island, Galapagos. Day ${day || 1}, ${safeString(timeOfDay, 'morning')}, weather ${safeString(weather, 'unknown')}.
Facts already recorded (do not repeat as new facts): ${clampArray(knownFacts, 8).join('; ') || 'none beyond category'}
Recent exchange:
${transcript.join('\n') || '(none — this is the first question)'}

Darwin now asks or attempts: ${safeString(playerInput, '(empty)')}

Return JSON only:
{
  "reply": "1-3 short sentences of direct observation or procedure result",
  "fact": { "label": "1-3 word label", "value": "compact value", "confidence": "high | moderate | low", "measurement": false } or null,
  "behavior": "one short present-tense sentence of animal behavior, or empty string",
  "uncertainty": "one short honest limit of the observation, or empty string"
}`;

    const { sessionId, idempotencyKey } = getRequestIdentity({
      req,
      route: '/api/three-examine',
      prompt,
      idempotencyKey: body.idempotencyKey,
    });

    const result = await generateLLMText({
      route: '/api/three-examine',
      sessionId,
      idempotencyKey,
      model: process.env.YOUNG_DARWIN_3D_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 220,
    });

    const text = result.text || '';
    const parsed = parseExamineJSON(text);
    return res.status(200).json({
      ...normalizeExaminePayload(parsed, text),
      provider: result.provider,
      model: result.model,
      fallbackFrom: result.fallbackFrom || null,
    });
  } catch (error) {
    console.error('three-examine error:', error);
    return res.status(200).json({
      reply: 'You look long at the subject, but your notes must wait — the observation refuses to resolve just now.',
      fact: null,
      behavior: '',
      uncertainty: '',
      fallback: true,
    });
  }
}
