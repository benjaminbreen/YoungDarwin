'use client';

import React from 'react';
import { selectDocumentableSpecimen } from '../utils/fieldworkNotes';

function objectiveChip(objectives = [], id) {
  const objective = objectives.find(item => item.id === id);
  if (!objective) return null;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${objective.complete ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
      {objective.progress || 0}/{objective.target || 1}
    </span>
  );
}

export default function FieldworkPanel({
  location,
  objectives = [],
  primaryCollectible,
  nearbySpecimenIds = [],
  specimenList = [],
  onSurveySite,
  onDocumentSpecimen,
}) {
  const documentableSpecimen = selectDocumentableSpecimen({
    primaryCollectible,
    nearbySpecimenIds,
    specimenList,
  });

  return (
    <div className="darwin-panel p-3">
      <h3 className="font-bold text-darwin-dark text-center text-xl mb-3 font-serif">Fieldwork</h3>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onSurveySite}
          disabled={!location}
          className="w-full rounded-md border border-amber-300 bg-white/90 px-3 py-2 text-left hover:bg-amber-50 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-amber-950">Survey {location?.name || 'site'}</span>
            {objectiveChip(objectives, 'survey_zones')}
          </div>
          <div className="mt-1 text-xs text-gray-600">20m · +2 fatigue</div>
        </button>

        <button
          type="button"
          onClick={() => onDocumentSpecimen?.(documentableSpecimen)}
          disabled={!documentableSpecimen}
          className="w-full rounded-md border border-amber-300 bg-white/90 px-3 py-2 text-left hover:bg-amber-50 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-amber-950">
              Document {documentableSpecimen?.name || 'specimen'}
            </span>
            {objectiveChip(objectives, 'label_specimens')}
          </div>
          <div className="mt-1 text-xs text-gray-600">15m · +1 fatigue</div>
        </button>
      </div>
    </div>
  );
}
