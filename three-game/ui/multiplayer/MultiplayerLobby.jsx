'use client';

import React, { useMemo, useState } from 'react';
import { normalizeRoomCode } from '../../../game-core/multiplayer/protocol';
import { createMultiplayerRoom, joinMultiplayerRoom, multiplayerServiceUrl } from '../../multiplayer/roomApi';

const ERROR_COPY = {
  'multiplayer-not-configured': 'Multiplayer has not been configured for this deployment yet.',
  'invalid-room-code': 'Enter the six-letter room code from your friend.',
  'room-not-found': 'That expedition room could not be found.',
  'room-full': 'That room is full.',
  'deployment-full': 'All public multiplayer seats are occupied. Try again shortly.',
  'role-taken': 'That role is already occupied in this room.',
  'Failed to fetch': 'The realtime service is unavailable. Start the local Worker or try again shortly.',
};

function RoleButton({ roleId, selected, onSelect }) {
  const tortoise = roleId === 'tortoise';
  return (
    <button
      type="button"
      onClick={() => onSelect(roleId)}
      className={`rounded-sm border p-3 text-left transition ${selected ? 'border-expedition-goldbright bg-expedition-gold/18 text-expedition-goldbright' : 'border-expedition-brass/45 bg-black/20 text-expedition-parchment hover:border-expedition-gold/75'}`}
    >
      <span className="block text-[19px] tracking-[0.08em]">{tortoise ? 'Tortoise' : 'Darwin'}</span>
      <span className="mt-1 block text-[11px] leading-snug text-expedition-faded">
        {tortoise ? 'Move slowly and communicate through visible behavior.' : 'Observe and interpret a human-played animal.'}
      </span>
    </button>
  );
}

export function MultiplayerLobby({ onCancel, onAdmitted }) {
  const [mode, setMode] = useState('create');
  const [roleId, setRoleId] = useState('darwin');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const configured = Boolean(multiplayerServiceUrl());
  const submitLabel = mode === 'create' ? 'Create room' : 'Join room';
  const explanation = useMemo(() => (
    mode === 'create'
      ? 'Create an expedition, then copy its code from the in-game room panel.'
      : 'Join the room using the code shown on your friend’s screen.'
  ), [mode]);

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = mode === 'create'
        ? await createMultiplayerRoom({ roleId, displayName })
        : await joinMultiplayerRoom({ roomCode, roleId, displayName });
      onAdmitted?.(session);
    } catch (requestError) {
      setError(requestError.code || requestError.message || 'Unable to enter the room.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="relative px-3 py-2 text-left">
      <h2 className="text-center text-[24px] tracking-[0.08em] text-expedition-goldbright">Multiplayer Expedition</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed text-expedition-parchment/75">{explanation}</p>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-sm border border-expedition-brass/45 bg-black/20 p-1">
        {['create', 'join'].map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { setMode(option); setError(null); }}
            className={`rounded-sm py-2 text-center text-[12px] uppercase tracking-[0.14em] ${mode === option ? 'bg-expedition-gold/18 text-expedition-goldbright' : 'text-expedition-faded hover:text-expedition-parchment'}`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <RoleButton roleId="darwin" selected={roleId === 'darwin'} onSelect={setRoleId} />
        <RoleButton roleId="tortoise" selected={roleId === 'tortoise'} onSelect={setRoleId} />
      </div>
      <label className="mt-3 block text-[10px] uppercase tracking-[0.16em] text-expedition-gold/80">
        Display name
        <input
          value={displayName}
          onChange={event => setDisplayName(event.target.value.slice(0, 28))}
          placeholder={roleId === 'darwin' ? 'Darwin' : 'Tortoise'}
          className="mt-1 block h-10 w-full rounded-sm border border-expedition-brass/55 bg-black/35 px-3 text-[14px] normal-case tracking-normal text-expedition-parchment outline-none focus:border-expedition-goldbright"
        />
      </label>
      {mode === 'join' && (
        <label className="mt-3 block text-[10px] uppercase tracking-[0.16em] text-expedition-gold/80">
          Room code
          <input
            value={roomCode}
            onChange={event => setRoomCode(normalizeRoomCode(event.target.value))}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect="off"
            className="mt-1 block h-11 w-full rounded-sm border border-expedition-brass/55 bg-black/35 px-3 text-center text-[20px] tracking-[0.24em] text-expedition-parchment outline-none focus:border-expedition-goldbright"
          />
        </label>
      )}
      {error && (
        <p className="mt-3 rounded-sm border border-amber-600/55 bg-amber-950/35 px-3 py-2 text-center text-[12px] leading-snug text-amber-100">
          {ERROR_COPY[error] || error}
        </p>
      )}
      {!configured && (
        <p className="mt-3 text-center text-[10px] leading-snug text-expedition-faded">
          Local development expects the realtime Worker at 127.0.0.1:8787.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-sm border border-expedition-brass/45 text-[13px] text-expedition-faded hover:border-expedition-gold/70 hover:text-expedition-gold">Back</button>
        <button type="submit" disabled={busy || (mode === 'join' && roomCode.length !== 6)} className="h-10 rounded-sm border border-expedition-gold/80 bg-expedition-gold/14 text-[14px] text-expedition-goldbright hover:bg-expedition-gold/22 disabled:cursor-not-allowed disabled:opacity-45">
          {busy ? 'Reserving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
