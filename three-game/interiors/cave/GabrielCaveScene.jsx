'use client';

import React, { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  GABRIEL_CAVE_MOUTH_ZONE_ID,
  GABRIEL_CAVE_PRESS_ZONE_ID,
  GABRIEL_CAVE_QUARTERS_ZONE_ID,
  GABRIEL_CAVE_SPRING_ZONE_ID,
} from '../blueprints/gabrielCave';
import { CaveShell, useCaveRockMaterial } from './CaveShell';
import { tickCaveMaterials, useCaveMaterials } from './props/caveMaterials';
import { FernSpring } from './props/FernSpring';
import { LivingChamber } from './props/LivingChamber';
import { MouthGallery } from './props/MouthGallery';
import { PressGallery } from './props/PressGallery';

const FURNISHINGS = {
  [GABRIEL_CAVE_MOUTH_ZONE_ID]: MouthGallery,
  [GABRIEL_CAVE_QUARTERS_ZONE_ID]: LivingChamber,
  [GABRIEL_CAVE_PRESS_ZONE_ID]: PressGallery,
  [GABRIEL_CAVE_SPRING_ZONE_ID]: FernSpring,
};

function MaterialClock({ materials }) {
  useFrame(({ clock }) => tickCaveMaterials(materials, clock.elapsedTime));
  // Development handle for inspecting the cave scene from the play harness.
  const scene = useThree(state => state.scene);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return undefined;
    window.__darwinCaveScene = scene;
    return () => { if (window.__darwinCaveScene === scene) delete window.__darwinCaveScene; };
  }, [scene]);
  return null;
}

// Everything drawn in one chamber of Gabriel's cave: the rock shell and the
// chamber's furnishings. Collision for furnishings lives in the blueprint's
// fixedColliders; the visuals here must stay inside those boxes.
export function GabrielCaveScene({ zoneId }) {
  const rock = useCaveRockMaterial();
  const materials = useCaveMaterials();
  const Furnishings = FURNISHINGS[zoneId];
  return (
    <group name={`GabrielCave_${zoneId}`}>
      <CaveShell zoneId={zoneId} material={rock} />
      {Furnishings && <Furnishings materials={materials} rock={rock} />}
      <MaterialClock materials={materials} />
    </group>
  );
}
