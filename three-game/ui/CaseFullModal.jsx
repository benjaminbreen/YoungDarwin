'use client';

import React from 'react';
import { useThreeGameStore } from '../store';
import { useDismissableOverlay } from './useDismissableOverlay';

// The case holds ten specimens. Full case: retire to the Beagle for the
// night, or release one specimen to make room. Escape backs out and leaves
// the animal where it stands.

export function CaseFullModal() {
  const choice = useThreeGameStore(state => state.caseFullChoice);
  const resolveCaseFullChoice = useThreeGameStore(state => state.resolveCaseFullChoice);
  const dismissCaseFullChoice = useThreeGameStore(state => state.dismissCaseFullChoice);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const panelRef = useDismissableOverlay(Boolean(choice), dismissCaseFullChoice);
  if (!choice) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-expedition-night/60 p-4 backdrop-blur-[2px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="The specimen case is full"
        data-testid="case-full-modal"
        tabIndex={-1}
        className="relative w-[min(26rem,100%)] animate-collect-pop motion-reduce:animate-none rounded-[10px] border border-expedition-gold/55 bg-[rgba(11,19,35,0.94)] px-6 pb-5 pt-6 text-center font-expedition shadow-[0_26px_70px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md focus:outline-none"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-expedition-goldbright/60 to-transparent" />
        <div className="font-sans text-[10.5px] font-bold uppercase tracking-[0.26em] text-expedition-goldbright">
          The case is full
        </div>
        <h2 className="mt-2 text-[24px] font-normal leading-tight text-[#f4e9d0]">
          {caseCapacity} specimens is all it holds
        </h2>
        <p className="mx-auto mt-1.5 max-w-[22rem] text-[13.5px] italic leading-snug text-expedition-parchment/85">
          {choice.specimenName
            ? `There is no room for the ${String(choice.specimenName).toLowerCase()}.`
            : 'There is no room for anything more.'} Retire to the Beagle and start fresh tomorrow, or let something go.
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => resolveCaseFullChoice('beagle')}
            className="w-full rounded-sm border border-expedition-goldbright/70 bg-[linear-gradient(135deg,rgba(191,152,81,0.26),rgba(191,152,81,0.1))] px-4 py-3 text-left transition hover:border-expedition-goldbright hover:bg-expedition-gold/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70"
          >
            <span className="block font-expedition text-[16px] font-semibold text-[#f5e5bd]">Make for the Beagle</span>
            <span className="mt-0.5 block font-expedition text-[12.5px] italic leading-snug text-expedition-faded">
              Travel back, stow the case, and retire for the night.
            </span>
          </button>
          <button
            type="button"
            onClick={() => resolveCaseFullChoice('release')}
            className="w-full rounded-sm border border-expedition-brass/50 bg-black/25 px-4 py-3 text-left transition hover:border-expedition-goldbright hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70"
          >
            <span className="block font-expedition text-[16px] font-semibold text-expedition-parchment">Make room in the case</span>
            <span className="mt-0.5 block font-expedition text-[12.5px] italic leading-snug text-expedition-faded">
              Release one specimen you have already taken.
            </span>
          </button>
          <button
            type="button"
            onClick={dismissCaseFullChoice}
            className="mx-auto mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-expedition-faded transition hover:text-expedition-parchment"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
