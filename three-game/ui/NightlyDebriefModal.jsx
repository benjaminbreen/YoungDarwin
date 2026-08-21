'use client';

import React from 'react';
import { useThreeGameStore } from '../store';
import { SUPPLY_DEFS } from '../../data/inventoryItems';
import { getSpecimenRarity } from '../rarity';
import { RarityBadge } from './RarityBadge';
import { SpecimenPortrait } from './SpecimenPortrait';
import { useDismissableOverlay } from './useDismissableOverlay';

// Evening summary shown when the case is stowed aboard the Beagle and the
// day turns.

function StowedSpecimen({ specimen, index }) {
  const rarity = getSpecimenRarity(specimen);
  return (
    <div
      className="flex animate-collect-chip motion-reduce:animate-none flex-col items-center gap-1.5"
      style={{ animationDelay: `${0.15 + index * 0.09}s` }}
    >
      <SpecimenPortrait specimen={specimen} rarity={rarity} size="h-16 w-16" />
      <span className="max-w-[5.5rem] truncate text-center font-expedition text-[11px] leading-tight text-expedition-parchment" title={specimen.name}>
        {specimen.name}
      </span>
      <RarityBadge rarity={rarity} />
    </div>
  );
}

export function NightlyDebriefModal() {
  const debrief = useThreeGameStore(state => state.nightlyDebrief);
  const dismiss = useThreeGameStore(state => state.dismissNightlyDebrief);
  const panelRef = useDismissableOverlay(Boolean(debrief), dismiss);

  if (!debrief) return null;
  const { endedDay, nextDay, finalDay, stowed, shipTotal, notesToday, suppliesDrawn, unexaminedCount } = debrief;
  const supplyName = id => SUPPLY_DEFS.find(def => def.id === id)?.name || id;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-expedition-night/70 p-4 backdrop-blur-[3px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Evening aboard the Beagle"
        tabIndex={-1}
        className="relative w-[min(30rem,100%)] animate-collect-pop motion-reduce:animate-none rounded-[10px] border border-expedition-gold/55 bg-[rgba(11,19,35,0.94)] px-6 pb-5 pt-6 text-center font-expedition shadow-[0_26px_70px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md focus:outline-none"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-expedition-goldbright/60 to-transparent" />

        <div className="font-sans text-[10.5px] font-bold uppercase tracking-[0.26em] text-expedition-goldbright">
          Day {endedDay} closes
        </div>
        <h2 className="mt-2 text-[26px] font-normal leading-tight text-[#f4e9d0]">
          Evening aboard the Beagle
        </h2>
        <p className="mx-auto mt-1.5 max-w-[24rem] text-[13.5px] italic leading-snug text-expedition-faded">
          {stowed.length > 0
            ? 'The case is struck below and the lamps are lit. The day’s work is banked.'
            : 'The case came back empty tonight. The island keeps what was not taken.'}
        </p>

        {stowed.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-3">
            {stowed.map((specimen, index) => (
              <StowedSpecimen key={`${specimen.id}-${index}`} specimen={specimen} index={index} />
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-expedition-brass/35 bg-expedition-brass/35">
          {[
            [stowed.length, stowed.length === 1 ? 'Specimen stowed' : 'Specimens stowed'],
            [shipTotal, 'In the ship’s hold'],
            [notesToday, notesToday === 1 ? 'Note written' : 'Notes written'],
          ].map(([value, label]) => (
            <div key={label} className="bg-[rgba(10,16,28,0.92)] px-2 py-2.5">
              <div className="text-[22px] font-semibold leading-none text-expedition-goldbright">{value}</div>
              <div className="mt-1 font-sans text-[8.5px] font-semibold uppercase tracking-[0.12em] text-expedition-faded">{label}</div>
            </div>
          ))}
        </div>

        {suppliesDrawn.length > 0 && (
          <p className="mt-3 text-[12.5px] italic leading-snug text-expedition-parchment/80">
            The purser draws stores: {suppliesDrawn.map(item => `${supplyName(item.id).toLowerCase()} ×${item.gained}`).join(', ')}.
          </p>
        )}

        {unexaminedCount > 0 && (
          <p className="mx-auto mt-3 max-w-[24rem] border-t border-expedition-brass/25 pt-3 text-[12.5px] italic leading-snug text-[#d9a05a]">
            {unexaminedCount === 1
              ? 'One specimen entered the case unexamined. Henslow will ask what you observed, not only what you took.'
              : `${unexaminedCount} specimens entered the case unexamined. Henslow will ask what you observed, not only what you took.`}
          </p>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 min-h-[46px] w-full rounded-sm border border-expedition-goldbright/70 bg-[linear-gradient(135deg,rgba(191,152,81,0.26),rgba(191,152,81,0.1))] px-3 font-sans text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[#f5e5bd] transition hover:border-expedition-goldbright hover:bg-expedition-gold/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70"
        >
          {finalDay ? `Begin day ${nextDay} — the last ashore` : `Begin day ${nextDay}`}
        </button>
      </div>
    </div>
  );
}
