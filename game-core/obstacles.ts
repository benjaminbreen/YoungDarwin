import type { ObstacleDefinition, ZoneId } from './types';

const NATURE = '/assets/models/nature/';

const postOfficeBayObstacles = [
  {
    id: 'landing-push-boulder',
    kind: 'boulder',
    render: {
      path: `${NATURE}Rock_Medium_1.glb`,
      position: [0.8, 0, -4.8],
      rotation: [0, -0.85, 0],
      scale: 0.72,
    },
    collider: {
      type: 'ball',
      radius: 1.05,
      offset: [0, 0.74, 0],
    },
    gameplay: { traversal: 'scramble', traversalLabel: 'scramble over basalt', climbable: true },
  },
  {
    id: 'landing-boulder',
    kind: 'boulder',
    render: {
      path: `${NATURE}Rock_Medium_2.glb`,
      position: [-4.2, 0, -6.4],
      rotation: [0, 0.25, 0],
      scale: 1.8,
    },
    collider: {
      type: 'convex',
      points: [[-1.714, -0.764], [-1.382, -0.986], [-0.333, -1.159], [0.642, -1.137], [1.335, -0.712], [1.295, 0.481], [1.034, 0.952], [0.039, 1.32], [-0.526, 1.274], [-1.174, 0.831], [-1.489, 0.455], [-1.667, 0.022]],
      height: 1.899,
      yMin: -0.051,
      yMax: 1.848,
    },
    gameplay: { jumpable: true, climbable: true, edgeRisk: true, climbLabel: 'climb onto basalt boulder' },
  },
  {
    id: 'west-boulder',
    kind: 'boulder',
    render: {
      path: `${NATURE}Rock_Medium_1.glb`,
      position: [-15.4, 0, 6.8],
      rotation: [0, 1.2, 0],
      scale: 1.6,
    },
    collider: {
      type: 'convex',
      points: [[-1.727, -0.119], [-1.502, -0.644], [-1.027, -0.955], [-0.172, -1.15], [0.797, -0.883], [1.498, 0.076], [1.472, 0.366], [0.963, 1.354], [-0.246, 1.839], [-1.221, 1.294], [-1.496, 0.937], [-1.699, 0.183]],
      height: 2.26,
      yMin: -0.271,
      yMax: 1.989,
    },
    gameplay: { jumpable: true, climbable: true, edgeRisk: true, climbLabel: 'climb onto weathered boulder' },
  },
  {
    id: 'ridge-boulder',
    kind: 'boulder',
    render: {
      path: `${NATURE}Rock_Medium_2.glb`,
      position: [18.6, 0, 21.4],
      rotation: [0, 0.7, 0],
      scale: 1.95,
    },
    collider: {
      type: 'convex',
      points: [[-1.714, -0.764], [-1.382, -0.986], [-0.333, -1.159], [0.642, -1.137], [1.335, -0.712], [1.295, 0.481], [1.034, 0.952], [0.039, 1.32], [-0.526, 1.274], [-1.174, 0.831], [-1.489, 0.455], [-1.667, 0.022]],
      height: 1.899,
      yMin: -0.051,
      yMax: 1.848,
    },
    gameplay: { jumpable: true, climbable: true, edgeRisk: true, climbLabel: 'climb onto ridge boulder' },
  },
  {
    id: 'galapagos-bitterbush-landing',
    kind: 'tree',
    render: {
      path: `${NATURE}runtime-palo-santo.glb`,
      position: [-10.8, 0, 1.2],
      rotation: [0, -0.35, 0],
      // Legacy filename: this asset is the Castela bitterbush proxy. Its raw
      // mesh is nearly eight metres tall, so shrub-scale use must stay small.
      scale: 0.26,
    },
    collider: { type: 'cylinder', radius: 2.55, height: 7.5 },
    gameplay: { jumpable: false, climbable: false },
  },
  {
    id: 'galapagos-bitterbush-ridge',
    kind: 'tree',
    render: {
      path: `${NATURE}runtime-palo-santo.glb`,
      position: [5.5, 0, 25.5],
      rotation: [0, 0.62, 0],
      scale: 0.24,
    },
    collider: { type: 'cylinder', radius: 2.55, height: 7.5 },
    gameplay: { jumpable: false, climbable: false },
  },
  {
    id: 'twisted-tree-scrub',
    kind: 'tree',
    render: {
      path: `${NATURE}runtime-manzanillo.glb`,
      position: [19.8, 0, 11.8],
      rotation: [0, -1.05, 0],
      scale: 1.1,
    },
    collider: { type: 'cylinder', radius: 0.7, height: 3.0 },
    gameplay: { jumpable: false, climbable: false },
  },
] satisfies ObstacleDefinition[];

export const zoneObstacles: Partial<Record<ZoneId, ObstacleDefinition[]>> = {
  POST_OFFICE_BAY: postOfficeBayObstacles,
};

export function getZoneObstacles(zoneId: ZoneId = 'POST_OFFICE_BAY'): ObstacleDefinition[] {
  return zoneObstacles[zoneId] || [];
}
