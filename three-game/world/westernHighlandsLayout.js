import * as THREE from 'three';
import { westernHighlandsCanopyMask, westernHighlandsHeight, westernHighlandsTrailInfluence } from './regions/westernHighlands/terrain';
import { terrainSlopeAt } from './terrain';
import { seededRandom } from './scatter';

export const W_HIGH = 'W_HIGH';

const HERO_BOULDERS = [
  [-19, -29, 1.35, 0.55],
  [18, -23, 1.05, -0.35],
  [-28, -6, 1.5, 0.2],
  [23, 3, 1.2, -0.8],
  [-20, 18, 1.15, 0.9],
  [20, 25, 1.3, -0.15],
  [-11, 36, 1.05, 0.45],
].map(([x, z, scale, yaw], index) => ({
  id: `western-highlands-boulder-${index}`,
  x,
  z,
  y: westernHighlandsHeight(x, z),
  scale,
  yaw,
  tone: 0.45 + seededRandom(index, 19) * 0.4,
}));

let westernHighlandsRocks = null;

export function getWesternHighlandsRocks() {
  if (westernHighlandsRocks) return westernHighlandsRocks;
  const rocks = [...HERO_BOULDERS];
  let attempts = 0;
  while (rocks.length < 34 && attempts < 1800) {
    attempts += 1;
    const x = -43 + seededRandom(attempts, 3) * 86;
    const z = -39 + seededRandom(attempts, 9) * 82;
    const trail = westernHighlandsTrailInfluence(x, z, 1.0, 4.8);
    if (trail > 0.42) continue;
    const canopy = westernHighlandsCanopyMask(x, z);
    const grade = terrainSlopeAt(x, z, W_HIGH).grade;
    if (grade > 0.66) continue;
    if (canopy < 0.28 && seededRandom(attempts, 14) < 0.55) continue;
    const scale = 0.38 + seededRandom(attempts, 13) * 0.82;
    rocks.push({
      id: `western-highlands-rock-${rocks.length}`,
      x,
      z,
      y: westernHighlandsHeight(x, z),
      scale,
      yaw: seededRandom(attempts, 17) * Math.PI * 2,
      tone: seededRandom(attempts, 27),
    });
  }
  westernHighlandsRocks = rocks.map(rock => ({
    ...rock,
    radiusX: rock.scale * (0.85 + rock.tone * 0.45),
    radiusY: rock.scale * (0.34 + rock.tone * 0.18),
    radiusZ: rock.scale * (0.68 + (1 - rock.tone) * 0.38),
    sink: rock.scale * 0.18,
  }));
  return westernHighlandsRocks;
}

export function getWesternHighlandsRockObstacles() {
  return getWesternHighlandsRocks()
    .filter(rock => rock.scale > 0.82)
    .map(rock => {
      const height = Math.max(0.32, rock.radiusY * 1.8 - rock.sink);
      const radius = Math.max(0.48, Math.max(rock.radiusX, rock.radiusZ) * 0.78);
      const collider = {
        type: 'cylinder',
        radius,
        height,
        offset: [0, height * 0.5, 0],
      };
      return {
        id: `western-highlands-${rock.id}`,
        kind: 'rock',
        path: null,
        x: rock.x,
        z: rock.z,
        radius,
        height,
        colliderTop: height,
        colliderBottom: 0,
        scale: 1,
        yaw: rock.yaw,
        jumpable: false,
        climbable: false,
        edgeRisk: false,
        pushable: false,
        pushMass: 1,
        pushFriction: 0.9,
        traversal: height > 0.62 ? 'vault' : 'scramble',
        traversalLabel: 'scramble over mossy lava',
        definition: { collider },
        zoneId: W_HIGH,
        shapes: [collider],
      };
    });
}
