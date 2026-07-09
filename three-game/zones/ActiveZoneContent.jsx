'use client';

import React, { Suspense, useMemo } from 'react';
import { Beagle } from '../components/scene/Beagle';
import { HmsBeagleDeck } from '../components/scene/HmsBeagleDeck';
import { Landmarks } from '../components/scene/Landmarks';
import { Terrain } from '../components/scene/Terrain';
import { BorderVistas } from '../components/scene/BorderVistas';
import { WorldDetails } from '../components/scene/WorldDetails';
import { ExaminableItems } from '../components/world/ExaminableItemActor';
import { SpecimenActor } from '../components/world/SpecimenActor';
import { SnareTraps } from '../components/world/SnareTrapActor';
import { AnimalDroppings } from '../components/world/AnimalDroppings';
import { PhysicsProps } from '../physics/props/PhysicsProps';
import { WatkinsCabin } from '../physics/structures/WatkinsCabin';
import { PenalInmateCabin } from '../physics/structures/PenalInmateCabin';
import { WaterSplashes } from '../physics/props/WaterSplash';
import { SymsCovington } from '../components/world/SymsCovington';
import { AnimalModeDarwinNpc } from '../components/world/AnimalModeDarwinNpc';
import { getThreeSpecimens } from '../data';
import { PhysicsObstacles } from '../physics/PhysicsObstacles';
import { PhysicsTerrain } from '../physics/PhysicsTerrain';
import { useThreeGameStore } from '../store';

export function ActiveZoneContent({ settings, deferredContentReady = true }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const playableHiddenActorId = useThreeGameStore(state => state.playableHiddenActorId);
  const specimens = useMemo(
    () => {
      if (!deferredContentReady) return [];
      const collected = new Set(collectedSpecimenActorIds || []);
      return getThreeSpecimens(currentZoneId).filter(specimen => {
        const actorId = specimen.instanceId || specimen.id;
        return actorId !== playableHiddenActorId && !collected.has(actorId);
      });
    },
    [collectedSpecimenActorIds, currentZoneId, deferredContentReady, playableHiddenActorId],
  );

  return (
    <>
      {settings.terrain !== false && <Terrain />}
      {settings.terrain !== false && <BorderVistas />}
      <PhysicsTerrain />
      {settings.landmarks !== false && <Landmarks />}
      {deferredContentReady && settings.worldDetails !== false && (
        <Suspense fallback={null}>
          <WorldDetails settings={settings} />
        </Suspense>
      )}
      {settings.physicsObstacles !== false && <PhysicsObstacles />}
      {settings.physicsProps !== false && <PhysicsProps />}
      {settings.physicsProps !== false && currentZoneId === 'WATKINS' && <WatkinsCabin />}
      {settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalInmateCabin />}
      {settings.waterSplashes !== false && <WaterSplashes />}
      {deferredContentReady && <SnareTraps />}
      {deferredContentReady && <AnimalDroppings />}
      {deferredContentReady && settings.beagle !== false && (
        <Suspense fallback={null}>
          <Beagle />
        </Suspense>
      )}
      {currentZoneId === 'BEAGLE' && (
        <Suspense fallback={null}>
          <HmsBeagleDeck />
        </Suspense>
      )}
      {settings.specimens !== false && specimens.map(specimen => (
        <Suspense key={specimen.instanceId || specimen.id} fallback={null}>
          <SpecimenActor specimen={specimen} />
        </Suspense>
      ))}
      {deferredContentReady && settings.worldDetails !== false && <ExaminableItems />}
      {deferredContentReady && settings.syms !== false && (
        <Suspense fallback={null}>
          <SymsCovington />
        </Suspense>
      )}
      {deferredContentReady && settings.npcDarwin !== false && (
        <Suspense fallback={null}>
          <AnimalModeDarwinNpc />
        </Suspense>
      )}
    </>
  );
}
