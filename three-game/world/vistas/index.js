import { getRegionEdgeHints, getRegionMap } from '../../../game-core/regionMaps';

const DEFAULT_VISTA_BY_TYPE = {
  bay: 'post-office-bay',
  beach: 'black-beach-uplands',
  coastallava: 'black-beach-uplands',
  coastalTrail: 'north-shore',
  lavafield: 'lava-flats',
  scrubland: 'dry-scrub-uplands',
  highland: 'highland-ridge',
  forest: 'highland-ridge',
  reef: 'reef-shallows',
  ocean: 'open-water',
  promontory: 'dry-scrub-uplands',
  settlement: 'dry-scrub-uplands',
  camp: 'dry-scrub-uplands',
};

const VISTA_BY_REGION_ID = {
  BEAGLE: 'open-water',
  BLACK_BEACH: 'black-beach-uplands',
  BLACK_BEACH_SURF: 'black-beach-uplands',
  LAVA_FLATS: 'lava-flats',
  POST_OFFICE_BAY: 'post-office-bay',
  ALT_POST_OFFICE_BAY: 'post-office-bay',
  POST_OFFICE_BAY_3: 'post-office-bay',
  N_SHORE: 'north-shore',
  NW_REEF: 'reef-shallows',
  W_HIGH: 'cloud-forest',
  MANGROVES: 'mangrove-forest',
};

const DEFAULT_SURFACE_PROFILE_BY_TYPE = {
  bay: 'volcanic-coast',
  beach: 'black-sand-coast',
  coastallava: 'lava-flats',
  coastalTrail: 'black-sand-coast',
  lavafield: 'lava-flats',
  scrubland: 'dry-scrub',
  highland: 'highland',
  forest: 'cloud-forest',
  reef: 'reef-shelf',
  ocean: 'open-water',
  promontory: 'dry-scrub',
  wetland: 'mangrove-mud',
  settlement: 'dry-scrub',
  camp: 'dry-scrub',
};

const SURFACE_PROFILE_BY_REGION_ID = {
  POST_OFFICE_BAY: 'volcanic-coast',
  ALT_POST_OFFICE_BAY: 'volcanic-coast',
  POST_OFFICE_BAY_3: 'volcanic-coast',
  N_SHORE: 'black-sand-coast',
  NW_REEF: 'reef-shelf',
  W_HIGH: 'cloud-forest',
  MANGROVES: 'mangrove-mud',
  LAVA_FLATS: 'lava-flats',
  BLACK_BEACH: 'black-sand-coast',
  BLACK_BEACH_SURF: 'black-sand-coast',
};

export const surfaceProfiles = {
  'volcanic-coast': {
    id: 'volcanic-coast',
    families: ['volcanic', 'ash', 'dry-scrub', 'coast'],
    coastalStyle: 'rock-to-shallow-shelf',
    nearColor: '#4f5045',
    midColor: '#6c654d',
    farColor: '#8a7c58',
    wetColor: '#343a36',
    shoreColor: '#6f684f',
    targetLiteralWeight: 0.34,
  },
  'black-sand-coast': {
    id: 'black-sand-coast',
    families: ['black-sand', 'volcanic', 'dry-scrub', 'coast'],
    coastalStyle: 'black-sand-beach',
    nearColor: '#454139',
    midColor: '#6d654b',
    farColor: '#91835f',
    wetColor: '#303733',
    shoreColor: '#605744',
    targetLiteralWeight: 0.42,
  },
  'reef-shelf': {
    id: 'reef-shelf',
    families: ['reef-sand', 'white-sand', 'shallow-water', 'coast'],
    coastalStyle: 'pale-sand-shallows',
    nearColor: '#817a61',
    midColor: '#a69d78',
    farColor: '#c4c1a0',
    wetColor: '#718a7c',
    shoreColor: '#b3ae88',
    targetLiteralWeight: 0.28,
  },
  'lava-flats': {
    id: 'lava-flats',
    families: ['lava', 'basalt', 'volcanic', 'dry'],
    coastalStyle: 'dry-lava-shelf',
    nearColor: '#23231f',
    midColor: '#3c382d',
    farColor: '#5e563f',
    wetColor: '#191d1d',
    shoreColor: '#363329',
    targetLiteralWeight: 0.36,
  },
  'dry-scrub': {
    id: 'dry-scrub',
    families: ['dry-scrub', 'tuff', 'grassland'],
    coastalStyle: 'dry-upland',
    nearColor: '#675f45',
    midColor: '#80744f',
    farColor: '#968d63',
    wetColor: '#4a5141',
    shoreColor: '#74694a',
    targetLiteralWeight: 0.38,
  },
  highland: {
    id: 'highland',
    families: ['highland', 'grassland', 'ridge'],
    coastalStyle: 'misty-ridge',
    nearColor: '#6d6b50',
    midColor: '#7f8564',
    farColor: '#98a082',
    wetColor: '#56624f',
    shoreColor: '#74765d',
    targetLiteralWeight: 0.36,
  },
  'cloud-forest': {
    id: 'cloud-forest',
    families: ['forest', 'highland', 'humid'],
    coastalStyle: 'misty-forest-slope',
    nearColor: '#334633',
    midColor: '#4d6249',
    farColor: '#7b8e75',
    wetColor: '#28382d',
    shoreColor: '#43523e',
    targetLiteralWeight: 0.34,
  },
  'mangrove-mud': {
    id: 'mangrove-mud',
    families: ['mangrove', 'mudflat', 'wetland', 'coast'],
    coastalStyle: 'mudflat-creek',
    nearColor: '#2e372c',
    midColor: '#46563a',
    farColor: '#708061',
    wetColor: '#1f2d27',
    shoreColor: '#3f4b37',
    targetLiteralWeight: 0.32,
  },
  'open-water': {
    id: 'open-water',
    families: ['water', 'ocean'],
    coastalStyle: 'open-water',
    nearColor: '#2d7094',
    midColor: '#2a789b',
    farColor: '#4e98ae',
    wetColor: '#24647f',
    shoreColor: '#5c9baa',
    targetLiteralWeight: 0.2,
  },
};

export function surfaceProfileForRegion(regionOrId) {
  const region = typeof regionOrId === 'string' ? getRegionMap(regionOrId) : regionOrId;
  if (!region) return surfaceProfiles['dry-scrub'];
  const profileId = SURFACE_PROFILE_BY_REGION_ID[region.id]
    || DEFAULT_SURFACE_PROFILE_BY_TYPE[region.type]
    || 'dry-scrub';
  return surfaceProfiles[profileId] || surfaceProfiles['dry-scrub'];
}

export const vistaLibrary = {
  'black-beach-uplands': {
    label: 'Black Beach Uplands',
    seed: 11,
    apronDepth: 92,
    apronWidthScale: 1.9,
    bands: [
      { from: 0, to: 18, nearY: -0.86, farY: -0.18, colors: ['#171614', '#28241c'] },
      { from: 18, to: 42, nearY: -0.18, farY: 2.8, colors: ['#332d22', '#5e5336'] },
      { from: 42, to: 74, nearY: 2.8, farY: 7.6, colors: ['#5a553e', '#777454'] },
    ],
    markers: [
      { kind: 'scrub', count: 14, at: [22, 54], color: '#4c5434', scale: [0.28, 0.55], seed: 11 },
      { kind: 'rock', count: 11, at: [10, 35], color: '#1d1c19', scale: [0.34, 0.9], seed: 23 },
    ],
  },
  'lava-flats': {
    label: 'Lava Flats',
    seed: 5,
    apronDepth: 88,
    apronWidthScale: 1.85,
    bands: [
      { from: 0, to: 30, nearY: -0.48, farY: 0.55, colors: ['#1a1916', '#25231f'] },
      { from: 30, to: 72, nearY: 0.55, farY: 2.2, colors: ['#2d2a24', '#4a4435'] },
    ],
    markers: [{ kind: 'rock', count: 18, at: [14, 62], color: '#151512', scale: [0.24, 0.62], seed: 5 }],
  },
  'north-shore': {
    label: 'North Shore',
    seed: 17,
    apronDepth: 86,
    apronWidthScale: 1.85,
    bands: [
      { from: 0, to: 20, nearY: -0.82, farY: -0.28, colors: ['#1c1b18', '#343025'] },
      { from: 20, to: 58, nearY: -0.28, farY: 3.6, colors: ['#60553a', '#7c7351'] },
    ],
    markers: [{ kind: 'scrub', count: 12, at: [28, 54], color: '#3f4a2f', scale: [0.26, 0.5], seed: 17 }],
  },
  'post-office-bay': {
    label: 'Post Office Bay',
    seed: 31,
    apronDepth: 90,
    apronWidthScale: 1.85,
    bands: [
      { from: 0, to: 22, nearY: -0.76, farY: 0.2, colors: ['#23211b', '#3d3525'] },
      { from: 22, to: 62, nearY: 0.2, farY: 4.8, colors: ['#6d5d3a', '#8c7a4b'] },
    ],
    markers: [{ kind: 'scrub', count: 10, at: [26, 58], color: '#475033', scale: [0.24, 0.48], seed: 31 }],
  },
  'dry-scrub-uplands': {
    label: 'Dry Scrub Uplands',
    seed: 29,
    apronDepth: 88,
    apronWidthScale: 1.8,
    bands: [
      { from: 0, to: 34, nearY: -0.24, farY: 2.2, colors: ['#665b3e', '#85764d'] },
      { from: 34, to: 68, nearY: 2.2, farY: 6.2, colors: ['#746b49', '#8c855f'] },
    ],
    markers: [{ kind: 'scrub', count: 16, at: [18, 62], color: '#465033', scale: [0.24, 0.5], seed: 29 }],
  },
  'highland-ridge': {
    label: 'Highland Ridge',
    seed: 41,
    apronDepth: 96,
    apronWidthScale: 1.9,
    bands: [
      { from: 0, to: 42, nearY: 0.2, farY: 6.4, colors: ['#63593f', '#7f805f'] },
      { from: 42, to: 82, nearY: 6.4, farY: 13.5, colors: ['#707b64', '#87937a'] },
    ],
    markers: [{ kind: 'scrub', count: 20, at: [20, 72], color: '#3d5036', scale: [0.26, 0.58], seed: 41 }],
  },
  'cloud-forest': {
    label: 'Cloud Forest',
    seed: 47,
    apronDepth: 104,
    apronWidthScale: 1.95,
    bands: [
      { from: 0, to: 28, nearY: 1.4, farY: 5.8, colors: ['#304334', '#41543e'] },
      { from: 28, to: 68, nearY: 5.8, farY: 11.5, colors: ['#3c5141', '#62735d'] },
      { from: 68, to: 96, nearY: 11.5, farY: 16.0, colors: ['#596d5d', '#9bad9c'] },
    ],
    markers: [
      { kind: 'scrub', count: 32, at: [20, 42], color: '#263b2b', scale: [0.42, 0.9], seed: 47 },
      { kind: 'scrub', count: 24, at: [-24, 68], color: '#314834', scale: [0.34, 0.82], seed: 59 },
      { kind: 'rock', count: 8, at: [12, 52], color: '#2d342d', scale: [0.28, 0.72], seed: 71 },
    ],
  },
  'mangrove-forest': {
    label: 'Southern Forest',
    seed: 53,
    apronDepth: 96,
    apronWidthScale: 1.9,
    bands: [
      { from: 0, to: 22, nearY: -0.3, farY: 1.2, colors: ['#26322a', '#334331'] },
      { from: 22, to: 58, nearY: 1.2, farY: 5.4, colors: ['#2b3b2e', '#43573d'] },
      { from: 58, to: 90, nearY: 5.4, farY: 9.2, colors: ['#3f5747', '#778b78'] },
    ],
    markers: [
      { kind: 'scrub', count: 34, at: [16, 38], color: '#263927', scale: [0.46, 1.0], seed: 53 },
      { kind: 'scrub', count: 24, at: [-26, 62], color: '#314632', scale: [0.34, 0.86], seed: 67 },
      { kind: 'rock', count: 6, at: [8, 46], color: '#28302a', scale: [0.22, 0.58], seed: 79 },
    ],
  },
  'reef-shallows': {
    label: 'Reef Shallows',
    seed: 13,
    apronDepth: 76,
    apronWidthScale: 1.65,
    bands: [
      { from: 0, to: 26, nearY: -1.22, farY: -1.0, colors: ['#b7d8cf', '#8dc6bf'] },
      { from: 26, to: 58, nearY: -1.0, farY: -0.7, colors: ['#88bfb0', '#5c928e'] },
    ],
    ridges: [],
    markers: [{ kind: 'rock', count: 8, at: [12, 46], color: '#6f6247', scale: [0.22, 0.46], seed: 13 }],
  },
  'open-water': {
    label: 'Open Water',
    render: false,
    apronDepth: 0,
    apronWidthScale: 1,
    bands: [],
    markers: [],
  },
};

export function vistaIdForRegion(region) {
  if (!region) return null;
  return VISTA_BY_REGION_ID[region.id] || DEFAULT_VISTA_BY_TYPE[region.type] || 'dry-scrub-uplands';
}

const NON_SCENIC_SOURCE_TYPES = new Set([
  'beagle',
  'cave',
  'governorshouse',
  'governorslibrary',
  'hut',
  'interior',
  'ocean',
  'office',
]);

function isApronSourceRegion(regionId) {
  const region = getRegionMap(regionId);
  return region?.id === regionId
    && Boolean(region?.terrain)
    && !NON_SCENIC_SOURCE_TYPES.has(region.type);
}

export function getBorderVistas(regionId) {
  if (!isApronSourceRegion(regionId)) return [];
  return getRegionEdgeHints(regionId)
    .filter(hint => hint.kind === 'open' && hint.toRegionId)
    .map(hint => {
      const target = getRegionMap(hint.toRegionId);
      const vistaId = vistaIdForRegion(target);
      const vista = vistaLibrary[vistaId];
      if (!vista) return null;
      return {
        ...vista,
        id: `${regionId}-${hint.edge}-${target.id}`,
        edge: hint.edge,
        toRegionId: target.id,
        targetName: target.name,
      };
    })
    .filter(Boolean);
}
