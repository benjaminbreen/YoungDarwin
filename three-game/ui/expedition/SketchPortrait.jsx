'use client';

import React, { useEffect, useState } from 'react';

// Hand-drawn specimen portraits live in /public/assets/journal/portraits/
// named <specimenId>.png (e.g. lavalizard.png, marineiguana.png). Until a
// portrait exists, we fall back to the specimen's photo run through a
// sepia "sketch" filter so the journal still reads as period-appropriate.

const PORTRAIT_ROOT = '/assets/journal/portraits';

export function portraitSrc(specimenId) {
  return specimenId ? `${PORTRAIT_ROOT}/${specimenId}.png` : null;
}

const SKETCH_FILTER = 'grayscale(1) sepia(0.55) contrast(1.18) brightness(0.85)';

export function SketchPortrait({ specimen, className = 'h-full w-full object-cover', alt = '' }) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  useEffect(() => setPortraitFailed(false), [specimen?.id]);

  const portrait = portraitFailed ? null : portraitSrc(specimen?.id);
  const src = portrait || specimen?.image;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={className}
      style={portrait ? undefined : { filter: SKETCH_FILTER }}
      onError={portrait ? () => setPortraitFailed(true) : undefined}
    />
  );
}
