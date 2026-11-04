'use client';

import React from 'react';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { useDismissableOverlay } from './useDismissableOverlay';

// The shotgun slot, pressed while Covington has the gun: send for it, or let
// him take the shot. Either way he has to walk; if he is in another region
// neither is possible from here.

export function ShotgunChoiceModal() {
  const open = useThreeGameStore(state => state.shotgunChoiceOpen);
  const symsZoneId = useThreeGameStore(state => state.symsZoneId);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const closeShotgunChoice = useThreeGameStore(state => state.closeShotgunChoice);
  const summonSymsWithGun = useThreeGameStore(state => state.summonSymsWithGun);
  const askSymsToShoot = useThreeGameStore(state => state.askSymsToShoot);
  const panelRef = useDismissableOverlay(open, closeShotgunChoice);
  if (!open) return null;
  const away = symsZoneId !== currentZoneId ? (getZone(symsZoneId)?.name || 'the landing') : null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-expedition-night/60 p-4 backdrop-blur-[2px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Covington has the gun"
        data-testid="shotgun-choice-modal"
        tabIndex={-1}
        className="relative w-[min(26rem,100%)] animate-collect-pop motion-reduce:animate-none rounded-[10px] border border-expedition-gold/55 bg-[rgba(11,19,35,0.94)] px-6 pb-5 pt-6 text-center font-expedition shadow-[0_26px_70px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md focus:outline-none"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-expedition-goldbright/60 to-transparent" />
        <div className="font-sans text-[10.5px] font-bold uppercase tracking-[0.26em] text-expedition-goldbright">
          The collecting gun
        </div>
        <h2 className="mt-2 text-[24px] font-normal leading-tight text-[#f4e9d0]">
          Covington has it
        </h2>
        <p className="mx-auto mt-1.5 max-w-[22rem] text-[13.5px] italic leading-snug text-expedition-parchment/85">
          {away
            ? `He is at ${away}. Go to him, or call him along, before the gun is any use to you.`
            : 'Send for the gun and carry it yourself, or let him do the shooting. He is the better shot.'}
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            data-ui-sound="seal"
            disabled={Boolean(away)}
            onClick={summonSymsWithGun}
            className="w-full rounded-sm border border-expedition-goldbright/70 bg-[linear-gradient(135deg,rgba(191,152,81,0.26),rgba(191,152,81,0.1))] px-4 py-3 text-left transition hover:border-expedition-goldbright hover:bg-expedition-gold/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="block font-expedition text-[16px] font-semibold text-[#f5e5bd]">Bring me the gun</span>
            <span className="mt-0.5 block font-expedition text-[12.5px] italic leading-snug text-expedition-faded">
              He walks it over. It rides on your back, and other tools wait until you hand it back.
            </span>
          </button>
          <button
            type="button"
            data-ui-sound="seal"
            disabled={Boolean(away)}
            onClick={askSymsToShoot}
            className="w-full rounded-sm border border-expedition-brass/50 bg-black/25 px-4 py-3 text-left transition hover:border-expedition-goldbright hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="block font-expedition text-[16px] font-semibold text-expedition-parchment">Take the shot yourself, Covington</span>
            <span className="mt-0.5 block font-expedition text-[12.5px] italic leading-snug text-expedition-faded">
              He goes after the nearest bird or beast that needs the gun. You gather what falls.
            </span>
          </button>
          <button
            type="button"
            onClick={closeShotgunChoice}
            className="mx-auto mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-expedition-faded transition hover:text-expedition-parchment"
          >
            Never mind
          </button>
        </div>
      </div>
    </div>
  );
}
