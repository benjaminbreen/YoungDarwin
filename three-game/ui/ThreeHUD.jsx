'use client';

import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getInventoryItem } from '../../data/inventoryItems';
import { FieldNotebook } from '../../field-notebook/FieldNotebook';
import { getThreeSpecimens, threeTools } from '../data';
import {
  TOGGLE_COMPASS_EVENT,
  TOOL_USE_EVENT,
  setTouchControl,
  triggerToolUse,
} from '../input/touchControls';
import { isGameplayInputBlocked, setBlockingUiMode, setExpeditionPaused, setTypingMode } from '../input/typingMode';
import { getFieldDilemma, getRuntimePlayerPose, useThreeGameStore } from '../store';
import { EXPEDITION_DAYS, expeditionDayLabel, isFinalExpeditionDay } from '../expeditionOutcomes';
import { isEndGameNarratorCommand } from '../finalAssessment';
import { MemoryLinkedText } from '../library/MemoryLinkedText';
import { PLAYER_VISIBLE_NARRATOR_ENABLED } from '../ai/generativePolicy';
import { SHOTGUN } from '../shooting/shotgunConfig';
import { PLAYER } from '../components/player/playerConfig';
import { emitPropEvent } from '../physics/props/propEvents';
import { shotgunAimState } from '../shooting/aimState';
import { getZone } from '../world/floreanaZones';
import { getBeagleSightline } from '../world/beagleSightlines';
import { ExamineView } from './ExamineView';
import { StatusView } from './StatusView';
import { BookReaderView } from './BookReaderView';
import { NpcEncounterModal } from './NpcEncounterModal';
import { ExpeditionOutcomeModal } from './ExpeditionOutcomeModal';
import { FinalAssessmentModal } from './FinalAssessmentModal';
import { CONTEXT_PROMPT_PRIORITY } from './contextPromptService';
import {
  ExpeditionPanel,
  PanelTabs,
  GOLD_LABEL,
  GOLD_BUTTON,
  GoldDivider,
} from './expedition/ExpeditionPanel';
import {
  CONTROL_HINT_INACTIVITY_MS,
  controlsSections,
  nextControlHintPhase,
} from './controlsReference';
import { useDismissableOverlay } from './useDismissableOverlay';
import { animalAwarenessValue, animalRisk } from './animalVitals';
import {
  getDirective,
  getDirectivePosition,
  postOfficeBaySurveyProgress,
  POST_OFFICE_BAY_SURVEY_TARGET,
} from '../directives';
import { ComfortSettings } from './ComfortSettings';
import { vitalsGradient } from './theme';
import { QUALITY_CHOICES } from '../qualityPreference';
import {
  CompassRoseIcon,
  HeartIcon,
  FatigueIcon,
  CuriosityIcon,
  ButterflyIcon,
  NoteIcon,
  OpenBookIcon,
  MapIcon,
  SoundIcon,
  LensIcon,
  NorthArrowIcon,
  TOOL_ICONS,
} from './expedition/icons';
import { useTerrainChart } from './expedition/TerrainMinimap';
import { GalapagosGlobe } from './expedition/GalapagosGlobe';
import { InventoryModal } from './expedition/InventoryModal';
import { CollectionCelebration, celebrationVisibleMs } from './CollectionCelebration';
import { FieldDilemmaModal } from './FieldDilemmaModal';
import { CaseFullModal } from './CaseFullModal';
import { NightlyDebriefModal } from './NightlyDebriefModal';
import { getSpecimenRarity, rarityForTier } from '../rarity';
import { RarityBadge } from './RarityBadge';
import { SpecimenPortrait } from './SpecimenPortrait';
import { playSightingSting } from '../audio/audioRuntime';
import { useZoneSpecimenProgress } from './useZoneSpecimenProgress';
import { SpecimenDetailModal } from './expedition/SpecimenDetailModal';
import { IslandMapModal } from './expedition/map/IslandMapModal';
import { CompassDial } from './expedition/CompassDial';
import {
  ISLAND_MAP_ASPECT,
  ISLAND_MAP_IMAGE,
  getIslandMapLocation,
  islandMapLocations,
} from './expedition/map/islandLocations';
import { SYMS_DIRECTIVES } from '../npcs/symsActivityPlan';
import { getNpcPoses } from '../world/npcRuntime';
import { getInteriorDefinition, getInteriorTransitions } from '../interiors/interiorRegistry';
import { InteriorFloorPlan } from '../interiors/InteriorFloorPlan';
import { rarityLabel } from '../world/inspectables';
import { normalizeWeatherState } from '../world/weatherStates';
import { fieldConditionFor } from '../world/fieldConditions';
import {
  getAnimalAction,
  getAnimalActionImage,
  getPlayableActionItem,
  getPlayableMode,
} from '../playable/playableModes';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener?.(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener?.(update);
    };
  }, [query]);
  return matches;
}

const MINIMAP_TRAIL_MS = 15000;
const MINIMAP_TRAIL_MAX_POINTS = 34;
const MINIMAP_TRAIL_MIN_STEP = 0.7;
const MINIMAP_RUNTIME_POLL_MS = 100;
const MINIMAP_RUNTIME_MOVE_EPSILON = 0.08;
const MINIMAP_RUNTIME_HEADING_EPSILON = 1.2;
const BEAGLE_RETURN_TRAVEL = Object.freeze({
  minutes: 30,
  fatigue: 3,
  note: "A ship's boat puts off from the beach and carries you back across the anchorage to HMS Beagle.",
  educationalNote: "Darwin's shore work depended on small boats shuttling specimens, tools, and people between anchorages and landing places.",
});

// The `?hud=legacy` escape hatch and the parallel desktop composition behind
// it were retired in 2026-08. The polished layout is the only desktop HUD.

function hasDevelopmentQueryFlag(flag) {
  return process.env.NODE_ENV !== 'production'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has(flag);
}

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

function getToolbarItem(id) {
  return getInventoryItem(id) || getPlayableActionItem(id);
}

function AnimalActionIcon({ actionId, playableModeId, className = 'h-7 w-7' }) {
  const image = getAnimalActionImage(actionId, playableModeId);
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={`${className} object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)]`}
        draggable={false}
        aria-hidden="true"
      />
    );
  }
  if (actionId === 'eat') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.5 14.5 C8.5 9.4 13.4 6.6 19 6.2 C18.5 11.8 15.5 16.4 10.2 18.8" />
        <path d="M5 19 C8.1 15.1 11.8 11.6 17.2 7.3" />
      </svg>
    );
  }
  if (actionId === 'sleep') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17.5 H19" />
        <path d="M7 17.5 C7.2 13.7 9.6 11.2 13.3 11.2 C16.1 11.2 18.1 12.9 18.8 15.3" />
        <path d="M14.5 5 H19 L14.2 10 H19" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 6.2 C10 4.7 13.8 5.4 16 7.8 C18.5 10.6 18.1 15.1 15.2 17.3 C12.1 19.6 7.5 18.7 5.6 15.4" />
      <path d="M8.5 13.5 C9.4 14.7 10.7 15.2 12.2 15.1" />
      <path d="M17.2 17.6 L19.4 20" />
    </svg>
  );
}

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

// Floreana is on the equator, so the working day is close enough to 6-to-18
// every day of the year that a constant pair is more honest than a solar model.
const FIELD_DAY_START_HOUR = 6;
const FIELD_DAY_END_HOUR = 18;

// A two-hour halt against a three-day survey is the largest single expense in
// the game. The button has to say what it costs before it is pressed.
function restCostHint(supplies) {
  return (supplies?.provisions || 0) > 0
    ? 'Costs one provision.'
    : 'No provisions left — the halt will do little good.';
}

// Banner shows the objective sentence itself; the "Quest:" prefix is implied
// by the compass chrome (per mockup).
function formatBannerObjective(objective) {
  const stripped = objective.replace(/^Quest: /, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function sentenceCase(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

const ROUTE_DIRECTION_LABELS = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  northeast: 'Northeast',
  northwest: 'Northwest',
  southeast: 'Southeast',
  southwest: 'Southwest',
};

const ROUTE_PLACE_COPY = {
  POST_OFFICE_BAY: 'A sheltered cove, black lava shore, and the old mail barrel.',
  N_SHORE: 'Black sand, broken lava, dry coastal scrub.',
  NW_REEF: 'Clear shallows, dark reef rock, and fish moving over pale sand.',
  S_HUT: 'White shell sand, an abandoned hut, and loam garden beds.',
  S_REEFS: 'Pure white sand, clear teal shallows, and open southern water.',
  W_HIGH: 'A dry climb into red dirt, scrub, and cooler upland air.',
  EL_MIRADOR: 'A high red ridge with long views across Charles Island.',
  MANGROVES: 'Still water, mangrove shade, and soft mud underfoot.',
  PENAL_COLONY: 'Fenced fields, rough huts, and damp highland ground.',
};

function directionLabel(edge) {
  return ROUTE_DIRECTION_LABELS[edge] || sentenceCase(edge || 'route');
}

function routePlaceCopy(zone, prompt) {
  if (zone?.id && ROUTE_PLACE_COPY[zone.id]) return ROUTE_PLACE_COPY[zone.id];
  const source = zone?.narration?.loadingNote || zone?.description || prompt?.description || '';
  const cleaned = String(source)
    .replace(/^travel\s+\w+\s+to\s+[^.]+\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'The track continues into the next locality.';
  const first = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return first.length > 110 ? `${first.slice(0, 107).trim()}...` : first;
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
      className={`pointer-events-none absolute z-20 rounded-md border border-expedition-gold/60 bg-[rgba(14,24,44,0.8)] px-3 py-2.5 font-expedition text-expedition-parchment shadow-[0_12px_26px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(227,197,133,0.13)] backdrop-blur-md transition-[opacity,transform,left,top] duration-500 ease-out ${visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-[0.965] opacity-0'}`}
    >
      {anchorVisible && (
        <div className="absolute -left-2 top-9 h-4 w-4 rotate-45 border-b border-l border-expedition-gold/45 bg-[rgba(14,24,44,0.8)]" />
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

function BeagleTravelPrompt() {
  const prompt = useThreeGameStore(state => state.beagleTravelPrompt);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const closeBeagleTravelPrompt = useThreeGameStore(state => state.closeBeagleTravelPrompt);

  const handleReturn = useCallback(() => {
    beginZoneTransition('BEAGLE', {
      minutes: BEAGLE_RETURN_TRAVEL.minutes,
      fatigue: BEAGLE_RETURN_TRAVEL.fatigue,
      note: BEAGLE_RETURN_TRAVEL.note,
      educationalNote: BEAGLE_RETURN_TRAVEL.educationalNote,
      travelCard: {
        fromZoneId: 'POST_OFFICE_BAY',
        toZoneId: 'BEAGLE',
        title: 'Return by ship boat',
        terrainType: 'open water',
        estimatedMinutes: BEAGLE_RETURN_TRAVEL.minutes,
        fatigueDelta: BEAGLE_RETURN_TRAVEL.fatigue,
        routeLabel: 'Boat',
        description: BEAGLE_RETURN_TRAVEL.note,
        educationalNote: BEAGLE_RETURN_TRAVEL.educationalNote,
      },
    });
  }, [beginZoneTransition]);

  useEffect(() => {
    if (!prompt) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') closeBeagleTravelPrompt();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeBeagleTravelPrompt, prompt]);

  useEffect(() => {
    if (prompt && currentZoneId !== 'POST_OFFICE_BAY') closeBeagleTravelPrompt();
  }, [closeBeagleTravelPrompt, currentZoneId, prompt]);

  if (!prompt || currentZoneId !== 'POST_OFFICE_BAY') return null;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-20 z-30 w-[min(23rem,calc(100vw-1.5rem))] -translate-x-1/2 animate-hud-rise motion-reduce:animate-none md:top-[16%]">
      <ExpeditionPanel variant="modal" className="w-full" innerClassName="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-expedition-gold/55 bg-expedition-gold/10 text-expedition-goldbright">
            <CompassRoseIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={GOLD_LABEL}>Ship&apos;s Boat</div>
            <h2 className="mt-1 text-[21px] font-bold leading-tight text-expedition-parchment">HMS Beagle</h2>
          </div>
          <button
            type="button"
            aria-label="Dismiss Beagle travel prompt"
            onClick={closeBeagleTravelPrompt}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-expedition-brass/55 bg-black/18 text-[16px] font-bold text-expedition-gold transition hover:border-expedition-gold hover:bg-expedition-gold/12 focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
          >
            x
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-expedition-parchment/86">
          Signal the boat and return aboard to sort notes and specimens.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 border-y border-expedition-brass/35 py-2.5 text-[11px] uppercase tracking-[0.12em] text-expedition-faded">
          <div className="flex items-center gap-1.5">
            <CompassRoseIcon className="h-4 w-4 text-expedition-gold" />
            <span>{BEAGLE_RETURN_TRAVEL.minutes} min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FatigueIcon className="h-4 w-4 text-expedition-gold" />
            <span>+{BEAGLE_RETURN_TRAVEL.fatigue} fatigue</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={handleReturn} className={`${GOLD_BUTTON} inline-flex flex-1 items-center justify-center`}>
            Return to Beagle
          </button>
          <button
            type="button"
            onClick={closeBeagleTravelPrompt}
            className="rounded-sm border border-expedition-brass/55 bg-black/18 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-expedition-faded transition hover:border-expedition-gold/70 hover:bg-expedition-gold/10 hover:text-expedition-parchment focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
          >
            Stay ashore
          </button>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

// The card that closes a halt in the field. Deliberately a panel and not an
// overlay: the line describes the ground Darwin is lying on, so the ground has
// to stay visible behind it. Copy comes from restFlavor, keyed on the region
// and the hour. Suppressed when the halt ran the clock past the last day —
// Henslow's judgment is already opening over the top of it.
function RestCard() {
  const restSession = useThreeGameStore(state => state.restSession);
  const dismissRest = useThreeGameStore(state => state.dismissRest);
  const complete = restSession?.phase === 'complete' && !restSession.departed;

  // Auto-clears so a halt never leaves the player a dialog to close, but stays
  // long enough to read two sentences.
  useEffect(() => {
    if (!complete) return undefined;
    const timer = window.setTimeout(dismissRest, 9000);
    return () => window.clearTimeout(timer);
  }, [complete, dismissRest, restSession?.id]);

  if (!complete) return null;

  return (
    <div className="pointer-events-auto absolute bottom-[7.5rem] left-1/2 z-30 w-[min(25rem,calc(100vw-1.5rem))] -translate-x-1/2 animate-hud-rise motion-reduce:animate-none">
      <ExpeditionPanel variant="modal" className="w-full" innerClassName="p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className={GOLD_LABEL}>{restSession.title}</div>
          <div className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-expedition-faded">
            {restSession.placeName} · {formatExpeditionTime(restSession.endedAt)}
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-expedition-parchment/90">{restSession.line}</p>
        <p className="mt-1.5 text-[12px] italic leading-snug text-expedition-faded">{restSession.provision}</p>
        <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-expedition-brass/30 pt-2 text-center">
          <div>
            <dt className="text-[8.5px] uppercase tracking-[0.14em] text-expedition-brass">Time spent</dt>
            <dd className="mt-0.5 font-expedition text-[15px] text-expedition-goldbright">2h</dd>
          </div>
          <div>
            <dt className="text-[8.5px] uppercase tracking-[0.14em] text-expedition-brass">Fatigue</dt>
            <dd className="mt-0.5 font-expedition text-[15px] text-expedition-goldbright">
              −{Math.round(restSession.fatigueRecovered || 0)}
            </dd>
          </div>
          <div>
            <dt className="text-[8.5px] uppercase tracking-[0.14em] text-expedition-brass">Stores</dt>
            <dd className="mt-0.5 font-expedition text-[15px] text-expedition-goldbright">
              {restSession.provisioned ? '−1 / −1' : '—'}
            </dd>
          </div>
        </dl>
      </ExpeditionPanel>
    </div>
  );
}

// Aboard the Beagle: land the case, draw fresh stores, and sleep. This is the
// loop's turn — a 12-slot case is a day's carrying capacity rather than a cap
// on the whole voyage, and the day only advances here, so time is spent
// deliberately rather than bleeding away.
function ShipDutiesPrompt() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const inventory = useThreeGameStore(state => state.inventory);
  const shipCollection = useThreeGameStore(state => state.shipCollection);
  const day = useThreeGameStore(state => state.day);
  const landCollectionAtBeagle = useThreeGameStore(state => state.landCollectionAtBeagle);
  const [dismissed, setDismissed] = useState(false);

  // Re-offer on each arrival rather than once per session.
  useEffect(() => {
    setDismissed(false);
  }, [currentZoneId]);

  if (currentZoneId !== 'BEAGLE' || dismissed) return null;

  const cased = inventory.length;
  const landed = shipCollection.length;
  // On the last field day the same button ends the expedition, so the panel has
  // to say so before it is pressed.
  const departing = isFinalExpeditionDay(day);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-20 z-30 w-[min(23rem,calc(100vw-1.5rem))] -translate-x-1/2 animate-hud-rise motion-reduce:animate-none md:top-[16%]">
      <ExpeditionPanel variant="modal" className="w-full" innerClassName="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className={GOLD_LABEL}>Ship&apos;s Duties</div>
            <h2 className="mt-1 text-[21px] font-bold leading-tight text-expedition-parchment">
              {departing ? 'Weigh anchor' : 'Land the collection'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Dismiss ship duties"
            onClick={() => setDismissed(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-expedition-brass/55 bg-black/18 text-[16px] font-bold text-expedition-gold transition hover:border-expedition-gold hover:bg-expedition-gold/12 focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
          >
            x
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-expedition-parchment/86">
          {departing
            ? (cased > 0
              ? `This is the last day of the survey. Hand down ${cased} specimen${cased === 1 ? '' : 's'} and the Beagle sails for the next island.`
              : 'This is the last day of the survey. The case is empty, and the Beagle sails for the next island.')
            : (cased > 0
              ? `Hand down ${cased} specimen${cased === 1 ? '' : 's'} to be struck below, draw fresh provisions, and pass the night aboard.`
              : 'The case is empty. Draw fresh stores from the hold and pass the night aboard.')}
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-expedition-brass/30 pt-3 text-center">
          <div>
            <dt className="text-[9px] uppercase tracking-[0.14em] text-expedition-brass">In case</dt>
            <dd className="mt-0.5 font-expedition text-[17px] text-expedition-goldbright">{cased}</dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-[0.14em] text-expedition-brass">Aboard</dt>
            <dd className="mt-0.5 font-expedition text-[17px] text-expedition-goldbright">{landed}</dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-[0.14em] text-expedition-brass">Day</dt>
            <dd className="mt-0.5 font-expedition text-[17px] text-expedition-goldbright">{day} / {EXPEDITION_DAYS}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={landCollectionAtBeagle}
          data-testid="beagle-land-collection"
          className="mt-4 w-full rounded-sm border border-expedition-gold/70 bg-expedition-gold/12 px-3 py-2.5 font-expedition text-[13px] font-semibold uppercase tracking-[0.12em] text-expedition-goldbright transition hover:border-expedition-goldbright hover:bg-expedition-gold/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
        >
          {departing ? 'Stow the case & sail' : 'Stow the case & turn in'}
        </button>
        <p className="mt-2 text-center text-[11px] italic leading-snug text-expedition-faded">
          {departing
            ? 'This ends the expedition. Anything still unwritten stays unwritten.'
            : `The expedition resumes at first light on day ${day + 1}.`}
        </p>
      </ExpeditionPanel>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Top banner

// The survey is three days long and every clock in the HUD has to say so — a
// deadline the player cannot see is not a deadline. Goes gold on the last day.
function ExpeditionDayCount({ day, className = '' }) {
  const last = isFinalExpeditionDay(day);
  return (
    <span
      className={`${last ? 'font-semibold text-expedition-goldbright' : 'text-expedition-faded'} ${className}`}
      title={last ? 'The Beagle sails at the end of this day' : undefined}
    >
      {last ? `Last day of ${EXPEDITION_DAYS}` : expeditionDayLabel(day)}
    </span>
  );
}

function TopChronometer({ className = '' }) {
  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);

  return (
    <div className={`absolute left-1/2 top-3 hidden w-[min(29rem,calc(100vw-8rem))] -translate-x-1/2 text-center md:block sm:w-[min(32rem,calc(100vw-24rem))] xl:hidden ${className}`}>
      <div className="pointer-events-none inline-flex max-w-full items-center gap-2 rounded-full border border-expedition-gold/60 bg-[rgba(12,20,38,0.6)] px-3.5 py-1.5 font-expedition text-expedition-parchment shadow-lg backdrop-blur-md">
        <CompassRoseIcon className="hidden h-3.5 w-3.5 text-expedition-gold sm:block" />
        <span className="truncate text-xs font-semibold tracking-wide sm:text-sm">
          {formatExpeditionDate(day)}
        </span>
        <span className="text-expedition-brass">|</span>
        <span className="whitespace-nowrap text-[11px] text-expedition-faded sm:text-xs">
          {formatExpeditionTime(timeOfDay)}
        </span>
        <span className="text-expedition-brass">|</span>
        <ExpeditionDayCount day={day} className="whitespace-nowrap text-[11px] sm:text-xs" />
        <span className="hidden text-expedition-brass sm:inline">|</span>
        <span className="hidden truncate text-[11px] text-expedition-gold sm:inline">
          {zone.shortName || zone.name}
        </span>
      </div>
    </div>
  );
}


const WEATHER_COPY = {
  sunny: {
    title: 'Clear Trade Wind',
    note: 'Bright equatorial light, thin cloud, hard shadows.',
  },
  tradeWind: {
    title: 'Trade Wind',
    note: 'Bright air, quick cloud shadows, and restless grass.',
  },
  marineHaze: {
    title: 'Marine Haze',
    note: 'Dry salt haze softens the horizon without closing the sky.',
  },
  cloudy: {
    title: 'Broken Cloud',
    note: 'Cumulus crossing the bay with softened glare.',
  },
  sunbreak: {
    title: 'Sunbreak',
    note: 'Cloud opens into moving patches of clean light.',
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
    title: 'Patchy Mist',
    note: 'Cool low vapour drifts lightly from the higher ground.',
  },
  garua: {
    title: 'Garua',
    note: 'Highland low cloud hangs damp and silver over the slopes.',
  },
  denseGarua: {
    title: 'Dense Garua',
    note: 'A rare white shroud drops visibility across the high ground.',
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


function WeatherGlyph({ weather, className = '' }) {
  const kind = normalizeWeatherState(weather);
  const sunlitBreak = kind === 'sunshower' || kind === 'sunbreak';
  const rain = kind === 'sunshower' || kind === 'drizzle' || kind === 'rain' || kind === 'storm';
  const storm = kind === 'storm';
  const sun = kind === 'sunny' || kind === 'tradeWind' || kind === 'marineHaze';
  const fog = kind === 'misty' || kind === 'garua' || kind === 'denseGarua' || kind === 'marineHaze';
  const cloudLine = ['cloudy', 'overcast', 'tradeWind', 'marineHaze', 'sunbreak'].includes(kind);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
      {sun ? (
        <>
          <circle cx="12" cy="12" r="3.4" fill="currentColor" fillOpacity="0.22" />
          <path d="M12 3.5 V5.3 M12 18.7 V20.5 M3.5 12 H5.3 M18.7 12 H20.5 M5.9 5.9 L7.2 7.2 M16.8 16.8 L18.1 18.1 M18.1 5.9 L16.8 7.2 M7.2 16.8 L5.9 18.1" opacity="0.75" />
        </>
      ) : (
        <>
          {sunlitBreak && (
            <>
              <circle cx="7.2" cy="7.2" r="2.3" fill="currentColor" fillOpacity="0.18" />
              <path d="M7.2 2.8 V4 M7.2 10.4 V11.6 M2.8 7.2 H4 M10.4 7.2 H11.6 M4.1 4.1 L5 5 M9.4 9.4 L10.3 10.3" opacity="0.5" />
            </>
          )}
          <path d="M7.4 15.2 H17.1 C19 15.2 20.5 13.8 20.5 12 C20.5 10.2 19.1 8.9 17.4 8.8 C16.8 6.3 14.7 4.8 12.3 4.8 C9.9 4.8 8 6.2 7.2 8.4 C5.1 8.5 3.5 9.9 3.5 11.8 C3.5 13.7 5.1 15.2 7.4 15.2 Z" fill="currentColor" fillOpacity="0.12" />
          {cloudLine && <path d="M5.2 18.2 H18.8" opacity="0.45" />}
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


// Notable-condition badge for the objective banner. Absent on an ordinary
// day, which is the point — it only earns attention by being rare.
function FieldConditionBadge({ condition }) {
  if (!condition) return null;
  return (
    <span
      key={condition.id}
      title={condition.note}
      className="shrink-0 animate-hud-fade rounded-[3px] border border-expedition-gold/60 bg-expedition-gold/10 px-1.5 py-[2px] text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-expedition-goldbright motion-reduce:animate-none"
    >
      {condition.label}
    </span>
  );
}

// How long the completed objective stays struck through before the next one
// takes the banner. Long enough to read and register, short enough that it
// never feels like a modal.
const OBJECTIVE_COMPLETE_HOLD_MS = 1900;

// Whether the player left the banner open. Persisted so the choice survives
// the next objective and the next session.
const OBJECTIVE_EXPANDED_KEY = 'darwin.hud.objectiveExpanded';

function readObjectiveExpanded() {
  try {
    return window.localStorage?.getItem(OBJECTIVE_EXPANDED_KEY) === 'open';
  } catch {
    return false;
  }
}

function writeObjectiveExpanded(expanded) {
  try {
    window.localStorage?.setItem(OBJECTIVE_EXPANDED_KEY, expanded ? 'open' : 'shut');
  } catch {
    // A blocked preference store should not block the control itself.
  }
}

// True while the collapsed headline is clipping its text. The chevron on its
// own does not tell the player there is more to read.
function useTextClipped(ref, text, active) {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !active) {
      setClipped(false);
      return undefined;
    }
    const measure = () => setClipped(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, ref, text]);
  return clipped;
}

// Watches the state an objective could depend on and re-resolves when it
// changes. One watcher rather than a refreshDirective() call sprinkled through
// every action, so a new objective cannot silently fail to advance.
function DirectiveTracker() {
  const refreshDirective = useThreeGameStore(state => state.refreshDirective);
  const signature = useThreeGameStore(state => [
    state.visitedLocalCellIds?.length || 0,
    state.activeToolId,
    state.examinedTypeIds?.length || 0,
    state.collectedSpecimenIds?.length || 0,
    (state.npcEncounterState?.syms_covington?.flags || []).length,
    state.visitedZoneIds?.length || 0,
    state.shipCollection?.length || 0,
    state.journal?.length || 0,
  ].join('|'));

  useEffect(() => {
    refreshDirective();
  }, [refreshDirective, signature]);

  return null;
}

function PolishedTopObjective({ objective, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const headlineRef = useRef(null);
  const directiveCompletedId = useThreeGameStore(state => state.directiveCompletedId);
  const clearCompletedDirective = useThreeGameStore(state => state.clearCompletedDirective);
  const landingSurveyProgress = useThreeGameStore(postOfficeBaySurveyProgress);
  const completedDirective = getDirective(directiveCompletedId);

  // While a finished objective holds the banner, show its own hint and detail.
  // Otherwise the body describes the next objective under a struck-through
  // line.
  const shownBase = completedDirective || objective;
  const shown = shownBase?.id === 'explore'
    ? {
        ...shownBase,
        text: `${shownBase.text} · ${Math.min(landingSurveyProgress, POST_OFFICE_BAY_SURVEY_TARGET)}/${POST_OFFICE_BAY_SURVEY_TARGET}`,
      }
    : shownBase;
  const position = getDirectivePosition(shown.id);
  const clipped = useTextClipped(headlineRef, shown.text, !expanded);

  useEffect(() => {
    setExpanded(readObjectiveExpanded());
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded(value => {
      writeObjectiveExpanded(!value);
      return !value;
    });
  }, []);

  // Hold the struck-through line long enough to read, then hand the banner
  // back to the new objective.
  useEffect(() => {
    if (!directiveCompletedId) return undefined;
    const timer = window.setTimeout(clearCompletedDirective, OBJECTIVE_COMPLETE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [clearCompletedDirective, directiveCompletedId]);

  const day = useThreeGameStore(state => state.day);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const weather = useThreeGameStore(state => state.weather);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zone = getZone(currentZoneId);
  const normalizedWeather = normalizeWeatherState(weather);
  const weatherCopy = WEATHER_COPY[normalizedWeather] || {
    title: sentenceCase(normalizedWeather || 'weather'),
    note: 'Local conditions recorded from the sky.',
  };
  const condition = fieldConditionFor({ weather: normalizedWeather, timeOfDay, zone });

  return (
    // Below xl the chronometer owns the top centre and the gap left beside it
    // is too narrow for a sentence, so the banner docks under the status panel.
    // The 6.6rem offset clears the touch-only vitals panel and map button;
    // with a mouse those are hidden and the top edge is free.
    <div
      className={`pointer-events-none absolute top-3 left-[max(0.9rem,env(safe-area-inset-left))] right-[max(0.9rem,env(safe-area-inset-right))] max-md:coarsepointer:top-[calc(env(safe-area-inset-top)+6.6rem)] animate-hud-rise [animation-delay:75ms] motion-reduce:animate-none md:left-3 md:right-auto md:top-[10.75rem] md:w-[24rem] xl:left-1/2 xl:top-3 xl:w-[min(32rem,calc(100vw-42rem))] xl:min-w-[23rem] xl:-translate-x-1/2 ${className}`}
    >
      <ExpeditionPanel variant="objective" innerClassName="overflow-hidden">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          title={expanded ? undefined : shown.text}
          aria-label={expanded ? 'Hide objective detail' : `Objective: ${shown.text}. Show detail.`}
          className="pointer-events-auto grid w-full grid-cols-[2.35rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-expedition-gold/65 bg-expedition-gold/10 shadow-[inset_0_0_8px_rgba(0,0,0,0.35)]">
            <CompassRoseIcon className="h-6 w-6 text-expedition-gold" />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-baseline gap-2 leading-none">
              <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-expedition-gold">Objective</span>
              {/* Zone and time only where the banner replaces the chronometer.
                  Below xl both are already in the pill above it. */}
              <span className="hidden h-1 w-1 shrink-0 rotate-45 bg-expedition-brass/85 xl:block" />
              <span className="hidden min-w-0 truncate text-[12.5px] font-semibold tracking-[0.035em] text-expedition-parchment/95 xl:inline">
                {zone.shortName || zone.name}
              </span>
              <span className="hidden shrink-0 text-expedition-brass/70 xl:inline">·</span>
              <span className="hidden shrink-0 text-[11.5px] font-medium tracking-[0.04em] text-expedition-goldbright/90 xl:inline">
                {formatExpeditionTime(timeOfDay)}
              </span>
              <span className="hidden shrink-0 text-expedition-brass/70 xl:inline">·</span>
              <ExpeditionDayCount day={day} className="hidden shrink-0 text-[11.5px] font-medium tracking-[0.04em] xl:inline" />
              {/* Pushed to the right edge of the meta line, just inside the
                  chevron. The zone name truncates before this does. */}
              <span className="ml-auto flex shrink-0 items-center pl-2">
                <FieldConditionBadge condition={condition} />
              </span>
            </span>
            {/* Completion beat: the finished line is struck through in ink
                and ticked, holds long enough to register, then the next
                objective fades up in its place. No splash, no counter — a
                naturalist ruling off a line in a notebook. */}
            <span className="relative mt-1 block">
              <span
                ref={headlineRef}
                data-hud="objective-line"
                key={completedDirective ? `done:${completedDirective.id}` : `active:${shown.text}`}
                className={`block text-[15.5px] font-semibold leading-tight tracking-wide transition-colors duration-500 ${
                  expanded ? 'whitespace-normal' : 'truncate'
                } ${
                  completedDirective
                    ? 'text-expedition-goldbright'
                    : 'animate-hud-fade text-expedition-parchment motion-reduce:animate-none'
                }`}
              >
                {completedDirective ? (
                  <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${expanded ? '' : 'max-w-full'}`}>
                    <span className="shrink-0 not-italic text-expedition-goldbright">&#10003;</span>
                    <span className={`min-w-0 line-through decoration-expedition-gold/70 decoration-[1.5px] ${expanded ? '' : 'truncate'}`}>
                      {formatBannerObjective(completedDirective.text)}
                    </span>
                  </span>
                ) : formatBannerObjective(shown.text)}
              </span>
              {/* A single gold rule sweeps the width once, then stops. */}
              {completedDirective && (
                <span
                  key={`rule:${completedDirective.id}`}
                  className="pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left animate-objective-rule bg-gradient-to-r from-transparent via-expedition-goldbright to-transparent motion-reduce:animate-none"
                />
              )}
            </span>
          </span>
          {/* Boxed so it reads as a control rather than ornament, and filled
              when the headline is being clipped. */}
          <span
            className={`flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-300 ${
              expanded || clipped
                ? 'border-expedition-gold/60 bg-expedition-gold/10 text-expedition-goldbright'
                : 'border-expedition-brass/45 bg-black/15 text-expedition-gold/75'
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <path d="M3.5 6 L8 10.5 L12.5 6" />
            </svg>
          </span>
        </button>
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? 'grid-rows-[1fr] border-t border-expedition-brass/40 opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="px-4 pb-2.5 pt-2">
              {/* Hint is how, detail is why. Both are authored per objective in
                  directives.js; the fallbacks cover the exhausted list. */}
              <p className="m-0 text-[12px] italic leading-snug text-expedition-faded">
                {shown.hint || 'Approach carefully, examine the evidence, then choose whether to document or collect.'}
              </p>
              {shown.detail && (
                <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-expedition-parchment/80">
                  {shown.detail}
                </p>
              )}
              {/* The badge is a glance; this is where it explains itself. */}
              {condition && (
                <p className="m-0 mt-1.5 text-[11.5px] leading-snug text-expedition-goldbright/85">
                  <span className="font-semibold uppercase tracking-[0.14em]">{condition.label}</span>
                  <span className="text-expedition-brass/70"> · </span>
                  <span className="italic text-expedition-faded">{condition.note}</span>
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 border-t border-expedition-brass/25 pt-1.5 text-[10.5px] text-expedition-faded">
                <WeatherGlyph weather={normalizedWeather} className="h-5 w-5 shrink-0 text-expedition-gold" />
                <span className="truncate">{weatherCopy.title}</span>
                <span className="shrink-0 text-expedition-brass/70">·</span>
                <span className="shrink-0">{formatExpeditionDate(day)}</span>
                {position && (
                  <span className="ml-auto shrink-0 pl-2 tracking-[0.12em] text-expedition-faded/70">
                    {position.position} / {position.total}
                  </span>
                )}
              </div>
            </div>
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
          <span className="text-[13px] font-semibold text-expedition-parchment">{Math.round(safeValue)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/45 ring-1 ring-expedition-gold/40">
          <div
            className="h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-[width] duration-700 ease-out"
            style={{ width: `${safeValue}%`, background: fill }}
          />
        </div>
      </div>
    </div>
  );
}


function PolishedStatRow({ icon: Icon, label, value, fill }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[1rem_4.5rem_minmax(4.5rem,1fr)_1.5rem] items-center gap-1.5">
      <Icon className="h-4 w-4 text-expedition-gold" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-expedition-parchment/80">{label}</span>
      <span className="h-[5px] overflow-hidden rounded-full border border-expedition-gold/25 bg-black/45">
        <span
          className="block h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-[width] duration-700 ease-out"
          style={{ width: `${safeValue}%`, background: fill }}
        />
      </span>
      <span className="text-right text-[11.5px] font-semibold tabular-nums text-expedition-parchment">{Math.round(safeValue)}</span>
    </div>
  );
}

const CASE_TOOLTIP_RARITY_INK = Object.freeze({
  common: '#526840',
  notable: '#246f7d',
  remarkable: '#76529a',
  singular: '#845d12',
});

const CASE_TALLY_SPARKS = Object.freeze([
  ['-11px', '-10px'],
  ['0px', '-15px'],
  ['11px', '-10px'],
  ['14px', '1px'],
  ['-14px', '2px'],
  ['7px', '12px'],
  ['-7px', '12px'],
]);

function specimenCollectionArea(specimen, journal) {
  if (specimen?.sourceZoneId) {
    const zone = getZone(specimen.sourceZoneId);
    if (zone?.id === specimen.sourceZoneId) return zone.shortName || zone.name;
  }
  if (specimen?.sourceZoneName) return specimen.sourceZoneName;
  for (let index = (journal?.length || 0) - 1; index >= 0; index -= 1) {
    const entry = journal[index];
    if (entry?.specimenId === specimen?.id && entry.method !== 'released' && entry.location) {
      return entry.location;
    }
  }
  return 'Locality not recorded';
}

function SpecimenCaseTally({ inventory, caseCapacity, onOpenCase }) {
  const journal = useThreeGameStore(state => state.journal);
  const openSpecimenDetail = useThreeGameStore(state => state.openSpecimenDetail);
  const lightweightEffects = useThreeGameStore(state => Number(state.foliageDrawScale) <= 0.76);
  const previousCountRef = useRef(inventory.length);
  const [arrival, setArrival] = useState(null);

  useEffect(() => {
    const previousCount = previousCountRef.current;
    previousCountRef.current = inventory.length;
    if (inventory.length <= previousCount) return undefined;
    const nextArrival = { index: inventory.length - 1, key: Date.now() };
    setArrival(nextArrival);
    const timer = window.setTimeout(() => setArrival(current => (
      current?.key === nextArrival.key ? null : current
    )), 1350);
    return () => window.clearTimeout(timer);
  }, [inventory.length]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpenCase}
        aria-label={`Open specimen case, ${inventory.length} of ${caseCapacity} slots filled`}
        className="group mb-1 flex w-full items-center justify-between gap-2 rounded-[3px] text-left transition hover:bg-expedition-gold/8 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
      >
        <span className="flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-expedition-faded transition-colors group-hover:text-expedition-goldbright">
          <ButterflyIcon className="h-3 w-3 text-expedition-gold/85" />
          Specimen case
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-expedition-parchment/90">
          {inventory.length}<span className="text-expedition-brass/70"> / </span>{caseCapacity}
        </span>
      </button>
      <div
        className="flex items-center justify-end gap-[3px]"
        aria-label={`Specimen case: ${inventory.length} of ${caseCapacity} slots filled`}
      >
        {Array.from({ length: caseCapacity }, (_, slotIndex) => {
          const specimen = inventory[slotIndex] || null;
          if (!specimen) {
            return (
              <span key={`empty-${slotIndex}`} aria-hidden="true" className="grid h-[14px] w-[14px] place-items-center">
                <span className="h-[8px] w-[8px] rotate-45 border border-expedition-brass/55 bg-black/10 shadow-[inset_0_0_3px_rgba(0,0,0,0.5)]" />
              </span>
            );
          }
          const rarity = getSpecimenRarity(specimen);
          const locality = specimenCollectionArea(specimen, journal);
          const isNew = arrival?.index === slotIndex;
          const tooltipOnLeft = slotIndex < Math.ceil(caseCapacity / 2);
          const tooltipId = `case-specimen-${slotIndex}`;
          return (
            <button
              key={`${specimen.instanceId || specimen.id}-${slotIndex}`}
              type="button"
              onClick={() => openSpecimenDetail(inventory, slotIndex)}
              aria-label={`${specimen.name}, ${rarity.label.toLowerCase()} specimen, collected at ${locality}`}
              aria-describedby={tooltipId}
              className="group/specimen relative z-10 grid h-[14px] w-[14px] place-items-center rounded-sm focus:outline-none focus-visible:z-50 focus-visible:ring-1 focus-visible:ring-expedition-goldbright/90 hover:z-50"
            >
              <span
                key={isNew ? `new-${arrival.key}` : 'settled'}
                aria-hidden="true"
                className={`h-[8px] w-[8px] rotate-45 border ${isNew ? 'animate-case-tally-fill motion-reduce:animate-none' : ''}`}
                style={{
                  background: rarity.color,
                  borderColor: rarity.ring,
                  boxShadow: `0 0 5px ${rarity.glow}, inset 0 1px 0 rgba(255,255,255,0.32)`,
                  '--case-tally-color': rarity.color,
                  '--case-tally-glow': rarity.glow,
                }}
              />
              {isNew && !lightweightEffects && CASE_TALLY_SPARKS.map(([x, y], sparkIndex) => (
                <span
                  key={`${arrival.key}-${sparkIndex}`}
                  aria-hidden="true"
                  className="case-tally-spark motion-reduce:hidden"
                  style={{
                    '--case-spark-x': x,
                    '--case-spark-y': y,
                    '--case-spark-color': rarity.color,
                    animationDelay: `${sparkIndex * 28}ms`,
                  }}
                />
              ))}
              <span
                id={tooltipId}
                role="tooltip"
                className={`pointer-events-none invisible absolute top-[calc(100%+0.65rem)] z-[100] w-[15.5rem] translate-y-1 rounded-[5px] border border-[#8f7040]/75 bg-[linear-gradient(145deg,#f3e7c9,#dfcda8)] p-2.5 text-left text-[#2d2114] opacity-0 shadow-[0_16px_34px_rgba(4,8,14,0.42),inset_0_1px_0_rgba(255,255,255,0.7)] transition duration-150 group-hover/specimen:visible group-hover/specimen:translate-y-0 group-hover/specimen:opacity-100 group-focus-visible/specimen:visible group-focus-visible/specimen:translate-y-0 group-focus-visible/specimen:opacity-100 ${tooltipOnLeft ? 'left-[-0.35rem]' : 'right-[-0.35rem]'}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute -top-[5px] h-[9px] w-[9px] rotate-45 border-l border-t border-[#8f7040]/75 bg-[#f1e4c5] ${tooltipOnLeft ? 'left-[0.45rem]' : 'right-[0.45rem]'}`}
                />
                <span className="flex items-center gap-2.5">
                  <SpecimenPortrait specimen={specimen} rarity={rarity} size="h-12 w-12" glow={7} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-expedition text-[13px] font-bold leading-tight tracking-[0.02em] text-[#241a10]">
                      {specimen.name}
                    </span>
                    {specimen.latin && (
                      <span className="mt-0.5 block truncate font-expedition text-[10.5px] italic text-[#675238]">
                        {specimen.latin}
                      </span>
                    )}
                    <span
                      className="mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-sans text-[8px] font-bold uppercase tracking-[0.13em]"
                      style={{
                        color: CASE_TOOLTIP_RARITY_INK[rarity.id] || '#604b2e',
                        borderColor: rarity.ring,
                        background: `${rarity.color}1f`,
                      }}
                    >
                      <span className="h-1 w-1 rotate-45" style={{ background: rarity.color }} />
                      {rarity.label}
                    </span>
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-1.5 border-t border-[#8f7040]/30 pt-1.5 font-sans text-[9px] leading-tight text-[#57442d]">
                  <MapIcon className="h-3 w-3 shrink-0 text-[#806331]" />
                  <span className="font-bold uppercase tracking-[0.12em] text-[#74592d]">Locality</span>
                  <span className="text-[#9b7d4d]">·</span>
                  <span className="min-w-0 truncate font-semibold">{locality}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PolishedVitalStatusPanel({ onOpenCase }) {
  const health = useThreeGameStore(state => state.health);
  const fatigue = useThreeGameStore(state => state.fatigue);
  const provisions = useThreeGameStore(state => state.supplies?.provisions || 0);
  const inventory = useThreeGameStore(state => state.inventory);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const animalModeNpcEncounter = useThreeGameStore(state => state.animalModeNpcEncounter);
  const openStatusView = useThreeGameStore(state => state.openStatusView);
  const playableMode = getPlayableMode(playableModeId);
  const animalMode = playableMode.kind === 'animal';
  const energy = Math.max(0, Math.min(100, 100 - fatigue));
  const awareness = animalMode
    ? animalAwarenessValue(playableMode.id, animalRisk(animalModeNpcEncounter, playableMode.id))
    : 0;
  const displayName = animalMode ? playableMode.label : 'Charles Darwin';
  // Only worth a word when it is not the default: "Steady" is the state the
  // three bars underneath already describe. The two fatigue words are the
  // player's only notice of thresholds the controller already enforces, so
  // they read off PLAYER rather than round numbers of their own.
  const condition = health < 35
    ? { label: 'Injured', tone: 'text-rose-300', note: 'Injured. Rest or return to the ship.' }
    : fatigue >= PLAYER.exhaustedRunFatigue
      ? { label: 'Exhausted', tone: 'text-rose-300', note: 'Too tired to run. A two-hour halt will clear it.' }
      : fatigue >= PLAYER.tiredRunFatigue
        ? { label: 'Winded', tone: 'text-amber-200', note: 'Tiring. Running is slower than it was.' }
        : null;
  const statusProps = {
    onClick: openStatusView,
    title: `View ${displayName}'s status`,
    'aria-label': `View ${displayName}'s status`,
  };

  return (
    <div className="pointer-events-auto">
      <ExpeditionPanel className="w-[18rem]" innerClassName="px-3.5 pb-3 pt-2.5">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-expedition-brass/30 pb-2">
          <button
            type="button"
            {...statusProps}
            className="min-w-0 flex-1 truncate text-left font-expedition text-[14px] font-semibold tracking-wide text-expedition-parchment transition hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
          >
            {displayName}
          </button>
          {condition && (
            <span
              title={condition.note}
              className={`shrink-0 text-[9px] font-semibold uppercase tracking-[0.15em] ${condition.tone}`}
            >
              {condition.label}
            </span>
          )}
          <CameraModeButton />
        </div>
        <div className="grid gap-2">
          <button type="button" {...statusProps} className="block w-full text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70">
            <span className="grid gap-2">
            <PolishedStatRow icon={HeartIcon} label={animalMode ? 'Vitality' : 'Health'} value={health} fill={vitalsGradient('health')} />
            <PolishedStatRow icon={FatigueIcon} label={animalMode ? 'Energy' : 'Fatigue'} value={animalMode ? energy : fatigue} fill={vitalsGradient('fatigue')} />
            {animalMode && (
              <PolishedStatRow icon={CuriosityIcon} label={playableMode.id === 'tortoise' ? 'Composure' : 'Alertness'} value={awareness} fill={vitalsGradient('curiosity')} />
            )}
            </span>
          </button>
          {!animalMode && (
            <div className="grid grid-cols-[5.2rem_minmax(0,1fr)] items-end gap-2 border-t border-expedition-brass/25 pt-2">
              <button
                type="button"
                {...statusProps}
                className="rounded-[3px] pb-px text-left transition hover:bg-expedition-gold/8 hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
              >
                <span className="block text-[8.5px] font-semibold uppercase tracking-[0.16em] text-expedition-faded">Provisions</span>
                <span className="mt-0.5 block font-expedition text-[14px] font-semibold leading-none text-expedition-goldbright">×{provisions}</span>
              </button>
              <SpecimenCaseTally inventory={inventory} caseCapacity={caseCapacity} onOpenCase={onOpenCase} />
            </div>
          )}
        </div>
      </ExpeditionPanel>
    </div>
  );
}

// Camera mode lives here rather than in the field record, where its label was
// the widest thing in a three-button row.
function CameraModeButton() {
  const viewMode = useThreeGameStore(state => state.viewMode);
  const cycleViewMode = useThreeGameStore(state => state.cycleViewMode);
  return (
    <button
      type="button"
      onClick={cycleViewMode}
      title={`Camera: ${CAMERA_MODE_LABELS[viewMode] || viewMode} — click to cycle`}
      aria-label={`Camera: ${CAMERA_MODE_LABELS[viewMode] || viewMode}. Click to cycle.`}
      className="flex shrink-0 items-center gap-1 rounded-sm border border-expedition-brass/45 bg-black/14 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-expedition-faded transition hover:border-expedition-gold/70 hover:bg-expedition-gold/8 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60"
    >
      <CompassRoseIcon className="h-3 w-3 text-expedition-gold/85" />
      {CAMERA_MODE_SHORT_LABELS[viewMode] || viewMode}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Minimap

function IslandOverview({ zoneId, zoneName, polished = false }) {
  const location = getIslandMapLocation(zoneId);
  const visitedZoneIds = useThreeGameStore(state => state.visitedZoneIds);
  const nextLocation = useMemo(() => {
    if (!polished || !location) return null;
    const visited = new Set(visitedZoneIds || []);
    return islandMapLocations
      .filter(candidate => !candidate.isTest && candidate.id !== zoneId && !visited.has(candidate.id))
      .sort((a, b) => (
        Math.hypot(a.at.x - location.at.x, a.at.y - location.at.y)
        - Math.hypot(b.at.x - location.at.x, b.at.y - location.at.y)
      ))[0] || null;
  }, [location, polished, visitedZoneIds, zoneId]);

  if (polished) {
    const start = location ? { x: location.at.x * 100, y: location.at.y * 100 } : null;
    const end = nextLocation ? { x: nextLocation.at.x * 100, y: nextLocation.at.y * 100 } : null;
    const bendX = start && end ? (start.x + end.x) / 2 - 5 : 0;
    const bendY = start && end ? Math.max(start.y, end.y) + 8 : 0;
    return (
      <div className="relative h-full w-full bg-[#17252b]">
        {/* Location markers are percentages of the chart image, so the image
            must not be cropped to the panel — a covered image slides its own
            coastline out from under them. */}
        <ChartField
          src={ISLAND_MAP_IMAGE}
          width={ISLAND_MAP_ASPECT * 1000}
          depth={1000}
          alt="Floreana island chart"
          imageClassName="saturate-[0.78] brightness-[0.78] contrast-[1.06]"
        >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_48%,rgba(5,12,17,0.58)_100%)]" />
        {start && end && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <path
              d={`M ${start.x} ${start.y} Q ${bendX} ${bendY} ${end.x} ${end.y}`}
              fill="none"
              stroke="rgba(227,197,133,0.58)"
              strokeWidth="0.65"
              strokeDasharray="3.2 3.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {nextLocation && (
          <span
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-100/45 bg-rose-300/90 shadow-[0_0_12px_rgba(253,164,175,0.36)]"
            style={{ left: percentStyle(end.x), top: percentStyle(end.y) }}
            title={`Unvisited: ${nextLocation.name}`}
          />
        )}
        {location && (
          <span
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-expedition-goldbright/80 bg-expedition-gold/10 shadow-[0_0_0_4px_rgba(227,197,133,0.10),0_0_12px_rgba(227,197,133,0.28)]"
            style={{ left: percentStyle(start.x), top: percentStyle(start.y) }}
            title={location.name}
          >
            <span className="h-2.5 w-2.5 rotate-45 border border-expedition-goldbright bg-expedition-ink" />
          </span>
        )}
        </ChartField>
        <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-sm border border-expedition-brass/35 bg-expedition-ink/72 px-2 py-1 font-expedition text-[8.5px] uppercase tracking-[0.1em] text-expedition-parchment shadow-sm backdrop-blur-sm">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-expedition-goldbright" />You</span>
          {nextLocation && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-300" />New</span>}
        </div>
        <span className="absolute right-2 top-2 font-expedition text-[10px] font-semibold text-expedition-parchment/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">↑ N</span>
      </div>
    );
  }

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
// Hover label for map furniture, in place of the OS tooltip. The chart box
// clips its own overflow, so a tip near an edge flips to the inside rather than
// being cut in half. Anchors must carry `group`.
function MapTip({ label, below = false, align = 'center' }) {
  const side = below ? 'top-full mt-1.5' : 'bottom-full mb-1.5';
  const anchor = align === 'start'
    ? 'left-0'
    : align === 'end'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 ${side} ${anchor} whitespace-nowrap rounded-sm border border-expedition-brass/55 bg-expedition-ink/80 px-1.5 py-0.5 font-expedition text-[9px] font-semibold uppercase tracking-[0.07em] text-expedition-parchment opacity-0 shadow-[0_2px_10px_rgba(0,0,0,0.55)] backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100`}
    >
      {label}
    </span>
  );
}

// Where a tip has to sit so it stays inside the chart, given the anchor's
// position on the map in percent.
function mapTipPlacement(point) {
  return {
    below: point.y < 26,
    align: point.x < 22 ? 'start' : point.x > 78 ? 'end' : 'center',
  };
}

const SpecimenMarker = memo(function SpecimenMarker({
  specimen, zone, surveyStyle, showKnown, showNew, active, nearestUnrecorded, onToggle,
}) {
  const actorId = specimen.instanceId || specimen.id;
  const runtime = useThreeGameStore(state => state.specimenRuntimePositions?.[zone.id]?.[actorId]);
  const isActorCollected = useThreeGameStore(state => state.collectedSpecimenActorIds?.includes(actorId) || false);
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
  if (isActorCollected) return null;
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
      aria-label={`${specimen.name}: ${status}${nearestUnrecorded ? ', nearest unrecorded specimen' : ''}`}
      // Recorded vs unrecorded was distinguished by hue alone (green vs rose),
      // which is the single most common colorblind failure. Shape now carries
      // the same information: recorded specimens are square, unrecorded ones
      // round. Colour is kept as a redundant second channel.
      className={`group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border shadow transition hover:scale-125 ${
        nearestUnrecorded ? 'z-10 h-3 w-3' : 'h-2.5 w-2.5'
      } ${
        isKnown ? 'rounded-[1px]' : 'rounded-full'
      } ${
        isSelected
          ? 'border-expedition-ink bg-expedition-goldbright ring-2 ring-expedition-goldbright/60'
          : isCollected || isDocumented
            ? surveyStyle
              ? 'border-[#49584b] bg-[#7f8b78]/80 ring-1 ring-[#e6d69c]/45'
              : 'border-[#33423d] bg-[#7e9188]/75'
            : surveyStyle
              ? `border-[#5c2e2e] bg-[#e5a5a6]/92 ring-1 ${nearestUnrecorded ? 'ring-[#fff0bc] shadow-[0_0_10px_rgba(248,180,181,0.92)]' : 'ring-[#f3dcac]/70'}`
              : `border-expedition-ink/80 bg-rose-300/95 ${nearestUnrecorded ? 'ring-2 ring-rose-100/80 shadow-[0_0_11px_rgba(253,164,175,0.9)]' : ''}`
      }`}
      style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
    >
      {nearestUnrecorded && !isSelected && (
        <span className="pointer-events-none absolute -inset-1 rounded-full border border-rose-100/75 animate-ping motion-reduce:animate-none" />
      )}
      {isKnown && !isSelected && (
        <span aria-hidden="true" className="pointer-events-none text-[7px] font-black leading-none text-[#edf2dc] [text-shadow:0_1px_1px_rgba(0,0,0,0.7)]">✓</span>
      )}
      {/* Name on hover; the click card below carries the rest. */}
      {!active && <MapTip label={specimen.name} {...mapTipPlacement(point)} />}
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

  useEffect(() => {
    const now = Date.now();
    const nextPoint = worldToMapPercent({ x: playerPose.x, z: playerPose.z }, zone, 3);
    setTrail(previous => {
      const recent = previous.filter(point => point.zoneId === zone.id && now - point.t < MINIMAP_TRAIL_MS);
      const last = recent[recent.length - 1];
      if (last && Math.hypot(last.x - nextPoint.x, last.y - nextPoint.y) < MINIMAP_TRAIL_MIN_STEP && now - last.t < 1000) {
        return recent;
      }
      return [...recent, { ...nextPoint, zoneId: zone.id, t: now }].slice(-MINIMAP_TRAIL_MAX_POINTS);
    });
  }, [playerPose.x, playerPose.z, zone]);

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
      {/* View cone: apex on Darwin, spreading away along his heading, brightest
          at the eye. It was built the other way round — widest at the player and
          tapering into the distance, with the gradient inverted to match. */}
      <span
        className="pointer-events-none absolute h-14 w-14 opacity-50"
        style={{
          left: percentStyle(player.x),
          top: percentStyle(player.y),
          transform: `translate(-50%, -100%) rotate(${heading}deg)`,
          transformOrigin: '50% 100%',
          clipPath: 'polygon(50% 100%, 96% 0%, 4% 0%)',
          background: surveyStyle
            ? 'linear-gradient(0deg, rgba(65,112,116,0.46), rgba(65,112,116,0))'
            : 'linear-gradient(0deg, rgba(227,197,133,0.5), rgba(227,197,133,0))',
        }}
      />
      <span
        className={`absolute flex h-[22px] w-[22px] items-center justify-center rounded-full border ${
          surveyStyle
            ? 'border-[#f1dca3]/95 bg-[#2f6568]/85 shadow-[0_2px_7px_rgba(20,38,40,0.55),inset_0_1px_0_rgba(255,255,255,0.22)]'
            : 'border-expedition-goldbright bg-expedition-ink/82 shadow-[0_2px_7px_rgba(4,9,16,0.6),inset_0_1px_0_rgba(255,236,186,0.18)]'
        }`}
        style={{
          left: percentStyle(player.x),
          top: percentStyle(player.y),
          transform: `translate(-50%, -50%) rotate(${heading}deg)`,
        }}
        title="Darwin"
      >
        {/* A surveyor's needle rather than a plain triangle: bright blade
            forward, dark counterweight behind, so heading reads at a glance. */}
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden="true">
          <path
            d="M12 1.8 L15.9 14.4 L12 12.2 L8.1 14.4 Z"
            fill={surveyStyle ? '#fdf3d2' : '#ffe6ae'}
            stroke={surveyStyle ? 'rgba(30,54,56,0.5)' : 'rgba(5,10,18,0.5)'}
            strokeWidth="0.45"
            strokeLinejoin="round"
          />
          <path
            d="M12 12.2 L15.9 14.4 L12 18.4 L8.1 14.4 Z"
            fill={surveyStyle ? 'rgba(96,132,120,0.9)' : 'rgba(150,116,64,0.92)'}
            strokeWidth="0"
          />
        </svg>
      </span>
    </>
  );
}

function BeagleMinimapMarker({ zone, surveyStyle }) {
  const sightline = getBeagleSightline(zone.id);
  if (!sightline) return null;
  const [x, , z] = sightline.minimapPosition || sightline.position;
  const point = worldToMapPercent({ x, z }, zone, 7);
  return (
    <span
      role="img"
      aria-label={sightline.label}
      title={sightline.label}
      className={`pointer-events-none absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg ${
        surveyStyle
          ? 'border-[#6f4f24]/80 bg-[#d7b86d]/90 text-[#30200f] shadow-[0_1px_6px_rgba(63,42,18,0.42),inset_0_1px_0_rgba(255,240,178,0.58)]'
          : 'border-expedition-goldbright/90 bg-expedition-ink/82 text-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.42)]'
      }`}
      style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.2 V15.2" />
        <path d="M12 5.2 L6.6 13.2 H12" />
        <path d="M13 7.2 L17.7 13.2 H13" />
        <path d="M3.8 15.2 H20.2 L17.7 19.3 H7.2 Z" />
        <path d="M5.8 17.2 H18.5" />
      </svg>
    </span>
  );
}

// Syms' live position, when he is working in this region. His pose lives in the
// npc runtime rather than the store, so it is polled on the same cadence as the
// player arrow instead of driving a re-render per step.
function SymsMinimapMarker({ zone }) {
  const symsZoneId = useThreeGameStore(state => state.symsZoneId);
  const [point, setPoint] = useState(null);

  useEffect(() => {
    if (symsZoneId !== zone.id) {
      setPoint(null);
      return undefined;
    }
    const read = () => {
      const pose = getNpcPoses(zone.id)?.get('syms');
      setPoint(current => {
        if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return null;
        const next = worldToMapPercent({ x: pose.x, z: pose.z }, zone, 3);
        if (current && Math.abs(current.x - next.x) < 0.4 && Math.abs(current.y - next.y) < 0.4) return current;
        return next;
      });
    };
    read();
    const timer = window.setInterval(read, MINIMAP_RUNTIME_POLL_MS);
    return () => window.clearInterval(timer);
  }, [symsZoneId, zone]);

  if (!point) return null;
  return (
    <span
      role="img"
      aria-label="Syms Covington"
      title="Syms Covington"
      className="pointer-events-none absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-ink/85 bg-sky-200 shadow-[0_0_7px_rgba(186,230,253,0.75)]"
      style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
    />
  );
}

function MapOverlays({ zone, showKnown = true, showNew = true, surveyStyle = false }) {
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const specimens = getThreeSpecimens(zone.id);
  const playerPose = useLiveMinimapPose();
  const collectedSpecimenIds = useThreeGameStore(state => state.collectedSpecimenIds);
  const documentedSpecimenIds = useThreeGameStore(state => state.documentedSpecimenIds);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const nearestUnrecordedActorId = useMemo(() => {
    const recordedTypes = new Set([...(collectedSpecimenIds || []), ...(documentedSpecimenIds || [])]);
    const collectedActors = new Set(collectedSpecimenActorIds || []);
    const runtimePositions = useThreeGameStore.getState().specimenRuntimePositions?.[zone.id] || {};
    let nearest = null;
    let nearestDistance = Infinity;
    for (const specimen of specimens) {
      const actorId = specimen.instanceId || specimen.id;
      if (recordedTypes.has(specimen.id) || collectedActors.has(actorId)) continue;
      const [spawnX, , spawnZ] = specimen.spawnPoint || [0, 0, 0];
      const runtime = runtimePositions[actorId];
      const specimenX = Number.isFinite(runtime?.x) ? runtime.x : spawnX;
      const specimenZ = Number.isFinite(runtime?.z) ? runtime.z : spawnZ;
      const distance = Math.hypot(specimenX - playerPose.x, specimenZ - playerPose.z);
      if (distance < nearestDistance) {
        nearest = actorId;
        nearestDistance = distance;
      }
    }
    return nearest;
  }, [collectedSpecimenActorIds, collectedSpecimenIds, documentedSpecimenIds, playerPose.x, playerPose.z, specimens, zone.id]);
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
            className={`group absolute flex h-5 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-1 font-expedition text-[9px] font-bold leading-none shadow transition hover:scale-105 ${
              surveyStyle
                ? 'border-[#6f4f24]/65 bg-[#d7b86d]/82 text-[#3b2812] shadow-[0_1px_5px_rgba(63,42,18,0.32),inset_0_1px_0_rgba(255,240,178,0.48)]'
                : 'border-expedition-goldbright bg-expedition-gold/90 text-expedition-ink shadow-[0_0_10px_rgba(227,197,133,0.5)] hover:bg-expedition-goldbright'
            }`}
            style={{ left: percentStyle(point.x), top: percentStyle(point.y) }}
            aria-label={`Travel ${edgeLabel}: ${route.label}`}
          >
            {edgeLabel}
            <MapTip label={route.label} {...mapTipPlacement(point)} />
          </button>
        );
      })}
      <BeagleMinimapMarker zone={zone} surveyStyle={surveyStyle} />
      <SymsMinimapMarker zone={zone} />
      <MinimapTrail zone={zone} playerPose={playerPose} />
      {specimens.map((specimen, index) => {
        const actorId = specimen.instanceId || specimen.id;
        return (
          <SpecimenMarker
            key={`${specimen.id}-${index}`}
            specimen={specimen}
            zone={zone}
            surveyStyle={surveyStyle}
            showKnown={showKnown}
            showNew={showNew}
            active={activeMarkerId === actorId}
            nearestUnrecorded={nearestUnrecordedActorId === actorId}
            onToggle={handleToggleMarker}
          />
        );
      })}
      <MinimapPlayerArrow zone={zone} surveyStyle={surveyStyle} playerPose={playerPose} />
    </>
  );
}

const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Letterboxes a map inside whatever box the panel gives it, with the markers
// riding along so their percentages stay in map space. The image sizes the
// field: `aspect-ratio` on a flex item does not reliably transfer to a width,
// but a replaced element's own ratio always does.
function ChartField({ src, width, depth, alt, imageClassName = '', fill = false, children }) {
  // `fill` accepts a small deliberate squash rather than spend vertical space
  // on a mat — only sound while the box stays close to the map's own shape.
  if (fill) {
    return (
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || BLANK_PIXEL}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 h-full w-full ${imageClassName}`}
        />
        {children}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || BLANK_PIXEL}
          width={width}
          height={depth}
          alt={alt}
          draggable={false}
          className={`block h-full w-auto ${imageClassName}`}
        />
        {children}
      </div>
    </div>
  );
}

function LocalMapDecoration({ surveyStyle, zoneName }) {
  return (
    <>
      {/* Survey charts are drawn inside a ruled border; the terrain view is not,
          and an inset hairline there just doubles the panel's own frame. */}
      {surveyStyle ? (
        <div className="pointer-events-none absolute inset-[6px] rounded-[2px] border border-[#6c4a24]/35 shadow-[inset_0_0_0_1px_rgba(247,224,166,0.2),inset_0_0_22px_rgba(80,49,22,0.14)]" />
      ) : (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_18px_rgba(4,9,13,0.24)]" />
      )}
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

function MinimapBody({
  onOpenMap,
  tabsClassName = 'hidden sm:flex',
  mapHeight = null,
  views = ['local', 'island', 'globe'],
  initialView = 'local',
  showLocationHeader = true,
  showMapStyleToggle = true,
  quietTabs = false,
  polishedIsland = false,
}) {
  const [view, setView] = useState(initialView);
  const [mapStyle, setMapStyle] = useState('terrain');
  const [showKnown, setShowKnown] = useState(true);
  const [showNew, setShowNew] = useState(true);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const transitionActive = useThreeGameStore(state => Boolean(state.transition));
  const interiorExitBlocked = useThreeGameStore(state => Boolean(
    state.activeConstraint?.movementLock
    || state.activeConstraint?.type === 'snare_immobilized'
  ));
  const zone = getZone(currentZoneId);
  const interior = getInteriorDefinition(currentZoneId);
  const interiorExit = interior ? getInteriorTransitions(currentZoneId)[0] || null : null;
  const chartUrl = useTerrainChart(zone, mapStyle);
  const chartWidth = zone.terrainWidth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : 100);
  const chartDepth = zone.terrainDepth || zone.terrainSize || chartWidth;
  const toggleKnown = () => setShowKnown(value => (value && !showNew ? value : !value));
  const toggleNew = () => setShowNew(value => (value && !showKnown ? value : !value));
  const surveyStyle = mapStyle === 'survey';

  if (interior) {
    const quickExitLabel = interior.kind === 'ship-interior'
      ? 'Go up to the weather deck'
      : 'Leave the house';
    const quickExitDisabled = transitionActive || interiorExitBlocked;
    const beginInteriorExit = () => {
      if (!interiorExit || quickExitDisabled) return;
      beginZoneTransition(interiorExit.toRegionId, {
        entryEdge: interiorExit.entryEdge || null,
        note: interiorExit.description,
        source: 'interior-chart',
        mode: 'threshold',
        localTransition: true,
        minutes: 0,
        fatigue: 0,
      });
    };
    return (
      <>
        <PanelTabs
          className={tabsClassName}
          tabs={views.map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
          active={view}
          onSelect={setView}
          quiet={quietTabs}
        />
        {showLocationHeader && (
          <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1.5">
            <div className="min-w-0 truncate font-expedition text-[13px] font-medium tracking-wide text-expedition-parchment">{interior.label}</div>
            <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-expedition-gold/75">
              {view === 'local'
                ? interior.blueprint?.map?.planLabel || 'Interior plan'
                : view === 'globe' ? 'Galápagos' : 'Island chart'}
            </span>
          </div>
        )}
        {view === 'local' ? (
          <div
            className={`relative overflow-hidden rounded-sm border border-expedition-gold/65 bg-[#d8c89e] shadow-[inset_0_0_18px_rgba(0,0,0,0.4)] ${mapHeight ? '' : 'aspect-square'}`}
            style={mapHeight ? { height: `${mapHeight}px` } : undefined}
          >
            <InteriorFloorPlan definition={interior} />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenMap}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') onOpenMap();
            }}
            title="Open full island map"
            aria-label="Open full island map"
            className={`relative cursor-pointer overflow-hidden rounded-sm border border-expedition-gold/65 bg-[rgba(9,16,30,0.72)] shadow-[inset_0_0_18px_rgba(0,0,0,0.55)] transition hover:border-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${mapHeight ? '' : 'aspect-square'}`}
            style={mapHeight ? { height: `${mapHeight}px` } : undefined}
          >
            {view === 'globe' ? (
              <GalapagosGlobe />
            ) : (
              <IslandOverview
                zoneId={currentZoneId}
                zoneName={interior.label}
                polished={polishedIsland}
              />
            )}
          </div>
        )}
        {interiorExit && (
          <button
            type="button"
            data-testid="interior-quick-exit"
            onClick={beginInteriorExit}
            disabled={quickExitDisabled}
            title={interiorExitBlocked ? 'Resolve the current situation before leaving' : interiorExit.description}
            className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-sm border border-expedition-gold/65 bg-expedition-gold/12 px-2.5 py-2 text-left font-expedition text-expedition-parchment shadow-[inset_0_1px_0_rgba(227,197,133,0.12)] transition hover:border-expedition-goldbright hover:bg-expedition-gold/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="min-w-0">
              <span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-expedition-gold/80">Quick exit</span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold">{transitionActive ? 'Leaving…' : quickExitLabel}</span>
            </span>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-expedition-goldbright" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 3.5h7v13h-7z" />
              <path d="M8.5 10h8M13.5 7l3 3-3 3" />
            </svg>
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <PanelTabs
        className={tabsClassName}
        tabs={views.map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
        active={view}
        onSelect={setView}
        quiet={quietTabs}
      />
      {(showLocationHeader || showMapStyleToggle) && (
        <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1.5">
          {showLocationHeader && (
            <div className="min-w-0 truncate font-expedition text-[13px] font-medium tracking-wide text-expedition-parchment">
              {zone.shortName || zone.name}
            </div>
          )}
          {showMapStyleToggle && <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            setMapStyle(style => (style === 'survey' ? 'terrain' : 'survey'));
          }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${
            surveyStyle
              ? 'border-expedition-goldbright bg-expedition-gold/25 text-expedition-goldbright shadow-[0_0_10px_rgba(227,197,133,0.24)]'
              : 'border-expedition-gold/55 bg-black/15 text-expedition-gold/80 hover:border-expedition-gold hover:bg-expedition-gold/15'
          }`}
          title={surveyStyle ? 'Show terrain minimap' : 'Show survey chart minimap'}
          aria-label={surveyStyle ? 'Show terrain minimap' : 'Show survey chart minimap'}
          aria-pressed={surveyStyle}
        >
          <CompassRoseIcon className="h-4 w-4" />
          </button>}
        </div>
      )}
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
        className={`relative cursor-pointer overflow-hidden rounded-sm border border-expedition-gold/65 bg-[rgba(9,16,30,0.72)] shadow-[inset_0_0_18px_rgba(0,0,0,0.55)] transition hover:border-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${mapHeight ? '' : 'aspect-[100/85]'}`}
        style={mapHeight ? { height: `${mapHeight}px` } : undefined}
      >
        {view === 'globe' ? (
          <GalapagosGlobe />
        ) : view === 'island' ? (
          <IslandOverview zoneId={currentZoneId} zoneName={zone.shortName || zone.name} polished={polishedIsland} />
        ) : (
          <>
            {/* The bake covers the zone footprint, so the chart and every
                percent-positioned marker have to share a box of that shape —
                stretching either one to a wider panel puts the markers off the
                coast they belong to. */}
            <ChartField
              src={chartUrl}
              width={chartWidth}
              depth={chartDepth}
              alt={`Chart of ${zone.shortName || zone.name}`}
              imageClassName={chartUrl ? '' : surveyStyle ? 'bg-[#cdbb8b]' : 'bg-[#27505d]'}
              fill
            >
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
            </ChartField>
            <MarkerLegend
              showKnown={showKnown}
              showNew={showNew}
              onToggleKnown={toggleKnown}
              onToggleNew={toggleNew}
            />
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

// Swatches only, no words: the shapes and colours are the same ones on the map,
// and at this size a labelled legend reaches the southern route badge.
function MarkerLegend({ showKnown, showNew, onToggleKnown, onToggleNew }) {
  const chip = 'group relative flex h-4 w-4 items-center justify-center transition';
  return (
    <div className="absolute bottom-1 left-1 z-10 flex rounded-sm border border-expedition-brass/50 bg-expedition-ink/70 shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-sm">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onToggleKnown();
        }}
        className={`${chip} rounded-l-sm border-r border-expedition-brass/35 ${showKnown ? 'bg-emerald-300/20' : ''}`}
        aria-label={`Toggle recorded specimen markers, currently ${showKnown ? 'shown' : 'hidden'}`}
        aria-pressed={showKnown}
      >
        <span className={`h-1.5 w-1.5 rounded-[1px] ${showKnown ? 'bg-emerald-300 shadow-[0_0_4px_rgba(110,231,183,0.7)]' : 'bg-expedition-faded/50'}`} />
        <MapTip label={showKnown ? 'Recorded specimen' : 'Recorded specimen — hidden'} align="start" />
      </button>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onToggleNew();
        }}
        className={`${chip} rounded-r-sm ${showNew ? 'bg-rose-300/20' : ''}`}
        aria-label={`Toggle unrecorded specimen markers, currently ${showNew ? 'shown' : 'hidden'}`}
        aria-pressed={showNew}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${showNew ? 'bg-rose-300 shadow-[0_0_4px_rgba(253,164,175,0.7)]' : 'bg-expedition-faded/50'}`} />
        <MapTip label={showNew ? 'Unrecorded specimen' : 'Unrecorded specimen — hidden'} align="start" />
      </button>
    </div>
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

function ToolBelt({ onOpenJournal, compact = false }) {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const toolbarOrder = useThreeGameStore(state => state.toolbarOrder);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const animalMode = getPlayableMode(playableModeId).kind === 'animal';
  return (
    <ExpeditionPanel
      variant={compact ? 'quiet' : 'hud'}
      className="max-w-[min(35rem,calc(100vw-1.5rem))]"
      innerClassName={`flex flex-wrap justify-center ${
        animalMode
          ? compact ? 'gap-2 p-2.5' : 'gap-3 p-3'
          : compact ? 'gap-1 p-1.5' : 'gap-2 p-2'
      }`}
    >
      {toolbarOrder.map((toolId, index) => {
        const tool = getToolbarItem(toolId);
        if (!tool) return null;
        const Icon = TOOL_ICONS[tool.id];
        const animalAction = getAnimalAction(tool.id);
        const active = activeToolId === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              if (tool.id === 'compass') {
                setActiveTool(tool.id);
                triggerToolUse(tool.id);
                return;
              }
              if (tool.id === 'sketch') {
                onOpenJournal();
                return;
              }
              if (active) {
                triggerToolUse(tool.id);
              } else {
                setActiveTool(tool.id);
                if (animalAction) triggerToolUse(tool.id);
              }
            }}
            className={`group relative flex items-center justify-center rounded-sm border transition focus:outline-none focus:ring-1 focus:ring-expedition-gold/60 ${
              animalMode
                ? compact ? 'h-16 w-16' : 'h-20 w-20'
                : compact ? 'h-12 w-12' : 'h-14 w-14'
            } ${active
              ? compact
                ? 'border-expedition-gold/75 bg-expedition-gold/15 text-expedition-goldbright shadow-[inset_0_0_0_1px_rgba(227,197,133,0.12)]'
                : 'border-expedition-goldbright bg-expedition-gold/30 text-expedition-goldbright shadow-[0_0_18px_rgba(227,197,133,0.45),inset_0_0_0_1px_rgba(227,197,133,0.45)]'
              : compact
                ? 'border-expedition-brass/35 bg-[rgba(8,14,27,0.28)] text-expedition-parchment/65 hover:border-expedition-gold/60 hover:bg-expedition-gold/8 hover:text-expedition-parchment'
                : 'border-expedition-gold/55 bg-[rgba(8,14,27,0.5)] text-expedition-parchment/85 hover:border-expedition-gold hover:bg-expedition-gold/15'
            }`}
            title={`${index + 1}: ${tool.name}`}
          >
            {animalAction ? (
              <AnimalActionIcon
                actionId={tool.id}
                playableModeId={playableModeId}
                className={compact ? 'h-14 w-14' : 'h-[4.5rem] w-[4.5rem]'}
              />
            ) : tool.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tool.image} alt={tool.name} className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)] transition ${compact && !active ? 'opacity-65 saturate-[0.68]' : ''}`} draggable={false} />
            ) : Icon ? <Icon className={compact ? 'h-6 w-6' : 'h-7 w-7'} /> : <span className="text-base">{tool.icon}</span>}
            <span className={`pointer-events-none absolute left-1 top-0.5 font-expedition font-semibold text-expedition-goldbright/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
              {index + 1}
            </span>
            {compact && active && <span className="pointer-events-none absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-expedition-goldbright shadow-[0_0_5px_rgba(227,197,133,0.5)]" />}
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 max-w-[9rem] -translate-x-1/2 whitespace-nowrap rounded-sm border border-expedition-gold/60 bg-[rgba(12,20,38,0.92)] px-2 py-1 font-expedition text-[11px] text-expedition-parchment opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
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

function SpeakerLine({ speaker, icon, portrait, time, italic = false, polished = false, children }) {
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
        <div className={`font-expedition text-expedition-parchment ${polished ? 'text-[17px] leading-[1.5]' : 'text-[15.5px] leading-relaxed'} ${italic ? 'italic text-expedition-parchment/90' : ''}`}>{children}</div>
      </div>
    </div>
  );
}

// Drag-resize bounds for the dialogue log: never below ~4 lines, never
// taller than the viewport minus room for the input row and top HUD.
const LOG_MIN_HEIGHT = 104;
const LOG_DEFAULT_HEIGHT = 232;

function HotkeysResponse({ polished = false }) {
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const sections = useMemo(
    () => controlsSections({ polished, playableModeId }),
    [playableModeId, polished],
  );

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

// Splits "Shift: run" into a key chip and its description so the overlay reads
// as a reference card rather than a wall of prose.
function ControlLine({ line }) {
  const separator = line.indexOf(': ');
  if (separator < 0) return <div className="text-[13px] leading-snug text-expedition-parchment/90">{line}</div>;
  return (
    <div className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
      <span className="font-expedition text-[12px] font-semibold tracking-[0.04em] text-expedition-goldbright">
        {line.slice(0, separator)}
      </span>
      <span className="text-[13px] leading-snug text-expedition-parchment/88">{line.slice(separator + 2)}</span>
    </div>
  );
}

function ControlsOverlay({ open, onClose, polished = true, playableModeId = 'darwin' }) {
  const panelRef = useDismissableOverlay(open, onClose);
  const sections = useMemo(
    () => controlsSections({ polished, includeNarratorCommands: true, playableModeId }),
    [playableModeId, polished],
  );
  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-expedition-ink/80 p-3 backdrop-blur-[3px] sm:p-6"
      onClick={onClose}
    >
      <ExpeditionPanel variant="modal" className="max-h-full w-[min(52rem,100%)] overflow-y-auto" innerClassName="p-4 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Controls"
          tabIndex={-1}
          className="focus:outline-none"
          onClick={event => event.stopPropagation()}
        >
          <div className="relative text-center">
            <h2 className="font-expedition text-[22px] font-semibold uppercase tracking-[0.18em] text-expedition-parchment">
              Controls
            </h2>
            <p className="mt-1 font-expedition text-[12px] italic text-expedition-faded">
              Press <span className="not-italic text-expedition-gold">?</span> at any time to bring this back.
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close controls"
              className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-sm border border-expedition-brass/60 font-expedition text-sm text-expedition-faded transition hover:border-expedition-gold hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
            >
              ✕
            </button>
          </div>

          <GoldDivider className="my-4" />

          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {sections.map(([title, lines]) => (
              <section key={title} className="min-w-0">
                <h3 className={`${GOLD_LABEL} mb-1.5`}>{title}</h3>
                <div className="grid gap-1">
                  {lines.map(line => <ControlLine key={line} line={line} />)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

function NarratorLoadingDots() {
  return (
    <div className="flex h-7 items-center gap-1.5" aria-label="Narrator is composing">
      {[0, 1, 2].map(index => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-expedition-gold/75 motion-safe:animate-pulse"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </div>
  );
}

function entryTime(entry, fallbackTime) {
  return Number.isFinite(Number(entry?.timeOfDay))
    ? formatExpeditionTime(Number(entry.timeOfDay))
    : fallbackTime;
}

function entryPresentation(entry) {
  if (entry?.kind === 'npcActivity' || entry?.kind === 'syms') {
    return { speaker: 'Syms Covington', portrait: '/portraits/syms_covington.jpg' };
  }
  if (entry?.kind === 'fieldNote') {
    return { speaker: 'Field Note', icon: <OpenBookIcon className="h-5 w-5" /> };
  }
  if (entry?.kind === 'player') {
    return { speaker: 'You', icon: <NoteIcon className="h-5 w-5" /> };
  }
  if (entry?.kind === 'darwinThought') {
    return { speaker: 'Darwin', icon: <OpenBookIcon className="h-5 w-5" />, italic: true };
  }
  return { speaker: 'Narrator', icon: <CompassRoseIcon className="h-5 w-5" /> };
}

const NarratorComposer = memo(function NarratorComposer({
  expanded,
  pending,
  submitNarratorCommand,
  onDraftActiveChange,
  emphasized = false,
  placeholder = null,
  polished = false,
}) {
  const [draft, setDraft] = useState('');

  const updateDraft = useCallback(event => {
    const next = event.target.value;
    setDraft(next);
    onDraftActiveChange(next.length > 0);
  }, [onDraftActiveChange]);

  const handleSubmit = useCallback(event => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || (pending && !isEndGameNarratorCommand(trimmed))) return;
    setDraft('');
    onDraftActiveChange(false);
    submitNarratorCommand(trimmed);
  }, [draft, onDraftActiveChange, pending, submitNarratorCommand]);

  const canEndWhilePending = pending && isEndGameNarratorCommand(draft);

  const handleFocus = useCallback(() => {
    setTypingMode(true);
  }, []);

  const handleBlur = useCallback(() => {
    setTypingMode(false);
  }, []);

  const handleKeyDown = useCallback(event => {
    // While typing, keys belong to the input: Escape hands control
    // back to the game, everything else must not reach the hotkeys.
    event.stopPropagation();
    if (event.key === 'Escape') event.currentTarget.blur();
  }, []);

  return (
    <form onSubmit={handleSubmit} className={`flex items-center gap-2 border-t border-expedition-brass/30 transition-[margin,padding] duration-300 ease-out ${expanded ? 'mt-3 pt-3' : 'mt-2 pt-2'}`}>
      <input
        type="text"
        value={draft}
        onChange={updateDraft}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`min-w-0 flex-1 rounded-sm border bg-[rgba(232,220,192,0.94)] px-3.5 font-expedition leading-snug text-[#2b2416] outline-none placeholder:italic placeholder:text-[#7a6a4d] transition-[padding,border-color,box-shadow] duration-300 focus:border-expedition-goldbright focus:ring-1 focus:ring-expedition-gold/50 ${polished ? 'text-[17px]' : 'text-[16px]'} ${emphasized ? 'border-expedition-goldbright shadow-[0_0_0_2px_rgba(227,197,133,0.26),0_0_18px_rgba(227,197,133,0.28)]' : 'border-expedition-gold/50'} ${expanded || polished ? 'py-2.5' : 'py-2'}`}
        placeholder={emphasized ? (placeholder || 'Describe Darwin’s practical remedy...') : 'Ask the narrator or describe an action...'}
      />
      <button
        type="submit"
        disabled={pending && !canEndWhilePending}
        aria-label={pending && !canEndWhilePending ? 'Narrator is composing' : 'Send note to narrator'}
        className={`${GOLD_BUTTON} transition-[height,padding] duration-300 disabled:cursor-wait disabled:opacity-60 ${polished ? 'h-11 min-w-[5rem] px-3 text-[12px]' : `min-w-[4.25rem] ${expanded ? 'h-10' : 'h-9 px-2.5'}`}`}
      >
        {pending && !canEndWhilePending ? (
          <span className="flex items-center justify-center gap-1" aria-hidden="true">
            {[0, 1, 2].map(index => (
              <span
                key={index}
                className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ))}
          </span>
        ) : 'Send'}
      </button>
    </form>
  );
});

function NarrativePanel({ forceExpanded = false, polished = false }) {
  const [composerHasText, setComposerHasText] = useState(false);
  const [logHeight, setLogHeight] = useState(LOG_DEFAULT_HEIGHT);
  const [focused, setFocused] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const logRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const narratorLog = useThreeGameStore(state => state.narratorLog);
  const narratorPending = useThreeGameStore(state => state.narratorPending);
  const narratorError = useThreeGameStore(state => state.narratorError);
  const submitNarratorCommand = useThreeGameStore(state => state.submitNarratorCommand);
  const openLibrary = useThreeGameStore(state => state.openLibrary);
  // Minute-resolution clock shown on un-stamped lines. Subscribing to the
  // formatted string instead of raw timeOfDay re-renders this heavy panel only
  // when the displayed minute changes, not on every ~1s clock tick.
  const fallbackTime = useThreeGameStore(state => formatExpeditionTime(state.timeOfDay));
  const displayEntries = useMemo(
    () => (Array.isArray(narratorLog) ? narratorLog.slice(-24) : []),
    [narratorLog],
  );
  // Newest line stays in view; the log scrolls like a chat transcript.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayEntries, narratorPending, narratorError]);
  // Never leave the game deaf to hotkeys if the panel unmounts mid-focus.
  useEffect(() => () => setTypingMode(false), []);
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => (specimen.instanceId || specimen.id) === nearbySpecimenId || specimen.id === nearbySpecimenId);
  const tool = threeTools.find(item => item.id === activeToolId);
  const expanded = polished
    ? forceExpanded || pinned || hovered || focused || composerHasText || narratorPending
    : forceExpanded || !manualCollapsed || focused || composerHasText || narratorPending;
  const visibleLogHeight = expanded ? logHeight : polished ? 58 : 88;
  const previewMessage = displayEntries.at(-1)?.text || '';

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
      onMouseEnter={() => {
        if (polished) setHovered(true);
      }}
      onMouseLeave={() => {
        if (polished) setHovered(false);
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
    <ExpeditionPanel
      variant={polished ? 'quiet' : 'hud'}
      className={`${polished ? (expanded ? 'w-[min(29rem,calc(100vw-1.5rem))]' : 'w-[min(24rem,calc(100vw-1.5rem))]') : 'w-[min(28rem,calc(100vw-1.5rem))]'} transition-[width,opacity,transform] duration-300 ease-out ${expanded ? 'opacity-100' : 'translate-y-1 opacity-90'}`}
      innerClassName={`transition-[padding] duration-300 ease-out ${expanded ? 'p-4 pt-1.5' : 'px-3 py-2.5'}`}
    >
      {!forceExpanded && (
        <button
          type="button"
          onClick={() => {
            if (polished) setPinned(value => !value);
            else setManualCollapsed(value => !value);
          }}
          aria-label={polished ? (pinned ? 'Unpin narrator panel' : 'Pin narrator panel open') : (expanded ? 'Minimize narrator panel' : 'Open narrator panel')}
          title={polished ? (pinned ? 'Unpin narrator panel' : 'Pin narrator panel open') : (expanded ? 'Minimize narrator panel' : 'Open narrator panel')}
          className={`absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-expedition-gold/45 bg-[rgba(8,14,27,0.55)] font-expedition text-[15px] leading-none text-expedition-gold/85 shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition hover:border-expedition-gold hover:bg-expedition-gold/12 hover:text-expedition-goldbright focus:outline-none focus:ring-1 focus:ring-expedition-gold/70 ${expanded ? '' : 'opacity-80'}`}
        >
          {polished ? (
            <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${pinned ? 'rotate-[-35deg] fill-current' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2.5h6l-1.1 3.2 2 2v1H8.8V14L7.2 12.4V8.7H4v-1l2.1-2L5 2.5Z" />
            </svg>
          ) : expanded ? (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round">
              <path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5" />
            </svg>
          ) : (
            <OpenBookIcon className="h-4 w-4" />
          )}
        </button>
      )}
      <div
        role="separator"
        aria-orientation="horizontal"
        title={expanded ? 'Drag to resize' : 'Open field log'}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onHandlePointerEnd}
        onDoubleClick={() => setLogHeight(LOG_DEFAULT_HEIGHT)}
        className={`group relative flex touch-none items-center justify-center transition-all duration-300 ease-out ${expanded ? '-mx-4 mb-1.5 h-5 cursor-ns-resize' : '-mx-3 -mt-1 mb-1 h-2 cursor-default'}`}
      >
        {polished && expanded && <span className="absolute left-4 text-[9px] font-semibold uppercase tracking-[0.18em] text-expedition-gold/80">Field log</span>}
        <span className={`rounded-full bg-expedition-brass/50 transition group-hover:bg-expedition-gold/80 ${expanded ? 'h-1 w-12' : 'h-0.5 w-9 opacity-60'}`} />
      </div>
      <div
        ref={logRef}
        style={{ height: visibleLogHeight }}
        className={`grid content-start overflow-y-auto pr-1.5 transition-[height,gap] duration-300 ease-out [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)] ${expanded ? 'gap-2.5' : 'gap-1.5'}`}
      >
        {!expanded ? (
          <button
            type="button"
            onClick={() => {
              if (polished) setPinned(true);
              else setManualCollapsed(false);
            }}
            className="grid w-full grid-cols-[auto_1fr] items-center gap-2.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-expedition-gold/70 bg-expedition-gold/10 text-expedition-gold">
              <OpenBookIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-expedition-gold">Field Log</div>
              <div className={`mt-0.5 overflow-hidden font-expedition leading-snug text-expedition-parchment/95 ${polished ? 'max-h-[2.9rem] text-[15.5px]' : 'max-h-[2.55rem] text-[13px]'}`}>
                {previewMessage}
              </div>
            </div>
          </button>
        ) : (
          <>
            {displayEntries.map(entry => {
              const presentation = entryPresentation(entry);
              return (
                <SpeakerLine
                  key={entry.id}
                  speaker={entry.speaker || presentation.speaker}
                  time={entryTime(entry, fallbackTime)}
                  icon={presentation.icon}
                  portrait={presentation.portrait}
                  italic={presentation.italic}
                  polished={polished}
                >
                  {entry.kind === 'hotkeys'
                    ? <HotkeysResponse polished={polished} />
                    : entry.kind === 'player'
                      ? entry.text
                      : <MemoryLinkedText>{entry.text}</MemoryLinkedText>}
                </SpeakerLine>
              );
            })}
            {narratorPending && (
              <SpeakerLine speaker="Narrator" time={fallbackTime} icon={<CompassRoseIcon className="h-5 w-5" />} polished={polished}>
                <NarratorLoadingDots />
              </SpeakerLine>
            )}
            {narratorError && !narratorPending && (
              <SpeakerLine speaker="Narrator" time={fallbackTime} icon={<CompassRoseIcon className="h-5 w-5" />} italic polished={polished}>
                {narratorError}
              </SpeakerLine>
            )}
          </>
        )}
      </div>
      {(!polished || expanded) && (PLAYER_VISIBLE_NARRATOR_ENABLED ? (
        <NarratorComposer
          expanded={expanded}
          pending={narratorPending}
          submitNarratorCommand={submitNarratorCommand}
          onDraftActiveChange={setComposerHasText}
          polished={polished}
        />
      ) : (
        <button type="button" onClick={() => openLibrary?.({ drawerOpen: true })} className="mt-3 flex w-full items-center justify-between border-t border-expedition-brass/30 pt-3 text-left text-[12px] uppercase tracking-[0.11em] text-expedition-gold hover:text-expedition-goldbright">
          <span>Search Darwin’s library</span><span aria-hidden="true">→</span>
        </button>
      ))}
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

// Field-record progress for the *current* region. The numerator must be scoped
// to this zone: `collectedSpecimenIds` is an expedition-wide list, so dividing
// it by the zone's specimen count produced ratios like "3 / 2 specimens".
// Documented specimens count toward progress because the objective and
// `questComplete` treat collecting and documenting as equivalent fieldwork.
const SYMS_STATUS_DOT = {
  nearby: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
  region: 'bg-expedition-gold shadow-[0_0_5px_rgba(201,163,95,0.6)]',
  away: 'bg-expedition-brass/50',
};

// Syms' presence was previously hardcoded to "Nearby" with a live green dot in
// three places. `nearbyNpcEncounter` is the proximity signal the world already
// computes, and `symsZoneId` tracks which region he is working in.
function useSymsStatus() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const symsZoneId = useThreeGameStore(state => state.symsZoneId);
  const symsDirective = useThreeGameStore(state => state.symsDirective);
  const nearbyNpcId = useThreeGameStore(state => state.nearbyNpcEncounter?.npcId || null);
  return useMemo(() => {
    if (nearbyNpcId === 'syms_covington') {
      return { tone: 'nearby', label: 'Nearby', detail: 'The collecting case is ready.' };
    }
    if (symsZoneId === currentZoneId) {
      return symsDirective === SYMS_DIRECTIVES.FOLLOW
        ? { tone: 'region', label: 'Following', detail: 'Keeping pace behind you.' }
        : { tone: 'region', label: 'In region', detail: 'Working somewhere close.' };
    }
    // Labels sit in a 15.5rem column, so the place name goes in the tooltip
    // rather than truncating in the row.
    const where = getIslandMapLocation(symsZoneId)?.name;
    return {
      tone: 'away',
      label: 'Away',
      detail: where ? `At ${where}. Out of earshot.` : 'Elsewhere on the island.',
    };
  }, [currentZoneId, nearbyNpcId, symsDirective, symsZoneId]);
}




// Ammo chip for the collecting shotgun: two barrel pips and a reload sweep,
// shown above the tool belt whenever the shotgun is in hand.
function ShotgunStatusChip() {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const shells = useThreeGameStore(state => state.shotgunShells);
  const reloadUntil = useThreeGameStore(state => state.shotgunReloadUntil);
  const [, forceTick] = useReducer(count => count + 1, 0);
  const barRef = useRef(null);
  const nowSeconds = (globalThis.performance?.now?.() ?? Date.now()) / 1000;
  const reloading = reloadUntil > nowSeconds;

  useEffect(() => {
    if (!reloading) return undefined;
    const remaining = Math.max(0.05, reloadUntil - (performance.now() / 1000));
    const bar = barRef.current;
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = `${Math.max(0, 100 - (remaining / SHOTGUN.reloadDuration) * 100)}%`;
      requestAnimationFrame(() => {
        bar.style.transition = `width ${remaining}s linear`;
        bar.style.width = '100%';
      });
    }
    const timer = setTimeout(forceTick, remaining * 1000 + 80);
    return () => clearTimeout(timer);
  }, [reloadUntil, reloading]);

  if (activeToolId !== 'shotgun') return null;
  // A finished reload commits lazily in the ammo helper; show it full here.
  const displayShells = reloading ? 0 : (reloadUntil > 0 && (shells ?? 0) <= 0 ? SHOTGUN.barrels : (shells ?? SHOTGUN.barrels));

  return (
    <div className="pointer-events-none inline-flex items-center gap-2.5 rounded-full border border-expedition-gold/60 bg-[rgba(12,20,38,0.68)] px-3.5 py-1.5 font-expedition text-expedition-parchment shadow-lg backdrop-blur-md">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-expedition-gold/90">Shotgun</span>
      <span className="flex items-center gap-1.5" aria-label={`${displayShells} of ${SHOTGUN.barrels} barrels loaded`}>
        {Array.from({ length: SHOTGUN.barrels }, (_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full border ${
              index < displayShells
                ? 'border-expedition-goldbright bg-expedition-goldbright shadow-[0_0_5px_rgba(227,197,133,0.55)]'
                : 'border-expedition-brass/60 bg-transparent'
            }`}
          />
        ))}
      </span>
      {reloading ? (
        <span className="flex items-center gap-1.5">
          <span className="relative h-1 w-14 overflow-hidden rounded-full bg-black/45">
            <span ref={barRef} className="absolute inset-y-0 left-0 rounded-full bg-expedition-gold/85" style={{ width: '0%' }} />
          </span>
          <span className="text-[10.5px] italic text-expedition-faded">Reloading</span>
        </span>
      ) : (
        <span className="text-[10.5px] text-expedition-faded">Hold RMB / F to aim · click fires</span>
      )}
    </div>
  );
}

// Screen-center crosshair while Darwin shoulders the shotgun. Runs on rAF and
// writes styles directly — the aim state mutates at 60hz and must never tick
// React. Warms to bright gold and tightens when a specimen is in the cone;
// dims while reloading; names the target under the cross.
function AimCrosshair() {
  const rootRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = rootRef.current;
      if (!root) return;
      const active = shotgunAimState.active;
      root.style.opacity = active ? '1' : '0';
      if (!active) return;
      const now = (globalThis.performance?.now?.() ?? Date.now()) / 1000;
      const reloading = shotgunAimState.reloadingUntil > now;
      const hot = shotgunAimState.onTarget && !reloading;
      root.style.setProperty('--cross-color', reloading
        ? 'rgba(232,220,184,0.28)'
        : hot ? '#ffd36a' : 'rgba(232,220,184,0.85)');
      root.style.setProperty('--cross-gap', hot ? '7px' : '10px');
      root.style.setProperty('--cross-glow', hot ? '0 0 6px rgba(255,211,106,0.8)' : 'none');
      const label = labelRef.current;
      if (label) {
        const text = hot && shotgunAimState.targetLabel ? shotgunAimState.targetLabel : (reloading ? 'Reloading…' : '');
        if (label.textContent !== text) label.textContent = text;
        label.style.color = reloading ? 'rgba(232,220,184,0.55)' : '#ffd36a';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tickStyle = {
    background: 'var(--cross-color, rgba(232,220,184,0.85))',
    boxShadow: 'var(--cross-glow, none)',
    transition: 'transform 120ms ease-out',
  };

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200"
    >
      <div className="relative h-14 w-14">
        <span className="absolute left-1/2 top-1/2 h-[9px] w-[1.5px] -translate-x-1/2" style={{ ...tickStyle, transform: 'translate(-50%, calc(-50% - var(--cross-gap, 10px) - 4px))' }} />
        <span className="absolute left-1/2 top-1/2 h-[9px] w-[1.5px] -translate-x-1/2" style={{ ...tickStyle, transform: 'translate(-50%, calc(-50% + var(--cross-gap, 10px) - 4px))' }} />
        <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[9px] -translate-y-1/2" style={{ ...tickStyle, transform: 'translate(calc(-50% - var(--cross-gap, 10px) - 4px), -50%)' }} />
        <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[9px] -translate-y-1/2" style={{ ...tickStyle, transform: 'translate(calc(-50% + var(--cross-gap, 10px) - 4px), -50%)' }} />
        <span
          className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--cross-color, rgba(232,220,184,0.85))', boxShadow: 'var(--cross-glow, none)' }}
        />
      </div>
      <div
        ref={labelRef}
        className="mt-1.5 text-center font-expedition text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
      />
    </div>
  );
}



function GameplayCompass({ onClose, className = '' }) {
  return (
    <div className={`pointer-events-none relative ${className}`}>
      <CompassDial className="w-full" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Put pocket compass away"
        title="Put compass away"
        className="pointer-events-auto absolute right-[3%] top-[3%] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[#e5c77f]/75 bg-[rgba(25,17,8,0.9)] font-expedition text-[12px] text-[#e4c477] shadow-[0_3px_8px_rgba(0,0,0,0.55)] transition hover:scale-105 hover:border-[#ffe2a0] hover:text-[#ffe2a0] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ffe2a0]"
      >
        ×
      </button>
    </div>
  );
}

function PolishedFieldRail({
  onOpenInventory,
  onOpenMap,
  onOpenJournal,
  onOpenLibrary,
  onRequestEndGame,
  onOpenPause,
  audioEnabled = true,
  onAudioEnabledChange,
  compassOpen = false,
  onCloseCompass,
}) {
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const journalCount = useThreeGameStore(state => state.journal.length);
  const timeOfDay = useThreeGameStore(state => state.timeOfDay);
  const supplies = useThreeGameStore(state => state.supplies);
  const restBusy = useThreeGameStore(state => Boolean(state.restSession));
  const casePulse = useCaseAddedPulse();
  const zone = getZone(currentZoneId);
  const interior = getInteriorDefinition(currentZoneId);
  const zoneProgress = useZoneSpecimenProgress();
  const syms = useSymsStatus();
  const progress = zoneProgress.total > 0
    ? Math.min(100, (zoneProgress.recorded / zoneProgress.total) * 100)
    : 0;

  const compactAction = 'group inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm border border-expedition-brass/40 bg-black/14 px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.09em] text-expedition-faded transition duration-200 hover:border-expedition-gold/70 hover:bg-expedition-gold/8 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60';
  const railIconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-expedition-brass/45 bg-black/12 text-expedition-gold/75 transition hover:border-expedition-gold/75 hover:bg-expedition-gold/8 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60';

  // Column width is set by the chart: narrow enough that a square map fills it
  // edge to edge, since a wider one would either stretch it or sit it on a mat.
  return (
    <div className="hidden w-[15.5rem] flex-col gap-2.5 xl:flex">
      <ExpeditionPanel variant="quiet" innerClassName="p-2">
        <div className="flex items-start justify-between gap-2 px-0.5 pb-1.5">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-expedition-gold">Local chart</div>
            <div className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-[0.01em] text-expedition-parchment">
              {interior?.label || zone.shortName || zone.name}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={onOpenPause}
              title="Pause — settings, controls, end expedition (Esc)"
              aria-label="Pause menu"
              className={railIconButton}
            >
              <PauseIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onAudioEnabledChange?.(!audioEnabled)}
              title={audioEnabled ? 'Mute game audio' : 'Restore game audio'}
              aria-label={audioEnabled ? 'Mute game audio' : 'Restore game audio'}
              aria-pressed={!audioEnabled}
              className={`${railIconButton} ${audioEnabled ? '' : 'border-expedition-gold/75 bg-expedition-gold/10 text-expedition-goldbright'}`}
            >
              <SoundIcon muted={!audioEnabled} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMapCollapsed(value => !value)}
              aria-expanded={!mapCollapsed}
              title={mapCollapsed ? 'Expand chart' : 'Collapse chart'}
              className={railIconButton}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-4 w-4 transition-transform duration-300 ${mapCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M3.5 6 L8 10.5 L12.5 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${mapCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
          <div className="overflow-hidden">
            <MinimapBody
              onOpenMap={onOpenMap}
              tabsClassName="flex"
              views={['local', 'island']}
              initialView="local"
              showLocationHeader={false}
              showMapStyleToggle={false}
              quietTabs
              polishedIsland
            />
          </div>
        </div>
      </ExpeditionPanel>

      <ExpeditionPanel variant="quiet" innerClassName="px-2.5 pb-2.5 pt-2.5">
        <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-expedition-gold">Field record</span>
          <span className="text-[13px] font-semibold text-expedition-parchment">
            <span className="text-expedition-goldbright">{zoneProgress.recorded}</span> / {zoneProgress.total} recorded
          </span>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="h-1.5 overflow-hidden rounded-full border border-expedition-gold/25 bg-black/45">
            <div className="h-full rounded-full bg-gradient-to-r from-expedition-brass to-expedition-goldbright transition-[width] duration-700" style={{ width: `${Math.max(progress, zoneProgress.recorded ? 4 : 0)}%` }} />
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-expedition-faded">{journalCount} {journalCount === 1 ? 'note' : 'notes'}</span>
        </div>

        <div className="mt-2 flex items-center gap-1.5 border-t border-expedition-brass/30 pt-2">
          {!interior ? (
            <>
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-expedition-brass/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/portraits/syms_covington.jpg" alt="Syms Covington" className="h-full w-full object-cover sepia-[0.35]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold leading-tight text-expedition-parchment">Syms</div>
                <div className="mt-0.5 flex items-center gap-1 text-[8.5px] uppercase tracking-[0.08em] text-expedition-faded">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SYMS_STATUS_DOT[syms.tone]}`} />
                  <span className="min-w-0 truncate" title={syms.detail}>{syms.label}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold leading-tight text-expedition-parchment">{interior.label}</div>
              <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.08em] text-expedition-faded">Field station</div>
            </div>
          )}
          <button type="button" onClick={onOpenInventory} className={`${railIconButton} relative`} title="Open specimens" aria-label="Open specimens">
            <CasePulseGlow pulse={casePulse} />
            <span key={casePulse ? `case-shake-${casePulse.key}` : 'case-idle'} className={casePulse ? 'animate-case-shake motion-reduce:animate-none' : ''}>
              <ButterflyIcon className="h-4 w-4" />
            </span>
          </button>
          <button type="button" onClick={onOpenJournal} className={railIconButton} title="Open field notebook" aria-label="Open field notebook">
            <OpenBookIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onOpenLibrary} className={railIconButton} title="Open Darwin's library" aria-label="Open Darwin's library">
            <span className="text-[10px] font-semibold">LIB</span>
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-expedition-brass/30 pt-2">
          <button
            type="button"
            onClick={() => setTouchControl('rest', true)}
            disabled={restBusy}
            title={restCostHint(timeOfDay, supplies)}
            className={`${compactAction} disabled:opacity-50`}
          >
            <FatigueIcon className="h-3.5 w-3.5 shrink-0 text-expedition-gold/85" />
            <span>Rest</span>
            {/* The cost is the point now that the survey has an end date. */}
            <span className="shrink-0 rounded-[2px] border border-expedition-brass/50 px-1 text-[8px] tracking-normal text-expedition-gold/85">2h</span>
          </button>
          <button
            type="button"
            onClick={onRequestEndGame}
            className={`${compactAction} hover:border-rose-400/80 hover:bg-rose-950/38 hover:text-rose-200 focus-visible:ring-rose-300/70`}
            title="End the expedition"
            data-testid="end-game-button"
          >
            <svg viewBox="0 0 18 18" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-expedition-gold/75 transition group-hover:text-rose-300" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2.5v13M4 3.5h8l-1.5 2L12 8H4" />
            </svg>
            <span className="truncate">End game</span>
          </button>
        </div>
      </ExpeditionPanel>

      {compassOpen && (
        <div className="flex justify-center pb-1 pt-0.5">
          <GameplayCompass onClose={onCloseCompass} className="w-[10.5rem]" />
        </div>
      )}
    </div>
  );
}

function EndGameConfirmationModal({ open, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus({ preventScroll: true }), 80);
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[75] flex items-center justify-center bg-[#050b14]/76 p-4 backdrop-blur-[5px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="end-game-confirmation-title"
      aria-describedby="end-game-confirmation-description"
      data-testid="end-game-confirmation-modal"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <ExpeditionPanel
        variant="quiet"
        className="w-[min(28rem,calc(100vw-2rem))]"
        innerClassName="p-5 sm:p-6"
        background="linear-gradient(165deg, rgba(27,42,68,0.98), rgba(13,25,45,0.99))"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-expedition-gold">Conclude expedition</div>
        <h2 id="end-game-confirmation-title" className="mt-2 text-[24px] font-semibold leading-tight text-expedition-parchment">End the game?</h2>
        <p id="end-game-confirmation-description" className="mt-2 text-[15px] leading-relaxed text-expedition-faded">
          Your field record will be closed and sent to Professor Henslow for final assessment.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-expedition-brass/30 pt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-expedition-brass/50 bg-black/15 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-expedition-parchment transition hover:border-expedition-gold/75 hover:bg-expedition-gold/8 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
          >
            Continue playing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-sm border border-rose-400/55 bg-rose-950/28 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:border-rose-300 hover:bg-rose-900/55 hover:text-rose-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-300"
          >
            End game
          </button>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pause menu
//
// Escape now reaches settings, the controls reference, ending the expedition and
// the main menu at every breakpoint. Previously the only End Expedition button
// lived in the xl-and-up field rail, so on a narrow window or a phone Henslow's
// final assessment was unreachable except by typing "end game", and there was no
// route back to the main menu at all.

const PAUSE_ROW = 'flex w-full items-center justify-between gap-4 rounded-sm border border-expedition-brass/45 bg-black/15 px-3.5 py-3 text-left font-expedition transition hover:border-expedition-gold/75 hover:bg-expedition-gold/8 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70';
const PAUSE_ROW_LABEL = 'text-[14.5px] font-semibold text-expedition-parchment';
const PAUSE_ROW_VALUE = 'shrink-0 text-[11px] uppercase tracking-[0.12em] text-expedition-gold';

function PauseMenu({
  open,
  onResume,
  onOpenControls,
  onRequestEndGame,
  onReturnToMainMenu,
  audioEnabled,
  onAudioEnabledChange,
  quality,
  onQualityChange,
}) {
  const panelRef = useDismissableOverlay(open, onResume);
  const [showQuality, setShowQuality] = useState(false);
  const [showComfort, setShowComfort] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowQuality(false);
      setShowComfort(false);
    }
  }, [open]);

  if (!open) return null;

  const activeQuality = QUALITY_CHOICES.find(choice => choice.id === quality) || QUALITY_CHOICES[0];

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-[#050b14]/80 p-4 backdrop-blur-[5px]"
      data-testid="pause-menu"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onResume();
      }}
    >
      <ExpeditionPanel
        variant="quiet"
        className="w-[min(29rem,calc(100vw-2rem))]"
        innerClassName="p-5 sm:p-6"
        background="linear-gradient(165deg, rgba(27,42,68,0.98), rgba(13,25,45,0.99))"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Expedition paused"
          tabIndex={-1}
          className="focus:outline-none"
        >
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-expedition-gold">Expedition paused</div>
            <h2 className="mt-1.5 font-expedition text-[24px] font-semibold leading-tight text-expedition-parchment">
              At anchor
            </h2>
          </div>

          <GoldDivider className="my-4" />

          <div className="grid gap-2">
            <button type="button" onClick={onResume} className={PAUSE_ROW} data-testid="pause-resume">
              <span className={PAUSE_ROW_LABEL}>Resume expedition</span>
              <span className={PAUSE_ROW_VALUE}>Esc</span>
            </button>

            <button type="button" onClick={onOpenControls} className={PAUSE_ROW}>
              <span className={PAUSE_ROW_LABEL}>Controls</span>
              <span className={PAUSE_ROW_VALUE}>?</span>
            </button>

            <button
              type="button"
              onClick={() => onAudioEnabledChange?.(!audioEnabled)}
              aria-pressed={audioEnabled}
              className={PAUSE_ROW}
            >
              <span className={PAUSE_ROW_LABEL}>Sound</span>
              <span className={PAUSE_ROW_VALUE}>{audioEnabled ? 'On' : 'Off'}</span>
            </button>

            <div className="rounded-sm border border-expedition-brass/45 bg-black/15">
              <button
                type="button"
                onClick={() => setShowQuality(value => !value)}
                aria-expanded={showQuality}
                className={`${PAUSE_ROW} border-0 bg-transparent hover:bg-expedition-gold/8`}
              >
                <span className={PAUSE_ROW_LABEL}>Graphics quality</span>
                <span className={PAUSE_ROW_VALUE}>{activeQuality.label}</span>
              </button>
              <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${showQuality ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="grid gap-1 border-t border-expedition-brass/30 p-2">
                    {QUALITY_CHOICES.map(choice => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => onQualityChange?.(choice.id)}
                        aria-pressed={choice.id === quality}
                        className={`rounded-sm border px-2.5 py-2 text-left font-expedition transition focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70 ${
                          choice.id === quality
                            ? 'border-expedition-gold/70 bg-expedition-gold/12'
                            : 'border-transparent hover:border-expedition-brass/50 hover:bg-expedition-gold/6'
                        }`}
                      >
                        <span className={`block text-[13px] font-semibold ${choice.id === quality ? 'text-expedition-goldbright' : 'text-expedition-parchment'}`}>
                          {choice.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-expedition-faded">{choice.note}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-sm border border-expedition-brass/45 bg-black/15">
              <button
                type="button"
                onClick={() => setShowComfort(value => !value)}
                aria-expanded={showComfort}
                className={`${PAUSE_ROW} border-0 bg-transparent hover:bg-expedition-gold/8`}
              >
                <span className={PAUSE_ROW_LABEL}>Camera &amp; sound</span>
                <span className={PAUSE_ROW_VALUE}>{showComfort ? 'Hide' : 'Adjust'}</span>
              </button>
              <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${showComfort ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="border-t border-expedition-brass/30 py-1">
                    <ComfortSettings bare />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 border-t border-expedition-brass/30 pt-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={onReturnToMainMenu}
              className="rounded-sm border border-expedition-brass/50 bg-black/15 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-expedition-parchment transition hover:border-expedition-gold/75 hover:bg-expedition-gold/8 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
            >
              Main menu
            </button>
            <button
              type="button"
              onClick={onRequestEndGame}
              data-testid="pause-end-game"
              className="rounded-sm border border-rose-400/55 bg-rose-950/28 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:border-rose-300 hover:bg-rose-900/55 hover:text-rose-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-300"
            >
              End expedition
            </button>
          </div>

          <p className="mt-3 text-center font-expedition text-[11px] italic leading-snug text-expedition-faded">
            Ending the expedition closes your field record and sends it to Professor Henslow.
          </p>
        </div>
      </ExpeditionPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts + touch controls

const CAMERA_MODE_LABELS = {
  shoulder: 'Shoulder View',
  hero: 'Hero View',
  first: 'First Person',
  top: 'Overhead Chart',
};
const CAMERA_MODE_SHORT_LABELS = {
  shoulder: 'Shoulder',
  hero: 'Hero',
  first: 'First person',
  top: 'Overhead',
};

const MOVEMENT_HINT_MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);
const COLLECTION_METHOD_IDS = ['hands', 'hammer', 'insect_net', 'shotgun'];
const COLLECTION_METHOD_SET = new Set(COLLECTION_METHOD_IDS);
const PROMPT_EXIT_MS = 220;
const RESULT_TOAST_EXIT_MS = 280;

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

function ControlHintKey({ children }) {
  return (
    <span className="inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-[3px] border border-expedition-brass/55 bg-black/18 px-1.5 font-sans text-[11px] font-bold leading-none text-expedition-parchment/90">
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

function controlHintContent(playableModeId, phase) {
  if (phase === 'showHud') {
    return <span>Press <ControlHintKey>H</ControlHintKey> to show the interface.</span>;
  }
  if (phase === 'studySubject') {
    return (
      <span>
        Press <ControlHintKey>Enter</ControlHintKey> to examine this subject. After you examine it, you can collect a sample.
      </span>
    );
  }
  if (phase === 'complete' || phase === 'reminder') {
    return (
      <span>
        Press <ControlHintKey>?</ControlHintKey> to see all controls, or <ControlHintKey>H</ControlHintKey> to hide the interface.
      </span>
    );
  }
  if (phase === 'move') {
    return (
      <span>
        Use <ControlHintKey>WASD</ControlHintKey> or the <ControlHintKey>Arrow keys</ControlHintKey> to {playableModeId === 'finch' ? 'fly' : 'move'}.
      </span>
    );
  }
  if (phase === 'faster') {
    return (
      <span>
        Hold <ControlHintKey>Shift</ControlHintKey> to {playableModeId === 'finch' ? 'fly faster or dive' : playableModeId === 'tortoise' ? 'walk faster' : 'run'}.
      </span>
    );
  }
  if (phase === 'jump') return <span>Press the <ControlHintKey>Space bar</ControlHintKey> to jump.</span>;
  if (phase === 'land') return <span>Press the <ControlHintKey>Space bar</ControlHintKey> to land or take off.</span>;
  if (phase === 'brace') return <span>Hold the <ControlHintKey>Space bar</ControlHintKey> to brace on steep slopes.</span>;
  if (phase === 'animalActions') {
    return (
      <span>
        Press <ControlHintKey>1</ControlHintKey> to eat, <ControlHintKey>2</ControlHintKey> to sleep, or <ControlHintKey>3</ControlHintKey> to defecate. You can also click an action.
      </span>
    );
  }
  if (phase === 'camera') {
    return (
      <span>
        <ControlHintKey>Drag</ControlHintKey> to look around, and <ControlHintKey>Scroll</ControlHintKey> to zoom.
      </span>
    );
  }
  if (phase === 'fieldAction') {
    return <span>Press <ControlHintKey>Enter</ControlHintKey> to observe or act on a subject.</span>;
  }
  if (phase === 'worldAction') {
    return (
      <span>
        Press <ControlHintKey>1–6</ControlHintKey> to choose a tool. Press <ControlHintKey>E</ControlHintKey> to speak, carry, or travel.
      </span>
    );
  }
  return null;
}

function PolishedControlHint({
  playableModeId = 'darwin',
  hudHidden,
  disabled = false,
  ready = true,
  contextHintId = null,
}) {
  const [phase, setPhase] = useState('move');
  const [visible, setVisible] = useState(false);
  const [attention, setAttention] = useState(false);
  const [retainedContextHintId, setRetainedContextHintId] = useState(null);
  const progressRef = useRef(null);
  const phaseRef = useRef('move');
  const visibleRef = useRef(false);
  const contextualHintTimerRef = useRef(0);

  useEffect(() => {
    if (contextHintId !== HINT_STUDY) return;
    window.clearTimeout(contextualHintTimerRef.current);
    setRetainedContextHintId(HINT_STUDY);
    contextualHintTimerRef.current = window.setTimeout(() => {
      setRetainedContextHintId(null);
      contextualHintTimerRef.current = 0;
    }, 12000);
  }, [contextHintId]);

  useEffect(() => () => window.clearTimeout(contextualHintTimerRef.current), []);

  useEffect(() => {
    progressRef.current = {
      moved: false,
      ran: false,
      jumped: false,
      animalAction: false,
      camera: false,
      fieldAction: false,
      worldAction: false,
      complete: false,
    };
    phaseRef.current = 'move';
    visibleRef.current = false;
    setPhase('move');
    setVisible(false);
    setAttention(false);
  }, [playableModeId, ready]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!ready || disabled) return undefined;
    const progress = progressRef.current;
    if (!progress) return undefined;
    let pointerStart = null;
    let revealTimer = 0;
    let completionFadeTimer = 0;
    let reminderTimer = 0;
    let reminderFadeTimer = 0;
    let inactivityTimer = 0;
    const updatePhase = next => {
      phaseRef.current = next;
      setPhase(next);
    };
    const updateVisible = next => {
      visibleRef.current = next;
      setVisible(next);
    };

    setAttention(false);

    const scheduleAttentionNudge = () => {
      window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        updateVisible(true);
        setAttention(true);
      }, CONTROL_HINT_INACTIVITY_MS);
    };

    const finishBasics = () => {
      if (progress.complete) return;
      progress.complete = true;
      window.clearTimeout(inactivityTimer);
      setAttention(false);
      updatePhase('complete');
      updateVisible(true);
      completionFadeTimer = window.setTimeout(() => updateVisible(false), 7000);
      reminderTimer = window.setTimeout(() => {
        updatePhase('reminder');
        updateVisible(true);
        reminderFadeTimer = window.setTimeout(() => updateVisible(false), 5000);
      }, 30000);
    };

    const publishProgress = patch => {
      if (progress.complete) return;
      const previousPhase = nextControlHintPhase(playableModeId, progress);
      Object.assign(progress, patch);
      const nextPhase = nextControlHintPhase(playableModeId, progress);
      if (nextPhase === 'complete') {
        finishBasics();
        return;
      }
      if (nextPhase !== previousPhase) {
        setAttention(false);
        scheduleAttentionNudge();
      }
      updatePhase(nextPhase);
      updateVisible(true);
    };

    if (progress.complete) {
      if (phaseRef.current === 'complete') {
        completionFadeTimer = window.setTimeout(() => updateVisible(false), 7000);
        reminderTimer = window.setTimeout(() => {
          updatePhase('reminder');
          updateVisible(true);
          reminderFadeTimer = window.setTimeout(() => updateVisible(false), 5000);
        }, 30000);
      } else if (phaseRef.current === 'reminder') {
        reminderFadeTimer = window.setTimeout(() => updateVisible(false), 5000);
      }
    } else {
      if (!visibleRef.current) revealTimer = window.setTimeout(() => updateVisible(true), 650);
      scheduleAttentionNudge();
    }

    const handleKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.repeat) return;
      const patch = {};
      if (MOVEMENT_HINT_MOVE_KEYS.has(event.code)) patch.moved = true;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') patch.ran = true;
      if (event.code === 'Space') patch.jumped = true;
      if (event.code === 'Enter' || event.code === 'NumpadEnter') patch.fieldAction = true;
      if (event.code === 'KeyE' || /^Digit[1-6]$/.test(event.code)) patch.worldAction = true;
      if ((playableModeId === 'finch' || playableModeId === 'tortoise') && /^Digit[1-3]$/.test(event.code)) {
        patch.animalAction = true;
      }
      if (Object.keys(patch).length === 0) return;
      publishProgress(patch);
    };
    const handleToolUse = event => {
      if (['eat', 'sleep', 'defecate'].includes(event.detail?.toolId)) publishProgress({ animalAction: true });
    };
    const handlePointerDown = event => {
      if (event.button !== 0) return;
      pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    };
    const handlePointerMove = event => {
      if (!pointerStart || pointerStart.pointerId !== event.pointerId || !(event.buttons & 1)) return;
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >= 8) {
        pointerStart = null;
        publishProgress({ camera: true });
      }
    };
    const clearPointer = () => {
      pointerStart = null;
    };
    const handleWheel = () => publishProgress({ camera: true });

    if (!progress.complete) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener(TOOL_USE_EVENT, handleToolUse);
      window.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', clearPointer);
      window.addEventListener('pointercancel', clearPointer);
      window.addEventListener('wheel', handleWheel, { passive: true });
    }
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(completionFadeTimer);
      window.clearTimeout(reminderTimer);
      window.clearTimeout(reminderFadeTimer);
      window.clearTimeout(inactivityTimer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(TOOL_USE_EVENT, handleToolUse);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', clearPointer);
      window.removeEventListener('pointercancel', clearPointer);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [disabled, playableModeId, ready]);

  const activePhase = hudHidden
    ? 'showHud'
    : retainedContextHintId === HINT_STUDY
      ? 'studySubject'
      : phase;
  const shown = !disabled && (hudHidden || visible || Boolean(retainedContextHintId));
  const content = controlHintContent(playableModeId, activePhase);

  return (
    <div
      data-testid="control-onboarding-hint"
      data-mode={playableModeId}
      data-phase={activePhase}
      data-attention={attention ? 'true' : 'false'}
      className={`pointer-events-none absolute bottom-4 right-5 z-30 hidden w-max max-w-[min(30rem,calc(100vw-2.5rem))] flex-wrap items-center justify-end gap-1.5 rounded-[4px] border text-right font-expedition normal-case tracking-normal backdrop-blur-sm transition-[opacity,transform,padding,font-size,background-color,border-color] duration-500 md:flex lg:max-w-[min(30rem,calc(50vw-11.75rem))] xl:right-[17rem] xl:max-w-[min(30rem,calc(50vw-27.5rem))] ${
        attention
          ? 'border-expedition-gold/75 bg-[rgba(7,14,27,0.9)] px-3 py-2 text-[13px] leading-relaxed text-expedition-parchment shadow-[0_8px_24px_rgba(0,0,0,0.34),0_0_0_1px_rgba(227,197,133,0.16)]'
          : 'border-expedition-brass/40 bg-[rgba(7,14,27,0.78)] px-2.5 py-1.5 text-[12px] leading-relaxed text-expedition-parchment/90 shadow-[0_6px_18px_rgba(0,0,0,0.28)]'
      } ${shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
      aria-live="polite"
    >
      <div className="min-w-0 text-right">
        {content}
      </div>
    </div>
  );
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

function RouteEdgeBanner({ edgePrompt, toZone, onTravel }) {
  const holdTimerRef = React.useRef(null);
  const [pointerHolding, setPointerHolding] = useState(false);
  const routeDirection = directionLabel(edgePrompt.edge);
  const copy = routePlaceCopy(toZone, edgePrompt);
  const progress = Math.max(0, Math.min(1, pointerHolding ? 1 : edgePrompt.commitProgress || 0));
  const requiresHold = edgePrompt.requiresHold === true;
  const details = [
    Number(edgePrompt.minutes) > 0 ? `about ${Math.round(edgePrompt.minutes)} minutes` : null,
    Number(edgePrompt.fatigue) > 0 ? `+${edgePrompt.fatigue} fatigue` : null,
  ].filter(Boolean);
  const cancelPointerHold = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setPointerHolding(false);
  };
  const beginPointerHold = event => {
    if (!requiresHold) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cancelPointerHold();
    setPointerHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setPointerHolding(false);
      onTravel();
    }, 650);
  };
  useEffect(() => () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
  }, []);
  return (
    <section
      className="pointer-events-none absolute bottom-[8.5rem] left-1/2 z-20 w-[min(30rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-sm border border-expedition-brass/55 bg-[rgba(12,18,21,0.72)] px-3 py-2.5 font-expedition text-expedition-parchment shadow-[0_12px_30px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(227,197,133,0.14)] backdrop-blur-md sm:bottom-[6.2rem]"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-[0.035em]">
            {requiresHold ? 'Hold to return' : `Continue ${routeDirection.toLowerCase()}`} to <span className="text-expedition-goldbright">{toZone.name}</span>
          </p>
          <p className="mt-0.5 truncate text-[10.5px] italic text-expedition-faded">
            {[copy, ...details].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={requiresHold ? undefined : onTravel}
          onPointerDown={beginPointerHold}
          onPointerUp={cancelPointerHold}
          onPointerCancel={cancelPointerHold}
          onPointerLeave={cancelPointerHold}
          className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-expedition-gold/45 bg-expedition-gold/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-expedition-goldbright transition hover:bg-expedition-gold/20"
        >
          <PromptKey active>E</PromptKey>
          {requiresHold ? 'Hold return' : 'Travel'}
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/35">
        <div
          className="h-full bg-expedition-goldbright transition-[width] duration-75"
          style={{
            width: `${progress * 100}%`,
            transitionDuration: pointerHolding ? '650ms' : '75ms',
          }}
        />
      </div>
    </section>
  );
}

function CompactPrompt({ children, visible = true, testId = null }) {
  return (
    <div
      data-testid={testId || undefined}
      aria-live="polite"
      className={`absolute left-1/2 top-[52%] max-w-[min(30rem,calc(100vw-1.25rem))] -translate-x-1/2 -translate-y-1/2 font-expedition transition-[opacity,filter] duration-[220ms] ease-out sm:left-[calc(50%+7rem)] sm:top-[64%] ${
        visible
          ? 'pointer-events-auto opacity-100 blur-0'
          : 'pointer-events-none opacity-0 blur-[1px]'
      }`}
    >
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-sm border border-expedition-brass/30 bg-[rgba(14,18,18,0.42)] px-1.5 py-1 shadow-[0_8px_20px_rgba(0,0,0,0.24)] backdrop-blur-[2px]">
        {children}
      </div>
    </div>
  );
}

function ObservationModeGuide() {
  const active = useThreeGameStore(state => state.observationMode);
  const setObservationMode = useThreeGameStore(state => state.setObservationMode);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setObservationMode(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, setObservationMode]);

  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-expedition" aria-live="polite" data-testid="observation-mode-guide">
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-gold/55 shadow-[0_0_22px_rgba(227,197,133,0.2)]">
        <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-expedition-goldbright/80" />
        <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-expedition-goldbright/80" />
        <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-expedition-goldbright/80" />
        <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-expedition-goldbright/80" />
      </div>
      <div className="absolute left-1/2 top-[calc(50%+3.25rem)] -translate-x-1/2 rounded-sm border border-expedition-brass/45 bg-[rgba(12,20,28,0.68)] px-3 py-1.5 text-center text-[10.5px] uppercase tracking-[0.12em] text-expedition-parchment/85 shadow-lg backdrop-blur-md">
        <span className="finepointer:hidden">Tap a subject to examine</span>
        <span className="hidden finepointer:inline">Click a subject to examine · Esc cancels</span>
      </div>
    </div>
  );
}

function CompactAction({ keyLabel, children, primary = false, locked = false, onClick = null }) {
  const content = (
    <>
      <PromptKey active={primary}>{keyLabel}</PromptKey>
      <span className={`max-w-[16rem] truncate ${primary ? 'font-semibold text-expedition-parchment' : locked ? 'text-expedition-faded/60' : 'text-expedition-faded'}`}>
        {locked && (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="mr-1 inline-block h-3 w-3 align-[-1px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
            <path d="M8.5 10.5 V7.6 a3.5 3.5 0 0 1 7 0 v2.9" />
          </svg>
        )}
        {children}
      </span>
    </>
  );
  const className = `inline-flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1.5 text-left text-[11px] leading-none shadow-sm transition ${
    primary
      ? 'border-expedition-gold/45 bg-[rgba(196,162,91,0.18)] hover:border-expedition-goldbright hover:bg-[rgba(196,162,91,0.26)]'
      : locked
        ? 'border-expedition-brass/15 bg-black/14 opacity-80'
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

// Each of the two field verbs is explained once, on the first prompt that
// uses it, and never again — the flag lives in the save.
const HINT_TAKE = 'verb-take';
const HINT_STUDY = 'verb-study';
const HINT_NPC = 'npc-converse';
const HINT_SKETCH = 'verb-sketch';
const HINT_EXAMINE = 'first-examine';
const HINT_TEXT = {
  [HINT_TAKE]: 'E takes what is already loose.',
  [HINT_NPC]: 'You speak in your own words. What you ask shapes the reply.',
  [HINT_SKETCH]: 'The sketchbook (6) records a creature without taking it.',
  [HINT_EXAMINE]: 'Enter examines a creature. What you observe and write is what Henslow judges at the end.',
};

function promptActionText(value) {
  const stripped = String(value || '').replace(/^press\s+e\s+(?:to\s+)?/i, '').trim();
  return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : 'Interact';
}

function useContextPromptCandidate(source, candidate) {
  const publishContextPrompt = useThreeGameStore(state => state.publishContextPrompt);
  const clearContextPrompt = useThreeGameStore(state => state.clearContextPrompt);

  useEffect(() => {
    if (!candidate) {
      clearContextPrompt(source);
      return undefined;
    }
    publishContextPrompt(source, candidate);
    const timer = window.setTimeout(
      () => publishContextPrompt(source, candidate),
      Math.max(0, candidate.dwellMs || 0) + 24,
    );
    return () => {
      window.clearTimeout(timer);
      clearContextPrompt(source);
    };
  }, [candidate, clearContextPrompt, publishContextPrompt, source]);
}

function currentCollectionMethodId(activeToolId) {
  return COLLECTION_METHOD_SET.has(activeToolId) ? activeToolId : 'hands';
}

function nextCollectionMethodId(activeToolId, direction = 1) {
  const current = currentCollectionMethodId(activeToolId);
  const index = COLLECTION_METHOD_IDS.indexOf(current);
  const nextIndex = (index + direction + COLLECTION_METHOD_IDS.length) % COLLECTION_METHOD_IDS.length;
  return COLLECTION_METHOD_IDS[nextIndex];
}

function collectionMethodName(toolId) {
  return getInventoryItem(toolId)?.name || threeTools.find(tool => tool.id === toolId)?.name || 'Bare Hands';
}

function CollectionMethodIcon({ toolId, active = false, compact = false, onSelect = null }) {
  const item = getInventoryItem(toolId);
  const Icon = TOOL_ICONS[toolId];
  const label = item?.name || collectionMethodName(toolId);
  const sizeClass = compact ? 'h-6 w-6' : 'h-7 w-7';
  const iconClass = compact ? 'h-4 w-4' : 'h-[18px] w-[18px]';
  const className = `${sizeClass} inline-flex shrink-0 items-center justify-center rounded-[5px] border transition ${
    active
      ? 'border-expedition-goldbright/80 bg-expedition-gold/18 text-expedition-goldbright shadow-[0_0_14px_rgba(227,197,133,0.18),inset_0_0_0_1px_rgba(227,197,133,0.12)]'
      : 'border-expedition-brass/40 bg-black/18 text-expedition-parchment/78 hover:border-expedition-gold/70 hover:bg-expedition-gold/10 hover:text-expedition-goldbright'
  }`;
  const content = item?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image}
      alt=""
      draggable={false}
      className={`${compact ? 'h-5 w-5' : 'h-[22px] w-[22px]'} object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]`}
    />
  ) : Icon ? (
    <Icon className={iconClass} />
  ) : (
    <span className="text-[13px]">{item?.icon || '?'}</span>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        title={label}
        aria-label={`Use ${label}`}
        onClick={() => onSelect(toolId)}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={label} aria-label={label} className={className}>
      {content}
    </span>
  );
}

// Case buttons glow and shake in the newest specimen's rarity color. Derived
// from the store's lastCased* primitives rather than the inventory array:
// an array-identity subscription here re-rendered the whole HUD tree twice
// per collect. The staleness check keeps a remount from replaying an old
// pulse after the afterglow window has passed.
function useCaseAddedPulse() {
  const lastCasedAt = useThreeGameStore(state => state.lastCasedAt);
  const lastCasedRarityTier = useThreeGameStore(state => state.lastCasedRarityTier);
  return useMemo(() => {
    if (!lastCasedAt || Date.now() - lastCasedAt > CASE_AFTERGLOW_HOLD_MS) return null;
    return { key: lastCasedAt, color: rarityForTier(lastCasedRarityTier).glow };
  }, [lastCasedAt, lastCasedRarityTier]);
}

// How long a case button holds the last specimen's rarity color before fading.
const CASE_AFTERGLOW_HOLD_MS = 20000;

function CasePulseGlow({ pulse, className = 'rounded-sm' }) {
  const [sustained, setSustained] = useState(false);
  useEffect(() => {
    if (!pulse?.key) return undefined;
    setSustained(true);
    const timer = window.setTimeout(() => setSustained(false), CASE_AFTERGLOW_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [pulse?.key]);
  if (!pulse) return null;
  return (
    <>
      <span
        key={pulse.key}
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-px animate-case-pulse motion-reduce:animate-none ${className}`}
        style={{ '--pulse-color': pulse.color }}
      />
      {/* Sustained afterglow: the attention pulse hands off to a steady glow
          in the specimen's rarity color, which lets go a slow fade later. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-px transition-opacity ${className} ${sustained ? 'opacity-100 duration-300' : 'opacity-0 duration-[2500ms]'}`}
        style={{ boxShadow: `0 0 10px 2px ${pulse.color}, inset 0 0 6px ${pulse.color}` }}
      />
    </>
  );
}

// One-shot toast for a species' first close encounter; kept much quieter
// than the collection celebration.
function SpecimenSightingToast() {
  const sighting = useThreeGameStore(state => state.specimenSighting);
  const [rendered, setRendered] = useState(null);
  const [visible, setVisible] = useState(false);
  const seenAtRef = React.useRef(0);

  useEffect(() => {
    if (!sighting?.at || sighting.at === seenAtRef.current) return undefined;
    seenAtRef.current = sighting.at;
    setRendered(sighting);
    setVisible(false);
    playSightingSting(getSpecimenRarity(sighting).id);
    const showTimer = window.setTimeout(() => setVisible(true), 20);
    const hideTimer = window.setTimeout(() => setVisible(false), 3600);
    const clearTimer = window.setTimeout(() => setRendered(null), 3950);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [sighting]);

  if (!rendered) return null;
  const rarity = getSpecimenRarity(rendered);
  return (
    <div className={`pointer-events-none absolute left-1/2 top-[7.2rem] z-20 -translate-x-1/2 font-expedition transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-1.5 opacity-0'}`}>
      <div
        className="flex items-center gap-2.5 rounded-full border bg-[rgba(11,19,35,0.88)] py-1.5 pl-3 pr-4 shadow-[0_12px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(227,197,133,0.14)] backdrop-blur-md"
        style={{ borderColor: rarity.ring }}
      >
        <span className="h-2 w-2 rotate-45 animate-collect-chip motion-reduce:animate-none" style={{ background: rarity.color, boxShadow: `0 0 8px ${rarity.glow}` }} />
        <div className="min-w-0">
          <div className="font-sans text-[8.5px] font-bold uppercase tracking-[0.22em]" style={{ color: rarity.color }}>
            New species sighted
          </div>
          <div className="truncate text-[14px] font-semibold leading-tight text-expedition-parchment">
            {rendered.name}
            {rendered.latin && <span className="ml-1.5 text-[11.5px] font-normal italic text-expedition-faded">{rendered.latin}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayTitleCard() {
  const card = useThreeGameStore(state => state.dayTitleCard);
  const [rendered, setRendered] = useState(null);
  const [visible, setVisible] = useState(false);
  const seenAtRef = React.useRef(0);

  // `card` is the only dependency: an extra dep re-running this effect
  // mid-display would clear the timers in cleanup, early-return on the
  // seenAtRef guard, and leave the card stuck on screen.
  useEffect(() => {
    if (!card?.at || card.at === seenAtRef.current) return undefined;
    seenAtRef.current = card.at;
    setRendered(card);
    setVisible(false);
    const showTimer = window.setTimeout(() => setVisible(true), 60);
    const hideTimer = window.setTimeout(() => setVisible(false), 4200);
    const clearTimer = window.setTimeout(() => setRendered(null), 4900);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [card]);

  if (!rendered) return null;
  const dayWord = ['One', 'Two', 'Three'][rendered.day - 1] || String(rendered.day);
  return (
    // z-50 with its own cinematic band: the morning aboard opens with the
    // ship's-duties prompt in the same screen region, and a bare text card
    // disappeared behind that opaque panel.
    <div data-testid="day-title-card" className={`pointer-events-none absolute left-1/2 top-[24%] z-50 w-full -translate-x-1/2 text-center font-expedition transition-all duration-700 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
      <div className="bg-[linear-gradient(90deg,transparent,rgba(5,10,20,0.82)_18%,rgba(5,10,20,0.82)_82%,transparent)] py-5">
        <div className="mx-auto mb-3 h-px w-24 bg-gradient-to-r from-transparent via-expedition-goldbright/70 to-transparent" />
        <div className="font-sans text-[11px] font-bold uppercase tracking-[0.3em] text-expedition-goldbright [text-shadow:0_2px_14px_rgba(0,0,0,0.85)]">
          {rendered.finalDay ? 'The last day ashore' : 'The survey continues'}
        </div>
        <div className="mt-1.5 text-[clamp(30px,4vw,44px)] font-normal leading-tight text-[#f4e9d0] [text-shadow:0_3px_22px_rgba(0,0,0,0.9)]">
          Day {dayWord}
        </div>
        {rendered.zoneName && (
          <div className="mt-1 text-[15px] italic text-expedition-parchment/85 [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]">{rendered.zoneName}</div>
        )}
        <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-expedition-goldbright/70 to-transparent" />
      </div>
    </div>
  );
}

function MajorEventToast() {
  const event = useThreeGameStore(state => state.majorEvent);
  if (!event) return null;
  const danger = event.severity === 'danger';
  return (
    <div className="pointer-events-none absolute left-1/2 top-[7.15rem] z-30 w-[min(28rem,calc(100vw-1.25rem))] -translate-x-1/2 font-expedition md:top-[7.7rem]">
      <section
        aria-live="assertive"
        className={`overflow-hidden rounded-[7px] border text-expedition-parchment shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md ${
          danger
            ? 'border-rose-200/45 bg-[rgba(45,18,24,0.9)]'
            : 'border-expedition-gold/45 bg-[rgba(12,20,38,0.9)]'
        }`}
      >
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-expedition-gold/50 to-transparent" />
        <div className="grid grid-cols-[auto_1fr] gap-3 px-3.5 py-3">
          <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border ${danger ? 'border-rose-200/50 bg-rose-200/12 text-rose-100' : 'border-expedition-gold/55 bg-expedition-gold/12 text-expedition-goldbright'}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4 L21 20 H3 Z" />
              <path d="M12 9 V13.4" />
              <path d="M12 17 H12.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[15.5px] font-semibold leading-tight tracking-wide text-expedition-parchment">{event.title}</div>
            {event.body && <div className="mt-1 text-[13px] leading-snug text-expedition-parchment/88">{event.body}</div>}
            {event.helper && <div className="mt-1.5 text-[11.5px] leading-snug text-expedition-faded">{event.helper}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function SpecimenInteractionCard({
  specimen,
  examined,
  fieldAction,
  activeToolId,
  setActiveTool,
  collectNearby,
  openExamine,
  visible,
  hint = null,
}) {
  const methodId = currentCollectionMethodId(activeToolId);
  const methodName = collectionMethodName(methodId);
  const otherMethods = COLLECTION_METHOD_IDS.filter(id => id !== methodId);
  // Mirrors resolveFieldAction: an equipped tool collects an unstudied
  // species outright, so the card must offer Collect in that state too.
  const canCollect = examined || (COLLECTION_METHOD_SET.has(activeToolId) && activeToolId !== 'hands');

  const selectMethod = useCallback(toolId => {
    if (COLLECTION_METHOD_SET.has(toolId)) setActiveTool(toolId);
  }, [setActiveTool]);

  const cycleMethod = useCallback((direction = 1) => {
    setActiveTool(nextCollectionMethodId(activeToolId, direction));
  }, [activeToolId, setActiveTool]);

  const collectWithCurrentMethod = useCallback(() => {
    if (!COLLECTION_METHOD_SET.has(activeToolId)) setActiveTool(methodId);
    collectNearby();
  }, [activeToolId, collectNearby, methodId, setActiveTool]);

  useEffect(() => {
    if (visible && examined && !COLLECTION_METHOD_SET.has(activeToolId)) {
      setActiveTool('hands');
    }
  }, [activeToolId, examined, setActiveTool, visible]);

  useEffect(() => {
    if (!visible || !canCollect) return undefined;
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key !== 'Tab') return;
      if (isGameplayInputBlocked()) return;
      event.preventDefault();
      event.stopPropagation();
      cycleMethod(event.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canCollect, cycleMethod, visible]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-[56%] w-[23rem] max-w-[calc(100vw-1.25rem)] -translate-x-1/2 -translate-y-1/2 font-expedition sm:left-[calc(50%+6rem)] sm:top-[64%]">
      <section
        className={`pointer-events-auto overflow-hidden rounded-[7px] border border-expedition-gold/30 bg-[rgba(12,20,38,0.86)] text-expedition-parchment shadow-[0_16px_40px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(227,197,133,0.12)] backdrop-blur-md transition-[opacity,transform,filter] duration-[220ms] ease-out ${
          visible ? 'translate-y-0 scale-100 opacity-100 blur-0' : 'pointer-events-none translate-y-2 scale-[0.975] opacity-0 blur-[1px]'
        }`}
      >
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-expedition-gold/45 to-transparent" />
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-[15.5px] font-semibold leading-tight tracking-wide text-expedition-parchment">
                {specimen.name}
              </div>
              <RarityBadge specimen={specimen} />
            </div>
            {canCollect ? (
              <button
                type="button"
                onClick={collectWithCurrentMethod}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] px-1.5 py-1 text-left transition hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
              >
                <PromptKey active>Enter</PromptKey>
                <span className="text-[14px] font-semibold leading-none text-expedition-parchment">Collect</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fieldAction?.kind === 'observe'
                  ? openExamine(specimen.instanceId || specimen.id)
                  : pulseTouchControl('fieldAction')}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] px-1.5 py-1 text-left transition hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/70"
              >
                <PromptKey active>Enter</PromptKey>
                <span className="text-[14px] font-semibold leading-none text-expedition-parchment">
                  {fieldAction?.shortLabel || 'Examine'}
                </span>
              </button>
            )}
          </div>

          {canCollect && (
            <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-expedition-brass/25 pt-2">
              <button
                type="button"
                onClick={() => cycleMethod(1)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-transparent py-0.5 pr-1 text-[11.5px] leading-none text-expedition-faded transition hover:border-expedition-brass/35 hover:bg-black/14 hover:text-expedition-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60"
              >
                <PromptKey>Tab</PromptKey>
                <span>Method</span>
              </button>

              <button
                type="button"
                onClick={() => cycleMethod(1)}
                className="flex min-w-0 items-center gap-1.5 rounded-[6px] border border-expedition-brass/35 bg-black/20 p-0.5 pr-1.5 text-left transition hover:border-expedition-gold/65 hover:bg-expedition-gold/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-gold/60"
              >
                <CollectionMethodIcon toolId={methodId} active />
                <span className="min-w-0 truncate text-[12.5px] font-semibold leading-none text-expedition-parchment">{methodName}</span>
              </button>

              <div className="flex min-w-0 items-center gap-1 opacity-60 transition hover:opacity-100">
                {otherMethods.map(toolId => (
                  <CollectionMethodIcon
                    key={toolId}
                    toolId={toolId}
                    compact
                    onSelect={selectMethod}
                  />
                ))}
              </div>
            </div>
          )}
          {hint && (
            <div className="mt-1.5 text-center text-[10px] leading-snug text-expedition-faded/85">{hint}</div>
          )}
        </div>
      </section>
    </div>
  );
}

function InteractionPrompt() {
  const nearbySpecimenId = useThreeGameStore(state => state.nearbySpecimenId);
  const nearbyNpcEncounter = useThreeGameStore(state => state.nearbyNpcEncounter);
  const openNpcEncounter = useThreeGameStore(state => state.openNpcEncounter);
  const edgePrompt = useThreeGameStore(state => state.edgePrompt);
  const contextPrompt = useThreeGameStore(state => state.contextPrompt);
  const acknowledgeContextPrompt = useThreeGameStore(state => state.acknowledgeContextPrompt);
  const carryPrompt = useThreeGameStore(state => state.carryPrompt);
  const interiorPrompt = useThreeGameStore(state => state.interiorPrompt);
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const collectNearby = useThreeGameStore(state => state.collectNearby);
  const openExamine = useThreeGameStore(state => state.openExamine);
  const examinedTypeIds = useThreeGameStore(state => state.examinedTypeIds);
  const seenHints = useThreeGameStore(state => state.seenHints);
  const markHintSeen = useThreeGameStore(state => state.markHintSeen);
  const fieldAction = useThreeGameStore(state => state.fieldAction);
  const observationMode = useThreeGameStore(state => state.observationMode);
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const lastOutcome = useThreeGameStore(state => state.lastOutcome);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const nearby = useMemo(() => (
    getThreeSpecimens(currentZoneId).find(specimen => {
      const actorId = specimen.instanceId || specimen.id;
      return !collectedSpecimenActorIds?.includes(actorId)
        && (actorId === nearbySpecimenId || specimen.id === nearbySpecimenId);
    }) || null
  ), [collectedSpecimenActorIds, currentZoneId, nearbySpecimenId]);
  const npcContextCandidate = useMemo(() => nearbyNpcEncounter ? ({
    id: `npc:${nearbyNpcEncounter.npcId}`,
    label: `Speak with ${nearbyNpcEncounter.name}`,
    keyLabel: 'E',
    hintId: seenHints.includes(HINT_NPC) ? null : HINT_NPC,
    priority: CONTEXT_PROMPT_PRIORITY.npc,
    dwellMs: 140,
    repeatCooldownMs: 650,
  }) : null, [nearbyNpcEncounter, seenHints]);
  const interiorContextCandidate = useMemo(() => interiorPrompt ? ({
    id: `interior:${interiorPrompt.id || interiorPrompt.mode || interiorPrompt.text}`,
    label: promptActionText(interiorPrompt.text),
    keyLabel: 'E',
    priority: CONTEXT_PROMPT_PRIORITY.interior,
    dwellMs: 140,
    repeatCooldownMs: 650,
  }) : null, [interiorPrompt]);
  const carryContextCandidate = useMemo(() => carryPrompt ? ({
    id: `carry:${carryPrompt.id || carryPrompt.mode || carryPrompt.text}`,
    label: promptActionText(carryPrompt.text),
    keyLabel: 'E',
    hintId: seenHints.includes(HINT_TAKE) ? null : HINT_TAKE,
    priority: CONTEXT_PROMPT_PRIORITY.carry,
    dwellMs: 120,
    repeatCooldownMs: 500,
  }) : null, [carryPrompt, seenHints]);
  // Ambient subjects (an unmarked croton, a basalt block, a fallen pad) get a
  // prompt only until their kind has been examined once. That teaches the
  // Enter verb on whatever the player happens to walk past, then goes quiet
  // instead of ringing every shrub on the island.
  const fieldContextCandidate = useMemo(() => {
    if (observationMode || nearby || !fieldAction) return null;
    const ambient = ['ecology', 'obstacle', 'prop'].includes(fieldAction.target?.kind);
    const known = Boolean(fieldAction.target?.typeId
      && examinedTypeIds.includes(fieldAction.target.typeId));
    if (fieldAction.kind === 'observe' && ambient && known) return null;
    return {
      id: fieldAction.id,
      label: fieldAction.label,
      keyLabel: 'Enter',
      hintId: fieldAction.kind === 'observe' && !seenHints.includes(HINT_STUDY) ? HINT_STUDY : null,
      priority: fieldAction.kind === 'observe'
        ? CONTEXT_PROMPT_PRIORITY.fieldObserve
        : CONTEXT_PROMPT_PRIORITY.fieldTool,
      dwellMs: fieldAction.kind === 'observe' ? 210 : 130,
      repeatCooldownMs: 650,
    };
  }, [examinedTypeIds, fieldAction, nearby, observationMode, seenHints]);
  useContextPromptCandidate('npc', npcContextCandidate);
  useContextPromptCandidate('interior', interiorContextCandidate);
  useContextPromptCandidate('carry', carryContextCandidate);
  useContextPromptCandidate('field', fieldContextCandidate);
  // Offered once, at the moment it lands: the player is standing over an
  // examined specimen, has been collecting steadily, and has never used the
  // sketchbook — the point of the documented-vs-collected distinction.
  const collectedSpecimenIds = useThreeGameStore(state => state.collectedSpecimenIds);
  const documentedSpecimenIds = useThreeGameStore(state => state.documentedSpecimenIds);
  const showSketchHint = Boolean(nearby)
    && examinedTypeIds.includes(nearby?.id)
    && !seenHints.includes(HINT_SKETCH)
    && (collectedSpecimenIds?.length || 0) >= 2
    && (documentedSpecimenIds?.length || 0) === 0;
  // The very first specimen the player stands over teaches the loop's first
  // verb; after one examination it never appears again.
  const showExamineHint = Boolean(nearby)
    && !examinedTypeIds.includes(nearby?.id)
    && (examinedTypeIds?.length || 0) === 0
    && !seenHints.includes(HINT_EXAMINE);
  const specimenCardHintId = showExamineHint ? HINT_EXAMINE : showSketchHint ? HINT_SKETCH : null;
  useEffect(() => {
    if (!specimenCardHintId) return undefined;
    const timer = window.setTimeout(() => markHintSeen(specimenCardHintId), 1600);
    return () => window.clearTimeout(timer);
  }, [markHintSeen, specimenCardHintId]);
  const [renderedSpecimen, setRenderedSpecimen] = useState(null);
  const [specimenPromptVisible, setSpecimenPromptVisible] = useState(false);
  const [renderedContextPrompt, setRenderedContextPrompt] = useState(null);
  const [contextPromptVisible, setContextPromptVisible] = useState(false);
  const [outcomeToast, setOutcomeToast] = useState(null);
  const seenOutcomeRef = React.useRef(lastOutcome);
  const outcomeTimersRef = React.useRef([]);

  const clearOutcomeTimers = useCallback(() => {
    outcomeTimersRef.current.forEach(timer => window.clearTimeout(timer));
    outcomeTimersRef.current = [];
  }, []);

  const dismissOutcomeToast = useCallback(() => {
    clearOutcomeTimers();
    setOutcomeToast(current => current ? { ...current, visible: false } : current);
    outcomeTimersRef.current.push(window.setTimeout(() => setOutcomeToast(null), RESULT_TOAST_EXIT_MS));
  }, [clearOutcomeTimers]);

  useEffect(() => () => clearOutcomeTimers(), [clearOutcomeTimers]);

  useEffect(() => {
    if (!lastOutcome || lastOutcome === seenOutcomeRef.current) {
      seenOutcomeRef.current = lastOutcome;
      return undefined;
    }
    seenOutcomeRef.current = lastOutcome;
    clearOutcomeTimers();
    const id = `${lastOutcome.specimen?.id || 'specimen'}:${lastOutcome.tool?.id || 'tool'}:${Date.now()}`;
    const visibleMs = celebrationVisibleMs(lastOutcome);
    setOutcomeToast({ id, outcome: lastOutcome, visible: false });
    outcomeTimersRef.current.push(window.setTimeout(() => {
      setOutcomeToast(current => current?.id === id ? { ...current, visible: true } : current);
    }, 20));
    outcomeTimersRef.current.push(window.setTimeout(() => {
      setOutcomeToast(current => current?.id === id ? { ...current, visible: false } : current);
    }, visibleMs));
    outcomeTimersRef.current.push(window.setTimeout(() => {
      setOutcomeToast(current => current?.id === id ? null : current);
    }, visibleMs + RESULT_TOAST_EXIT_MS));
    return undefined;
  }, [clearOutcomeTimers, lastOutcome]);

  useEffect(() => {
    let timer = 0;
    if (nearby && !outcomeToast) {
      setRenderedSpecimen(nearby);
      setSpecimenPromptVisible(false);
      timer = window.setTimeout(() => setSpecimenPromptVisible(true), 20);
    } else {
      setSpecimenPromptVisible(false);
      timer = window.setTimeout(() => setRenderedSpecimen(null), PROMPT_EXIT_MS);
    }
    return () => window.clearTimeout(timer);
  }, [nearby, outcomeToast]);

  useEffect(() => {
    let timer = 0;
    let hintTimer = 0;
    if (contextPrompt) {
      setRenderedContextPrompt(contextPrompt);
      setContextPromptVisible(false);
      // Marked on display, not on use — but only after the prompt has held
      // the screen long enough to be read. A one-frame flash during a
      // walk-by used to burn the hint permanently.
      if (contextPrompt.hintId) {
        hintTimer = window.setTimeout(() => markHintSeen(contextPrompt.hintId), 1400);
      }
      timer = window.setTimeout(() => setContextPromptVisible(true), 20);
    } else {
      setContextPromptVisible(false);
      timer = window.setTimeout(() => setRenderedContextPrompt(null), PROMPT_EXIT_MS);
    }
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hintTimer);
    };
  }, [contextPrompt, markHintSeen]);

  if (outcomeToast) {
    return <CollectionCelebration toast={outcomeToast} onClose={dismissOutcomeToast} />;
  }

  if (renderedContextPrompt && renderedContextPrompt.source !== 'traversal') {
    const onClick = renderedContextPrompt.source === 'npc'
      ? () => {
          acknowledgeContextPrompt('npc');
          openNpcEncounter?.(nearbyNpcEncounter?.npcId);
        }
      : renderedContextPrompt.source === 'field'
        ? () => pulseTouchControl('fieldAction')
        : null;
    return (
      <CompactPrompt visible={contextPromptVisible} testId="context-action-prompt">
        <CompactAction keyLabel={renderedContextPrompt.keyLabel} primary onClick={onClick}>
          {renderedContextPrompt.label}
        </CompactAction>
        {HINT_TEXT[renderedContextPrompt.hintId] && renderedContextPrompt.hintId !== HINT_STUDY && (
          <span className="w-full px-1 pb-0.5 text-center text-[10px] leading-snug text-expedition-faded/85">
            {HINT_TEXT[renderedContextPrompt.hintId]}
          </span>
        )}
      </CompactPrompt>
    );
  }
  if (!nearby && !renderedSpecimen && edgePrompt) {
    if (edgePrompt.visible === false) return null;
    const isOpen = edgePrompt.kind === 'open';
    if (isOpen && edgePrompt.toRegionId) {
      if (edgePrompt.localTransition) {
        const toZone = getZone(edgePrompt.toRegionId);
        return (
          <PromptCard title={edgePrompt.label || toZone.name} subtitle={edgePrompt.description}>
            <PromptAction
              keyLabel="E"
              primary
              onClick={() => beginZoneTransition(edgePrompt.toRegionId, {
                entryEdge: edgePrompt.entryEdge || null,
                note: edgePrompt.description,
                mode: 'threshold',
                localTransition: true,
              })}
            >
              Enter
            </PromptAction>
          </PromptCard>
        );
      }
      const toZone = getZone(edgePrompt.toRegionId);
      return (
        <RouteEdgeBanner
          edgePrompt={edgePrompt}
          toZone={toZone}
          onTravel={() => beginZoneTransition(edgePrompt.toRegionId, {
            entryEdge: ROUTE_ENTRY_EDGES[edgePrompt.edge] || null,
            note: routePlaceCopy(toZone, edgePrompt),
            source: 'edge',
            mode: 'island',
          })}
        />
      );
    }
    return (
      <PromptCard title={edgePrompt.label} subtitle={edgePrompt.message || edgePrompt.description}>
        {isOpen && (
          <PromptAction
            keyLabel="E"
            primary
            // Without a handler this read as a button on touch and did
            // nothing — the only way through was the E key.
            onClick={() => beginZoneTransition(edgePrompt.toRegionId, {
              entryEdge: ROUTE_ENTRY_EDGES[edgePrompt.edge] || null,
              note: routePlaceCopy(getZone(edgePrompt.toRegionId), edgePrompt),
              source: 'edge',
              mode: 'island',
            })}
          >
            Travel
          </PromptAction>
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
  if (!nearby && !renderedSpecimen && renderedContextPrompt?.source === 'traversal') {
    return (
      <CompactPrompt visible={contextPromptVisible} testId="context-action-prompt">
        <CompactAction
          keyLabel={renderedContextPrompt.keyLabel || 'V'}
          primary
          // One-shot: consumeTouchControls clears `climb` each frame after
          // playerInputState reads it.
          onClick={() => setTouchControl('climb', true)}
        >
          {renderedContextPrompt.label || 'Climb'}
        </CompactAction>
      </CompactPrompt>
    );
  }
  if (!nearby && !renderedSpecimen) return null;

  const displayedSpecimen = renderedSpecimen || nearby;
  if (!displayedSpecimen) return null;
  const examined = examinedTypeIds.includes(displayedSpecimen.id);
  return (
    <SpecimenInteractionCard
      specimen={displayedSpecimen}
      examined={examined}
      fieldAction={fieldAction?.target?.kind === 'specimen' ? fieldAction : null}
      activeToolId={activeToolId}
      setActiveTool={setActiveTool}
      collectNearby={collectNearby}
      openExamine={openExamine}
      visible={specimenPromptVisible}
      hint={specimenCardHintId ? HINT_TEXT[specimenCardHintId] : null}
    />
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
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const openStatusView = useThreeGameStore(state => state.openStatusView);
  const playableMode = getPlayableMode(playableModeId);
  const animalMode = playableMode.kind === 'animal';
  const statusTitle = animalMode ? `View ${playableMode.label.toLowerCase()} status` : 'View Darwin\'s status';
  const energy = Math.max(0, Math.min(100, 100 - fatigue));

  return (
    <button
      type="button"
      onClick={openStatusView}
      title={statusTitle}
      aria-label={statusTitle}
      className="pointer-events-auto absolute z-20 w-[13.6rem] rounded-[7px] border border-expedition-brass/80 bg-[linear-gradient(165deg,rgba(18,28,36,0.78),rgba(9,15,22,0.82))] px-3 py-2.5 text-left font-expedition text-expedition-parchment shadow-[0_10px_28px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md transition active:scale-[0.99] finepointer:hidden"
      style={{
        left: 'max(0.9rem, env(safe-area-inset-left))',
        top: 'calc(env(safe-area-inset-top) + 0.85rem)',
      }}
    >
      <div className="pointer-events-none absolute inset-[3px] rounded-[4px] border border-expedition-gold/20" />
      {/* NOT vitalsGradient(): this variant's bright stops (#98c98f, #e7b457)
          are a shade off the shared gauge colours. Left verbatim rather than
          silently unified — if the difference is unintentional, switch these
          two to vitalsGradient('health') / vitalsGradient('fatigue'). */}
      <div className="relative grid gap-2">
        <StatBar icon={HeartIcon} label={animalMode ? 'Vitality' : 'Health'} value={health} fill="linear-gradient(90deg,#5f9e6a,#98c98f)" />
        <StatBar icon={FatigueIcon} label={animalMode ? 'Energy' : 'Fatigue'} value={animalMode ? energy : fatigue} fill="linear-gradient(90deg,#c28b35,#e7b457)" />
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
      className="pointer-events-auto absolute z-20 flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full border border-expedition-gold/85 bg-[radial-gradient(circle_at_40%_32%,rgba(42,56,63,0.92),rgba(7,12,18,0.94))] text-expedition-gold shadow-[0_10px_28px_rgba(0,0,0,0.38),inset_0_0_0_4px_rgba(201,163,95,0.13),inset_0_0_0_8px_rgba(0,0,0,0.22)] backdrop-blur-md transition active:scale-95 finepointer:hidden"
      style={{
        right: 'max(1rem, env(safe-area-inset-right))',
        top: 'calc(env(safe-area-inset-top) + 0.9rem)',
      }}
    >
      <MapIcon className="h-8 w-8" />
    </button>
  );
}

// Deflection below the deadzone is ignored; between deadzone and the run
// threshold Darwin walks (speed scaled by deflection via touch.moveX/moveY);
// pushing the stick to its outer band holds run.
const JOYSTICK_RADIUS = 38;
const JOYSTICK_DEADZONE = 0.16;
const JOYSTICK_RUN_THRESHOLD = 0.85;

function MobileJoystick() {
  const baseRef = React.useRef(null);
  const pointerRef = React.useRef(null);
  const lastRef = React.useRef({ forward: false, backward: false, left: false, right: false, run: false, moveX: 0, moveY: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const publishControls = useCallback(next => {
    const previous = lastRef.current;
    ['forward', 'backward', 'left', 'right', 'run', 'moveX', 'moveY'].forEach(control => {
      if (previous[control] !== next[control]) setTouchControl(control, next[control]);
    });
    lastRef.current = next;
  }, []);

  const clearControls = useCallback(() => {
    publishControls({ forward: false, backward: false, left: false, right: false, run: false, moveX: 0, moveY: 0 });
  }, [publishControls]);

  const updateFromPointer = useCallback(event => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rawX = event.clientX - cx;
    const rawY = event.clientY - cy;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const nx = x / JOYSTICK_RADIUS;
    const ny = y / JOYSTICK_RADIUS;
    const magnitude = Math.min(1, Math.hypot(nx, ny));
    const inDeadzone = magnitude < JOYSTICK_DEADZONE;
    const threshold = 0.34;
    setKnob({ x, y, active: true });
    publishControls({
      // Direction booleans stay published for consumers that read them
      // directly (flight steer/climb); ground movement uses the analog pair.
      forward: !inDeadzone && ny < -threshold,
      backward: !inDeadzone && ny > threshold,
      left: !inDeadzone && nx < -threshold,
      right: !inDeadzone && nx > threshold,
      run: magnitude >= JOYSTICK_RUN_THRESHOLD,
      moveX: inDeadzone ? 0 : nx,
      moveY: inDeadzone ? 0 : ny,
    });
  }, [publishControls]);

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
    clearControls();
  };

  useEffect(() => clearControls, [clearControls]);

  return (
    <div
      ref={baseRef}
      role="application"
      aria-label="Move Darwin"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      className="pointer-events-auto absolute z-20 h-[7.4rem] w-[7.4rem] touch-none select-none rounded-full border border-expedition-gold/70 bg-[radial-gradient(circle,rgba(232,206,139,0.10)_0_31%,rgba(5,10,14,0.38)_32%_56%,rgba(9,14,18,0.64)_57%_100%)] shadow-[0_12px_30px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(227,197,133,0.17)] backdrop-blur-[2px] finepointer:hidden"
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
  const fieldAction = useThreeGameStore(state => state.fieldAction);
  const observationMode = useThreeGameStore(state => state.observationMode);
  const toggleObservationMode = useThreeGameStore(state => state.toggleObservationMode);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const playableMode = getPlayableMode(playableModeId);
  const nearby = getThreeSpecimens(currentZoneId).find(specimen => (
    !collectedSpecimenActorIds?.includes(specimen.instanceId || specimen.id)
    && ((specimen.instanceId || specimen.id) === nearbySpecimenId || specimen.id === nearbySpecimenId)
  ));

  if (playableMode.kind === 'animal') {
    const actions = ['eat', 'sleep', 'defecate'].map(getAnimalAction).filter(Boolean);
    const canFly = playableMode.abilities?.includes('fly');
    return (
      <div
        className="pointer-events-none absolute z-20 h-[10.2rem] w-[13.4rem] finepointer:hidden"
        style={{
          right: 'max(0.95rem, env(safe-area-inset-right))',
          bottom: 'calc(env(safe-area-inset-bottom) + 6.2rem)',
        }}
      >
        {canFly && (
          <MobileActionButton
            label="Fly"
            size="small"
            holdControl="jump"
            className="right-0 top-0"
            icon={(
              <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 12.5 C8.3 6.6 12.2 5.2 19.5 5.8 C16.7 8.8 12.8 11.5 5.4 14" />
                <path d="M6 15 C10.6 14.8 14.4 16 18.5 19" />
              </svg>
            )}
          />
        )}
        {actions.map((action, index) => (
          <MobileActionButton
            key={action.id}
            label={action.name}
            size="small"
            onPress={() => triggerToolUse(action.id)}
            className={index === 0 ? 'bottom-3 left-0' : index === 1 ? 'bottom-7 left-[4.65rem]' : 'bottom-3 right-0'}
            icon={<AnimalActionIcon actionId={action.id} playableModeId={playableModeId} className="h-full w-full" />}
          />
        ))}
      </div>
    );
  }

  // Shotgun cluster: Aim toggles ADS (drag on the screen pans the camera
  // while aiming), Fire pulls the trigger, Collect gathers a downed specimen.
  if (activeToolId === 'shotgun') {
    return (
      <div
        className="pointer-events-none absolute z-20 h-[12.4rem] w-[13.4rem] finepointer:hidden"
        style={{
          right: 'max(0.95rem, env(safe-area-inset-right))',
          bottom: 'calc(env(safe-area-inset-bottom) + 6.2rem)',
        }}
      >
        <MobileActionButton
          label="Aim"
          size="small"
          onPress={() => pulseTouchControl('rifle')}
          className="left-0 top-0"
          icon={(
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="6.2" />
              <path d="M12 2.6 V6 M12 18 V21.4 M2.6 12 H6 M18 12 H21.4" />
              <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          )}
        />
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
          size="small"
          onPress={() => { if (nearby) collectNearby(); }}
          className="bottom-0 left-0"
          icon={<ButterflyIcon className="h-full w-full" />}
        />
        <MobileActionButton
          label="Fire"
          onPress={() => pulseTouchControl('fireRifle')}
          className="bottom-2 right-0"
          icon={(
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3.2 L13.4 8.2 L18.8 5.2 L15.8 10.6 L20.8 12 L15.8 13.4 L18.8 18.8 L13.4 15.8 L12 20.8 L10.6 15.8 L5.2 18.8 L8.2 13.4 L3.2 12 L8.2 10.6 L5.2 5.2 L10.6 8.2 Z" />
            </svg>
          )}
        />
      </div>
    );
  }

  const activeTool = getToolbarItem(activeToolId);
  const ActiveToolIcon = TOOL_ICONS[activeToolId];
  const primaryLabel = observationMode ? 'Cancel' : (fieldAction?.shortLabel || 'Observe');
  const primaryIcon = fieldAction && fieldAction.kind !== 'observe'
    ? activeTool?.image
      ? <img src={activeTool.image} alt="" className="h-full w-full object-contain" draggable={false} />
      : ActiveToolIcon
        ? <ActiveToolIcon className="h-full w-full" />
        : <LensIcon className="h-full w-full" />
    : <LensIcon className="h-full w-full" />;
  const performPrimaryAction = () => {
    if (observationMode) toggleObservationMode();
    else pulseTouchControl('fieldAction');
  };

  return (
    <div
      className="pointer-events-none absolute z-20 h-[10.2rem] w-[10.4rem] finepointer:hidden"
      style={{
        right: 'max(0.95rem, env(safe-area-inset-right))',
        bottom: 'calc(env(safe-area-inset-bottom) + 6.2rem)',
      }}
    >
      <MobileActionButton
        label={playableMode.abilities?.includes('fly') ? 'Fly' : 'Jump'}
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
        label={primaryLabel}
        onPress={performPrimaryAction}
        className="bottom-8 left-0"
        icon={primaryIcon}
      />
      {fieldAction && fieldAction.kind !== 'observe' && !observationMode && (
        <MobileActionButton
          label="Observe"
          size="small"
          onPress={toggleObservationMode}
          className="bottom-0 right-0"
          icon={<LensIcon className="h-full w-full" />}
        />
      )}
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

function PauseIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 6h14M5 12h14M5 18h14" />
    </svg>
  );
}

function MobileBottomNav({ onOpenJournal, onOpenLibrary, onToggleNarrative, onOpenCasebook, onOpenInventory, onOpenPause, narrativeOpen }) {
  const casePulse = useCaseAddedPulse();
  const items = [
    { id: 'journal', label: 'Journal', icon: <OpenBookIcon className="h-6 w-6" />, onClick: onOpenJournal },
    { id: 'library', label: 'Library', icon: <span className="grid h-6 w-6 place-items-center text-[11px] font-semibold">LIB</span>, onClick: onOpenLibrary },
    { id: 'narrative', label: 'Narrative', icon: <NoteIcon className="h-6 w-6" />, onClick: onToggleNarrative, active: narrativeOpen },
    { id: 'casebook', label: 'Casebook', icon: <ButterflyIcon className="h-6 w-6" />, onClick: onOpenCasebook, pulse: true },
    { id: 'inventory', label: 'Inventory', icon: <KitIcon className="h-6 w-6" />, onClick: onOpenInventory },
    // Mobile's only route to settings, controls and ending the expedition.
    { id: 'menu', label: 'Menu', icon: <PauseIcon className="h-6 w-6" />, onClick: onOpenPause },
  ];

  return (
    <nav
      aria-label="Mobile expedition navigation"
      className="pointer-events-auto absolute z-20 rounded-[7px] border border-expedition-gold/75 bg-[linear-gradient(180deg,rgba(12,20,27,0.88),rgba(5,10,16,0.94))] px-2 py-1.5 font-expedition text-expedition-gold shadow-[0_10px_30px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(227,197,133,0.16)] backdrop-blur-md finepointer:hidden"
      style={{
        left: 'max(1rem, env(safe-area-inset-left))',
        right: 'max(1rem, env(safe-area-inset-right))',
        bottom: 'calc(env(safe-area-inset-bottom) + 0.8rem)',
      }}
    >
      <div className="grid grid-cols-6">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 border-expedition-brass/45 px-0.5 py-1.5 transition active:scale-95 ${index > 0 ? 'border-l' : ''} ${item.active ? 'text-expedition-goldbright' : 'text-expedition-gold'}`}
          >
            {item.pulse && <CasePulseGlow pulse={casePulse} className="rounded-[5px]" />}
            <span key={item.pulse && casePulse ? `shake-${casePulse.key}` : `icon-${item.id}`} className={item.pulse && casePulse ? 'animate-case-shake motion-reduce:animate-none' : ''}>
              {item.icon}
            </span>
            <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.06em]">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-[3px] rounded-[4px] border border-expedition-gold/18" />
    </nav>
  );
}

function MobileNarrativeDrawer({ open, onClose, lockedOpen = false }) {
  if (!open) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-3 z-30 finepointer:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.8rem)' }}
    >
      {!lockedOpen && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close narrative"
          className="pointer-events-auto absolute -top-3 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-expedition-brass/70 bg-expedition-ink/90 text-expedition-gold shadow-lg"
        >
          ×
        </button>
      )}
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

// Staggered reveal of the interface after the landing.
//
// The first stage used to land at 650ms, which is not long enough to register
// as anything but "the HUD is already there". Holding the first panel until
// two seconds gives the player a beat of unobstructed vista — the ship, the
// bay, the shoreline — before four chrome panels claim the corners, so the
// landing reads as arriving somewhere rather than opening a screen.
//
// Nothing input-critical waits on this: the stages drive opacity only (the
// elements stay mounted), and the completion callback gates telemetry, the
// audio start and the resumption of heavy background work. Letting those last
// two land a second later is a bonus rather than a cost, since it keeps the
// first seconds after load quieter. Reduced-motion users still skip straight
// to the finished state.
const HUD_ENTRANCE_TIMINGS_MS = Object.freeze([2000, 2500, 2950, 3400]);
const HUD_ENTRANCE_TRANSITION_MS = 700;

export function ThreeHUD({
  onRestartExpedition,
  onReturnToMainMenu,
  audioEnabled = true,
  onAudioEnabledChange,
  quality = 'auto',
  onQualityChange,
  openJournalOnLaunch = false,
  entranceActive = true,
  onEntranceStageChange = null,
  onEntranceComplete = null,
}) {
  const [hudHidden, setHudHidden] = useState(false);
  const [endGameConfirmationOpen, setEndGameConfirmationOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hudEntranceStage, setHudEntranceStage] = useState(0);
  // CSS `hidden` does not unmount React. The old responsive layout kept both
  // the compact minimap and the field-rail minimap subscribed and rendering at
  // every desktop width. Mount exactly the one the current breakpoint uses.
  const compactDesktopMapMounted = useMediaQuery('(min-width: 768px) and (max-width: 1279px)');
  const wideFieldRailMounted = useMediaQuery('(min-width: 1280px)');
  const hudRootRef = useRef(null);
  const entranceCompleteReportedRef = useRef(false);
  // Load → "Read journal" resumes the saved session with the notebook open.
  const [panel, setPanel] = useState(openJournalOnLaunch ? 'journal' : null);
  const [mapOpen, setMapOpen] = useState(() => hasDevelopmentQueryFlag('islandMap'));
  const [compassOpen, setCompassOpen] = useState(() => hasDevelopmentQueryFlag('compass'));
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryInitialTab, setInventoryInitialTab] = useState('tools');
  const casePulse = useCaseAddedPulse();
  const [mobileNarrativeOpen, setMobileNarrativeOpen] = useState(false);
  const specimenDetailOpen = useThreeGameStore(state => Boolean(state.specimenDetail));
  const statusViewOpen = useThreeGameStore(state => state.statusViewOpen);
  const examineOpen = useThreeGameStore(state => Boolean(state.examineSession));
  const readableBookOpen = useThreeGameStore(state => Boolean(state.readableBookSession));
  const openLibrary = useThreeGameStore(state => state.openLibrary);
  const beagleTravelPromptOpen = useThreeGameStore(state => Boolean(state.beagleTravelPrompt));
  const npcEncounterOpen = useThreeGameStore(state => Boolean(state.activeNpcEncounter));
  const contextualControlHintId = useThreeGameStore(state => state.contextPrompt?.hintId || null);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const activeConstraint = useThreeGameStore(state => state.activeConstraint);
  const expeditionOutcome = useThreeGameStore(state => state.expeditionOutcome);
  const outcomeOpen = Boolean(expeditionOutcome && expeditionOutcome.phase !== 'recovering');
  const finalAssessment = useThreeGameStore(state => state.finalAssessment);
  const beginFinalAssessment = useThreeGameStore(state => state.beginFinalAssessment);
  const expeditionDeparted = useThreeGameStore(state => state.expeditionDeparted);
  const assessmentOpen = Boolean(finalAssessment);
  const nightlyDebriefOpen = useThreeGameStore(state => Boolean(state.nightlyDebrief));
  const fieldDilemmaOpen = useThreeGameStore(state => Boolean(state.activeConstraint && getFieldDilemma(state.activeConstraint.type)));
  const caseFullOpen = useThreeGameStore(state => Boolean(state.caseFullChoice));
  const caseReleaseMode = useThreeGameStore(state => state.caseReleaseMode);

  // The Beagle sails after the third field day. Whichever way the clock got
  // there — stowing the case aboard, or the night catching Darwin ashore —
  // Henslow's judgment runs without asking.
  useEffect(() => {
    if (expeditionDeparted && !finalAssessment) void beginFinalAssessment();
  }, [expeditionDeparted, finalAssessment, beginFinalAssessment]);

  const blockingUiOpen = Boolean(panel || mapOpen || inventoryOpen || specimenDetailOpen || statusViewOpen || examineOpen || readableBookOpen || beagleTravelPromptOpen || npcEncounterOpen || outcomeOpen || assessmentOpen || nightlyDebriefOpen || fieldDilemmaOpen || caseFullOpen || endGameConfirmationOpen || pauseOpen || controlsOpen);
  const closeEndGameConfirmation = useCallback(() => setEndGameConfirmationOpen(false), []);
  const confirmEndGame = useCallback(() => {
    setEndGameConfirmationOpen(false);
    void beginFinalAssessment();
  }, [beginFinalAssessment]);
  const closePause = useCallback(() => setPauseOpen(false), []);
  const openControlsFromPause = useCallback(() => {
    setPauseOpen(false);
    setControlsOpen(true);
  }, []);
  const requestEndGameFromPause = useCallback(() => {
    setPauseOpen(false);
    setEndGameConfirmationOpen(true);
  }, []);

  // Everything except the pause menu and controls card. The two overlays this
  // effect owns must yield to any other open surface, since each of those
  // handles its own Escape.
  const otherOverlayOpen = Boolean(panel || mapOpen || inventoryOpen || specimenDetailOpen
    || statusViewOpen || examineOpen || readableBookOpen || beagleTravelPromptOpen
    || npcEncounterOpen || outcomeOpen || assessmentOpen || nightlyDebriefOpen
    || fieldDilemmaOpen || caseFullOpen || endGameConfirmationOpen);

  useEffect(() => {
    if (!entranceActive) return undefined;
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // '?' is Shift+/ on most layouts; F1 is the conventional alternative.
      if (event.key === '?' || event.code === 'F1') {
        event.preventDefault();
        setPauseOpen(false);
        setControlsOpen(value => !value);
        return;
      }
      if (event.key !== 'Escape') return;
      if (controlsOpen) return; // its own overlay hook closes it
      if (pauseOpen) {
        event.preventDefault();
        setPauseOpen(false);
        return;
      }
      if (otherOverlayOpen) return; // that surface owns Escape
      event.preventDefault();
      setPauseOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controlsOpen, entranceActive, otherOverlayOpen, pauseOpen]);

  useEffect(() => {
    // Stages 1-3 bypass React entirely: the attribute drives the CSS in
    // globals.css (.hud-stage-gate), because routing each stage through state
    // re-rendered the whole HUD four times during the reveal — measured as
    // ~300-400ms of main-thread block per flip. Only stage 4 becomes state:
    // it gates the interaction prompts' ready/disabled props below.
    const setStageAttribute = stage => {
      hudRootRef.current?.setAttribute('data-entrance-stage', String(stage));
    };
    if (!entranceActive) {
      entranceCompleteReportedRef.current = false;
      setHudEntranceStage(0);
      setStageAttribute(0);
      return undefined;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStageAttribute(4);
      setHudEntranceStage(4);
      return undefined;
    }

    setStageAttribute(0);
    onEntranceStageChange?.(0);
    const handles = HUD_ENTRANCE_TIMINGS_MS.map((delay, index) => (
      window.setTimeout(() => {
        const stage = index + 1;
        setStageAttribute(stage);
        onEntranceStageChange?.(stage);
        if (stage >= 4) setHudEntranceStage(4);
      }, delay)
    ));
    return () => handles.forEach(handle => window.clearTimeout(handle));
  }, [entranceActive, onEntranceStageChange]);

  useEffect(() => {
    if (!entranceActive || hudEntranceStage < 4 || entranceCompleteReportedRef.current) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const completionDelay = !reducedMotion
      ? HUD_ENTRANCE_TRANSITION_MS
      : 0;
    const handle = window.setTimeout(() => {
      entranceCompleteReportedRef.current = true;
      onEntranceComplete?.();
    }, completionDelay);
    return () => window.clearTimeout(handle);
  }, [entranceActive, hudEntranceStage, onEntranceComplete]);

  useEffect(() => {
    const toggleCompass = () => {
      if (entranceActive) setCompassOpen(value => !value);
    };
    window.addEventListener(TOGGLE_COMPASS_EVENT, toggleCompass);
    return () => window.removeEventListener(TOGGLE_COMPASS_EVENT, toggleCompass);
  }, [entranceActive]);

  useEffect(() => {
    if (!entranceActive) return undefined;
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
      emitPropEvent('equipment-foley', {
        kind: inventoryOpen ? 'case-close' : 'case-open',
        position: getRuntimePlayerPose()?.position,
      });
      setInventoryOpen(!inventoryOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entranceActive, inventoryOpen]);
  useEffect(() => {
    if (!entranceActive) return undefined;
    const onKeyDown = event => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code !== 'KeyH') return;
      event.preventDefault();
      event.stopPropagation();
      setHudHidden(value => !value);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [entranceActive]);
  useEffect(() => {
    setBlockingUiMode(blockingUiOpen);
    return () => setBlockingUiMode(false);
  }, [blockingUiOpen]);
  // Only the pause menu stops the expedition clock; the chart, case, and journal
  // deliberately let time keep running.
  useEffect(() => {
    setExpeditionPaused(pauseOpen);
    return () => setExpeditionPaused(false);
  }, [pauseOpen]);
  useEffect(() => {
    if (!assessmentOpen) return;
    setEndGameConfirmationOpen(false);
    setMapOpen(false);
    setInventoryOpen(false);
    setMobileNarrativeOpen(false);
    setPanel(current => current === 'journal' ? current : null);
  }, [assessmentOpen]);

  const activeDirectiveId = useThreeGameStore(state => state.activeDirectiveId);
  // { text, hint, detail } — the shape a directive already has, so a mode
  // objective and the exhausted-list fallback render through the same banner.
  const objective = useMemo(() => {
    const mode = getPlayableMode(playableModeId);
    if (mode.objective) return mode.objective;
    const directive = getDirective(activeDirectiveId);
    if (directive) return directive;
    // Objectives exhausted: the expedition is the player's to shape.
    return {
      text: 'Fill the remaining days as you judge best',
      hint: 'No objective remains. The chart, the case, and the journal stay open.',
      detail: 'You have seen everything the voyage is assessed on. What is left is how you spend the remaining days: more landings, or more care with what you already have.',
    };
  }, [activeDirectiveId, playableModeId]);

  const openInventoryTab = useCallback(tab => {
    setMobileNarrativeOpen(false);
    setInventoryInitialTab(tab);
    if (!inventoryOpen) {
      emitPropEvent('equipment-foley', {
        kind: 'case-open',
        position: getRuntimePlayerPose()?.position,
      });
    }
    setInventoryOpen(true);
  }, [inventoryOpen]);
  useEffect(() => {
    if (caseReleaseMode) openInventoryTab('case');
  }, [caseReleaseMode, openInventoryTab]);
  const closeInventory = useCallback(() => {
    if (inventoryOpen) {
      emitPropEvent('equipment-foley', {
        kind: 'case-close',
        position: getRuntimePlayerPose()?.position,
      });
    }
    setInventoryOpen(false);
  }, [inventoryOpen]);
  const openJournalPanel = useCallback(() => {
    setMobileNarrativeOpen(false);
    setPanel('journal');
  }, []);
  const openMapModal = useCallback(() => {
    setMobileNarrativeOpen(false);
    setMapOpen(true);
  }, []);
  // data-entrance-stage is deliberately NOT rendered by React: the entrance
  // effect writes it imperatively so stage flips cannot re-render this whole
  // tree. See .hud-stage-gate in globals.css.
  return (
    <div
      ref={hudRootRef}
      aria-hidden={entranceActive ? undefined : 'true'}
      className={`pointer-events-none absolute inset-0 z-10 font-expedition transition-opacity duration-200 ${
        entranceActive ? 'visible opacity-100' : 'invisible opacity-0'
      }`}
      data-desktop-hud="polished"
      data-entrance-active={entranceActive ? 'true' : 'false'}
      inert={entranceActive ? undefined : true}
    >
      {/* Regular HUD fades out while a diegetic view (status/examine) owns the screen */}
      <div className={`transition-opacity duration-300 ${statusViewOpen || examineOpen || readableBookOpen || npcEncounterOpen || hudHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <TopChronometer className="hud-stage-gate hud-stage-1" />
      <DirectiveTracker />
      <PolishedTopObjective objective={objective} className="hud-stage-gate hud-stage-1" />

      <MobileVitalsPanel />
      <MobileMapButton onOpenMap={openMapModal} />

      <div className="absolute left-3 top-3 hidden animate-hud-rise motion-reduce:animate-none md:block hud-stage-gate hud-stage-2">
        <PolishedVitalStatusPanel onOpenCase={() => openInventoryTab('case')} />
      </div>

      {compactDesktopMapMounted && (
        <div className="absolute right-3 top-3 animate-hud-rise [animation-delay:150ms] motion-reduce:animate-none hud-stage-gate hud-stage-2">
          <GameplayMinimap onOpenMap={openMapModal} />
        </div>
      )}

      {wideFieldRailMounted && (
        <div className="absolute animate-hud-rise [animation-delay:150ms] motion-reduce:animate-none hud-stage-gate hud-stage-2 bottom-5 right-5 top-5">
          <PolishedFieldRail
            onOpenInventory={() => openInventoryTab('case')}
            onOpenMap={openMapModal}
            onOpenJournal={openJournalPanel}
            onOpenLibrary={() => openLibrary?.({ drawerOpen: true })}
            onRequestEndGame={() => setEndGameConfirmationOpen(true)}
            onOpenPause={() => setPauseOpen(true)}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={onAudioEnabledChange}
            compassOpen={compassOpen}
            onCloseCompass={() => setCompassOpen(false)}
          />
        </div>
      )}

      {compassOpen && (
        <div className="absolute inset-0 z-20 xl:hidden">
          <div className="absolute left-1/2 top-[45%] w-[min(58vw,14rem)] -translate-x-1/2 -translate-y-1/2 md:left-auto md:right-7 md:top-[22.5rem] md:w-[9.5rem] md:translate-x-0 md:translate-y-0">
            <GameplayCompass onClose={() => setCompassOpen(false)} className="w-full" />
          </div>
        </div>
      )}

      <InteractionPrompt />
      <ObservationModeGuide />
      <MajorEventToast />
      <SpecimenSightingToast />
      <DayTitleCard />
      <CameraModeToast />
      <InspectableTooltip />
      <BeagleTravelPrompt />
      <ShipDutiesPrompt />
      <RestCard />

      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-expedition-goldbright/40 shadow-[0_0_10px_rgba(227,197,133,0.25)]">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-expedition-goldbright/70" />
      </div>

      <AimCrosshair />

      <MobileNarrativeDrawer
        open={mobileNarrativeOpen}
        onClose={() => setMobileNarrativeOpen(false)}
      />

      <div className="absolute bottom-3 left-3 right-3 hidden animate-hud-rise flex-col gap-2 [animation-delay:225ms] motion-reduce:animate-none md:right-auto md:flex hud-stage-gate hud-stage-3 md:w-[29rem]">
        <NarrativePanel polished />
      </div>

      <div className="absolute bottom-[5.25rem] left-1/2 hidden -translate-x-1/2 animate-hud-rise flex-col items-center gap-1.5 [animation-delay:300ms] motion-reduce:animate-none md:flex lg:bottom-3 hud-stage-gate hud-stage-3">
        <ShotgunStatusChip />
        <ToolBelt onOpenJournal={openJournalPanel} compact />
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-[14.25rem] hidden gap-1.5 md:flex xl:hidden">
        <button type="button" onClick={() => openLibrary?.({ drawerOpen: true })} className={GOLD_BUTTON}>Library</button>
        <button type="button" onClick={openJournalPanel} className={GOLD_BUTTON}>Journal</button>
        <button type="button" onClick={() => openInventoryTab('case')} className={`${GOLD_BUTTON} relative`}>
          <CasePulseGlow pulse={casePulse} />
          <span key={casePulse ? `case-md-${casePulse.key}` : 'case-md'} className={casePulse ? 'inline-block animate-case-shake motion-reduce:animate-none' : ''}>Case</span>
        </button>
        <CameraCycleButton className={GOLD_BUTTON} />
        <button type="button" onClick={() => setPauseOpen(true)} className={GOLD_BUTTON}>Menu</button>
      </div>

      <MobileTouchControls />
      <MobileActionCluster />
      <MobileBottomNav
        onOpenJournal={openJournalPanel}
        onOpenLibrary={() => openLibrary?.({ drawerOpen: true })}
        onToggleNarrative={() => setMobileNarrativeOpen(value => !value)}
        onOpenCasebook={() => openInventoryTab('case')}
        onOpenInventory={() => openInventoryTab('tools')}
        onOpenPause={() => setPauseOpen(true)}
        narrativeOpen={mobileNarrativeOpen}
      />
      </div>

      <PolishedControlHint
        playableModeId={playableModeId}
        hudHidden={hudHidden}
        contextHintId={contextualControlHintId}
        ready={hudEntranceStage >= 4}
        disabled={hudEntranceStage < 4 || blockingUiOpen || statusViewOpen || examineOpen || readableBookOpen || npcEncounterOpen}
      />

      <PauseMenu
        open={pauseOpen}
        onResume={closePause}
        onOpenControls={openControlsFromPause}
        onRequestEndGame={requestEndGameFromPause}
        onReturnToMainMenu={onReturnToMainMenu}
        audioEnabled={audioEnabled}
        onAudioEnabledChange={onAudioEnabledChange}
        quality={quality}
        onQualityChange={onQualityChange}
      />

      <ControlsOverlay
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        polished
        playableModeId={playableModeId}
      />

      <EndGameConfirmationModal
        open={endGameConfirmationOpen}
        onCancel={closeEndGameConfirmation}
        onConfirm={confirmEndGame}
      />

      <StatusView />
      <ExamineView />
      <BookReaderView />

      <IslandMapModal open={mapOpen} onClose={() => setMapOpen(false)} />
      <InventoryModal open={inventoryOpen} onClose={closeInventory} initialTab={inventoryInitialTab} />
      <SpecimenDetailModal />
      <NpcEncounterModal />
      <NightlyDebriefModal />
      <FieldDilemmaModal />
      <CaseFullModal />

      <FieldNotebook
        panel={panel}
        onClose={() => setPanel(null)}
        onOpenMap={() => {
          setPanel(null);
          openMapModal();
        }}
      />
      <ExpeditionOutcomeModal
        journalOpen={panel === 'journal'}
        onOpenJournal={openJournalPanel}
        onRestartExpedition={onRestartExpedition}
        onReturnToMainMenu={onReturnToMainMenu}
      />
      <FinalAssessmentModal
        journalOpen={panel === 'journal'}
        onOpenJournal={openJournalPanel}
        onRestartExpedition={onRestartExpedition}
        onReturnToMainMenu={onReturnToMainMenu}
      />
    </div>
  );
}
