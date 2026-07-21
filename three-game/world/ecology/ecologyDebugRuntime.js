'use client';

import { useSyncExternalStore } from 'react';

const DEFAULT_SPECIES_ID = 'jasminocereus-thouarsii';
const SERVER_SNAPSHOT = Object.freeze({ enabled: false, speciesId: DEFAULT_SPECIES_ID });
let snapshot = SERVER_SNAPSHOT;
const listeners = new Set();

function publish(next) {
  snapshot = Object.freeze({ ...snapshot, ...next });
  listeners.forEach(listener => listener());
  return snapshot;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEcologyDebugState() {
  return snapshot;
}

export function setEcologyDebugEnabled(enabled) {
  return publish({ enabled: enabled === true });
}

export function toggleEcologyDebug() {
  return publish({ enabled: !snapshot.enabled });
}

export function setEcologyDebugSpecies(speciesId) {
  if (!speciesId) return snapshot;
  return publish({ speciesId });
}

export function useEcologyDebugState() {
  return useSyncExternalStore(subscribe, getEcologyDebugState, () => SERVER_SNAPSHOT);
}
