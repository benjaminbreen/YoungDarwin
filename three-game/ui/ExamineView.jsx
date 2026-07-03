'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setTypingMode } from '../input/typingMode';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { inquiryExamples } from '../examine/examinables';
import { GoldDivider } from './expedition/ExpeditionPanel';

// The diegetic examination screen: the camera has dollied in on the subject,
// the clock is paused, and typography sits directly on the graded live shot —
// no panels, matching the status view's language. Left column is the
// LLM-backed field inquiry; right column collects the facts inquiry surfaces;
// the bottom block is the player's own written field note — saving it
// completes the examination and unlocks collecting the type.

const EXPEDITION_START = Date.UTC(1835, 8, 17); // day 1 = Sep 17, 1835
const MS_PER_DAY = 86400000;

// Legacy globals.css paints all text inputs parchment with heavy padding;
// these inline styles win the cascade and keep the fields to a single quiet
// rule of gold under the text.
const QUILL_INPUT_STYLE = {
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(201,163,95,0.4)',
  borderRadius: 0,
  boxShadow: 'none',
  color: '#efe2c4',
  padding: '0.3rem 0.05rem',
};

function expeditionDate(day) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(EXPEDITION_START + Math.max(0, (day || 1) - 1) * MS_PER_DAY));
}

function chatAge(at) {
  const seconds = Math.max(0, (Date.now() - (at || Date.now())) / 1000);
  if (seconds < 75) return 'just now';
  return `${Math.round(seconds / 60)}m ago`;
}

function SectionHeading({ children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[16px] uppercase tracking-[0.22em] text-expedition-gold [text-shadow:0_1px_6px_rgba(0,0,0,0.85)]">
        {children}
      </div>
      <GoldDivider className="mt-2.5" />
    </div>
  );
}

function FooterKey({ label, children, disabled = false, onClick = null }) {
  const body = (
    <>
      <span className={`text-[12px] font-semibold tracking-[0.14em] ${disabled ? 'text-expedition-faded/50' : 'text-expedition-goldbright'}`}>
        {label}
      </span>
      <span className={`text-[12px] uppercase tracking-[0.18em] ${disabled ? 'text-expedition-faded/50' : 'text-expedition-parchment/80'}`}>
        {children}
      </span>
    </>
  );
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className="pointer-events-auto inline-flex items-baseline gap-2 transition hover:brightness-125">
        {body}
      </button>
    );
  }
  return <span className="inline-flex items-baseline gap-2">{body}</span>;
}

function FactRow({ fact, onSave }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[17px] leading-snug text-expedition-parchment">{fact.label}</span>
      <span className="flex items-baseline gap-2.5 text-right">
        <span className={`text-[17px] ${fact.confidence === 'low' ? 'italic text-expedition-parchment/70' : 'text-expedition-goldbright'}`}>
          {fact.value}
        </span>
        {!fact.saved && (
          <button
            type="button"
            onClick={onSave}
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-expedition-gold/85 underline decoration-expedition-gold/40 underline-offset-4 transition hover:text-expedition-goldbright"
          >
            Save
          </button>
        )}
      </span>
    </div>
  );
}

export function ExamineView() {
  const session = useThreeGameStore(state => state.examineSession);
  const closeExamine = useThreeGameStore(state => state.closeExamine);
  const sendExamineMessage = useThreeGameStore(state => state.sendExamineMessage);
  const saveExamineFact = useThreeGameStore(state => state.saveExamineFact);
  const saveExamineNote = useThreeGameStore(state => state.saveExamineNote);
  const collectFromExamine = useThreeGameStore(state => state.collectFromExamine);
  const examinedTypeIds = useThreeGameStore(state => state.examinedTypeIds);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const [visible, setVisible] = useState(false);
  const [question, setQuestion] = useState('');
  const [note, setNote] = useState('');
  const [noteSavedFlash, setNoteSavedFlash] = useState(false);
  const chatScrollRef = useRef(null);
  const noteRef = useRef(null);

  const open = Boolean(session);
  const examined = Boolean(session && examinedTypeIds.includes(session.typeId));
  const collectReady = examined && session?.collectable;

  // Let the camera dolly begin before the type fades in over the shot.
  useEffect(() => {
    if (!open) {
      setVisible(false);
      setQuestion('');
      setNote('');
      setNoteSavedFlash(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 420);
    return () => window.clearTimeout(timer);
  }, [open]);

  const chatLength = session?.chat?.length || 0;
  useEffect(() => {
    const list = chatScrollRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chatLength]);

  const submitQuestion = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setQuestion('');
    sendExamineMessage(trimmed);
  }, [question, sendExamineMessage]);

  const submitNote = useCallback(() => {
    const trimmed = note.trim();
    if (!trimmed) return;
    if (saveExamineNote(trimmed)) {
      setNote('');
      setNoteSavedFlash(true);
      window.setTimeout(() => setNoteSavedFlash(false), 2600);
      noteRef.current?.blur();
    }
  }, [note, saveExamineNote]);

  const saveNewestFact = useCallback(() => {
    const unsaved = [...(useThreeGameStore.getState().examineSession?.facts || [])].reverse().find(fact => !fact.saved);
    if (unsaved) saveExamineFact(unsaved.id);
  }, [saveExamineFact]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExamine();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        saveNewestFact();
        return;
      }
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (!typing && (event.code === 'KeyC') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (collectReady) collectFromExamine();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeExamine, saveNewestFact, collectReady, collectFromExamine]);

  const zone = useMemo(() => (open ? getZone(currentZoneId) : null), [open, currentZoneId]);
  const examples = useMemo(() => (session ? inquiryExamples(session) : ''), [session]);

  if (!open) return null;

  const headerSubtitle = [zone?.name, session.subtitle, expeditionDate(session.day)].filter(Boolean);
  const unsavedFacts = session.facts.some(fact => !fact.saved);

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-30 select-none font-expedition text-expedition-parchment transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Cinematic grade: the scene dims toward the edges, holding a clear
          pool of light on the subject; type sits directly on the shot. */}
      <div className="pointer-events-none absolute inset-0 bg-[rgba(9,10,12,0.34)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_58%_54%_at_50%_46%,transparent_26%,rgba(7,8,10,0.55)_66%,rgba(4,5,6,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,9,0.62)_0%,transparent_18%,transparent_72%,rgba(5,6,8,0.72)_100%)]" />

      {/* Fine reticle ellipse framing the subject */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[45%] h-[min(54vh,48vw)] w-[min(54vh,48vw)] -translate-x-1/2 -translate-y-1/2 text-expedition-gold/25"
      >
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="currentColor" strokeWidth="0.3" />
        {[[50, 1.5], [98.5, 50], [50, 98.5], [1.5, 50]].map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x - 0.9}
            y={y - 0.9}
            width="1.8"
            height="1.8"
            fill="currentColor"
            transform={`rotate(45 ${x} ${y})`}
            opacity="0.9"
          />
        ))}
      </svg>

      {/* Measurement callout under the subject */}
      {session.measurementCallout && (
        <div className="pointer-events-none absolute left-1/2 top-[73%] -translate-x-1/2">
          <div className="flex items-center gap-3 text-expedition-goldbright [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
            <span className="h-px w-14 bg-expedition-gold/60" />
            <span className="text-[15px] tracking-[0.08em]">{session.measurementCallout}</span>
            <span className="h-px w-14 bg-expedition-gold/60" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="absolute left-1/2 top-7 w-[min(60rem,94vw)] -translate-x-1/2 text-center">
        <div className="whitespace-nowrap text-[24px] font-medium uppercase tracking-[0.24em] text-[#f3e6c8] [text-shadow:0_2px_16px_rgba(0,0,0,0.85)] md:text-[32px]">
          Examine: {session.name}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2.5 text-[14.5px] text-expedition-parchment/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          {headerSubtitle.map((part, index) => (
            <React.Fragment key={part}>
              {index > 0 && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rotate-45 bg-expedition-gold/80" />}
              <span>{part}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Close */}
      <button
        type="button"
        onClick={closeExamine}
        aria-label="Close examination"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-expedition-brass/70 bg-black/30 text-lg text-expedition-parchment/85 transition hover:border-expedition-gold hover:text-expedition-goldbright"
      >
        ✕
      </button>

      {/* Left column: field inquiry */}
      <div className="absolute left-10 top-32 hidden w-[24rem] [text-shadow:0_1px_4px_rgba(0,0,0,0.7)] md:block">
        <SectionHeading>Field Inquiry</SectionHeading>
        <div className="mt-1.5 text-[13px] italic text-expedition-faded">Ask questions about what you observe.</div>
        <div ref={chatScrollRef} className="mt-4 max-h-[calc(100vh-30rem)] min-h-[14rem] overflow-y-auto pr-2 [scrollbar-width:thin]">
          {session.chat.length === 0 && (
            <div className="text-[14.5px] leading-relaxed text-expedition-parchment/60">
              The subject is before you. Ask what you wish to know, or attempt a procedure — measure it, describe it, test it.
            </div>
          )}
          {session.chat.map(entry => (
            <div key={entry.id} className="mb-4 last:mb-0">
              <div className="flex items-baseline justify-between">
                <span className={`text-[10.5px] font-semibold uppercase tracking-[0.2em] ${entry.role === 'you' ? 'text-expedition-parchment/60' : 'text-expedition-gold'}`}>
                  {entry.role === 'you' ? 'You' : 'Observation'}
                </span>
                <span className="text-[10.5px] text-expedition-faded/70">{chatAge(entry.at)}</span>
              </div>
              <div className="mt-1 text-[15px] leading-relaxed text-expedition-parchment/95">{entry.text}</div>
              {entry.behavior && (
                <div className="mt-1 text-[13.5px] italic leading-relaxed text-expedition-parchment/65">{entry.behavior}</div>
              )}
            </div>
          ))}
          {session.pending && (
            <div className="text-[13px] italic text-expedition-faded">You look closer…</div>
          )}
        </div>
        <form
          className="mt-4"
          onSubmit={event => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <input
            type="text"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onFocus={() => setTypingMode(true)}
            onBlur={() => setTypingMode(false)}
            placeholder={`Ask about this ${session.kind === 'item' ? 'object' : 'specimen'}…`}
            style={QUILL_INPUT_STYLE}
            className="w-full text-[15px] placeholder:text-expedition-faded/60 focus:outline-none"
          />
        </form>
        <div className="mt-2.5 text-[12px] italic leading-snug text-expedition-faded/80">{examples}</div>
        {session.error && (
          <div className="mt-1.5 text-[11.5px] text-[#d9a05a]">{session.error}</div>
        )}
      </div>

      {/* Right column: key facts + uncertainties */}
      <div className="absolute right-10 top-32 hidden w-[21rem] [text-shadow:0_1px_4px_rgba(0,0,0,0.7)] md:block">
        <SectionHeading>Key Facts</SectionHeading>
        <div className="mt-4 grid gap-3.5">
          {session.facts.map(fact => (
            <FactRow key={fact.id} fact={fact} onSave={() => saveExamineFact(fact.id)} />
          ))}
        </div>
        {session.facts.length <= 1 && (
          <div className="mt-3 text-[13px] italic leading-relaxed text-expedition-parchment/55">
            Facts appear here as your inquiry uncovers them.
          </div>
        )}
        {session.uncertainties.length > 0 && (
          <>
            <SectionHeading className="mt-9">Uncertainties</SectionHeading>
            <div className="mt-3.5 grid gap-2 text-[13.5px] italic leading-relaxed text-expedition-parchment/70">
              {session.uncertainties.map(item => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </>
        )}
        {session.latin && examined && (
          <div className="mt-6 text-[13px] italic text-expedition-faded">{session.latin}</div>
        )}
      </div>

      {/* Bottom: field note + key hints, centered like the status view's quote */}
      <div className="absolute bottom-6 left-1/2 w-[min(46rem,92vw)] -translate-x-1/2 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] uppercase tracking-[0.22em] text-expedition-gold">Field Note</span>
          <span className={`text-[11px] uppercase tracking-[0.16em] transition-opacity duration-300 ${
            noteSavedFlash ? 'text-[#9dc08b] opacity-100' : examined ? 'text-[#9dc08b]/80 opacity-100' : 'text-expedition-faded/70 opacity-100'
          }`}
          >
            {noteSavedFlash ? 'Note recorded' : examined ? 'Examined ✓' : 'Record your observations in your own words'}
          </span>
        </div>
        <textarea
          ref={noteRef}
          value={note}
          onChange={event => setNote(event.target.value)}
          onFocus={() => setTypingMode(true)}
          onBlur={() => setTypingMode(false)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitNote();
            }
          }}
          rows={2}
          placeholder={examined
            ? 'Add a further observation to the field book…'
            : 'What do you observe? Saving a note completes the examination.'}
          style={QUILL_INPUT_STYLE}
          className="mt-2 min-h-[3.2rem] w-full resize-none text-[15.5px] leading-relaxed placeholder:text-expedition-faded/55 focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
          <FooterKey label="ESC" onClick={closeExamine}>Return</FooterKey>
          <FooterKey label="ENTER" onClick={submitNote}>Save Note</FooterKey>
          <FooterKey label="C" disabled={!collectReady} onClick={() => collectFromExamine()}>
            {session.collectVerb}
          </FooterKey>
          <FooterKey label="TAB" disabled={!unsavedFacts} onClick={saveNewestFact}>Save Fact</FooterKey>
        </div>
      </div>

      {/* Mobile: compact inquiry block above the note */}
      <div className="absolute inset-x-5 bottom-[11.5rem] max-h-[38%] overflow-y-auto [text-shadow:0_1px_4px_rgba(0,0,0,0.7)] md:hidden">
        <SectionHeading>Field Inquiry</SectionHeading>
        <div className="mt-2.5">
          {session.chat.slice(-4).map(entry => (
            <div key={entry.id} className="mb-2.5 last:mb-0">
              <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${entry.role === 'you' ? 'text-expedition-parchment/60' : 'text-expedition-gold'}`}>
                {entry.role === 'you' ? 'You' : 'Observation'}
              </span>
              <div className="text-[13.5px] leading-snug text-expedition-parchment/95">{entry.text}</div>
            </div>
          ))}
          {session.pending && <div className="text-[12px] italic text-expedition-faded">You look closer…</div>}
        </div>
        <form
          className="mt-2.5"
          onSubmit={event => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <input
            type="text"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onFocus={() => setTypingMode(true)}
            onBlur={() => setTypingMode(false)}
            placeholder="Ask about it…"
            style={QUILL_INPUT_STYLE}
            className="w-full text-[14px] placeholder:text-expedition-faded/60 focus:outline-none"
          />
        </form>
      </div>
    </div>
  );
}
