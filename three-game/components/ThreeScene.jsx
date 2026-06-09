'use client';

import React from 'react';
import { PlayerController } from './player/PlayerController';
import { Atmosphere } from './scene/Atmosphere';
import { Lighting } from './scene/Lighting';
import { SkyController } from './scene/SkyController';
import { Water } from './scene/Water';
import { ActiveZoneContent } from '../zones/ActiveZoneContent';
import { PhysicsProvider } from '../physics/PhysicsProvider';

export function ThreeScene({ perfSettings }) {
  const settings = perfSettings || {};
  return (
    <>
      <SkyController stars={settings.atmosphere !== false} />
      <Lighting />
      {settings.atmosphere !== false && <Atmosphere />}
      {settings.water !== false && <Water reflections={settings.reflections !== false} />}
      <PhysicsProvider debug={settings.physicsDebug === true}>
        <ActiveZoneContent settings={settings} />
        <PlayerController physicsDebug={settings.physicsDebug === true} />
      </PhysicsProvider>
    </>
  );
}
