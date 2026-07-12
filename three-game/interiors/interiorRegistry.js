import beagleCabinBlueprint from './blueprints/beagleCabin.json';
import lawsonHouseBlueprint from './blueprints/lawsonHouse.json';

export const BEAGLE_CABIN_ZONE_ID = 'BEAGLE_CABIN';
export const LAWSON_HOUSE_ZONE_ID = 'LAWSON_HOUSE';

const INTERIORS = {
  [BEAGLE_CABIN_ZONE_ID]: {
    id: BEAGLE_CABIN_ZONE_ID,
    label: 'HMS Beagle Aft Cabins',
    kind: 'ship-interior',
    blueprint: beagleCabinBlueprint,
    shellAssetId: 'beagleCabinShip',
    scene: {
      background: '#091218',
      outdoor: false,
      water: true,
      weather: false,
      exteriorAtmosphere: true,
      ecology: false,
      landmarks: false,
      specimens: false,
      npcs: false,
    },
    narrationTriggers: [
      {
        id: 'arrival',
        mode: 'arrival',
        text: 'You duck beneath the poop bulkhead into the Beagle’s aft cabins, where charts, books, and instruments continue the work begun ashore.',
      },
      {
        id: 'captains-cabin',
        position: [0, 0, -4.2],
        radius: 5.1,
        text: 'The captain’s cabin narrows around FitzRoy’s working table, every chart and chronometer arranged against the ship’s motion.',
      },
      {
        id: 'anchorage-chart',
        position: [-0.25, 0, -3.5],
        radius: 2.8,
        text: 'A chart of the anchorage lies pinned beneath brass weights, its coast waiting to be compared with the shore.',
      },
      {
        id: 'captains-berth',
        position: [3.78, 0, -6.3],
        radius: 2.65,
        text: 'The built-in berth fills the sternward corner, made tight and practical for a ship that never entirely holds still.',
      },
    ],
    camera: {
      minDistance: 2.05,
      maxDistance: 3.65,
      pivotY: 1.35,
      firstPersonEyeY: 1.7,
      collision: { enabled: true, padding: 0.28, minimumDistance: 0.72 },
      topHeight: 12.5,
      cutawayTop: true,
    },
    lighting: {
      fogDensity: 0.00025,
      exposureDay: 0.54,
      exposureNight: 0.53,
      exposureResponse: 1.9,
      environmentDay: 0.16,
      environmentNight: 0.08,
      ambientDay: 0.012,
      ambientNight: 0.008,
      hemisphereDay: 0.032,
      hemisphereNight: 0.021,
      flameDayEmission: 0.71,
      flameNightEmission: 4.7,
      portals: [
        {
          id: 'library-skylight',
          position: [-0.7, 3.18, 5.55],
          normal: [0, 1, 0],
          width: 3.65,
          height: 2.18,
          diffuseIntensity: 1.25,
          color: '#c8dce0',
          goldenColor: '#ffd08a',
          direct: {
            intensity: 128,
            warmth: 0.36,
            sourceDistance: 1.6,
            distance: 9.2,
            angle: 0.62,
            penumbra: 0.36,
            penumbraClear: 0.22,
            penumbraOvercast: 0.58,
            decay: 1.18,
            diffuseCut: 0.3,
            castShadow: true,
            shadowMapSize: 1024,
            shadowRadiusClear: 0.68,
            shadowRadiusOvercast: 2.1,
            shaft: {
              panes: {
                count: 4,
                axis: [1, 0, 0],
                spacing: 0.86,
                width: 0.62,
                depth: 1.48,
                length: 3.85,
                opacity: 0.16,
                visibilityThreshold: 0.12,
              },
              dust: {
                count: 72,
                length: 3.85,
                speed: 0.1,
                opacity: 0.4,
                size: 0.13,
                noise: 0.28,
                color: '#ffe1a7',
                visibilityThreshold: 0.12,
              },
            },
          },
          bounce: {
            position: [-0.7, 0.48, 5.55],
            direction: [0, 1, 0],
            width: 2.6,
            height: 1.3,
            intensity: 0.68,
          },
        },
        {
          id: 'stern-windows',
          position: [0, 2.08, -10.5],
          normal: [0, 0, -1],
          width: 10.2,
          height: 1.62,
          diffuseIntensity: 0.52,
          color: '#b8d3dc',
          goldenColor: '#ffc179',
          direct: {
            intensity: 132,
            warmth: 0.34,
            sourceDistance: 2.4,
            distance: 14,
            angle: 0.9,
            penumbra: 0.3,
            penumbraClear: 0.2,
            penumbraOvercast: 0.54,
            decay: 1.15,
            diffuseCut: 0.2,
            castShadow: true,
            shadowMapSize: 1024,
            shadowRadiusClear: 0.62,
            shadowRadiusOvercast: 1.8,
            shaft: {
              panes: {
                count: 5,
                axis: [1, 0, 0],
                spacing: 2.22,
                width: 1.28,
                depth: 1.08,
                length: 5.8,
                opacity: 0.075,
                visibilityThreshold: 0.16,
              },
              dust: {
                count: 80,
                length: 5.8,
                speed: 0.08,
                opacity: 0.28,
                size: 0.115,
                noise: 0.24,
                color: '#ffd18a',
                visibilityThreshold: 0.16,
              },
            },
          },
          bounce: {
            position: [0, 0.32, -6.5],
            direction: [0, 1, 0.35],
            width: 3.8,
            height: 1.25,
            intensity: 0.3,
          },
        },
        {
          id: 'weather-deck-doorway',
          position: [0, 1.55, 10.72],
          normal: [0, 0, 1],
          width: 2.7,
          height: 2.65,
          diffuseIntensity: 0.24,
          color: '#bfd7dd',
          goldenColor: '#ffcb82',
        },
      ],
      lamps: [
        { id: 'captain-port', position: [-3.8, 2.4, -5.8], color: '#ff9142', dayIntensity: 0.3, nightIntensity: 8.2, distance: 5.2, decay: 2, castShadow: true },
        { id: 'captain-starboard', position: [3.25, 2.4, -3.6], color: '#ffad58', dayIntensity: 0.27, nightIntensity: 7.55, distance: 5.0, decay: 2, castShadow: true },
        { id: 'library-port', position: [-3.4, 2.4, 6.2], color: '#ff9546', dayIntensity: 0.29, nightIntensity: 7.8, distance: 5.0, decay: 2.05, castShadow: false },
        { id: 'library-starboard', position: [2.2, 2.4, 5.4], color: '#ffb05d', dayIntensity: 0.25, nightIntensity: 7.35, distance: 4.8, decay: 2.05, castShadow: false },
      ],
      postprocessing: {
        multisampling: 0,
        aoFullResolution: true,
        aoRadius: 1.05,
        aoDistanceFalloff: 0.9,
        aoIntensity: 2.55,
        aoDenoiseRadius: 8,
        bloomNightIntensity: 0.68,
        bloomDayIntensity: 0.48,
        bloomNightThreshold: 0.55,
        bloomDayThreshold: 0.72,
        bloomSmoothing: 0.24,
        bloomRadius: 0.46,
      },
    },
  },
  [LAWSON_HOUSE_ZONE_ID]: {
    id: LAWSON_HOUSE_ZONE_ID,
    label: "Nicholas Lawson's House",
    kind: 'house-interior',
    blueprint: lawsonHouseBlueprint,
    shellAssetId: 'lawsonHouseInterior',
    scene: {
      background: '#18201d',
      outdoor: false,
      water: false,
      weather: false,
      ecology: false,
      landmarks: false,
      specimens: false,
      npcs: false,
    },
    camera: {
      minDistance: 2.4,
      maxDistance: 3.0,
      pivotY: 1.36,
      firstPersonEyeY: 1.68,
      collision: { enabled: true, padding: 0.25, minimumDistance: 0.68 },
      topHeight: 9.4,
      cutawayTop: true,
    },
    restNarration: 'You settle into the narrow cot. Two hours pass beneath the tapping roof, with damp highland wind moving through the boards.',
    lighting: {
      fogDensity: 0.0018,
      exposureDay: 0.59,
      exposureNight: 0.49,
      exposureResponse: 1.45,
      environmentDay: 0.19,
      environmentNight: 0.045,
      ambientDay: 0.018,
      ambientNight: 0.004,
      hemisphereDay: 0.062,
      hemisphereNight: 0.012,
      ambientColor: '#82918b',
      hemisphereSkyColor: '#9eaaa4',
      hemisphereGroundColor: '#17110b',
      flameDayEmission: 0.48,
      flameNightEmission: 4.15,
      portals: [
        {
          id: 'front-windows',
          position: [-0.3, 1.62, 6.78],
          normal: [0, 0, 1],
          width: 4.7,
          height: 1.35,
          diffuseIntensity: 0.9,
          color: '#b9d0ca',
          goldenColor: '#f4bd72',
          direct: {
            intensity: 84,
            sourceDistance: 1.8,
            distance: 8.2,
            angle: 0.68,
            penumbraClear: 0.27,
            penumbraOvercast: 0.68,
            decay: 1.25,
            diffuseCut: 0.22,
            castShadow: true,
            shadowMapSize: 1024,
            shadowRadiusClear: 0.8,
            shadowRadiusOvercast: 2.3,
            shaft: {
              panes: { count: 4, spacing: 0.92, width: 0.56, depth: 1.0, length: 3.25, opacity: 0.065, visibilityThreshold: 0.2 },
              dust: { count: 48, length: 3.25, speed: 0.08, opacity: 0.25, size: 0.1, noise: 0.24, color: '#ead7a9' }
            }
          },
          bounce: { position: [-2, 0.22, 4.5], direction: [0, 1, -0.2], width: 4.8, height: 1.2, intensity: 0.5 }
        },
        {
          id: 'garden-window',
          position: [-8.75, 1.58, 3.05],
          normal: [-1, 0, 0],
          width: 1.35,
          height: 1.25,
          diffuseIntensity: 0.72,
          color: '#a9c4b6',
          goldenColor: '#efb66c',
          direct: { intensity: 58, sourceDistance: 1.4, distance: 6.8, angle: 0.56, penumbraClear: 0.34, penumbraOvercast: 0.72, decay: 1.3, castShadow: false }
        },
        {
          id: 'front-doorway',
          position: [-3.4, 1.22, 6.78],
          normal: [0, 0, 1],
          width: 1.32,
          height: 2.32,
          diffuseIntensity: 0.38,
          color: '#b9cec6',
          goldenColor: '#f7bd72'
        }
      ],
      lamps: [
        { id: 'dining-hanging-lamp', position: [-3.5, 2.65, 1.25], color: '#ff9c4d', dayIntensity: 0.24, nightIntensity: 7.2, distance: 5.2, decay: 2.05, castShadow: true, shadowMapSize: 512 },
        { id: 'calling-table-lamp', position: [-7.35, 1.25, 5.75], color: '#ffae61', dayIntensity: 0.18, nightIntensity: 4.4, distance: 3.8, decay: 2.05, castShadow: false }
      ],
      postprocessing: {
        multisampling: 0,
        aoFullResolution: true,
        aoRadius: 0.9,
        aoDistanceFalloff: 0.82,
        aoIntensity: 2.2,
        aoDenoiseRadius: 8,
        bloomNightIntensity: 0.55,
        bloomDayIntensity: 0.48,
        bloomNightThreshold: 0.6,
        bloomDayThreshold: 0.68,
        bloomSmoothing: 0.23,
        bloomRadius: 0.4
      }
    }
  },
};

export function getInteriorDefinition(zoneId) {
  return INTERIORS[zoneId] || null;
}

export function isInteriorZone(zoneId) {
  return Boolean(getInteriorDefinition(zoneId));
}

export function getInteriorBlueprint(zoneId) {
  return getInteriorDefinition(zoneId)?.blueprint || null;
}

export function getInteriorCameraProfile(zoneId) {
  return getInteriorDefinition(zoneId)?.camera || null;
}

export function getInteriorFixedColliders(zoneId) {
  return getInteriorBlueprint(zoneId)?.fixedColliders || [];
}

export function getInteriorPropSpawns(zoneId) {
  return getInteriorBlueprint(zoneId)?.propSpawns || [];
}

export function getInteriorInteractions(zoneId) {
  const blueprint = getInteriorBlueprint(zoneId);
  if (!blueprint) return [];
  return [
    ...(blueprint.books || []).map(book => ({
      ...book,
      mode: 'read-book',
      label: 'book',
      bookId: book.id,
    })),
    ...(blueprint.rests || []).map(rest => ({
      ...rest,
      mode: 'interior-rest',
    })),
    ...(blueprint.inspectables || []),
  ];
}

export function getInteriorNarrationTriggers(zoneId) {
  return getInteriorDefinition(zoneId)?.narrationTriggers || [];
}

export function getInteriorTransitions(zoneId) {
  return (getInteriorBlueprint(zoneId)?.navigation?.transitions || []).map(transition => ({
    ...transition,
    zoneId,
    position: { x: transition.position[0], z: transition.position[1] },
    facing: { x: transition.facing?.[0] || 0, z: transition.facing?.[1] || 0 },
  }));
}
