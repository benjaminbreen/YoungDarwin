'use client';

import React, { Suspense } from 'react';
import { PlayerController } from './player/PlayerController';
import { Atmosphere } from './scene/Atmosphere';
import { Lighting } from './scene/Lighting';
import { SkyController } from './scene/SkyController';
import { Water } from './scene/Water';
import { GroundedWorldFX } from './scene/GroundedWorldFX';
import { WeatherDirector } from './scene/weather/WeatherDirector';
import { Rain } from './scene/weather/Rain';
import { MistBanks } from './scene/weather/MistBanks';
import { LightningFX } from './scene/weather/LightningFX';
import { GroundMist } from './scene/weather/GroundMist';
import { WeatherFront } from './scene/weather/WeatherFront';
import { ActiveZoneContent } from '../zones/ActiveZoneContent';
import { PhysicsProvider } from '../physics/PhysicsProvider';

export function ThreeScene({ perfSettings, deferredContentReady = true }) {
  const settings = perfSettings || {};
  return (
    <>
      {/* Always mounted: ticks the island weather sim and smooths the shared
          env even when the visual weather FX are toggled off. */}
      <WeatherDirector />
      <SkyController
        stars={settings.atmosphere !== false}
        solarEffects={{
          halo: settings.solarSunHalo !== false,
          sceneFlares: settings.solarSceneFlares !== false,
          sunFacingGrade: settings.solarSunFacingGrade !== false,
        }}
      />
      <Lighting />
      {deferredContentReady && (
        <Suspense fallback={null}>
          {settings.atmosphere !== false && <Atmosphere />}
          {settings.weatherFX !== false && <WeatherFront />}
          {settings.weatherFX !== false && <Rain />}
          {settings.weatherFX !== false && <MistBanks />}
          {settings.weatherFX !== false && <LightningFX />}
          {settings.weatherFX !== false && <GroundMist />}
        </Suspense>
      )}
      {deferredContentReady && settings.water !== false && (
        <Water
          quality={settings.waterQuality || 'performance'}
          reflections={settings.reflections !== false}
        />
      )}
      <PhysicsProvider debug={settings.physicsDebug === true}>
        <ActiveZoneContent settings={settings} deferredContentReady={deferredContentReady} />
        <PlayerController physicsDebug={settings.physicsDebug === true} />
      </PhysicsProvider>
      <GroundedWorldFX
        enabled={deferredContentReady && settings.worldDetails !== false}
        terrainDust={settings.playerFX !== false && settings.terrainDust !== false}
        waterRipples={deferredContentReady && settings.water !== false && settings.waterSplashes !== false}
      />
    </>
  );
}
