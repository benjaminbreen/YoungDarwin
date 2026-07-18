import { getRegionTerrainConfig } from '../../world/terrain';
import { EDGE_DIRECTIONS, getRegionEdgeHints } from '../../../game-core/regionMaps';
import { nearestLocalTransitionPrompt } from '../../world/localTransitions';
import { useThreeGameStore } from '../../store';
import { triggerToolUse } from '../../input/touchControls';
import { ACTION_DURATION } from './playerConfig';
import { getWildlifeInteractionHeight } from '../../wildlife/wildlifeCatalog';
import { maybeTriggerNetSnagFromSwing } from './fieldDilemmaTriggers';
import { getAnimalAction, getPlayableMode } from '../../playable/playableModes';
import { FORAGE_PROMPT_MODE } from '../../world/forageables';
import { getNearestNpcEncounter } from '../../encounters/npcEncounters';

export function oppositeEdge(edge) {
  return EDGE_DIRECTIONS[edge]?.opposite || null;
}

export function shouldRunInPlaceAtTravelEdge(storeState, { moving = false, isDarwinMode = true } = {}) {
  if (!isDarwinMode) return false;
  const transition = storeState?.transition;
  const departingFromEdge = transition?.mode === 'island'
    && transition.phase === 'departing'
    && (transition.source === 'edge' || transition.source === 'edge-return');
  if (departingFromEdge) return true;

  const prompt = storeState?.edgePrompt;
  return Boolean(
    moving
    && prompt?.kind === 'open'
    && prompt.toRegionId
    && !prompt.localTransition
    && prompt.visible !== false
    && Number(prompt.distance) <= 3,
  );
}

export function nearestRegionEdgePrompt(regionId, position, facing) {
  const config = getRegionTerrainConfig(regionId);
  const threshold = 16;
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
  return bestHint ? {
    ...bestHint,
    distance: bestDistance,
    facingWeight: bestFacingWeight,
    visible: bestDistance <= 8,
  } : null;
}

function distanceFromEdge(regionId, edge, position) {
  const config = getRegionTerrainConfig(regionId);
  const distances = [];
  if (edge?.includes('east')) distances.push(config.width / 2 - position.x);
  if (edge?.includes('west')) distances.push(position.x + config.width / 2);
  if (edge?.includes('south')) distances.push(config.depth / 2 - position.z);
  if (edge?.includes('north')) distances.push(position.z + config.depth / 2);
  if (!distances.length) return Infinity;
  return Math.min(...distances);
}

function arrivalEdgeSuppressesPrompt(block, regionId, position, promptPayload) {
  if (!block || block.zoneId !== regionId || !block.edge) return false;
  const distance = distanceFromEdge(regionId, block.edge, position);
  // Arrival spawns are deliberately near the entry border. Automatic travel is
  // disarmed until the player has clearly entered the destination; this removes
  // the one-backward-step bounce that the old tight return band still allowed.
  if (distance > (block.clearance || 10)) {
    useThreeGameStore.getState().clearArrivalEdgeBlock?.();
    return false;
  }
  return promptPayload?.edge === block.edge;
}

const GROUND_GATHER_MAX_HEIGHT = 0.82;
const LOW_INSPECT_MAX_HEIGHT = 0.46;
const CARRY_PICKUP_ATTACH_DELAY = 0.88;
const CARRY_PICKUP_CANCEL_DELAY = 1.5;
const SPECIMEN_INTERACTION_HEIGHT = {
  basalt: 0.28,
  barnacle: 0.12,
  booby: 0.72,
  cactus: 1.25,
  coral: 0.18,
  crab: 0.18,
  flightlesscormorant: 0.78,
  floreana_giant_tortoise: 1.05,
  floreanagianttortoise: 1.05,
  floreana_mockingbird: 0.28,
  floreanamockingbird: 0.28,
  frigatebird: 0.78,
  galapagoscotton: 1.15,
  galapagospenguin: 0.56,
  greenTurtle: 0.42,
  greenturtle: 0.42,
  lavalizard: 0.25,
  mediumgroundfinch: 0.2,
  parrotfish: 0.18,
  seaLion: 0.82,
  sealion: 0.82,
  seaurchin: 0.16,
  scoria: 0.24,
};

function normalizeSpecimenId(specimen) {
  return String(specimen?.id || specimen?.specimenId || '').replace(/[^a-zA-Z0-9_]/g, '');
}

function specimenKind(specimen) {
  return {
    id: normalizeSpecimenId(specimen).toLowerCase(),
    ontology: String(specimen?.ontology || '').toLowerCase(),
    order: String(specimen?.order || '').toLowerCase(),
    subOrder: String(specimen?.sub_order || specimen?.subOrder || '').toLowerCase(),
  };
}

export function specimenInteractionHeight(specimen) {
  if (!specimen) return 0;
  if (Number.isFinite(specimen.interactionHeight)) return Math.max(0, specimen.interactionHeight);
  const id = normalizeSpecimenId(specimen);
  const catalogHeight = getWildlifeInteractionHeight(id);
  if (Number.isFinite(catalogHeight)) return Math.max(0, catalogHeight * (specimen.sceneScale || 1));
  const base = SPECIMEN_INTERACTION_HEIGHT[id]
    ?? SPECIMEN_INTERACTION_HEIGHT[id.toLowerCase()]
    ?? (specimen.ontology === 'Plant'
      ? 0.95
      : specimen.ontology === 'Animal'
        ? 0.58
        : specimen.ontology === 'Mineral'
          ? 0.28
          : 0.5);
  return Math.max(0, base * (specimen.sceneScale || 1));
}

function gatherClipForSpecimen(specimen) {
  const height = specimenInteractionHeight(specimen);
  const kind = specimenKind(specimen);
  if (kind.ontology === 'plant' && height > GROUND_GATHER_MAX_HEIGHT) return 'gatherChestHeight';
  return height <= GROUND_GATHER_MAX_HEIGHT ? 'gatherGround' : 'gatherChestHeight';
}

function documentClipForSpecimen(specimen) {
  const height = specimenInteractionHeight(specimen);
  const kind = specimenKind(specimen);
  if (kind.ontology === 'mineral' || height <= LOW_INSPECT_MAX_HEIGHT) return 'kneelInspect';
  if (kind.ontology === 'plant' || kind.order === 'reptile' || kind.order === 'crustacean') return 'standingInspectDownward';
  return 'write';
}

export function collectionAnimationForTool(toolId, specimen = null, options = {}) {
  if (options.documented) {
    const clip = documentClipForSpecimen(specimen);
    return { clip, duration: ACTION_DURATION[clip], lockMovement: true, align: true };
  }
  if (toolId === 'shotgun') return { clip: 'fireRifle', duration: ACTION_DURATION.fireRifle, lockMovement: true, align: true };
  if (toolId === 'insect_net') return { clip: 'butterflyNetSwing', duration: ACTION_DURATION.butterflyNetSwing, lockMovement: true, align: true };
  if (toolId === 'snare') return { clip: 'kneelInspect', duration: ACTION_DURATION.kneelInspect, lockMovement: true, align: true };
  if (toolId === 'hammer') return { clip: 'heavyToolSwing', duration: ACTION_DURATION.heavyToolSwing, lockMovement: true, align: true };
  if (toolId === 'sketch') {
    const clip = documentClipForSpecimen(specimen);
    return { clip, duration: ACTION_DURATION[clip], lockMovement: true, align: true };
  }
  const kind = specimenKind(specimen);
  if (kind.order === 'insect') return { clip: 'butterflyNetSwing', duration: ACTION_DURATION.butterflyNetSwing, lockMovement: true, align: true };
  if (kind.ontology === 'mineral') return { clip: 'kneelInspect', duration: ACTION_DURATION.kneelInspect, lockMovement: true, align: true };
  const clip = gatherClipForSpecimen(specimen);
  return { clip, duration: ACTION_DURATION[clip], lockMovement: true, align: true };
}

function runtimeSpecimenPosition(specimen, runtimePositions, fallbackY = 0) {
  if (!specimen) return null;
  const actorId = specimen.instanceId || specimen.id;
  const runtime = runtimePositions?.[actorId];
  const spawn = specimen.spawnPoint || [0, fallbackY, 0];
  return {
    x: runtime?.x ?? spawn[0] ?? 0,
    y: runtime?.y ?? spawn[1] ?? fallbackY,
    z: runtime?.z ?? spawn[2] ?? 0,
  };
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
  lastExamineRef,
  lastCameraRef,
  startAction,
  collectNearby,
  openExamine,
  cycleViewMode,
  setNearbySpecimen,
  setActiveTool,
  setEdgePrompt,
  beginZoneTransition,
  setCarriedObject,
  placePlayerAt,
  allowSpecimenInteractions = true,
}) {
  const edgePrompt = nearestLocalTransitionPrompt(currentZoneId, position, facing)
    || nearestRegionEdgePrompt(currentZoneId, position, facing);
  const promptPayload = edgePrompt
    ? {
        id: `${currentZoneId}:${edgePrompt.edge}:${edgePrompt.toRegionId || edgePrompt.boundaryKind || edgePrompt.kind}`,
        ...edgePrompt,
      }
    : null;
  const storeState = useThreeGameStore.getState();
  const interactionNow = performance.now() / 1000;
  const pendingCarryPickup = stateRef.current.pendingCarryPickup;
  if (pendingCarryPickup) {
    if (storeState.carriedObjectId === pendingCarryPickup.id) {
      stateRef.current.pendingCarryPickup = null;
    } else if (currentZoneId !== pendingCarryPickup.zoneId
      || interactionNow >= pendingCarryPickup.cancelAt
      || (stateRef.current.action && stateRef.current.action !== 'pickUp')) {
      stateRef.current.pendingCarryPickup = null;
    } else if (interactionNow >= pendingCarryPickup.attachAt) {
      // Switch render/physics ownership at hand contact, not at key-down. The
      // skeletal attachment then rides the remainder of the lift animation.
      setCarriedObject(pendingCarryPickup.id);
      stateRef.current.pendingCarryPickup = null;
    }
  }
  const nearbyNpcEncounter = getNearestNpcEncounter(currentZoneId, position);
  if ((storeState.nearbyNpcEncounter?.npcId || null) !== (nearbyNpcEncounter?.npcId || null)) {
    storeState.setNearbyNpcEncounter?.(nearbyNpcEncounter);
    if (nearbyNpcEncounter) storeState.recordNpcActivity?.(nearbyNpcEncounter.npcId, 'nearby');
  }
  const constraintLocksInteractions = Boolean(
    storeState.activeConstraint?.movementLock
    || storeState.activeConstraint?.type === 'snare_immobilized'
  );
  const currentPromptId = storeState.edgePrompt?.id || null;
  const dismissedPromptId = storeState.dismissedEdgePromptId || null;
  const arrivalSuppressed = arrivalEdgeSuppressesPrompt(storeState.arrivalEdgeBlock, currentZoneId, position, promptPayload);
  const previousSample = stateRef.current.edgeTravelSample;
  const edgeDirection = promptPayload?.edge ? EDGE_DIRECTIONS[promptPayload.edge] : null;
  const outwardDelta = previousSample && edgeDirection
    ? (position.x - previousSample.x) * edgeDirection.dx + (position.z - previousSample.z) * edgeDirection.dy
    : 0;
  stateRef.current.edgeTravelSample = { x: position.x, z: position.z, zoneId: currentZoneId };
  let autoTransitionStarted = false;
  const autoCandidate = !arrivalSuppressed
    && promptPayload?.kind === 'open'
    && promptPayload?.toRegionId
    && !promptPayload.localTransition
    && promptPayload.distance <= 2.5
    && promptPayload.facingWeight > 0.18;
  const pushingForward = Boolean(keys.forward || touch.forward);
  if (autoCandidate && (outwardDelta > 0.0005 || pushingForward)) {
    const intent = stateRef.current.edgeTravelIntent;
    if (!intent || intent.id !== promptPayload.id) {
      stateRef.current.edgeTravelIntent = { id: promptPayload.id, startedAt: interactionNow };
    }
    const startedAt = stateRef.current.edgeTravelIntent.startedAt;
    promptPayload.commitProgress = Math.min(1, (interactionNow - startedAt) / 0.45);
    if (promptPayload.commitProgress >= 1 && !storeState.transition) {
      autoTransitionStarted = true;
      stateRef.current.edgeTravelIntent = null;
      setEdgePrompt(null);
      beginZoneTransition(promptPayload.toRegionId, {
        entryEdge: oppositeEdge(promptPayload.edge),
        note: promptPayload.description,
        source: 'edge',
        mode: 'island',
      });
    }
  } else {
    stateRef.current.edgeTravelIntent = null;
    if (promptPayload) promptPayload.commitProgress = 0;
  }
  // A player who has just arrived may still intentionally go straight back,
  // but only after turning to face the entry edge and holding the interaction
  // control. Backpedalling one step while still facing into the new map cannot
  // satisfy either condition, so it never bounces them into another cinematic.
  let deliberateReturnPayload = null;
  const deliberateReturnCandidate = arrivalSuppressed
    && promptPayload?.kind === 'open'
    && promptPayload?.toRegionId
    && !promptPayload.localTransition
    && promptPayload.distance <= 5
    && promptPayload.facingWeight > 0.18;
  const interactionHeld = Boolean(keys.interact || touch.interact);
  if (deliberateReturnCandidate) {
    deliberateReturnPayload = {
      ...promptPayload,
      visible: true,
      requiresHold: true,
      returning: true,
      commitProgress: 0,
    };
    if (interactionHeld) {
      const intent = stateRef.current.arrivalReturnIntent;
      if (!intent || intent.id !== promptPayload.id) {
        stateRef.current.arrivalReturnIntent = { id: promptPayload.id, startedAt: interactionNow };
      }
      deliberateReturnPayload.commitProgress = Math.min(
        1,
        (interactionNow - stateRef.current.arrivalReturnIntent.startedAt) / 0.65,
      );
      if (deliberateReturnPayload.commitProgress >= 1 && !storeState.transition) {
        autoTransitionStarted = true;
        stateRef.current.arrivalReturnIntent = null;
        setEdgePrompt(null);
        beginZoneTransition(promptPayload.toRegionId, {
          entryEdge: oppositeEdge(promptPayload.edge),
          note: promptPayload.description,
          source: 'edge-return',
          mode: 'island',
        });
      }
    } else {
      stateRef.current.arrivalReturnIntent = null;
    }
  } else {
    stateRef.current.arrivalReturnIntent = null;
  }
  const visiblePromptPayload = promptPayload?.id === dismissedPromptId
    ? null
    : arrivalSuppressed
      ? deliberateReturnPayload
      : promptPayload;
  if (!promptPayload && dismissedPromptId) {
    setEdgePrompt(null);
  } else if ((visiblePromptPayload?.id || null) !== currentPromptId
    || Math.abs((visiblePromptPayload?.commitProgress || 0) - (storeState.edgePrompt?.commitProgress || 0)) > 0.035
    || Boolean(visiblePromptPayload?.visible) !== Boolean(storeState.edgePrompt?.visible)) {
    setEdgePrompt(visiblePromptPayload);
  }
  if (autoTransitionStarted) {
    lastInteractRef.current = keys.interact || touch.interact;
    lastExamineRef.current = keys.examine || touch.inspect;
    lastCameraRef.current = keys.camera;
    return;
  }

  let nearest = null;
  let nearestDistance = 4.4;
  const specimenRuntimePositions = storeState.specimenRuntimePositions?.[currentZoneId] || {};
  const collectedSpecimenActorIds = new Set(storeState.collectedSpecimenActorIds || []);
  if (allowSpecimenInteractions) {
    for (const specimen of zoneSpecimens) {
      const actorId = specimen.instanceId || specimen.id;
      if (collectedSpecimenActorIds.has(actorId)) continue;
      const runtime = specimenRuntimePositions[actorId];
      const [x, , z] = specimen.spawnPoint;
      const runtimeX = runtime?.x ?? x;
      const runtimeY = runtime?.y ?? specimen.spawnPoint?.[1] ?? position.y;
      const runtimeZ = runtime?.z ?? z;
      const verticalDelta = Math.max(0, runtimeY - position.y);
      if (verticalDelta > specimenInteractionHeight(specimen) + 2.4) continue;
      const distance = Math.hypot(position.x - runtimeX, position.z - runtimeZ) + Math.max(0, verticalDelta - 0.8) * 0.45;
      if (distance < nearestDistance) {
        nearest = actorId;
        nearestDistance = distance;
      }
    }
  }
  if (storeState.nearbySpecimenId !== nearest) {
    setNearbySpecimen(nearest);
  }

  const startSpecimenCollection = (currentState, specimen) => {
    if (!specimen || stateRef.current.action) return false;
    if (currentState.activeConstraint?.blockedTools?.includes(currentState.activeToolId)) {
      currentState.reportConstraintBlockedTool?.(currentState.activeToolId);
      return true;
    }
    if (currentState.activeToolId === 'snare') {
      const animation = collectionAnimationForTool('snare', specimen);
      const target = runtimeSpecimenPosition(specimen, specimenRuntimePositions, position.y);
      if (animation.align && target) {
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        if (Math.hypot(dx, dz) > 0.08) {
          const now = performance.now() / 1000;
          stateRef.current.collectionFaceMotion = {
            targetYaw: Math.atan2(dx, dz),
            startedAt: now,
            until: now + Math.min(0.58, Math.max(0.24, (animation.duration || 1) * 0.18)),
          };
        }
      }
      startAction(animation.clip, animation.duration, { lockMovement: animation.lockMovement });
      collectNearby();
      return true;
    }
    if (!currentState.examinedTypeIds?.includes(specimen.id)) {
      // Collection is gated by examination. The store emits the explanatory
      // narration and leaves the player free to press Enter to examine.
      collectNearby();
      return true;
    }

    const alreadyCollected = currentState.collectedSpecimenIds?.includes(specimen.id) || false;
    const documented = currentState.activeToolId === 'sketch' || alreadyCollected;
    const animation = collectionAnimationForTool(currentState.activeToolId, specimen, { documented });
    const target = runtimeSpecimenPosition(specimen, specimenRuntimePositions, position.y);
    if (animation.align && target) {
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      if (Math.hypot(dx, dz) > 0.08) {
        const now = performance.now() / 1000;
        stateRef.current.collectionFaceMotion = {
          targetYaw: Math.atan2(dx, dz),
          startedAt: now,
          until: now + Math.min(0.58, Math.max(0.24, (animation.duration || 1) * 0.18)),
        };
      }
    }
    // First-time captures earn a short celebration flourish after the
    // collection animation resolves (interruptible, so it never costs input).
    const celebrate = stateRef.current.modelAssetId === 'darwin5' && !alreadyCollected;
    startAction(animation.clip, animation.duration, {
      lockMovement: animation.lockMovement,
      ...(celebrate ? { recoverAction: 'happyIdle' } : {}),
    });
    if (currentState.activeToolId === 'insect_net' && maybeTriggerNetSnagFromSwing({ position, facing })) {
      return true;
    }
    collectNearby();
    return true;
  };

  // Enter (or the mobile/desktop Examine button, which pulses touch.inspect)
  // examines first, then becomes the collection command once that type has a
  // saved field note.
  const examinePressed = keys.examine || touch.inspect;
  if (constraintLocksInteractions && examinePressed && !lastExamineRef.current) {
    useThreeGameStore.getState().reportConstraintBlockedAction?.();
  } else if (allowSpecimenInteractions && examinePressed && !lastExamineRef.current && !stateRef.current.action) {
    const currentState = useThreeGameStore.getState();
    const specimenId = currentState.nearbySpecimenId || currentState.selectedSpecimenId;
    const specimen = specimenId
      ? zoneSpecimens.find(item => (item.instanceId || item.id) === specimenId || item.id === specimenId)
      : null;
    if (specimen && currentState.collectedSpecimenActorIds?.includes(specimen.instanceId || specimen.id)) {
      setNearbySpecimen(null);
    } else if (specimen && currentState.examinedTypeIds?.includes(specimen.id)) {
      startSpecimenCollection(currentState, specimen);
    } else if (specimenId && !currentState.examineSession) {
      openExamine(specimenId);
    } else if (currentState.nearbyItem && !currentState.examineSession) {
      openExamine({
        itemTypeId: currentState.nearbyItem.typeId,
        actorId: currentState.nearbyItem.actorId,
        focus: currentState.nearbyItem.focus,
      });
    }
  }
  lastExamineRef.current = examinePressed;

  if ((keys.interact || touch.interact) && !lastInteractRef.current) {
    const currentState = useThreeGameStore.getState();
    if (constraintLocksInteractions) {
      currentState.reportConstraintBlockedAction?.();
      lastInteractRef.current = keys.interact || touch.interact;
      lastCameraRef.current = keys.camera;
      return;
    }
    const specimenId = currentState.nearbySpecimenId || currentState.selectedSpecimenId;
    const specimen = specimenId
      ? zoneSpecimens.find(item => (item.instanceId || item.id) === specimenId || item.id === specimenId)
      : null;
    if (currentState.carriedObjectId) {
      // A zero-distance drop prompt must win over books, furniture, NPCs, and
      // other ambient E targets. Otherwise the HUD can promise "drop" while E
      // performs an unrelated nearby interaction.
      currentState.dropCarriedObject?.({ reason: 'manual', mode: 'place' });
    } else if (currentState.nearbyNpcEncounter && !stateRef.current.action) {
      currentState.openNpcEncounter?.(currentState.nearbyNpcEncounter.npcId);
    } else if (currentState.interiorPrompt) {
      const prompt = currentState.interiorPrompt;
      if (prompt.mode === 'read-book' && prompt.bookId && !stateRef.current.action) {
        currentState.openReadableBook?.(prompt.bookId, {
          focus: {
            x: prompt.position?.[0] || 0,
            y: prompt.position?.[1] || 0,
            z: prompt.position?.[2] || 0,
          },
        });
      } else if (prompt.mode === 'interior-rest' && !stateRef.current.action) {
        placePlayerAt?.({ position: prompt.restPose, facing: prompt.facing });
        const restFacing = prompt.facing || [0, 0, 1];
        stateRef.current.collectionFaceMotion = {
          targetYaw: Math.atan2(restFacing[0] || 0, restFacing[2] ?? 1),
          startedAt: performance.now() / 1000,
          until: performance.now() / 1000 + 0.65,
        };
        startAction('lyingDown', ACTION_DURATION.lyingDown, {
          lockMovement: true,
          onStart: () => currentState.restInInterior?.(prompt.label, prompt.message),
        });
      } else if (prompt.mode === 'interior-message') {
        currentState.reportInteriorMessage?.(prompt.message || prompt.text);
      }
    } else if (currentState.carryPrompt) {
      if (currentState.carryPrompt.mode === 'collect-rock-sample') {
        if (!stateRef.current.action) {
          startAction('kneelInspect', ACTION_DURATION.kneelInspect, { lockMovement: true });
        }
        currentState.collectRockSample?.(currentState.carryPrompt.sample);
      } else if (currentState.carryPrompt.mode === 'harvest-crop') {
        if (!stateRef.current.action) {
          const clip = currentState.carryPrompt.crop?.pickClip === 'ground' ? 'kneelInspect' : 'gatherChestHeight';
          startAction(clip, ACTION_DURATION[clip], { lockMovement: true });
        }
        currentState.harvestCrop?.(currentState.carryPrompt.crop);
      } else if (currentState.carryPrompt.mode === FORAGE_PROMPT_MODE) {
        const mode = getPlayableMode(currentState.playableModeId);
        const forageable = currentState.carryPrompt.forageable;
        if (mode.kind === 'animal') {
          const eatAction = getAnimalAction('eat');
          if (eatAction && !stateRef.current.action) {
            startAction(eatAction.clip, eatAction.duration, {
              lockMovement: eatAction.lockMovement ?? 0.45,
              onStart: () => {
                const forageResult = currentState.consumeForageable?.(forageable);
                currentState.recordAnimalModeAction?.({
                  actionId: 'eat',
                  foodLabel: forageResult?.foodLabel || forageable?.foodLabel,
                  forage: forageResult?.consumed ? forageResult : null,
                });
              },
            });
          }
        } else {
          if (!stateRef.current.action) {
            const clip = forageable?.pickClip || 'gatherGround';
            startAction(clip, ACTION_DURATION[clip] || ACTION_DURATION.gatherGround, { lockMovement: true });
          }
          currentState.consumeForageable?.(forageable);
        }
      } else if (currentState.carryPrompt.mode === 'check-snare') {
        if (!stateRef.current.action) {
          startAction('kneelInspect', ACTION_DURATION.kneelInspect, { lockMovement: true });
        }
        currentState.checkSnareTrap?.(currentState.carryPrompt.id);
      } else if (currentState.carryPrompt.mode === 'pickup') {
        if (!stateRef.current.action) {
          startAction('pickUp', ACTION_DURATION.pickUp, { lockMovement: true });
          stateRef.current.pendingCarryPickup = {
            id: currentState.carryPrompt.id,
            zoneId: currentZoneId,
            attachAt: interactionNow + CARRY_PICKUP_ATTACH_DELAY,
            cancelAt: interactionNow + CARRY_PICKUP_CANCEL_DELAY,
          };
        }
      }
    } else if (specimen && currentState.collectedSpecimenActorIds?.includes(specimen.instanceId || specimen.id)) {
      setNearbySpecimen(null);
    } else if (!specimen
      && currentState.edgePrompt?.visible !== false
      && currentState.edgePrompt?.requiresHold !== true
      && currentState.edgePrompt?.kind === 'open'
      && currentState.edgePrompt.toRegionId
      && !stateRef.current.action) {
      beginZoneTransition(currentState.edgePrompt.toRegionId, {
        entryEdge: currentState.edgePrompt.entryEdge || oppositeEdge(currentState.edgePrompt.edge),
        note: currentState.edgePrompt.description,
        mode: currentState.edgePrompt.localTransition ? 'threshold' : 'island',
        localTransition: currentState.edgePrompt.localTransition === true,
      });
    } else if (currentState.edgePrompt?.kind === 'blocked' && !specimen) {
      setEdgePrompt({
        ...currentState.edgePrompt,
        message: currentState.edgePrompt.description,
      });
    } else if (allowSpecimenInteractions && specimen) {
      startSpecimenCollection(currentState, specimen);
    } else if (currentState.activeToolId === 'snare' && !stateRef.current.action) {
      startAction('kneelInspect', ACTION_DURATION.kneelInspect, { lockMovement: true });
      currentState.placeSnareTrap?.({ position, facing });
    }
  }
  if (keys.camera && !lastCameraRef.current) cycleViewMode();
  const toolbarOrder = useThreeGameStore.getState().toolbarOrder;
  const lastToolHotkeys = stateRef.current.lastToolHotkeys || {};
  for (let index = 0; index < 6; index += 1) {
    const button = `tool${index + 1}`;
    const toolId = toolbarOrder[index];
    const pressed = Boolean(keys[button]);
    if (pressed && !lastToolHotkeys[button] && toolId) {
      if (useThreeGameStore.getState().activeToolId === toolId) {
        triggerToolUse(toolId);
      } else {
        setActiveTool(toolId);
      }
    }
    lastToolHotkeys[button] = pressed;
  }
  stateRef.current.lastToolHotkeys = lastToolHotkeys;
  lastInteractRef.current = keys.interact || touch.interact;
  lastCameraRef.current = keys.camera;
}
