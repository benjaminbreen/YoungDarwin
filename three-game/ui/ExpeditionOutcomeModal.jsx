'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatExpeditionDate } from '../expeditionOutcomes';
import { useThreeGameStore } from '../store';
import { ExpeditionPanel } from './expedition/ExpeditionPanel';
import {
  ButterflyIcon,
  CompassRoseIcon,
  CuriosityIcon,
  FatigueIcon,
  HeartIcon,
  MapIcon,
  NoteIcon,
  OpenBookIcon,
} from './expedition/icons';

const ACTION_BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-[3px] border px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] transition focus:outline-none focus-visible:ring-1 sm:text-[11px]';
const PRIMARY_BUTTON = `${ACTION_BUTTON} border-expedition-gold bg-expedition-gold/18 text-expedition-goldbright shadow-[0_0_22px_rgba(201,163,95,0.16),inset_0_1px_0_rgba(255,240,193,0.18)] hover:bg-expedition-gold/28 focus-visible:ring-expedition-goldbright`;
const SECONDARY_BUTTON = `${ACTION_BUTTON} border-expedition-brass/70 bg-black/20 text-expedition-parchment hover:border-expedition-gold hover:bg-expedition-gold/10 focus-visible:ring-expedition-gold`;
const DEATH_BUTTON = 'flex min-h-10 items-center justify-center whitespace-nowrap rounded-[3px] border border-expedition-brass/75 bg-black/20 px-2 py-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-expedition-parchment transition hover:border-expedition-gold hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold sm:text-[8.5px]';

function CalendarIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 5.5 H19 V20 H5 Z" />
      <path d="M8 3.5 V7.5 M16 3.5 V7.5 M5 9 H19" />
      <path d="M8.5 12.5 H10 M14 12.5 H15.5 M8.5 16 H10 M14 16 H15.5" opacity="0.65" />
    </svg>
  );
}

function LocationPinIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21 C9.2 17.1 6.5 14.1 6.5 10.2 C6.5 6.9 8.9 4.5 12 4.5 C15.1 4.5 17.5 6.9 17.5 10.2 C17.5 14.1 14.8 17.1 12 21 Z" />
      <circle cx="12" cy="10" r="1.9" />
    </svg>
  );
}

function SkullCrest() {
  return (
    <div className="relative flex h-[4.9rem] w-[7.2rem] items-center justify-center text-expedition-goldbright">
      <svg viewBox="0 0 140 100" className="absolute inset-0 h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M36 78 C20 66 14 45 21 26 M104 78 C120 66 126 45 119 26" opacity="0.75" />
        <path d="M31 70 l-9 -4 M28 60 l-10 -1 M27 49 l-9 3 M30 38 l-8 6 M35 29 l-6 8" />
        <path d="M109 70 l9 -4 M112 60 l10 -1 M113 49 l9 3 M110 38 l8 6 M105 29 l6 8" />
        <circle cx="70" cy="47" r="29" opacity="0.35" />
        <path d="M70 12 V4 M63 7 H77" opacity="0.55" />
      </svg>
      <svg viewBox="0 0 64 64" className="relative h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 29 C16 17 22 10 32 10 C42 10 48 17 48 29 C48 38 44 43 40 46 V54 H24 V46 C20 43 16 38 16 29 Z" fill="currentColor" fillOpacity="0.2" />
        <circle cx="25" cy="30" r="5" fill="currentColor" fillOpacity="0.72" stroke="none" />
        <circle cx="39" cy="30" r="5" fill="currentColor" fillOpacity="0.72" stroke="none" />
        <path d="M32 34 L29 41 H35 Z" fill="currentColor" fillOpacity="0.65" />
        <path d="M25 47 V53 M30 47 V54 M35 47 V54 M40 47 V53" />
      </svg>
    </div>
  );
}

function OutcomeDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-brass/55" />
      <span className="h-1.5 w-1.5 rotate-45 border border-expedition-gold/70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-brass/55" />
    </div>
  );
}

function RecapRow({ icon: Icon, label, value, detail, valueClassName = '' }) {
  return (
    <div className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-expedition-brass/20 py-2.5 last:border-0 sm:grid-cols-[1.8rem_minmax(0,1fr)_auto]">
      <Icon className="h-5 w-5 text-expedition-gold sm:h-6 sm:w-6" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-expedition-faded sm:text-[11px]">{label}</span>
      <span className={`max-w-[11rem] text-right text-[13px] text-expedition-parchment sm:max-w-none sm:text-[15px] ${valueClassName}`}>
        {value}
        {detail && <small className="mt-0.5 block text-[9px] font-normal text-expedition-faded sm:text-[10px]">{detail}</small>}
      </span>
    </div>
  );
}

function DeathRecapRow({ icon: Icon, label, value }) {
  return (
    <div className="grid grid-cols-[1.35rem_minmax(0,1fr)_minmax(7rem,auto)] items-center gap-2.5 py-1.5 sm:py-2">
      <Icon className="h-[1.05rem] w-[1.05rem] text-expedition-gold sm:h-[1.15rem] sm:w-[1.15rem]" />
      <span className="text-[12px] leading-none text-expedition-parchment sm:text-[13px]">{label}:</span>
      <span className="text-right text-[12px] leading-none text-expedition-parchment sm:text-[13px]">{value}</span>
    </div>
  );
}

function DeathModal({ outcome, onOpenJournal, onRestartExpedition, onReturnToMainMenu, revealed }) {
  const stats = outcome.stats || {};
  return (
    <ExpeditionPanel
      variant="modal"
      className={`my-12 w-[min(34rem,calc(100vw-1.25rem))] overflow-visible rounded-[4px] transition duration-700 md:w-[min(38vw,34rem)] xl:w-[min(35vw,34rem)] ${revealed ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0'}`}
      innerClassName="px-5 pb-4 pt-11 sm:px-7 sm:pb-5 sm:pt-12"
      background="radial-gradient(circle at 50% 0%, rgba(50,68,96,0.24), transparent 34%), linear-gradient(165deg, rgba(23,37,62,0.99), rgba(13,24,43,0.995) 58%, rgba(8,15,29,1))"
    >
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[48%] rounded-[50%] border border-expedition-gold/85 bg-[#12203a] shadow-[0_10px_28px_rgba(0,0,0,0.58),inset_0_0_0_3px_rgba(201,163,95,0.10)]">
        <SkullCrest />
      </div>
      <div className="pointer-events-none absolute left-[calc(50%_-_8.6rem)] top-[7px] hidden items-center gap-2 text-expedition-gold/85 sm:flex" aria-hidden="true">
        <span className="h-px w-12 bg-expedition-gold/70" /><span className="h-1.5 w-1.5 rotate-45 bg-expedition-gold" />
      </div>
      <div className="pointer-events-none absolute right-[calc(50%_-_8.6rem)] top-[7px] hidden items-center gap-2 text-expedition-gold/85 sm:flex" aria-hidden="true">
        <span className="h-1.5 w-1.5 rotate-45 bg-expedition-gold" /><span className="h-px w-12 bg-expedition-gold/70" />
      </div>
      <header className="text-center">
        <h2 className="text-[clamp(1.45rem,2.2vw,1.8rem)] font-semibold uppercase tracking-[0.19em] text-expedition-parchment [text-shadow:0_2px_14px_rgba(0,0,0,0.75)]">
          Darwin has died
        </h2>
        <p className="mt-1 text-[clamp(0.88rem,1.3vw,1rem)] italic text-expedition-faded">Your expedition ends here.</p>
      </header>
      <div className="mx-3 my-2.5 sm:mx-5 sm:my-3"><OutcomeDivider /></div>
      <p className="text-center text-[12px] italic leading-relaxed text-[#dbc49d] sm:text-[13px]">
        <span className="text-expedition-gold">Cause:</span> {outcome.cause}
      </p>
      <section className="relative mt-4 rounded-[3px] border border-expedition-brass/45 bg-black/15 px-4 py-3 sm:px-5 sm:py-3.5">
        <span className="pointer-events-none absolute -left-1 -top-1 h-2 w-2 border-l border-t border-expedition-gold/70" aria-hidden="true" />
        <span className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 border-r border-t border-expedition-gold/70" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-1 -left-1 h-2 w-2 border-b border-l border-expedition-gold/70" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 border-b border-r border-expedition-gold/70" aria-hidden="true" />
        <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-expedition-gold sm:text-[10px]">Expedition recap</h3>
        <DeathRecapRow icon={CalendarIcon} label="Date" value={formatExpeditionDate(stats.day)} />
        <DeathRecapRow icon={LocationPinIcon} label="Location" value={stats.locationName || 'Floreana Island'} />
        <DeathRecapRow icon={ButterflyIcon} label="Specimens documented" value={`${stats.specimensDocumented || 0}/${stats.specimensAvailable || 0}`} />
        <DeathRecapRow icon={NoteIcon} label="Notes recorded" value={stats.notesRecorded || 0} />
        <DeathRecapRow icon={CuriosityIcon} label="Final curiosity" value={stats.curiosity || 0} />
      </section>
      <div className="mt-4 grid gap-1.5 sm:grid-cols-3">
        <button type="button" onClick={onRestartExpedition} className={`${DEATH_BUTTON} border-expedition-gold bg-expedition-gold/12 text-expedition-goldbright shadow-[0_0_16px_rgba(201,163,95,0.12)]`}>Restart expedition</button>
        <button type="button" onClick={onOpenJournal} className={DEATH_BUTTON}>Return to journal</button>
        <button type="button" onClick={onReturnToMainMenu} className={DEATH_BUTTON}>Main menu</button>
      </div>
    </ExpeditionPanel>
  );
}

function RecoveryBullet({ icon: Icon, title, children }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-2.5">
      <Icon className="mt-0.5 h-5 w-5 text-expedition-gold" />
      <div>
        <div className="text-[12px] font-semibold text-expedition-parchment sm:text-[13px]">{title}</div>
        <div className="text-[10px] leading-snug text-expedition-faded sm:text-[11px]">{children}</div>
      </div>
    </div>
  );
}

function RecoveryModal({ outcome, onOpenJournal, onReturnToMainMenu, onRecover, revealed }) {
  const stats = outcome.stats || {};
  const recoveryDay = (stats.day || 1) + ((stats.timeOfDay || 0) >= 7 ? 1 : 0);
  return (
    <ExpeditionPanel
      variant="modal"
      className={`w-[min(92rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto transition duration-700 ${revealed ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0'}`}
      innerClassName="p-2.5 sm:p-4 lg:p-5"
      background="linear-gradient(155deg, rgba(20,33,55,0.99), rgba(10,20,36,0.995) 60%, rgba(6,13,25,1))"
    >
      <header className="px-2 pb-3 text-center sm:pb-4">
        <div className="flex items-center justify-center gap-3 text-expedition-gold">
          <span className="hidden h-px w-20 bg-gradient-to-r from-transparent to-expedition-brass/70 sm:block" />
          <CompassRoseIcon className="h-7 w-7" />
          <h2 className="text-[clamp(1.35rem,3vw,2.15rem)] font-medium uppercase tracking-[0.16em] text-expedition-parchment">Recovering aboard HMS Beagle</h2>
          <CompassRoseIcon className="h-7 w-7" />
          <span className="hidden h-px w-20 bg-gradient-to-l from-transparent to-expedition-brass/70 sm:block" />
        </div>
        <p className="mt-1 text-[14px] text-expedition-gold sm:text-[16px]">Darwin pushed beyond his limits and collapsed in the field.</p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="relative min-h-[14rem] overflow-hidden rounded-[3px] border border-expedition-brass/60 bg-black/35 sm:min-h-[22rem] lg:min-h-[31rem]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: 'url(/assets/textures/ui/darwin-recovery-cabin.png)' }}
            role="img"
            aria-label="Darwin resting in his berth aboard HMS Beagle"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07101e]/95 via-transparent to-black/10" />
          <div className="absolute bottom-4 left-4 right-4 rounded-[3px] border border-expedition-brass/45 bg-[#0b1729]/88 p-3 backdrop-blur-sm sm:bottom-5 sm:left-5 sm:right-5 sm:p-4">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">The crew’s account</div>
            <p className="mt-1 text-[13px] italic leading-relaxed text-expedition-parchment sm:text-[16px]">
              “At last your legs failed beneath you, and your companions brought you back to the <em>Beagle</em>.”
            </p>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <section className="rounded-[3px] border border-expedition-brass/45 bg-[#e8d8b7] px-5 py-5 text-[#332b20] shadow-[inset_0_0_35px_rgba(93,65,31,0.14)] sm:px-8 sm:py-7">
            <div className="text-center text-[9px] font-semibold uppercase tracking-[0.3em] text-[#6c5538] sm:text-[10px]">From the ship’s log</div>
            <p className="mt-3 text-[17px] leading-relaxed sm:text-[21px]">
              You pressed on after your strength was spent. You wake in your berth, <em>weak but alive</em>, with the island expedition cut short for the day.
            </p>
            <p className="mt-3 text-[13px] italic text-[#6b5134] sm:text-[15px]">{outcome.cause}</p>
          </section>

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="rounded-[3px] border border-expedition-brass/45 bg-black/15 p-4">
              <h3 className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">What happened</h3>
              <div className="grid gap-3">
                <RecoveryBullet icon={CompassRoseIcon} title="Rescued by the crew">Your companions carried you back to the ship.</RecoveryBullet>
                <RecoveryBullet icon={MapIcon} title="Returned to the aft cabin">You wake safely below decks aboard HMS Beagle.</RecoveryBullet>
                <RecoveryBullet icon={HeartIcon} title="Strength restored">Health returns to 60 and fatigue falls to 12.</RecoveryBullet>
                <RecoveryBullet icon={FatigueIcon} title="The day is lost">The clock advances to the next recovery morning.</RecoveryBullet>
              </div>
            </section>
            <section className="rounded-[3px] border border-expedition-brass/45 bg-black/15 px-4 py-2">
              <h3 className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">Expedition recap</h3>
              <RecapRow icon={CompassRoseIcon} label="Date & time advanced" value={formatExpeditionDate(recoveryDay)} detail="7:00 AM" />
              <RecapRow icon={NoteIcon} label="Notes retained" value={stats.notesRecorded || 0} detail="All notes preserved" />
              <RecapRow icon={ButterflyIcon} label="Specimens retained" value={stats.specimensDocumented || 0} detail="All specimens secured" />
              <RecapRow icon={CuriosityIcon} label="Curiosity / momentum" value="−5" detail="Due to the early return" valueClassName="text-rose-300" />
            </section>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={onOpenJournal} className={SECONDARY_BUTTON}><OpenBookIcon className="h-5 w-5" /> Review journal</button>
        <button type="button" onClick={onRecover} className={PRIMARY_BUTTON}><HeartIcon className="h-5 w-5" /> Rest and recover</button>
        <button type="button" onClick={onReturnToMainMenu} className={SECONDARY_BUTTON}>Main menu</button>
      </div>
    </ExpeditionPanel>
  );
}

export function ExpeditionOutcomeModal({
  journalOpen = false,
  onOpenJournal,
  onRestartExpedition,
  onReturnToMainMenu,
}) {
  const outcome = useThreeGameStore(state => state.expeditionOutcome);
  const beginRecovery = useThreeGameStore(state => state.beginIncapacitationRecovery);
  const [revealed, setRevealed] = useState(false);
  const outcomeId = outcome?.id;
  const outcomePhase = outcome?.phase;

  useEffect(() => {
    setRevealed(false);
    if (!outcomeId || outcomePhase === 'recovering') return undefined;
    const timer = window.setTimeout(() => setRevealed(true), 900);
    return () => window.clearTimeout(timer);
  }, [outcomeId, outcomePhase]);

  const accessibleTitle = useMemo(() => (
    outcome?.type === 'death' ? 'Darwin has died' : 'Darwin has collapsed'
  ), [outcome?.type]);

  if (!outcome || outcome.phase === 'recovering' || journalOpen) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(3,7,12,0.60)] p-1 font-expedition backdrop-blur-[1px] sm:p-2"
      role="dialog"
      aria-modal="true"
      aria-label={accessibleTitle}
      data-testid={`expedition-outcome-${outcome.type}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-1000 ${revealed ? 'opacity-0' : 'opacity-35'}`} />
      {outcome.type === 'death' ? (
        <DeathModal
          outcome={outcome}
          onOpenJournal={onOpenJournal}
          onRestartExpedition={onRestartExpedition}
          onReturnToMainMenu={onReturnToMainMenu}
          revealed={revealed}
        />
      ) : (
        <RecoveryModal
          outcome={outcome}
          onOpenJournal={onOpenJournal}
          onReturnToMainMenu={onReturnToMainMenu}
          onRecover={beginRecovery}
          revealed={revealed}
        />
      )}
    </div>
  );
}
