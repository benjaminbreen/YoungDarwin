'use client';

import React from 'react';
import { useDismissableOverlay } from '../useDismissableOverlay';

// Full-screen modal chrome for the expedition UI: dimmed scrim, near-black
// panel framed by a single gold border, and an ornate centered header
// (rule — diamond — TITLE — diamond — rule, with an italic subtitle).
// Wrap any large expedition modal (journal, map, inventory) in this so they
// all read as one instrument.

export function ExpeditionModalHeader({ title, subtitle, onClose }) {
  return (
    <header className="relative flex shrink-0 items-start justify-center px-12 py-2 text-center sm:px-14 sm:py-2.5">
      <div className="min-w-0">
        <div className="flex items-center justify-center gap-4">
          <span className="hidden h-px w-16 bg-[linear-gradient(90deg,transparent,rgba(139,109,63,0.65))] sm:block" />
          <span className="hidden h-[4px] w-[4px] rotate-45 border border-[#6d542f] sm:block" />
          <h2 className="truncate text-[clamp(1.05rem,4vw,2.1rem)] font-medium uppercase leading-none tracking-[0.2em] text-[#e6d2b0] sm:text-[clamp(1.3rem,1.9vw,2.1rem)] sm:tracking-[0.24em]">
            {title}
          </h2>
          <span className="hidden h-[4px] w-[4px] rotate-45 border border-[#6d542f] sm:block" />
          <span className="hidden h-px w-16 bg-[linear-gradient(90deg,rgba(139,109,63,0.65),transparent)] sm:block" />
        </div>
        {subtitle && (
          <p className="mt-1 truncate text-[0.78rem] italic text-[#c4a77b] sm:text-[clamp(0.8rem,0.95vw,1.05rem)]">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${title}`}
        className="absolute right-2.5 top-2 flex h-10 w-10 items-center justify-center rounded-[2px] border border-[#5a4327] bg-black/20 text-2xl text-[#b7894c] transition hover:border-[#8a6d3f] hover:text-[#e3c585] sm:right-4 sm:top-3"
      >
        ×
      </button>
    </header>
  );
}

export function ExpeditionModal({ title, subtitle, onClose, children, className = '', width = 'min(120rem, 98vw)' }) {
  const panelRef = useDismissableOverlay(true, onClose);
  return (
    // h-[100dvh] rather than inset-0 alone: on mobile Safari the layout viewport
    // is the *large* viewport, so a 96vh panel centred in it hangs its header
    // above the visible fold behind the URL bar.
    <div
      className="expedition-modal-scrim pointer-events-auto fixed inset-x-0 top-0 z-30 flex h-[100dvh] items-center justify-center bg-[#080705]/92 p-2 font-expedition text-[#ead3ae] backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`expedition-modal-panel relative grid h-[min(67rem,100%)] max-h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[3px] border border-[#5d482d] bg-[#0d0c0a] shadow-[0_30px_90px_rgba(0,0,0,0.82)] focus:outline-none ${className}`}
        style={{
          width,
          backgroundImage:
            'radial-gradient(circle at 55% 10%, rgba(109,84,47,0.10), transparent 28%), linear-gradient(150deg, #0d0c0a, #050604 58%, #0b0907)',
        }}
        onClick={event => event.stopPropagation()}
      >
        <ExpeditionModalHeader title={title} subtitle={subtitle} onClose={onClose} />
        {children}
      </div>
    </div>
  );
}
