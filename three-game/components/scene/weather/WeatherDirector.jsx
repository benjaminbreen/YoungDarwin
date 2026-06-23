'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useThreeGameStore } from '../../../store';
import { weatherEnv, dampTowards } from '../../../world/weatherEnvRuntime';
import { weatherProfile } from '../../../world/weatherStates';
import { forceRegionWeather, getRegionWeather, tickWeatherSim } from '../../../world/weatherDirector';

// Smoothing rates (1/s). Rain arrives in seconds; fog, light, and cloud cover
// roll in over tens of seconds so a state change reads as weather, not a cut.
const RAIN_LAMBDA = 0.4;
const SLOW_LAMBDA = 0.12;
const WIND_LAMBDA = 0.1;
const FRONT_LAMBDA = 0.18;

// Ticks the island weather simulation from the game clock, keeps the store's
// weather string in sync for the active zone, and damps the shared runtime
// env that fog, rain, clouds, and lighting read per frame.
export function WeatherDirector() {
  const { scene } = useThree();
  const lastTickMinutes = useRef(null);
  const windAngle = useRef(Math.atan2(weatherEnv.windZ, weatherEnv.windX));

  // Dev console hook: window.__darwinWeather('rain') pins a state on the
  // current zone for a few game hours so each look can be eyeballed.
  useEffect(() => {
    window.__darwinWeather = state => {
      const store = useThreeGameStore.getState();
      forceRegionWeather(store.currentZoneId, state);
      store.setWeatherOverride(null);
      store.setWeather(state);
      return state;
    };
    return () => { delete window.__darwinWeather; };
  }, []);

  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const nowMinutes = (store.day || 1) * 1440 + store.timeOfDay * 60;

    if (lastTickMinutes.current === null || Math.abs(nowMinutes - lastTickMinutes.current) >= 10) {
      lastTickMinutes.current = nowMinutes;
      tickWeatherSim(nowMinutes);

      const override = store.weatherOverride;
      const overrideActive = override && override.untilMinutes > nowMinutes;
      if (override && !overrideActive) store.setWeatherOverride(null);
      const effective = overrideActive
        ? override.state
        : getRegionWeather(store.currentZoneId, nowMinutes) || store.weather;
      if (effective && effective !== store.weather) store.setWeather(effective);
    }

    const target = weatherProfile(store.weather);
    weatherEnv.overcast = dampTowards(weatherEnv.overcast, target.overcast, SLOW_LAMBDA, delta);
    weatherEnv.fogDensity = dampTowards(weatherEnv.fogDensity, target.fogDensity, SLOW_LAMBDA, delta);
    weatherEnv.mistAmount = dampTowards(weatherEnv.mistAmount, target.mist, SLOW_LAMBDA, delta);
    weatherEnv.lightDim = dampTowards(weatherEnv.lightDim, target.lightDim, SLOW_LAMBDA, delta);
    weatherEnv.rainIntensity = dampTowards(weatherEnv.rainIntensity, target.rain, RAIN_LAMBDA, delta);

    // Wind veers slowly around the prevailing southeast trades and freshens
    // with rain; clouds, mist drift, and rain streak tilt all share it.
    windAngle.current += delta * 0.004 * Math.sin(nowMinutes * 0.0007);
    weatherEnv.windX = Math.cos(windAngle.current);
    weatherEnv.windZ = Math.sin(windAngle.current);
    const surfaceWindTarget = 0.55 + target.overcast * 0.18 + target.rain * 0.65;
    weatherEnv.windSpeed = dampTowards(weatherEnv.windSpeed, surfaceWindTarget, WIND_LAMBDA, delta);

    const rain = weatherEnv.rainIntensity;
    const overcast = weatherEnv.overcast;
    const mist = weatherEnv.mistAmount;
    const surfaceWind = weatherEnv.windSpeed;
    weatherEnv.cloudDriftSpeed = 0.12 + surfaceWind * 0.22 + overcast * 0.05 + rain * 0.06;
    weatherEnv.mistDriftSpeed = 0.08 + surfaceWind * 0.16 + mist * 0.04;
    weatherEnv.rainShearSpeed = 0.35 + surfaceWind * 0.5 + rain * 0.75;
    weatherEnv.foliageWindSpeed = 0.62 + surfaceWind * 0.42 + rain * 0.16;
    const wetFrontTarget = Math.max(target.rain * 0.95, target.mist * 0.45, Math.max(0, target.overcast - 0.55) * 0.75);
    weatherEnv.frontAmount = dampTowards(weatherEnv.frontAmount, wetFrontTarget, FRONT_LAMBDA, delta);
    weatherEnv.frontDarkness = 0.2 + overcast * 0.35 + rain * 0.45;
    weatherEnv.frontProgress += delta * weatherEnv.cloudDriftSpeed * (0.18 + weatherEnv.frontAmount * 0.12);

    if (scene.fog && scene.fog.isFogExp2) scene.fog.density = weatherEnv.fogDensity;
  });

  return null;
}
