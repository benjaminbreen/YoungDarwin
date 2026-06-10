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
    mass: 7,
    friction: 0.85,
    restitution: 0.18,
    // Low damping so a barrel on its side genuinely rolls down inclines.
    linearDamping: 0.18,
    angularDamping: 0.12,
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
  crate: {
    label: 'crate',
    visual: 'crate',
    collider: { shape: 'cuboid', halfExtents: [0.48, 0.42, 0.48] },
    restOffset: 0.46,
    mass: 10,
    friction: 1.05,
    restitution: 0.08,
    linearDamping: 0.4,
    angularDamping: 0.5,
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
