'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getZone } from '../world/floreanaZones';
import { useThreeGameStore } from '../store';

function ProgressBar({ progress }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-stone-950/35">
      <div
        className="h-full rounded-full bg-amber-200 shadow-[0_0_18px_rgba(253,230,138,0.35)] transition-[width] duration-150"
        style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
      />
    </div>
  );
}

export function ZoneTransitionOverlay() {
  const transition = useThreeGameStore(state => state.transition);
  const completeZoneTransition = useThreeGameStore(state => state.completeZoneTransition);
  const [progress, setProgress] = useState(0);
  const zone = useMemo(() => getZone(transition?.zoneId), [transition?.zoneId]);

  useEffect(() => {
    if (!transition) {
      setProgress(0);
      return undefined;
    }
    let frame = null;
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      const next = Math.min(100, Math.round((elapsed / 1450) * 100));
      setProgress(next);
      if (next >= 100) {
        completeZoneTransition();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [completeZoneTransition, transition]);

  if (!transition) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-stone-950/72 p-4 text-amber-50 backdrop-blur-sm">
      <section className="relative w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-amber-200/35 bg-[#ead9ad] text-stone-950 shadow-2xl">
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #3a2b18 1px, transparent 0)', backgroundSize: '16px 16px' }} />
        <div className="relative grid gap-4 p-5 sm:grid-cols-[1fr_11rem] sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-900/70">Field Transfer</p>
            <h2 className="mt-2 font-serif text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">{transition.to}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-700">{transition.subtitle}</p>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-stone-800">{transition.note}</p>
            <p className="mt-3 border-l-2 border-amber-700/60 pl-3 text-sm italic leading-relaxed text-stone-700">{transition.educationalNote}</p>
          </div>
          <div className="rounded border border-amber-900/25 bg-stone-950/10 p-3">
            <div className="relative mx-auto aspect-[7/10] w-28 rounded-[48%_52%_45%_55%] bg-[#647845] shadow-inner">
              <div className="absolute left-8 top-7 h-14 w-10 rounded-full bg-[#4c5d36]" />
              <div className="absolute bottom-4 left-6 h-7 w-16 rounded-full bg-[#a78a57]" />
              <div className="absolute left-11 top-12 h-3 w-3 rounded-full border border-white bg-amber-200 shadow" />
              <div className="absolute left-12 top-2 text-[9px] font-bold uppercase text-stone-950/55">N</div>
            </div>
            <div className="mt-3 text-center text-xs font-semibold text-stone-700">{zone.historicalName}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-stone-700">
              <span>Loading local map</span>
              <span>{progress}%</span>
            </div>
            <ProgressBar progress={progress} />
            <div className="mt-3 grid gap-1 text-xs text-stone-700 sm:grid-cols-3">
              <span>From: {transition.from}</span>
              <span>Island: {transition.island}</span>
              <span>Preparing: terrain, wildlife, notes</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
