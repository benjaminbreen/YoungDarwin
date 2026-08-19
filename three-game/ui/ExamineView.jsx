'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setTypingMode } from '../input/typingMode';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { useDismissableOverlay } from './useDismissableOverlay';
import styles from './ExamineView.module.css';
import { PLAYER_VISIBLE_GENERATIVE_ENABLED } from '../ai/generativePolicy';
import { MemoryLinkedText } from '../library/MemoryLinkedText';
import { RarityBadge } from './RarityBadge';

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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m4 5 16 7-16 7 3-7z" />
      <path d="M7 12h13" />
    </svg>
  );
}

function MicroLabel({ children, className = '' }) {
  return (
    <span className={`font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-expedition-gold lg:text-[11px] ${className}`}>
      {children}
    </span>
  );
}

function FactRow({ fact, onSave, compact = false }) {
  const saved = Boolean(fact.saved);
  return (
    <article className={`grid grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 bg-[rgba(12,17,18,0.94)] ${compact ? 'min-h-[58px] px-2.5 py-2' : 'min-h-[66px] px-3 py-2.5'}`}>
      <span className="font-sans text-[10px] font-semibold uppercase leading-snug tracking-[0.12em] text-expedition-gold">
        {factKind(fact)}
      </span>
      <span className="min-w-0">
        <strong className={`${compact ? 'text-[15px]' : 'text-[16px]'} block truncate font-normal leading-tight text-expedition-parchment`}>
          {fact.label}: {fact.value}
        </strong>
        <span className="mt-0.5 block text-[13px] italic text-expedition-faded/85">{confidenceText(fact)}</span>
      </span>
      {saved ? (
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9db485]">Filed</span>
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
        <strong className="text-[16px] font-normal text-expedition-goldbright lg:text-[17px]">{fact.label}: {fact.value}</strong>
      </div>
      <span className="mt-1 block text-[13px] italic text-expedition-faded/85">{confidenceText(fact)}</span>
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
      className={`relative border-0 bg-transparent font-sans text-[12px] font-semibold uppercase tracking-[0.15em] transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-expedition-goldbright ${
        active ? 'text-expedition-goldbright after:absolute after:inset-x-[22%] after:bottom-[-1px] after:h-px after:bg-expedition-goldbright' : 'text-expedition-faded hover:text-expedition-parchment'
      }`}
    >
      {children}
      {Number.isFinite(count) && (
        <span className="ml-1.5 inline-grid h-[20px] min-w-[20px] place-items-center rounded-full border border-expedition-brass/40 px-1 text-[11px] tracking-normal text-expedition-goldbright/80">
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
  const [collecting, setCollecting] = useState(false);

  const scrollRef = useRef(null);
  const noteRef = useRef(null);
  const noteFlashTimerRef = useRef(null);

  const open = Boolean(session);
  const examined = Boolean(session && examinedTypeIds.includes(session.typeId));
  // Collection is one click: no note prerequisite, no confirmation step.
  const collectReady = Boolean(session?.collectable);

  useEffect(() => {
    if (!open) {
      setTypingMode(false);
      setQuestion('');
      setNote('');
      setNoteSavedFlash(false);
      setActivePanel('inquiry');
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

  // Focus starts on the notebook rather than being yanked to the close button:
  // the inquiry field is the point of the screen, and stealing focus from it
  // would fight the player mid-sentence.
  const overlayRef = useDismissableOverlay(open, closeExamine, { autoFocus: false });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (!typing && event.code === 'KeyC' && !event.metaKey && !event.ctrlKey && !event.altKey && collectReady) {
        event.preventDefault();
        confirmCollection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, collectReady, confirmCollection]);

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

  return (
    <div
      ref={overlayRef}
      data-testid="examine-view"
      tabIndex={-1}
      className={`${styles.overlay} font-expedition focus:outline-none`}
    >
      <div className={styles.grade} />
      <div className={styles.vignette} />
      <div className={styles.topShade} />

      <section className={styles.stage} aria-labelledby="examine-specimen-title">
        <header className={styles.stageHeader}>
          <div className="mb-2.5 flex items-center gap-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-expedition-goldbright/90 [text-shadow:0_2px_12px_#000] sm:text-[11px] lg:text-[12px]">
            <span className="h-px w-6 bg-expedition-gold" />
            Field examination
          </div>
          <h1 id="examine-specimen-title" className="m-0 max-w-[72%] text-[clamp(25px,6vw,38px)] font-normal leading-[1.02] tracking-[0.015em] text-[#f4e9d0] [text-shadow:0_3px_22px_rgba(0,0,0,0.88)] lg:max-w-[68%] lg:text-[clamp(34px,3.25vw,54px)]">
            {session.name}
          </h1>
          <div className="mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[13px] lg:max-w-[80%] text-expedition-parchment/85 [text-shadow:0_2px_10px_#000] sm:text-[14px] lg:mt-2.5 lg:text-[16px]">
            {session.kind === 'specimen' && session.specimen && (
              <RarityBadge specimen={session.specimen} className="pointer-events-none" />
            )}
            {headerSubtitle.map((part, index) => (
              <React.Fragment key={`${part}-${index}`}>
                {(index > 0 || (session.kind === 'specimen' && session.specimen)) && (
                  <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-expedition-gold" />
                )}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
          <div className={`${styles.identityPill} items-center gap-2 rounded-full border border-expedition-brass/40 bg-black/40 px-3.5 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-expedition-parchment/85 shadow-xl backdrop-blur-md`}>
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
          <span className={styles.viewHintPointer}>Drag in any direction to orbit · scroll to zoom</span>
          <span className={styles.viewHintTouch}>Drag to orbit · pinch to zoom</span>
        </div>
      </section>

      <button type="button" onClick={closeExamine} aria-label="Return to exploration" className={styles.closeButton} />

      <aside className={styles.notebook} data-examine-notebook aria-label="Examination field notebook">
        <header className={styles.notebookHeader}>
          <div className="flex items-center gap-3">
            <span className={styles.notebookMark}><NotebookMark /></span>
            <div>
              <span className={styles.notebookEyebrow}><MicroLabel>Darwin&apos;s field book</MicroLabel></span>
              <div className="text-[19px] leading-none text-[#f2e6cb] lg:mt-1 lg:text-[21px]">Examination notes</div>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-2 font-sans text-[10px] font-semibold uppercase tracking-[0.11em] text-[#9db485]">
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
              <p className={`${styles.inquiryIntro} m-0 mb-4 border-b border-expedition-brass/20 pb-4 text-[16px] leading-relaxed text-expedition-parchment/90 lg:text-[17px]`}>
                Observe freely, or attempt a procedure. Findings remain provisional until you record them.
              </p>

              <div className="relative grid gap-[18px] pl-[19px] before:absolute before:bottom-2 before:left-1 before:top-2 before:w-px before:bg-[linear-gradient(rgba(191,152,81,0.46),rgba(191,152,81,0.06))]">
                {session.chat.length === 0 && (
                  <article className="relative before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:rotate-45 before:border before:border-expedition-brass/70 before:bg-[rgba(191,152,81,0.16)]">
                    <MicroLabel>Begin with observation</MicroLabel>
                    <p className="mt-1.5 text-[16px] leading-relaxed text-expedition-parchment lg:text-[17px]">
                      {PLAYER_VISIBLE_GENERATIVE_ENABLED
                        ? 'Study the subject from several angles, ask what you wish to know, or attempt a careful procedure.'
                        : 'Study the subject from several angles, then choose a careful field procedure.'}
                    </p>
                  </article>
                )}

                {session.chat.map(entry => (
                  <article
                    key={entry.id}
                    className={`relative before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:border before:border-expedition-brass/70 before:bg-[#151a19] ${entry.role !== 'you' ? 'before:rotate-45 before:bg-expedition-gold/15' : 'before:rounded-full'}`}
                  >
                    {/* The player's own turn is marked by its round bullet and
                        italics; a label on every entry was more chrome than log. */}
                    {entry.role !== 'you' && <MicroLabel className="text-expedition-goldbright/85">Direct observation</MicroLabel>}
                    <p className={`text-[16px] leading-relaxed lg:text-[17px] ${entry.role === 'you' ? 'italic text-expedition-parchment/75' : 'mt-1.5 text-expedition-parchment'}`}>
                      {entry.role === 'you' ? entry.text : <MemoryLinkedText>{entry.text}</MemoryLinkedText>}
                    </p>
                    {entry.behavior && <p className="mt-1.5 text-[14px] italic leading-relaxed text-expedition-parchment/70 lg:text-[15px]">{entry.behavior}</p>}
                  </article>
                ))}

                {session.pending && (
                  <div className="relative text-[15px] italic text-expedition-faded before:absolute before:left-[-19px] before:top-1 before:h-[9px] before:w-[9px] before:-translate-x-px before:rounded-full before:border before:border-expedition-brass/50 before:bg-[#151a19]">
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
                      className="min-h-10 shrink-0 snap-start rounded-sm border border-expedition-brass/35 bg-expedition-gold/[0.04] px-3 font-sans text-[12px] font-medium tracking-[0.02em] text-expedition-parchment/85 transition hover:border-expedition-goldbright/60 hover:bg-expedition-gold/10 hover:text-expedition-goldbright disabled:cursor-wait disabled:opacity-40 lg:min-h-9"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {PLAYER_VISIBLE_GENERATIVE_ENABLED && <div className="mt-4">
                  <MicroLabel>Ask in your own words</MicroLabel>
                  <form
                    className="mt-2 grid grid-cols-[minmax(0,1fr)_52px] border border-expedition-brass/70 bg-black/40 transition focus-within:border-expedition-goldbright focus-within:shadow-[0_0_0_3px_rgba(191,152,81,0.12)]"
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
                      className={`${styles.inquiryInput} h-[52px] min-w-0 border-0 bg-transparent px-3.5 text-[17px] text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-parchment/50`}
                    />
                    <button
                      type="submit"
                      disabled={!question.trim() || session.pending}
                      aria-label="Submit inquiry"
                      className="grid place-items-center border-0 border-l border-expedition-brass/40 bg-expedition-gold/10 text-expedition-goldbright transition hover:bg-expedition-gold/20 disabled:cursor-not-allowed disabled:text-expedition-faded/35"
                    >
                      <SendIcon />
                    </button>
                  </form>
                </div>}
                {session.error && <p className="mt-2 text-[14px] text-[#d9a05a]">{session.error}</p>}
              </div>
            </section>
          ) : (
            <section id="examine-findings-panel" role="tabpanel" className="px-[18px] py-4 lg:px-[27px] lg:py-[22px]">
              <div className="flex items-start justify-between gap-3 border-b border-expedition-brass/25 pb-4">
                <div>
                  <MicroLabel>Working description</MicroLabel>
                  <h2 className="mb-1 mt-2 text-[21px] font-normal leading-tight text-[#f1e4c7] lg:text-[23px]">{session.name}</h2>
                  <p className="m-0 text-[14px] leading-relaxed text-expedition-faded lg:text-[15px]">
                    {examined ? 'Recorded from your authored field observation.' : 'Evidence remains provisional until you record an observation.'}
                  </p>
                </div>
                <span className={`shrink-0 border px-2 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] ${examined ? 'border-[#9db485]/40 text-[#9db485]' : 'border-expedition-brass/35 text-expedition-goldbright'}`}>
                  {examined ? 'Recorded' : 'Provisional'}
                </span>
              </div>

              <div className="mt-4 grid gap-px border border-expedition-brass/25 bg-expedition-brass/25">
                {session.facts.map(fact => (
                  <FactRow key={fact.id} fact={fact} onSave={() => saveExamineFact(fact.id)} compact />
                ))}
              </div>

              {session.facts.length <= 1 && (
                <p className="mt-3 text-[14px] italic leading-relaxed text-expedition-parchment/65">
                  Further findings appear here as your inquiry uncovers them.
                </p>
              )}

              {session.uncertainties.length > 0 && (
                <div className="mt-5 border border-expedition-brass/25 bg-[linear-gradient(135deg,rgba(191,152,81,0.055),transparent)] p-3.5">
                  <MicroLabel>What remains uncertain</MicroLabel>
                  <ul className="mt-2.5 grid list-none gap-2 p-0">
                    {session.uncertainties.map(item => (
                      <li key={item} className="relative pl-4 text-[14px] italic leading-relaxed text-expedition-parchment/75 before:absolute before:left-0 before:top-0 before:font-sans before:text-[11px] before:font-semibold before:not-italic before:text-expedition-gold before:content-['?'] lg:text-[15px]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {session.latin && examined && (
                <p className="mt-4 text-[14px] italic text-expedition-faded">Recorded identification: {session.latin}</p>
              )}
            </section>
          )}
        </div>

        <section className={styles.noteArea} aria-label="Field note">
          <div className="mb-2 flex items-center justify-between gap-3">
            <MicroLabel>Field note</MicroLabel>
            <span className={`font-sans text-[10px] font-semibold uppercase tracking-[0.1em] transition ${noteSavedFlash || examined ? 'text-[#9db485]' : note.trim() ? 'text-expedition-goldbright' : 'text-expedition-faded/75'}`} aria-live="polite">
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
            className={`${styles.noteInput} block max-h-28 min-h-[52px] w-full resize-none border-0 border-b border-expedition-brass/50 bg-transparent px-px pb-2 text-[16px] leading-relaxed text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-faded/60 lg:min-h-[62px] lg:text-[17px]`}
          />

          <div className="mt-2.5 grid grid-cols-2 gap-2 lg:mt-3">
            <button
              type="button"
              data-testid="examine-record-note"
              disabled={!note.trim()}
              onClick={submitNote}
              className="min-h-[46px] rounded-[3px] border border-expedition-goldbright/60 bg-[linear-gradient(135deg,rgba(191,152,81,0.22),rgba(191,152,81,0.08))] px-2 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-[#f5e5bd] transition hover:border-expedition-goldbright hover:bg-expedition-gold/20 hover:shadow-[0_0_14px_rgba(227,197,133,0.25)] disabled:cursor-not-allowed disabled:border-expedition-brass/20 disabled:bg-transparent disabled:text-expedition-faded/35 disabled:shadow-none"
            >
              Record note
            </button>
            <button
              type="button"
              data-testid="examine-collect"
              disabled={!collectReady || collecting}
              onClick={confirmCollection}
              className="min-h-[46px] rounded-[3px] border border-[#f0d9a2] bg-[linear-gradient(160deg,#e8cf94,#c9a35f_48%,#96723d)] px-2 font-sans text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#231a09] shadow-[0_0_16px_rgba(227,197,133,0.32),inset_0_1px_0_rgba(255,241,205,0.75),inset_0_-1px_0_rgba(90,64,28,0.55)] transition hover:shadow-[0_0_26px_rgba(227,197,133,0.55),inset_0_1px_0_rgba(255,241,205,0.85),inset_0_-1px_0_rgba(90,64,28,0.55)] disabled:cursor-not-allowed disabled:border-expedition-brass/20 disabled:bg-none disabled:bg-transparent disabled:text-expedition-faded/35 disabled:shadow-none"
            >
              {collecting ? 'Attempting…' : session.collectVerb}
            </button>
          </div>

          <p className={`${styles.noteHint} mb-0 mt-1.5 text-right text-[12px] italic text-expedition-faded/65`}>
            {collectReady ? 'Press C to collect. A written note deepens the record.' : 'This subject stays where it is; the note is the record.'}
          </p>
        </section>
      </aside>
    </div>
  );
}
