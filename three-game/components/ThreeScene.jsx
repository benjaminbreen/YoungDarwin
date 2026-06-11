'use client';

import React from 'react';
import { PlayerController } from './player/PlayerController';
import { Atmosphere } from './scene/Atmosphere';
import { Lighting } from './scene/Lighting';
import { SkyController } from './scene/SkyController';
import { Water } from './scene/Water';
import { WeatherDirector } from './scene/weather/WeatherDirector';
import { Rain } from './scene/weather/Rain';
import { MistBanks } from './scene/weather/MistBanks';
import { ActiveZoneContent } from '../zones/ActiveZoneContent';
import { PhysicsProvider } from '../physics/PhysicsProvider';

export function ThreeScene({ perfSettings }) {
  const settings = perfSettings || {};
  return (
    <>
      {/* Always mounted: ticks the island weather sim and smooths the shared
          env even when the visual weather FX are toggled off. */}
      <WeatherDirector />
      <SkyController stars={settings.atmosphere !== false} />
      <Lighting />
      {settings.atmosphere !== false && <Atmosphere />}
      {settings.weatherFX !== false && <Rain />}
      {settings.weatherFX !== false && <MistBanks />}
      {settings.water !== false && <Water reflections={settings.reflections !== false} />}
      <PhysicsProvider debug={settings.physicsDebug === true}>
        <ActiveZoneContent settings={settings} />
        <PlayerController physicsDebug={settings.physicsDebug === true} />
      </PhysicsProvider>
    </>
  );
}
