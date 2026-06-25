// Placed prop instances per zone. Each entry references a type from
// propTypes.js; x/z are zone coordinates and the spawn height is resolved at
// mount from the movement terrain. Add new zones/props here.

import { PROP_TYPES } from './propTypes';

export const ZONE_PROPS = {
  POST_OFFICE_BAY: [
    {
      id: 'post-office-bay-large-barrel',
      type: 'postOfficeBayBarrel',
      x: 3.0,
      z: 2.5,
      rotation: [0.015, 0.32, -0.01],
      scale: 2.33,
      visualOffsetY: -0.86,
    },
    {
      id: 'post-office-rollable-barrel',
      type: 'barrel',
      x: 13.9,
      z: 8.75,
      rotation: [Math.PI / 2, 0.25, 0.08],
    },
    {
      id: 'shore-supply-crate',
      type: 'crate',
      x: 11.8,
      z: 8.1,
      rotation: [0, 0.62, 0],
    },
    {
      id: 'shore-supply-crate-b',
      type: 'crate',
      x: 15.4,
      z: 7.05,
      rotation: [0.02, -0.72, -0.01],
    },
    {
      id: 'shore-terracotta-pot',
      type: 'terracottaPot',
      x: -6.8,
      z: 12.6,
      rotation: [0.01, 0.38, -0.02],
    },
    {
      id: 'upper-slope-broken-crate',
      type: 'brokenWoodenCrate',
      x: 20.6,
      z: -6.4,
      rotation: [0.04, -0.45, -0.02],
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
