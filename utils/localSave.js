import { EXPEDITION_SAVE_VERSION } from './expeditionSystems';

const SAVE_KEY = 'young-darwin-expedition-save';

function formatSavedTime(minutes = 360) {
  const totalMinutes = minutes % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

export function buildSaveSnapshot(state = {}) {
  return {
    schemaVersion: EXPEDITION_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    expeditionSeed: state.expeditionSeed,
    gameStarted: state.gameStarted,
    currentScreen: state.currentScreen,
    currentLocationId: state.currentLocationId,
    playerLocation: state.playerLocation,
    gameTime: state.gameTime,
    daysPassed: state.daysPassed,
    fatigue: state.fatigue,
    darwinMood: state.darwinMood,
    scientificScore: state.scientificScore,
    inventory: state.inventory || [],
    journal: state.journal || [],
    traps: state.traps || [],
    objectives: state.objectives || [],
    eventHistory: state.eventHistory || [],
    specimenList: state.specimenList || [],
  };
}

export function saveExpedition(state) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveSnapshot(state)));
    return true;
  } catch (error) {
    console.error('Unable to save Young Darwin expedition:', error);
    return false;
  }
}

export function loadExpedition() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.error('Unable to load Young Darwin expedition:', error);
    return null;
  }
}

export function summarizeExpeditionSave(saved = null) {
  if (!saved || typeof saved !== 'object') return null;
  return {
    savedAt: saved.savedAt || null,
    day: saved.daysPassed ?? 1,
    time: formatSavedTime(saved.gameTime ?? 360),
    locationId: saved.currentLocationId || 'POST_OFFICE_BAY',
    specimens: Array.isArray(saved.inventory) ? saved.inventory.length : 0,
    notes: Array.isArray(saved.journal) ? saved.journal.length : 0,
    objectivesComplete: Array.isArray(saved.objectives)
      ? saved.objectives.filter(objective => objective?.complete).length
      : 0,
    objectivesTotal: Array.isArray(saved.objectives) ? saved.objectives.length : 0,
    fatigue: saved.fatigue ?? 0,
  };
}

export function loadExpeditionSummary() {
  return summarizeExpeditionSave(loadExpedition());
}

export function clearExpeditionSave() {
  if (typeof window === 'undefined') return false;
  window.localStorage.removeItem(SAVE_KEY);
  return true;
}

export function exportExpeditionJson(state) {
  return JSON.stringify(buildSaveSnapshot(state), null, 2);
}
