'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ModelAsset } from '../assets/ModelAsset';
import { NaturalistModel } from './PlayerModel';
import { ProceduralFinchPlayer } from './ProceduralFinchPlayer';
import { ProceduralTortoisePlayer } from './ProceduralTortoisePlayer';
import { getPlayableControllerProfile, getPlayableMode } from '../../playable/playableModes';

function clipRequest(clip, timeScale = 1, fade = 0.18, maxTime = null) {
  return clip ? { clip, timeScale, fade, maxTime } : null;
}

const TORTOISE_PROCEDURAL_VARIANT = 'procedural';
const TORTOISE_TRIPO_VARIANT = 'tripo';
const TORTOISE_V2_VARIANT = 'v2';
const TORTOISE_MODEL_CYCLE = [
  TORTOISE_PROCEDURAL_VARIANT,
  TORTOISE_TRIPO_VARIANT,
  TORTOISE_V2_VARIANT,
];
const TORTOISE_TRIPO_ASSET_ID = 'tripoTortoiseRigged';
const TORTOISE_V2_ASSET_ID = 'playableTortoiseV2';
const TORTOISE_TRIPO_AVATAR = {
  idleClip: 'idle',
  walkClip: 'walk',
  eatClip: 'eat',
  sleepClip: 'sleep',
  defecateClip: 'defecate',
  walkTimeScale: 0.72,
  idleTimeScale: 0.72,
  eatTimeScale: 0.85,
  sleepTimeScale: 0.68,
  sleepHoldTime: 4.35,
  defecateTimeScale: 0.82,
  runTimeScale: 1.08,
  walkBob: 0,
};
const TORTOISE_V2_AVATAR = {
  idleClip: 'idle',
  walkClip: 'walk',
  eatClip: 'eat',
  sleepClip: 'sleep',
  defecateClip: 'defecate',
  walkTimeScale: 0.72,
  idleTimeScale: 0.72,
  eatTimeScale: 0.82,
  sleepTimeScale: 0.7,
  defecateTimeScale: 0.78,
  runTimeScale: 1.08,
  walkBob: 0,
};

function AnimalPlayerModel({ mode, profile, motionRef }) {
  const groupRef = useRef(null);
  const [tortoiseVariant, setTortoiseVariant] = useState(TORTOISE_PROCEDURAL_VARIANT);
  const proceduralTortoise = mode.id === 'tortoise' && tortoiseVariant === TORTOISE_PROCEDURAL_VARIANT;
  const activeAssetId = mode.id === 'tortoise'
    ? (tortoiseVariant === TORTOISE_TRIPO_VARIANT
      ? TORTOISE_TRIPO_ASSET_ID
      : (tortoiseVariant === TORTOISE_V2_VARIANT ? TORTOISE_V2_ASSET_ID : mode.assetId))
    : mode.assetId;
  const avatar = mode.id === 'tortoise'
    ? (tortoiseVariant === TORTOISE_TRIPO_VARIANT
      ? TORTOISE_TRIPO_AVATAR
      : (tortoiseVariant === TORTOISE_V2_VARIANT ? TORTOISE_V2_AVATAR : (profile.avatar || {})))
    : (profile.avatar || {});

  useEffect(() => {
    if (mode.id !== 'tortoise') return undefined;
    if (motionRef?.current) {
      motionRef.current.tortoiseModelVariant = tortoiseVariant;
      motionRef.current.modelAssetId = tortoiseVariant === TORTOISE_TRIPO_VARIANT
        ? TORTOISE_TRIPO_ASSET_ID
        : (tortoiseVariant === TORTOISE_V2_VARIANT ? TORTOISE_V2_ASSET_ID : 'proceduralTortoise');
    }
    if (typeof window !== 'undefined') {
      window.__tortoisePlayerModel = tortoiseVariant;
    }
    const onKeyDown = (event) => {
      if (event.code !== 'Digit9' && event.key !== '9') return;
      if (event.repeat) return;
      setTortoiseVariant(current => {
        const index = TORTOISE_MODEL_CYCLE.indexOf(current);
        return TORTOISE_MODEL_CYCLE[(index + 1) % TORTOISE_MODEL_CYCLE.length];
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode.id, motionRef, tortoiseVariant]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const motion = motionRef.current || {};
    const speed = motion.speed || 0;
    const bobAmount = motion.flying ? (avatar.flightBob || 0) : (avatar.walkBob || 0);
    group.position.y = Math.abs(Math.sin(clock.elapsedTime * (motion.flying ? 7.5 : 5.4))) * bobAmount * (speed > 0.05 || motion.flying ? 1 : 0.2);
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, motion.flightPitch || 0, 8, delta);
    group.rotation.z = THREE.MathUtils.damp(group.rotation.z, motion.flightBank || 0, 8, delta);
  });

  const selectAnimation = useCallback(() => {
    const motion = motionRef.current || {};
    if (motion.action === 'animalEat') return clipRequest(avatar.eatClip || avatar.idleClip, avatar.eatTimeScale || 0.72, 0.22);
    if (motion.action === 'animalSleep') return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28);
    if (motion.lying) return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28, avatar.sleepHoldTime ?? null);
    if (motion.action === 'animalDefecate') return clipRequest(avatar.defecateClip || avatar.idleClip, avatar.defecateTimeScale || 0.58, 0.22);
    if (motion.flying) return clipRequest(avatar.flyClip || avatar.walkClip || avatar.idleClip, 0.86, 0.16);
    if (motion.walking || motion.running || (motion.speed || 0) > 0.08) {
      const clip = motion.running ? (avatar.runClip || avatar.walkClip || avatar.idleClip) : (avatar.walkClip || avatar.idleClip);
      const timeScale = motion.running
        ? (avatar.runTimeScale || avatar.walkTimeScale || (mode.id === 'tortoise' ? 0.72 : 1.05))
        : (avatar.walkTimeScale || (mode.id === 'tortoise' ? 0.38 : 0.9));
      return clipRequest(clip, timeScale, 0.18);
    }
    return clipRequest(avatar.idleClip || avatar.walkClip, avatar.idleTimeScale || 0.72, 0.22);
  }, [avatar, mode.id, motionRef]);

  if (proceduralTortoise) {
    return <ProceduralTortoisePlayer motionRef={motionRef} />;
  }

  return (
    <group ref={groupRef}>
      {mode.id === 'finch' ? (
        <ProceduralFinchPlayer motionRef={motionRef} />
      ) : (
        <ModelAsset
          key={activeAssetId}
          id={activeAssetId}
          animationSelector={selectAnimation}
        />
      )}
    </group>
  );
}

export function PlayerAvatarModel({
  playableModeId = 'darwin',
  motionRef,
  health,
  fatigue,
  inventoryCount,
  grounding = null,
}) {
  const mode = useMemo(() => getPlayableMode(playableModeId), [playableModeId]);
  const profile = useMemo(() => getPlayableControllerProfile(mode.id), [mode.id]);

  if (mode.kind !== 'animal') {
    return (
      <NaturalistModel
        motionRef={motionRef}
        health={health}
        fatigue={fatigue}
        inventoryCount={inventoryCount}
        grounding={grounding}
      />
    );
  }

  return <AnimalPlayerModel mode={mode} profile={profile} motionRef={motionRef} />;
}
