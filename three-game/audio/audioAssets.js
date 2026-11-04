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

export const TOOL_FOLEY_AUDIO = Object.freeze({
  hammerSwing: Object.freeze({ url: `${INTERACTION_ROOT}/swing-hammer.wav`, variants: 4, slotDuration: 0.72 }),
  netSwing: Object.freeze({ url: `${INTERACTION_ROOT}/swing-net.wav`, variants: 4, slotDuration: 0.72 }),
  netContact: Object.freeze({ url: `${INTERACTION_ROOT}/contact-net.wav`, variants: 6, slotDuration: 0.54 }),
});

export const TOOL_FOLEY_AUDIO_URLS = Object.freeze(
  Object.values(TOOL_FOLEY_AUDIO).map(sprite => sprite.url),
);

// Modelled hammer strikes (scripts/build-hammer-audio.mjs). The rock keys are
// the rockSampling hammer materials, so a struck boulder is heard as its own
// geology; the rest cover the timber and plants the hammer also meets.
const HAMMER_ROOT = '/assets/audio/hammer';

export const HAMMER_STRIKE_AUDIO = Object.freeze({
  basalt: Object.freeze({ url: `${HAMMER_ROOT}/strike-basalt.wav`, variants: 8, slotDuration: 0.7 }),
  scoria: Object.freeze({ url: `${HAMMER_ROOT}/strike-scoria.wav`, variants: 8, slotDuration: 0.62 }),
  tuff: Object.freeze({ url: `${HAMMER_ROOT}/strike-tuff.wav`, variants: 8, slotDuration: 0.7 }),
  olivine: Object.freeze({ url: `${HAMMER_ROOT}/strike-olivine.wav`, variants: 8, slotDuration: 0.66 }),
  coral_limestone: Object.freeze({ url: `${HAMMER_ROOT}/strike-coral-limestone.wav`, variants: 8, slotDuration: 0.56 }),
  iron_crust: Object.freeze({ url: `${HAMMER_ROOT}/strike-iron-crust.wav`, variants: 8, slotDuration: 0.66 }),
  split: Object.freeze({ url: `${HAMMER_ROOT}/strike-split.wav`, variants: 3, slotDuration: 1.4 }),
  wood: Object.freeze({ url: `${HAMMER_ROOT}/strike-wood.wav`, variants: 6, slotDuration: 0.5 }),
  succulent: Object.freeze({ url: `${HAMMER_ROOT}/strike-succulent.wav`, variants: 6, slotDuration: 0.56 }),
  herb: Object.freeze({ url: `${HAMMER_ROOT}/strike-herb.wav`, variants: 6, slotDuration: 0.48 }),
  strain: Object.freeze({ url: `${HAMMER_ROOT}/strike-strain.wav`, variants: 4, slotDuration: 0.9 }),
});

export const HAMMER_STRIKE_AUDIO_URLS = Object.freeze(
  Object.values(HAMMER_STRIKE_AUDIO).map(sprite => sprite.url),
);

// Modelled field Foley (scripts/build-field-foley-audio.mjs): the clasp
// knife, shotgun pellets landing, stowing specimens, a hammer chip striking
// Darwin's coat, and the coat itself in the wind (a loop).
const KNIFE_ROOT = '/assets/audio/knife';
const PELLETS_ROOT = '/assets/audio/pellets';
const FIELD_HANDLING_ROOT = '/assets/audio/field-handling';

export const FIELD_FOLEY_AUDIO = Object.freeze({
  knifeSwish: Object.freeze({ url: `${KNIFE_ROOT}/swish.wav`, variants: 4, slotDuration: 0.5 }),
  knifeSucculent: Object.freeze({ url: `${KNIFE_ROOT}/cut-succulent.wav`, variants: 6, slotDuration: 0.45 }),
  knifeStem: Object.freeze({ url: `${KNIFE_ROOT}/cut-stem.wav`, variants: 6, slotDuration: 0.4 }),
  knifeBark: Object.freeze({ url: `${KNIFE_ROOT}/cut-bark.wav`, variants: 6, slotDuration: 0.45 }),
  pelletsRock: Object.freeze({ url: `${PELLETS_ROOT}/pellets-rock.wav`, variants: 6, slotDuration: 0.5 }),
  pelletsEarth: Object.freeze({ url: `${PELLETS_ROOT}/pellets-earth.wav`, variants: 6, slotDuration: 0.5 }),
  pelletsFoliage: Object.freeze({ url: `${PELLETS_ROOT}/pellets-foliage.wav`, variants: 6, slotDuration: 0.55 }),
  pelletsWood: Object.freeze({ url: `${PELLETS_ROOT}/pellets-wood.wav`, variants: 6, slotDuration: 0.45 }),
  stowRock: Object.freeze({ url: `${FIELD_HANDLING_ROOT}/stow-rock.wav`, variants: 6, slotDuration: 0.9 }),
  stowPlant: Object.freeze({ url: `${FIELD_HANDLING_ROOT}/stow-plant.wav`, variants: 4, slotDuration: 0.8 }),
  shardCoat: Object.freeze({ url: `${FIELD_HANDLING_ROOT}/shard-coat.wav`, variants: 4, slotDuration: 0.4 }),
  coatFlap: '/assets/audio/darwin-body/coat-flap-loop.wav',
});

export const FIELD_FOLEY_AUDIO_URLS = Object.freeze(
  Object.values(FIELD_FOLEY_AUDIO).map(asset => asset?.url || asset),
);

// Modelled sounds for the paper interface (scripts/build-ui-audio.mjs): the
// field book and readers, loose folios, the chart, pencil and nib on paper,
// the Beagle's bell at dusk, and Darwin's heartbeat when spent (a loop).
const INTERFACE_ROOT = '/assets/audio/interface';

export const INTERFACE_AUDIO = Object.freeze({
  bookOpen: Object.freeze({ url: `${INTERFACE_ROOT}/book-open.wav`, variants: 4, slotDuration: 0.9 }),
  bookClose: Object.freeze({ url: `${INTERFACE_ROOT}/book-close.wav`, variants: 4, slotDuration: 0.6 }),
  pageTurn: Object.freeze({ url: `${INTERFACE_ROOT}/page-turn.wav`, variants: 6, slotDuration: 0.6 }),
  paperOpen: Object.freeze({ url: `${INTERFACE_ROOT}/paper-open.wav`, variants: 4, slotDuration: 0.5 }),
  paperClose: Object.freeze({ url: `${INTERFACE_ROOT}/paper-close.wav`, variants: 4, slotDuration: 0.4 }),
  mapUnroll: Object.freeze({ url: `${INTERFACE_ROOT}/map-unroll.wav`, variants: 4, slotDuration: 1.1 }),
  mapRoll: Object.freeze({ url: `${INTERFACE_ROOT}/map-roll.wav`, variants: 4, slotDuration: 0.7 }),
  pencil: Object.freeze({ url: `${INTERFACE_ROOT}/pencil.wav`, variants: 6, slotDuration: 0.9 }),
  nib: Object.freeze({ url: `${INTERFACE_ROOT}/nib.wav`, variants: 4, slotDuration: 1.4 }),
  shipBell: Object.freeze({ url: `${INTERFACE_ROOT}/ship-bell.wav`, variants: 2, slotDuration: 5 }),
  tabFlick: Object.freeze({ url: `${INTERFACE_ROOT}/tab-flick.wav`, variants: 6, slotDuration: 0.25 }),
  sealPress: Object.freeze({ url: `${INTERFACE_ROOT}/seal-press.wav`, variants: 4, slotDuration: 0.5 }),
  detent: Object.freeze({ url: `${INTERFACE_ROOT}/detent.wav`, variants: 6, slotDuration: 0.18 }),
  feltThud: Object.freeze({ url: `${INTERFACE_ROOT}/felt-thud.wav`, variants: 4, slotDuration: 0.25 }),
  heartbeat: `${INTERFACE_ROOT}/heartbeat-loop.wav`,
});

export const INTERFACE_AUDIO_URLS = Object.freeze(
  Object.values(INTERFACE_AUDIO).map(asset => asset?.url || asset),
);

// Modelled animal and water-place sounds (scripts/build-fauna-audio.mjs):
// the non-vocal sounds of the island's animals, and the loops and one-shots
// the place probe and authored sound places play.
const FAUNA_ROOT = '/assets/audio/fauna';
const FAUNA_VOICES_ROOT = '/assets/audio/fauna-voices';

export const FAUNA_AUDIO = Object.freeze({
  iguanaSneeze: Object.freeze({ url: `${FAUNA_ROOT}/iguana-sneeze.wav`, variants: 6, slotDuration: 0.7 }),
  lizardScurry: Object.freeze({ url: `${FAUNA_ROOT}/lizard-scurry.wav`, variants: 6, slotDuration: 0.5 }),
  racerSlither: Object.freeze({ url: `${FAUNA_ROOT}/racer-slither.wav`, variants: 4, slotDuration: 1.4 }),
  locustFlight: Object.freeze({ url: `${FAUNA_ROOT}/locust-flight.wav`, variants: 6, slotDuration: 0.8 }),
  tortoiseHiss: Object.freeze({ url: `${FAUNA_ROOT}/tortoise-hiss.wav`, variants: 4, slotDuration: 1.6 }),
  tortoiseFootfall: Object.freeze({ url: `${FAUNA_ROOT}/tortoise-step.wav`, variants: 6, slotDuration: 0.6 }),
  tortoiseGraze: Object.freeze({ url: `${FAUNA_ROOT}/tortoise-graze.wav`, variants: 4, slotDuration: 1.1 }),
  turtleBreath: Object.freeze({ url: `${FAUNA_ROOT}/turtle-breath.wav`, variants: 4, slotDuration: 1.4 }),
  parrotfishCrunch: Object.freeze({ url: `${FAUNA_ROOT}/parrotfish-crunch.wav`, variants: 6, slotDuration: 0.5 }),
  frigateClatter: Object.freeze({ url: `${FAUNA_ROOT}/frigate-clatter.wav`, variants: 4, slotDuration: 1 }),
  finchCrack: Object.freeze({ url: `${FAUNA_ROOT}/finch-crack.wav`, variants: 6, slotDuration: 0.2 }),
  boobyWhistle: Object.freeze({ url: `${FAUNA_ROOT}/booby-whistle.wav`, variants: 5, slotDuration: 1.8 }),
  seaCaveBoom: Object.freeze({ url: `${FAUNA_ROOT}/sea-cave-boom.wav`, variants: 4, slotDuration: 4.5 }),
  // Cut from CC0 field recordings (scripts/build-fauna-voices-audio.mjs).
  sealionBark: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/sealion-bark.wav`, variants: 6, slotDuration: 1.6 }),
  sealionBarkBout: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/sealion-bark-bout.wav`, variants: 4, slotDuration: 3 }),
  sealionGrunt: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/sealion-grunt.wav`, variants: 6, slotDuration: 1.8 }),
  flamingoHonk: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/flamingo-honk.wav`, variants: 6, slotDuration: 2.6 }),
  horseSnort: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/horse-snort.wav`, variants: 7, slotDuration: 1.2 }),
  horseWhinny: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/horse-whinny.wav`, variants: 3, slotDuration: 1.7 }),
  catMeow: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/cat-meow.wav`, variants: 9, slotDuration: 1 }),
  seaCaveSurge: Object.freeze({ url: `${FAUNA_VOICES_ROOT}/sea-cave-surge.wav`, variants: 5, slotDuration: 4.5 }),
  springBrook: `${FAUNA_VOICES_ROOT}/spring-trickle-loop.wav`,
  seabirdColony: `${FAUNA_VOICES_ROOT}/seabird-colony-loop.wav`,
  rockLap: `${FAUNA_ROOT}/rock-lap-loop.wav`,
});

export const FAUNA_AUDIO_URLS = Object.freeze(
  Object.values(FAUNA_AUDIO).map(asset => asset?.url || asset),
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

// Modelled foley (scripts/build-foley-audio.mjs): Darwin on rocks, the body of
// his jumps, and the low boom and echoes under the recorded gun report.
const FOLEY_ROOT = '/assets/audio/foley';

export const FOLEY_AUDIO = Object.freeze({
  bootOnRock: Object.freeze({ url: `${FOLEY_ROOT}/boot-on-rock.wav`, variants: 10, slotDuration: 0.42 }),
  rockLanding: Object.freeze({ url: `${FOLEY_ROOT}/rock-landing.wav`, variants: 6, slotDuration: 0.9 }),
  rockBump: Object.freeze({ url: `${FOLEY_ROOT}/rock-bump.wav`, variants: 6, slotDuration: 0.8 }),
  rockScramble: Object.freeze({ url: `${FOLEY_ROOT}/rock-scramble.wav`, variants: 6, slotDuration: 0.6 }),
  looseStoneClonk: Object.freeze({ url: `${FOLEY_ROOT}/loose-stone-clonk.wav`, variants: 6, slotDuration: 0.75 }),
  gunBlast: Object.freeze({ url: `${FOLEY_ROOT}/gun-blast.wav`, variants: 4, slotDuration: 2.6 }),
});

export const FOLEY_AUDIO_URLS = Object.freeze(Object.values(FOLEY_AUDIO).map(sprite => sprite.url));

// Modelled jump, skid and grit layers over the footfalls
// (scripts/build-motion-audio.mjs).
const MOTION_ROOT = '/assets/audio/motion';

export const MOTION_AUDIO = Object.freeze({
  jumpTakeoffStand: Object.freeze({ url: `${MOTION_ROOT}/jump-takeoff-stand.wav`, variants: 6, slotDuration: 0.55 }),
  jumpTakeoffRun: Object.freeze({ url: `${MOTION_ROOT}/jump-takeoff-run.wav`, variants: 6, slotDuration: 0.7 }),
  jumpLandStand: Object.freeze({ url: `${MOTION_ROOT}/jump-land-stand.wav`, variants: 6, slotDuration: 0.6 }),
  jumpLandRun: Object.freeze({ url: `${MOTION_ROOT}/jump-land-run.wav`, variants: 6, slotDuration: 0.8 }),
  jumpLandDrop: Object.freeze({ url: `${MOTION_ROOT}/jump-land-drop.wav`, variants: 6, slotDuration: 1 }),
  skidGrit: Object.freeze({ url: `${MOTION_ROOT}/skid-grit.wav`, variants: 6, slotDuration: 0.55 }),
  skidSand: Object.freeze({ url: `${MOTION_ROOT}/skid-sand.wav`, variants: 6, slotDuration: 0.55 }),
  skidRock: Object.freeze({ url: `${MOTION_ROOT}/skid-rock.wav`, variants: 6, slotDuration: 0.45 }),
  rockGrit: Object.freeze({ url: `${MOTION_ROOT}/rock-grit-step.wav`, variants: 10, slotDuration: 0.42 }),
});

export const MOTION_AUDIO_URLS = Object.freeze(Object.values(MOTION_AUDIO).map(sprite => sprite.url));

// Modelled loops heard from particular spots (scripts/build-place-ambience-audio.mjs).
const PLACES_ROOT = '/assets/audio/places';

export const PLACE_AMBIENCE_AUDIO = Object.freeze({
  leaves: `${PLACES_ROOT}/leaves-loop.wav`,
  crickets: `${PLACES_ROOT}/crickets-loop.wav`,
  edgeWind: `${PLACES_ROOT}/edge-wind-loop.wav`,
  tidePool: `${PLACES_ROOT}/tide-pool-loop.wav`,
});

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
