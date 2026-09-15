import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  POINT_LIGHT_POOL_DEFAULT_BUDGET,
  registerPoolLight,
  unregisterPoolLight,
} from '../../world/pointLightPool';

// Mounts the zone's whole point-light budget once, before any content. See
// three-game/world/pointLightPool.js for why the count must never change.
export function PointLightPool({ budget = POINT_LIGHT_POOL_DEFAULT_BUDGET }) {
  const groupRef = useRef(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return undefined;
    const lights = [];
    for (let index = 0; index < budget; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 0, 2);
      light.name = `pooledPointLight${index}`;
      group.add(light);
      registerPoolLight(light);
      lights.push(light);
    }
    return () => {
      for (const light of lights) {
        unregisterPoolLight(light);
        group.remove(light);
        light.dispose();
      }
    };
  }, [budget]);

  return <group ref={groupRef} name="pointLightPool" />;
}

export default PointLightPool;
