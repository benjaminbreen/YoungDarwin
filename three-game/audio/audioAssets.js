const ROOT = '/assets/audio/post-office-bay';

export const POST_OFFICE_BAY_AUDIO = Object.freeze({
  surf: `${ROOT}/shore-surf.mp3`,
  wind: `${ROOT}/shore-wind.mp3`,
  waveBreak: Object.freeze({
    url: `${ROOT}/wave-break.wav`,
    variants: 6,
    slotDuration: 3.2,
  }),
  gritSteps: Object.freeze({
    url: `${ROOT}/step-grit.wav`,
    variants: 10,
    slotDuration: 0.52,
  }),
  sandSteps: Object.freeze({
    url: `${ROOT}/step-sand.wav`,
    variants: 10,
    slotDuration: 0.56,
  }),
  waterSteps: Object.freeze({
    url: `${ROOT}/step-water.wav`,
    variants: 10,
    slotDuration: 0.66,
  }),
});

export const POST_OFFICE_BAY_AUDIO_URLS = Object.freeze([
  POST_OFFICE_BAY_AUDIO.surf,
  POST_OFFICE_BAY_AUDIO.wind,
  POST_OFFICE_BAY_AUDIO.waveBreak.url,
  POST_OFFICE_BAY_AUDIO.gritSteps.url,
  POST_OFFICE_BAY_AUDIO.sandSteps.url,
  POST_OFFICE_BAY_AUDIO.waterSteps.url,
]);

const ISLAND_AMBIENCE_ROOT = '/assets/audio/island-ambience';

export const ISLAND_AMBIENCE_AUDIO = Object.freeze({
  surf: POST_OFFICE_BAY_AUDIO.surf,
  wind: POST_OFFICE_BAY_AUDIO.wind,
  rain: `${ISLAND_AMBIENCE_ROOT}/rain-on-foliage.mp3`,
  insects: `${ISLAND_AMBIENCE_ROOT}/dry-insects.mp3`,
});

const INTERACTION_ROOT = '/assets/audio/interactions';

export const INTERACTION_AUDIO = Object.freeze({
  wood: Object.freeze({ url: `${INTERACTION_ROOT}/impact-wood.wav`, variants: 6, slotDuration: 0.56 }),
  stone: Object.freeze({ url: `${INTERACTION_ROOT}/impact-stone.wav`, variants: 8, slotDuration: 0.4 }),
  metal: Object.freeze({ url: `${INTERACTION_ROOT}/impact-metal.wav`, variants: 8, slotDuration: 0.58 }),
  ceramic: Object.freeze({ url: `${INTERACTION_ROOT}/impact-ceramic.wav`, variants: 6, slotDuration: 0.56 }),
  grass: Object.freeze({ url: `${INTERACTION_ROOT}/rustle-grass.wav`, variants: 6, slotDuration: 0.76 }),
  shrub: Object.freeze({ url: `${INTERACTION_ROOT}/rustle-shrub.wav`, variants: 6, slotDuration: 0.7 }),
});

export const INTERACTION_AUDIO_URLS = Object.freeze(
  Object.values(INTERACTION_AUDIO).map(sprite => sprite.url),
);

const MOVEMENT_WILDLIFE_ROOT = '/assets/audio/movement-wildlife';

export const MOVEMENT_WILDLIFE_AUDIO = Object.freeze({
  rockStep: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/step-rock.wav`, variants: 10, slotDuration: 0.44 }),
  woodStep: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/step-wood.wav`, variants: 10, slotDuration: 0.5 }),
  mudStep: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/step-mud.wav`, variants: 10, slotDuration: 0.62 }),
  litterStep: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/step-litter.wav`, variants: 10, slotDuration: 0.56 }),
  rockTakeoff: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/jump-rock-takeoff.wav`, variants: 6, slotDuration: 0.34 }),
  rockLanding: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/jump-rock-land.wav`, variants: 6, slotDuration: 0.5 }),
  shotgunReport: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/shotgun-report.wav`, variants: 6, slotDuration: 0.82 }),
  shotgunReload: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/shotgun-reload.wav`, variants: 1, slotDuration: 2.03 }),
  finchWing: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/finch-wingbeat.wav`, variants: 6, slotDuration: 0.72 }),
  tortoiseStep: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/tortoise-step.wav`, variants: 8, slotDuration: 0.7 }),
  gull: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/call-gull.wav`, variants: 6, slotDuration: 0.82 }),
  finch: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/call-passerine.wav`, variants: 4, slotDuration: 0.5 }),
  bee: `${MOVEMENT_WILDLIFE_ROOT}/buzz-bee.mp3`,
});

export const MOVEMENT_WILDLIFE_AUDIO_URLS = Object.freeze(
  Object.values(MOVEMENT_WILDLIFE_AUDIO).map(asset => asset?.url || asset),
);

const WILDLIFE_FIELDWORK_ROOT = '/assets/audio/wildlife-fieldwork';

export const WILDLIFE_FIELDWORK_AUDIO = Object.freeze({
  dove: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/call-dove.wav`, variants: 5, slotDuration: 2 }),
  hawk: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/call-hawk.wav`, variants: 4, slotDuration: 1.3 }),
  mockingbird: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/call-mockingbird.wav`, variants: 8, slotDuration: 1.25 }),
  owl: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/call-owl.wav`, variants: 8, slotDuration: 0.72 }),
  thunder: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/thunder.wav`, variants: 3, slotDuration: 5.5 }),
  fieldNote: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/field-note.wav`, variants: 4, slotDuration: 1.44 }),
  specimenContainer: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/specimen-container.wav`, variants: 8, slotDuration: 0.9 }),
  snareRope: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/snare-rope.wav`, variants: 5, slotDuration: 1.1 }),
  door: Object.freeze({ url: `${WILDLIFE_FIELDWORK_ROOT}/door-creak.wav`, variants: 1, slotDuration: 1.2 }),
});

export const WILDLIFE_FIELDWORK_AUDIO_URLS = Object.freeze(
  Object.values(WILDLIFE_FIELDWORK_AUDIO).map(sprite => sprite.url),
);

const DARWIN_BODY_ROOT = '/assets/audio/darwin-body';

export const DARWIN_BODY_AUDIO = Object.freeze({
  pain: Object.freeze({ url: `${DARWIN_BODY_ROOT}/pain-reaction.wav`, variants: 8, slotDuration: 0.82 }),
  collapse: Object.freeze({ url: `${DARWIN_BODY_ROOT}/collapse-exhale.wav`, variants: 3, slotDuration: 1.1 }),
  breath: Object.freeze({ url: `${DARWIN_BODY_ROOT}/winded-breath.wav`, variants: 11, slotDuration: 0.9 }),
  bodyImpact: Object.freeze({ url: `${DARWIN_BODY_ROOT}/hard-fall-body.wav`, variants: 1, slotDuration: 1.42 }),
  gear: Object.freeze({ url: `${DARWIN_BODY_ROOT}/clothing-gear.wav`, variants: 8, slotDuration: 0.62 }),
});

export const DARWIN_BODY_AUDIO_URLS = Object.freeze(
  Object.values(DARWIN_BODY_AUDIO).map(sprite => sprite.url),
);

const CONTEXTUAL_WORLD_ROOT = '/assets/audio/contextual-world';

export const CONTEXTUAL_WORLD_AUDIO = Object.freeze({
  crabScuttle: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/crab-scuttle.wav`, variants: 4, slotDuration: 0.62 }),
  iguanaClaws: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/iguana-claws.wav`, variants: 4, slotDuration: 0.54 }),
  goatHoof: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/goat-hoof.wav`, variants: 8, slotDuration: 0.38 }),
  horseHoof: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/horse-hoof.wav`, variants: 10, slotDuration: 0.48 }),
  goatBleat: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/goat-bleat.wav`, variants: 3, slotDuration: 1.5 }),
  settlementWork: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/settlement-work.wav`, variants: 10, slotDuration: 0.8 }),
  leatherHandling: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/leather-handling.wav`, variants: 8, slotDuration: 0.75 }),
  waterDrop: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/water-drop.wav`, variants: 8, slotDuration: 0.55 }),
  rockTumble: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/rock-tumble.wav`, variants: 4, slotDuration: 1.25 }),
  dryBranch: Object.freeze({ url: `${CONTEXTUAL_WORLD_ROOT}/dry-branch.wav`, variants: 6, slotDuration: 1.2 }),
});

export const CONTEXTUAL_WORLD_AUDIO_URLS = Object.freeze(
  Object.values(CONTEXTUAL_WORLD_AUDIO).map(sprite => sprite.url),
);
