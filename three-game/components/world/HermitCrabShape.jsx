'use client';

import { useCallback, useRef } from 'react';
import { Group, Vector3 } from 'three';
import { ModelAsset } from '../assets/ModelAsset';

// Center of the shell's weighted mesh in the imported rig's hip space.
const SHELL_CENTER = new Vector3(-7, 11, 0);

export function HermitCrabShape({ animationSelector, instanceSeed, onSceneReady }) {
  const shellSeat = useRef(null);
  const bodyRef = useRef(null);
  const setScene = useCallback(scene => {
    const previous = bodyRef.current;
    if (previous) {
      const hips = previous.parent;
      for (const bone of [...previous.children]) hips.add(bone);
      previous.removeFromParent();
      bodyRef.current = null;
    }
    const shell = scene?.getObjectByName('BN_Shell');
    if (shell?.parent) {
      // The shell is a sibling of the limbs and body. Animate the common
      // pivot after the mixer so it can recede while the shell stays put.
      const hips = shell.parent;
      const body = new Group();
      for (const bone of [...hips.children]) {
        if (bone !== shell && bone.isBone) body.add(bone);
      }
      hips.add(body);
      bodyRef.current = body;
    }
    onSceneReady?.(scene);
  }, [onSceneReady]);

  const afterPose = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const amount = animationSelector()?.hermitTuck || 0;
    const tuck = amount * 0.94;
    body.position.copy(SHELL_CENTER).multiplyScalar(tuck);
    body.scale.setScalar(1 - tuck);
    if (shellSeat.current) shellSeat.current.position.y = -amount * 0.022;
  }, [animationSelector]);

  return (
    <group ref={shellSeat}>
      <ModelAsset
        id="hermitCrab"
        instanceSeed={instanceSeed}
        animationSelector={animationSelector}
        onSceneReady={setScene}
        afterPose={afterPose}
        timeScaled
        castShadow
        receiveShadow
        fallback={(
          <group>
            <mesh position={[-0.045, 0.095, 0]} scale={[1, 1.12, 0.92]} castShadow>
              <sphereGeometry args={[0.092, 12, 8]} />
              <meshStandardMaterial color="#a08762" roughness={0.85} />
            </mesh>
            <mesh position={[0.064, 0.048, 0]} scale={[1.1, 0.55, 1.35]} castShadow>
              <sphereGeometry args={[0.062, 10, 8]} />
              <meshStandardMaterial color="#a55233" roughness={0.8} />
            </mesh>
          </group>
        )}
      />
    </group>
  );
}
