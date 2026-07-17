import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const projectRequire = createRequire(import.meta.url);
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
  computeAssistedPushVelocity,
  mobilityVelocityCaps,
} = loadModule('three-game/physics/objectMobility.js');
const {
  carryGripForProp,
  carryPlacementCandidates,
  propHorizontalRadius,
} = loadModule('three-game/components/player/carryProfiles.js');
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
} = loadModule('three-game/world/obstacles.js');
const {
  createCollisionAdapter,
} = loadModule('three-game/physics/collisionAdapter.js');
const {
  createLazyAnimationActions,
} = loadModule('three-game/components/assets/lazyAnimationActions.js');
const {
  resolveTerrainSegments,
  terrainGeometryStats,
} = loadModule('three-game/world/terrainGeometry.js');
const {
  locations,
} = loadModule('data/locations.js');
const {
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
  POST_OFFICE_NORTH_SHORE_SEAM,
  POST_OFFICE_SCRUB_RISE_SEAM,
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
  getZone: getRuntimeZone,
} = loadModule('three-game/world/floreanaZones.js');
const {
  getBeagleSightline,
} = loadModule('three-game/world/beagleSightlines.js');
const {
  floraPreferenceSuitability,
  scoreFloraHabitat,
} = loadModule('three-game/world/ecology/proceduralFlora.js');
const {
  CROTON_SCOULERI_SPECIES,
  DARWINIOTHAMNUS_SPECIES,
  OPUNTIA_MEGASPERMA_SPECIES,
} = loadModule('three-game/world/ecology/floraSpecies.js');
const {
  getPricklyPearSites,
} = loadModule('three-game/physics/props/pricklyPear/pricklyPearSites.js');
const {
  buildPenalColonyEcology,
} = loadModule('three-game/world/ecology/penalColony.js');
const {
  penalColonyGardenInfo,
  penalColonyPathInfo,
  penalColonyTrampledMask,
} = loadModule('three-game/world/regions/penalColony/path.js');
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

test('the narrator end-game command is explicit and deterministic', () => {
  assert.equal(isEndGameNarratorCommand('end game'), true);
  assert.equal(isEndGameNarratorCommand('  END GAME.  '), true);
  assert.equal(isEndGameNarratorCommand('end the expedition'), true);
  assert.equal(isEndGameNarratorCommand('when does the game end?'), false);
  assert.equal(isEndGameNarratorCommand('end game after I collect this'), false);
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

test('mobility push assistance caps vector speed for heavy props', () => {
  const next = computeAssistedPushVelocity({
    velocity: { x: 5, y: 0.25, z: 5 },
    direction: { x: 1, z: 1 },
    mobility: {
      mode: 'pickup-push',
      assistSpeed: 0.22,
      contactMaxSpeed: 0.42,
      blend: 0.1,
    },
  });

  assert.ok(Math.hypot(next.x, next.z) <= 0.420001);
  assert.equal(next.y, 0.25);
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

test('campaign stools use a responsive one-hand skeletal grip at authored scale', () => {
  const stool = PROP_TYPES.lawsonCampaignStool;
  const grip = carryGripForProp(stool);
  assert.equal(grip.mode, 'rightHand');
  assert.equal(grip.animationStyle, 'freeHand');
  assert.deepEqual(grip.offset, [0.13, 0, 0.02]);
  assert.equal(grip.scale, 1);
  assert.ok(propHorizontalRadius(stool) > 0.4);
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
  assert.ok(Math.abs(first.position.y - (1.5 + first.position.x * 0.01 + first.position.z * 0.005 + 0.335)) < 0.000001);
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
