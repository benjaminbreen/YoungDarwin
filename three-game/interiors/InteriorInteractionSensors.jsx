'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { getReadableBook } from '../books/bookCatalog';
import { getInteriorInteractions, getInteriorNarrationTriggers } from './interiorRegistry';

export function InteriorInteractionSensors({ zoneId }) {
  const setInteriorPrompt = useThreeGameStore(state => state.setInteriorPrompt);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const lastUpdateRef = useRef(0);
  const firedNarrationRef = useRef(new Set());

  useEffect(() => () => {
    const state = useThreeGameStore.getState();
    if (state.interiorPrompt?.zoneId === zoneId) setInteriorPrompt(null);
  }, [setInteriorPrompt, zoneId]);

  useEffect(() => {
    const arrival = getInteriorNarrationTriggers(zoneId).find(trigger => trigger.mode === 'arrival');
    if (!arrival?.text) return undefined;
    const key = `${zoneId}:${arrival.id}`;
    if (!firedNarrationRef.current.has(key)) {
      firedNarrationRef.current.add(key);
      useThreeGameStore.getState().recordScriptedNarration?.({ key: `interior:${key}`, text: arrival.text, meta: { zoneId, triggerId: arrival.id } });
    }
    return undefined;
  }, [zoneId]);

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastUpdateRef.current < 0.08) return;
    lastUpdateRef.current = clock.elapsedTime;
    if (playableModeId !== 'darwin') {
      if (useThreeGameStore.getState().interiorPrompt?.zoneId === zoneId) setInteriorPrompt(null);
      return;
    }
    const pose = getRuntimePlayerPose();
    const player = pose?.position;
    if (!player) return;
    for (const trigger of getInteriorNarrationTriggers(zoneId)) {
      if (!trigger.position || !trigger.text) continue;
      const key = `${zoneId}:${trigger.id}`;
      if (firedNarrationRef.current.has(key)) continue;
      const distance = Math.hypot(player.x - trigger.position[0], player.z - trigger.position[2]);
      if (distance > (trigger.radius || 2.5)) continue;
      firedNarrationRef.current.add(key);
      useThreeGameStore.getState().recordScriptedNarration?.({ key: `interior:${key}`, text: trigger.text, meta: { zoneId, triggerId: trigger.id } });
    }
    let nearest = null;
    for (const interaction of getInteriorInteractions(zoneId)) {
      const position = interaction.position || [0, 0, 0];
      const distance = Math.hypot(player.x - position[0], player.z - position[2]);
      if (distance > (interaction.radius || 2.4)) continue;
      if (!nearest || distance < nearest.distance) nearest = { ...interaction, distance };
    }
    const current = useThreeGameStore.getState().interiorPrompt;
    if (!nearest) {
      if (current?.zoneId === zoneId) setInteriorPrompt(null);
      return;
    }
    const book = nearest.bookId ? getReadableBook(nearest.bookId) : null;
    const prompt = {
      ...nearest,
      id: `interior:${zoneId}:${nearest.id}`,
      zoneId,
      label: book?.shortTitle || nearest.label,
      text: nearest.text || (nearest.mode === 'read-book'
        ? `Press E to read ${book?.shortTitle || 'book'}`
        : `Press E to sleep in ${nearest.label}`),
    };
    if (current?.id !== prompt.id || Math.abs((current?.distance || 0) - prompt.distance) > 0.08) {
      setInteriorPrompt(prompt);
    }
  });

  return null;
}
