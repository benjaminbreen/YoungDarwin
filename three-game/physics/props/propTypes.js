// Prop *type* definitions: shared physics + behavior config for each kind of
// physics prop. Instances (placed per zone) live in propRegistry.js.
//
// Behavior modules a type can opt into:
//   carryable  — E-key pickup/carry/drop (object goes kinematic while held)
//   breakable  — smashed by a tool swing; bursts into debris and grants loot
//   strikeable — tool hits knock it around instead of breaking it
//   buoyant    — floats on the sea: bobs at rideHeight above WATER_LEVEL and
//                drifts with the current (props without it sink to the seabed)
//   mobility   — explicit interaction category:
//                pickup, push, pickup-push, downhill-push, fixed, or none
//                Optional rotationPolicy keeps heavy props from tumbling like
//                hollow toys: resistTipping, autoBarrel, or free.
// Future: hinged (doors), slippery (trip hazard), avalanche triggers.

export const PROP_TYPES = {
  barrel: {
    label: 'barrel',
    visual: 'barrel',
    collider: { shape: 'cylinder', halfHeight: 0.45, radius: 0.48 },
    restOffset: 0.5,
    mass: 48,
    friction: 2.15,
    restitution: 0,
    // Heavy field objects should shove slowly, then settle quickly.
    linearDamping: 3.1,
    angularDamping: 3.2,
    behaviors: {
      mobility: {
        mode: 'push',
        assistSpeed: 0.22,
        maxSpeed: 0.42,
        blend: 0.12,
        rotationPolicy: 'autoBarrel',
        angularMax: 1.05,
        uprightAngularMax: 0.24,
      },
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
      mobility: { mode: 'fixed' },
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
    mass: 64,
    friction: 2.35,
    restitution: 0,
    linearDamping: 3.6,
    angularDamping: 3.4,
    behaviors: {
      mobility: {
        mode: 'push',
        assistSpeed: 0.18,
        maxSpeed: 0.34,
        blend: 0.1,
        rotationPolicy: 'resistTipping',
        angularMax: 0.22,
      },
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
  terracottaPot: {
    label: 'terracotta pot',
    visual: 'pot',
    visualAsset: 'terracottaPot',
    collider: { shape: 'cylinder', halfHeight: 0.5, radius: 0.42 },
    restOffset: 0.51,
    mass: 5,
    friction: 1.05,
    restitution: 0.04,
    linearDamping: 0.7,
    angularDamping: 0.72,
    behaviors: {
      mobility: {
        mode: 'pickup-push',
        assistSpeed: 0.48,
        maxSpeed: 0.82,
        blend: 0.24,
        rotationPolicy: 'resistTipping',
        angularMax: 0.62,
      },
      carryable: {
        release: 0.42,
        holdHeight: 1.02,
        holdOffset: [0.13, 0.94, 0.08],
        holdRotation: [0.06, -0.08, -0.14],
        holdScale: 0.62,
      },
      breakable: {
        tool: 'hammer',
        debris: 'crate',
        loot: {
          supplies: { labels: 1 },
          message: 'The terracotta pot cracks apart. A dry scrap of wrapping paper is tucked inside.',
          syms: '"Useful for labels, if not for pottery."',
        },
      },
    },
  },
  brokenWoodenCrate: {
    label: 'broken wooden crate',
    visual: 'crate',
    visualAsset: 'brokenWoodenCrate',
    collider: { shape: 'cuboid', halfExtents: [0.46, 0.42, 0.5] },
    restOffset: 0.43,
    mass: 42,
    friction: 1.85,
    restitution: 0,
    linearDamping: 2.4,
    angularDamping: 2.2,
    behaviors: {
      mobility: {
        mode: 'push',
        assistSpeed: 0.18,
        maxSpeed: 0.38,
        blend: 0.12,
        rotationPolicy: 'resistTipping',
        angularMax: 0.26,
      },
      breakable: {
        tool: 'hammer',
        debris: 'crate',
        loot: {
          supplies: { labels: 2, twine: 1 },
          message: 'The broken crate gives way completely. Usable twine and a few dry labels spill out.',
          syms: '"No shortage of broken boxes on this shore, sir."',
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
      mobility: { mode: 'pickup-push', assistSpeed: 0.7, maxSpeed: 1.15, blend: 0.28 },
      carryable: {
        release: 0.6,
        holdHeight: 1.02,
        holdOffset: [0.32, 1.0, 0.24],
        holdRotation: [0.08, -0.18, -0.18],
      },
      // Basalt shrugs off the hammer; it gets knocked rolling instead.
      strikeable: { tool: 'hammer', impulse: 14 },
    },
  },
};
