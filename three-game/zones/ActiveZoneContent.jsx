'use client';

import React, { Suspense, useMemo } from 'react';
import { Beagle } from '../components/scene/Beagle';
import { Landmarks } from '../components/scene/Landmarks';
import { Terrain } from '../components/scene/Terrain';
import { BorderVistas } from '../components/scene/BorderVistas';
import { WorldDetails } from '../components/scene/WorldDetails';
import { SpecimenActor } from '../components/world/SpecimenActor';
import { PhysicsProps } from '../physics/props/PhysicsProps';
import { WaterSplashes } from '../physics/props/WaterSplash';
import { SymsCovington } from '../components/world/SymsCovington';
import { getThreeSpecimens } from '../data';
import { PhysicsObstacles } from '../physics/PhysicsObstacles';
import { PhysicsTerrain } from '../physics/PhysicsTerrain';
import { useThreeGameStore } from '../store';

export function ActiveZoneContent({ settings, deferredContentReady = true }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const specimens = useMemo(
    () => (deferredContentReady ? getThreeSpecimens(currentZoneId) : []),
    [currentZoneId, deferredContentReady],
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
      {settings.waterSplashes !== false && <WaterSplashes />}
      {deferredContentReady && settings.beagle !== false && (
        <Suspense fallback={null}>
          <Beagle />
        </Suspense>
      )}
      {settings.specimens !== false && specimens.map(specimen => (
        <Suspense key={specimen.instanceId || specimen.id} fallback={null}>
          <SpecimenActor specimen={specimen} />
        </Suspense>
      ))}
      {deferredContentReady && settings.syms !== false && (
        <Suspense fallback={null}>
          <SymsCovington />
        </Suspense>
      )}
    </>
  );
}
