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
      background: '#18231f',
      outdoor: false,
      water: false,
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
        text: 'Lawson’s house receives visitors in the dining room; the open office beyond it keeps the colony’s accounts, maps, and damp-stiffened reference books close at hand.',
      },
      {
        id: 'office-library',
        position: [5.4, 0, 5.0],
        radius: 2.5,
        text: 'The room is less a private library than a working station: shipping knowledge, colonial accounts, and a few hard-used books kept above the wet floor.',
      },
    ],
    camera: {
      minDistance: 3.0,
      defaultDistance: 3.2,
      maxDistance: 4.45,
      defaultPitch: 0.24,
      side: 0.35,
      pivotY: 1.42,
      firstPersonEyeY: 1.68,
      collision: { enabled: true, padding: 0.28, minimumDistance: 0.72 },
      topHeight: 13.5,
      cutawayTop: true,
    },
    restNarration: 'You settle into the narrow cot. Two hours pass beneath the tapping roof, with damp highland wind moving through the boards.',
    exteriorApron: {
      sourceRegionId: 'PENAL_COLONY',
      sourceAnchor: [-26, -16],
      worldYaw: 0.62,
      bounds: { minX: -28, maxX: 28, minZ: -9, maxZ: 42 },
      segmentsX: 56,
      segmentsZ: 52,
      houseHalfWidth: 10.5,
      houseHalfDepth: 8.5,
      baseY: -0.08,
      reliefScale: 0.28,
      reliefStart: 1.4,
      reliefFull: 12,
      colorLift: 1.12,
      mistColor: '#9ba998',
      mistStart: 17,
      mistEnd: 43,
      mistColorMix: 0.78,
      dayFill: 0.5,
      nightFill: 0.035,
      baseMist: 0.3,
      weatherMist: 0.58,
    },
    lighting: {
      worldYaw: 0.62,
      fogDensity: 0.00035,
      exposureDay: 0.96,
      exposureNight: 0.52,
      exposureResponse: 1.85,
      environmentDay: 0.34,
      environmentNight: 0.055,
      ambientDay: 0.028,
      ambientNight: 0.006,
      hemisphereDay: 0.085,
      hemisphereNight: 0.016,
      ambientColor: '#8b948b',
      hemisphereSkyColor: '#b3c0b5',
      hemisphereGroundColor: '#24170f',
      backgroundNight: '#18231f',
      backgroundDay: '#a5b2a5',
      backgroundGolden: '#cfb078',
      backgroundGoldenStrength: 0.44,
      backgroundMist: '#adb9ae',
      backgroundResponse: 2.4,
      exteriorFillDay: 0.32,
      exteriorFillNight: 0.015,
      replaceLegacyExteriorGround: true,
      flameDayEmission: 0,
      flameNightEmission: 4.15,
      characterBounce: {
        enabled: true,
        color: '#cbd8cf',
        goldenColor: '#e4b96f',
        dayIntensity: 2.15,
        nightIntensity: 0.28,
        distance: 3.6,
        decay: 2.15,
        cameraOffset: 1.2,
        height: 1.08,
      },
      portals: [
        {
          id: 'calling-window',
          position: [-8.35, 1.56, 8.28],
          normal: [0, 0, 1],
          width: 1.5,
          height: 1.32,
          diffuseIntensity: 1.85,
          color: '#c5d1c8',
          goldenColor: '#edc17a',
          direct: {
            intensity: 132,
            diffuseShaftShare: 0.56,
            diffuseProjectorShare: 0.45,
            diffuseProjectorIntensity: 14,
            warmth: 0.5,
            sourceDistance: 1.8,
            distance: 11.5,
            angle: 0.48,
            penumbraClear: 0.3,
            penumbraOvercast: 0.68,
            decay: 1.2,
            diffuseCut: 0.18,
            castShadow: false,
            shaft: {
              panes: { count: 2, axis: [1, 0, 0], spacing: 0.7, width: 0.5, depth: 0.78, length: 6.2, opacity: 0.21, visibilityThreshold: 0.035 },
              dust: { count: 34, length: 6.2, speed: 0.06, opacity: 0.2, size: 0.08, noise: 0.2, color: '#f1d3a0', visibilityThreshold: 0.12 }
            }
          },
          bounce: { position: [-8.2, 0.22, 5.65], direction: [0, 1, -0.08], width: 2.3, height: 1.05, intensity: 1.2, diffuseShare: 0.55 }
        },
        {
          id: 'dining-front-window-a',
          position: [-0.65, 1.56, 8.28],
          normal: [0, 0, 1],
          width: 1.6,
          height: 1.32,
          diffuseIntensity: 2.75,
          color: '#c5d1c8',
          goldenColor: '#edc17a',
          direct: {
            intensity: 228,
            diffuseShaftShare: 0.64,
            diffuseProjectorShare: 0.5,
            diffuseProjectorIntensity: 22,
            warmth: 0.52,
            sourceDistance: 1.9,
            distance: 12.5,
            angle: 0.5,
            penumbraClear: 0.24,
            penumbraOvercast: 0.64,
            decay: 1.16,
            diffuseCut: 0.24,
            castShadow: true,
            shadowMapSize: 2048,
            shadowRadiusClear: 0.34,
            shadowRadiusOvercast: 1.9,
            shaft: {
              panes: { count: 2, axis: [1, 0, 0], spacing: 0.75, width: 0.54, depth: 0.8, length: 7.2, opacity: 0.24, visibilityThreshold: 0.035 },
              dust: { count: 46, length: 7.2, speed: 0.065, opacity: 0.24, size: 0.085, noise: 0.22, color: '#f5d39a', visibilityThreshold: 0.1 }
            }
          },
          bounce: { position: [-0.45, 0.2, 5.35], direction: [0, 1, -0.12], width: 3.1, height: 1.15, intensity: 1.65, diffuseShare: 0.62 }
        },
        {
          id: 'dining-front-window-b',
          position: [2.0, 1.56, 8.28],
          normal: [0, 0, 1],
          width: 1.5,
          height: 1.32,
          diffuseIntensity: 2.2,
          color: '#c5d1c8',
          goldenColor: '#edc17a',
          direct: {
            intensity: 174,
            diffuseShaftShare: 0.52,
            diffuseProjectorShare: 0.44,
            diffuseProjectorIntensity: 15,
            warmth: 0.48,
            sourceDistance: 1.8,
            distance: 11.8,
            angle: 0.48,
            penumbraClear: 0.3,
            penumbraOvercast: 0.68,
            decay: 1.2,
            diffuseCut: 0.2,
            castShadow: false,
            shaft: {
              panes: { count: 2, axis: [1, 0, 0], spacing: 0.7, width: 0.5, depth: 0.78, length: 6.5, opacity: 0.21, visibilityThreshold: 0.04 },
              dust: { count: 32, length: 6.5, speed: 0.06, opacity: 0.18, size: 0.08, noise: 0.2, color: '#efd09a', visibilityThreshold: 0.12 }
            }
          },
          bounce: { position: [1.85, 0.2, 5.3], direction: [0, 1, -0.1], width: 2.5, height: 1.1, intensity: 1.3, diffuseShare: 0.56 }
        },
        {
          id: 'office-front-window',
          position: [6.7, 1.56, 8.28],
          normal: [0, 0, 1],
          width: 1.5,
          height: 1.32,
          diffuseIntensity: 2.15,
          color: '#c5d1c8',
          goldenColor: '#edc17a',
          direct: {
            intensity: 158,
            diffuseShaftShare: 0.52,
            diffuseProjectorShare: 0.42,
            diffuseProjectorIntensity: 14,
            warmth: 0.5,
            sourceDistance: 1.8,
            distance: 9.2,
            angle: 0.5,
            penumbraClear: 0.3,
            penumbraOvercast: 0.68,
            decay: 1.2,
            diffuseCut: 0.2,
            castShadow: false,
          },
          bounce: { position: [6.35, 0.22, 6.35], direction: [0, 1, -0.1], width: 2.4, height: 1.05, intensity: 1.3, diffuseShare: 0.56 },
        },
        {
          id: 'garden-window-a',
          position: [-10.28, 1.56, 3.0],
          normal: [-1, 0, 0],
          width: 1.5,
          height: 1.32,
          diffuseIntensity: 2.4,
          color: '#bbcbbf',
          goldenColor: '#efb66c',
          direct: {
            intensity: 198,
            diffuseShaftShare: 0.58,
            diffuseProjectorShare: 0.48,
            diffuseProjectorIntensity: 19,
            warmth: 0.56,
            sourceDistance: 1.5,
            distance: 10.5,
            angle: 0.62,
            penumbraClear: 0.48,
            penumbraOvercast: 0.78,
            decay: 1.28,
            diffuseCut: 0.12,
            castShadow: true,
            shadowMapSize: 2048,
            shadowRadiusClear: 0.68,
            shadowRadiusOvercast: 2.5,
            shaft: {
              panes: { count: 2, axis: [0, 0, 1], spacing: 0.7, width: 0.5, depth: 0.78, length: 5.4, opacity: 0.22, visibilityThreshold: 0.04 },
              dust: { count: 32, length: 5.4, speed: 0.06, opacity: 0.16, size: 0.085, noise: 0.2, color: '#e4c99a', visibilityThreshold: 0.16 }
            }
          },
          bounce: { position: [-7.8, 0.24, 3.0], direction: [0, 1, 0], width: 3.2, height: 1.2, intensity: 1.65, diffuseShare: 0.62 }
        },
        {
          id: 'garden-window-b',
          position: [-10.28, 1.56, 6.2],
          normal: [-1, 0, 0],
          width: 1.5,
          height: 1.32,
          diffuseIntensity: 1.8,
          color: '#bbcbbf',
          goldenColor: '#efb66c',
          direct: {
            intensity: 98,
            diffuseProjectorShare: 0.42,
            diffuseProjectorIntensity: 12,
            warmth: 0.6,
            sourceDistance: 1.5,
            distance: 9.5,
            angle: 0.66,
            penumbraClear: 0.54,
            penumbraOvercast: 0.8,
            decay: 1.3,
            diffuseCut: 0.1,
            castShadow: false
          },
          bounce: { position: [-7.7, 0.24, 6.0], direction: [0, 1, -0.08], width: 2.8, height: 1.1, intensity: 1.2, diffuseShare: 0.52 }
        },
        {
          id: 'front-doorway',
          position: [-5.3, 1.21, 8.28],
          normal: [0, 0, 1],
          width: 1.4,
          height: 2.42,
          diffuseIntensity: 1.35,
          color: '#c3d0c7',
          goldenColor: '#edbd72'
        }
      ],
      lamps: [
        { id: 'dining-hanging-lamp', position: [-2.35, 2.81, 2.05], color: '#ff9c4d', dayIntensity: 0.005, nightIntensity: 7.2, distance: 5.6, decay: 2.05, castShadow: true, shadowMapSize: 512 },
        { id: 'calling-table-lamp', position: [-9.48, 1.09, 6.32], color: '#ffae61', dayIntensity: 0.005, nightIntensity: 4.4, distance: 3.8, decay: 2.05, castShadow: false },
        { id: 'office-table-lamp', position: [6.55, 1.1, 4.2], color: '#ffad61', dayIntensity: 0.004, nightIntensity: 4.9, distance: 4.3, decay: 2.05, castShadow: false },
      ],
      postprocessing: {
        multisampling: 0,
        aoFullResolution: true,
        aoRadius: 0.52,
        aoDistanceFalloff: 0.72,
        aoIntensity: 1.68,
        aoDenoiseRadius: 8,
        bloomNightIntensity: 0.48,
        bloomDayIntensity: 0.66,
        bloomOvercastDayIntensity: 0.52,
        bloomNightThreshold: 0.6,
        bloomDayThreshold: 0.54,
        bloomOvercastDayThreshold: 0.4,
        bloomSmoothing: 0.3,
        bloomRadius: 0.48
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
