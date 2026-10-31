// The whalers' shore hut on the southwest beach (S_HUT): a dry-stone base,
// walls of salvaged ship's planking, and a planked gable roof patched with
// tarred sailcloth, one back corner fallen in. Crews landing for tortoises,
// water and wood used shelters like this for days at a time; nothing here
// names a ship, and the inspectables say so.
//
// Coordinates are local to the building: origin at the floor's centre, the
// door wall facing +z. The same numbers place the exterior on the beach
// (beachWithHutLayout.js) and shape the interior zone, so the two match.

export const WHALERS_HUT_ZONE_ID = 'WHALERS_HUT_INTERIOR';

export const WHALERS_HUT = {
  halfX: 3.8,
  halfZ: 2.6,
  wall: 0.55,
  stoneHeight: 1.0,
  eave: 1.95,
  ridge: 3.1,
  overhang: 0.38,
  door: { x: 1.2, width: 0.95, height: 1.86 },
  window: { x: -2.05, width: 0.62, bottom: 1.18, top: 1.62 },
  // The back-west corner of the roof has fallen in.
  collapse: { maxX: -1.35, maxZ: -0.45 },
};

const H = WHALERS_HUT;
const innerX = H.halfX - H.wall;
const innerZ = H.halfZ - H.wall;
// Wall colliders rise to the ridge so the camera cannot swing out over the
// eaves of so small a room.

// Where the building stands on the beach. The terrain pad and path in
// regions/beachWithHut/terrain.js are authored around this.
export const WHALERS_HUT_SITE = { x: 15, z: -17.6, yaw: -0.58 };

export function whalersHutLocalToWorld(lx, lz, site = WHALERS_HUT_SITE) {
  const cos = Math.cos(site.yaw);
  const sin = Math.sin(site.yaw);
  return { x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos };
}

const doorOutside = whalersHutLocalToWorld(H.door.x, H.halfZ + 0.85);
const doorFacing = whalersHutLocalToWorld(0, 1, { x: 0, z: 0, yaw: WHALERS_HUT_SITE.yaw });

export const WHALERS_HUT_EXTERIOR_DOOR = {
  position: { x: doorOutside.x, z: doorOutside.z },
  // Facing from outside toward the door: opposite to the wall's outward normal.
  facing: { x: -doorFacing.x, z: -doorFacing.z },
  spawn: whalersHutLocalToWorld(H.door.x, H.halfZ + 2.8),
  spawnFacing: { x: doorFacing.x, z: doorFacing.z },
};

export const WHALERS_HUT_BLUEPRINT = {
  id: WHALERS_HUT_ZONE_ID,
  label: "Whalers' Hut",
  dimensions: { width: H.halfX * 2, depth: H.halfZ * 2, ceiling: H.ridge, floorY: 0 },
  map: {
    planLabel: 'Hut plan',
    exitLabel: 'THE BEACH',
    paper: '#d8ccaa',
    ink: '#3a2c1e',
  },
  navigation: {
    defaultSpawn: [H.door.x, 0, innerZ - 1.25],
    entrySpawns: {
      'from-beach': [H.door.x, 0, innerZ - 1.25],
    },
    entryFacings: {
      'from-beach': [0, 0, -1],
    },
    transitions: [
      {
        id: 'whalers-hut-to-beach',
        toRegionId: 'S_HUT',
        label: 'Step out onto the beach',
        description: 'Duck under the lintel into the glare off the sand.',
        entryEdge: 'from-whalers-hut',
        position: [H.door.x, innerZ + 0.2],
        radius: 1.0,
        closeRadius: 0.75,
        facing: [0, 1],
        routeLabel: 'Hut door',
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
    { id: 'hut', label: 'Hut', rect: [-innerX, -innerZ, innerX * 2, innerZ * 2], available: true },
  ],
  fixedColliders: [
    { id: 'front-wall-west', kind: 'structure', position: [(-H.halfX + H.door.x - H.door.width / 2) / 2, 1.6, innerZ + H.wall / 2], size: [H.door.x - H.door.width / 2 + H.halfX, 3.2, H.wall], yaw: 0 },
    { id: 'front-wall-east', kind: 'structure', position: [(H.halfX + H.door.x + H.door.width / 2) / 2, 1.6, innerZ + H.wall / 2], size: [H.halfX - H.door.x - H.door.width / 2, 3.2, H.wall], yaw: 0 },
    { id: 'door-head', kind: 'structure', position: [H.door.x, 2.6, innerZ + H.wall / 2], size: [H.door.width, 1.2, H.wall], yaw: 0 },
    { id: 'rear-wall', kind: 'structure', position: [0, 1.6, -innerZ - H.wall / 2], size: [H.halfX * 2, 3.2, H.wall], yaw: 0 },
    { id: 'west-wall', kind: 'structure', position: [-innerX - H.wall / 2, 1.6, 0], size: [H.wall, 3.2, H.halfZ * 2], yaw: 0 },
    { id: 'east-wall', kind: 'structure', position: [innerX + H.wall / 2, 1.6, 0], size: [H.wall, 3.2, H.halfZ * 2], yaw: 0 },
    { id: 'firepit', kind: 'furniture', position: [-0.35, 0.12, 0.05], size: [1.0, 0.24, 1.0], yaw: 0 },
    { id: 'bunk', kind: 'furniture', position: [-2.62, 0.3, -0.35], size: [0.95, 0.6, 2.0], yaw: 0 },
    { id: 'sea-chest', kind: 'furniture', position: [2.55, 0.27, -1.62], size: [1.0, 0.54, 0.55], yaw: 0 },
    { id: 'cask-corner', kind: 'furniture', position: [2.85, 0.45, 1.45], size: [0.75, 0.9, 0.75], yaw: 0 },
    { id: 'stave-pile', kind: 'furniture', position: [-2.65, 0.25, 1.5], size: [0.9, 0.5, 0.65], yaw: 0 },
    { id: 'carapace-stack', kind: 'furniture', position: [0.25, 0.3, 1.62], size: [0.8, 0.6, 0.62], yaw: 0 },
  ],
  inspectables: [
    {
      id: 'whalers-hut-tally-plank',
      mode: 'interior-message',
      label: 'carved plank',
      text: 'Press E to look at the carved plank',
      message: 'Tallies cut in fives, thirty-three in all; three sets of initials in three different hands; the year 1831; and a sperm whale, its spout thrown forward and to the left as only a sperm whale throws it. No ship\'s name. Whoever kept the count expected to be fetched.',
      position: [0.6, 1.45, -innerZ + 0.05],
      radius: 1.5,
    },
    {
      id: 'whalers-hut-firepit',
      mode: 'interior-message',
      label: 'fire pit',
      text: 'Press E to look at the fire pit',
      message: 'A ring of soot-black beach stones around cold ash. In the charcoal: split pieces of tortoise shell and the scorched end of a rib. The crews ate tortoise ashore as well as carrying them off alive.',
      position: [-0.35, 0.3, 0.05],
      radius: 1.4,
    },
    {
      id: 'whalers-hut-carapaces',
      mode: 'interior-message',
      label: 'stacked carapaces',
      text: 'Press E to look at the carapaces',
      message: 'Empty tortoise shells, nested like bowls by the door. Darwin was told that single ships had once carried away as many as seven hundred, and that one frigate\'s crew brought two hundred down to the beach in a day.',
      position: [0.25, 0.55, 1.62],
      radius: 1.35,
    },
    {
      id: 'whalers-hut-irons',
      mode: 'interior-message',
      label: 'harpoon irons',
      text: 'Press E to look at the harpoon irons',
      message: 'Two harpoon irons with barbed, two-flued heads, rusted solid to their shanks, and a long killing lance. The iron fastened a boat to the whale; the lance killed it. Both were left behind, which says something about the voyage they came from.',
      position: [3.1, 1.2, -0.6],
      radius: 1.3,
    },
    {
      id: 'whalers-hut-chest',
      mode: 'interior-message',
      label: 'sea chest',
      text: 'Press E to look in the sea chest',
      message: 'A sailor\'s chest with rope beckets for handles. Inside the lid someone has painted a ship under full sail. Nothing in it now but sand and the stem of a clay pipe.',
      position: [2.55, 0.6, -1.62],
      radius: 1.3,
    },
    {
      id: 'whalers-hut-hammock',
      mode: 'interior-message',
      label: 'canvas hammock',
      text: 'Press E to look at the hammock',
      message: 'A hammock cut from old sail, slung between the posts and patched twice. Below it the sand is worn smooth where feet swung down in the mornings.',
      position: [0.6, 0.9, -1.25],
      radius: 1.4,
    },
    {
      id: 'whalers-hut-staves',
      mode: 'interior-message',
      label: 'barrel staves',
      text: 'Press E to look at the staves',
      message: 'Staves and rusted hoops from casks broken up for firewood. Water casks were the reason ships came here at all; a cask that could not be made tight was worth more burning.',
      position: [-2.65, 0.45, 1.5],
      radius: 1.3,
    },
    {
      id: 'whalers-hut-collapse',
      mode: 'interior-message',
      label: 'fallen roof',
      text: 'Press E to look at the fallen roof',
      message: 'The back corner of the roof has come down: two rafters snapped, the planking slid onto the bunk. Sand has blown in over it. No one has slept here since the last rains.',
      position: [-2.55, 1.2, -1.2],
      radius: 1.4,
    },
  ],
  rests: [
    {
      id: 'whalers-hut-bunk-rest',
      label: 'plank bunk',
      position: [-1.95, 0, 0.55],
      radius: 1.3,
      restPose: [-2.62, 0.62, 0.2],
      facing: [1, 0, 0],
    },
  ],
  propSpawns: [
    { id: 'whalers-hut-scrimshaw', type: 'scrimshawTooth', x: 2.38, y: 0.68, z: -1.58, rotation: [0, 0.6, 0] },
    { id: 'whalers-hut-charred-shell', type: 'charredShellFragment', x: 0.3, y: 0.18, z: 0.62, rotation: [0, 1.1, 0] },
    { id: 'whalers-hut-bucket', type: 'woodenBucket', x: 2.05, y: 0.2, z: 1.55, rotation: [0, 0.4, 0] },
    { id: 'whalers-hut-mug', type: 'cabinMug', x: 2.82, y: 0.68, z: -1.7, rotation: [0, -0.3, 0] },
  ],
};
