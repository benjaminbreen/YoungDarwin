'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { movementTerrainHeight } from '../../world/terrain';
import { addRimLight, toonMaterial } from '../scene/materials';
import { ModelAsset } from '../assets/ModelAsset';
import { useThreeGameStore } from '../../store';
import { publishNpcPose, removeNpcPose } from '../../world/npcRuntime';
import { getNpcEncounter } from '../../encounters/npcEncounters';
import { getNpcPlacement, getStationaryNpcsForZone } from '../../npcs/npcPlacements';
import { NPC_STATUS, npcStatusStyle } from '../../npcs/npcStatus';
import { NpcStatusOrb } from './NpcStatusOrb';
import { TerrainRingMarker } from './TerrainRingMarker';

const GROUND_CLEARANCE = 0.04;

// Stand-in until a character GLB exists. Built like the crew fallback in
// SymsCovington, dressed as an official rather than a ship's boy: a long
// unbuttoned coat, no field satchel, grey at the temples. It should read as a
// placeholder at a glance and still read as a particular man.
function ProceduralOfficialFigure({ palette }) {
  const coat = useMemo(() => addRimLight(toonMaterial(palette.coat), { intensity: 0.2 }), [palette.coat]);
  const skin = useMemo(() => toonMaterial(palette.skin), [palette.skin]);
  const hair = useMemo(() => toonMaterial(palette.hair), [palette.hair]);
  const linen = useMemo(() => toonMaterial(palette.linen), [palette.linen]);

  return (
    <group userData={{ renderKind: 'npc-visual-placeholder' }}>
      <mesh castShadow position={[0, 1.55, 0]} material={skin}>
        <sphereGeometry args={[0.225, 16, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.68, -0.03]} material={hair}>
        <sphereGeometry args={[0.235, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      </mesh>
      {/* Collar and shirt front, so the dark coat reads as open rather than as
          one undifferentiated column. */}
      <mesh castShadow position={[0, 1.24, 0.13]} material={linen}>
        <boxGeometry args={[0.2, 0.34, 0.1]} />
      </mesh>
      <mesh castShadow position={[0, 1.02, 0]} material={coat}>
        <capsuleGeometry args={[0.27, 0.76, 5, 12]} />
      </mesh>
      {/* Hands behind the back: the pose the ambient line describes. */}
      <mesh castShadow position={[-0.245, 0.5, -0.06]} rotation={[0.12, 0, 0.1]} material={coat}>
        <capsuleGeometry args={[0.068, 0.6, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0.245, 0.5, -0.06]} rotation={[0.12, 0, -0.1]} material={coat}>
        <capsuleGeometry args={[0.068, 0.6, 4, 8]} />
      </mesh>
      <mesh castShadow position={[0, 0.3, 0]} material={coat}>
        <capsuleGeometry args={[0.155, 0.34, 4, 10]} />
      </mesh>
    </group>
  );
}

const LAWSON_PALETTE = {
  coat: '#2b3340',
  skin: '#c99a6d',
  hair: '#9aa0a2',
  linen: '#d8cdb4',
};

const PALETTES = { nicolas_lawson: LAWSON_PALETTE };

// Module constant: a fresh arrow function each render makes ModelAsset think the
// selector changed and restart the clip.
const IDLE_SELECTOR = () => 'idle';

function StationaryNpcActor({ npcId, zoneId }) {
  const encounter = getNpcEncounter(npcId);
  const conversationOpen = useThreeGameStore(state => state.activeNpcEncounter?.npcId === npcId);
  const relation = useThreeGameStore(state => state.npcEncounterState?.[npcId]);
  const group = useRef(null);

  const placement = useMemo(() => getNpcPlacement(npcId, zoneId), [npcId, zoneId]);
  const ground = useMemo(() => (
    placement ? movementTerrainHeight(placement.x, placement.z) + GROUND_CLEARANCE : 0
  ), [placement]);
  const yaw = useMemo(() => (
    placement ? Math.atan2(placement.facing.x, placement.facing.z) : 0
  ), [placement]);

  // Publish once and on unmount clear it, so the encounter probe cannot find a
  // ghost in a zone the player has left. Position never changes, so this does
  // not need a per-frame republish the way a walking NPC does.
  useEffect(() => {
    if (!placement || !encounter) return undefined;
    publishNpcPose(zoneId, placement.runtimeNpcId, { x: placement.x, y: ground, z: placement.z });
    return () => removeNpcPose(zoneId, placement.runtimeNpcId);
  }, [encounter, ground, placement, zoneId]);

  // A slow weight shift so the placeholder does not read as a prop. A rigged
  // NPC has a baked idle doing this properly, and adding a second motion on top
  // of it reads as a man swaying on a boat.
  const hasBakedIdle = Boolean(encounter?.modelAssetId);
  useFrame((state) => {
    if (!group.current || hasBakedIdle) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = yaw + Math.sin(t * 0.31) * 0.05;
    group.current.position.y = ground + Math.sin(t * 0.7) * 0.006;
  });

  if (!placement || !encounter) return null;

  const offended = (relation?.flags || []).includes('offended_by_politics');
  const status = conversationOpen || offended ? NPC_STATUS.ALERT : NPC_STATUS.NEUTRAL;

  return (
    <group
      ref={group}
      position={[placement.x, ground, placement.z]}
      rotation={[0, yaw, 0]}
      userData={{
        renderSource: `npc:${placement.runtimeNpcId}`,
        renderLabel: `${encounter.name} actor`,
        renderKind: 'npc',
        renderPath: null,
      }}
    >
      {/* An NPC with a `modelAssetId` renders its GLB; the procedural figure
          stays behind it as the load/missing-asset fallback. `idle` is the clip
          name every NPC build exports (see blender_build_lawson_npc.py) — the
          asked-for name rather than the first clip in the file, so adding a
          second clip later cannot silently change which one plays. */}
      {encounter.modelAssetId ? (
        <ModelAsset
          id={encounter.modelAssetId}
          animationSelector={IDLE_SELECTOR}
          reflect
          fallback={<ProceduralOfficialFigure palette={PALETTES[npcId] || LAWSON_PALETTE} />}
        />
      ) : (
        <ProceduralOfficialFigure palette={PALETTES[npcId] || LAWSON_PALETTE} />
      )}
      <TerrainRingMarker
        radius={0.82}
        innerRadius={0.72 / 0.82}
        color={npcStatusStyle(status).ring}
        opacity={0.42}
        zoneId={zoneId}
      />
      <NpcStatusOrb
        status={status}
        activity={offended ? 'Displeased' : 'Vice-Governor'}
        name={encounter.name}
        height={2.32}
      />
    </group>
  );
}

export function StationaryNpcs() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playableModeId = useThreeGameStore(state => state.playableModeId);
  const npcs = useMemo(() => getStationaryNpcsForZone(currentZoneId), [currentZoneId]);
  // Animal modes have their own read of the settlement; a governor who talks to
  // a finch is a different game.
  if (playableModeId !== 'darwin' || npcs.length === 0) return null;
  return (
    <>
      {npcs.map(npc => (
        <StationaryNpcActor key={npc.npcId} npcId={npc.npcId} zoneId={currentZoneId} />
      ))}
    </>
  );
}
