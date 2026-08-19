'use client';

import React from 'react';
import { getSpecimenRarity, specimenImageSrc } from '../rarity';

// The circular rarity-ringed specimen avatar used by the collection
// celebration and the nightly debrief. The diamond behind the image is the
// fallback for specimens whose portrait file is missing.

export function SpecimenPortrait({ specimen, rarity: rarityProp, size = 'h-16 w-16', glow = 14, dim = false }) {
  const rarity = rarityProp || getSpecimenRarity(specimen);
  const src = specimenImageSrc(specimen);
  return (
    <span
      className={`relative block ${size} overflow-hidden rounded-full border-2`}
      style={{
        borderColor: rarity.ring,
        boxShadow: `0 0 ${glow}px ${rarity.glow}, inset 0 0 14px rgba(0,0,0,0.55)`,
        background: `radial-gradient(circle, ${rarity.color}2e 0%, #0a1220 72%)`,
      }}
    >
      <span className="absolute inset-0 grid place-items-center">
        <span className="h-4 w-4 rotate-45" style={{ background: rarity.ring, boxShadow: `0 0 10px ${rarity.glow}` }} />
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={event => { event.currentTarget.style.display = 'none'; }}
          className={`relative h-full w-full object-cover ${dim ? 'opacity-70 saturate-50' : 'sepia-[0.15]'}`}
        />
      )}
    </span>
  );
}
