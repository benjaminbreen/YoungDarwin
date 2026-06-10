// Placed prop instances per zone. Each entry references a type from
// propTypes.js; x/z are zone coordinates and the spawn height is resolved at
// mount from the movement terrain. Add new zones/props here.

import { PROP_TYPES } from './propTypes';

export const ZONE_PROPS = {
  POST_OFFICE_BAY: [
    {
      id: 'post-office-rollable-barrel',
      type: 'barrel',
      x: -2.6,
      z: -2.8,
      rotation: [0, 0.6, Math.PI / 2],
    },
    {
      id: 'shore-supply-crate',
      type: 'crate',
      x: -5.6,
      z: -1.9,
      rotation: [0, 0.35, 0],
    },
    {
      id: 'loose-basalt-stone',
      type: 'stone',
      x: 0.9,
      z: -6.4,
      rotation: [0.2, -0.5, 0.12],
    },
  ],
};

export function getZoneProps(zoneId) {
  const instances = ZONE_PROPS[zoneId] || [];
  return instances.map(instance => ({ ...PROP_TYPES[instance.type], ...instance }));
}
