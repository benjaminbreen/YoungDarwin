'use client';

import React from 'react';

// Engraved-style line icons for the expedition HUD. All stroke-based and
// currentColor so they pick up the brass/parchment palette and stay crisp at
// any pixel ratio (no emoji, no raster assets).

function Svg({ children, className = '', viewBox = '0 0 24 24', strokeWidth = 1.5 }) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function CompassRoseIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.3}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6.4" opacity="0.55" />
      <path d="M12 4.2 L13.6 10.4 L19.8 12 L13.6 13.6 L12 19.8 L10.4 13.6 L4.2 12 L10.4 10.4 Z" fill="currentColor" fillOpacity="0.22" />
      <path d="M12 6.8 L12.9 11.1 L17.2 12 L12.9 12.9 L12 17.2 L11.1 12.9 L6.8 12 L11.1 11.1 Z" fill="currentColor" fillOpacity="0.7" stroke="none" />
    </Svg>
  );
}

export function HeartIcon({ className = '' }) {
  return (
    <Svg className={className}>
      <path d="M12 19.6 C7.2 16 4 13 4 9.4 C4 6.9 5.9 5 8.2 5 C9.7 5 11.1 5.8 12 7.1 C12.9 5.8 14.3 5 15.8 5 C18.1 5 20 6.9 20 9.4 C20 13 16.8 16 12 19.6 Z" />
      <path d="M8 9.2 C8.4 7.9 9.6 7.2 10.4 7.4" opacity="0.6" />
    </Svg>
  );
}

export function FatigueIcon({ className = '' }) {
  // An hourglass — period-appropriate for weariness.
  return (
    <Svg className={className}>
      <path d="M7 3.5 H17 M7 20.5 H17" />
      <path d="M8 3.5 C8 8 11 9.5 12 12 C13 9.5 16 8 16 3.5" />
      <path d="M8 20.5 C8 16 11 14.5 12 12 C13 14.5 16 16 16 20.5" />
      <path d="M10.2 18.5 C10.8 16.8 13.2 16.8 13.8 18.5 Z" fill="currentColor" stroke="none" opacity="0.7" />
    </Svg>
  );
}

export function CuriosityIcon({ className = '' }) {
  // A radiant eye — observation and wonder.
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M3.5 12 C6 7.8 9 6 12 6 C15 6 18 7.8 20.5 12 C18 16.2 15 18 12 18 C9 18 6 16.2 3.5 12 Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" fillOpacity="0.55" />
      <path d="M12 2.4 V4.2 M12 19.8 V21.6 M2.6 12 H1.2 M22.8 12 H21.4" opacity="0.65" />
    </Svg>
  );
}

export function ButterflyIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.3}>
      <path d="M12 7 V18" />
      <path d="M12 9 C9.8 5.4 5.6 4.4 4.4 6.4 C3.2 8.4 5.4 11.4 8.2 12 C5.8 12.6 4.6 15.2 6 16.8 C7.4 18.4 10.6 16.8 12 13.8" />
      <path d="M12 9 C14.2 5.4 18.4 4.4 19.6 6.4 C20.8 8.4 18.6 11.4 15.8 12 C18.2 12.6 19.4 15.2 18 16.8 C16.6 18.4 13.4 16.8 12 13.8" />
      <path d="M10.6 6.4 L9.4 4.4 M13.4 6.4 L14.6 4.4" opacity="0.7" />
    </Svg>
  );
}

export function NoteIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M6 3.5 H18 V20.5 H6 Z" />
      <path d="M9 8 H15 M9 11.5 H15 M9 15 H13" opacity="0.75" />
    </Svg>
  );
}

export function DocumentIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M7 3.5 H14.5 L18.5 7.5 V20.5 H7 Z" />
      <path d="M14.5 3.5 V7.5 H18.5" />
      <path d="M9.5 12 H16 M9.5 15.5 H16" opacity="0.75" />
    </Svg>
  );
}

export function OpenBookIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M12 6 C10 4.4 7 4 3.5 4.6 V18.6 C7 18 10 18.5 12 20 C14 18.5 17 18 20.5 18.6 V4.6 C17 4 14 4.4 12 6 Z" />
      <path d="M12 6 V20" opacity="0.7" />
      <path d="M6 8.5 C7.6 8.2 9.2 8.4 10.3 8.9 M6 12 C7.6 11.7 9.2 11.9 10.3 12.4 M13.7 8.9 C14.8 8.4 16.4 8.2 18 8.5 M13.7 12.4 C14.8 11.9 16.4 11.7 18 12" opacity="0.6" />
    </Svg>
  );
}

export function MapIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M3.5 6.5 L9 4.5 L15 6.5 L20.5 4.5 V17.5 L15 19.5 L9 17.5 L3.5 19.5 Z" />
      <path d="M9 4.5 V17.5 M15 6.5 V19.5" opacity="0.6" />
      <path d="M5.5 10 C7 11.5 8.5 9.5 10.5 11.5" opacity="0.6" />
    </Svg>
  );
}

export function SoundIcon({ className = '', muted = false }) {
  return (
    <Svg className={className} strokeWidth={1.5}>
      <path d="M4 10 H7.2 L11.5 6.2 V17.8 L7.2 14 H4 Z" />
      {!muted && (
        <>
          <path d="M14.2 9 C15.1 9.8 15.1 14.2 14.2 15" opacity="0.72" />
          <path d="M17 6.7 C19.4 9.4 19.4 14.6 17 17.3" />
        </>
      )}
      {muted && <path d="M14.3 9.2 L19.1 14 M19.1 9.2 L14.3 14" />}
    </Svg>
  );
}

export function NorthArrowIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.3}>
      <path d="M12 3 L15 14 H9 Z" fill="currentColor" fillOpacity="0.4" />
      <path d="M9 14 H15 L12 21 Z" opacity="0.65" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Tool icons (hotbar)

export function HandIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M8.5 11.5 V5.6 C8.5 4.8 9.1 4.2 9.9 4.2 C10.7 4.2 11.3 4.8 11.3 5.6 V10.4" />
      <path d="M11.3 10 V4.6 C11.3 3.8 11.9 3.2 12.7 3.2 C13.5 3.2 14.1 3.8 14.1 4.6 V10.2" />
      <path d="M14.1 10.2 V5.8 C14.1 5 14.7 4.4 15.5 4.4 C16.3 4.4 16.9 5 16.9 5.8 V12.6" />
      <path d="M16.9 12 C17.4 10.8 18.4 10.3 19.2 10.9 C19.9 11.4 19.9 12.4 19.3 13.6 L17 18.2 C16 20 14.4 20.9 12.4 20.9 C9.1 20.9 7.5 19.3 6.4 16.4 L4.9 12.6 C4.5 11.6 4.9 10.8 5.7 10.5 C6.5 10.2 7.3 10.6 7.7 11.5 L8.5 13.4" />
    </Svg>
  );
}

export function NetIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.3}>
      <path d="M4 21 L11 13" />
      <ellipse cx="14.8" cy="8.6" rx="5.6" ry="6" transform="rotate(38 14.8 8.6)" />
      <path d="M11.4 5.8 C13.2 7.4 16.6 9.4 19.2 10 M10.4 9.4 C12.4 11 15.6 12.6 17.8 13 M12.6 3.6 C13.4 5.6 15.4 9 17.4 11.4 M16.2 3 C16.4 5.4 17.2 8.8 18.6 11.2" opacity="0.55" />
    </Svg>
  );
}

export function JournalIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M6 4 C6 3.4 6.4 3 7 3 H17.5 C18.1 3 18.5 3.4 18.5 4 V20 C18.5 20.6 18.1 21 17.5 21 H7 C6.4 21 6 20.6 6 20 Z" />
      <path d="M8.8 3 V21" opacity="0.65" />
      <path d="M11.5 8 H16 M11.5 11 H16" opacity="0.6" />
      <path d="M18.5 7 C19.3 7.2 19.8 7.6 19.8 8.4 V19.2" opacity="0.45" />
    </Svg>
  );
}

export function HammerIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M5 7.2 L9.8 3.6 C11.4 4.8 13.4 5.2 15.4 5 L17 6.8 C15 8.6 13.6 10.6 13.2 12.8 L11.2 12 Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M10.6 11 L6 20.4 C5.7 21 4.9 21.2 4.3 20.8 C3.7 20.4 3.5 19.6 3.9 19 L9.4 10.2" />
      <path d="M16.4 13.6 L20.4 17.6 M18.4 11.6 L20.8 14" opacity="0.6" />
    </Svg>
  );
}

export function RopeIcon({ className = '' }) {
  // Coiled snare line with the running loop.
  return (
    <Svg className={className} strokeWidth={1.3}>
      <ellipse cx="11" cy="9" rx="6.5" ry="4.6" />
      <ellipse cx="11" cy="11.6" rx="6.5" ry="4.6" opacity="0.7" />
      <ellipse cx="11" cy="14.2" rx="6.5" ry="4.6" opacity="0.45" />
      <path d="M17.5 12 C19.5 13 20.5 15 19.9 17 C19.4 18.6 17.8 19.8 16 19.6" />
      <circle cx="15.2" cy="20.2" r="1.3" />
    </Svg>
  );
}

export function MusketIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M21 4.6 L8.6 14.2 L6.8 13.4 L4.6 15.2 C3.6 16 3.4 17.2 4.2 18 C4.9 18.7 6 18.7 6.9 18 L8.4 16.6 L10 17 L21.4 6.2" />
      <path d="M8.6 14.2 L10 15.6" opacity="0.7" />
      <path d="M12.4 11.2 L13.6 12.4 M11 14.8 C11.8 15.4 12.8 15.2 13.4 14.4" opacity="0.55" />
    </Svg>
  );
}

export function LensIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <circle cx="10.5" cy="10.5" r="6" />
      <circle cx="10.5" cy="10.5" r="4" opacity="0.45" />
      <path d="M15 15 L20.5 20.5" />
    </Svg>
  );
}

export function VialIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M9.5 3.5 H14.5 M10.5 3.5 V8.5 L6.5 17.5 C6 19 7 20.5 8.6 20.5 H15.4 C17 20.5 18 19 17.5 17.5 L13.5 8.5 V3.5" />
      <path d="M8.4 14 H15.6" opacity="0.65" />
    </Svg>
  );
}

export function CalipersIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <path d="M12 3 L5 20 M12 3 L19 20" />
      <path d="M7.4 14.5 C10.2 16.2 13.8 16.2 16.6 14.5" opacity="0.7" />
      <circle cx="12" cy="4.6" r="1.6" />
    </Svg>
  );
}

export function ScissorsIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.4}>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M8.4 15.6 L17 4.4 M15.6 15.6 L7 4.4" />
    </Svg>
  );
}

export function ScalesIcon({ className = '' }) {
  return (
    <Svg className={className} strokeWidth={1.3}>
      <path d="M12 4 V19 M8 20 H16" />
      <path d="M4.5 7.5 H19.5" />
      <path d="M6.5 7.5 L4 13 C4.8 14.4 8 14.4 8.9 13 L6.5 7.5 Z M17.5 7.5 L15.1 13 C16 14.4 19.2 14.4 20 13 L17.5 7.5 Z" opacity="0.75" />
    </Svg>
  );
}

export const TOOL_ICONS = {
  hands: HandIcon,
  insect_net: NetIcon,
  sketch: JournalIcon,
  hammer: HammerIcon,
  snare: RopeIcon,
  shotgun: MusketIcon,
  magnifier: LensIcon,
  sample: VialIcon,
  measure: CalipersIcon,
  dissection: ScissorsIcon,
  compare: ScalesIcon,
};
