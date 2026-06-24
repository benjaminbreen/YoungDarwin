'use client';

import React from 'react';

// Shared chrome for the Victorian expedition HUD: near-black panels framed in
// brass, with filigree corner ornaments. Every HUD surface should wrap itself
// in <ExpeditionPanel> so the whole interface reads as one instrument.

export const PANEL_BG =
  'backdrop-blur-md';
export const PANEL_TEXT = 'font-expedition text-expedition-parchment';
export const GOLD_LABEL =
  'text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold';
export const GOLD_BUTTON =
  'rounded-sm border border-expedition-brass/70 bg-expedition-gold/10 px-2.5 py-1.5 text-xs font-semibold tracking-[0.08em] text-expedition-goldbright transition hover:border-expedition-gold hover:bg-expedition-gold/25 focus:outline-none focus:ring-1 focus:ring-expedition-gold/60';
export const GOLD_BUTTON_SOLID =
  'rounded-sm border border-expedition-gold bg-expedition-gold px-3 py-1.5 text-xs font-bold tracking-[0.08em] text-expedition-ink transition hover:bg-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-goldbright';

const PANEL_VARIANTS = {
  hud: {
    ornate: true,
    border: 'border-expedition-brass/75',
    shadow: 'shadow-[0_16px_38px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(227,197,133,0.15)]',
    background: 'linear-gradient(165deg, rgba(27,37,48,0.70), rgba(20,28,38,0.74) 58%, rgba(11,16,23,0.80))',
  },
  objective: {
    ornate: false,
    border: 'border-expedition-brass/45',
    shadow: 'shadow-[0_9px_24px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(227,197,133,0.10)]',
    background: 'linear-gradient(165deg, rgba(27,37,48,0.40), rgba(20,28,38,0.44) 58%, rgba(11,16,23,0.54))',
  },
  modal: {
    ornate: true,
    border: 'border-expedition-brass/80',
    shadow: 'shadow-[0_18px_46px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(227,197,133,0.20)]',
    background: 'linear-gradient(165deg, rgba(27,37,48,0.84), rgba(20,28,38,0.88) 58%, rgba(11,16,23,0.94))',
  },
};

function CornerOrnament({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`pointer-events-none absolute h-4 w-4 text-expedition-gold/75 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M1.5 13 L1.5 1.5 L13 1.5" />
      <path d="M4.5 8.5 L4.5 4.5 L8.5 4.5" opacity="0.65" />
      <circle cx="11.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" opacity="0.8" />
    </svg>
  );
}

export function ExpeditionPanel({
  className = '',
  innerClassName = '',
  children,
  interactive = true,
  variant = 'hud',
  ornate,
  background,
}) {
  const panelVariant = PANEL_VARIANTS[variant] || PANEL_VARIANTS.hud;
  const showOrnaments = ornate ?? panelVariant.ornate;
  const panelBackground = background || panelVariant.background;

  return (
    <div
      className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} relative rounded-md border ${panelVariant.border} ${PANEL_BG} ${PANEL_TEXT} ${panelVariant.shadow} ${className}`}
      style={{
        background: panelBackground,
      }}
    >
      {showOrnaments && (
        <>
          {/* inner hairline keeps the brass frame reading as bevelled metal */}
          <div className={`pointer-events-none absolute inset-[3px] rounded-[3px] border border-expedition-gold/25`} />
          <CornerOrnament className="left-[1px] top-[1px]" />
          <CornerOrnament className="right-[1px] top-[1px] rotate-90" />
          <CornerOrnament className="bottom-[1px] right-[1px] rotate-180" />
          <CornerOrnament className="bottom-[1px] left-[1px] -rotate-90" />
        </>
      )}
      <div className={`relative ${innerClassName}`}>{children}</div>
    </div>
  );
}

export function PanelTabs({ tabs, active, onSelect, className = '' }) {
  return (
    <div className={`flex items-stretch gap-0.5 border-b border-expedition-brass/60 ${className}`}>
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition focus:outline-none ${
              isActive
                ? 'rounded-t-sm border border-b-0 border-expedition-gold/70 bg-expedition-gold/15 text-expedition-goldbright shadow-[inset_0_1px_0_rgba(227,197,133,0.25),inset_0_-2px_0_rgba(227,197,133,0.85)]'
                : 'text-expedition-faded hover:text-expedition-parchment'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function GoldDivider({ className = '' }) {
  return (
    <div className={`h-px bg-[linear-gradient(90deg,transparent,rgba(201,163,95,0.55),transparent)] ${className}`} />
  );
}
