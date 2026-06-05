'use client';

import React from 'react';
import useGameStore from '../hooks/useGameStore';
import { buildReadinessRecommendations, evaluateExpeditionReadiness } from '../utils/expeditionSystems';

function riskLevel(fatigue = 0, gameTime = 0) {
  const hour = Math.floor((gameTime % 1440) / 60);
  if (fatigue >= 85 || hour >= 19 || hour < 5) return { label: 'High', className: 'text-red-700 bg-red-50 border-red-200' };
  if (fatigue >= 60 || hour >= 17) return { label: 'Rising', className: 'text-orange-700 bg-orange-50 border-orange-200' };
  return { label: 'Manageable', className: 'text-green-700 bg-green-50 border-green-200' };
}

export default function ExpeditionStatusPanel() {
  const {
    scientificScore,
    inventory,
    journal,
    objectives,
    fatigue,
    gameTime,
    formatGameTime,
    currentLocationId,
    traps,
  } = useGameStore();

  const readiness = evaluateExpeditionReadiness({
    inventory,
    journal,
    objectives,
    fatigue,
    currentLocationId,
    traps,
  });
  const risk = riskLevel(fatigue, gameTime);
  const recommendations = buildReadinessRecommendations({
    inventory,
    journal,
    objectives,
    fatigue,
    currentLocationId,
    traps,
    readiness,
  });

  return (
    <div className="darwin-panel p-3">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Expedition Status</h3>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border border-amber-200 bg-white/80 p-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Scientific score</div>
          <div className="font-mono text-xl font-semibold text-amber-950">{scientificScore || 0}</div>
        </div>
        <div className="rounded-md border border-amber-200 bg-white/80 p-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Objectives</div>
          <div className="font-mono text-xl font-semibold text-amber-950">
            {readiness.completedObjectives}/{readiness.totalObjectives || 0}
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-white/80 p-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Evidence notes</div>
          <div className="font-mono text-xl font-semibold text-amber-950">
            {readiness.evidenceNotes}/{readiness.fieldNotes}
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-white/80 p-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Avg. quality</div>
          <div className="font-mono text-xl font-semibold text-amber-950">
            {readiness.quality === null ? '-' : `${readiness.quality}/100`}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-white/85 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-amber-700">Henslow readiness</span>
          <span className="font-semibold text-amber-950">{readiness.verdict}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-amber-100 overflow-hidden">
          <div
            className="h-full bg-amber-700"
            style={{ width: `${readiness.readinessScore}%` }}
          />
        </div>
        {readiness.gaps.length > 0 && (
          <p className="mt-2 text-xs text-gray-700">
            Next gap: {readiness.gaps[0]}
          </p>
        )}
        {recommendations.length > 0 && (
          <div className="mt-2 space-y-1">
            {recommendations.slice(0, 2).map(item => (
              <div key={item.id} className="rounded border border-amber-100 bg-amber-50/70 px-2 py-1">
                <div className="text-xs font-semibold text-amber-950">{item.label}</div>
                <div className="text-[11px] text-gray-600">{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`mt-3 rounded-md border px-3 py-2 ${risk.className}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide">Return risk</span>
          <span className="font-semibold">{risk.label}</span>
        </div>
        <p className="mt-1 text-xs">
          {formatGameTime()} · fatigue {fatigue}/100
        </p>
      </div>
    </div>
  );
}
