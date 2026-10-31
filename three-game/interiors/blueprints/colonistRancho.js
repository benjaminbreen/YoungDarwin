// A colonist's rancho on the farm terrace in the Wetlands Forest (S_WETLANDS):
// walls of bajareque (split cane packed with mud) on a low stone sill, a
// hipped grass roof pulled forward over a veranda, a packed-earth floor.
// Darwin found the colony's people scattered over their cultivated ground,
// growing sweet potatoes and plantains; this is one such outlying plot,
// worked by a household the game leaves unnamed.
//
// Coordinates are local to the building: origin at the floor's centre, the
// door wall facing +z. The same numbers place the exterior on the terrace
// (southernWetlands ecology) and shape the interior zone.

export const COLONIST_RANCHO_ZONE_ID = 'COLONIST_RANCHO';

export const COLONIST_RANCHO = {
  halfX: 3.0,
  halfZ: 2.3,
  wall: 0.2,
  sill: 0.28,
  wallTop: 2.15,
  ridge: 4.05,
  ridgeHalf: 1.15,
  overhang: 0.75,
  veranda: 2.0,
  door: { x: 0.55, width: 0.92, height: 1.86 },
  window: { z: -0.45, width: 0.78, bottom: 0.95, top: 1.58 },
  hearth: { x: -1.95, z: -1.2 },
  altar: { x: 0.85, z: -1.92 },
};

const R = COLONIST_RANCHO;
const innerX = R.halfX - R.wall;
const innerZ = R.halfZ - R.wall;

// At the head of the farm terrace, its veranda facing south toward the west
// trail, the fenced garden plots to the east. regions/southernWetlands/
// terrain.js levels a pad under it from the same numbers.
export const COLONIST_RANCHO_SITE = { x: -21, z: -5, yaw: 0 };

export function ranchoLocalToWorld(lx, lz, site = COLONIST_RANCHO_SITE) {
  const cos = Math.cos(site.yaw);
  const sin = Math.sin(site.yaw);
  return { x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos };
}

const doorOutside = ranchoLocalToWorld(R.door.x, R.halfZ + 0.8);
const outward = ranchoLocalToWorld(0, 1, { x: 0, z: 0, yaw: COLONIST_RANCHO_SITE.yaw });

export const COLONIST_RANCHO_EXTERIOR_DOOR = {
  position: { x: doorOutside.x, z: doorOutside.z },
  facing: { x: -outward.x, z: -outward.z },
  spawn: ranchoLocalToWorld(R.door.x, R.halfZ + R.veranda + 1.9),
  spawnFacing: { x: outward.x, z: outward.z },
};

export const COLONIST_RANCHO_BLUEPRINT = {
  id: COLONIST_RANCHO_ZONE_ID,
  label: "Colonist's Rancho",
  dimensions: { width: R.halfX * 2, depth: R.halfZ * 2, ceiling: R.ridge, floorY: 0 },
  map: {
    planLabel: 'Rancho plan',
    exitLabel: 'THE GARDEN',
    paper: '#d4c8a4',
    ink: '#3a2c1e',
  },
  navigation: {
    defaultSpawn: [R.door.x, 0, innerZ - 1.2],
    entrySpawns: {
      'from-garden': [R.door.x, 0, innerZ - 1.2],
    },
    entryFacings: {
      'from-garden': [0, 0, -1],
    },
    transitions: [
      {
        id: 'colonist-rancho-to-garden',
        toRegionId: 'S_WETLANDS',
        label: 'Step out under the veranda',
        description: 'Out past the door-post into the damp green light of the garden.',
        entryEdge: 'from-colonist-rancho',
        position: [R.door.x, innerZ + 0.12],
        radius: 0.95,
        closeRadius: 0.7,
        facing: [0, 1],
        routeLabel: 'Rancho door',
      },
    ],
  },
  outline: [
    [-innerX, -innerZ],
    [innerX, -innerZ],
    [innerX, innerZ],
    [-innerX, innerZ],
  ],
  rooms: [
    { id: 'rancho', label: 'Rancho', rect: [-innerX, -innerZ, innerX * 2, innerZ * 2], available: true },
  ],
  fixedColliders: [
    { id: 'front-wall-west', kind: 'structure', position: [(-R.halfX + R.door.x - R.door.width / 2) / 2, 1.8, innerZ + R.wall / 2], size: [R.door.x - R.door.width / 2 + R.halfX, 3.6, R.wall], yaw: 0 },
    { id: 'front-wall-east', kind: 'structure', position: [(R.halfX + R.door.x + R.door.width / 2) / 2, 1.8, innerZ + R.wall / 2], size: [R.halfX - R.door.x - R.door.width / 2, 3.6, R.wall], yaw: 0 },
    { id: 'door-head', kind: 'structure', position: [R.door.x, 2.8, innerZ + R.wall / 2], size: [R.door.width, 1.6, R.wall], yaw: 0 },
    { id: 'rear-wall', kind: 'structure', position: [0, 1.8, -innerZ - R.wall / 2], size: [R.halfX * 2, 3.6, R.wall], yaw: 0 },
    { id: 'west-wall', kind: 'structure', position: [-innerX - R.wall / 2, 1.8, 0], size: [R.wall, 3.6, R.halfZ * 2], yaw: 0 },
    { id: 'east-wall', kind: 'structure', position: [innerX + R.wall / 2, 1.8, 0], size: [R.wall, 3.6, R.halfZ * 2], yaw: 0 },
    { id: 'hearth', kind: 'furniture', position: [R.hearth.x, 0.15, R.hearth.z], size: [0.8, 0.3, 0.8], yaw: 0 },
    { id: 'barbacoa', kind: 'furniture', position: [2.05, 0.3, -1.15], size: [1.4, 0.6, 1.95], yaw: 0 },
    { id: 'firewood', kind: 'furniture', position: [-2.5, 0.3, -0.25], size: [0.55, 0.6, 1.0], yaw: 0 },
    { id: 'grinding-stone', kind: 'furniture', position: [-0.75, 0.25, -1.75], size: [0.7, 0.5, 0.45], yaw: 0 },
    { id: 'sacks', kind: 'furniture', position: [-2.3, 0.3, 1.45], size: [0.9, 0.6, 0.8], yaw: 0 },
    { id: 'water-jar', kind: 'furniture', position: [-0.55, 0.35, 1.72], size: [0.55, 0.7, 0.55], yaw: 0 },
    { id: 'chest', kind: 'furniture', position: [2.3, 0.25, 1.5], size: [0.85, 0.5, 0.5], yaw: 0 },
  ],
  inspectables: [
    {
      id: 'rancho-hearth',
      mode: 'interior-message',
      label: 'three-stone hearth',
      text: 'Press E to look at the hearth',
      message: 'Three stones and a fire between them, a clay griddle for maize cakes and a pot of sweet potatoes pushed to the edge to keep warm. There is no chimney. The smoke finds its own way out through the thatch, and keeps the insects out of it.',
      position: [R.hearth.x, 0.35, R.hearth.z],
      radius: 1.35,
    },
    {
      id: 'rancho-altar',
      mode: 'interior-message',
      label: 'saint on the shelf',
      text: 'Press E to look at the shelf',
      message: 'A cheap woodcut of Our Lady of Mercy, patroness of captives, pasted to a board — a fitting saint for a colony of men sent here under sentence. Before it, a candle stub, a cross of two sticks bound with fibre, and wild flowers in a gourd.',
      position: [R.altar.x, 1.2, R.altar.z + 0.1],
      radius: 1.3,
    },
    {
      id: 'rancho-barbacoa',
      mode: 'interior-message',
      label: 'cane bed',
      text: 'Press E to look at the bed',
      message: 'A barbacoa: split cane lashed over a frame on forked posts, high enough to keep the sleeper off the damp floor. A palm-leaf mat, a brown wool blanket, a rolled shirt for a pillow.',
      position: [2.05, 0.65, -1.15],
      radius: 1.4,
    },
    {
      id: 'rancho-grinding-stone',
      mode: 'interior-message',
      label: 'grinding stone',
      text: 'Press E to look at the grinding stone',
      message: 'A saddle of basalt hollowed by use, and the hand-stone that rubs maize into meal across it. Island stone, mainland method.',
      position: [-0.75, 0.5, -1.75],
      radius: 1.2,
    },
    {
      id: 'rancho-stores',
      mode: 'interior-message',
      label: 'sacks and stores',
      text: 'Press E to look at the stores',
      message: 'Sacks of sweet potatoes, a basket of beans, maize hung in its husks from the rafters out of reach of rats. Enough to eat. Darwin found the colonists complaining of poverty all the same, and with reason: there was nothing here to sell.',
      position: [-2.3, 0.6, 1.45],
      radius: 1.4,
    },
    {
      id: 'rancho-tools',
      mode: 'interior-message',
      label: 'machete and hoe',
      text: 'Press E to look at the tools',
      message: 'A machete on a peg by the door and a hoe with a handle cut on the island. The iron came from the colony store and is charged against the household\'s account — tools are how the Vice-Governor keeps the gardens worked.',
      position: [1.45, 1.0, innerZ - 0.12],
      radius: 1.2,
    },
    {
      id: 'rancho-chest',
      mode: 'interior-message',
      label: 'wooden chest',
      text: 'Press E to look at the chest',
      message: 'A small locked chest, its corners bound with rawhide. Whatever the household brought from the mainland is in here. It is not yours to open.',
      position: [2.3, 0.55, 1.5],
      radius: 1.2,
    },
  ],
  rests: [
    {
      id: 'rancho-barbacoa-rest',
      label: 'cane bed',
      position: [1.2, 0, -0.6],
      radius: 1.25,
      restPose: [2.05, 0.66, -1.15],
      facing: [0, 0, 1],
    },
  ],
  propSpawns: [
    { id: 'rancho-bucket', type: 'woodenBucket', x: -0.1, y: 0.2, z: 1.75, rotation: [0, 0.2, 0] },
    { id: 'rancho-mug', type: 'cabinMug', x: -1.2, y: 0.32, z: -0.85, rotation: [0, 0, 0] },
  ],
};
