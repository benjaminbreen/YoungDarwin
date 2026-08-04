'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useThreeGameStore } from '../three-game/store';
import {
  getIslandMapLocation,
  ISLAND_MAP_IMAGE,
  ISLAND_MAP_ASPECT,
} from '../three-game/ui/expedition/map/islandLocations';

// Destination preparation starts at travel intent, so the chart can keep the
// same visual sequence at a brisker tempo. The commit timer is only a fallback;
// the normal path commits from the cover's opacity transitionend event.
// 2026-07-31 tempo pass. A measured travel (Post Office Bay -> Post Scrub
// Rise) spent 4.7s of its 11.1s inside these scripted beats alone, which no
// amount of mount optimization can recover. Every value below is trimmed
// roughly a third while keeping the sequence readable: the crane still reads
// as a lift-away, the route still draws rather than snapping, and the chart
// still holds long enough to be looked at. The hold only gates the commit;
// CHART_MIN_VISIBLE_MS is what keeps the chart on screen until the route has
// finished drawing.
const DEPARTURE_CRANE_MS = 300;
const BLACK_FADE_IN_MS = 240;
const ISLAND_CHART_HOLD_MS = 520;
const ISLAND_MAP_CHART_HOLD_MS = 500;
const THRESHOLD_COMMIT_MS = 250;
const COVER_CONFIRM_GRACE_MS = 90;
const CHART_FADE_IN_MS = 240;
// Deliberately NOT trimmed: this is the window in which the newly un-paused
// shadow map and water reflection render their first frames (see
// TRANSITION_RENDER_WARM_PHASES). The chart is still ≥50% opaque for its
// first half, which is where that work now lands.
const CHART_FADE_OUT_MS = 270;
const WORLD_FADE_IN_MS = 360;
const CAMERA_SETTLE_MS = 340;
// The draw and the pan are deliberately slower than the hold above. They cost
// no travel time: the destination commits after ISLAND_CHART_HOLD_MS and loads
// underneath while the pen is still moving. CHART_MIN_VISIBLE_MS is what stops
// a fast load from cutting the chart away mid-stroke.
const CHART_ROUTE_START_MS = 150;
const CHART_CAMERA_MOVE_MS = 1500;
const CHART_ROUTE_MOVE_MS = 1250;
const CHART_MIN_VISIBLE_MS = CHART_ROUTE_START_MS + CHART_ROUTE_MOVE_MS + 260;
const MAP_LAYER_WIDTH_PERCENT = 116;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashRouteKey(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function routeNoise(seed, index) {
  const value = Math.sin(seed * 0.001 + index * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function smoothRoutePath(points) {
  if (points.length < 2) return '';
  let path = `M ${points[0].x.toFixed(3)} ${points[0].y.toFixed(3)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C ${c1.x.toFixed(3)} ${c1.y.toFixed(3)}, ${c2.x.toFixed(3)} ${c2.y.toFixed(3)}, ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`;
  }
  return path;
}

// Build a stable cartographic footpath: several small, smoothed deviations
// replace a synthetic single arc, while a slight inland bias keeps coastal
// routes from bowing out over open water.
function buildChartRoute(fromLocation, toLocation) {
  if (!fromLocation || !toLocation) return null;
  const reversed = fromLocation.id.localeCompare(toLocation.id) > 0;
  const first = reversed ? toLocation : fromLocation;
  const last = reversed ? fromLocation : toLocation;
  const start = { x: first.at.x * 100, y: first.at.y * 100 };
  const end = { x: last.at.x * 100, y: last.at.y * 100 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const steps = clamp(Math.round(length / 4.5), 5, 9);
  const perpendicular = { x: -dy / length, y: dx / length };
  const seed = hashRouteKey(`${first.id}:${last.id}`);
  const wander = clamp(length * 0.045, 0.55, 1.65);
  const inlandPull = clamp(length * 0.075, 0.65, 2.35)
    * (first.kind === 'water' && last.kind === 'water' ? 0.3 : 1);
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const envelope = Math.sin(Math.PI * t);
    const base = { x: start.x + dx * t, y: start.y + dy * t };
    const towardCenter = { x: 50 - base.x, y: 50 - base.y };
    const centerLength = Math.hypot(towardCenter.x, towardCenter.y) || 1;
    const irregularity = (
      routeNoise(seed, index) * 0.68
      + routeNoise(seed + 7919, index + 3) * 0.32
    ) * wander * envelope;
    points.push({
      x: clamp(
        base.x + perpendicular.x * irregularity
          + (towardCenter.x / centerLength) * inlandPull * envelope,
        0,
        100,
      ),
      y: clamp(
        base.y + perpendicular.y * irregularity
          + (towardCenter.y / centerLength) * inlandPull * envelope,
        0,
        100,
      ),
    });
  }

  const orientedPoints = reversed ? points.reverse() : points;
  return {
    path: smoothRoutePath(orientedPoints),
    points: orientedPoints,
  };
}

// The chart frame's size in px. Kept in JS rather than as a CSS min() string so
// the camera constraints below can reason about how much of the frame the map
// layer actually covers — the two used to disagree, which is what let the frame
// pan off the top of the painting on a portrait phone.
const CHART_MAX_WIDTH = 1680;
const CHART_MAX_HEIGHT = 920;
// Where the plate's centre sits, and how much room the caption block below it
// needs. The old pair let the eyebrow line print over the chart's bottom edge
// on a 1200px-tall window; the height cap is now derived from these two rather
// than from a hand-fitted constant.
const CHART_CENTER_Y = 0.41;
const CAPTION_RESERVE_PX = 236;
const CAPTION_RESERVE_COMPACT_PX = 176;

function chartFrameSize(viewportWidth, viewportHeight) {
  const compact = viewportWidth < 640;
  // A phone has no room to spare either side; a desktop wants the margin.
  const width = Math.min(viewportWidth * (compact ? 0.93 : 0.84), CHART_MAX_WIDTH);
  const reserve = compact ? CAPTION_RESERVE_COMPACT_PX : CAPTION_RESERVE_PX;
  const height = Math.min(
    viewportHeight * 0.78,
    CHART_MAX_HEIGHT,
    // Never letterbox: the map layer is MAP_LAYER_WIDTH_PERCENT of the frame's
    // width at the chart's own aspect, so a taller frame is dead space.
    (width * MAP_LAYER_WIDTH_PERCENT) / 100 / ISLAND_MAP_ASPECT,
    2 * ((1 - CHART_CENTER_Y) * viewportHeight - reserve),
  );
  return { width: Math.max(200, width), height: Math.max(120, height) };
}

function routeCameraViews(route, fromLocation, toLocation, frame) {
  if (!route || !fromLocation || !toLocation) return null;
  const xs = route.points.map(point => point.x / 100);
  const ys = route.points.map(point => point.y / 100);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  const zoom = clamp(Math.min(
    1.18 / (maxX - minX + 0.16),
    0.86 / (maxY - minY + 0.15),
  ), 1.12, 2.18);
  const focus = 0.16;
  // How many frame-heights the map layer covers at zoom 1. On a wide desktop
  // frame this is ~1.8 and the authored 0.34 inset is the binding one; on a
  // portrait phone the frame is exactly the layer's height, so the inset has to
  // rise to 0.5 or the pan exposes bare panel above the coastline.
  const layerCoverY = frame
    ? ((frame.width * MAP_LAYER_WIDTH_PERCENT) / 100 / ISLAND_MAP_ASPECT) / frame.height
    : 1;
  const verticalInsetAtZoom1 = Math.max(0.34, 0.5 / Math.max(0.001, layerCoverY));
  const constrainView = view => {
    const horizontalInset = clamp(0.44 / view.zoom, 0, 0.49);
    const verticalInset = clamp(verticalInsetAtZoom1 / view.zoom, 0, 0.49);
    return {
      ...view,
      cx: clamp(view.cx, horizontalInset, 1 - horizontalInset),
      cy: clamp(view.cy, verticalInset, 1 - verticalInset),
    };
  };
  const startZoom = zoom * 0.96;
  const endZoom = Math.min(2.26, zoom * 1.04);
  return {
    start: constrainView({
      cx: center.cx * (1 - focus) + fromLocation.at.x * focus,
      cy: center.cy * (1 - focus) + fromLocation.at.y * focus,
      zoom: startZoom,
    }),
    end: constrainView({
      cx: center.cx * (1 - focus) + toLocation.at.x * focus,
      cy: center.cy * (1 - focus) + toLocation.at.y * focus,
      zoom: endZoom,
    }),
  };
}

function ChartMarker({
  location,
  otherLocation = null,
  destination = false,
  label = false,
  routeActive = false,
  compact = false,
}) {
  if (!location) return null;
  const dx = location.at.x - (otherLocation?.at.x ?? location.at.x);
  const dy = location.at.y - (otherLocation?.at.y ?? location.at.y - 1);
  let labelStyle = {
    left: '50%',
    top: 'calc(100% + 5px)',
    transform: 'translateX(-50%)',
  };
  if (!compact && Math.abs(dx) >= Math.abs(dy)) {
    labelStyle = dx >= 0
      ? { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }
      : { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' };
  } else if (compact) {
    // On a phone-width frame a centred label runs off whichever edge its marker
    // sits near, and the outboard placement above pushes both ends of a
    // horizontal route outward at once. Stack the label off the marker and let
    // it grow back toward the other end of the route, where the room is.
    const vertical = dy < 0 ? { bottom: 'calc(100% + 5px)' } : { top: 'calc(100% + 5px)' };
    labelStyle = dx >= 0
      ? { ...vertical, right: '50%', textAlign: 'right' }
      : { ...vertical, left: '50%', textAlign: 'left' };
  } else if (dy < 0) {
    labelStyle = { bottom: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)' };
  }
  return (
    <div
      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-700"
      style={{
        left: `${location.at.x * 100}%`,
        top: `${location.at.y * 100}%`,
        // The origin recedes once the pen leaves it, so the eye follows the
        // stroke to where you are going.
        opacity: !destination && routeActive ? 0.6 : 1,
      }}
    >
      <span className="relative block h-4 w-4">
        {destination && routeActive && (
          <span className="absolute inset-[-5px] rounded-full border border-expedition-goldbright/45 opacity-70" />
        )}
        <span className={`absolute inset-0 rounded-full border shadow-[0_0_14px_rgba(236,205,139,0.62)] ${
          destination
            ? 'border-expedition-goldbright bg-expedition-goldbright'
            : 'border-expedition-parchment/90 bg-expedition-ink'
        }`} />
      </span>
      {label && (
        <span
          className={`block text-[9px] uppercase leading-[1.35] tracking-[0.2em] ${
            destination
              ? 'font-semibold text-expedition-goldbright'
              : 'font-medium text-expedition-parchment/85'
          } ${compact ? 'w-max max-w-[7.5rem]' : 'whitespace-nowrap'}`}
          style={{
            ...labelStyle,
            position: 'absolute',
            textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 7px rgba(7,10,12,0.88)',
          }}
        >
          {location.name}
        </span>
      )}
    </div>
  );
}

// One gold frame, marked at the corners: the chart should read as a mounted
// plate rather than a cropped photograph.
function ChartCorners() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {[
        'left-0 top-0 border-l border-t',
        'right-0 top-0 border-r border-t',
        'left-0 bottom-0 border-l border-b',
        'right-0 bottom-0 border-r border-b',
      ].map(position => (
        <span
          key={position}
          className={`absolute h-6 w-6 border-expedition-goldbright/55 ${position}`}
        />
      ))}
    </div>
  );
}

function useChartFrame() {
  const [frame, setFrame] = useState(() => (
    typeof window === 'undefined'
      ? chartFrameSize(1280, 800)
      : chartFrameSize(window.innerWidth, window.innerHeight)
  ));
  useEffect(() => {
    const update = () => setFrame(prev => {
      const next = chartFrameSize(window.innerWidth, window.innerHeight);
      return Math.abs(next.width - prev.width) < 0.5 && Math.abs(next.height - prev.height) < 0.5
        ? prev
        : next;
    });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return frame;
}

function IslandChart({ transition, reducedMotion, active }) {
  const fromLocation = getIslandMapLocation(transition.fromZoneId);
  const toLocation = getIslandMapLocation(transition.zoneId);
  const frame = useChartFrame();
  const route = useMemo(
    () => buildChartRoute(fromLocation, toLocation),
    [fromLocation, toLocation],
  );
  const cameraViews = useMemo(
    () => routeCameraViews(route, fromLocation, toLocation, frame),
    [frame, fromLocation, route, toLocation],
  );
  const startView = useMemo(() => cameraViews?.start || ({
    cx: fromLocation?.at.x || 0.5,
    cy: fromLocation?.at.y || 0.5,
    zoom: 1.45,
  }), [cameraViews, fromLocation]);
  const [view, setView] = useState(startView);
  const [routeActive, setRouteActive] = useState(false);

  useEffect(() => {
    setRouteActive(false);
    setView(reducedMotion ? cameraViews?.end || startView : startView);
    if (!active || reducedMotion) return undefined;
    const routeTimer = window.setTimeout(() => {
      setRouteActive(true);
      setView(cameraViews?.end || startView);
    }, CHART_ROUTE_START_MS);
    return () => window.clearTimeout(routeTimer);
  }, [active, cameraViews, reducedMotion, startView, transition.id]);

  // Below this the outboard marker labels have nowhere to go — see ChartMarker.
  const compactLabels = frame.width < 520;
  const panX = (0.5 - view.cx) * 100 * view.zoom;
  const panY = (0.5 - view.cy) * 100 * view.zoom;
  const mapLayerStyle = {
    width: `${MAP_LAYER_WIDTH_PERCENT}%`,
    height: 'auto',
    aspectRatio: String(ISLAND_MAP_ASPECT),
    transform: `translate(calc(-50% + ${panX}%), calc(-50% + ${panY}%)) scale(${view.zoom}) translateZ(0)`,
    transformOrigin: '50% 50%',
    backfaceVisibility: 'hidden',
    transition: reducedMotion
      ? 'none'
      : `transform ${CHART_CAMERA_MOVE_MS}ms cubic-bezier(0.32, 0.02, 0.18, 1)`,
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#100f0c]">
      <div
        className="absolute left-1/2 z-10 overflow-hidden rounded-[3px] border border-expedition-gold/35 bg-[radial-gradient(ellipse_at_center,#17212a_0%,#101419_70%,#090a0b_100%)] shadow-[0_30px_100px_rgba(0,0,0,0.8),0_0_0_1px_rgba(230,204,143,0.09)]"
        style={{
          top: `${CHART_CENTER_Y * 100}%`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={mapLayerStyle}
        >
          <Image
            src={ISLAND_MAP_IMAGE}
            alt="Floreana Island chart"
            className="absolute inset-0 h-full w-full select-none object-fill"
            draggable={false}
            fill
            priority
            unoptimized
            sizes={`${Math.round(frame.width * MAP_LAYER_WIDTH_PERCENT / 100)}px`}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 54px 10px rgba(8,7,5,0.5)',
            background: 'radial-gradient(ellipse at 50% 48%, transparent 66%, rgba(9,8,5,0.1) 82%, rgba(9,8,5,0.54) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 will-change-transform"
          style={mapLayerStyle}
        >
          {route && routeActive && (
            <svg
              key={`${transition.id}-route`}
              className="absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={route.path}
                fill="none"
                vectorEffect="non-scaling-stroke"
                stroke="rgba(25,18,11,0.78)"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d={route.path}
                fill="none"
                pathLength="1"
                vectorEffect="non-scaling-stroke"
                stroke="rgba(229,199,132,0.92)"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeDasharray="1"
                strokeDashoffset="1"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="1"
                  to="0"
                  dur={`${CHART_ROUTE_MOVE_MS / 1000}s`}
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.22 0.61 0.22 1"
                  fill="freeze"
                />
              </path>
              <g style={{ filter: 'drop-shadow(0 0 2px rgba(242,216,155,0.82))' }}>
                <path
                  d="M -1.05 -0.72 L 1.3 0 L -1.05 0.72 L -0.48 0 Z"
                  fill="#f0d99e"
                  stroke="#17130d"
                  strokeWidth="0.24"
                  strokeLinejoin="round"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.06;0.88;1"
                  dur={`${CHART_ROUTE_MOVE_MS / 1000}s`}
                  fill="freeze"
                />
                <animateMotion
                  path={route.path}
                  begin="0s"
                  dur={`${CHART_ROUTE_MOVE_MS / 1000}s`}
                  rotate="auto"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.22 0.61 0.22 1"
                  fill="freeze"
                />
              </g>
            </svg>
          )}
          <ChartMarker
            location={fromLocation}
            otherLocation={toLocation}
            label
            compact={compactLabels}
            routeActive={routeActive}
          />
          <ChartMarker
            location={toLocation}
            otherLocation={fromLocation}
            destination
            label
            compact={compactLabels}
            routeActive={routeActive}
          />
        </div>
        <ChartCorners />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 42%, rgba(49,42,27,0.16), rgba(10,9,7,0.72) 60%, #0b0a08 100%)',
        }}
      />
    </div>
  );
}

function fatigueLabel(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 2) return 'light fatigue';
  if (value <= 5) return 'moderate fatigue';
  return 'strenuous travel';
}

export function TravelInterstitial() {
  const transition = useThreeGameStore(state => state.transition);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const commitZoneTransition = useThreeGameStore(state => state.commitZoneTransition);
  const setZoneTransitionPhase = useThreeGameStore(state => state.setZoneTransitionPhase);
  const finishZoneTransition = useThreeGameStore(state => state.finishZoneTransition);
  const [covered, setCovered] = useState(false);
  const [coverConfirmed, setCoverConfirmed] = useState(false);
  const [chartVisible, setChartVisible] = useState(false);
  const [chartBeatComplete, setChartBeatComplete] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const coverConfirmedRef = useRef(false);
  const preparedTransitionIdRef = useRef(null);
  const chartShownAtRef = useRef(0);
  const transitionId = transition?.id || null;
  const transitionMode = transition?.mode || null;
  const transitionSource = transition?.source || null;
  const transitionPhase = transition?.phase || null;
  const transitionStartedAt = transition?.startedAt || 0;
  const transitionArrivingAt = transition?.arrivingAt || 0;
  const standbyTransition = useMemo(() => {
    const location = getIslandMapLocation(currentZoneId);
    return {
      id: `standby:${currentZoneId}`,
      fromZoneId: currentZoneId,
      zoneId: currentZoneId,
      mode: 'island',
      to: location?.name || '',
    };
  }, [currentZoneId]);
  const displayedTransition = transition || standbyTransition;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!transitionId) {
      setCovered(false);
      setCoverConfirmed(false);
      setChartVisible(false);
      setChartBeatComplete(false);
      setRevealing(false);
      coverConfirmedRef.current = false;
      preparedTransitionIdRef.current = null;
      chartShownAtRef.current = 0;
      return undefined;
    }
    setCovered(false);
    setCoverConfirmed(false);
    setChartVisible(false);
    setChartBeatComplete(false);
    setRevealing(false);
    coverConfirmedRef.current = false;
    preparedTransitionIdRef.current = null;
    chartShownAtRef.current = 0;
    const immediateCover = reducedMotion || transitionSource === 'island-map';
    const departureDelay = immediateCover || transitionMode === 'threshold'
      ? 0
      : DEPARTURE_CRANE_MS;
    const coverTimer = window.setTimeout(
      () => {
        window.__recordThreeTransitionEvent?.('cover-start');
        setCovered(true);
      },
      departureDelay,
    );
    const coverDuration = reducedMotion ? 200 : BLACK_FADE_IN_MS;
    const coverConfirmTimer = transitionMode === 'threshold'
      ? null
      : window.setTimeout(() => {
        if (coverConfirmedRef.current) return;
        coverConfirmedRef.current = true;
        window.__recordThreeTransitionEvent?.('chart-opaque-fallback');
        setCoverConfirmed(true);
      }, departureDelay + coverDuration + COVER_CONFIRM_GRACE_MS);
    const thresholdCommitTimer = transitionMode === 'threshold'
      ? window.setTimeout(
        () => commitZoneTransition(transitionId),
        reducedMotion ? 120 : THRESHOLD_COMMIT_MS,
      )
      : null;
    return () => {
      window.clearTimeout(coverTimer);
      if (coverConfirmTimer != null) window.clearTimeout(coverConfirmTimer);
      if (thresholdCommitTimer != null) window.clearTimeout(thresholdCommitTimer);
    };
  }, [commitZoneTransition, reducedMotion, transitionId, transitionMode, transitionSource]);

  useEffect(() => {
    if (!transitionId
      || transitionMode === 'threshold'
      || !coverConfirmed
      || preparedTransitionIdRef.current === transitionId) return undefined;
    preparedTransitionIdRef.current = transitionId;
    setZoneTransitionPhase('chart', transitionId);
    chartShownAtRef.current = Date.now();
    setChartVisible(true);
    const holdTimer = window.setTimeout(
      () => setChartBeatComplete(true),
      reducedMotion
        ? 120
        : transitionSource === 'island-map'
          ? ISLAND_MAP_CHART_HOLD_MS
          : ISLAND_CHART_HOLD_MS,
    );
    return () => {
      window.clearTimeout(holdTimer);
    };
  }, [
    coverConfirmed,
    reducedMotion,
    setZoneTransitionPhase,
    transitionId,
    transitionMode,
    transitionSource,
  ]);

  // Let the chart pan and route drawing finish against the already-settled
  // source scene. Destination teardown/mounting starts only once the chart has
  // reached its final, static composition, so main-thread work cannot corrupt
  // the visible cartographic motion.
  useEffect(() => {
    if (!transitionId
      || transitionMode === 'threshold'
      || transitionPhase !== 'chart'
      || !chartBeatComplete) return undefined;
    const commitFrame = window.requestAnimationFrame(() => {
      commitZoneTransition(transitionId);
    });
    return () => window.cancelAnimationFrame(commitFrame);
  }, [
    chartBeatComplete,
    commitZoneTransition,
    transitionId,
    transitionMode,
    transitionPhase,
  ]);

  useEffect(() => {
    if (!transitionId || transitionPhase !== 'ready') return undefined;
    if (transitionMode !== 'threshold' && !reducedMotion && !chartBeatComplete) return undefined;
    const minimum = transitionMode === 'threshold' || reducedMotion ? 300 : 0;
    const drawRemaining = transitionMode === 'threshold' || reducedMotion || !chartShownAtRef.current
      ? 0
      : CHART_MIN_VISIBLE_MS - (Date.now() - chartShownAtRef.current);
    const wait = Math.max(
      0,
      minimum - (Date.now() - transitionStartedAt),
      drawRemaining,
    );
    let handoffTimer = null;
    const timer = window.setTimeout(() => {
      setChartVisible(false);
      handoffTimer = window.setTimeout(() => {
        window.__recordThreeTransitionEvent?.('reveal-start');
        setZoneTransitionPhase('arriving', transitionId);
        // Give TravelCameraRig one painted frame to establish its elevated
        // arrival pose while the screen is fully black.
        window.requestAnimationFrame(() => setRevealing(true));
      }, reducedMotion || transitionMode === 'threshold' ? 0 : CHART_FADE_OUT_MS);
    }, wait);
    return () => {
      window.clearTimeout(timer);
      if (handoffTimer != null) window.clearTimeout(handoffTimer);
    };
  }, [chartBeatComplete, reducedMotion, setZoneTransitionPhase, transitionId, transitionMode, transitionPhase, transitionStartedAt]);

  useEffect(() => {
    if (!transitionId || transitionPhase !== 'arriving') return undefined;
    const fadeDuration = reducedMotion ? 200 : transitionMode === 'threshold' ? 300 : WORLD_FADE_IN_MS;
    const settleTimer = window.setTimeout(() => setZoneTransitionPhase('settling', transitionId), fadeDuration);
    return () => window.clearTimeout(settleTimer);
  }, [reducedMotion, setZoneTransitionPhase, transitionId, transitionMode, transitionPhase]);

  useEffect(() => {
    if (!transitionId || !transitionArrivingAt
      || (transitionPhase !== 'arriving' && transitionPhase !== 'settling')) return undefined;
    const fadeDuration = reducedMotion ? 200 : transitionMode === 'threshold' ? 300 : WORLD_FADE_IN_MS;
    const settleDuration = reducedMotion || transitionMode === 'threshold' ? 200 : CAMERA_SETTLE_MS;
    const remaining = Math.max(
      0,
      fadeDuration + settleDuration - (Date.now() - transitionArrivingAt),
    );
    const finishTimer = window.setTimeout(() => finishZoneTransition(transitionId), remaining);
    return () => window.clearTimeout(finishTimer);
  }, [finishZoneTransition, reducedMotion, transitionArrivingAt, transitionId, transitionMode, transitionPhase]);

  const active = Boolean(transition);
  const isIsland = displayedTransition.mode !== 'threshold';
  const minutes = Number(displayedTransition.minutes) > 0
    ? `about ${Math.round(displayedTransition.minutes)} minutes`
    : null;
  const fatigue = fatigueLabel(Number(displayedTransition.fatigue));
  // Caption lines settle in order rather than arriving as one block. Keyed on
  // the transition id below so each travel replays the stagger.
  const captionStagger = reducedMotion
    ? () => undefined
    : delay => ({
      animation: `travel-caption-rise 560ms cubic-bezier(0.16, 0.84, 0.3, 1) ${delay}ms both`,
    });

  return (
    <div
      className={`${active ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-40 select-none overflow-hidden bg-black font-expedition text-expedition-parchment transition-opacity ${
        revealing ? 'opacity-0' : covered ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        transitionDuration: `${reducedMotion
          ? 200
          : revealing
            ? WORLD_FADE_IN_MS
            : BLACK_FADE_IN_MS}ms`,
        // Both arms used to carry the same standard ease, which made the
        // reveal hold black through its first third and then rush — the
        // opposite of how a shot opens. Covering now eases IN (the departing
        // world lingers, then commits to black); revealing eases OUT (the
        // destination arrives promptly, then settles), which reads as both
        // more filmic and subjectively faster at the same duration.
        transitionTimingFunction: revealing
          ? 'cubic-bezier(0.16, 0.84, 0.3, 1)'
          : 'cubic-bezier(0.55, 0, 0.85, 0.45)',
      }}
      onTransitionEnd={event => {
        if (event.target !== event.currentTarget
          || event.propertyName !== 'opacity'
          || revealing
          || !covered) return;
        coverConfirmedRef.current = true;
        window.__recordThreeTransitionEvent?.('chart-opaque');
        setCoverConfirmed(true);
      }}
      aria-hidden={!active}
      aria-live={active ? 'polite' : 'off'}
    >
      <div
        className={`absolute inset-0 transition-opacity ${
          transitionMode === 'threshold' || chartVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          transitionDuration: `${reducedMotion ? 120 : chartVisible ? CHART_FADE_IN_MS : CHART_FADE_OUT_MS}ms`,
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isIsland ? (
          <IslandChart transition={displayedTransition} reducedMotion={reducedMotion} active={chartVisible} />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(67,58,38,0.5),rgba(12,11,9,0.98)_72%)]" />
        )}
        {/* z-20: the chart frame is z-10 inside the same stacking context, and
            without this it paints over the destination name on short screens. */}
        <div className="absolute inset-x-0 bottom-[max(1.25rem,6dvh)] z-20 flex justify-center px-5">
          <section
            key={`${displayedTransition.id}-caption`}
            className="max-w-xl text-center"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
          >
            <p
              className="text-[9px] font-medium uppercase tracking-[0.42em] text-expedition-gold/80 sm:text-[10px]"
              style={captionStagger(0)}
            >
              {isIsland ? 'Across Charles Island' : 'Crossing the threshold'}
            </p>
            <h2
              className="mt-2.5 text-[1.7rem] font-normal leading-[1.1] tracking-[0.01em] text-expedition-parchment sm:mt-3 sm:text-[2.6rem]"
              style={captionStagger(90)}
            >
              {displayedTransition.to}
            </h2>
            {/* Ruled off like a plate caption; the diamond keeps the rule from
                reading as a second frame edge. */}
            <span
              className="mx-auto mt-3 flex w-40 items-center justify-center gap-2 sm:w-52"
              style={captionStagger(160)}
            >
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-expedition-gold/45" />
              <span className="h-[3px] w-[3px] rotate-45 bg-expedition-goldbright/70" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-expedition-gold/45" />
            </span>
            {displayedTransition.note && (
              <p
                className="mx-auto mt-3 hidden max-w-lg text-[0.95rem] italic leading-relaxed text-expedition-parchment/78 sm:block"
                style={captionStagger(220)}
              >
                {displayedTransition.note}
              </p>
            )}
            {(minutes || fatigue) && (
              <p
                className="mt-2 text-[9px] uppercase tracking-[0.24em] text-expedition-gold/70 sm:mt-2.5 sm:text-[10px]"
                style={captionStagger(280)}
              >
                {[minutes, fatigue].filter(Boolean).join(' · ')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
