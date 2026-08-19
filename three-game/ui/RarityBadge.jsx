'use client';

import React from 'react';
import { getSpecimenRarity } from '../rarity';

// The one rarity pill, used by the world specimen prompt, examine header,
// sighting toast, celebration card, debrief, and specimen case. Common stays
// quiet; the higher tiers carry a soft glow in their color.

const SIZE_CLASSES = {
  xs: 'gap-1 px-2 py-0.5 text-[9px] tracking-[0.14em]',
  md: 'gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.18em]',
};

const DIAMOND_CLASSES = {
  xs: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
};

export function RarityBadge({ specimen, rarity: rarityProp, size = 'xs', animate = false, className = '' }) {
  const rarity = rarityProp || getSpecimenRarity(specimen);
  const quiet = rarity.id === 'common' && !animate;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-sans font-bold uppercase ${SIZE_CLASSES[size] || SIZE_CLASSES.xs} ${animate ? 'animate-collect-chip motion-reduce:animate-none' : ''} ${className}`}
      style={{
        color: rarity.color,
        borderColor: quiet ? `${rarity.color}55` : rarity.ring,
        background: quiet ? 'transparent' : `linear-gradient(180deg, ${rarity.color}22, ${rarity.color}0d)`,
        boxShadow: quiet ? 'none' : `0 0 ${animate ? 12 : 8}px ${rarity.glow}`,
      }}
    >
      <span className={`${DIAMOND_CLASSES[size] || DIAMOND_CLASSES.xs} rotate-45`} style={{ background: rarity.color }} />
      {rarity.label}
    </span>
  );
}
