'use client';

import React, { useMemo } from 'react';
import { CompassRoseIcon, OpenBookIcon } from './expedition/icons';

const SPLASH_BACKGROUND = '/assets/ui/splash-background-1672.webp';
const SPLASH_BACKGROUND_SRCSET = [
  '/assets/ui/splash-background-960.webp 960w',
  `${SPLASH_BACKGROUND} 1672w`,
].join(', ');

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

function ProgressBar({ value }) {
  const safe = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between font-expedition text-[11px] uppercase tracking-[0.18em] text-expedition-faded">
        <span>Charting landing party</span>
        <span className="tabular-nums text-expedition-goldbright">{Math.round(safe)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm border border-expedition-brass/70 bg-black/45 shadow-[inset_0_1px_6px_rgba(0,0,0,0.65)]">
        <div
          className="h-full bg-gradient-to-r from-expedition-brass via-expedition-gold to-expedition-goldbright transition-[width] duration-300"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

export function LaunchOverlay({
  mode = 'menu',
  progress = 0,
  selectedModeId = 'darwin',
  departing = false,
  blackout = false,
  onNewExpedition,
  onModeSelect,
  onBack,
  onContinue,
  onLoadJournal,
  onSettings,
  onAbout,
  audioEnabled = true,
  onAudioEnabledChange,
  onRuntimeIntent,
  interactive = true,
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
  const showingAbout = mode === 'about';
  const expandedPanel = choosingCharacter || showingSettings || showingAbout;

  return (
    <section
      data-testid="three-launch-overlay"
      data-mode={mode}
      data-departing={departing ? 'true' : 'false'}
      data-blackout={blackout ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
      className={`${departing ? 'opacity-0' : 'opacity-100'} ${departing || !interactive ? 'pointer-events-none' : 'pointer-events-auto'} absolute inset-0 z-40 overflow-hidden bg-black font-expedition text-expedition-parchment transition-opacity duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity]`}
    >
      <div
        aria-hidden="true"
        className={`${blackout ? 'opacity-0' : 'opacity-100'} pointer-events-none absolute inset-0 transition-opacity duration-[1500ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity]`}
      >
        <img
          src={SPLASH_BACKGROUND}
          srcSet={SPLASH_BACKGROUND_SRCSET}
          sizes="100vw"
          alt=""
          loading="eager"
          fetchPriority="high"
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

      <div className="relative flex min-h-full flex-col items-center px-4 py-8 text-center sm:py-10">
        <div className={`${blackout ? 'opacity-0' : 'opacity-100'} flex flex-col items-center transition-opacity duration-[1100ms] ease-out will-change-[opacity]`}>
          <CompassRoseIcon className="mt-4 h-10 w-10 text-expedition-brass/75 sm:mt-8" />
          <h1 className="mt-5 text-[clamp(3rem,14vw,7.9rem)] font-normal leading-none tracking-[0.14em] text-expedition-parchment [text-shadow:0_3px_18px_rgba(0,0,0,0.65)] sm:tracking-[0.32em]">
            DARWIN
          </h1>
          <BrassRule className="mt-4" />
          <p className="mt-4 text-[clamp(1.35rem,2.6vw,2.25rem)] tracking-[0.16em] text-expedition-gold/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]">
            Galapagos, 1835
          </p>
        </div>

        <div className={`mt-9 ${expandedPanel ? 'w-[min(34rem,calc(100vw-2rem))]' : 'w-[min(25rem,calc(100vw-2rem))]'} rounded-md border border-expedition-brass/70 bg-[rgba(13,18,20,0.86)] p-3 shadow-[0_22px_42px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(227,197,133,0.15)] backdrop-blur-sm`}>
          <div className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-expedition-gold/20" />
          {loading ? (
            <div className="relative px-3 py-5">
              <CompassRoseIcon className="mx-auto h-8 w-8 animate-pulse text-expedition-gold" />
              <h2 className="mt-4 text-[22px] tracking-[0.08em] text-expedition-goldbright">
                New Expedition
              </h2>
              <p className="mt-3 min-h-[2.5rem] text-[15px] leading-relaxed text-expedition-parchment/82">
                {loadingLine}
              </p>
              <ProgressBar value={progress} />
            </div>
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
              <p className="mx-auto mt-3 max-w-md text-center text-[15px] leading-relaxed text-expedition-parchment/80">
                The expedition selects sensible display settings automatically. Natural field-recorded sound is kept deliberately quiet.
              </p>
              <div className="mt-4 divide-y divide-expedition-brass/25 rounded-sm border border-expedition-brass/40 bg-black/20 px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[16px] text-expedition-parchment">Display &amp; performance</span>
                  <span className="text-[13px] tracking-[0.08em] text-expedition-gold">Automatic</span>
                </div>
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
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[16px] text-expedition-parchment">Controls &amp; accessibility</span>
                  <span className="text-[13px] tracking-[0.08em] text-expedition-faded">Coming soon</span>
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
              <p className="text-center text-[15px] leading-relaxed text-expedition-parchment/88">
                Created by Benjamin Breen<br />
                Coded by GPT 5.6 and Claude
              </p>
              <BackButton onClick={onBack} />
            </div>
          ) : (
            <nav className="relative grid gap-1">
              {hasSavedExpedition && <MenuButton onClick={onContinue}>Continue Expedition</MenuButton>}
              <MenuButton primary onClick={onNewExpedition} onIntent={onRuntimeIntent}>New Expedition</MenuButton>
              <div className="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-expedition-brass/50 to-transparent" />
              {hasSavedJournalEntries && <MenuButton onClick={onLoadJournal}>Load Journal</MenuButton>}
              <MenuButton onClick={onSettings}>Settings</MenuButton>
              <MenuButton onClick={onAbout}>About</MenuButton>
            </nav>
          )}
        </div>

        <div className="mt-4 flex w-[min(25rem,calc(100vw-2rem))] items-center justify-center gap-3 rounded-sm border border-expedition-brass/60 bg-[rgba(13,18,20,0.72)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur-sm">
          {hasSavedJournalEntries
            ? <OpenBookIcon className="h-6 w-6 shrink-0 text-expedition-gold" />
            : <CompassRoseIcon className="h-6 w-6 shrink-0 text-expedition-gold" />}
          <p className="min-w-0 text-[13.5px] tracking-[0.04em] text-expedition-parchment/90 sm:text-[15px]">
            {hasSavedJournalEntries ? `Last entry: ${lastJournalLabel}` : 'Floreana / Charles Island - September 1835'}
          </p>
        </div>

        <div className={`${blackout ? 'opacity-0' : 'opacity-100'} mt-auto flex w-[min(28rem,70vw)] items-center justify-center gap-2 pb-2 pt-8 text-expedition-brass/80 transition-opacity duration-[1100ms] ease-out will-change-[opacity]`}>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-brass/80" />
          <span className="text-lg">HMS</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-brass/80" />
        </div>
      </div>
    </section>
  );
}
