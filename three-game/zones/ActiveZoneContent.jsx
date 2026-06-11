'use client';

import React from 'react';
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

export function ActiveZoneContent({ settings }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const specimens = getThreeSpecimens(currentZoneId);

  return (
    <>
      {settings.terrain !== false && <Terrain />}
      {settings.terrain !== false && <BorderVistas />}
      <PhysicsTerrain />
      {settings.landmarks !== false && <Landmarks />}
      {settings.worldDetails !== false && <WorldDetails />}
      {settings.physicsObstacles !== false && <PhysicsObstacles />}
      {settings.physicsProps !== false && <PhysicsProps />}
      {settings.waterSplashes !== false && <WaterSplashes />}
      {settings.beagle !== false && <Beagle />}
      {settings.specimens !== false && specimens.map(specimen => (
        <SpecimenActor key={specimen.instanceId || specimen.id} specimen={specimen} />
      ))}
      {settings.syms !== false && <SymsCovington />}
    </>
  );
}
