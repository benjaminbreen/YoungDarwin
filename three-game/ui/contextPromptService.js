export const CONTEXT_PROMPT_PRIORITY = Object.freeze({
  npc: 100,
  interior: 95,
  fieldTool: 92,
  carry: 90,
  item: 70,
  fieldObserve: 65,
  traversal: 40,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedCandidate(source, prompt, previous, now) {
  if (!source || !prompt?.id || !prompt?.label || !prompt?.keyLabel) return null;
  const sameIdentity = previous?.id === prompt.id;
  return {
    ...prompt,
    source,
    priority: finite(prompt.priority, CONTEXT_PROMPT_PRIORITY[source] || 0),
    dwellMs: Math.max(0, finite(prompt.dwellMs, 180)),
    repeatCooldownMs: Math.max(0, finite(prompt.repeatCooldownMs, 900)),
    firstSeenAt: sameIdentity ? previous.firstSeenAt : now,
  };
}

function candidatePresentationMatches(left, right) {
  return Boolean(
    left
    && right
    && left.id === right.id
    && left.source === right.source
    && left.label === right.label
    && left.keyLabel === right.keyLabel
    && left.priority === right.priority
  );
}

export function resolveContextPrompt(candidates = {}, history = {}, now = Date.now()) {
  return Object.values(candidates)
    .filter(Boolean)
    .filter(candidate => now - candidate.firstSeenAt >= candidate.dwellMs)
    .filter(candidate => now >= finite(history[candidate.id]?.suppressUntil, 0))
    .sort((left, right) => (
      right.priority - left.priority
      || left.firstSeenAt - right.firstSeenAt
      || left.id.localeCompare(right.id)
    ))[0] || null;
}

export function publishContextPromptState(state, source, prompt, now = Date.now()) {
  const previous = state.contextPromptCandidates?.[source] || null;
  const candidate = normalizedCandidate(source, prompt, previous, now);
  if (!candidate) return clearContextPromptState(state, source, now);

  const sameCandidate = candidatePresentationMatches(previous, candidate);
  const candidates = sameCandidate
    ? state.contextPromptCandidates
    : { ...(state.contextPromptCandidates || {}), [source]: candidate };
  const active = resolveContextPrompt(candidates, state.contextPromptHistory, now);
  const sameActive = (!state.contextPrompt && !active)
    || candidatePresentationMatches(state.contextPrompt, active);
  if (sameCandidate && sameActive) return state;
  return {
    ...state,
    contextPromptCandidates: candidates,
    contextPrompt: active,
  };
}

export function clearContextPromptState(state, source, now = Date.now()) {
  if (!source || !state.contextPromptCandidates?.[source]) return state;
  const candidates = { ...state.contextPromptCandidates };
  delete candidates[source];
  return {
    ...state,
    contextPromptCandidates: candidates,
    contextPrompt: resolveContextPrompt(candidates, state.contextPromptHistory, now),
  };
}

export function acknowledgeContextPromptState(state, source, now = Date.now()) {
  const candidate = state.contextPromptCandidates?.[source]
    || (state.contextPrompt?.source === source ? state.contextPrompt : null);
  if (!candidate) return clearContextPromptState(state, source, now);
  const previousHistory = state.contextPromptHistory?.[candidate.id] || {};
  const history = {
    ...(state.contextPromptHistory || {}),
    [candidate.id]: {
      actionCount: finite(previousHistory.actionCount, 0) + 1,
      lastActionAt: now,
      suppressUntil: now + candidate.repeatCooldownMs,
    },
  };
  const candidates = { ...(state.contextPromptCandidates || {}) };
  delete candidates[source];
  return {
    ...state,
    contextPromptCandidates: candidates,
    contextPromptHistory: history,
    contextPrompt: resolveContextPrompt(candidates, history, now),
  };
}
