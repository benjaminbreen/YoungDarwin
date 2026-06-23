'use client';

import React, { useMemo } from 'react';
import { CompassRoseIcon, OpenBookIcon } from './expedition/icons';

const SPLASH_BACKGROUND = '/assets/ui/splash-background.png';

function BrassRule({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-expedition-brass/80 ${className}`}>
      <span className="h-px w-20 bg-gradient-to-r from-transparent to-expedition-brass/75" />
      <span className="h-1.5 w-1.5 rotate-45 border border-expedition-brass/80" />
      <span className="h-px w-20 bg-gradient-to-l from-transparent to-expedition-brass/75" />
    </div>
  );
}

function MenuButton({ children, primary = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
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

export function LaunchOverlay({ mode = 'menu', progress = 0, onNewExpedition }) {
  const loadingLine = useMemo(() => {
    if (progress < 35) return 'Preparing the Beagle launch and shore instruments.';
    if (progress < 72) return 'Unfolding Charles Island terrain, weather, and specimens.';
    if (progress < 100) return 'Settling Darwin, Syms, and the Post Office Bay landing.';
    return 'Taking the first bearings ashore.';
  }, [progress]);
  const loading = mode === 'loading';

  return (
    <section
      data-testid="three-launch-overlay"
      data-mode={mode}
      className="pointer-events-auto absolute inset-0 z-40 overflow-hidden bg-[#111718] font-expedition text-expedition-parchment"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${SPLASH_BACKGROUND})` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_37%,rgba(21,30,32,0.08),rgba(8,10,10,0.64)_82%),linear-gradient(90deg,rgba(5,7,8,0.46),rgba(5,7,8,0.12)_42%,rgba(5,7,8,0.32))]" />
      <div className="absolute inset-[14px] border border-expedition-brass/58 shadow-[inset_0_0_30px_rgba(0,0,0,0.35)] sm:inset-[22px]" />
      <div className="absolute left-4 top-4 h-5 w-5 border-l border-t border-expedition-gold/80 sm:left-6 sm:top-6" />
      <div className="absolute right-4 top-4 h-5 w-5 border-r border-t border-expedition-gold/80 sm:right-6 sm:top-6" />
      <div className="absolute bottom-4 left-4 h-5 w-5 border-b border-l border-expedition-gold/80 sm:bottom-6 sm:left-6" />
      <div className="absolute bottom-4 right-4 h-5 w-5 border-b border-r border-expedition-gold/80 sm:bottom-6 sm:right-6" />

      <div className="relative flex min-h-full flex-col items-center px-4 py-8 text-center sm:py-10">
        <CompassRoseIcon className="mt-4 h-10 w-10 text-expedition-brass/75 sm:mt-8" />
        <h1 className="mt-5 text-[clamp(3rem,14vw,7.9rem)] font-normal leading-none tracking-[0.14em] text-expedition-parchment [text-shadow:0_3px_18px_rgba(0,0,0,0.65)] sm:tracking-[0.32em]">
          DARWIN
        </h1>
        <BrassRule className="mt-4" />
        <p className="mt-4 text-[clamp(1.35rem,2.6vw,2.25rem)] tracking-[0.16em] text-expedition-gold/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]">
          Galapagos, 1835
        </p>

        <div className="mt-9 w-[min(25rem,calc(100vw-2rem))] rounded-md border border-expedition-brass/70 bg-[rgba(13,18,20,0.86)] p-3 shadow-[0_22px_42px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(227,197,133,0.15)] backdrop-blur-sm">
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
          ) : (
            <nav className="relative grid gap-1">
              <MenuButton disabled>Continue Expedition</MenuButton>
              <MenuButton primary onClick={onNewExpedition}>New Expedition</MenuButton>
              <div className="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-expedition-brass/50 to-transparent" />
              <MenuButton disabled>Load Journal</MenuButton>
              <div className="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-expedition-brass/35 to-transparent" />
              <MenuButton disabled>Settings</MenuButton>
              <div className="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-expedition-brass/35 to-transparent" />
              <MenuButton disabled>Quit</MenuButton>
            </nav>
          )}
        </div>

        <div className="mt-4 flex w-[min(25rem,calc(100vw-2rem))] items-center justify-center gap-3 rounded-sm border border-expedition-brass/60 bg-[rgba(13,18,20,0.72)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur-sm">
          <OpenBookIcon className="h-6 w-6 shrink-0 text-expedition-gold" />
          <p className="min-w-0 text-[13.5px] tracking-[0.04em] text-expedition-parchment/90 sm:text-[15px]">
            Last entry: Floreana - September 1835
          </p>
        </div>

        <div className="mt-auto flex w-[min(28rem,70vw)] items-center justify-center gap-2 pb-2 pt-8 text-expedition-brass/80">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-brass/80" />
          <span className="text-lg">HMS</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-brass/80" />
        </div>
      </div>
    </section>
  );
}
