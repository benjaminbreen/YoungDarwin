// Placed prop instances per zone. Each entry references a type from
// propTypes.js; x/z are zone coordinates and the spawn height is resolved at
// mount from the movement terrain. Add new zones/props here.

import { PROP_TYPES } from './propTypes';
import { BEAGLE_CABIN_ZONE_ID, LAWSON_HOUSE_ZONE_ID, getInteriorPropSpawns } from '../../interiors/interiorRegistry';

export const ZONE_PROPS = {
  [BEAGLE_CABIN_ZONE_ID]: getInteriorPropSpawns(BEAGLE_CABIN_ZONE_ID),
  [LAWSON_HOUSE_ZONE_ID]: getInteriorPropSpawns(LAWSON_HOUSE_ZONE_ID),
  POST_OFFICE_BAY: [
    {
      id: 'post-office-bay-large-barrel',
      type: 'postOfficeBayBarrel',
      x: 3.0,
      z: 2.5,
      rotation: [0.015, 0.32, -0.01],
      scale: 2.33,
      visualOffsetY: -0.86,
    },
    // Landing-party supply drop: two crates set snug at an angle on the sandy
    // shelf east of the spawn, with a barrel lying a little apart as if it
    // rolled off the pile toward the water.
    {
      id: 'post-office-rollable-barrel',
      type: 'barrel',
      x: 16.6,
      z: 3.9,
      rotation: [Math.PI / 2, 1.05, 0.08],
    },
    {
      id: 'shore-supply-crate',
      type: 'crate',
      x: 13.8,
      z: 4.3,
      rotation: [0, 0.42, 0],
    },
    {
      id: 'shore-supply-crate-b',
      type: 'crate',
      x: 15.05,
      z: 4.95,
      rotation: [0.02, -0.65, -0.01],
    },
    {
      id: 'shore-terracotta-pot',
      type: 'terracottaPot',
      x: -6.8,
      z: 12.6,
      rotation: [0.01, 0.38, -0.02],
    },
    {
      id: 'upper-slope-broken-crate',
      type: 'brokenWoodenCrate',
      x: 20.6,
      z: -6.4,
      rotation: [0.04, -0.45, -0.02],
    },
    {
      id: 'loose-basalt-stone',
      type: 'stone',
      x: 16.2,
      z: -17.8,
      rotation: [0.2, -0.5, 0.12],
    },
    {
      id: 'bay-path-stone-a',
      type: 'stone',
      x: 18.8,
      z: 8.2,
      rotation: [0.15, 0.85, -0.08],
    },
    {
      id: 'bay-path-stone-b',
      type: 'stone',
      x: 6.2,
      z: 9.8,
      rotation: [-0.08, -0.25, 0.18],
    },
    {
      id: 'bay-path-stone-c',
      type: 'stone',
      x: 1.8,
      z: 18.2,
      rotation: [0.22, 0.3, -0.12],
    },
    {
      id: 'south-trail-stone',
      type: 'stone',
      x: 7.2,
      z: 31.4,
      rotation: [-0.16, 1.1, 0.1],
    },
  ],
  // Watkins Camp: homestead clutter and the relics Darwin can investigate.
  // The cabin timbers themselves live in physics/structures/WatkinsCabin.jsx;
  // these are the loose props around and inside it. Cabin centre (-8, -20).
  WATKINS: [
    // Supply crates against the cabin's north wall, a barrel rolled off apart.
    {
      id: 'watkins-yard-crate-a',
      type: 'crate',
      x: -11.2,
      z: -24.1,
      rotation: [0, 0.35, 0],
    },
    {
      id: 'watkins-yard-crate-b',
      type: 'crate',
      x: -9.9,
      z: -24.7,
      rotation: [0.02, -0.5, 0],
      scale: 0.88,
    },
    {
      id: 'watkins-yard-barrel',
      type: 'barrel',
      x: -1.5,
      z: -25.6,
      rotation: [Math.PI / 2, 0.8, 0.05],
    },
    // Room A floor corner: two loose boards heaped over the diary.
    {
      id: 'watkins-floor-board-a',
      type: 'looseFloorBoard',
      x: -9.9,
      z: -19.4,
      rotation: [0, 0.18, 0],
    },
    {
      id: 'watkins-floor-board-b',
      type: 'looseFloorBoard',
      x: -9.5,
      z: -19.9,
      rotation: [0, -0.12, 0],
    },
    {
      id: 'watkins-diary',
      type: 'watkinsDiary',
      x: -9.7,
      z: -19.65,
      rotation: [0, 0.4, 0],
    },
    // Room B, open to the sky: the rum jug in the rubble.
    {
      id: 'watkins-rum-jug',
      type: 'earthenwareJug',
      x: -5.9,
      z: -19.3,
      rotation: [0, 1.1, 0],
    },
    // The cold fire ring outside the south gate, charred shells in the ash.
    {
      id: 'watkins-charred-shell-a',
      type: 'charredShellFragment',
      x: 0.2,
      z: -14.3,
      rotation: [0.2, 0.7, 0.1],
    },
    {
      id: 'watkins-charred-shell-b',
      type: 'charredShellFragment',
      x: 0.9,
      z: -14.9,
      rotation: [-0.15, 2.1, 0.05],
    },
    {
      id: 'watkins-charred-shell-c',
      type: 'charredShellFragment',
      x: 0.4,
      z: -15.1,
      rotation: [0.1, 3.6, -0.12],
    },
    // Scrimshaw tooth dropped in the reeds by the ford.
    {
      id: 'watkins-scrimshaw-tooth',
      type: 'scrimshawTooth',
      x: 5.4,
      z: 16.4,
      rotation: [0.3, 1.9, 0.2],
    },
    // Loose stones on the terrace slope above the ford — rollable ammunition.
    {
      id: 'watkins-slope-stone-a',
      type: 'stone',
      x: 9.8,
      z: 19.4,
      rotation: [0.2, -0.5, 0.12],
    },
    {
      id: 'watkins-slope-stone-b',
      type: 'stone',
      x: -3.4,
      z: 20.8,
      rotation: [-0.1, 0.9, 0.2],
    },
    {
      id: 'watkins-yard-stone',
      type: 'stone',
      x: 3.4,
      z: -10.6,
      rotation: [0.15, 1.7, -0.1],
    },
  ],
  POST_OFFICE_BAY_3: [
    {
      id: 'pob3-mail-barrel',
      type: 'barrel',
      label: 'post-office barrel',
      x: 25.8,
      z: 1.2,
      rotation: [0, 0.65, 0],
      scale: 1.45,
    },
    {
      id: 'pob3-label-crate',
      type: 'crate',
      label: 'label crate',
      x: 23.7,
      z: 2.6,
      rotation: [0.02, 0.28, -0.01],
      scale: 1.12,
    },
    {
      id: 'pob3-specimen-crate',
      type: 'crate',
      label: 'specimen crate',
      x: 27.7,
      z: 2.5,
      rotation: [-0.03, -0.48, 0.02],
      scale: 1.08,
    },
  ],
  PENAL_COLONY: [
    // Plaza: watering point by the hitching post.
    {
      id: 'penal-plaza-trough',
      type: 'waterTrough',
      x: 7.2,
      z: -5.2,
      rotation: [0, 0.5, 0],
    },
    {
      id: 'penal-plaza-hitching-post',
      type: 'hitchingPost',
      x: 6.4,
      z: -7.4,
      rotation: [0, -0.9, 0],
    },
    {
      id: 'penal-plaza-bucket',
      type: 'woodenBucket',
      x: 8.3,
      z: -4.0,
      rotation: [0, 1.3, 0],
    },
    {
      id: 'penal-plaza-barrel',
      type: 'settlementBarrel',
      x: -4.4,
      z: -6.8,
      rotation: [0, 0.4, 0],
    },
    // Barracks stores.
    {
      id: 'penal-barracks-crates',
      type: 'cratesAndBags',
      x: 11.2,
      z: -9.4,
      rotation: [0, -0.62, 0],
    },
    {
      id: 'penal-barracks-barrel',
      type: 'settlementBarrel',
      x: 17.6,
      z: -10.2,
      rotation: [0, 2.1, 0],
    },
    // Governor's yard.
    {
      id: 'penal-gov-barrel-a',
      type: 'settlementBarrel',
      x: -22.4,
      z: -12.2,
      rotation: [0, 0.9, 0],
    },
    {
      id: 'penal-gov-barrel-b',
      type: 'settlementBarrel',
      x: -21.6,
      z: -13.4,
      rotation: [0, -0.5, 0],
    },
    {
      id: 'penal-gov-trough',
      type: 'waterTrough',
      x: -29.5,
      z: -10.6,
      rotation: [0, 2.2, 0],
    },
    {
      id: 'penal-gov-wheelbarrow',
      type: 'settlementWheelbarrow',
      x: -24.5,
      z: -6.4,
      rotation: [0, 2.5, 0],
    },
    // Convict courtyard clutter.
    {
      id: 'penal-courtyard-crates',
      type: 'cratesAndBags',
      x: -11.6,
      z: 15.8,
      rotation: [0, 0.85, 0],
    },
    {
      id: 'penal-courtyard-bucket',
      type: 'woodenBucket',
      x: -16.8,
      z: 13.2,
      rotation: [0, -0.4, 0],
    },
    // Farm cluster.
    {
      id: 'penal-threshing-wheelbarrow',
      type: 'settlementWheelbarrow',
      x: -16.2,
      z: 27.4,
      rotation: [0, -1.9, 0],
    },
    {
      id: 'penal-leanto-trough',
      type: 'waterTrough',
      x: 12.4,
      z: 30.6,
      rotation: [0, 1.65, 0],
    },
    {
      id: 'penal-leanto-barrel',
      type: 'settlementBarrel',
      x: 5.4,
      z: 31.8,
      rotation: [0, -1.2, 0],
    },
  ],
  BEAGLE: [
    // Scuttlebutt (fresh-water butt) beside the pumps at the mainmast.
    {
      id: 'beagle-scuttlebutt',
      type: 'settlementBarrel',
      x: -0.5,
      z: 1.9,
      rotation: [0, 0.5, 0],
    },
    // Landing-party supplies staged by the fore hatch.
    {
      id: 'beagle-supply-crate-a',
      type: 'crate',
      x: 4.2,
      z: 1.85,
      rotation: [0, 0.35, 0],
    },
    {
      id: 'beagle-supply-crate-b',
      type: 'crate',
      x: 4.95,
      z: 2.3,
      rotation: [0.01, -0.5, 0],
    },
    {
      id: 'beagle-galley-bucket',
      type: 'woodenBucket',
      x: 8.1,
      z: 1.35,
      rotation: [0, -0.8, 0],
    },
    // A barrel that's slipped its lashing, free to roll about the waist.
    {
      id: 'beagle-loose-barrel',
      type: 'barrel',
      x: -4.6,
      z: -1.9,
      rotation: [Math.PI / 2, 0.35, 0.02],
    },
  ],
};

export function getZoneProps(zoneId) {
  const instances = ZONE_PROPS[zoneId] || [];
  return instances.map(instance => ({ ...PROP_TYPES[instance.type], ...instance }));
}
