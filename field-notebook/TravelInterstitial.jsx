'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useThreeGameStore } from '../three-game/store';
import { getZone } from '../three-game/world/floreanaZones';

const ROUTE_PLACE_COPY = {
  POST_OFFICE_BAY: 'A sheltered cove, black lava shore, and the old mail barrel.',
  N_SHORE: 'Black sand, broken lava, dry coastal scrub.',
  NW_REEF: 'Clear shallows, dark reef rock, and fish moving over pale sand.',
  W_HIGH: 'A dry climb into red dirt, scrub, and cooler upland air.',
  EL_MIRADOR: 'A high red ridge with long views across Charles Island.',
  MANGROVES: 'Still water, mangrove shade, and soft mud underfoot.',
  PENAL_COLONY: 'Fenced fields, rough huts, and damp highland ground.',
};

const ROUTE_LABELS = {
  N: 'North',
  S: 'South',
  E: 'East',
  W: 'West',
  NE: 'Northeast',
  NW: 'Northwest',
  SE: 'Southeast',
  SW: 'Southwest',
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  northeast: 'Northeast',
  northwest: 'Northwest',
  southeast: 'Southeast',
  southwest: 'Southwest',
};

function routeLabel(value) {
  const raw = String(value || '').trim();
  return ROUTE_LABELS[raw] || ROUTE_LABELS[raw.toUpperCase()] || raw || 'Route';
}

function routePlaceCopy(zone, transition) {
  if (zone?.id && ROUTE_PLACE_COPY[zone.id]) return ROUTE_PLACE_COPY[zone.id];
  const source = zone?.narration?.loadingNote || zone?.description || transition?.note || '';
  const cleaned = String(source)
    .replace(/^travel\s+\w+\s+to\s+[^.]+\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Preparing the next locality.';
  const first = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return first.length > 110 ? `${first.slice(0, 107).trim()}...` : first;
}

function ProgressBar({ progress }) {
  return (
    <div className="h-2 overflow-hidden rounded-sm border border-expedition-brass/55 bg-black/50 shadow-[inset_0_1px_6px_rgba(0,0,0,0.65)]">
      <div
        className="h-full bg-gradient-to-r from-expedition-brass via-expedition-gold to-expedition-goldbright shadow-[0_0_18px_rgba(227,197,133,0.35)] transition-[width] duration-150"
        style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
      />
    </div>
  );
}

export function TravelInterstitial() {
  const transition = useThreeGameStore(state => state.transition);
  const completeZoneTransition = useThreeGameStore(state => state.completeZoneTransition);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const completeTimerRef = React.useRef(null);
  const zone = useMemo(() => getZone(transition?.zoneId), [transition?.zoneId]);
  const card = transition?.travelCard;

  useEffect(() => {
    if (!transition) {
      setProgress(0);
      setVisible(false);
      return undefined;
    }
    let frame = null;
    let revealFrame = null;
    let completing = false;
    const started = performance.now();
    revealFrame = requestAnimationFrame(() => setVisible(true));
    const tick = () => {
      const elapsed = performance.now() - started;
      const next = Math.min(100, Math.round((elapsed / 1450) * 100));
      setProgress(next);
      if (next >= 100 && !completing) {
        completing = true;
        setVisible(false);
        completeTimerRef.current = window.setTimeout(() => {
          completeZoneTransition();
        }, 220);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (revealFrame) cancelAnimationFrame(revealFrame);
      if (frame) cancelAnimationFrame(frame);
      if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    };
  }, [completeZoneTransition, transition]);

  if (!transition) return null;
  const direction = routeLabel(card?.routeLabel);
  const copy = routePlaceCopy(zone, transition);

  return (
    <div className={`pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/82 p-4 font-expedition text-expedition-parchment backdrop-blur-md transition-opacity duration-[220ms] ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <section className={`relative w-[min(40rem,calc(100vw-1.25rem))] overflow-hidden rounded-[3px] border border-expedition-brass/85 bg-[linear-gradient(165deg,rgba(18,29,42,0.96),rgba(7,13,20,0.98))] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.74),inset_0_1px_0_rgba(227,197,133,0.16)] transition-[opacity,transform] duration-[220ms] sm:p-5 ${visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.982] opacity-0'}`}>
        <div className="pointer-events-none absolute inset-[4px] rounded-[2px] border border-expedition-gold/20" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4 border-b border-expedition-brass/45 pb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold/85">Field Transfer</p>
              <h2 className="mt-2 text-[26px] font-bold leading-none tracking-[0.02em] text-expedition-parchment sm:text-[34px]">
                {transition.to}
              </h2>
            </div>
            <div className="rounded-sm border border-expedition-gold/55 bg-expedition-gold/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-expedition-goldbright">
              {direction}
            </div>
          </div>

          <div className="py-4 sm:py-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-semibold text-expedition-parchment sm:text-[17px]">
              <span className="truncate">{transition.from}</span>
          <span className="text-expedition-gold/80">{'->'}</span>
              <span className="truncate text-expedition-goldbright">{transition.to}</span>
            </div>
            <p className="mt-3 max-w-[34rem] text-[14px] leading-relaxed text-expedition-parchment/86 sm:text-[15px]">
              {copy}
            </p>
          </div>

          <div className="border-t border-expedition-brass/35 pt-4">
            <div className="mb-2 flex items-end justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-expedition-gold/80">Preparing local map</span>
              <span className="font-mono text-[12px] text-expedition-goldbright">{progress}%</span>
            </div>
            <ProgressBar progress={progress} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-expedition-faded">
              <span>Terrain</span>
              <span>Wildlife</span>
              <span>Route markers</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
