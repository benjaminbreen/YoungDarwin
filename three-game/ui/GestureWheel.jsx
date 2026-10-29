'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeGameKeys } from '../input/gameKeys';
import { setTouchControl } from '../input/touchControls';
import { isGameplayInputBlocked } from '../input/typingMode';
import { getPlayableMode } from '../playable/playableModes';
import { useThreeGameStore } from '../store';

// Hold G for the gesture wheel. These used to be six single-letter keys (K sit,
// L look, O point, P pray, I kneel, Y write) that a player had no reason to
// learn; on the wheel they are discoverable and cost no keyboard at all.
// Each choice pulses the same one-frame control a touch button would.
export const GESTURES = [
  { id: 'sit', control: 'sit', label: 'Sit', detail: 'Rest your legs a moment' },
  { id: 'lookAround', control: 'lookAround', label: 'Look around', detail: 'Take in the ground' },
  { id: 'point', control: 'point', label: 'Point', detail: 'Draw Syms’s eye' },
  { id: 'inspect', control: 'inspect', label: 'Kneel', detail: 'Look closely at the ground' },
  { id: 'write', control: 'write', label: 'Write', detail: 'Jot in the field book' },
  { id: 'pray', control: 'pray', label: 'Pray', detail: 'A quiet moment' },
];

const RADIUS = 104;
const DEAD_ZONE = 26;

function GestureGlyph({ id, className = 'h-6 w-6' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  switch (id) {
    case 'sit':
      return (
        <svg {...common}>
          <circle cx="10" cy="4.5" r="2" />
          <path d="M10 7v6h6l1.5 6" />
          <path d="M10 10h4" />
          <path d="M5 13h5M7 13v6" />
        </svg>
      );
    case 'lookAround':
      return (
        <svg {...common}>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      );
    case 'point':
      return (
        <svg {...common}>
          <path d="M4 13h9" />
          <path d="M13 13l7-5" />
          <path d="M17 6.5l3 1.5-1.5 3" />
          <path d="M4 13v4h8" />
        </svg>
      );
    case 'inspect':
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M14.5 14.5 20 20" />
        </svg>
      );
    case 'write':
      return (
        <svg {...common}>
          <path d="M4 20h6" />
          <path d="M15.5 4.5l4 4L9 19l-5 1 1-5Z" />
        </svg>
      );
    case 'pray':
      return (
        <svg {...common}>
          <path d="M12 3c-1.5 3-3 6-3 9v8" />
          <path d="M12 3c1.5 3 3 6 3 9v8" />
          <path d="M9 20h6" />
        </svg>
      );
    default:
      return null;
  }
}

function indexForOffset(dx, dy) {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;
  // 0 is straight up; choices run clockwise.
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  const slice = (Math.PI * 2) / GESTURES.length;
  return Math.round(angle / slice) % GESTURES.length;
}

export function GestureWheel() {
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const available = getPlayableMode(playableModeId).kind !== 'animal';
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const openRef = useRef(false);
  const hoveredRef = useRef(-1);
  const originRef = useRef(null);

  const close = useCallback((performIndex = -1) => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const gesture = GESTURES[performIndex];
    if (gesture) setTouchControl(gesture.control, true);
    hoveredRef.current = -1;
    setHovered(-1);
  }, []);

  useEffect(() => subscribeGameKeys(keys => {
    if (keys.gestures && !openRef.current) {
      if (!available || isGameplayInputBlocked()) return;
      openRef.current = true;
      originRef.current = null;
      setOpen(true);
    } else if (!keys.gestures && openRef.current) {
      close(hoveredRef.current);
    }
  }), [available, close]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerMove = event => {
      // Measure from the screen centre, where the wheel is drawn.
      const dx = event.clientX - window.innerWidth / 2;
      const dy = event.clientY - window.innerHeight / 2;
      const next = indexForOffset(dx, dy);
      if (next !== hoveredRef.current) {
        hoveredRef.current = next;
        setHovered(next);
      }
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(-1);
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [close, open]);

  if (!open) return null;
  const active = GESTURES[hovered] || null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
      role="menu"
      aria-label="Gestures"
      data-testid="gesture-wheel"
    >
      <div className="gesture-wheel-in relative h-[17rem] w-[17rem]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 272 272" aria-hidden>
          <defs>
            <radialGradient id="gesture-wheel-glass" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(12,18,21,0.55)" />
              <stop offset="72%" stopColor="rgba(12,18,21,0.82)" />
              <stop offset="100%" stopColor="rgba(12,18,21,0)" />
            </radialGradient>
          </defs>
          <circle cx="136" cy="136" r="134" fill="url(#gesture-wheel-glass)" />
          <circle cx="136" cy="136" r={RADIUS} fill="none" stroke="rgba(201,163,95,0.28)" strokeWidth="1" />
          <circle cx="136" cy="136" r={RADIUS + 26} fill="none" stroke="rgba(201,163,95,0.12)" strokeWidth="1" strokeDasharray="2 5" />
          {active && (() => {
            const slice = 360 / GESTURES.length;
            const start = (hovered * slice - slice / 2 - 90) * (Math.PI / 180);
            const end = (hovered * slice + slice / 2 - 90) * (Math.PI / 180);
            const r = RADIUS;
            const x1 = 136 + Math.cos(start) * r;
            const y1 = 136 + Math.sin(start) * r;
            const x2 = 136 + Math.cos(end) * r;
            const y2 = 136 + Math.sin(end) * r;
            return (
              <path
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke="rgba(227,197,133,0.9)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            );
          })()}
        </svg>
        {GESTURES.map((gesture, index) => {
          const angle = (index / GESTURES.length) * Math.PI * 2;
          const x = Math.sin(angle) * RADIUS;
          const y = -Math.cos(angle) * RADIUS;
          const selected = index === hovered;
          return (
            <button
              key={gesture.id}
              type="button"
              role="menuitem"
              aria-label={gesture.label}
              onPointerEnter={() => {
                hoveredRef.current = index;
                setHovered(index);
              }}
              onClick={() => close(index)}
              className={`pointer-events-auto absolute left-1/2 top-1/2 flex h-14 w-14 items-center justify-center rounded-full border transition duration-150 ${
                selected
                  ? 'border-expedition-goldbright bg-expedition-gold/25 text-expedition-goldbright shadow-[0_0_22px_rgba(227,197,133,0.35)]'
                  : 'border-expedition-brass/60 bg-[rgba(12,18,21,0.82)] text-expedition-parchment/80'
              }`}
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))${selected ? ' scale(1.1)' : ''}` }}
            >
              <GestureGlyph id={gesture.id} />
            </button>
          );
        })}
        <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-expedition-brass/50 bg-[rgba(12,18,21,0.9)] px-2 text-center font-expedition shadow-[inset_0_0_14px_rgba(0,0,0,0.6)]">
          <span className="text-[14px] font-semibold tracking-[0.04em] text-expedition-goldbright">
            {active ? active.label : 'Gesture'}
          </span>
          <span className="mt-0.5 text-[11px] italic leading-tight text-expedition-faded">
            {active ? active.detail : 'Point, release G'}
          </span>
        </div>
      </div>
    </div>
  );
}
