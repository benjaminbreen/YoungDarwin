'use client';

import React, { useMemo, useState } from 'react';
import { FieldNotebook } from '../../field-notebook/FieldNotebook';
import { getThreeSpecimens, threeTools } from '../data';
import { setTouchControl } from '../input/touchControls';
import { useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { ZoneTransitionOverlay } from './ZoneTransitionOverlay';
import {
  ExpeditionPanel,
  PanelTabs,
  GOLD_LABEL,
  GOLD_BUTTON,
  GOLD_BUTTON_SOLID,
} from './expedition/ExpeditionPanel';
import {
  CompassRoseIcon,
  HeartIcon,
  FatigueIcon,
  CuriosityIcon,
  ButterflyIcon,
  NoteIcon,
  OpenBookIcon,
  MapIcon,
  NorthArrowIcon,
  TOOL_ICONS,
} from './expedition/icons';
import { useTerrainChart } from './expedition/TerrainMinimap';
import { GalapagosGlobe } from './expedition/GalapagosGlobe';

const ROUTE_ENTRY_EDGES = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  northeast: 'southwest',
  northwest: 'southeast',
  southeast: 'northwest',
  southwest: 'northeast',
};

function clampPercent(value) {
  return Math.max(6, Math.min(94, value));
}

function worldToMapPercent(position, zone) {
  const size = zone.terrainSize || zone.bounds * 2 || 100;
  const half = size / 2;
  return {
    x: clampPercent(((position.x + half) / size) * 100),
    y: clampPercent(((position.z + half) / size) * 100),
  };
}

function routePosition(edge) {
  const positions = {
    north: { x: 50, y: 6 },
    south: { x: 50, y: 94 },
    east: { x: 94, y: 50 },
    west: { x: 6, y: 50 },
    northeast: { x: 86, y: 14 },
    northwest: { x: 14, y: 14 },
    southeast: { x: 86, y: 86 },
    southwest: { x: 14, y: 86 },
  };
  return positions[edge] || { x: 50, y: 50 };
}

function directionDegrees(facing) {
  return Math.atan2(facing.x || 0, facing.z || -1) * (180 / Math.PI);
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

// ---------------------------------------------------------------------------
// Top banner

function TopChronometer() {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);

  return (
    <div className="absolute left-1/2 top-3 w-[min(29rem,calc(100vw-8rem))] -translate-x-1/2 text-center sm:w-[min(32rem,calc(100vw-24rem))] xl:hidden">
      <div className="pointer-events-none inline-flex max-w-full items-center gap-2 rounded-full border border-expedition-brass/70 bg-[rgba(20,17,12,0.52)] px-3.5 py-1.5 font-expedition text-expedition-parchment shadow-lg backdrop-blur-md">
        <CompassRoseIcon className="hidden h-3.5 w-3.5 text-expedition-gold sm:block" />
        <span className="truncate text-xs font-semibold tracking-wide sm:text-sm">
          {formatExpeditionDate(day)}
        </span>
        <span className="text-expedition-brass">|</span>
        <span className="whitespace-nowrap text-[11px] text-expedition-faded sm:text-xs">
          {formatExpeditionTime(timeOfDay)}
        </span>
        <span className="hidden text-expedition-brass sm:inline">|</span>
        <span className="hidden truncate text-[11px] text-expedition-gold sm:inline">
          {zone.shortName || zone.name}
        </span>
      </div>
    </div>
  );
}

function TopObjective({ objective }) {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);

  return (
    <div className="absolute left-1/2 top-3 hidden w-[min(36rem,calc(100vw-42rem))] min-w-[22rem] -translate-x-1/2 text-center xl:block">
      <ExpeditionPanel interactive={false} innerClassName="flex items-center gap-3 px-4 py-2.5">
        <CompassRoseIcon className="h-7 w-7 shrink-0 text-expedition-gold" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-wide text-expedition-parchment">{objective}</div>
          <div className="mt-0.5 flex items-center justify-center gap-2 text-[11.5px] text-expedition-faded">
            <span className="truncate">{zone.name}</span>
            <span className="text-expedition-brass">|</span>
            <span>{formatExpeditionDate(day)}</span>
            <span className="text-expedition-brass">|</span>
            <span>{formatExpeditionTime(timeOfDay)}</span>
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vitals

function StatBar({ icon: Icon, label, value, fill }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[1.4rem_1fr] items-center gap-x-2.5">
      <Icon className="h-[1.15rem] w-[1.15rem] text-expedition-gold" />
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-expedition-parchment/90">{label}</span>
          <span className="text-xs font-semibold text-expedition-parchment">{Math.round(safeValue)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/45 ring-1 ring-expedition-brass/40">
          <div className="h-full rounded-full" style={{ width: `${safeValue}%`, background: fill }} />
        </div>
      </div>
    </div>
  );
}

function VitalStatusPanel() {
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const curiosity = useThreeGameStore(state => state.curiosity);

  return (
    <ExpeditionPanel className="w-[13rem] sm:w-[17.5rem]" innerClassName="grid gap-2.5 px-3.5 py-3">
      <StatBar icon={HeartIcon} label="Health" value={health} fill="linear-gradient(90deg,#5f9e6a,#8fc491)" />
      <StatBar icon={FatigueIcon} label="Fatigue" value={fatigue} fill="linear-gradient(90deg,#b3812f,#e0aa4e)" />
      <StatBar icon={CuriosityIcon} label="Curiosity" value={curiosity} fill="linear-gradient(90deg,#4f93a8,#84c4d4)" />
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Minimap

function IslandOverview({ zoneName }) {
  return (
    <div className="relative h-full w-full bg-[#1d2a2e]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="expWater" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3d6f7d" />
            <stop offset="1" stopColor="#1c4250" />
          </linearGradient>
          <linearGradient id="expLand" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#cdb083" />
            <stop offset="0.55" stopColor="#9c8a5e" />
            <stop offset="1" stopColor="#5d5b40" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#expWater)" />
        <path d="M24 12 C45 3 74 12 86 33 C97 54 82 81 56 88 C31 94 10 74 13 48 C15 31 13 20 24 12Z" fill="url(#expLand)" />
        <path d="M25 22 C42 14 64 20 76 35 C86 48 79 65 61 74 C43 82 24 73 21 55 C19 42 16 29 25 22Z" fill="none" stroke="#39301d" strokeWidth="0.9" opacity="0.4" />
        <path d="M32 30 C45 24 61 29 69 40 C76 50 70 62 57 68 C43 74 30 67 28 54 C27 45 25 36 32 30Z" fill="none" stroke="#39301d" strokeWidth="0.8" opacity="0.32" />
        <path d="M41 39 C50 35 59 39 63 47 C67 55 62 62 53 64 C45 66 38 61 37 53 C36 47 36 42 41 39Z" fill="none" stroke="#39301d" strokeWidth="0.75" opacity="0.26" />
        <circle cx="62" cy="30" r="2.6" fill="#e3c585" stroke="#14110c" strokeWidth="0.8" />
      </svg>
      <div className="absolute bottom-1.5 left-0 right-0 text-center font-expedition text-[10px] italic text-expedition-parchment/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        {zoneName} — Charles Island
      </div>
    </div>
  );
}

function MapOverlays({ zone, zoom = 1, focus = null }) {
  const collected = useThreeGameStore(state => state.collectedSpecimenIds);
  const documented = useThreeGameStore(state => state.documentedSpecimenIds);
  const selected = useThreeGameStore(state => state.selectedSpecimenId);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const playerPose = useThreeGameStore(state => state.playerPose);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const specimens = getThreeSpecimens(zone.id);
  const player = worldToMapPercent(playerPose.position || { x: 0, z: 0 }, zone);
  const heading = directionDegrees(playerPose.facing || { x: 0, z: -1 });

  // When zoomed, re-project map percentages so `focus` sits at the center.
  const project = point => {
    if (zoom === 1 || !focus) return point;
    return {
      x: 50 + (point.x - focus.x) * zoom,
      y: 50 + (point.y - focus.y) * zoom,
    };
  };
  const visible = point => point.x > -4 && point.x < 104 && point.y > -4 && point.y < 104;

  return (
    <>
      {zoom === 1 && zone.neighbors.map(route => {
        const point = routePosition(route.edge || route.exit);
        return (
          <button
            key={route.zoneId}
            type="button"
            onClick={() => beginZoneTransition(route.zoneId, { entryEdge: ROUTE_ENTRY_EDGES[route.edge] || null })}
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-goldbright bg-expedition-gold/85 text-[0] shadow-[0_0_10px_rgba(227,197,133,0.5)] transition hover:bg-expedition-goldbright"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={route.label}
          >
            {route.label}
          </button>
        );
      })}
      {specimens.map(specimen => {
        const [x, , z] = specimen.spawnPoint || [0, 0, 0];
        const point = project(worldToMapPercent({ x, z }, zone));
        if (!visible(point)) return null;
        const isCollected = collected.includes(specimen.id);
        const isDocumented = documented.includes(specimen.id);
        const isSelected = selected === specimen.id || nearbySpecimenId === specimen.id;
        return (
          <span
            key={specimen.id}
            className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow ${
              isSelected
                ? 'border-expedition-ink bg-expedition-goldbright ring-2 ring-expedition-goldbright/60'
                : isCollected || isDocumented
                  ? 'border-emerald-950 bg-emerald-300/90'
                  : 'border-expedition-ink/80 bg-rose-300/95'
            }`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={specimen.name}
          />
        );
      })}
      <span
        className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-expedition-goldbright/90 bg-expedition-ink/68 shadow-lg"
        style={{
          left: `${zoom === 1 ? player.x : 50}%`,
          top: `${zoom === 1 ? player.y : 50}%`,
          transform: `translate(-50%, -50%) rotate(${heading}deg)`,
        }}
        title="Darwin"
      >
        <span className="h-0 w-0 border-b-[7px] border-l-[3.5px] border-r-[3.5px] border-b-expedition-goldbright border-l-transparent border-r-transparent" />
      </span>
    </>
  );
}

function GameplayMinimap() {
  const [view, setView] = useState('local');
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playerPose = useThreeGameStore(state => state.playerPose);
  const zone = getZone(currentZoneId);
  const chartUrl = useTerrainChart(zone);
  const player = worldToMapPercent(playerPose.position || { x: 0, z: 0 }, zone);
  const zoom = view === 'darwin' ? 2.4 : 1;

  return (
    <ExpeditionPanel className="w-[10rem] sm:w-[17.75rem]" innerClassName="p-2 sm:p-2">
      <PanelTabs
        className="hidden sm:flex"
        tabs={[
          { id: 'local', label: 'Local' },
          { id: 'island', label: 'Island' },
          { id: 'globe', label: 'Globe' },
        ]}
        active={view}
        onSelect={setView}
      />
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1.5">
        <div className="min-w-0 truncate font-expedition text-[13px] font-semibold tracking-wide text-expedition-parchment">
          {zone.shortName || zone.name}
        </div>
        <CompassRoseIcon className="h-4 w-4 shrink-0 text-expedition-gold/80" />
      </div>
      <div className="relative aspect-square overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#27505d] shadow-[inset_0_0_18px_rgba(0,0,0,0.55)]">
        {view === 'globe' ? (
          <GalapagosGlobe />
        ) : view === 'island' ? (
          <IslandOverview zoneName={zone.shortName || zone.name} />
        ) : (
          <>
            {chartUrl ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${chartUrl})`,
                  backgroundSize: `${zoom * 100}%`,
                  backgroundPosition: zoom === 1 ? 'center' : `${player.x}% ${player.y}%`,
                  imageRendering: 'auto',
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-[#27505d]" />
            )}
            {/* aged-chart wash + vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_58%,rgba(10,8,5,0.42)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(227,197,133,0.10),transparent_45%,rgba(10,8,5,0.16))]" />
            <MapOverlays zone={zone} zoom={zoom} focus={player} />
          </>
        )}
        <span className="absolute bottom-1 right-1.5 flex items-center text-expedition-parchment/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
          <NorthArrowIcon className="h-3.5 w-3.5" />
          <span className="font-expedition text-[10px] font-semibold">N</span>
        </span>
      </div>
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Hotbar

function ToolBelt() {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  return (
    <ExpeditionPanel className="max-w-[min(35rem,calc(100vw-1.5rem))]" innerClassName="flex flex-wrap justify-center gap-1.5 p-2">
      {threeTools.map((tool, index) => {
        const Icon = TOOL_ICONS[tool.id];
        const active = activeToolId === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActiveTool(tool.id)}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-sm border transition focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${
              active
                ? 'border-expedition-goldbright bg-expedition-gold/30 text-expedition-goldbright shadow-[0_0_16px_rgba(227,197,133,0.35),inset_0_1px_0_rgba(227,197,133,0.4)]'
                : 'border-expedition-brass/55 bg-black/25 text-expedition-parchment/85 hover:border-expedition-gold hover:bg-expedition-gold/15'
            }`}
            title={`${index + 1}: ${tool.name}`}
          >
            {Icon ? <Icon className="h-7 w-7" /> : <span className="text-base">{tool.icon}</span>}
            <span className="pointer-events-none absolute left-0.5 top-0.5 font-expedition text-[10px] font-semibold text-expedition-gold/90">
              {index + 1}
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 max-w-[9rem] -translate-x-1/2 whitespace-nowrap rounded-sm border border-expedition-brass/60 bg-expedition-ink/90 px-2 py-1 font-expedition text-[11px] text-expedition-parchment opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
              {tool.name}
            </span>
          </button>
        );
      })}
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Narration

function SpeakerLine({ speaker, icon, portrait, children }) {
  return (
    <div className="grid grid-cols-[2.4rem_1fr] gap-2.5 border-t border-expedition-brass/30 pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-expedition-brass/70 bg-black/20 text-expedition-gold shadow-[inset_0_0_8px_rgba(0,0,0,0.6)]">
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portrait} alt={speaker} className="h-full w-full object-cover sepia-[0.35]" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0">
        <div className={`mb-0.5 ${GOLD_LABEL}`}>{speaker}</div>
        <div className="font-expedition text-[14.5px] leading-relaxed text-expedition-parchment">{children}</div>
      </div>
    </div>
  );
}

function NarrativePanel() {
  const [draft, setDraft] = useState('');
  const [localEcho, setLocalEcho] = useState('');
  const message = useThreeGameStore(state => state.message);
  const educationalNote = useThreeGameStore(state => state.educationalNote);
  const sounds = useThreeGameStore(state => state.sounds);
  const symsLine = useThreeGameStore(state => state.symsLine);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  const handleSubmit = event => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setLocalEcho(trimmed);
    setDraft('');
  };

  return (
    <ExpeditionPanel className="w-[min(31rem,calc(100vw-1.5rem))]" innerClassName="p-4">
      <div className="grid max-h-[12.5rem] gap-2.5 overflow-hidden">
        <SpeakerLine speaker="Narrator" icon={<CompassRoseIcon className="h-5 w-5" />}>{message}</SpeakerLine>
        <SpeakerLine speaker="Syms Covington" portrait="/portraits/syms_covington.jpg">{symsLine}</SpeakerLine>
        {educationalNote && (
          <SpeakerLine speaker="Field Note" icon={<OpenBookIcon className="h-5 w-5" />}>{educationalNote}</SpeakerLine>
        )}
        {localEcho && (
          <SpeakerLine speaker="You" icon={<NoteIcon className="h-5 w-5" />}>{localEcho}</SpeakerLine>
        )}
      </div>
      {sounds?.length > 0 && (
        <div className="mt-2.5 truncate border-t border-expedition-brass/30 pt-2 text-[10px] uppercase tracking-[0.16em] text-expedition-faded">
          Sounds: {sounds.join(' | ')}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2 border-t border-expedition-brass/30 pt-3">
        <input
          type="text"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-expedition-brass/55 bg-black/25 px-3 py-2 font-expedition text-sm text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-faded/80 focus:border-expedition-gold focus:bg-black/20 focus:ring-1 focus:ring-expedition-gold/40"
          placeholder="Ask the narrator..."
        />
        <button type="submit" className={`${GOLD_BUTTON_SOLID} h-9 uppercase`}>
          Send
        </button>
      </form>
      <button
        type="button"
        onClick={() => nearby && collectNearby()}
        className="sr-only"
        disabled={!nearby}
      >
        Use {tool?.name || 'tool'}
      </button>
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Right-hand field operations panel

function CountChip({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-expedition-brass/50 bg-black/25 px-2 py-1.5">
      <Icon className="h-5 w-5 shrink-0 text-expedition-gold" />
      <div className="min-w-0">
        <div className="font-expedition text-sm font-semibold leading-none text-expedition-parchment">{value}</div>
        <div className="mt-0.5 truncate text-[8.5px] uppercase tracking-[0.14em] text-expedition-faded">{label}</div>
      </div>
    </div>
  );
}

function ObjectivesTab({ objective, onOpenPanel }) {
  const rest = useThreeGameStore(state => state.rest);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const collectedCount = useThreeGameStore(state => state.collectedSpecimenIds.length);
  const journalCount = useThreeGameStore(state => state.journal.length);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const zone = getZone(currentZoneId);
  const compactObjective = objective.replace('one animal, plant, or mineral sample', 'one specimen');

  return (
    <div className="grid gap-2.5">
      <div className="max-w-full overflow-hidden break-words font-expedition text-[14px] font-semibold leading-snug text-expedition-parchment">
        {compactObjective}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <CountChip icon={ButterflyIcon} label="Specimens" value={collectedCount} />
        <CountChip icon={NoteIcon} label="Notes" value={journalCount} />
      </div>
      <div className="flex items-center gap-2.5 rounded-sm border border-expedition-brass/50 bg-black/25 px-2.5 py-2">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-expedition-brass/70">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/portraits/syms_covington.jpg" alt="Syms Covington" className="h-full w-full object-cover sepia-[0.35]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-expedition text-[13px] font-semibold text-expedition-parchment">Syms</span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          </div>
          <p className="truncate font-expedition text-[11.5px] italic text-expedition-faded">Labels ready. Nearby.</p>
        </div>
      </div>
      {zone.neighbors.length > 0 && (
        <div>
          <div className={`${GOLD_LABEL} mb-1.5 text-center`}>Nearby Objectives</div>
          <div className="grid max-h-32 gap-1 overflow-auto pr-0.5">
            {zone.neighbors.map(route => (
              <button
                key={route.zoneId}
                type="button"
                onClick={() => beginZoneTransition(route.zoneId, { entryEdge: ROUTE_ENTRY_EDGES[route.edge] || null })}
                className="group flex items-center gap-2 rounded-sm border border-expedition-brass/45 bg-black/20 px-2.5 py-1.5 text-left transition hover:border-expedition-gold hover:bg-expedition-gold/10"
              >
                <CompassRoseIcon className="h-[1.1rem] w-[1.1rem] shrink-0 text-expedition-gold/80 group-hover:text-expedition-goldbright" />
                <span className="min-w-0">
                  <span className="block truncate font-expedition text-[12.5px] font-medium text-expedition-parchment">{route.label}</span>
                  <span className="text-[10.5px] text-expedition-faded">{route.minutes || 0}m &middot; +{route.fatigue || 0} fatigue</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => onOpenPanel('journal')} className={GOLD_BUTTON}>
          <span className="inline-flex items-center justify-center gap-1.5"><MapIcon className="h-4 w-4" />View on Map</span>
        </button>
        <button type="button" onClick={rest} className={GOLD_BUTTON}>Rest</button>
      </div>
      <button type="button" onClick={cycleViewMode} className="justify-self-center text-[10.5px] uppercase tracking-[0.14em] text-expedition-faded transition hover:text-expedition-gold">
        Camera: {viewMode}
      </button>
    </div>
  );
}

function SpecimensTab() {
  const collected = useThreeGameStore(state => state.collectedSpecimenIds);
  const documented = useThreeGameStore(state => state.documentedSpecimenIds);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const specimens = getThreeSpecimens(currentZoneId);

  return (
    <div className="grid max-h-72 gap-1.5 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)]">
      {specimens.map(specimen => {
        const isCollected = collected.includes(specimen.id);
        const isDocumented = documented.includes(specimen.id);
        const done = isCollected || isDocumented;
        return (
          <div
            key={specimen.id}
            className={`flex min-w-0 items-center gap-2 rounded-sm border px-2.5 py-2 ${
              done
                ? 'border-emerald-300/45 bg-emerald-950/18'
                : 'border-expedition-brass/40 bg-black/20'
            }`}
          >
            <ButterflyIcon className={`h-[1.1rem] w-[1.1rem] shrink-0 ${done ? 'text-emerald-300' : 'text-expedition-gold/70'}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-expedition text-[12.5px] font-medium text-expedition-parchment">{specimen.name}</div>
              <div className="truncate font-expedition text-[10.5px] italic text-expedition-faded">{specimen.latin}</div>
            </div>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] ${
              done
                ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-200'
                : 'border-expedition-brass/30 text-expedition-faded/70'
            }`}>
              {isDocumented ? 'documented' : isCollected ? 'collected' : 'at large'}
            </span>
          </div>
        );
      })}
      {specimens.length === 0 && (
        <p className="px-2 py-3 text-center font-expedition text-xs italic text-expedition-faded">No recorded specimens in this survey area.</p>
      )}
    </div>
  );
}

function InventoryTab({ onOpenPanel }) {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);

  return (
    <div className="grid gap-2">
      <div className="grid max-h-60 gap-1.5 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)]">
        {threeTools.map((tool, index) => {
          const Icon = TOOL_ICONS[tool.id];
          const active = activeToolId === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              className={`group flex min-w-0 items-center gap-2.5 rounded-sm border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-expedition-gold bg-expedition-gold/18 shadow-[inset_0_1px_0_rgba(227,197,133,0.18)]'
                  : 'border-expedition-brass/40 bg-black/20 hover:border-expedition-gold/70 hover:bg-expedition-gold/8'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${
                active
                  ? 'border-expedition-gold/70 bg-expedition-gold/15 text-expedition-goldbright'
                  : 'border-expedition-brass/35 bg-black/20 text-expedition-gold'
              }`}>
                {Icon ? <Icon className="h-5 w-5" /> : <span>{tool.icon}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-expedition text-[12.5px] font-medium text-expedition-parchment">{tool.name}</span>
                <span className="block max-w-full truncate text-[10px] leading-snug text-expedition-faded">{tool.description}</span>
              </span>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 font-expedition text-[10px] ${
                active
                  ? 'border-expedition-gold/70 bg-expedition-gold/20 text-expedition-goldbright'
                  : 'border-expedition-brass/35 text-expedition-gold/80'
              }`}>
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onOpenPanel('inventory')} className={GOLD_BUTTON}>
        Open Specimen Case
      </button>
    </div>
  );
}

function FieldOpsPanel({ objective, onOpenPanel }) {
  const [tab, setTab] = useState('objectives');

  return (
    <ExpeditionPanel className="hidden w-[20rem] xl:block" innerClassName="p-3">
      <PanelTabs
        tabs={[
          { id: 'objectives', label: 'Objectives' },
          { id: 'specimens', label: 'Specimens' },
          { id: 'inventory', label: 'Inventory' },
        ]}
        active={tab}
        onSelect={setTab}
      />
      <div className="pt-2.5">
        {tab === 'objectives' && <ObjectivesTab objective={objective} onOpenPanel={onOpenPanel} />}
        {tab === 'specimens' && <SpecimensTab />}
        {tab === 'inventory' && <InventoryTab onOpenPanel={onOpenPanel} />}
      </div>
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Prompts + touch controls

function InteractionPrompt() {
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const edgePrompt = useThreeGameStore(state => state.edgePrompt);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  const promptShell =
    'rounded-md border border-expedition-brass/80 bg-expedition-ink/68 px-3 py-2 text-center font-expedition shadow-[0_12px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm';
  if (carryPrompt) {
    return (
      <div className={`pointer-events-none absolute left-1/2 top-[42%] w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 sm:left-[calc(50%+11rem)] sm:top-[56%] ${promptShell}`}>
        <div className="truncate text-xs font-bold text-expedition-parchment sm:text-sm">{carryPrompt.label}</div>
        <div className="mt-1.5 rounded-sm bg-expedition-gold px-3 py-1 text-xs font-bold text-expedition-ink sm:text-sm">
          {carryPrompt.text}
        </div>
      </div>
    );
  }
  if (!nearby && !edgePrompt) return null;
  if (!nearby && edgePrompt) {
    const isOpen = edgePrompt.kind === 'open';
    return (
      <div className={`pointer-events-auto absolute left-1/2 top-[42%] w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 sm:left-[calc(50%+11rem)] sm:top-[56%] ${promptShell}`}>
        <div className="truncate text-xs font-bold text-expedition-parchment sm:text-sm">{edgePrompt.label}</div>
        <div className="line-clamp-2 text-[11px] italic text-expedition-faded">{edgePrompt.message || edgePrompt.description}</div>
        {isOpen && (
          <div className="mt-1.5 rounded-sm bg-expedition-gold px-3 py-1 text-xs font-bold text-expedition-ink sm:text-sm">
            E - travel
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`pointer-events-auto absolute left-1/2 top-[42%] w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 sm:left-[calc(50%+11rem)] sm:top-[56%] ${promptShell}`}>
      <div className="truncate text-xs font-bold text-expedition-parchment sm:text-sm">{nearby.name}</div>
      <div className="truncate text-[11px] italic text-expedition-faded">{nearby.latin}</div>
      <button
        type="button"
        onClick={() => collectNearby()}
        className="mt-1.5 rounded-sm bg-expedition-gold px-3 py-1 text-xs font-bold text-expedition-ink transition hover:bg-expedition-goldbright sm:text-sm"
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
      className={`flex h-11 w-11 items-center justify-center rounded-md border border-expedition-brass/70 bg-expedition-ink/65 font-expedition text-sm font-bold text-expedition-parchment shadow-lg backdrop-blur-md active:bg-expedition-gold active:text-expedition-ink ${className}`}
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
        <TouchButton control="interact" label="E" className="h-9 w-9 bg-expedition-gold/90 text-expedition-ink text-xs" />
      </div>
      <div className="grid grid-cols-1 gap-1">
        <TouchButton control="crouch" label="Q" className="h-9 w-9 text-xs" />
        <TouchButton control="rifle" label="Aim" className="h-9 w-11 text-[10px]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ThreeHUD({ onTogglePerf }) {
  const [panel, setPanel] = useState(null);
  const questComplete = useThreeGameStore(state => state.questComplete);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);

  const objective = useMemo(() => {
    if (questComplete) return 'Quest complete: return to Syms with specimen evidence.';
    return 'Quest: collect or document one animal, plant, or mineral sample.';
  }, [questComplete]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-expedition">
      <TopChronometer />
      <TopObjective objective={objective} />

      <div className="absolute left-3 top-3">
        <VitalStatusPanel />
      </div>

      <div className="absolute right-3 top-3">
        <GameplayMinimap />
      </div>

      <InteractionPrompt />

      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-goldbright/40 shadow-[0_0_10px_rgba(227,197,133,0.25)]">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-expedition-goldbright/70" />
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 md:right-auto md:w-[31rem]">
        <NarrativePanel />
      </div>

      <div className="absolute bottom-[5.25rem] left-1/2 hidden -translate-x-1/2 justify-center md:flex lg:bottom-3">
        <ToolBelt />
      </div>

      <div className="absolute bottom-3 right-3">
        <FieldOpsPanel objective={objective} onOpenPanel={setPanel} />
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-3 flex gap-1.5 xl:hidden">
        <button type="button" onClick={() => setPanel('journal')} className={GOLD_BUTTON}>Journal</button>
        <button type="button" onClick={() => setPanel('inventory')} className={GOLD_BUTTON}>Case</button>
        <button type="button" onClick={cycleViewMode} className={GOLD_BUTTON}>{viewMode}</button>
      </div>

      <MobileTouchControls />

      <FieldNotebook panel={panel} onClose={() => setPanel(null)} />
      <ZoneTransitionOverlay />
    </div>
  );
}
