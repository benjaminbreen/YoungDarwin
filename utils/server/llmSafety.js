import crypto from 'crypto';

const DEFAULT_PER_MINUTE = Number(process.env.LLM_MAX_CALLS_PER_MINUTE || 12);
const DEFAULT_PER_SESSION = Number(process.env.LLM_MAX_CALLS_PER_SESSION || 80);
const DEFAULT_BACKGROUND_PER_MINUTE = Number(process.env.LLM_MAX_BACKGROUND_CALLS_PER_MINUTE || 4);
const DEFAULT_MAX_PENDING_PER_SESSION = Number(process.env.LLM_MAX_PENDING_PER_SESSION || 3);
const DEFAULT_MAX_PENDING_GLOBAL = Number(process.env.LLM_MAX_PENDING_GLOBAL || 10);
const DEFAULT_MAX_ESTIMATED_TOKENS_PER_SESSION = Number(process.env.LLM_MAX_ESTIMATED_TOKENS_PER_SESSION || 120000);
const IDEMPOTENCY_TTL_MS = Number(process.env.LLM_IDEMPOTENCY_TTL_MS || 2 * 60 * 1000);
const LEDGER_LIMIT = Number(process.env.LLM_LEDGER_LIMIT || 300);

const globalState = globalThis.__youngDarwinLLMSafety || {
  ledger: [],
  idempotency: new Map(),
  sessions: new Map(),
};

globalThis.__youngDarwinLLMSafety = globalState;

function now() {
  return Date.now();
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function trimState() {
  const cutoff = now() - IDEMPOTENCY_TTL_MS;
  for (const [key, value] of globalState.idempotency.entries()) {
    if (value.createdAt < cutoff) globalState.idempotency.delete(key);
  }

  if (globalState.ledger.length > LEDGER_LIMIT) {
    globalState.ledger.splice(0, globalState.ledger.length - LEDGER_LIMIT);
  }
}

function sessionFor(sessionId) {
  const id = sessionId || 'anonymous';
  if (!globalState.sessions.has(id)) {
    globalState.sessions.set(id, { count: 0, backgroundCount: 0, startedAt: now() });
  }
  return globalState.sessions.get(id);
}

function callsInWindow({ route, sessionId, background, windowMs = 60_000 }) {
  const cutoff = now() - windowMs;
  return globalState.ledger.filter(entry => {
    if (entry.startedAt < cutoff) return false;
    if (route && entry.route !== route) return false;
    if (sessionId && entry.sessionId !== sessionId) return false;
    if (background !== undefined && entry.background !== background) return false;
    return entry.status !== 'blocked';
  }).length;
}

function pendingCount({ route, sessionId } = {}) {
  return globalState.ledger.filter(entry => {
    if (entry.status !== 'pending') return false;
    if (route && entry.route !== route) return false;
    if (sessionId && entry.sessionId !== sessionId) return false;
    return true;
  }).length;
}

function estimatedSessionTokens(sessionId) {
  return globalState.ledger
    .filter(entry => entry.sessionId === sessionId && entry.status !== 'blocked')
    .reduce((sum, entry) => sum + (entry.estimatedInputTokens || 0) + (entry.estimatedOutputTokens || 0), 0);
}

export function getRequestIdentity({ req, route, prompt, idempotencyKey }) {
  const sessionHeader = req?.headers?.['x-young-darwin-session'] || req?.headers?.['x-yd-session'];
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  const identityKey = idempotencyKey || req?.headers?.['x-idempotency-key'] || hash(`${route}:${prompt}`);

  return {
    sessionId: sessionId || 'anonymous',
    idempotencyKey: String(identityKey),
  };
}

export function estimateTokens(...parts) {
  const chars = parts.reduce((sum, part) => sum + String(part || '').length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

export function beginLLMRequest({
  route,
  provider,
  model,
  sessionId = 'anonymous',
  idempotencyKey,
  prompt,
  background = false,
  estimatedInputTokens = 0,
} = {}) {
  trimState();

  const key = `${sessionId}:${route}:${idempotencyKey || hash(prompt)}`;
  const cached = globalState.idempotency.get(key);
  if (cached?.status === 'complete') {
    return {
      allowed: false,
      cached: true,
      cachedResponse: cached.response,
      reason: 'duplicate_request',
      key,
    };
  }
  if (cached?.status === 'pending') {
    return {
      allowed: false,
      cached: false,
      reason: 'duplicate_request_pending',
      key,
    };
  }

  const session = sessionFor(sessionId);
  const maxPerSession = Number(process.env.LLM_MAX_CALLS_PER_SESSION || DEFAULT_PER_SESSION);
  const maxPerMinute = Number(process.env.LLM_MAX_CALLS_PER_MINUTE || DEFAULT_PER_MINUTE);
  const maxBackgroundPerMinute = Number(process.env.LLM_MAX_BACKGROUND_CALLS_PER_MINUTE || DEFAULT_BACKGROUND_PER_MINUTE);
  const maxPendingPerSession = Number(process.env.LLM_MAX_PENDING_PER_SESSION || DEFAULT_MAX_PENDING_PER_SESSION);
  const maxPendingGlobal = Number(process.env.LLM_MAX_PENDING_GLOBAL || DEFAULT_MAX_PENDING_GLOBAL);
  const maxEstimatedTokensPerSession = Number(process.env.LLM_MAX_ESTIMATED_TOKENS_PER_SESSION || DEFAULT_MAX_ESTIMATED_TOKENS_PER_SESSION);

  if (session.count >= maxPerSession) {
    recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason: 'session_cap' });
    return { allowed: false, cached: false, reason: 'session_cap', key };
  }

  if (estimatedSessionTokens(sessionId) + estimatedInputTokens >= maxEstimatedTokensPerSession) {
    recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason: 'token_cap' });
    return { allowed: false, cached: false, reason: 'token_cap', key };
  }

  if (callsInWindow({ sessionId }) >= maxPerMinute || callsInWindow({ route }) >= maxPerMinute) {
    recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason: 'rate_limit' });
    return { allowed: false, cached: false, reason: 'rate_limit', key };
  }

  if (pendingCount({ sessionId }) >= maxPendingPerSession || pendingCount() >= maxPendingGlobal) {
    recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason: 'pending_cap' });
    return { allowed: false, cached: false, reason: 'pending_cap', key };
  }

  if (background && callsInWindow({ sessionId, background: true }) >= maxBackgroundPerMinute) {
    recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason: 'background_cap' });
    return { allowed: false, cached: false, reason: 'background_cap', key };
  }

  const entry = {
    id: hash(`${key}:${now()}`),
    route,
    provider,
    model,
    sessionId,
    background,
    estimatedInputTokens,
    startedAt: now(),
    status: 'pending',
  };

  globalState.ledger.push(entry);
  globalState.idempotency.set(key, { status: 'pending', createdAt: now(), entryId: entry.id });
  session.count += 1;
  if (background) session.backgroundCount += 1;

  return { allowed: true, cached: false, key, entryId: entry.id };
}

function recordBlocked({ route, provider, model, sessionId, background, estimatedInputTokens, reason }) {
  globalState.ledger.push({
    id: hash(`${route}:${sessionId}:${reason}:${now()}`),
    route,
    provider,
    model,
    sessionId,
    background,
    estimatedInputTokens,
    startedAt: now(),
    status: 'blocked',
    reason,
  });
  trimState();
}

export function finishLLMRequest({ key, entryId, response, error, estimatedOutputTokens = 0 } = {}) {
  const entry = globalState.ledger.find(item => item.id === entryId);
  if (entry) {
    entry.finishedAt = now();
    entry.durationMs = entry.finishedAt - entry.startedAt;
    entry.estimatedOutputTokens = estimatedOutputTokens;
    entry.status = error ? 'error' : 'complete';
    if (error) entry.error = String(error.message || error);
  }

  if (key) {
    globalState.idempotency.set(key, {
      status: error ? 'error' : 'complete',
      createdAt: now(),
      response,
      entryId,
    });
  }

  trimState();
}

export function getLLMUsageSnapshot(sessionId = null) {
  trimState();
  const ledger = sessionId
    ? globalState.ledger.filter(entry => entry.sessionId === sessionId)
    : globalState.ledger;
  const completed = ledger.filter(entry => entry.status === 'complete');
  const blocked = ledger.filter(entry => entry.status === 'blocked');
  const estimatedInputTokens = completed.reduce((sum, entry) => sum + (entry.estimatedInputTokens || 0), 0);
  const estimatedOutputTokens = completed.reduce((sum, entry) => sum + (entry.estimatedOutputTokens || 0), 0);
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
  const sessionEstimatedTokens = sessionId ? estimatedSessionTokens(sessionId) : estimatedTotalTokens;

  return {
    totalCalls: completed.length,
    blockedCalls: blocked.length,
    pendingCalls: ledger.filter(entry => entry.status === 'pending').length,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    sessionEstimatedTokens,
    recent: ledger.slice(-40).reverse(),
    limits: {
      maxCallsPerMinute: DEFAULT_PER_MINUTE,
      maxCallsPerSession: DEFAULT_PER_SESSION,
      maxBackgroundCallsPerMinute: DEFAULT_BACKGROUND_PER_MINUTE,
      maxPendingPerSession: DEFAULT_MAX_PENDING_PER_SESSION,
      maxPendingGlobal: DEFAULT_MAX_PENDING_GLOBAL,
      maxEstimatedTokensPerSession: DEFAULT_MAX_ESTIMATED_TOKENS_PER_SESSION,
    },
  };
}

export function fallbackForBlockedRequest(reason) {
  if (reason === 'duplicate_request_pending') {
    return 'The previous request is still being processed. Wait a moment before trying again.';
  }
  if (reason === 'session_cap') {
    return 'The expedition has reached its LLM safety cap for this session. Save your work, then start a new session if you need more generated narration.';
  }
  if (reason === 'background_cap') {
    return 'Background narration has been paused by the safety guard; the main game state is unchanged.';
  }
  if (reason === 'pending_cap') {
    return 'Too many LLM requests are already in flight. Wait for the current narration to finish before starting another generated action.';
  }
  if (reason === 'token_cap') {
    return 'The expedition has reached its estimated LLM token safety cap for this session. Save your work before continuing in a new session.';
  }
  return 'LLM request paused by the safety guard to prevent runaway usage. The game state is unchanged.';
}
