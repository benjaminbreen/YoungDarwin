'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
const ISLAND_COVER_START_MS = 0;
const ISLAND_COMMIT_MS = 1080;
const ISLAND_MIN_REVEAL_MS = 2600;
const ISLAND_MAP_MIN_REVEAL_MS = 2600;
const THRESHOLD_COMMIT_MS = 250;
const CHART_FADE_IN_MS = 450;
const CHART_FADE_OUT_MS = 450;
const CAMERA_SETTLE_MS = 650;
const CHART_ROUTE_START_MS = 180;
const CHART_CAMERA_MOVE_MS = 1650;
const CHART_ROUTE_MOVE_MS = 1500;
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

function routeCameraViews(route, fromLocation, toLocation) {
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
  const constrainView = view => {
    const horizontalInset = clamp(0.44 / view.zoom, 0, 0.49);
    const verticalInset = clamp(0.34 / view.zoom, 0, 0.49);
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
}) {
  if (!location) return null;
  const dx = location.at.x - (otherLocation?.at.x ?? location.at.x);
  const dy = location.at.y - (otherLocation?.at.y ?? location.at.y - 1);
  let labelStyle = {
    left: '50%',
    top: 'calc(100% + 5px)',
    transform: 'translateX(-50%)',
  };
  if (Math.abs(dx) >= Math.abs(dy)) {
    labelStyle = dx >= 0
      ? { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }
      : { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' };
  } else if (dy < 0) {
    labelStyle = { bottom: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)' };
  }
  return (
    <div
      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-center"
      style={{ left: `${location.at.x * 100}%`, top: `${location.at.y * 100}%` }}
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
          className="block whitespace-nowrap text-[7px] font-semibold uppercase tracking-[0.16em] text-expedition-parchment"
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

function IslandChart({ transition, reducedMotion, active }) {
  const fromLocation = getIslandMapLocation(transition.fromZoneId);
  const toLocation = getIslandMapLocation(transition.zoneId);
  const route = useMemo(
    () => buildChartRoute(fromLocation, toLocation),
    [fromLocation, toLocation],
  );
  const cameraViews = useMemo(
    () => routeCameraViews(route, fromLocation, toLocation),
    [fromLocation, route, toLocation],
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

  const chartWidth = 'min(84vw, 1680px)';
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
        className="absolute left-1/2 top-[43%] z-10 overflow-hidden rounded-[3px] border border-expedition-gold/35 bg-[radial-gradient(ellipse_at_center,#17212a_0%,#101419_70%,#090a0b_100%)] shadow-[0_30px_100px_rgba(0,0,0,0.8),0_0_0_1px_rgba(230,204,143,0.09)]"
        style={{
          width: chartWidth,
          height: 'min(78vh, 920px)',
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
            sizes={chartWidth}
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
          <ChartMarker location={fromLocation} otherLocation={toLocation} label />
          <ChartMarker
            location={toLocation}
            otherLocation={fromLocation}
            destination
            label
            routeActive={routeActive}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-expedition-goldbright/30 to-transparent" />
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
  const commitZoneTransition = useThreeGameStore(state => state.commitZoneTransition);
  const setZoneTransitionPhase = useThreeGameStore(state => state.setZoneTransitionPhase);
  const finishZoneTransition = useThreeGameStore(state => state.finishZoneTransition);
  const [covered, setCovered] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitionId = transition?.id || null;
  const transitionMode = transition?.mode || null;
  const transitionSource = transition?.source || null;
  const transitionPhase = transition?.phase || null;
  const transitionStartedAt = transition?.startedAt || 0;
  const transitionArrivingAt = transition?.arrivingAt || 0;

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
      setRevealing(false);
      return undefined;
    }
    setRevealing(false);
    const immediateCover = reducedMotion || transitionSource === 'island-map';
    const coverTimer = window.setTimeout(
      () => {
        window.__recordThreeTransitionEvent?.('cover-start');
        setCovered(true);
      },
      immediateCover ? 0 : transitionMode === 'threshold' ? 0 : ISLAND_COVER_START_MS,
    );
    const commitDelay = transitionSource === 'island-map'
      ? (reducedMotion ? 80 : 520)
      : transitionMode === 'threshold'
        ? (reducedMotion ? 120 : THRESHOLD_COMMIT_MS)
        : (reducedMotion ? 220 : ISLAND_COMMIT_MS);
    const commitTimer = window.setTimeout(() => commitZoneTransition(transitionId), commitDelay);
    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(commitTimer);
    };
  }, [commitZoneTransition, reducedMotion, transitionId, transitionMode, transitionSource]);

  useEffect(() => {
    if (!transitionId || transitionPhase !== 'ready') return undefined;
    const minimum = transitionMode === 'threshold' || reducedMotion
      ? 300
      : transitionSource === 'island-map'
        ? ISLAND_MAP_MIN_REVEAL_MS
        : ISLAND_MIN_REVEAL_MS;
    const wait = Math.max(0, minimum - (Date.now() - transitionStartedAt));
    const timer = window.setTimeout(() => {
      window.__recordThreeTransitionEvent?.('reveal-start');
      setRevealing(true);
      setZoneTransitionPhase('arriving', transitionId);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, setZoneTransitionPhase, transitionId, transitionMode, transitionPhase, transitionSource, transitionStartedAt]);

  useEffect(() => {
    if (!transitionId || transitionPhase !== 'arriving') return undefined;
    const fadeDuration = reducedMotion ? 200 : transitionMode === 'threshold' ? 300 : CHART_FADE_OUT_MS;
    const settleTimer = window.setTimeout(() => setZoneTransitionPhase('settling', transitionId), fadeDuration);
    return () => window.clearTimeout(settleTimer);
  }, [reducedMotion, setZoneTransitionPhase, transitionId, transitionMode, transitionPhase]);

  useEffect(() => {
    if (!transitionId || !transitionArrivingAt
      || (transitionPhase !== 'arriving' && transitionPhase !== 'settling')) return undefined;
    const fadeDuration = reducedMotion ? 200 : transitionMode === 'threshold' ? 300 : CHART_FADE_OUT_MS;
    const settleDuration = reducedMotion || transitionMode === 'threshold' ? 200 : CAMERA_SETTLE_MS;
    const remaining = Math.max(
      0,
      fadeDuration + settleDuration - (Date.now() - transitionArrivingAt),
    );
    const finishTimer = window.setTimeout(() => finishZoneTransition(transitionId), remaining);
    return () => window.clearTimeout(finishTimer);
  }, [finishZoneTransition, reducedMotion, transitionArrivingAt, transitionId, transitionMode, transitionPhase]);

  if (!transition) return null;
  const isIsland = transition.mode !== 'threshold';
  const minutes = Number(transition.minutes) > 0 ? `about ${Math.round(transition.minutes)} minutes` : null;
  const fatigue = fatigueLabel(Number(transition.fatigue));

  return (
    <div
      className={`pointer-events-auto fixed inset-0 z-40 select-none overflow-hidden bg-[#11100d] font-expedition text-expedition-parchment transition-opacity ${
        revealing ? 'opacity-0' : covered ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        transitionDuration: `${reducedMotion
          ? 200
          : revealing
            ? CHART_FADE_OUT_MS
            : CHART_FADE_IN_MS}ms`,
        transitionTimingFunction: revealing
          ? 'cubic-bezier(0.4, 0, 0.2, 1)'
          : 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onTransitionEnd={event => {
        if (event.target !== event.currentTarget
          || event.propertyName !== 'opacity'
          || revealing
          || !covered) return;
        window.__recordThreeTransitionEvent?.('chart-opaque');
        commitZoneTransition(transitionId);
      }}
      aria-live="polite"
    >
      {isIsland ? (
        <IslandChart transition={transition} reducedMotion={reducedMotion} active={covered} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(67,58,38,0.5),rgba(12,11,9,0.98)_72%)]" />
      )}
      <div className="absolute inset-x-0 bottom-[max(2rem,6vh)] flex justify-center px-5">
        <section className="max-w-xl text-center text-shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-expedition-gold/85">
            {isIsland ? 'Across Charles Island' : 'Crossing the threshold'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[0.035em] text-expedition-parchment sm:text-3xl">
            {transition.to}
          </h2>
          {transition.note && (
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-expedition-parchment/82">
              {transition.note}
            </p>
          )}
          {(minutes || fatigue) && (
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-expedition-gold/75">
              {[minutes, fatigue].filter(Boolean).join(' · ')}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
