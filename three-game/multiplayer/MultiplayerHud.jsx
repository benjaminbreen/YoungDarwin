'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TORTOISE_COMMUNICATION_INTENT_LIST } from '../../game-core/multiplayer/tortoiseIntents';
import { getRuntimePlayerPose } from '../store';
import { triggerToolUse } from '../input/touchControls';
import { useMultiplayerClient, useMultiplayerSnapshot } from './MultiplayerContext';

const ERROR_COPY = {
  'darwin-too-far': 'Darwin is too far away to read that behavior.',
  'darwin-unavailable': 'Darwin is not connected to this room.',
  'intent-cooldown': 'Give the moment a little time before signaling again.',
  'not-connected': 'The room is reconnecting.',
  'movement-too-fast': 'The room corrected an implausible movement sample.',
  'zone-locked': 'This first multiplayer room remains in Post Office Bay.',
};

function statusLabel(status) {
  if (status === 'connected') return 'Live';
  if (status === 'reconnecting') return 'Reconnecting';
  if (status === 'connecting') return 'Connecting';
  return status;
}

export function MultiplayerHud() {
  const client = useMultiplayerClient();
  const snapshot = useMultiplayerSnapshot();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [visibleEvent, setVisibleEvent] = useState(null);
  const [, setDistanceTick] = useState(0);
  const latestEvent = snapshot.events[snapshot.events.length - 1] || null;
  const actors = useMemo(() => snapshot.actors.filter(actor => actor.connected), [snapshot.actors]);
  const remoteDarwin = actors.find(actor => actor.roleId === 'darwin' && actor.playerId !== snapshot.playerId);
  const localPose = getRuntimePlayerPose();
  const darwinDistance = remoteDarwin?.targetPose?.position && localPose?.position
    ? Math.hypot(
      remoteDarwin.targetPose.position.x - localPose.position.x,
      remoteDarwin.targetPose.position.z - localPose.position.z,
    )
    : null;

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    const interval = window.setInterval(() => setDistanceTick(value => value + 1), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!latestEvent) return undefined;
    setVisibleEvent(latestEvent);
    const timeout = window.setTimeout(() => setVisibleEvent(null), 10_000);
    return () => window.clearTimeout(timeout);
  }, [latestEvent]);

  if (!client) return null;

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.roomCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const communicate = intent => {
    if (!client.sendIntent(intent.id)) return;
    triggerToolUse(intent.actionId);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 font-expedition text-expedition-parchment">
      <aside className="pointer-events-auto absolute right-3 top-3 w-[min(19rem,calc(100vw-1.5rem))] rounded-md border border-expedition-brass/70 bg-[rgba(10,17,22,0.9)] shadow-[0_14px_34px_rgba(0,0,0,0.48)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span>
            <span className="block text-[9px] uppercase tracking-[0.2em] text-expedition-gold/80">Multiplayer room</span>
            <span className="mt-0.5 block text-[16px] tracking-[0.16em] text-expedition-goldbright">{snapshot.roomCode}</span>
          </span>
          <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.14em] ${snapshot.status === 'connected' ? 'border-emerald-500/60 text-emerald-200' : 'border-amber-500/60 text-amber-200'}`}>
            {statusLabel(snapshot.status)}
          </span>
        </button>
        {expanded && (
          <div className="border-t border-expedition-brass/35 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-expedition-faded">Share this six-letter code with your friend.</span>
              <button type="button" onClick={copyRoomCode} className="rounded-sm border border-expedition-brass/60 px-2 py-1 text-[10px] text-expedition-gold hover:border-expedition-goldbright">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-2 grid gap-1">
              {actors.map(actor => (
                <div key={actor.playerId} className="flex items-center justify-between rounded-sm bg-black/20 px-2 py-1 text-[11px]">
                  <span>{actor.displayName}</span>
                  <span className="uppercase tracking-[0.12em] text-expedition-gold/80">{actor.roleId}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {snapshot.roleId === 'tortoise' && (
        <section className="pointer-events-auto absolute bottom-[6.25rem] right-3 w-[min(23rem,calc(100vw-1.5rem))] rounded-md border border-expedition-brass/70 bg-[rgba(10,17,22,0.92)] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.52)] backdrop-blur-md md:bottom-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] tracking-[0.09em] text-expedition-goldbright">Communicate through behavior</h2>
              <p className="mt-1 text-[10px] leading-snug text-expedition-faded">
                {darwinDistance == null ? 'Waiting for Darwin nearby.' : `Darwin is ${darwinDistance.toFixed(1)} m away.`}
              </p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {TORTOISE_COMMUNICATION_INTENT_LIST.map(intent => (
              <button
                key={intent.id}
                type="button"
                disabled={snapshot.status !== 'connected'}
                onClick={() => communicate(intent)}
                title={intent.text}
                className="min-h-10 rounded-sm border border-expedition-brass/55 bg-expedition-gold/8 px-2 py-1.5 text-left text-[11px] leading-tight text-expedition-parchment transition hover:border-expedition-goldbright hover:bg-expedition-gold/16 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {intent.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleEvent && (
        <div key={visibleEvent.eventId} className="absolute left-1/2 top-[18%] w-[min(31rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-expedition-gold/75 bg-[rgba(13,20,24,0.92)] px-5 py-3 text-center shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="text-[9px] uppercase tracking-[0.2em] text-expedition-gold/75">Observed behavior</div>
          <p className="mt-1 text-[17px] leading-snug text-expedition-parchment">{visibleEvent.text}</p>
          <div className="mt-1 text-[10px] text-expedition-faded">communicated by {visibleEvent.displayName}</div>
        </div>
      )}

      {snapshot.error && (
        <div className="absolute bottom-3 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-amber-500/70 bg-[rgba(36,24,12,0.94)] px-4 py-2 text-center text-[12px] text-amber-100 shadow-lg">
          {ERROR_COPY[snapshot.error] || snapshot.error}
        </div>
      )}
    </div>
  );
}
