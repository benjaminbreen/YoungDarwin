'use client';

import React from 'react';
import { getThreeSpecimens } from '../three-game/data';
import { useThreeGameStore } from '../three-game/store';
import { getZone } from '../three-game/world/floreanaZones';

export function LocalMap() {
  const collected = useThreeGameStore(state => state.collectedSpecimenIds);
  const selected = useThreeGameStore(state => state.selectedSpecimenId);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);
  const specimens = getThreeSpecimens(currentZoneId);
  const markerPercent = value => `${value.toFixed(3)}%`;

  return (
    <div className="pointer-events-auto h-28 w-28 rounded-full border border-white/25 bg-[#6fa2c7]/80 p-2 text-amber-50 shadow-xl backdrop-blur-md sm:h-32 sm:w-32">
      <div className="relative h-full w-full overflow-hidden rounded-full bg-[#6f7f4b] shadow-inner">
        <div className="absolute inset-x-7 top-1 h-[6.25rem] rounded-[48%_52%_44%_56%] bg-[#4f6138]" />
        <div className="absolute bottom-1 left-5 h-8 w-24 rounded-[55%] bg-[#b4935f]/90" />
        <div className="absolute bottom-0 left-8 h-9 w-14 rounded-t-full bg-[#4f9caf]/75" />
        <div className="absolute left-1/2 top-1 text-[8px] font-bold uppercase tracking-wide text-white/75">{zone.shortName}</div>
        {specimens.map(specimen => {
          const [x, , z] = specimen.spawnPoint;
          const isCollected = collected.includes(specimen.id);
          return (
            <span
              key={specimen.id}
              className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                selected === specimen.id ? 'border-stone-950 bg-amber-200' : isCollected ? 'border-emerald-900 bg-emerald-300' : 'border-white bg-red-400'
              }`}
              style={{ left: markerPercent(50 + x * 1.1), top: markerPercent(55 + z * 1.1) }}
              title={specimen.name}
            />
          );
        })}
      </div>
    </div>
  );
}
