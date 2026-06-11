'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { baseSpecimens } from '../../data/specimens';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { GoldDivider } from './expedition/ExpeditionPanel';
import {
  ButterflyIcon,
  CompassRoseIcon,
  CuriosityIcon,
  FatigueIcon,
  HeartIcon,
  NoteIcon,
  VialIcon,
} from './expedition/icons';

// The diegetic status screen: the camera has pulled in on Darwin, the clock is
// paused, and this overlay frames the live 3D shot — no modal backdrop.

const DARWIN_BORN = Date.UTC(1809, 1, 12);
const EXPEDITION_START = Date.UTC(1835, 8, 17); // day 1 = Sep 17, 1835
const VOYAGE_DEPARTURE = Date.UTC(1831, 11, 27); // Beagle leaves Plymouth
const VOYAGE_RETURN = Date.UTC(1836, 9, 2); // Falmouth, Oct 2, 1836
const MS_PER_DAY = 86400000;
const NOTES_GOAL = 60;

const ISLAND_COORDINATES = {
  Floreana: '1° 17′ S, 90° 26′ W',
  'Charles Island': '1° 17′ S, 90° 26′ W',
};

const QUOTES = [
  '“Endless forms most beautiful and most wonderful have been, and are, being evolved.”',
  '“The natural history of these islands is eminently curious, and well deserves attention.”',
  '“Nothing can be more improving to a young naturalist, than a journey in distant countries.”',
  '“It is the circumstance, that several of the islands possess their own species of the tortoise, mockingbird, finches, that strikes me with wonder.”',
  '“A grand and fertile field for the naturalist lies before me.”',
];

function expeditionDateParts(day) {
  const date = new Date(EXPEDITION_START + Math.max(0, (day || 1) - 1) * MS_PER_DAY);
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  const age = Math.floor((date.getTime() - DARWIN_BORN) / MS_PER_DAY / 365.2425);
  const daysAtSea = Math.floor((date.getTime() - VOYAGE_DEPARTURE) / MS_PER_DAY);
  const voyagePercent = Math.round(
    ((date.getTime() - VOYAGE_DEPARTURE) / (VOYAGE_RETURN - VOYAGE_DEPARTURE)) * 100,
  );
  return { formatted, age, daysAtSea, voyagePercent: Math.min(100, Math.max(0, voyagePercent)) };
}

function sentenceCase(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function locationFlavor(zone) {
  // Zone subtitles sometimes carry internal labels ("... | regional map");
  // fall back to a biome description rather than leak them on screen.
  const subtitle = zone.subtitle && !/\||regional|map/i.test(zone.subtitle) ? zone.subtitle : null;
  if (subtitle) return sentenceCase(subtitle);
  if (zone.biome) return sentenceCase(`${zone.biome.replace(/-/g, ' ')} terrain`);
  return 'Rocky shoreline and scrubland.';
}

function standingLabel(value) {
  if (value < 20) return 'Distrusted';
  if (value < 40) return 'Wary';
  if (value < 60) return 'Neutral';
  if (value < 80) return 'Respected';
  return 'Esteemed';
}

function SectionHeading({ children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[17px] uppercase tracking-[0.22em] text-expedition-gold [text-shadow:0_1px_6px_rgba(0,0,0,0.85)]">
        {children}
      </div>
      <GoldDivider className="mt-2.5" />
    </div>
  );
}

function ConditionRow({ icon: Icon, label, value, fill }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[2.4rem_1fr] items-center gap-x-4">
      <Icon className="h-7 w-7 text-expedition-gold/85" />
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[20px] leading-snug text-expedition-parchment">{label}</span>
          <span className="text-[17px] tabular-nums tracking-[0.04em] text-expedition-parchment/75">{Math.round(safe)} / 100</span>
        </div>
        <div className="mt-2 h-[5px] w-full rounded-full bg-white/15">
          <div className="h-full rounded-full" style={{ width: `${safe}%`, background: fill }} />
        </div>
      </div>
    </div>
  );
}

function ProgressPips({ count, total, color }) {
  // Single row of dots; large totals are scaled down so they never wrap.
  const shown = Math.min(18, Math.max(total, 1));
  const filled = total > 0 ? Math.round((count / total) * shown) : 0;
  return (
    <div className="mt-2 flex gap-[7px]">
      {Array.from({ length: shown }, (_, index) => (
        <span
          key={index}
          className="h-[9px] w-[9px] shrink-0 rounded-full"
          style={{ background: index < filled ? color : 'rgba(232,220,192,0.18)' }}
        />
      ))}
    </div>
  );
}

function JournalRow({ icon: Icon, label, count, total, color }) {
  return (
    <div className="grid grid-cols-[2.4rem_1fr] items-start gap-x-4">
      <Icon className="mt-1 h-7 w-7 text-expedition-gold/85" />
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[20px] leading-snug text-expedition-parchment">{label}</span>
          <span className="text-[17px] tabular-nums tracking-[0.04em] text-expedition-parchment/75">{count} / {total}</span>
        </div>
        <ProgressPips count={count} total={total} color={color} />
      </div>
    </div>
  );
}

function EquipmentSlot({ image, label, detail }) {
  return (
    <div className="flex flex-col items-center gap-2.5" title={`${label} — ${detail}`}>
      <div className="relative flex h-[5.4rem] w-[5.4rem] items-center justify-center rounded-full border border-expedition-brass/70 bg-[radial-gradient(circle_at_35%_28%,rgba(56,45,28,0.92),rgba(13,10,7,0.96))] shadow-[0_10px_22px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(227,197,133,0.22)]">
        <div className="pointer-events-none absolute inset-[3px] rounded-full border border-expedition-gold/20" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={label}
          draggable={false}
          className="h-[3.5rem] w-[3.5rem] object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.7)]"
        />
        {/* drop pointer, as on the mockup's equipment pins */}
        <span className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[1px] border-b border-r border-expedition-brass/70 bg-[#15110b]" />
      </div>
      <span className="text-[14px] tabular-nums tracking-[0.05em] text-expedition-parchment/80">{detail}</span>
    </div>
  );
}

export function StatusView() {
  const open = useThreeGameStore(state => state.statusViewOpen);
  const close = useThreeGameStore(state => state.closeStatusView);
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const curiosity = useThreeGameStore(state => state.curiosity);
  const localStanding = useThreeGameStore(state => state.localStanding);
  const day = useThreeGameStore(state => state.day);
  const journal = useThreeGameStore(state => state.journal);
  const inventory = useThreeGameStore(state => state.inventory);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const supplies = useThreeGameStore(state => state.supplies);
  const collectedSpecimenIds = useThreeGameStore(state => state.collectedSpecimenIds);
  const documentedSpecimenIds = useThreeGameStore(state => state.documentedSpecimenIds);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const weather = useThreeGameStore(state => state.weather);
  const [visible, setVisible] = useState(false);

  // Let the camera move begin before the type fades in over the hero shot.
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const totals = useMemo(() => {
    const species = baseSpecimens.filter(s => s.ontology === 'Animal' || s.ontology === 'Plant');
    const minerals = baseSpecimens.filter(s => s.ontology === 'Mineral');
    return {
      speciesTotal: species.length,
      speciesIds: new Set(species.map(s => s.id)),
      mineralTotal: minerals.length,
      mineralIds: new Set(minerals.map(s => s.id)),
    };
  }, []);

  if (!open) return null;

  const observedIds = new Set([...collectedSpecimenIds, ...documentedSpecimenIds]);
  const speciesObserved = [...observedIds].filter(id => totals.speciesIds.has(id)).length;
  const geologicalSamples = [...observedIds].filter(id => totals.mineralIds.has(id)).length;
  const zone = getZone(currentZoneId);
  const { formatted, age, daysAtSea, voyagePercent } = expeditionDateParts(day);
  const coordinates = ISLAND_COORDINATES[zone.island] || ISLAND_COORDINATES.Floreana;
  const quote = QUOTES[(day - 1) % QUOTES.length];
  const standing = standingLabel(localStanding);

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-30 select-none font-expedition text-expedition-parchment transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Cinematic grade + edge vignette so the columns read over the live scene */}
      <div className="pointer-events-none absolute inset-0 bg-[rgba(10,9,6,0.26)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,7,5,0.92)_0%,rgba(8,7,5,0.68)_18%,rgba(8,7,5,0.3)_34%,transparent_46%,transparent_54%,rgba(8,7,5,0.3)_66%,rgba(8,7,5,0.68)_82%,rgba(8,7,5,0.92)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,5,0.82)_0%,rgba(8,7,5,0.4)_12%,transparent_26%,transparent_68%,rgba(8,7,5,0.45)_84%,rgba(8,7,5,0.85)_100%)]" />

      {/* Header */}
      <div className="absolute left-1/2 top-7 -translate-x-1/2 text-center">
        <div className="pl-[0.45em] text-[44px] font-medium tracking-[0.45em] text-[#f3e6c8] [text-shadow:0_2px_16px_rgba(0,0,0,0.85)]">
          DARWIN
        </div>
        <div className="mx-auto mt-1 flex w-56 items-center gap-2">
          <GoldDivider className="flex-1" />
          <span className="h-1.5 w-1.5 rotate-45 bg-expedition-gold/80" />
          <GoldDivider className="flex-1" />
        </div>
        <div className="mt-2.5 text-[16px] tracking-[0.04em] text-expedition-parchment [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          Age {age} <span className="mx-1.5 text-expedition-gold">•</span> {formatted}
        </div>
      </div>

      {/* Close */}
      <button
        type="button"
        onClick={close}
        aria-label="Close status view"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-expedition-brass/70 bg-black/30 text-lg text-expedition-parchment/85 transition hover:border-expedition-gold hover:text-expedition-goldbright"
      >
        ✕
      </button>

      {/* Left column */}
      <div className="absolute left-10 top-36 flex w-[26rem] flex-col gap-11 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
        <div>
          <SectionHeading>Condition</SectionHeading>
          <div className="mt-5 grid gap-5">
            <ConditionRow icon={HeartIcon} label="Health" value={health} fill="linear-gradient(90deg,#5f9e6a,#8fc491)" />
            <ConditionRow icon={FatigueIcon} label="Fatigue" value={fatigue} fill="linear-gradient(90deg,#b3812f,#e0aa4e)" />
            <ConditionRow icon={CuriosityIcon} label="Curiosity" value={curiosity} fill="linear-gradient(90deg,#4f93a8,#84c4d4)" />
          </div>
        </div>

        <div>
          <SectionHeading>Journal Progress</SectionHeading>
          <div className="mt-5 grid gap-5">
            <JournalRow icon={ButterflyIcon} label="Species Observed" count={speciesObserved} total={totals.speciesTotal} color="#8fc491" />
            <JournalRow icon={VialIcon} label="Geological Samples" count={geologicalSamples} total={totals.mineralTotal} color="#84c4d4" />
            <JournalRow icon={NoteIcon} label="Notes Written" count={journal.length} total={NOTES_GOAL} color="#e0aa4e" />
          </div>
        </div>

        <div>
          <SectionHeading>Reputation</SectionHeading>
          <div className="mt-5 grid grid-cols-[2.4rem_1fr] items-start gap-x-4">
            <CompassRoseIcon className="mt-1 h-7 w-7 text-expedition-gold/85" />
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[20px] text-expedition-parchment">Local Standing</span>
                <span className="text-[18px] text-expedition-goldbright">{standing}</span>
              </div>
              <div className="relative mt-3.5 h-[5px] rounded-full bg-gradient-to-r from-expedition-gold/70 via-white/15 to-white/15">
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-expedition-ink/60 bg-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.7)]"
                  style={{ left: `${100 - localStanding}%` }}
                />
              </div>
              <div className="mt-2.5 flex justify-between text-[15px] tracking-[0.04em] text-expedition-faded">
                <span>Respected</span>
                <span>Distrusted</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="absolute right-10 top-36 flex w-[26rem] flex-col gap-11 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
        <div>
          <SectionHeading>Equipment</SectionHeading>
          <div className="mt-5 flex justify-between px-1">
            <EquipmentSlot image="/inventory/butterfly_net.png" label="Specimen case" detail={`${inventory.length} / ${caseCapacity}`} />
            <EquipmentSlot image="/inventory/field_notebook.png" label="Field journal" detail={`${journal.length} ${journal.length === 1 ? 'entry' : 'entries'}`} />
            <EquipmentSlot image="/inventory/labels.png" label="Labels" detail={`× ${supplies.labels}`} />
            <EquipmentSlot image="/inventory/sample_jar.png" label="Spirit jars" detail={`× ${supplies.spareJars}`} />
          </div>
        </div>

        <div>
          <SectionHeading>Expedition Status</SectionHeading>
          <div className="mt-5 grid grid-cols-[2.4rem_1fr] items-start gap-x-4">
            <CompassRoseIcon className="mt-1.5 h-7 w-7 text-expedition-gold/85" />
            <div>
              <div className="text-[21px] text-expedition-parchment">H.M.S. Beagle</div>
              <div className="mt-0.5 text-[16px] text-[#9dc08b]">In Progress</div>
              <div className="mt-3.5 text-[16px] leading-relaxed text-expedition-parchment/90">
                {daysAtSea.toLocaleString()} days since Plymouth
                <br />
                {voyagePercent}% of voyage completed
              </div>
              <div className="relative mt-3 h-[5px] rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gradient-to-r from-[#5f9e6a] to-[#8fc491]" style={{ width: `${voyagePercent}%` }} />
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-expedition-goldbright"
                  style={{ left: `${voyagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionHeading>Current Location</SectionHeading>
          <div className="mt-5 grid grid-cols-[2.4rem_1fr] items-start gap-x-4">
            <CompassRoseIcon className="mt-1.5 h-7 w-7 text-expedition-gold/85" />
            <div>
              <div className="text-[21px] text-expedition-parchment">{zone.name}, Galápagos</div>
              <div className="mt-1 text-[15px] tabular-nums text-expedition-faded">{coordinates}</div>
              <div className="mt-3 text-[16px] leading-relaxed text-expedition-parchment/85">
                {locationFlavor(zone)}
                {weather ? (
                  <>
                    <br />
                    {sentenceCase(weather)}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quote + return hint */}
      <div className="absolute bottom-8 left-1/2 w-[min(44rem,90vw)] -translate-x-1/2 text-center">
        <div className="text-[21px] italic leading-relaxed text-[#efe2c4] [text-shadow:0_2px_12px_rgba(0,0,0,0.9)]">
          {quote}
        </div>
        <div className="mt-2 text-[13.5px] text-expedition-faded [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">— Journal, {formatted}</div>
        <div className="mt-5 text-[11px] uppercase tracking-[0.28em] text-expedition-faded/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
          Press ESC to return
        </div>
      </div>
    </div>
  );
}
