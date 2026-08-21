export const EXAMINE_FALLBACK_REPLY = 'You look long at the subject, but your notes must wait — the observation refuses to resolve just now.';

export const EXAMINE_RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'field_examination_response',
  description: 'A direct field observation, optional fact, animal behavior, and uncertainty.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      fact: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
          measurement: { type: 'boolean' },
        },
        required: ['label', 'value', 'confidence', 'measurement'],
      },
      behavior: { type: 'string' },
      uncertainty: { type: 'string' },
    },
    required: ['reply', 'fact', 'behavior', 'uncertainty'],
  },
};

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function parseExamineJSON(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
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

export function normalizeExaminePayload(payload) {
  const valid = Boolean(payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && safeString(payload.reply));
  const normalized = valid ? payload : {};
  return {
    reply: safeString(normalized.reply, EXAMINE_FALLBACK_REPLY),
    fact: normalizeFact(normalized.fact),
    behavior: safeString(normalized.behavior),
    uncertainty: safeString(normalized.uncertainty),
    source: valid ? 'llm' : 'authored',
    fallback: !valid,
  };
}

export function examinationResponseFromModel(result = {}) {
  return {
    ...normalizeExaminePayload(parseExamineJSON(result.text)),
    provider: result.provider,
    model: result.model,
    fallbackFrom: result.fallbackFrom || null,
  };
}
