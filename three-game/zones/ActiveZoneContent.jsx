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
import { PaloSantoField } from '../physics/props/paloSanto/PaloSantoField';
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
import { getLavaCactusSites } from '../physics/props/lavaCactus/lavaCactusSites';

export function ActiveZoneContent({ settings, contentPhase = 6 }) {
  const stagedPhase = Number.isFinite(contentPhase) ? contentPhase : 6;
  // Base terrain/collision stay present from phase zero so direct-zone launch
  // and automation never expose the water/clear-color fallback while the
  // richer destination groups are being scheduled.
  const terrainReady = stagedPhase >= 0;
  const bordersReady = stagedPhase >= 2;
  const detailsReady = stagedPhase >= 3;
  const propsReady = stagedPhase >= 4;
  const interactablesReady = stagedPhase >= 5;
  const beagleReady = stagedPhase >= 5;
  const actorsReady = stagedPhase >= 6;
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const transitionDestinationId = useThreeGameStore(state => state.transition?.zoneId || null);
  const preparingDestination = transitionDestinationId === currentZoneId;
  const physicsTerrainReady = terrainReady && (!preparingDestination || stagedPhase >= 4);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const playableHiddenActorId = useThreeGameStore(state => state.playableHiddenActorId);
  const interior = getInteriorDefinition(currentZoneId);
  const lavaCactusOwnsSpecimen = propsReady
    && settings.physicsProps !== false
    && getLavaCactusSites(currentZoneId).length > 0;
  const specimens = useMemo(
    () => {
      if (!interactablesReady) return [];
      const collected = new Set(collectedSpecimenActorIds || []);
      return getThreeSpecimens(currentZoneId).filter(specimen => {
        const actorId = specimen.instanceId || specimen.id;
        return actorId !== playableHiddenActorId
          && !collected.has(actorId)
          && !(lavaCactusOwnsSpecimen && specimen.id === 'cactus');
      });
    },
    [
      collectedSpecimenActorIds,
      currentZoneId,
      interactablesReady,
      lavaCactusOwnsSpecimen,
      playableHiddenActorId,
    ],
  );

  if (interior) {
    return (
      <>
        {physicsTerrainReady && <PhysicsTerrain segmentCap={settings.terrainSegmentCap} />}
        {bordersReady && settings.physicsObstacles !== false && <PhysicsObstacles />}
        {propsReady && settings.physicsProps !== false && <PhysicsProps />}
        {bordersReady && (
          <Suspense fallback={null}>
            <InteriorZone />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      {terrainReady && settings.terrain !== false && <Terrain segmentCap={settings.terrainSegmentCap} />}
      {bordersReady && settings.terrain !== false && (
        <Suspense fallback={null}>
          <BorderVistas preparationPhase={stagedPhase} />
        </Suspense>
      )}
      {physicsTerrainReady && <PhysicsTerrain segmentCap={settings.terrainSegmentCap} />}
      {bordersReady && settings.landmarks !== false && <Landmarks />}
      {detailsReady && settings.worldDetails !== false && (
        <Suspense fallback={null}>
          <WorldDetails settings={settings} contentPhase={stagedPhase} />
        </Suspense>
      )}
      {bordersReady && settings.physicsObstacles !== false && <PhysicsObstacles />}
      {propsReady && settings.physicsProps !== false && <PhysicsProps />}
      {propsReady && settings.physicsProps !== false && <PricklyPearField />}
      {propsReady && settings.physicsProps !== false && <LavaCactusField />}
      {propsReady && settings.physicsProps !== false && <PaloSantoField />}
      {propsReady && settings.physicsProps !== false && currentZoneId === 'WATKINS' && <WatkinsCabin />}
      {propsReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalInmateCabin />}
      {propsReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalWorkGangCabin />}
      {propsReady && settings.waterSplashes !== false && <WaterSplashes />}
      {interactablesReady && <SnareTraps />}
      {interactablesReady && <AnimalDroppings />}
      {beagleReady && settings.beagle !== false && (
        <Suspense fallback={null}>
          <Beagle />
        </Suspense>
      )}
      {beagleReady && currentZoneId === 'BEAGLE' && (
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
