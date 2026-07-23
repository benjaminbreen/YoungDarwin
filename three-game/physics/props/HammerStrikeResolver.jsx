'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useThreeGameStore } from '../../store';
import { getRuntimeObstacles } from '../../world/obstacles';
import { triggerHitstop } from '../../world/worldTime';
import { classifyHammerSurfaceImpact } from './hammerSurfaceImpacts';
import { emitPropEvent, isSwingClaimed, onPropEvent } from './propEvents';

// Runs a beat after the shared tool-swing impact moment so every specialized
// consumer (rock sampling, strikeable props, plants, timber) has had its frame
// to claim the swing. Unclaimed swings land as generic material feedback:
// a HammerImpactBurst in the surface's palette, an optional soft ground plume,
// a splash ring over shallow water, and a hitstop beat on hard materials.
const CLAIM_GRACE = 0.08;

export function HammerStrikeResolver() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const zoneRef = useRef(currentZoneId);
  const pendingRef = useRef([]);
  const clockRef = useRef(0);

  useEffect(() => {
    zoneRef.current = currentZoneId;
    pendingRef.current = [];
  }, [currentZoneId]);

  useEffect(() => onPropEvent('tool-swing', event => {
    if (event.tool !== 'hammer') return;
    pendingRef.current.push({
      ...event,
      at: clockRef.current + (event.impactDelay ?? 0.55) + CLAIM_GRACE,
    });
  }), []);

  useFrame((_, delta) => {
    clockRef.current += delta;
    if (!pendingRef.current.length) return;
    const due = pendingRef.current.filter(strike => strike.at <= clockRef.current);
    if (!due.length) return;
    pendingRef.current = pendingRef.current.filter(strike => strike.at > clockRef.current);

    for (const strike of due) {
      if (strike.swingId && isSwingClaimed(strike.swingId)) continue;
      const impact = classifyHammerSurfaceImpact({
        zoneId: zoneRef.current,
        position: strike.position,
        facing: strike.facing,
        obstacles: getRuntimeObstacles(
          zoneRef.current,
          useThreeGameStore.getState().pushableObstacleOffsets,
        ),
      });
      if (!impact) continue;
      if (impact.kind === 'water') {
        emitPropEvent('water-splash', { position: impact.position, intensity: 0.9 });
        continue;
      }
      emitPropEvent('prop-struck', {
        propId: `hammer-surface:${impact.kind}`,
        material: impact.kind === 'rock' || impact.kind === 'volcanic-ground'
          ? 'stone'
          : impact.kind === 'wood' || impact.kind === 'plant'
            ? 'wood'
            : impact.kind,
        position: impact.position,
        impactDir: { x: impact.impactDir.x, y: 0, z: impact.impactDir.z },
        dustCount: impact.dustCount,
        sparkCount: impact.sparkCount,
        dustColor: impact.dustColor,
        sparkColor: impact.sparkColor,
      });
      if (impact.obstacle?.kind === 'boulder') {
        emitPropEvent('rock-hammer-fracture', {
          obstacle: impact.obstacle,
          zoneId: zoneRef.current,
          position: impact.position,
          normal: impact.surfaceNormal || impact.impactDir,
          intensity: 1,
        });
      }
      if (impact.groundPlume) {
        emitPropEvent('surface-contact', {
          kind: 'hammer-ground',
          position: impact.position,
          intensity: 1.15,
          biome: impact.biome,
        });
      }
      if (impact.hitstop) triggerHitstop(impact.hitstop);
    }
  });

  return null;
}
