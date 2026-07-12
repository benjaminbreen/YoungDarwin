'use client';

import React from 'react';
import { useThreeGameStore } from '../store';

function planPoint(x, z, dimensions) {
  return {
    x: x + dimensions.width * 0.5,
    y: dimensions.depth * 0.5 - z,
  };
}

export function InteriorFloorPlan({ definition }) {
  const pose = useThreeGameStore(state => state.minimapPlayerPose);
  const blueprint = definition.blueprint;
  const dimensions = blueprint.dimensions;
  const map = blueprint.map || {};
  const patternId = map.patternId || `interior-floor-${definition.id}`;
  const outline = blueprint.outline
    .map(([x, z]) => planPoint(x, z, dimensions))
    .map(point => `${point.x},${point.y}`)
    .join(' ');
  const player = planPoint(pose?.x || 0, pose?.z || 0, dimensions);
  const heading = Number.isFinite(pose?.heading) ? pose.heading : 180;

  return (
    <div className="absolute inset-0 p-2" style={{ backgroundColor: map.paper || '#d8c89e' }}>
      <svg viewBox={`0 0 ${dimensions.width} ${dimensions.depth}`} className="h-full w-full" aria-label={`${definition.label} floor plan`}>
        <defs>
          <pattern id={patternId} width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${map.patternAngle ?? 34})`}>
            <line x1="0" y1="0" x2="0" y2="0.8" stroke={map.ink || '#74583a'} strokeWidth="0.035" opacity="0.32" />
          </pattern>
        </defs>
        <polygon points={outline} fill={`url(#${patternId})`} stroke={map.ink || '#4c3826'} strokeWidth="0.18" />
        {(blueprint.rooms || []).map(room => {
          const [x, z, width, depth] = room.rect;
          const topLeft = planPoint(x, z + depth, dimensions);
          return (
            <g key={room.id}>
              <rect x={topLeft.x} y={topLeft.y} width={width} height={depth} fill={room.available === false ? '#6c5a43' : 'none'} fillOpacity={room.available === false ? 0.12 : 0} stroke="#715236" strokeWidth="0.06" strokeDasharray="0.2 0.16" />
              <text x={topLeft.x + width / 2} y={topLeft.y + 0.7} textAnchor="middle" fontSize="0.42" fontFamily="Georgia" fill="#503a27">{room.label}</text>
            </g>
          );
        })}
        {(blueprint.fixedColliders || []).filter(item => item.kind === 'furniture').map(item => {
          const [x, , z] = item.position;
          const [width, , depth] = item.size;
          const point = planPoint(x, z, dimensions);
          return (
            <rect
              key={item.id}
              x={point.x - width / 2}
              y={point.y - depth / 2}
              width={width}
              height={depth}
              rx="0.08"
              fill="#6e5134"
              fillOpacity="0.36"
              stroke="#513a25"
              strokeWidth="0.06"
              transform={`rotate(${-(item.yaw || 0) * 180 / Math.PI} ${point.x} ${point.y})`}
            />
          );
        })}
        {(blueprint.books || []).map(book => {
          const point = planPoint(book.position[0], book.position[2], dimensions);
          return <circle key={book.id} cx={point.x} cy={point.y} r="0.16" fill="#9c3f32" stroke="#f1d68f" strokeWidth="0.06" />;
        })}
        <g transform={`translate(${player.x} ${player.y}) rotate(${heading})`}>
          <circle r="0.28" fill="#214f54" stroke="#f4dea4" strokeWidth="0.09" />
          <path d="M 0 -0.48 L 0.17 -0.12 L -0.17 -0.12 Z" fill="#f4dea4" />
        </g>
        <g transform={`translate(${dimensions.width / 2} 1.0)`} fill="#513a25" fontFamily="Georgia" textAnchor="middle">
          <text fontSize="0.42">{map.exitLabel || 'WEATHER DECK'}</text>
          <path d="M 0 0.2 L 0 0.75 M -0.2 0.5 L 0 0.75 L 0.2 0.5" stroke="#513a25" strokeWidth="0.08" fill="none" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-[6px] border border-[#684b2c]/40 shadow-[inset_0_0_22px_rgba(73,48,24,0.18)]" />
    </div>
  );
}
