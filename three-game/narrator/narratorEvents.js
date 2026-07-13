export const NARRATOR_LOG_LIMIT = 28;
export const SCRIPTED_NARRATION_COOLDOWN_MINUTES = 360;
export const INITIAL_NARRATOR_TIME = 7 + 9 / 60;

const DEFAULT_SPEAKERS = {
  narrator: 'Narrator',
  player: 'You',
  npcActivity: 'Syms Covington',
  darwinThought: 'Darwin',
  hotkeys: 'Narrator',
};

const THOUGHT_TARGETS = new Set(['setting', 'specimen']);

function hashNumber(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function textHash(value) {
  return hashNumber(value).toString(36);
}

export function gameClockMinutes(state) {
  return (state?.day || 1) * 1440 + (Number(state?.timeOfDay) || 0) * 60;
}

export function createNarratorEvent({
  kind = 'narrator',
  speaker,
  text,
  day,
  timeOfDay,
  source = 'scripted',
  meta = {},
}) {
  const body = String(text || '').trim();
  if (!body && kind !== 'hotkeys') return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${kind}`,
    kind,
    speaker: speaker || DEFAULT_SPEAKERS[kind] || DEFAULT_SPEAKERS.narrator,
    text: body,
    day: day || 1,
    timeOfDay: Number.isFinite(Number(timeOfDay)) ? Number(timeOfDay) : INITIAL_NARRATOR_TIME,
    source,
    meta,
  };
}

export function appendNarratorEvents(log, events, limit = NARRATOR_LOG_LIMIT) {
  const additions = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (additions.length === 0) return log;
  return [...(Array.isArray(log) ? log : []), ...additions].slice(-limit);
}

export function createInitialNarratorLog(initialNarration, {
  day = 1,
  timeOfDay = INITIAL_NARRATOR_TIME,
} = {}) {
  return appendNarratorEvents([], [
    createNarratorEvent({
      kind: 'narrator',
      text: initialNarration?.narration,
      day,
      timeOfDay,
      source: 'initial',
    }),
  ]);
}

export function shouldAllowLlmThought(payload = {}, playerInput = '', state = {}) {
  const thought = String(payload.darwinThought || '').trim();
  if (!thought) return false;
  const disposition = String(payload.actionDisposition || '').toLowerCase();
  if (disposition && disposition !== 'observed') return false;
  const targetType = String(payload.targetType || '').toLowerCase();
  if (!THOUGHT_TARGETS.has(targetType)) return false;
  const key = `${state.seed || 'three'}:${state.currentZoneId || ''}:${state.day || 1}:${Math.floor(Number(state.timeOfDay) || 0)}:${textHash(playerInput)}:llm-thought`;
  return hashNumber(key) % 6 === 0;
}

export function narrationPayloadToEvents(data = {}, state = {}, source = 'scripted', {
  allowThought = false,
} = {}) {
  return [
    createNarratorEvent({
      kind: 'narrator',
      text: data.narration,
      day: state.day,
      timeOfDay: state.timeOfDay,
      source,
      meta: { disposition: data.actionDisposition || null, targetType: data.targetType || null },
    }),
    createNarratorEvent({
      kind: 'darwinThought',
      text: allowThought ? data.darwinThought : '',
      day: state.day,
      timeOfDay: state.timeOfDay,
      source,
    }),
  ];
}
