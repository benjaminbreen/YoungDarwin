'use client';

import React from 'react';
import { PlayerController } from './player/PlayerController';
import { SymsCovington } from './world/SymsCovington';
import { SpecimenActor } from './world/SpecimenActor';
import { threeSpecimens } from '../data';
import { Beagle } from './scene/Beagle';
import { Atmosphere } from './scene/Atmosphere';
import { Flora } from './scene/Flora';
import { Landmarks } from './scene/Landmarks';
import { Lighting } from './scene/Lighting';
import { Rocks } from './scene/Rocks';
import { Terrain } from './scene/Terrain';
import { Water } from './scene/Water';
import { WorldDetails } from './scene/WorldDetails';

export function ThreeScene({ perfSettings }) {
  const settings = perfSettings || {};
  return (
    <>
      <Lighting />
      {settings.atmosphere !== false && <Atmosphere />}
      {settings.water !== false && <Water />}
      {settings.terrain !== false && <Terrain />}
      {settings.landmarks !== false && <Landmarks />}
      <Rocks />
      <Flora />
      {settings.worldDetails !== false && <WorldDetails />}
      {settings.beagle !== false && <Beagle />}
      {settings.specimens !== false && threeSpecimens.map(specimen => (
        <SpecimenActor key={specimen.id} specimen={specimen} />
      ))}
      {settings.syms !== false && <SymsCovington />}
      <PlayerController />
    </>
  );
}
