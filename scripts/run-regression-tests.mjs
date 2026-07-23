import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const projectRequire = createRequire(import.meta.url);
const { Vector3 } = projectRequire('three');
const moduleCache = new Map();
const EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.jsx'];

function resolveLocalModule(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
}

function loadModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const extension = path.extname(absolutePath);
  if (extension === '.json') {
    const module = { exports: JSON.parse(source) };
    moduleCache.set(absolutePath, module);
    return module.exports;
  }
  const jsx = extension === '.tsx' || extension === '.jsx'
    ? ts.JsxEmit.ReactJSX
    : ts.JsxEmit.Preserve;
  const transpiled = ts.transpileModule(source, {
    fileName: absolutePath,
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      jsx,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const localRequire = (specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      return loadModule(resolveLocalModule(specifier, absolutePath));
    }
    return projectRequire(specifier);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled);
  fn(module.exports, localRequire, module, absolutePath, path.dirname(absolutePath));
  return module.exports;
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const {
  examinationDepthOfFieldActive,
  postprocessingComposerActive,
} = loadModule('three-game/examine/examinationPostFx.js');

test('examination depth of field covers every focused examinable kind', () => {
  for (const kind of ['specimen', 'ambient', 'item']) {
    assert.equal(examinationDepthOfFieldActive({ kind, focus: { x: 1, y: 2, z: 3 } }), true);
  }
  assert.equal(examinationDepthOfFieldActive({ kind: 'specimen', focus: null }), false);
  assert.equal(examinationDepthOfFieldActive(null), false);
});

test('examination keeps a minimal postprocessing composer alive when general effects are off', () => {
  const focusedSession = { kind: 'ambient', focus: { x: 0, y: 0, z: 0 } };
  assert.equal(postprocessingComposerActive(false, focusedSession), true);
  assert.equal(postprocessingComposerActive(false, null), false);
  assert.equal(postprocessingComposerActive(true, null), true);
});

const {
  buildActionSuggestions,
  mergeActionSuggestions,
} = loadModule('utils/actionSuggestions.js');
const {
  buildReadinessRecommendations,
  createDefaultObjectives,
  evaluateExpeditionReadiness,
  getTrapReadiness,
  previewCollectionMethod,
  updateObjectiveProgress,
} = loadModule('utils/expeditionSystems.js');
const {
  beginLLMRequest,
  finishLLMRequest,
} = loadModule('utils/server/llmSafety.js');
const {
  clampNpcEncounterEffects,
  getNpcEncounterPresentation,
  getNearestNpcEncounter,
} = loadModule('three-game/encounters/npcEncounters.js');
const {
  assignHybridLocation,
  hasUsableLocation,
  selectHybridLocation,
} = loadModule('utils/hybridPlacement.js');
const {
  buildSaveSnapshot,
  summarizeExpeditionSave,
} = loadModule('utils/localSave.js');
const {
  buildSpecimenDocumentationNote,
  buildSurveyNote,
  selectDocumentableSpecimen,
} = loadModule('utils/fieldworkNotes.js');
const {
  deterministicChoice,
} = loadModule('utils/deterministicChoice.js');
const {
  MAX_HYBRID_BATCH_SIZE,
  clampHybridBatchSize,
  selectDeterministicParentPairs,
  shouldAutoGenerateHybrids,
} = loadModule('utils/hybridGenerationPolicy.js');
const {
  detectInteriorEntry,
  routePlayerCommand,
} = loadModule('utils/playerCommandRouter.js');
const {
  groundHammerMaterial,
  inferHammerMaterial,
  rockSampleKey,
  resolveHammerOutcome,
  selectRockSampleTarget,
} = loadModule('three-game/physics/props/rockSampling.js');
const {
  capHorizontalVelocity,
  computeContactPushImpulse,
  computeControlledPushVelocity,
  computeLandingSettleMotion,
  computeSustainedPushTorque,
  mobilityVelocityCaps,
} = loadModule('three-game/physics/objectMobility.js');
const {
  resolveFootprintResponse,
  resolveSurfaceContactResponse,
} = loadModule('three-game/world/surfaceContactResponse.js');
const {
  surfaceContactProfileForBiome,
} = loadModule('three-game/world/surfaceContact.js');
const {
  computeEnvironmentalAudioTargets,
  diurnalBirdCallsAllowed,
  distanceToOceanBoundary,
  dryInsectHabitat,
  isInteriorAmbienceZone,
  nocturnalOwlCallsAllowed,
  surfPresenceForZone,
  zoneHasDirectCoast,
} = loadModule('three-game/audio/environmentMix.js');
const {
  clampReleaseLinearVelocity,
  createRestrainedReleaseImpulse,
  damageLeanAngle,
  selectHammerImpactTargets,
  selectKnifeCutTargets,
} = loadModule('three-game/physics/props/breakablePlant/breakablePhysics.js');
const {
  buildMatureCactusObstacles,
  buildMatureCactusTargets,
  cactusSpineInjuryChance,
  matureCactusProfileForPath,
  selectMatureCactusMeleeTarget,
  selectMatureCactusShotgunHits,
} = loadModule('three-game/world/ecology/matureCactusInteractions.js');
const {
  carryGripForProp,
  carryPlacementCandidates,
  propHorizontalRadius,
} = loadModule('three-game/components/player/carryProfiles.js');
const {
  classifyRapierCharacterContacts,
} = loadModule('three-game/components/player/playerCollisionContacts.js');
const {
  emitNpcContact,
  onNpcContact,
  publishNpcPose,
  removeNpcPose,
} = loadModule('three-game/world/npcRuntime.js');
const {
  resolveNpcPlayerCollision,
  resolvePlayerNpcCollision,
} = loadModule('three-game/npcs/npcCollision.js');
const {
  PROP_TYPES,
} = loadModule('three-game/physics/props/propTypes.js');
const {
  getObstacleSupportHeight,
  getRuntimeObstacles,
  isWalkOverTraversalObstacle,
  obstacleBaseY,
  queryObstacleBounds,
  queryObstaclesNear,
  resolveObstacleCollision,
} = loadModule('three-game/world/obstacles.js');
const {
  createCollisionAdapter,
} = loadModule('three-game/physics/collisionAdapter.js');
const {
  findClimbOpportunity,
  findTerrainClimbTarget,
} = loadModule('three-game/components/player/playerTraversalMotion.js');
const {
  acknowledgeContextPromptState,
  clearContextPromptState,
  publishContextPromptState,
} = loadModule('three-game/ui/contextPromptService.js');
const {
  resolveFieldAction,
  sameFieldAction,
} = loadModule('three-game/fieldActions.js');
const {
  createLazyAnimationActions,
} = loadModule('three-game/components/assets/lazyAnimationActions.js');
const {
  resolveTerrainSegments,
  terrainGeometryStats,
} = loadModule('three-game/world/terrainGeometry.js');
const {
  getRegionTerrainConfig,
  isWalkableTerrain,
  movementTerrainHeight,
  regionSpawnPoint,
  terrainSlopeAt,
  terrainHeight,
} = loadModule('three-game/world/terrain.js');
const {
  getBorderVistas,
} = loadModule('three-game/world/vistas/index.js');
const {
  puntaSurSouthCoastZ,
} = loadModule('three-game/world/regions/puntaSur/path.js');
const {
  apronCornerMode,
  apronCornerReach,
  apronOwnsCorner,
  apronTopologyHold,
  makeNeighborPreviewGeometry,
} = loadModule('three-game/world/vistas/apronGeometry.js');
const {
  distantLandformRoute,
  makeDistantLandformGeometry,
} = loadModule('three-game/world/vistas/distantLandforms.js');
const {
  buildBorderTransition,
} = loadModule('three-game/world/vistas/transitions.js');
const {
  borderEcologyBudget,
  borderGrassBudget,
  buildBorderEcologyLayers,
  buildBorderGrassLayers,
} = loadModule('three-game/world/vistas/borderEcology.js');
const {
  locations,
} = loadModule('data/locations.js');
const {
  getRegionDeveloperLabel,
  getRegionDisplayName,
  regionMaps,
} = loadModule('game-core/regionMaps.js');
const {
  FLOREANA_BOUNDARIES,
  FLOREANA_CARDINAL_DIRECTIONS,
  FLOREANA_MAP_PLACEMENTS,
  FLOREANA_OPPOSITE_DIRECTIONS,
  FLOREANA_ROUTE_EDGES,
  mapDirectionBetween,
} = loadModule('game-core/floreanaGeography.js');
const {
  CONTEXTUAL_WORLD_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  POST_OFFICE_BAY_AUDIO,
  WILDLIFE_FIELDWORK_AUDIO,
} = loadModule('three-game/audio/audioAssets.js');
const {
  getSoundscapeAudioMixSettings,
  resetSoundscapeAudioMix,
  resetSoundscapeAudioTrackTrim,
  setSoundscapeAudioMasterTrimDb,
  setSoundscapeAudioTrackTrimDb,
} = loadModule('three-game/audio/audioRuntime.js');
const {
  NORTHERN_HIGHLANDS_ALT_POST_OFFICE_BAY_SEAM,
  NORTHERN_HIGHLANDS_CORMORANT_BAY_SEAM,
  NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM,
  PENAL_COLONY_WATKINS_CREEK_SEAM,
  POST_OFFICE_NORTH_SHORE_SEAM,
  POST_OFFICE_SCRUB_RISE_SEAM,
  POST_SCRUB_RISE_NORTHERN_HIGHLANDS_SEAM,
  WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM,
  WATKINS_CREEK_WATKINS_SEAM,
  BLACK_BEACH_WESTERN_LOWLANDS_SEAM,
  WESTERN_LOWLANDS_BEACH_HUT_SEAM,
  WESTERN_LOWLANDS_WESTERN_HIGHLANDS_SEAM,
} = loadModule('three-game/world/routeSeams.js');
const {
  coveWaterMask,
  postOfficeBayCoastZ,
  POST_OFFICE_BAY_BARREL_CLEARING,
  postOfficeLandingBeachMask,
  postOfficePathInfo,
  POST_OFFICE_BAY_NORTH_SHORE_TRAIL,
  POST_OFFICE_BAY_SCRUB_TRAIL,
  postOfficeTerrainBiomeAt,
  postOfficeTerrainHeight,
} = loadModule('three-game/world/regions/postOfficeBay/terrain.js');
const {
  buildPostOfficeBayEcology,
} = loadModule('three-game/world/ecology/postOfficeBay.js');
const {
  buildNorthShoreEcology,
} = loadModule('three-game/world/ecology/northShore.js');
const {
  N_SHORE_PATH_POINTS,
} = loadModule('three-game/world/regions/northShore/terrain.js');
const {
  POST_SCRUB_RISE_PATH_POINTS,
  scrubRiseBasaltExposure,
  scrubRisePathInfo,
  scrubRiseThicketStrength,
  scrubRiseWashMask,
} = loadModule('three-game/world/regions/postScrubRise/path.js');
const {
  buildPostScrubRiseEcology,
} = loadModule('three-game/world/ecology/postScrubRise.js');
const {
  ECOLOGY_ZONE_IDS,
  getEcology,
} = loadModule('three-game/world/ecology/index.js');
const {
  lavaFlatsPathInfo,
  lavaFlatsPioneerMask,
  lavaFlatsTubeMasks,
} = loadModule('three-game/world/regions/lavaFlats/path.js');
const {
  isLavaFlatsWalkable,
  lavaFlatsHeight,
} = loadModule('three-game/world/regions/lavaFlats/terrain.js');
const {
  getLavaFlatsRocks,
} = loadModule('three-game/world/lavaFlatsLayout.js');
const {
  getDevilsCrownRocks,
} = loadModule('three-game/world/devilsCrownLayout.js');
const {
  rockVisualBounds,
} = loadModule('three-game/world/proceduralRocks.js');
const {
  desolateOutcropDryMask,
  desolateOutcropGuanoMask,
  desolateOutcropTideShelfMask,
  desolateOutcropTidepoolMask,
} = loadModule('three-game/world/regions/desolateOutcrop/terrain.js');
const {
  rockyClearingCaveThresholdMask,
  rockyClearingPathInfo,
  rockyClearingRubbleMask,
} = loadModule('three-game/world/regions/rockyClearing/path.js');
const {
  NORTHERN_HIGHLANDS_PATH_POINTS,
  northernHighlandsCormorantEcotone,
  northernHighlandsGardenInfo,
  northernHighlandsPathInfo,
} = loadModule('three-game/world/regions/northernHighlands/path.js');
const {
  northernHighlandsBiomeAt,
  northernHighlandsHeight,
} = loadModule('three-game/world/regions/northernHighlands/terrain.js');
const {
  buildNorthernHighlandsEcology,
} = loadModule('three-game/world/ecology/northernHighlands.js');
const {
  WATKINS_CREEK_PATH_POINTS,
  watkinsCreekChannelInfo,
  watkinsCreekFlowAt,
  watkinsCreekPathInfo,
  watkinsCreekStandingWaterMask,
  watkinsCreekStandingWaterSuppressionMask,
} = loadModule('three-game/world/regions/watkinsCreek/path.js');
const {
  watkinsCreekBiomeAt,
  watkinsCreekHeight,
} = loadModule('three-game/world/regions/watkinsCreek/terrain.js');
const {
  buildWatkinsCreekEcology,
} = loadModule('three-game/world/ecology/watkinsCreek.js');
const {
  getWatkinsCreekFordStones,
  getWatkinsCreekRockObstacles,
} = loadModule('three-game/world/watkinsCreekLayout.js');
const {
  buildCormorantBayEcology,
} = loadModule('three-game/world/ecology/cormorantBayTest3.js');
const {
  cormorantLagoonField,
  cormorantTrailDistance,
} = loadModule('three-game/world/regions/cormorantBay/terrain.js');
const {
  getNorthernHighlandsRockObstacles,
} = loadModule('three-game/world/northernHighlandsLayout.js');
const {
  WESTERN_LOWLANDS_PATHS,
  westernLowlandsPathInfo,
} = loadModule('three-game/world/regions/westernLowlands/path.js');
const {
  westernLowlandsBiomeAt,
  westernLowlandsHeight,
  westernLowlandsLagoonMask,
  westernLowlandsStandingWaterMask,
} = loadModule('three-game/world/regions/westernLowlands/terrain.js');
const {
  buildWesternLowlandsEcology,
} = loadModule('three-game/world/ecology/westernLowlands.js');
const {
  getWesternLowlandsCabinDependents,
  getWesternLowlandsCabinPieces,
  getWesternLowlandsDryingRackDependents,
  getWesternLowlandsDryingRackPieces,
  getWesternLowlandsObstacles,
} = loadModule('three-game/world/westernLowlandsLayout.js');
const {
  WATER_LEVEL,
  WADE_DEPTH,
} = loadModule('three-game/world/terrainShared.js');
const {
  buildWesternHighlandsEcology,
} = loadModule('three-game/world/ecology/westernHighlands.js');
const {
  westernHighlandsTrailInfluence,
} = loadModule('three-game/world/regions/westernHighlands/terrain.js');
const {
  buildWatkinsCampEcology,
} = loadModule('three-game/world/ecology/watkinsCamp.js');
const {
  watkinsPathInfo,
  watkinsRiverInfo,
} = loadModule('three-game/world/regions/watkinsCamp/terrain.js');
const {
  getInteriorDefinition,
  getInteriorPropSpawns,
} = loadModule('three-game/interiors/interiorRegistry.js');
const {
  beagleCabinRegion,
} = loadModule('three-game/world/regions/beagleCabin/terrain.js');
const {
  lawsonHouseRegion,
} = loadModule('three-game/world/regions/lawsonHouse/terrain.js');
const {
  getLocalTransitions,
  nearestLocalTransitionPrompt,
} = loadModule('three-game/world/localTransitions.js');
const {
  getIslandMapLocation,
  islandMapLocations,
  ISLAND_MAP_IMAGE,
} = loadModule('three-game/ui/expedition/map/islandLocations.js');
const {
  getThreeSpecimens,
} = loadModule('three-game/data.js');
const {
  baseSpecimens,
} = loadModule('data/specimens.js');
const {
  getWildlifeBehaviorProfile,
  getWildlifeRenderProfile,
} = loadModule('three-game/wildlife/wildlifeCatalog.js');
const {
  createFaunaMotionController,
} = loadModule('three-game/fauna/faunaMotionController.js');
const {
  getTreePerches,
  isAuthoredTreePerch,
} = loadModule('three-game/wildlife/treePerches.js');
const {
  getOwlRoosts,
  isOwlRoost,
} = loadModule('three-game/wildlife/owlRoosts.js');
const {
  getRacerShelters,
  isRacerShelter,
} = loadModule('three-game/wildlife/racerShelters.js');
const {
  consumeSpecimenStimuli,
  removeSpecimenRuntimePose,
  setSpecimenRuntimePose,
} = loadModule('three-game/world/specimenRuntime.js');
const {
  DEFAULT_PLAYER_MODEL_ASSET_ID,
  modelAssets,
} = loadModule('three-game/modelAssets.js');
const {
  specimenSpawnActorId,
} = loadModule('game-core/specimens.ts');
const {
  getZone: getRuntimeZone,
} = loadModule('three-game/world/floreanaZones.js');
const {
  getBeagleSightline,
} = loadModule('three-game/world/beagleSightlines.js');
const {
  moonDirection,
  moonPhase,
  siderealAngle,
  skyState,
  sunDirection,
} = loadModule('three-game/world/celestial.js');
const {
  floraCompanionSuitability,
  floraPreferenceSuitability,
  scoreFloraHabitat,
} = loadModule('three-game/world/ecology/proceduralFlora.js');
const {
  CANDELABRA_CACTUS_SPECIES,
  CROTON_SCOULERI_SPECIES,
  DARWINIOTHAMNUS_SPECIES,
  DELILIA_INELEGANS_SPECIES,
  LAVA_CACTUS_SPECIES,
  LECOCARPUS_PINNATIFIDUS_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
  PLEOPELTIS_POLYPODIOIDES_SPECIES,
} = loadModule('three-game/world/ecology/floraSpecies.js');
const {
  getPricklyPearSites,
} = loadModule('three-game/physics/props/pricklyPear/pricklyPearSites.js');
const {
  getLavaCactusSites,
} = loadModule('three-game/physics/props/lavaCactus/lavaCactusSites.js');
const {
  getDeliliaSites,
} = loadModule('three-game/physics/props/delilia/deliliaSites.js');
const {
  getLecocarpusSites,
} = loadModule('three-game/physics/props/lecocarpus/lecocarpusSites.js');
const {
  buildPenalColonyEcology,
} = loadModule('three-game/world/ecology/penalColony.js');
const {
  penalColonyGardenInfo,
  penalColonyPathInfo,
  penalColonyTrampledMask,
} = loadModule('three-game/world/regions/penalColony/path.js');
const {
  buildSweetPotatoGeometry,
  SWEET_POTATO_HEART_LEAF_COUNT,
} = loadModule('three-game/world/crops/sweetPotatoGeometry.js');
const {
  findHammerCropHits,
  findShotgunCropHits,
  mergeCropDamageState,
} = loadModule('three-game/world/crops/cropDamage.js');
const {
  WEATHER_STATES,
  normalizeWeatherState,
  weatherProfile,
} = loadModule('three-game/world/weatherStates.js');
const {
  WEATHER_BAND_WEIGHTS,
  getRegionClimateBand,
  getRegionWeather,
} = loadModule('three-game/world/weatherDirector.js');
const {
  createFaunaFrameScheduler,
  faunaFrameTier,
} = loadModule('three-game/fauna/faunaFrameScheduler.js');
const {
  DEFAULT_SYMS_DIRECTIVE,
  SYMS_DIRECTIVES,
  SYMS_FIELD_CASE_ID,
  SYMS_FIELD_CASE_PLACEMENT,
  SYMS_FIELD_CASE_PROMPT_MODE,
  buildSymsPostOfficeBayPlan,
  findSymsRoute,
  nextSymsActivity,
  normalizeSymsDirective,
} = loadModule('three-game/npcs/symsActivityPlan.js');
const {
  SYMS_HOME_ZONE_ID,
  canSymsAccompanyZone,
  findSymsCompanionArrival,
  symsZoneAfterDirective,
  symsZoneAfterTransition,
} = loadModule('three-game/npcs/symsCompanion.js');
const { getZoneProps } = loadModule('three-game/physics/props/propRegistry.js');
const {
  resolveActorPropCollision,
} = loadModule('three-game/physics/props/propCollision.js');
const {
  getZonePropCollisionProps,
  publishPropPose,
  removePropPose,
} = loadModule('three-game/physics/props/propRuntime.js');
const {
  CATASTROPHIC_FALL_SPEED,
  expeditionOutcomeCause,
  minutesUntilRecoveryMorning,
  resolveExpeditionDamage,
} = loadModule('three-game/expeditionOutcomes.js');
const {
  applyTranscriptEvaluation,
  buildFinalAssessmentRecord,
  buildLocalHenslowAssessment,
  buildPlayerNarratorTranscript,
  evaluateFinalAssessment,
  isEndGameNarratorCommand,
} = loadModule('three-game/finalAssessment.js');
const {
  animalDirectQuestionGuidance,
  buildAnimalNarratorPrompt,
  buildAnimalNarratorSystemPrompt,
  getPlayableNarratorProfile,
} = loadModule('three-game/narrator/playableNarratorProfiles.js');
const {
  assignToolbarSlot,
  moveToolbarSlot,
} = loadModule('three-game/toolbar.js');
const {
  consumeTouchControls,
  triggerToolUse,
} = loadModule('three-game/input/touchControls.js');

test('Syms builds a connected north-bay fieldwork circuit with calculated activity sites', () => {
  const plan = buildSymsPostOfficeBayPlan();
  assert.equal(plan.zoneId, 'POST_OFFICE_BAY');
  assert.ok(plan.nodes.size >= 15);
  assert.equal(plan.interestSites.length, 3);
  assert.notEqual(plan.restSite.id, plan.lookoutSite.id);
  assert.ok(plan.activitySites.includes(plan.baseSite));
  assert.ok(plan.activitySites.includes(plan.restSite));
  assert.ok(plan.activitySites.includes(plan.lookoutSite));

  for (const site of plan.activitySites) {
    const route = findSymsRoute(plan, plan.baseSite, site);
    assert.ok(route.length > 0, `expected a route from base to ${site.id}`);
    const end = route.at(-1);
    assert.ok(Math.hypot(end.x - site.x, end.z - site.z) < 0.01);
  }
  assert.equal(nextSymsActivity(plan, plan.activitySites.length), plan.activitySites[0]);
});

test('Syms field orders normalize safely and his base uses shared prop definitions', () => {
  assert.equal(normalizeSymsDirective(SYMS_DIRECTIVES.FOLLOW), 'follow');
  assert.equal(normalizeSymsDirective(SYMS_DIRECTIVES.WAIT), 'wait');
  assert.equal(normalizeSymsDirective('invent-a-command'), DEFAULT_SYMS_DIRECTIVE);

  const props = getZoneProps('POST_OFFICE_BAY');
  const fieldKit = props.find(prop => prop.id === 'syms-field-kit');
  const fieldCase = props.find(prop => prop.id === SYMS_FIELD_CASE_ID);
  const bottle = props.find(prop => prop.id === 'syms-field-bottle');
  assert.equal(fieldKit.visualAsset, 'cratesAndBags');
  assert.equal(fieldKit.fixed, true);
  assert.equal(fieldCase.visual, 'symsFieldCase');
  assert.equal(fieldCase.behaviors.mobility.mode, 'push');
  assert.equal(fieldCase.behaviors.strikeable.tool, 'hammer');
  assert.equal(fieldCase.x, SYMS_FIELD_CASE_PLACEMENT.x);
  assert.equal(fieldCase.z, SYMS_FIELD_CASE_PLACEMENT.z);
  assert.equal(bottle.visual, 'symsFieldBottle');
  assert.equal(bottle.behaviors.mobility.mode, 'push');
  assert.equal(bottle.behaviors.breakable.debris, 'glass');

  assert.equal(SYMS_FIELD_CASE_ID, 'syms-field-case');
  assert.equal(SYMS_FIELD_CASE_PROMPT_MODE, 'toggle-syms-field-case');
  const base = buildSymsPostOfficeBayPlan().baseSite;
  assert.ok(Math.hypot(
    SYMS_FIELD_CASE_PLACEMENT.x - base.x,
    SYMS_FIELD_CASE_PLACEMENT.z - base.z,
  ) < 4, 'collecting case should remain at Syms’s authored shore base');
});

test('Syms follow state crosses exterior maps while wait and interiors preserve his location', () => {
  assert.equal(SYMS_HOME_ZONE_ID, 'POST_OFFICE_BAY');
  assert.equal(canSymsAccompanyZone('POST_SCRUB_RISE'), true);
  assert.equal(canSymsAccompanyZone('LAWSON_HOUSE'), false);
  assert.equal(symsZoneAfterDirective({
    directive: SYMS_DIRECTIVES.FOLLOW,
    currentZoneId: 'POST_SCRUB_RISE',
    symsZoneId: SYMS_HOME_ZONE_ID,
  }), 'POST_SCRUB_RISE');
  assert.equal(symsZoneAfterDirective({
    directive: SYMS_DIRECTIVES.WAIT,
    currentZoneId: 'N_SHORE',
    symsZoneId: 'POST_SCRUB_RISE',
  }), 'POST_SCRUB_RISE');
  assert.equal(symsZoneAfterDirective({
    directive: SYMS_DIRECTIVES.RANGE,
    currentZoneId: 'N_SHORE',
    symsZoneId: 'N_SHORE',
  }), SYMS_HOME_ZONE_ID);
  assert.equal(symsZoneAfterTransition({
    directive: SYMS_DIRECTIVES.FOLLOW,
    playableModeId: 'darwin',
    destinationZoneId: 'N_SHORE',
    symsZoneId: SYMS_HOME_ZONE_ID,
  }), 'N_SHORE');
  assert.equal(symsZoneAfterTransition({
    directive: SYMS_DIRECTIVES.FOLLOW,
    playableModeId: 'darwin',
    destinationZoneId: 'LAWSON_HOUSE',
    symsZoneId: 'PENAL_COLONY',
  }), 'PENAL_COLONY');
  assert.equal(symsZoneAfterTransition({
    directive: SYMS_DIRECTIVES.WAIT,
    playableModeId: 'darwin',
    destinationZoneId: 'N_SHORE',
    symsZoneId: SYMS_HOME_ZONE_ID,
  }), SYMS_HOME_ZONE_ID);
});

test('Syms companion arrival is walkable, separated, and encounter-enabled off the home map', () => {
  const exteriorZoneIds = Object.keys(regionMaps).filter(canSymsAccompanyZone);
  assert.ok(exteriorZoneIds.length >= 40);
  for (const exteriorZoneId of exteriorZoneIds) {
    const spawn = regionSpawnPoint(exteriorZoneId);
    const companion = findSymsCompanionArrival({ zoneId: exteriorZoneId });
    assert.equal(
      isWalkableTerrain(companion.x, companion.z, exteriorZoneId),
      true,
      `${exteriorZoneId} companion arrival should be walkable`,
    );
    assert.ok(
      Math.hypot(companion.x - spawn.x, companion.z - spawn.z) >= 1.05,
      `${exteriorZoneId} companion arrival should clear Darwin`,
    );
  }

  const zoneId = 'POST_SCRUB_RISE';
  const entryEdge = 'north';
  const playerSpawn = regionSpawnPoint(zoneId, entryEdge);
  const arrival = findSymsCompanionArrival({
    zoneId,
    entryEdge,
    obstacles: getRuntimeObstacles(zoneId),
  });
  assert.equal(isWalkableTerrain(arrival.x, arrival.z, zoneId), true);
  assert.ok(Math.hypot(arrival.x - playerSpawn.x, arrival.z - playerSpawn.z) >= 1.05);

  publishNpcPose(zoneId, 'syms', arrival);
  try {
    const encounter = getNearestNpcEncounter(zoneId, {
      x: arrival.x + 0.5,
      z: arrival.z,
    });
    assert.equal(encounter?.npcId, 'syms_covington');
  } finally {
    removeNpcPose(zoneId, 'syms');
  }
});

test('Post Office Bay arrival props begin in settled configurations', () => {
  const props = getZoneProps('POST_OFFICE_BAY');
  const barrel = props.find(prop => prop.id === 'post-office-rollable-barrel');
  const arrivalBoulders = ['bay-path-stone-a', 'bay-path-stone-b', 'bay-path-stone-c']
    .map(id => props.find(prop => prop.id === id));

  assert.deepEqual(barrel.rotation, [0, 0.72, 0]);
  assert.ok(
    terrainSlopeAt(barrel.x, barrel.z, 'POST_OFFICE_BAY', 0.5).grade < 0.15,
    'loose barrel should start upright on the flatter eastern supply shelf',
  );
  assert.ok(arrivalBoulders.every(Boolean));
  for (const boulder of arrivalBoulders) {
    assert.equal(boulder.type, 'settledBasaltBoulder');
    assert.equal(boulder.collider.shape, 'cuboid');
    assert.deepEqual(boulder.enabledRotations, [false, true, false]);
    assert.equal(boulder.behaviors.mobility.mode, 'push');
    assert.equal(boulder.behaviors.carryable, undefined);
    assert.deepEqual([boulder.rotation[0], boulder.rotation[2]], [0, 0]);
  }
  const shoulderBoulder = arrivalBoulders.find(prop => prop.id === 'bay-path-stone-c');
  assert.ok(
    terrainSlopeAt(shoulderBoulder.x, shoulderBoulder.z, 'POST_OFFICE_BAY', 0.5).grade < 0.08,
    'nearest launch boulder should start on the level trail shoulder',
  );
});

test('published NPC capsules separate Darwin and emit reusable contact events', () => {
  const zoneId = 'NPC_COLLISION_TEST';
  const contacts = [];
  const unsubscribe = onNpcContact(event => contacts.push(event));

  try {
    publishNpcPose(zoneId, 'test-naturalist', {
      x: 0,
      y: 0,
      z: 0,
      collisionRadius: 0.4,
      collisionHeight: 1.8,
    });
    const playerCollision = resolvePlayerNpcCollision(
      new Vector3(0.5, 0, 0),
      new Vector3(0.8, 0, 0),
      { zoneId, playerRadius: 0.36, playerHeight: 1.8 },
    );
    assert.equal(playerCollision.npcId, 'test-naturalist');
    assert.ok(playerCollision.position.x >= 0.77);
    assert.deepEqual(playerCollision.normal.toArray(), [1, 0, 0]);

    const npcCollision = resolveNpcPlayerCollision(
      new Vector3(-0.5, 0, 0),
      new Vector3(-0.8, 0, 0),
      { x: 0, y: 0, z: 0 },
      { npcRadius: 0.4, playerRadius: 0.36 },
    );
    assert.ok(npcCollision.position.x <= -0.77);
    assert.equal(resolveNpcPlayerCollision(
      new Vector3(-0.5, 3, 0),
      new Vector3(-0.8, 3, 0),
      { x: 0, y: 0, z: 0 },
      { npcRadius: 0.4, playerRadius: 0.36, npcHeight: 1.8, playerHeight: 1.8 },
    ), null);

    const upperFloor = resolvePlayerNpcCollision(
      new Vector3(0.2, 3, 0),
      new Vector3(0.4, 3, 0),
      { zoneId, playerRadius: 0.36, playerHeight: 1.8 },
    );
    assert.equal(upperFloor, null);

    emitNpcContact({ npcId: 'test-naturalist', zoneId, impactSpeed: 2 });
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].npcId, 'test-naturalist');
  } finally {
    unsubscribe();
    removeNpcPose(zoneId, 'test-naturalist');
  }
});

test('autonomous actors stay outside physics props at their live positions', () => {
  const zoneId = 'POST_OFFICE_BAY';
  const groundY = terrainHeight(0, 0, zoneId);
  const props = [{
    id: 'moving-test-crate',
    x: 0,
    z: 0,
    collider: { shape: 'cuboid', halfExtents: [0.5, 0.5, 0.5] },
  }];

  const staticHit = resolveActorPropCollision(
    new Vector3(-0.25, groundY, 0),
    new Vector3(-1.4, groundY, 0),
    props,
    zoneId,
    0.4,
  );
  assert.equal(staticHit.prop.id, 'moving-test-crate');
  assert.ok(staticHit.position.x <= -(Math.hypot(0.5, 0.5) + 0.4) + 0.001);

  publishPropPose(zoneId, 'moving-test-crate', { x: 2, y: groundY + 0.5, z: 0 });
  try {
    const liveProps = getZonePropCollisionProps(zoneId, props);
    assert.equal(liveProps[0].x, 2);
    assert.equal(resolveActorPropCollision(
      new Vector3(-0.25, groundY, 0),
      new Vector3(-1.4, groundY, 0),
      liveProps,
      zoneId,
      0.4,
    ), null);
    const liveHit = resolveActorPropCollision(
      new Vector3(1.75, groundY, 0),
      new Vector3(0.6, groundY, 0),
      liveProps,
      zoneId,
      0.4,
    );
    assert.equal(liveHit.prop.id, 'moving-test-crate');
    assert.ok(liveHit.position.x <= 2 - (Math.hypot(0.5, 0.5) + 0.4) + 0.001);
  } finally {
    removePropPose(zoneId, 'moving-test-crate');
  }
});

test('quick-bar assignment replaces new tools and swaps tools already on the bar', () => {
  const initial = ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch'];
  const available = [...initial, 'compass', 'pocket_knife'];
  const withKnife = assignToolbarSlot(initial, 0, 'pocket_knife', available);
  assert.deepEqual(withKnife, ['pocket_knife', 'insect_net', 'snare', 'hammer', 'hands', 'sketch']);
  assert.deepEqual(initial, ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch']);

  const swapped = assignToolbarSlot(withKnife, 4, 'pocket_knife', available);
  assert.deepEqual(swapped, ['hands', 'insect_net', 'snare', 'hammer', 'pocket_knife', 'sketch']);
  assert.equal(new Set(swapped).size, swapped.length);
  assert.equal(assignToolbarSlot(initial, 1, 'not-in-kit', available), initial);
});

test('quick-bar slot dragging preserves six ordered action bindings', () => {
  const initial = ['shotgun', 'insect_net', 'snare', 'hammer', 'hands', 'sketch'];
  assert.deepEqual(
    moveToolbarSlot(initial, 0, 3),
    ['insect_net', 'snare', 'hammer', 'shotgun', 'hands', 'sketch'],
  );
  assert.equal(moveToolbarSlot(initial, -1, 2), initial);
});

test('pocket knife toolbar use pulses a dedicated one-shot action', () => {
  triggerToolUse('pocket_knife');
  const pressed = consumeTouchControls();
  const released = consumeTouchControls();
  assert.equal(pressed.knife, true);
  assert.equal(pressed.gather, false);
  assert.equal(released.knife, false);
});

test('the narrator end-game command is explicit and deterministic', () => {
  assert.equal(isEndGameNarratorCommand('end game'), true);
  assert.equal(isEndGameNarratorCommand('  END GAME.  '), true);
  assert.equal(isEndGameNarratorCommand('end the expedition'), true);
  assert.equal(isEndGameNarratorCommand('when does the game end?'), false);
  assert.equal(isEndGameNarratorCommand('end game after I collect this'), false);
});

test('playable animal narrator profiles stay embodied, brief, and mode-specific', () => {
  const tortoise = getPlayableNarratorProfile('tortoise');
  const finch = getPlayableNarratorProfile('finch');
  const unknown = getPlayableNarratorProfile('future-unconfigured-animal');

  assert.equal(tortoise.kind, 'animal');
  assert.equal(finch.kind, 'animal');
  assert.equal(unknown.id, 'darwin');
  assert.notEqual(tortoise.identityAnswer, finch.identityAnswer);
  assert.equal(getPlayableNarratorProfile('darwin').kind, 'human');
  assert.equal(tortoise.id, 'tortoise');
  assert.equal(finch.id, 'finch');
  assert.match(
    animalDirectQuestionGuidance('What am I?', tortoise),
    /You are tortoise\. You walk\. You sleep\. You rest\. Tortoise\./,
  );

  const systemPrompt = buildAnimalNarratorSystemPrompt(tortoise);
  assert.match(systemPrompt, /immediate subjectivity of a Floreana giant tortoise/);
  assert.match(systemPrompt, /Never become a factual helper, zoology guide, quest assistant/);
  assert.match(systemPrompt, /never more than two short sentences/);
  assert.doesNotMatch(systemPrompt, /Address the player in second person as Darwin/);

  const userPrompt = buildAnimalNarratorPrompt(tortoise, {
    playerInput: 'What am I?',
    responseGuidance: animalDirectQuestionGuidance('What am I?', tortoise),
    location: 'Post Office Bay',
    locationContext: { biome: 'dry coastal scrub' },
    nearbySpecimen: 'A low prickly pear stands nearby.',
    weather: 'sunny',
    timeOfDay: '7:42',
    stats: { health: 100, fatigue: 12, curiosity: 68 },
  });
  assert.match(userPrompt, /Embodied role: a Floreana giant tortoise/);
  assert.match(userPrompt, /vitality 100, energy 88, composure 68/);
  assert.doesNotMatch(userPrompt, /Charles Darwin|Current objective|Equipped tool|Nearby NPC|Journal context/);
});

test('player narrator turns are preserved verbatim in a bounded assessment transcript', () => {
  const transcript = buildPlayerNarratorTranscript([
    {
      text: 'Which wing characters would distinguish this butterfly from the orange form?',
      day: 2,
      locationName: 'Scrub Rise',
      specimenName: 'Galápagos Sulphur Butterfly',
      symsNearby: true,
    },
    {
      text: 'Could a net damage the scales, and would a field sketch be safer?',
      day: 2,
      locationName: 'Scrub Rise',
      specimenName: 'Galápagos Sulphur Butterfly',
      symsNearby: true,
    },
  ]);

  assert.equal(transcript.turnCount, 2);
  assert.equal(transcript.truncated, false);
  assert.match(transcript.text, /Which wing characters would distinguish this butterfly/);
  assert.match(transcript.text, /Could a net damage the scales/);
  assert.match(transcript.text, /Syms nearby/);

  const bounded = buildPlayerNarratorTranscript([
    { text: 'A'.repeat(900), day: 1 },
    { text: 'B'.repeat(900), day: 1 },
    { text: 'C'.repeat(900), day: 1 },
  ], 1200);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.text.length <= 1200);
  assert.match(bounded.text, /middle narrator-panel turns omitted/);
});

test('structured transcript judgments adjust but do not rewrite canonical category scores', () => {
  const base = {
    overall: 6.2,
    verdict: 'Promising, but incomplete',
    recommendation: 'Retain the best evidence.',
    categories: [
      { id: 'observation', label: 'Observation', score: 6.5 },
      { id: 'judgment', label: 'Field judgment', score: 5.5 },
    ],
    strengths: [],
    gaps: ['Coverage remains limited.'],
    interactionAudit: { status: 'pending', turnCount: 3, adjustment: 0, conductCap: null },
  };
  const positive = applyTranscriptEvaluation(base, {
    adjustment: 1.4,
    classification: 'exemplary',
    summary: 'Darwin asked specific comparative and preservation questions.',
    quotedEvidence: ['Which wing characters distinguish the forms?'],
  });
  assert.equal(positive.overall, 7.6);
  assert.equal(positive.verdict, 'A sound and useful collection');
  assert.deepEqual(positive.categories, base.categories);
  assert.equal(positive.interactionAudit.adjustment, 1.4);

  const outraged = applyTranscriptEvaluation(base, {
    adjustment: -3.8,
    classification: 'egregious',
    conductCap: 1,
    summary: 'Darwin answered extraordinary opportunity with childish contempt.',
    quotedEvidence: ['this sucks lol'],
  });
  assert.equal(outraged.interactionAudit.adjustment, -3);
  assert.equal(outraged.interactionAudit.conductCap, 1);
  assert.equal(outraged.overall, 1);
  assert.equal(outraged.verdict, 'A mortifying failure of fieldwork');
  assert.match(outraged.gaps[0], /childish contempt/);
});

test('final assessment scores reflect the expedition record and remain bounded', () => {
  const early = evaluateFinalAssessment({
    health: 100,
    fatigue: 0,
    localStanding: 50,
    currentZoneId: 'POST_OFFICE_BAY',
    visitedZoneIds: ['POST_OFFICE_BAY'],
    inventory: [],
    journal: [],
    collectedSpecimenIds: [],
    documentedSpecimenIds: [],
    examinedTypeIds: [],
  });
  const developedState = {
    health: 82,
    fatigue: 22,
    curiosity: 74,
    localStanding: 61,
    day: 4,
    currentZoneId: 'BLACK_BEACH',
    currentLocationName: 'Black Beach',
    visitedZoneIds: ['POST_OFFICE_BAY', 'POST_SCRUB_RISE', 'N_SHORE', 'BLACK_BEACH'],
    inventory: [
      { id: 'basalt', name: 'Vesicular Basalt', latin: 'Lava basaltica', condition: 'fresh fracture' },
      { id: 'finch', name: 'Ground Finch', latin: 'Geospiza', condition: 'sound' },
      { id: 'cactus', name: 'Opuntia', latin: 'Opuntia echios', condition: 'documented' },
    ],
    collectedSpecimenIds: ['basalt', 'finch'],
    documentedSpecimenIds: ['cactus', 'finch', 'basalt'],
    examinedTypeIds: ['basalt', 'finch', 'cactus'],
    journal: [
      { id: 'n1', authorship: 'player', location: 'Post Office Bay', method: 'Field sketch', content: 'A careful record of beak proportions, feeding movements, and the exact ground on which the bird was observed.' },
      { id: 'n2', authorship: 'player', location: 'Scrub Rise', method: 'Bare Hands', content: 'The cactus pad was observed in place with flower, spine arrangement, substrate, and height all entered before collection.' },
      { id: 'n3', authorship: 'player', location: 'North Shore', method: 'Geological Hammer', content: 'A fresh fracture shows vesicles and a dark fine-grained matrix; the exposed face and locality were both recorded.' },
      { id: 'n4', authorship: 'player', location: 'Black Beach', method: 'Field sketch', content: 'The second finch was released after comparison with the retained example, with behavior and habitat differences noted.' },
      { id: 'n5', authorship: 'player', location: 'Black Beach', method: 'Reading and comparison', content: 'The field characters were compared with the available shipboard reference while uncertainty in identification was retained.' },
    ],
  };
  const developed = evaluateFinalAssessment(developedState);

  assert.ok(developed.overall > early.overall + 4);
  assert.ok(developed.categories.every(category => category.score >= 0 && category.score <= 10));
  assert.equal(developed.stats.evidence, 3);
  assert.equal(developed.stats.locations, 4);

  const record = buildFinalAssessmentRecord(developedState, { createdAt: 123 });
  assert.equal(record.id, 'final-assessment-123');
  assert.equal(record.request.assessmentProfile.overall, developed.overall);
  assert.equal(record.request.inventory.length, 3);
  assert.match(buildLocalHenslowAssessment(record.profile), /J\. S\. Henslow$/);
});

test('seeded reference notes are excluded and a trivial butterfly note fails severely', () => {
  const state = {
    health: 100,
    fatigue: 4,
    localStanding: 50,
    day: 1,
    currentZoneId: 'POST_OFFICE_BAY',
    visitedZoneIds: ['POST_OFFICE_BAY'],
    inventory: [],
    collectedSpecimenIds: [],
    documentedSpecimenIds: [],
    examinedTypeIds: ['galapagossulphur'],
    specimenMetadata: {
      galapagossulphur: { name: 'Galápagos Sulphur Butterfly', scientificValue: 3 },
      marineiguana: { name: 'Marine Iguana', scientificValue: 7 },
    },
    journal: [
      {
        id: 'seed-marineiguana',
        authorship: 'reference',
        assessmentEligible: false,
        specimenId: 'marineiguana',
        specimenName: 'Marine Iguana',
        content: 'A long and careful pre-written reference observation that the player did not author.',
      },
      {
        id: '123-examination-galapagossulphur',
        authorship: 'player',
        specimenId: 'galapagossulphur',
        specimenName: 'Galápagos Sulphur Butterfly',
        location: 'Post Office Bay',
        method: 'field examination',
        content: 'Its a butterfly.',
      },
    ],
  };
  const profile = evaluateFinalAssessment(state);
  const record = buildFinalAssessmentRecord(state, { createdAt: 456 });
  const localLetter = buildLocalHenslowAssessment(profile);

  assert.ok(profile.overall < 2, `Expected a severe failure score, received ${profile.overall}`);
  assert.equal(profile.verdict, 'A mortifying failure of fieldwork');
  assert.equal(profile.stats.notes, 1);
  assert.equal(profile.stats.excludedReferenceNotes, 1);
  assert.equal(profile.stats.evidence, 1);
  assert.equal(profile.strengths.length, 0);
  assert.equal(record.request.fieldNotes.length, 1);
  assert.equal(record.request.fieldNotes[0].specimenName, 'Galápagos Sulphur Butterfly');
  assert.doesNotMatch(JSON.stringify(record.request), /Marine Iguana/);
  assert.match(localLetter, /small child's first encounter/i);
  assert.match(localLetter, /common and unremarkable/i);
  assert.match(localLetter, /some other line of work/i);
});

test('incremental injuries collapse Darwin while catastrophic causes are fatal', () => {
  assert.deepEqual(
    resolveExpeditionDamage({ health: 4, amount: 4 }),
    { previousHealth: 4, health: 0, damage: 4, outcomeType: 'incapacitated' },
  );
  assert.deepEqual(
    resolveExpeditionDamage({ health: 4, amount: 4, fatalOnZero: true }),
    { previousHealth: 4, health: 0, damage: 4, outcomeType: 'death' },
  );
  assert.deepEqual(
    resolveExpeditionDamage({ health: 100, amount: 1, fatalOnZero: true, forceZero: true }),
    { previousHealth: 100, health: 0, damage: 1, outcomeType: 'death' },
  );
  assert.equal(CATASTROPHIC_FALL_SPEED, 22);
});

test('collapse recovery advances to 7 AM without erasing the current expedition day unnecessarily', () => {
  assert.equal(minutesUntilRecoveryMorning(17), 14 * 60);
  assert.equal(minutesUntilRecoveryMorning(6.5), 30);
  assert.equal(minutesUntilRecoveryMorning(7), 24 * 60);
});

test('outcome causes distinguish drowning, fatal falls, and accumulated injury', () => {
  assert.equal(
    expeditionOutcomeCause({ type: 'death', source: 'drowning', locationName: 'Post Office Bay' }),
    'Drowning in the waters off Post Office Bay.',
  );
  assert.equal(
    expeditionOutcomeCause({ type: 'death', source: 'catastrophic_fall', locationName: 'Scrub Rise' }),
    'A fatal fall at Scrub Rise.',
  );
  assert.match(
    expeditionOutcomeCause({ type: 'incapacitated', source: 'cactus', locationName: 'Scrub Rise' }),
    /Accumulated injuries and exposure/,
  );
});

test('action suggestions prioritize safety, traps, specimens, and evidence', () => {
  const objectives = createDefaultObjectives();
  const specimenList = [
    { id: 'marineiguana', name: 'Marine Iguana', keywords: ['marine iguana'] },
  ];
  const suggestions = buildActionSuggestions({
    location: { id: 'BLACK_BEACH', name: 'Black Beach' },
    validDirections: ['N', 'E'],
    primaryCollectible: 'marine_iguana',
    nearbySpecimenIds: ['marine_iguana'],
    specimenList,
    fatigue: 88,
    traps: [{ id: 'trap-1', locationId: 'BLACK_BEACH', status: 'set', setAt: 0, checkAfter: 60, targetSpecimenId: 'marineiguana' }],
    objectives,
    gameTime: 90,
    maxSuggestions: 4,
  });

  assert.deepEqual(suggestions.map(item => item.kind), ['safety', 'trap', 'specimen', 'evidence']);
  assert.equal(suggestions[0].text, 'Return before exhaustion');
  assert.equal(suggestions[1].text, 'Check ready traps');
  assert.equal(suggestions[2].text, 'Collect Marine Iguana');
});

test('LLM narrative suggestions supplement but do not displace canonical actions', () => {
  const merged = mergeActionSuggestions(
    [
      { text: 'Check ready traps', action: 'Check traps here', kind: 'trap' },
      { text: 'Collect Marine Iguana', action: 'Collect the Marine Iguana', kind: 'specimen' },
    ],
    [
      { text: 'Check ready traps', action: 'Check traps here' },
      { text: 'Ask Covington for help', action: 'Ask Covington for help' },
    ],
    3,
  );

  assert.deepEqual(merged.map(item => item.text), [
    'Check ready traps',
    'Collect Marine Iguana',
    'Ask Covington for help',
  ]);
  assert.equal(merged[2].kind, 'narrative');
});

test('deterministic choices are stable for prompt construction', () => {
  const items = ['university', 'beagle', 'childhood'];
  assert.equal(deterministicChoice(items, 'same prompt'), deterministicChoice(items, 'same prompt'));
  assert.equal(deterministicChoice([], 'same prompt'), null);
});

test('fauna scheduler assigns stable near, medium, and far distance tiers', () => {
  assert.equal(faunaFrameTier(0), 'near');
  assert.equal(faunaFrameTier(18 ** 2), 'near');
  assert.equal(faunaFrameTier(18 ** 2 + 1), 'medium');
  assert.equal(faunaFrameTier(48 ** 2), 'medium');
  assert.equal(faunaFrameTier(48 ** 2 + 1), 'far');
  assert.equal(faunaFrameTier(NaN), 'near');
});

test('fauna scheduler throttles distant actors while preserving accumulated world time', () => {
  const scheduler = createFaunaFrameScheduler();
  const mediumDeltas = [];
  const farDeltas = [];
  scheduler.register('medium', {
    getPosition: () => ({ x: 24, z: 0 }),
    update: frame => mediumDeltas.push(frame.delta),
  });
  scheduler.register('far', {
    getPosition: () => ({ x: 64, z: 0 }),
    update: frame => farDeltas.push(frame.delta),
  });
  const playerPose = { position: { x: 0, z: 0 } };

  scheduler.run({ realElapsed: 0, worldElapsed: 0.02, worldDelta: 0.02, playerPose });
  scheduler.run({ realElapsed: 0.05, worldElapsed: 0.07, worldDelta: 0.05, playerPose });
  scheduler.run({ realElapsed: 0.09, worldElapsed: 0.11, worldDelta: 0.04, playerPose });
  scheduler.run({ realElapsed: 0.5, worldElapsed: 0.52, worldDelta: 0.41, playerPose });

  assert.equal(mediumDeltas.length, 3);
  assert.ok(Math.abs(mediumDeltas[1] - 0.09) < 0.000001);
  assert.ok(Math.abs(mediumDeltas[2] - 0.41) < 0.000001);
  assert.equal(farDeltas.length, 2);
  assert.ok(Math.abs(farDeltas[1] - 0.5) < 0.000001);
});

test('fauna scheduler keeps urgent actors frame-accurate and unregisters cleanly', () => {
  const scheduler = createFaunaFrameScheduler();
  let runs = 0;
  const unregister = scheduler.register('urgent-far-actor', {
    getPosition: () => ({ x: 120, z: 0 }),
    shouldRunEveryFrame: () => true,
    update: () => { runs += 1; },
  });
  const playerPose = { position: { x: 0, z: 0 } };
  scheduler.run({ realElapsed: 0, worldDelta: 0.016, playerPose });
  scheduler.run({ realElapsed: 0.016, worldDelta: 0.016, playerPose });
  scheduler.run({ realElapsed: 0.032, worldDelta: 0.016, playerPose });
  assert.equal(runs, 3);
  assert.equal(scheduler.size(), 1);
  unregister();
  assert.equal(scheduler.size(), 0);
});

test('rock sample targeting chooses the nearest forward sampleable outcrop', () => {
  const obstacles = [
    { id: 'behind', kind: 'rock', x: 0, z: 1.2, radius: 0.4, colliderTop: 1.0 },
    { id: 'low-chip', kind: 'rock', x: 0.5, z: -1.1, radius: 0.3, colliderTop: 0.2 },
    { id: 'sample-rock', kind: 'rock', x: 0.45, z: -1.9, radius: 0.7, colliderTop: 1.1 },
    { id: 'farther-rock', kind: 'rock', x: -0.4, z: -2.9, radius: 0.5, colliderTop: 1.2 },
  ];
  const target = selectRockSampleTarget({
    obstacles,
    zoneId: 'TEST_ZONE',
    position: { x: 0, z: 0 },
    facing: { x: 0, z: -1 },
  });
  assert.equal(target.key, rockSampleKey('TEST_ZONE', 'sample-rock'));
});

test('rock sample targeting skips sampled and currently active source rocks', () => {
  const obstacles = [
    { id: 'first-rock', kind: 'rock', x: 0, z: -1.4, radius: 0.4, colliderTop: 1.0 },
    { id: 'second-rock', kind: 'rock', x: 0.2, z: -2.2, radius: 0.4, colliderTop: 1.0 },
    { id: 'third-rock', kind: 'rock', x: -0.2, z: -2.6, radius: 0.4, colliderTop: 1.0 },
  ];
  const target = selectRockSampleTarget({
    obstacles,
    zoneId: 'TEST_ZONE',
    position: { x: 0, z: 0 },
    facing: { x: 0, z: -1 },
    sampledRockIds: [rockSampleKey('TEST_ZONE', 'first-rock')],
    activeSourceKeys: [rockSampleKey('TEST_ZONE', 'second-rock')],
  });
  assert.equal(target.key, rockSampleKey('TEST_ZONE', 'third-rock'));
});

test('mobility velocity caps keep strike movement distinct from walk contact', () => {
  const caps = mobilityVelocityCaps({
    mode: 'pickup-push',
    maxSpeed: 0.42,
    contactMaxSpeed: 0.38,
    verticalLaunchMax: 0.12,
    struckMaxSpeed: 1.8,
    struckVerticalLaunchMax: 0.75,
  });
  assert.equal(caps.horizontalMaxSpeed, 0.38);
  assert.equal(caps.struckHorizontalMaxSpeed, 1.8);
  assert.equal(caps.verticalLaunchMax, 0.12);
  assert.equal(caps.struckVerticalLaunchMax, 0.75);

  const capped = capHorizontalVelocity({ x: 3, y: -1, z: 4 }, caps.horizontalMaxSpeed);
  assert.ok(Math.hypot(capped.x, capped.z) <= caps.horizontalMaxSpeed + 0.000001);
  assert.equal(capped.y, -1);
});

test('controlled prop pushes make light clutter respond before heavy barrels without adding lift', () => {
  const mobility = {
    mode: 'push',
    assistSpeed: 0.22,
    contactMaxSpeed: 0.36,
  };
  const light = computeControlledPushVelocity({
    velocity: { x: 0, y: 0.5, z: 0 },
    direction: { x: 0, z: -1 },
    mobility,
    mass: 2,
    impactSpeed: 4.45,
    sustainedTime: 0.05,
    delta: 1 / 60,
  });
  const heavy = computeControlledPushVelocity({
    velocity: { x: 0, y: 0.5, z: 0 },
    direction: { x: 0, z: -1 },
    mobility,
    mass: 78,
    impactSpeed: 4.45,
    sustainedTime: 0.05,
    delta: 1 / 60,
  });

  assert.ok(light.z < -0.01);
  assert.equal(heavy.z, 0);
  assert.equal(light.y, 0.02);
  assert.equal(heavy.y, 0.02);

  let velocity = { x: 0, y: 0, z: 0 };
  for (let frame = 0; frame < 120; frame += 1) {
    velocity = computeControlledPushVelocity({
      velocity,
      direction: { x: 0, z: -1 },
      mobility,
      mass: 56,
      impactSpeed: 4.45,
      sustainedTime: frame / 60,
      delta: 1 / 60,
    });
  }
  assert.ok(Math.hypot(velocity.x, velocity.z) <= 0.360001);
  assert.ok(velocity.z < -0.34);
  assert.ok(velocity.y <= 0.02);
});

test('rollable and floating barrels respond faster while contact impulses remain horizontal', () => {
  const barrelMobility = PROP_TYPES.barrel.behaviors.mobility;
  const simulate = context => {
    let velocity = { x: 0, y: 0, z: 0 };
    for (let frame = 0; frame < 120; frame += 1) {
      velocity = computeControlledPushVelocity({
        velocity,
        direction: { x: 1, z: 0 },
        mobility: barrelMobility,
        mass: PROP_TYPES.barrel.mass,
        impactSpeed: 4.45,
        sustainedTime: frame / 60,
        delta: 1 / 60,
        ...context,
      });
    }
    return velocity;
  };

  const upright = simulate({});
  const rolling = simulate({ rolling: true });
  const floating = simulate({ floating: true });
  assert.ok(rolling.x > upright.x + 0.2);
  assert.ok(floating.x > upright.x + 0.08);
  assert.ok(rolling.x <= barrelMobility.rollingMaxSpeed + 0.000001);
  assert.ok(floating.x <= barrelMobility.floatingMaxSpeed + 0.000001);

  const impulse = computeContactPushImpulse({
    velocity: { x: 0.1, y: 2, z: 0 },
    targetVelocity: { x: 0.4, y: 0, z: 0 },
    direction: { x: 1, z: 0 },
    mass: 56,
  });
  assert.ok(Math.abs(impulse.x - 16.8) < 0.000001);
  assert.equal(impulse.y, 0);
  assert.equal(impulse.z, 0);
});

test('sustained crate pressure adds delayed overturning torque without vertical force', () => {
  const mobility = PROP_TYPES.crate.behaviors.mobility;
  const early = computeSustainedPushTorque({
    direction: { x: 1, z: 0 },
    mobility,
    sustainedTime: mobility.tipAssistDelay * 0.9,
    impactSpeed: 4.45,
  });
  const sustained = computeSustainedPushTorque({
    direction: { x: 1, z: 0 },
    mobility,
    sustainedTime: mobility.tipAssistDelay + mobility.tipAssistRampSeconds,
    impactSpeed: 4.45,
  });

  assert.deepEqual(early, { x: 0, y: 0, z: 0 });
  assert.equal(sustained.x, 0);
  assert.equal(sustained.y, 0);
  assert.equal(sustained.z, -mobility.tipAssistTorque);
});

test('manual physics-prop colliders own configured mass instead of leaving it on the rigid body', () => {
  const source = fs.readFileSync(path.resolve('three-game/physics/props/PhysicsProp.jsx'), 'utf8');
  const colliderSource = source.slice(source.indexOf('function PropCollider'), source.indexOf('function createPlacementShape'));
  const rigidBodySource = source.slice(source.indexOf('<RigidBody'), source.indexOf('<PropCollider'));
  assert.match(colliderSource, /mass,/);
  assert.match(colliderSource, /frictionCombineRule:\s*CoefficientCombineRule\.Min/);
  assert.doesNotMatch(rigidBodySource, /\bmass=/);
  assert.match(source, /applyImpulseAtPoint\(impulse, contactPoint, true\)/);
  assert.match(source, /contact\.tipCommitted\s*=\s*true/);
  assert.match(source, /const contactPoint = !contact\.tipCommitted/);
  assert.match(source, /body\.lockRotations\(true, false\)/);
  assert.match(source, /body\.sleep\(\)/);
  assert.match(source, /pushContact\.tipSettledFor >= 0\.65/);
});

test('Rapier terrain contacts stay ground-only while identified walls remain push contacts', () => {
  const terrainSlope = {
    normal: { x: -0.72, y: 0.69, z: 0 },
    userData: { id: 'terrain', kind: 'terrain' },
  };
  const terrainCliff = {
    normal: { x: -0.99, y: 0.1, z: 0 },
    userData: { id: 'terrain', kind: 'terrain' },
  };
  const slopedObstacleTop = {
    normal: { x: -0.78, y: 0.62, z: 0 },
    userData: { id: 'crate-top', kind: 'physics-prop' },
  };
  const authoredWall = {
    normal: { x: -1, y: 0, z: 0 },
    userData: { id: 'barracks-wall', kind: 'wall' },
  };

  const terrainOnly = classifyRapierCharacterContacts([terrainSlope, terrainCliff]);
  assert.equal(terrainOnly.groundContact, terrainSlope);
  assert.equal(terrainOnly.sideContact, null);

  const mixed = classifyRapierCharacterContacts([
    terrainSlope,
    terrainCliff,
    slopedObstacleTop,
    { normal: { x: -1, y: 0, z: 0 }, userData: null },
    authoredWall,
  ]);
  assert.equal(mixed.groundContact, terrainSlope);
  assert.equal(mixed.sideContact, authoredWall);
  assert.equal(mixed.sideTarget.id, 'barracks-wall');
});

test('environmental audio keeps coastal surf audible across region topology', () => {
  const coast = {
    id: 'TEST_COAST',
    name: 'Dry Coast',
    biome: 'scrubland',
    terrainWidth: 100,
    terrainDepth: 80,
    edgeHints: [{ kind: 'blocked', boundaryKind: 'ocean', edge: 'north' }],
    neighbors: [],
  };
  const adjacent = {
    id: 'TEST_ADJACENT',
    name: 'Scrub Rise',
    biome: 'scrubland',
    terrainWidth: 100,
    terrainDepth: 80,
    edgeHints: [],
    neighbors: [{ zoneId: coast.id }],
  };
  const zones = new Map([[coast.id, coast], [adjacent.id, adjacent]]);
  const resolveZone = id => zones.get(id);

  assert.equal(distanceToOceanBoundary({ x: 0, z: -36 }, coast), 4);
  const shore = surfPresenceForZone({ zone: coast, position: { x: 0, z: -36 }, resolveZone });
  const inlandEdge = surfPresenceForZone({ zone: coast, position: { x: 0, z: 34 }, resolveZone });
  const neighboringMap = surfPresenceForZone({ zone: adjacent, position: { x: 0, z: 0 }, resolveZone });
  assert.ok(shore > inlandEdge);
  assert.ok(inlandEdge >= 0.14);
  assert.equal(neighboringMap, 0.035);
  assert.ok(surfPresenceForZone({
    zone: {
      id: 'POST_OFFICE_BAY',
      name: 'Post Office Bay',
      biome: 'bay',
      terrainPreset: 'floreana-cove',
      edgeHints: [],
      neighbors: [],
    },
    position: { x: 0, z: 0 },
    shorelineDistance: 30,
  }) > 0.14);

  const atShore = computeEnvironmentalAudioTargets({
    zone: coast,
    position: { x: 0, z: -36 },
    resolveZone,
    weather: { windSpeed: 0.8, rainIntensity: 0 },
  });
  const oneMapInland = computeEnvironmentalAudioTargets({
    zone: adjacent,
    position: { x: 0, z: 0 },
    resolveZone,
    weather: { windSpeed: 0.8, rainIntensity: 0 },
  });
  assert.ok(atShore.surf >= 0.4, 'the rolling body of near-shore surf should remain clearly audible');
  assert.ok(oneMapInland.surf >= 0.1, 'an adjacent map should retain a light but audible surf bed');
});

test('environmental audio follows weather and suppresses dry insects in rain and interiors', () => {
  const scrub = {
    id: 'TEST_SCRUB',
    name: 'Coastal Scrubland',
    biome: 'scrubland',
    terrainWidth: 100,
    terrainDepth: 80,
    edgeHints: [{ kind: 'blocked', boundaryKind: 'ocean', edge: 'east' }],
    neighbors: [],
  };
  const dry = computeEnvironmentalAudioTargets({
    zone: scrub,
    position: { x: 0, z: 0 },
    resolveZone: () => null,
    weather: { windSpeed: 1.4, rainIntensity: 0 },
    timeOfDay: 18.5,
  });
  const wet = computeEnvironmentalAudioTargets({
    zone: scrub,
    position: { x: 0, z: 0 },
    resolveZone: () => null,
    weather: { windSpeed: 1.4, rainIntensity: 0.8 },
    timeOfDay: 18.5,
  });
  const drizzle = computeEnvironmentalAudioTargets({
    zone: scrub,
    position: { x: 0, z: 0 },
    resolveZone: () => null,
    weather: { windSpeed: 1.1, rainIntensity: 0.3 },
    timeOfDay: 18.5,
  });
  const interior = computeEnvironmentalAudioTargets({
    zone: { id: 'CABIN', biome: 'shipInterior', name: 'Cabin' },
    weather: { windSpeed: 2, rainIntensity: 1 },
  });
  assert.ok(dry.surf > 0);
  assert.ok(dry.wind > 0.08);
  assert.ok(dry.insects > 0);
  const daytimeInsects = computeEnvironmentalAudioTargets({
    zone: scrub,
    weather: { windSpeed: 0.8, rainIntensity: 0 },
    timeOfDay: 12,
  }).insects;
  const nighttimeInsects = computeEnvironmentalAudioTargets({
    zone: scrub,
    weather: { windSpeed: 0.8, rainIntensity: 0 },
    timeOfDay: 23,
  }).insects;
  assert.ok(nighttimeInsects >= daytimeInsects * 1.7, 'dry-country insects should rise clearly after dusk');
  assert.ok(drizzle.rain >= 0.2, 'visible drizzle should retain a clearly audible foliage bed');
  assert.ok(wet.rain >= 0.3, 'steady rain should approach the proven diagnostic listening level');
  assert.equal(wet.insects, 0);
  assert.equal(diurnalBirdCallsAllowed({ timeOfDay: 12, rainIntensity: 0 }), true);
  assert.equal(diurnalBirdCallsAllowed({ timeOfDay: 23, rainIntensity: 0 }), false);
  assert.equal(diurnalBirdCallsAllowed({ timeOfDay: 12, rainIntensity: 0.08 }), false);
  assert.equal(nocturnalOwlCallsAllowed({ timeOfDay: 23, rainIntensity: 0 }), true);
  assert.equal(nocturnalOwlCallsAllowed({ timeOfDay: 12, rainIntensity: 0 }), false);
  assert.equal(nocturnalOwlCallsAllowed({ timeOfDay: 23, rainIntensity: 0.08 }), false);
  assert.deepEqual(interior, { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0.75 });
});

test('every playable Floreana map receives deliberate island ambience routing', () => {
  const playablePlacements = FLOREANA_MAP_PLACEMENTS.filter(placement => !placement.test);
  for (const placement of playablePlacements) {
    const zone = getRuntimeZone(placement.id);
    assert.equal(zone.id, placement.id, `${placement.id} resolves to its own runtime zone`);
    const interior = isInteriorAmbienceZone(zone);
    const targets = computeEnvironmentalAudioTargets({
      zone,
      position: { x: 0, z: 0 },
      resolveZone: getRuntimeZone,
      weather: { windSpeed: 1, rainIntensity: 0.3 },
      timeOfDay: 23,
    });
    if (/interior/i.test(placement.kind)) {
      assert.equal(interior, true, `${placement.id} is explicitly routed as an interior`);
      assert.ok(targets.occlusion >= 0.7, `${placement.id} filters exterior sound through its structure`);
      assert.ok(targets.wind > 0, `${placement.id} keeps a muffled exterior wind trace`);
      assert.ok(targets.rain > 0, `${placement.id} keeps rain audible through its structure`);
      if (placement.id === 'BEAGLE_CABIN') assert.ok(targets.surf > 0, 'the Beagle cabin retains muffled water and surf');
    } else {
      assert.equal(interior, false, `${placement.id} remains an outdoor ambience zone`);
      assert.equal(targets.occlusion, 0, `${placement.id} does not low-pass outdoor ambience`);
      assert.ok(targets.wind > 0, `${placement.id} receives the island wind bed`);
      assert.ok(targets.rain >= 0.2, `${placement.id} receives audible rain when precipitation is visible`);
    }
  }

  for (const [zoneId, boundaries] of Object.entries(FLOREANA_BOUNDARIES)) {
    if (!Object.values(boundaries).includes('ocean')) continue;
    assert.equal(zoneHasDirectCoast(getRuntimeZone(zoneId)), true, `${zoneId} ocean boundary receives direct surf`);
  }
  for (const zoneId of ['POST_OFFICE_BAY', 'CORMORANT_BAY', 'BLACK_BEACH', 'PUNTA_SUR', 'SE_COAST']) {
    assert.equal(zoneHasDirectCoast(getRuntimeZone(zoneId)), true, `${zoneId} authored coast receives direct surf`);
  }

  const scrubRise = getRuntimeZone('POST_SCRUB_RISE');
  assert.equal(isInteriorAmbienceZone(scrubRise), false, 'Post Scrub Rise must not inherit "office" from its preset name');
  assert.equal(dryInsectHabitat(scrubRise), true);
  assert.ok(surfPresenceForZone({ zone: scrubRise, position: { x: 0, z: 0 }, resolveZone: getRuntimeZone }) > 0);
  assert.equal(dryInsectHabitat(getRuntimeZone('NORTHERN_HIGHLANDS')), true, 'authored scrub remains dry habitat despite its route id');
});

test('surface contacts preserve material differences instead of applying a universal dust floor', () => {
  const drySand = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('white-sand'),
    { kind: 'footstep', intensity: 0.6 },
  );
  const wetMud = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('wet-mud'),
    { kind: 'footstep', intensity: 0.6 },
  );
  const grass = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('grass'),
    { kind: 'footstep', intensity: 0.6 },
  );
  const dryScrub = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('dry-scrub'),
    { kind: 'footstep', intensity: 0.6 },
  );
  const shipDeck = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('ship-deck'),
    { kind: 'footstep', intensity: 0.6 },
  );
  const houseFloor = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('house-interior'),
    { kind: 'footstep', intensity: 0.6 },
  );

  assert.equal(drySand.responseKind, 'sand');
  assert.equal(wetMud.responseKind, 'mud');
  assert.equal(grass.responseKind, 'litter');
  assert.equal(dryScrub.responseKind, 'dust');
  assert.equal(shipDeck.responseKind, 'wood');
  assert.equal(houseFloor.responseKind, 'wood');
  assert.equal(shipDeck.showRing, false);
  assert.ok(dryScrub.particleScale >= 1.2);
  assert.ok(dryScrub.sizeScale >= 1.2);
  assert.equal(drySand.showRing, false);
  assert.equal(wetMud.showRing, false);
  assert.ok(drySand.lateralScale > drySand.liftScale);
  assert.ok(wetMud.strength < drySand.strength);
});

test('expanded movement audio sprites are committed PCM assets with stable slot metadata', () => {
  const expected = {
    woodStep: [10, 0.5],
    mudStep: [10, 0.62],
    litterStep: [10, 0.56],
    shotgunReport: [6, 0.82],
    shotgunReload: [1, 2.03],
    finchWing: [6, 0.72],
    tortoiseStep: [8, 0.7],
  };
  for (const [key, [variants, slotDuration]] of Object.entries(expected)) {
    const sprite = MOVEMENT_WILDLIFE_AUDIO[key];
    assert.ok(sprite, `${key} is registered`);
    assert.equal(sprite.variants, variants);
    assert.equal(sprite.slotDuration, slotDuration);
    const filePath = path.join(process.cwd(), 'public', sprite.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `${key} runtime asset exists`);
    const header = fs.readFileSync(filePath).subarray(0, 4).toString('ascii');
    assert.equal(header, 'RIFF', `${key} is a browser-decodable PCM WAV`);
  }
});

test('wildlife, weather, fieldwork, and shoreline sprites are committed PCM assets', () => {
  const expected = {
    dove: [WILDLIFE_FIELDWORK_AUDIO.dove, 5, 2],
    hawk: [WILDLIFE_FIELDWORK_AUDIO.hawk, 4, 1.3],
    mockingbird: [WILDLIFE_FIELDWORK_AUDIO.mockingbird, 8, 1.25],
    owl: [WILDLIFE_FIELDWORK_AUDIO.owl, 8, 0.72],
    thunder: [WILDLIFE_FIELDWORK_AUDIO.thunder, 3, 5.5],
    fieldNote: [WILDLIFE_FIELDWORK_AUDIO.fieldNote, 4, 1.44],
    specimenContainer: [WILDLIFE_FIELDWORK_AUDIO.specimenContainer, 8, 0.9],
    snareRope: [WILDLIFE_FIELDWORK_AUDIO.snareRope, 5, 1.1],
    door: [WILDLIFE_FIELDWORK_AUDIO.door, 1, 1.2],
    waveBreak: [POST_OFFICE_BAY_AUDIO.waveBreak, 6, 3.2],
  };
  for (const [key, [sprite, variants, slotDuration]] of Object.entries(expected)) {
    assert.equal(sprite.variants, variants, `${key} has stable variant metadata`);
    assert.equal(sprite.slotDuration, slotDuration, `${key} has stable slot timing`);
    const filePath = path.join(process.cwd(), 'public', sprite.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `${key} runtime asset exists`);
    assert.equal(fs.readFileSync(filePath).subarray(0, 4).toString('ascii'), 'RIFF', `${key} is PCM WAV`);
  }
});

test('contextual animal, settlement, equipment, and terrain sprites are committed PCM assets', () => {
  const expected = {
    crabScuttle: [4, 0.62],
    iguanaClaws: [4, 0.54],
    goatHoof: [8, 0.38],
    horseHoof: [10, 0.48],
    goatBleat: [3, 1.5],
    settlementWork: [10, 0.8],
    leatherHandling: [8, 0.75],
    waterDrop: [8, 0.55],
    rockTumble: [4, 1.25],
    dryBranch: [6, 1.2],
  };
  for (const [key, [variants, slotDuration]] of Object.entries(expected)) {
    const sprite = CONTEXTUAL_WORLD_AUDIO[key];
    assert.ok(sprite, `${key} is registered`);
    assert.equal(sprite.variants, variants);
    assert.equal(sprite.slotDuration, slotDuration);
    const filePath = path.join(process.cwd(), 'public', sprite.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `${key} runtime asset exists`);
    assert.equal(fs.readFileSync(filePath).subarray(0, 4).toString('ascii'), 'RIFF', `${key} is PCM WAV`);
  }
  for (const key of Object.keys(expected)) setSoundscapeAudioTrackTrimDb(key, 0.5);
  const trackLabels = getSoundscapeAudioMixSettings().trackLabels;
  assert.equal(trackLabels.crabScuttle, 'Crab scuttle');
  assert.equal(trackLabels.iguanaClaws, 'Marine iguana claws');
  assert.equal(trackLabels.goatHoof, 'Goat hooves');
  assert.equal(trackLabels.horseHoof, 'Horse hooves');
  assert.equal(trackLabels.goatBleat, 'Goat bleat');
  assert.equal(trackLabels.settlementWork, 'Distant settlement work');
  assert.equal(trackLabels.leatherHandling, 'Leather and equipment');
  assert.equal(trackLabels.waterDrop, 'Foliage water drops');
  assert.equal(trackLabels.rockTumble, 'Loose rock tumble');
  assert.equal(trackLabels.dryBranch, 'Dry branch movement');
  resetSoundscapeAudioMix();
});

test('sound debug mix trims clamp, serialize, and reset with stable track keys', () => {
  resetSoundscapeAudioMix();
  assert.equal(setSoundscapeAudioMasterTrimDb(99), 6);
  assert.equal(setSoundscapeAudioTrackTrimDb('surf', -99), -24);
  assert.equal(setSoundscapeAudioTrackTrimDb('not-a-track', 4), null);

  const tuned = getSoundscapeAudioMixSettings();
  assert.equal(tuned.schema, 'darwin-sound-mix-v1');
  assert.equal(tuned.masterDb, 6);
  assert.equal(tuned.tracks.surf, -24);
  assert.equal(tuned.trackLabels.surf, 'Ocean surf');

  resetSoundscapeAudioTrackTrim('surf');
  assert.equal(Object.hasOwn(getSoundscapeAudioMixSettings().tracks, 'surf'), false);
  resetSoundscapeAudioMix();
  assert.deepEqual(getSoundscapeAudioMixSettings().tracks, {});
  assert.equal(getSoundscapeAudioMixSettings().masterDb, 0);
});

test('region-specific surface names inherit the correct response family', () => {
  const wetWhiteSand = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('wet-white-sand'),
    { kind: 'footstep', intensity: 0.5 },
  );
  const mudTrail = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('mud-trail'),
    { kind: 'footstep', intensity: 0.5 },
  );
  const dryBasalt = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('dry-basalt'),
    { kind: 'landing', intensity: 0.7 },
  );
  const barrelHit = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('dry-scrub'),
    { kind: 'collision', intensity: 0.7, target: { id: 'barrel', kind: 'physics-barrel' } },
  );
  const bottleHit = resolveSurfaceContactResponse(
    surfaceContactProfileForBiome('dry-scrub'),
    { kind: 'collision', intensity: 0.7, target: { id: 'rum-bottle', kind: 'physics-lawsonRumBottle' } },
  );

  assert.equal(wetWhiteSand.responseKind, 'sand');
  assert.ok(surfaceContactProfileForBiome('wet-white-sand').wetness >= 0.7);
  assert.ok(surfaceContactProfileForBiome('wet-white-sand').dustiness <= 0.24);
  assert.equal(mudTrail.responseKind, 'mud');
  assert.equal(dryBasalt.responseKind, 'grit');
  assert.equal(barrelHit.responseKind, 'wood');
  assert.equal(barrelHit.showRing, false);
  assert.equal(bottleHit.responseKind, 'solid');
  assert.equal(bottleHit.particleScale, 0);
  assert.notDeepEqual(wetWhiteSand.particles, surfaceContactProfileForBiome('unknown').particles);
});

test('soft ground keeps stronger, longer tracks than grit', () => {
  const mud = resolveFootprintResponse(surfaceContactProfileForBiome('wet-mud'), 0.8);
  const creekBank = resolveFootprintResponse(surfaceContactProfileForBiome('damp-creek-bank'), 0.8);
  const sand = resolveFootprintResponse(surfaceContactProfileForBiome('white-sand'), 0.8);
  const grit = resolveFootprintResponse(surfaceContactProfileForBiome('basalt'), 0.8);
  const water = resolveFootprintResponse(surfaceContactProfileForBiome('water'), 0.8);

  assert.equal(mud.visible, true);
  assert.equal(surfaceContactProfileForBiome('damp-creek-bank').kind, 'mud');
  assert.equal(creekBank.visible, true);
  assert.ok(creekBank.opacity > 0.5);
  assert.equal(sand.visible, true);
  assert.ok(sand.opacity > 0.75);
  assert.ok(resolveFootprintResponse(surfaceContactProfileForBiome('dry-scrub'), 0.5).opacity > 0.45);
  assert.ok(mud.opacity > sand.opacity);
  assert.ok(sand.lifetime > grit.lifetime);
  assert.equal(grit.visible, false);
  assert.equal(water.visible, false);
});

test('foot-contact probes never translate skeleton bones', () => {
  const source = fs.readFileSync(
    path.resolve('three-game/components/player/footContactRig.js'),
    'utf8',
  );

  assert.equal(modelAssets.darwin5.footPlanting, undefined);
  assert.doesNotMatch(source, /bone\.position\.(?:add|sub)\s*\(/);
  assert.doesNotMatch(source, /applyFootPlanting/);
  assert.doesNotMatch(source, /VISUAL_GROUNDING_MIN\s*=\s*-/);
});

test('Darwin5 stays the default while extended waits retain the varied idle pool', () => {
  const controllerSource = fs.readFileSync(
    path.resolve('three-game/components/player/PlayerController.jsx'),
    'utf8',
  );
  const modelSource = fs.readFileSync(
    path.resolve('three-game/components/player/PlayerModel.jsx'),
    'utf8',
  );
  const playableModesSource = fs.readFileSync(
    path.resolve('three-game/playable/playableModes.js'),
    'utf8',
  );

  assert.equal(DEFAULT_PLAYER_MODEL_ASSET_ID, 'darwin5');
  assert.match(playableModesSource, /darwin:\s*\{[^}]*assetId:\s*'darwin5'/s);
  assert.equal(modelAssets[DEFAULT_PLAYER_MODEL_ASSET_ID].path, '/assets/models/darwin5.glb');
  assert.doesNotMatch(controllerSource, /!stateRef\.current\.longIdle/);
  assert.doesNotMatch(modelSource, /motionRef\.current\.longIdle[^\n]*boredIdle/);
  for (const clip of ['lookAroundShort', 'fidgetStand', 'neckStretch', 'neutralIdle', 'armStretch']) {
    assert.match(controllerSource, new RegExp(`clip: '${clip}'`));
  }
});

test('landing on loose props creates a mass-sensitive downward settle without launch', () => {
  const light = computeLandingSettleMotion({
    linearVelocity: { x: 1, y: 0.5, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    direction: { x: 1, z: 0 },
    mass: 2,
    fallSpeed: 9,
  });
  const heavy = computeLandingSettleMotion({
    linearVelocity: { x: 1, y: 0.5, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    direction: { x: 1, z: 0 },
    mass: 72,
    fallSpeed: 9,
  });

  assert.ok(light.linear.y < 0);
  assert.ok(heavy.linear.y < 0);
  assert.ok(Math.abs(light.linear.y) > Math.abs(heavy.linear.y));
  assert.ok(Math.abs(light.angular.z) > Math.abs(heavy.angular.z));
  assert.ok(light.linear.x < 1 && light.linear.x > 0);
});

test('hammer targeting follows a descending 3D swing instead of an XZ proximity cone', () => {
  const reachable = {
    key: 'reachable-pad',
    center: { x: 0, y: 1.05, z: -1.55 },
    colliderArgs: [0.28, 0.52, 0.12],
    rotation: [0, 0, 0],
  };
  const lowBasalPad = {
    key: 'low-basal-pad',
    center: { x: 0, y: 0.42, z: -1.25 },
    colliderArgs: [0.26, 0.36, 0.12],
    rotation: [0, 0, 0],
  };
  const overhead = {
    key: 'overhead-branch',
    center: { x: 0, y: 4.2, z: -1.1 },
    colliderArgs: [0.3, 0.3, 0.3],
    rotation: [0, 0, 0],
  };
  const hits = selectHammerImpactTargets([overhead, reachable], {
    origin: { x: 0, y: 0, z: 0 },
    facing: { x: 0, z: -1 },
    maxHits: 1,
  });

  assert.deepEqual(hits.map(hit => hit.piece.key), ['reachable-pad']);
  assert.deepEqual(selectHammerImpactTargets([lowBasalPad], {
    origin: { x: 0, y: 0, z: 0 },
    facing: { x: 0, z: -1 },
    maxHits: 1,
  }).map(hit => hit.piece.key), ['low-basal-pad']);
});

test('knife targeting is a short selective arc that ignores woody plant pieces', () => {
  const youngPad = {
    key: 'young-pad',
    center: { x: 0.04, y: 0.78, z: -1.16 },
    colliderArgs: [0.24, 0.42, 0.1],
    rotation: [0, 0, 0],
    knifeCuttable: true,
  };
  const woodyBase = {
    key: 'woody-base',
    center: { x: 0, y: 0.58, z: -0.92 },
    colliderArgs: [0.28, 0.48, 0.14],
    rotation: [0, 0, 0],
    knifeCuttable: false,
  };
  const distantPad = {
    key: 'distant-pad',
    center: { x: 0, y: 0.55, z: -2.35 },
    colliderArgs: [0.24, 0.4, 0.1],
    rotation: [0, 0, 0],
    knifeCuttable: true,
  };

  const hits = selectKnifeCutTargets([woodyBase, distantPad, youngPad], {
    origin: { x: 0, y: 0, z: 0 },
    facing: { x: 0, z: -1 },
  });

  assert.deepEqual(hits.map(hit => hit.piece.key), ['young-pad']);
});

test('vegetation release momentum is restrained and sublethal damage leaves a bounded lean', () => {
  const light = createRestrainedReleaseImpulse({
    mass: 2,
    direction: { x: 1, z: 0 },
  });
  const heavy = createRestrainedReleaseImpulse({
    mass: 20,
    direction: { x: 1, z: 0 },
  });

  assert.ok(Math.abs(light.linear.x / 2 - 0.58) < 0.000001);
  assert.ok(Math.abs(heavy.linear.x / 20 - 0.58) < 0.000001);
  assert.ok(Math.abs(heavy.linear.y / 20 - 0.04) < 0.000001);
  assert.equal(damageLeanAngle(1, 4, 0.16), 0.04);
  assert.equal(damageLeanAngle(8, 4, 0.16), 0.16);
});

test('plant release velocity has a hard safety cap independent of collider regressions', () => {
  const ordinary = { x: 0.04, y: 0, z: 0.02 };
  assert.equal(clampReleaseLinearVelocity(ordinary, 0.16), ordinary);

  const launched = clampReleaseLinearVelocity({ x: 18, y: 4, z: -7 }, 0.16);
  assert.ok(Math.abs(Math.hypot(launched.x, launched.y, launched.z) - 0.16) < 0.000001);
  assert.ok(launched.x > 0 && launched.y > 0 && launched.z < 0);
});

test('manual breakable-plant colliders own authored mass instead of the rigid body', () => {
  const source = fs.readFileSync(
    path.resolve('three-game/physics/props/breakablePlant/BreakablePlantField.jsx'),
    'utf8',
  );
  const rigidBodyOpen = source.slice(source.indexOf('<RigidBody'), source.indexOf('<CuboidCollider'));
  const colliderOpen = source.slice(source.indexOf('<CuboidCollider'), source.indexOf('/>', source.indexOf('<CuboidCollider')));
  assert.doesNotMatch(rigidBodyOpen, /mass=\{piece\.mass\}/);
  assert.match(colliderOpen, /mass=\{piece\.mass\}/);
  assert.match(source, /clampReleaseLinearVelocity/);
});

test('mature cactus GLBs stay instanced while exposing stable lightweight impact targets', () => {
  assert.equal(
    matureCactusProfileForPath('/assets/models/nature/runtime-big-opuntia.glb').kind,
    'opuntia',
  );
  assert.equal(
    matureCactusProfileForPath('/assets/models/nature/runtime-candelabra-cactus.glb').kind,
    'candelabra',
  );
  assert.equal(matureCactusProfileForPath('/assets/models/nature/runtime-palo-santo.glb'), null);

  const layers = [
    {
      id: 'mature-opuntia',
      path: '/assets/models/nature/runtime-big-opuntia.glb',
      sink: 0.04,
      items: [
        { id: 'near-pad-tree', x: 0, y: 0.5, z: -2, scale: 3.4, yaw: 0 },
      ],
    },
    {
      id: 'candelabra',
      path: '/assets/models/nature/runtime-candelabra-cactus.glb',
      items: [
        { id: 'far-column', x: 0.15, y: 0.4, z: -7, scale: 3.7, yaw: 0 },
      ],
    },
    {
      id: 'ordinary-shrub',
      path: '/assets/models/nature/runtime-croton.glb',
      items: [{ id: 'ignored', x: 0, y: 0, z: -1, scale: 2 }],
    },
  ];
  const targets = buildMatureCactusTargets(layers, 'POST_OFFICE_BAY');

  assert.equal(targets.length, 2);
  assert.equal(targets[0].sourceId, 'ecology:POST_OFFICE_BAY:mature-opuntia');
  assert.ok(targets[0].radius > 1);
  assert.ok(targets[0].height > 3.5);

  const melee = selectMatureCactusMeleeTarget(targets, {
    position: { x: 0, y: 0, z: 0 },
    facing: { x: 0, z: -1 },
    tool: 'hammer',
  });
  assert.equal(melee.target.itemId, 'near-pad-tree');
  assert.ok(melee.directness > 0.8);

  const shotHits = selectMatureCactusShotgunHits(targets, {
    origin: { x: 0, y: 1.3, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    range: 12,
    rayRadius: 0.62,
    maxHits: 3,
  });
  assert.deepEqual(shotHits.map(hit => hit.target.itemId), ['near-pad-tree', 'far-column']);
  assert.ok(shotHits[0].along < shotHits[1].along);

  const obstacles = buildMatureCactusObstacles({
    zoneId: 'POST_OFFICE_BAY',
    flora: layers,
    proceduralFlora: [],
  });
  assert.equal(obstacles.length, 2);
  assert.ok(obstacles.every(obstacle => obstacle.kind === 'cactus'));
  assert.ok(obstacles.every(obstacle => obstacle.path === null));
  assert.ok(obstacles.every(obstacle => obstacle.shapes[0].type === 'cylinder'));
  assert.equal(obstacles[0].spineHazard.kind, 'opuntia');
  assert.equal(obstacles[1].spineHazard.kind, 'candelabra');
  assert.ok(obstacles[0].radius < targets[0].radius);
});

test('mature cactus spine risk stays low while walking and reaches 25 percent while running', () => {
  const walking = cactusSpineInjuryChance({
    running: false,
    impactSpeed: 4.45,
    walkSpeed: 4.45,
    runSpeed: 7.45,
  });
  const running = cactusSpineInjuryChance({
    running: true,
    impactSpeed: 7.45,
    walkSpeed: 4.45,
    runSpeed: 7.45,
  });
  assert.equal(walking, 0.04);
  assert.equal(running, 0.25);
  assert.ok(cactusSpineInjuryChance({ running: false, impactSpeed: 1 }) < walking);
});

test('Coastal Scrubland mature cacti participate in shared movement collision', () => {
  const obstacles = getRuntimeObstacles('COASTAL_SCRUBLAND');
  const cacti = obstacles.filter(obstacle => obstacle.kind === 'cactus' && obstacle.spineHazard);
  assert.ok(cacti.some(obstacle => obstacle.spineHazard.kind === 'candelabra'));
  assert.ok(cacti.some(obstacle => obstacle.spineHazard.kind === 'opuntia'));

  const cactus = cacti.find(obstacle => obstacle.spineHazard.kind === 'candelabra');
  const current = new Vector3(cactus.x - cactus.radius * 0.35, obstacleBaseY(cactus), cactus.z);
  const previous = new Vector3(cactus.x - cactus.radius - 1.2, current.y, cactus.z);
  const collision = resolveObstacleCollision(current, previous, { obstacles, playerRadius: 0.42 });
  assert.equal(collision.obstacle.id, cactus.id);
  assert.ok(Math.hypot(
    collision.position.x - cactus.x,
    collision.position.z - cactus.z,
  ) >= cactus.radius + 0.42 - 0.000001);
});

test('campaign stools use a responsive one-hand skeletal grip at authored scale', () => {
  const stool = PROP_TYPES.lawsonCampaignStool;
  const grip = carryGripForProp(stool);
  assert.equal(grip.mode, 'rightHand');
  assert.equal(grip.animationStyle, 'freeHand');
  assert.deepEqual(grip.offset, [0.13, 0, 0.02]);
  assert.equal(grip.scale, 1);
  assert.ok(propHorizontalRadius(stool) > 0.4);
});

test('default skeletal carry grips stay centered on Darwin\'s hands', () => {
  const stoneGrip = carryGripForProp(PROP_TYPES.stone);
  const mugGrip = carryGripForProp(PROP_TYPES.cabinMug);
  assert.equal(stoneGrip.mode, 'twoHand');
  assert.deepEqual(stoneGrip.offset, [0, 0, 0.06]);
  assert.equal(mugGrip.mode, 'rightHand');
  assert.deepEqual(mugGrip.offset, [0, 0, 0.025]);
});

test('carry drop candidates start grounded beyond the player collider', () => {
  const stool = PROP_TYPES.lawsonCampaignStool;
  const playerRadius = 0.36;
  const candidates = carryPlacementCandidates({
    prop: stool,
    player: { x: 4, y: 2, z: 7 },
    facing: { x: 0, z: -1 },
    playerRadius,
    terrainHeight: (x, z) => 1.5 + x * 0.01 + z * 0.005,
  });
  const first = candidates[0];
  const horizontalDistance = Math.hypot(first.position.x - 4, first.position.z - 7);
  assert.ok(horizontalDistance >= playerRadius + propHorizontalRadius(stool) + 0.17);
  assert.equal(first.position.x, 4);
  assert.ok(first.position.z < 7);
  assert.ok(Math.abs(first.position.y - (1.5 + first.position.x * 0.01 + first.position.z * 0.005 + 0.338)) < 0.000001);
  assert.deepEqual(first.rotation, [0, Math.PI, 0]);
  assert.equal(candidates.length, 24);
});

test('procedural rock obstacles share visual bounds and traversal support', () => {
  const zoneIds = ['POST_OFFICE_BAY', 'ALT_POST_OFFICE_BAY', 'POST_OFFICE_BAY_3', 'N_SHORE', 'NW_REEF', 'W_HIGH'];
  for (const zoneId of zoneIds) {
    const obstacles = getRuntimeObstacles(zoneId);
    const rockObstacles = obstacles.filter(obstacle => obstacle.kind === 'rock' && obstacle.visualBounds);
    assert.ok(rockObstacles.length > 0, `${zoneId} should expose procedural rock obstacles`);
    for (const obstacle of rockObstacles) {
      assert.ok(
        Math.abs(obstacle.colliderTop - obstacle.visualBounds.top) < 0.001,
        `${zoneId}:${obstacle.id} collider top should match visual top`,
      );
      if (!isWalkOverTraversalObstacle(obstacle)) continue;
      const baseY = obstacleBaseY(obstacle);
      const supportY = getObstacleSupportHeight(obstacle.x, obstacle.z, baseY, 0.28, obstacles);
      assert.ok(supportY !== null && supportY !== undefined, `${zoneId}:${obstacle.id} should provide support`);
      assert.ok(
        supportY - baseY >= obstacle.colliderTop * 0.9,
        `${zoneId}:${obstacle.id} walk-over support should stay near visual top`,
      );
    }
  }
});

test('terrain climbing finds the stable Punta Sur rim instead of the middle of its face', () => {
  const zoneId = 'PUNTA_SUR';
  const x = -15;
  const z = puntaSurSouthCoastZ(x) + 1.2;
  const start = new Vector3(x, movementTerrainHeight(x, z, zoneId) + 0.015, z);
  const opportunity = findClimbOpportunity({
    position: start,
    facing: new Vector3(0, 0, -1),
    collisionAdapter: createCollisionAdapter(zoneId),
  });
  const target = opportunity?.target;

  assert.equal(opportunity?.kind, 'terrain');
  assert.ok(target, 'the central Punta Sur face should expose a mantle target');
  assert.ok(target.distance > 5.5, 'the mantle should clear the steep middle of the face');
  assert.ok(target.heightDelta > 7.5, 'the mantle should reach the high rim in one authored climb');
  assert.equal(isWalkableTerrain(target.end.x, target.end.z, zoneId), true);
});

test('terrain climbing stays bounded and does not jump distant gaps', () => {
  const start = new Vector3(0, 0, 0);
  const facing = new Vector3(0, 0, 1);
  const tooTallAdapter = {
    groundInfo: position => ({ y: position.z >= 1.7 ? 10 : 0 }),
    isWalkableTerrain: (_x, z) => z >= 1.7,
  };
  const distantGapAdapter = {
    groundInfo: position => ({ y: position.z >= 3.2 ? 5 : 0 }),
    isWalkableTerrain: (_x, z) => z >= 3.2,
  };

  assert.equal(findTerrainClimbTarget({ position: start, facing, collisionAdapter: tooTallAdapter }), null);
  assert.equal(findTerrainClimbTarget({ position: start, facing, collisionAdapter: distantGapAdapter }), null);
  assert.equal(findTerrainClimbTarget({
    position: start,
    facing,
    collisionAdapter: tooTallAdapter,
    profile: { enabled: false },
  }), null);
});

test('climb prompts ignore walkable hillocks and low step-over obstacles', () => {
  const start = new Vector3(0, 0, 0);
  const facing = new Vector3(0, 0, 1);
  const walkableHillAdapter = {
    findClimbTarget: () => null,
    groundInfo: position => ({ y: Math.max(0, position.z) * 0.2 }),
    isWalkableTerrain: () => true,
  };
  const lowObstacleAdapter = {
    findClimbTarget: () => ({
      obstacle: { id: 'low-rock', kind: 'rock' },
      end: new Vector3(0, 0.74, 0.8),
      heightDelta: 0.7,
    }),
    groundInfo: () => ({ y: 0 }),
    isWalkableTerrain: () => true,
  };

  assert.equal(findClimbOpportunity({
    position: start,
    facing,
    collisionAdapter: walkableHillAdapter,
  }), null);
  assert.equal(findClimbOpportunity({
    position: start,
    facing,
    collisionAdapter: lowObstacleAdapter,
  }), null);
});

test('context prompts respect dwell, priority, fallback, and repeat cooldown', () => {
  let state = {
    contextPrompt: null,
    contextPromptCandidates: {},
    contextPromptHistory: {},
  };
  const traversal = {
    id: 'climb:test-cliff',
    label: 'Climb cliff',
    keyLabel: 'V',
    priority: 40,
    dwellMs: 280,
    repeatCooldownMs: 1000,
  };
  const carry = {
    id: 'carry:test-crate',
    label: 'Pick up crate',
    keyLabel: 'E',
    priority: 90,
    dwellMs: 120,
  };

  state = publishContextPromptState(state, 'traversal', traversal, 1000);
  assert.equal(state.contextPrompt, null, 'traversal should wait through its dwell');
  state = publishContextPromptState(state, 'traversal', traversal, 1280);
  assert.equal(state.contextPrompt?.source, 'traversal');
  state = publishContextPromptState(state, 'carry', carry, 1280);
  assert.equal(state.contextPrompt?.source, 'traversal', 'new higher-priority prompts still respect dwell');
  state = publishContextPromptState(state, 'carry', carry, 1400);
  assert.equal(state.contextPrompt?.source, 'carry');
  state = clearContextPromptState(state, 'carry', 1420);
  assert.equal(state.contextPrompt?.source, 'traversal', 'lower prompt should return when the winner clears');
  state = acknowledgeContextPromptState(state, 'traversal', 1450);
  assert.equal(state.contextPrompt, null);
  state = publishContextPromptState(state, 'traversal', traversal, 1500);
  state = publishContextPromptState(state, 'traversal', traversal, 1800);
  assert.equal(state.contextPrompt, null, 'acknowledged prompt should remain suppressed during cooldown');
  state = publishContextPromptState(state, 'traversal', traversal, 2450);
  assert.equal(state.contextPrompt?.source, 'traversal');
});

test('field actions use the equipped modality while hands remain the observation fallback', () => {
  const plant = {
    id: 'ecology:test:cotton:1',
    typeId: 'galapagos_cotton',
    kind: 'ecology',
    category: 'Plant',
    name: 'Galapagos cotton',
  };
  const bottle = {
    id: 'prop:test-bottle',
    typeId: 'ambient-prop:test-bottle',
    kind: 'prop',
    category: 'Object',
    name: 'glass bottle',
  };
  const observe = resolveFieldAction({ toolId: 'hands', target: plant });
  const hammerPlant = resolveFieldAction({ toolId: 'hammer', target: plant });
  const hammerBottle = resolveFieldAction({ toolId: 'hammer', target: bottle });
  const collect = resolveFieldAction({ toolId: 'hammer', target: { ...plant, kind: 'specimen' }, examined: true });

  assert.equal(observe.kind, 'observe');
  assert.equal(observe.label, 'Examine Galapagos cotton');
  assert.equal(hammerPlant.kind, 'tool');
  assert.equal(hammerPlant.label, 'Strike Galapagos cotton');
  assert.equal(hammerBottle.label, 'Strike glass bottle');
  assert.equal(collect.kind, 'collect');
  assert.equal(collect.label, 'Collect Galapagos cotton with hammer');
  assert.equal(sameFieldAction(hammerPlant, { ...hammerPlant }), true);
  assert.equal(sameFieldAction(hammerPlant, hammerBottle), false);
});

test('Lava Flats movement terrain contains all collision-scale relief', () => {
  const config = getRegionTerrainConfig('LAVA_FLATS');
  let samples = 0;
  let maxDelta = 0;
  for (let z = -48; z <= 48; z += 0.5) {
    for (let x = -52; x <= 52; x += 0.5) {
      if (!isLavaFlatsWalkable(x, z, config)) continue;
      const renderHeight = lavaFlatsHeight(x, z);
      const movementHeight = lavaFlatsHeight(x, z, { movementSurface: true });
      maxDelta = Math.max(maxDelta, Math.abs(renderHeight - movementHeight));
      samples += 1;
    }
  }

  assert.ok(samples > 40000, 'expected to cover the Lava Flats walkable field');
  assert.ok(
    maxDelta <= 0.075001,
    `render-only relief must stay below 7.5 cm; received ${maxDelta.toFixed(4)} m`,
  );
});

test('Lava Flats promotes collision-scale rocks to walk-over support', () => {
  const rocks = getLavaFlatsRocks();
  const obstacles = getRuntimeObstacles('LAVA_FLATS');
  const rockObstacles = obstacles.filter(obstacle => (
    obstacle.kind === 'rock' && obstacle.id.startsWith('lava-flats-')
  ));
  const collisionScaleRocks = rocks.filter(rock => {
    const bounds = rockVisualBounds(rock);
    return bounds.footprint >= 0.9 && bounds.height >= 0.3;
  });

  assert.ok(collisionScaleRocks.length >= 12, 'expected authored slabs and large generated rocks');
  assert.ok(rockObstacles.length < rocks.length / 2, 'small lava fragments should remain visual-only');
  for (const rock of collisionScaleRocks) {
    const obstacle = rockObstacles.find(candidate => candidate.id === `lava-flats-${rock.id}`);
    assert.ok(obstacle, `${rock.id} should have collision from its shared visual bounds`);
    assert.equal(obstacle.traversal, 'step-up');
    assert.ok(isWalkOverTraversalObstacle(obstacle));
    const baseY = obstacleBaseY(obstacle);
    const supportY = getObstacleSupportHeight(obstacle.x, obstacle.z, baseY, 0.28, obstacles);
    assert.ok(supportY !== null && supportY !== undefined, `${rock.id} should provide support`);
    assert.ok(
      supportY - baseY >= obstacle.visualBounds.top * 0.99,
      `${rock.id} support should reach the visible slab top`,
    );
  }
});

test('collision-scale relief stays inside the authored movement surface', () => {
  const regions = [
    'DEVILS_CROWN',
    'ALT_POST_OFFICE_BAY',
    'POST_OFFICE_BAY_3',
    'NW_REEF',
  ];

  for (const regionId of regions) {
    const config = getRegionTerrainConfig(regionId);
    let samples = 0;
    let maxDelta = 0;
    for (let z = -config.depth * 0.5; z <= config.depth * 0.5; z += 0.75) {
      for (let x = -config.width * 0.5; x <= config.width * 0.5; x += 0.75) {
        if (!isWalkableTerrain(x, z, regionId)) continue;
        const delta = Math.abs(
          terrainHeight(x, z, regionId) - movementTerrainHeight(x, z, regionId),
        );
        assert.ok(Number.isFinite(delta), `${regionId} terrain delta must be finite`);
        maxDelta = Math.max(maxDelta, delta);
        samples += 1;
      }
    }
    assert.ok(samples > 1000, `${regionId} should expose a meaningful walkable sample`);
    assert.ok(
      maxDelta <= 0.100001,
      `${regionId} render-only relief must stay below 10 cm; received ${maxDelta.toFixed(4)} m`,
    );
  }
});

test('Devil’s Crown gives every above-water step-height rock collision support', () => {
  const obstacles = getRuntimeObstacles('DEVILS_CROWN');
  const rockObstacles = new Set(obstacles.map(obstacle => obstacle.id));
  const collisionScaleRocks = getDevilsCrownRocks().filter(rock => (
    rock.y > -0.8 && rockVisualBounds(rock).height > 0.32
  ));

  assert.ok(collisionScaleRocks.length >= 40);
  for (const rock of collisionScaleRocks) {
    assert.ok(rockObstacles.has(`devcrown-${rock.id}`), `${rock.id} should have collision support`);
  }
});

test('obstacle broad phase returns nearby candidates in authored order', () => {
  const obstacles = [
    { id: 'near-a', x: 0, z: 0, radius: 1 },
    { id: 'near-b', x: 5, z: 0, radius: 1 },
    { id: 'cell-edge', x: 11.8, z: 0, radius: 1.2 },
    { id: 'far-a', x: 48, z: 48, radius: 1 },
    { id: 'far-b', x: -48, z: -48, radius: 1 },
    { id: 'far-c', x: 72, z: 0, radius: 1 },
    { id: 'far-d', x: 0, z: 72, radius: 1 },
    { id: 'far-e', x: -72, z: 0, radius: 1 },
    { id: 'far-f', x: 0, z: -72, radius: 1 },
  ];
  assert.deepEqual(
    queryObstaclesNear(obstacles, 0, 0, 0.42).map(obstacle => obstacle.id),
    ['near-a', 'near-b', 'cell-edge'],
  );
  assert.ok(
    queryObstaclesNear(obstacles, 12.25, 0, 0.42).some(obstacle => obstacle.id === 'cell-edge'),
    'an obstacle overlapping a cell boundary should remain queryable from the adjacent cell',
  );
  assert.deepEqual(
    queryObstacleBounds(obstacles, -1, -1, 14, 1).map(obstacle => obstacle.id),
    ['near-a', 'near-b', 'cell-edge'],
  );
});

test('static runtime obstacle arrays are shared across collision consumers', () => {
  const first = getRuntimeObstacles('BEAGLE');
  const second = getRuntimeObstacles('BEAGLE');
  assert.equal(first, second);
  assert.notEqual(
    getRuntimeObstacles('BEAGLE', { 'BEAGLE:test-offset': { x: 1, z: 0 } }),
    first,
    'offset-aware obstacle sets must remain isolated from the shared static index',
  );
});

test('Rapier ground rays run only when collision diagnostics are enabled', () => {
  let raycasts = 0;
  class Ray {
    constructor(origin, direction) {
      this.origin = origin;
      this.direction = direction;
    }
  }
  const rapierContext = {
    rapier: { Ray },
    world: {
      castRay: () => {
        raycasts += 1;
        return { toi: 8 };
      },
    },
  };
  const position = { x: 0, y: 2, z: 0 };
  const normalAdapter = createCollisionAdapter('BEAGLE', rapierContext, {}, { diagnostics: false });
  normalAdapter.groundInfo(position, { ignoreObstacles: true });
  assert.equal(raycasts, 0);

  const diagnosticAdapter = createCollisionAdapter('BEAGLE', rapierContext, {}, { diagnostics: true });
  const diagnosticGround = diagnosticAdapter.groundInfo(position, { ignoreObstacles: true });
  assert.equal(raycasts, 1);
  assert.equal(typeof diagnosticGround.physicsY, 'number');
});

test('animation actions are created on first use and cached by clip', () => {
  const animations = [{ name: 'Idle' }, { name: 'Walking' }, { name: 'Wave' }];
  const created = [];
  const uncached = [];
  const mixer = {
    clipAction: clip => {
      const action = { clip, stopped: false, stop() { this.stopped = true; } };
      created.push(action);
      return action;
    },
    uncacheAction: clip => uncached.push(clip),
  };
  const lazyActions = createLazyAnimationActions({ animations, mixer, root: {} });
  assert.equal(created.length, 0);
  assert.equal(lazyActions.has('idle'), true);
  assert.equal(created.length, 0, 'availability checks must not instantiate actions');
  const idle = lazyActions.get('idle');
  assert.equal(created.length, 1);
  assert.equal(lazyActions.get('IDLE'), idle);
  assert.equal(created.length, 1, 'aliases should reuse the same cached action');
  lazyActions.get('Walking');
  assert.equal(lazyActions.size, 2);
  assert.deepEqual(lazyActions.availableNames, ['Idle', 'Walking', 'Wave']);
  assert.equal(lazyActions.add([{ name: 'Jump' }, { name: 'Idle' }]), 1);
  assert.equal(lazyActions.has('jump'), true);
  assert.equal(lazyActions.get('Idle'), idle, 'bank additions must not replace active boot clips');
  assert.deepEqual(lazyActions.availableNames, ['Idle', 'Walking', 'Wave', 'Jump']);
  lazyActions.dispose();
  assert.equal(idle.stopped, true);
  assert.equal(uncached.length, 2);
  assert.equal(lazyActions.size, 0);
});

test('terrain quality caps reduce mesh work without upsampling small interiors', () => {
  assert.equal(resolveTerrainSegments(360, 200), 200);
  assert.equal(resolveTerrainSegments(300, 160), 160);
  assert.equal(resolveTerrainSegments(96, 200), 96);
  assert.equal(resolveTerrainSegments(360, null), 360);
  assert.deepEqual(terrainGeometryStats(200), { segments: 200, vertices: 40401, triangles: 80000 });
  assert.deepEqual(terrainGeometryStats(300), { segments: 300, vertices: 90601, triangles: 180000 });
});

test('heavy authored regions stay within the seamless-travel terrain budget', () => {
  assert.equal(regionMaps.N_SHORE.terrain.segments, 192);
  assert.equal(regionMaps.PENAL_COLONY.terrain.segments, 192);
  assert.deepEqual(terrainGeometryStats(192), { segments: 192, vertices: 37249, triangles: 73728 });
  assert.match(ISLAND_MAP_IMAGE, /\.webp$/);
});

test('border ecology projects a quality-budgeted mix from the neighboring region', () => {
  assert.deepEqual(borderEcologyBudget(0.75), {
    maxLayers: 2,
    maxInstances: 24,
    maxApronInstances: 18,
    maxInnerInstances: 6,
  });
  assert.deepEqual(borderEcologyBudget(0.85), {
    maxLayers: 3,
    maxInstances: 48,
    maxApronInstances: 36,
    maxInnerInstances: 12,
  });
  assert.deepEqual(borderEcologyBudget(1), {
    maxLayers: 4,
    maxInstances: 72,
    maxApronInstances: 54,
    maxInnerInstances: 18,
  });
  assert.deepEqual(borderGrassBudget(0.75), {
    maxLayers: 1,
    maxInstances: 64,
    maxApronInstances: 48,
    maxInnerInstances: 16,
  });
  assert.deepEqual(borderGrassBudget(0.85), {
    maxLayers: 1,
    maxInstances: 128,
    maxApronInstances: 96,
    maxInnerInstances: 32,
  });
  assert.deepEqual(borderGrassBudget(1), {
    maxLayers: 1,
    maxInstances: 192,
    maxApronInstances: 144,
    maxInnerInstances: 48,
  });

  const regionId = 'POST_SCRUB_RISE';
  const targetRegionId = 'NORTHERN_HIGHLANDS';
  const config = getRegionTerrainConfig(regionId);
  const targetConfig = getRegionTerrainConfig(targetRegionId);
  const vista = getBorderVistas(regionId).find(entry => entry.toRegionId === targetRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  const layers = buildBorderEcologyLayers({
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista,
    transition,
    ecology: buildNorthernHighlandsEcology(),
    sourceEcology: getEcology(regionId),
    foliageDrawScale: 0.85,
  });
  const grassLayers = buildBorderGrassLayers({
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista,
    transition,
    ecology: buildNorthernHighlandsEcology(),
    sourceEcology: getEcology(regionId),
    foliageDrawScale: 0.85,
  });
  const items = layers.flatMap(layer => layer.items);
  const grassItems = grassLayers.flatMap(layer => layer.items);

  assert.ok(layers.length > 0 && layers.length <= 3);
  assert.ok(items.length > 0 && items.length <= 48);
  assert.ok(layers.some(layer => /runtime-darwiniothamnus\.glb$/.test(layer.path)));
  assert.equal(items.filter(item => item.borderOrigin !== 'source-infill').every(item => item.x > config.width / 2), true);
  assert.equal(items.filter(item => item.borderOrigin === 'source-infill').every(item => item.x < config.width / 2), true);
  assert.equal(items.every(item => Number.isFinite(item.y) && Number.isFinite(item.z)), true);
  assert.equal(grassLayers.length, 1);
  assert.ok(grassItems.length > 0 && grassItems.length <= 128);
  assert.match(grassLayers[0].path, /runtime-animated-dry-grass\.glb$/);
  assert.equal(grassItems.filter(item => item.borderOrigin !== 'source-infill').every(item => item.x > config.width / 2), true);
  assert.equal(grassItems.filter(item => item.borderOrigin === 'source-infill').every(item => item.x < config.width / 2), true);
  assert.equal(grassItems.every(item => item.tint && item.widthScale > 0 && item.heightScale > 0), true);
});

test('Cormorant and Northern Highlands aprons keep all projected plants in a near seam collar', () => {
  const directions = [
    ['NORTHERN_HIGHLANDS', 'CORMORANT_BAY'],
    ['CORMORANT_BAY', 'NORTHERN_HIGHLANDS'],
  ];

  for (const [regionId, targetRegionId] of directions) {
    const config = getRegionTerrainConfig(regionId);
    const targetConfig = getRegionTerrainConfig(targetRegionId);
    const vista = getBorderVistas(regionId).find(entry => entry.toRegionId === targetRegionId);
    const transition = buildBorderTransition(regionId, config, vista, targetConfig);
    const layers = buildBorderGrassLayers({
      regionId,
      config,
      targetRegionId,
      targetConfig,
      vista,
      transition,
      ecology: getEcology(targetRegionId),
      sourceEcology: getEcology(regionId),
      foliageDrawScale: 0.85,
    });
    const floraLayers = buildBorderEcologyLayers({
      regionId,
      config,
      targetRegionId,
      targetConfig,
      vista,
      transition,
      ecology: getEcology(targetRegionId),
      sourceEcology: getEcology(regionId),
      foliageDrawScale: 0.85,
    });
    const items = layers.flatMap(layer => layer.items);
    const floraItems = floraLayers.flatMap(layer => layer.items);
    const plantCollarEnd = Math.max(10, Math.min(
      22,
      transition.continuity.carryEnd,
      transition.continuity.surfaceCarryEnd + 4,
    ));

    assert.ok(transition.continuity.surfaceCarryEnd < transition.continuity.carryEnd);
    assert.ok(items.length >= 48 && items.length <= 128);
    assert.ok(floraItems.length > 0);
    assert.equal(items.every(item => item.borderBand === 'near'), true);
    assert.equal(floraItems.every(item => item.borderBand === 'near'), true);
    assert.ok(Math.min(...items.map(item => item.borderOutsideDistance)) < transition.continuity.carryEnd * 0.5);
    assert.ok(Math.max(...items.map(item => item.borderOutsideDistance)) <= plantCollarEnd);
    assert.ok(Math.max(...floraItems.map(item => item.borderOutsideDistance)) <= plantCollarEnd);
    assert.equal(items.every(item => item.widthScale > 0 && item.heightScale > 0 && item.depthScale > 0), true);
    assert.equal(items.every(item => (
      ['source', 'target', 'source-corner', 'source-infill'].includes(item.borderOrigin)
    )), true);
    assert.ok(items.some(item => item.borderOrigin === 'source-infill'));
    assert.ok(Math.min(...items.map(item => item.borderOutsideDistance)) < 0);
  }
});

test('apron ecology carries source grass into grassless neighbors and stitches owned corners', () => {
  const regionId = 'CORMORANT_BAY';
  const config = getRegionTerrainConfig(regionId);
  const sourceEcology = getEcology(regionId);
  const northShoreEcology = getEcology('N_SHORE');
  assert.equal(northShoreEcology?.dryGrassPatches?.length || 0, 0);

  const buildGrassFor = targetRegionId => {
    const targetConfig = getRegionTerrainConfig(targetRegionId);
    const vista = getBorderVistas(regionId).find(entry => entry.toRegionId === targetRegionId);
    const transition = buildBorderTransition(regionId, config, vista, targetConfig);
    return buildBorderGrassLayers({
      regionId,
      config,
      targetRegionId,
      targetConfig,
      vista,
      transition,
      ecology: getEcology(targetRegionId),
      sourceEcology,
      foliageDrawScale: 0.85,
    }).flatMap(layer => layer.items);
  };

  const westItems = buildGrassFor('N_SHORE');
  assert.ok(westItems.length >= 80 && westItems.length <= 128);
  const westApronItems = westItems.filter(item => item.borderOrigin === 'source');
  const westInnerItems = westItems.filter(item => item.borderOrigin === 'source-infill');
  assert.equal(westApronItems.every(item => item.x < -config.width / 2), true);
  assert.equal(westInnerItems.every(item => item.x > -config.width / 2), true);
  assert.ok(westApronItems.length >= 48);
  assert.ok(westInnerItems.length >= 16);
  assert.ok(Math.min(...westApronItems.map(item => item.borderOutsideDistance)) <= 2.5);
  assert.ok(Math.min(...westInnerItems.map(item => -item.borderOutsideDistance)) <= 1.5);
  assert.ok(Math.max(...westInnerItems.map(item => -item.borderOutsideDistance)) >= 8);

  const southItems = buildGrassFor('NORTHERN_HIGHLANDS');
  const southwestCornerItems = southItems.filter(item => (
    item.borderOrigin === 'source-corner'
    && item.x < -config.width / 2
    && item.z > config.depth / 2
  ));
  assert.ok(southwestCornerItems.length > 0);
  assert.equal(southItems.every(item => item.borderBand === 'near'), true);
});

test('Punta Sur side aprons do not sweep across its authored southern cliff boundary', () => {
  const config = getRegionTerrainConfig('PUNTA_SUR');
  const vistas = getBorderVistas('PUNTA_SUR');
  const west = vistas.find(vista => vista.edge === 'west');
  const east = vistas.find(vista => vista.edge === 'east');
  assert.ok(west && east);
  // East/west along-axis end 1 is the south corner.
  assert.equal(apronCornerMode('PUNTA_SUR', west, 1), 'none');
  assert.equal(apronCornerMode('PUNTA_SUR', east, 1), 'none');
  assert.equal(apronOwnsCorner('PUNTA_SUR', west, 1), false);
  assert.equal(apronOwnsCorner('PUNTA_SUR', east, 1), false);

  for (const vista of [west, east]) {
    const targetConfig = getRegionTerrainConfig(vista.toRegionId);
    const transition = buildBorderTransition('PUNTA_SUR', config, vista, targetConfig);
    const geometry = makeNeighborPreviewGeometry(
      'PUNTA_SUR',
      config,
      vista.toRegionId,
      targetConfig,
      vista,
      transition,
    );
    geometry.computeBoundingBox();
    assert.ok(
      geometry.boundingBox.max.z <= config.depth / 2 + 2,
      `${vista.edge} apron crossed Punta Sur's southern cliff boundary`,
    );
    geometry.dispose();
  }
});

test('adjacent open aprons share tapered corner wedges', () => {
  const vistas = getBorderVistas('CORMORANT_BAY');
  const west = vistas.find(vista => vista.edge === 'west');
  const south = vistas.find(vista => vista.edge === 'south');
  assert.ok(west && south);
  // West end 1 and south end 0 meet at the southwest corner.
  assert.equal(apronCornerMode('CORMORANT_BAY', west, 1), 'shared');
  assert.equal(apronCornerMode('CORMORANT_BAY', south, 0), 'shared');
  assert.equal(apronCornerReach('CORMORANT_BAY', west, 1, 0, 64), 0);
  assert.equal(apronCornerReach('CORMORANT_BAY', south, 0, 0, 64), 0);
  assert.equal(apronCornerReach('CORMORANT_BAY', west, 1, 28, 64), 28);
  assert.equal(apronCornerReach('CORMORANT_BAY', south, 0, 28, 64), 28);
});

test('mixed coastal aprons preserve source shoreline away from the route corridor', () => {
  const regionId = 'PUNTA_SUR';
  const config = getRegionTerrainConfig(regionId);
  const vista = getBorderVistas(regionId).find(entry => entry.edge === 'west');
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  assert.ok(apronTopologyHold(regionId, config, targetConfig, vista, transition, 0, 2, 2) >= 0.65);
  assert.ok(apronTopologyHold(regionId, config, targetConfig, vista, transition, 1, -2, 2) >= 0.95);
});

test('placeholder neighbors only influence their authored travel corridor', () => {
  const regionId = 'PUNTA_SUR';
  const config = getRegionTerrainConfig(regionId);
  const vista = getBorderVistas(regionId).find(entry => entry.edge === 'north');
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  assert.match(targetConfig.preset, /^placeholder-/);
  assert.ok(apronTopologyHold(regionId, config, targetConfig, vista, transition, 0, 2, 2) >= 0.75);
});

test('Punta Sur northern horizon follows the island route to Cerro Pajas', () => {
  const regionId = 'PUNTA_SUR';
  const config = getRegionTerrainConfig(regionId);
  const vista = getBorderVistas(regionId).find(entry => entry.edge === 'north');
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  const route = distantLandformRoute(regionId, vista.edge, vista.toRegionId);
  assert.deepEqual(route.map(entry => entry.regionId), ['S_VOLCANIC', 'PENAL_COLONY', 'C_HIGH']);

  const geometry = makeDistantLandformGeometry(
    regionId,
    config,
    vista,
    targetConfig,
    transition,
  );
  assert.ok(geometry);
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.min.z < -250, 'the horizon should continue well beyond the first apron');
  assert.ok(geometry.boundingBox.max.y > 22, 'Cerro Pajas should form a real far silhouette');
  const blend = geometry.getAttribute('aBorderBlend');
  assert.equal(
    geometry.getAttribute('aHorizonFollow'),
    undefined,
    'the horizon remains world-anchored instead of folding under camera translation',
  );
  const positions = geometry.getAttribute('position');
  const horizonRows = 20;
  const horizonColumns = 44;
  const stride = horizonColumns + 1;
  for (let col = 0; col <= horizonColumns; col += 1) {
    for (let row = 1; row <= horizonRows; row += 1) {
      const previousY = positions.getY((row - 1) * stride + col);
      const currentY = positions.getY(row * stride + col);
      assert.ok(currentY >= previousY - 0.026, 'the backdrop does not reopen into stacked ridge bands');
    }
  }
  assert.ok(Math.min(...blend.array) <= 0.01, 'far side edges carry an atmospheric color handoff');
  assert.ok(Math.max(...blend.array) >= 0.99, 'the central landform retains its full terrain color');
  geometry.dispose();
});

test('ocean and reef routes do not receive distant land horizons', () => {
  const regionId = 'PUNTA_SUR';
  const config = getRegionTerrainConfig(regionId);
  const vista = getBorderVistas(regionId).find(entry => entry.edge === 'east');
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  assert.deepEqual(distantLandformRoute(regionId, vista.edge, vista.toRegionId), []);
  assert.equal(makeDistantLandformGeometry(
    regionId,
    config,
    vista,
    targetConfig,
    transition,
  ), null);
});

test('low coastal route chains stay in the apron layer instead of becoming false mountains', () => {
  const regionId = 'POST_OFFICE_BAY';
  const config = getRegionTerrainConfig(regionId);
  const vista = getBorderVistas(regionId).find(entry => entry.edge === 'east');
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  const transition = buildBorderTransition(regionId, config, vista, targetConfig);
  assert.deepEqual(
    distantLandformRoute(regionId, 'east', vista.toRegionId).map(entry => entry.regionId),
    ['N_SHORE', 'CORMORANT_BAY', 'PUNTA_CORMORANT'],
  );
  assert.equal(
    makeDistantLandformGeometry(regionId, config, vista, targetConfig, transition),
    null,
  );
});

test('Post Office Bay routes share normalized seam coordinates with both land neighbors', () => {
  const seams = [
    {
      seam: POST_OFFICE_SCRUB_RISE_SEAM,
      sourcePath: POST_OFFICE_BAY_SCRUB_TRAIL,
      targetPaths: POST_SCRUB_RISE_PATH_POINTS,
    },
    {
      seam: POST_OFFICE_NORTH_SHORE_SEAM,
      sourcePath: POST_OFFICE_BAY_NORTH_SHORE_TRAIL,
      targetPaths: N_SHORE_PATH_POINTS,
    },
  ];
  const hasPoint = (paths, point) => paths.flat(1).some(candidate => (
    Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 0.001
  ));

  for (const { seam, sourcePath, targetPaths } of seams) {
    const source = regionMaps[seam.source.regionId];
    const target = regionMaps[seam.target.regionId];
    const sourceAlong = seam.source.edge === 'north' || seam.source.edge === 'south'
      ? seam.source.point[0] / source.terrain.width
      : seam.source.point[1] / source.terrain.depth;
    const targetAlong = seam.target.edge === 'north' || seam.target.edge === 'south'
      ? seam.target.point[0] / target.terrain.width
      : seam.target.point[1] / target.terrain.depth;
    assert.ok(Math.abs(sourceAlong - targetAlong) < 0.000001);
    assert.equal(hasPoint([sourcePath], seam.source.point), true);
    assert.equal(hasPoint(targetPaths, seam.target.point), true);
  }

  assert.ok(POST_OFFICE_BAY_SCRUB_TRAIL.at(-1)[1] > regionMaps.POST_OFFICE_BAY.terrain.depth * 0.5 + 20);
  assert.ok(POST_OFFICE_BAY_NORTH_SHORE_TRAIL.at(-1)[0] > regionMaps.POST_OFFICE_BAY.terrain.width * 0.5 + 20);
});

test('Western Lowlands authored trails meet all three normalized route seams', () => {
  const seams = [
    BLACK_BEACH_WESTERN_LOWLANDS_SEAM,
    WESTERN_LOWLANDS_WESTERN_HIGHLANDS_SEAM,
    WESTERN_LOWLANDS_BEACH_HUT_SEAM,
  ];
  const pathHasPoint = point => WESTERN_LOWLANDS_PATHS.some(path => path.points.some(candidate => (
    Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 0.001
  )));

  for (const seam of seams) {
    const lowlandsSide = seam.source.regionId === 'W_LAVA' ? seam.source : seam.target;
    const source = regionMaps[seam.source.regionId];
    const target = regionMaps[seam.target.regionId];
    const sourceAlong = seam.source.edge === 'north' || seam.source.edge === 'south'
      ? seam.source.point[0] / source.terrain.width
      : seam.source.point[1] / source.terrain.depth;
    const targetAlong = seam.target.edge === 'north' || seam.target.edge === 'south'
      ? seam.target.point[0] / target.terrain.width
      : seam.target.point[1] / target.terrain.depth;
    assert.ok(Math.abs(sourceAlong - targetAlong) < 0.000001);
    assert.equal(pathHasPoint(lowlandsSide.point), true);
    assert.ok(westernLowlandsPathInfo(...lowlandsSide.point).tread > 0.99);
  }
  assert.equal(regionMaps.W_LAVA.terrain.authored, true);
  assert.equal(regionMaps.W_LAVA.terrain.segments, 288);
});

test('Western Lowlands keeps its lagoon wadeable, its ocean deep, and its camp dry', () => {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let z = -48; z <= 48; z += 4) {
    for (let x = -54; x <= 54; x += 4) {
      const height = westernLowlandsHeight(x, z);
      assert.equal(Number.isFinite(height), true);
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }
  }
  assert.ok(maximum - minimum > 4.2);
  assert.ok(westernLowlandsHeight(-53, 0) < WATER_LEVEL - WADE_DEPTH);
  assert.ok(westernLowlandsLagoonMask(-23, 3) > 0.95);
  assert.ok(westernLowlandsStandingWaterMask(-23, 3) > 0.95);
  assert.ok(westernLowlandsHeight(-23, 3) > WATER_LEVEL - WADE_DEPTH);
  assert.equal(westernLowlandsBiomeAt(-23, 3), 'tidal-lagoon');
  assert.ok(westernLowlandsHeight(17, 5) > WATER_LEVEL + 1.5);
  assert.equal(westernLowlandsBiomeAt(17, 5), 'whaler-camp-bench');
});

test('Western Lowlands camp uses textured destructible timber, shared stone collision, and physics props', () => {
  const cabinPieces = getWesternLowlandsCabinPieces();
  const rackPieces = getWesternLowlandsDryingRackPieces();
  const cabinDependents = getWesternLowlandsCabinDependents();
  const rackDependents = getWesternLowlandsDryingRackDependents();
  const obstacles = getWesternLowlandsObstacles();
  const ecology = buildWesternLowlandsEcology();
  const props = getZoneProps('W_LAVA');
  assert.ok(cabinPieces.length >= 45);
  assert.ok(rackPieces.length >= 10);
  assert.ok(cabinPieces.some(piece => piece.dynamic));
  assert.ok(rackPieces.some(piece => piece.dynamic));
  assert.ok(cabinDependents.size >= 5);
  assert.ok(rackDependents.size >= 4);
  assert.ok(obstacles.every(obstacle => obstacle.zoneId === 'W_LAVA' && obstacle.definition?.collider));
  assert.ok(obstacles.length >= 45);
  assert.equal(ecology.lagoonSurfaces.length, 1);
  assert.ok(ecology.rocks.length >= obstacles.length);
  assert.ok(props.length >= 10);
  assert.ok(props.some(prop => prop.type === 'settlementBarrel'));
  assert.ok(props.some(prop => prop.type === 'woodenBucket'));
  assert.ok(props.some(prop => prop.type === 'looseFloorBoard'));
});

test('Northern Highlands authored trails meet all four normalized route seams', () => {
  const seams = [
    POST_SCRUB_RISE_NORTHERN_HIGHLANDS_SEAM,
    NORTHERN_HIGHLANDS_CORMORANT_BAY_SEAM,
    NORTHERN_HIGHLANDS_ALT_POST_OFFICE_BAY_SEAM,
    NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM,
  ];
  const pathHasPoint = point => NORTHERN_HIGHLANDS_PATH_POINTS.flat(1).some(candidate => (
    Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 0.001
  ));

  for (const seam of seams) {
    const northernSide = seam.source.regionId === 'NORTHERN_HIGHLANDS' ? seam.source : seam.target;
    const source = regionMaps[seam.source.regionId];
    const target = regionMaps[seam.target.regionId];
    const sourceAlong = seam.source.edge === 'north' || seam.source.edge === 'south'
      ? seam.source.point[0] / source.terrain.width
      : seam.source.point[1] / source.terrain.depth;
    const targetAlong = seam.target.edge === 'north' || seam.target.edge === 'south'
      ? seam.target.point[0] / target.terrain.width
      : seam.target.point[1] / target.terrain.depth;
    assert.ok(Math.abs(sourceAlong - targetAlong) < 0.000001);
    assert.equal(pathHasPoint(northernSide.point), true);
  }
  assert.equal(regionMaps.NORTHERN_HIGHLANDS.terrain.authored, true);
  assert.equal(regionMaps.NORTHERN_HIGHLANDS.terrain.segments, 240);
});

test('Northern Highlands terrain rises into a finite, worked transition landscape', () => {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let z = -48; z <= 48; z += 4) {
    for (let x = -52; x <= 52; x += 4) {
      const height = northernHighlandsHeight(x, z);
      assert.equal(Number.isFinite(height), true);
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }
  }
  assert.ok(maximum - minimum > 4.2);
  assert.ok(northernHighlandsHeight(-6, 46) > northernHighlandsHeight(-50, 7));
  assert.equal(northernHighlandsBiomeAt(20.5, 20), 'highlands-garden-loam');
  assert.ok(northernHighlandsGardenInfo(20.5, 20).mask > 0.9);
});

test('Watkins Creek authored trails meet its four normalized route seams', () => {
  const seams = [
    NORTHERN_HIGHLANDS_WATKINS_CREEK_SEAM,
    PENAL_COLONY_WATKINS_CREEK_SEAM,
    WATKINS_CREEK_WATKINS_SEAM,
    WATKINS_CREEK_SOUTHERN_WETLANDS_SEAM,
  ];
  const pathHasPoint = point => WATKINS_CREEK_PATH_POINTS.flat(1).some(candidate => (
    Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 0.001
  ));

  for (const seam of seams) {
    const creekSide = seam.source.regionId === 'WATKINS_CREEK' ? seam.source : seam.target;
    const source = regionMaps[seam.source.regionId];
    const target = regionMaps[seam.target.regionId];
    const sourceAlong = seam.source.edge === 'north' || seam.source.edge === 'south'
      ? seam.source.point[0] / source.terrain.width
      : seam.source.point[1] / source.terrain.depth;
    const targetAlong = seam.target.edge === 'north' || seam.target.edge === 'south'
      ? seam.target.point[0] / target.terrain.width
      : seam.target.point[1] / target.terrain.depth;
    assert.ok(Math.abs(sourceAlong - targetAlong) < 0.000001);
    assert.equal(pathHasPoint(creekSide.point), true);
  }
  assert.equal(regionMaps.WATKINS_CREEK.terrain.authored, true);
  assert.equal(regionMaps.WATKINS_CREEK.terrain.segments, 248);
});

test('Watkins Creek carves a finite fordable stream with shared rock collision', () => {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let z = -49; z <= 49; z += 4) {
    for (let x = -56; x <= 56; x += 4) {
      const height = watkinsCreekHeight(x, z);
      assert.equal(Number.isFinite(height), true);
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }
  }
  assert.ok(maximum - minimum > 7);
  const fordChannel = watkinsCreekChannelInfo(-5, 3.2);
  assert.ok(fordChannel.ford > 0.98);
  assert.ok(fordChannel.water > 0.98);
  assert.equal(watkinsCreekBiomeAt(-5, 3.2), 'creek-water');
  assert.equal(watkinsCreekBiomeAt(27, -4), 'creek-pool');
  const shorelineBands = Array.from({ length: 29 }, (_, index) => (
    watkinsCreekChannelInfo(18, -9 + index * 0.75)
  ));
  assert.ok(shorelineBands.some(sample => sample.mud > 0.5));
  assert.ok(shorelineBands.some(sample => sample.gravel > 0.5));
  assert.ok(shorelineBands.some(sample => sample.riparian > 0.5));
  const flow = watkinsCreekFlowAt(20, -2);
  assert.ok(Math.abs(Math.hypot(flow.x, flow.z) - 1) < 0.001);
  assert.ok(flow.speed > 0.2 && flow.speed <= 1);
  const suppressionBand = Array.from({ length: 81 }, (_, index) => {
    const z = -12 + index * 0.3;
    return {
      visible: watkinsCreekStandingWaterMask(18, z),
      suppression: watkinsCreekStandingWaterSuppressionMask(18, z),
    };
  });
  assert.ok(suppressionBand.some(sample => sample.visible < 0.14 && sample.suppression > 0.7));
  assert.equal(suppressionBand.every(sample => sample.suppression + 0.000001 >= sample.visible), true);

  const ecology = buildWatkinsCreekEcology();
  const ford = getWatkinsCreekFordStones();
  const obstacles = getWatkinsCreekRockObstacles();
  assert.ok(ecology.rocks.length >= 90);
  assert.equal(ecology.dryGrassPatches[0].items.length, 1180);
  assert.equal(ecology.surfaceLitter.find(layer => layer.id === 'watkins-creek-bank-cobbles')?.items.length, 720);
  assert.equal(ford.length, 5);
  assert.equal(ford.every(stone => stone.collide === true), true);
  assert.equal(obstacles.every(obstacle => obstacle.zoneId === 'WATKINS_CREEK'), true);
  assert.equal(obstacles.filter(obstacle => obstacle.id.includes('ford-stone')).length, 5);
  for (const layer of ecology.flora) {
    for (const item of layer.items) {
      const path = watkinsCreekPathInfo(item.x, item.z);
      const creek = watkinsCreekChannelInfo(item.x, item.z);
      if (layer.id === 'watkins-creek-riparian-sedges') {
        assert.ok(path.tread < 0.22);
        assert.ok(creek.shoreDistance > -0.08 && creek.shoreDistance < 5.8);
      } else {
        assert.ok(path.distance >= path.width * 1.5);
        assert.ok(creek.water < 0.08);
      }
    }
  }
});

test('Post Office Bay keeps its western inland terrain free of stray water pockets', () => {
  const formerTidePool = [
    [-43, -17],
    [-44, -16],
    [-45, -17],
  ];
  for (const [x, z] of formerTidePool) {
    assert.equal(coveWaterMask(x, z), 0);
    const height = postOfficeTerrainHeight(x, z);
    assert.notEqual(postOfficeTerrainBiomeAt(x, z, height), 'water');
  }

  for (let x = -59; x <= -52; x += 1) {
    for (let z = 20; z <= 59; z += 1) {
      const height = postOfficeTerrainHeight(x, z);
      assert.ok(height >= -0.88, `unexpected western water floor at (${x}, ${z}): ${height}`);
      assert.notEqual(postOfficeTerrainBiomeAt(x, z, height), 'water');
    }
  }
});

test('runtime zone and specimen lookups preserve stable authored identities', () => {
  const firstZone = getRuntimeZone('POST_SCRUB_RISE');
  const secondZone = getRuntimeZone('POST_SCRUB_RISE');
  const firstSpecimens = getThreeSpecimens('POST_SCRUB_RISE');
  const secondSpecimens = getThreeSpecimens('POST_SCRUB_RISE');

  assert.strictEqual(firstZone, secondZone);
  assert.strictEqual(firstSpecimens, secondSpecimens);
  assert.strictEqual(firstSpecimens[0], secondSpecimens[0]);
});

test('runtime specimen actor ids stay globally unique across playable zones', () => {
  const ownersByActorId = new Map();
  let actorCount = 0;
  for (const placement of FLOREANA_MAP_PLACEMENTS.filter(item => !item.test)) {
    for (const specimen of getThreeSpecimens(placement.id)) {
      actorCount += 1;
      assert.match(specimen.instanceId, new RegExp(`^${placement.id}:`));
      assert.equal(
        ownersByActorId.has(specimen.instanceId),
        false,
        `${specimen.instanceId} is shared by ${ownersByActorId.get(specimen.instanceId)} and ${placement.id}`,
      );
      ownersByActorId.set(specimen.instanceId, placement.id);
    }
  }
  assert.ok(actorCount > 100);

  const playableRegion = regionMaps.POST_SCRUB_RISE;
  const playableSpawnIndex = playableRegion.specimens.findIndex(spawn => spawn.specimenId === 'mediumgroundfinch');
  const playableActorId = specimenSpawnActorId(
    playableRegion.id,
    playableRegion.specimens[playableSpawnIndex],
    playableSpawnIndex,
  );
  assert.equal(
    getThreeSpecimens(playableRegion.id).some(specimen => specimen.instanceId === playableActorId),
    true,
    'playable spawn identity should match the zone specimen runtime',
  );
});

test('Galapagos doves forage, take off, fly, land, and retain authored field identity', () => {
  const record = baseSpecimens.find(specimen => specimen.id === 'galapagosdove');
  assert.ok(record);
  assert.equal(record.latin, 'Zenaida galapagoensis');
  assert.ok(record.details.some(detail => /blue orbital|blue eye/i.test(detail)));
  assert.ok(record.details.some(detail => /wing/i.test(detail)));

  const render = getWildlifeRenderProfile({ id: 'galapagos_dove' });
  const profile = getWildlifeBehaviorProfile({ id: 'galapagos_dove' });
  assert.deepEqual(render, { type: 'proceduralFinch', variant: 'galapagosDove' });
  assert.equal(profile.controller, 'shorebird');
  assert.equal(profile.groundForage, true);
  assert.ok(profile.routineFlightInterval > 0);

  const actors = getThreeSpecimens('ASILO_SPRING').filter(specimen => specimen.id === 'galapagosdove');
  assert.equal(actors.length, 2);
  assert.equal(actors.every(actor => actor.instanceId.startsWith('ASILO_SPRING:asilo-spring-galapagos-dove-')), true);

  const actor = actors[0];
  const base = new Vector3(actor.spawnPoint[0], actor.spawnPoint[1], actor.spawnPoint[2]);
  const controller = createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.37,
    zoneId: 'ASILO_SPRING',
    basePosition: base,
    actorScale: actor.sceneScale,
  });
  const modes = new Set();
  const groundActivities = new Set();
  const clips = new Set();
  for (let t = 0; t <= 42; t += 0.1) {
    const result = controller.update({
      basePosition: base,
      zoneId: 'ASILO_SPRING',
      playerPosition: { x: base.x + 80, z: base.z + 80 },
      elapsedTime: t,
      delta: 0.1,
    });
    assert.equal(result.ok, true);
    assert.equal(Number.isFinite(result.state.position.x), true);
    assert.equal(Number.isFinite(result.state.position.y), true);
    assert.equal(Number.isFinite(result.state.position.z), true);
    modes.add(result.state.debug.mode);
    if (result.state.debug.groundActivity) groundActivities.add(result.state.debug.groundActivity);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
  }
  for (const mode of ['ground', 'takeoff', 'circle', 'landing']) {
    assert.equal(modes.has(mode), true, `dove should enter ${mode}`);
  }
  assert.equal(groundActivities.has('feed'), true);
  assert.equal(groundActivities.has('walk'), true);
  for (const clip of ['peck', 'walk', 'takeoff', 'fly', 'landing']) {
    assert.equal(clips.has(clip), true, `dove should request ${clip}`);
  }
});

test('Galapagos hawks soar and return only to real authored tree perches', () => {
  const record = baseSpecimens.find(specimen => specimen.id === 'galapagoshawk');
  assert.ok(record);
  assert.equal(record.latin, 'Buteo galapagoensis');
  assert.ok(record.details.some(detail => /hooked bill/i.test(detail)));

  const render = getWildlifeRenderProfile({ id: 'galapagos_hawk' });
  const profile = getWildlifeBehaviorProfile({ id: 'galapagos_hawk' });
  assert.deepEqual(render, { type: 'proceduralFinch', variant: 'galapagosHawk' });
  assert.equal(profile.controller, 'raptor');

  const actors = getThreeSpecimens('W_HIGH').filter(specimen => specimen.id === 'galapagoshawk');
  assert.equal(actors.length, 1);
  const actor = actors[0];
  const base = new Vector3(actor.spawnPoint[0], actor.spawnPoint[1], actor.spawnPoint[2]);
  const perches = getTreePerches('W_HIGH', { origin: base, radius: profile.perchSearchRadius });
  assert.ok(perches.length >= 8);
  assert.equal(perches.every(isAuthoredTreePerch), true);
  assert.equal(perches.every(perch => ['scalesia', 'manzanillo', 'palo-santo'].includes(perch.species)), true);
  assert.equal(perches.every(perch => perch.y > terrainHeight(perch.x, perch.z, 'W_HIGH') + 2), true);

  const controller = createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.41,
    zoneId: 'W_HIGH',
    basePosition: base,
    actorScale: actor.sceneScale,
  });
  const modes = new Set();
  const clips = new Set();
  const authoredPerchIds = new Set(perches.map(perch => perch.id));
  let treeLandingFrames = 0;
  for (let t = 0; t <= 82; t += 0.1) {
    const result = controller.update({
      basePosition: base,
      zoneId: 'W_HIGH',
      playerPosition: { x: base.x + 90, z: base.z + 90 },
      elapsedTime: t,
      delta: 0.1,
    });
    assert.equal(result.ok, true);
    modes.add(result.state.debug.mode);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
    if (result.state.debug.mode === 'perched') {
      assert.equal(authoredPerchIds.has(result.state.debug.perchId), true);
      assert.ok(result.state.position.y > terrainHeight(result.state.position.x, result.state.position.z, 'W_HIGH') + 2);
    }
    if (result.state.debug.mode === 'landing') {
      treeLandingFrames += 1;
      assert.equal(result.state.debug.landingSurface, 'tree');
      assert.equal(authoredPerchIds.has(result.state.debug.landingPerchId), true);
    }
  }
  for (const mode of ['perched', 'takeoff', 'soar', 'stoop', 'approach', 'landing']) {
    assert.equal(modes.has(mode), true, `hawk should enter ${mode}`);
  }
  assert.ok(treeLandingFrames > 4);
  for (const clip of ['perchLook', 'raptorTakeoff', 'soar', 'treeLanding']) {
    assert.equal(clips.has(clip), true, `hawk should request ${clip}`);
  }
});

test('Galapagos short-eared owls wake at dusk, hunt low, and return to authored lava roosts', () => {
  const record = baseSpecimens.find(specimen => specimen.id === 'shortearedowl');
  assert.ok(record);
  assert.equal(record.latin, 'Asio flammeus galapagoensis');
  assert.ok(record.details.some(detail => /facial disc/i.test(detail)));
  assert.ok(record.details.some(detail => /moth-like/i.test(detail)));

  const render = getWildlifeRenderProfile({ id: 'galapagos_short_eared_owl' });
  const profile = getWildlifeBehaviorProfile({ id: 'galapagos_short_eared_owl' });
  assert.deepEqual(render, { type: 'proceduralFinch', variant: 'galapagosShortEaredOwl' });
  assert.equal(profile.controller, 'owl');
  assert.ok(profile.activeFromHour > 17 && profile.activeUntilHour < 7);

  const wildEncounters = [
    ['LAVA_FLATS', 'lava-flats-short-eared-owl-scoria-roost-1', null],
    ['N_OUTCROP', 'outcrop-short-eared-owl-basalt-spine-1', 'noutcrop-spine-rock-14'],
    ['E_MID', 'rocky-clearing-short-eared-owl-north-shelf-1', 'rocky-clearing-north-shelf-block'],
  ];
  for (const [zoneId, localInstanceId, expectedHomeObstacleId] of wildEncounters) {
    const zoneActors = getThreeSpecimens(zoneId).filter(specimen => specimen.id === 'shortearedowl');
    assert.equal(zoneActors.length, 1, `${zoneId} should contain one rare owl encounter`);
    assert.equal(zoneActors[0].instanceId, `${zoneId}:${localInstanceId}`);
    assert.equal(zoneActors[0].behavior, 'dusk-hunt');
    const zoneBase = new Vector3(...zoneActors[0].spawnPoint);
    const zoneRoosts = getOwlRoosts(zoneId, { origin: zoneBase, radius: profile.roostSearchRadius });
    assert.ok(zoneRoosts.length > 0, `${zoneId} should expose an elevated owl roost`);
    assert.equal(zoneRoosts.every(isOwlRoost), true);
    assert.equal(zoneRoosts.every(roost => roost.surface === 'lava'), true);
    assert.equal(
      zoneRoosts.every(roost => roost.y > terrainHeight(roost.x, roost.z, zoneId) + 0.17),
      true,
    );
    if (expectedHomeObstacleId) assert.equal(zoneRoosts[0].obstacleId, expectedHomeObstacleId);
  }

  const actors = getThreeSpecimens('LAVA_FLATS').filter(specimen => specimen.id === 'shortearedowl');
  assert.equal(actors.length, 1);
  const actor = actors[0];
  const base = new Vector3(actor.spawnPoint[0], actor.spawnPoint[1], actor.spawnPoint[2]);
  const roosts = getOwlRoosts('LAVA_FLATS', { origin: base, radius: profile.roostSearchRadius });
  assert.ok(roosts.length >= 4);
  assert.equal(roosts.every(isOwlRoost), true);
  assert.equal(roosts.every(roost => roost.surface === 'lava'), true);
  assert.equal(roosts.every(roost => roost.y > terrainHeight(roost.x, roost.z, 'LAVA_FLATS') + 0.17), true);

  const controller = createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.53,
    zoneId: 'LAVA_FLATS',
    basePosition: base,
    actorScale: actor.sceneScale,
  });
  const authoredRoostIds = new Set(roosts.map(roost => roost.id));
  const dayModes = new Set();
  const clips = new Set();
  for (let t = 0; t <= 12; t += 0.1) {
    const result = controller.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 80, z: base.z + 80 },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 12,
    });
    assert.equal(result.ok, true);
    dayModes.add(result.state.debug.mode);
    assert.equal(result.state.debug.active, false);
    assert.equal(result.state.airborne, false);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
  }
  assert.deepEqual([...dayModes], ['roost']);
  assert.equal(clips.has('owlDoze'), true);

  const approachController = createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.31,
    zoneId: 'LAVA_FLATS',
    basePosition: base,
    actorScale: actor.sceneScale,
  });
  let quietApproachPanic = 0;
  for (let t = 0; t <= 4; t += 0.1) {
    const result = approachController.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: roosts[0].x, z: roosts[0].z },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 12,
    });
    quietApproachPanic = Math.max(quietApproachPanic, result.state.debug.panic || 0);
    assert.equal(result.state.debug.mode, 'roost');
    assert.equal(result.state.airborne, false);
  }
  assert.ok(quietApproachPanic > 0.8, 'the daytime approach should be close enough to trigger normal proximity panic');

  const nightModes = new Set();
  let lavaLandingFrames = 0;
  for (let t = 12.1; t <= 62; t += 0.1) {
    const result = controller.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 80, z: base.z + 80 },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 18.5,
    });
    assert.equal(result.ok, true);
    assert.equal(Number.isFinite(result.state.position.x), true);
    assert.equal(Number.isFinite(result.state.position.y), true);
    assert.equal(Number.isFinite(result.state.position.z), true);
    assert.equal(result.state.debug.active, true);
    nightModes.add(result.state.debug.mode);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
    if (result.state.debug.mode === 'roost') {
      assert.equal(authoredRoostIds.has(result.state.debug.roostId), true);
      assert.equal(result.state.debug.roostSurface, 'lava');
    }
    if (result.state.debug.mode === 'landing') {
      lavaLandingFrames += 1;
      assert.equal(result.state.debug.landingSurface, 'lava');
      assert.equal(authoredRoostIds.has(result.state.debug.landingRoostId), true);
    }
  }
  for (const mode of ['takeoff', 'quarter', 'hover', 'pounce', 'rebound', 'approach', 'landing', 'roost']) {
    assert.equal(nightModes.has(mode), true, `owl should enter ${mode}`);
  }
  assert.ok(lavaLandingFrames > 4);
  for (const clip of ['listenSwivel', 'softLaunch', 'buoyantFlight', 'silentQuarter', 'hoverListen', 'preyPounce', 'lavaLanding']) {
    assert.equal(clips.has(clip), true, `owl should request ${clip}`);
  }
});

test('Floreana racers bask, hunt, and retreat into real lava crevices', () => {
  const record = baseSpecimens.find(specimen => specimen.id === 'galapagosracer');
  assert.ok(record);
  assert.equal(record.name, 'Floreana Racer Snake');
  assert.equal(record.latin, 'Pseudalsophis biserialis biserialis');
  assert.ok(record.details.some(detail => /Charles Island/i.test(detail)));
  assert.equal(/[“”]/.test(record.memoryText), false, 'field memory should not masquerade as a Darwin quotation');

  const render = getWildlifeRenderProfile({ id: 'galapagos_racer' });
  const profile = getWildlifeBehaviorProfile({ id: 'floreana_racer' });
  assert.deepEqual(render, { type: 'proceduralSnake', variant: 'floreanaRacer' });
  assert.equal(profile.controller, 'racer');

  const actors = getThreeSpecimens('LAVA_FLATS').filter(specimen => specimen.id === 'galapagosracer');
  assert.equal(actors.length, 3);
  const actor = actors.find(specimen => specimen.localInstanceId === 'lava-flats-floreana-racer-tube-rim-1');
  assert.ok(actor);
  assert.equal(actor.instanceId, 'LAVA_FLATS:lava-flats-floreana-racer-tube-rim-1');
  const base = new Vector3(...actor.spawnPoint);
  const shelters = getRacerShelters('LAVA_FLATS', { origin: base, radius: profile.shelterSearchRadius });
  assert.ok(shelters.length >= 3);
  assert.equal(shelters.every(isRacerShelter), true);
  assert.equal(shelters.every(shelter => shelter.surface === 'crevice' && shelter.obstacleId), true);

  const createController = () => createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.47,
    zoneId: 'LAVA_FLATS',
    basePosition: base,
    actorScale: actor.sceneScale,
  });

  const daylight = createController();
  const daylightModes = new Set();
  const clips = new Set();
  for (let t = 0; t <= 60; t += 0.1) {
    const result = daylight.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 80, z: base.z + 80 },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 12,
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.debug.active, true);
    assert.equal(result.state.airborne, false);
    daylightModes.add(result.state.debug.mode);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
  }
  for (const mode of ['bask', 'taste', 'strike', 'slither']) {
    assert.equal(daylightModes.has(mode), true, `racer should enter ${mode}`);
  }

  const approached = createController();
  const threatModes = new Set();
  let shelteredAtRealRock = false;
  for (let t = 0; t <= 20; t += 0.1) {
    const result = approached.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 0.5, z: base.z + 0.5 },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 12,
    });
    threatModes.add(result.state.debug.mode);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
    if (result.state.debug.mode === 'shelter') {
      shelteredAtRealRock ||= result.state.debug.shelterSurface === 'crevice'
        && Boolean(result.state.debug.shelterId);
    }
  }
  for (const mode of ['alert', 'retreat', 'shelter']) {
    assert.equal(threatModes.has(mode), true, `approached racer should enter ${mode}`);
  }
  assert.equal(shelteredAtRealRock, true);

  const nocturnal = createController();
  const nightModes = new Set();
  for (let t = 0; t <= 30; t += 0.1) {
    const result = nocturnal.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 80, z: base.z + 80 },
      elapsedTime: t,
      delta: 0.1,
      timeOfDay: 22,
    });
    nightModes.add(result.state.debug.mode);
    if (result.state.animation?.clip) clips.add(result.state.animation.clip);
    assert.equal(result.state.debug.active, false);
  }
  assert.equal(nightModes.has('retreat'), true);
  assert.equal(nightModes.has('shelter'), true);
  for (const clip of ['baskCoil', 'tongueTaste', 'groundSlither', 'alertS', 'preyStrike', 'creviceRetreat', 'shelterStill']) {
    assert.equal(clips.has(clip), true, `racer should request ${clip}`);
  }
});

test('Floreana racers form frequent dry-land populations and pursue grounded birds', () => {
  const populations = {
    LAVA_FLATS: 3,
    COASTAL_SCRUBLAND: 3,
    POST_SCRUB_RISE: 3,
    E_MID: 2,
    NORTHERN_HIGHLANDS: 2,
  };
  for (const [zoneId, expectedCount] of Object.entries(populations)) {
    const racers = getThreeSpecimens(zoneId).filter(specimen => specimen.id === 'galapagosracer');
    assert.equal(racers.length, expectedCount, `${zoneId} should contain its authored racer population`);
    assert.equal(racers.every(specimen => specimen.instanceId.startsWith(`${zoneId}:`)), true);
    for (const racer of racers) {
      const [x, , z] = racer.spawnPoint;
      assert.equal(isWalkableTerrain(x, z, zoneId), true);
      const shelters = getRacerShelters(zoneId, {
        origin: { x, z },
        radius: getWildlifeBehaviorProfile(racer).shelterSearchRadius,
      });
      assert.ok(shelters.length > 0);
      assert.equal(shelters.every(isRacerShelter), true);
      assert.equal(shelters.some(shelter => shelter.surface === 'crevice' || shelter.surface === 'scrub'), true);
    }
  }

  const zoneId = 'COASTAL_SCRUBLAND';
  const racerActor = getThreeSpecimens(zoneId).find(specimen => (
    specimen.localInstanceId === 'coastal-scrub-floreana-racer-saltbush-1'
  ));
  const profile = getWildlifeBehaviorProfile(racerActor);
  const base = new Vector3(...racerActor.spawnPoint);
  const preyActorId = `${zoneId}:test-ground-finch-prey`;
  setSpecimenRuntimePose(zoneId, preyActorId, {
    x: base.x + 5,
    y: terrainHeight(base.x + 5, base.z, zoneId) + 0.05,
    z: base.z,
    specimenId: 'mediumgroundfinch',
  });
  try {
    const controller = createFaunaMotionController({
      profile,
      habitat: { radiusX: racerActor.habitatRadiusX, radiusZ: racerActor.habitatRadiusZ },
      seed: 0.47,
      zoneId,
      basePosition: base,
      actorScale: racerActor.sceneScale,
      actorId: `${zoneId}:test-racer-predator`,
    });
    const modes = new Set();
    let trackedPrey = false;
    for (let t = 0; t <= 14; t += 0.1) {
      const result = controller.update({
        basePosition: base,
        zoneId,
        playerPosition: { x: base.x + 80, z: base.z + 80 },
        elapsedTime: t,
        delta: 0.1,
        timeOfDay: 12,
      });
      modes.add(result.state.debug.mode);
      trackedPrey ||= result.state.debug.preyActorId === preyActorId;
    }
    assert.equal(modes.has('hunt'), true);
    assert.equal(modes.has('strike'), true);
    assert.equal(trackedPrey, true);
    const preyStimuli = consumeSpecimenStimuli(zoneId, preyActorId);
    assert.ok(preyStimuli.some(stimulus => (
      stimulus.kind === 'contact'
      && stimulus.sourceActorId === `${zoneId}:test-racer-predator`
    )), 'a close racer strike should startle the targeted bird into its escape behavior');
  } finally {
    removeSpecimenRuntimePose(zoneId, preyActorId);
  }
});

test('grazing tortoises and goats walk to authored vegetation before feeding', () => {
  const tortoiseRender = getWildlifeRenderProfile({ id: 'floreana_giant_tortoise' });
  const tortoiseProfile = getWildlifeBehaviorProfile({ id: 'floreana_giant_tortoise' });
  const goatProfile = getWildlifeBehaviorProfile({ id: 'feral_goat' });
  assert.deepEqual(tortoiseRender, { type: 'proceduralTortoise' });
  assert.equal(tortoiseProfile.controller, 'grazer');
  assert.equal(goatProfile.controller, 'grazer');
  assert.ok(tortoiseProfile.browseTargetChance > 0.8);
  assert.ok(goatProfile.browseTargetChance > 0.8);

  for (const [zoneId, specimenId, profile] of [
    ['NORTHERN_HIGHLANDS', 'floreanagianttortoise', tortoiseProfile],
    ['WATKINS_CREEK', 'feralgoat', goatProfile],
  ]) {
    const actor = getThreeSpecimens(zoneId).find(specimen => specimen.id === specimenId);
    assert.ok(actor, `${zoneId} should contain ${specimenId}`);
    const base = new Vector3(...actor.spawnPoint);
    const controller = createFaunaMotionController({
      profile,
      habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
      seed: specimenId === 'feralgoat' ? 0.37 : 0.21,
      zoneId,
      basePosition: base,
      actorScale: actor.sceneScale,
    });
    let sawPlantTarget = false;
    let sawBrowseAtPlant = false;
    let moved = false;
    for (let t = 0; t <= 150; t += 0.1) {
      const result = controller.update({
        basePosition: base,
        zoneId,
        playerPosition: { x: base.x + 80, z: base.z + 80 },
        elapsedTime: t,
        delta: 0.1,
      });
      assert.equal(result.ok, true);
      sawPlantTarget ||= Boolean(result.state.debug.browseTargetId);
      sawBrowseAtPlant ||= result.state.debug.mode === 'grazer:browse'
        && Boolean(result.state.debug.browseTargetId);
      moved ||= result.state.debug.moving;
    }
    assert.equal(moved, true, `${specimenId} should move between feeding sites`);
    assert.equal(sawPlantTarget, true, `${specimenId} should select an authored plant target`);
    assert.equal(sawBrowseAtPlant, true, `${specimenId} should stop and browse at that plant`);
  }
});

test('Galapagos painted locusts hop among plants and rocks and spring away from Darwin', () => {
  const record = baseSpecimens.find(specimen => specimen.id === 'galapagospaintedlocust');
  assert.ok(record);
  assert.equal(record.latin, 'Schistocerca melanocera');
  assert.equal(record.order, 'Insect');
  assert.ok(record.details.some(detail => /coral-red/i.test(detail)));

  const render = getWildlifeRenderProfile({ id: 'painted_locust' });
  const profile = getWildlifeBehaviorProfile({ id: 'galapagos_painted_locust' });
  assert.deepEqual(render, { type: 'proceduralLocust' });
  assert.equal(profile.controller, 'hopper');

  const habitatZones = ['POST_OFFICE_BAY', 'LAVA_FLATS', 'NORTHERN_HIGHLANDS', 'COASTAL_SCRUBLAND', 'E_MID', 'POST_SCRUB_RISE', 'WATKINS_CREEK'];
  let totalActors = 0;
  for (const zoneId of habitatZones) {
    const actors = getThreeSpecimens(zoneId).filter(specimen => specimen.id === 'galapagospaintedlocust');
    assert.ok(actors.length >= 2, `${zoneId} should contain a small painted-locust population`);
    totalActors += actors.length;
  }
  assert.ok(totalActors >= 16);

  const actor = getThreeSpecimens('LAVA_FLATS').find(specimen => specimen.id === 'galapagospaintedlocust');
  const base = new Vector3(...actor.spawnPoint);
  const controller = createFaunaMotionController({
    profile,
    habitat: { radiusX: actor.habitatRadiusX, radiusZ: actor.habitatRadiusZ },
    seed: 0.43,
    zoneId: 'LAVA_FLATS',
    basePosition: base,
    actorScale: actor.sceneScale,
  });
  const modes = new Set();
  const perchTypes = new Set();
  let airborneFrames = 0;
  for (let t = 0; t <= 38; t += 0.05) {
    const result = controller.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: base.x + 40, z: base.z + 40 },
      elapsedTime: t,
      delta: 0.05,
    });
    modes.add(result.state.debug.mode);
    perchTypes.add(result.state.debug.perchType);
    if (result.state.airborne) airborneFrames += 1;
  }
  assert.equal(modes.has('hopper:hop'), true);
  assert.ok(airborneFrames > 10);
  assert.ok(perchTypes.has('plant') || perchTypes.has('rock'));

  const beforeThreat = controller.state.position.clone();
  for (let t = 38.05; t <= 40; t += 0.05) {
    controller.update({
      basePosition: base,
      zoneId: 'LAVA_FLATS',
      playerPosition: { x: beforeThreat.x - 0.25, z: beforeThreat.z },
      elapsedTime: t,
      delta: 0.05,
    });
  }
  assert.ok(controller.state.position.x > beforeThreat.x, 'close approach should launch the locust away from Darwin');
});

test('animal animation lab exposes every procedural animal and its specialist behavior modes', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'three-game/ui/dev/AnimalAnimationDevPanel.jsx'),
    'utf8',
  );
  for (const [id, variant] of [
    ['mediumGroundFinchProcedural', 'mediumGround'],
    ['largeGroundFinchProcedural', 'largeGround'],
    ['floreanaMockingbirdProcedural', 'floreanaMockingbird'],
    ['galapagosDoveProcedural', 'galapagosDove'],
    ['galapagosHawkProcedural', 'galapagosHawk'],
    ['galapagosShortEaredOwlProcedural', 'galapagosShortEaredOwl'],
    ['galapagosRacerProcedural', 'floreanaRacer'],
    ['galapagosPaintedLocustProcedural', 'largePaintedLocust'],
  ]) {
    assert.match(source, new RegExp(`id: '${id}'[\\s\\S]{0,260}variant: '${variant}'`));
  }
  for (const mode of ['ground forage', 'glide', 'tree perch', 'soar', 'stoop', 'tree landing', 'listening swivel', 'silent quartering', 'hover listen', 'prey pounce', 'lava landing', 'basking coil', 'tongue tasting', 'alert S-curve', 'prey strike', 'crevice retreat', 'shelter still', 'antenna watch', 'ground hop', 'plant perch', 'rock perch', 'escape leap']) {
    assert.match(source, new RegExp(`'${mode}'`), `animation lab should expose ${mode}`);
  }
  assert.match(source, /galapagosHawkProcedural[\s\S]{0,420}perchPreview: true/);
  assert.match(source, /get\('animalAnimationLab'\)/);

  const shellSource = fs.readFileSync(
    path.join(process.cwd(), 'three-game/ThreeDarwinGame.jsx'),
    'utf8',
  );
  assert.match(shellSource, /params\.has\('animalAnimationLab'\)[\s\S]{0,100}setShowAnimalAnimationLab\(true\)/);
});

test('promoted Floreana flora resolve as authored specimen actors with runtime models', () => {
  const promotedFlora = [
    ['N_SHORE', 'scalesiavillosa', 'north-shore-scalesia-villosa-scrub-edge'],
    ['N_SHORE', 'candelabracactus', 'north-shore-candelabra-inland-rise'],
    ['N_SHORE', 'manzanillo', 'north-shore-manzanillo-back-scrub'],
    ['CORMORANT_BAY', 'sesuviumportulacastrum', 'cormorant-bay-sesuvium-lagoon-margin'],
    ['W_HIGH', 'resurrectionfern', 'western-highlands-resurrection-fern-trail-edge'],
    ['MANGROVES', 'galapagosjusticia', 'southern-forest-galapagos-justicia-trail-edge'],
    ['POST_SCRUB_RISE', 'crotonscouleri', 'scrub-rise-croton-west-thicket'],
  ];

  for (const [zoneId, specimenId, localInstanceId] of promotedFlora) {
    const record = baseSpecimens.find(specimen => specimen.id === specimenId);
    assert.ok(record, `${specimenId} should have a specimen record`);
    assert.equal(record.ontology, 'Plant');
    assert.ok(record.latin, `${specimenId} should have a scientific name`);
    assert.ok(record.contents, `${specimenId} should have collection and preservation guidance`);
    assert.ok(record.details?.length >= 4, `${specimenId} should expose field-identification characters`);

    const asset = modelAssets[specimenId];
    assert.equal(asset?.enabled, true, `${specimenId} should have an enabled runtime model`);
    assert.match(asset.path, /^\/assets\/models\//);
    assert.equal(fs.existsSync(path.join(process.cwd(), 'public', asset.path)), true);

    const actor = getThreeSpecimens(zoneId).find(specimen => specimen.localInstanceId === localInstanceId);
    assert.ok(actor, `${specimenId} should have an authored actor in ${zoneId}`);
    assert.equal(actor.id, specimenId);
    assert.equal(actor.instanceId, `${zoneId}:${localInstanceId}`);
    assert.equal(actor.behavior, 'still');
  }
});

test('stable region ids resolve canonical map names instead of inferred labels', () => {
  assert.equal(getRegionDisplayName('E_MID'), 'Rocky Clearing');
  assert.equal(getRegionDisplayName('WATKINS_CREEK'), 'Highland Creek Fork');
  assert.equal(getRegionDeveloperLabel('E_MID'), 'Rocky Clearing [E_MID]');
  assert.equal(getRegionDisplayName('NOT_A_REGION'), null);

  for (const placement of FLOREANA_MAP_PLACEMENTS) {
    assert.ok(
      getRegionDisplayName(placement.id),
      `${placement.id} must have a canonical display name for the island chart and developer tools`,
    );
  }
});

test('Floreana cardinal routes remain reciprocal and Northern Shore matches the painted geography', () => {
  const northShoreOpen = regionMaps.N_SHORE.edgeHints
    .filter(hint => hint.kind === 'open')
    .map(hint => [hint.direction, hint.toRegionId]);
  assert.deepEqual(northShoreOpen, [
    ['W', 'POST_OFFICE_BAY'],
    ['E', 'CORMORANT_BAY'],
  ]);
  assert.equal(
    regionMaps.N_SHORE.edgeHints.some(hint => hint.kind === 'blocked' && hint.edge === 'north' && hint.boundaryKind === 'ocean'),
    true,
  );
  assert.equal(
    regionMaps.N_SHORE.edgeHints.some(hint => hint.kind === 'blocked' && hint.edge === 'south' && hint.boundaryKind === 'cliff'),
    true,
  );

  const occupiedSlots = new Set();
  const neighbors = new Map();
  const placementsById = new Map(FLOREANA_MAP_PLACEMENTS.map(placement => [
    placement.id,
    { x: placement.at[0], y: placement.at[1] },
  ]));
  for (const [fromId, direction, toId] of FLOREANA_ROUTE_EDGES) {
    const forwardSlot = `${fromId}:${direction}`;
    const reverseSlot = `${toId}:${FLOREANA_OPPOSITE_DIRECTIONS[direction]}`;
    assert.equal(occupiedSlots.has(forwardSlot), false, `duplicate cardinal route slot ${forwardSlot}`);
    assert.equal(occupiedSlots.has(reverseSlot), false, `duplicate cardinal route slot ${reverseSlot}`);
    occupiedSlots.add(forwardSlot);
    occupiedSlots.add(reverseSlot);
    neighbors.set(fromId, [...(neighbors.get(fromId) || []), toId]);
    neighbors.set(toId, [...(neighbors.get(toId) || []), fromId]);
    assert.equal(
      mapDirectionBetween(placementsById.get(fromId), placementsById.get(toId)),
      direction,
      `${fromId} ${direction} -> ${toId} conflicts with its island-chart bearing`,
    );
    const reverse = regionMaps[toId]?.edgeHints.find(hint => (
      hint.kind === 'open'
      && hint.toRegionId === fromId
      && hint.direction === FLOREANA_OPPOSITE_DIRECTIONS[direction]
    ));
    assert.ok(reverse, `missing reciprocal route for ${fromId} ${direction} -> ${toId}`);
  }

  const directionEdges = { N: 'north', E: 'east', S: 'south', W: 'west' };
  const editorLocations = FLOREANA_MAP_PLACEMENTS.filter(placement => (
    !placement.test
    && placement.kind !== 'shipInterior'
    && placement.kind !== 'houseInterior'
  ));
  for (const placement of editorLocations) {
    for (const direction of FLOREANA_CARDINAL_DIRECTIONS) {
      const routeSlot = `${placement.id}:${direction}`;
      const boundary = FLOREANA_BOUNDARIES[placement.id]?.[directionEdges[direction]];
      assert.equal(
        occupiedSlots.has(routeSlot) || Boolean(boundary),
        true,
        `${routeSlot} needs a route or an authored geographic boundary`,
      );
      assert.equal(
        occupiedSlots.has(routeSlot) && Boolean(boundary),
        false,
        `${routeSlot} cannot be both traversable and blocked by ${boundary}`,
      );
    }
  }

  const reachable = new Set(['POST_OFFICE_BAY']);
  const frontier = ['POST_OFFICE_BAY'];
  while (frontier.length) {
    const fromId = frontier.shift();
    for (const toId of neighbors.get(fromId) || []) {
      if (reachable.has(toId)) continue;
      reachable.add(toId);
      frontier.push(toId);
    }
  }
  assert.deepEqual(
    editorLocations.filter(placement => !reachable.has(placement.id)).map(placement => placement.id),
    [],
    'every island-chart map should belong to the connected travel graph',
  );
});

test('island chart reserves persistent labels for major landmarks', () => {
  assert.equal(getIslandMapLocation('POST_OFFICE_BAY').labelAlways, true);
  assert.equal(getIslandMapLocation('N_SHORE').labelAlways, false);
  assert.ok(islandMapLocations.filter(location => location.labelAlways).length < islandMapLocations.length / 2);
});

test('large authored rocks creep only as constrained downhill-push obstacles', () => {
  const obstacles = getRuntimeObstacles('POST_OFFICE_BAY');
  const downhillRocks = obstacles.filter(obstacle => (
    (obstacle.kind === 'rock' || obstacle.kind === 'boulder')
    && obstacle.mobility?.mode === 'downhill-push'
  ));

  assert.ok(downhillRocks.length > 0, 'expected large rocks to expose downhill-push mobility');
  assert.ok(downhillRocks.every(obstacle => obstacle.pushable), 'downhill rocks should be pushable by the obstacle mover');
  assert.ok(
    downhillRocks.every(obstacle => obstacle.mobility.maxOffset > 0 && obstacle.mobility.maxOffset <= 0.5),
    'downhill rock movement should stay tightly capped',
  );
  assert.ok(
    downhillRocks.every(obstacle => obstacle.pushFriction <= 0.5),
    'downhill rock movement should use low creep friction',
  );
});

test('hammer material profiles infer geology from authored hints and terrain biomes', () => {
  assert.equal(inferHammerMaterial({
    rock: { id: 'ridge-scree-4', kind: 'rock' },
    zoneId: 'POST_OFFICE_BAY',
    biome: 'tuff-ridge',
  }), 'tuff');
  assert.equal(inferHammerMaterial({
    rock: { id: 'reef-coral-stone', kind: 'rock' },
    zoneId: 'NW_REEF',
    biome: 'coral',
  }), 'coral_limestone');
  assert.equal(inferHammerMaterial({
    rock: { id: 'custom', hammerProfile: 'scoria' },
    zoneId: 'TEST_ZONE',
    biome: 'dry-scrub',
  }), 'scoria');
  assert.equal(groundHammerMaterial({ zoneId: 'CORMORANT_BAY_TEST_3', biome: 'green-beach' }), 'olivine');
  assert.equal(groundHammerMaterial({ zoneId: 'NW_REEF', biome: 'white-sand' }), 'coral_limestone');
  assert.equal(groundHammerMaterial({ zoneId: 'POST_OFFICE_BAY', biome: 'dry-scrub' }), null);
});

test('hammer outcomes are deterministic and carry collection metadata', () => {
  const first = resolveHammerOutcome('tuff', 'same-rock');
  const second = resolveHammerOutcome('tuff', 'same-rock');
  assert.deepEqual(first, second);
  assert.equal(typeof first.condition, 'string');
  assert.ok(first.collectMessage.includes('tuff') || first.evidence.includes('tuff'));
});

test('objective progress counts field evidence, labels, surveyed zones, and fatigue safety', () => {
  const objectives = updateObjectiveProgress(createDefaultObjectives(), {
    inventory: [{ id: 'large_ground_finch' }],
    journal: [
      {
        specimenId: 'marine_iguana',
        location: 'Black Beach',
        method: 'sketch',
        content: 'Marine iguana field evidence with location, method, habitat, behavior, and distinguishing features recorded carefully for later comparison.',
      },
      {
        specimenName: 'Floreana Mockingbird',
        location: 'Highland',
        method: 'observation',
        content: 'Floreana mockingbird field evidence with location, method, behavior, plumage, bill shape, and careful habitat notes for comparison.',
      },
    ],
    eventHistory: [
      { locationType: 'bay' },
      { locationType: 'coastallava' },
      { locationType: 'wetland' },
      { locationType: 'highland' },
    ],
    fatigue: 20,
  });

  const byId = new Map(objectives.map(objective => [objective.id, objective]));
  assert.equal(byId.get('document_floreana_variation').progress, 3);
  assert.equal(byId.get('document_floreana_variation').complete, true);
  assert.equal(byId.get('label_specimens').progress, 2);
  assert.equal(byId.get('survey_zones').complete, true);
  assert.equal(byId.get('return_safely').complete, true);
});

test('fieldwork notes create objective-ready survey and specimen records', () => {
  const location = { id: 'BLACK_BEACH', name: 'Black Beach', type: 'coastallava' };
  const specimenList = [
    {
      id: 'marineiguana',
      name: 'Marine Iguana',
      description: 'A dark reptile feeding along the shore.',
      details: ['Flattened tail and dark skin suit surf and lava.'],
      collected: false,
    },
  ];
  const selected = selectDocumentableSpecimen({
    primaryCollectible: 'marine_iguana',
    nearbySpecimenIds: [],
    specimenList,
  });
  const survey = buildSurveyNote({
    location,
    nearbySpecimenIds: ['marine_iguana'],
    specimenList,
    day: 2,
    time: '9:30 AM',
  });
  const documentation = buildSpecimenDocumentationNote({ specimen: selected, location });

  assert.equal(selected.name, 'Marine Iguana');
  assert.ok(survey.content.includes('Black Beach'));
  assert.ok(survey.content.length > 80);
  assert.equal(documentation.specimenId, 'marineiguana');
  assert.ok(documentation.evidence.length > 80);
});

test('expedition readiness exposes concrete gaps for unsafe or incomplete expeditions', () => {
  const readiness = evaluateExpeditionReadiness({
    inventory: [{ id: 'basalt', name: 'Basalt', collectionQuality: 45, scientificValue: 2 }],
    journal: [{ content: 'short note', type: 'field_notes' }],
    objectives: createDefaultObjectives(),
    fatigue: 92,
    currentLocationId: 'BLACK_BEACH',
    traps: [{ id: 'trap-1', status: 'set' }],
  });

  assert.equal(readiness.verdict, 'Not ready');
  assert.equal(readiness.safeReturn, false);
  assert.ok(readiness.gaps.includes('Return to a safe embarkation point before concluding'));
  assert.ok(readiness.gaps.some(gap => gap.startsWith('Check or abandon 1 active trap')));
  assert.ok(readiness.gaps.includes('Improve collection quality with better method choices'));
});

test('readiness recommendations translate gaps into concrete player actions', () => {
  const objectives = createDefaultObjectives();
  const readiness = evaluateExpeditionReadiness({
    inventory: [],
    journal: [],
    objectives,
    fatigue: 91,
    currentLocationId: 'BLACK_BEACH',
    traps: [{ id: 'trap-1', status: 'set' }],
  });
  const recommendations = buildReadinessRecommendations({
    inventory: [],
    journal: [],
    objectives,
    fatigue: 91,
    currentLocationId: 'BLACK_BEACH',
    traps: [{ id: 'trap-1', status: 'set' }],
    readiness,
  });

  assert.deepEqual(recommendations.slice(0, 3).map(item => item.id), ['rest', 'return_safe', 'resolve_traps']);
  assert.ok(recommendations.some(item => item.id === 'field_labels'));
  assert.ok(recommendations.every(item => item.label && item.detail));
});

test('collection method previews expose sensible method tradeoffs before committing', () => {
  const marineIguana = {
    id: 'marineiguana',
    name: 'Marine Iguana',
    ontology: 'Animal',
    order: 'Reptile',
    sub_order: 'Iguana',
    habitat: 'coastallava, reef',
    danger: 2,
  };
  const location = { id: 'BLACK_BEACH', name: 'Black Beach', type: 'coastallava' };
  const snare = previewCollectionMethod({
    specimen: marineIguana,
    method: { id: 'snare', name: 'Snare' },
    location,
    fatigue: 10,
    gameTime: 600,
    seed: 'preview-test',
  });
  const hammer = previewCollectionMethod({
    specimen: marineIguana,
    method: { id: 'hammer', name: 'Hammer' },
    location,
    fatigue: 10,
    gameTime: 600,
    seed: 'preview-test',
  });

  assert.equal(snare.rating, 'Strong');
  assert.ok(snare.chance > hammer.chance);
  assert.ok(hammer.cautions.some(item => item.includes('destructive')));
});

test('trap readiness reports elapsed and remaining expedition time', () => {
  const notReady = getTrapReadiness({ setAt: 480, checkAfter: 120, status: 'set' }, 540);
  assert.equal(notReady.elapsedMinutes, 60);
  assert.equal(notReady.remainingMinutes, 60);
  assert.equal(notReady.ready, false);

  const ready = getTrapReadiness({ setAt: 1380, checkAfter: 90, status: 'set' }, 60);
  assert.equal(ready.elapsedMinutes, 120);
  assert.equal(ready.remainingMinutes, 0);
  assert.equal(ready.ready, true);

  const dayAware = getTrapReadiness({ setAt: 1380, setDay: 2, checkAfter: 180, status: 'set' }, 420, 3);
  assert.equal(dayAware.elapsedMinutes, 480);
  assert.equal(dayAware.remainingMinutes, 0);
  assert.equal(dayAware.ready, true);
});

test('LLM safety guard blocks pending duplicates and caches completed idempotent responses', () => {
  const sessionId = `test-${Date.now()}-${Math.random()}`;
  const request = {
    route: '/api/test',
    provider: 'openai',
    model: 'gpt-5.4-nano',
    sessionId,
    idempotencyKey: 'same-turn',
    prompt: 'repeatable prompt',
  };

  const first = beginLLMRequest(request);
  assert.equal(first.allowed, true);

  const pendingDuplicate = beginLLMRequest(request);
  assert.equal(pendingDuplicate.allowed, false);
  assert.equal(pendingDuplicate.reason, 'duplicate_request_pending');

  const response = { text: 'cached response' };
  finishLLMRequest({
    key: first.key,
    entryId: first.entryId,
    response,
    estimatedOutputTokens: 3,
  });

  const completedDuplicate = beginLLMRequest(request);
  assert.equal(completedDuplicate.allowed, false);
  assert.equal(completedDuplicate.cached, true);
  assert.deepEqual(completedDuplicate.cachedResponse, response);
});

test('LLM safety guard blocks excessive concurrent unique requests', () => {
  const previousPendingLimit = process.env.LLM_MAX_PENDING_PER_SESSION;
  process.env.LLM_MAX_PENDING_PER_SESSION = '3';
  const sessionId = `pending-${Date.now()}-${Math.random()}`;

  try {
    const requests = [0, 1, 2].map(index => beginLLMRequest({
      route: '/api/test-pending',
      provider: 'openai',
      model: 'gpt-5.4-nano',
      sessionId,
      idempotencyKey: `unique-${index}`,
      prompt: `unique prompt ${index}`,
    }));

    assert.equal(requests.every(request => request.allowed), true);

    const blocked = beginLLMRequest({
      route: '/api/test-pending',
      provider: 'openai',
      model: 'gpt-5.4-nano',
      sessionId,
      idempotencyKey: 'unique-3',
      prompt: 'unique prompt 3',
    });

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'pending_cap');

    requests.forEach(request => {
      finishLLMRequest({
        key: request.key,
        entryId: request.entryId,
        response: { text: 'done' },
        estimatedOutputTokens: 1,
      });
    });
  } finally {
    if (previousPendingLimit === undefined) delete process.env.LLM_MAX_PENDING_PER_SESSION;
    else process.env.LLM_MAX_PENDING_PER_SESSION = previousPendingLimit;
  }
});

test('hybrid placement chooses deterministic habitat-aware map cells', () => {
  const hybrid = {
    id: 'hybrid_test_iguana',
    name: 'Hybrid Iguana',
    habitat: 'coastallava, shore',
  };
  const first = selectHybridLocation(hybrid, { seed: 'same-seed' });
  const second = selectHybridLocation(hybrid, { seed: 'same-seed' });

  assert.deepEqual(first, second);
  assert.equal(typeof first.x, 'number');
  assert.equal(typeof first.y, 'number');
  assert.ok(['coastallava', 'beach', 'bay', 'ocean', 'reef', 'shore'].includes(first.type));
});

test('hybrid location repair preserves valid zero coordinates', () => {
  const placedAtOrigin = {
    id: 'hybrid_origin',
    name: 'Origin Hybrid',
    habitat: 'reef',
    location: { id: 'NW_REEF', name: 'Northwest Reef', type: 'reef', x: 0, y: 0 },
  };

  assert.equal(hasUsableLocation(placedAtOrigin.location), true);
  assert.equal(assignHybridLocation(placedAtOrigin), placedAtOrigin);
});

test('hybrid generation policy requires explicit bounded starts', () => {
  assert.equal(shouldAutoGenerateHybrids({ isVisible: true, hybridityMode: 'mild' }), false);
  assert.equal(shouldAutoGenerateHybrids({ isVisible: true, hybridityMode: 'mild', explicitStart: true }), true);
  assert.equal(clampHybridBatchSize(99), MAX_HYBRID_BATCH_SIZE);
  assert.equal(clampHybridBatchSize(0), 1);
  assert.equal(clampHybridBatchSize('bad', 2), 2);
});

test('hybrid parent selection is deterministic and bounded', () => {
  const groups = {
    Tortoise: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    Finch: [{ id: 'c', name: 'C' }, { id: 'd', name: 'D' }, { id: 'e', name: 'E' }],
    Iguana: [{ id: 'f', name: 'F' }, { id: 'g', name: 'G' }],
  };
  const first = selectDeterministicParentPairs(groups, 99, 'seed-1');
  const second = selectDeterministicParentPairs(groups, 99, 'seed-1');

  assert.deepEqual(first, second);
  assert.equal(first.length, Math.min(MAX_HYBRID_BATCH_SIZE, Object.keys(groups).length));
  assert.ok(first.every(pair => pair.parent1.id !== pair.parent2.id));
});

test('player command router sends mechanical actions to deterministic systems', () => {
  assert.deepEqual(routePlayerCommand('n'), { type: 'move_direction', direction: 'north' });
  assert.deepEqual(routePlayerCommand('head southeast'), { type: 'move_direction', direction: 'southeast' });
  assert.deepEqual(routePlayerCommand('/move POST_OFFICE_BAY'), { type: 'move_location', locationId: 'POST_OFFICE_BAY' });
  assert.deepEqual(routePlayerCommand('survey the site'), { type: 'survey_site' });
  assert.deepEqual(routePlayerCommand('check my traps'), { type: 'check_traps' });
  assert.deepEqual(routePlayerCommand('rest until morning'), { type: 'rest' });
  assert.deepEqual(routePlayerCommand('collect the marine iguana'), { type: 'collect_specimen', query: 'marine iguana' });
  assert.deepEqual(routePlayerCommand('document the mockingbird'), { type: 'document_specimen', query: 'mockingbird' });
  assert.deepEqual(routePlayerCommand('return to the Beagle'), { type: 'move_location', locationId: 'BEAGLE' });
  assert.deepEqual(routePlayerCommand('board the HMS Beagle'), { type: 'enter_interior', interiorType: 'hms_beagle' });
});

test('player command router preserves narrative turns when no mechanic is implied', () => {
  assert.deepEqual(routePlayerCommand('ask Lawson what he knows about island tortoises'), { type: 'narrative' });
  assert.deepEqual(routePlayerCommand('think carefully about the strange distribution of finches'), { type: 'narrative' });
});

test('NPC encounter effects are bounded and flags stay allowlisted', () => {
  assert.deepEqual(
    clampNpcEncounterEffects('syms_covington', {
      trustDelta: 99,
      flags: ['discussed_specimens', 'not-a-real-flag', 'syms_covington:offered_practical_help'],
    }),
    { trustDelta: 5, flags: ['discussed_specimens', 'offered_practical_help'] },
  );
  assert.deepEqual(clampNpcEncounterEffects('unknown', { trustDelta: -99, flags: ['anything'] }), { trustDelta: 0, flags: [] });
});

test('Syms encounter presentation reflects session flags without mutating the base encounter', () => {
  const presentation = getNpcEncounterPresentation('syms_covington', {
    trust: 50,
    flags: ['offered_practical_help'],
  });
  assert.match(presentation.opener, /labels, twine, and spare paper/i);
  assert.equal(presentation.suggestedReplies.length, 2);
});

test('interior entry detection is shared by typed commands and map dispatch', () => {
  assert.equal(detectInteriorEntry('enter the pirate cave'), 'cave');
  assert.equal(detectInteriorEntry('board the HMS Beagle'), 'hms_beagle');
  assert.equal(detectInteriorEntry("follow Lawson to the governor's house"), 'governors_house');
  assert.equal(detectInteriorEntry('ask Covington about the weather'), null);
});

test('save snapshots expose resume summary without requiring localStorage', () => {
  const snapshot = buildSaveSnapshot({
    expeditionSeed: 'seed-1',
    gameStarted: true,
    currentScreen: 'exploration',
    currentLocationId: 'POST_OFFICE_BAY',
    gameTime: 615,
    daysPassed: 3,
    fatigue: 42,
    inventory: [{ id: 'basalt' }, { id: 'marineiguana' }],
    journal: [{ content: 'field note' }],
    objectives: [
      { id: 'a', complete: true },
      { id: 'b', complete: false },
    ],
  });
  const summary = summarizeExpeditionSave(snapshot);

  assert.equal(summary.day, 3);
  assert.equal(summary.time, '10:15 AM');
  assert.equal(summary.locationId, 'POST_OFFICE_BAY');
  assert.equal(summary.specimens, 2);
  assert.equal(summary.notes, 1);
  assert.equal(summary.objectivesComplete, 1);
  assert.equal(summary.objectivesTotal, 2);
  assert.equal(summary.fatigue, 42);
});

test('weather aliases normalize into valid 3D states', () => {
  assert.equal(normalizeWeatherState('rainy'), 'rain');
  assert.equal(normalizeWeatherState('fog'), 'misty');
  assert.equal(normalizeWeatherState('windy'), 'tradeWind');
  assert.equal(normalizeWeatherState('marine haze'), 'marineHaze');
  assert.equal(normalizeWeatherState('dense garua'), 'denseGarua');
  assert.equal(normalizeWeatherState('rainbow'), 'sunshower');
  assert.ok(weatherProfile('rainy').rain > 0.7);
  assert.ok(weatherProfile('fog').mist > 0.5);
  assert.ok(weatherProfile('windy').windBoost > 0.4);
});

test('procedural flora habitat scoring respects preference cores and tolerances', () => {
  const preference = { preferred: [0.3, 0.6], tolerated: [0.1, 0.8] };
  assert.equal(floraPreferenceSuitability(0.45, preference), 1);
  assert.equal(floraPreferenceSuitability(0.05, preference), 0);
  assert.ok(floraPreferenceSuitability(0.2, preference) > 0);
  assert.ok(floraPreferenceSuitability(0.2, preference) < 1);

  const suitable = scoreFloraHabitat(DARWINIOTHAMNUS_SPECIES, {
    moisture: 0.5,
    canopy: 0.3,
    exposure: 0.55,
    disturbance: 0.08,
    salinity: 0,
  });
  const disturbed = scoreFloraHabitat(DARWINIOTHAMNUS_SPECIES, {
    moisture: 0.5,
    canopy: 0.3,
    exposure: 0.55,
    disturbance: 0.5,
    salinity: 0,
  });
  assert.ok(suitable > 0.9);
  assert.ok(disturbed < suitable);
  assert.equal(scoreFloraHabitat(DARWINIOTHAMNUS_SPECIES, { excluded: true }), 0);

  const cohort = [{ x: 0, z: 0 }];
  assert.equal(floraCompanionSuitability(cohort, 1, 0), 0);
  assert.equal(floraCompanionSuitability(cohort, 6, 0), 1);
  assert.equal(floraCompanionSuitability(cohort, 18, 0), 0);
});

test('universal flora adapter evaluates every region without replacing authored ecology', () => {
  assert.deepEqual(
    [...ECOLOGY_ZONE_IDS].sort(),
    Object.keys(regionMaps).sort(),
  );

  let generatedCandelabra = 0;
  let inhabitedMaps = 0;
  for (const zoneId of ECOLOGY_ZONE_IDS) {
    const ecology = getEcology(zoneId);
    const diagnostic = ecology.proceduralFloraDiagnostics.find(item => (
      item.speciesId === CANDELABRA_CACTUS_SPECIES.id
    ));
    const layer = ecology.proceduralFlora.find(item => (
      item.universal === true && item.speciesId === CANDELABRA_CACTUS_SPECIES.id
    ));

    assert.equal(ecology.universalFloraVersion, 2, `${zoneId} has the standard habitat adapter`);
    assert.ok(diagnostic, `${zoneId} exposes candelabra habitat diagnostics`);
    assert.equal(diagnostic.zoneName, regionMaps[zoneId].name, `${zoneId} diagnostics use its canonical display name`);
    for (const species of [
      OPUNTIA_MEGASPERMA_SPECIES,
      DARWINIOTHAMNUS_SPECIES,
      PLEOPELTIS_POLYPODIOIDES_SPECIES,
    ]) {
      assert.ok(
        ecology.proceduralFloraDiagnostics.some(item => item.speciesId === species.id),
        `${zoneId} evaluates ${species.id}`,
      );
    }
    assert.equal(diagnostic.samples.length, diagnostic.sampleCount);
    assert.equal(
      diagnostic.suitableCount + Object.values(diagnostic.rejectionCounts).reduce((sum, count) => sum + count, 0),
      diagnostic.sampleCount,
    );
    assert.ok(ecology.universalFloraBudget.allocatedCount <= ecology.universalFloraBudget.maximumOverlayCount);

    if (!layer) continue;
    inhabitedMaps += 1;
    generatedCandelabra += layer.items.length;
    assert.ok(layer.items.length <= diagnostic.densityBudget.proceduralCount);
    for (let index = 0; index < layer.items.length; index += 1) {
      for (const other of layer.items.slice(index + 1)) {
        assert.ok(
          Math.hypot(layer.items[index].x - other.x, layer.items[index].z - other.z)
            >= CANDELABRA_CACTUS_SPECIES.placement.minItemSeparation,
          `${zoneId} candelabra respect species spacing`,
        );
      }
    }
  }

  assert.ok(inhabitedMaps >= 10, 'candelabra reaches a broad but selective set of island maps');
  assert.ok(generatedCandelabra >= 30, 'the universal layer is visibly represented island-wide');
});

test('universal Opuntia populations pair decorative adults with physics juveniles', () => {
  let matureMaps = 0;
  let juvenileMaps = 0;
  for (const zoneId of ECOLOGY_ZONE_IDS) {
    const ecology = getEcology(zoneId);
    const mature = ecology.proceduralFlora
      .filter(layer => layer.universal && layer.lifeStage === 'mature tree cactus')
      .flatMap(layer => layer.items || []);
    const juveniles = ecology.interactiveFlora
      .filter(layer => layer.universal && layer.runtime === 'prickly-pear')
      .flatMap(layer => layer.sites || []);
    if (mature.length) matureMaps += 1;
    if (juveniles.length) juvenileMaps += 1;
    if (juveniles.length) {
      assert.deepEqual(
        getPricklyPearSites(zoneId).slice(-juveniles.length).map(site => site.id),
        juveniles.map(site => site.id),
      );
    }
    if (!mature.length || !juveniles.length) continue;
    for (const adult of mature) {
      const distance = Math.min(...juveniles.map(young => (
        Math.hypot(adult.x - young.x, adult.z - young.z)
      )));
      assert.ok(distance >= 4.2 && distance <= 24, `${zoneId} keeps adult and juvenile life stages in a plausible cohort`);
    }
  }
  assert.ok(matureMaps >= 8, 'mature Opuntia is evaluated into a broad dry-zone range');
  assert.ok(juvenileMaps >= 8, 'breakable juvenile Opuntia is evaluated into a broad dry-zone range');
  assert.equal(
    getEcology('POST_OFFICE_BAY').interactiveFlora.some(layer => layer.id.startsWith('universal-young-opuntia')),
    false,
    'the universal system does not duplicate the detailed Post Office Bay cohort',
  );
});

test('universal shrubs and ferns fill suitable gaps but defer to detailed regional layers', () => {
  const universalDarwiniothamnusMaps = [];
  const universalFernMaps = [];
  for (const zoneId of ECOLOGY_ZONE_IDS) {
    const ecology = getEcology(zoneId);
    if (ecology.proceduralFlora.some(layer => (
      layer.universal && layer.speciesId === DARWINIOTHAMNUS_SPECIES.id
    ))) universalDarwiniothamnusMaps.push(zoneId);
    if (ecology.proceduralFlora.some(layer => (
      layer.universal && layer.speciesId === PLEOPELTIS_POLYPODIOIDES_SPECIES.id
    ))) universalFernMaps.push(zoneId);
  }
  assert.ok(universalDarwiniothamnusMaps.length >= 4);
  assert.ok(universalFernMaps.length >= 4);
  assert.equal(universalDarwiniothamnusMaps.includes('POST_SCRUB_RISE'), false);
  assert.equal(universalDarwiniothamnusMaps.includes('POST_OFFICE_BAY'), false);
  assert.equal(universalFernMaps.includes('WATKINS'), false);
  assert.equal(universalFernMaps.includes('W_HIGH'), false);
  assert.equal(universalFernMaps.includes('N_OUTCROP'), false);
});

test('Desolate Outcrop is an explicit candelabra exclusion', () => {
  const ecology = getEcology('N_OUTCROP');
  const diagnostic = ecology.proceduralFloraDiagnostics.find(item => (
    item.speciesId === CANDELABRA_CACTUS_SPECIES.id
  ));
  assert.equal(
    ecology.proceduralFlora.some(item => (
      item.universal === true && item.speciesId === CANDELABRA_CACTUS_SPECIES.id
    )),
    false,
  );
  assert.equal(diagnostic.suitableCount, 0);
  assert.ok(diagnostic.samples.every(sample => sample.exclusionReasons.includes('region exclusion')));
});

test('penal colony procedural flora overlays authored flora without entering worked ground', () => {
  const ecology = buildPenalColonyEcology();
  assert.equal(ecology.flora.length, 3);
  assert.equal(ecology.proceduralFlora.length, 1);
  const layer = ecology.proceduralFlora[0];
  assert.equal(layer.procedural, true);
  assert.equal(layer.speciesId, DARWINIOTHAMNUS_SPECIES.id);
  assert.equal(layer.items.length, 36);
  assert.equal(new Set(layer.items.map(item => item.variantIndex)).size, 9);
  for (const item of layer.items) {
    const pathInfo = penalColonyPathInfo(item.x, item.z);
    assert.ok(pathInfo.distance >= pathInfo.width * 1.55);
    assert.ok(penalColonyTrampledMask(item.x, item.z) <= 0.12);
    assert.ok(penalColonyGardenInfo(item.x, item.z).mask <= 0.08);
  }
});

test('post scrub rise procedural flora fills suitable gaps beside authored shrubs', () => {
  const ecology = buildPostScrubRiseEcology();
  const authoredLayer = ecology.flora.find(layer => layer.id === 'scrub-rise-darwiniothamnus');
  const layer = ecology.proceduralFlora[0];
  assert.equal(authoredLayer.items.length, 63);
  assert.equal(layer.procedural, true);
  assert.equal(layer.speciesId, DARWINIOTHAMNUS_SPECIES.id);
  assert.equal(layer.items.length, 36);
  assert.equal(new Set(layer.items.map(item => item.variantIndex)).size, 9);
  for (const item of layer.items) {
    const pathInfo = scrubRisePathInfo(item.x, item.z);
    const authoredDistance = Math.min(...authoredLayer.items.map(authored => (
      Math.hypot(item.x - authored.x, item.z - authored.z)
    )));
    assert.ok(pathInfo.distance >= pathInfo.width * 1.72);
    assert.ok(scrubRiseWashMask(item.x, item.z) <= 0.58);
    assert.ok(scrubRiseBasaltExposure(item.x, item.z) <= 0.82);
    assert.ok(authoredDistance >= 3.2);
  }
});

test('post scrub rise interactive flora feeds stable separated prickly pear physics sites', () => {
  const ecology = buildPostScrubRiseEcology();
  const layer = ecology.interactiveFlora[0];
  const candelabra = ecology.flora.find(item => item.id === 'scrub-rise-candelabra-cactus');
  assert.equal(layer.procedural, true);
  assert.equal(layer.runtime, 'prickly-pear');
  assert.equal(layer.speciesId, OPUNTIA_MEGASPERMA_SPECIES.id);
  assert.equal(layer.sites.length, 6);
  assert.equal(layer.placementStats.generatedPatchCount, 2);
  assert.equal(new Set(layer.sites.map(site => site.id)).size, 6);
  assert.deepEqual(
    getPricklyPearSites('POST_SCRUB_RISE').map(site => site.id),
    layer.sites.map(site => site.id),
  );

  for (let index = 0; index < layer.sites.length; index += 1) {
    const site = layer.sites[index];
    const pathInfo = scrubRisePathInfo(site.x, site.z);
    const candelabraDistance = Math.min(...candelabra.items.map(item => (
      Math.hypot(site.x - item.x, site.z - item.z)
    )));
    assert.ok(pathInfo.distance >= pathInfo.width * 1.85);
    assert.ok(scrubRiseWashMask(site.x, site.z) <= 0.48);
    assert.ok(scrubRiseThicketStrength(site.x, site.z) <= 0.72);
    assert.ok(scrubRiseBasaltExposure(site.x, site.z) <= 0.9);
    assert.ok(candelabraDistance >= 5);
    assert.ok(Math.hypot(site.x + 31, site.z + 9) >= 5);
    assert.ok(site.size >= 0.75 && site.size <= 1.3);
    assert.ok(site.flowerCount >= 0 && site.flowerCount <= 3);
    assert.match(site.seed, /^POST_SCRUB_RISE:/);
    for (const other of layer.sites.slice(index + 1)) {
      assert.ok(Math.hypot(site.x - other.x, site.z - other.z) >= 4.5);
    }
  }
});

test('Darwin’s lost herb forms one habitat-scored highland reconstruction per region', () => {
  for (const zoneId of ['W_HIGH', 'NORTHERN_HIGHLANDS']) {
    const ecology = getEcology(zoneId);
    const layer = ecology.interactiveFlora.find(item => item.runtime === 'delilia-inelegans');
    const sicyos = ecology.interactiveFlora.find(item => item.runtime === 'sicyos-villosus');
    assert.equal(layer.procedural, true);
    assert.equal(layer.speciesId, DELILIA_INELEGANS_SPECIES.id);
    assert.equal(layer.sites.length, 1);
    assert.equal(layer.placementStats.generatedCount, 1);
    assert.equal(layer.placementStats.shortfallCount, 0);
    assert.deepEqual(getDeliliaSites(zoneId).map(site => site.id), layer.sites.map(site => site.id));
    const [site] = layer.sites;
    assert.ok(site.size >= 0.9 && site.size <= 1.16);
    assert.match(site.seed, new RegExp(`^${zoneId}:`));
    assert.ok(Math.min(...sicyos.sites.map(other => (
      Math.hypot(site.x - other.x, site.z - other.z)
    ))) >= 5);
  }
});

test('wing-fruited Floreana daisies remain single, deterministic dry-transition shrubs', () => {
  for (const zoneId of ['COASTAL_SCRUBLAND', 'POST_SCRUB_RISE', 'NORTHERN_HIGHLANDS']) {
    const ecology = getEcology(zoneId);
    const layer = ecology.interactiveFlora.find(item => item.runtime === 'lecocarpus-pinnatifidus');
    assert.equal(layer.procedural, true);
    assert.equal(layer.speciesId, LECOCARPUS_PINNATIFIDUS_SPECIES.id);
    assert.equal(layer.sites.length, 1);
    assert.equal(layer.placementStats.generatedCount, 1);
    assert.equal(layer.placementStats.shortfallCount, 0);
    assert.deepEqual(getLecocarpusSites(zoneId).map(site => site.id), layer.sites.map(site => site.id));
    const [site] = layer.sites;
    assert.ok(site.size >= 0.84 && site.size <= 1.16);
    assert.ok(site.flowering >= 0.7 && site.flowering <= 0.96);
    assert.match(site.seed, new RegExp(`^${zoneId}:`));
  }
});

test('Northern Highlands ecology keeps crops and procedural detail out of its trail', () => {
  const ecology = buildNorthernHighlandsEcology();
  const grass = ecology.dryGrassPatches[0].items;
  const cormorantEdgeGrass = grass.filter(item => item.id.startsWith('northern-highlands-cormorant-edge-grass'));
  const cormorantEdgeHummocks = ecology.flora.find(layer => (
    layer.id === 'northern-highlands-cormorant-edge-hummocks'
  ));
  assert.equal(grass.length, 1560);
  assert.equal(cormorantEdgeGrass.length, 300);
  assert.ok(Math.min(...grass.map(item => item.z)) < -51.2);
  assert.ok(grass.filter(item => item.z < -42).length >= 280);
  assert.equal(cormorantEdgeHummocks.items.length, 26);
  assert.ok(northernHighlandsCormorantEcotone(0, -51) > 0.72);
  assert.equal(northernHighlandsCormorantEcotone(0, -25), 0);
  assert.equal(ecology.rocks.length, 64);
  assert.equal(ecology.crops.length, 1);
  assert.equal(ecology.crops[0].crop, 'sweetPotato');
  assert.ok(ecology.crops[0].items.length >= 60);
  assert.equal(ecology.proceduralFlora[0].items.length, 44);
  assert.equal(getNorthernHighlandsRockObstacles().every(item => item.zoneId === 'NORTHERN_HIGHLANDS'), true);

  for (const item of ecology.crops[0].items) {
    assert.ok(northernHighlandsGardenInfo(item.x, item.z).mask > 0.36);
    assert.ok(northernHighlandsPathInfo(item.x, item.z).path <= 0.16);
  }
  for (const item of ecology.proceduralFlora[0].items) {
    const path = northernHighlandsPathInfo(item.x, item.z);
    assert.ok(path.distance >= path.width * 1.72);
    assert.ok(northernHighlandsGardenInfo(item.x, item.z).mask < 0.05);
  }
  for (const item of [...cormorantEdgeGrass, ...cormorantEdgeHummocks.items]) {
    const path = northernHighlandsPathInfo(item.x, item.z);
    assert.ok(path.distance >= path.width * 1.08);
    assert.ok(northernHighlandsGardenInfo(item.x, item.z).mask < 0.05);
  }
});

test('Cormorant Bay uses El Mirador-style instanced grass off its lagoon and trail', () => {
  const ecology = buildCormorantBayEcology();
  const dryGrass = ecology.dryGrassPatches.flatMap(layer => layer.items);
  const saltgrass = ecology.flora.find(layer => layer.id.includes('lagoon-saltgrass'));
  const sesuvium = ecology.flora.find(layer => layer.id.includes('sesuvium-mats'));
  const saltbush = ecology.flora
    .filter(layer => layer.id.includes('saltbush-cryptocarpus'))
    .flatMap(layer => layer.items);

  assert.equal('groundCover' in ecology, false);
  assert.equal(ecology.dryGrassPatches.length, 1);
  assert.equal(dryGrass.length, 1800);
  assert.equal(saltgrass.items.length, 112);
  assert.equal(sesuvium.items.length, 32);
  assert.equal(saltbush.length, 60);
  assert.equal(dryGrass.every(item => cormorantTrailDistance(item.x, item.z) > 4.8), true);
  assert.equal(saltbush.every(item => (
    cormorantTrailDistance(item.x, item.z) > 7
      && cormorantLagoonField(item.x, item.z) > 1.6
  )), true);
});

test('sweet potato geometry reads as a dense heart-leaf vine within one shared mesh', () => {
  const geometry = buildSweetPotatoGeometry(0.34);
  const vertexCount = geometry.positions.length / 3;
  assert.equal(SWEET_POTATO_HEART_LEAF_COUNT, 13);
  assert.equal(geometry.colors.length, geometry.positions.length);
  assert.equal(geometry.damageThresholds.length, vertexCount);
  assert.equal(geometry.leafAnchors.length, geometry.positions.length);
  assert.ok(vertexCount > 1200 && vertexCount < 2400);
  assert.equal(geometry.positions.every(Number.isFinite), true);

  const xs = geometry.positions.filter((_, index) => index % 3 === 0);
  const ys = geometry.positions.filter((_, index) => index % 3 === 1);
  const zs = geometry.positions.filter((_, index) => index % 3 === 2);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.8);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.8);
  assert.ok(Math.max(...ys) > 0.22);
  const leafThresholds = new Set(
    geometry.damageThresholds.filter(value => value < 1).map(value => value.toFixed(3)),
  );
  assert.equal(leafThresholds.size, SWEET_POTATO_HEART_LEAF_COUNT);
});

test('crop impacts select the forward hammer swath and downward pellet ray', () => {
  const plants = [
    { x: 0, y: 0.15, z: 1, scale: 1 },
    { x: 0.42, y: 0.15, z: 1.24, scale: 1 },
    { x: 0, y: 0.15, z: -1, scale: 1 },
    { x: 1.8, y: 0.15, z: 1, scale: 1 },
  ];
  const hammerHits = findHammerCropHits(plants, {
    position: { x: 0, y: 0, z: 0 },
    facing: { x: 0, y: 0, z: 1 },
  });
  assert.deepEqual(hammerHits.map(hit => hit.index), [0, 1]);

  const shotgunHits = findShotgunCropHits(plants, {
    origin: { x: 0, y: 1, z: 0 },
    dir: { x: 0, y: -0.85, z: 1 },
    range: 3,
    rayRadius: 0.2,
    plantRadius: 0.2,
  });
  assert.equal(shotgunHits[0].index, 0);
  assert.ok(shotgunHits[0].directness > 0.7);
  assert.equal(shotgunHits.some(hit => hit.index === 2 || hit.index === 3), false);
});

test('crop damage persists its strongest bruising and permanent lodged state', () => {
  const shot = mergeCropDamageState(null, {
    damage: 0.64,
    bendX: 1.2,
    bendZ: 0,
    source: 'shotgun',
  });
  const trampled = mergeCropDamageState(shot, {
    damage: 0.78,
    bendX: 0,
    bendZ: -1.4,
    crushed: true,
    source: 'trample',
  });
  const weakerReload = mergeCropDamageState(trampled, {
    damage: 0.2,
    bendX: 0,
    bendZ: 0,
    source: 'reload',
  });
  assert.equal(trampled.damage, 0.78);
  assert.equal(trampled.crushed, true);
  assert.ok(trampled.bendZ < -1.3);
  assert.equal(weakerReload.damage, 0.78);
  assert.equal(weakerReload.crushed, true);
});

test('post office bay procedural ecology forms a coastal-to-inland flora gradient', () => {
  const ecology = buildPostOfficeBayEcology();
  const croton = ecology.proceduralFlora.find(layer => layer.speciesId === CROTON_SCOULERI_SPECIES.id);
  const darwiniothamnus = ecology.proceduralFlora.find(layer => layer.speciesId === DARWINIOTHAMNUS_SPECIES.id);
  const pricklyPear = ecology.interactiveFlora.find(layer => layer.speciesId === OPUNTIA_MEGASPERMA_SPECIES.id);
  const authoredCacti = ecology.flora
    .filter(layer => layer.id === 'opuntia' || layer.id === 'post-office-bay-candelabra-cactus')
    .flatMap(layer => layer.items);

  assert.equal(ecology.flora.length, 3);
  assert.equal(croton.items.length, 72);
  assert.equal(croton.placementStats.generatedPatchCount, 8);
  assert.equal(darwiniothamnus.items.length, 54);
  assert.equal(darwiniothamnus.placementStats.generatedPatchCount, 6);
  assert.equal(new Set(darwiniothamnus.items.map(item => item.variantIndex)).size, 9);
  assert.equal(pricklyPear.sites.length, 6);
  assert.equal(pricklyPear.placementStats.generatedPatchCount, 2);

  const shoreDistance = item => item.z - postOfficeBayCoastZ(item.x);
  const meanShoreDistance = items => (
    items.reduce((total, item) => total + shoreDistance(item), 0) / items.length
  );
  assert.ok(croton.items.some(item => shoreDistance(item) < 40));
  assert.ok(darwiniothamnus.items.some(item => shoreDistance(item) < 40));
  assert.ok(meanShoreDistance(croton.items) < meanShoreDistance(darwiniothamnus.items));
  assert.ok(darwiniothamnus.items.filter(item => shoreDistance(item) >= 40).length > 40);

  for (const item of [...croton.items, ...darwiniothamnus.items]) {
    const path = postOfficePathInfo(item.x, item.z);
    const clearingDistance = Math.hypot(
      item.x - POST_OFFICE_BAY_BARREL_CLEARING.x,
      item.z - POST_OFFICE_BAY_BARREL_CLEARING.z,
    );
    assert.ok(shoreDistance(item) >= 10);
    assert.ok(coveWaterMask(item.x, item.z) <= 0.1);
    assert.ok(postOfficeLandingBeachMask(item.x, item.z) <= 0.1);
    assert.ok(path.distance >= path.width * 1.72);
    assert.ok(clearingDistance >= POST_OFFICE_BAY_BARREL_CLEARING.radius * 1.45);
  }

  const resolvedPricklyPearSites = getPricklyPearSites('POST_OFFICE_BAY');
  assert.equal(resolvedPricklyPearSites.length, 10);
  assert.deepEqual(
    resolvedPricklyPearSites.slice(-pricklyPear.sites.length).map(site => site.id),
    pricklyPear.sites.map(site => site.id),
  );
  for (let index = 0; index < pricklyPear.sites.length; index += 1) {
    const site = pricklyPear.sites[index];
    const path = postOfficePathInfo(site.x, site.z);
    const authoredDistance = Math.min(...authoredCacti.map(item => (
      Math.hypot(site.x - item.x, site.z - item.z)
    )));
    assert.ok(shoreDistance(site) >= 25);
    assert.ok(path.distance >= path.width * 2.05);
    assert.ok(authoredDistance >= 5);
    for (const other of pricklyPear.sites.slice(index + 1)) {
      assert.ok(Math.hypot(site.x - other.x, site.z - other.z) >= 5);
    }
  }
});

test('procedural Opuntia overlays mix mature trees with nearby breakable juveniles', () => {
  const ecologies = [
    buildNorthShoreEcology(),
    buildPostScrubRiseEcology(),
    buildPostOfficeBayEcology(),
  ];
  for (const ecology of ecologies) {
    const young = ecology.interactiveFlora.find(layer => (
      layer.speciesId === OPUNTIA_MEGASPERMA_SPECIES.id
    ));
    const mature = ecology.proceduralFlora.find(layer => layer.id.includes('mature-opuntia'));
    assert.ok(young, `${ecology.zoneId} has interactive juvenile Opuntia`);
    assert.ok(mature, `${ecology.zoneId} has mature Opuntia`);
    assert.equal(mature.speciesId, OPUNTIA_MEGASPERMA_SPECIES.id);
    assert.equal(mature.items.length, 4);
    assert.match(mature.path, /runtime-big-opuntia\.glb$/);
    for (const item of mature.items) {
      const juvenileDistance = Math.min(...young.sites.map(site => (
        Math.hypot(item.x - site.x, item.z - site.z)
      )));
      assert.ok(item.scale >= 3.1 && item.scale <= 5.4);
      assert.ok(juvenileDistance >= 4.5 && juvenileDistance <= 18);
    }
  }
});

test('lava cactus ecology feeds the destructible runtime across exposed volcanic maps', () => {
  const expected = {
    LAVA_FLATS: { procedural: 12, resolved: 12, patches: 4 },
    POST_SCRUB_RISE: { procedural: 5, resolved: 6, patches: 2 },
    N_OUTCROP: { procedural: 5, resolved: 5, patches: 2 },
    E_MID: { procedural: 4, resolved: 4, patches: 2 },
  };

  for (const [zoneId, counts] of Object.entries(expected)) {
    const ecology = getEcology(zoneId);
    const layer = ecology.interactiveFlora.find(item => (
      item.runtime === 'lava-cactus'
      && item.speciesId === LAVA_CACTUS_SPECIES.id
    ));
    const resolved = getLavaCactusSites(zoneId);
    assert.ok(layer, `${zoneId} has a lava-cactus interaction layer`);
    assert.equal(layer.sites.length, counts.procedural);
    assert.equal(layer.placementStats.generatedPatchCount, counts.patches);
    assert.equal(resolved.length, counts.resolved);
    assert.equal(new Set(resolved.map(site => site.id)).size, counts.resolved);
    assert.ok(getThreeSpecimens(zoneId).some(specimen => specimen.id === 'cactus'));
    for (const site of resolved) {
      assert.ok(site.size >= 0.9 && site.size <= 1.65);
      assert.ok(site.flowerCount >= 0 && site.flowerCount <= 2);
    }
  }

  for (const site of getLavaCactusSites('LAVA_FLATS')) {
    const path = lavaFlatsPathInfo(site.x, site.z);
    assert.ok(path.distance >= path.width * 1.85);
    assert.ok(lavaFlatsPioneerMask(site.x, site.z) <= 0.76);
    assert.ok(lavaFlatsTubeMasks(site.x, site.z).bowl <= 0.5);
  }
  for (const site of getLavaCactusSites('POST_SCRUB_RISE').slice(1)) {
    const path = scrubRisePathInfo(site.x, site.z);
    assert.ok(path.distance >= path.width * 1.85);
    assert.ok(scrubRiseWashMask(site.x, site.z) <= 0.32);
    assert.ok(scrubRiseThicketStrength(site.x, site.z) <= 0.46);
    assert.ok(scrubRiseBasaltExposure(site.x, site.z) >= 0.48);
  }
  for (const site of getLavaCactusSites('N_OUTCROP')) {
    assert.ok(desolateOutcropDryMask(site.x, site.z) >= 0.3);
    assert.ok(desolateOutcropGuanoMask(site.x, site.z) <= 0.18);
    assert.ok(desolateOutcropTideShelfMask(site.x, site.z) <= 0.3);
    assert.ok(desolateOutcropTidepoolMask(site.x, site.z) <= 0.16);
  }
  for (const site of getLavaCactusSites('E_MID')) {
    const path = rockyClearingPathInfo(site.x, site.z);
    assert.ok(path.distance >= path.width * 1.8);
    assert.ok(rockyClearingCaveThresholdMask(site.x, site.z) <= 0.3);
    assert.ok(rockyClearingRubbleMask(site.x, site.z) >= 0.32);
  }

  assert.equal(getLavaCactusSites('NORTHERN_HIGHLANDS').length, 16);
  assert.equal(getLavaCactusSites('POST_OFFICE_BAY_3').length, 1);
  assert.equal(getLavaCactusSites('COASTAL_SCRUBLAND').length, 3);
});

test('resurrection fern overlays stay in sheltered humid habitat', () => {
  const highlands = buildWesternHighlandsEcology().proceduralFlora.find(layer => (
    layer.speciesId === PLEOPELTIS_POLYPODIOIDES_SPECIES.id
  ));
  const watkins = buildWatkinsCampEcology().proceduralFlora.find(layer => (
    layer.speciesId === PLEOPELTIS_POLYPODIOIDES_SPECIES.id
  ));
  assert.equal(highlands.items.length, 64);
  assert.equal(highlands.placementStats.generatedPatchCount, 8);
  assert.equal(watkins.items.length, 28);
  assert.equal(watkins.placementStats.generatedPatchCount, 4);
  for (const item of highlands.items) {
    assert.ok(westernHighlandsTrailInfluence(item.x, item.z, 1.2, 5.4) <= 0.34);
    assert.ok(item.scale >= 0.48 && item.scale <= 1.02);
  }
  for (const item of watkins.items) {
    assert.ok(watkinsRiverInfo(item.x, item.z).water <= 0.08);
    assert.ok(watkinsPathInfo(item.x, item.z).d >= 3.2);
    assert.ok(item.scale >= 0.48 && item.scale <= 1.02);
  }
});

test('weather band weights only reference authored weather states', () => {
  for (const [band, weights] of Object.entries(WEATHER_BAND_WEIGHTS)) {
    assert.ok(Object.keys(weights).length > 0, `${band} has weights`);
    for (const [state, weight] of Object.entries(weights)) {
      assert.ok(WEATHER_STATES[state], `${band} references ${state}`);
      assert.equal(typeof weight, 'number', `${band}.${state} is numeric`);
      assert.ok(weight >= 0, `${band}.${state} is non-negative`);
    }
  }
});

test('location weather metadata normalizes cleanly', () => {
  for (const location of locations) {
    if (!location.narration?.weather) continue;
    const normalized = normalizeWeatherState(location.narration.weather, null);
    assert.ok(normalized && WEATHER_STATES[normalized], `${location.id} weather is valid`);
  }
});

test('penal colony starts inland and no longer pins garua mist', () => {
  const penalColony = regionMaps.PENAL_COLONY;
  assert.equal(getRegionClimateBand('PENAL_COLONY'), 'inland');
  assert.equal(penalColony.narration.weatherAuthored, true);
  assert.equal(normalizeWeatherState(penalColony.narration.weather), 'cloudy');

  const initialWeather = getRegionWeather('PENAL_COLONY', 1440 + 8 * 60);
  assert.equal(initialWeather, 'cloudy');
  assert.ok(!['misty', 'garua', 'denseGarua'].includes(initialWeather));
});

test('Beagle cabin blueprint defines a large navigable indoor region', () => {
  const definition = getInteriorDefinition('BEAGLE_CABIN');
  const navigation = definition.blueprint.navigation;
  const [spawnX, , spawnZ] = navigation.defaultSpawn;

  assert.equal(regionMaps.BEAGLE_CABIN.type, 'shipInterior');
  assert.ok(definition.blueprint.dimensions.width >= 18);
  assert.ok(definition.blueprint.dimensions.depth >= 23);
  assert.equal(beagleCabinRegion.terrain.isWalkable(spawnX, spawnZ), true);
  assert.equal(beagleCabinRegion.terrain.isWalkable(0, -10), true);
  assert.equal(beagleCabinRegion.terrain.isWalkable(9, 0), false);
  assert.ok(definition.blueprint.fixedColliders.length >= 20);
  assert.ok(getInteriorPropSpawns('BEAGLE_CABIN').length >= 10);
});

test('Beagle cabin doorway transition does not immediately catch the arrival spawn', () => {
  const transition = getLocalTransitions('BEAGLE_CABIN')[0];
  const [spawnX, , spawnZ] = beagleCabinRegion.terrain.entrySpawns['from-deck'];
  const arrivalDistance = Math.hypot(transition.position.x - spawnX, transition.position.z - spawnZ);
  assert.ok(arrivalDistance > transition.radius);

  const prompt = nearestLocalTransitionPrompt(
    'BEAGLE_CABIN',
    { x: 0, z: 10.1 },
    { x: 0, z: 1 },
  );
  assert.equal(prompt.toRegionId, 'BEAGLE');
  assert.equal(prompt.entryEdge, 'from-cabin');
});

test('Beagle deck exposes a generous cabin entrance and a nearby island-chart destination', () => {
  const deckEntrance = getLocalTransitions('BEAGLE').find(item => item.toRegionId === 'BEAGLE_CABIN');
  assert.ok(deckEntrance.radius >= 4.5);
  assert.equal(deckEntrance.label, 'Open the aft-cabin doors');

  const shipMarker = getIslandMapLocation('BEAGLE');
  const cabinMarker = getIslandMapLocation('BEAGLE_CABIN');
  assert.equal(cabinMarker.kind, 'shipInterior');
  assert.equal(cabinMarker.status, 'available');
  assert.ok(Math.hypot(cabinMarker.at.x - shipMarker.at.x, cabinMarker.at.y - shipMarker.at.y) < 0.05);
});

test('offshore Beagle sightlines preserve a consistent coastal landmark bearing', () => {
  const postOffice = getBeagleSightline('POST_OFFICE_BAY');
  const northShore = getBeagleSightline('N_SHORE');
  const northwestReef = getBeagleSightline('NW_REEF');

  assert.ok(postOffice.position[0] > 0 && postOffice.position[2] < 0);
  assert.equal(postOffice.interactive, true);
  assert.ok(northShore.position[0] < 0 && northShore.position[2] < 0);
  assert.equal(northShore.interactive, false);
  assert.ok(northwestReef.position[0] > 0 && northwestReef.position[2] < 0);
  assert.ok(Math.hypot(northwestReef.position[0], northwestReef.position[2]) > Math.hypot(postOffice.position[0], postOffice.position[2]));
  assert.equal(northwestReef.interactive, false);
});

test('Lawson house blueprint preserves a spacious four-room plan at human furniture scale', () => {
  const definition = getInteriorDefinition('LAWSON_HOUSE');
  const blueprint = definition.blueprint;
  const [spawnX, , spawnZ] = blueprint.navigation.defaultSpawn;

  assert.equal(regionMaps.LAWSON_HOUSE.type, 'houseInterior');
  assert.ok(blueprint.dimensions.width >= 16);
  assert.ok(blueprint.dimensions.depth >= 14);
  assert.equal(blueprint.rooms.length, 4);
  assert.equal(blueprint.rooms.filter(room => room.available).length, 3);
  assert.equal(blueprint.fixedColliders.filter(item => item.id.startsWith('office-divider')).length, 2);
  assert.equal(lawsonHouseRegion.terrain.isWalkable(spawnX, spawnZ), true);
  assert.ok(blueprint.fixedColliders.length >= 14);
  assert.ok(getInteriorPropSpawns('LAWSON_HOUSE').length >= 10);
});

test('Lawson house transitions connect the authored doorway without catching arrival', () => {
  const exterior = getLocalTransitions('PENAL_COLONY').find(item => item.toRegionId === 'LAWSON_HOUSE');
  const interior = getLocalTransitions('LAWSON_HOUSE')[0];
  const [spawnX, , spawnZ] = lawsonHouseRegion.terrain.entrySpawns['from-yard'];
  const arrivalDistance = Math.hypot(interior.position.x - spawnX, interior.position.z - spawnZ);

  assert.equal(exterior.label, "Enter Lawson's house");
  assert.ok(exterior.radius >= 3);
  assert.ok(arrivalDistance > interior.radius);
  assert.equal(interior.toRegionId, 'PENAL_COLONY');
  assert.equal(interior.entryEdge, 'from-lawson-house');

  const penalMarker = getIslandMapLocation('PENAL_COLONY');
  const houseMarker = getIslandMapLocation('LAWSON_HOUSE');
  assert.equal(houseMarker.kind, 'houseInterior');
  assert.ok(Math.hypot(houseMarker.at.x - penalMarker.at.x, houseMarker.at.y - penalMarker.at.y) < 0.04);
});

test('Floreana sun crosses an east-to-west near-equatorial arc', () => {
  const sunrise = sunDirection(6, 1);
  const noon = sunDirection(12, 1);
  const sunset = sunDirection(18, 1);

  assert.ok(sunrise[0] > 0.98, 'sunrise should be in the eastern sky');
  assert.ok(Math.abs(sunrise[1]) < 0.02, 'sunrise should sit close to the horizon');
  assert.ok(noon[1] > 0.99, 'September noon sun should pass nearly overhead at Floreana');
  assert.ok(sunset[0] < -0.98, 'sunset should be in the western sky');
  assert.ok(Math.abs(sunset[1]) < 0.02, 'sunset should sit close to the horizon');
});

test('twilight reveals bright stars before faint stars and the Milky Way', () => {
  const horizon = skyState(18, 1);
  const civilTwilight = skyState(18.25, 1);
  const nauticalTwilight = skyState(18.5, 1);
  const darkSky = skyState(19, 1);
  const astronomicalDark = skyState(19.25, 1);

  assert.ok(horizon.brightStars < civilTwilight.brightStars);
  assert.equal(civilTwilight.faintStars, 0);
  assert.ok(nauticalTwilight.brightStars > 0.95);
  assert.ok(nauticalTwilight.faintStars > 0 && nauticalTwilight.faintStars < 0.5);
  assert.ok(darkSky.faintStars > 0.95);
  assert.ok(darkSky.milkyWay > 0.85);
  assert.ok(astronomicalDark.astronomicalNight > 0.95);
});

test('gameplay moon rises around 8 PM, remains overnight, and only lights from above the horizon', () => {
  const phase = moonPhase(1);
  const beforeRise = skyState(19, 1);
  const moonrise = moonDirection(20, 1);
  const lateEvening = skyState(22.75, 1);
  const overnight = skyState(2, 1);
  const afterSet = skyState(9, 1);

  assert.equal(phase.waxing, false);
  assert.ok(phase.fraction > 0.32 && phase.fraction < 0.39);
  assert.equal(phase.riseHour, 20);
  assert.equal(phase.setHour, 8);
  assert.ok(beforeRise.moon[1] < 0);
  assert.equal(beforeRise.moonlight, 0);
  assert.ok(Math.abs(moonrise[1]) < 0.08);
  assert.ok(lateEvening.moonAltitude > 30);
  assert.ok(lateEvening.moonlight > 0.35);
  assert.ok(overnight.moonAltitude > 80);
  assert.ok(afterSet.moon[1] < 0);
  assert.equal(afterSet.moonlight, 0);
});

test('star sphere advances on a sidereal rather than solar clock', () => {
  const sixHours = siderealAngle(6, 1) - siderealAngle(0, 1);
  const nextSolarMidnight = siderealAngle(0, 2) - siderealAngle(0, 1);

  assert.ok(sixHours > Math.PI / 2 && sixHours < Math.PI / 2 + 0.02);
  assert.ok(nextSolarMidnight > 0.015 && nextSolarMidnight < 0.02);
});

let failed = false;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed = true;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed) process.exit(1);

console.log(`Regression tests passed: ${tests.length}`);
