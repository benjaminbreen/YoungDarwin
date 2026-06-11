import * as THREE from 'three';
import { getRegionTerrainConfig } from '../../world/terrain';
import { EDGE_DIRECTIONS, getRegionEdgeHints } from '../../../game-core/regionMaps';
import { useThreeGameStore } from '../../store';
import { ACTION_DURATION } from './playerConfig';

export function oppositeEdge(edge) {
  return EDGE_DIRECTIONS[edge]?.opposite || null;
}

export function nearestRegionEdgePrompt(regionId, position, facing) {
  const config = getRegionTerrainConfig(regionId);
  const threshold = 5.2;
  const hints = getRegionEdgeHints(regionId);
  const distances = {
    east: config.width / 2 - position.x,
    west: position.x + config.width / 2,
    south: config.depth / 2 - position.z,
    north: position.z + config.depth / 2,
  };
  const candidates = [];
  for (const hint of hints) {
    const edge = hint.edge;
    if (edge.includes('north') && distances.north > threshold) continue;
    if (edge.includes('south') && distances.south > threshold) continue;
    if (edge.includes('east') && distances.east > threshold) continue;
    if (edge.includes('west') && distances.west > threshold) continue;
    const edgeDirection = EDGE_DIRECTIONS[edge];
    if (!edgeDirection) continue;
    const direction = new THREE.Vector3(edgeDirection.dx, 0, edgeDirection.dy).normalize();
    const facingWeight = facing?.lengthSq?.() > 0.001 ? direction.dot(facing.clone().normalize()) : 0;
    if (facingWeight < -0.15) continue;
    const distance = Math.min(
      edge.includes('north') ? distances.north : Infinity,
      edge.includes('south') ? distances.south : Infinity,
      edge.includes('east') ? distances.east : Infinity,
      edge.includes('west') ? distances.west : Infinity,
    );
    candidates.push({ ...hint, distance, facingWeight });
  }
  candidates.sort((a, b) => (a.distance - b.distance) || (b.facingWeight - a.facingWeight));
  return candidates[0] || null;
}

export function collectionAnimationForTool(toolId) {
  if (toolId === 'shotgun') return { clip: 'fireRifle', duration: ACTION_DURATION.fireRifle, lockMovement: true };
  if (toolId === 'insect_net') return { clip: 'swingNet', duration: ACTION_DURATION.swingNet, lockMovement: true };
  if (toolId === 'hammer') return { clip: 'swingHammer', duration: ACTION_DURATION.swingHammer, lockMovement: true };
  if (toolId === 'sketch') return { clip: 'kneelInspect', duration: ACTION_DURATION.kneelInspect, lockMovement: true };
  if (toolId === 'snare') return { clip: 'gather', duration: ACTION_DURATION.gather, lockMovement: true };
  return { clip: 'pickUp', duration: ACTION_DURATION.pickUp, lockMovement: true };
}

export function updatePlayerInteractions({
  keys,
  touch,
  position,
  facing,
  currentZoneId,
  zoneSpecimens,
  stateRef,
  lastInteractRef,
  lastCameraRef,
  startAction,
  collectNearby,
  cycleViewMode,
  setNearbySpecimen,
  setActiveTool,
  setEdgePrompt,
  beginZoneTransition,
  setCarriedObject,
}) {
  const edgePrompt = nearestRegionEdgePrompt(currentZoneId, position, facing);
  const promptPayload = edgePrompt
    ? {
        id: `${currentZoneId}:${edgePrompt.edge}:${edgePrompt.toRegionId || edgePrompt.boundaryKind || edgePrompt.kind}`,
        ...edgePrompt,
      }
    : null;
  const storeState = useThreeGameStore.getState();
  const currentPromptId = storeState.edgePrompt?.id || null;
  if ((promptPayload?.id || null) !== currentPromptId) {
    setEdgePrompt(promptPayload);
  }

  let nearest = null;
  let nearestDistance = 4.4;
  const specimenRuntimePositions = storeState.specimenRuntimePositions?.[currentZoneId] || {};
  for (const specimen of zoneSpecimens) {
    if (storeState.collectedSpecimenIds.includes(specimen.id)) continue;
    const runtime = specimenRuntimePositions[specimen.id];
    const [x, , z] = specimen.spawnPoint;
    const runtimeX = runtime?.x ?? x;
    const runtimeZ = runtime?.z ?? z;
    const distance = Math.hypot(position.x - runtimeX, position.z - runtimeZ);
    if (distance < nearestDistance) {
      nearest = specimen.id;
      nearestDistance = distance;
    }
  }
  if (storeState.nearbySpecimenId !== nearest) {
    setNearbySpecimen(nearest);
  }

  if ((keys.interact || touch.interact) && !lastInteractRef.current) {
    const currentState = useThreeGameStore.getState();
    const specimenId = currentState.nearbySpecimenId || currentState.selectedSpecimenId;
    if (currentState.carryPrompt) {
      if (currentState.carriedObjectId) {
        setCarriedObject(null);
      } else if (currentState.carryPrompt.mode === 'pickup') {
        setCarriedObject(currentState.carryPrompt.id);
      }
    } else if (!specimenId && currentState.edgePrompt?.kind === 'open' && currentState.edgePrompt.toRegionId && !stateRef.current.action) {
      beginZoneTransition(currentState.edgePrompt.toRegionId, {
        entryEdge: oppositeEdge(currentState.edgePrompt.edge),
        note: currentState.edgePrompt.description,
      });
    } else if (currentState.edgePrompt?.kind === 'blocked' && !specimenId) {
      setEdgePrompt({
        ...currentState.edgePrompt,
        message: currentState.edgePrompt.description,
      });
    } else if (specimenId && !currentState.collectedSpecimenIds.includes(specimenId) && !stateRef.current.action) {
      const animation = collectionAnimationForTool(currentState.activeToolId);
      startAction(animation.clip, animation.duration, { lockMovement: animation.lockMovement });
      collectNearby();
    }
  }
  if (keys.camera && !lastCameraRef.current) cycleViewMode();
  const toolbarOrder = useThreeGameStore.getState().toolbarOrder;
  for (let index = 0; index < 6; index += 1) {
    if (keys[`tool${index + 1}`] && toolbarOrder[index]) {
      setActiveTool(toolbarOrder[index]);
    }
  }
  lastInteractRef.current = keys.interact || touch.interact;
  lastCameraRef.current = keys.camera;
}
