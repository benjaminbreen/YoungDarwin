'use client';

import React from 'react';
import { SketchPortrait } from '../three-game/ui/expedition/SketchPortrait';
import { formatClock, speciesName } from '../three-game/fauna/behavior/fieldObservations';

const INK = '#302616';
const FADED = '#6a583f';
const RULE = 'rgba(60,47,30,0.28)';
const MARK = '#8a3b1c';
// The strip spans the working day; anything seen outside it is pinned to
// the ends.
const DAY_START = 5;
const DAY_END = 20;

// When in the day a behaviour was seen: a tick per sighting on a dawn-to-dusk
// rule, so song bunched in the early morning or lizards in shade at noon
// shows as a cluster.
function HourStrip({ hours }) {
  const width = 300;
  const height = 22;
  const x = hour => 6 + ((Math.min(DAY_END, Math.max(DAY_START, hour)) - DAY_START) / (DAY_END - DAY_START)) * (width - 12);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[22px] w-full max-w-[300px]" role="img" aria-label="Hours of the day it was seen">
      <line x1="6" x2={width - 6} y1="9" y2="9" stroke={RULE} strokeWidth="1" />
      {[6, 9, 12, 15, 18].map(hour => (
        <g key={hour}>
          <line x1={x(hour)} x2={x(hour)} y1="5" y2="13" stroke={RULE} strokeWidth="1" />
          <text x={x(hour)} y="21" textAnchor="middle" fontSize="7.5" fill={FADED}>{hour === 12 ? 'noon' : `${hour}h`}</text>
        </g>
      ))}
      {hours.map((hour, index) => (
        <line key={index} x1={x(hour)} x2={x(hour)} y1="3" y2="15" stroke={MARK} strokeWidth="1.6" strokeLinecap="round">
          <title>{formatClock(hour)}</title>
        </line>
      ))}
    </svg>
  );
}

function BehaviourEntry({ seen }) {
  const partners = seen.partners.filter(id => id !== 'darwin').map(speciesName);
  const withDarwin = seen.partners.includes('darwin');
  return (
    <li className="mb-[2.4cqh] border-b border-[#3c2f1e]/15 pb-[1.6cqh]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-handwriting text-[clamp(15px,2.6cqh,20px)] text-[#3c2f1e]">
          {seen.label.charAt(0).toUpperCase() + seen.label.slice(1)}
        </span>
        <span className="shrink-0 font-handwriting text-[clamp(11px,1.9cqh,14px)] text-[#6a583f]">
          {seen.count} {seen.count === 1 ? 'time' : 'times'} · {seen.individuals} {seen.individuals === 1 ? 'animal' : 'animals'}
        </span>
      </div>
      {seen.note && (
        <p className="mt-0.5 font-journal text-[clamp(13px,2.2cqh,16px)] italic leading-snug text-[#4a3a24]">{seen.note}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 font-handwriting text-[clamp(11px,1.9cqh,14px)] text-[#6a583f]">
        <span>{seen.places.join(', ') || 'place not noted'}{seen.habitats.length ? ` (${seen.habitats.join(', ')})` : ''}</span>
        {(partners.length > 0 || withDarwin) && (
          <span style={{ color: INK }}>
            with {[...partners, ...(withDarwin ? ['yourself'] : [])].join(', ')}
          </span>
        )}
      </div>
      <HourStrip hours={seen.hours} />
    </li>
  );
}

export function ObservationPage({ entry }) {
  const { specimen, summary } = entry;
  const ordered = [...summary.seen].sort((a, b) => (b.interaction - a.interaction) || (b.count - a.count));
  return (
    <section key={entry.key} className="journal-page-turn journal-parchment journal-page-size text-[#3c2f1e]">
      <div
        className="relative flex h-full min-h-0 flex-col"
        style={{
          padding:
            'clamp(1.1rem, 4.5cqh, 2.4rem) clamp(1.2rem, 4cqw, 2.8rem) clamp(0.9rem, 3cqh, 1.9rem) clamp(1.7rem, 6cqw, 3.6rem)',
        }}
      >
        <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[#3c2f1e]/40 pb-1.5">
          <div className="min-w-0">
            <div className="truncate font-handwriting text-[clamp(17px,3.4cqh,26px)] leading-tight">
              {specimen?.name || summary.name}: habits
            </div>
            <div className="mt-1 font-handwriting text-[clamp(12px,2.2cqh,16px)] leading-tight text-[#4a3a24]">
              {summary.seen.length} of {summary.knownCount} kinds of behaviour watched
              {summary.unseenCount > 0 ? ` · ${summary.unseenCount} not yet seen` : ' · all seen'}
            </div>
          </div>
          {specimen && (
            <div className="h-[clamp(3rem,10cqh,5rem)] w-[clamp(4rem,14cqw,7rem)] shrink-0 mix-blend-multiply" style={{ filter: 'sepia(0.5)' }}>
              <SketchPortrait specimen={specimen} className="h-full w-full object-contain" />
            </div>
          )}
        </div>
        <ul className="mt-[2.5cqh] min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:#8a7351_transparent]">
          {ordered.map(seen => <BehaviourEntry key={seen.behaviorId} seen={seen} />)}
        </ul>
        {summary.unseenCount > 0 && (
          <p className="shrink-0 pt-1 font-journal text-[clamp(12px,2cqh,15px)] italic text-[#6a583f]">
            Animals keep their habits for their hours and their neighbours. Watch at other times of day, and where others of their kind are about.
          </p>
        )}
      </div>
    </section>
  );
}
