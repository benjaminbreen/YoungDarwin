// Placed prop instances per zone. Each entry references a type from
// propTypes.js; x/z are zone coordinates and the spawn height is resolved at
// mount from the movement terrain. Add new zones/props here.

import { PROP_TYPES } from './propTypes';

export const ZONE_PROPS = {
  POST_OFFICE_BAY: [
    {
      id: 'post-office-rollable-barrel',
      type: 'barrel',
      x: 10.45,
      z: 6.15,
      rotation: [0, 0.1, 0],
    },
    {
      id: 'shore-supply-crate',
      type: 'crate',
      x: 9.55,
      z: 6.85,
      rotation: [0, 0.35, 0],
    },
    {
      id: 'shore-supply-crate-b',
      type: 'crate',
      x: 11.25,
      z: 6.95,
      rotation: [0, -0.5, 0],
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
};

export function getZoneProps(zoneId) {
  const instances = ZONE_PROPS[zoneId] || [];
  return instances.map(instance => ({ ...PROP_TYPES[instance.type], ...instance }));
}
