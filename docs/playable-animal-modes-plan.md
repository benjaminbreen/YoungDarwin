# Playable Animal Modes Plan

This document records the intended architecture for expanding animal play beyond
finch and tortoise without adding a new web of species checks for every mode.
It is a direction for future work, not a claim that every part is implemented.

## Design Goal

Animal modes should make the same Floreana landscape legible through different
bodies, senses, risks, affordances, and timescales. They are not novelty skins
for Darwin and should not become miniature zoology lessons.

Adding an ordinary playable animal should eventually require:

1. One playable-animal profile referencing a species in the wildlife catalog.
2. Action icons and concise player-facing copy.
3. A small embodied narrator profile.
4. A renderer adapter only when the species uses a render family not already
   supported.
5. A new action-effect handler only when the mechanic is genuinely reusable and
   not expressible with the existing action vocabulary.

The first implementation pass may touch several existing seams. After that
refactor, new species should not require substantial controller, HUD, narrator,
or multiplayer rewrites.

## One Profile Per Playable Animal

Use one pure-data definition as the authoring unit. Finch and tortoise should be
migrated into the same format before new species rely on it.

An illustrative profile:

```js
defineAnimalMode({
  id: 'racer',
  speciesId: 'galapagosracer',

  locomotion: {
    family: 'grounded',
    style: 'serpentine',
    speed: 1.25,
    collider: { radius: 0.1, height: 0.12 },
  },

  camera: { pivotY: 0.12, minDistance: 0.8, maxDistance: 2.8 },

  senses: ['ground-vibration', 'scent', 'warmth'],
  drives: ['hunger', 'warmth', 'alarm'],

  actions: [
    { id: 'taste-air', effect: 'sense', animation: 'tongueTaste' },
    { id: 'bask', effect: 'rest', animation: 'baskCoil' },
    { id: 'strike', effect: 'contact', animation: 'preyStrike' },
    { id: 'hide', effect: 'seek-shelter', animation: 'creviceRetreat' },
  ],

  narrator: {
    identityAnswer: 'Snake. Warm ground. Tongue finds what passed.',
    attention: ['heat', 'movement through earth', 'near scent', 'cover'],
    cadence: ['Still. Taste again.', 'Heavy steps. Near.', 'Warm rock first.'],
  },

  multiplayer: {
    unique: true,
    speedCap: 2.2,
    observableActions: ['taste-air', 'bask', 'strike', 'hide'],
  },
});
```

`speciesId` should resolve render metadata, the asset ID, collision baseline,
and available behavior/animation vocabulary from
`three-game/wildlife/wildlifeCatalog.js`. Do not duplicate that information in
the playable profile.

Keep the profile serializable. Action implementations should use stable effect
IDs rather than arbitrary functions embedded in the data.

## Small Stable Runtime Registries

The runtime only needs three deliberately small extension points:

### Locomotion families

- `grounded`: tortoise, racer, lava lizard, crab, and most future walkers or
  crawlers. Species tune speed, acceleration, turning, slope response, collider,
  and visual movement style.
- `flight`: finch and possible future dove, hawk, or owl modes.
- `hopper`: locust-scale ballistic movement and contextual perching.

Do not move autonomous fauna AI wholesale into `PlayerController`. Player input
continues to drive the existing player phases. Share environmental queries such
as rock-perch and shelter discovery where useful.

### Render families

- Manifest-driven animated GLB.
- Procedural bird.
- Procedural tortoise.
- Procedural snake.
- Procedural lizard.
- Procedural insect.

A renderer registry should replace mode-ID branches in `PlayerAvatarModel`.
Each renderer consumes the same semantic motion state: idle, moving, airborne,
and the current animation intent.

### Action effects

A compact initial vocabulary is sufficient:

- `pose`
- `forage`
- `rest`
- `leave-trace`
- `sense`
- `contact`
- `contextual-move`

The species profile supplies labels, icons, requirements, cooldown, animation
intent, and parameters. A stable handler registry supplies the implementation.
For example, a lizard's rock-hop and a bird's perch can both be contextual moves
with different target kinds.

## Subjectivity

Animal narration should be generated from immediate body state and perceived
facts, not from a long species encyclopedia. The generic animal system prompt
should stay strict and brief. Each profile contributes:

- Immediate senses and perceptual priorities.
- Bodily drives that can interrupt abstract thought.
- Concepts or forms of knowledge the animal cannot use.
- A short identity impulse.
- Cadence examples rather than a large bank of canned replies.
- Initial and fallback narration.

The game should produce small sensory facts for the LLM to translate. A racer's
`taste-air` action might yield `fresh bird scent, west`; a cold lizard might
receive `warmth overwhelms the question`; a finch may register a fast shadow or
a usable perch. The LLM still answers, but it is constrained by actual game
state rather than being asked to invent generic animal flavor.

Species-specific UI should follow the same data:

- The toolbar renders `mode.actions`, not a fixed
  `eat / sleep / defecate` list.
- Status rows render the drives declared by the mode.
- Control hints come from locomotion and action definitions.
- Action art, labels, descriptions, and availability belong to the action
  definition.

Prefer a small number of meaningful drives over a generalized survival
simulation.

## Multiplayer

Multiplayer currently treats Darwin and tortoise as hard-coded unique roles and
has tortoise-specific communication. Future animal modes require a pure-data,
network-safe projection of playable role metadata shared by the browser and
Worker:

- Role ID, label, kind, uniqueness, and reported speed cap.
- An allow-list of observable behavior action IDs.
- Generic animal-behavior events rather than a tortoise-only intent endpoint.

The animal player should receive an embodied result while Darwin receives an
interpretive observation. For example, a snake experiences scent and vibration;
Darwin sees that it raises its head and tastes the air. Preserve that asymmetry:
it makes animal multiplayer playful and supports the game's interest in
observation and interpretation.

## Recommended Species Order

### 1. Floreana racer snake

The existing procedural racer already supports bask coil, tongue taste, ground
slither, hunting, alert S-curve, prey strike, crevice retreat, and shelter
stillness. It is the best acceptance test for the profile architecture.

Promising actions:

- Taste the air.
- Bask in a coil.
- Strike or feint.
- Retreat into nearby cover.

### 2. Floreana lava lizard

The existing basker behavior darts, hops onto real rock colliders, climbs their
surfaces, perches, basks, and flees. The procedural renderer needs a small
semantic-motion adapter before those behaviors can be deliberately player
controlled.

Promising actions:

- Bask.
- Rock-hop.
- Display.
- Dart.

### 3. Sally Lightfoot crab

The crab has distinct eating, walking, and sideways-strafe animation and would
add a low shoreline perspective without repeating bird flight.

Promising actions:

- Graze algae.
- Scuttle sideways.
- Wave claws.
- Wedge into a rock gap.

### Later candidates

The painted locust is a useful stress test for extreme scale, hopping, wing
flashes, antenna attention, and plant or rock perching. Dove, hawk, and owl can
extend the flight family once it is profile-driven.

Do not enable a species merely because it has a model. The marine iguana, for
example, currently maps idle, walk, and run to the same single clip and needs a
real animation vocabulary before it can support satisfying play.

## Incremental Migration

1. Add the profile format and express current tortoise and finch behavior
   through it without changing gameplay.
2. Preserve current getters and store shapes as a compatibility facade.
3. Make the toolbar, mobile controls, HUD labels, narrator, control hints, and
   avatar renderer consume profile data.
4. Move hard-coded action execution into the small effect-handler registry.
5. Generalize multiplayer roles and observable behavior events.
6. Add racer as the first acceptance test.
7. Add lava lizard and then crab.

Add a profile-contract test that iterates every playable animal and verifies
that its species, renderer, locomotion family, actions, action art, narrator
profile, and animation intents resolve. Keep broad E2E coverage organized by
locomotion family, with a short launch/action check for each species.

Do not build a general ECS, a behavior scripting language, or a second wildlife
catalog to accomplish this plan.

## Tortoise Vision Experiment

The tortoise-only spectral treatment is an interpretive visualization, not a
literal reconstruction of Floreana giant tortoise perception. Its art direction
is deliberately emphatic: animal subjectivity should be unmistakable during
play, even when that requires a stylized translation rather than a timid filter.

Chelonian retinas studied in other turtle and tortoise species contain several
cone classes and colored oil droplets that spectrally filter incoming light.
Behavioral work also supports color discrimination during foraging, although
reported red/yellow preferences vary by species and individual. Exact spectral
sensitivity has not been established for the extinct Floreana population.

An RGB display contains no ultraviolet channel and the current game textures do
not contain measured UV reflectance. The runtime therefore must not claim to
show ultraviolet itself. The experiment instead:

- Uses a low, close, wide camera so nearby plants and the tortoise's bodily
  scale dominate the view.
- Strongly separates red, yellow, leafy-green, and short-wave detail while
  preserving enough scene luminance for terrain and weather to remain legible.
- Uses violet as an acknowledged visual proxy for short-wave sensitivity.
- Gives vegetation that is actually forageable by the current animal a soft,
  localized magenta-gold bloom while retaining its natural surface color. This
  is ecological UI embedded in the world, not a claim about the literal color
  of ultraviolet.
- Briefly blooms into the treatment on mode entry and intensifies during
  stillness, making visual adaptation and patient attention perceptible.
- Applies the treatment to the world render, not the HUD.
- Stores general spectral and camera tuning on the playable-mode profile.
  Forage highlighting attaches to the shared forage renderer and queries mode
  eligibility, so future animals can reuse the affordance without species
  branches scattered through scene materials.

Relevant starting literature:

- Ohtsuka, “Relation of spectral types to oil droplets in cones of turtle
  retina,” *Science* 229 (1985), https://doi.org/10.1126/science.4023716
- Toomey and Corbo, “Evolution, Development and Function of Vertebrate Cone Oil
  Droplets,” *Frontiers in Neural Circuits* 11 (2017),
  https://doi.org/10.3389/fncir.2017.00097
- Pellitteri-Rosa et al., “Do Hermann's tortoises discriminate colours?”
  *Italian Journal of Zoology* 77 (2010),
  https://doi.org/10.1080/11250000903464067
- Spiezio et al., “Assessing colour preference in Aldabra giant tortoises,”
  *Behavioural Processes* 145 (2017),
  https://doi.org/10.1016/j.beproc.2017.10.006
