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
import { SicyosField } from '../physics/props/sicyos/SicyosField';
import { DeliliaField } from '../physics/props/delilia/DeliliaField';
import { LecocarpusField } from '../physics/props/lecocarpus/LecocarpusField';
import { WatkinsCabin } from '../physics/structures/WatkinsCabin';
import { WesternLowlandsCampRuins } from '../physics/structures/WesternLowlandsCampRuins';
import { PenalInmateCabin } from '../physics/structures/PenalInmateCabin';
import { PenalWorkGangCabin } from '../physics/structures/PenalWorkGangCabin';
import { WaterSplashes } from '../physics/props/WaterSplash';
import { SymsCovington } from '../components/world/SymsCovington';
import { StationaryNpcs } from '../components/world/StationaryNpc';
import { AnimalModeDarwinNpc } from '../components/world/AnimalModeDarwinNpc';
import { getThreeSpecimens } from '../data';
import { PhysicsObstacles } from '../physics/PhysicsObstacles';
import { PhysicsTerrain } from '../physics/PhysicsTerrain';
import { useThreeGameStore } from '../store';
import { InteriorZone } from '../interiors/InteriorZone';
import { getInteriorDefinition } from '../interiors/interiorRegistry';
import { getLavaCactusSites } from '../physics/props/lavaCactus/lavaCactusSites';
import { getSicyosSites } from '../physics/props/sicyos/sicyosSites';
import { getDeliliaSites } from '../physics/props/delilia/deliliaSites';
import { getLecocarpusSites } from '../physics/props/lecocarpus/lecocarpusSites';
import { useMultiplayerOccupiedSpecimenActorIds } from '../multiplayer/MultiplayerContext';

export function ActiveZoneContent({
  settings,
  contentPhase = 6,
  actorMotionPaused = false,
}) {
  const stagedPhase = Number.isFinite(contentPhase) ? contentPhase : 6;
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const transitionDestinationId = useThreeGameStore(state => state.transition?.zoneId || null);
  const preparingDestination = transitionDestinationId === currentZoneId;
  // Both launch paths now climb the same fine-grained ladder: what used to be
  // two monolithic integer commits during startup (all of family four, then all
  // of family five) is the same sequence of small decimal stages travel already
  // used. `startupPhase` is only for the families whose launch order genuinely
  // differs from travel.
  const reaches = (phase, startupPhase = phase) => (
    stagedPhase >= (preparingDestination ? phase : startupPhase)
  );
  // Base terrain stays present from phase zero so direct-zone launch and
  // automation never expose the water/clear-color fallback.
  const terrainReady = reaches(0);
  const bordersReady = reaches(2);
  const detailsReady = reaches(3);
  // Startup grounds the player before the opening shot begins, so its collider
  // cannot wait for the staged mounts the way a travel arrival can.
  const physicsTerrainReady = reaches(3.2, 0);
  const ordinaryPropsReady = reaches(3.4);
  const pricklyPearReady = reaches(3.6);
  const lavaCactusReady = reaches(3.6);
  const paloSantoReady = reaches(3.8);
  const latePlantFieldsReady = reaches(4);
  const structuresReady = reaches(4.25);
  const waterSplashesReady = reaches(4.5);
  const interactablesReady = reaches(5.2);
  const beagleReady = reaches(5.4);
  // On initial launch, actor shells mount under the opaque loading treatment at
  // phase three so their Suspense boundaries start real model requests before
  // the HUD reveal. Travel still defers them to the late 5.6/6 phases.
  const specimensReady = reaches(5.6, 3);
  const actorsReady = reaches(6, 3);
  const collectedSpecimenActorIds = useThreeGameStore(state => state.collectedSpecimenActorIds);
  const playableHiddenActorId = useThreeGameStore(state => state.playableHiddenActorId);
  const multiplayerHiddenActorIds = useMultiplayerOccupiedSpecimenActorIds();
  const interior = getInteriorDefinition(currentZoneId);
  const lavaCactusOwnsSpecimen = lavaCactusReady
    && settings.physicsProps !== false
    && getLavaCactusSites(currentZoneId).length > 0;
  const sicyosOwnsSpecimen = latePlantFieldsReady
    && settings.physicsProps !== false
    && getSicyosSites(currentZoneId).length > 0;
  const deliliaOwnsSpecimen = latePlantFieldsReady
    && settings.physicsProps !== false
    && getDeliliaSites(currentZoneId).length > 0;
  const lecocarpusOwnsSpecimen = latePlantFieldsReady
    && settings.physicsProps !== false
    && getLecocarpusSites(currentZoneId).length > 0;
  const specimens = useMemo(
    () => {
      if (!specimensReady) return [];
      const collected = new Set(collectedSpecimenActorIds || []);
      return getThreeSpecimens(currentZoneId).filter(specimen => {
        const actorId = specimen.instanceId || specimen.id;
        return actorId !== playableHiddenActorId
          && !multiplayerHiddenActorIds.has(actorId)
          && !collected.has(actorId)
          && !(lavaCactusOwnsSpecimen && specimen.id === 'cactus')
          && !(sicyosOwnsSpecimen && specimen.id === 'sicyosvillosus')
          && !(deliliaOwnsSpecimen && specimen.id === 'deliliainelegans')
          && !(lecocarpusOwnsSpecimen && specimen.id === 'lecocarpuspinnatifidus');
      });
    },
    [
      collectedSpecimenActorIds,
      currentZoneId,
      deliliaOwnsSpecimen,
      lavaCactusOwnsSpecimen,
      lecocarpusOwnsSpecimen,
      playableHiddenActorId,
      multiplayerHiddenActorIds,
      specimensReady,
      sicyosOwnsSpecimen,
    ],
  );

  if (interior) {
    return (
      <>
        {physicsTerrainReady && <PhysicsTerrain segmentCap={settings.terrainSegmentCap} />}
        {bordersReady && settings.physicsObstacles !== false && <PhysicsObstacles />}
        {ordinaryPropsReady && settings.physicsProps !== false && <PhysicsProps />}
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
      {ordinaryPropsReady && settings.physicsProps !== false && <PhysicsProps />}
      {pricklyPearReady && settings.physicsProps !== false && <PricklyPearField />}
      {lavaCactusReady && settings.physicsProps !== false && <LavaCactusField />}
      {paloSantoReady && settings.physicsProps !== false && <PaloSantoField />}
      {latePlantFieldsReady && settings.physicsProps !== false && <SicyosField />}
      {latePlantFieldsReady && settings.physicsProps !== false && <DeliliaField />}
      {latePlantFieldsReady && settings.physicsProps !== false && <LecocarpusField />}
      {structuresReady && settings.physicsProps !== false && currentZoneId === 'WATKINS' && <WatkinsCabin />}
      {structuresReady && settings.physicsProps !== false && currentZoneId === 'W_LAVA' && <WesternLowlandsCampRuins />}
      {structuresReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalInmateCabin />}
      {structuresReady && settings.physicsProps !== false && currentZoneId === 'PENAL_COLONY' && <PenalWorkGangCabin />}
      {waterSplashesReady && settings.waterSplashes !== false && <WaterSplashes />}
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
          <SymsCovington motionPaused={actorMotionPaused} />
        </Suspense>
      )}
      {actorsReady && settings.syms !== false && (
        <Suspense fallback={null}>
          <StationaryNpcs />
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
