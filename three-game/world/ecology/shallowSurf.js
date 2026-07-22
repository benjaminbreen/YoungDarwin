import { getModelAsset } from '../../modelAssets';
import { getCliffSurfProfile } from '../cliffSurfProfiles';
import { getShallowSurfRocks } from '../southeasternCoastLayout';
import {
  SHALLOW_SURF,
  shallowSurfRockMask,
} from '../regions/shallowSurf/terrain';
import { coastalBirds } from './flyingBirds';

const NATURE = '/assets/models/nature/';
const ANIMALS = '/assets/models/animals/runtime/';

function buildAlgaeMats(rocks) {
  return [{
    id: 'shallow-surf-rock-algae',
    label: 'Encrusting algae on basalt',
    path: `${NATURE}runtime-sesuvium.glb`,
    sink: 0.02,
    castShadow: false,
    ySquash: 0.08,
    tint: '#375b36',
    tintStrength: 0.62,
    items: rocks
      .filter(rock => rock.y < -0.95 && rock.radiusX > 0.54)
      .slice(0, 22)
      .map((rock, index) => ({
        id: `shallow-surf-algae-${index}`,
        x: rock.x,
        y: rock.y + Math.max(0.08, rock.radiusY * 0.7),
        z: rock.z,
        yaw: rock.yaw + index * 0.37,
        scale: Math.max(0.46, rock.radiusX * 0.52),
        widthScale: 1.35,
        depthScale: 0.9,
        heightScale: 0.58,
      })),
  }];
}

function buildBarnacles(rocks) {
  return rocks
    .filter(rock => rock.y + rock.radiusY > -1.1 && rock.radiusX > 0.65)
    .slice(0, 14)
    .map((rock, index) => ({
      id: `shallow-surf-barnacles-${index}`,
      path: `${NATURE}runtime-barnacle-cluster.glb`,
      position: [rock.x, rock.y + rock.radiusY * 0.72, rock.z],
      rotation: [0, rock.yaw + index * 0.41, 0],
      scale: 0.08 + Math.min(0.08, rock.radiusX * 0.035),
      maxVisibleDistance: 42,
      loadTier: 2,
    }));
}

function buildSwimmers() {
  const lowPolyFish = getModelAsset('animatedLowPolyFish')?.path || `${ANIMALS}animated-low-poly-fish.glb`;
  const fishForward = [0, 0.9, 0];
  return {
    schools: [
      {
        id: 'shallow-surf-inner-school', path: `${ANIMALS}reef-fish.glb`, count: 8,
        center: [-6, -12], radius: 3.2, pathRadiusX: 15, pathRadiusZ: 5,
        y: [-2.05, -1.62], speed: 0.26, scale: [0.14, 0.21], motion: 'shoal',
        baseRotation: fishForward, bank: 0.03, maxPitch: 0.06, verticalWander: 0.03,
        startleRadius: 5, startlePush: 1.7, startleSpeedBoost: 0.5, startleBank: 0.08,
      },
      {
        id: 'shallow-surf-outer-school', path: lowPolyFish, count: 6,
        center: [22, 14], radius: 2.8, pathRadiusX: 12, pathRadiusZ: 4,
        y: [-2.65, -2.08], speed: 0.31, scale: [0.2, 0.29], motion: 'shoal',
        baseRotation: fishForward, stripRootMotionNodes: ['Armature_7'], bank: 0.035,
        maxPitch: 0.065, verticalWander: 0.035, startleRadius: 5.5,
        startlePush: 1.9, startleSpeedBoost: 0.56, startleBank: 0.09,
      },
    ],
    cruisers: [],
  };
}

export function buildShallowSurfEcology() {
  const rocks = getShallowSurfRocks();
  const impactRocks = rocks.filter(rock => rock.y + rock.radiusY > -1.25 && shallowSurfRockMask(rock.x, rock.z) > 0.28);
  return {
    zoneId: SHALLOW_SURF,
    rocks,
    flora: buildAlgaeMats(rocks),
    props: buildBarnacles(rocks),
    splashes: { anchors: impactRocks.slice(0, 18), period: (Math.PI * 2) / 0.5984 },
    cliffSurf: getCliffSurfProfile(SHALLOW_SURF),
    swimmers: buildSwimmers(),
    birds: coastalBirds([
      { species: 'gull', path: 'lazyFigureEight', radiusX: 30, radiusZ: 18, height: 20, speed: -0.07, phase: 1.2, cx: -12, cz: -4, flapRate: 0.82 },
      { species: 'booby', radiusX: 38, radiusZ: 22, height: 28, speed: 0.052, phase: 3.1, cx: 6, cz: 5, flapRate: 0.64 },
    ]),
  };
}
