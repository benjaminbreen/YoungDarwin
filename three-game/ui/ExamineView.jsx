'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setTypingMode } from '../input/typingMode';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import styles from './ExamineView.module.css';

// A live specimen stage with one coherent notebook. The camera continues to
// own the subject view; this layer owns inquiry, evidence, authorship, and the
// explicit decision to collect after an observation has been recorded.

const EXPEDITION_START = Date.UTC(1835, 8, 17);
const MS_PER_DAY = 86400000;

const PROCEDURES = {
  Animal: [
    ['Estimate size', 'Estimate how large it is.'],
    ['Observe movement', 'Describe its movement and response to my approach.'],
    ['Inspect condition', 'Inspect its condition for signs of injury, age, or distress.'],
  ],
  Plant: [
    ['Measure spread', 'Measure the width and height of the plant.'],
    ['Inspect growth', 'Describe its leaves, stems, and seed heads.'],
    ['Look for grazing', 'Look for signs that animals have fed on it.'],
  ],
  Mineral: [
    ['Estimate size', 'Measure the specimen at its greatest extent.'],
    ['Inspect texture', 'Describe its color, grain, and surface texture.'],
    ['Test surface', 'Test the surface carefully and describe what happens.'],
  ],
  Item: [
    ['Inspect material', 'Describe the material and its present condition.'],
    ['Read markings', 'Read any names, dates, addresses, or other markings.'],
    ['Estimate age', 'What suggests how old this object may be?'],
  ],
};

function expeditionDate(day) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(EXPEDITION_START + Math.max(0, (day || 1) - 1) * MS_PER_DAY));
}

function factKind(fact) {
  if (fact.id === 'category') return 'Known';
  if (fact.measurement) return 'Measured';
  if (fact.confidence === 'low') return 'Inferred';
  return 'Observed';
}

function confidenceText(fact) {
  if (fact.id === 'category') return 'Broad category';
  const confidence = fact.confidence || 'moderate';
  return `${fact.measurement ? 'Field estimate' : 'Field observation'} · ${confidence} confidence`;
}

function NotebookMark() {
  return (
    <span aria-hidden="true" className="relative block h-[30px] w-[30px] shrink-0 rounded-full border border-expedition-brass/55">
      <span className="absolute inset-[6px] rotate-45 border border-expedition-brass/50" />
      <span className="absolute left-1/2 top-[4px] h-5 w-px origin-center rotate-[25deg] bg-[linear-gradient(180deg,#ead29a_0_50%,rgba(191,152,81,0.25)_50%)]" />
    </span>
  );
}

function BookmarkIcon({ saved = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
      <path d="M6.5 4.5h11v16L12 17l-5.5 3.5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m4 5 16 7-16 7 3-7z" />
      <path d="M7 12h13" />
    </svg>
  );
}

function MicroLabel({ children, className = '' }) {
  return (
    <span className={`font-sans text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-expedition-gold ${className}`}>
      {children}
    </span>
  );
}

function FactRow({ fact, onSave, compact = false }) {
  const saved = Boolean(fact.saved);
  return (
    <article className={`grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 bg-[rgba(12,17,18,0.94)] ${compact ? 'min-h-[54px] px-2.5 py-2' : 'min-h-[62px] px-3 py-2.5'}`}>
      <span className="font-sans text-[8px] font-semibold uppercase leading-snug tracking-[0.14em] text-expedition-gold">
        {factKind(fact)}
      </span>
      <span className="min-w-0">
        <strong className={`${compact ? 'text-[13px]' : 'text-[14px]'} block truncate font-normal leading-tight text-expedition-parchment`}>
          {fact.label}: {fact.value}
        </strong>
        <span className="mt-0.5 block text-[11px] italic text-expedition-faded/75">{confidenceText(fact)}</span>
      </span>
      {saved ? (
        <span className="font-sans text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9db485]">Filed</span>
      ) : (
        <button
          type="button"
          onClick={onSave}
          aria-label={`Add ${fact.label} to the field book`}
          title="Add to field book"
          className="grid h-8 w-8 place-items-center text-expedition-gold transition hover:-translate-y-px hover:text-expedition-goldbright focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-expedition-goldbright"
        >
          <BookmarkIcon />
        </button>
      )}
    </article>
  );
}

function NewFinding({ fact, onSave }) {
  if (!fact) return null;
  return (
    <div className="relative mt-3 border-l border-expedition-gold bg-[linear-gradient(90deg,rgba(191,152,81,0.11),rgba(191,152,81,0.025))] py-2.5 pl-3 pr-10">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <MicroLabel>{factKind(fact)}</MicroLabel>
        <strong className="text-[14px] font-normal text-expedition-goldbright">{fact.label}: {fact.value}</strong>
      </div>
      <span className="mt-1 block text-[11px] italic text-expedition-faded/75">{confidenceText(fact)}</span>
      <button
        type="button"
        onClick={onSave}
        aria-label={`Add ${fact.label} to the field book`}
        title="Add to field book"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center text-expedition-gold transition hover:text-expedition-goldbright"
      >
        <BookmarkIcon />
      </button>
    </div>
  );
}

function NotebookTab({ active, count, children, onClick, controls }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`relative border-0 bg-transparent font-sans text-[10px] font-semibold uppercase tracking-[0.17em] transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-expedition-goldbright ${
        active ? 'text-expedition-goldbright after:absolute after:inset-x-[22%] after:bottom-[-1px] after:h-px after:bg-expedition-goldbright' : 'text-expedition-faded hover:text-expedition-parchment'
      }`}
    >
      {children}
      {Number.isFinite(count) && (
        <span className="ml-1.5 inline-grid h-[19px] min-w-[19px] place-items-center rounded-full border border-expedition-brass/40 px-1 text-[9px] tracking-normal text-expedition-goldbright/80">
          {count}
        </span>
      )}
    </button>
  );
}

function SpinnerDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map(index => (
        <span key={index} className="h-1 w-1 animate-pulse rounded-full bg-expedition-gold" style={{ animationDelay: `${index * 140}ms` }} />
      ))}
    </span>
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

  const [question, setQuestion] = useState('');
  const [note, setNote] = useState('');
  const [noteSavedFlash, setNoteSavedFlash] = useState(false);
  const [activePanel, setActivePanel] = useState('inquiry');
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const scrollRef = useRef(null);
  const noteRef = useRef(null);
  const collectionCancelRef = useRef(null);
  const noteFlashTimerRef = useRef(null);

  const open = Boolean(session);
  const examined = Boolean(session && examinedTypeIds.includes(session.typeId));
  const collectReady = Boolean(examined && session?.collectable);

  useEffect(() => {
    if (!open) {
      setTypingMode(false);
      setQuestion('');
      setNote('');
      setNoteSavedFlash(false);
      setActivePanel('inquiry');
      setCollectionOpen(false);
      setCollecting(false);
      window.clearTimeout(noteFlashTimerRef.current);
      return undefined;
    }
    return () => {
      setTypingMode(false);
    };
  }, [open]);

  const chatLength = session?.chat?.length || 0;
  const factsLength = session?.facts?.length || 0;
  useEffect(() => {
    if (activePanel !== 'inquiry') return;
    const list = scrollRef.current;
    if (list) {
      list.scrollTo({
        top: chatLength > 0 ? list.scrollHeight : 0,
        behavior: chatLength > 1 ? 'smooth' : 'auto',
      });
    }
  }, [chatLength, factsLength, activePanel]);

  useEffect(() => {
    if (collectionOpen) collectionCancelRef.current?.focus();
  }, [collectionOpen]);

  const submitQuestion = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed || session?.pending) return;
    setQuestion('');
    sendExamineMessage(trimmed);
  }, [question, sendExamineMessage, session?.pending]);

  const submitProcedure = useCallback(prompt => {
    if (!prompt || session?.pending) return;
    sendExamineMessage(prompt);
  }, [sendExamineMessage, session?.pending]);

  const submitNote = useCallback(() => {
    const trimmed = note.trim();
    if (!trimmed) return;
    if (saveExamineNote(trimmed)) {
      setNote('');
      setNoteSavedFlash(true);
      setCollectionOpen(false);
      window.clearTimeout(noteFlashTimerRef.current);
      noteFlashTimerRef.current = window.setTimeout(() => setNoteSavedFlash(false), 2800);
      noteRef.current?.blur();
    }
  }, [note, saveExamineNote]);

  const confirmCollection = useCallback(async () => {
    if (!collectReady || collecting) return;
    setCollecting(true);
    await collectFromExamine();
    setCollecting(false);
  }, [collectFromExamine, collectReady, collecting]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (event.key === 'Escape') {
        event.preventDefault();
        if (collectionOpen) setCollectionOpen(false);
        else closeExamine();
        return;
      }
      if (!typing && event.code === 'KeyC' && !event.metaKey && !event.ctrlKey && !event.altKey && collectReady) {
        event.preventDefault();
        setCollectionOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeExamine, collectReady, collectionOpen]);

  const zone = useMemo(() => (open ? getZone(currentZoneId) : null), [open, currentZoneId]);
  const procedures = useMemo(() => PROCEDURES[session?.category] || PROCEDURES.Item, [session?.category]);
  const latestUnsavedFact = useMemo(() => (
    [...(session?.facts || [])].reverse().find(fact => !fact.saved) || null
  ), [session?.facts]);

  if (!open) return null;

  const headerSubtitle = [zone?.name, session.subtitle, expeditionDate(session.day)].filter(Boolean);
  const identityLabel = session.kind === 'item'
    ? (examined ? 'Object recorded' : 'Object under study')
    : (examined ? 'Recorded identification' : 'Provisional identification');
  const noteState = noteSavedFlash
    ? 'Recorded in field book'
    : examined
      ? 'Observation complete'
      : note.trim()
        ? 'Ready to record'
        : 'Write in your own words';
  const collectionDescription = session.kind === 'item'
    ? 'Taking this object adds it to the expedition collection and removes it from this place.'
    : session.living
      ? 'Collecting removes this individual from the field. The active tool, case capacity, labels, and preservation supplies still govern the attempt.'
      : 'Collecting removes this specimen from the field. Case capacity, labels, and preservation supplies still govern the attempt.';

  return (
    <div
      data-testid="examine-view"
      className={`${styles.overlay} font-expedition`}
    >
      <div className={styles.grade} />
      <div className={styles.vignette} />
      <div className={styles.topShade} />

      <section className={styles.stage} aria-labelledby="examine-specimen-title">
        <header className={styles.stageHeader}>
          <div className="mb-2.5 flex items-center gap-2.5 font-sans text-[8px] font-semibold uppercase tracking-[0.22em] text-expedition-goldbright/90 [text-shadow:0_2px_12px_#000] sm:text-[9px] lg:text-[10px]">
            <span className="h-px w-6 bg-expedition-gold" />
            Field examination
          </div>
          <h1 id="examine-specimen-title" className="m-0 max-w-[72%] text-[clamp(25px,6vw,38px)] font-normal leading-[1.02] tracking-[0.015em] text-[#f4e9d0] [text-shadow:0_3px_22px_rgba(0,0,0,0.88)] lg:max-w-[68%] lg:text-[clamp(34px,3.25vw,54px)]">
            {session.name}
          </h1>
          <div className="mt-2 flex max-w-[80%] flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-expedition-parchment/78 [text-shadow:0_2px_10px_#000] sm:text-[12px] lg:mt-2.5 lg:text-[14px]">
            {headerSubtitle.map((part, index) => (
              <React.Fragment key={`${part}-${index}`}>
                {index > 0 && <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-expedition-gold" />}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
          <div className={`${styles.identityPill} items-center gap-2 rounded-full border border-expedition-brass/40 bg-black/40 px-3 py-2 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-expedition-parchment/80 shadow-xl backdrop-blur-md`}>
            <span className={`h-1.5 w-1.5 rounded-full border ${examined ? 'border-[#9db485] bg-[#9db485]/50' : 'border-expedition-goldbright shadow-[0_0_0_3px_rgba(191,152,81,0.12)]'}`} />
            {identityLabel}
          </div>
        </header>

        <div className={styles.focusFrame} aria-hidden="true">
          {[0, 1, 2, 3].map(index => <i key={index} className={styles.focusCorner} />)}
        </div>

        {session.measurementCallout && (
          <div className={styles.measurement} aria-live="polite">
            <div className={styles.measurementLine}>
              <span className={styles.measurementValue}>{session.measurementCallout} <em className="text-[10px] text-expedition-faded">estimated</em></span>
            </div>
          </div>
        )}

        <div className={styles.viewHint}>
          <span className={styles.mouseIcon} aria-hidden="true" />
          <span>Drag in any direction to orbit · scroll to zoom</span>
        </div>
      </section>

      <button type="button" onClick={closeExamine} aria-label="Return to exploration" className={styles.closeButton} />

      <aside className={styles.notebook} aria-label="Examination field notebook">
        <header className={styles.notebookHeader}>
          <div className="flex items-center gap-3">
            <NotebookMark />
            <div>
              <MicroLabel>Darwin&apos;s field book</MicroLabel>
              <div className="mt-1 text-[18px] leading-none text-[#f2e6cb] lg:text-[20px]">Examination notes</div>
            </div>
          </div>
          <span className="flex items-center gap-2 font-sans text-[8px] font-semibold uppercase tracking-[0.13em] text-[#9db485]">
            <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_0_3px_rgba(157,180,133,0.1)]" />
            {noteSavedFlash ? 'Recorded' : 'Observation active'}
          </span>
        </header>

        <nav className={styles.tabs} role="tablist" aria-label="Notebook sections">
          <NotebookTab active={activePanel === 'inquiry'} controls="examine-inquiry-panel" onClick={() => setActivePanel('inquiry')}>
            Inquiry
          </NotebookTab>
          <NotebookTab active={activePanel === 'findings'} count={session.facts.length} controls="examine-findings-panel" onClick={() => setActivePanel('findings')}>
            Findings
          </NotebookTab>
        </nav>

        <div ref={scrollRef} className={styles.scrollPanel}>
          {activePanel === 'inquiry' ? (
            <section id="examine-inquiry-panel" role="tabpanel" className="px-[18px] py-4 lg:px-[27px] lg:py-[22px]">
              <p className="m-0 mb-4 text-[13px] leading-relaxed text-expedition-parchment/65 lg:text-[15px]">
                Observe freely, or attempt a procedure. Findings remain provisional until you record them.
              </p>

              <div className="relative grid gap-[18px] pl-[19px] before:absolute before:bottom-2 before:left-1 before:top-2 before:w-px before:bg-[linear-gradient(rgba(191,152,81,0.46),rgba(191,152,81,0.06))]">
                {session.chat.length === 0 && (
                  <article className="relative before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:rotate-45 before:border before:border-expedition-brass/70 before:bg-[rgba(191,152,81,0.16)]">
                    <MicroLabel>Begin with observation</MicroLabel>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-expedition-parchment/86 lg:text-[15px]">
                      Study the subject from several angles, ask what you wish to know, or attempt a careful procedure.
                    </p>
                  </article>
                )}

                {session.chat.map(entry => (
                  <article
                    key={entry.id}
                    className={`relative before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:border before:border-expedition-brass/70 before:bg-[#151a19] ${entry.role !== 'you' ? 'before:rotate-45 before:bg-expedition-gold/15' : 'before:rounded-full'}`}
                  >
                    <MicroLabel className={entry.role === 'you' ? 'text-expedition-faded' : 'text-expedition-goldbright/85'}>
                      {entry.role === 'you' ? 'Your inquiry' : 'Direct observation'}
                    </MicroLabel>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-expedition-parchment/92 lg:text-[15px]">{entry.text}</p>
                    {entry.behavior && <p className="mt-1.5 text-[12px] italic leading-relaxed text-expedition-parchment/60 lg:text-[13px]">{entry.behavior}</p>}
                  </article>
                ))}

                {session.pending && (
                  <div className="relative text-[12px] italic text-expedition-faded before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:rounded-full before:border before:border-expedition-brass/50 before:bg-[#151a19]">
                    You look closer <SpinnerDots />
                  </div>
                )}
              </div>

              {!session.pending && latestUnsavedFact && (
                <NewFinding fact={latestUnsavedFact} onSave={() => saveExamineFact(latestUnsavedFact.id)} />
              )}

              <div className="mt-5 border-t border-expedition-brass/25 pt-4 lg:mt-6 lg:pt-[18px]">
                <MicroLabel>Try a procedure</MicroLabel>
                <div className="mt-2.5 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
                  {procedures.map(([label, prompt]) => (
                    <button
                      key={label}
                      type="button"
                      disabled={session.pending}
                      onClick={() => submitProcedure(prompt)}
                      className="min-h-8 shrink-0 snap-start rounded-sm border border-expedition-brass/35 bg-expedition-gold/[0.04] px-2.5 font-sans text-[10px] font-medium tracking-[0.035em] text-expedition-parchment/80 transition hover:border-expedition-goldbright/60 hover:bg-expedition-gold/10 hover:text-expedition-goldbright disabled:cursor-wait disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <form
                  className="mt-3 grid grid-cols-[minmax(0,1fr)_43px] border border-expedition-brass/45 bg-black/25 transition focus-within:border-expedition-goldbright/70 focus-within:shadow-[0_0_0_3px_rgba(191,152,81,0.06)]"
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
                    className={`${styles.inquiryInput} h-11 min-w-0 border-0 bg-transparent px-3 text-[14px] text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-faded/60`}
                  />
                  <button
                    type="submit"
                    disabled={!question.trim() || session.pending}
                    aria-label="Submit inquiry"
                    className="grid place-items-center border-0 border-l border-expedition-brass/25 bg-expedition-gold/[0.05] text-expedition-goldbright transition hover:bg-expedition-gold/15 disabled:cursor-not-allowed disabled:text-expedition-faded/35"
                  >
                    <SendIcon />
                  </button>
                </form>
                {session.error && <p className="mt-2 text-[11px] text-[#d9a05a]">{session.error}</p>}
              </div>
            </section>
          ) : (
            <section id="examine-findings-panel" role="tabpanel" className="px-[18px] py-4 lg:px-[27px] lg:py-[22px]">
              <div className="flex items-start justify-between gap-3 border-b border-expedition-brass/25 pb-4">
                <div>
                  <MicroLabel>Working description</MicroLabel>
                  <h2 className="mb-1 mt-2 text-[20px] font-normal leading-tight text-[#f1e4c7] lg:text-[22px]">{session.name}</h2>
                  <p className="m-0 text-[12px] leading-relaxed text-expedition-faded lg:text-[13px]">
                    {examined ? 'Recorded from your authored field observation.' : 'Evidence remains provisional until you record an observation.'}
                  </p>
                </div>
                <span className={`shrink-0 border px-2 py-1.5 font-sans text-[8px] font-semibold uppercase tracking-[0.12em] ${examined ? 'border-[#9db485]/40 text-[#9db485]' : 'border-expedition-brass/35 text-expedition-goldbright'}`}>
                  {examined ? 'Recorded' : 'Provisional'}
                </span>
              </div>

              <div className="mt-4 grid gap-px border border-expedition-brass/25 bg-expedition-brass/25">
                {session.facts.map(fact => (
                  <FactRow key={fact.id} fact={fact} onSave={() => saveExamineFact(fact.id)} compact />
                ))}
              </div>

              {session.facts.length <= 1 && (
                <p className="mt-3 text-[12px] italic leading-relaxed text-expedition-parchment/55">
                  Further findings appear here as your inquiry uncovers them.
                </p>
              )}

              {session.uncertainties.length > 0 && (
                <div className="mt-5 border border-expedition-brass/25 bg-[linear-gradient(135deg,rgba(191,152,81,0.055),transparent)] p-3.5">
                  <MicroLabel>What remains uncertain</MicroLabel>
                  <ul className="mt-2.5 grid list-none gap-2 p-0">
                    {session.uncertainties.map(item => (
                      <li key={item} className="relative pl-4 text-[12px] italic leading-relaxed text-expedition-parchment/65 before:absolute before:left-0 before:top-0 before:font-sans before:text-[9px] before:font-semibold before:not-italic before:text-expedition-gold before:content-['?'] lg:text-[13px]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {session.latin && examined && (
                <p className="mt-4 text-[12px] italic text-expedition-faded">Recorded identification: {session.latin}</p>
              )}
            </section>
          )}
        </div>

        <section className={styles.noteArea} aria-label="Field note">
          <div className="mb-2 flex items-center justify-between gap-3">
            <MicroLabel>Field note</MicroLabel>
            <span className={`font-sans text-[8px] font-semibold uppercase tracking-[0.12em] transition ${noteSavedFlash || examined ? 'text-[#9db485]' : note.trim() ? 'text-expedition-goldbright' : 'text-expedition-faded/70'}`} aria-live="polite">
              {noteState}
            </span>
          </div>

          <textarea
            ref={noteRef}
            value={note}
            onChange={event => setNote(event.target.value)}
            onFocus={() => setTypingMode(true)}
            onBlur={() => setTypingMode(false)}
            rows={2}
            placeholder={examined ? 'Add a further observation…' : 'What do you observe? Recording a note completes the examination.'}
            className={`${styles.noteInput} block min-h-[44px] max-h-24 w-full resize-none border-0 border-b border-expedition-brass/50 bg-transparent px-px pb-2 text-[13px] leading-relaxed text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-faded/50 lg:min-h-[60px] lg:text-[14px]`}
          />

          <div className="mt-2.5 grid grid-cols-2 gap-2 lg:mt-3">
            <button
              type="button"
              data-testid="examine-record-note"
              disabled={!note.trim()}
              onClick={submitNote}
              className="min-h-10 border border-expedition-goldbright/65 bg-[linear-gradient(135deg,rgba(191,152,81,0.24),rgba(191,152,81,0.1))] px-2 font-sans text-[9px] font-semibold uppercase tracking-[0.11em] text-[#f5e5bd] transition hover:-translate-y-px hover:border-expedition-goldbright disabled:cursor-not-allowed disabled:border-expedition-brass/20 disabled:bg-transparent disabled:text-expedition-faded/35 lg:min-h-[43px] lg:text-[10px]"
            >
              Record note
            </button>
            <button
              type="button"
              data-testid="examine-collection-options"
              disabled={!collectReady}
              onClick={() => setCollectionOpen(true)}
              className="min-h-10 border border-expedition-brass/40 bg-expedition-gold/[0.035] px-2 font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-expedition-parchment/72 transition hover:-translate-y-px hover:border-expedition-goldbright disabled:cursor-not-allowed disabled:border-expedition-brass/20 disabled:bg-transparent disabled:text-expedition-faded/35 lg:min-h-[43px] lg:text-[10px]"
            >
              {session.kind === 'item' ? session.collectVerb : 'Collection options'}
            </button>
          </div>

          <p className="mb-0 mt-1.5 text-right text-[10px] italic text-expedition-faded/55 lg:text-[11px]">
            {collectReady ? 'Observation complete. Collection remains a separate decision.' : 'Record an observation before deciding whether to collect.'}
          </p>

          {collectionOpen && (
            <div className={styles.collectionDecision} role="dialog" aria-modal="false" aria-labelledby="examine-collection-title">
              <MicroLabel>Collection decision</MicroLabel>
              <h3 id="examine-collection-title" className="mb-2 mt-2 text-[19px] font-normal text-[#f0e1c0] lg:text-[21px]">{session.name}</h3>
              <p className="m-0 text-[12px] leading-relaxed text-expedition-parchment/70 lg:text-[13px]">{collectionDescription}</p>
              <div className="my-3 grid grid-cols-2 gap-2">
                <span className="border border-expedition-brass/25 px-2 py-2 text-center font-sans text-[8px] font-semibold uppercase tracking-[0.08em] text-expedition-parchment/65">Rules checked</span>
                <span className="border border-expedition-brass/25 px-2 py-2 text-center font-sans text-[8px] font-semibold uppercase tracking-[0.08em] text-expedition-parchment/65">Field state changes</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  ref={collectionCancelRef}
                  type="button"
                  onClick={() => setCollectionOpen(false)}
                  className="min-h-10 border border-expedition-brass/40 bg-transparent px-2 font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-expedition-parchment/70 transition hover:border-expedition-goldbright"
                >
                  Leave for now
                </button>
                <button
                  type="button"
                  disabled={collecting}
                  onClick={confirmCollection}
                  className="min-h-10 border border-expedition-goldbright/65 bg-expedition-gold/15 px-2 font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-expedition-goldbright transition hover:border-expedition-goldbright hover:bg-expedition-gold/25 disabled:cursor-wait disabled:opacity-50"
                >
                  {collecting ? 'Attempting…' : session.collectVerb}
                </button>
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
