'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FLOREANA_BOUNDARIES,
  FLOREANA_CARDINAL_DIRECTIONS,
  FLOREANA_MAP_PLACEMENTS,
  FLOREANA_OPPOSITE_DIRECTIONS,
  FLOREANA_ROUTE_EDGES,
  mapDirectionBetween,
} from '../../../game-core/floreanaGeography';
import { regionMaps } from '../../../game-core/regionMaps';
import {
  ISLAND_MAP_ASPECT,
  ISLAND_MAP_IMAGE,
} from '../expedition/map/islandLocations';

// Bump when the authored source graph is materially reworked so an obsolete
// browser draft cannot silently replace the new topology on first review.
const STORAGE_KEY = 'darwin-floreana-geography-draft-v3';
const DIRECTION_EDGE = { N: 'north', E: 'east', S: 'south', W: 'west' };
const ROUTE_KINDS = ['land', 'water', 'creek'];
const COASTAL_TYPES = new Set([
  'bay',
  'beach',
  'reef',
  'ocean',
  'coastallava',
  'coastalTrail',
  'cliff',
  'promontory',
  'beagle',
]);

const BUTTON_CLASS = 'rounded-sm border border-expedition-brass/70 bg-expedition-ink/75 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-expedition-gold transition hover:border-expedition-gold hover:text-expedition-goldbright disabled:cursor-not-allowed disabled:opacity-40';

function clonePlacements() {
  return FLOREANA_MAP_PLACEMENTS.map(item => ({
    ...item,
    at: [...item.at],
    labelOffset: Array.isArray(item.labelOffset) ? [...item.labelOffset] : [0, 20],
  }));
}

function cloneBoundaries(source = FLOREANA_BOUNDARIES) {
  return Object.fromEntries(
    Object.entries(source).map(([id, edges]) => [id, { ...edges }]),
  );
}

function buildRouteAdjacency(edges = FLOREANA_ROUTE_EDGES) {
  const adjacency = {};
  for (const placement of FLOREANA_MAP_PLACEMENTS) adjacency[placement.id] = {};
  for (const [fromId, direction, toId, kind] of edges) {
    adjacency[fromId] ||= {};
    adjacency[toId] ||= {};
    adjacency[fromId][direction] = { toId, kind };
    adjacency[toId][FLOREANA_OPPOSITE_DIRECTIONS[direction]] = { toId: fromId, kind };
  }
  return adjacency;
}

function cloneRoutes(routes) {
  return Object.fromEntries(
    Object.entries(routes).map(([id, slots]) => [
      id,
      Object.fromEntries(Object.entries(slots).map(([direction, route]) => [direction, { ...route }])),
    ]),
  );
}

function routeEdgesFromAdjacency(routes, placements) {
  const edges = [];
  const seen = new Set();
  for (const placement of placements) {
    for (const direction of FLOREANA_CARDINAL_DIRECTIONS) {
      const route = routes[placement.id]?.[direction];
      if (!route?.toId) continue;
      const key = [placement.id, route.toId].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([placement.id, direction, route.toId, route.kind || 'land']);
    }
  }
  return edges;
}

function isEditorLocation(placement) {
  return !placement.test && placement.kind !== 'shipInterior' && placement.kind !== 'houseInterior';
}

function isCoastal(placement, boundaries) {
  const region = regionMaps[placement.id];
  return placement.kind === 'water'
    || placement.kind === 'anchorage'
    || COASTAL_TYPES.has(region?.type)
    || Object.keys(boundaries[placement.id] || {}).length > 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function placementExport(placement) {
  const output = {
    id: placement.id,
    at: placement.at.map(value => Number(value.toFixed(4))),
    kind: placement.kind,
  };
  if (placement.label) output.label = true;
  if (placement.test) output.test = true;
  output.labelOffset = placement.labelOffset.map(value => Math.round(value));
  return output;
}

async function copyToClipboard(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
  await navigator.clipboard.writeText(value);
}

function Field({ label, value, step = 1, onChange }) {
  return (
    <label className="grid gap-1 text-[9px] uppercase tracking-[0.13em] text-expedition-faded">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="min-w-0 rounded-sm border border-expedition-brass/50 bg-black/35 px-2 py-1.5 font-mono text-[11px] normal-case tracking-normal text-expedition-parchment outline-none focus:border-expedition-gold"
      />
    </label>
  );
}

export function MapGeographyDevPanel({ open, onClose }) {
  const [placements, setPlacements] = useState(clonePlacements);
  const [routes, setRoutes] = useState(() => buildRouteAdjacency());
  const [boundaries, setBoundaries] = useState(cloneBoundaries);
  const [selectedId, setSelectedId] = useState('N_SHORE');
  const [showAllRoutes, setShowAllRoutes] = useState(true);
  const [showTests, setShowTests] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const mapRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (Array.isArray(draft.placements) && draft.routes && draft.boundaries) {
          setPlacements(draft.placements);
          setRoutes(draft.routes);
          setBoundaries(draft.boundaries);
          setDraftNotice('Saved browser draft loaded');
        }
      }
    } catch {
      setDraftNotice('Saved draft could not be loaded');
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ placements, routes, boundaries }));
  }, [boundaries, draftReady, placements, routes]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.code === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    const onPointerMove = event => {
      const drag = dragRef.current;
      const map = mapRef.current;
      if (!drag || !map) return;
      if (drag.kind === 'point') {
        const rect = map.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / rect.width, 0.015, 0.985);
        const y = clamp((event.clientY - rect.top) / rect.height, 0.015, 0.985);
        setPlacements(current => current.map(item => (
          item.id === drag.id ? { ...item, at: [x, y] } : item
        )));
      } else {
        const x = Math.round(drag.offset[0] + event.clientX - drag.start[0]);
        const y = Math.round(drag.offset[1] + event.clientY - drag.start[1]);
        setPlacements(current => current.map(item => (
          item.id === drag.id ? { ...item, labelOffset: [x, y] } : item
        )));
      }
    };
    const onPointerUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const placementById = useMemo(() => Object.fromEntries(
    placements.map(placement => [placement.id, placement]),
  ), [placements]);

  const editableLocations = useMemo(() => placements
    .filter(isEditorLocation)
    .sort((a, b) => (regionMaps[a.id]?.name || a.id).localeCompare(regionMaps[b.id]?.name || b.id)), [placements]);

  const routeEdges = useMemo(
    () => routeEdgesFromAdjacency(routes, placements),
    [placements, routes],
  );

  const selected = placementById[selectedId] || placements[0];
  const selectedRegion = regionMaps[selected?.id];

  const directionMismatches = useMemo(() => routeEdges.filter(([fromId, direction, toId]) => {
    const from = placementById[fromId];
    const to = placementById[toId];
    if (!from || !to) return false;
    return mapDirectionBetween(
      { x: from.at[0], y: from.at[1] },
      { x: to.at[0], y: to.at[1] },
    ) !== direction;
  }), [placementById, routeEdges]);

  const incompleteInterior = useMemo(() => editableLocations.filter(placement => (
    !isCoastal(placement, boundaries)
    && FLOREANA_CARDINAL_DIRECTIONS.some(direction => !routes[placement.id]?.[direction])
  )), [boundaries, editableLocations, routes]);

  const visiblePlacements = placements.filter(placement => showTests || !placement.test);
  const visibleRouteEdges = showAllRoutes
    ? routeEdges
    : routeEdges.filter(([fromId, , toId]) => fromId === selected?.id || toId === selected?.id);

  const updatePlacement = (id, updater) => {
    setPlacements(current => current.map(item => (
      item.id === id ? updater(item) : item
    )));
  };

  const setRoute = (direction, toId) => {
    const fromId = selected.id;
    const opposite = FLOREANA_OPPOSITE_DIRECTIONS[direction];
    setRoutes(current => {
      const next = cloneRoutes(current);
      next[fromId] ||= {};
      const oldTargetId = next[fromId][direction]?.toId;
      if (oldTargetId && next[oldTargetId]?.[opposite]?.toId === fromId) {
        delete next[oldTargetId][opposite];
      }
      delete next[fromId][direction];

      if (!toId) return next;
      next[toId] ||= {};
      for (const otherDirection of FLOREANA_CARDINAL_DIRECTIONS) {
        if (otherDirection === direction || next[fromId][otherDirection]?.toId !== toId) continue;
        const otherOpposite = FLOREANA_OPPOSITE_DIRECTIONS[otherDirection];
        delete next[fromId][otherDirection];
        if (next[toId][otherOpposite]?.toId === fromId) delete next[toId][otherOpposite];
      }
      const displacedId = next[toId][opposite]?.toId;
      if (displacedId && next[displacedId]?.[direction]?.toId === toId) {
        delete next[displacedId][direction];
      }
      const kind = current[fromId]?.[direction]?.kind || 'land';
      next[fromId][direction] = { toId, kind };
      next[toId][opposite] = { toId: fromId, kind };
      return next;
    });
    if (toId) {
      setBoundaries(current => {
        const next = cloneBoundaries(current);
        next[fromId] ||= {};
        next[toId] ||= {};
        delete next[fromId][DIRECTION_EDGE[direction]];
        delete next[toId][DIRECTION_EDGE[opposite]];
        return next;
      });
    }
  };

  const setRouteKind = (direction, kind) => {
    const fromId = selected.id;
    const targetId = routes[fromId]?.[direction]?.toId;
    if (!targetId) return;
    const opposite = FLOREANA_OPPOSITE_DIRECTIONS[direction];
    setRoutes(current => {
      const next = cloneRoutes(current);
      next[fromId][direction] = { ...next[fromId][direction], kind };
      if (next[targetId]?.[opposite]?.toId === fromId) {
        next[targetId][opposite] = { ...next[targetId][opposite], kind };
      }
      return next;
    });
  };

  const setBoundary = (direction, kind) => {
    if (kind) setRoute(direction, '');
    const edge = DIRECTION_EDGE[direction];
    setBoundaries(current => {
      const next = cloneBoundaries(current);
      next[selected.id] ||= {};
      if (kind) next[selected.id][edge] = kind;
      else delete next[selected.id][edge];
      return next;
    });
  };

  const draftExport = () => JSON.stringify({
    placements: placements.map(placementExport),
    boundaries,
    routeEdges,
  }, null, 2);

  const copyDraft = async () => {
    try {
      await copyToClipboard(draftExport());
      setDraftNotice('Full geography JSON copied');
    } catch (error) {
      setDraftNotice(error.message);
    }
  };

  const copySelected = async () => {
    try {
      await copyToClipboard(JSON.stringify({
        placement: placementExport(selected),
        boundaries: boundaries[selected.id] || {},
        routes: routes[selected.id] || {},
      }, null, 2));
      setDraftNotice(`${selectedRegion?.name || selected.id} copied`);
    } catch (error) {
      setDraftNotice(error.message);
    }
  };

  const resetDraft = () => {
    if (!window.confirm('Discard the saved map-editor draft and restore source data?')) return;
    setPlacements(clonePlacements());
    setRoutes(buildRouteAdjacency());
    setBoundaries(cloneBoundaries());
    setDraftNotice('Restored source geography');
  };

  if (!open || !selected) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[200] bg-[#0e0c09]/96 p-2 text-expedition-parchment sm:p-4">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-sm border border-expedition-brass/70 bg-expedition-panel shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-expedition-brass/55 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-expedition text-lg font-semibold tracking-wide text-expedition-parchment">Floreana Geography Editor</h2>
            <p className="text-[10px] text-expedition-faded">Drag gold dots to place maps; drag label text to offset it. Route edits stay reciprocal and auto-save in this browser.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.11em] ${incompleteInterior.length ? 'border-amber-500/70 text-amber-300' : 'border-emerald-600/70 text-emerald-300'}`}>
              {incompleteInterior.length} interior maps incomplete
            </span>
            <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.11em] ${directionMismatches.length ? 'border-rose-500/70 text-rose-300' : 'border-emerald-600/70 text-emerald-300'}`}>
              {directionMismatches.length} bearing conflicts
            </span>
            <button type="button" className={BUTTON_CLASS} onClick={copyDraft}>Copy geography JSON</button>
            <button type="button" className={BUTTON_CLASS} onClick={resetDraft}>Reset</button>
            <button type="button" aria-label="Close geography editor" className={`${BUTTON_CLASS} px-2.5 text-sm`} onClick={onClose}>✕</button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-h-0 overflow-auto bg-[#173844] p-3 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-expedition-faded">
              <span>Point drag = normalized map position · label drag = pixel offset</span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showAllRoutes} onChange={event => setShowAllRoutes(event.target.checked)} /> All routes</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showTests} onChange={event => setShowTests(event.target.checked)} /> Test maps</label>
              </span>
            </div>
            <div
              ref={mapRef}
              className="relative mx-auto w-full max-w-[1100px] touch-none select-none overflow-hidden rounded-sm border border-expedition-brass/65 bg-[#27505d] shadow-[0_12px_40px_rgba(0,0,0,0.38)]"
              style={{ aspectRatio: `${ISLAND_MAP_ASPECT}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ISLAND_MAP_IMAGE} alt="Painted map of Floreana Island" draggable={false} className="absolute inset-0 h-full w-full object-fill" />
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker id="map-dev-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="1.5" markerHeight="1.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#f4d68c" />
                  </marker>
                </defs>
                {visibleRouteEdges.map(([fromId, direction, toId]) => {
                  const from = placementById[fromId];
                  const to = placementById[toId];
                  if (!from || !to || (!showTests && (from.test || to.test))) return null;
                  const active = fromId === selected.id || toId === selected.id;
                  return (
                    <line
                      key={`${fromId}-${toId}`}
                      x1={from.at[0] * 100}
                      y1={from.at[1] * 100}
                      x2={to.at[0] * 100}
                      y2={to.at[1] * 100}
                      stroke={active ? '#f4d68c' : '#d9c28c'}
                      strokeOpacity={active ? 0.95 : 0.28}
                      strokeWidth={active ? 0.38 : 0.16}
                      strokeDasharray={active ? 'none' : '0.8 0.7'}
                      vectorEffect="non-scaling-stroke"
                      markerEnd={fromId === selected.id ? 'url(#map-dev-arrow)' : undefined}
                    />
                  );
                })}
              </svg>

              {FLOREANA_CARDINAL_DIRECTIONS.map(direction => {
                const route = routes[selected.id]?.[direction];
                const target = placementById[route?.toId];
                if (!target || (!showTests && target.test)) return null;
                const x = (selected.at[0] + target.at[0]) * 50;
                const y = (selected.at[1] + target.at[1]) * 50;
                return (
                  <span key={direction} className="pointer-events-none absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-expedition-goldbright bg-expedition-ink/90 text-[9px] font-bold text-expedition-goldbright shadow-md" style={{ left: `${x}%`, top: `${y}%` }}>
                    {direction}
                  </span>
                );
              })}

              {visiblePlacements.map(placement => {
                const region = regionMaps[placement.id];
                const isSelected = placement.id === selected.id;
                const offset = placement.labelOffset || [0, 20];
                return (
                  <div
                    key={placement.id}
                    className={`absolute z-10 h-0 w-0 ${isSelected ? 'z-30' : 'hover:z-40'}`}
                    style={{ left: `${placement.at[0] * 100}%`, top: `${placement.at[1] * 100}%` }}
                  >
                    <button
                      type="button"
                      title={`Drag ${region?.name || placement.id}`}
                      onPointerDown={event => {
                        event.preventDefault();
                        setSelectedId(placement.id);
                        dragRef.current = { kind: 'point', id: placement.id };
                      }}
                      className={`absolute left-0 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-[0_0_8px_rgba(0,0,0,0.65)] transition hover:scale-150 ${isSelected ? 'h-6 w-6 border-white bg-expedition-goldbright text-expedition-ink' : 'h-4 w-4 border-expedition-ink bg-expedition-goldbright'}`}
                    >
                      {isSelected && <span className="text-[8px] font-black">●</span>}
                    </button>
                    <span
                      className="pointer-events-none absolute left-0 top-0 h-px origin-left bg-expedition-parchment/50"
                      style={{
                        width: `${Math.max(0, Math.hypot(offset[0], offset[1]) - 8)}px`,
                        transform: `rotate(${Math.atan2(offset[1], offset[0]) * (180 / Math.PI)}deg) translateX(7px)`,
                      }}
                    />
                    <button
                      type="button"
                      title={`Drag ${region?.name || placement.id} label`}
                      onPointerDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedId(placement.id);
                        dragRef.current = {
                          kind: 'label',
                          id: placement.id,
                          start: [event.clientX, event.clientY],
                          offset: [...offset],
                        };
                      }}
                      className={`absolute left-0 top-0 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-expedition text-[10px] leading-none shadow-md transition hover:scale-110 ${isSelected ? 'border-expedition-goldbright bg-expedition-ink text-expedition-goldbright' : 'border-expedition-brass/55 bg-expedition-ink/82 text-expedition-parchment'}`}
                      style={{ transform: `translate(-50%, -50%) translate(${offset[0]}px, ${offset[1]}px)` }}
                    >
                      {region?.name || placement.id}
                    </button>
                  </div>
                );
              })}

              <span className="pointer-events-none absolute right-3 top-2 font-expedition text-sm font-bold text-expedition-parchment [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">↑ N</span>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-expedition-brass/55 bg-[#15120e] p-3 sm:p-4">
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.14em] text-expedition-faded">
              Selected map
              <select value={selected.id} onChange={event => setSelectedId(event.target.value)} className="rounded-sm border border-expedition-brass/60 bg-expedition-ink px-2 py-2 font-expedition text-[13px] normal-case tracking-normal text-expedition-parchment outline-none focus:border-expedition-gold">
                {placements.filter(placement => showTests || !placement.test).map(placement => (
                  <option key={placement.id} value={placement.id}>{regionMaps[placement.id]?.name || placement.id}</option>
                ))}
              </select>
            </label>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <Field label="Map X" step={0.001} value={Number(selected.at[0].toFixed(4))} onChange={value => updatePlacement(selected.id, item => ({ ...item, at: [clamp(value, 0, 1), item.at[1]] }))} />
              <Field label="Map Y" step={0.001} value={Number(selected.at[1].toFixed(4))} onChange={value => updatePlacement(selected.id, item => ({ ...item, at: [item.at[0], clamp(value, 0, 1)] }))} />
              <Field label="Label X" value={selected.labelOffset[0]} onChange={value => updatePlacement(selected.id, item => ({ ...item, labelOffset: [value, item.labelOffset[1]] }))} />
              <Field label="Label Y" value={selected.labelOffset[1]} onChange={value => updatePlacement(selected.id, item => ({ ...item, labelOffset: [item.labelOffset[0], value] }))} />
            </div>

            <div className="mt-4 flex items-center justify-between border-y border-expedition-brass/35 py-2">
              <span className="text-[9px] uppercase tracking-[0.14em] text-expedition-faded">Cardinal exits</span>
              <span className={`text-[9px] uppercase tracking-[0.11em] ${isCoastal(selected, boundaries) ? 'text-sky-300' : 'text-emerald-300'}`}>
                {isCoastal(selected, boundaries) ? 'Coastal' : `${Object.keys(routes[selected.id] || {}).length}/4 interior routes`}
              </span>
            </div>

            <div className="mt-2 grid gap-2.5">
              {FLOREANA_CARDINAL_DIRECTIONS.map(direction => {
                const route = routes[selected.id]?.[direction];
                const boundary = boundaries[selected.id]?.[DIRECTION_EDGE[direction]] || '';
                const target = placementById[route?.toId];
                const geometricDirection = target ? mapDirectionBetween(
                  { x: selected.at[0], y: selected.at[1] },
                  { x: target.at[0], y: target.at[1] },
                ) : null;
                const conflicts = geometricDirection && geometricDirection !== direction;
                return (
                  <div key={direction} className={`rounded-sm border p-2 ${conflicts ? 'border-rose-500/65 bg-rose-950/15' : 'border-expedition-brass/40 bg-black/20'}`}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-expedition-gold bg-expedition-ink text-[10px] font-bold text-expedition-goldbright">{direction}</span>
                      <select
                        value={route?.toId || ''}
                        onChange={event => setRoute(direction, event.target.value)}
                        disabled={Boolean(boundary)}
                        className="min-w-0 flex-1 rounded-sm border border-expedition-brass/50 bg-expedition-ink px-2 py-1.5 font-expedition text-[11px] text-expedition-parchment outline-none focus:border-expedition-gold disabled:opacity-45"
                      >
                        <option value="">No route</option>
                        {editableLocations.filter(item => item.id !== selected.id).map(item => (
                          <option key={item.id} value={item.id}>{regionMaps[item.id]?.name || item.id}</option>
                        ))}
                      </select>
                      <select
                        value={route?.kind || 'land'}
                        onChange={event => setRouteKind(direction, event.target.value)}
                        disabled={!route}
                        className="w-[4.7rem] rounded-sm border border-expedition-brass/50 bg-expedition-ink px-1.5 py-1.5 text-[9px] uppercase text-expedition-faded outline-none disabled:opacity-35"
                      >
                        {ROUTE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pl-8">
                      <span className="text-[9px] uppercase tracking-[0.1em] text-expedition-faded">Boundary</span>
                      <select value={boundary} onChange={event => setBoundary(direction, event.target.value)} disabled={Boolean(route)} className="rounded-sm border border-expedition-brass/45 bg-expedition-ink px-1.5 py-1 text-[9px] uppercase text-expedition-faded outline-none disabled:opacity-35">
                        <option value="">Open</option>
                        <option value="ocean">Ocean</option>
                        <option value="cliff">Cliff</option>
                      </select>
                      {conflicts && <span className="ml-auto text-[9px] text-rose-300">drawn {geometricDirection}, set {direction}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {incompleteInterior.length > 0 && (
              <div className="mt-4 rounded-sm border border-amber-600/45 bg-amber-950/15 p-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-amber-300">Interior maps missing routes</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {incompleteInterior.map(item => (
                    <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="rounded-sm border border-amber-700/45 px-1.5 py-1 text-[9px] text-amber-100 hover:border-amber-400">
                      {regionMaps[item.id]?.name || item.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={BUTTON_CLASS} onClick={copySelected}>Copy selected</button>
              {draftNotice && <span className="text-[9px] text-expedition-faded">{draftNotice}</span>}
            </div>
            <p className="mt-3 text-[10px] italic leading-relaxed text-expedition-faded">
              This is a safe draft surface: it does not rewrite source files. Copy the full JSON after arranging the island, then use it to update the shared geography source.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
