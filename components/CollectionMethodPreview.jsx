'use client';

import React from 'react';
import { previewCollectionMethod } from '../utils/expeditionSystems';

function percent(value = 0) {
  return `${Math.round(value * 100)}%`;
}

function ratingClass(rating) {
  if (rating === 'Strong') return 'bg-green-50 text-green-800 border-green-200';
  if (rating === 'Workable') return 'bg-blue-50 text-blue-800 border-blue-200';
  if (rating === 'Risky') return 'bg-amber-50 text-amber-900 border-amber-300';
  return 'bg-red-50 text-red-800 border-red-200';
}

export default function CollectionMethodPreview({
  specimen,
  method,
  approach = '',
  location,
  fatigue = 0,
  gameTime = 0,
  seed = 'young-darwin',
}) {
  if (!specimen || !method) return null;

  const preview = previewCollectionMethod({
    specimen,
    method,
    approach,
    location,
    fatigue,
    gameTime,
    seed,
  });

  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-white/90 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-amber-950">{method.name} suitability</div>
          <div className="text-xs text-gray-600 capitalize">{preview.category.replace('_', ' ')} specimen</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${ratingClass(preview.rating)}`}>
          {preview.rating}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded border border-amber-100 bg-amber-50 p-2">
          <div className="font-mono text-sm text-amber-950">{percent(preview.fit)}</div>
          <div className="text-gray-600">method fit</div>
        </div>
        <div className="rounded border border-amber-100 bg-amber-50 p-2">
          <div className="font-mono text-sm text-amber-950">{percent(preview.chance)}</div>
          <div className="text-gray-600">field chance</div>
        </div>
        <div className="rounded border border-amber-100 bg-amber-50 p-2">
          <div className="font-mono text-sm text-amber-950">{percent(preview.damage)}</div>
          <div className="text-gray-600">damage risk</div>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-700">{preview.advice}</p>
      {preview.cautions.length > 0 && (
        <p className="mt-1 text-xs text-amber-800">
          Watch for: {preview.cautions.join('; ')}.
        </p>
      )}
    </div>
  );
}
