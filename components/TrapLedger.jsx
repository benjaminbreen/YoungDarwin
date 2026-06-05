'use client';

import React from 'react';
import { getTrapReadiness } from '../utils/expeditionSystems';
import { resolveSpecimen } from '../utils/canonicalIds';

function formatMinutes(minutes = 0) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function statusStyle(status, ready) {
  if (status === 'successful') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'failed') return 'bg-stone-100 text-stone-700 border-stone-200';
  if (status === 'abandoned') return 'bg-gray-100 text-gray-600 border-gray-200';
  if (ready) return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-blue-50 text-blue-800 border-blue-200';
}

export default function TrapLedger({
  traps = [],
  specimenList = [],
  locations = [],
  tools = [],
  currentLocationId = '',
  gameTime = 0,
  daysPassed = null,
  onCheckTrap,
  onAbandonTrap,
}) {
  if (!traps.length) return null;

  const activeTraps = traps.filter(trap => trap.status === 'set');
  const recentResolved = traps
    .filter(trap => trap.status !== 'set')
    .slice(-2)
    .reverse();
  const shownTraps = [...activeTraps, ...recentResolved];
  if (!shownTraps.length) return null;

  return (
    <div className="darwin-panel p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-darwin-dark text-xl font-serif">Trap Ledger</h3>
        {activeTraps.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-amber-200 bg-white/85 text-amber-900">
            {activeTraps.length} active
          </span>
        )}
      </div>

      <div className="space-y-2">
        {shownTraps.map(trap => {
          const target = resolveSpecimen(specimenList, trap.targetSpecimenId);
          const location = locations.find(item => item.id === trap.locationId);
          const method = tools.find(item => item.id === trap.methodId);
          const readiness = getTrapReadiness(trap, gameTime, daysPassed);
          const isHere = trap.locationId === currentLocationId;
          const canAct = trap.status === 'set' && isHere;
          const label = trap.status === 'set'
            ? readiness.ready ? 'Ready' : `${formatMinutes(readiness.remainingMinutes)} left`
            : trap.status;

          return (
            <div key={trap.id} className="rounded-md border border-amber-200 bg-white/85 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950 truncate">
                    {target?.name || trap.targetSpecimenId}
                  </p>
                  <p className="text-xs text-gray-600">
                    {method?.name || trap.methodId} at {location?.name || trap.locationId}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border capitalize ${statusStyle(trap.status, readiness.ready)}`}>
                  {label}
                </span>
              </div>

              <p className="mt-1 text-xs text-gray-700 line-clamp-2">
                {trap.placement || 'No placement notes recorded.'}
              </p>

              {trap.status === 'set' && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className={isHere ? 'text-green-700' : 'text-gray-500'}>
                    {isHere ? 'You are at this site' : 'Travel there to resolve'}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onCheckTrap?.(trap.id)}
                      disabled={!canAct}
                      className="px-2 py-1 rounded border border-stone-300 bg-stone-700 text-white disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed"
                    >
                      Check
                    </button>
                    <button
                      type="button"
                      onClick={() => onAbandonTrap?.(trap.id)}
                      disabled={!canAct}
                      className="px-2 py-1 rounded border border-amber-300 bg-white text-amber-900 disabled:text-stone-400 disabled:border-stone-200 disabled:cursor-not-allowed"
                    >
                      Abandon
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
