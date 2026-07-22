'use client';

import React from 'react';
import { useThreeGameStore } from '../../store';

const COMPASS_TICKS = Array.from({ length: 72 }, (_, index) => ({
  angle: index * 5,
  major: index % 9 === 0,
  medium: index % 3 === 0,
}));

const CARDINALS = [
  { label: 'N', x: 60, y: 24, primary: true },
  { label: 'E', x: 96, y: 64 },
  { label: 'S', x: 60, y: 103 },
  { label: 'W', x: 24, y: 64 },
];

const ORDINALS = [
  { label: 'NE', x: 85.5, y: 38.5 },
  { label: 'SE', x: 85.5, y: 88 },
  { label: 'SW', x: 34.5, y: 88 },
  { label: 'NW', x: 34.5, y: 38.5 },
];

function normalizedBearing(heading) {
  const value = Number.isFinite(heading) ? 180 - heading : 0;
  return ((value % 360) + 360) % 360;
}

function bearingDirection(bearing) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(bearing / 45) % directions.length];
}

export function CompassDial({ className = '' }) {
  const heading = useThreeGameStore(state => state.minimapPlayerPose.heading);
  const bearing = normalizedBearing(heading);
  const direction = bearingDirection(bearing);
  const roseAngle = -bearing;

  return (
    <div
      data-testid="gameplay-compass"
      role="img"
      aria-label={`Pocket compass bearing ${Math.round(bearing).toString().padStart(3, '0')} degrees ${direction}`}
      className={`expedition-compass-overlay pointer-events-none relative aspect-square select-none rounded-full bg-[conic-gradient(from_16deg,#5f3d17,#d3aa59,#70501f,#f0d188,#684414,#c49a4b,#5f3d17)] p-[6px] text-[#2a1b0d] shadow-[0_16px_32px_rgba(8,5,2,0.5),0_0_0_1px_rgba(54,34,12,0.92),inset_0_1px_2px_rgba(255,235,171,0.78)] ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full border border-[#392510] bg-[#d9c69a] shadow-[inset_0_0_13px_rgba(56,35,15,0.64)]">
        <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
              <defs>
                <radialGradient id="compass-paper" cx="42%" cy="35%" r="72%">
                  <stop offset="0" stopColor="#f3e5b9" />
                  <stop offset="0.62" stopColor="#d9c18b" />
                  <stop offset="1" stopColor="#a98248" />
                </radialGradient>
                <linearGradient id="compass-north-needle" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#a13225" />
                  <stop offset="1" stopColor="#591a16" />
                </linearGradient>
                <filter id="compass-needle-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0.8" dy="1.2" stdDeviation="1.2" floodColor="#241207" floodOpacity="0.72" />
                </filter>
              </defs>
              <circle cx="60" cy="60" r="57" fill="url(#compass-paper)" />
              <circle cx="60" cy="60" r="53.5" fill="none" stroke="#4c351b" strokeWidth="0.75" opacity="0.72" />
              <g stroke="#4f371d" strokeLinecap="round">
                {COMPASS_TICKS.map(tick => (
                  <line
                    key={tick.angle}
                    x1="60"
                    y1={tick.major ? 7 : 9}
                    x2="60"
                    y2={tick.major ? 15 : tick.medium ? 13 : 11.5}
                    strokeWidth={tick.major ? 1.35 : tick.medium ? 0.85 : 0.48}
                    opacity={tick.major ? 0.9 : 0.62}
                    transform={`rotate(${tick.angle} 60 60)`}
                  />
                ))}
              </g>
              <g
                className="expedition-compass-rose"
                style={{
                  '--compass-rose-angle': `${roseAngle}deg`,
                  transform: `rotate(${roseAngle}deg)`,
                  transformBox: 'view-box',
                  transformOrigin: '60px 60px',
                }}
              >
                <circle cx="60" cy="60" r="40" fill="none" stroke="#77572d" strokeWidth="0.6" opacity="0.58" />
                <path d="M60 27 L65 52 L60 47 L55 52 Z" fill="#6c261d" opacity="0.9" />
                <path d="M60 93 L55 68 L60 73 L65 68 Z" fill="#3a3023" opacity="0.78" />
                <path d="M27 60 L52 55 L47 60 L52 65 Z M93 60 L68 65 L73 60 L68 55 Z" fill="#4b3a24" opacity="0.7" />
                <path d="M36.5 36.5 L55 52 L50 50 L52 55 Z M83.5 36.5 L68 55 L70 50 L65 52 Z M36.5 83.5 L52 65 L50 70 L55 68 Z M83.5 83.5 L65 68 L70 70 L68 65 Z" fill="#806437" opacity="0.62" />
                {CARDINALS.map(point => (
                  <text
                    key={point.label}
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={point.primary ? '#8b251c' : '#332416'}
                    fontFamily="Georgia, serif"
                    fontWeight="700"
                    fontSize={point.primary ? 11 : 8}
                  >
                    {point.label}
                  </text>
                ))}
                {ORDINALS.map(point => (
                  <text
                    key={point.label}
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#5e4426"
                    fontFamily="Georgia, serif"
                    fontWeight="600"
                    fontSize="4.8"
                  >
                    {point.label}
                  </text>
                ))}
                <g filter="url(#compass-needle-shadow)">
                  <path d="M60 16 L65.3 59 L60 64 L54.7 59 Z" fill="url(#compass-north-needle)" stroke="#4b160f" strokeWidth="0.65" />
                  <path d="M60 104 L54.7 61 L60 56 L65.3 61 Z" fill="#e8dfc1" stroke="#403725" strokeWidth="0.65" />
                  <path d="M60 20 L60 58" stroke="#edb38c" strokeWidth="0.8" opacity="0.72" />
                </g>
                <circle cx="60" cy="60" r="5.7" fill="#8f6b30" stroke="#3c260e" strokeWidth="1" />
                <circle cx="58.5" cy="58.3" r="1.65" fill="#f6dea0" opacity="0.82" />
              </g>
              <path d="M60 2.5 L56.5 9 H63.5 Z" fill="#f4d486" stroke="#5d3c15" strokeWidth="0.6" />
              <circle cx="60" cy="60" r="55.7" fill="none" stroke="#fff0bd" strokeWidth="0.65" opacity="0.36" />
        </svg>
        <span className="expedition-compass-glint absolute -inset-[45%] rotate-[24deg] bg-[linear-gradient(90deg,transparent_42%,rgba(255,247,215,0.24)_50%,transparent_58%)]" />
        <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded-full border border-[#5f411d]/55 bg-[rgba(242,222,173,0.88)] px-[9%] py-[1.5%] font-expedition text-[9px] font-bold tabular-nums tracking-[0.08em] text-[#4a3118] shadow-[0_1px_4px_rgba(42,25,10,0.42)]">
          {Math.round(bearing).toString().padStart(3, '0')}° {direction}
        </span>
      </div>
    </div>
  );
}

export function compassBearingFromHeading(heading) {
  return normalizedBearing(heading);
}
