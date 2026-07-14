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
import { PricklyPearField } from '../physics/props/pricklyPear/PricklyPearField';
import { LavaCactusField } from '../physics/props/lavaCactus/LavaCactusField';
import { WatkinsCabin } from '../physics/structures/WatkinsCabin';
import { PenalInmateCabin } from '../physics/structures/PenalInmateCabin';
import { PenalWorkGangCabin } from '../physics/structures/PenalWorkGangCabin';
import { WaterSplashes } from '../physics/props/WaterSplash';
import { SymsCovington } from '../components/world/SymsCovington';
import { AnimalModeDarwinNpc } from '../components/world/AnimalModeDarwinNpc';
import { getThreeSpecimens } from '../data';
import { PhysicsObstacles } from '../physics/PhysicsObstacles';
import { PhysicsTerrain } from '../physics/PhysicsTerrain';
import { useThreeGameStore } from '../store';
import { InteriorZone } from '../interiors/InteriorZone';
import { getInteriorDefinition } from '../interiors/interiorRegistry';

export function ActiveZoneContent({ settings, contentPhase = 6 }) {
  const stagedPhase = Number.isFinite(contentPhase) ? contentPhase : 6;
  const gameplayReady = stagedPhase >= 1;
  const environmentReady = stagedPhase >= 2;
  const interactablesReady = stagedPhase >= 3;
  const actorsReady = stagedPhase >= 4;
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const playableHiddenActorId = useThreeGameStore(state => state.playableHiddenActorId);
  const interior = getInteriorDefinition(currentZoneId);
  const specimens = useMemo(
    () => {
      if (!interactablesReady) return [];
      const collected = new Set(collectedSpecimenActorIds || []);
      return getThreeSpecimens(currentZoneId).filter(specimen => {
        const actorId = specimen.instanceId || specimen.id;
        return actorId !== playableHiddenActorId && !collected.has(actorId);
      });
    },
    [collectedSpecimenActorIds, currentZoneId, interactablesReady, playableHiddenActorId],
  );

  if (interior) {
    return (
      <>
        <PhysicsTerrain />
        {settings.physicsObstacles !== false && <PhysicsObstacles />}
        {gameplayReady && settings.physicsProps !== false && <PhysicsProps />}
        <Suspense fallback={null}>
          <InteriorZone />
        </Suspense>
      </>
    );
  }

  return (
    <>
      {settings.terrain !== false && <Terrain segmentCap={settings.terrainSegmentCap} />}
      {settings.terrain !== false && <BorderVistas />}
      <PhysicsTerrain />
      {settings.landmarks !== false && <Landmarks />}
      {environmentReady && settings.worldDetails !== false && (
        <Suspense fallback={null}>
          <WorldDetails settings={settings} />
        </Suspense>
      )}
      {settings.physicsObstacles !== false && <PhysicsObstacles />}
      {gameplayReady && settings.physicsProps !== false && <PhysicsProps />}
      {environmentReady && settings.physicsProps !== false && <PricklyPearField />}
      {environmentReady && settings.physicsProps !== false && <LavaCactusField />}
      {environmentReady && settings.physicsProps !== false && currentZoneId === 'WATKINS' && <WatkinsCabin />}
      {environmentReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalInmateCabin />}
      {environmentReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalWorkGangCabin />}
      {gameplayReady && settings.waterSplashes !== false && <WaterSplashes />}
      {interactablesReady && <SnareTraps />}
      {interactablesReady && <AnimalDroppings />}
      {actorsReady && settings.beagle !== false && (
        <Suspense fallback={null}>
          <Beagle />
        </Suspense>
      )}
      {actorsReady && currentZoneId === 'BEAGLE' && (
        <Suspense fallback={null}>
          <HmsBeagleDeck />
        </Suspense>
      )}
      {settings.specimens !== false && specimens.map(specimen => (
        <Suspense key={specimen.instanceId || specimen.id} fallback={null}>
          <SpecimenActor specimen={specimen} />
        </Suspense>
      ))}
      {interactablesReady && settings.worldDetails !== false && <ExaminableItems />}
      {actorsReady && settings.syms !== false && (
        <Suspense fallback={null}>
          <SymsCovington />
        </Suspense>
      )}
      {actorsReady && settings.npcDarwin !== false && (
        <Suspense fallback={null}>
          <AnimalModeDarwinNpc />
        </Suspense>
      )}
    </>
  );
}
