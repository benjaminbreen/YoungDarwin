const ROOT = '/assets/audio/post-office-bay';

export const POST_OFFICE_BAY_AUDIO = Object.freeze({
  surf: `${ROOT}/shore-surf.ogg`,
  wind: `${ROOT}/shore-wind.ogg`,
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
  POST_OFFICE_BAY_AUDIO.gritSteps.url,
  POST_OFFICE_BAY_AUDIO.sandSteps.url,
  POST_OFFICE_BAY_AUDIO.waterSteps.url,
]);

const ISLAND_AMBIENCE_ROOT = '/assets/audio/island-ambience';

export const ISLAND_AMBIENCE_AUDIO = Object.freeze({
  surf: POST_OFFICE_BAY_AUDIO.surf,
  wind: POST_OFFICE_BAY_AUDIO.wind,
  rain: `${ISLAND_AMBIENCE_ROOT}/rain-on-foliage.ogg`,
  insects: `${ISLAND_AMBIENCE_ROOT}/dry-insects.ogg`,
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
  rockTakeoff: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/jump-rock-takeoff.wav`, variants: 6, slotDuration: 0.34 }),
  rockLanding: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/jump-rock-land.wav`, variants: 6, slotDuration: 0.5 }),
  gull: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/call-gull.wav`, variants: 6, slotDuration: 0.82 }),
  finch: Object.freeze({ url: `${MOVEMENT_WILDLIFE_ROOT}/call-passerine.wav`, variants: 4, slotDuration: 0.5 }),
  bee: `${MOVEMENT_WILDLIFE_ROOT}/buzz-bee.ogg`,
});

export const MOVEMENT_WILDLIFE_AUDIO_URLS = Object.freeze(
  Object.values(MOVEMENT_WILDLIFE_AUDIO).map(asset => asset?.url || asset),
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
