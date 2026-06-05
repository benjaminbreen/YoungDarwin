'use client';

import React, { useMemo } from 'react';
import useGameStore from '../hooks/useGameStore';

const WEATHER_KEYWORDS = [
  'stormy',
  'storm',
  'rainy',
  'rain',
  'misty',
  'mist',
  'fog',
  'cloudy',
  'windy',
  'wind',
  'hail',
  'humid',
  'hot',
  'cold',
  'cool',
  'rainbow',
  'night',
  'sunny',
];

function parseMarker(text, marker) {
  const match = String(text || '').match(new RegExp(`\\[${marker}:\\s*([^\\]]+)\\]`, 'i'));
  return match ? match[1].trim() : null;
}

function normalizeWeather(value, hour) {
  const text = String(value || '').toLowerCase();
  const keyword = WEATHER_KEYWORDS.find(item => text.includes(item));
  if (keyword === 'stormy') return 'storm';
  if (keyword === 'mist' || keyword === 'fog') return 'misty';
  if (keyword === 'wind') return 'windy';
  if (keyword === 'rain') return 'rainy';
  if (keyword) return keyword;
  if (hour >= 19 || hour < 5) return 'night';
  return 'sunny';
}

function parseSounds(text) {
  const marker = parseMarker(text, 'SOUNDS');
  if (!marker) return [];
  return marker
    .split(/\.\.\.|;|,/)
    .map(sound => sound.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function weatherIcon(weather) {
  const icons = {
    sunny: '☀️',
    hot: '🌞',
    cloudy: '☁️',
    rainy: '🌧️',
    misty: '🌫️',
    storm: '⛈️',
    windy: '💨',
    hail: '🌨️',
    humid: '💧',
    rainbow: '🌈',
    cold: '❄️',
    cool: '🌤️',
    night: '🌌',
  };
  return icons[weather] || '☀️';
}

function skyClass(weather, hour) {
  if (weather === 'storm') return 'from-slate-800 via-slate-700 to-zinc-900';
  if (weather === 'rainy') return 'from-slate-500 via-slate-400 to-blue-700';
  if (weather === 'misty') return 'from-stone-300 via-slate-300 to-slate-500';
  if (hour >= 19 || hour < 5 || weather === 'night') return 'from-zinc-950 via-blue-950 to-indigo-950';
  if (hour >= 17) return 'from-orange-300 via-rose-300 to-indigo-500';
  if (hour < 7) return 'from-amber-200 via-pink-200 to-sky-400';
  if (weather === 'cloudy') return 'from-slate-300 via-slate-300 to-sky-500';
  if (weather === 'hot' || weather === 'humid') return 'from-yellow-200 via-sky-300 to-blue-500';
  return 'from-blue-200 via-sky-300 to-blue-500';
}

function timeParts(gameTime = 360) {
  const totalMinutes = gameTime % 1440;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return { hour, minute, timeOfDay: hour + minute / 60 };
}

function sunPosition(timeOfDay) {
  const dayStart = 5;
  const dayEnd = 19;
  if (timeOfDay < dayStart || timeOfDay > dayEnd) {
    return { visible: false, x: 0, y: 0 };
  }

  const progress = (timeOfDay - dayStart) / (dayEnd - dayStart);
  return {
    visible: true,
    x: progress * 100,
    y: Math.sin(progress * Math.PI) * 76,
  };
}

function fixedDrops(count) {
  return Array.from({ length: count }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    top: `${(index * 19) % 100}%`,
    delay: `${(index % 7) * 0.14}s`,
    duration: `${0.75 + (index % 4) * 0.12}s`,
  }));
}

function fixedClouds(count) {
  return Array.from({ length: count }, (_, index) => ({
    width: `${70 + (index % 3) * 22}px`,
    height: `${30 + (index % 2) * 14}px`,
    left: `${(index * 23) % 90}%`,
    top: `${12 + (index * 13) % 45}%`,
    delay: `${index * 0.8}s`,
    opacity: 0.42 + (index % 3) * 0.1,
  }));
}

export default function WeatherTimeDisplay() {
  const { gameTime, formatGameTime, daysPassed, narrativeText } = useGameStore();
  const { hour, timeOfDay } = timeParts(gameTime);

  const weather = useMemo(() => {
    return normalizeWeather(parseMarker(narrativeText, 'WEATHER'), hour);
  }, [narrativeText, hour]);
  const sounds = useMemo(() => parseSounds(narrativeText), [narrativeText]);
  const sun = sunPosition(timeOfDay);
  const isNight = hour >= 19 || hour < 5 || weather === 'night';
  const clouds = fixedClouds(weather === 'cloudy' || weather === 'storm' ? 5 : 2);
  const drops = fixedDrops(weather === 'storm' ? 28 : 18);

  return (
    <div className="darwin-panel darwin-portrait flex w-full flex-col items-center">
      <div className={`relative aspect-[16/10] min-h-36 w-full overflow-hidden rounded-md bg-gradient-to-t ${skyClass(weather, hour)}`}>
        {(weather === 'cloudy' || weather === 'storm' || weather === 'misty') && (
          <div className="absolute inset-0">
            {clouds.map((cloud, index) => (
              <div
                key={index}
                className={`absolute rounded-full blur-md ${weather === 'storm' ? 'bg-slate-700/70' : 'bg-white/75'}`}
                style={{
                  width: cloud.width,
                  height: cloud.height,
                  left: cloud.left,
                  top: cloud.top,
                  opacity: cloud.opacity,
                  animation: `driftClouds ${weather === 'storm' ? 70 : 110}s linear infinite`,
                  animationDelay: cloud.delay,
                }}
              />
            ))}
          </div>
        )}

        {(weather === 'rainy' || weather === 'storm' || weather === 'hail') && (
          <div className="absolute inset-0 overflow-hidden bg-blue-950/10">
            {drops.map((drop, index) => (
              <div
                key={index}
                className={weather === 'hail' ? 'absolute rounded-full bg-white/80' : 'absolute w-px bg-white/60'}
                style={{
                  width: weather === 'hail' ? '4px' : undefined,
                  height: weather === 'hail' ? '4px' : weather === 'storm' ? '58px' : '36px',
                  left: drop.left,
                  top: drop.top,
                  animation: `${weather === 'hail' ? 'hailfall' : 'rainfall'} ${drop.duration} linear infinite`,
                  animationDelay: drop.delay,
                }}
              />
            ))}
          </div>
        )}

        {isNight && (
          <div className="absolute inset-0">
            {Array.from({ length: 24 }, (_, index) => (
              <div
                key={index}
                className="absolute rounded-full bg-white"
                style={{
                  width: `${1 + (index % 2)}px`,
                  height: `${1 + (index % 2)}px`,
                  left: `${(index * 41) % 100}%`,
                  top: `${(index * 17) % 80}%`,
                  opacity: 0.35 + (index % 4) * 0.12,
                }}
              />
            ))}
          </div>
        )}

        {sun.visible && !isNight && weather !== 'storm' && (
          <div
            className="absolute"
            style={{
              left: `${sun.x}%`,
              bottom: `${sun.y}%`,
              transform: 'translate(-50%, 50%)',
            }}
          >
            <div className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-100/40 blur-lg" />
            <div className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-100 shadow-lg" />
          </div>
        )}

        {weather === 'rainbow' && (
          <div className="absolute -bottom-24 left-1/2 h-48 w-[150%] -translate-x-1/2 rounded-t-full border-t-[18px] border-red-300/30 shadow-[0_-18px_0_rgba(251,191,36,0.25),0_-36px_0_rgba(74,222,128,0.2),0_-54px_0_rgba(96,165,250,0.2)]" />
        )}

        <div className="absolute bottom-0 left-0 h-px w-full bg-white/20" />
        <div className="absolute right-3 top-3 text-2xl drop-shadow-md">{weatherIcon(weather)}</div>
      </div>

      <div className="mt-1.5 w-full text-center">
        <p className="text-xl font-bold text-darwin-dark">
          {formatGameTime ? formatGameTime() : '6:00 AM'}
          <span className="ml-2 text-sm text-gray-600">Day {daysPassed || 1}</span>
        </p>
        <p className="mb-1 mt-0 text-sm font-medium capitalize text-amber-700">
          {weather}
          {weather === 'hot' ? ' (32 C)' : weather === 'cloudy' ? ' (24 C)' : ''}
        </p>
        {sounds.length > 0 && (
          <p className="mb-1 text-xs italic text-gray-600">
            {sounds.join(' | ')}
          </p>
        )}
      </div>

      <style jsx>{`
        @keyframes rainfall {
          from { transform: translateY(-150%); opacity: 0.65; }
          to { transform: translateY(260%); opacity: 0.25; }
        }

        @keyframes hailfall {
          from { transform: translateY(-150%); opacity: 0.8; }
          to { transform: translateY(260%); opacity: 0.35; }
        }

        @keyframes driftClouds {
          from { transform: translateX(-120%); }
          to { transform: translateX(120%); }
        }
      `}</style>
    </div>
  );
}
