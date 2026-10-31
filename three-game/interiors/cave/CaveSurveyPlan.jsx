'use client';

import React, { useMemo } from 'react';
import { useThreeGameStore } from '../../store';
import { planDistance } from './caveField';
import { caveWalkDistance } from './caveRuntime';

// The local chart for a cave chamber, drawn like a 19th-century mine survey:
// hatched rock, inked walls, stippled floor, and the passages to neighbouring
// chambers named at their mouths. The raster is computed once per chamber from
// the same plan the rock is built from.

const PIXELS_PER_METRE = 9;
const planCache = new Map();

function frameFor(spec) {
  const { min, max } = spec.grid;
  return { minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2] };
}

function hash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function renderSurvey(zoneId, spec, map) {
  if (planCache.has(zoneId)) return planCache.get(zoneId);
  if (typeof document === 'undefined') return null;
  const frame = frameFor(spec);
  const width = Math.round((frame.maxX - frame.minX) * PIXELS_PER_METRE);
  const height = Math.round((frame.maxZ - frame.minZ) * PIXELS_PER_METRE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const paper = [214, 201, 164];
  const rock = [182, 164, 124];
  const ink = [63, 46, 31];
  const water = [138, 158, 160];
  const holes = spec.walk?.holes || [];
  for (let py = 0; py < height; py += 1) {
    const z = frame.minZ + (py + 0.5) / PIXELS_PER_METRE;
    for (let px = 0; px < width; px += 1) {
      const x = frame.minX + (px + 0.5) / PIXELS_PER_METRE;
      const air = planDistance(spec, x, z);
      const walk = caveWalkDistance(spec, x, z);
      let color = paper;
      let alpha = 255;
      if (air > 0) {
        // Rock: diagonal hatching that fades away from the wall.
        const hatch = ((px + py) % 7) < 1 ? 1 : 0;
        const fade = Math.max(0, 1 - air / 3.2);
        color = rock;
        if (hatch && fade > hash(px, py) * 0.9) color = ink;
      } else if (walk > 0 && holes.length) {
        color = water;
        if ((py % 4) === 0 && hash(px * 0.1, py) > 0.4) color = [112, 132, 136];
      } else if (hash(px, py) > 0.985) {
        color = [150, 132, 100];
      }
      // Ink the walls.
      if (Math.abs(air) < 0.13) color = ink;
      const index = (py * width + px) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  // Skylights: dashed circles where the roof is open.
  context.strokeStyle = 'rgba(63,46,31,0.85)';
  context.setLineDash([4, 3]);
  context.lineWidth = 1.4;
  for (const sky of spec.skylights || []) {
    context.beginPath();
    context.arc((sky.x - frame.minX) * PIXELS_PER_METRE, (sky.z - frame.minZ) * PIXELS_PER_METRE, sky.r * PIXELS_PER_METRE, 0, Math.PI * 2);
    context.stroke();
  }
  const result = { url: canvas.toDataURL('image/png'), frame, width, height, paper: map?.paper };
  planCache.set(zoneId, result);
  return result;
}

export function CaveSurveyPlan({ definition }) {
  const pose = useThreeGameStore(state => state.minimapPlayerPose);
  const blueprint = definition.blueprint;
  const spec = blueprint.cave;
  const map = useMemo(() => blueprint.map || {}, [blueprint.map]);
  const survey = useMemo(() => renderSurvey(definition.id, spec, map), [definition.id, map, spec]);
  if (!survey) return null;
  const { frame } = survey;
  const viewWidth = frame.maxX - frame.minX;
  const viewHeight = frame.maxZ - frame.minZ;
  const toPlan = (x, z) => ({ x: x - frame.minX, y: z - frame.minZ });
  const player = toPlan(pose?.x || 0, pose?.z || 0);
  // Pose heading is 0 when facing +z (south). North is up on a survey, so
  // the marker turns the other way round from the house plans.
  const heading = 180 - (Number.isFinite(pose?.heading) ? pose.heading : 180);
  const ink = map.ink || '#3f2e1f';
  const fontSize = Math.max(0.8, viewWidth / 30);

  return (
    <div className="absolute inset-0" style={{ backgroundColor: map.paper || '#d6c9a4' }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-label={`${definition.label} survey`}
      >
        <image href={survey.url} x="0" y="0" width={viewWidth} height={viewHeight} preserveAspectRatio="none" style={{ imageRendering: 'auto' }} />
        {(map.labels || []).map(label => {
          const point = toPlan(label.at[0], label.at[1]);
          return (
            <text key={label.text} x={point.x} y={point.y} textAnchor="middle" fontSize={fontSize * 0.82} fontFamily="Georgia" fontStyle="italic" fill={ink} opacity="0.85">
              {label.text}
            </text>
          );
        })}
        {(map.passages || []).map(passage => {
          const point = toPlan(passage.at[0], passage.at[1]);
          return (
            <g key={passage.label}>
              <text x={point.x} y={point.y} textAnchor="middle" fontSize={fontSize * 0.7} fontFamily="Georgia" letterSpacing="0.06" fill={ink}>
                {passage.label}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${player.x} ${player.y}) rotate(${heading})`}>
          <circle r={fontSize * 0.55} fill="#214f54" stroke="#f4dea4" strokeWidth={fontSize * 0.16} />
          <path d={`M 0 ${-fontSize * 0.95} L ${fontSize * 0.33} ${-fontSize * 0.24} L ${-fontSize * 0.33} ${-fontSize * 0.24} Z`} fill="#f4dea4" />
        </g>
        <g transform={`translate(${viewWidth - fontSize * 1.6} ${fontSize * 1.6})`} fill={ink} fontFamily="Georgia" textAnchor="middle">
          <path d={`M 0 ${-fontSize} L ${fontSize * 0.35} ${fontSize * 0.4} L 0 ${fontSize * 0.15} L ${-fontSize * 0.35} ${fontSize * 0.4} Z`} />
          <text y={fontSize * 1.35} fontSize={fontSize * 0.75}>N</text>
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-[6px] border border-[#684b2c]/40 shadow-[inset_0_0_22px_rgba(73,48,24,0.22)]" />
    </div>
  );
}
