'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useThreeGameStore } from '../../store';
import { getZoneProps } from './propRegistry';
import { PhysicsProp } from './PhysicsProp';
import { PropDebris } from './PropDebris';
import { HammerImpactFX } from './HammerImpactFX';
import { HammerStrikeResolver } from './HammerStrikeResolver';
import { RockSampleSystem } from './RockSampleSystem';
import { emitPropEvent } from './propEvents';
import ShotgunSystem from '../../shooting/ShotgunSystem';
import ShotgunFX from '../../shooting/ShotgunFX';
import SplatTextFX from '../../shooting/SplatTextFX';
import AimReticle from '../../shooting/AimReticle';
import WorldTimeTicker from '../../world/WorldTimeTicker';

// Reveal a mounting list a few entries per frame. Mounting a zone's full
// prop family in one commit measured ~1s of main-thread block (each prop is
// a Rapier body plus a procedural visual); three per frame turns that into
// sub-frame commits. Collapses to "all at once" whenever the list shrinks
// (a break/collect must never remount survivors).
function useProgressiveMountCount(length, perFrame = 3) {
  const [mounted, setMounted] = useState(0);
  useEffect(() => {
    if (mounted >= length) {
      if (mounted > length) setMounted(length);
      return undefined;
    }
    let frameHandle = null;
    const advance = () => {
      setMounted(current => Math.min(length, current + perFrame));
      frameHandle = null;
    };
    frameHandle = requestAnimationFrame(advance);
    return () => {
      if (frameHandle != null) cancelAnimationFrame(frameHandle);
    };
  }, [length, mounted, perFrame]);
  return Math.min(mounted, length);
}

// Mounts every physics prop registered for the current zone, owns the E-key
// carry input, and swaps broken props for tumbling debris + loot.
export function PhysicsProps() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const brokenPropIds = useThreeGameStore(state => state.brokenPropIds);
  const markPropBroken = useThreeGameStore(state => state.markPropBroken);
  const setCarriedObject = useThreeGameStore(state => state.setCarriedObject);
  const setCarryPrompt = useThreeGameStore(state => state.setCarryPrompt);
  const [debrisEvents, setDebrisEvents] = useState([]);

  const props = useMemo(
    () => getZoneProps(currentZoneId).filter(prop => !brokenPropIds.includes(prop.id)),
    [brokenPropIds, currentZoneId],
  );
  const mountedCount = useProgressiveMountCount(props.length);
  const mountedProps = mountedCount >= props.length ? props : props.slice(0, mountedCount);

  const handleBreak = useCallback((prop, impact) => {
    const state = useThreeGameStore.getState();
    if (state.brokenPropIds.includes(prop.id)) return;
    if (state.carriedObjectId === prop.id) setCarriedObject(null);
    if (state.carryPrompt?.id === prop.id) setCarryPrompt(null);
    markPropBroken(prop.id, prop.behaviors.breakable.loot);
    setDebrisEvents(events => [...events, {
      id: `${prop.id}-debris`,
      debris: prop.behaviors.breakable.debris,
      position: impact.position,
      impactDir: impact.impactDir,
    }]);
    emitPropEvent('prop-broken', { propId: prop.id, ...impact });
  }, [markPropBroken, setCarriedObject, setCarryPrompt]);

  const handleDebrisExpired = useCallback(id => {
    setDebrisEvents(events => events.filter(event => event.id !== id));
  }, []);

  // Debris belongs to the zone it spawned in.
  useEffect(() => {
    setDebrisEvents([]);
  }, [currentZoneId]);

  // Pickup/drop input lives in PlayerController's interact handling (E key);
  // a second listener here would race it and cancel the pickup.
  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.carryPrompt) setCarryPrompt(null);
    if (state.carriedObjectId) setCarriedObject(null);
  }, [setCarriedObject, setCarryPrompt]);

  return (
    <group userData={{
      renderSource: `physics-props:${currentZoneId}`,
      renderLabel: `${currentZoneId} physics props`,
      renderKind: 'physics-props',
      renderPath: null,
    }}>
      <HammerImpactFX />
      <HammerStrikeResolver />
      <RockSampleSystem />
      <WorldTimeTicker />
      <ShotgunSystem />
      <ShotgunFX />
      <SplatTextFX />
      <AimReticle />
      {mountedProps.map(prop => (
        <PhysicsProp key={prop.id} prop={prop} onBreak={handleBreak} />
      ))}
      {debrisEvents.map(event => (
        <PropDebris key={event.id} event={event} onExpired={handleDebrisExpired} />
      ))}
    </group>
  );
}
