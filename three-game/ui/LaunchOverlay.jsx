'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CompassRoseIcon } from './expedition/icons';
import { controlsSections } from './controlsReference';
import { QUALITY_CHOICES } from '../qualityPreference';
import { ComfortSettings } from './ComfortSettings';

const SPLASH_BACKGROUND = '/assets/ui/splash-background-1672.webp';
export const INITIAL_LAUNCH_PROGRESS = 8;
const PROLOGUE_REVEAL_MS = 7900;
const ANIMAL_PROLOGUE_REVEAL_MS = 4400;
const PROLOGUE_AUTO_BEGIN_MS = 15000;
const PROLOGUE_BLOCK_DELAYS_MS = Object.freeze({
  header: 1050,
  introduction: 2200,
  quotation: 3350,
  // The quotation gets a full breath after it settles. Without this pause the
  // explanatory copy reads as a continuation of Darwin's sentence rather than
  // a return to the present-day framing.
  reflection: 5250,
  invitation: 6600,
});
const ANIMAL_PROLOGUE_LINE_DELAYS_MS = Object.freeze([1250, 1850, 2450, 3050]);
const ANIMAL_PROLOGUES = Object.freeze({
  finch: {
    eyebrow: 'Floreana · Galápagos Archipelago',
    title: 'A Finch',
    lines: [
      'You are a finch.',
      'You have always been a finch.',
      'Your parents were finches, as were their parents.',
      'Today you will continue to be a finch.',
    ],
    action: 'Be a finch.',
    waiting: 'Preparing the air…',
  },
  tortoise: {
    eyebrow: 'Floreana · Galápagos Archipelago',
    title: 'A Tortoise',
    lines: [
      'You are a tortoise.',
      'Your ancestors were tortoises long before anyone thought to take notes.',
      'The island is warm. The vegetation is edible.',
      'There is no need to hurry.',
    ],
    action: 'Be a tortoise.',
    waiting: 'Preparing the highlands…',
  },
});

function BrassRule({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-expedition-brass/80 ${className}`}>
      <span className="h-px w-20 bg-gradient-to-r from-transparent to-expedition-brass/75" />
      <span className="h-1.5 w-1.5 rotate-45 border border-expedition-brass/80" />
      <span className="h-px w-20 bg-gradient-to-l from-transparent to-expedition-brass/75" />
    </div>
  );
}

function MenuButton({ children, primary = false, disabled = false, onClick, onIntent }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onPointerEnter={disabled ? undefined : onIntent}
      onFocus={disabled ? undefined : onIntent}
      aria-disabled={disabled}
      className={`group relative flex h-12 w-full items-center justify-center rounded-sm border font-expedition text-[20px] tracking-[0.04em] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright sm:h-[3.25rem] ${
        primary
          ? 'border-expedition-goldbright/80 bg-expedition-gold/10 text-expedition-goldbright shadow-[inset_0_1px_0_rgba(227,197,133,0.28),0_0_18px_rgba(201,163,95,0.16)] hover:bg-expedition-gold/18'
          : disabled
            ? 'cursor-default border-transparent text-expedition-parchment/72'
            : 'border-transparent text-expedition-parchment hover:border-expedition-brass/60 hover:bg-expedition-gold/8 hover:text-expedition-goldbright'
      }`}
    >
      {primary && <CompassRoseIcon className="absolute left-5 h-5 w-5 text-expedition-gold" />}
      <span>{children}</span>
    </button>
  );
}

function CharacterChoiceButton({ title, subtitle, disabled = false, onClick, onIntent }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onPointerEnter={disabled ? undefined : onIntent}
      onFocus={disabled ? undefined : onIntent}
      aria-disabled={disabled}
      className={`group relative min-h-[5.25rem] rounded-sm border px-4 py-3 text-left font-expedition transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
        disabled
          ? 'cursor-default border-expedition-brass/25 bg-black/16 text-expedition-parchment/42'
          : 'border-expedition-brass/60 bg-expedition-gold/8 text-expedition-parchment shadow-[inset_0_1px_0_rgba(227,197,133,0.12)] hover:border-expedition-goldbright/80 hover:bg-expedition-gold/14 hover:text-expedition-goldbright'
      }`}
    >
      <span className="block text-[22px] leading-none tracking-[0.08em]">{title}</span>
      <span className="mt-2 block text-[12px] leading-snug tracking-[0.07em] text-expedition-faded group-hover:text-expedition-gold/80">
        {subtitle}
      </span>
    </button>
  );
}

// Rows inside the Load panel. Both entries resume the same saved expedition —
// one lands in the field, the other opens the notebook on arrival — so they read
// as two ways into one save rather than two unrelated menu commands.
function LoadChoiceButton({ title, subtitle, onClick, onIntent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className="group w-full rounded-sm border border-transparent px-3 py-2.5 text-left font-expedition transition hover:border-expedition-brass/55 hover:bg-expedition-gold/8 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
    >
      <span className="block text-[19px] tracking-[0.04em] text-expedition-parchment group-hover:text-expedition-goldbright">
        {title}
      </span>
      <span className="mt-1 block text-[12px] leading-snug tracking-[0.04em] text-expedition-faded group-hover:text-expedition-gold/80">
        {subtitle}
      </span>
    </button>
  );
}

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 h-9 w-full rounded-sm border border-transparent font-expedition text-[14px] tracking-[0.08em] text-expedition-faded transition hover:border-expedition-brass/45 hover:bg-expedition-gold/8 hover:text-expedition-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
    >
      Back
    </button>
  );
}

function LoadingPhaseLine({ children }) {
  const [displayedLine, setDisplayedLine] = useState(children);
  const [visible, setVisible] = useState(true);
  const displayedLineRef = useRef(children);

  useEffect(() => {
    if (children === displayedLineRef.current) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      displayedLineRef.current = children;
      setDisplayedLine(children);
      setVisible(true);
      return undefined;
    }

    setVisible(false);
    const swapHandle = window.setTimeout(() => {
      displayedLineRef.current = children;
      setDisplayedLine(children);
      setVisible(true);
    }, 180);
    return () => window.clearTimeout(swapHandle);
  }, [children]);

  return (
    <p
      aria-live="polite"
      className={`mt-3 min-h-[2.5rem] text-[15px] leading-relaxed text-expedition-parchment/82 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-0.5 opacity-0'
      }`}
    >
      {displayedLine}
    </p>
  );
}

function ProgressBar({ value }) {
  const numericValue = Number(value);
  const displayed = Number.isFinite(numericValue)
    ? Math.max(0, Math.min(100, numericValue))
    : 0;
  const rounded = Math.round(displayed);
  return (
    <div className="mt-5">
      <div className="mb-2 font-expedition text-[11px] uppercase tracking-[0.18em] text-expedition-faded">
        <span>Charting landing party</span>
      </div>
      <div
        role="progressbar"
        aria-label="Preparing expedition"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        className="relative h-2 overflow-hidden rounded-sm border border-expedition-brass/60 bg-black/45 shadow-[inset_0_1px_6px_rgba(0,0,0,0.65)]"
      >
        <div
          className="absolute inset-0 origin-left bg-gradient-to-r from-expedition-brass/90 via-expedition-gold to-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.24)] transition-transform duration-200 ease-linear will-change-transform motion-reduce:transition-none"
          style={{ transform: `scaleX(${displayed / 100})` }}
        >
          <span className="absolute inset-y-0 right-0 w-px bg-expedition-parchment/75 shadow-[0_0_6px_rgba(244,231,198,0.55)]" />
        </div>
      </div>
    </div>
  );
}

function usePrologueSequence({
  revealMs,
  sceneReady,
  departing,
  onBeginExploring,
  onSkip,
}) {
  const [narrativeComplete, setNarrativeComplete] = useState(false);
  const [mountedAt] = useState(() => performance.now());

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => setNarrativeComplete(true),
      reducedMotion ? 80 : revealMs,
    );
    return () => window.clearTimeout(timer);
  }, [revealMs]);

  useEffect(() => {
    if (departing) return undefined;
    const remaining = Math.max(0, mountedAt + PROLOGUE_AUTO_BEGIN_MS - performance.now());
    const timer = window.setTimeout(() => {
      if (sceneReady) onBeginExploring();
      else onSkip();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [departing, mountedAt, onBeginExploring, onSkip, sceneReady]);

  return narrativeComplete;
}

function AnimalPrologue({
  modeId,
  sceneReady,
  skipRequested,
  departing,
  onBeginExploring,
  onSkip,
}) {
  const content = ANIMAL_PROLOGUES[modeId];
  const narrativeComplete = usePrologueSequence({
    revealMs: ANIMAL_PROLOGUE_REVEAL_MS,
    sceneReady,
    departing,
    onBeginExploring,
    onSkip,
  });
  const lineStyle = delay => ({ '--prologue-delay': `${delay}ms` });
  const canBegin = sceneReady && narrativeComplete && !skipRequested;

  return (
    <div
      data-testid="three-animal-prologue"
      data-mode={modeId}
      data-departing={departing ? 'true' : 'false'}
      className="launch-historical-prologue absolute inset-0 z-30 overflow-x-hidden overflow-y-auto text-left"
    >
      <div
        aria-hidden="true"
        className="launch-prologue-veil pointer-events-none fixed inset-0"
      />

      <button
        type="button"
        onClick={onSkip}
        disabled={skipRequested}
        className="launch-prologue-block launch-prologue-foreground fixed right-7 top-6 z-20 rounded-sm border border-transparent px-3 py-2 font-expedition text-[11px] uppercase tracking-[0.18em] text-expedition-faded/80 transition hover:border-expedition-brass/35 hover:text-expedition-parchment focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright disabled:cursor-default disabled:opacity-45 sm:right-10 sm:top-9"
        style={lineStyle(500)}
      >
        {skipRequested ? 'Preparing the island…' : 'Skip introduction'}
      </button>

      <article
        data-allow-text-selection="true"
        className={`launch-prologue-foreground relative z-10 mx-auto flex min-h-full w-[min(64rem,calc(100vw-3rem))] flex-col items-center justify-center py-[clamp(5rem,9vh,7rem)] text-center transition-opacity duration-700 ${
          skipRequested ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <header className="launch-prologue-block" style={lineStyle(500)}>
          <p className="font-expedition text-[10px] font-semibold uppercase tracking-[0.3em] text-expedition-gold/80 sm:text-[12px]">
            {content.eyebrow}
          </p>
          <div className="mt-3 font-handwriting text-[clamp(1.8rem,4.6vw,3.35rem)] leading-relaxed text-expedition-goldbright/90">
            {content.title}
          </div>
        </header>

        <div className="mt-[clamp(2rem,5vh,3.5rem)] w-full">
          {content.lines.map((line, index) => (
            <p
              key={line}
              className="launch-prologue-block font-expedition text-[clamp(1.2rem,2.4vw,1.75rem)] leading-[1.62] tracking-[0.012em] text-[#eee2c8]"
              style={lineStyle(ANIMAL_PROLOGUE_LINE_DELAYS_MS[index])}
            >
              {line}
            </p>
          ))}
        </div>

        <footer className="mt-[clamp(2rem,5vh,3.6rem)] flex min-h-[4.5rem] justify-center">
          {canBegin ? (
            <button
              type="button"
              onClick={onBeginExploring}
              className="launch-prologue-action group inline-flex min-h-12 items-center gap-4 rounded-sm border border-expedition-gold/70 bg-expedition-gold/8 px-6 py-3 font-expedition text-[clamp(1rem,2vw,1.2rem)] tracking-[0.065em] text-expedition-goldbright shadow-[inset_0_1px_0_rgba(227,197,133,0.2),0_0_24px_rgba(201,163,95,0.08)] transition hover:border-expedition-goldbright hover:bg-expedition-gold/14 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              <span>{content.action}</span>
              <span aria-hidden="true" className="text-expedition-gold transition-transform group-hover:translate-x-1">→</span>
            </button>
          ) : narrativeComplete && !skipRequested ? (
            <p
              aria-live="polite"
              className="launch-prologue-wait font-expedition text-[11px] uppercase tracking-[0.22em] text-expedition-faded/70"
            >
              {content.waiting}
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}

function HistoricalPrologue({
  sceneReady,
  skipRequested,
  departing,
  onBeginExploring,
  onSkip,
}) {
  const narrativeComplete = usePrologueSequence({
    revealMs: PROLOGUE_REVEAL_MS,
    sceneReady,
    departing,
    onBeginExploring,
    onSkip,
  });
  const lineStyle = delay => ({ '--prologue-delay': `${delay}ms` });
  const canBegin = sceneReady && narrativeComplete && !skipRequested;

  return (
    <div
      data-testid="three-historical-prologue"
      data-departing={departing ? 'true' : 'false'}
      className="launch-historical-prologue absolute inset-0 z-30 overflow-x-hidden overflow-y-auto text-left"
    >
      <div
        aria-hidden="true"
        className="launch-prologue-veil pointer-events-none fixed inset-0"
      />

      <button
        type="button"
        onClick={onSkip}
        disabled={skipRequested}
        className="launch-prologue-block launch-prologue-foreground fixed right-7 top-6 z-20 rounded-sm border border-transparent px-3 py-2 font-expedition text-[11px] uppercase tracking-[0.18em] text-expedition-faded/80 transition hover:border-expedition-brass/35 hover:text-expedition-parchment focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright disabled:cursor-default disabled:opacity-45 sm:right-10 sm:top-9"
        style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.header)}
      >
        {skipRequested ? 'Preparing the island…' : 'Skip introduction'}
      </button>

      <article
        data-allow-text-selection="true"
        className={`launch-prologue-foreground relative z-10 mx-auto flex min-h-full w-[min(86rem,calc(100vw-3rem))] flex-col items-center justify-center py-[clamp(5rem,9vh,7rem)] text-center transition-opacity duration-700 ${
          skipRequested ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <header
          className="launch-prologue-block"
          style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.header)}
        >
          <p className="font-expedition text-[10px] font-semibold uppercase tracking-[0.3em] text-expedition-gold/80 sm:text-[12px]">
            24 September 1835
          </p>
          <div className="mt-3 font-handwriting text-[clamp(1.25rem,3vw,2rem)] leading-relaxed text-expedition-goldbright/90">
            Charles Island · Galápagos Archipelago
          </div>
        </header>

        <div
          className="launch-prologue-block mt-[clamp(1.5rem,4vh,3rem)] w-full max-w-[64rem] text-left"
          style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.introduction)}
        >
          <p className="font-expedition text-[clamp(1rem,2.1vw,1.35rem)] leading-[1.62] tracking-[0.012em] text-expedition-parchment/88">
            On September 24, 1835, the real Charles Darwin—then a 26-year-old
            naturalist aboard HMS <em>Beagle</em>—reached Isla Floreana
            (Charles Island) in the Galapagos Archipelago. He wrote the
            following entry in his diary:
          </p>
        </div>

        <div
          className="launch-prologue-block my-[clamp(1.6rem,4.5vh,3.2rem)] w-full max-w-[64rem] text-center"
          style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.quotation)}
        >
          <span className="mx-auto mb-[clamp(1.1rem,2.6vh,1.8rem)] block h-px w-24 bg-gradient-to-r from-transparent via-expedition-gold/65 to-transparent" />
          <blockquote className="font-expedition text-[clamp(1.08rem,1.75vw,1.58rem)] italic leading-[1.58] tracking-[0.006em] text-[#eee2c8]">
            <span className="block">
              “The dry Volcanic soil affording a congenial habitation only to the Lizard tribe.
            </span>
            <span className="block">
              The wood gradually becomes greener during the ascent.
            </span>
            <span className="block">
              Passing round the side of the highest hill,
            </span>
            <span className="block">
              the body is cooled by the fine Southerly trade wind…”
            </span>
          </blockquote>
          <span className="mx-auto mt-[clamp(1.1rem,2.6vh,1.8rem)] block h-px w-24 bg-gradient-to-r from-transparent via-expedition-gold/65 to-transparent" />
        </div>

        <div
          className="launch-prologue-block w-full max-w-[64rem] text-left"
          style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.reflection)}
        >
          <p className="font-expedition text-[clamp(0.98rem,1.9vw,1.25rem)] leading-[1.58] text-expedition-parchment/78">
            Darwin&apos;s notes of walking amid finches, tortoises, and other
            species known only in the Galápagos became foundational to his later
            work on natural selection.
          </p>
        </div>

        <div
          className="launch-prologue-block mt-3 w-full max-w-[64rem] text-left"
          style={lineStyle(PROLOGUE_BLOCK_DELAYS_MS.invitation)}
        >
          <p className="font-expedition text-[clamp(1.05rem,2vw,1.34rem)] italic leading-[1.55] text-expedition-goldbright/90">
            This game lets you re-experience that quietly momentous encounter
            with the island—and perhaps do things differently.
          </p>
        </div>

        <footer className="mt-[clamp(1.7rem,4.5vh,3.4rem)] flex min-h-[4.5rem] justify-center">
          {canBegin ? (
            <button
              type="button"
              onClick={onBeginExploring}
              className="launch-prologue-action group inline-flex min-h-12 items-center gap-4 rounded-sm border border-expedition-gold/70 bg-expedition-gold/8 px-6 py-3 font-expedition text-[clamp(1rem,2vw,1.2rem)] tracking-[0.065em] text-expedition-goldbright shadow-[inset_0_1px_0_rgba(227,197,133,0.2),0_0_24px_rgba(201,163,95,0.08)] transition hover:border-expedition-goldbright hover:bg-expedition-gold/14 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              <span>Begin exploring</span>
              <span aria-hidden="true" className="text-expedition-gold transition-transform group-hover:translate-x-1">→</span>
            </button>
          ) : narrativeComplete && !skipRequested ? (
            <p
              aria-live="polite"
              className="launch-prologue-wait font-expedition text-[11px] uppercase tracking-[0.22em] text-expedition-faded/70"
            >
              Preparing Charles Island…
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}

export function LaunchOverlay({
  mode = 'menu',
  progress = 0,
  selectedModeId = 'darwin',
  departing = false,
  blackout = false,
  historicalPrologue = null,
  onNewExpedition,
  onMultiplayer,
  onModeSelect,
  onBack,
  onContinue,
  onLoadJournal,
  onLoad,
  onSettings,
  onControls,
  onAbout,
  audioEnabled = true,
  onAudioEnabledChange,
  quality = 'auto',
  onQualityChange,
  onRuntimeIntent,
  multiplayerPanel = null,
  interactive = true,
  // False until the shell has read localStorage. The snapshot can only be read
  // on the client, after mount, so the first paint genuinely does not yet know
  // whether a save exists — and guessing "no" made a whole panel appear and then
  // vanish a frame later. Save-dependent chrome waits for this instead.
  saveStateKnown = true,
  hasSavedExpedition = false,
  hasSavedJournalEntries = false,
  lastJournalLabel = 'Floreana - September 1835',
}) {
  const loadingLine = useMemo(() => {
    if (selectedModeId === 'finch') {
      if (progress < 35) return 'Finding a garden finch above the Asilo de la Paz rows.';
      if (progress < 72) return 'Opening the Charles Island air, scrub, paths, and thermals.';
      if (progress < 100) return 'Setting Darwin loose below as a wandering collector.';
      return 'Taking wing over Floreana.';
    }
    if (selectedModeId === 'tortoise') {
      if (progress < 35) return 'Finding a giant tortoise on the damp highland trail.';
      if (progress < 72) return 'Opening the scrub, shade, and slow paths of Charles Island.';
      if (progress < 100) return 'Setting Darwin loose nearby with notebook and collecting bag.';
      return 'Beginning a tortoise day on Floreana.';
    }
    if (progress < 35) return 'Preparing the Beagle launch and shore instruments.';
    if (progress < 72) return 'Unfolding Charles Island terrain, weather, and specimens.';
    if (progress < 100) return 'Settling Darwin, Syms, and the Post Office Bay landing.';
    return 'Taking the first bearings ashore.';
  }, [progress, selectedModeId]);
  const loading = mode === 'loading';
  const choosingCharacter = mode === 'character';
  const showingSettings = mode === 'settings';
  const showingControls = mode === 'controls';
  const showingAbout = mode === 'about';
  // Deliberately not part of `expandedPanel` below: two rows read better at the
  // menu's own width than in the wide panel the character and controls screens use.
  const showingLoad = mode === 'load';
  const showingMultiplayer = mode === 'multiplayer';
  const expandedPanel = choosingCharacter || showingSettings || showingControls
    || showingAbout || showingMultiplayer;
  // Settings and Controls are long at every viewport size, so they always buy
  // back the title's vertical space. The short panels — character select above
  // all — must keep the menu's own framing, or stepping into them visibly
  // displaces the wordmark for no reason.
  const tallPanel = showingSettings || showingControls;
  // Everything else in between (the multiplayer lobby especially) fits beside a
  // full-size title on a roomy screen but not on a short one, so the wordmark
  // yields on height rather than on which panel is open. Pure CSS: a matchMedia
  // hook would have to guess during SSR and correct itself after hydration.
  //
  // The max-height variants below are spelled out in full on purpose. Tailwind's
  // scanner only matches complete class strings in the source, so building them
  // from a shared constant silently produces no CSS at all.
  const yieldsWhenShort = expandedPanel && !tallPanel;
  const prologueActive = historicalPrologue?.active === true;
  const prologueDeparting = prologueActive && departing;

  return (
    <section
      data-testid="three-launch-overlay"
      data-mode={mode}
      data-departing={departing ? 'true' : 'false'}
      data-blackout={blackout ? 'true' : 'false'}
      data-prologue={historicalPrologue?.active ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
      className={`${departing && !prologueDeparting ? 'opacity-0' : 'opacity-100'} ${departing || !interactive ? 'pointer-events-none' : 'pointer-events-auto'} ${prologueActive ? 'bg-transparent' : 'bg-black'} absolute inset-0 z-40 overflow-hidden font-expedition text-expedition-parchment transition-opacity duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity]`}
    >
      <div
        aria-hidden="true"
        className={`${blackout ? 'opacity-0' : 'opacity-100'} pointer-events-none absolute inset-0 transition-opacity duration-[1500ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity]`}
      >
        <img
          src={SPLASH_BACKGROUND}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full select-none object-cover object-center"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_37%,rgba(21,30,32,0.08),rgba(8,10,10,0.64)_82%),linear-gradient(90deg,rgba(5,7,8,0.46),rgba(5,7,8,0.12)_42%,rgba(5,7,8,0.32))]" />
        <div className="absolute inset-[14px] border border-expedition-brass/58 shadow-[inset_0_0_30px_rgba(0,0,0,0.35)] sm:inset-[22px]" />
        <div className="absolute left-4 top-4 h-5 w-5 border-l border-t border-expedition-gold/80 sm:left-6 sm:top-6" />
        <div className="absolute right-4 top-4 h-5 w-5 border-r border-t border-expedition-gold/80 sm:right-6 sm:top-6" />
        <div className="absolute bottom-4 left-4 h-5 w-5 border-b border-l border-expedition-gold/80 sm:bottom-6 sm:left-6" />
        <div className="absolute bottom-4 right-4 h-5 w-5 border-b border-r border-expedition-gold/80 sm:bottom-6 sm:right-6" />
      </div>

      <div
        className={`${blackout ? 'opacity-0' : 'opacity-100'} relative flex min-h-full flex-col items-center px-4 py-8 text-center transition-opacity duration-[850ms] ease-[cubic-bezier(0.4,0,1,1)] will-change-[opacity] sm:py-10`}
      >
        {/* The title recedes only for the tall panels. Settings and Controls at
            the full hero size pushed their own Back button off the bottom of the
            viewport; giving them this space back is what lets them fit. */}
        <div className={`${blackout ? 'opacity-0' : 'opacity-100'} flex flex-col items-center transition-opacity duration-[1100ms] ease-out will-change-[opacity]`}>
          {!tallPanel && (
            <CompassRoseIcon
              className={`mt-4 h-10 w-10 text-expedition-brass/75 sm:mt-8 ${yieldsWhenShort ? '[@media(max-height:820px)]:hidden' : ''}`}
            />
          )}
          <h1
            className={`font-normal leading-none tracking-[0.14em] text-expedition-parchment transition-[font-size,margin] duration-500 ease-out [text-shadow:0_3px_18px_rgba(0,0,0,0.65)] sm:tracking-[0.32em] ${
              tallPanel
                ? 'mt-1 text-[clamp(1.75rem,5vw,3rem)]'
                : `mt-5 text-[clamp(3rem,14vw,7.9rem)] ${
                  yieldsWhenShort
                    ? '[@media(max-height:820px)]:mt-1 [@media(max-height:820px)]:text-[clamp(1.75rem,5vw,3rem)]'
                    : ''
                }`
            }`}
          >
            DARWIN
          </h1>
          {!tallPanel && (
            <div className={`flex flex-col items-center ${yieldsWhenShort ? '[@media(max-height:820px)]:hidden' : ''}`}>
              <BrassRule className="mt-4" />
              <p className="mt-4 text-[clamp(1.35rem,2.6vw,2.25rem)] tracking-[0.16em] text-expedition-gold/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]">
                Galapagos, 1835
              </p>
            </div>
          )}
        </div>

        {/* `relative` is load-bearing: the inset gold hairline below positions
            against this panel. Without it the hairline resolves against the
            full-screen <section> and draws a second frame around the viewport. */}
        {/* The root menu sits well below the title so the sea horizon behind it
            stays readable. Panels come up closer, since they need the height. */}
        <div className={`relative ${tallPanel ? 'mt-5' : `mt-[clamp(2.5rem,9vh,6rem)] ${yieldsWhenShort ? '[@media(max-height:820px)]:mt-5' : ''}`} ${expandedPanel ? 'w-[min(34rem,calc(100vw-2rem))]' : 'w-[min(25rem,calc(100vw-2rem))]'} rounded-md border border-expedition-brass/70 bg-[rgba(13,18,20,0.86)] p-3 shadow-[0_22px_42px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(227,197,133,0.15)] backdrop-blur-sm`}>
          <div className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-expedition-gold/20" />
          {loading ? (
            <div className="relative px-3 py-5">
              <CompassRoseIcon className="mx-auto h-8 w-8 animate-pulse text-expedition-gold" />
              <h2 className="mt-4 text-[22px] tracking-[0.08em] text-expedition-goldbright">
                New Expedition
              </h2>
              <LoadingPhaseLine>{loadingLine}</LoadingPhaseLine>
              <ProgressBar value={progress} />
            </div>
          ) : showingMultiplayer ? (
            multiplayerPanel
          ) : choosingCharacter ? (
            <nav className="relative grid gap-2 p-1">
              <div className="px-2 pb-1 pt-1 text-center">
                <h2 className="text-[24px] tracking-[0.08em] text-expedition-goldbright">Choose Expedition Mode</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <CharacterChoiceButton
                  title="Darwin"
                  subtitle="Naturalist expedition"
                  onClick={() => onModeSelect?.('darwin')}
                  onIntent={onRuntimeIntent}
                />
                <CharacterChoiceButton
                  title="Finch"
                  subtitle="Winged island view"
                  onClick={() => onModeSelect?.('finch')}
                  onIntent={onRuntimeIntent}
                />
                <CharacterChoiceButton
                  title="Tortoise"
                  subtitle="Slow highland life"
                  onClick={() => onModeSelect?.('tortoise')}
                  onIntent={onRuntimeIntent}
                />
              </div>
              <BackButton onClick={onBack} />
            </nav>
          ) : showingSettings ? (
            <div className="relative px-3 py-2 text-left">
              <h2 className="text-center text-[25px] tracking-[0.08em] text-expedition-goldbright">Settings</h2>
              {/* Body scrolls, heading and Back do not, so the way out is always
                  on screen no matter how short the viewport is. */}
              <div className="mt-4 max-h-[min(58vh,30rem)] overflow-y-auto pr-1">
              <div className="rounded-sm border border-expedition-brass/40 bg-black/20 px-4 pb-3 pt-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-expedition-gold">Graphics quality</div>
                <div className="mt-2 grid gap-1">
                  {QUALITY_CHOICES.map(choice => (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={choice.id === quality}
                      onClick={() => onQualityChange?.(choice.id)}
                      className={`rounded-sm border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
                        choice.id === quality
                          ? 'border-expedition-gold/70 bg-expedition-gold/12'
                          : 'border-transparent hover:border-expedition-brass/50 hover:bg-expedition-gold/8'
                      }`}
                    >
                      <span className={`block text-[15px] tracking-[0.04em] ${choice.id === quality ? 'text-expedition-goldbright' : 'text-expedition-parchment'}`}>
                        {choice.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-expedition-faded">{choice.note}</span>
                    </button>
                  ))}
                </div>
              </div>
              <ComfortSettings className="mt-2" />
              <div className="mt-2 divide-y divide-expedition-brass/25 rounded-sm border border-expedition-brass/40 bg-black/20 px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[16px] text-expedition-parchment">Audio</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={audioEnabled}
                    onClick={() => onAudioEnabledChange?.(!audioEnabled)}
                    className={`min-w-16 rounded-sm border px-3 py-1 text-[13px] tracking-[0.08em] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
                      audioEnabled
                        ? 'border-expedition-gold/70 bg-expedition-gold/12 text-expedition-goldbright'
                        : 'border-expedition-brass/40 bg-black/20 text-expedition-faded'
                    }`}
                  >
                    {audioEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onControls}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left transition hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
                >
                  <span className="text-[16px] text-expedition-parchment">Controls</span>
                  <span className="text-[13px] tracking-[0.08em] text-expedition-gold">View list</span>
                </button>
              </div>
              </div>
              <BackButton onClick={onBack} />
            </div>
          ) : showingControls ? (
            <div className="relative px-3 py-2 text-left">
              <h2 className="text-center text-[25px] tracking-[0.08em] text-expedition-goldbright">Controls</h2>
              <p className="mx-auto mt-2 max-w-md text-center text-[13px] italic leading-relaxed text-expedition-parchment/72">
                Press <span className="not-italic text-expedition-gold">?</span> in the field to bring this back.
              </p>
              <div className="mt-4 max-h-[46vh] overflow-y-auto pr-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  {controlsSections({ polished: true, includeNarratorCommands: false }).map(([title, lines]) => (
                    <section key={title} className="min-w-0">
                      <h3 className="text-[11px] uppercase tracking-[0.16em] text-expedition-gold">{title}</h3>
                      <div className="mt-1.5 grid gap-1">
                        {lines.map(line => {
                          const separator = line.indexOf(': ');
                          if (separator < 0) {
                            return <div key={line} className="text-[13px] leading-snug text-expedition-parchment/88">{line}</div>;
                          }
                          return (
                            <div key={line} className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-3">
                              <span className="text-[12px] tracking-[0.04em] text-expedition-goldbright">{line.slice(0, separator)}</span>
                              <span className="text-[13px] leading-snug text-expedition-parchment/85">{line.slice(separator + 2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <BackButton onClick={onBack} />
            </div>
          ) : showingAbout ? (
            <div className="relative px-4 py-2 text-left">
              <h2 className="text-center text-[25px] tracking-[0.08em] text-expedition-goldbright">About</h2>
              <p className="mt-4 text-center text-[17px] tracking-[0.06em] text-expedition-parchment">Work in progress</p>
              <p className="mt-4 text-[15px] leading-relaxed text-expedition-parchment/82">
                Darwin is a playable historical simulation set on Floreana—then called Charles Island—in September 1835. It explores observation, collection, travel, uncertainty, and ecological change, with future classroom use in the history of science in mind.
              </p>
              <BrassRule className="my-5" />
              {/* Opens in a new tab rather than navigating: the launch shell may
                  already have the Three.js runtime and physics WASM warmed, and
                  leaving the route throws that away. */}
              <a
                href="/sources"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-between gap-4 rounded-sm border border-expedition-brass/55 px-4 py-3 text-left transition-colors hover:border-expedition-gold/75 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
              >
                <span className="min-w-0">
                  <span className="block text-[16px] text-expedition-parchment">Sources &amp; Further Reading</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-expedition-faded">
                    Bibliography, what is documented versus invented, and how the source-backed Library works.
                  </span>
                </span>
                <span className="shrink-0 text-[13px] tracking-[0.08em] text-expedition-gold">Open</span>
              </a>
              <p className="mt-5 text-center text-[15px] leading-relaxed text-expedition-parchment/88">
                Created by Benjamin Breen<br />
                Coded by GPT 5.6 and Claude
              </p>
              <BackButton onClick={onBack} />
            </div>
          ) : showingLoad ? (
            <div className="relative px-3 py-2 text-left">
              <h2 className="text-center text-[25px] tracking-[0.08em] text-expedition-goldbright">Load</h2>
              <div className="mt-4 divide-y divide-expedition-brass/25 rounded-sm border border-expedition-brass/40 bg-black/20 p-1">
                <LoadChoiceButton
                  title="Resume expedition"
                  subtitle={lastJournalLabel}
                  onClick={onContinue}
                  onIntent={onRuntimeIntent}
                />
                {/* Same save, opened on the notebook. Offered only once there is
                    something written to read. */}
                {hasSavedJournalEntries && (
                  <LoadChoiceButton
                    title="Read journal"
                    subtitle="Resumes this expedition with the notebook open."
                    onClick={onLoadJournal}
                    onIntent={onRuntimeIntent}
                  />
                )}
              </div>
              <BackButton onClick={onBack} />
            </div>
          ) : (
            <nav className="relative grid gap-1">
              <MenuButton primary onClick={onNewExpedition} onIntent={onRuntimeIntent}>New Expedition</MenuButton>
              {/* One door to the save. Resuming and opening the journal are the
                  same action underneath, so they sit together behind Load rather
                  than as two near-identical lines in the top-level menu. */}
              {hasSavedExpedition && <MenuButton onClick={onLoad}>Load</MenuButton>}
              {/* Only offered where a handler exists. The in-runtime menu shown
                  after returning from a session does not host the lobby, and a
                  button that silently did nothing read as a broken feature. */}
              {onMultiplayer && <MenuButton onClick={onMultiplayer}>Multiplayer</MenuButton>}
              <div className="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-expedition-brass/50 to-transparent" />
              {/* Controls is reached from inside Settings; a second route to the
                  same list only lengthened the menu. */}
              <MenuButton onClick={onSettings}>Settings</MenuButton>
              <MenuButton onClick={onAbout}>About</MenuButton>
            </nav>
          )}
        </div>

        {/* Only for a first landing. Once a save exists its details live in the
            Load panel, and repeating them here was the duplication that made the
            menu feel crowded — so returning players, who carry the longest menu,
            lose this card entirely. */}
        {saveStateKnown && !hasSavedExpedition && (
          <div className="mt-4 flex w-[min(25rem,calc(100vw-2rem))] items-center justify-center gap-3 rounded-sm border border-expedition-brass/60 bg-[rgba(13,18,20,0.72)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur-sm">
            <CompassRoseIcon className="h-6 w-6 shrink-0 text-expedition-gold" />
            <p className="min-w-0 text-[13.5px] tracking-[0.04em] text-expedition-parchment/90 sm:text-[15px]">
              Floreana / Charles Island - September 1835
            </p>
          </div>
        )}

        <div className={`${blackout ? 'opacity-0' : 'opacity-100'} mt-auto flex w-[min(28rem,70vw)] items-center justify-center gap-2 pb-2 pt-8 text-expedition-brass/80 transition-opacity duration-[1100ms] ease-out will-change-[opacity]`}>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-brass/80" />
          <span className="text-lg">HMS</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-brass/80" />
        </div>
      </div>
      {historicalPrologue?.active && (
        ANIMAL_PROLOGUES[historicalPrologue.modeId] ? (
          <AnimalPrologue
            modeId={historicalPrologue.modeId}
            sceneReady={historicalPrologue.sceneReady === true}
            skipRequested={historicalPrologue.skipRequested === true}
            departing={historicalPrologue.departing === true}
            onBeginExploring={historicalPrologue.onBeginExploring}
            onSkip={historicalPrologue.onSkip}
          />
        ) : (
          <HistoricalPrologue
            sceneReady={historicalPrologue.sceneReady === true}
            skipRequested={historicalPrologue.skipRequested === true}
            departing={historicalPrologue.departing === true}
            onBeginExploring={historicalPrologue.onBeginExploring}
            onSkip={historicalPrologue.onSkip}
          />
        )
      )}
    </section>
  );
}
