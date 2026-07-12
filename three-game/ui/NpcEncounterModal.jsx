'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getNpcEncounter } from '../encounters/npcEncounters';
import { setTypingMode } from '../input/typingMode';
import { useThreeGameStore } from '../store';

function EncounterTurn({ turn }) {
  const isPlayer = turn.role === 'player';
  return (
    <p className={isPlayer ? 'text-expedition-parchment/78 italic' : 'text-expedition-parchment'}>
      {isPlayer ? `You: ${turn.text}` : turn.text}
    </p>
  );
}

export function NpcEncounterModal() {
  const active = useThreeGameStore(state => state.activeNpcEncounter);
  const pending = useThreeGameStore(state => state.npcEncounterPending);
  const error = useThreeGameStore(state => state.npcEncounterError);
  const close = useThreeGameStore(state => state.closeNpcEncounter);
  const submit = useThreeGameStore(state => state.submitNpcEncounter);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const transcriptRef = useRef(null);
  const encounter = getNpcEncounter(active?.npcId);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 170);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      setTypingMode(false);
    };
  }, [active, close, pending]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [active?.turns, pending]);

  if (!active || !encounter) return null;
  const turns = active.turns || [];
  const npcTurns = turns.filter(turn => turn.role === 'npc');
  const latestNpcTurn = npcTurns.at(-1);
  const earlierTurns = turns.slice(0, Math.max(0, turns.length - 1));
  const submitReply = value => {
    const text = String(value || '').trim();
    if (!text || pending) return;
    setDraft('');
    submit(text);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end bg-black/45 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 backdrop-blur-[2px] sm:px-6 sm:pb-8">
      <section
        aria-label={`Conversation with ${encounter.name || 'NPC'}`}
        className="npc-encounter-panel relative mx-auto grid w-full max-w-[72.5rem] grid-rows-[auto_minmax(0,1fr)] overflow-visible border border-expedition-brass/55 border-t-[3px] border-t-[#527b77] bg-[#101a27] shadow-[0_28px_76px_rgba(0,0,0,0.66)] sm:grid-cols-[13.25rem_minmax(0,1fr)] sm:grid-rows-1"
      >
        <aside className="relative flex min-h-[5.1rem] items-center border-b border-expedition-brass/25 bg-[#1d3038] px-4 py-3 sm:min-h-[25.5rem] sm:items-end sm:border-b-0 sm:border-r sm:px-5 sm:pb-6">
          <div className="absolute -top-7 left-4 h-[3.8rem] w-[3.8rem] overflow-hidden rounded-full border-[3px] border-[#e7ddc9] bg-[#d9cfb9] shadow-[0_14px_29px_rgba(0,0,0,0.43)] sm:-top-12 sm:left-1/2 sm:h-[11.3rem] sm:w-[8.4rem] sm:-translate-x-1/2 sm:rounded-b-[4.2rem] sm:rounded-t-sm sm:border-[5px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={encounter.portrait} alt={encounter.name} className="h-full w-full object-cover object-top sepia-[0.22]" />
          </div>
          <h2 className="ml-[4.6rem] font-expedition text-[1.35rem] font-medium leading-[0.88] text-expedition-parchment sm:ml-0 sm:text-[1.75rem]">
            {encounter.name?.split(' ').map((word, index) => <React.Fragment key={word}>{index > 0 && <br />}{word}</React.Fragment>)}
          </h2>
        </aside>

        <div className="relative flex min-h-0 flex-col px-4 pb-4 pt-5 sm:min-h-[25.5rem] sm:px-8 sm:pb-5 sm:pt-8">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="Close conversation"
            className="absolute right-3 top-2 h-8 w-8 text-[1.25rem] leading-none text-expedition-faded transition hover:text-expedition-goldbright disabled:opacity-30 sm:right-5 sm:top-3"
          >
            ×
          </button>
          <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-3">
            <div className="max-w-[50rem] space-y-2 pb-5 pr-7 sm:pb-7">
              {earlierTurns.length > 1 && (
                <div className="space-y-2 border-l-2 border-[#527b77]/55 pl-3 text-[0.98rem] leading-[1.34] sm:text-[1.05rem]">
                  {earlierTurns.slice(-4).map((turn, index) => <EncounterTurn key={`${turn.role}-${index}-${turn.text}`} turn={turn} />)}
                </div>
              )}
              {latestNpcTurn && <p className="font-expedition text-[1.2rem] font-medium leading-[1.37] text-expedition-parchment sm:text-[1.32rem]">{latestNpcTurn.text}</p>}
              {pending && <p className="font-expedition text-[1.05rem] italic text-expedition-faded">Syms considers the matter…</p>}
              {error && !pending && <p className="text-[0.82rem] italic text-expedition-faded">{error}</p>}
            </div>
          </div>

          <div className="max-w-[50rem] shrink-0 border-t border-expedition-brass/30 pt-2">
            <div className="grid gap-px">
              {(active.suggestedReplies || []).slice(0, 2).map((reply, index) => (
                <button
                  key={reply}
                  type="button"
                  disabled={pending}
                  onClick={() => submitReply(reply)}
                  className="grid min-h-10 grid-cols-[2rem_1fr] items-center border-b border-expedition-brass/20 px-1 text-left font-expedition text-[1rem] text-expedition-parchment transition hover:bg-[#527b77]/15 hover:pl-3 hover:shadow-[-3px_0_0_#A96F54_inset] focus-visible:bg-[#527b77]/15 focus-visible:pl-3 focus-visible:outline-none disabled:opacity-45 sm:text-[1.08rem]"
                >
                  <span className="font-serif text-[0.75rem] text-[#a96f54]">{index === 0 ? 'I.' : 'II.'}</span>
                  <span>{reply}</span>
                </button>
              ))}
            </div>
            <form
              className="relative mt-3"
              onSubmit={event => {
                event.preventDefault();
                submitReply(draft);
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                disabled={pending}
                onChange={event => setDraft(event.target.value)}
                onFocus={() => setTypingMode(true)}
                onBlur={() => setTypingMode(false)}
                onKeyDown={event => event.stopPropagation()}
                placeholder="Say something else…"
                aria-label={`Reply to ${encounter.name}`}
                className="h-12 w-full border border-expedition-gold/50 bg-[rgba(231,221,201,0.98)] px-3 pr-12 font-expedition text-[1.05rem] text-[#2d291f] outline-none placeholder:italic placeholder:text-[#867a65] focus:border-expedition-goldbright focus:ring-2 focus:ring-expedition-gold/20 disabled:opacity-65"
              />
              <button type="submit" disabled={pending || !draft.trim()} aria-label="Speak" className="absolute right-1 top-1 grid h-10 w-10 place-items-center border-l border-[#7a6848]/35 font-serif text-[1.05rem] text-[#665638] transition hover:bg-[#a96f54]/10 hover:text-[#2e2618] disabled:opacity-30">↵</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
