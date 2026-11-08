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

// A pencil on a label card. The pencil samples are whole scribbles (about
// 0.6 s of sound in each slot), so the card plays short pieces of them: one
// quick stroke per keystroke, and while drawing, back-to-back pieces whose
// loudness follows how fast the pencil moves. Overlapping whole scribbles
// would smear into a hiss.
const PENCIL_SOUND_SPAN = 0.55;
let lastPencilStrokeAt = 0;

export function playPencilStroke() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPencilStrokeAt < 55) return;
  lastPencilStrokeAt = now;
  playInterfaceCue('pencil', {
    gain: vary(0.05, 0.3),
    playbackRate: vary(1.08, 0.08),
    offset: 0.04 + Math.random() * (PENCIL_SOUND_SPAN - 0.14),
    duration: vary(0.075, 0.25),
  });
}

let lastPencilDrawAt = 0;
let pencilDrawDistance = 0;

// `distance` is how far the point moved since the last call, in card pixels
// (the card is 1200 wide).
export function playPencilDraw(distance) {
  pencilDrawDistance += distance;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPencilDrawAt < 120 || pencilDrawDistance < 6) return;
  const elapsed = Math.min(0.3, (now - lastPencilDrawAt) / 1000);
  const speed = pencilDrawDistance / Math.max(0.05, elapsed);
  lastPencilDrawAt = now;
  pencilDrawDistance = 0;
  const pressure = Math.min(1, speed / 900);
  playInterfaceCue('pencil', {
    gain: 0.02 + pressure * 0.045,
    playbackRate: vary(0.95 + pressure * 0.15, 0.05),
    offset: 0.04 + Math.random() * (PENCIL_SOUND_SPAN - 0.2),
    duration: 0.15,
  });
}

// India rubber taking back a stroke: a brief soft brush of paper.
export function playRubOut() {
  playInterfaceCue('paperOpen', { gain: vary(0.03, 0.15), playbackRate: 0.9, offset: 0.03, duration: 0.16 });
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

// Button-level cues, by delegation rather than per component: a button marked
// `data-ui-sound="tab"` or `"seal"` plays that cue, toggles (aria-pressed,
// role="switch", aria-checked) play the brass detent, and pressing a disabled
// control plays the felt knock. Ordinary buttons stay silent: the panels they
// open and close already sound as their objects. Hover never sounds.
const BUTTON_CUES = Object.freeze({
  tab: { cue: 'tabFlick', gain: 0.045 },
  seal: { cue: 'sealPress', gain: 0.06 },
  toggle: { cue: 'detent', gain: 0.04 },
  refused: { cue: 'feltThud', gain: 0.045 },
});
const BUTTON_REPEAT_MS = 70;
const lastButtonCueAt = new Map();

export function buttonCueKind(element) {
  const control = element?.closest?.('button, [role="button"], [role="switch"], [role="radio"], [role="tab"]');
  if (!control) return null;
  if (control.disabled || control.getAttribute('aria-disabled') === 'true') {
    // The chosen option in a set is often disabled to stop a re-pick; that is
    // a state, not a refusal.
    const chosen = control.getAttribute('aria-pressed') === 'true' || control.getAttribute('aria-checked') === 'true';
    return chosen ? null : 'refused';
  }
  const marked = control.getAttribute('data-ui-sound');
  if (marked) return marked === 'none' ? null : marked;
  if (control.hasAttribute('aria-pressed') || control.hasAttribute('aria-checked') || control.getAttribute('role') === 'switch') {
    return 'toggle';
  }
  return null;
}

export function playButtonCue(kind) {
  const spec = BUTTON_CUES[kind];
  if (!spec) return false;
  const now = performance.now();
  if (now - (lastButtonCueAt.get(kind) || 0) < BUTTON_REPEAT_MS) return false;
  lastButtonCueAt.set(kind, now);
  return playInterfaceCue(spec.cue, { gain: vary(spec.gain, 0.12), playbackRate: vary(1, 0.05) });
}

// A disabled button swallows its click, so the refusal is heard on
// pointerdown; everything else waits for the click that actually acts.
// Returns the uninstall function.
export function installInterfaceButtonCues(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return () => {};
  const onPointerDown = event => {
    if (event.button !== 0) return;
    if (buttonCueKind(event.target) === 'refused') playButtonCue('refused');
  };
  const onClick = event => {
    const kind = buttonCueKind(event.target);
    if (kind && kind !== 'refused') playButtonCue(kind);
  };
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('click', onClick, true);
  };
}
