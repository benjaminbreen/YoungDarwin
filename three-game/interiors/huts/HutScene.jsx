'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { COLONIST_RANCHO_ZONE_ID } from '../blueprints/colonistRancho';
import { WHALERS_HUT_ZONE_ID } from '../blueprints/whalersHut';
import { apronSurfaceY } from '../InteriorExteriorApron';
import { getInteriorDefinition } from '../interiorRegistry';
import { terrainRenderSample } from '../../world/terrain';
import { WATER_LEVEL } from '../../world/terrainShared';
import { ColonistRanchoBuilding } from './ColonistRanchoBuilding';
import { useHutMaterials } from './hutMaterials';
import { RanchoInterior } from './RanchoInterior';
import { useDisposable } from './useDisposable';
import { WhalersHutBuilding } from './WhalersHutBuilding';
import { WhalersHutInterior } from './WhalersHutInterior';

// One hut interior: the same building that stands outdoors, drawn around the
// room, its yard set down on the exterior apron so the view through the door
// matches the beach or garden you came in from, and the room's furnishings.
// Collision for furnishings lives in the blueprint's fixedColliders.

const SCENES = {
  [WHALERS_HUT_ZONE_ID]: { Building: WhalersHutBuilding, Furnishings: WhalersHutInterior, sea: true },
  [COLONIST_RANCHO_ZONE_ID]: { Building: ColonistRanchoBuilding, Furnishings: RanchoInterior, sea: false },
};

// Open sea beyond the beach, at the true water level relative to the hut,
// fading into the background toward the apron's edge.
function ApronSea({ apron }) {
  const y = useMemo(() => {
    const anchor = terrainRenderSample(apron.sourceAnchor[0], apron.sourceAnchor[1], apron.sourceRegionId);
    return (apron.baseY ?? 0) + (WATER_LEVEL - anchor.height) * (apron.reliefScale ?? 1);
  }, [apron]);
  const resources = useDisposable(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.7, '#b0b0b0');
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const alphaMap = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({
      color: '#4d8790',
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      alphaMap,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(120, 120);
    geometry.rotateX(-Math.PI / 2);
    return { geometry, material, alphaMap, dispose: () => { geometry.dispose(); material.dispose(); alphaMap.dispose(); } };
  }, []);
  return <mesh geometry={resources.geometry} material={resources.material} position={[0, y, 0]} renderOrder={-1} name="HutApronSea" />;
}

export function HutScene({ zoneId }) {
  const materials = useHutMaterials();
  const definition = getInteriorDefinition(zoneId);
  const apron = definition?.exteriorApron;
  const groundAt = useMemo(() => (apron ? (x, z) => apronSurfaceY(apron, x, z) : null), [apron]);
  const scene = SCENES[zoneId];
  if (!scene) return null;
  const { Building, Furnishings } = scene;
  return (
    <group name={`HutInterior_${zoneId}`}>
      <Building materials={materials} variant="interior" groundAt={groundAt} />
      <Furnishings materials={materials} />
      {scene.sea && apron && <ApronSea apron={apron} />}
    </group>
  );
}
