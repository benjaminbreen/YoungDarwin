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
import { RemotePlayerActors } from '../multiplayer/RemotePlayerActors';

export function ThreeScene({
  perfSettings,
  contentPhase = 6,
  openingCamera = null,
  inputLocked = false,
  actorMotionPaused = false,
  onPlayerAnimationBanksReady = null,
  onPlayerVisualReady = null,
}) {
  const settings = perfSettings || {};
  const stagedPhase = Number.isFinite(contentPhase) ? contentPhase : 6;
  const environmentReady = stagedPhase >= 1;
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
          shadowQuality={settings.shadowQuality || 'ultra'}
          shadowUpdatesPaused={settings.shadowUpdatesPaused === true}
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
            reflectionUpdatesPaused={settings.reflectionUpdatesPaused === true}
          />
        )
      )}
      {/* A region owns one complete Rapier world. Reusing the same world while
          React removes and recreates a whole region's heightfield, obstacles,
          and props eventually recycles handles still referenced by Rapier's
          broad phase/character queries and poisons the WASM borrow state.
          Travel is already covered by the chart, so rebuild the small physics
          container with the destination while renderer/assets stay cached. */}
      <PhysicsProvider key={`region-physics:${currentZoneId}`} debug={settings.physicsDebug === true}>
        <FaunaFrameScheduler />
        {/* World and player stream independently. A late prop/specimen GLB can
            no longer blank Darwin, and a deferred animation bank can no
            longer blank the island. */}
        <Suspense fallback={null}>
          <ActiveZoneContent
            settings={settings}
            contentPhase={stagedPhase}
            actorMotionPaused={actorMotionPaused}
          />
        </Suspense>
        <Suspense fallback={null}>
          <PlayerController
            physicsDebug={settings.physicsDebug === true}
            openingCamera={openingCamera}
            inputLocked={inputLocked}
            animationBankPhase={stagedPhase}
            onAnimationBanksReady={onPlayerAnimationBanksReady}
            onVisualReady={onPlayerVisualReady}
          />
        </Suspense>
        <Suspense fallback={null}>
          <RemotePlayerActors />
        </Suspense>
      </PhysicsProvider>
      {outdoors && <GroundedWorldFX
        enabled={environmentReady && settings.worldDetails !== false}
        terrainDust={settings.playerFX !== false && settings.terrainDust !== false}
        waterRipples={environmentReady && settings.water !== false && settings.waterSplashes !== false}
      />}
    </>
  );
}
