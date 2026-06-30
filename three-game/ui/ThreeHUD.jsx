'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { getInventoryItem } from '../../data/inventoryItems';
import { FieldNotebook } from '../../field-notebook/FieldNotebook';
import { getThreeSpecimens, threeTools } from '../data';
import { setTouchControl, triggerToolUse } from '../input/touchControls';
import { setBlockingUiMode, setTypingMode } from '../input/typingMode';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getZone } from '../world/floreanaZones';
import { StatusView } from './StatusView';
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
  LensIcon,
  NorthArrowIcon,
  TOOL_ICONS,
} from './expedition/icons';
import { useTerrainChart } from './expedition/TerrainMinimap';
import { GalapagosGlobe } from './expedition/GalapagosGlobe';
import { InventoryModal } from './expedition/InventoryModal';
import { SpecimenDetailModal } from './expedition/SpecimenDetailModal';
import { IslandMapModal } from './expedition/map/IslandMapModal';
import { ISLAND_MAP_IMAGE, getIslandMapLocation } from './expedition/map/islandLocations';
import { rarityLabel } from '../world/inspectables';
import { WEATHER_STATES } from '../world/weatherStates';

const MINIMAP_TRAIL_MS = 15000;
const MINIMAP_TRAIL_MAX_POINTS = 34;
const MINIMAP_TRAIL_MIN_STEP = 0.7;
const MINIMAP_RUNTIME_POLL_MS = 100;
const MINIMAP_RUNTIME_MOVE_EPSILON = 0.08;
const MINIMAP_RUNTIME_HEADING_EPSILON = 1.2;
const SIDEBAR_DEFAULT_SIZE = { width: 240, mapHeight: 196 };
const SIDEBAR_MIN_SIZE = { width: 214, mapHeight: 164 };
const SIDEBAR_MAX_SIZE = { width: 386, mapHeight: 330 };

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

const ROUTE_EDGE_ABBR = {
  north: 'N',
  south: 'S',
  east: 'E',
  west: 'W',
  northeast: 'NE',
  northwest: 'NW',
  southeast: 'SE',
  southwest: 'SW',
};

function clampPercent(value, padding = 6) {
  return Math.max(padding, Math.min(100 - padding, value));
}

function worldToMapPercent(position, zone, padding = 6) {
  const width = zone.terrainWidth || zone.terrainSize || zone.bounds * 2 || 100;
  const depth = zone.terrainDepth || zone.terrainSize || zone.bounds * 2 || width;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const x = Number.isFinite(position?.x) ? position.x : 0;
  const z = Number.isFinite(position?.z) ? position.z : 0;
  return {
    x: clampPercent(((x + halfWidth) / width) * 100, padding),
    y: clampPercent(((z + halfDepth) / depth) * 100, padding),
  };
}

function percentStyle(value) {
  return `${Number(value).toFixed(3)}%`;
}

function headingFromFacing(facing) {
  const fx = Number(facing?.x);
  const fz = Number(facing?.z);
  return Math.atan2(Number.isFinite(fx) ? fx : 0, Number.isFinite(fz) ? fz : -1) * (180 / Math.PI);
}

function minimapPoseFromRuntime(fallback) {
  const runtime = getRuntimePlayerPose();
  const x = Number(runtime?.position?.x);
  const z = Number(runtime?.position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return fallback;
  return {
    x,
    z,
    heading: headingFromFacing(runtime?.facing),
  };
}

function useLiveMinimapPose() {
  const storePose = useThreeGameStore(state => state.minimapPlayerPose);
  const [pose, setPose] = useState(() => minimapPoseFromRuntime(storePose));

  useEffect(() => {
    setPose(current => {
      const next = minimapPoseFromRuntime(storePose);
      return Math.abs(current.x - next.x) < MINIMAP_RUNTIME_MOVE_EPSILON
        && Math.abs(current.z - next.z) < MINIMAP_RUNTIME_MOVE_EPSILON
        && Math.abs(current.heading - next.heading) < MINIMAP_RUNTIME_HEADING_EPSILON
        ? current
        : next;
    });
  }, [storePose]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPose(current => {
        const next = minimapPoseFromRuntime(current);
        return Math.abs(current.x - next.x) < MINIMAP_RUNTIME_MOVE_EPSILON
          && Math.abs(current.z - next.z) < MINIMAP_RUNTIME_MOVE_EPSILON
          && Math.abs(current.heading - next.heading) < MINIMAP_RUNTIME_HEADING_EPSILON
          ? current
          : next;
      });
    }, MINIMAP_RUNTIME_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return pose;
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

function routeEdgeLabel(route) {
  const edge = route.edge || route.exit;
  return ROUTE_EDGE_ABBR[edge] || String(edge || '').slice(0, 2).toUpperCase();
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
  const totalMinutes = Math.floor((timeOfDay ?? 8) * 60);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Banner shows the objective sentence itself; the "Quest:" prefix is implied
// by the compass chrome (per mockup).
function formatBannerObjective(objective) {
  const stripped = objective.replace(/^Quest: /, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function sentenceCase(value) {
  return String(value || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function InspectableTooltip() {
  const inspectedObject = useThreeGameStore(state => state.inspectedObject);
  const inspectedScreenPosition = useThreeGameStore(state => state.inspectedScreenPosition);
  const clearInspectedObject = useThreeGameStore(state => state.clearInspectedObject);
  const [rendered, setRendered] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!inspectedObject) {
      setVisible(false);
      const timer = window.setTimeout(() => setRendered(null), 360);
      return () => window.clearTimeout(timer);
    }
    setRendered(inspectedObject);
    const showTimer = window.setTimeout(() => setVisible(true), 20);
    const fadeTimer = window.setTimeout(() => setVisible(false), 5200);
    const clearTimer = window.setTimeout(() => clearInspectedObject(), 5660);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [inspectedObject, clearInspectedObject]);

  if (!rendered) return null;
  const label = rarityLabel(rendered.rarity);
  const anchorVisible = inspectedScreenPosition?.visible;
  const viewportWidth = inspectedScreenPosition?.width || (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const viewportHeight = inspectedScreenPosition?.height || (typeof window !== 'undefined' ? window.innerHeight : 720);
  const tooltipWidth = 238;
  const tooltipX = anchorVisible
    ? Math.min(viewportWidth - tooltipWidth - 14, Math.max(14, (inspectedScreenPosition.x || 0) + 24))
    : 14;
  const tooltipY = anchorVisible
    ? Math.min(viewportHeight - 132, Math.max(96, (inspectedScreenPosition.y || 0) - 48))
    : 174;
  const tooltipStyle = {
    width: `${tooltipWidth}px`,
    left: `${tooltipX}px`,
    top: `${tooltipY}px`,
  };

  return (
    <div
      style={tooltipStyle}
      className={`pointer-events-none absolute z-20 rounded-md border border-expedition-brass/60 bg-[rgba(15,19,20,0.74)] px-3 py-2.5 font-expedition text-expedition-parchment shadow-[0_12px_26px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(227,197,133,0.13)] backdrop-blur-md transition-[opacity,transform,left,top] duration-500 ease-out ${visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.965] opacity-0'}`}
    >
      {anchorVisible && (
        <div className="absolute -left-2 top-9 h-4 w-4 rotate-45 border-b border-l border-expedition-brass/45 bg-[rgba(15,19,20,0.74)]" />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.14em] text-expedition-gold/85">
            {rendered.category || rendered.kind || 'Field sign'}
          </div>
          <div className="mt-0.5 truncate text-[14px] font-semibold leading-tight text-expedition-parchment">
            {rendered.englishName}
          </div>
          {rendered.latinName && (
            <div className="mt-0.5 truncate text-[11px] italic text-expedition-faded">
              {rendered.latinName}
            </div>
          )}
        </div>
        <div className="shrink-0 rounded-sm border border-expedition-gold/45 bg-expedition-gold/10 px-1.5 py-1 text-center">
          <div className="text-[7.5px] uppercase tracking-[0.12em] text-expedition-faded">Rarity</div>
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-expedition-goldbright">{label}</div>
        </div>
      </div>
      <div className="relative mt-2 h-px bg-gradient-to-r from-transparent via-expedition-brass/35 to-transparent" />
      <div className="relative mt-1.5 text-[10.5px] leading-snug text-expedition-faded">
        Field label added to the daybook.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top banner

function TopChronometer() {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);

  return (
    <div className="absolute left-1/2 top-3 hidden w-[min(29rem,calc(100vw-8rem))] -translate-x-1/2 text-center md:block sm:w-[min(32rem,calc(100vw-24rem))] xl:hidden">
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

const WEATHER_OPTIONS = Object.keys(WEATHER_STATES);

const WEATHER_COPY = {
  sunny: {
    title: 'Clear Trade Wind',
    note: 'Bright equatorial light, thin cloud, hard shadows.',
  },
  cloudy: {
    title: 'Broken Cloud',
    note: 'Cumulus crossing the bay with softened glare.',
  },
  sunshower: {
    title: 'Rainbow Shower',
    note: 'Sun through light rain; best for bows near dawn or late afternoon.',
  },
  overcast: {
    title: 'Overcast Sky',
    note: 'A sealed grey deck dims the volcanic shore.',
  },
  misty: {
    title: 'Garua Mist',
    note: 'Cool low vapour drifts from the higher ground.',
  },
  drizzle: {
    title: 'Fine Drizzle',
    note: 'Light rain and mist bead on the field notes.',
  },
  rain: {
    title: 'Rain Squall',
    note: 'A wet cloud deck moves in from the water.',
  },
  storm: {
    title: 'Storm Front',
    note: 'Heavy rain, low cloud, and uncertain light.',
  },
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

function WeatherGlyph({ weather, className = '' }) {
  const kind = weather === 'misty' ? 'fog' : weather;
  const sunshower = kind === 'sunshower';
  const rain = sunshower || kind === 'drizzle' || kind === 'rain' || kind === 'storm';
  const storm = kind === 'storm';
  const sun = kind === 'sunny';
  const fog = kind === 'fog';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
      {sun ? (
        <>
          <circle cx="12" cy="12" r="3.4" fill="currentColor" fillOpacity="0.22" />
          <path d="M12 3.5 V5.3 M12 18.7 V20.5 M3.5 12 H5.3 M18.7 12 H20.5 M5.9 5.9 L7.2 7.2 M16.8 16.8 L18.1 18.1 M18.1 5.9 L16.8 7.2 M7.2 16.8 L5.9 18.1" opacity="0.75" />
        </>
      ) : (
        <>
          {sunshower && (
            <>
              <circle cx="7.2" cy="7.2" r="2.3" fill="currentColor" fillOpacity="0.18" />
              <path d="M7.2 2.8 V4 M7.2 10.4 V11.6 M2.8 7.2 H4 M10.4 7.2 H11.6 M4.1 4.1 L5 5 M9.4 9.4 L10.3 10.3" opacity="0.5" />
            </>
          )}
          <path d="M7.4 15.2 H17.1 C19 15.2 20.5 13.8 20.5 12 C20.5 10.2 19.1 8.9 17.4 8.8 C16.8 6.3 14.7 4.8 12.3 4.8 C9.9 4.8 8 6.2 7.2 8.4 C5.1 8.5 3.5 9.9 3.5 11.8 C3.5 13.7 5.1 15.2 7.4 15.2 Z" fill="currentColor" fillOpacity="0.12" />
          {(kind === 'cloudy' || kind === 'overcast') && <path d="M5.2 18.2 H18.8" opacity="0.45" />}
        </>
      )}
      {fog && (
        <>
          <path d="M4.5 17.2 H19.5 M6.2 20 H17.8" opacity="0.75" />
        </>
      )}
      {rain && (
        <>
          <path d="M8.2 17.4 L7.2 20.2 M12 17.4 L11 20.2 M15.8 17.4 L14.8 20.2" opacity="0.75" />
          {storm && <path d="M13.2 10.8 L10.8 15 H13.2 L11.9 19.1 L16.1 13.6 H13.6 Z" fill="currentColor" fillOpacity="0.35" />}
        </>
      )}
    </svg>
  );
}

function TopObjective({ objective }) {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const weather = useThreeGameStore(state => state.weather);
  const setWeather = useThreeGameStore(state => state.setWeather);
  const setWeatherOverride = useThreeGameStore(state => state.setWeatherOverride);
  const setTimeOfDay = useThreeGameStore(state => state.setTimeOfDay);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const zone = getZone(currentZoneId);
  const weatherCopy = WEATHER_COPY[weather] || {
    title: sentenceCase(weather || 'weather'),
    note: 'Local conditions recorded from the sky.',
  };

  const selectWeather = nextWeather => {
    const nowMinutes = (day || 1) * 1440 + (timeOfDay || 0) * 60;
    setWeather(nextWeather);
    setWeatherOverride({ state: nextWeather, untilMinutes: nowMinutes + 240 });
    setMenuOpen(false);
    setExpanded(true);
  };

  return (
    <div className="absolute left-1/2 top-3 hidden w-[min(32rem,calc(100vw-42rem))] min-w-[20rem] -translate-x-1/2 text-center xl:block">
      <ExpeditionPanel
        innerClassName="p-0"
        variant="objective"
      >
        <button
          type="button"
          onClick={() => {
            setExpanded(value => !value);
            if (expanded) setMenuOpen(false);
          }}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
        >
          <CompassRoseIcon className="h-6 w-6 shrink-0 text-expedition-gold" />
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[14px] font-semibold tracking-wide text-expedition-parchment">
              {formatBannerObjective(objective)}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10.5px] text-expedition-faded">
              <span className="truncate">{zone.name}</span>
              <span className="text-expedition-brass">&bull;</span>
              <span>{formatExpeditionDate(day)}</span>
              <span className="text-expedition-brass">&bull;</span>
              <span>{formatExpeditionTime(timeOfDay)}</span>
            </div>
          </div>
          <span className={`shrink-0 text-expedition-gold transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 6 L8 10.5 L12.5 6" />
            </svg>
          </span>
        </button>
        <div className={`overflow-visible border-t border-expedition-brass/45 transition-all duration-300 ease-out ${expanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="relative grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-left">
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                setMenuOpen(value => !value);
              }}
              title="Select test weather"
              aria-label="Select test weather"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-sm border border-expedition-gold/60 bg-expedition-gold/12 text-expedition-gold transition hover:border-expedition-goldbright hover:bg-expedition-gold/22 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              <WeatherGlyph weather={weather} className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-expedition-gold/85">Present Weather</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-expedition text-[17px] font-semibold leading-none tracking-wide text-expedition-parchment">{weatherCopy.title}</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-expedition-faded">{sentenceCase(weather)}</span>
              </div>
              <div className="mt-1 truncate text-[11px] italic text-expedition-faded">{weatherCopy.note}</div>
            </div>
            <label className="block min-w-[6.8rem] text-left">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-expedition-gold/75">Hour</span>
              <select
                value={Math.floor(timeOfDay || 0)}
                onChange={event => setTimeOfDay(Number(event.target.value))}
                onClick={event => event.stopPropagation()}
                className="mt-1 w-full rounded-sm border border-expedition-brass/60 bg-expedition-ink/85 px-2 py-1 font-expedition text-[11px] font-semibold tracking-wide text-expedition-parchment shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] focus:outline-none focus:ring-1 focus:ring-expedition-gold/70"
              >
                {HOUR_OPTIONS.map(hour => (
                  <option key={hour} value={hour}>
                    {formatExpeditionTime(hour)}
                  </option>
                ))}
              </select>
            </label>
            <div className="hidden text-right text-[10px] uppercase tracking-[0.18em] text-expedition-brass/85 2xl:block">
              Sky log
            </div>
            {menuOpen && (
              <div
                className="absolute left-4 top-[calc(100%-0.25rem)] z-40 w-[20rem] rounded-md border border-expedition-brass/80 bg-[rgba(13,18,25,0.96)] p-2 shadow-[0_18px_34px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(227,197,133,0.12)] backdrop-blur-md"
                onClick={event => event.stopPropagation()}
              >
                <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-expedition-gold/80">Barometer Drawer</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WEATHER_OPTIONS.map(option => {
                    const active = option === weather;
                    const copy = WEATHER_COPY[option] || { title: sentenceCase(option) };
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => selectWeather(option)}
                        className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70 ${
                          active
                            ? 'border-expedition-gold bg-expedition-gold/22 text-expedition-goldbright'
                            : 'border-expedition-brass/45 bg-black/20 text-expedition-parchment/85 hover:border-expedition-gold/80 hover:bg-expedition-gold/12'
                        }`}
                      >
                        <WeatherGlyph weather={option} className="h-5 w-5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold tracking-wide">{copy.title}</span>
                          <span className="block text-[9px] uppercase tracking-[0.14em] text-expedition-faded">{sentenceCase(option)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
  const openStatusView = useThreeGameStore(state => state.openStatusView);

  return (
    <button
      type="button"
      onClick={openStatusView}
      title="View Darwin's status"
      aria-label="View Darwin's status"
      className="pointer-events-auto block text-left transition hover:brightness-125 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
    >
      <ExpeditionPanel className="w-[13rem] sm:w-[17.5rem]" innerClassName="grid gap-2.5 px-3.5 py-3">
        <StatBar icon={HeartIcon} label="Health" value={health} fill="linear-gradient(90deg,#5f9e6a,#8fc491)" />
        <StatBar icon={FatigueIcon} label="Fatigue" value={fatigue} fill="linear-gradient(90deg,#b3812f,#e0aa4e)" />
        <StatBar icon={CuriosityIcon} label="Curiosity" value={curiosity} fill="linear-gradient(90deg,#4f93a8,#84c4d4)" />
      </ExpeditionPanel>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Minimap

function IslandOverview({ zoneId, zoneName }) {
  const location = getIslandMapLocation(zoneId);
  return (
    <div className="relative h-full w-full bg-[#1d2a2e]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ISLAND_MAP_IMAGE}
        alt="Floreana island chart"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_55%,rgba(10,8,5,0.45)_100%)]" />
      {location && (
        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-expedition-ink/80 bg-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.85)]"
          style={{ left: percentStyle(location.at.x * 100), top: percentStyle(location.at.y * 100) }}
          title={location.name}
        />
      )}
      <div className="absolute bottom-1.5 left-0 right-0 text-center font-expedition text-[10px] italic text-expedition-parchment/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        {zoneName} — Charles Island
      </div>
    </div>
  );
}

// One marker per specimen, each subscribing only to its own runtime position
// (plus its own collected/documented/selected flags). Memoised so that when one
// animal moves, only that animal's marker re-renders — not the whole minimap.
const SpecimenMarker = memo(function SpecimenMarker({
  specimen, zone, surveyStyle, showKnown, showNew, active, onToggle,
}) {
  const actorId = specimen.instanceId || specimen.id;
  const runtime = useThreeGameStore(state => state.specimenRuntimePositions?.[zone.id]?.[actorId]);
  const isCollected = useThreeGameStore(state => state.collectedSpecimenIds.includes(specimen.id));
  const isDocumented = useThreeGameStore(state => state.documentedSpecimenIds.includes(specimen.id));
  const isSelected = useThreeGameStore(state => (
    state.selectedSpecimenId === actorId || state.nearbySpecimenId === actorId
  ));
  const [x, , z] = specimen.spawnPoint || [0, 0, 0];
  const point = worldToMapPercent({
    x: Number.isFinite(runtime?.x) ? runtime.x : x,
    z: Number.isFinite(runtime?.z) ? runtime.z : z,
  }, zone);
  if (point.x <= -4 || point.x >= 104 || point.y <= -4 || point.y >= 104) return null;
  const isKnown = isCollected || isDocumented;
  if ((isKnown && !showKnown) || (!isKnown && !showNew)) return null;
  const status = isCollected ? 'Collected' : isDocumented ? 'Documented' : 'Unrecorded';
  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        onToggle(actorId);
      }}
      aria-label={`${specimen.name}: ${status}`}
      className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow transition hover:scale-125 ${
        isSelected
          ? 'border-expedition-ink bg-expedition-goldbright ring-2 ring-expedition-goldbright/60'
          : isCollected || isDocumented
            ? surveyStyle
              ? 'border-[#24422c] bg-[#99c98c]/90 ring-1 ring-[#e6d69c]/70'
              : 'border-emerald-950 bg-emerald-300/90'
            : surveyStyle
              ? 'border-[#5c2e2e] bg-[#e5a5a6]/92 ring-1 ring-[#f3dcac]/70'
              : 'border-expedition-ink/80 bg-rose-300/95'
      }`}
      style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
      title={specimen.name}
    >
      {active && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-36 -translate-x-1/2 rounded-sm border border-expedition-brass/70 bg-expedition-ink/92 px-2 py-1.5 text-left font-expedition text-[10.5px] leading-tight text-expedition-parchment shadow-lg">
          <span className="block truncate font-semibold text-expedition-goldbright">{specimen.name}</span>
          {specimen.latin && <span className="mt-0.5 block truncate italic text-expedition-faded">{specimen.latin}</span>}
          <span className="mt-1 block uppercase tracking-[0.12em] text-expedition-brass">{status}</span>
        </span>
      )}
    </button>
  );
});

// Player movement trail. Subscribes only to the (quantised) minimap pose, so it
// re-renders on player movement without dragging the specimen markers with it.
function MinimapTrail({ zone, playerPose }) {
  const [trail, setTrail] = useState([]);
  const playerPosition = { x: playerPose.x, z: playerPose.z };

  useEffect(() => {
    const now = Date.now();
    const nextPoint = worldToMapPercent(playerPosition, zone, 3);
    setTrail(previous => {
      const recent = previous.filter(point => point.zoneId === zone.id && now - point.t < MINIMAP_TRAIL_MS);
      const last = recent[recent.length - 1];
      if (last && Math.hypot(last.x - nextPoint.x, last.y - nextPoint.y) < MINIMAP_TRAIL_MIN_STEP && now - last.t < 1000) {
        return recent;
      }
      return [...recent, { ...nextPoint, zoneId: zone.id, t: now }].slice(-MINIMAP_TRAIL_MAX_POINTS);
    });
  }, [playerPosition.x, playerPosition.z, zone.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTrail(previous => previous.filter(point => point.zoneId === zone.id && now - point.t < MINIMAP_TRAIL_MS));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [zone.id]);

  return (
    <>
      {trail.map((point, index) => {
        const age = Date.now() - point.t;
        const life = Math.max(0, 1 - age / MINIMAP_TRAIL_MS);
        const size = 2.5 + life * 2.5;
        return (
          <span
            key={`${point.t}-${index}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-expedition-goldbright"
            style={{
              left: percentStyle(point.x),
              top: percentStyle(point.y),
              width: `${size}px`,
              height: `${size}px`,
              opacity: 0.08 + life * 0.36,
              boxShadow: `0 0 ${4 + life * 5}px rgba(227,197,133,${0.15 + life * 0.28})`,
            }}
          />
        );
      })}
    </>
  );
}

// Player arrow. Kept after the markers (matching the original stacking) and
// likewise subscribed only to the minimap pose.
function MinimapPlayerArrow({ zone, surveyStyle, playerPose }) {
  const playerPosition = { x: playerPose.x, z: playerPose.z };
  const player = worldToMapPercent(playerPosition, zone, 3);
  const heading = Number.isFinite(playerPose.heading) ? playerPose.heading : 180;
  return (
    <>
      <span
        className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-full opacity-45"
        style={{
          left: percentStyle(player.x),
          top: percentStyle(player.y),
          transform: `translate(-50%, -86%) rotate(${heading}deg)`,
          transformOrigin: '50% 86%',
          clipPath: 'polygon(50% 0%, 86% 100%, 14% 100%)',
          background: surveyStyle
            ? 'linear-gradient(180deg, rgba(65,112,116,0.38), rgba(65,112,116,0))'
            : 'linear-gradient(180deg, rgba(227,197,133,0.42), rgba(227,197,133,0))',
          filter: surveyStyle
            ? 'drop-shadow(0 0 5px rgba(55,91,94,0.35))'
            : 'drop-shadow(0 0 5px rgba(227,197,133,0.35))',
        }}
      />
      <span
        className={`absolute flex h-6 w-6 items-center justify-center rounded-full border shadow-lg ${
          surveyStyle
            ? 'border-[#f1dca3]/90 bg-[#346f72]/78 shadow-[0_2px_8px_rgba(39,68,70,0.48),inset_0_1px_0_rgba(255,255,255,0.24)]'
            : 'border-expedition-goldbright/90 bg-expedition-ink/68'
        }`}
        style={{
          left: percentStyle(player.x),
          top: percentStyle(player.y),
          transform: `translate(-50%, -50%) rotate(${heading}deg)`,
        }}
        title="Darwin"
      >
        <span className={`absolute h-4 w-4 rounded-full border ${surveyStyle ? 'border-[#f6e7b6]/35' : 'border-expedition-gold/30'}`} />
        <span className={`h-0 w-0 border-b-[8px] border-l-[4px] border-r-[4px] border-l-transparent border-r-transparent ${surveyStyle ? 'border-b-[#f6e7b6]' : 'border-b-expedition-goldbright'}`} />
      </span>
    </>
  );
}

function MapOverlays({ zone, showKnown = true, showNew = true, surveyStyle = false }) {
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const specimens = getThreeSpecimens(zone.id);
  const playerPose = useLiveMinimapPose();
  const handleToggleMarker = useCallback(id => {
    setActiveMarkerId(current => (current === id ? null : id));
  }, []);

  return (
    <>
      {zone.neighbors.map(route => {
        const edge = route.edge || route.exit;
        const point = routePosition(edge);
        const edgeLabel = routeEdgeLabel(route);
        return (
          <button
            key={route.zoneId}
            type="button"
            onClick={() => beginZoneTransition(route.zoneId, { entryEdge: ROUTE_ENTRY_EDGES[edge] || null })}
            className={`absolute flex h-5 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-1 font-expedition text-[9px] font-bold leading-none shadow transition hover:scale-105 ${
              surveyStyle
                ? 'border-[#6f4f24]/65 bg-[#d7b86d]/82 text-[#3b2812] shadow-[0_1px_5px_rgba(63,42,18,0.32),inset_0_1px_0_rgba(255,240,178,0.48)]'
                : 'border-expedition-goldbright bg-expedition-gold/90 text-expedition-ink shadow-[0_0_10px_rgba(227,197,133,0.5)] hover:bg-expedition-goldbright'
            }`}
            style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
            title={route.label}
            aria-label={`Travel ${edgeLabel}: ${route.label}`}
          >
            {edgeLabel}
          </button>
        );
      })}
      <MinimapTrail zone={zone} playerPose={playerPose} />
      {specimens.map((specimen, index) => (
        <SpecimenMarker
          key={`${specimen.id}-${index}`}
          specimen={specimen}
          zone={zone}
          surveyStyle={surveyStyle}
          showKnown={showKnown}
          showNew={showNew}
          active={activeMarkerId === specimen.id}
          onToggle={handleToggleMarker}
        />
      ))}
      <MinimapPlayerArrow zone={zone} surveyStyle={surveyStyle} playerPose={playerPose} />
    </>
  );
}

function LocalMapDecoration({ surveyStyle, zoneName }) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-[6px] rounded-[2px] ${
          surveyStyle
            ? 'border border-[#6c4a24]/35 shadow-[inset_0_0_0_1px_rgba(247,224,166,0.2),inset_0_0_22px_rgba(80,49,22,0.14)]'
            : 'border border-expedition-gold/20 shadow-[inset_0_0_18px_rgba(4,9,13,0.22)]'
        }`}
      />
      {surveyStyle && (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-35 mix-blend-multiply" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M8 91 C28 75 43 53 50 8" stroke="#6c4a24" strokeWidth="0.18" fill="none" strokeDasharray="1.2 1.8" />
            <path d="M20 96 C38 73 55 50 76 6" stroke="#6c4a24" strokeWidth="0.16" fill="none" strokeDasharray="1.1 2.2" />
            <path d="M4 30 C27 37 58 42 95 37" stroke="#6c4a24" strokeWidth="0.14" fill="none" strokeDasharray="1.2 2.1" />
            <path d="M3 68 C32 62 61 61 96 70" stroke="#6c4a24" strokeWidth="0.14" fill="none" strokeDasharray="1.2 2.1" />
          </svg>
          <div className="pointer-events-none absolute left-1/2 top-2 max-w-[72%] -translate-x-1/2 truncate rounded-sm border border-[#725027]/35 bg-[rgba(236,214,159,0.42)] px-2 py-0.5 text-center font-expedition text-[9px] font-semibold uppercase tracking-[0.16em] text-[#4b3116] shadow-sm">
            {zoneName}
          </div>
        </>
      )}
    </>
  );
}

function MinimapBody({ onOpenMap, tabsClassName = 'hidden sm:flex', mapHeight = null }) {
  const [view, setView] = useState('local');
  const [mapStyle, setMapStyle] = useState('terrain');
  const [showKnown, setShowKnown] = useState(true);
  const [showNew, setShowNew] = useState(true);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);
  const chartUrl = useTerrainChart(zone, mapStyle);
  const toggleKnown = () => setShowKnown(value => (value && !showNew ? value : !value));
  const toggleNew = () => setShowNew(value => (value && !showKnown ? value : !value));
  const surveyStyle = mapStyle === 'survey';

  return (
    <>
      <PanelTabs
        className={tabsClassName}
        tabs={[
          { id: 'local', label: 'Local' },
          { id: 'island', label: 'Island' },
          { id: 'globe', label: 'Globe' },
        ]}
        active={view}
        onSelect={setView}
      />
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1.5">
        <div className="min-w-0 truncate font-expedition text-[12px] font-light tracking-wide text-expedition-parchment">
          {zone.shortName || zone.name}
        </div>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            setMapStyle(style => (style === 'survey' ? 'terrain' : 'survey'));
          }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
            surveyStyle
              ? 'border-expedition-goldbright bg-expedition-gold/25 text-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.24)]'
              : 'border-expedition-brass/45 bg-black/15 text-expedition-gold/80 hover:border-expedition-gold hover:bg-expedition-gold/15'
          }`}
          title={surveyStyle ? 'Show terrain minimap' : 'Show survey chart minimap'}
          aria-label={surveyStyle ? 'Show terrain minimap' : 'Show survey chart minimap'}
          aria-pressed={surveyStyle}
        >
          <CompassRoseIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={event => {
          // Ignore clicks on inner controls (route dots) — they travel, not open the map.
          if (event.target.closest('button')) return;
          onOpenMap();
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') onOpenMap();
        }}
        title="Open island map"
        className={`relative cursor-pointer overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#27505d] shadow-[inset_0_0_18px_rgba(0,0,0,0.55)] transition hover:border-expedition-gold focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${mapHeight ? '' : 'aspect-square'}`}
        style={mapHeight ? { height: `${mapHeight}px` } : undefined}
      >
        {view === 'globe' ? (
          <GalapagosGlobe />
        ) : view === 'island' ? (
          <IslandOverview zoneId={currentZoneId} zoneName={zone.shortName || zone.name} />
        ) : (
          <>
            <div className="absolute left-1.5 top-1.5 z-10 flex overflow-hidden rounded-sm border border-expedition-brass/45 bg-expedition-ink/62 shadow-[0_2px_8px_rgba(0,0,0,0.25)] backdrop-blur-sm">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  toggleKnown();
                }}
                className={`flex items-center gap-1 border-r border-expedition-brass/30 px-1.5 py-0.5 font-expedition text-[8.5px] font-semibold uppercase tracking-[0.08em] transition ${
                  showKnown
                    ? 'bg-[rgba(210,238,197,0.78)] text-[#17361f]'
                    : 'bg-transparent text-expedition-faded'
                }`}
                title="Toggle documented and collected specimen markers"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_4px_rgba(110,231,183,0.7)]" />
                Known
              </button>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  toggleNew();
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 font-expedition text-[8.5px] font-semibold uppercase tracking-[0.08em] transition ${
                  showNew
                    ? 'bg-[rgba(245,188,191,0.78)] text-[#4b171d]'
                    : 'bg-transparent text-expedition-faded'
                }`}
                title="Toggle unrecorded specimen markers"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_4px_rgba(253,164,175,0.7)]" />
                New
              </button>
            </div>
            {chartUrl ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${chartUrl})`,
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  imageRendering: 'auto',
                }}
              />
            ) : (
              <div className={`absolute inset-0 ${surveyStyle ? 'bg-[#cdbb8b]' : 'bg-[#27505d]'}`} />
            )}
            {surveyStyle && (
              <>
                <div className="pointer-events-none absolute inset-[8px] border border-[rgba(62,39,21,0.28)] shadow-[inset_0_0_0_1px_rgba(232,210,157,0.18)]" />
                <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-[rgba(69,45,26,0.38)] bg-[rgba(238,218,165,0.54)] px-1.5 py-1 font-expedition text-[8px] font-semibold uppercase leading-none tracking-[0.12em] text-[rgba(55,35,20,0.82)] shadow-sm">
                  100 ft
                </div>
              </>
            )}
            <LocalMapDecoration surveyStyle={surveyStyle} zoneName={zone.shortName || zone.name} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_62%,rgba(10,8,5,0.28)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(227,197,133,0.05),transparent_45%,rgba(10,8,5,0.10))]" />
            <MapOverlays zone={zone} showKnown={showKnown} showNew={showNew} surveyStyle={surveyStyle} />
          </>
        )}
        <span className="absolute bottom-1 right-1.5 flex items-center text-expedition-parchment/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
          <NorthArrowIcon className="h-3.5 w-3.5" />
          <span className="font-expedition text-[10px] font-semibold">N</span>
        </span>
      </div>
    </>
  );
}

// Floating minimap for viewports too narrow for the docked sidebar.
function GameplayMinimap({ onOpenMap }) {
  return (
    <ExpeditionPanel className="w-[10rem] sm:w-[17.75rem]" innerClassName="p-2 sm:p-2">
      <MinimapBody onOpenMap={onOpenMap} />
    </ExpeditionPanel>
  );
}

// ---------------------------------------------------------------------------
// Hotbar

function ToolBelt({ onOpenJournal }) {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const toolbarOrder = useThreeGameStore(state => state.toolbarOrder);
  return (
    <ExpeditionPanel className="max-w-[min(35rem,calc(100vw-1.5rem))]" innerClassName="flex flex-wrap justify-center gap-1.5 p-2">
      {toolbarOrder.map((toolId, index) => {
        const tool = getInventoryItem(toolId);
        if (!tool) return null;
        const Icon = TOOL_ICONS[tool.id];
        const active = activeToolId === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              if (tool.id === 'sketch') {
                onOpenJournal();
                return;
              }
              active ? triggerToolUse(tool.id) : setActiveTool(tool.id);
            }}
            className={`group relative flex h-14 w-14 items-center justify-center rounded-sm border transition focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${
              active
                ? 'border-expedition-goldbright bg-expedition-gold/30 text-expedition-goldbright shadow-[0_0_16px_rgba(227,197,133,0.35),inset_0_1px_0_rgba(227,197,133,0.4)]'
                : 'border-expedition-brass/55 bg-black/25 text-expedition-parchment/85 hover:border-expedition-gold hover:bg-expedition-gold/15'
            }`}
            title={`${index + 1}: ${tool.name}`}
          >
            {tool.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tool.image} alt={tool.name} className="h-10 w-10 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)]" draggable={false} />
            ) : Icon ? <Icon className="h-7 w-7" /> : <span className="text-base">{tool.icon}</span>}
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

function SpeakerLine({ speaker, icon, portrait, time, children }) {
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
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span className={GOLD_LABEL}>{speaker}</span>
          {time && <span className="shrink-0 text-[10px] tracking-[0.08em] text-expedition-faded">{time}</span>}
        </div>
        <div className="font-expedition text-[15.5px] leading-relaxed text-expedition-parchment">{children}</div>
      </div>
    </div>
  );
}

// Drag-resize bounds for the dialogue log: never below ~4 lines, never
// taller than the viewport minus room for the input row and top HUD.
const LOG_MIN_HEIGHT = 104;
const LOG_DEFAULT_HEIGHT = 232;

function HotkeysResponse() {
  const sections = [
    ['Movement', ['WASD / arrows: move', 'Shift: run', 'Space: jump', 'C: crouch or running slide', 'B: dodge roll', 'Q or V: climb / mantle / descend']],
    ['Camera', ['Mouse drag: rotate camera', 'Scroll: zoom', 'Z / X: rotate left / right', 'M: cycle camera mode']],
    ['Interaction', ['E: interact, collect, carry, or travel when prompted', 'J: use equipped tool', '1-6: equip toolbar slot', 'F: rifle aim when shotgun is equipped', 'Left click while aiming: fire rifle']],
    ['Direct Actions', ['H: hammer', 'N: net', 'G: gather', 'Y: write', 'I: kneel inspect', 'L: look around', 'O: point', 'P: pray', 'T: trip', 'U: teeter', 'K: sit', 'R: rest / lie down']],
    ['Narrator Commands', ['hotkeys / controls / commands: show this list', 'north / south / east / west, or go north: travel by direction', '/move <place>: travel to a known place', '/collect <specimen>: collect a named specimen', '/use <tool> on <target>: use a tool on something', 'survey site / look around: record the habitat', 'document <specimen> / sketch <specimen>: make field notes', 'check traps / abandon trap: manage traps', 'rest / sleep / make camp: rest', 'journal / field book / open journal: open the journal']],
    ['Dev / Debug', ['`: performance panel', '0: asset browser', '7: animal animation lab', '8: Darwin animation lab', '9: cycle Darwin model']],
  ];

  return (
    <div className="space-y-2">
      {sections.map(([title, lines]) => (
        <div key={title}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-expedition-gold">{title}</div>
          <div className="mt-1 grid gap-0.5 text-[13px] leading-snug text-expedition-parchment/95">
            {lines.map(line => <div key={line}>{line}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function NarrativePanel({ forceExpanded = false }) {
  const [draft, setDraft] = useState('');
  const [localEcho, setLocalEcho] = useState('');
  const [localNarratorReply, setLocalNarratorReply] = useState(null);
  const [logHeight, setLogHeight] = useState(LOG_DEFAULT_HEIGHT);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const logRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const message = useThreeGameStore(state => state.message);
  const educationalNote = useThreeGameStore(state => state.educationalNote);
  const symsLine = useThreeGameStore(state => state.symsLine);
  // Minute-resolution clock shown on un-stamped lines. Subscribing to the
  // formatted string instead of raw timeOfDay re-renders this heavy panel only
  // when the displayed minute changes, not on every ~1s clock tick.
  const fallbackTime = useThreeGameStore(state => formatExpeditionTime(state.timeOfDay));
  // Stamp each line with the in-game time at which it appeared, like a logbook
  // entry. Lines present at first paint track the live clock until they change —
  // the world clock is only authoritative after zone load, so stamping on mount
  // would freeze a stale time. Each effect reads the live clock at stamp time.
  const mountedRef = React.useRef(false);
  const [stamps, setStamps] = useState({});
  useEffect(() => {
    if (!mountedRef.current) return;
    setStamps(prev => ({ ...prev, narrator: formatExpeditionTime(useThreeGameStore.getState().timeOfDay) }));
  }, [message]);
  useEffect(() => {
    if (!mountedRef.current) return;
    setStamps(prev => ({ ...prev, syms: formatExpeditionTime(useThreeGameStore.getState().timeOfDay) }));
  }, [symsLine]);
  useEffect(() => {
    if (!mountedRef.current) return;
    setStamps(prev => ({ ...prev, note: formatExpeditionTime(useThreeGameStore.getState().timeOfDay) }));
  }, [educationalNote]);
  useEffect(() => {
    mountedRef.current = true;
  }, []);
  // Newest line stays in view; the log scrolls like a chat transcript.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [message, symsLine, educationalNote, localEcho, localNarratorReply]);
  // Never leave the game deaf to hotkeys if the panel unmounts mid-focus.
  useEffect(() => () => setTypingMode(false), []);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => (specimen.instanceId || specimen.id) === nearbySpecimenId || specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  const expanded = forceExpanded || hovered || focused || draft.length > 0 || Boolean(localNarratorReply);
  const visibleLogHeight = expanded ? logHeight : 88;
  const previewMessage = educationalNote || symsLine || message;

  const handleSubmit = event => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setLocalEcho(trimmed);
    setStamps(prev => ({ ...prev, echo: formatExpeditionTime(useThreeGameStore.getState().timeOfDay) }));
    if (/^(?:hotkeys?|controls?|commands?|help)$/i.test(trimmed)) {
      setLocalNarratorReply('hotkeys');
      setStamps(prev => ({ ...prev, localNarrator: formatExpeditionTime(useThreeGameStore.getState().timeOfDay) }));
    } else {
      setLocalNarratorReply(null);
    }
    setDraft('');
  };

  const onHandlePointerDown = event => {
    if (!expanded) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: logHeight };
  };
  const onHandlePointerMove = event => {
    if (!dragRef.current) return;
    const maxHeight = Math.max(LOG_MIN_HEIGHT, window.innerHeight - 280);
    const next = dragRef.current.startHeight + (dragRef.current.startY - event.clientY);
    setLogHeight(Math.min(maxHeight, Math.max(LOG_MIN_HEIGHT, next)));
  };
  const onHandlePointerEnd = event => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      className="transition-transform duration-300 ease-out"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
    <ExpeditionPanel
      className={`w-[min(31rem,calc(100vw-1.5rem))] transition-[opacity,transform] duration-300 ease-out ${expanded ? 'opacity-100' : 'translate-y-1 opacity-90'}`}
      innerClassName={`transition-[padding] duration-300 ease-out ${expanded ? 'p-4 pt-1.5' : 'px-3 py-2.5'}`}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        title={expanded ? 'Drag to resize' : 'Hover or focus to expand'}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onHandlePointerEnd}
        onDoubleClick={() => setLogHeight(LOG_DEFAULT_HEIGHT)}
        className={`group flex touch-none items-center justify-center transition-all duration-300 ease-out ${expanded ? '-mx-4 mb-1.5 h-5 cursor-ns-resize' : '-mx-3 -mt-1 mb-1 h-2 cursor-default'}`}
      >
        <span className={`rounded-full bg-expedition-brass/50 transition group-hover:bg-expedition-gold/80 ${expanded ? 'h-1 w-12' : 'h-0.5 w-9 opacity-60'}`} />
      </div>
      <div
        ref={logRef}
        style={{ height: visibleLogHeight }}
        className={`grid content-start overflow-y-auto pr-1.5 transition-[height,gap] duration-300 ease-out [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)] ${expanded ? 'gap-2.5' : 'gap-1.5'}`}
      >
        {!expanded ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-expedition-brass/60 bg-black/20 text-expedition-gold">
              <OpenBookIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-expedition-gold">Field Log</div>
              <div className="mt-0.5 max-h-[2.55rem] overflow-hidden font-expedition text-[13px] leading-snug text-expedition-parchment/95">
                {previewMessage}
              </div>
            </div>
          </div>
        ) : (
          <>
            <SpeakerLine speaker="Narrator" time={stamps.narrator || fallbackTime} icon={<CompassRoseIcon className="h-5 w-5" />}>{message}</SpeakerLine>
            <SpeakerLine speaker="Syms Covington" time={stamps.syms || fallbackTime} portrait="/portraits/syms_covington.jpg">{symsLine}</SpeakerLine>
            {educationalNote && (
              <SpeakerLine speaker="Field Note" time={stamps.note || fallbackTime} icon={<OpenBookIcon className="h-5 w-5" />}>{educationalNote}</SpeakerLine>
            )}
            {localEcho && (
              <SpeakerLine speaker="You" time={stamps.echo || fallbackTime} icon={<NoteIcon className="h-5 w-5" />}>{localEcho}</SpeakerLine>
            )}
            {localNarratorReply === 'hotkeys' && (
              <SpeakerLine speaker="Narrator" time={stamps.localNarrator || fallbackTime} icon={<CompassRoseIcon className="h-5 w-5" />}>
                <HotkeysResponse />
              </SpeakerLine>
            )}
          </>
        )}
      </div>
      <form onSubmit={handleSubmit} className={`flex items-center gap-2 border-t border-expedition-brass/30 transition-[margin,padding] duration-300 ease-out ${expanded ? 'mt-3 pt-3' : 'mt-2 pt-2'}`}>
        <input
          type="text"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onFocus={() => setTypingMode(true)}
          onBlur={() => setTypingMode(false)}
          onKeyDown={event => {
            // While typing, keys belong to the input: Escape hands control
            // back to the game, everything else must not reach the hotkeys.
            event.stopPropagation();
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          className={`min-w-0 flex-1 rounded-sm border border-expedition-brass/55 bg-[rgba(10,14,19,0.82)] px-3 font-expedition text-expedition-parchment outline-none placeholder:italic placeholder:text-expedition-faded/80 focus:border-expedition-gold focus:ring-1 focus:ring-expedition-gold/40 transition-[padding,font-size] duration-300 ${expanded ? 'py-2 text-[14.5px]' : 'py-1.5 text-[13px]'}`}
          placeholder="Ask the narrator..."
        />
        <button type="submit" className={`${GOLD_BUTTON_SOLID} uppercase transition-[height,padding] duration-300 ${expanded ? 'h-9' : 'h-8 px-2.5'}`}>
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
    </div>
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

function ObjectivesTab({ objective, condensed = false }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const collectedCount = useThreeGameStore(state => state.collectedSpecimenIds.length);
  const journalCount = useThreeGameStore(state => state.journal.length);
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  const zone = getZone(currentZoneId);
  const zoneSpecimenCount = getThreeSpecimens(currentZoneId).length;
  const compactObjective = objective.replace('one animal, plant, or mineral sample', 'one specimen');
  const travel = route => beginZoneTransition(route.zoneId, { entryEdge: ROUTE_ENTRY_EDGES[route.edge] || null });

  if (condensed) {
    return (
      <div className="grid gap-3">
        <div className="font-expedition text-[15px] font-semibold leading-snug text-expedition-parchment">
          {formatBannerObjective(compactObjective)}
        </div>
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-expedition-faded">
            <ButterflyIcon className="h-[1.15rem] w-[1.15rem] text-expedition-gold" />
            <span className="font-expedition text-[14px] font-semibold normal-case tracking-normal text-expedition-parchment">{collectedCount}/{zoneSpecimenCount}</span>
            specimens
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-expedition-faded">
            <NoteIcon className="h-[1.15rem] w-[1.15rem] text-expedition-gold" />
            <span className="font-expedition text-[14px] font-semibold normal-case tracking-normal text-expedition-parchment">{journalCount}</span>
            notes
          </span>
        </div>
        <div className="flex items-center gap-2.5 border-t border-expedition-brass/30 pt-2.5">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-expedition-brass/70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/portraits/syms_covington.jpg" alt="Syms Covington" className="h-full w-full object-cover sepia-[0.35]" />
          </div>
          <span className="truncate font-expedition text-[14px] font-semibold text-expedition-parchment">Syms Covington</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        </div>
        {zone.neighbors.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-expedition-brass/30 pt-2.5">
            {zone.neighbors.slice(0, 2).map(route => (
              <button
                key={route.zoneId}
                type="button"
                onClick={() => travel(route)}
                className="group min-w-0 text-left"
              >
                <span className="flex items-center gap-1.5">
                  <CompassRoseIcon className="h-4 w-4 shrink-0 text-expedition-gold/80 group-hover:text-expedition-goldbright" />
                  <span className="truncate font-expedition text-[13.5px] font-medium text-expedition-parchment group-hover:text-expedition-goldbright">{route.label}</span>
                </span>
                <span className="block pl-[1.375rem] text-[11px] text-expedition-faded">{route.minutes || 0}m &middot; {route.fatigue || 0} fatigue</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <div>
        <div className={`${GOLD_LABEL} mb-1`}>Current Objective</div>
        <div className="max-w-full overflow-hidden break-words font-expedition text-[14px] font-semibold leading-snug text-expedition-parchment">
          {compactObjective}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <CountChip icon={ButterflyIcon} label="Specimens" value={`${collectedCount}/${zoneSpecimenCount}`} />
        <CountChip icon={NoteIcon} label="Notes" value={journalCount} />
      </div>
      <div>
      <div className={`${GOLD_LABEL} mb-1.5`}>Nearby NPC</div>
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
      </div>
      {zone.neighbors.length > 0 && (
        <div>
          <div className={`${GOLD_LABEL} mb-1.5`}>Nearby Objectives</div>
          <div className="grid gap-1">
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
      <button type="button" onClick={cycleViewMode} className="justify-self-center text-[10.5px] uppercase tracking-[0.14em] text-expedition-faded transition hover:text-expedition-gold">
        Camera: {viewMode}
      </button>
    </div>
  );
}

function SpecimensTab({ condensed = false }) {
  const collected = useThreeGameStore(state => state.collectedSpecimenIds);
  const documented = useThreeGameStore(state => state.documentedSpecimenIds);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const inventory = useThreeGameStore(state => state.inventory);
  const openSpecimenDetail = useThreeGameStore(state => state.openSpecimenDetail);
  const specimens = getThreeSpecimens(currentZoneId);
  const shown = condensed ? specimens.slice(0, 3) : specimens;

  // Open the cased copy when one exists (it carries condition); otherwise the
  // field record for the at-large specimen.
  const openDetail = specimen => {
    const casedIndex = inventory.findIndex(item => item.id === specimen.id);
    if (casedIndex >= 0) openSpecimenDetail(inventory, casedIndex);
    else openSpecimenDetail(specimens, specimens.findIndex(item => item.id === specimen.id));
  };

  return (
    <div className="grid gap-1.5">
      {shown.map((specimen, index) => {
        const isCollected = collected.includes(specimen.id);
        const isDocumented = documented.includes(specimen.id);
        const done = isCollected || isDocumented;
        return (
          <button
            key={`${specimen.id}-${index}`}
            type="button"
            onClick={() => openDetail(specimen)}
            className={`flex min-w-0 items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition hover:border-expedition-gold focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${
              done
                ? 'border-emerald-300/45 bg-emerald-950/18'
                : 'border-expedition-brass/40 bg-black/20'
            }`}
          >
            <ButterflyIcon className={`h-[1.1rem] w-[1.1rem] shrink-0 ${done ? 'text-emerald-300' : 'text-expedition-gold/70'}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-expedition text-[13.5px] font-medium text-expedition-parchment">{specimen.name}</div>
              <div className="truncate font-expedition text-[11.5px] italic text-expedition-faded">{specimen.latin}</div>
            </div>
            <span className={`shrink-0 rounded-sm border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${
              done
                ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-200'
                : 'border-expedition-brass/30 text-expedition-faded/70'
            }`}>
              {isDocumented ? 'documented' : isCollected ? 'collected' : 'at large'}
            </span>
          </button>
        );
      })}
      {condensed && specimens.length > shown.length && (
        <p className="px-1 pt-0.5 text-center text-[10px] uppercase tracking-[0.14em] text-expedition-faded">
          +{specimens.length - shown.length} more recorded
        </p>
      )}
      {specimens.length === 0 && (
        <p className="px-2 py-3 text-center font-expedition text-xs italic text-expedition-faded">No recorded specimens in this survey area.</p>
      )}
    </div>
  );
}

function InventoryTab({ onOpenInventory, onOpenJournal, condensed = false }) {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const toolbarOrder = useThreeGameStore(state => state.toolbarOrder);
  const tools = toolbarOrder.map(getInventoryItem).filter(Boolean);
  const shown = condensed ? tools.slice(0, 3) : tools;

  return (
    <div className="grid gap-2">
      <div className="grid gap-1.5">
        {shown.map(tool => {
          const index = tools.indexOf(tool);
          const Icon = TOOL_ICONS[tool.id];
          const active = activeToolId === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (tool.id === 'sketch') {
                  onOpenJournal();
                  return;
                }
                active ? triggerToolUse(tool.id) : setActiveTool(tool.id);
              }}
              className={`group flex min-w-0 items-center gap-2.5 rounded-sm border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-expedition-gold bg-expedition-gold/18 shadow-[inset_0_1px_0_rgba(227,197,133,0.18)]'
                  : 'border-expedition-brass/40 bg-black/20 hover:border-expedition-gold/70 hover:bg-expedition-gold/8'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border ${
                active
                  ? 'border-expedition-gold/70 bg-expedition-gold/15 text-expedition-goldbright'
                  : 'border-expedition-brass/35 bg-black/20 text-expedition-gold'
              }`}>
                {tool.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tool.image} alt={tool.name} className="h-7 w-7 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)]" draggable={false} />
                ) : Icon ? <Icon className="h-5 w-5" /> : <span>{tool.icon}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-expedition text-[13.5px] font-medium text-expedition-parchment">{tool.name}</span>
                <span className="block max-w-full truncate text-[11px] leading-snug text-expedition-faded">{tool.description}</span>
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
      {condensed && tools.length > shown.length && (
        <p className="px-1 text-center text-[10px] uppercase tracking-[0.14em] text-expedition-faded">
          +{tools.length - shown.length} more in kit
        </p>
      )}
      {!condensed && (
        <button type="button" onClick={onOpenInventory} className={GOLD_BUTTON}>
          Open Specimen Case
        </button>
      )}
    </div>
  );
}

// Right-edge column per the mockup: two separate instruments — the chart
// panel on top, the field-operations panel below it. The ops panel defaults
// to a condensed summary; the chevron slides it down to fill the remaining
// vertical space and reveal the full tab content + action buttons.
function FieldSidebar({ objective, onOpenInventory, onOpenMap, onOpenJournal }) {
  const [tab, setTab] = useState('objectives');
  const [expanded, setExpanded] = useState(false);
  const [folded, setFolded] = useState(false);
  const [sidebarSize, setSidebarSize] = useState(SIDEBAR_DEFAULT_SIZE);
  const rest = useThreeGameStore(state => state.rest);
  const resizeRef = React.useRef(null);

  const beginResize = event => {
    event.preventDefault();
    event.stopPropagation();
    const pointer = event.pointerId;
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: sidebarSize.width,
      mapHeight: sidebarSize.mapHeight,
    };
    event.currentTarget.setPointerCapture?.(pointer);
  };

  const updateResize = event => {
    if (!resizeRef.current) return;
    const nextWidth = Math.max(
      SIDEBAR_MIN_SIZE.width,
      Math.min(SIDEBAR_MAX_SIZE.width, resizeRef.current.width + (resizeRef.current.startX - event.clientX)),
    );
    const nextHeight = Math.max(
      SIDEBAR_MIN_SIZE.mapHeight,
      Math.min(SIDEBAR_MAX_SIZE.mapHeight, resizeRef.current.mapHeight + (event.clientY - resizeRef.current.startY)),
    );
    setSidebarSize({ width: nextWidth, mapHeight: nextHeight });
  };

  const endResize = event => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const selectOpsTab = nextTab => {
    if (nextTab === tab) {
      setFolded(value => !value);
      return;
    }
    setTab(nextTab);
    setFolded(false);
  };

  return (
    <div
      className="hidden h-full flex-col items-stretch gap-2.5 xl:flex"
      style={{ width: `${sidebarSize.width}px` }}
    >
      <ExpeditionPanel className="shrink-0" innerClassName="p-2">
        <MinimapBody onOpenMap={onOpenMap} tabsClassName="flex" mapHeight={sidebarSize.mapHeight} />
        <button
          type="button"
          onPointerDown={beginResize}
          onPointerMove={updateResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          title="Resize minimap"
          aria-label="Resize minimap"
          className="absolute bottom-1 left-1 z-30 flex h-6 w-6 cursor-sw-resize items-end justify-start rounded-sm border border-expedition-brass/55 bg-expedition-ink/70 p-1 text-expedition-gold/80 shadow-md transition hover:border-expedition-gold hover:text-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
        >
          <span className="block h-3.5 w-3.5 border-b border-l border-current">
            <span className="block h-2.5 w-2.5 border-b border-l border-current opacity-70" />
          </span>
        </button>
      </ExpeditionPanel>
      <ExpeditionPanel
        className={`min-h-0 transition-[flex-grow] duration-300 ease-in-out ${expanded && !folded ? 'grow' : 'grow-0'}`}
        innerClassName="flex h-full min-h-0 flex-col p-3 pb-2"
      >
        <div className="shrink-0">
          <PanelTabs
            tabs={[
              { id: 'objectives', label: 'Status' },
              { id: 'specimens', label: 'Specimens' },
              { id: 'inventory', label: 'Items' },
            ]}
            active={tab}
            onSelect={selectOpsTab}
          />
        </div>
        {!folded && (
          <div className={`min-h-0 flex-1 overflow-y-auto pr-0.5 pt-2.5 transition-[opacity,transform] duration-300 ease-out [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)] ${expanded ? 'translate-y-0 opacity-100' : 'translate-y-0.5 opacity-95'}`}>
            {tab === 'objectives' && <ObjectivesTab objective={objective} condensed={!expanded} />}
            {tab === 'specimens' && <SpecimensTab condensed={!expanded} />}
            {tab === 'inventory' && <InventoryTab onOpenInventory={onOpenInventory} onOpenJournal={onOpenJournal} condensed={!expanded} />}
          </div>
        )}
        {folded && (
          <button
            type="button"
            onClick={() => setFolded(false)}
            className="mt-2.5 flex items-center justify-between gap-2 rounded-sm border border-expedition-brass/35 bg-black/18 px-2.5 py-2 text-left font-expedition transition hover:border-expedition-gold/70 hover:bg-expedition-gold/10 focus:outline-none focus:ring-1 focus:ring-expedition-gold/50"
          >
            <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.14em] text-expedition-faded">
              {tab === 'objectives' ? 'Status' : tab === 'inventory' ? 'Items' : 'Specimens'} hidden
            </span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-expedition-gold">Show</span>
          </button>
        )}
        {expanded && !folded && (
          <div className="mt-2.5 grid shrink-0 grid-cols-2 gap-1.5 border-t border-expedition-brass/40 pt-2.5">
            <button type="button" onClick={onOpenMap} className={GOLD_BUTTON}>
              <span className="inline-flex items-center justify-center gap-1.5"><MapIcon className="h-4 w-4" />View on Map</span>
            </button>
            <button type="button" onClick={onOpenJournal} className={GOLD_BUTTON}>
              <span className="inline-flex items-center justify-center gap-1.5"><OpenBookIcon className="h-4 w-4" />Journal</span>
            </button>
            <button type="button" onClick={rest} className={GOLD_BUTTON}>Rest</button>
          </div>
        )}
        {!folded && (
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded}
            title={expanded ? 'Collapse panel' : 'Expand panel'}
            className="mx-auto mt-2 -mb-0.5 flex h-6 w-12 shrink-0 items-center justify-center rounded-md border border-expedition-brass/70 bg-[rgba(10,14,19,0.75)] text-expedition-gold shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition hover:border-expedition-gold hover:bg-expedition-gold/15 hover:text-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
          >
            <svg
              viewBox="0 0 12 7"
              aria-hidden="true"
              className={`h-[0.55rem] w-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M1 1 L6 6 L11 1" />
            </svg>
          </button>
        )}
      </ExpeditionPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts + touch controls

const CAMERA_MODE_LABELS = {
  shoulder: 'Shoulder View',
  first: 'First Person',
  top: 'Overhead Chart',
};

function PromptKey({ children, active = false }) {
  return (
    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1.5 font-expedition text-[10px] font-bold leading-none ${
      active
        ? 'border-expedition-goldbright bg-expedition-gold text-expedition-ink'
        : 'border-expedition-brass/60 bg-black/24 text-expedition-goldbright'
    }`}>
      {children}
    </span>
  );
}

function PromptAction({ keyLabel, children, primary = false, onClick = null }) {
  const content = (
    <>
      <PromptKey active={primary}>{keyLabel}</PromptKey>
      <span className={`truncate ${primary ? 'font-semibold text-expedition-parchment' : 'text-expedition-faded'}`}>{children}</span>
    </>
  );
  const className = `inline-flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-left font-expedition text-[11px] leading-none transition ${
    primary
      ? 'border-expedition-gold/55 bg-expedition-gold/14 hover:border-expedition-goldbright hover:bg-expedition-gold/22'
      : 'border-expedition-brass/35 bg-black/18'
  }`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function PromptCard({ title, subtitle, children }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[34%] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-expedition-brass/75 bg-[rgba(19,24,24,0.76)] px-3 py-2.5 font-expedition text-left shadow-[0_14px_34px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md sm:left-[calc(50%+11rem)] sm:top-[56%]">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold tracking-wide text-expedition-parchment">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-[10.5px] italic text-expedition-faded">{subtitle}</div>}
        </div>
        <div className="h-px w-10 shrink-0 bg-expedition-brass/45" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

function CompactPrompt({ children }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[52%] max-w-[min(30rem,calc(100vw-1.25rem))] -translate-x-1/2 -translate-y-1/2 font-expedition sm:left-[calc(50%+7rem)] sm:top-[64%]">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-sm border border-expedition-brass/30 bg-[rgba(14,18,18,0.42)] px-1.5 py-1 shadow-[0_8px_20px_rgba(0,0,0,0.24)] backdrop-blur-[2px]">
        {children}
      </div>
    </div>
  );
}

function CompactAction({ keyLabel, children, primary = false, onClick = null }) {
  const content = (
    <>
      <PromptKey active={primary}>{keyLabel}</PromptKey>
      <span className={`max-w-[16rem] truncate ${primary ? 'font-semibold text-expedition-parchment' : 'text-expedition-faded'}`}>{children}</span>
    </>
  );
  const className = `inline-flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1.5 text-left text-[11px] leading-none shadow-sm transition ${
    primary
      ? 'border-expedition-gold/45 bg-[rgba(196,162,91,0.18)] hover:border-expedition-goldbright hover:bg-[rgba(196,162,91,0.26)]'
      : 'border-expedition-brass/25 bg-black/18 hover:border-expedition-brass/45'
  }`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function toolUseCopy(tool) {
  if (!tool) return 'Use tool';
  if (tool.id === 'sketch') return 'Write note';
  if (tool.id === 'shotgun') return 'Fire';
  if (tool.id === 'hands') return 'Use hands';
  return `Use ${tool.name}`;
}

function promptActionText(value) {
  const stripped = String(value || '').replace(/^press\s+e\s+(?:to\s+)?/i, '').trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : 'Interact';
}

function InteractionPrompt() {
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const edgePrompt = useThreeGameStore(state => state.edgePrompt);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => (specimen.instanceId || specimen.id) === nearbySpecimenId || specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  if (carryPrompt) {
    return (
      <CompactPrompt>
        <CompactAction keyLabel="E" primary>{promptActionText(carryPrompt.text)}</CompactAction>
      </CompactPrompt>
    );
  }
  if (!nearby && !edgePrompt) return null;
  if (!nearby && edgePrompt) {
    const isOpen = edgePrompt.kind === 'open';
    return (
      <PromptCard title={edgePrompt.label} subtitle={edgePrompt.message || edgePrompt.description}>
        {isOpen && (
          <PromptAction keyLabel="E" primary>Travel</PromptAction>
        )}
        {edgePrompt.minutes !== undefined && (
          <PromptAction keyLabel=" ">{edgePrompt.minutes}m</PromptAction>
        )}
        {edgePrompt.fatigue !== undefined && edgePrompt.fatigue > 0 && (
          <PromptAction keyLabel="+">{edgePrompt.fatigue} fatigue</PromptAction>
        )}
      </PromptCard>
    );
  }

  const mainAction = activeToolId === 'sketch'
    ? 'Document specimen'
    : `Collect with ${tool?.name || 'tool'}`;
  return (
    <CompactPrompt>
      <CompactAction keyLabel="E" primary onClick={() => collectNearby()}>{mainAction}</CompactAction>
      <CompactAction keyLabel="I">Inspect</CompactAction>
      <CompactAction keyLabel="J">{toolUseCopy(tool)}</CompactAction>
    </CompactPrompt>
  );
}

function CameraModeToast() {
  const viewMode = useThreeGameStore(state => state.viewMode);
  const [toast, setToast] = useState(null);
  const mounted = React.useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    setToast({ id: Date.now(), label: CAMERA_MODE_LABELS[viewMode] || viewMode, note: 'Camera mode' });
    return undefined;
  }, [viewMode]);

  useEffect(() => {
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.code !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      setToast({ id: Date.now(), label: 'Recentered', note: 'Camera' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 1450);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className={`pointer-events-none absolute left-1/2 top-[5.4rem] w-[min(14rem,calc(100vw-2rem))] -translate-x-1/2 transition-all duration-300 ${toast ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
      <div className="rounded-sm border border-expedition-brass/65 bg-[rgba(19,24,24,0.68)] px-3 py-2 text-center font-expedition shadow-[0_10px_26px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(227,197,133,0.14)] backdrop-blur-md">
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-expedition-gold">{toast?.note || 'Camera'}</div>
        <div className="mt-0.5 text-[13px] font-semibold text-expedition-parchment">{toast?.label || CAMERA_MODE_LABELS[viewMode] || viewMode}</div>
      </div>
    </div>
  );
}

function MobileVitalsPanel() {
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const openStatusView = useThreeGameStore(state => state.openStatusView);

  return (
    <button
      type="button"
      onClick={openStatusView}
      title="View Darwin's status"
      aria-label="View Darwin's status"
      className="pointer-events-auto absolute z-20 w-[13.6rem] rounded-[7px] border border-expedition-brass/80 bg-[linear-gradient(165deg,rgba(18,28,36,0.78),rgba(9,15,22,0.82))] px-3 py-2.5 text-left font-expedition text-expedition-parchment shadow-[0_10px_28px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md transition active:scale-[0.99] md:hidden"
      style={{
        left: 'max(0.9rem, env(safe-area-inset-left))',
        top: 'calc(env(safe-area-inset-top) + 0.85rem)',
      }}
    >
      <div className="pointer-events-none absolute inset-[3px] rounded-[4px] border border-expedition-gold/20" />
      <div className="relative grid gap-2">
        <StatBar icon={HeartIcon} label="Health" value={health} fill="linear-gradient(90deg,#5f9e6a,#98c98f)" />
        <StatBar icon={FatigueIcon} label="Fatigue" value={fatigue} fill="linear-gradient(90deg,#c28b35,#e7b457)" />
      </div>
    </button>
  );
}

function MobileMapButton({ onOpenMap }) {
  return (
    <button
      type="button"
      onClick={onOpenMap}
      aria-label="Open island map"
      title="Open island map"
      className="pointer-events-auto absolute z-20 flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full border border-expedition-gold/85 bg-[radial-gradient(circle_at_40%_32%,rgba(42,56,63,0.92),rgba(7,12,18,0.94))] text-expedition-gold shadow-[0_10px_28px_rgba(0,0,0,0.38),inset_0_0_0_4px_rgba(201,163,95,0.13),inset_0_0_0_8px_rgba(0,0,0,0.22)] backdrop-blur-md transition active:scale-95 md:hidden"
      style={{
        right: 'max(1rem, env(safe-area-inset-right))',
        top: 'calc(env(safe-area-inset-top) + 0.9rem)',
      }}
    >
      <MapIcon className="h-8 w-8" />
    </button>
  );
}

function MobileJoystick() {
  const baseRef = React.useRef(null);
  const pointerRef = React.useRef(null);
  const lastRef = React.useRef({ forward: false, backward: false, left: false, right: false });
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const publishDirections = useCallback(next => {
    const previous = lastRef.current;
    ['forward', 'backward', 'left', 'right'].forEach(control => {
      if (previous[control] !== next[control]) setTouchControl(control, next[control]);
    });
    lastRef.current = next;
  }, []);

  const clearDirections = useCallback(() => {
    publishDirections({ forward: false, backward: false, left: false, right: false });
  }, [publishDirections]);

  const updateFromPointer = useCallback(event => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rawX = event.clientX - cx;
    const rawY = event.clientY - cy;
    const maxDistance = 38;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const threshold = 13;
    setKnob({ x, y, active: true });
    publishDirections({
      forward: y < -threshold,
      backward: y > threshold,
      left: x < -threshold,
      right: x > threshold,
    });
  }, [publishDirections]);

  const start = event => {
    event.preventDefault();
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  };

  const move = event => {
    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    updateFromPointer(event);
  };

  const stop = event => {
    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    pointerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setKnob({ x: 0, y: 0, active: false });
    clearDirections();
  };

  useEffect(() => clearDirections, [clearDirections]);

  return (
    <div
      ref={baseRef}
      role="application"
      aria-label="Move Darwin"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      className="pointer-events-auto absolute z-20 h-[7.4rem] w-[7.4rem] touch-none select-none rounded-full border border-expedition-gold/70 bg-[radial-gradient(circle,rgba(232,206,139,0.10)_0_31%,rgba(5,10,14,0.38)_32%_56%,rgba(9,14,18,0.64)_57%_100%)] shadow-[0_12px_30px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(227,197,133,0.17)] backdrop-blur-[2px] md:hidden"
      style={{
        left: 'max(1.15rem, env(safe-area-inset-left))',
        bottom: 'calc(env(safe-area-inset-bottom) + 6.1rem)',
      }}
    >
      {[
        ['top-2 left-1/2 -translate-x-1/2 border-b-[7px] border-l-[5px] border-r-[5px] border-b-expedition-gold/70 border-l-transparent border-r-transparent', 'up'],
        ['bottom-2 left-1/2 -translate-x-1/2 rotate-180 border-b-[7px] border-l-[5px] border-r-[5px] border-b-expedition-gold/55 border-l-transparent border-r-transparent', 'down'],
        ['left-2 top-1/2 -translate-y-1/2 -rotate-90 border-b-[7px] border-l-[5px] border-r-[5px] border-b-expedition-gold/55 border-l-transparent border-r-transparent', 'left'],
        ['right-2 top-1/2 -translate-y-1/2 rotate-90 border-b-[7px] border-l-[5px] border-r-[5px] border-b-expedition-gold/55 border-l-transparent border-r-transparent', 'right'],
      ].map(([className, key]) => <span key={key} className={`pointer-events-none absolute h-0 w-0 ${className}`} />)}
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[3.35rem] w-[3.35rem] rounded-full border border-[#f1d99a]/70 bg-[radial-gradient(circle_at_34%_28%,#fff2c2,#d3a756_58%,#8c642f)] shadow-[0_7px_16px_rgba(0,0,0,0.38),inset_0_2px_7px_rgba(255,255,255,0.42)] transition ${knob.active ? 'duration-75' : 'duration-200'}`}
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function pulseTouchControl(control) {
  setTouchControl(control, true);
  window.setTimeout(() => setTouchControl(control, false), 120);
}

function MobileActionButton({
  label,
  icon,
  className = '',
  size = 'large',
  onPress,
  holdControl = null,
}) {
  const pointerActivatedRef = React.useRef(false);
  const start = event => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (holdControl) {
      setTouchControl(holdControl, true);
    } else {
      pointerActivatedRef.current = true;
      onPress?.();
    }
  };
  const stop = event => {
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (holdControl) setTouchControl(holdControl, false);
  };
  const activate = event => {
    event.preventDefault();
    if (pointerActivatedRef.current) {
      pointerActivatedRef.current = false;
      return;
    }
    if (!holdControl) onPress?.();
  };
  const sizeClass = size === 'large' ? 'h-[5.5rem] w-[5.5rem]' : 'h-[4.15rem] w-[4.15rem]';
  const labelClass = size === 'large' ? 'text-[12px]' : 'text-[10px]';

  return (
    <button
      type="button"
      aria-label={label}
      onClick={activate}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      className={`pointer-events-auto absolute flex touch-none select-none flex-col items-center justify-center rounded-full border border-expedition-gold/80 bg-[radial-gradient(circle_at_42%_30%,rgba(30,43,50,0.92),rgba(5,10,15,0.96))] font-expedition text-expedition-gold shadow-[0_10px_24px_rgba(0,0,0,0.38),inset_0_0_0_3px_rgba(201,163,95,0.12),inset_0_0_0_7px_rgba(0,0,0,0.18)] backdrop-blur-md transition active:scale-95 active:border-expedition-goldbright active:text-expedition-goldbright ${sizeClass} ${className}`}
    >
      <span className={size === 'large' ? 'mb-1 h-8 w-8' : 'mb-0.5 h-6 w-6'}>{icon}</span>
      <span className={`${labelClass} font-semibold uppercase leading-none tracking-[0.08em]`}>{label}</span>
    </button>
  );
}

function MobileActionCluster() {
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => (
    (specimen.instanceId || specimen.id) === nearbySpecimenId || specimen.id === nearbySpecimenId
  ));

  const collect = () => {
    if (nearby) {
      collectNearby();
      return;
    }
    triggerToolUse(activeToolId);
  };

  return (
    <div
      className="pointer-events-none absolute z-20 h-[10.2rem] w-[10.4rem] md:hidden"
      style={{
        right: 'max(0.95rem, env(safe-area-inset-right))',
        bottom: 'calc(env(safe-area-inset-bottom) + 6.2rem)',
      }}
    >
      <MobileActionButton
        label="Jump"
        size="small"
        holdControl="jump"
        className="right-0 top-0"
        icon={(
          <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 4.3 C14.6 4.3 15.8 5.5 15.8 7.1 C15.8 8.7 14.6 9.9 13 9.9 C11.4 9.9 10.2 8.7 10.2 7.1 C10.2 5.5 11.4 4.3 13 4.3 Z" />
            <path d="M12.2 10.2 L9.5 14.4 L6.5 13.2 M12.1 10.3 L15.4 13.6 L18.8 12.3 M10.2 14.3 L10.4 19.8 M14.4 14.2 L16.8 20" />
          </svg>
        )}
      />
      <MobileActionButton
        label="Collect"
        onPress={collect}
        className="bottom-8 left-0"
        icon={<ButterflyIcon className="h-full w-full" />}
      />
      <MobileActionButton
        label="Examine"
        size="small"
        onPress={() => pulseTouchControl('inspect')}
        className="bottom-0 right-0"
        icon={<LensIcon className="h-full w-full" />}
      />
    </div>
  );
}

function KitIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="11" rx="1.7" />
      <path d="M8.5 8 V6.2 C8.5 5.4 9.1 4.8 9.9 4.8 H14.1 C14.9 4.8 15.5 5.4 15.5 6.2 V8 M4 12 H20 M11 12 V14.2 H13 V12" />
    </svg>
  );
}

function MobileBottomNav({ onOpenJournal, onToggleNarrative, onOpenCasebook, onOpenInventory, narrativeOpen }) {
  const items = [
    { id: 'journal', label: 'Journal', icon: <OpenBookIcon className="h-6 w-6" />, onClick: onOpenJournal },
    { id: 'narrative', label: 'Narrative', icon: <NoteIcon className="h-6 w-6" />, onClick: onToggleNarrative, active: narrativeOpen },
    { id: 'casebook', label: 'Casebook', icon: <ButterflyIcon className="h-6 w-6" />, onClick: onOpenCasebook },
    { id: 'inventory', label: 'Inventory', icon: <KitIcon className="h-6 w-6" />, onClick: onOpenInventory },
  ];

  return (
    <nav
      aria-label="Mobile expedition navigation"
      className="pointer-events-auto absolute z-20 rounded-[7px] border border-expedition-gold/75 bg-[linear-gradient(180deg,rgba(12,20,27,0.88),rgba(5,10,16,0.94))] px-2 py-1.5 font-expedition text-expedition-gold shadow-[0_10px_30px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md md:hidden"
      style={{
        left: 'max(1rem, env(safe-area-inset-left))',
        right: 'max(1rem, env(safe-area-inset-right))',
        bottom: 'calc(env(safe-area-inset-bottom) + 0.8rem)',
      }}
    >
      <div className="grid grid-cols-4">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 border-expedition-brass/45 px-0.5 py-1.5 transition active:scale-95 ${index > 0 ? 'border-l' : ''} ${item.active ? 'text-expedition-goldbright' : 'text-expedition-gold'}`}
          >
            {item.icon}
            <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.06em]">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-[3px] rounded-[4px] border border-expedition-gold/18" />
    </nav>
  );
}

function MobileNarrativeDrawer({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-3 z-30 md:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.8rem)' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close narrative"
        className="pointer-events-auto absolute -top-3 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-expedition-brass/70 bg-expedition-ink/90 text-expedition-gold shadow-lg"
      >
        ×
      </button>
      <NarrativePanel forceExpanded />
    </div>
  );
}

function MobileTouchControls() {
  return <MobileJoystick />;
}

// ---------------------------------------------------------------------------

// Isolated so cycling the camera doesn't re-render the entire HUD tree.
function CameraCycleButton({ className }) {
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  return <button type="button" onClick={cycleViewMode} className={className}>{viewMode}</button>;
}

export function ThreeHUD({ onTogglePerf }) {
  const [panel, setPanel] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryInitialTab, setInventoryInitialTab] = useState('tools');
  const [mobileNarrativeOpen, setMobileNarrativeOpen] = useState(false);
  const specimenDetailOpen = useThreeGameStore(state => Boolean(state.specimenDetail));
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);
  const blockingUiOpen = Boolean(panel || mapOpen || inventoryOpen || specimenDetailOpen || statusViewOpen);

  useEffect(() => {
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat && /^Digit[1-6]$/.test(event.code)) {
        const index = Number(event.code.replace('Digit', '')) - 1;
        // Read the order at keypress time so a reorder doesn't re-subscribe the
        // whole HUD root.
        if (useThreeGameStore.getState().toolbarOrder[index] === 'sketch') {
          event.preventDefault();
          setPanel('journal');
          return;
        }
      }
      if (event.code !== 'KeyI' || !(event.metaKey || event.ctrlKey) || event.repeat) return;
      event.preventDefault();
      setInventoryOpen(value => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    setBlockingUiMode(blockingUiOpen);
    return () => setBlockingUiMode(false);
  }, [blockingUiOpen]);
  const questComplete = useThreeGameStore(state => state.questComplete);

  const objective = useMemo(() => {
    if (questComplete) return 'Quest complete: return to Syms with specimen evidence.';
    return 'Quest: collect or document one animal, plant, or mineral sample.';
  }, [questComplete]);

  const openInventoryTab = useCallback(tab => {
    setMobileNarrativeOpen(false);
    setInventoryInitialTab(tab);
    setInventoryOpen(true);
  }, []);
  const openJournalPanel = useCallback(() => {
    setMobileNarrativeOpen(false);
    setPanel('journal');
  }, []);
  const openMapModal = useCallback(() => {
    setMobileNarrativeOpen(false);
    setMapOpen(true);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-expedition">
      {/* Regular HUD fades out while the diegetic status view owns the screen */}
      <div className={`transition-opacity duration-300 ${statusViewOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <TopChronometer />
      <TopObjective objective={objective} />

      <MobileVitalsPanel />
      <MobileMapButton onOpenMap={openMapModal} />

      <div className="absolute left-3 top-3 hidden md:block">
        <VitalStatusPanel />
      </div>

      <div className="absolute right-3 top-3 hidden md:block xl:hidden">
        <GameplayMinimap onOpenMap={openMapModal} />
      </div>

      <div className="absolute bottom-3 right-3 top-3 hidden xl:block">
        <FieldSidebar
          objective={objective}
          onOpenInventory={() => openInventoryTab('case')}
          onOpenMap={openMapModal}
          onOpenJournal={openJournalPanel}
        />
      </div>

      <InteractionPrompt />
      <CameraModeToast />
      <InspectableTooltip />

      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-goldbright/40 shadow-[0_0_10px_rgba(227,197,133,0.25)]">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-expedition-goldbright/70" />
      </div>

      <MobileNarrativeDrawer open={mobileNarrativeOpen} onClose={() => setMobileNarrativeOpen(false)} />

      <div className="absolute bottom-3 left-3 right-3 hidden flex-col gap-2 md:right-auto md:flex md:w-[31rem]">
        <NarrativePanel />
      </div>

      <div className="absolute bottom-[5.25rem] left-1/2 hidden -translate-x-1/2 justify-center md:flex lg:bottom-3">
        <ToolBelt onOpenJournal={openJournalPanel} />
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-[14.25rem] hidden gap-1.5 md:flex xl:hidden">
        <button type="button" onClick={openJournalPanel} className={GOLD_BUTTON}>Journal</button>
        <button type="button" onClick={() => openInventoryTab('case')} className={GOLD_BUTTON}>Case</button>
        <CameraCycleButton className={GOLD_BUTTON} />
      </div>

      <MobileTouchControls />
      <MobileActionCluster />
      <MobileBottomNav
        onOpenJournal={openJournalPanel}
        onToggleNarrative={() => setMobileNarrativeOpen(value => !value)}
        onOpenCasebook={() => openInventoryTab('case')}
        onOpenInventory={() => openInventoryTab('tools')}
        narrativeOpen={mobileNarrativeOpen}
      />
      </div>

      <StatusView />

      <IslandMapModal open={mapOpen} onClose={() => setMapOpen(false)} />
      <InventoryModal open={inventoryOpen} onClose={() => setInventoryOpen(false)} initialTab={inventoryInitialTab} />
      <SpecimenDetailModal />

      <FieldNotebook
        panel={panel}
        onClose={() => setPanel(null)}
        onOpenMap={() => {
          setPanel(null);
          openMapModal();
        }}
      />
      <ZoneTransitionOverlay />
    </div>
  );
}
