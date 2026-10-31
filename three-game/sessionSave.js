// Session persistence for the /three runtime.
//
// The launch menu's Load panel renders "Resume expedition" and "Read journal"
// behind `hasSavedExpedition` / `hasSavedJournalEntries`. For a long time nothing
// wrote a save, so neither appeared and a reload discarded the session.
//
// This is deliberately a *resume* snapshot, not a full world save: expedition
// progress (where you are, what time it is, what you have collected, what you
// have written) rather than physics state, prop damage, or fauna poses. Those
// rebuild deterministically from the region seed when the zone mounts.

import { sanitizeWildlifeWariness } from './wildlife/wariness';

export const SESSION_SAVE_KEY = 'darwin-expedition-session-v1';
export const SESSION_SAVE_VERSION = 2;
const LEGACY_SESSION_SAVE_VERSION = 1;

// The fields a resume carries, declared once. buildSessionSnapshot writes them
// and the store's restoreSession reads the same lists, so the two cannot drift.
export const PERSISTED_STRING_ARRAY_FIELDS = [
  'collectedSpecimenIds',
  'collectedSpecimenActorIds',
  'documentedSpecimenIds',
  'sightedSpecimenIds',
  'examinedTypeIds',
  'seenHints',
  'consultedBookIds',
  'visitedZoneIds',
  'visitedLocalCellIds',
  'favoriteSpecimenIds',
  // What has been used up in the world. Without these a resume regrew every
  // crop, refilled every broken crate, and let each rock be chipped again.
  'brokenPropIds',
  'sampledRockIds',
  'collectedSampleIds',
  'harvestedCropIds',
  'foragedObjectIds',
];

export const PERSISTED_TOOLBAR_FIELDS = ['toolbarOrder', 'darwinToolbarOrder'];

const NUMBER_FIELDS = ['health', 'fatigue', 'timeOfDay', 'day', 'localStanding', 'minutesSinceMeal'];
const JOURNAL_DRAFT_MAX_CHARS = 8000;

function sanitizeDownedSpecimenActors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 32).filter(([key, entry]) => (
    typeof key === 'string' && entry && typeof entry === 'object'
  )));
}

const MAX_FIELD_MEASUREMENTS = 400;

export function sanitizeFieldMeasurements(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_FIELD_MEASUREMENTS).filter(record => (
    record
    && typeof record === 'object'
    && typeof record.specimenId === 'string'
    && typeof record.traitId === 'string'
    && typeof record.actorId === 'string'
    && Number.isFinite(Number(record.value))
  )).map(record => ({
    id: String(record.id || `${record.actorId}:${record.traitId}`).slice(0, 200),
    specimenId: record.specimenId.slice(0, 80),
    actorId: record.actorId.slice(0, 160),
    traitId: record.traitId.slice(0, 80),
    value: Number(record.value),
    zoneId: typeof record.zoneId === 'string' ? record.zoneId.slice(0, 80) : null,
    location: typeof record.location === 'string' ? record.location.slice(0, 160) : '',
    day: Number.isFinite(Number(record.day)) ? Number(record.day) : null,
    attempt: Number.isFinite(Number(record.attempt)) ? Number(record.attempt) : 0,
  }));
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : [];
}

export function sanitizeAssessmentTranscript(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-64).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const text = String(entry.text || '').trim().slice(0, 2000);
    if (!text) return [];
    const finite = number => {
      const parsed = Number(number);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return [{
      id: typeof entry.id === 'string' ? entry.id.slice(0, 160) : `restored-turn-${index}`,
      text,
      day: finite(entry.day),
      timeOfDay: finite(entry.timeOfDay),
      zoneId: typeof entry.zoneId === 'string' ? entry.zoneId.slice(0, 80) : null,
      locationName: typeof entry.locationName === 'string' ? entry.locationName.slice(0, 160) : '',
      specimenId: typeof entry.specimenId === 'string' ? entry.specimenId.slice(0, 120) : null,
      specimenName: typeof entry.specimenName === 'string' ? entry.specimenName.slice(0, 160) : null,
      activeToolId: typeof entry.activeToolId === 'string' ? entry.activeToolId.slice(0, 80) : null,
      symsNearby: entry.symsNearby === true,
      createdAt: finite(entry.createdAt),
    }];
  });
}

export function sanitizeNpcEncounterState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [rawId, relation] of Object.entries(value).slice(0, 16)) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    const npcId = String(rawId || '').trim().slice(0, 80);
    if (!npcId) continue;
    const rawTrust = Number(relation.trust);
    output[npcId] = {
      trust: Number.isFinite(rawTrust) ? Math.max(0, Math.min(100, rawTrust)) : 50,
      flags: stringArray(relation.flags).slice(-24).map(flag => flag.slice(0, 120)),
    };
  }
  return output;
}

/**
 * A run that has ended (death, the Beagle sailing, or Henslow's verdict) has
 * no resume point. The snapshot does not carry those end states, so saving one
 * would load as a live game: a 0-health Darwin who can no longer die, or a
 * day 3 that replays the ending.
 */
export function isExpeditionFinished(state) {
  return Boolean(
    state?.expeditionOutcome?.type === 'death'
    || state?.expeditionDeparted
    || state?.finalAssessment,
  );
}

/**
 * Extracts the resumable slice of store state. Pure so it can be unit tested
 * without a browser.
 */
export function buildSessionSnapshot(state) {
  if (!state) return null;
  const snapshot = {
    version: SESSION_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: typeof state.seed === 'string' ? state.seed : null,
    playableModeId: typeof state.playableModeId === 'string' ? state.playableModeId : 'darwin',
    currentZoneId: state.currentZoneId,
    currentLocalCellId: state.currentLocalCellId ?? null,
    playerSpawnId: typeof state.playerSpawnId === 'string' ? state.playerSpawnId : 'default',
    questComplete: Boolean(state.questComplete),
    weather: typeof state.weather === 'string' ? state.weather : null,
    activeToolId: typeof state.activeToolId === 'string' ? state.activeToolId : 'hands',
    // The journal draft is kept so writing in progress survives a reload, and
    // shot specimens still lying where they fell stay there.
    journalDraft: typeof state.journalDraft === 'string' ? state.journalDraft.slice(0, JOURNAL_DRAFT_MAX_CHARS) : '',
    downedSpecimenActors: sanitizeDownedSpecimenActors(state.downedSpecimenActors),
    // How tame each species still is in each region; see wildlife/wariness.js.
    wildlifeWariness: sanitizeWildlifeWariness(state.wildlifeWariness),
    supplies: state.supplies && typeof state.supplies === 'object' ? { ...state.supplies } : null,
    inventory: Array.isArray(state.inventory) ? state.inventory : [],
    // Specimens already landed aboard the Beagle. Persisted separately from
    // `inventory` (the case Darwin carries) because it is the durable record
    // of expedition progress.
    shipCollection: Array.isArray(state.shipCollection) ? state.shipCollection : [],
    items: Array.isArray(state.items) ? state.items : [],
    journal: Array.isArray(state.journal) ? state.journal : [],
    fieldMeasurements: sanitizeFieldMeasurements(state.fieldMeasurements),
    bookLastPages: state.bookLastPages && typeof state.bookLastPages === 'object'
      ? { ...state.bookLastPages }
      : {},
    activeDirectiveId: typeof state.activeDirectiveId === 'string' ? state.activeDirectiveId : null,
    symsDirective: typeof state.symsDirective === 'string' ? state.symsDirective : null,
    symsZoneId: typeof state.symsZoneId === 'string' ? state.symsZoneId : null,
    // These two bounded records feed the final assessment. Omitting them made a
    // resumed day-three expedition look as though Darwin had never spoken or
    // engaged with anyone during the earlier sittings.
    assessmentPlayerTranscript: sanitizeAssessmentTranscript(state.assessmentPlayerTranscript),
    npcEncounterState: sanitizeNpcEncounterState(state.npcEncounterState),
  };
  for (const field of PERSISTED_STRING_ARRAY_FIELDS) snapshot[field] = stringArray(state[field]);
  for (const field of PERSISTED_TOOLBAR_FIELDS) snapshot[field] = stringArray(state[field]);
  for (const field of NUMBER_FIELDS) {
    const value = Number(state[field]);
    snapshot[field] = Number.isFinite(value) ? value : null;
  }
  return snapshot;
}

/** Rejects snapshots from an older/unknown schema rather than half-applying them. */
export function isUsableSessionSnapshot(snapshot) {
  return Boolean(
    snapshot
    && typeof snapshot === 'object'
    && (snapshot.version === SESSION_SAVE_VERSION || snapshot.version === LEGACY_SESSION_SAVE_VERSION)
    && typeof snapshot.currentZoneId === 'string'
    && snapshot.currentZoneId.length > 0,
  );
}

/**
 * One-line description for the launch menu's footer, e.g.
 * "Day 2, 10:15 AM — 3 specimens".
 */
export function summarizeSessionSnapshot(snapshot, { regionName = null } = {}) {
  if (!isUsableSessionSnapshot(snapshot)) return null;
  const day = Number.isFinite(snapshot.day) ? snapshot.day : 1;
  const hoursRaw = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : 0;
  const hours = ((hoursRaw % 24) + 24) % 24;
  const wholeHours = Math.floor(hours);
  const minutes = Math.floor((hours - wholeHours) * 60);
  const suffix = wholeHours >= 12 ? 'PM' : 'AM';
  const displayHour = wholeHours % 12 === 0 ? 12 : wholeHours % 12;
  const time = `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
  const specimens = stringArray(snapshot.collectedSpecimenIds).length;
  const notes = Array.isArray(snapshot.journal) ? snapshot.journal.length : 0;
  const parts = [`Day ${day}, ${time}`];
  if (regionName) parts.push(regionName);
  parts.push(specimens === 1 ? '1 specimen' : `${specimens} specimens`);
  return {
    day,
    time,
    regionName,
    specimens,
    notes,
    label: parts.join(' · '),
  };
}

export function readSessionSnapshot() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(SESSION_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isUsableSessionSnapshot(parsed) ? parsed : null;
  } catch {
    // Corrupt or blocked storage must never prevent the menu from loading.
    return null;
  }
}

export function writeSessionSnapshot(snapshot) {
  if (typeof window === 'undefined' || !isUsableSessionSnapshot(snapshot)) return false;
  try {
    window.localStorage?.setItem(SESSION_SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    // Quota or private-browsing failures are non-fatal; play continues.
    return false;
  }
}

export function clearSessionSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(SESSION_SAVE_KEY);
  } catch {
    // Nothing to do — the stale save is only ever offered, never forced.
  }
}
