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
} = loadModule('three-game/ui/expedition/map/islandLocations.js');
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
  assert.ok(Math.hypot(cabinMarker.at.x - shipMarker.at.x, cabinMarker.at.y - shipMarker.at.y) < 0.04);
});

test('Lawson house blueprint preserves a spacious four-room plan at human furniture scale', () => {
  const definition = getInteriorDefinition('LAWSON_HOUSE');
  const blueprint = definition.blueprint;
  const [spawnX, , spawnZ] = blueprint.navigation.defaultSpawn;

  assert.equal(regionMaps.LAWSON_HOUSE.type, 'houseInterior');
  assert.ok(blueprint.dimensions.width >= 16);
  assert.ok(blueprint.dimensions.depth >= 14);
  assert.equal(blueprint.rooms.length, 4);
  assert.equal(blueprint.rooms.filter(room => room.available).length, 1);
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
