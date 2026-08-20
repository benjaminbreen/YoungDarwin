'use client';

import React from 'react';
import { getFieldDilemma, useThreeGameStore } from '../store';

// A field accident resolves through one of two authored choices — quick with
// a cost, or careful with a delay. One click, deterministic, impossible to
// get stuck on.

function ChoiceButton({ choice, onChoose }) {
  return (
    <button
      type="button"
      onClick={() => onChoose(choice.id)}
      className="group w-full rounded-sm border border-expedition-brass/50 bg-black/25 px-4 py-3 text-left transition hover:border-expedition-goldbright hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright/70"
    >
      <span className="block font-expedition text-[16px] font-semibold text-expedition-parchment transition group-hover:text-[#f5e5bd]">
        {choice.label}
      </span>
      <span className="mt-0.5 block font-expedition text-[12.5px] italic leading-snug text-expedition-faded">
        {choice.detail}
      </span>
    </button>
  );
}

export function FieldDilemmaModal() {
  const constraint = useThreeGameStore(state => state.activeConstraint);
  const resolveFieldDilemmaChoice = useThreeGameStore(state => state.resolveFieldDilemmaChoice);
  const dilemma = getFieldDilemma(constraint?.type);
  if (!dilemma) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-expedition-night/60 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dilemma.title}
        data-testid="field-dilemma-modal"
        className="relative w-[min(26rem,100%)] animate-collect-pop motion-reduce:animate-none rounded-[10px] border border-[#d9a05a]/60 bg-[rgba(11,19,35,0.94)] px-6 pb-5 pt-6 text-center font-expedition shadow-[0_26px_70px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md"
      >
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#d9a05a]/70 to-transparent" />
        <div className="font-sans text-[10.5px] font-bold uppercase tracking-[0.26em] text-[#d9a05a]">
          Field trouble
        </div>
        <h2 className="mt-2 text-[24px] font-normal leading-tight text-[#f4e9d0]">{dilemma.title}</h2>
        <p className="mx-auto mt-1.5 max-w-[22rem] text-[13.5px] italic leading-snug text-expedition-parchment/85">
          {dilemma.body}
        </p>
        <div className="mt-4 grid gap-2">
          {dilemma.choices.map(choice => (
            <ChoiceButton key={choice.id} choice={choice} onChoose={resolveFieldDilemmaChoice} />
          ))}
        </div>
      </div>
    </div>
  );
}
