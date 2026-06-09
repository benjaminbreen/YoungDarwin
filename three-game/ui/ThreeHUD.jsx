'use client';

import React, { useMemo, useState } from 'react';
import { FieldNotebook } from '../../field-notebook/FieldNotebook';
import { LocalMap } from '../../field-notebook/LocalMap';
import { getThreeSpecimens, threeTools } from '../data';
import { setTouchControl } from '../input/touchControls';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { ZoneTransitionOverlay } from './ZoneTransitionOverlay';

function Bar({ label, value, color }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-amber-100/80">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/45">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function formatExpeditionDate(day) {
  const start = new Date(Date.UTC(1835, 8, 17));
  start.setUTCDate(start.getUTCDate() + Math.max(0, (day || 1) - 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start);
}

function formatExpeditionTime(timeOfDay) {
  const totalMinutes = Math.floor((timeOfDay || 8) * 60);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function TopChronometer() {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);

  return (
    <div className="absolute left-1/2 top-3 w-[min(29rem,calc(100vw-8rem))] -translate-x-1/2 text-center sm:w-[min(32rem,calc(100vw-24rem))]">
      <div className="pointer-events-none inline-flex max-w-full items-center gap-2 rounded-md border border-white/15 bg-stone-950/42 px-3 py-1.5 text-amber-50 shadow-lg backdrop-blur-md">
        <span className="hidden h-1.5 w-1.5 rounded-full bg-amber-200/75 sm:inline-block" />
        <span className="truncate font-serif text-xs font-semibold tracking-wide sm:text-sm">
          {formatExpeditionDate(day)}
        </span>
        <span className="text-amber-100/35">|</span>
        <span className="whitespace-nowrap font-mono text-[11px] text-amber-100/85 sm:text-xs">
          {formatExpeditionTime(timeOfDay)}
        </span>
        <span className="hidden text-amber-100/35 sm:inline">|</span>
        <span className="hidden truncate text-[11px] text-sky-100/85 sm:inline">
          {zone.shortName || zone.name}
        </span>
      </div>
    </div>
  );
}

function ToolBelt() {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  return (
    <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-md border border-white/15 bg-stone-950/55 p-1.5 shadow-xl backdrop-blur-md">
      {threeTools.map((tool, index) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => setActiveTool(tool.id)}
          className={`relative flex h-10 min-w-10 items-center justify-center rounded border px-2 text-sm transition ${
            activeToolId === tool.id
              ? 'border-amber-200 bg-amber-200 text-stone-950 shadow-[0_0_18px_rgba(253,230,138,0.28)]'
              : 'border-white/10 bg-black/15 text-amber-50 hover:bg-white/15'
          }`}
          title={`${index + 1}: ${tool.name}`}
        >
          <span className="text-base">{tool.icon}</span>
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded bg-black/65 text-[9px] font-bold text-white">{index + 1}</span>
        </button>
      ))}
    </div>
  );
}

function NarrativePanel({ expanded, onToggleExpanded }) {
  const message = useThreeGameStore(state => state.message);
  const educationalNote = useThreeGameStore(state => state.educationalNote);
  const sounds = useThreeGameStore(state => state.sounds);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);

  return (
    <div className={`pointer-events-auto rounded-md border border-white/15 bg-stone-950/58 p-2.5 font-serif text-amber-50 shadow-2xl backdrop-blur-md md:p-3 ${expanded ? 'max-w-3xl' : 'max-w-xl'}`}>
      <div className="flex items-start gap-2">
        <p className={`${expanded ? 'max-h-[5.2rem]' : 'max-h-[2.75rem]'} flex-1 overflow-hidden text-xs leading-relaxed md:text-base`}>{message}</p>
        <button type="button" onClick={onToggleExpanded} className="rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-100/80 hover:bg-white/10">
          {expanded ? 'Less' : 'More'}
        </button>
      </div>
      {expanded && educationalNote && (
        <p className="mt-2 max-h-[2.8rem] overflow-hidden border-l-2 border-amber-300/70 pl-3 text-xs italic text-amber-100/85 md:text-sm">{educationalNote}</p>
      )}
      {expanded && sounds?.length > 0 && (
        <p className="mt-2 text-xs uppercase tracking-wide text-sky-100/75">Sounds: {sounds.join(' | ')}</p>
      )}
      <button
        type="button"
        onClick={() => nearby && collectNearby()}
        className="sr-only"
        disabled={!nearby}
      >
        Use {tool?.name || 'tool'}
      </button>
    </div>
  );
}

function InteractionPrompt() {
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const edgePrompt = useThreeGameStore(state => state.edgePrompt);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  if (carryPrompt) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-[42%] w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded border border-amber-200/35 bg-stone-950/68 px-3 py-2 text-center shadow-xl sm:left-[calc(50%+11rem)] sm:top-[56%]">
        <div className="truncate text-xs font-bold text-amber-50 sm:text-sm">{carryPrompt.label}</div>
        <div className="mt-1.5 rounded bg-amber-200 px-3 py-1 text-xs font-bold text-stone-950 sm:text-sm">
          {carryPrompt.text}
        </div>
      </div>
    );
  }
  if (!nearby && !edgePrompt) return null;
  if (!nearby && edgePrompt) {
    const isOpen = edgePrompt.kind === 'open';
    return (
      <div className="pointer-events-auto absolute left-1/2 top-[42%] w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded border border-amber-200/35 bg-stone-950/68 px-3 py-2 text-center shadow-xl sm:left-[calc(50%+11rem)] sm:top-[56%]">
        <div className="truncate text-xs font-bold text-amber-50 sm:text-sm">{edgePrompt.label}</div>
        <div className="line-clamp-2 text-[11px] italic text-amber-100/75">{edgePrompt.message || edgePrompt.description}</div>
        {isOpen && (
          <div className="mt-1.5 rounded bg-amber-200 px-3 py-1 text-xs font-bold text-stone-950 sm:text-sm">
            E - travel
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[42%] w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded border border-amber-200/35 bg-stone-950/62 px-3 py-2 text-center shadow-xl sm:left-[calc(50%+11rem)] sm:top-[56%]">
      <div className="truncate text-xs font-bold text-amber-50 sm:text-sm">{nearby.name}</div>
      <div className="truncate text-[11px] italic text-amber-100/75">{nearby.latin}</div>
      <button
        type="button"
        onClick={() => collectNearby()}
        className="mt-1.5 rounded bg-amber-200 px-3 py-1 text-xs font-bold text-stone-950 hover:bg-amber-100 sm:text-sm"
      >
        E - use {tool?.name || 'tool'}
      </button>
    </div>
  );
}

function TouchButton({ control, label, className = '' }) {
  const start = event => {
    event.preventDefault();
    setTouchControl(control, true);
  };
  const stop = event => {
    event.preventDefault();
    setTouchControl(control, false);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      className={`flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-stone-950/58 text-sm font-bold text-amber-50 shadow-lg backdrop-blur active:bg-amber-200 active:text-stone-950 ${className}`}
    >
      {label}
    </button>
  );
}

function MobileTouchControls() {
  return (
    <div className="pointer-events-auto absolute bottom-[4.85rem] left-3 flex items-end gap-2 md:hidden">
      <div className="grid grid-cols-3 gap-1">
        <div />
        <TouchButton control="forward" label="W" className="h-9 w-9 text-xs" />
        <div />
        <TouchButton control="left" label="A" className="h-9 w-9 text-xs" />
        <TouchButton control="backward" label="S" className="h-9 w-9 text-xs" />
        <TouchButton control="right" label="D" className="h-9 w-9 text-xs" />
      </div>
      <div className="grid grid-cols-1 gap-1">
        <TouchButton control="jump" label="J" className="h-9 w-9 text-xs" />
        <TouchButton control="dodge" label="B" className="h-9 w-9 text-xs" />
        <TouchButton control="run" label="R" className="h-9 w-9 text-xs" />
        <TouchButton control="interact" label="E" className="h-9 w-9 bg-amber-200/85 text-stone-950 text-xs" />
      </div>
      <div className="grid grid-cols-1 gap-1">
        <TouchButton control="crouch" label="Q" className="h-9 w-9 text-xs" />
        <TouchButton control="rifle" label="Aim" className="h-9 w-11 text-[10px]" />
      </div>
    </div>
  );
}

export function ThreeHUD({ onTogglePerf }) {
  const [panel, setPanel] = useState(null);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const curiosity = useThreeGameStore(state => state.curiosity);
  const questComplete = useThreeGameStore(state => state.questComplete);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const rest = useThreeGameStore(state => state.rest);
  const symsLine = useThreeGameStore(state => state.symsLine);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const collectedCount = useThreeGameStore(state => state.collectedSpecimenIds.length);
  const journalCount = useThreeGameStore(state => state.journal.length);
  const zone = getZone(currentZoneId);

  const objective = useMemo(() => {
    if (questComplete) return 'Quest complete: return to Syms with specimen evidence.';
    return 'Quest: collect or document one animal, plant, or mineral sample.';
  }, [questComplete]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <TopChronometer />

      <div className="absolute left-3 top-3 w-[min(17rem,calc(100vw-7.5rem))] rounded-md border border-white/20 bg-stone-950/62 p-2.5 text-amber-50 shadow-xl backdrop-blur-md">
        <div className="font-serif text-base font-bold text-amber-50 sm:text-lg">Young Darwin 3D</div>
        <p className="mt-1 text-xs text-amber-100/75">{zone.name}, {zone.island} | September 1835</p>
        <div className="mt-2 grid gap-1.5">
          <Bar label="Health" value={health} color="bg-emerald-400" />
          <Bar label="Fatigue" value={fatigue} color="bg-orange-400" />
          <Bar label="Curiosity" value={curiosity} color="bg-sky-300" />
        </div>
      </div>

      <div className="absolute right-3 top-3">
        <LocalMap />
      </div>

      <InteractionPrompt />

      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45 shadow-[0_0_12px_rgba(255,255,255,0.35)]">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 md:right-auto md:w-[39rem] lg:w-[45rem]">
        <NarrativePanel expanded={narrativeExpanded} onToggleExpanded={() => setNarrativeExpanded(value => !value)} />
        <ToolBelt />
      </div>

      <div className="pointer-events-auto absolute bottom-3 right-3 hidden max-w-[17rem] flex-col gap-2 rounded-md border border-white/15 bg-stone-950/62 p-2.5 text-sm text-amber-50 shadow-xl backdrop-blur-md lg:flex">
        <div className="font-serif text-sm font-bold">{objective}</div>
        <p className="max-h-9 overflow-hidden text-xs italic text-amber-100/80">{symsLine}</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs text-amber-50/85">
          <span>Specimens: {collectedCount}</span>
          <span>Notes: {journalCount}</span>
          <span>View: {viewMode}</span>
          <span>Syms nearby</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => setPanel('journal')} className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20">Journal</button>
          <button type="button" onClick={() => setPanel('inventory')} className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20">Inventory</button>
          <button type="button" onClick={cycleViewMode} className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20">Camera</button>
          <button type="button" onClick={rest} className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20">Rest</button>
        </div>
        <div className="grid max-h-28 gap-1 overflow-auto">
          {zone.neighbors.map(route => (
            <button
              key={route.zoneId}
              type="button"
              onClick={() => beginZoneTransition(route.zoneId, { entryEdge: route.edge ? ({ north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', northwest: 'southeast', southeast: 'northwest', southwest: 'northeast' }[route.edge]) : null })}
              className="rounded border border-amber-200/20 bg-white/5 px-2 py-1 text-left text-[11px] text-amber-100/80 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {route.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onTogglePerf} className="rounded border border-white/10 px-2 py-1 text-xs text-amber-100/75 hover:bg-white/10">Toggle perf</button>
        <p className="text-[11px] leading-relaxed text-amber-100/60">WASD move | E interact/pick up | Space jump | B roll | Z/X camera, tap while still to turn | A/D sidestep while crouched or aiming | Q crouch | R rifle | F fire | H hammer | N net | G gather | Y write | I inspect | V climb | P pray</p>
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-3 flex gap-1.5 lg:hidden">
        <button type="button" onClick={() => setPanel('journal')} className="rounded-md border border-white/15 bg-stone-950/60 px-3 py-2 text-xs font-bold backdrop-blur">Journal</button>
        <button type="button" onClick={() => setPanel('inventory')} className="rounded-md border border-white/15 bg-stone-950/60 px-3 py-2 text-xs font-bold backdrop-blur">Case</button>
        <button type="button" onClick={cycleViewMode} className="rounded-md border border-white/15 bg-stone-950/60 px-3 py-2 text-xs font-bold backdrop-blur">Cam</button>
      </div>

      <MobileTouchControls />

      <FieldNotebook panel={panel} onClose={() => setPanel(null)} />
      <ZoneTransitionOverlay />
    </div>
  );
}
