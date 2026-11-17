import {
  CONTEXTUAL_WORLD_AUDIO,
  CONTEXTUAL_WORLD_AUDIO_URLS,
  DARWIN_BODY_AUDIO,
  DARWIN_BODY_AUDIO_URLS,
  FOLEY_AUDIO,
  FOLEY_AUDIO_URLS,
  FIELD_FOLEY_AUDIO,
  FIELD_FOLEY_AUDIO_URLS,
  HAMMER_STRIKE_AUDIO,
  HAMMER_STRIKE_AUDIO_URLS,
  INTERFACE_AUDIO,
  INTERFACE_AUDIO_URLS,
  FAUNA_AUDIO,
  FAUNA_AUDIO_URLS,
  MOTION_AUDIO,
  MOTION_AUDIO_URLS,
  PLACE_AMBIENCE_AUDIO,
  INTERACTION_AUDIO,
  INTERACTION_AUDIO_URLS,
  ISLAND_AMBIENCE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO,
  MOVEMENT_WILDLIFE_AUDIO_URLS,
  POST_OFFICE_BAY_AUDIO,
  POST_OFFICE_BAY_AUDIO_URLS,
  TOOL_FOLEY_AUDIO,
  TOOL_FOLEY_AUDIO_URLS,
  WILDLIFE_FIELDWORK_AUDIO,
  WILDLIFE_FIELDWORK_AUDIO_URLS,
} from './audioAssets';
import { getPlayerPreferences } from '../playerPreferences';
import { isConstrainedMemoryDevice } from '../world/constrainedDevice';

const AUDIO_DEBUG_TRACKS = Object.freeze([
  { key: 'surf', label: 'Ocean surf', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.surf, diagnosticGain: 0.55 },
  { key: 'wind', label: 'Wind', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.wind, diagnosticGain: 0.32 },
  { key: 'rain', label: 'Rain on foliage', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.rain, diagnosticGain: 0.32 },
  { key: 'insects', label: 'Dry insects', group: 'Environment loops', kind: 'ambient', url: ISLAND_AMBIENCE_AUDIO.insects, diagnosticGain: 0.24 },
  { key: 'waveBreak', label: 'Close wave break', group: 'Shoreline detail', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.waveBreak, diagnosticGain: 0.2 },
  { key: 'bee', label: 'Nearby bee', group: 'Spatial loops', kind: 'spatial', url: MOVEMENT_WILDLIFE_AUDIO.bee, diagnosticGain: 0.16 },
  { key: 'grit', label: 'Grit footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.gritSteps, diagnosticGain: 0.24 },
  { key: 'sand', label: 'Sand footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.sandSteps, diagnosticGain: 0.24 },
  { key: 'water', label: 'Shallow-water footsteps', group: 'Movement contacts', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.waterSteps, diagnosticGain: 0.24 },
  { key: 'rockStep', label: 'Rock footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockStep, diagnosticGain: 0.22 },
  { key: 'woodStep', label: 'Wood footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.woodStep, diagnosticGain: 0.22 },
  { key: 'mudStep', label: 'Mud footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.mudStep, diagnosticGain: 0.23 },
  { key: 'litterStep', label: 'Leaf-litter footsteps', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.litterStep, diagnosticGain: 0.23 },
  { key: 'rockTakeoff', label: 'Rock takeoff', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockTakeoff, diagnosticGain: 0.24 },
  { key: 'rockLanding', label: 'Rock landing', group: 'Movement contacts', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockLanding, diagnosticGain: 0.25 },
  { key: 'bootOnRock', label: 'Boots on a boulder', group: 'Rock contact', kind: 'sprite', sprite: FOLEY_AUDIO.bootOnRock, diagnosticGain: 0.24 },
  { key: 'rockLandingBody', label: 'Jump landing on a boulder', group: 'Rock contact', kind: 'sprite', sprite: FOLEY_AUDIO.rockLanding, diagnosticGain: 0.24 },
  { key: 'rockBump', label: 'Walking into a rock', group: 'Rock contact', kind: 'sprite', sprite: FOLEY_AUDIO.rockBump, diagnosticGain: 0.22 },
  { key: 'rockScramble', label: 'Scrambling onto a rock', group: 'Rock contact', kind: 'sprite', sprite: FOLEY_AUDIO.rockScramble, diagnosticGain: 0.24 },
  { key: 'looseStone', label: 'Loose stone rocking', group: 'Rock contact', kind: 'sprite', sprite: FOLEY_AUDIO.looseStoneClonk, diagnosticGain: 0.22 },
  { key: 'jumpTakeoffStand', label: 'Standing jump push-off', group: 'Darwin body', kind: 'sprite', sprite: MOTION_AUDIO.jumpTakeoffStand, diagnosticGain: 0.2 },
  { key: 'jumpTakeoffRun', label: 'Running jump push-off', group: 'Darwin body', kind: 'sprite', sprite: MOTION_AUDIO.jumpTakeoffRun, diagnosticGain: 0.2 },
  { key: 'jumpLandStand', label: 'Standing jump landing', group: 'Darwin body', kind: 'sprite', sprite: MOTION_AUDIO.jumpLandStand, diagnosticGain: 0.2 },
  { key: 'jumpLandRun', label: 'Running jump landing', group: 'Darwin body', kind: 'sprite', sprite: MOTION_AUDIO.jumpLandRun, diagnosticGain: 0.2 },
  { key: 'jumpLandDrop', label: 'Landing a drop', group: 'Darwin body', kind: 'sprite', sprite: MOTION_AUDIO.jumpLandDrop, diagnosticGain: 0.2 },
  { key: 'skidGrit', label: 'Boot skid in grit', group: 'Footsteps', kind: 'sprite', sprite: MOTION_AUDIO.skidGrit, diagnosticGain: 0.2 },
  { key: 'skidSand', label: 'Boot skid in sand', group: 'Footsteps', kind: 'sprite', sprite: MOTION_AUDIO.skidSand, diagnosticGain: 0.2 },
  { key: 'skidRock', label: 'Hobnails skating on stone', group: 'Footsteps', kind: 'sprite', sprite: MOTION_AUDIO.skidRock, diagnosticGain: 0.2 },
  { key: 'rockGrit', label: 'Grit under boots on rock', group: 'Footsteps', kind: 'sprite', sprite: MOTION_AUDIO.rockGrit, diagnosticGain: 0.2 },
  { key: 'shotgunReport', label: 'Black-powder report', group: 'Shotgun', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.shotgunReport, diagnosticGain: 0.32 },
  { key: 'gunBlast', label: 'Report boom and echoes', group: 'Shotgun', kind: 'sprite', sprite: FOLEY_AUDIO.gunBlast, diagnosticGain: 0.28 },
  { key: 'shotgunReload', label: 'Muzzle-loader reload', group: 'Shotgun', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.shotgunReload, diagnosticGain: 0.24 },
  { key: 'finchWing', label: 'Finch wingbeats', group: 'Playable animals', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.finchWing, diagnosticGain: 0.2 },
  { key: 'tortoiseStep', label: 'Tortoise ground contact', group: 'Playable animals', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.tortoiseStep, diagnosticGain: 0.2 },
  { key: 'symsGrit', label: 'Syms grit footsteps', group: 'Syms movement', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.gritSteps, diagnosticGain: 0.21 },
  { key: 'symsSand', label: 'Syms sand footsteps', group: 'Syms movement', kind: 'sprite', sprite: POST_OFFICE_BAY_AUDIO.sandSteps, diagnosticGain: 0.21 },
  { key: 'symsRock', label: 'Syms rock footsteps', group: 'Syms movement', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.rockStep, diagnosticGain: 0.2 },
  { key: 'wood', label: 'Wood impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.wood, diagnosticGain: 0.22 },
  { key: 'stone', label: 'Stone impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.stone, diagnosticGain: 0.22 },
  { key: 'metal', label: 'Metal impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.metal, diagnosticGain: 0.18 },
  { key: 'ceramic', label: 'Ceramic impact', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.ceramic, diagnosticGain: 0.18 },
  { key: 'grass', label: 'Grass rustle', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.grass, diagnosticGain: 0.2 },
  { key: 'shrub', label: 'Shrub rustle', group: 'Interactions', kind: 'sprite', sprite: INTERACTION_AUDIO.shrub, diagnosticGain: 0.2 },
  { key: 'hammerSwing', label: 'Hammer swing', group: 'Tool Foley', kind: 'sprite', sprite: TOOL_FOLEY_AUDIO.hammerSwing, diagnosticGain: 0.18 },
  { key: 'netSwing', label: 'Insect-net swing', group: 'Tool Foley', kind: 'sprite', sprite: TOOL_FOLEY_AUDIO.netSwing, diagnosticGain: 0.18 },
  { key: 'netContact', label: 'Insect-net contact', group: 'Tool Foley', kind: 'sprite', sprite: TOOL_FOLEY_AUDIO.netContact, diagnosticGain: 0.18 },
  { key: 'hammerBasalt', label: 'Hammer on basalt', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.basalt, diagnosticGain: 0.1 },
  { key: 'hammerScoria', label: 'Hammer on scoria', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.scoria, diagnosticGain: 0.1 },
  { key: 'hammerTuff', label: 'Hammer on tuff', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.tuff, diagnosticGain: 0.1 },
  { key: 'hammerOlivine', label: 'Hammer on olivine basalt', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.olivine, diagnosticGain: 0.1 },
  { key: 'hammerCoral', label: 'Hammer on coral limestone', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.coral_limestone, diagnosticGain: 0.12 },
  { key: 'hammerIronCrust', label: 'Hammer on iron crust', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.iron_crust, diagnosticGain: 0.1 },
  { key: 'hammerSplit', label: 'Boulder splitting', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.split, diagnosticGain: 0.12 },
  { key: 'hammerWood', label: 'Hammer on timber', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.wood, diagnosticGain: 0.1 },
  { key: 'hammerSucculent', label: 'Hammer on cactus', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.succulent, diagnosticGain: 0.09 },
  { key: 'hammerHerb', label: 'Hammer on herbs and crops', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.herb, diagnosticGain: 0.09 },
  { key: 'hammerStrain', label: 'Boulder about to split', group: 'Hammer strikes', kind: 'sprite', sprite: HAMMER_STRIKE_AUDIO.strain, diagnosticGain: 0.14 },
  { key: 'shardCoat', label: 'Hammer chip striking coat', group: 'Hammer strikes', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.shardCoat, diagnosticGain: 0.12 },
  { key: 'stowRock', label: 'Stowing a rock sample', group: 'Fieldwork', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.stowRock, diagnosticGain: 0.14 },
  { key: 'stowPlant', label: 'Pressing a plant sample', group: 'Fieldwork', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.stowPlant, diagnosticGain: 0.14 },
  { key: 'knifeSwish', label: 'Knife swish', group: 'Knife', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.knifeSwish, diagnosticGain: 0.12 },
  { key: 'knifeSucculent', label: 'Knife through cactus', group: 'Knife', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.knifeSucculent, diagnosticGain: 0.12 },
  { key: 'knifeStem', label: 'Knife through stems', group: 'Knife', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.knifeStem, diagnosticGain: 0.12 },
  { key: 'knifeBark', label: 'Knife across bark', group: 'Knife', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.knifeBark, diagnosticGain: 0.12 },
  { key: 'pelletsRock', label: 'Pellets on rock', group: 'Shotgun', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.pelletsRock, diagnosticGain: 0.14 },
  { key: 'pelletsEarth', label: 'Pellets into ground', group: 'Shotgun', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.pelletsEarth, diagnosticGain: 0.14 },
  { key: 'pelletsFoliage', label: 'Pellets through foliage', group: 'Shotgun', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.pelletsFoliage, diagnosticGain: 0.14 },
  { key: 'pelletsWood', label: 'Pellets into timber', group: 'Shotgun', kind: 'sprite', sprite: FIELD_FOLEY_AUDIO.pelletsWood, diagnosticGain: 0.14 },
  { key: 'wildlifeFlush', label: 'Birds flushing', group: 'Wildlife calls', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.finchWing, diagnosticGain: 0.16 },
  { key: 'coatFlap', label: 'Coat in the wind', group: 'Darwin body', kind: 'spatial', url: FIELD_FOLEY_AUDIO.coatFlap, diagnosticGain: 0.1 },
  { key: 'iguanaSneeze', label: 'Marine iguana sneezing salt', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.iguanaSneeze, diagnosticGain: 0.16 },
  { key: 'lizardScurry', label: 'Lava lizard dashing', group: 'Animal movement', kind: 'sprite', sprite: FAUNA_AUDIO.lizardScurry, diagnosticGain: 0.16 },
  { key: 'racerSlither', label: 'Racer through litter', group: 'Animal movement', kind: 'sprite', sprite: FAUNA_AUDIO.racerSlither, diagnosticGain: 0.16 },
  { key: 'locustFlight', label: 'Locust taking wing', group: 'Animal movement', kind: 'sprite', sprite: FAUNA_AUDIO.locustFlight, diagnosticGain: 0.16 },
  { key: 'tortoiseHiss', label: 'Tortoise withdrawing', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.tortoiseHiss, diagnosticGain: 0.16 },
  { key: 'tortoiseFootfall', label: 'Tortoise footfalls', group: 'Animal movement', kind: 'sprite', sprite: FAUNA_AUDIO.tortoiseFootfall, diagnosticGain: 0.16 },
  { key: 'tortoiseGraze', label: 'Tortoise grazing', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.tortoiseGraze, diagnosticGain: 0.16 },
  { key: 'turtleBreath', label: 'Turtle breathing at the surface', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.turtleBreath, diagnosticGain: 0.16 },
  { key: 'parrotfishCrunch', label: 'Parrotfish on coral (swimming)', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.parrotfishCrunch, diagnosticGain: 0.16 },
  { key: 'frigateClatter', label: 'Frigatebird bill clatter', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.frigateClatter, diagnosticGain: 0.16 },
  { key: 'finchCrack', label: 'Finch cracking seed', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.finchCrack, diagnosticGain: 0.16 },
  { key: 'boobyWhistle', label: 'Blue-footed booby whistle', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.boobyWhistle, diagnosticGain: 0.16 },
  { key: 'seaCaveBoom', label: 'Swell in the sea tube', group: 'Places', kind: 'sprite', sprite: FAUNA_AUDIO.seaCaveBoom, diagnosticGain: 0.16 },
  { key: 'sealionBark', label: 'Sea lion bark', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.sealionBark, diagnosticGain: 0.16 },
  { key: 'sealionBarkBout', label: 'Sea lion bull barking', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.sealionBarkBout, diagnosticGain: 0.16 },
  { key: 'sealionGrunt', label: 'Sea lion dozing grunt', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.sealionGrunt, diagnosticGain: 0.16 },
  { key: 'flamingoHonk', label: 'Flamingo honk', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.flamingoHonk, diagnosticGain: 0.16 },
  { key: 'horseSnort', label: 'Horse snort', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.horseSnort, diagnosticGain: 0.16 },
  { key: 'horseWhinny', label: 'Horse whinny', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.horseWhinny, diagnosticGain: 0.16 },
  { key: 'catMeow', label: 'Cat meow', group: 'Animal voices', kind: 'sprite', sprite: FAUNA_AUDIO.catMeow, diagnosticGain: 0.16 },
  { key: 'seaCaveSurge', label: 'Surge in the sea tube', group: 'Places', kind: 'sprite', sprite: FAUNA_AUDIO.seaCaveSurge, diagnosticGain: 0.16 },
  { key: 'seabirdColony', label: 'Seabird colony', group: 'Places', kind: 'spatial', url: FAUNA_AUDIO.seabirdColony, diagnosticGain: 0.14 },
  { key: 'springBrook', label: 'Spring brook', group: 'Places', kind: 'spatial', url: FAUNA_AUDIO.springBrook, diagnosticGain: 0.14 },
  { key: 'rockLap', label: 'Sea in rock crevices', group: 'Places', kind: 'spatial', url: FAUNA_AUDIO.rockLap, diagnosticGain: 0.14 },
  { key: 'leaves', label: 'Leaves in the wind', group: 'Places', kind: 'spatial', url: PLACE_AMBIENCE_AUDIO.leaves, diagnosticGain: 0.14 },
  { key: 'crickets', label: 'Crickets at night', group: 'Places', kind: 'spatial', url: PLACE_AMBIENCE_AUDIO.crickets, diagnosticGain: 0.14 },
  { key: 'edgeWind', label: 'Wind over a rim', group: 'Places', kind: 'spatial', url: PLACE_AMBIENCE_AUDIO.edgeWind, diagnosticGain: 0.14 },
  { key: 'tidePool', label: 'Tide pool', group: 'Places', kind: 'spatial', url: PLACE_AMBIENCE_AUDIO.tidePool, diagnosticGain: 0.14 },
  { key: 'scrubInsects', label: 'Insects in nearby scrub', group: 'Places', kind: 'spatial', url: ISLAND_AMBIENCE_AUDIO.insects, diagnosticGain: 0.14 },
  { key: 'heartbeat', label: 'Heartbeat when spent', group: 'Darwin body', kind: 'spatial', url: INTERFACE_AUDIO.heartbeat, diagnosticGain: 0.16 },
  { key: 'uiBookOpen', label: 'Book opening', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.bookOpen, diagnosticGain: 0.14 },
  { key: 'uiBookClose', label: 'Book closing', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.bookClose, diagnosticGain: 0.14 },
  { key: 'uiPageTurn', label: 'Page turning', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.pageTurn, diagnosticGain: 0.14 },
  { key: 'uiPaperOpen', label: 'Folio lifted', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.paperOpen, diagnosticGain: 0.14 },
  { key: 'uiPaperClose', label: 'Folio laid down', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.paperClose, diagnosticGain: 0.14 },
  { key: 'uiMapUnroll', label: 'Chart unrolling', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.mapUnroll, diagnosticGain: 0.14 },
  { key: 'uiMapRoll', label: 'Chart rolled up', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.mapRoll, diagnosticGain: 0.14 },
  { key: 'uiPencil', label: 'Pencil in the field book', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.pencil, diagnosticGain: 0.14 },
  { key: 'uiNib', label: 'Pen and ink', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.nib, diagnosticGain: 0.14 },
  { key: 'duskBell', label: "Beagle's bell at dusk", group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.shipBell, diagnosticGain: 0.14 },
  { key: 'uiTab', label: 'Journal tab', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.tabFlick, diagnosticGain: 0.14 },
  { key: 'uiSeal', label: 'Choice sealed', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.sealPress, diagnosticGain: 0.14 },
  { key: 'uiDetent', label: 'Toggle', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.detent, diagnosticGain: 0.14 },
  { key: 'uiRefused', label: 'Unavailable', group: 'Interface', kind: 'sprite', sprite: INTERFACE_AUDIO.feltThud, diagnosticGain: 0.14 },
  { key: 'gull', label: 'Gull call', group: 'Wildlife calls', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.gull, diagnosticGain: 0.2 },
  { key: 'finch', label: 'Finch call', group: 'Wildlife calls', kind: 'sprite', sprite: MOVEMENT_WILDLIFE_AUDIO.finch, diagnosticGain: 0.18 },
  { key: 'dove', label: 'Dove call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.dove, diagnosticGain: 0.18 },
  { key: 'mockingbird', label: 'Mockingbird call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.mockingbird, diagnosticGain: 0.18 },
  { key: 'hawk', label: 'Hawk call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.hawk, diagnosticGain: 0.18 },
  { key: 'owl', label: 'Owl call', group: 'Wildlife calls', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.owl, diagnosticGain: 0.18 },
  { key: 'thunder', label: 'Distant thunder', group: 'Weather events', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.thunder, diagnosticGain: 0.25 },
  { key: 'fieldNote', label: 'Field note', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.fieldNote, diagnosticGain: 0.2 },
  { key: 'specimenContainer', label: 'Specimen container', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.specimenContainer, diagnosticGain: 0.19 },
  { key: 'snareRope', label: 'Snare and rope', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.snareRope, diagnosticGain: 0.2 },
  { key: 'door', label: 'Interior door', group: 'Fieldwork', kind: 'sprite', sprite: WILDLIFE_FIELDWORK_AUDIO.door, diagnosticGain: 0.2 },
  { key: 'crabScuttle', label: 'Crab scuttle', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.crabScuttle, diagnosticGain: 0.2 },
  { key: 'iguanaClaws', label: 'Marine iguana claws', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.iguanaClaws, diagnosticGain: 0.2 },
  { key: 'goatHoof', label: 'Goat hooves', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.goatHoof, diagnosticGain: 0.2 },
  { key: 'horseHoof', label: 'Horse hooves', group: 'Animal movement', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.horseHoof, diagnosticGain: 0.21 },
  { key: 'goatBleat', label: 'Goat bleat', group: 'Wildlife calls', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.goatBleat, diagnosticGain: 0.18 },
  { key: 'settlementWork', label: 'Distant settlement work', group: 'Settlement detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.settlementWork, diagnosticGain: 0.2 },
  { key: 'leatherHandling', label: 'Leather and equipment', group: 'Equipment', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.leatherHandling, diagnosticGain: 0.19 },
  { key: 'waterDrop', label: 'Foliage water drops', group: 'Environmental detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.waterDrop, diagnosticGain: 0.2 },
  { key: 'dryBranch', label: 'Dry branch movement', group: 'Environmental detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.dryBranch, diagnosticGain: 0.2 },
  { key: 'rockTumble', label: 'Loose rock tumble', group: 'Terrain detail', kind: 'sprite', sprite: CONTEXTUAL_WORLD_AUDIO.rockTumble, diagnosticGain: 0.2 },
  { key: 'breath', label: 'Winded breath', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.breath, diagnosticGain: 0.18 },
  { key: 'pain', label: 'Pain reaction', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.pain, diagnosticGain: 0.18 },
  { key: 'collapse', label: 'Collapse exhale', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.collapse, diagnosticGain: 0.18 },
  { key: 'gear', label: 'Clothing and gear', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.gear, diagnosticGain: 0.18 },
  { key: 'bodyImpact', label: 'Hard-fall body', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.bodyImpact, diagnosticGain: 0.2 },
  // Layers on Darwin's footfalls and plant contact. They reuse the rustle and
  // clothing recordings but keep their own keys so each can be trimmed alone.
  { key: 'brushGrass', label: 'Brushing through grass', group: 'Plant contact', kind: 'sprite', sprite: INTERACTION_AUDIO.grass, diagnosticGain: 0.2 },
  { key: 'brushShrub', label: 'Brushing through shrubs', group: 'Plant contact', kind: 'sprite', sprite: INTERACTION_AUDIO.shrub, diagnosticGain: 0.2 },
  { key: 'brushSpine', label: 'Scraping past cactus', group: 'Plant contact', kind: 'sprite', sprite: INTERACTION_AUDIO.shrub, diagnosticGain: 0.16 },
  { key: 'spineSnag', label: 'Cactus spine snag', group: 'Plant contact', kind: 'sprite', sprite: INTERACTION_AUDIO.shrub, diagnosticGain: 0.2 },
  { key: 'cloth', label: 'Coat and satchel while running', group: 'Darwin body', kind: 'sprite', sprite: DARWIN_BODY_AUDIO.gear, diagnosticGain: 0.18 },
]);

const AUDIO_DEBUG_TRACK_BY_KEY = new Map(AUDIO_DEBUG_TRACKS.map(track => [track.key, track]));
// v2: the v1 trims tuned on 2026-10-30 became AUTHORED_MIX below. Bumping
// the schema drops browsers' saved copies so they are not applied twice.
// v3: the v2 trims tuned on 2026-11-02 were folded in the same way.
const SOUND_MIX_STORAGE_KEY = 'darwin.sound-mix.v3';
const SOUND_MIX_SCHEMA = 'darwin-sound-mix-v3';
const BASE_MASTER_GAIN = 0.72;
// The shipped balance, tuned by ear in the in-game Sound mix panel. Player
// trims (the sliders, 0 dB by default) ride on top of these offsets.
// 2026-11-02: footsteps raised ~6 dB; they were lost under the surf bed.
// 2026-11-02 (later): a by-ear pass folded in. Footsteps, surf, rain and
// insects came back down; the bee, breath and close wave break came up.
// 2026-11-03: measured rather than by ear. Footfalls had fallen to about the
// surf's level (sand ~-48 LUFS momentary against surf crests ~-42 before the
// master), so every surface is now set to peak near -40, ~7 dB over the surf
// body at the waterline; and the whole mix comes up 4.5 dB, having sat ~20 dB
// under typical game loudness. The limiter still catches the gun.
const AUTHORED_MIX = Object.freeze({
  masterDb: 2,
  tracks: Object.freeze({
    bee: 7,
    breath: 2,
    brushGrass: -14,
    brushShrub: -2.5,
    brushSpine: 4.5,
    cloth: -10,
    grass: -10.5,
    grit: -4.5,
    // The zone-wide bed steps back now that scrub nearby carries its own.
    insects: -15,
    litterStep: -2,
    mudStep: -6,
    pain: 5.5,
    rain: -13.5,
    rockStep: -0.5,
    rockTakeoff: -6.5,
    sand: -6.5,
    shotgunReport: -3,
    spineSnag: 7.5,
    surf: -10,
    symsGrit: -2,
    tortoiseStep: -6.5,
    water: -11,
    waveBreak: 2,
    woodStep: -5,
  }),
});
const MASTER_TRIM_MIN_DB = -18;
const MASTER_TRIM_MAX_DB = 6;
const TRACK_TRIM_MIN_DB = -24;
const TRACK_TRIM_MAX_DB = 12;
const LAUNCH_AMBIENCE_TARGETS = Object.freeze({
  insects: 0.035,
  surf: 0.105,
});
const LAUNCH_SURF_DELAY_SECONDS = 1.4;
const DEFERRED_AUDIO_BANKS = Object.freeze([
  INTERFACE_AUDIO_URLS,
  TOOL_FOLEY_AUDIO_URLS,
  HAMMER_STRIKE_AUDIO_URLS,
  FIELD_FOLEY_AUDIO_URLS,
  INTERACTION_AUDIO_URLS,
  POST_OFFICE_BAY_AUDIO_URLS.slice(2),
  MOVEMENT_WILDLIFE_AUDIO_URLS,
  FOLEY_AUDIO_URLS,
  MOTION_AUDIO_URLS,
  DARWIN_BODY_AUDIO_URLS,
  WILDLIFE_FIELDWORK_AUDIO_URLS,
  CONTEXTUAL_WORLD_AUDIO_URLS,
  FAUNA_AUDIO_URLS,
]);
let deferredAudioPreload = null;
let toolFoleyPreload = null;
let constrainedDecodeQueue = Promise.resolve();

const audioState = {
  context: null,
  master: null,
  enabled: true,
  bufferPromises: new Map(),
  buffers: new Map(),
  ambient: new Map(),
  ambientPromises: new Map(),
  spatial: new Map(),
  spatialTargets: new Map(),
  voices: new Set(),
  debugControl: {
    soloKey: null,
    mutedKeys: new Set(),
    forceEnabled: false,
  },
  mix: {
    hydrated: false,
    masterDb: 0,
    trackDb: new Map(),
  },
  targets: { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0 },
  debug: {
    contextState: 'uninitialized',
    enabled: true,
    loadedAssets: [],
    ambientTargets: { surf: 0, wind: 0, rain: 0, insects: 0, occlusion: 0 },
    ambientTracks: {},
    environment: null,
    lastLoadError: null,
    spatialTargets: {},
    activeVoices: 0,
    events: {
      grit: 0,
      sand: 0,
      water: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      ceramic: 0,
      grass: 0,
      shrub: 0,
      hammerSwing: 0,
      netSwing: 0,
      netContact: 0,
      hammerBasalt: 0,
      hammerScoria: 0,
      hammerTuff: 0,
      hammerOlivine: 0,
      hammerCoral: 0,
      hammerIronCrust: 0,
      hammerSplit: 0,
      hammerWood: 0,
      hammerSucculent: 0,
      hammerHerb: 0,
      hammerStrain: 0,
      shardCoat: 0,
      stowRock: 0,
      stowPlant: 0,
      knifeSwish: 0,
      knifeSucculent: 0,
      knifeStem: 0,
      knifeBark: 0,
      pelletsRock: 0,
      pelletsEarth: 0,
      pelletsFoliage: 0,
      pelletsWood: 0,
      wildlifeFlush: 0,
      uiBookOpen: 0,
      uiBookClose: 0,
      uiPageTurn: 0,
      uiPaperOpen: 0,
      uiPaperClose: 0,
      uiMapUnroll: 0,
      uiMapRoll: 0,
      uiPencil: 0,
      uiNib: 0,
      duskBell: 0,
      uiTab: 0,
      uiSeal: 0,
      uiDetent: 0,
      uiRefused: 0,
      iguanaSneeze: 0,
      lizardScurry: 0,
      racerSlither: 0,
      locustFlight: 0,
      tortoiseHiss: 0,
      tortoiseFootfall: 0,
      tortoiseGraze: 0,
      turtleBreath: 0,
      parrotfishCrunch: 0,
      frigateClatter: 0,
      finchCrack: 0,
      seaCaveBoom: 0,
      boobyWhistle: 0,
      sealionBark: 0,
      sealionBarkBout: 0,
      sealionGrunt: 0,
      flamingoHonk: 0,
      horseSnort: 0,
      horseWhinny: 0,
      catMeow: 0,
      seaCaveSurge: 0,
      rockStep: 0,
      woodStep: 0,
      mudStep: 0,
      litterStep: 0,
      rockTakeoff: 0,
      rockLanding: 0,
      shotgunReport: 0,
      shotgunReload: 0,
      gunBlast: 0,
      bootOnRock: 0,
      rockLandingBody: 0,
      rockBump: 0,
      rockScramble: 0,
      looseStone: 0,
      jumpTakeoffStand: 0,
      jumpTakeoffRun: 0,
      jumpLandStand: 0,
      jumpLandRun: 0,
      jumpLandDrop: 0,
      skidGrit: 0,
      skidSand: 0,
      skidRock: 0,
      rockGrit: 0,
      finchWing: 0,
      tortoiseStep: 0,
      gull: 0,
      finch: 0,
      dove: 0,
      mockingbird: 0,
      hawk: 0,
      owl: 0,
      thunder: 0,
      waveBreak: 0,
      fieldNote: 0,
      specimenContainer: 0,
      snareRope: 0,
      door: 0,
      pain: 0,
      collapse: 0,
      breath: 0,
      bodyImpact: 0,
      brushGrass: 0,
      brushShrub: 0,
      brushSpine: 0,
      spineSnag: 0,
      cloth: 0,
      gear: 0,
      symsGrit: 0,
      symsSand: 0,
      symsRock: 0,
      crabScuttle: 0,
      iguanaClaws: 0,
      goatHoof: 0,
      horseHoof: 0,
      goatBleat: 0,
      settlementWork: 0,
      leatherHandling: 0,
      waterDrop: 0,
      dryBranch: 0,
      rockTumble: 0,
    },
    lastEvent: null,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function dbToGain(db) {
  return 10 ** (Number(db || 0) / 20);
}

function hydrateMixSettings() {
  if (audioState.mix.hydrated || typeof window === 'undefined') return;
  audioState.mix.hydrated = true;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SOUND_MIX_STORAGE_KEY) || 'null');
    if (!stored || stored.schema !== SOUND_MIX_SCHEMA) return;
    audioState.mix.masterDb = clamp(stored.masterDb, MASTER_TRIM_MIN_DB, MASTER_TRIM_MAX_DB);
    for (const [key, db] of Object.entries(stored.tracks || {})) {
      if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) continue;
      const safeDb = clamp(db, TRACK_TRIM_MIN_DB, TRACK_TRIM_MAX_DB);
      if (Math.abs(safeDb) >= 0.001) audioState.mix.trackDb.set(key, safeDb);
    }
  } catch {
    // A malformed or unavailable local preference must never block audio.
  }
}

function soundscapeMixPayload() {
  hydrateMixSettings();
  return {
    schema: SOUND_MIX_SCHEMA,
    masterDb: audioState.mix.masterDb,
    tracks: Object.fromEntries(
      [...audioState.mix.trackDb.entries()]
        .filter(([, db]) => Math.abs(db) >= 0.001)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function persistMixSettings() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_MIX_STORAGE_KEY, JSON.stringify(soundscapeMixPayload()));
  } catch {
    // Private browsing/storage policy should not prevent live tuning.
  }
}

function trackTrimDb(key) {
  hydrateMixSettings();
  return audioState.mix.trackDb.get(key) || 0;
}

function trackTrimGain(key) {
  return dbToGain((AUTHORED_MIX.tracks[key] || 0) + trackTrimDb(key));
}

function debugAllowsTrack(key) {
  const control = audioState.debugControl;
  if (control.mutedKeys.has(key)) return false;
  return !control.soloKey || control.soloKey === key;
}

function effectiveContinuousGain(key, target) {
  if (!debugAllowsTrack(key)) return 0;
  const diagnosticGain = AUDIO_DEBUG_TRACK_BY_KEY.get(key)?.diagnosticGain || 0;
  const baseGain = audioState.debugControl.soloKey === key
    ? Math.max(Number(target) || 0, diagnosticGain)
    : Math.max(0, Number(target) || 0);
  return baseGain * trackTrimGain(key);
}

function effectiveMasterGain() {
  hydrateMixSettings();
  // The player's volume slider rides on top of the authored dB trim, so the
  // mix balance the sound design assumes is preserved at every setting.
  const playerVolume = getPlayerPreferences().masterVolume;
  return audioState.enabled || audioState.debugControl.forceEnabled
    ? BASE_MASTER_GAIN * dbToGain(AUTHORED_MIX.masterDb + audioState.mix.masterDb) * playerVolume
    : 0;
}

function exposeDebugState() {
  if (typeof window === 'undefined') return;
  hydrateMixSettings();
  audioState.debug.contextState = audioState.context?.state || 'uninitialized';
  audioState.debug.enabled = audioState.enabled;
  audioState.debug.loadedAssets = [...audioState.buffers.keys()];
  audioState.debug.ambientTargets = { ...audioState.targets };
  audioState.debug.ambientTracks = Object.fromEntries(
    Object.entries(ISLAND_AMBIENCE_AUDIO).map(([key, url]) => {
      const track = audioState.ambient.get(key);
      return [key, {
        url,
        loaded: audioState.buffers.has(url),
        running: Boolean(track),
        gain: track?.gain?.gain?.value || 0,
      }];
    }),
  );
  audioState.debug.spatialTargets = Object.fromEntries(audioState.spatialTargets);
  audioState.debug.activeVoices = audioState.voices.size;
  audioState.debug.soloKey = audioState.debugControl.soloKey;
  audioState.debug.mutedKeys = [...audioState.debugControl.mutedKeys];
  audioState.debug.masterGain = audioState.master?.gain?.value || 0;
  audioState.debug.masterTrimDb = audioState.mix.masterDb;
  audioState.debug.trackTrimDb = Object.fromEntries(audioState.mix.trackDb);
  window.__darwinAudioDebug = audioState.debug;
}

function ensureAudioGraph() {
  if (audioState.context || typeof window === 'undefined') return audioState.context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  const master = context.createGain();
  master.gain.value = effectiveMasterGain();
  // A peak catcher, not a compressor: it only touches gunshots and heavy
  // landings stacked on the beds, so louder foley can never clip.
  const limiter = typeof context.createDynamicsCompressor === 'function' ? context.createDynamicsCompressor() : null;
  if (limiter) {
    limiter.threshold.value = -4;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(context.destination);
  } else {
    master.connect(context.destination);
  }
  audioState.context = context;
  audioState.master = master;
  audioState.space = createSpaceBus(context, master);
  applyAcousticSpace(0.05);
  exposeDebugState();
  return context;
}

// Where Darwin is shapes every one-shot: open ground gives nothing back, a
// cabin a short room, Gabriel's lava tube a long dark wash with a flutter
// between its walls, and the Promontory a single slap off the sea cliffs.
// Every sprite voice feeds one shared send; loops and beds stay dry.
// The convolver normalizes its impulse, which leaves the room about 19 dB
// and the cave about 12 dB under the dry voice at unity; these reverb gains
// set them to roughly -16 dB (a hint of walls) and -8.5 dB (a wet tube).
const ACOUSTIC_SPACES = Object.freeze({
  open: { reverb: 0, echo: 0 },
  room: { reverb: 1.4, seconds: 0.38, damping: 5200, echo: 0 },
  cave: { reverb: 1.6, seconds: 1.7, damping: 3400, predelay: 0.014, echo: 0.1, echoDelay: 0.068, feedback: 0.32, echoHz: 3000 },
  cliff: { reverb: 0, echo: 0.2, echoDelay: 0.27, feedback: 0.16, echoHz: 2200 },
});

function createSpaceBus(context, master) {
  const input = context.createGain();
  const convolver = context.createConvolver();
  const reverbGain = context.createGain();
  const delay = context.createDelay(1);
  const echoFilter = context.createBiquadFilter();
  const feedback = context.createGain();
  const echoGain = context.createGain();
  reverbGain.gain.value = 0;
  echoGain.gain.value = 0;
  feedback.gain.value = 0;
  echoFilter.type = 'lowpass';
  input.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(master);
  input.connect(delay);
  delay.connect(echoFilter);
  echoFilter.connect(feedback);
  feedback.connect(delay);
  echoFilter.connect(echoGain);
  echoGain.connect(master);
  return { input, convolver, reverbGain, delay, echoFilter, feedback, echoGain, impulses: new Map() };
}

// A decaying stereo noise tail whose highs die faster than its lows, with a
// few sparse early reflections ahead of it.
function spaceImpulse(context, { seconds, damping, predelay = 0.006 }) {
  const length = Math.ceil((seconds + predelay) * context.sampleRate);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    const start = Math.round(predelay * context.sampleRate);
    let low = 0;
    for (let i = start; i < length; i += 1) {
      const t = (i - start) / context.sampleRate;
      const cutoff = Math.max(400, damping * Math.exp(-t / (seconds * 0.45)));
      const k = 1 - Math.exp(-2 * Math.PI * cutoff / context.sampleRate);
      low += (Math.random() * 2 - 1 - low) * k;
      data[i] = low * Math.exp(-6.9 * t / seconds);
    }
    for (let tap = 0; tap < 6; tap += 1) {
      const at = start + Math.round((0.004 + Math.random() * 0.04) * context.sampleRate);
      if (at < length) data[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - tap * 0.06);
    }
  }
  return impulse;
}

let acousticSpaceId = 'open';

function applyAcousticSpace(timeConstant = 0.6) {
  const bus = audioState.space;
  const context = audioState.context;
  if (!bus || !context) return;
  const space = ACOUSTIC_SPACES[acousticSpaceId] || ACOUSTIC_SPACES.open;
  if (space.reverb > 0) {
    if (!bus.impulses.has(acousticSpaceId)) bus.impulses.set(acousticSpaceId, spaceImpulse(context, space));
    if (bus.convolver.buffer !== bus.impulses.get(acousticSpaceId)) bus.convolver.buffer = bus.impulses.get(acousticSpaceId);
  }
  rampGain(bus.reverbGain.gain, space.reverb, timeConstant);
  rampGain(bus.echoGain.gain, space.echo, timeConstant);
  rampGain(bus.feedback.gain, space.feedback || 0, timeConstant);
  if (space.echoDelay) rampValue(bus.delay.delayTime, space.echoDelay, 0.05);
  if (space.echoHz) rampValue(bus.echoFilter.frequency, space.echoHz, 0.05);
}

export function setAcousticSpace(spaceId) {
  const next = ACOUSTIC_SPACES[spaceId] ? spaceId : 'open';
  if (next === acousticSpaceId) return;
  acousticSpaceId = next;
  audioState.debug.acousticSpace = next;
  applyAcousticSpace();
  exposeDebugState();
}

function rampGain(parameter, value, timeConstant = 0.35) {
  const context = audioState.context;
  if (!context || !parameter) return;
  const safeValue = Math.max(0, Number(value) || 0);
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setTargetAtTime(safeValue, context.currentTime, Math.max(0.02, timeConstant));
}

function scheduleGain(parameter, value, delaySeconds, timeConstant) {
  const context = audioState.context;
  if (!context || !parameter) return;
  const now = context.currentTime;
  const safeValue = Math.max(0, Number(value) || 0);
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(now);
  } else {
    const currentValue = parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(currentValue, now);
  }
  parameter.setTargetAtTime(
    safeValue,
    now + Math.max(0, Number(delaySeconds) || 0),
    Math.max(0.02, Number(timeConstant) || 0.35),
  );
}

function rampValue(parameter, value, timeConstant = 0.12) {
  const context = audioState.context;
  if (!context || !parameter || !Number.isFinite(value)) return;
  parameter.cancelScheduledValues(context.currentTime);
  parameter.setTargetAtTime(value, context.currentTime, Math.max(0.02, timeConstant));
}

// The listener: Darwin's ears, turned the way the camera looks. Sounds with
// a place in the world (animals, water, the colony) pass through an HRTF
// panner placed there, so they sit fully left or right, behind or above, and
// swing round as the camera turns. Their level and dulling with distance stay
// with the callers (wildlifeVoices.propagate); the panner only gives
// direction. Until the scene has reported a camera the stereo pan is used.
const audioListener = { ready: false, x: 0, y: 0, z: 0 };

function setAudioParam(parameter, value) {
  if (parameter && Number.isFinite(value)) parameter.value = value;
}

export function updateAudioListener({ position, forward, up }) {
  const context = audioState.context;
  if (!context || !position || !forward || !up) return;
  const listener = context.listener;
  audioListener.x = position.x;
  audioListener.y = position.y;
  audioListener.z = position.z;
  if (!audioListener.ready) audioState.debug.listener = audioListener;
  audioListener.ready = true;
  if (listener.positionX) {
    setAudioParam(listener.positionX, position.x);
    setAudioParam(listener.positionY, position.y);
    setAudioParam(listener.positionZ, position.z);
    setAudioParam(listener.forwardX, forward.x);
    setAudioParam(listener.forwardY, forward.y);
    setAudioParam(listener.forwardZ, forward.z);
    setAudioParam(listener.upX, up.x);
    setAudioParam(listener.upY, up.y);
    setAudioParam(listener.upZ, up.z);
  } else if (typeof listener.setPosition === 'function') {
    listener.setPosition(position.x, position.y, position.z);
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

function worldPoint(position) {
  const x = Number(position?.x);
  const z = Number(position?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const y = Number(position?.y);
  return { x, y: Number.isFinite(y) ? y : audioListener.y, z };
}

function setPannerPosition(panner, point, timeConstant = 0) {
  if (panner.positionX) {
    if (timeConstant > 0) {
      rampValue(panner.positionX, point.x, timeConstant);
      rampValue(panner.positionY, point.y, timeConstant);
      rampValue(panner.positionZ, point.z, timeConstant);
    } else {
      setAudioParam(panner.positionX, point.x);
      setAudioParam(panner.positionY, point.y);
      setAudioParam(panner.positionZ, point.z);
    }
  } else if (typeof panner.setPosition === 'function') {
    panner.setPosition(point.x, point.y, point.z);
  }
}

function createWorldPanner(context) {
  if (typeof context.createPanner !== 'function') return null;
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  // Direction only: rolloff 0 holds the inverse-distance gain at 1.
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.rolloffFactor = 0;
  return panner;
}

async function loadAudioBuffer(url) {
  const context = ensureAudioGraph();
  if (!context) return null;
  if (audioState.buffers.has(url)) return audioState.buffers.get(url);
  if (!audioState.bufferPromises.has(url)) {
    const decode = () => fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Audio request failed (${response.status}): ${url}`);
        return response.arrayBuffer();
      })
      .then(arrayBuffer => context.decodeAudioData(arrayBuffer));
    const constrained = isConstrainedMemoryDevice();
    const pending = constrained ? constrainedDecodeQueue.then(decode) : decode();
    const promise = pending
      .then(buffer => {
        audioState.buffers.set(url, buffer);
        exposeDebugState();
        return buffer;
      })
      .catch(error => {
        audioState.debug.lastLoadError = {
          url,
          message: String(error?.message || error),
          at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        };
        exposeDebugState();
        if (process.env.NODE_ENV !== 'production') console.warn('[audio] Unable to load field recording', error);
        return null;
      })
      .finally(() => {
        if (audioState.bufferPromises.get(url) === promise) audioState.bufferPromises.delete(url);
      });
    if (constrained) constrainedDecodeQueue = promise;
    audioState.bufferPromises.set(url, promise);
  }
  return audioState.bufferPromises.get(url);
}

async function ensureAmbientTrack(key, url) {
  if (audioState.ambient.has(key)) return audioState.ambient.get(key);
  if (audioState.ambientPromises.has(key)) return audioState.ambientPromises.get(key);
  const promise = (async () => {
    const context = ensureAudioGraph();
    const buffer = await loadAudioBuffer(url);
    if (!context || !buffer || audioState.ambient.has(key)) return audioState.ambient.get(key) || null;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    filter.type = 'lowpass';
    filter.Q.value = 0.35;
    filter.frequency.value = 16000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioState.master);
    source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
    const track = { source, filter, gain };
    source.onended = () => {
      if (audioState.ambient.get(key) !== track) return;
      audioState.ambient.delete(key);
      exposeDebugState();
      if (audioState.enabled && audioState.targets[key] > 0) void ensureAmbientTrack(key, url);
    };
    audioState.ambient.set(key, track);
    rampGain(gain.gain, effectiveContinuousGain(key, audioState.targets[key]), 0.18);
    rampValue(filter.frequency, ambientCutoffFor(key, audioState.targets.occlusion), 0.18);
    exposeDebugState();
    return track;
  })().finally(() => {
    audioState.ambientPromises.delete(key);
  });
  audioState.ambientPromises.set(key, promise);
  return promise;
}

const SPATIAL_REROUTE_SILENCE = 0.0005;

// A loop that loses its place while it fades (the brook as Darwin walks
// away) keeps sounding from where it was until it is silent; moving the
// gain to the stereo route mid-fade jumped the tail to dead centre.
export function spatialRouteFor(currentRoute, { hasPoint, targetGain, currentGain }) {
  if (hasPoint) return 'world';
  if (currentRoute === 'world' && !(targetGain > 0) && currentGain > SPATIAL_REROUTE_SILENCE) return 'world';
  return 'stereo';
}

function routeSpatialTrack(track, target) {
  const point = audioListener.ready && track.worldPanner ? worldPoint(target.position) : null;
  const route = spatialRouteFor(track.route, {
    hasPoint: Boolean(point),
    targetGain: target.gain,
    currentGain: track.gain.gain.value,
  });
  if (point) setPannerPosition(track.worldPanner, point, track.route === 'world' ? 0.15 : 0);
  if (route === track.route) return;
  track.gain.disconnect();
  track.gain.connect(route === 'world' ? track.worldPanner : (track.panner || audioState.master));
  track.route = route;
}

async function ensureSpatialTrack(key, url) {
  if (audioState.spatial.has(key)) return audioState.spatial.get(key);
  const context = ensureAudioGraph();
  const buffer = await loadAudioBuffer(url);
  if (!context || !buffer || audioState.spatial.has(key)) return audioState.spatial.get(key) || null;

  const source = context.createBufferSource();
  const gain = context.createGain();
  // Distance dulling for loops that sit somewhere in the world (a brook, the
  // sea in the rocks); wide open unless a target asks for less.
  const filter = context.createBiquadFilter();
  const worldPanner = createWorldPanner(context);
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  const target = audioState.spatialTargets.get(key) || { gain: 0, pan: 0, playbackRate: 1, filterHz: 20000 };
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = target.playbackRate;
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.value = target.filterHz || 20000;
  gain.gain.value = 0;
  source.connect(filter);
  filter.connect(gain);
  // Both routes exist; the gain feeds whichever the latest target asks for
  // (a world position, or a plain stereo pan for sounds on Darwin himself).
  if (panner) {
    panner.pan.value = target.pan;
    panner.connect(audioState.master);
  }
  worldPanner?.connect(audioState.master);
  source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
  const track = { source, gain, panner, worldPanner, filter, route: null };
  routeSpatialTrack(track, target);
  audioState.spatial.set(key, track);
  rampGain(gain.gain, effectiveContinuousGain(key, target.gain), 0.16);
  exposeDebugState();
  return track;
}

function waitForAudioPreloadWindow() {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(resolve, { timeout: 1200 });
    } else {
      window.setTimeout(resolve, 80);
    }
  });
}

export function preloadSoundscapeEffects() {
  if (isConstrainedMemoryDevice()) return Promise.resolve(false);
  if (deferredAudioPreload) return deferredAudioPreload;
  deferredAudioPreload = (async () => {
    // Decode one related bank per idle window. Fetch/decode for every effect
    // at once previously competed with GLTF parsing and shader setup during
    // the launch overlay even though none of these sounds were needed yet.
    for (const urls of DEFERRED_AUDIO_BANKS) {
      await waitForAudioPreloadWindow();
      await Promise.all(urls.map(loadAudioBuffer));
    }
    await waitForAudioPreloadWindow();
    await ensureSpatialTrack('bee', MOVEMENT_WILDLIFE_AUDIO.bee);
    await ensureSpatialTrack('coatFlap', FIELD_FOLEY_AUDIO.coatFlap);
    await ensureSpatialTrack('heartbeat', INTERFACE_AUDIO.heartbeat);
    await ensureSpatialTrack('springBrook', FAUNA_AUDIO.springBrook);
    await ensureSpatialTrack('rockLap', FAUNA_AUDIO.rockLap);
    await ensureSpatialTrack('seabirdColony', FAUNA_AUDIO.seabirdColony);
    await ensureSpatialTrack('leaves', PLACE_AMBIENCE_AUDIO.leaves);
    await ensureSpatialTrack('crickets', PLACE_AMBIENCE_AUDIO.crickets);
    await ensureSpatialTrack('edgeWind', PLACE_AMBIENCE_AUDIO.edgeWind);
    await ensureSpatialTrack('tidePool', PLACE_AMBIENCE_AUDIO.tidePool);
    await ensureSpatialTrack('scrubInsects', ISLAND_AMBIENCE_AUDIO.insects);
    exposeDebugState();
    return true;
  })();
  return deferredAudioPreload;
}

export function preloadSoundscapeToolEffects() {
  // On phones the requested effect will load when its cue plays. A single
  // tool contact shouldn't start decoding the entire fieldwork library.
  if (isConstrainedMemoryDevice()) return Promise.resolve(false);
  if (toolFoleyPreload) return toolFoleyPreload;
  toolFoleyPreload = Promise.all(
    [...TOOL_FOLEY_AUDIO_URLS, ...HAMMER_STRIKE_AUDIO_URLS, ...FIELD_FOLEY_AUDIO_URLS, ...INTERACTION_AUDIO_URLS].map(loadAudioBuffer),
  ).then(buffers => {
    const ready = buffers.every(Boolean);
    if (!ready) toolFoleyPreload = null;
    return ready;
  });
  return toolFoleyPreload;
}

function startupAmbientKeys() {
  // Wind and rain can load from setAmbientAudioTargets when they are audible.
  return Object.keys(isConstrainedMemoryDevice() ? LAUNCH_AMBIENCE_TARGETS : ISLAND_AMBIENCE_AUDIO);
}

export async function activatePostOfficeBayAudio({ preloadEffects = false } = {}) {
  const context = ensureAudioGraph();
  if (!context) return false;
  if (context.state !== 'running') {
    try {
      await context.resume();
    } catch {
      exposeDebugState();
      return false;
    }
  }
  await Promise.all(
    startupAmbientKeys().map(key => ensureAmbientTrack(key, ISLAND_AMBIENCE_AUDIO[key])),
  );
  if (preloadEffects) await preloadSoundscapeEffects();
  exposeDebugState();
  return context.state === 'running';
}

export function startLaunchAmbientPrelude() {
  const context = audioState.context;
  if (!context || context.state !== 'running') return false;
  const insects = audioState.ambient.get('insects');
  const surf = audioState.ambient.get('surf');
  if (!insects || !surf) return false;

  audioState.targets.wind = 0;
  audioState.targets.rain = 0;
  audioState.targets.insects = LAUNCH_AMBIENCE_TARGETS.insects;
  audioState.targets.surf = LAUNCH_AMBIENCE_TARGETS.surf;
  audioState.targets.occlusion = 0;

  scheduleGain(
    insects.gain.gain,
    effectiveContinuousGain('insects', LAUNCH_AMBIENCE_TARGETS.insects),
    0,
    1.1,
  );
  scheduleGain(
    surf.gain.gain,
    effectiveContinuousGain('surf', LAUNCH_AMBIENCE_TARGETS.surf),
    LAUNCH_SURF_DELAY_SECONDS,
    1.35,
  );
  exposeDebugState();
  return true;
}

export function setSoundscapeAudioEnabled(enabled) {
  audioState.enabled = Boolean(enabled);
  if (audioState.master) rampGain(audioState.master.gain, effectiveMasterGain(), 0.16);
  exposeDebugState();
}

// Re-applies the player's volume preference to the live graph. Called while a
// volume slider is being dragged so the change is audible immediately rather
// than at the next ambient retarget.
export function refreshPlayerAudioVolume() {
  if (audioState.master) rampGain(audioState.master.gain, effectiveMasterGain(), 0.05);
}

export function setSoundscapeEnvironmentDebug(environment = null) {
  audioState.debug.environment = environment ? { ...environment } : null;
  exposeDebugState();
}

function ambientCutoffFor(key, occlusion = 0) {
  const indoorCutoff = { surf: 1150, wind: 1500, rain: 4200, insects: 2300 }[key] || 2200;
  return 16000 + (indoorCutoff - 16000) * Math.max(0, Math.min(1, Number(occlusion) || 0));
}

export function setAmbientAudioTargets({ surf = 0, wind = 0, rain = 0, insects = 0, occlusion = 0 }, timeConstant = 0.8) {
  audioState.targets.surf = Math.max(0, surf);
  audioState.targets.wind = Math.max(0, wind);
  audioState.targets.rain = Math.max(0, rain);
  audioState.targets.insects = Math.max(0, insects);
  audioState.targets.occlusion = Math.max(0, Math.min(1, Number(occlusion) || 0));
  for (const key of ['surf', 'wind', 'rain', 'insects']) {
    const track = audioState.ambient.get(key);
    if (track) {
      rampGain(track.gain.gain, effectiveContinuousGain(key, audioState.targets[key]), timeConstant);
      rampValue(track.filter?.frequency, ambientCutoffFor(key, audioState.targets.occlusion), Math.min(timeConstant, 0.3));
    } else if (audioState.targets[key] > 0 && audioState.context?.state === 'running') {
      // A transient fetch/decode failure must not permanently remove an
      // environmental bed while the context itself continues to look healthy.
      // The per-key promise map makes this safe to call from the 240 ms mixer.
      void ensureAmbientTrack(key, ISLAND_AMBIENCE_AUDIO[key]);
    }
  }
  exposeDebugState();
}

export function setSpatialAudioTarget(key, {
  gain = 0,
  pan = 0,
  playbackRate = 1,
  filterHz = 20000,
  position = null,
} = {}, timeConstant = 0.12) {
  const target = {
    position: worldPoint(position),
    gain: Math.max(0, Math.min(0.25, Number(gain) || 0)),
    pan: Math.max(-0.75, Math.min(0.75, Number(pan) || 0)),
    playbackRate: Math.max(0.88, Math.min(1.12, Number(playbackRate) || 1)),
    filterHz: Math.max(300, Math.min(20000, Number(filterHz) || 20000)),
  };
  audioState.spatialTargets.set(key, target);
  const track = audioState.spatial.get(key);
  if (track) {
    rampGain(track.gain.gain, effectiveContinuousGain(key, target.gain), timeConstant);
    rampValue(track.panner?.pan, target.pan, Math.min(timeConstant, 0.1));
    routeSpatialTrack(track, target);
    rampValue(track.source.playbackRate, target.playbackRate, 0.16);
    rampValue(track.filter?.frequency, target.filterHz, Math.max(0.2, timeConstant));
  } else if (target.gain > 0 && audioState.enabled && audioState.context?.state === 'running'
    && isConstrainedMemoryDevice()) {
    const definition = AUDIO_DEBUG_TRACK_BY_KEY.get(key);
    if (definition?.kind === 'spatial') void ensureSpatialTrack(key, definition.url);
  }
  exposeDebugState();
}

// Would playAudioSprite start this sprite right now? Callers that schedule a
// voice for later (a distant call's travel delay) ask first, so a call dropped
// for a full voice budget or an undecoded bank is not counted as heard.
export function audioSpriteReady(sprite, { family = null, priority = false } = {}) {
  const context = audioState.context;
  if ((!audioState.enabled && !audioState.debugControl.forceEnabled)
    || !context
    || context.state !== 'running'
    || !sprite?.url
    // Footfalls now carry a foliage brush and cloth layer, so a run through
    // scrub holds several short voices at once; the old cap of 7 started
    // dropping the footsteps themselves.
    || audioState.voices.size >= (priority ? 12 : 10)
    || !debugAllowsTrack(family)) return false;
  if (audioState.buffers.has(sprite.url)) return true;
  if (isConstrainedMemoryDevice()) void loadAudioBuffer(sprite.url);
  return false;
}

export function playAudioSprite(sprite, {
  family,
  index,
  gain = 0.2,
  playbackRate = 1,
  pan = 0,
  priority = false,
  filterHz = null,
  send = 1,
  position = null,
  // Play only part of the slot: from `offset` seconds in, for `duration`
  // seconds, with a short fade so the cut does not click.
  offset = 0,
  duration = null,
} = {}) {
  if (!audioSpriteReady(sprite, { family, priority })) return false;
  const context = audioState.context;
  const buffer = audioState.buffers.get(sprite.url);

  const safeIndex = Math.max(0, Math.min(sprite.variants - 1, Math.floor(index || 0)));
  const source = context.createBufferSource();
  const voiceGain = context.createGain();
  const filter = Number.isFinite(filterHz) ? context.createBiquadFilter() : null;
  const point = audioListener.ready ? worldPoint(position) : null;
  const worldPanner = point ? createWorldPanner(context) : null;
  const panner = worldPanner || (typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null);
  source.buffer = buffer;
  source.playbackRate.value = Math.max(0.88, Math.min(1.28, playbackRate));
  const baseGain = Math.max(0, Math.min(0.5, gain));
  voiceGain.gain.value = Math.max(0, Math.min(1.5, baseGain * trackTrimGain(family)));
  if (filter) {
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(250, Math.min(18000, filterHz));
    filter.Q.value = 0.3;
    source.connect(filter);
    filter.connect(voiceGain);
  } else {
    source.connect(voiceGain);
  }
  if (panner) {
    if (worldPanner) setPannerPosition(worldPanner, point);
    else panner.pan.value = Math.max(-0.25, Math.min(0.25, pan));
    voiceGain.connect(panner);
    panner.connect(audioState.master);
  } else {
    voiceGain.connect(audioState.master);
  }

  let sendGain = null;
  if (audioState.space && acousticSpaceId !== 'open' && send > 0) {
    sendGain = context.createGain();
    sendGain.gain.value = Math.min(1, send);
    voiceGain.connect(sendGain);
    sendGain.connect(audioState.space.input);
  }

  const voice = { source, filter, voiceGain, panner, family, baseGain };
  audioState.voices.add(voice);
  source.onended = () => {
    source.disconnect();
    filter?.disconnect();
    voiceGain.disconnect();
    sendGain?.disconnect();
    panner?.disconnect();
    audioState.voices.delete(voice);
    exposeDebugState();
  };
  const startOffset = Math.max(0, Math.min(sprite.slotDuration - 0.02, Number(offset) || 0));
  const length = Number.isFinite(duration) && duration > 0
    ? Math.min(duration, sprite.slotDuration - startOffset)
    : sprite.slotDuration - startOffset;
  if (Number.isFinite(duration) && duration > 0) {
    const now = context.currentTime;
    const level = voiceGain.gain.value;
    const fade = Math.min(0.04, length * 0.4);
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(level, now + 0.006);
    voiceGain.gain.setValueAtTime(level, now + length / source.playbackRate.value - fade);
    voiceGain.gain.linearRampToValueAtTime(0, now + length / source.playbackRate.value);
  }
  source.start(0, safeIndex * sprite.slotDuration + startOffset, length);
  if (family && Object.hasOwn(audioState.debug.events, family)) audioState.debug.events[family] += 1;
  audioState.debug.lastEvent = { family, index: safeIndex, at: performance.now() };
  exposeDebugState();
  return true;
}

// Interface cues: the paper, pencil and bell sounds the HUD plays (see
// interfaceFoley.js). They are dry, never sent into the cave or cliff space,
// and skip a variant's immediate repeat. A cue asked for before its sprite
// has decoded starts the load and stays silent this once.
const interfaceLastVariant = new Map();

export function playInterfaceCue(key, { gain = 0.1, playbackRate = 1, pan = 0, offset = 0, duration = null } = {}) {
  const family = INTERFACE_CUE_FAMILIES[key];
  const sprite = INTERFACE_AUDIO[key];
  if (!family || !sprite?.url) return false;
  if (!audioState.buffers.has(sprite.url)) {
    loadAudioBuffer(sprite.url);
    return false;
  }
  const last = interfaceLastVariant.get(key);
  let index = Math.floor(Math.random() * sprite.variants);
  if (sprite.variants > 1 && index === last) index = (index + 1) % sprite.variants;
  interfaceLastVariant.set(key, index);
  return playAudioSprite(sprite, {
    family,
    index,
    gain,
    playbackRate,
    pan,
    priority: true,
    send: 0,
    offset,
    duration,
  });
}

const INTERFACE_CUE_FAMILIES = Object.freeze({
  bookOpen: 'uiBookOpen',
  bookClose: 'uiBookClose',
  pageTurn: 'uiPageTurn',
  paperOpen: 'uiPaperOpen',
  paperClose: 'uiPaperClose',
  mapUnroll: 'uiMapUnroll',
  mapRoll: 'uiMapRoll',
  pencil: 'uiPencil',
  nib: 'uiNib',
  shipBell: 'duskBell',
  tabFlick: 'uiTab',
  sealPress: 'uiSeal',
  detent: 'uiDetent',
  feltThud: 'uiRefused',
});

// Synthesized reward chime for the collection celebration — no sample asset,
// so it rides the shared context/master and obeys the mute toggle like every
// other sound. Higher rarities earn a longer arpeggio and a shimmer tail.
const COLLECTION_CHIME_TIERS = Object.freeze({
  common: { notes: [523.25, 783.99], spacing: 0.085, peak: 0.1, decay: 0.85 },
  notable: { notes: [587.33, 880.0], spacing: 0.085, peak: 0.11, decay: 0.95 },
  remarkable: { notes: [523.25, 659.25, 987.77], spacing: 0.105, peak: 0.12, decay: 1.15, shimmer: 0.02 },
  singular: { notes: [523.25, 659.25, 783.99, 1046.5], spacing: 0.125, peak: 0.13, decay: 1.5, shimmer: 0.03 },
});

// Sighting sting: shorter and quieter than the collect chime.
const SIGHTING_STING_TIERS = Object.freeze({
  common: { notes: [659.25, 880.0], spacing: 0.09, peak: 0.05, decay: 0.55 },
  notable: { notes: [698.46, 932.33], spacing: 0.09, peak: 0.055, decay: 0.6 },
  remarkable: { notes: [783.99, 1046.5], spacing: 0.1, peak: 0.06, decay: 0.7 },
  singular: { notes: [783.99, 987.77, 1318.5], spacing: 0.11, peak: 0.065, decay: 0.85 },
});

export function playSightingSting(tierId = 'common') {
  return playBellPhrase(SIGHTING_STING_TIERS[tierId] || SIGHTING_STING_TIERS.common);
}

export function playCollectionChime(tierId = 'common') {
  return playBellPhrase(COLLECTION_CHIME_TIERS[tierId] || COLLECTION_CHIME_TIERS.common);
}

function playBellPhrase(tier) {
  const context = audioState.context;
  if ((!audioState.enabled && !audioState.debugControl.forceEnabled)
    || !context
    || context.state !== 'running'
    || !audioState.master) return false;
  const now = context.currentTime + 0.02;

  const bell = (frequency, start, peak, decay) => {
    // Fundamental plus a quieter octave partial reads as a small glass bell.
    [[frequency, 1], [frequency * 2, 0.32]].forEach(([hz, weight]) => {
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * weight), start + 0.014);
      env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(env);
      env.connect(audioState.master);
      osc.start(start);
      osc.stop(start + decay + 0.05);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    });
  };

  tier.notes.forEach((frequency, index) => {
    const last = index === tier.notes.length - 1;
    bell(frequency, now + index * tier.spacing, tier.peak, tier.decay * (last ? 1.35 : 1));
  });

  if (tier.shimmer) {
    // A quiet tremolo sparkle two octaves up, over the final note's tail.
    const start = now + (tier.notes.length - 1) * tier.spacing + 0.05;
    const osc = context.createOscillator();
    const env = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = tier.notes[tier.notes.length - 1] * 3;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(tier.shimmer, start + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    lfo.frequency.value = 9;
    lfoDepth.gain.value = tier.shimmer * 0.6;
    lfo.connect(lfoDepth);
    lfoDepth.connect(env.gain);
    osc.connect(env);
    env.connect(audioState.master);
    osc.start(start);
    lfo.start(start);
    osc.stop(start + 1.5);
    lfo.stop(start + 1.5);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      lfo.disconnect();
      lfoDepth.disconnect();
    };
  }
  return true;
}

export function soundscapeAudioIsRunning() {
  return audioState.context?.state === 'running';
}

export function soundscapeAmbientIsReady() {
  return soundscapeAudioIsRunning()
    && startupAmbientKeys().every(key => audioState.ambient.has(key));
}

function reapplyDebugControl(timeConstant = 0.08) {
  if (audioState.master) rampGain(audioState.master.gain, effectiveMasterGain(), timeConstant);
  for (const [key, track] of audioState.ambient) {
    rampGain(track.gain.gain, effectiveContinuousGain(key, audioState.targets[key]), timeConstant);
  }
  for (const [key, track] of audioState.spatial) {
    const target = audioState.spatialTargets.get(key) || { gain: 0, pan: 0, playbackRate: 1 };
    rampGain(track.gain.gain, effectiveContinuousGain(key, target.gain), timeConstant);
  }
  for (const voice of audioState.voices) {
    rampGain(
      voice.voiceGain.gain,
      debugAllowsTrack(voice.family)
        ? Math.min(1.5, voice.baseGain * trackTrimGain(voice.family))
        : 0,
      Math.min(timeConstant, 0.04),
    );
  }
  exposeDebugState();
}

function debugTrackSnapshot(definition) {
  const url = definition.url || definition.sprite?.url;
  const ambientTrack = definition.kind === 'ambient' ? audioState.ambient.get(definition.key) : null;
  const spatialTrack = definition.kind === 'spatial' ? audioState.spatial.get(definition.key) : null;
  const track = ambientTrack || spatialTrack;
  const rawTarget = definition.kind === 'ambient'
    ? audioState.targets[definition.key] || 0
    : definition.kind === 'spatial'
      ? audioState.spatialTargets.get(definition.key)?.gain || 0
      : null;
  const mixTrimDb = trackTrimDb(definition.key);
  return {
    key: definition.key,
    label: definition.label,
    group: definition.group,
    kind: definition.kind,
    url,
    loaded: audioState.buffers.has(url),
    loading: definition.kind === 'ambient'
      ? audioState.ambientPromises.has(definition.key)
      : audioState.bufferPromises.has(url) && !audioState.buffers.has(url),
    running: Boolean(track),
    targetGain: rawTarget,
    effectiveTargetGain: rawTarget == null ? null : rawTarget * trackTrimGain(definition.key),
    actualGain: track?.gain?.gain?.value || 0,
    filterHz: ambientTrack?.filter?.frequency?.value || null,
    diagnosticGain: definition.diagnosticGain,
    mixTrimDb,
    authoredMixDb: AUTHORED_MIX.tracks[definition.key] || 0,
    mixMultiplier: trackTrimGain(definition.key),
    muted: audioState.debugControl.mutedKeys.has(definition.key),
    solo: audioState.debugControl.soloKey === definition.key,
    eventCount: audioState.debug.events[definition.key] || 0,
    variants: definition.sprite?.variants || null,
  };
}

export function getSoundscapeAudioDebugSnapshot() {
  hydrateMixSettings();
  exposeDebugState();
  return {
    capturedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    contextState: audioState.context?.state || 'uninitialized',
    sampleRate: audioState.context?.sampleRate || null,
    baseLatency: audioState.context?.baseLatency || null,
    outputLatency: audioState.context?.outputLatency || null,
    enabled: audioState.enabled,
    forcedForDiagnostics: audioState.debugControl.forceEnabled,
    baseMasterGain: BASE_MASTER_GAIN,
    masterGain: audioState.master?.gain?.value || 0,
    masterTrimDb: audioState.mix.masterDb,
    masterTrimMultiplier: dbToGain(audioState.mix.masterDb),
    mixRanges: {
      master: { min: MASTER_TRIM_MIN_DB, max: MASTER_TRIM_MAX_DB },
      track: { min: TRACK_TRIM_MIN_DB, max: TRACK_TRIM_MAX_DB },
    },
    soloKey: audioState.debugControl.soloKey,
    mutedKeys: [...audioState.debugControl.mutedKeys],
    activeVoices: audioState.voices.size,
    loadedAssetCount: audioState.buffers.size,
    pendingAssetCount: audioState.bufferPromises.size - audioState.buffers.size,
    lastLoadError: audioState.debug.lastLoadError,
    lastEvent: audioState.debug.lastEvent,
    eventCounts: { ...audioState.debug.events },
    environment: audioState.debug.environment ? { ...audioState.debug.environment } : null,
    tracks: AUDIO_DEBUG_TRACKS.map(debugTrackSnapshot),
  };
}

export function getSoundscapeAudioMixSettings() {
  const payload = soundscapeMixPayload();
  return {
    ...payload,
    trackLabels: Object.fromEntries(
      Object.keys(payload.tracks).map(key => [key, AUDIO_DEBUG_TRACK_BY_KEY.get(key)?.label || key]),
    ),
  };
}

export function setSoundscapeAudioMasterTrimDb(db) {
  hydrateMixSettings();
  audioState.mix.masterDb = clamp(db, MASTER_TRIM_MIN_DB, MASTER_TRIM_MAX_DB);
  persistMixSettings();
  reapplyDebugControl(0.035);
  return audioState.mix.masterDb;
}

export function setSoundscapeAudioTrackTrimDb(key, db) {
  hydrateMixSettings();
  if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) return null;
  const safeDb = clamp(db, TRACK_TRIM_MIN_DB, TRACK_TRIM_MAX_DB);
  if (Math.abs(safeDb) < 0.001) audioState.mix.trackDb.delete(key);
  else audioState.mix.trackDb.set(key, safeDb);
  persistMixSettings();
  reapplyDebugControl(0.035);
  return safeDb;
}

export function resetSoundscapeAudioTrackTrim(key) {
  return setSoundscapeAudioTrackTrimDb(key, 0);
}

export function resetSoundscapeAudioMix() {
  hydrateMixSettings();
  audioState.mix.masterDb = 0;
  audioState.mix.trackDb.clear();
  persistMixSettings();
  reapplyDebugControl(0.06);
  return soundscapeMixPayload();
}

export async function activateSoundscapeAudioFromDebug() {
  const running = await activatePostOfficeBayAudio({ preloadEffects: true });
  reapplyDebugControl(0.04);
  return running;
}

export function setSoundscapeAudioDebugSolo(key = null) {
  const safeKey = AUDIO_DEBUG_TRACK_BY_KEY.has(key) ? key : null;
  audioState.debugControl.soloKey = safeKey;
  audioState.debugControl.forceEnabled = Boolean(safeKey);
  if (safeKey) audioState.debugControl.mutedKeys.delete(safeKey);
  reapplyDebugControl();
}

export function toggleSoundscapeAudioDebugMute(key) {
  if (!AUDIO_DEBUG_TRACK_BY_KEY.has(key)) return false;
  if (audioState.debugControl.mutedKeys.has(key)) audioState.debugControl.mutedKeys.delete(key);
  else audioState.debugControl.mutedKeys.add(key);
  if (audioState.debugControl.mutedKeys.has(key) && audioState.debugControl.soloKey === key) {
    audioState.debugControl.soloKey = null;
    audioState.debugControl.forceEnabled = false;
  }
  reapplyDebugControl();
  return audioState.debugControl.mutedKeys.has(key);
}

export function clearSoundscapeAudioDebugOverrides() {
  audioState.debugControl.soloKey = null;
  audioState.debugControl.mutedKeys.clear();
  audioState.debugControl.forceEnabled = false;
  reapplyDebugControl(0.12);
}

export async function auditionSoundscapeAudioTrack(key) {
  const definition = AUDIO_DEBUG_TRACK_BY_KEY.get(key);
  if (!definition) return false;
  audioState.debugControl.mutedKeys.delete(key);
  audioState.debugControl.soloKey = key;
  audioState.debugControl.forceEnabled = true;
  const running = await activatePostOfficeBayAudio({ preloadEffects: false });
  if (!running) {
    reapplyDebugControl();
    return false;
  }
  if (definition.kind === 'ambient') {
    await ensureAmbientTrack(key, definition.url);
  } else if (definition.kind === 'spatial') {
    await ensureSpatialTrack(key, definition.url);
  } else {
    await loadAudioBuffer(definition.sprite.url);
  }
  reapplyDebugControl(0.035);
  if (definition.kind !== 'sprite') return true;
  return playAudioSprite(definition.sprite, {
    family: key,
    index: Math.floor(Math.random() * definition.sprite.variants),
    gain: definition.diagnosticGain,
    playbackRate: 1,
    pan: 0,
  });
}

export async function retrySoundscapeAudioTrack(key) {
  const definition = AUDIO_DEBUG_TRACK_BY_KEY.get(key);
  if (!definition) return false;
  const collection = definition.kind === 'ambient'
    ? audioState.ambient
    : definition.kind === 'spatial'
      ? audioState.spatial
      : null;
  const current = collection?.get(key);
  if (current) {
    collection.delete(key);
    current.source.onended = null;
    try { current.source.stop(); } catch { /* Already stopped. */ }
    current.source.disconnect();
    current.filter?.disconnect();
    current.gain.disconnect();
    current.panner?.disconnect();
    current.worldPanner?.disconnect();
  }
  const url = definition.url || definition.sprite?.url;
  audioState.buffers.delete(url);
  audioState.bufferPromises.delete(url);
  audioState.debug.lastLoadError = null;
  if (definition.kind === 'ambient') await ensureAmbientTrack(key, url);
  else if (definition.kind === 'spatial') await ensureSpatialTrack(key, url);
  else await loadAudioBuffer(url);
  reapplyDebugControl();
  return audioState.buffers.has(url);
}

exposeDebugState();
