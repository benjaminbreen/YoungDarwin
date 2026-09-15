// A fixed set of point lights, mounted once and never added to or removed.
//
// three bakes the scene's point-light count into every material's program
// cache key, so a light that mounts late forks a second program for every
// material already drawn — the same shader, linked twice. Boot used to ramp
// 1 -> 2 -> 3 -> 4 lights over five seconds and pay for it four times: 175 of
// 277 built-in programs at Post Office Bay existed only because of that ramp.
//
// So the lights are permanent and the consumers borrow one. A slot is an
// ordinary THREE.PointLight parked at intensity 0 under the scene root;
// borrowers drive it by writing world position, colour and intensity each
// frame. Releasing a slot returns it to intensity 0 rather than unmounting it.
//
// The budget is per zone and should equal what the zone actually reaches, not
// a generous ceiling: every slot is evaluated per pixel in every lit shader,
// and this game is fill-bound.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Slots are the DYNAMIC lights only. Lighting.jsx's warm fill is permanent and
// always visible, so it never forks a program and sits outside the budget:
// Post Office Bay's settled four is that fill plus these three.
export const POINT_LIGHT_POOL_DEFAULT_BUDGET = 3;

// The Beagle cabin carries three candlesticks at once on top of the usual set.
const ZONE_BUDGETS = {
  BEAGLE: 6,
  BEAGLE_CABIN: 6,
  LAWSON_HOUSE: 5,
};

export function pointLightBudgetForZone(zoneId) {
  return ZONE_BUDGETS[zoneId] || POINT_LIGHT_POOL_DEFAULT_BUDGET;
}

const slots = [];

function reset(light) {
  light.intensity = 0;
  light.distance = 0;
  light.decay = 2;
  light.color.setRGB(1, 1, 1);
}

export function registerPoolLight(light) {
  if (!light || slots.some(slot => slot.light === light)) return;
  light.castShadow = false;
  reset(light);
  slots.push({ light, owner: null });
}

export function unregisterPoolLight(light) {
  const index = slots.findIndex(slot => slot.light === light);
  if (index >= 0) slots.splice(index, 1);
}

export function acquirePointLight(owner) {
  const held = slots.find(slot => slot.owner === owner);
  if (held) return held.light;
  const free = slots.find(slot => slot.owner === null);
  if (!free) return null;
  free.owner = owner;
  reset(free.light);
  return free.light;
}

export function releasePointLight(owner) {
  const held = slots.find(slot => slot.owner === owner);
  if (!held) return;
  reset(held.light);
  held.owner = null;
}

// Borrow a slot for as long as `enabled` holds. Returns a ref whose `current`
// is the light, or null when the budget is already spent — every consumer must
// handle null, because running out of slots is a tuning outcome, not a bug.
export function usePointLightSlot(enabled = true) {
  const ref = useRef(null);
  const ownerRef = useRef(null);
  if (ownerRef.current === null) ownerRef.current = Symbol('pointLightSlot');

  useEffect(() => {
    if (!enabled) {
      ref.current = null;
      return undefined;
    }
    const owner = ownerRef.current;
    ref.current = acquirePointLight(owner);
    return () => {
      releasePointLight(owner);
      ref.current = null;
    };
  }, [enabled]);

  return ref;
}

// Writes a borrowed light to an anchor's world position. The slot lives at the
// scene root, so a borrower whose anchor is nested cannot rely on the parent
// transform the way a locally mounted light could.
const anchorWorld = new THREE.Vector3();

export function trackPointLightTo(light, anchor, offsetY = 0) {
  if (!light || !anchor) return;
  anchor.getWorldPosition(anchorWorld);
  light.position.set(anchorWorld.x, anchorWorld.y + offsetY, anchorWorld.z);
}
