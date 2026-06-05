function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildLLMRequestMeta({ sessionId, route, kind, gameTime, locationId, prompt }) {
  const base = [
    sessionId || 'anonymous',
    route || 'llm',
    kind || 'turn',
    gameTime ?? '',
    locationId || '',
    hashString(prompt),
  ].join(':');

  return {
    headers: {
      'Content-Type': 'application/json',
      'x-young-darwin-session': sessionId || 'anonymous',
      'x-idempotency-key': base,
    },
    idempotencyKey: base,
  };
}
