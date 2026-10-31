// Gabriel's cave: four linked chambers of one highland lava tube.
//
// Each blueprint has the same shape as the house/cabin JSON blueprints
// (navigation, colliders, inspectables, rests, prop spawns, map) plus a `cave`
// block: the 2D plan, floor and ceiling profile that caveField.js turns into
// the rock shell and the walkable floor. Edit the plan here and both the
// rendered rock and the movement floor follow.
//
// The chambers form a loop, so the player is never forced to backtrack:
//
//   Rocky Clearing ── Mouth Gallery ──(west)── Living Chamber
//                          │                        │
//                       (east)                   (north)
//                          │                        │
//                     Fern Spring ───(west)──── Press Gallery
//
// Game coordinates: +x east, +y up, +z south (toward the cave mouth).
// Gabriel Puig i Ferrer and everything he owns here are invented; see the
// sources catalogue. Lava-tube geology and Floreana ecology are not.

export const GABRIEL_CAVE_MOUTH_ZONE_ID = 'CAVE_ENTRANCE';
export const GABRIEL_CAVE_QUARTERS_ZONE_ID = 'GABRIEL_QUARTERS';
export const GABRIEL_CAVE_PRESS_ZONE_ID = 'GABRIEL_PRESS';
export const GABRIEL_CAVE_SPRING_ZONE_ID = 'GABRIEL_SPRING';

export const GABRIEL_CAVE_ZONE_IDS = [
  GABRIEL_CAVE_MOUTH_ZONE_ID,
  GABRIEL_CAVE_QUARTERS_ZONE_ID,
  GABRIEL_CAVE_PRESS_ZONE_ID,
  GABRIEL_CAVE_SPRING_ZONE_ID,
];

// Deterministic wobbly ellipse for chamber plans.
function blob(cx, cz, rx, rz, { points = 22, wobble = 0.12, seed = 1, rotation = 0 } = {}) {
  const result = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const n = Math.sin(a * 3 + seed * 1.7) * 0.5 + Math.sin(a * 5 - seed * 2.3) * 0.32 + Math.sin(a * 2 + seed) * 0.18;
    const scale = 1 + n * wobble;
    const x = Math.cos(a) * rx * scale;
    const z = Math.sin(a) * rz * scale;
    result.push([
      +(cx + x * Math.cos(rotation) - z * Math.sin(rotation)).toFixed(3),
      +(cz + x * Math.sin(rotation) + z * Math.cos(rotation)).toFixed(3),
    ]);
  }
  return result;
}

const SHARED_TINT = {
  basalt: [0.4, 0.385, 0.37],
  oxide: [0.56, 0.355, 0.265],
  crust: [0.76, 0.735, 0.67],
  oxideStrength: 0.6,
  crustStrength: 0.42,
};

const EXIT_TO_SURFACE = {
  toRegionId: 'E_MID',
  entryEdge: 'from-gabriels-cave',
  label: 'Climb back to Rocky Clearing',
  description: 'Retrace the lava tube to the daylight at the cave mouth.',
};

// ---------------------------------------------------------------------------
// 1. Mouth Gallery
// ---------------------------------------------------------------------------

const MOUTH_WALK_OUTLINE = [
  [-4.3, 12.4], [-4.7, 9.2], [-5.9, 7.6], [-5.6, 5.4], [-4.3, 4.6], [-4.5, 1.8],
  [-3.7, -1.6], [-4.3, -4.6], [-6.1, -7.6], [-8.0, -10.6], [-9.7, -13.9],
  [-8.6, -15.4], [-6.7, -13.4], [-4.4, -10.4], [-2.0, -8.9], [0.4, -9.0],
  [2.6, -10.2], [5.0, -12.6], [6.8, -14.9], [8.4, -14.1], [6.9, -10.9],
  [4.8, -7.2], [4.3, -3.8], [5.3, -0.6], [6.4, 1.4], [6.0, 3.9], [4.6, 4.6],
  [5.2, 8.6], [4.7, 12.4],
];

const mouthBlueprint = {
  id: GABRIEL_CAVE_MOUTH_ZONE_ID,
  label: "Gabriel's Cave: Mouth Gallery",
  dimensions: { width: 36, depth: 46, ceiling: 5, floorY: 0 },
  map: {
    planLabel: 'Cave survey',
    exitLabel: 'ROCKY CLEARING',
    exitAt: [0.2, 13.4],
    paper: '#d6c9a4',
    ink: '#3f2e1f',
    labels: [
      { text: 'Breakdown', at: [2.6, 9.6] },
      { text: 'Lookout', at: [-1.6, 3.2] },
      { text: 'Fork', at: [0.2, -6.6] },
    ],
    passages: [
      { label: 'LIVING CHAMBER', at: [-9.6, -15.6] },
      { label: 'FERN SPRING', at: [8.2, -15.8] },
    ],
  },
  navigation: {
    defaultSpawn: [0.3, 0, 9.2],
    entrySpawns: {
      'from-rocky-clearing': [0.3, 0, 9.2],
      'from-quarters': [-6.0, 0, -9.4],
      'from-spring': [5.0, 0, -10.0],
    },
    entryFacings: {
      'from-rocky-clearing': [0, 0, -1],
      'from-quarters': [0.6, 0, 0.8],
      'from-spring': [-0.55, 0, 0.83],
    },
    transitions: [
      {
        id: 'mouth-gallery-to-rocky-clearing',
        toRegionId: 'E_MID',
        label: 'Step out into Rocky Clearing',
        description: 'Climb over the breakdown at the cave mouth and back into the highland light.',
        entryEdge: 'from-gabriels-cave',
        position: [0.2, 11.6],
        radius: 2.2,
        closeRadius: 1.4,
        facing: [0, 1],
        routeLabel: 'Cave mouth',
      },
      {
        id: 'mouth-gallery-to-quarters',
        toRegionId: GABRIEL_CAVE_QUARTERS_ZONE_ID,
        label: 'Follow the firelight west',
        description: 'Duck under the hide curtain into the passage that smells of woodsmoke.',
        entryEdge: 'from-mouth-gallery',
        position: [-8.9, -14.4],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [-0.5, -0.86],
        routeLabel: 'Smoke-stained passage',
      },
      {
        id: 'mouth-gallery-to-spring',
        toRegionId: GABRIEL_CAVE_SPRING_ZONE_ID,
        label: 'Descend toward the green light',
        description: 'The eastern branch drops toward the sound of dripping water.',
        entryEdge: 'from-mouth-gallery',
        position: [7.4, -14.4],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [0.55, -0.83],
        routeLabel: 'Descending passage',
      },
    ],
  },
  cave: {
    grid: { min: [-15, -3, -21], max: [15, 11, 21], step: 0.25 },
    air: {
      blend: 0.9,
      polygons: [MOUTH_WALK_OUTLINE],
      capsules: [
        // Passages continue into darkness beyond the walkable threshold.
        { a: [-8.6, -14.2], b: [-11.6, -19.4], r: 1.3, rb: 1.05 },
        { a: [7.3, -14.0], b: [10.4, -19.2], r: 1.3, rb: 1.0 },
        // Breakdown chamber just inside the mouth.
        { a: [-2.2, 10.6], b: [3.4, 10.8], r: 1.4 },
      ],
    },
    walk: {
      margin: 0.32,
      polygons: [MOUTH_WALK_OUTLINE],
      holes: [],
    },
    floor: {
      base: 0,
      ripple: 0.05,
      bumps: [
        { x: -2.6, z: 10.2, r: 1.1, h: 0.18 },
        { x: 4.6, z: 2.2, r: 1.4, h: 0.12 },
      ],
      ramps: [
        { a: [3.6, -8.2], b: [10.4, -19.2], ya: 0, yb: -2.0, r: 2.2 },
        { a: [-3.6, -8.6], b: [-11.6, -19.4], ya: 0, yb: 0.45, r: 2.2 },
      ],
    },
    ceiling: {
      spring: 1.35,
      apex: 4.5,
      reach: 3.1,
      noise: 0.46,
      bumps: [
        { x: 0, z: 11, r: 3.6, h: 0.8 },
        { x: -9.2, z: -15.4, r: 3.0, h: -1.55 },
        { x: 8.0, z: -15.4, r: 3.0, h: -1.25 },
        { x: 0.2, z: -6.4, r: 3.2, h: 0.5 },
      ],
    },
    walls: { amp: 0.36, scale: 0.68 },
    // The outside floor sits well below the exterior apron, which covers it.
    outside: { at: 12.6, floorY: -2.4, lip: 1.6, noise: 1.2, blend: 1.1 },
    skylights: [],
    tint: SHARED_TINT,
    paint: {
      floorDamp: 0.16,
      ceilingSeep: 0.32,
      wet: [
        { x: 3.6, y: 0.1, z: -2.2, r: 1.4, strength: 0.75 },
        { x: 3.4, y: 4.3, z: -2.4, r: 1.2, strength: 0.6 },
        { x: 8.2, z: -15.6, r: 3.2, strength: 0.6 },
      ],
      soot: [
        { x: 0.2, y: 2.4, z: -6.3, r: 0.7, spread: 0.6, strength: 0.55 },
        { x: -9.0, y: 0.4, z: -15.0, r: 1.2, spread: 0.9, strength: 0.6 },
      ],
      moss: [
        { x: 0.2, y: 1.2, z: 13.4, r: 3.6, strength: 0.75, facing: [0, 0.4, 1] },
        { x: -3.8, y: 2.8, z: 12.2, r: 1.9, strength: 0.5 },
        { x: 4.2, y: 2.4, z: 12.2, r: 1.9, strength: 0.45 },
      ],
    },
    wallHeight: 3.4,
  },
  fixedColliders: [
    { id: 'lookout-parapet', kind: 'structure', position: [-2.05, 0.55, 3.5], size: [4.1, 1.1, 0.75], yaw: 0.06 },
    { id: 'breakdown-west', kind: 'structure', position: [-2.7, 0.6, 10.3], size: [1.7, 1.2, 1.4], yaw: 0.4 },
    { id: 'breakdown-east', kind: 'structure', position: [3.3, 0.45, 9.9], size: [1.3, 0.9, 1.1], yaw: -0.3 },
    { id: 'firewood-stack', kind: 'furniture', position: [-4.75, 0.45, 6.5], size: [1.1, 0.9, 1.7], yaw: 0.12 },
    { id: 'rain-barrel', kind: 'furniture', position: [3.55, 0.45, -2.2], size: [0.72, 0.9, 0.72], yaw: 0 },
    { id: 'fork-pillar', kind: 'structure', position: [-0.6, 1.4, -9.7], size: [2.2, 2.8, 0.9], yaw: 0.1 },
  ],
  inspectables: [
    {
      id: 'mouth-lava-tube',
      mode: 'interior-message',
      label: 'lava tube',
      text: 'Press E to study the tube walls',
      message: 'The walls carry horizontal ledges, one above another, like the tide-marks of a draining basin. A river of lava crusted over here and its molten core ran on and out, leaving this hollow behind. Each ledge marks a level at which the flow once stood.',
      position: [-3.9, 1.2, -0.8],
      radius: 1.6,
    },
    {
      id: 'mouth-lookout',
      mode: 'interior-message',
      label: 'stone breastwork',
      text: 'Press E to look over the breastwork',
      message: 'Fist-sized stones are fitted dry into a low wall across half the tube. A man crouched behind it can see the whole clearing outside the mouth and not be seen. The stones on top are worn smooth by elbows.',
      position: [-1.6, 0.9, 2.7],
      radius: 1.6,
    },
    {
      id: 'mouth-alarm-line',
      mode: 'interior-message',
      label: 'cord strung with shells',
      text: 'Press E to examine the cord',
      message: 'A cord of twisted bark fibre crosses the passage at shin height, hung with limpet shells. Anyone who blunders in after dark will announce himself. You step over it carefully.',
      position: [0.2, 0.3, 7.6],
      radius: 1.8,
    },
    {
      id: 'mouth-rain-barrel',
      mode: 'interior-message',
      label: 'rain barrel',
      text: 'Press E to look into the barrel',
      message: 'A salvaged ship\'s cask stands beneath a seep in the roof, more than half full of clear, cold water. A tin cup hangs from a nail on its rim. In the dry season this slow drip would be worth more than anything else in the cave.',
      position: [3.55, 0.9, -2.2],
      radius: 1.5,
    },
    {
      id: 'mouth-goat-skull',
      mode: 'interior-message',
      label: 'goat skull',
      text: 'Press E to examine the skull',
      message: 'The skull of a feral goat, horns intact, has been set on a ledge facing the entrance. Whoever lives here eats from the herds the settlers let loose on the island. The skull may be a trophy, a warning, or a joke.',
      position: [5.2, 1.4, 2.4],
      radius: 1.4,
    },
    {
      id: 'mouth-firewood',
      mode: 'interior-message',
      label: 'firewood stack',
      text: 'Press E to examine the firewood',
      message: 'Split lengths of palo santo and scalesia, stacked under the overhang to keep them dry. The palo santo still smells of incense when you lift a piece.',
      position: [-4.5, 0.9, 6.5],
      radius: 1.6,
    },
  ],
  rests: [],
  narrationTriggers: [
    {
      id: 'arrival',
      mode: 'arrival',
      text: 'The cave mouth swallows the daylight within a few paces. Ahead, the tube runs on into the hill, and somewhere deeper someone has a fire burning.',
    },
    {
      id: 'mouth-fork',
      position: [0.2, 0, -6.2],
      radius: 2.6,
      text: 'The tube divides around a pillar of rock. Woodsmoke drifts from the western branch; from the eastern comes a green glow and the sound of water.',
    },
  ],
  propSpawns: [
    { id: 'gabriel-mouth-bucket', type: 'woodenBucket', x: 2.7, y: 0.4, z: -1.6, rotation: [0, 0.4, 0] },
    { id: 'gabriel-mouth-stone-a', type: 'stone', x: -0.9, y: 0.3, z: 8.4, rotation: [0, 0.6, 0] },
    { id: 'gabriel-mouth-crate', type: 'crate', x: -3.6, y: 0.5, z: 1.4, rotation: [0, 0.3, 0] },
  ],
  fixedModels: [],
  books: [],
};

// ---------------------------------------------------------------------------
// 2. Living Chamber
// ---------------------------------------------------------------------------

const QUARTERS_CHAMBER = blob(0, 0, 6.6, 5.2, { points: 26, wobble: 0.08, seed: 3 });
const QUARTERS_BED_ALCOVE = blob(-6.6, -1.0, 2.5, 2.1, { points: 16, wobble: 0.08, seed: 5 });
const QUARTERS_PANTRY = blob(4.6, -3.8, 2.0, 1.7, { points: 14, wobble: 0.1, seed: 9 });

const quartersBlueprint = {
  id: GABRIEL_CAVE_QUARTERS_ZONE_ID,
  label: "Gabriel's Cave: Living Chamber",
  dimensions: { width: 36, depth: 36, ceiling: 5.2, floorY: 0 },
  map: {
    planLabel: 'Cave survey',
    exitLabel: 'MOUTH GALLERY',
    exitAt: [10.8, 9.4],
    paper: '#d6c9a4',
    ink: '#3f2e1f',
    labels: [
      { text: 'Hearth', at: [-1.2, 2.2] },
      { text: 'Sleeping niche', at: [-6.8, 1.6] },
      { text: 'Larder', at: [4.8, -5.8] },
    ],
    passages: [
      { label: 'MOUTH GALLERY', at: [10.6, 9.8] },
      { label: 'PRESS GALLERY', at: [-3.6, -12.4] },
    ],
  },
  navigation: {
    defaultSpawn: [7.0, 0, 5.2],
    entrySpawns: {
      'from-mouth-gallery': [7.0, 0, 5.2],
      'from-press': [-2.2, 0, -7.4],
    },
    entryFacings: {
      'from-mouth-gallery': [-0.78, 0, -0.62],
      'from-press': [0.25, 0, 0.97],
    },
    transitions: [
      {
        id: 'quarters-to-mouth-gallery',
        toRegionId: GABRIEL_CAVE_MOUTH_ZONE_ID,
        label: 'Return to the mouth gallery',
        description: 'Follow the passage back toward the daylight.',
        entryEdge: 'from-quarters',
        position: [9.6, 7.9],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [0.72, 0.69],
        routeLabel: 'Passage to the mouth',
      },
      {
        id: 'quarters-to-press',
        toRegionId: GABRIEL_CAVE_PRESS_ZONE_ID,
        label: 'Follow the inky passage north',
        description: 'A narrow passage, its walls smudged black by inky hands.',
        entryEdge: 'from-quarters',
        position: [-3.25, -10.4],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [-0.27, -0.96],
        routeLabel: 'Passage to the press',
      },
    ],
  },
  cave: {
    grid: { min: [-12, -2, -15.5], max: [14, 10, 14], step: 0.25 },
    air: {
      blend: 1.1,
      polygons: [QUARTERS_CHAMBER, QUARTERS_BED_ALCOVE, QUARTERS_PANTRY],
      capsules: [
        { a: [4.6, 3.0], b: [13.0, 10.8], r: 1.4, rb: 1.1 },
        { a: [-1.4, -4.2], b: [-4.0, -14.2], r: 1.35, rb: 1.05 },
      ],
    },
    walk: {
      margin: 0.32,
      polygons: [QUARTERS_CHAMBER, QUARTERS_BED_ALCOVE, QUARTERS_PANTRY],
      capsules: [
        { a: [4.6, 3.0], b: [9.9, 8.2], r: 1.2 },
        { a: [-1.4, -4.2], b: [-3.3, -10.8], r: 1.15 },
      ],
      holes: [],
    },
    floor: {
      base: 0,
      ripple: 0.035,
      bumps: [
        { x: -6.8, z: -1.0, r: 2.0, h: 0.1 },
      ],
      ramps: [
        { a: [5.0, 3.4], b: [13.0, 10.8], ya: 0, yb: 0.35, r: 2.0 },
        { a: [-1.4, -4.4], b: [-4.0, -14.2], ya: 0, yb: 0.3, r: 2.0 },
      ],
    },
    ceiling: {
      spring: 1.25,
      apex: 5.0,
      reach: 4.2,
      noise: 0.5,
      bumps: [
        { x: -6.8, z: -1.0, r: 2.2, h: -2.2 },
        { x: 4.6, z: -3.8, r: 1.8, h: -1.9 },
        { x: 10.6, z: 8.6, r: 3.2, h: -1.6 },
        { x: -3.4, z: -11.4, r: 3.2, h: -1.6 },
      ],
    },
    walls: { amp: 0.34, scale: 0.72 },
    skylights: [
      // A natural flue above the hearth draws the smoke out.
      { x: -1.5, z: 0.4, r: 0.55, from: 4.0, flare: 0.05, noise: 0.35, blend: 0.6 },
    ],
    tint: SHARED_TINT,
    paint: {
      floorDamp: 0.08,
      ceilingSeep: 0.18,
      wet: [],
      soot: [
        { x: -1.2, y: 0.4, z: 0.8, r: 1.3, spread: 0.85, strength: 1.15 },
        { x: 2.6, y: 1.1, z: -2.6, r: 0.5, spread: 0.6, strength: 0.4 },
      ],
      moss: [
        { x: -1.5, y: 6.0, z: 0.4, r: 1.0, strength: 0.4 },
      ],
    },
    wallHeight: 3.4,
  },
  fixedColliders: [
    { id: 'hearth-ring', kind: 'structure', position: [-1.2, 0.18, 0.8], size: [1.5, 0.36, 1.5], yaw: 0 },
    { id: 'sleeping-platform', kind: 'furniture', position: [-6.75, 0.3, -1.05], size: [2.25, 0.6, 1.15], yaw: 0.18 },
    { id: 'crate-table', kind: 'furniture', position: [2.7, 0.42, -2.0], size: [1.55, 0.84, 0.9], yaw: -0.22 },
    { id: 'larder-shelf', kind: 'furniture', position: [4.9, 0.8, -4.7], size: [2.1, 1.6, 0.7], yaw: -0.35 },
    { id: 'log-seat-west', kind: 'furniture', position: [-2.95, 0.22, 1.85], size: [0.95, 0.44, 0.45], yaw: 0.9 },
    { id: 'log-seat-east', kind: 'furniture', position: [0.65, 0.22, 2.2], size: [0.95, 0.44, 0.45], yaw: -0.8 },
    { id: 'water-jars', kind: 'furniture', position: [-4.1, 0.4, -3.7], size: [1.2, 0.8, 0.7], yaw: 0.4 },
  ],
  inspectables: [
    {
      id: 'quarters-hearth',
      mode: 'interior-message',
      label: 'hearth',
      text: 'Press E to crouch by the hearth',
      message: 'A ring of fire-cracked basalt holds a bed of embers that has not been allowed to die. An iron pot hangs from a tripod of green branches: goat, cooked with wild guava and something peppery you cannot name. The smoke climbs straight up into a black slot in the roof.',
      position: [-1.2, 0.5, 0.8],
      radius: 1.75,
    },
    {
      id: 'quarters-cap',
      mode: 'interior-message',
      label: 'red cap',
      text: 'Press E to look at the red cap',
      message: 'A red woollen cap hangs from a peg driven into a crack in the wall, faded at the crown and carefully darned. In Barcelona or Paris such a cap would mark its wearer as a republican. Here there is no one to see it but its owner.',
      position: [-4.35, 1.6, -3.35],
      radius: 1.4,
    },
    {
      id: 'quarters-tally',
      mode: 'interior-message',
      label: 'scratched wall',
      text: 'Press E to examine the scratches',
      message: 'Above the sleeping niche someone has scratched tally marks into the soft oxidised crust, in bundles of five, row on row. You count more than four hundred before the rows become too faint to follow. A date is cut beneath the first row: 1833.',
      position: [-7.6, 1.5, -2.5],
      radius: 1.6,
    },
    {
      id: 'quarters-map',
      mode: 'interior-message',
      label: 'hide map',
      text: 'Press E to study the map',
      message: 'A map of the island drawn in charcoal on scraped goatskin. It marks the springs, the settlement, the paths the guards use and the hours they walk them. Post Office Bay is a small barrel. The Beagle\'s anchorage is not yet on it.',
      position: [1.0, 1.6, -4.85],
      radius: 1.5,
    },
    {
      id: 'quarters-letters',
      mode: 'interior-message',
      label: 'letters',
      text: 'Press E to look at the letters',
      message: 'A packet of letters tied with tape, in Catalan and French, addressed to G. Puig at a printing house in Barcelona, then at a lodging in Paris, then care of a mechanics\' society in Boston. The most recent is three years old. You do not untie them.',
      position: [2.7, 1.0, -2.0],
      radius: 1.5,
    },
    {
      id: 'quarters-larder',
      mode: 'interior-message',
      label: 'larder shelf',
      text: 'Press E to inspect the larder',
      message: 'A rock shelf holds gourds of water, a sack of settlement maize, dried guava, strips of goat meat, a twist of tobacco and a crock of salt scraped from the coastal rocks. Enough to wait out a search, if the search is brief.',
      position: [4.8, 1.0, -4.3],
      radius: 1.6,
    },
  ],
  rests: [
    {
      id: 'gabriel-pallet-rest',
      label: 'straw pallet',
      position: [-5.7, 0, -0.6],
      radius: 1.9,
      restPose: [-6.75, 0.65, -1.05],
      facing: [0, 0, 1],
    },
  ],
  restNarration: 'You lie on the straw pallet and listen to the embers settle. Two hours pass. Once you wake sure that someone is standing in the passage, watching; when you look, there is no one.',
  narrationTriggers: [
    {
      id: 'arrival',
      mode: 'arrival',
      text: 'The passage opens into a domed chamber, warm and close with woodsmoke. This is where someone lives: a hearth, a bed, a larder, and the careful order of a man who expects to leave in a hurry.',
    },
    {
      id: 'quarters-bed',
      position: [-6.4, 0, -1.0],
      radius: 2.4,
      text: 'The sleeping niche is lined with dry grass and a blanket of coarse grey wool. A book lies face down beside the pillow, as if its reader had left mid-sentence.',
    },
  ],
  propSpawns: [
    { id: 'gabriel-quarters-stool', type: 'cabinStool', x: 2.4, y: 0.4, z: -0.9, rotation: [0, 2.6, 0] },
    { id: 'gabriel-quarters-jug', type: 'earthenwareJug', x: -3.5, y: 0.4, z: -2.6, rotation: [0, 0.3, 0] },
    { id: 'gabriel-quarters-mug', type: 'lawsonTinMug', x: 0.35, y: 0.6, z: 2.35, rotation: [0, 1.1, 0] },
    { id: 'gabriel-quarters-bowl', type: 'lawsonServingBowl', x: -2.6, y: 0.6, z: 2.05, rotation: [0, 0, 0] },
    { id: 'gabriel-quarters-bucket', type: 'woodenBucket', x: -4.8, y: 0.4, z: -3.0, rotation: [0, 0.5, 0] },
    { id: 'gabriel-quarters-candle', type: 'cabinCandlestick', x: 2.25, y: 1.15, z: -2.1, rotation: [0, 0, 0] },
  ],
  fixedModels: [],
  books: [],
};

// ---------------------------------------------------------------------------
// 3. Press Gallery
// ---------------------------------------------------------------------------

const PRESS_WEST = blob(-4.0, 0.0, 6.0, 3.4, { points: 24, wobble: 0.07, seed: 13 });
const PRESS_EAST = blob(4.2, -0.3, 5.8, 3.2, { points: 24, wobble: 0.07, seed: 17 });

const pressBlueprint = {
  id: GABRIEL_CAVE_PRESS_ZONE_ID,
  label: "Gabriel's Cave: Press Gallery",
  dimensions: { width: 38, depth: 30, ceiling: 4.4, floorY: 0 },
  map: {
    planLabel: 'Cave survey',
    exitLabel: 'LIVING CHAMBER',
    exitAt: [-11.2, 8.4],
    paper: '#d6c9a4',
    ink: '#3f2e1f',
    labels: [
      { text: 'Press', at: [0.4, 1.4] },
      { text: 'Type cases', at: [-4.6, -1.2] },
      { text: 'Stone', at: [4.1, -1.0] },
      { text: 'Paper', at: [6.2, 2.9] },
    ],
    passages: [
      { label: 'LIVING CHAMBER', at: [-11.0, 8.8] },
      { label: 'FERN SPRING', at: [14.2, -4.2] },
    ],
  },
  navigation: {
    defaultSpawn: [-8.0, 0, 3.6],
    entrySpawns: {
      'from-quarters': [-8.0, 0, 3.6],
      'from-spring': [10.2, 0, -1.4],
    },
    entryFacings: {
      'from-quarters': [0.78, 0, -0.62],
      'from-spring': [-0.98, 0, 0.18],
    },
    transitions: [
      {
        id: 'press-to-quarters',
        toRegionId: GABRIEL_CAVE_QUARTERS_ZONE_ID,
        label: 'Return to the living chamber',
        description: 'Follow the inky passage back toward the hearth.',
        entryEdge: 'from-press',
        position: [-10.6, 6.5],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [-0.6, 0.8],
        routeLabel: 'Passage to the hearth',
      },
      {
        id: 'press-to-spring',
        toRegionId: GABRIEL_CAVE_SPRING_ZONE_ID,
        label: 'Follow the dripping passage east',
        description: 'A low crawl, cool and damp, toward the sound of water.',
        entryEdge: 'from-press',
        position: [13.4, -2.45],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [0.95, -0.3],
        routeLabel: 'Damp crawl',
      },
    ],
  },
  cave: {
    grid: { min: [-15, -2, -9], max: [18, 9, 12.5], step: 0.25 },
    air: {
      blend: 1.2,
      polygons: [PRESS_WEST, PRESS_EAST],
      capsules: [
        { a: [-7.2, 2.0], b: [-12.6, 9.4], r: 1.35, rb: 1.05 },
        { a: [8.2, -0.8], b: [16.6, -3.4], r: 1.3, rb: 0.95 },
      ],
    },
    walk: {
      margin: 0.32,
      polygons: [PRESS_WEST, PRESS_EAST],
      capsules: [
        { a: [-7.2, 2.0], b: [-10.8, 6.8], r: 1.15 },
        { a: [8.2, -0.8], b: [13.6, -2.5], r: 1.1 },
      ],
      holes: [],
    },
    floor: {
      base: 0,
      ripple: 0.03,
      bumps: [],
      ramps: [
        { a: [-7.2, 2.0], b: [-12.6, 9.4], ya: 0, yb: -0.3, r: 1.9 },
        { a: [8.4, -0.8], b: [16.6, -3.4], ya: 0, yb: -0.5, r: 1.8 },
      ],
    },
    ceiling: {
      spring: 1.45,
      apex: 4.1,
      reach: 2.9,
      noise: 0.4,
      bumps: [
        { x: 0.2, z: -0.2, r: 3.2, h: 0.35 },
        { x: -11.2, z: 7.6, r: 3.2, h: -1.3 },
        { x: 14.6, z: -2.8, r: 3.0, h: -1.5 },
      ],
    },
    walls: { amp: 0.3, scale: 0.75 },
    skylights: [],
    tint: SHARED_TINT,
    paint: {
      floorDamp: 0.06,
      ceilingSeep: 0.2,
      wet: [
        { x: 14.2, z: -2.8, r: 3.0, strength: 0.55 },
      ],
      soot: [
        { x: 0.4, y: 2.6, z: -0.2, r: 0.8, spread: 0.6, strength: 0.6 },
        { x: -4.6, y: 1.6, z: -2.8, r: 0.6, spread: 0.6, strength: 0.4 },
      ],
      moss: [],
    },
    wallHeight: 3.2,
  },
  fixedColliders: [
    { id: 'common-press', kind: 'furniture', position: [0.55, 1.05, -0.2], size: [3.4, 2.1, 1.25], yaw: 0 },
    { id: 'type-case-frame', kind: 'furniture', position: [-4.6, 0.6, -2.35], size: [2.0, 1.2, 0.9], yaw: 0.08 },
    { id: 'imposing-stone', kind: 'furniture', position: [4.1, 0.45, -2.15], size: [1.8, 0.9, 1.0], yaw: -0.06 },
    { id: 'ink-bench', kind: 'furniture', position: [-1.9, 0.4, 1.95], size: [1.4, 0.8, 0.7], yaw: 0.05 },
    { id: 'paper-trough', kind: 'furniture', position: [6.1, 0.35, 1.85], size: [1.6, 0.7, 0.85], yaw: -0.1 },
    { id: 'pamphlet-crates', kind: 'furniture', position: [8.3, 0.45, 1.0], size: [1.1, 0.9, 1.5], yaw: 0.2 },
    { id: 'shoring-post-west-n', kind: 'structure', position: [-2.6, 1.9, -2.55], size: [0.24, 3.8, 0.24], yaw: 0 },
    { id: 'shoring-post-west-s', kind: 'structure', position: [-2.6, 1.9, 2.45], size: [0.24, 3.8, 0.24], yaw: 0 },
    { id: 'shoring-post-east-n', kind: 'structure', position: [5.6, 1.9, -2.75], size: [0.24, 3.8, 0.24], yaw: 0 },
    { id: 'shoring-post-east-s', kind: 'structure', position: [5.6, 1.9, 2.25], size: [0.24, 3.8, 0.24], yaw: 0 },
  ],
  inspectables: [
    {
      id: 'press-common-press',
      mode: 'interior-message',
      label: 'wooden press',
      text: 'Press E to examine the press',
      message: 'A common wooden press of the old pattern, its cheeks and head adzed from island timber and pegged together without a single nail. Only the screw, the platen and the bar are iron, and those have been carried a long way. A forme of type is locked in the bed, inked and ready. One pull of the bar, one sheet.',
      position: [0.6, 1.0, 0.9],
      radius: 1.9,
    },
    {
      id: 'press-type-cases',
      mode: 'interior-message',
      label: 'type cases',
      text: 'Press E to examine the type cases',
      message: 'Two shallow cases of lead type on a sloping frame: capitals above, small letters below, each in its own box. The boxes for ñ and ç are full; the box for the letter k is empty, borrowed for some other purpose. A composing stick lies across the lower case with half a line set in it, backwards.',
      position: [-4.6, 1.0, -1.6],
      radius: 1.6,
    },
    {
      id: 'press-composing-stick',
      mode: 'interior-message',
      label: 'half-set line',
      text: 'Press E to read the half-set line',
      message: 'You read the metal letters from right to left, mirror-wise: "...LA TERRA ÉS DE QUI LA TREBALLA..." The land belongs to whoever works it. The line stops mid-word.',
      position: [-4.2, 1.05, -1.9],
      radius: 1.0,
    },
    {
      id: 'press-broadside-catalan',
      mode: 'interior-message',
      label: 'broadside',
      text: 'Press E to read the broadside',
      message: 'A broadside in Catalan, its type a little worn: "ALS TREBALLADORS DE TOTES LES ILLES." To the workers of all the islands. It argues that a colony built from convicts and soldiers is a workshop in which the island\'s labour is taken and its people are counted as stock. It closes by asking every reader to pass the sheet to someone who cannot read.',
      position: [-3.0, 1.6, 2.85],
      radius: 1.5,
    },
    {
      id: 'press-broadside-spanish',
      mode: 'interior-message',
      label: 'broadside',
      text: 'Press E to read the broadside',
      message: 'A sheet in Spanish headed "CATECISMO DEL DESTERRADO", the exile\'s catechism, laid out in questions and answers like a parish primer. "Who is your master? — No man. Who owns the spring? — Whoever is thirsty." The last answer has been struck out by hand and rewritten twice.',
      position: [0.4, 1.6, 2.95],
      radius: 1.5,
    },
    {
      id: 'press-broadside-english',
      mode: 'interior-message',
      label: 'English handbill',
      text: 'Press E to read the handbill',
      message: 'A smaller handbill, in uncertain English: "TO THE SAILORS OF THE WHALE SHIPS. Your owners grow rich at home while you eat worms at sea. On this island no man need be a servant." Someone has been studying how to reach the crews who put in at Post Office Bay.',
      position: [3.6, 1.6, 2.6],
      radius: 1.5,
    },
    {
      id: 'press-ink',
      mode: 'interior-message',
      label: 'ink bench',
      text: 'Press E to examine the ink bench',
      message: 'A slab of smooth basalt serves as an ink table. The ink is home-made: lampblack from the hearth ground into boiled oil, a little thick, a little brown. Two ink balls of goatskin stuffed with wool rest on their handles, ready to beat the ink onto the type.',
      position: [-1.9, 0.9, 1.6],
      radius: 1.5,
    },
    {
      id: 'press-paper',
      mode: 'interior-message',
      label: 'paper stock',
      text: 'Press E to examine the paper',
      message: 'The paper is the press\'s weakest point. Some is good rag stock, perhaps taken from the settlement\'s store; some is ship\'s logbook leaves turned over and printed on the back; some is the endpapers of books. Sheets soak in the trough so they will take the ink.',
      position: [6.1, 0.8, 1.5],
      radius: 1.5,
    },
    {
      id: 'press-bundles',
      mode: 'interior-message',
      label: 'tied bundles',
      text: 'Press E to examine the bundles',
      message: 'Finished pamphlets tied in bundles of fifty with tarred twine and wrapped in oilcloth against the damp, as if for a voyage. Three bundles are labelled in chalk: GUAYAQUIL, CALLAO, BOSTON.',
      position: [8.2, 0.9, 0.6],
      radius: 1.5,
    },
  ],
  rests: [],
  narrationTriggers: [
    {
      id: 'arrival',
      mode: 'arrival',
      text: 'The passage widens into a long gallery shored with rough timber, and the smell changes: linseed oil, lampblack, damp paper. In the middle of it, black with ink and use, stands a printing press.',
    },
    {
      id: 'press-drying-lines',
      position: [0.4, 0, 0.8],
      radius: 2.8,
      text: 'Printed sheets hang over your head on lines strung between the shoring posts, a ceiling of paper stirring in the cave\'s faint breath.',
    },
  ],
  propSpawns: [
    { id: 'gabriel-press-stool', type: 'cabinStool', x: -4.4, y: 0.4, z: -1.2, rotation: [0, 0.2, 0] },
    { id: 'gabriel-press-bucket', type: 'woodenBucket', x: 5.0, y: 0.4, z: 2.4, rotation: [0, 0.9, 0] },
    { id: 'gabriel-press-jug', type: 'earthenwareJug', x: -2.9, y: 0.4, z: 2.4, rotation: [0, -0.4, 0] },
    { id: 'gabriel-press-crate', type: 'crate', x: 8.6, y: 0.5, z: -1.8, rotation: [0, -0.2, 0] },
  ],
  fixedModels: [],
  books: [],
};

// ---------------------------------------------------------------------------
// 4. Fern Spring
// ---------------------------------------------------------------------------

const SPRING_CHAMBER = blob(0.4, -0.6, 7.2, 6.1, { points: 28, wobble: 0.09, seed: 21 });
const SPRING_POOL = blob(1.3, -2.0, 2.9, 2.1, { points: 18, wobble: 0.1, seed: 23 });

export const GABRIEL_SPRING_POOL = { x: 1.3, z: -2.0, rx: 2.9, rz: 2.1, surfaceY: -0.34, outline: SPRING_POOL };
export const GABRIEL_SPRING_SKYLIGHT = { x: 1.0, z: -2.4, r: 2.15, from: 4.4 };

const springBlueprint = {
  id: GABRIEL_CAVE_SPRING_ZONE_ID,
  label: "Gabriel's Cave: Fern Spring",
  dimensions: { width: 34, depth: 34, ceiling: 6, floorY: 0 },
  map: {
    planLabel: 'Cave survey',
    exitLabel: 'MOUTH GALLERY',
    exitAt: [-9.6, 10.6],
    paper: '#d6c9a4',
    ink: '#3f2e1f',
    labels: [
      { text: 'Spring', at: [1.3, -2.0] },
      { text: 'Cistern', at: [4.2, 3.4] },
      { text: 'Skylight', at: [1.0, -5.0] },
    ],
    passages: [
      { label: 'MOUTH GALLERY', at: [-9.6, 11.0] },
      { label: 'PRESS GALLERY', at: [-13.2, -4.0] },
    ],
  },
  navigation: {
    defaultSpawn: [-5.8, 0, 5.4],
    entrySpawns: {
      'from-mouth-gallery': [-5.8, 0, 5.4],
      'from-press': [-7.4, 0, -1.2],
    },
    entryFacings: {
      'from-mouth-gallery': [0.68, 0, -0.73],
      'from-press': [0.98, 0, -0.18],
    },
    transitions: [
      {
        id: 'spring-to-mouth-gallery',
        toRegionId: GABRIEL_CAVE_MOUTH_ZONE_ID,
        label: 'Climb toward the mouth gallery',
        description: 'The passage climbs back toward the cave mouth.',
        entryEdge: 'from-spring',
        position: [-8.7, 8.7],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [-0.68, 0.73],
        routeLabel: 'Climbing passage',
      },
      {
        id: 'spring-to-press',
        toRegionId: GABRIEL_CAVE_PRESS_ZONE_ID,
        label: 'Crawl west toward the press',
        description: 'A low, damp crawl leads west. You can smell linseed oil.',
        entryEdge: 'from-spring',
        position: [-11.5, -2.7],
        radius: 1.7,
        closeRadius: 1.1,
        facing: [-0.98, -0.2],
        routeLabel: 'Damp crawl',
      },
    ],
  },
  cave: {
    grid: { min: [-15, -2.5, -11.5], max: [12.5, 13, 14], step: 0.25 },
    air: {
      blend: 1.1,
      polygons: [SPRING_CHAMBER],
      capsules: [
        { a: [-4.0, 3.8], b: [-11.0, 11.4], r: 1.35, rb: 1.05 },
        { a: [-5.6, -1.4], b: [-14.0, -3.3], r: 1.25, rb: 0.95 },
      ],
    },
    walk: {
      margin: 0.32,
      polygons: [SPRING_CHAMBER],
      capsules: [
        { a: [-4.0, 3.8], b: [-8.9, 8.9], r: 1.15 },
        { a: [-5.6, -1.4], b: [-11.7, -2.75], r: 1.1 },
      ],
      holes: [SPRING_POOL],
    },
    floor: {
      base: 0,
      ripple: 0.04,
      bumps: [
        { x: 1.3, z: -2.0, r: 2.3, h: -0.95 },
        { x: 4.6, z: 2.6, r: 1.6, h: 0.12 },
      ],
      ramps: [
        { a: [-4.2, 4.0], b: [-11.0, 11.4], ya: 0, yb: 1.1, r: 2.1 },
        { a: [-5.8, -1.4], b: [-14.0, -3.3], ya: 0, yb: 0.25, r: 1.9 },
      ],
    },
    ceiling: {
      spring: 1.5,
      apex: 5.4,
      reach: 4.4,
      noise: 0.6,
      bumps: [
        { x: -9.4, z: 9.6, r: 3.2, h: -2.0 },
        { x: -12.0, z: -2.9, r: 3.2, h: -2.3 },
      ],
    },
    walls: { amp: 0.38, scale: 0.66 },
    skylights: [
      { x: GABRIEL_SPRING_SKYLIGHT.x, z: GABRIEL_SPRING_SKYLIGHT.z, r: GABRIEL_SPRING_SKYLIGHT.r, from: GABRIEL_SPRING_SKYLIGHT.from, flare: 0.16, noise: 0.9, blend: 1.2 },
    ],
    tint: { ...SHARED_TINT, oxideStrength: 0.45, crustStrength: 0.5 },
    paint: {
      floorDamp: 0.4,
      ceilingSeep: 0.45,
      wet: [
        { x: 1.3, y: -0.3, z: -2.0, r: 3.2, strength: 1.1 },
        { x: 1.0, y: 5.5, z: -2.4, r: 3.0, strength: 0.6 },
      ],
      soot: [],
      moss: [
        { x: 1.0, y: 3.4, z: -2.4, r: 4.6, strength: 1.25, facing: [0, 1, 0] },
        { x: 1.0, y: 7.0, z: -2.4, r: 3.6, strength: 1.2 },
        { x: 1.3, y: 0.2, z: -2.0, r: 3.8, strength: 0.7 },
      ],
    },
    wallHeight: 3.6,
  },
  fixedColliders: [
    { id: 'cistern-barrel', kind: 'furniture', position: [4.3, 0.55, 2.7], size: [0.95, 1.1, 0.95], yaw: 0 },
    { id: 'washing-stone', kind: 'structure', position: [-1.9, 0.25, 0.9], size: [1.4, 0.5, 0.95], yaw: 0.3 },
  ],
  inspectables: [
    {
      id: 'spring-pool',
      mode: 'interior-message',
      label: 'spring',
      text: 'Press E to look into the spring',
      message: 'Water drips from the lip of the skylight and from a hundred points on the roof, and gathers here in a basin of black rock. It is cold and perfectly clear; you can see the ropy surface of the old lava floor beneath it. On an island where the settlers fight over every seep, this is the most valuable thing Gabriel owns.',
      position: [1.3, 0.2, 0.4],
      radius: 2.2,
    },
    {
      id: 'spring-ferns',
      mode: 'interior-message',
      label: 'ferns and liverworts',
      text: 'Press E to examine the ferns',
      message: 'Where the light from the skylight falls on wet rock, the cave is green: delicate ferns with fan-shaped leaflets, flat liverworts pressed to the stone, and mosses beaded with water. A few paces outside the beam the rock is bare again. Plant life here is ruled by light, and the boundary is drawn as sharply as a shadow.',
      position: [3.4, 0.8, -4.0],
      radius: 1.9,
    },
    {
      id: 'spring-skylight',
      mode: 'interior-message',
      label: 'collapsed roof',
      text: 'Press E to look up through the skylight',
      message: 'Here the roof of the tube has fallen in, leaving a ragged hole open to the sky. Roots of the forest above hang down through it like ropes. The fallen roof lies beneath the spring, smashed into blocks and grown over. Lava tubes are hollow only until their ceilings fail.',
      position: [-0.6, 0.4, -4.4],
      radius: 1.9,
    },
    {
      id: 'spring-cache',
      mode: 'interior-message',
      label: 'niche in the wall',
      text: 'Press E to reach into the niche',
      message: 'Behind a loose block you find a tobacco tin wrapped in oilskin. Inside are a few Spanish dollars, a lock of dark hair tied with thread, and a list of names: perhaps people Gabriel trusts, perhaps people he is owed. You put everything back exactly as it was.',
      position: [-5.6, 1.1, -4.6],
      radius: 1.4,
    },
    {
      id: 'spring-washing',
      mode: 'interior-message',
      label: 'washing stone',
      text: 'Press E to examine the washing stone',
      message: 'A flat stone at the edge of the water, worn smooth from use. A linen shirt is spread on it to dry, mended so many times that the patches outnumber the original cloth.',
      position: [-1.9, 0.6, 0.9],
      radius: 1.5,
    },
  ],
  rests: [],
  narrationTriggers: [
    {
      id: 'arrival',
      mode: 'arrival',
      text: 'The passage opens into a high chamber where the roof has fallen in. Daylight pours through the hole onto ferns, moss, and a pool of still water, and every surface drips.',
    },
  ],
  propSpawns: [
    { id: 'gabriel-spring-bucket', type: 'woodenBucket', x: 3.3, y: 0.4, z: 3.2, rotation: [0, 0.2, 0] },
    { id: 'gabriel-spring-pot', type: 'terracottaPot', x: 5.0, y: 0.4, z: 1.4, rotation: [0, 0.5, 0] },
  ],
  fixedModels: [],
  books: [],
};

export const GABRIEL_CAVE_BLUEPRINTS = {
  [GABRIEL_CAVE_MOUTH_ZONE_ID]: mouthBlueprint,
  [GABRIEL_CAVE_QUARTERS_ZONE_ID]: quartersBlueprint,
  [GABRIEL_CAVE_PRESS_ZONE_ID]: pressBlueprint,
  [GABRIEL_CAVE_SPRING_ZONE_ID]: springBlueprint,
};

export const GABRIEL_CAVE_SURFACE_EXIT = EXIT_TO_SURFACE;

export function getGabrielCaveBlueprint(zoneId) {
  return GABRIEL_CAVE_BLUEPRINTS[zoneId] || null;
}
