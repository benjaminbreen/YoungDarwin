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
import { useThreeGameStore } from '../store';
import { getInteriorDefinition } from '../interiors/interiorRegistry';
import { FaunaFrameScheduler } from '../fauna/FaunaFrameScheduler';

export function ThreeScene({
  perfSettings,
  contentPhase = 6,
  openingCamera = null,
  inputLocked = false,
}) {
  const settings = perfSettings || {};
  const stagedPhase = Number.isFinite(contentPhase) ? contentPhase : 6;
  const environmentReady = stagedPhase >= 2;
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const interior = getInteriorDefinition(currentZoneId);
  const outdoors = !interior;
  const exteriorAtmosphere = outdoors || interior?.scene?.exteriorAtmosphere === true;
  return (
    <>
      {/* Always mounted: ticks the island weather sim and smooths the shared
          env even when the visual weather FX are toggled off. */}
      <WeatherDirector />
      {outdoors && (
        <SkyController
          stars={settings.atmosphere !== false}
          shadowQuality={settings.shadowQuality || 'high'}
          solarEffects={{
            halo: settings.solarSunHalo !== false,
            sceneFlares: settings.solarSceneFlares !== false,
            sunFacingGrade: settings.solarSunFacingGrade !== false,
            screenGlare: settings.solarScreenGlare !== false || settings.solarLensGhosts !== false,
          }}
        />
      )}
      {outdoors && <Lighting />}
      {exteriorAtmosphere && environmentReady && (
        <Suspense fallback={null}>
          {settings.atmosphere !== false && <Atmosphere />}
          {outdoors && settings.weatherFX !== false && <WeatherFront />}
          {outdoors && settings.weatherFX !== false && <Rain />}
          {outdoors && settings.weatherFX !== false && <MistBanks />}
          {outdoors && settings.weatherFX !== false && <LightningFX />}
          {outdoors && settings.weatherFX !== false && <GroundMist />}
        </Suspense>
      )}
      {settings.water !== false && (!interior || interior.scene?.water !== false) && (
        interior ? (
          <group position={[0, -1.25, 0]}>
            <Water quality={settings.waterQuality || 'polished'} reflections={false} allowInterior openOceanOnly />
          </group>
        ) : (
          <Water
            quality={settings.waterQuality || 'polished'}
            reflections={settings.reflections !== false}
          />
        )
      )}
      <PhysicsProvider debug={settings.physicsDebug === true}>
        <FaunaFrameScheduler />
        <ActiveZoneContent settings={settings} contentPhase={stagedPhase} />
        <PlayerController
          physicsDebug={settings.physicsDebug === true}
          openingCamera={openingCamera}
          inputLocked={inputLocked}
        />
      </PhysicsProvider>
      {outdoors && <GroundedWorldFX
        enabled={environmentReady && settings.worldDetails !== false}
        terrainDust={settings.playerFX !== false && settings.terrainDust !== false}
        waterRipples={environmentReady && settings.water !== false && settings.waterSplashes !== false}
      />}
    </>
  );
}
