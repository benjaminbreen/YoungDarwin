// Player-facing comfort and audio preferences.
//
// Deliberately storage-only (no React, no zustand), mirroring
// qualityPreference.js: the launch Settings screen must be able to set these
// before the Three.js runtime mounts, and the runtime reads them from inside
// pointer handlers and the audio graph where hooks are not available.
// Subscribers exist so an open settings panel and the live runtime stay in
// sync while a slider is being dragged.

export const PLAYER_PREFERENCES_KEY = 'darwin-player-preferences';

export const PLAYER_PREFERENCE_DEFAULTS = Object.freeze({
  // Multiplier on camera yaw/pitch speed. 1 reproduces the previous
  // hardcoded feel exactly, so an untouched install is unchanged.
  lookSensitivity: 1,
  // Inverts vertical look. Off by default; a meaningful minority of players
  // cannot comfortably play without it, which is why it ranks above volume.
  invertY: false,
  // Linear 0..1 scale applied on top of the existing dB master trim.
  masterVolume: 1,
  // Multiplayer is unfinished; the menu entry is opt-in from Settings so
  // players don't wander into a lobby that cannot connect.
  showMultiplayer: false,
});

const RANGES = {
  lookSensitivity: { min: 0.25, max: 3 },
  masterVolume: { min: 0, max: 1 },
};

const preferences = { ...PLAYER_PREFERENCE_DEFAULTS };
let hydrated = false;
let revision = 0;
const listeners = new Set();

function clampPreference(key, value) {
  const range = RANGES[key];
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PLAYER_PREFERENCE_DEFAULTS[key];
  if (!range) return numeric;
  return Math.max(range.min, Math.min(range.max, numeric));
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PLAYER_PREFERENCES_KEY) || '{}');
    if (stored && typeof stored === 'object') {
      if (stored.lookSensitivity !== undefined) {
        preferences.lookSensitivity = clampPreference('lookSensitivity', stored.lookSensitivity);
      }
      if (stored.invertY !== undefined) preferences.invertY = stored.invertY === true;
      if (stored.showMultiplayer !== undefined) preferences.showMultiplayer = stored.showMultiplayer === true;
      if (stored.masterVolume !== undefined) {
        preferences.masterVolume = clampPreference('masterVolume', stored.masterVolume);
      }
    }
  } catch {
    // Corrupt or unavailable storage falls back to defaults, like every other
    // preference in the app.
  }
}

export function getPlayerPreferences() {
  hydrate();
  return preferences;
}

export function setPlayerPreferences(patch = {}) {
  hydrate();
  let changed = false;
  for (const key of Object.keys(PLAYER_PREFERENCE_DEFAULTS)) {
    if (!(key in patch)) continue;
    const value = (key === 'invertY' || key === 'showMultiplayer')
      ? patch[key] === true
      : clampPreference(key, patch[key]);
    if (preferences[key] === value) continue;
    preferences[key] = value;
    changed = true;
  }
  if (!changed) return;
  revision += 1;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Private-mode storage failures must not break the setting for the
      // current session; the in-memory value still applies.
    }
  }
  listeners.forEach(listener => listener());
}

export function subscribePlayerPreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlayerPreferencesRevision() {
  return revision;
}
