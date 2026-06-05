'use client';

import React from 'react';

export default function ObjectivesPanel({ objectives = [] }) {
  if (!objectives.length) return null;

  return (
    <div className="darwin-panel p-3">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Expedition Brief</h3>
      <div className="space-y-2">
        {objectives.map(objective => {
          const progress = Math.min(objective.progress || 0, objective.target || 1);
          const target = objective.target || 1;
          const percent = Math.round((progress / target) * 100);

          return (
            <div key={objective.id} className="bg-white/80 border border-amber-200 rounded-md p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900">{objective.label}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${objective.complete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {progress}/{target}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{objective.description}</p>
              <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden mt-2">
                <div
                  className={objective.complete ? 'h-full bg-green-600' : 'h-full bg-amber-600'}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
