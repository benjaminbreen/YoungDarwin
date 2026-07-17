'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { formatExpeditionDate } from '../expeditionOutcomes';
import { useThreeGameStore } from '../store';
import { ExpeditionPanel } from './expedition/ExpeditionPanel';
import {
  ButterflyIcon,
  CompassRoseIcon,
  LensIcon,
  MapIcon,
  NoteIcon,
  OpenBookIcon,
} from './expedition/icons';

const ACTION_BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-[3px] border px-4 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.16em] transition focus:outline-none focus-visible:ring-1 sm:text-[10px]';
const PRIMARY_BUTTON = `${ACTION_BUTTON} border-expedition-gold bg-expedition-gold/18 text-expedition-goldbright shadow-[0_0_22px_rgba(201,163,95,0.14),inset_0_1px_0_rgba(255,240,193,0.14)] hover:bg-expedition-gold/28 focus-visible:ring-expedition-goldbright`;
const SECONDARY_BUTTON = `${ACTION_BUTTON} border-expedition-brass/65 bg-black/20 text-expedition-parchment hover:border-expedition-gold hover:bg-expedition-gold/10 focus-visible:ring-expedition-gold`;

function BotanicalSeal() {
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-expedition-gold/70 text-expedition-goldbright shadow-[inset_0_0_0_3px_rgba(201,163,95,0.08)]" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="19" opacity="0.5" />
        <path d="M24 37 C23 29 23 20 24 11" />
        <path d="M24 17 C17 13 13 16 13 22 C19 23 22 21 24 17 Z" />
        <path d="M24 25 C31 20 36 22 36 28 C31 30 27 29 24 25 Z" />
        <path d="M24 32 C19 29 16 31 16 35 C20 36 22 35 24 32 Z" />
      </svg>
    </div>
  );
}

function AssessmentDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-brass/55" />
      <span className="h-1.5 w-1.5 rotate-45 border border-expedition-gold/75" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-brass/55" />
    </div>
  );
}

function PacketStat({ icon: Icon, label, value }) {
  return (
    <div className="border-b border-expedition-brass/20 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-expedition-faded">
          <Icon className="h-4 w-4 text-expedition-gold" />
          {label}
        </span>
        <span className="text-[14px] text-expedition-parchment">{value}</span>
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const degrees = Math.max(0, Math.min(360, (Number(score) || 0) * 36));
  return (
    <div
      className="relative grid h-[7.6rem] w-[7.6rem] place-items-center rounded-full p-[2px] shadow-[0_0_30px_rgba(201,163,95,0.12)]"
      style={{ background: `conic-gradient(#d2ad67 ${degrees}deg, rgba(201,163,95,0.14) ${degrees}deg)` }}
      aria-label={`Overall assessment score ${score} out of 10`}
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-expedition-brass/40 bg-[#0b1729] shadow-[inset_0_0_24px_rgba(0,0,0,0.42)]">
        <div className="text-center">
          <div className="text-[2.3rem] leading-none text-expedition-parchment">{Number(score).toFixed(1)}</div>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-expedition-gold">out of 10</div>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ category }) {
  return (
    <div className="group">
      <div className="flex items-end justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-expedition-faded">{category.label}</span>
        <span className="text-[13px] tabular-nums text-expedition-parchment">{category.score.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/45 ring-1 ring-expedition-brass/20">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#8f6d35] to-expedition-goldbright transition-[width] duration-1000"
          style={{ width: `${category.score * 10}%` }}
        />
      </div>
    </div>
  );
}

function TranscriptAdjustment({ profile, loading }) {
  const audit = profile.interactionAudit;
  if (!audit?.turnCount) return null;
  const pending = loading || audit.status === 'pending';
  const adjustment = Number(audit.adjustment) || 0;
  const hasConductCap = audit.conductCap !== null && audit.conductCap !== undefined;
  const adjustmentLabel = adjustment > 0 ? `+${adjustment.toFixed(1)}` : adjustment.toFixed(1);
  const adjustmentClass = adjustment > 0
    ? 'text-emerald-300'
    : adjustment < 0 || hasConductCap
      ? 'text-rose-300'
      : 'text-expedition-parchment';

  return (
    <div className="mt-4 border-t border-expedition-brass/30 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-expedition-gold">Narrator record</span>
        <span className={`text-[12px] tabular-nums ${pending ? 'text-expedition-faded' : adjustmentClass}`}>
          {pending ? 'Under review' : adjustmentLabel}
        </span>
      </div>
      {!pending && (
        <>
          <div className="mt-1 flex justify-between text-[9px] text-expedition-faded">
            <span>{audit.turnCount} player turn{audit.turnCount === 1 ? '' : 's'}</span>
            <span>Base {Number(profile.baseOverall ?? profile.overall).toFixed(1)}</span>
          </div>
          {hasConductCap && (
            <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-rose-300">Conduct ceiling: {Number(audit.conductCap).toFixed(1)}</div>
          )}
          {audit.summary && <p className="mt-2 text-[10px] leading-snug text-expedition-faded">{audit.summary}</p>}
          {audit.quotedEvidence?.[0] && (
            <p className="mt-2 border-l border-expedition-brass/50 pl-2 text-[10px] italic leading-snug text-expedition-parchment">“{audit.quotedEvidence[0]}”</p>
          )}
        </>
      )}
    </div>
  );
}

function LetterLoading() {
  return (
    <div className="grid gap-4" aria-label="Professor Henslow is examining the expedition packet">
      <p className="font-serif text-[18px] italic text-[#4c3b26]">Professor Henslow is examining the packet…</p>
      {[88, 96, 82, 94, 72, 91, 78].map((width, index) => (
        <div
          key={`${width}-${index}`}
          className="h-2 rounded-full bg-[#765b37]/16 motion-safe:animate-pulse"
          style={{ width: `${width}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

function AssessmentLetter({ assessment, loading }) {
  const paragraphs = useMemo(() => String(assessment || '')
    .replace(/\*\*/g, '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean), [assessment]);

  return (
    <section className="relative min-h-[28rem] overflow-y-auto rounded-[2px] border border-[#c8ae78]/65 bg-[#e8d9b8] text-[#2e281f] shadow-[0_18px_35px_rgba(0,0,0,0.28),inset_0_0_60px_rgba(101,72,33,0.16)] lg:h-full lg:min-h-0">
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(circle_at_20%_10%,#fff_0,transparent_32%),repeating-linear-gradient(0deg,transparent_0,transparent_25px,rgba(86,61,30,0.10)_26px)]" />
      <div className="pointer-events-none absolute left-4 top-4 h-8 w-8 border-l border-t border-[#7e623c]/35" />
      <div className="pointer-events-none absolute bottom-4 right-4 h-8 w-8 border-b border-r border-[#7e623c]/35" />
      <div className="relative px-6 py-6 sm:px-9 sm:py-8 lg:px-10">
        <header className="mb-5 flex items-start justify-between gap-5 border-b border-[#8c7048]/30 pb-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#745a37]">Private memorandum</div>
            <div className="mt-1 font-serif text-[13px] italic text-[#5c4930]">Cambridge · 1836</div>
          </div>
          <svg viewBox="0 0 70 42" className="h-10 w-16 text-[#6d5130]/60" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
            <path d="M9 34 C23 25 26 16 27 5 M27 15 C17 8 10 12 9 21 C17 23 23 20 27 15 Z M27 24 C39 15 49 18 50 28 C41 31 33 29 27 24 Z" />
            <path d="M35 35 C42 29 51 27 61 28" />
          </svg>
        </header>
        <div className="min-h-[20rem]" aria-live="polite">
          {loading ? <LetterLoading /> : (
            <div className="space-y-4 font-serif text-[clamp(0.94rem,1.35vw,1.08rem)] leading-[1.65]">
              {paragraphs.map((paragraph, index) => (
                <p
                  key={`${paragraph.slice(0, 32)}-${index}`}
                  className={index === 0 || index === paragraphs.length - 1 ? 'italic' : ''}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function FinalAssessmentModal({
  journalOpen = false,
  onOpenJournal,
  onRestartExpedition,
  onReturnToMainMenu,
}) {
  const assessment = useThreeGameStore(state => state.finalAssessment);
  const primaryActionRef = useRef(null);
  const assessmentId = assessment?.id;

  useEffect(() => {
    if (!assessmentId || journalOpen) return;
    const timeoutId = window.setTimeout(() => primaryActionRef.current?.focus({ preventScroll: true }), 120);
    return () => window.clearTimeout(timeoutId);
  }, [assessmentId, journalOpen]);

  if (!assessment || journalOpen) return null;

  const profile = assessment.profile;
  const stats = profile.stats;
  const loading = assessment.phase === 'loading' || !assessment.assessment;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#050b14]/88 p-2 backdrop-blur-[7px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="final-assessment-title"
      data-testid="final-assessment-modal"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(32,53,82,0.28),transparent_55%),linear-gradient(180deg,rgba(3,8,15,0.08),rgba(3,8,15,0.5))]" />
      <ExpeditionPanel
        variant="modal"
        className="my-auto w-[min(84rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto lg:h-[calc(100dvh-1rem)] lg:overflow-hidden"
        innerClassName="p-3 sm:p-5 lg:flex lg:h-full lg:flex-col lg:p-6"
        background="radial-gradient(circle at 50% 0%, rgba(49,67,98,0.25), transparent 34%), linear-gradient(160deg, rgba(22,37,62,0.995), rgba(11,23,42,0.998) 58%, rgba(6,14,27,1))"
      >
        <header className="pb-4 text-center sm:pb-5 lg:shrink-0">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <span className="hidden h-px w-24 bg-gradient-to-r from-transparent to-expedition-brass/70 sm:block" />
            <BotanicalSeal />
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.34em] text-expedition-gold">The voyage considered</div>
              <h2 id="final-assessment-title" className="mt-1 text-[clamp(1.35rem,3.1vw,2.35rem)] font-medium uppercase tracking-[0.15em] text-expedition-parchment [text-shadow:0_2px_16px_rgba(0,0,0,0.65)]">
                Professor Henslow’s assessment
              </h2>
              <p className="mt-1 text-[12px] italic text-expedition-faded sm:text-[14px]">A final account of the evidence you chose to bring home</p>
            </div>
            <BotanicalSeal />
            <span className="hidden h-px w-24 bg-gradient-to-l from-transparent to-expedition-brass/70 sm:block" />
          </div>
        </header>

        <AssessmentDivider />

        <div className="mt-4 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[14.5rem_minmax(24rem,1fr)_17rem] lg:overflow-hidden xl:grid-cols-[16rem_minmax(28rem,1fr)_18.5rem]">
          <aside className="grid min-w-0 content-start gap-3 overflow-x-hidden lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <figure className="relative overflow-hidden rounded-[3px] border border-expedition-brass/60 bg-black/35 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
              <div className="aspect-[4/5] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/portraits/henslow.jpg"
                  alt="Portrait of Professor John Stevens Henslow in his study"
                  className="h-full w-full object-cover object-top saturate-[0.82] sepia-[0.12]"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#07101d] via-[#07101d]/92 to-transparent px-4 pb-3 pt-10">
                <div className="text-[13px] text-expedition-parchment">John Stevens Henslow</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-expedition-gold">Botanist · Geologist · Mentor</div>
              </div>
            </figure>

            <section className="rounded-[3px] border border-expedition-brass/40 bg-black/16 px-3.5 py-2">
              <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.23em] text-expedition-gold">Field packet</div>
              <PacketStat icon={ButterflyIcon} label="Evidence" value={stats.evidence} />
              <PacketStat icon={NoteIcon} label="Notes" value={stats.notes} />
              <PacketStat icon={MapIcon} label="Stations" value={stats.locations} />
              <PacketStat icon={CompassRoseIcon} label="Date" value={formatExpeditionDate(stats.day)} />
            </section>
          </aside>

          <AssessmentLetter assessment={assessment.assessment} loading={loading} />

          <aside className="grid min-w-0 content-start gap-3 overflow-x-hidden lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <section className="min-w-0 rounded-[3px] border border-expedition-brass/45 bg-black/18 px-4 py-4">
              <div className="flex justify-center"><ScoreRing score={profile.overall} /></div>
              <div className="mt-4 text-center">
                <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-expedition-gold">Henslow’s judgment</div>
                <div className="mt-1 text-[15px] leading-snug text-expedition-parchment">{profile.verdict}</div>
              </div>
            </section>

            <section className="min-w-0 rounded-[3px] border border-expedition-brass/45 bg-black/18 p-4">
              <div className="mb-3 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">
                <LensIcon className="h-4 w-4" /> Assessment ledger
              </div>
              <div className="grid gap-3">
                {profile.categories.map(category => <ScoreRow key={category.id} category={category} />)}
              </div>
              <TranscriptAdjustment profile={profile} loading={loading} />
            </section>

            <section className="min-w-0 rounded-[3px] border border-expedition-brass/45 bg-black/18 p-4">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">Most important omission</div>
              <p className="mt-2 text-[11px] leading-relaxed text-expedition-faded">{profile.gaps[0]}</p>
              <div className="my-3 h-px bg-expedition-brass/25" />
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">Recommendation</div>
              <p className="mt-2 text-[11px] leading-relaxed text-expedition-parchment">{profile.recommendation}</p>
            </section>
          </aside>
        </div>

        {assessment.error && !loading && (
          <p className="mt-3 text-center text-[9px] italic tracking-wide text-expedition-faded">{assessment.error}</p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:shrink-0">
          <button ref={primaryActionRef} type="button" onClick={onOpenJournal} className={PRIMARY_BUTTON}>
            <OpenBookIcon className="h-4 w-4" /> Review field journal
          </button>
          <button type="button" onClick={onRestartExpedition} className={SECONDARY_BUTTON}>Begin new expedition</button>
          <button type="button" onClick={onReturnToMainMenu} className={SECONDARY_BUTTON}>Main menu</button>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
