'use client';

import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { MULTIPLAYER_FIXED_ZONE_ID, MULTIPLAYER_POSE_TARGET_HZ } from '../../game-core/multiplayer/protocol';
import { getRuntimePlayerMotion, getRuntimePlayerPose, useThreeGameStore } from '../store';
import { MultiplayerClient } from './MultiplayerClient';

const MultiplayerContext = createContext(null);
const EMPTY_SNAPSHOT = Object.freeze({
  status: 'single-player',
  roomCode: null,
  playerId: null,
  roleId: null,
  actors: Object.freeze([]),
  events: Object.freeze([]),
  error: null,
});

export function MultiplayerProvider({ session, children }) {
  const client = useMemo(() => (session ? new MultiplayerClient(session) : null), [session]);

  useEffect(() => {
    if (!client) return undefined;
    client.connect();
    const store = useThreeGameStore.getState();
    client.setReadyPayload({
      zoneId: MULTIPLAYER_FIXED_ZONE_ID,
      sourceActorId: store.playableHiddenActorId || null,
      pose: getRuntimePlayerPose(),
    });
    const interval = window.setInterval(() => {
      const latestStore = useThreeGameStore.getState();
      const pose = getRuntimePlayerPose();
      const runtimeMotion = getRuntimePlayerMotion();
      const speed = Math.hypot(
        runtimeMotion?.intendedPlanarVelocity?.x || 0,
        runtimeMotion?.intendedPlanarVelocity?.z || 0,
      );
      client.sendPose({
        zoneId: latestStore.currentZoneId,
        pose,
        motion: {
          speed,
          walking: speed > 0.08,
          running: session.roleId === 'darwin' ? speed > 3.2 : speed > 0.82,
        },
      });
    }, 1_000 / MULTIPLAYER_POSE_TARGET_HZ);
    return () => {
      window.clearInterval(interval);
      client.close();
    };
  }, [client, session?.roleId]);

  return <MultiplayerContext.Provider value={client}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayerClient() {
  return useContext(MultiplayerContext);
}

export function useMultiplayerSnapshot() {
  const client = useMultiplayerClient();
  return useSyncExternalStore(
    client?.subscribe || (() => () => {}),
    client?.getSnapshot || (() => EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );
}

export function useMultiplayerRolePresent(roleId) {
  const snapshot = useMultiplayerSnapshot();
  return snapshot.actors.some(actor => actor.roleId === roleId && actor.connected);
}

export function useMultiplayerOccupiedSpecimenActorIds() {
  const snapshot = useMultiplayerSnapshot();
  return useMemo(() => new Set(
    snapshot.actors.map(actor => actor.sourceActorId).filter(Boolean),
  ), [snapshot.actors]);
}
