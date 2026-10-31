'use client';

import React from 'react';
import { HABITAT_LABELS, habitatForZone } from '../three-game/examine/populationTraits';
import { SketchPortrait } from '../three-game/ui/expedition/SketchPortrait';

const INK = '#302616';
const FADED = '#6a583f';
const RULE = 'rgba(60,47,30,0.28)';
const MEAN = '#8a3b1c';

function niceTicks(min, max, decimals) {
  const span = max - min || 1;
  const step = 10 ** Math.floor(Math.log10(span / 3));
  const factor = [1, 2, 5, 10].find(f => span / (step * f) <= 5) || 10;
  const size = step * factor;
  const ticks = [];
  for (let value = Math.ceil(min / size) * size; value <= max + 1e-9; value += size) {
    ticks.push(Number(value.toFixed(Math.max(decimals, 0))));
  }
  return ticks;
}

// One trait across every landing it was measured at: a row per landing with a
// tick for each reading and a bar at the mean, all on one scale, so whether
// the landings differ reads as whether the clusters overlap.
function TraitStrip({ trait, landings }) {
  const all = landings.flatMap(landing => landing.values);
  const pad = Math.max(trait.error * 2, (Math.max(...all) - Math.min(...all)) * 0.12, 10 ** -trait.decimals);
  const min = Math.min(...all) - pad;
  const max = Math.max(...all) + pad;
  const width = 520;
  const labelWidth = 150;
  const rowHeight = 30;
  const top = 8;
  const height = top + landings.length * rowHeight + 26;
  const x = value => labelWidth + ((value - min) / (max - min)) * (width - labelWidth - 14);
  const ticks = niceTicks(min, max, trait.decimals);
  const thin = landings.every(landing => landing.individuals < 2);

  return (
    <figure className="mb-[3cqh]">
      <figcaption className="mb-1 font-handwriting text-[clamp(15px,2.6cqh,20px)] text-[#3c2f1e]">
        {trait.label} <span className="text-[0.75em] text-[#6a583f]">({trait.unit}, by {trait.instrument})</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${trait.label} by landing`}>
        {ticks.map(value => (
          <g key={value}>
            <line x1={x(value)} x2={x(value)} y1={top - 2} y2={height - 20} stroke={RULE} strokeWidth="1" strokeDasharray="2 4" />
            <text x={x(value)} y={height - 6} textAnchor="middle" fontSize="11" fill={FADED}>{value}</text>
          </g>
        ))}
        {landings.map((landing, index) => {
          const y = top + index * rowHeight + rowHeight / 2;
          return (
            <g key={landing.location}>
              <text x="0" y={y - 2} fontSize="13" fill={INK}>{landing.location}</text>
              <text x="0" y={y + 11} fontSize="10" fill={FADED}>
                {HABITAT_LABELS[habitatForZone(landing.zoneId)]} · {landing.individuals} {landing.individuals === 1 ? 'animal' : 'animals'}
              </text>
              {landing.individuals > 1 && (
                <line x1={x(landing.min)} x2={x(landing.max)} y1={y} y2={y} stroke={RULE} strokeWidth="2" />
              )}
              {landing.values.map((value, valueIndex) => (
                <line
                  key={valueIndex}
                  x1={x(value)}
                  x2={x(value)}
                  y1={y - 6}
                  y2={y + 6}
                  stroke={INK}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ))}
              <circle cx={x(landing.mean)} cy={y} r="3.4" fill="none" stroke={MEAN} strokeWidth="1.6">
                <title>{`Mean ${landing.mean.toFixed(trait.decimals + 1)} ${trait.unit}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {thin && (
        <p className="mt-0.5 font-handwriting text-[clamp(12px,2cqh,15px)] italic text-[#6a583f]">
          One animal at each place. A single animal cannot speak for its landing.
        </p>
      )}
    </figure>
  );
}

export function MeasurementPage({ entry }) {
  const { specimen, summary } = entry;
  const landings = new Set(summary.traits.flatMap(item => item.landings.map(landing => landing.location)));
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
              {specimen?.name || summary.specimenId}: measurements
            </div>
            <div className="mt-1 font-handwriting text-[clamp(12px,2.2cqh,16px)] leading-tight text-[#4a3a24]">
              {landings.size} {landings.size === 1 ? 'place' : 'places'} · ticks are single readings, rings the mean
            </div>
          </div>
          {specimen && (
            <div className="h-[clamp(3rem,10cqh,5rem)] w-[clamp(4rem,14cqw,7rem)] shrink-0 mix-blend-multiply" style={{ filter: 'sepia(0.5)' }}>
              <SketchPortrait specimen={specimen} className="h-full w-full object-contain" />
            </div>
          )}
        </div>
        <div className="mt-[2.5cqh] min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:#8a7351_transparent]">
          {summary.traits.map(({ trait, landings: rows }) => (
            <TraitStrip key={trait.id} trait={trait} landings={rows} />
          ))}
          {landings.size < 2 && (
            <p className="font-journal text-[clamp(15px,2.5cqh,19px)] italic text-[#4a3a24]">
              Measured at one place only. The same creature measured at another landing is what would show whether the two differ.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
