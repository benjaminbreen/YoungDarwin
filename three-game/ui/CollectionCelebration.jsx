'use client';

import React, { useEffect, useRef } from 'react';
import { useThreeGameStore } from '../store';
import { getInventoryItem } from '../../data/inventoryItems';
import { getZone } from '../world/floreanaZones';
import { playCollectionChime } from '../audio/audioRuntime';
import { getSpecimenRarity } from '../rarity';
import { RarityBadge } from './RarityBadge';
import { SpecimenPortrait } from './SpecimenPortrait';
import { useZoneSpecimenProgress } from './useZoneSpecimenProgress';

// The collection reward moment. One component, three tones: a collected
// specimen gets the full rarity-colored celebration; documenting gets a calmer
// version of the same card; a failed attempt gets a compact notice. Replaces
// the old flat outcome toast.

function toneFor(outcome) {
  if (outcome.documented || outcome.result?.outcomeType === 'documented') return 'documented';
  return outcome.result?.success ? 'success' : 'failure';
}

export function celebrationVisibleMs(outcome) {
  if (!outcome) return 4200;
  const tone = toneFor(outcome);
  if (tone === 'success') return 4000;
  if (tone === 'documented') return 3400;
  return 4200;
}


export function CollectionCelebration({ toast, onClose }) {
  const outcome = toast?.outcome;
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const inventoryCount = useThreeGameStore(state => state.inventory.length);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const lightweightEffects = useThreeGameStore(
    state => Number(state.foliageDrawScale) <= 0.76,
  );
  const progress = useZoneSpecimenProgress();

  // One chime per toast, on the toast's first frame — the toast object itself
  // changes identity on visibility flips, so key the guard on its id.
  const chimeIdRef = useRef(null);
  useEffect(() => {
    if (!toast?.id || toast.id === chimeIdRef.current) return;
    chimeIdRef.current = toast.id;
    const chimeOutcome = toast.outcome;
    if (!chimeOutcome || toneFor(chimeOutcome) !== 'success') return;
    playCollectionChime(getSpecimenRarity(chimeOutcome.specimen).id);
  }, [toast]);

  // Escape or a click anywhere off the card dismisses early. Both listen on
  // the capture phase: Escape must not also reach the HUD's pause-menu
  // handler, and an outside click dismisses without eating the click itself.
  const cardRef = useRef(null);
  const visible = Boolean(toast?.visible);
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = event => {
      if (event.code !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    const onPointerDown = event => {
      if (cardRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [visible, onClose]);

  if (!outcome) return null;
  const { specimen, tool, result } = outcome;
  const tone = toneFor(outcome);
  const rarity = getSpecimenRarity(specimen);
  const zone = getZone(currentZoneId);
  const methodName = getInventoryItem(tool?.id)?.name || tool?.name || 'Bare Hands';
  const duplicate = tone === 'documented' && outcome.documented && tool?.id !== 'sketch';

  const exitClass = toast.visible
    ? 'opacity-100'
    : 'pointer-events-none opacity-0 blur-[1px]';

  if (tone === 'failure') {
    return (
      <div data-testid="collection-celebration" className={`pointer-events-none absolute left-1/2 top-[34%] z-40 w-[20rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 font-expedition transition-all duration-300 ${exitClass}`}>
        <button
          ref={cardRef}
          type="button"
          onClick={onClose}
          aria-live="polite"
          className={`pointer-events-auto block w-full animate-collect-pop motion-reduce:animate-none cursor-default rounded-[9px] border border-rose-300/40 bg-[rgba(30,14,20,0.94)] px-4 py-3 text-left shadow-[0_18px_44px_rgba(0,0,0,0.45)] ${lightweightEffects ? '' : 'backdrop-blur-md'}`}
        >
          <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.24em] text-rose-200/90">It slips away</span>
          <span className="mt-1 block text-[17px] leading-tight text-expedition-parchment">{specimen?.name || 'The specimen'}</span>
          <span className="mt-1.5 block text-[12.5px] leading-snug text-expedition-parchment/75">{result?.reason || 'The attempt fails and is noted in the field log.'}</span>
        </button>
      </div>
    );
  }

  const isSuccess = tone === 'success';
  return (
    <div data-testid="collection-celebration" className={`pointer-events-none absolute left-1/2 top-[37%] z-40 w-[22rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 font-expedition transition-all duration-300 ${exitClass}`}>
      {isSuccess && !lightweightEffects && (
        <>
          {/* Burst layers must overshoot the card, or they animate invisibly
              behind it: the card is ~22rem wide and taller than that. Each
              animated layer sits inside a statically centered wrapper —
              standalone rotate/scale on the translate-centered element itself
              pivots around the pre-translate origin and drifts off center. */}
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2">
            <div
              className="h-full w-full animate-collect-glow motion-reduce:animate-none"
              style={{ background: `radial-gradient(circle, ${rarity.glow} 0%, transparent 58%)`, opacity: 0.45 }}
            />
          </div>
          {/* Sun rays: soft-edged, quiet, slowly turning for the card's stay */}
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2">
            <div
              className="h-full w-full animate-collect-rays motion-reduce:animate-none"
              style={{
                background: `repeating-conic-gradient(from 8deg, ${rarity.color}52 0deg 6deg, transparent 6deg 24deg)`,
                WebkitMaskImage: 'radial-gradient(circle, black 26%, transparent 68%)',
                maskImage: 'radial-gradient(circle, black 26%, transparent 68%)',
                filter: 'blur(7px)',
              }}
            />
          </div>
          {/* Expanding capture rings */}
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2">
            <div
              className="h-full w-full animate-collect-ring motion-reduce:animate-none rounded-full border"
              style={{ borderColor: rarity.ring, boxShadow: `0 0 16px ${rarity.glow}, inset 0 0 16px ${rarity.glow}` }}
            />
          </div>
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2">
            <div
              className="h-full w-full animate-collect-ring motion-reduce:animate-none rounded-full border"
              style={{ borderColor: rarity.ring, animationDelay: '0.18s', animationFillMode: 'both' }}
            />
          </div>
        </>
      )}
      {isSuccess && lightweightEffects && (
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, ${rarity.glow} 0%, transparent 66%)` }}
        />
      )}

      <button
        ref={cardRef}
        type="button"
        onClick={onClose}
        aria-live="polite"
        className={`pointer-events-auto relative block w-full animate-collect-pop motion-reduce:animate-none cursor-default rounded-[10px] border bg-[rgba(11,19,35,0.94)] px-5 pb-4 pt-4 text-center shadow-[0_22px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(227,197,133,0.14)] ${lightweightEffects ? '' : 'backdrop-blur-md'}`}
        style={{ borderColor: isSuccess ? rarity.ring : 'rgba(138,109,63,0.55)' }}
      >
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-expedition-goldbright/60 to-transparent" />

        <span className={`block font-sans text-[10.5px] font-bold uppercase tracking-[0.26em] ${isSuccess ? 'text-expedition-goldbright' : 'text-sky-200/90'}`}>
          {isSuccess ? 'Specimen collected' : duplicate ? 'Noted in the field book' : 'Documented'}
        </span>

        <span className="mt-3 flex justify-center">
          <SpecimenPortrait specimen={specimen} rarity={rarity} size="h-[6.5rem] w-[6.5rem]" glow={22} dim={!isSuccess} />
        </span>

        <span className="mt-3 block text-[24px] font-normal leading-tight text-[#f4e9d0]">{specimen?.name || 'Specimen'}</span>
        {specimen?.latin && <span className="mt-0.5 block text-[13px] italic text-expedition-faded">{specimen.latin}</span>}

        <span className="mt-2.5 flex justify-center">
          <RarityBadge rarity={rarity} size="md" animate={isSuccess} />
        </span>

        <span className="mt-3 block border-t border-expedition-brass/25 pt-2.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.14em] text-expedition-faded">
          {isSuccess ? (
            <>
              {zone?.shortName || zone?.name} · <span className="text-expedition-goldbright">{progress.recorded}</span>/{progress.total} recorded · Case {inventoryCount}/{caseCapacity}
            </>
          ) : duplicate ? (
            'Already in the case — this one stays in the field'
          ) : (
            `Recorded with the ${methodName.toLowerCase()} · nothing taken`
          )}
        </span>
      </button>
    </div>
  );
}
