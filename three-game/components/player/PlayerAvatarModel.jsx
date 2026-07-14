'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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

function nowSeconds() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now() / 1000;
  return Date.now() / 1000;
}

function pickFromList(list, fallback, seed = 0) {
  const options = Array.isArray(list) && list.length ? list : (fallback ? [fallback] : []);
  if (!options.length) return null;
  return options[Math.abs(Math.floor(seed)) % options.length];
}

function pickTortoiseEatClip(avatar, motion, now) {
  const options = Array.isArray(avatar.eatClips) && avatar.eatClips.length ? avatar.eatClips : [avatar.eatClip || avatar.idleClip];
  if ((motion.wadeDepth || 0) > 0.06 && options.includes('drink')) return 'drink';
  const slope = Math.abs(motion.groundPitch || 0) + Math.abs(motion.slopeGrade || 0) * 0.35;
  if (slope > 0.08 && options.includes('browseHigh')) return 'browseHigh';
  return pickFromList(options, avatar.eatClip || avatar.idleClip, now * 10 + (motion.speed || 0) * 29);
}

function AnimalPlayerModel({ mode, profile, motionRef }) {
  const groupRef = useRef(null);
  const avatar = useMemo(() => profile.avatar || {}, [profile.avatar]);
  const proceduralTortoise = mode.id === 'tortoise' && avatar.render === 'procedural';
  const activeAssetId = proceduralTortoise ? 'proceduralTortoise' : mode.assetId;
  const tortoiseSelector = useRef({
    action: null,
    actionClip: null,
    moving: false,
    transitionClip: null,
    transitionUntil: 0,
    bracing: false,
    braceTransitionClip: null,
    braceTransitionUntil: 0,
    idleClip: null,
    idleUntil: 0,
  });

  useEffect(() => {
    if (mode.id !== 'tortoise') return undefined;
    if (motionRef?.current) {
      motionRef.current.tortoiseModelVariant = proceduralTortoise ? 'procedural' : activeAssetId;
      motionRef.current.modelAssetId = activeAssetId;
    }
    if (typeof window !== 'undefined') {
      window.__tortoisePlayerModel = proceduralTortoise ? 'procedural' : activeAssetId;
    }
    return undefined;
  }, [activeAssetId, mode.id, motionRef, proceduralTortoise]);

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
    const now = nowSeconds();
    if (mode.id === 'tortoise') {
      const state = tortoiseSelector.current;
      const moving = Boolean(motion.walking || motion.running || (motion.speed || 0) > 0.08);
      const bracing = Boolean(motion.action === 'animalBrace' || motion.bracing);

      if (motion.action !== state.action) {
        state.action = motion.action || null;
        state.actionClip = null;
      }

      if (state.braceTransitionClip && now >= state.braceTransitionUntil) {
        state.braceTransitionClip = null;
      }
      if (bracing && !state.bracing) {
        state.bracing = true;
        state.braceTransitionClip = avatar.withdrawClip || avatar.hideClip || avatar.braceClip;
        state.braceTransitionUntil = now + 0.58;
      } else if (!bracing && state.bracing) {
        state.bracing = false;
        state.braceTransitionClip = avatar.reEmergeClip || avatar.peekClip || avatar.idleClip;
        state.braceTransitionUntil = now + 0.68;
      }
      if (state.braceTransitionClip && now < state.braceTransitionUntil) {
        return clipRequest(state.braceTransitionClip, avatar.braceTimeScale || avatar.idleTimeScale || 0.72, 0.1);
      }
      if (bracing) {
        return clipRequest(avatar.braceClip || avatar.hideClip || avatar.idleClip || avatar.walkClip, avatar.braceTimeScale || avatar.idleTimeScale || 0.72, 0.14);
      }

      if (motion.action === 'animalEat') {
        if (!state.actionClip) state.actionClip = pickTortoiseEatClip(avatar, motion, now);
        return clipRequest(state.actionClip || avatar.eatClip || avatar.idleClip, avatar.eatTimeScale || 0.72, 0.22);
      }
      if (motion.action === 'animalSleep') return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28);
      if (motion.lying) return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28, avatar.sleepHoldTime ?? null);
      if (motion.action === 'animalDefecate') return clipRequest(avatar.defecateClip || avatar.idleClip, avatar.defecateTimeScale || 0.58, 0.22);

      if (state.transitionClip && now >= state.transitionUntil) state.transitionClip = null;
      if (moving && !state.moving && avatar.startWalkClip) {
        state.transitionClip = avatar.startWalkClip;
        state.transitionUntil = now + 0.44;
      } else if (!moving && state.moving && avatar.stopWalkClip) {
        state.transitionClip = avatar.stopWalkClip;
        state.transitionUntil = now + 0.48;
      }
      state.moving = moving;
      if (state.transitionClip && now < state.transitionUntil) {
        return clipRequest(state.transitionClip, avatar.walkTimeScale || 0.72, 0.1);
      }

      if (moving) {
        if (motion.movingBackward && avatar.reverseClip) {
          return clipRequest(avatar.reverseClip, avatar.walkTimeScale || 0.72, 0.16);
        }
        if (Math.abs(motion.turnRate || 0) > 1.0 && (motion.speed || 0) < 0.35 && avatar.turnClip) {
          return clipRequest(avatar.turnClip, avatar.walkTimeScale || 0.72, 0.14);
        }
        const clip = motion.running ? (avatar.runClip || avatar.walkClip || avatar.idleClip) : (avatar.walkClip || avatar.idleClip);
        const timeScale = motion.running
          ? (avatar.runTimeScale || avatar.walkTimeScale || 0.72)
          : (avatar.walkTimeScale || 0.38);
        return clipRequest(clip, timeScale, 0.18);
      }

      if (!state.idleClip || now >= state.idleUntil) {
        state.idleClip = pickFromList(avatar.idleClips, avatar.idleClip || avatar.walkClip, now * 0.23);
        state.idleUntil = now + 7.5 + ((Math.floor(now * 10) % 5) * 1.15);
      }
      return clipRequest(state.idleClip || avatar.idleClip || avatar.walkClip, avatar.idleTimeScale || 0.72, 0.24);
    }

    if (motion.action === 'animalEat') return clipRequest(avatar.eatClip || avatar.idleClip, avatar.eatTimeScale || 0.72, 0.22);
    if (motion.action === 'animalSleep') return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28);
    if (motion.lying) return clipRequest(avatar.sleepClip || avatar.idleClip, avatar.sleepTimeScale || 0.45, 0.28, avatar.sleepHoldTime ?? null);
    if (motion.action === 'animalDefecate') return clipRequest(avatar.defecateClip || avatar.idleClip, avatar.defecateTimeScale || 0.58, 0.22);
    if (motion.action === 'animalBrace' || motion.bracing) return clipRequest(avatar.braceClip || avatar.idleClip || avatar.walkClip, avatar.braceTimeScale || avatar.idleTimeScale || 0.72, 0.16);
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
