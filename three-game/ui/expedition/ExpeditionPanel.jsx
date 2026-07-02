'use client';

import React from 'react';

// Shared chrome for the Victorian expedition HUD: translucent deep-navy panels
// framed in a bright double gold line, with filigree corner ornaments. Every
// HUD surface should wrap itself in <ExpeditionPanel> so the whole interface
// reads as one instrument.

export const PANEL_BG =
  'backdrop-blur-md';
export const PANEL_TEXT = 'font-expedition text-expedition-parchment';
export const GOLD_LABEL =
  'text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]';
export const GOLD_BUTTON =
  'rounded-sm border border-expedition-gold/70 bg-expedition-gold/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-expedition-goldbright transition hover:border-expedition-gold hover:bg-expedition-gold/25 focus:outline-none focus:ring-1 focus:ring-expedition-gold/60';
export const GOLD_BUTTON_SOLID =
  'rounded-sm border border-expedition-gold bg-expedition-gold px-3 py-1.5 text-xs font-bold tracking-[0.08em] text-expedition-ink transition hover:bg-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-goldbright';

const PANEL_VARIANTS = {
  hud: {
    ornate: true,
    border: 'border-expedition-gold/80',
    shadow: 'shadow-[0_18px_44px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(227,197,133,0.18)]',
    background: 'linear-gradient(165deg, rgba(23,34,56,0.70), rgba(16,26,45,0.75) 58%, rgba(8,14,27,0.82))',
  },
  objective: {
    ornate: true,
    border: 'border-expedition-gold/70',
    shadow: 'shadow-[0_12px_30px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(227,197,133,0.14)]',
    background: 'linear-gradient(165deg, rgba(23,34,56,0.58), rgba(16,26,45,0.63) 58%, rgba(8,14,27,0.72))',
  },
  modal: {
    ornate: true,
    border: 'border-expedition-gold/85',
    shadow: 'shadow-[0_18px_46px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(227,197,133,0.20)]',
    background: 'linear-gradient(165deg, rgba(23,34,56,0.86), rgba(16,26,45,0.90) 58%, rgba(8,14,27,0.95))',
  },
};

function CornerOrnament({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`pointer-events-none absolute h-5 w-5 text-expedition-goldbright/90 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M1.5 13 L1.5 1.5 L13 1.5" />
      <path d="M4.5 8.5 L4.5 4.5 L8.5 4.5" opacity="0.7" />
      <circle cx="11.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" opacity="0.85" />
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
          {/* inner hairline completes the double gold frame */}
          <div className={`pointer-events-none absolute inset-[3px] rounded-[3px] border border-expedition-gold/45`} />
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
            className={`flex-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition focus:outline-none ${
              isActive
                ? 'rounded-sm border border-expedition-gold/80 bg-expedition-gold/18 text-expedition-goldbright shadow-[inset_0_1px_0_rgba(227,197,133,0.3),0_0_10px_rgba(227,197,133,0.15)]'
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
