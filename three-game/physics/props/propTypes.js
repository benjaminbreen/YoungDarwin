// Prop *type* definitions: shared physics + behavior config for each kind of
// physics prop. Instances (placed per zone) live in propRegistry.js.
//
// Behavior modules a type can opt into:
//   carryable  — E-key pickup/carry/drop (object goes kinematic while held)
//   breakable  — smashed by a tool swing; bursts into debris and grants loot
//   strikeable — tool hits knock it around instead of breaking it
//   buoyant    — floats on the sea: bobs at rideHeight above WATER_LEVEL and
//                drifts with the current (props without it sink to the seabed)
// Future: hinged (doors), slippery (trip hazard), avalanche triggers.

export const PROP_TYPES = {
  barrel: {
    label: 'barrel',
    visual: 'barrel',
    collider: { shape: 'cylinder', halfHeight: 0.45, radius: 0.48 },
    restOffset: 0.5,
    mass: 24,
    friction: 1.65,
    restitution: 0.03,
    // Heavy enough to stay in contact while pushed, but still able to roll.
    linearDamping: 1.05,
    angularDamping: 0.85,
    behaviors: {
      carryable: { release: 0.55, holdHeight: 1.02 },
      buoyant: { rideHeight: 0.12, strength: 34, drag: 2.4, angularDrag: 2.0, bob: 0.07, currentSpeed: 0.55 },
      breakable: {
        tool: 'hammer',
        debris: 'barrel',
        loot: {
          supplies: { food: 1, water: 1 },
          message: 'The hammer stoves in the barrel staves. Inside: ship’s biscuit still dry, and a small cask of fresh water.',
          syms: '"Whalers’ cache, sir. They won’t grudge a naturalist his biscuit."',
        },
      },
    },
  },
  postOfficeBayBarrel: {
    label: 'post office barrel',
    visual: 'barrel',
    visualAsset: 'postOfficeBayBarrel',
    collider: { shape: 'cylinder', halfHeight: 0.74, radius: 0.82 },
    restOffset: 0.82,
    fixed: true,
    mass: 80,
    friction: 1.05,
    restitution: 0.04,
    linearDamping: 1.2,
    angularDamping: 1.6,
    behaviors: {
      buoyant: { rideHeight: 0.06, strength: 28, drag: 3.2, angularDrag: 3.4, bob: 0.04, currentSpeed: 0.22 },
      breakable: {
        tool: 'hammer',
        debris: 'barrel',
        loot: {
          supplies: { food: 1, water: 1, labels: 2 },
          message: 'The old post barrel bursts into weathered staves. Inside are a few dry biscuits, a small water cask, and spare labels.',
          syms: '"That was rather direct, sir. Still, the labels are usable."',
        },
      },
    },
  },
  crate: {
    label: 'crate',
    visual: 'crate',
    collider: { shape: 'cuboid', halfExtents: [0.48, 0.42, 0.48] },
    restOffset: 0.46,
    mass: 28,
    friction: 1.8,
    restitution: 0.02,
    linearDamping: 1.45,
    angularDamping: 1.8,
    behaviors: {
      carryable: { release: 0.32, holdHeight: 0.95 },
      buoyant: { rideHeight: 0.05, strength: 30, drag: 2.8, angularDrag: 2.6, bob: 0.05, currentSpeed: 0.4 },
      breakable: {
        tool: 'hammer',
        debris: 'crate',
        loot: {
          supplies: { labels: 4, spareJars: 1, twine: 1 },
          message: 'The crate splits along its slats. Packed in straw: spare labels, a stoppered jar, and good waxed twine.',
          syms: '"Providence, sir — I was down to my last label."',
        },
      },
    },
  },
  stone: {
    label: 'loose stone',
    visual: 'stone',
    collider: { shape: 'ball', radius: 0.34 },
    restOffset: 0.36,
    mass: 4,
    friction: 0.9,
    restitution: 0.12,
    linearDamping: 0.22,
    angularDamping: 0.2,
    behaviors: {
      carryable: { release: 0.6, holdHeight: 1.02 },
      // Basalt shrugs off the hammer; it gets knocked rolling instead.
      strikeable: { tool: 'hammer', impulse: 14 },
    },
  },
};
