'use client';

import { playInterfaceCue } from './audioRuntime';

// What the HUD sounds like: every overlay is a book, a loose folio, or the
// chart, and its open and close play that object rather than a click. The
// inventory case is already heard as leather (equipment-foley), so it opts
// out with `sound: null`.
const OVERLAY_CUES = Object.freeze({
  book: { open: 'bookOpen', close: 'bookClose', gain: 0.075 },
  paper: { open: 'paperOpen', close: 'paperClose', gain: 0.06 },
  map: { open: 'mapUnroll', close: 'mapRoll', gain: 0.075 },
});

// Swapping one panel for another (journal -> chart) closes and opens in the
// same frame; only the new object should be heard.
const CLOSE_HOLD_MS = 70;
let pendingClose = null;
// React's development double-run mounts, unmounts and remounts each effect;
// the remount must not play the cover a second time.
let lastOpen = { cue: null, at: 0 };

function vary(value, amount) {
  return value * (1 + (Math.random() * 2 - 1) * amount);
}

export function playOverlayCue(sound, open) {
  const cue = OVERLAY_CUES[sound];
  if (!cue || typeof window === 'undefined') return;
  if (open) {
    if (pendingClose) {
      window.clearTimeout(pendingClose);
      pendingClose = null;
    }
    const now = performance.now();
    if (lastOpen.cue === cue.open && now - lastOpen.at < 150) return;
    lastOpen = { cue: cue.open, at: now };
    playInterfaceCue(cue.open, { gain: vary(cue.gain, 0.08), playbackRate: vary(1, 0.03) });
    return;
  }
  if (pendingClose) window.clearTimeout(pendingClose);
  pendingClose = window.setTimeout(() => {
    pendingClose = null;
    playInterfaceCue(cue.close, { gain: vary(cue.gain * 0.85, 0.08), playbackRate: vary(1, 0.03) });
  }, CLOSE_HOLD_MS);
}

// Turning faster than a leaf can fall should not stack riffles.
let lastPageTurnAt = 0;

export function playPageTurn() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPageTurnAt < 140) return;
  lastPageTurnAt = now;
  playInterfaceCue('pageTurn', { gain: vary(0.06, 0.12), playbackRate: vary(1, 0.05) });
}

// Journal entries written in Darwin's hand. Collection and documentation
// records already carry the field-note and container sounds in the world;
// these are the ones the player writes or that are fair-copied aboard.
const ENTRY_CUES = Object.freeze({
  note: { cue: 'pencil', gain: 0.07 },
  examination: { cue: 'pencil', gain: 0.07 },
  reading: { cue: 'pencil', gain: 0.06 },
  logistics: { cue: 'nib', gain: 0.065 },
});

export function journalEntryCue(entry) {
  return ENTRY_CUES[entry?.kind] || null;
}

export function playJournalEntryCue(entry) {
  const spec = journalEntryCue(entry);
  if (!spec) return false;
  return playInterfaceCue(spec.cue, { gain: vary(spec.gain, 0.1), playbackRate: vary(1, 0.04) });
}

// The dusk bell: the first crossing of six in the evening on a day, heard
// while walking or waiting, not when a sleep or a voyage jumps the clock past
// it.
export const DUSK_HOUR = 18;

export function crossedDusk(previous, next) {
  if (!previous || !next || previous.day !== next.day) return false;
  const before = Number(previous.timeOfDay);
  const after = Number(next.timeOfDay);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
  return before < DUSK_HOUR && after >= DUSK_HOUR && after - before < 0.75;
}

export function playDuskBell() {
  return playInterfaceCue('shipBell', { gain: 0.07, playbackRate: vary(1, 0.01) });
}
