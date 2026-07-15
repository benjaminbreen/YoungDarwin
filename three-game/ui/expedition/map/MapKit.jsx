'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GOLD_LABEL, GoldDivider } from '../ExpeditionPanel';

// Reusable building blocks for chart-style modals: a pannable/zoomable image
// pane, engraved markers, legend rows, the location detail card, and the
// scale bar. Keep these generic — other modals (journal charts, the globe
// detail view) should compose the same pieces for visual consistency.

// ---------------------------------------------------------------------------
// ZoomablePane — pan/zoom viewport over a stretched image layer. Children are
// rendered inside the transformed layer; position them with percentage
// coordinates and they track the image while markers counter-scale.

export function ZoomablePane({
  imageUrl,
  aspect = 1,
  minZoom = 1,
  maxZoom = 4,
  className = '',
  onBackgroundClick,
  overlay,
  children,
}) {
  const viewportRef = useRef(null);
  const [view, setView] = useState({ zoom: 1, cx: 0.5, cy: 0.5 });
  const [paneWidth, setPaneWidth] = useState(0);
  const dragRef = useRef(null);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(entries => {
      setPaneWidth(entries[0]?.contentRect?.width || 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clampView = useCallback((zoom, cx, cy) => {
    const z = Math.max(minZoom, Math.min(maxZoom, zoom));
    const half = 0.5 / z;
    return {
      zoom: z,
      cx: Math.max(half, Math.min(1 - half, cx)),
      cy: Math.max(half, Math.min(1 - half, cy)),
    };
  }, [minZoom, maxZoom]);

  const zoomBy = useCallback((factor, anchor) => {
    setView(prev => {
      const zoom = Math.max(minZoom, Math.min(maxZoom, prev.zoom * factor));
      if (zoom === prev.zoom) return prev;
      // Keep the anchor point (normalized map coords) stationary on screen.
      const ax = anchor ? anchor.x : prev.cx;
      const ay = anchor ? anchor.y : prev.cy;
      const cx = ax - (ax - prev.cx) * (prev.zoom / zoom);
      const cy = ay - (ay - prev.cy) * (prev.zoom / zoom);
      return clampView(zoom, cx, cy);
    });
  }, [clampView, minZoom, maxZoom]);

  const toMapCoords = useCallback(event => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    return {
      x: view.cx + (px - 0.5) / view.zoom,
      y: view.cy + (py - 0.5) / view.zoom,
    };
  }, [view]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const onWheel = event => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      setView(prev => {
        const factor = Math.exp(-event.deltaY * 0.0016);
        const zoom = Math.max(minZoom, Math.min(maxZoom, prev.zoom * factor));
        if (zoom === prev.zoom) return prev;
        const ax = prev.cx + (px - 0.5) / prev.zoom;
        const ay = prev.cy + (py - 0.5) / prev.zoom;
        const cx = ax - (ax - prev.cx) * (prev.zoom / zoom);
        const cy = ay - (ay - prev.cy) * (prev.zoom / zoom);
        return clampView(zoom, cx, cy);
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [clampView, minZoom, maxZoom]);

  const onPointerDown = event => {
    if (event.button !== 0) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cx: view.cx,
      cy: view.cy,
      rect,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setView(prev => clampView(
      prev.zoom,
      drag.cx - dx / (drag.rect.width * prev.zoom),
      drag.cy - dy / (drag.rect.height * prev.zoom),
    ));
  };

  const onPointerUp = event => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved && onBackgroundClick) {
      const point = toMapCoords(event);
      if (point) onBackgroundClick(point, event);
    }
  };

  return (
    <div
      ref={viewportRef}
      className={`relative touch-none select-none overflow-hidden ${dragRef.current ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      style={{ aspectRatio: `${aspect}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
    >
      <div
        className="absolute"
        style={{
          width: `${view.zoom * 100}%`,
          height: `${view.zoom * 100}%`,
          left: `calc(50% - ${view.cx * view.zoom * 100}%)`,
          top: `calc(50% - ${view.cy * view.zoom * 100}%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-fill"
        />
        {typeof children === 'function' ? children(view.zoom) : children}
      </div>
      {/* aged-chart wash + vignette, matching the HUD minimap */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_60%,rgba(10,8,5,0.40)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(227,197,133,0.08),transparent_45%,rgba(10,8,5,0.14))]" />
      {overlay ? overlay({ zoom: view.zoom, paneWidth, zoomIn: () => zoomBy(1.45), zoomOut: () => zoomBy(1 / 1.45) }) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markers

const MARKER_GLYPHS = {
  anchorage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
      <circle cx="12" cy="5" r="2.4" />
      <path d="M12 7.5 V20 M5 13 c0 4 3.2 7 7 7 s7 -3 7 -7 M8.5 10.5 h7" />
    </svg>
  ),
  summit: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
      <path d="M12 4 L21 20 H3 Z" />
    </svg>
  ),
  shipInterior: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M6 21 V4.5 C6 3.7 6.7 3 7.5 3 H17 V21" />
      <path d="M3.5 21 H20.5 M12.5 12 H15" />
    </svg>
  ),
};

export function MapMarker({ location, zoom = 1, selected = false, isCurrent = false, onSelect }) {
  const { kind, status, name } = location;
  const live = status === 'available';
  const glyph = MARKER_GLYPHS[kind];
  const markerSizeClass = kind === 'anchorage' ? 'h-5 w-5' : 'h-6 w-6';
  const labelOffset = location.labelOffset || { x: 0, y: 20 };
  const labelDistance = Math.hypot(labelOffset.x, labelOffset.y);
  const leaderLength = Math.max(0, labelDistance - 13);
  const leaderAngle = Math.atan2(labelOffset.y, labelOffset.x) * (180 / Math.PI);

  let face;
  if (glyph) {
    face = (
      <span className={`flex ${markerSizeClass} items-center justify-center rounded-full border shadow-[0_1px_4px_rgba(0,0,0,0.6)] ${
        live
          ? 'border-expedition-goldbright bg-expedition-ink/80 text-expedition-goldbright'
          : 'border-expedition-brass/80 bg-expedition-ink/70 text-expedition-gold/70'
      }`}>
        {glyph}
      </span>
    );
  } else if (live) {
    face = (
      <span className="block h-4 w-4 rounded-full border-2 border-expedition-ink bg-expedition-goldbright shadow-[0_0_9px_rgba(227,197,133,0.72)]" />
    );
  } else {
    // Uncharted stub: hollow diamond, water locations fainter.
    face = (
      <span className={`block h-2.5 w-2.5 rotate-45 border bg-expedition-ink/55 shadow-[0_1px_3px_rgba(0,0,0,0.55)] ${
        kind === 'water' ? 'border-expedition-parchment/55' : 'border-expedition-gold/85'
      }`} />
    );
  }

  const showLabel = location.labelAlways || selected;

  return (
    <button
      type="button"
      aria-label={name}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); onSelect?.(location); }}
      className="group absolute z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none hover:z-30 focus-visible:z-30"
      style={{
        left: `${location.at.x * 100}%`,
        top: `${location.at.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
      }}
    >
      <span className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-transform duration-150 group-hover:scale-150 group-focus-visible:scale-150 ${selected ? 'scale-125' : ''}`}>
        {(selected || isCurrent) && (
          <span className={`absolute h-8 w-8 rounded-full border ${
            isCurrent
              ? 'animate-ping border-expedition-goldbright/70'
              : 'border-expedition-goldbright/80 shadow-[0_0_10px_rgba(227,197,133,0.5)]'
          }`} />
        )}
        {isCurrent && <span className="absolute h-8 w-8 rounded-full border border-expedition-goldbright/80" />}
        {face}
      </span>
      {leaderLength > 4 && (
        <span
          className={`pointer-events-none absolute left-1/2 top-1/2 h-px origin-left bg-expedition-parchment/65 shadow-[0_1px_2px_rgba(10,8,5,0.9)] transition-opacity duration-150 ${
            showLabel
              ? 'opacity-75'
              : 'opacity-0 group-hover:opacity-90 group-focus-visible:opacity-90'
          }`}
          style={{
            width: `${leaderLength}px`,
            transform: `rotate(${leaderAngle}deg) translateX(8px)`,
          }}
        />
      )}
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 ${
          showLabel
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
        style={{ transform: `translate(-50%, -50%) translate(${labelOffset.x}px, ${labelOffset.y}px)` }}
      >
        <span
          className={`block max-w-[11rem] whitespace-nowrap rounded-sm border border-transparent px-1.5 py-0.5 font-expedition text-[11px] font-semibold italic leading-none tracking-[0.05em] transition-all duration-150 group-hover:scale-125 group-hover:border-expedition-brass/70 group-hover:bg-expedition-ink/90 group-hover:text-[13px] group-hover:not-italic group-focus-visible:scale-125 group-focus-visible:border-expedition-brass/70 group-focus-visible:bg-expedition-ink/90 group-focus-visible:text-[13px] ${
            selected
              ? 'scale-110 border-expedition-gold/65 bg-expedition-ink/85 text-[12px] not-italic text-expedition-goldbright'
              : 'text-expedition-parchment'
          }`}
          style={{ textShadow: '0 1px 2px rgba(10,8,5,0.95), 0 0 7px rgba(10,8,5,0.9)' }}
        >
          {name}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Legend

export function LegendRow({ icon, label, active = true, onToggle }) {
  const body = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-expedition-gold">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-expedition text-[12.5px] text-expedition-parchment">{label}</span>
      {onToggle && (
        <span className={`relative h-3.5 w-3.5 shrink-0 rounded-full border transition ${
          active
            ? 'border-expedition-goldbright bg-expedition-gold shadow-[0_0_7px_rgba(227,197,133,0.6)]'
            : 'border-expedition-brass/60 bg-transparent'
        }`}>
          {!active && <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-expedition-brass/70" />}
        </span>
      )}
    </>
  );
  if (!onToggle) {
    return <div className="flex w-full items-center gap-2.5 px-1.5 py-1">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      title={active ? `Hide ${label}` : `Show ${label}`}
      className={`flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1 text-left transition hover:bg-expedition-gold/8 ${
        active ? '' : 'opacity-45'
      }`}
    >
      {body}
    </button>
  );
}

export function LegendList({ title = 'Map Legend', children }) {
  return (
    <div>
      <div className={`${GOLD_LABEL} mb-1.5`}>{title}</div>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location detail card

export function LocationDetailCard({ title, subtitle, thumbnail, lines = [], note, action }) {
  return (
    <div className="rounded-sm border border-expedition-brass/55 bg-black/25 shadow-[inset_0_1px_0_rgba(227,197,133,0.12)]">
      {thumbnail && (
        <div className="relative h-24 overflow-hidden rounded-t-sm border-b border-expedition-brass/45 bg-[#27505d]">
          {thumbnail}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_55%,rgba(10,8,5,0.5)_100%)]" />
        </div>
      )}
      <div className="grid gap-1.5 px-3 py-2.5">
        <div>
          <div className="font-expedition text-[15px] font-semibold leading-tight text-expedition-parchment">{title}</div>
          {subtitle && <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-expedition-gold/90">{subtitle}</div>}
        </div>
        {lines.map((line, index) => (
          <p key={index} className="font-expedition text-[12px] leading-snug text-expedition-faded">{line}</p>
        ))}
        {note && (
          <>
            <GoldDivider />
            <p className="font-expedition text-[11px] italic leading-snug text-expedition-faded/90">{note}</p>
          </>
        )}
        {action}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scale bar + zoom controls (rendered via ZoomablePane's `overlay` prop)

export function MapScaleBar({ zoom, mapWidthKm, paneWidth = 560, className = '' }) {
  // The bar is a fixed 72px; report how much ground it spans at this zoom.
  const km = (mapWidthKm * (72 / Math.max(1, paneWidth))) / zoom;
  const label = km >= 1 ? `${km.toFixed(km < 3 ? 1 : 0)} km` : `${Math.round(km * 1000)} m`;
  return (
    <div className={`pointer-events-none flex items-center gap-2 ${className}`}>
      <div className="relative h-1.5 w-[72px] border border-expedition-parchment/80 bg-expedition-ink/60">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-expedition-parchment/80" />
      </div>
      <span className="font-expedition text-[10px] font-semibold text-expedition-parchment [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{label}</span>
    </div>
  );
}

export function ZoomControls({ zoomIn, zoomOut, className = '' }) {
  const buttonClass =
    'flex h-7 w-7 items-center justify-center rounded-sm border border-expedition-brass/70 bg-expedition-ink/80 font-expedition text-sm font-bold text-expedition-gold transition hover:border-expedition-gold hover:text-expedition-goldbright';
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button type="button" onClick={zoomIn} className={buttonClass} aria-label="Zoom in">+</button>
      <button type="button" onClick={zoomOut} className={buttonClass} aria-label="Zoom out">−</button>
    </div>
  );
}
