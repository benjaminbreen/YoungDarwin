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
  const distEast = config.width / 2 - position.x;
  const distWest = position.x + config.width / 2;
  const distSouth = config.depth / 2 - position.z;
  const distNorth = position.z + config.depth / 2;
  // Fast path: in the zone interior, far from every edge. This runs every frame
  // from the player loop, so bail before fetching hints or allocating anything.
  if (distEast > threshold && distWest > threshold && distSouth > threshold && distNorth > threshold) {
    return null;
  }
  const hints = getRegionEdgeHints(regionId);
  const facingX = facing?.x || 0;
  const facingZ = facing?.z || 0;
  const facingLength = Math.hypot(facingX, facingZ);

  // Track the single best candidate with scalars (ordering identical to the old
  // sort: nearest distance wins, ties break toward the edge we face most) so we
  // never build/sort a candidates array or spread a hint until the winner.
  let bestHint = null;
  let bestDistance = Infinity;
  let bestFacingWeight = -Infinity;
  for (const hint of hints) {
    const edge = hint.edge;
    if (edge.includes('north') && distNorth > threshold) continue;
    if (edge.includes('south') && distSouth > threshold) continue;
    if (edge.includes('east') && distEast > threshold) continue;
    if (edge.includes('west') && distWest > threshold) continue;
    const edgeDirection = EDGE_DIRECTIONS[edge];
    if (!edgeDirection) continue;
    const directionLength = Math.hypot(edgeDirection.dx, edgeDirection.dy) || 1;
    const directionX = edgeDirection.dx / directionLength;
    const directionZ = edgeDirection.dy / directionLength;
    const facingWeight = facingLength > 0.001
      ? (directionX * facingX + directionZ * facingZ) / facingLength
      : 0;
    if (facingWeight < -0.15) continue;
    const distance = Math.min(
      edge.includes('north') ? distNorth : Infinity,
      edge.includes('south') ? distSouth : Infinity,
      edge.includes('east') ? distEast : Infinity,
      edge.includes('west') ? distWest : Infinity,
    );
    if (distance < bestDistance || (distance === bestDistance && facingWeight > bestFacingWeight)) {
      bestHint = hint;
      bestDistance = distance;
      bestFacingWeight = facingWeight;
    }
  }
  return bestHint ? { ...bestHint, distance: bestDistance, facingWeight: bestFacingWeight } : null;
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
      if (currentState.carryPrompt.mode === 'collect-rock-sample') {
        if (!stateRef.current.action) {
          startAction('pickUp', ACTION_DURATION.pickUp, { lockMovement: true });
        }
        currentState.collectRockSample?.(currentState.carryPrompt.sample);
      } else if (currentState.carriedObjectId) {
        setCarriedObject(null);
      } else if (currentState.carryPrompt.mode === 'pickup') {
        if (!stateRef.current.action) {
          startAction('pickUp', ACTION_DURATION.pickUp, { lockMovement: true });
        }
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
