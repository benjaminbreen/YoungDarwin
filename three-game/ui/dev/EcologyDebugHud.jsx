'use client';

import React, { useMemo } from 'react';
import { getRegionDeveloperLabel } from '../../../game-core/regionMaps';
import { getEcology } from '../../world/ecology';
import { useEcologyDebugState } from '../../world/ecology/ecologyDebugRuntime';
import { useThreeGameStore } from '../../store';

function topRejections(diagnostic) {
  return Object.entries(diagnostic?.rejectionCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

export function EcologyDebugHud() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const { enabled, speciesId } = useEcologyDebugState();
  const diagnostic = useMemo(() => {
    if (!enabled) return null;
    const ecology = getEcology(currentZoneId);
    return ecology?.proceduralFloraDiagnostics?.find(item => item?.speciesId === speciesId) || null;
  }, [currentZoneId, enabled, speciesId]);

  if (!enabled) return null;
  const placement = diagnostic?.placementStats;
  const budget = diagnostic?.densityBudget;
  const rejectionTotal = diagnostic ? diagnostic.sampleCount - diagnostic.suitableCount : 0;

  return (
    <aside className="pointer-events-none fixed bottom-24 right-4 z-[55] w-[min(22rem,calc(100vw-2rem))] rounded-sm border border-expedition-brass/70 bg-[#111927]/90 px-3 py-2.5 text-expedition-parchment shadow-xl backdrop-blur-sm">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-expedition-gold">
        Ecology suitability · 9 to hide
      </div>
      <div className="mt-1 font-expedition text-sm font-semibold">
        {diagnostic?.label || speciesId}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wide text-expedition-faded">
        {getRegionDeveloperLabel(currentZoneId)}
        {diagnostic?.lifeStage ? ` · ${diagnostic.lifeStage}` : ''}
        {diagnostic?.placementMode ? ` · ${diagnostic.placementMode}` : ''}
      </div>
      {diagnostic ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[9px]">
            <div><span className="text-[#69dc82]">{diagnostic.suitableCount}</span> / {diagnostic.sampleCount}<br /><span className="text-expedition-faded">grid suitable</span></div>
            <div><span className="text-expedition-goldbright">{placement?.generatedCount || 0}</span> / {placement?.requestedCount || 0}<br /><span className="text-expedition-faded">placed</span></div>
            <div>{budget?.targetCount ?? placement?.requestedCount ?? 0}<br /><span className="text-expedition-faded">map budget</span></div>
          </div>
          {budget && (
            <div className="mt-1 font-mono text-[9px] text-expedition-faded">
              {budget.existingCount} authored · {budget.proceduralCount} procedural requested · {budget.densityPerHectare}/ha cap
            </div>
          )}
          <div className="mt-2 border-t border-expedition-brass/30 pt-1.5 font-mono text-[9px] text-expedition-faded">
            <div className="mb-1 text-expedition-parchment">Rejections ({rejectionTotal})</div>
            {topRejections(diagnostic).map(([reason, count]) => (
              <div key={reason} className="flex justify-between gap-3"><span>{reason}</span><span>{count}</span></div>
            ))}
            {rejectionTotal === 0 && <div>none</div>}
          </div>
          <div className="mt-2 font-expedition text-[10px] italic text-expedition-faded">
            green = suitable · colored = rejected · gold rings = patch centers · pale spikes = generated plants
          </div>
        </>
      ) : (
        <div className="mt-2 font-expedition text-xs text-expedition-faded">
          This map has no diagnostic data for the selected species. Choose another species in the flora browser (0).
        </div>
      )}
    </aside>
  );
}
