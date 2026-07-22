import {
  DEVILS_CROWN,
  devilsCrownLandingMask,
  devilsCrownRimMask,
  devilsCrownSwimChannelMask,
} from './regions/devilsCrown/terrain';
import { buildRockObstacles, rockVisualBounds } from './proceduralRocks';
import { makeZoneScatter } from './scatter';

const scatter = (layer, count, seed, opts) => makeZoneScatter(DEVILS_CROWN, layer, count, seed, opts);

let rockCache = null;

export function getDevilsCrownRocks() {
  if (rockCache) return rockCache;

  const rim = scatter('rim-rock', 30, 61, {
    minX: -36,
    maxX: 38,
    minZ: -34,
    maxZ: 12,
    scale: [0.32, 1.28],
    maxGrade: 3.4,
    accept: (biome, x, z, y) => (
      y > -0.34
      && devilsCrownRimMask(x, z) > 0.24
      && biome !== 'coral'
    ),
  });

  const landing = scatter('landing-rock', 8, 73, {
    minX: -16,
    maxX: 16,
    minZ: 32,
    maxZ: 43,
    scale: [0.22, 0.74],
    maxGrade: 1.4,
    accept: (biome, x, z, y) => y > -0.26 && devilsCrownLandingMask(x, z) > 0.28,
  });

  const awash = scatter('awash-rock', 14, 89, {
    minX: -42,
    maxX: 43,
    minZ: -28,
    maxZ: 28,
    scale: [0.16, 0.62],
    maxGrade: 2.0,
    accept: (biome, x, z, y) => (
      y > -1.38
      && y < -0.08
      && devilsCrownSwimChannelMask(x, z) < 0.45
      && (devilsCrownRimMask(x, z) > 0.04 || biome === 'shallow-basalt')
    ),
  });

  rockCache = [...rim, ...landing, ...awash].map(item => ({
    ...item,
    color: item.tone > 0.72 ? '#4c4438' : item.tone > 0.34 ? '#292b26' : '#151916',
    radiusX: item.scale * (1.0 + item.tone * 0.88),
    radiusY: item.scale * (0.38 + item.tone * 0.66),
    radiusZ: item.scale * (0.75 + item.tone * 0.62),
    sink: item.scale * (item.y < -0.42 ? 0.08 : 0.2),
  }));

  return rockCache;
}

export function getDevilsCrownRockObstacles() {
  return buildRockObstacles(getDevilsCrownRocks(), {
    zoneId: DEVILS_CROWN,
    idPrefix: 'devcrown',
    // Anything taller than the controller's auto-step belongs in collision;
    // smaller awash stones remain harmless surface detail.
    filter: rock => rockVisualBounds(rock).height > 0.32 && rock.y > -0.8,
    extra: rock => ({
      edgeRisk: devilsCrownRimMask(rock.x, rock.z) > 0.28,
      traversalLabel: 'scramble over crater basalt',
      climbLabel: 'crater basalt block',
    }),
  });
}
