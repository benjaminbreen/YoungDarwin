'use client';

// Watches what Darwin watches. Five times a second it checks the open
// behaviour episodes against where he stands, where the camera looks and
// whether he is keeping still, records the ones he sees through, and tells
// the HUD (or the examine view, during a close look) which one he is
// watching.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerMotion, getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { skyState } from '../../world/celestial';
import { activeBehaviorEpisodes } from './behaviorEpisodes';
import { createObservationWitness } from './observationWitness';
import { observationLabel, speciesName } from './fieldObservations';

const TICK = 0.2;

export function ObservationWatcher() {
  const witness = useMemo(() => createObservationWitness(), []);
  const clock = useRef({ accum: 0 });
  const view = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    clock.current.accum += Math.min(delta, 0.1);
    if (clock.current.accum < TICK) return;
    const dt = clock.current.accum;
    clock.current.accum = 0;
    const state = useThreeGameStore.getState();
    // No watching with an animal in hand. The examine view is a close look
    // at a live animal, so watching carries on through it.
    if (state.carriedObjectId) {
      if (state.watchFocus) state.setWatchFocus(null);
      return;
    }
    // An animal already in the case is no longer out there to be watched,
    // though its last behaviour episode may not have been closed.
    const collected = state.collectedSpecimenActorIds || [];
    const episodes = [...(activeBehaviorEpisodes(state.currentZoneId)?.values() || [])]
      .filter(episode => !collected.includes(episode.actorId) && !collected.includes(episode.partnerActorId));
    const pose = getRuntimePlayerPose();
    const velocity = getRuntimePlayerMotion()?.intendedPlanarVelocity;
    camera.getWorldDirection(view);
    const { done, focus } = witness.tick({
      episodes,
      player: pose?.position,
      view,
      eye: camera.position,
      playerSpeed: velocity ? Math.hypot(velocity.x || 0, velocity.z || 0) : 0,
      daylight: skyState(state.timeOfDay ?? 12, state.day || 1).daylight,
      dt,
    });
    for (const episode of done) state.recordFieldObservation(episode);
    state.setWatchFocus(focus ? {
      episodeId: focus.episode.id,
      actorId: focus.episode.actorId,
      partnerActorId: focus.episode.partnerActorId || null,
      speciesId: focus.episode.speciesId,
      behaviorId: focus.episode.behaviorId,
      behaviorLabel: observationLabel(focus.episode),
      label: `${speciesName(focus.episode.speciesId)}, ${observationLabel(focus.episode)}`,
      progress: Math.round(focus.progress * 20) / 20,
      still: focus.still,
    } : null);
  });

  return null;
}
