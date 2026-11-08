'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { playButtonCue, playPencilStroke, playRubOut } from '../audio/interfaceFoley';
import { setTypingMode } from '../input/typingMode';
import { useThreeGameStore } from '../store';
import { LABEL, compactSketch, labelDraft, labelRig, labelSketch } from '../examine/labelWriting';
import { useDismissableOverlay } from './useDismissableOverlay';

// The controls for writing a label (examine/labelWriting.js). The card itself
// is in the scene; this layer only takes the typing and offers Record and Put
// down. The text field is real but kept out of sight, so the handwriting on
// the card is what the player reads, unless they ask for plain text. Drawing
// on the card with the mouse happens in the scene; Rub out takes back the
// last stroke.

const RECORDED_HOLD_MS = 1100;
// A label that is only a drawing still needs a line in the field book.
const SKETCH_ONLY_NOTE = 'A sketch, made in the field.';
const RECORD_SHORTCUT = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '') ? '⌘↵' : 'Ctrl ↵';

export function LabelWritingPanel({ onRecorded }) {
  const saveExamineNote = useThreeGameStore(state => state.saveExamineNote);
  const setExamineLabelOpen = useThreeGameStore(state => state.setExamineLabelOpen);
  const text = useSyncExternalStore(labelDraft.subscribe, labelDraft.get, labelDraft.get);
  const sketchVersion = useSyncExternalStore(labelSketch.subscribe, labelSketch.version, labelSketch.version);
  const sketched = sketchVersion >= 0 && !labelSketch.empty();
  const [plainText, setPlainText] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const putDown = () => {
    if (recorded) return;
    setExamineLabelOpen(false);
  };
  const panelRef = useDismissableOverlay(true, putDown, { autoFocus: false, sound: 'paper' });

  useEffect(() => {
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    setTypingMode(true);
    labelRig.locked = false;
    // A press on the card to draw takes focus from the hidden field; give it
    // back so typing carries on without another click.
    const unsubscribe = labelSketch.subscribe(() => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true });
    });
    return () => {
      unsubscribe();
      setTypingMode(false);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const record = () => {
    const trimmed = text.trim();
    if ((!trimmed && !sketched) || recorded) return;
    if (!saveExamineNote(trimmed || SKETCH_ONLY_NOTE, { sketch: compactSketch() })) return;
    labelRig.locked = true;
    // The seal press, also for ⌘↵ (a click's own cue is deduped against it).
    playButtonCue('seal');
    setRecorded(true);
    // Leave the finished card in view a moment before he lowers it.
    timerRef.current = window.setTimeout(() => {
      labelDraft.set('');
      labelSketch.clear();
      setExamineLabelOpen(false);
      onRecorded?.();
    }, RECORDED_HOLD_MS);
  };

  const onKeyDown = event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      record();
    }
  };

  // Quiet unless there is something to say: how to begin, when the card is
  // nearly full, and that it went in.
  const remaining = LABEL.maxChars - text.length;
  const status = recorded
    ? 'Recorded in the field book'
    : remaining <= 60
      ? `Room for ${remaining} more`
      : !text && !sketched
        ? 'Type a note · drag to sketch'
        : '';

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      data-testid="label-writing"
      className="pointer-events-none fixed inset-0 z-[60] font-expedition focus:outline-none"
      onPointerDown={event => {
        // Clicking anywhere keeps the pencil on the card.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_62%,transparent_45%,rgba(8,6,3,0.55)_100%)]" />
      <textarea
        ref={inputRef}
        value={text}
        maxLength={LABEL.maxChars}
        onChange={event => {
          const next = event.target.value;
          if (next.trim().length > text.trim().length) playPencilStroke();
          labelDraft.set(next);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setTypingMode(true)}
        onBlur={() => setTypingMode(false)}
        disabled={recorded}
        aria-label="Label text"
        spellCheck
        className={plainText
          ? 'pointer-events-auto absolute left-1/2 top-[6%] h-[18%] w-[min(560px,86vw)] -translate-x-1/2 resize-none rounded-[3px] border border-expedition-brass/50 bg-black/70 p-3 text-[17px] leading-relaxed text-expedition-parchment outline-none'
          : 'pointer-events-auto absolute left-0 top-0 h-px w-px resize-none opacity-0'}
      />
      <div className="pointer-events-auto absolute bottom-[3.5%] left-1/2 flex w-[min(720px,92vw)] -translate-x-1/2 items-center gap-3 rounded-[3px] border border-expedition-brass/40 bg-[rgba(18,14,9,0.72)] px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <span
          aria-live="polite"
          className={`min-w-0 flex-1 truncate font-sans text-[11px] font-semibold uppercase tracking-[0.12em] ${recorded ? 'text-[#9db485]' : remaining <= 60 ? 'text-[#d9a05a]' : 'text-expedition-goldbright/90'}`}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={() => setPlainText(value => !value)}
          aria-pressed={plainText}
          className="font-sans text-[11px] uppercase tracking-[0.1em] text-expedition-faded transition hover:text-expedition-parchment"
        >
          {plainText ? 'Hide typed' : 'Typed text'}
        </button>
        {sketched && (
          <button
            type="button"
            onClick={() => {
              labelSketch.undo();
              playRubOut();
            }}
            disabled={recorded}
            title="Take back the last pencil stroke"
            className="font-sans text-[11px] uppercase tracking-[0.1em] text-expedition-faded transition hover:text-expedition-parchment disabled:opacity-40"
          >
            Rub out
          </button>
        )}
        <button
          type="button"
          onClick={putDown}
          disabled={recorded}
          className="min-h-[38px] rounded-[3px] border border-expedition-brass/40 px-3 font-sans text-[11.5px] font-semibold uppercase tracking-[0.08em] text-expedition-parchment/85 transition hover:border-expedition-goldbright/70 disabled:opacity-40"
        >
          Put down <span className="ml-1 text-expedition-faded">Esc</span>
        </button>
        <button
          type="button"
          data-testid="examine-record-note"
          data-ui-sound="seal"
          onClick={record}
          disabled={(!text.trim() && !sketched) || recorded}
          className="min-h-[38px] rounded-[3px] border border-expedition-goldbright/60 bg-[linear-gradient(135deg,rgba(191,152,81,0.3),rgba(191,152,81,0.1))] px-3.5 font-sans text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#f5e5bd] transition hover:bg-expedition-gold/25 disabled:cursor-not-allowed disabled:border-expedition-brass/20 disabled:bg-transparent disabled:text-expedition-faded/40"
        >
          Record label <span className="ml-1 text-expedition-faded">{RECORD_SHORTCUT}</span>
        </button>
      </div>
    </div>
  );
}
